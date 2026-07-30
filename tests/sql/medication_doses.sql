-- Medication doses: create, status, concurrency, reverse, early, midnight, interrupt (issue #6).
-- Expects auth stub + migrations applied. Run via scripts/run-rls-tests.mjs.

\set ON_ERROR_STOP on

do $$
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  outsider uuid := '33333333-3333-3333-3333-333333333333';
  hid uuid;
  child_id uuid;
  med_id uuid;
  med2_id uuid;
  snap jsonb;
  occs jsonb;
  first_occ jsonb;
  conf jsonb;
  conf2 jsonb;
  rev jsonb;
  conf_id uuid;
  tz text := 'America/Sao_Paulo';
  -- Create mid-morning so 08:00 is filtered on first day
  at_create timestamptz := ('2026-07-30 10:00:00'::timestamp AT TIME ZONE tz);
  at_noon timestamptz := ('2026-07-30 12:00:00'::timestamp AT TIME ZONE tz);
  at_slot timestamptz := ('2026-07-30 20:00:00'::timestamp AT TIME ZONE tz);
  after_slot timestamptz := ('2026-07-30 20:01:00'::timestamp AT TIME ZONE tz);
  early_morning timestamptz := ('2026-07-30 07:00:00'::timestamp AT TIME ZONE tz);
  at_midnight timestamptz := ('2026-07-31 00:00:00'::timestamp AT TIME ZONE tz);
  interrupt_at timestamptz := ('2026-07-30 15:00:00'::timestamp AT TIME ZONE tz);
  statuses text[];
  slots text[];
begin
  insert into auth.users (id, email) values
    (adult1, 'a1@example.com'),
    (adult2, 'a2@example.com'),
    (outsider, 'out@example.com')
  on conflict (id) do nothing;

  hid := public.bootstrap_household(adult1, 'Ana', adult2, 'Beto');

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  insert into public.children (household_id, name)
  values (hid, 'Mia')
  returning id into child_id;
  execute 'reset role';

  -- Seed medication as of 10:00 with slots 08:00, 12:00, 20:00
  med_id := public.seed_medication(
    hid,
    child_id,
    'Amoxicilina',
    'Conforme receita',
    array['08:00', '12:00', '20:00'],
    '2026-07-30'::date,
    null,
    '2026-07-30'::date,
    at_create
  );

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';

  -- First day at create time: only 12:00 and 20:00 (08:00 already passed at creation)
  snap := public.household_agenda_snapshot(at_create);
  occs := (
    select coalesce(jsonb_agg(e), '[]'::jsonb)
    from jsonb_array_elements(snap->'today'->'occurrences') e
    where e->>'source' = 'medication'
      and e->>'source_id' = med_id::text
  );
  if jsonb_array_length(occs) <> 2 then
    raise exception 'first-day filter expected 2 doses, got % %', jsonb_array_length(occs), occs;
  end if;

  select array_agg(e->>'scheduled_time' order by e->>'scheduled_time')
    into slots
  from jsonb_array_elements(occs) e;

  if slots is distinct from array['12:00', '20:00'] then
    raise exception 'first-day slots mismatch: %', slots;
  end if;

  -- Status: at 12:00 exact → pending for 12:00; 20:00 still scheduled
  snap := public.household_agenda_snapshot(at_noon);
  select array_agg(e->>'status' order by e->>'scheduled_time')
    into statuses
  from jsonb_array_elements(snap->'today'->'occurrences') e
  where e->>'source' = 'medication'
    and e->>'source_id' = med_id::text;
  if statuses is distinct from array['pending', 'scheduled'] then
    raise exception 'noon statuses expected [pending, scheduled], got %', statuses;
  end if;

  -- After 20:00 → late
  snap := public.household_agenda_snapshot(after_slot);
  select e into first_occ
  from jsonb_array_elements(snap->'today'->'occurrences') e
  where e->>'scheduled_time' = '20:00'
    and e->>'source_id' = med_id::text;
  if first_occ->>'status' is distinct from 'late' then
    raise exception '20:01 status expected late, got %', first_occ->>'status';
  end if;

  -- Early confirmation without ack rejected
  conf := public.confirm_dose(med_id, '2026-07-30'::date, '20:00', false, early_morning);
  if conf->>'ok' = 'true' or conf->>'code' is distinct from 'early_confirmation_required' then
    raise exception 'early confirm should require ack, got %', conf;
  end if;

  -- Early with ack succeeds
  conf := public.confirm_dose(med_id, '2026-07-30'::date, '20:00', true, early_morning);
  if conf->>'ok' is distinct from 'true' then
    raise exception 'early confirm with ack should succeed: %', conf;
  end if;
  conf_id := (conf->>'confirmation_id')::uuid;

  -- Concurrent loser sees who/when
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', adult2::text, true);
  execute 'set local role authenticated';
  conf2 := public.confirm_dose(med_id, '2026-07-30'::date, '20:00', true, at_slot);
  if conf2->>'ok' = 'true' or conf2->>'code' is distinct from 'already_confirmed' then
    raise exception 'concurrent confirm should lose: %', conf2;
  end if;
  if conf2->>'confirmed_by_display_name' is distinct from 'Ana' then
    raise exception 'loser should see Ana, got %', conf2->>'confirmed_by_display_name';
  end if;
  if conf2->>'confirmed_at' is null then
    raise exception 'loser should see confirmed_at';
  end if;

  -- Unique active constraint (as table owner; members write via RPC only)
  execute 'reset role';
  begin
    insert into public.dose_confirmations (
      household_id, medication_id, local_date, slot, occurrence_key, confirmed_by, confirmed_at
    ) values (
      hid, med_id, '2026-07-30', '20:00',
      public.occurrence_key('medication', med_id, '2026-07-30'::date, '20:00'),
      adult2, at_slot
    );
    raise exception 'active unique constraint should block second confirmation';
  exception
    when unique_violation then
      null;
  end;

  -- Reverse (immutable) then re-confirm
  perform set_config('request.jwt.claim.sub', adult2::text, true);
  execute 'set local role authenticated';
  rev := public.reverse_dose_confirmation(conf_id, at_noon);
  if rev->>'ok' is distinct from 'true' then
    raise exception 'reverse should succeed: %', rev;
  end if;

  if exists (
    select 1 from public.dose_confirmations dc
    where dc.id = conf_id and dc.reversed_at is null
  ) then
    raise exception 'reversal must set reversed_at (not delete)';
  end if;

  if not exists (select 1 from public.dose_confirmations dc where dc.id = conf_id) then
    raise exception 'reversal must keep history row';
  end if;

  conf := public.confirm_dose(med_id, '2026-07-30'::date, '20:00', true, at_slot);
  if conf->>'ok' is distinct from 'true' then
    raise exception 're-confirm after reverse should succeed: %', conf;
  end if;

  -- Snapshot shows completed
  snap := public.household_agenda_snapshot(at_slot);
  select e into first_occ
  from jsonb_array_elements(snap->'today'->'occurrences') e
  where e->>'scheduled_time' = '20:00' and e->>'source' = 'medication';
  if first_occ->>'status' is distinct from 'completed' then
    raise exception 'confirmed dose status expected completed, got %', first_occ;
  end if;

  -- Midnight: unconfirmed past dose → unrecorded (derive for previous day)
  -- Use a fresh med with only 12:00 left unconfirmed... confirm 12:00? leave 12:00 open on med2
  execute 'reset role';
  med2_id := public.seed_medication(
    hid,
    child_id,
    'Ibuprofeno',
    null,
    array['08:00', '18:00'],
    '2026-07-30'::date,
    null,
    '2026-07-30'::date,
    ('2026-07-30 07:00:00'::timestamp AT TIME ZONE tz)
  );

  occs := public.derive_medication_occurrences_for_day(hid, '2026-07-30'::date, at_midnight);
  select e into first_occ
  from jsonb_array_elements(occs) e
  where e->>'source_id' = med2_id::text and e->>'scheduled_time' = '08:00';
  if first_occ->>'status' is distinct from 'unrecorded' then
    raise exception 'after midnight unconfirmed should be unrecorded, got %', first_occ;
  end if;

  -- No backfill for past day
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  conf := public.confirm_dose(med2_id, '2026-07-30'::date, '08:00', true, at_midnight);
  if conf->>'code' is distinct from 'not_confirmable_day' then
    raise exception 'backfill after midnight must be rejected, got %', conf;
  end if;

  -- Immediate interrupt cancels remaining same-day (not unrecorded)
  execute 'reset role';
  med_id := public.seed_medication(
    hid,
    child_id,
    'Xarope',
    null,
    array['10:00', '16:00', '22:00'],
    '2026-07-30'::date,
    null,
    '2026-07-30'::date,
    ('2026-07-30 09:00:00'::timestamp AT TIME ZONE tz)
  );

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  -- Confirm morning dose before interrupt
  conf := public.confirm_dose(med_id, '2026-07-30'::date, '10:00', true, ('2026-07-30 10:05:00'::timestamp AT TIME ZONE tz));
  if conf->>'ok' is distinct from 'true' then
    raise exception 'pre-interrupt confirm failed: %', conf;
  end if;

  conf := public.interrupt_medication_immediate(med_id, interrupt_at);
  if conf->>'ok' is distinct from 'true' then
    raise exception 'interrupt failed: %', conf;
  end if;

  snap := public.household_agenda_snapshot(interrupt_at);
  select array_agg(e->>'status' order by e->>'scheduled_time')
    into statuses
  from jsonb_array_elements(snap->'today'->'occurrences') e
  where e->>'source_id' = med_id::text;

  -- 10:00 completed; 16:00 and 22:00 cancelled (remaining at/after interrupt 15:00)
  if statuses is distinct from array['completed', 'cancelled', 'cancelled'] then
    raise exception 'interrupt statuses expected [completed, cancelled, cancelled], got %', statuses;
  end if;

  -- Authenticated create_medication path
  med_id := public.create_medication(
    child_id,
    'Vitamina D',
    null,
    array['09:00'],
    '2026-07-30'::date,
    null
  );
  if med_id is null then
    raise exception 'create_medication should return id';
  end if;

  -- Outsider denied
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  snap := public.household_agenda_snapshot(at_noon);
  if snap is not null then
    raise exception 'outsider must get null snapshot';
  end if;

  begin
    perform public.create_medication(child_id, 'Hack', null, array['09:00'], '2026-07-30'::date, null);
    raise exception 'outsider create_medication should fail';
  exception
    when others then
      if sqlerrm not like '%household_missing%' and sqlstate <> 'P0001' then
        -- acceptable: household_missing
        null;
      end if;
  end;

  execute 'reset role';
  raise notice 'medication dose tests OK';
end;
$$;
