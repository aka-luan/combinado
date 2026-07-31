-- Versioned weekly routine planning (issue #9 / PRD §§8.5–8.6).
\set ON_ERROR_STOP on

do $$
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  outsider uuid := '33333333-3333-3333-3333-333333333333';
  hid uuid;
  child_id uuid;
  routine_uuid uuid;
  version_id uuid;
  next_version_id uuid;
  exception_id uuid;
  restored_exception_id uuid;
  exception_count int;
  snap jsonb;
  row jsonb;
  raised boolean;
  tz text := 'America/Sao_Paulo';
  thursday_10 timestamptz := ('2026-07-30 10:00:00'::timestamp at time zone tz);
  thursday_12 timestamptz := ('2026-07-30 12:00:00'::timestamp at time zone tz);
  thursday_19 timestamptz := ('2026-07-30 19:00:00'::timestamp at time zone tz);
begin
  insert into auth.users (id, email) values
    (adult1, 'a1@example.com'),
    (adult2, 'a2@example.com'),
    (outsider, 'out@example.com')
  on conflict (id) do nothing;

  hid := public.bootstrap_household(adult1, 'Ana', adult2, 'Beto');

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  perform set_config('combinado.allow_clock_override', 'on', true);

  insert into public.children (household_id, name)
  values (hid, 'Lia')
  returning id into child_id;

  routine_uuid := public.create_weekly_routine(
    'Levar à escola', 'child', child_id, array[4, 5]::smallint[],
    '08:30', true, null, '2026-07-30'::date, null
  );
  select v.id into version_id
  from public.weekly_routine_versions v
  where v.routine_id = routine_uuid
  order by v.created_at desc
  limit 1;

  -- The edit is append-only and effective tomorrow; Today still uses history.
  row := public.edit_weekly_routine(
    routine_uuid, version_id, 'Levar à escola — novo horário', 'child', child_id,
    array[4, 5]::smallint[], '09:15', true, adult2,
    '2026-07-30'::date, null, thursday_10
  );
  next_version_id := (row->>'version_id')::uuid;
  if (row->>'effective_from') is distinct from '2026-07-31' then
    raise exception 'routine edit must become effective tomorrow: %', row;
  end if;

  snap := public.household_agenda_snapshot(thursday_10);
  select item into row
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = routine_uuid::text;
  if row->>'title' is distinct from 'Levar à escola'
     or row->>'scheduled_time' is distinct from '08:30' then
    raise exception 'Today must preserve the old routine version: %', row;
  end if;

  snap := public.household_agenda_snapshot(thursday_19);
  select item into row
  from jsonb_array_elements(snap->'tomorrow'->'occurrences') item
  where item->>'source_id' = routine_uuid::text;
  if row->>'title' is distinct from 'Levar à escola — novo horário'
     or row->>'scheduled_time' is distinct from '09:15'
     or row->>'owner_user_id' is distinct from adult2::text then
    raise exception 'Tomorrow must use the edited version: %', row;
  end if;

  -- A combined exception changes time and owner for one date only.
  row := public.save_weekly_routine_exception(
    routine_uuid, '2026-07-30'::date, false, '11:00', true, adult2, true, null, thursday_10
  );
  exception_id := (row->>'exception_id')::uuid;
  snap := public.household_agenda_snapshot(thursday_12);
  select item into row
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = routine_uuid::text;
  if row->>'status' is distinct from 'late'
     or row->>'scheduled_time' is distinct from '11:00'
     or row->>'owner_user_id' is distinct from adult2::text
     or row->>'routine_exception_active' is distinct from 'true' then
    raise exception 'combined exception was not effective: %', row;
  end if;

  -- A second event can cancel and remove the owner; the first event remains audit.
  row := public.save_weekly_routine_exception(
    routine_uuid, '2026-07-30'::date, true, '12:30', true, null, true, exception_id, thursday_12
  );
  exception_id := (row->>'exception_id')::uuid;
  select count(*) into strict exception_count
  from public.weekly_routine_exceptions e
  where e.routine_id = routine_uuid and e.local_date = '2026-07-30'::date;
  if exception_count <> 2 then
    raise exception 'exception history must be append-only';
  end if;

  snap := public.household_agenda_snapshot(thursday_12);
  select item into row
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = routine_uuid::text;
  if row->>'status' is distinct from 'cancelled'
     or row->>'needs_owner_alert' is distinct from 'false' then
    raise exception 'cancelled exception should be visible without owner alert: %', row;
  end if;
  if (snap->'tomorrow'->>'count')::int < 0 then
    raise exception 'tomorrow count cannot be negative';
  end if;

  -- Restoration is another immutable event and returns to the base version.
  row := public.restore_weekly_routine_exception(
    routine_uuid, '2026-07-30'::date, exception_id, thursday_12 + interval '1 minute'
  );
  restored_exception_id := (row->>'exception_id')::uuid;
  snap := public.household_agenda_snapshot(thursday_12);
  select item into row
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = routine_uuid::text;
  if row->>'scheduled_time' is distinct from '08:30'
     or row->>'routine_exception_active' is distinct from 'false'
     or row->>'needs_owner_alert' is distinct from 'true' then
    raise exception 'restoration must return to the default: %', row;
  end if;

  -- Only Today/Tomorrow are accepted.
  raised := false;
  begin
    perform public.save_weekly_routine_exception(
      routine_uuid, '2026-08-02'::date, false, null, false, null, false,
      null, thursday_12
    );
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'exception beyond Tomorrow must be rejected';
  end if;

  -- Optimistic concurrency rejects a stale exception version.
  perform public.save_weekly_routine_exception(
    routine_uuid, '2026-07-30'::date, false, null, false, adult2, true,
    restored_exception_id, thursday_12 + interval '2 minutes'
  );
  raised := false;
  begin
    perform public.save_weekly_routine_exception(
      routine_uuid, '2026-07-30'::date, false, null, false, null, true,
      restored_exception_id, thursday_12
    );
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'stale exception edit must be rejected';
  end if;

  -- A stale routine version is rejected as well.
  raised := false;
  begin
    perform public.edit_weekly_routine(
      routine_uuid, version_id, 'stale', 'child', child_id, array[4]::smallint[],
      '10:00', true, null, '2026-07-30'::date, null, thursday_10
    );
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'stale routine edit must be rejected';
  end if;

  -- Archival creates a future archived version and removes Tomorrow occurrence.
  row := public.archive_weekly_routine(routine_uuid, next_version_id, thursday_10);
  snap := public.household_agenda_snapshot(thursday_19);
  if exists (
    select 1
    from jsonb_array_elements(snap->'tomorrow'->'occurrences') item
    where item->>'source_id' = routine_uuid::text
  ) then
    raise exception 'archived routine must not generate Tomorrow occurrence';
  end if;

  -- Outsiders cannot use the planning RPC.
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  raised := false;
  begin
    perform public.archive_weekly_routine(routine_uuid, next_version_id, thursday_10);
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'outsider must not archive a routine';
  end if;
  execute 'reset role';

  raise notice 'weekly_routine_planning tests OK';
end;
$$;
