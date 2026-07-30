-- Authenticated weekly routine create (issue #16 / PRD §8.5, 12.1).
-- Expects auth stub + migrations applied. Run via scripts/run-rls-tests.mjs.

\set ON_ERROR_STOP on

do $$
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  outsider uuid := '33333333-3333-3333-3333-333333333333';
  hid uuid;
  child_id uuid;
  routine_id uuid;
  created_id uuid;
  ver record;
  snap jsonb;
  tz text := 'America/Sao_Paulo';
  after_slot timestamptz := ('2026-07-30 08:31:00'::timestamp AT TIME ZONE tz);
  raised boolean;
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

  -- Member can create a confirmable weekly routine via RPC (no SQL seed).
  created_id := public.create_weekly_routine(
    'Levar à escola',
    'child',
    child_id,
    array[4, 5]::smallint[],
    '08:30',
    true,
    null,
    '2026-07-30'::date,
    '2026-07-31'::date
  );
  if created_id is null then
    raise exception 'create_weekly_routine must return routine id';
  end if;
  routine_id := created_id;

  select * into ver
  from public.weekly_routine_versions v
  where v.routine_id = created_id
  order by v.created_at desc
  limit 1;

  if ver.title is distinct from 'Levar à escola' then
    raise exception 'persisted title mismatch: %', ver.title;
  end if;
  if ver.target_kind is distinct from 'child' or ver.child_id is distinct from child_id then
    raise exception 'child target not persisted';
  end if;
  if ver.scheduled_time is distinct from '08:30' then
    raise exception 'scheduled_time mismatch: %', ver.scheduled_time;
  end if;
  if ver.effective_from is distinct from '2026-07-30'::date then
    raise exception 'first version effective_from should equal valid_from';
  end if;

  -- Created routine appears on Today via snapshot (dogfood path).
  snap := public.household_agenda_snapshot(after_slot);
  if not exists (
    select 1
    from jsonb_array_elements(snap->'today'->'occurrences') o
    where o->>'title' = 'Levar à escola'
      and o->>'key' = ('routine:' || created_id::text || ':2026-07-30')
  ) then
    raise exception 'created routine missing from today snapshot: %', snap->'today'->'occurrences';
  end if;

  -- Informational routine cannot retain an owner.
  raised := false;
  begin
    perform public.create_weekly_routine(
      'Aviso',
      'casa',
      null,
      array[4]::smallint[],
      null,
      false,
      adult1,
      '2026-07-30'::date,
      null
    );
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'informational routine with owner must be rejected';
  end if;

  -- Empty title rejected.
  raised := false;
  begin
    perform public.create_weekly_routine(
      '   ',
      'casa',
      null,
      array[4]::smallint[],
      '09:00',
      true,
      null,
      '2026-07-30'::date,
      null
    );
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'blank title must be rejected';
  end if;

  execute 'reset role';

  -- Outsider cannot create into the household.
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  raised := false;
  begin
    perform public.create_weekly_routine(
      'Intruso',
      'casa',
      null,
      array[4]::smallint[],
      '10:00',
      true,
      null,
      '2026-07-30'::date,
      null
    );
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'outsider must not create weekly routines';
  end if;
  execute 'reset role';

  -- Direct inserts remain denied for authenticated (writes go through RPC).
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  raised := false;
  begin
    insert into public.weekly_routines (household_id) values (hid);
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'direct insert into weekly_routines must be denied';
  end if;
  execute 'reset role';

  raise notice 'weekly_routine_create tests OK';
end;
$$;
