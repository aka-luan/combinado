-- Agenda snapshot derivation (issue #5 / PRD §§5–8, 13, M2).
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
  snap jsonb;
  today_titles text[];
  reveal boolean;
  cnt int;
  first_occ jsonb;
  tz text := 'America/Sao_Paulo';
  -- Thursday 2026-07-30 18:30 local (before 19:00)
  before_reveal timestamptz := ('2026-07-30 18:30:00'::timestamp AT TIME ZONE tz);
  -- Thursday 2026-07-30 19:00 local (reveal starts)
  at_reveal timestamptz := ('2026-07-30 19:00:00'::timestamp AT TIME ZONE tz);
  -- Friday 2026-07-31 00:00 local (tomorrow becomes today)
  at_midnight timestamptz := ('2026-07-31 00:00:00'::timestamp AT TIME ZONE tz);
  -- Thursday 08:31 local — late vs 08:30 routine
  after_slot timestamptz := ('2026-07-30 08:31:00'::timestamp AT TIME ZONE tz);
begin
  insert into auth.users (id, email) values
    (adult1, 'a1@example.com'),
    (adult2, 'a2@example.com'),
    (outsider, 'out@example.com')
  on conflict (id) do nothing;

  hid := public.bootstrap_household(adult1, 'Ana', adult2, 'Beto');

  -- Child insert as member; seeds as service/postgres (no authenticated write yet — M5).
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  insert into public.children (household_id, name)
  values (hid, 'Mia')
  returning id into child_id;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';

  -- Empty snapshot: no routines yet.
  snap := public.household_agenda_snapshot(before_reveal);
  if snap is null then
    raise exception 'snapshot must not be null for members';
  end if;
  if snap->>'server_time' is null then
    raise exception 'snapshot missing server_time';
  end if;
  if snap->>'version' is null or length(snap->>'version') = 0 then
    raise exception 'snapshot missing version/hash';
  end if;
  if (snap->'today'->>'local_date') is distinct from '2026-07-30' then
    raise exception 'today local_date expected 2026-07-30, got %', snap->'today'->>'local_date';
  end if;
  if (snap->'tomorrow'->>'local_date') is distinct from '2026-07-31' then
    raise exception 'tomorrow local_date expected 2026-07-31, got %', snap->'tomorrow'->>'local_date';
  end if;
  if jsonb_array_length(snap->'today'->'occurrences') <> 0 then
    raise exception 'empty today should have 0 occurrences';
  end if;
  if (snap->'today'->>'empty_message') is distinct from 'Nada combinado para hoje' then
    raise exception 'empty today message mismatch: %', snap->'today'->>'empty_message';
  end if;

  reveal := (snap->'tomorrow'->>'reveal')::boolean;
  if reveal then
    raise exception 'before 19:00 tomorrow must not reveal';
  end if;
  cnt := (snap->'tomorrow'->>'count')::int;
  if cnt <> 0 then
    raise exception 'empty tomorrow count expected 0, got %', cnt;
  end if;
  execute 'reset role';

  -- Seed weekly routine: Thu+Fri 08:30, confirmable, no owner, child Mia.
  -- valid_from inclusive 2026-07-30; valid_until inclusive 2026-07-31.
  routine_id := public.seed_weekly_routine(
    hid,
    'Levar à escola',
    'child',
    child_id,
    array[4, 5]::smallint[], -- Thursday=4, Friday=5 (PG DOW)
    '08:30',
    true,
    null,
    '2026-07-30'::date,
    '2026-07-31'::date,
    '2026-07-30'::date
  );

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';

  -- Deterministic key + late status after scheduled time.
  snap := public.household_agenda_snapshot(after_slot);
  if jsonb_array_length(snap->'today'->'occurrences') <> 1 then
    raise exception 'today should have 1 occurrence after seed, got %',
      jsonb_array_length(snap->'today'->'occurrences');
  end if;
  first_occ := snap->'today'->'occurrences'->0;
  if (first_occ->>'key') is distinct from ('routine:' || routine_id::text || ':2026-07-30') then
    raise exception 'deterministic key mismatch: %', first_occ->>'key';
  end if;
  if (first_occ->>'status') is distinct from 'late' then
    raise exception '08:31 should make 08:30 occurrence late, got %', first_occ->>'status';
  end if;
  if (first_occ->>'needs_owner_alert')::boolean is not true then
    raise exception 'confirmable without owner must alert';
  end if;
  if (first_occ->>'title') is distinct from 'Levar à escola' then
    raise exception 'title mismatch';
  end if;

  -- Before 19:00: tomorrow count only (Friday routine exists), no reveal.
  snap := public.household_agenda_snapshot(before_reveal);
  reveal := (snap->'tomorrow'->>'reveal')::boolean;
  if reveal then
    raise exception '18:30 must not reveal tomorrow';
  end if;
  cnt := (snap->'tomorrow'->>'count')::int;
  if cnt <> 1 then
    raise exception 'tomorrow count expected 1 before reveal, got %', cnt;
  end if;
  if jsonb_array_length(coalesce(snap->'tomorrow'->'occurrences', '[]'::jsonb)) <> 1 then
    raise exception 'tomorrow occurrences should be derived even before reveal';
  end if;

  -- From 19:00: reveal inline.
  snap := public.household_agenda_snapshot(at_reveal);
  if (snap->'tomorrow'->>'reveal')::boolean is not true then
    raise exception '19:00 must reveal tomorrow';
  end if;
  if (snap->'tomorrow'->>'empty_message') is not null then
    raise exception 'non-empty tomorrow should not set empty_message';
  end if;
  if jsonb_array_length(snap->'tomorrow'->'occurrences') <> 1 then
    raise exception 'tomorrow at reveal should list 1 occurrence';
  end if;
  if (snap->'tomorrow'->'occurrences'->0->>'key')
     is distinct from ('routine:' || routine_id::text || ':2026-07-31') then
    raise exception 'tomorrow key mismatch';
  end if;

  -- Midnight: former tomorrow is today; new tomorrow (Sat) outside weekdays → empty.
  snap := public.household_agenda_snapshot(at_midnight);
  if (snap->'today'->>'local_date') is distinct from '2026-07-31' then
    raise exception 'at midnight today should be 2026-07-31';
  end if;
  if jsonb_array_length(snap->'today'->'occurrences') <> 1 then
    raise exception 'Friday occurrence should be today after midnight';
  end if;
  if (snap->'tomorrow'->>'local_date') is distinct from '2026-08-01' then
    raise exception 'tomorrow after midnight should be 2026-08-01';
  end if;
  if (snap->'tomorrow'->>'count')::int <> 0 then
    raise exception 'Saturday should have zero tomorrow count';
  end if;
  execute 'reset role';

  -- Validity boundary: day after valid_until excluded.
  delete from public.weekly_routine_versions;
  delete from public.weekly_routines;

  routine_id := public.seed_weekly_routine(
    hid,
    'Só quinta',
    'casa',
    null,
    array[4]::smallint[],
    '09:00',
    false, -- informational: no owner alert
    null,
    '2026-07-30'::date,
    '2026-07-30'::date,
    '2026-07-30'::date
  );

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';

  snap := public.household_agenda_snapshot(at_reveal);
  if jsonb_array_length(snap->'today'->'occurrences') <> 1 then
    raise exception 'valid_until inclusive should include Thursday';
  end if;
  first_occ := snap->'today'->'occurrences'->0;
  if (first_occ->>'needs_owner_alert')::boolean is true then
    raise exception 'informational must not owner-alert';
  end if;
  if (first_occ->>'status') is distinct from 'scheduled' then
    raise exception 'informational status should be scheduled, got %', first_occ->>'status';
  end if;
  if (snap->'tomorrow'->>'count')::int <> 0 then
    raise exception 'Friday outside valid_until must not generate occurrence';
  end if;
  if (snap->'tomorrow'->>'reveal')::boolean is not true then
    raise exception 'reveal still true at 19:00 even when empty';
  end if;
  if (snap->'tomorrow'->>'empty_message') is distinct from 'Nada combinado para amanhã' then
    raise exception 'empty tomorrow message mismatch: %', snap->'tomorrow'->>'empty_message';
  end if;
  execute 'reset role';

  -- Ordering: late timed, future timed, untimed — stable by time, title, key.
  delete from public.weekly_routine_versions;
  delete from public.weekly_routines;

  perform public.seed_weekly_routine(
    hid, 'Zebra tarde', 'casa', null, array[4]::smallint[], '10:00', true, null,
    '2026-07-30'::date, null, '2026-07-30'::date
  );
  perform public.seed_weekly_routine(
    hid, 'Alpha cedo', 'casa', null, array[4]::smallint[], '07:00', true, null,
    '2026-07-30'::date, null, '2026-07-30'::date
  );
  perform public.seed_weekly_routine(
    hid, 'Beta sem hora', 'casa', null, array[4]::smallint[], null, true, null,
    '2026-07-30'::date, null, '2026-07-30'::date
  );
  perform public.seed_weekly_routine(
    hid, 'Alpha cedo B', 'casa', null, array[4]::smallint[], '07:00', true, null,
    '2026-07-30'::date, null, '2026-07-30'::date
  );

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';

  snap := public.household_agenda_snapshot(after_slot); -- 08:31: 07:00 late, 10:00 future
  select array_agg(o->>'title' order by ordinality)
  into today_titles
  from jsonb_array_elements(snap->'today'->'occurrences') with ordinality as t(o, ordinality);

  if today_titles is distinct from array['Alpha cedo', 'Alpha cedo B', 'Zebra tarde', 'Beta sem hora'] then
    raise exception 'ordering mismatch: %', today_titles;
  end if;

  -- Second adult sees the same ordered snapshot.
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', adult2::text, true);
  execute 'set local role authenticated';
  snap := public.household_agenda_snapshot(after_slot);
  select array_agg(o->>'title' order by ordinality)
  into today_titles
  from jsonb_array_elements(snap->'today'->'occurrences') with ordinality as t(o, ordinality);
  if today_titles is distinct from array['Alpha cedo', 'Alpha cedo B', 'Zebra tarde', 'Beta sem hora'] then
    raise exception 'adult2 ordering mismatch: %', today_titles;
  end if;

  -- Outsider cannot read snapshot.
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  snap := public.household_agenda_snapshot(before_reveal);
  if snap is not null then
    raise exception 'outsider should get null snapshot';
  end if;

  execute 'reset role';
  raise notice 'agenda snapshot tests OK';
end;
$$;
