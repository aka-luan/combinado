-- Push outbox: dose reminders + 22:00 Amanhã summary (issue #11 / PRD §10).
-- Expects auth stub + migrations applied. Run via scripts/run-rls-tests.mjs.

\set ON_ERROR_STOP on

do $$
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  hid uuid;
  child_id uuid;
  med_id uuid;
  sub1a uuid;
  sub1b uuid;
  sub2 uuid;
  tz text := 'America/Sao_Paulo';
  at_create timestamptz := ('2026-07-30 10:00:00'::timestamp AT TIME ZONE tz);
  at_slot timestamptz := ('2026-07-30 20:00:00'::timestamp AT TIME ZONE tz);
  at_after_ttl timestamptz := ('2026-07-30 20:31:00'::timestamp AT TIME ZONE tz);
  at_22 timestamptz := ('2026-07-30 22:00:00'::timestamp AT TIME ZONE tz);
  at_22_again timestamptz := ('2026-07-30 22:15:00'::timestamp AT TIME ZONE tz);
  interrupt_at timestamptz := ('2026-07-30 15:00:00'::timestamp AT TIME ZONE tz);
  enq jsonb;
  claimed jsonb;
  claimed2 jsonb;
  complete jsonb;
  n integer;
  statuses text[];
  exp_status text;
  payload jsonb;
  occ_key text;
  log_count integer;
  old_log_id uuid;
begin
  perform set_config('combinado.allow_clock_override', 'on', true);

  insert into auth.users (id, email) values
    (adult1, 'a1@example.com'),
    (adult2, 'a2@example.com')
  on conflict (id) do nothing;

  hid := public.bootstrap_household(adult1, 'Ana', adult2, 'Beto');

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  insert into public.children (household_id, name)
  values (hid, 'Mia')
  returning id into child_id;
  execute 'reset role';

  -- Two installations for adult1, one for adult2
  insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth)
  values
    (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      adult1,
      'https://push.example/1a',
      'p256dh-1a',
      'auth-1a'
    ),
    (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      adult1,
      'https://push.example/1b',
      'p256dh-1b',
      'auth-1b'
    ),
    (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      adult2,
      'https://push.example/2',
      'p256dh-2',
      'auth-2'
    );

  sub1a := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  sub1b := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
  sub2 := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';

  med_id := public.seed_medication(
    hid,
    child_id,
    'Amoxicilina',
    'Com água',
    array['12:00', '20:00'],
    '2026-07-30'::date,
    null,
    '2026-07-30'::date,
    at_create
  );

  occ_key := public.occurrence_key('medication', med_id, '2026-07-30'::date, '20:00');

  -- Before programmed time: nothing enqueued
  enq := public.enqueue_due_push_deliveries(at_create);
  if (enq->>'dose_inserted')::int <> 0 then
    raise exception 'expected no dose enqueue before slot, got %', enq;
  end if;

  -- At programmed time: one delivery per adult installation (3)
  enq := public.enqueue_due_push_deliveries(at_slot);
  if (enq->>'dose_inserted')::int <> 3 then
    raise exception 'expected 3 dose deliveries (2+1 installs), got %', enq;
  end if;

  -- Duplicate cron enqueue is idempotent
  enq := public.enqueue_due_push_deliveries(at_slot);
  if (enq->>'dose_inserted')::int <> 0 then
    raise exception 'duplicate enqueue should insert 0, got %', enq;
  end if;

  select count(*) into n from public.push_outbox where delivery_type = 'dose_reminder';
  if n <> 3 then
    raise exception 'expected 3 outbox rows, got %', n;
  end if;

  select o.payload into payload
  from public.push_outbox o
  where o.occurrence_ref = occ_key
  limit 1;
  if payload->>'title' is distinct from 'Hora de verificar' then
    raise exception 'dose title mismatch: %', payload;
  end if;
  if payload->>'body' is distinct from 'Mia, Amoxicilina, 20:00, Com água' then
    raise exception 'dose body mismatch: %', payload;
  end if;
  if position('pendente' in lower(payload->>'body')) > 0 then
    raise exception 'dose body must not claim pending state: %', payload;
  end if;

  -- Overlapping claim: first worker takes all; second gets none
  claimed := public.claim_push_outbox_batch(50, 'worker-a', at_slot);
  if jsonb_array_length(claimed) <> 3 then
    raise exception 'worker-a expected 3 claims, got %', claimed;
  end if;
  claimed2 := public.claim_push_outbox_batch(50, 'worker-b', at_slot);
  if jsonb_array_length(claimed2) <> 0 then
    raise exception 'worker-b should claim 0 while locked, got %', claimed2;
  end if;

  -- Complete one as sent
  complete := public.complete_push_outbox_attempt(
    (claimed->0->>'id')::uuid, 'sent', 201, null, at_slot
  );
  if complete->>'status' is distinct from 'sent' then
    raise exception 'sent complete failed: %', complete;
  end if;

  -- Temp fail then retry within window
  complete := public.complete_push_outbox_attempt(
    (claimed->1->>'id')::uuid, 'temp_fail', 500, 'upstream', at_slot
  );
  if complete->>'status' is distinct from 'pending' then
    raise exception 'temp fail should re-queue, got %', complete;
  end if;

  -- 404/410 removes endpoint
  complete := public.complete_push_outbox_attempt(
    (claimed->2->>'id')::uuid, 'gone', 410, null, at_slot
  );
  if complete->>'result' is distinct from 'gone' then
    raise exception 'gone complete failed: %', complete;
  end if;
  if exists (
    select 1 from public.push_subscriptions where id = (claimed->2->>'subscription_id')::uuid
  ) then
    raise exception '410 should delete subscription';
  end if;

  select count(*) into log_count from public.push_delivery_logs;
  if log_count < 3 then
    raise exception 'expected delivery logs, got %', log_count;
  end if;
  if exists (
    select 1 from public.push_delivery_logs
    where occurrence_ref is null
       or delivery_type is null
  ) then
    raise exception 'logs must keep type + occurrence_ref metadata';
  end if;
  if exists (
    select 1 from public.push_delivery_logs l
    where l::text ilike '%Amoxicilina%'
       or l::text ilike '%Com água%'
       or l::text ilike '%Mia%'
  ) then
    raise exception 'logs must not contain child/medicine/instruction';
  end if;

  -- ------------------------------------------------------------------
  -- Send/mark race: confirm before claim → skipped
  -- ------------------------------------------------------------------
  delete from public.push_outbox;
  delete from public.push_delivery_logs;
  insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth)
  values (sub2, adult2, 'https://push.example/2-re', 'p256dh-2', 'auth-2')
  on conflict (id) do update set endpoint = excluded.endpoint;

  -- Ensure adult1 still has an install
  insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth)
  values (sub1a, adult1, 'https://push.example/1a-re', 'p256dh-1a', 'auth-1a')
  on conflict (id) do update set endpoint = excluded.endpoint;

  enq := public.enqueue_due_push_deliveries(at_slot);
  if (enq->>'dose_inserted')::int < 1 then
    raise exception 'race setup enqueue failed: %', enq;
  end if;

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  perform public.confirm_dose(med_id, '2026-07-30'::date, '20:00', true, at_slot);
  execute 'reset role';

  claimed := public.claim_push_outbox_batch(50, 'worker-race', at_slot);
  if jsonb_array_length(claimed) <> 0 then
    raise exception 'confirmed dose must not be claimed for send, got %', claimed;
  end if;
  select count(*) into n from public.push_outbox where status = 'skipped';
  if n < 1 then
    raise exception 'expected skipped outbox after confirm race';
  end if;

  -- ------------------------------------------------------------------
  -- Expiry: past TTL → expired, not sent
  -- ------------------------------------------------------------------
  delete from public.push_outbox;
  delete from public.dose_confirmations where medication_id = med_id;

  -- Manually insert an already-due row that will expire
  insert into public.push_outbox (
    household_id, delivery_type, occurrence_ref, user_id, subscription_id,
    payload, scheduled_for, expires_at, status, next_attempt_at
  ) values (
    hid, 'dose_reminder', occ_key, adult1, sub1a,
    jsonb_build_object('title', 'Hora de verificar', 'body', 'x', 'url', '/'),
    at_slot, at_slot + interval '30 minutes', 'pending', at_slot
  );

  enq := public.enqueue_due_push_deliveries(at_after_ttl);
  select o.status into exp_status from public.push_outbox o where o.occurrence_ref = occ_key;
  if exp_status is distinct from 'expired' then
    raise exception 'expected expired after TTL, got %', exp_status;
  end if;
  claimed := public.claim_push_outbox_batch(50, 'worker-exp', at_after_ttl);
  if jsonb_array_length(claimed) <> 0 then
    raise exception 'expired deliveries must not be claimed';
  end if;

  -- ------------------------------------------------------------------
  -- Interrupt cancels unsent remaining doses
  -- ------------------------------------------------------------------
  delete from public.push_outbox;
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

  -- Enqueue 16:00 as pending (simulate due)
  insert into public.push_outbox (
    household_id, delivery_type, occurrence_ref, user_id, subscription_id,
    payload, scheduled_for, expires_at, status, next_attempt_at
  )
  select
    hid,
    'dose_reminder',
    public.occurrence_key('medication', med_id, '2026-07-30'::date, slot),
    adult1,
    sub1a,
    jsonb_build_object('title', 'Hora de verificar', 'body', 'x', 'url', '/'),
    public.household_slot_timestamptz('2026-07-30'::date, slot),
    public.household_slot_timestamptz('2026-07-30'::date, slot) + interval '30 minutes',
    'pending',
    public.household_slot_timestamptz('2026-07-30'::date, slot)
  from unnest(array['16:00', '22:00']) as slot;

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  perform public.interrupt_medication_immediate(med_id, interrupt_at);
  execute 'reset role';

  select count(*) into n
  from public.push_outbox
  where status = 'cancelled' and delivery_type = 'dose_reminder';
  if n <> 2 then
    raise exception 'interrupt should cancel 2 unsent dose pushes, got %', n;
  end if;

  -- ------------------------------------------------------------------
  -- Tomorrow summary at 22:00 only when occurrences exist; no second send
  -- ------------------------------------------------------------------
  delete from public.push_outbox;
  -- Seed a routine so tomorrow has items
  perform public.seed_weekly_routine(
    hid,
    'Escola',
    'child',
    child_id,
    array[0,1,2,3,4,5,6]::smallint[],
    '08:00',
    true,
    adult1,
    '2026-07-30'::date,
    null,
    '2026-07-30'::date
  );

  enq := public.enqueue_due_push_deliveries(at_22);
  if (enq->>'summary_inserted')::int < 1 then
    raise exception 'expected tomorrow summary enqueue at 22:00, got %', enq;
  end if;

  select o.payload into payload
  from public.push_outbox o
  where o.delivery_type = 'tomorrow_summary'
  limit 1;
  if payload->>'url' is distinct from '/?amanha=1' then
    raise exception 'summary url mismatch: %', payload;
  end if;
  if payload->>'body' not like 'Amanhã:%' then
    raise exception 'summary body mismatch: %', payload;
  end if;
  if position('Escola' in coalesce(payload->>'body', '')) > 0 then
    raise exception 'summary must not include names: %', payload;
  end if;

  n := (select count(*) from public.push_outbox where delivery_type = 'tomorrow_summary');
  enq := public.enqueue_due_push_deliveries(at_22_again);
  if (enq->>'summary_inserted')::int <> 0 then
    raise exception 'second nightly summary must not insert, got %', enq;
  end if;
  if (select count(*) from public.push_outbox where delivery_type = 'tomorrow_summary') <> n then
    raise exception 'summary row count must stay stable after re-enqueue';
  end if;

  -- Empty tomorrow → no summary. Clamp/move all agenda coverage so 2026-07-31 is empty
  -- without violating valid_from <= valid_until (prior suites leave future versions).
  delete from public.push_outbox where delivery_type = 'tomorrow_summary';
  update public.weekly_routine_versions
  set valid_until = greatest(valid_from, '2026-07-30'::date)
  where household_id = hid
    and valid_from <= '2026-07-30'::date
    and (valid_until is null or valid_until >= '2026-07-31'::date);
  update public.weekly_routine_versions
  set
    valid_from = '2026-08-10'::date,
    effective_from = '2026-08-10'::date,
    valid_until = '2026-08-10'::date
  where household_id = hid
    and valid_from >= '2026-07-31'::date;
  update public.medication_versions
  set valid_until = greatest(valid_from, '2026-07-30'::date)
  where household_id = hid
    and valid_from <= '2026-07-30'::date
    and (valid_until is null or valid_until >= '2026-07-31'::date);
  update public.medication_versions
  set
    valid_from = '2026-08-10'::date,
    effective_from = '2026-08-10'::date,
    valid_until = '2026-08-10'::date
  where household_id = hid
    and valid_from >= '2026-07-31'::date;
  update public.one_off_events
  set local_date = '2026-08-10'::date
  where household_id = hid
    and local_date = '2026-07-31'::date;

  enq := public.enqueue_due_push_deliveries(at_22);
  if (enq->>'summary_inserted')::int <> 0 then
    raise exception 'empty tomorrow must not enqueue summary, got %', enq;
  end if;

  -- ------------------------------------------------------------------
  -- Log retention cleanup (30 days)
  -- ------------------------------------------------------------------
  insert into public.push_delivery_logs (
    id, household_id, delivery_type, occurrence_ref, user_id,
    subscription_id, attempt, outcome, created_at
  ) values (
    gen_random_uuid(), hid, 'dose_reminder', 'medication:x:2026-01-01:10:00',
    adult1, sub1a, 1, 'sent', at_22 - interval '31 days'
  ) returning id into old_log_id;

  n := public.cleanup_push_delivery_logs(at_22);
  if n < 1 then
    raise exception 'cleanup should delete logs older than 30 days';
  end if;
  if exists (select 1 from public.push_delivery_logs where id = old_log_id) then
    raise exception 'old log should be gone';
  end if;

  raise notice 'push_outbox tests OK';
end;
$$;
