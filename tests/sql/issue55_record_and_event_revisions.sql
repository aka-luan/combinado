-- Issue #55: confirmable Rotina Registro and future Evento planning revisions.
\set ON_ERROR_STOP on

do $$
<<issue55_test>>
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  outsider uuid := '33333333-3333-3333-3333-333333333333';
  hid uuid;
  child_id uuid;
  routine_id uuid;
  routine_completion_id uuid;
  first_routine_completion_id uuid;
  routine_revision_id uuid;
  event_id uuid;
  revision_id uuid;
  new_revision_id uuid;
  completed_event uuid;
  completed_event_revision uuid;
  result jsonb;
  snap jsonb;
  occ jsonb;
  old_revision_title text;
  audit_count int;
  at_morning timestamptz := ('2026-08-01 10:00:00'::timestamp at time zone 'America/Sao_Paulo');
  at_evening timestamptz := ('2026-08-01 19:00:00'::timestamp at time zone 'America/Sao_Paulo');
  at_next_day timestamptz := ('2026-08-02 10:00:00'::timestamp at time zone 'America/Sao_Paulo');
  raised boolean;
begin
  insert into auth.users (id, email) values
    (adult1, 'a1@example.com'), (adult2, 'a2@example.com'), (outsider, 'out@example.com')
  on conflict (id) do nothing;

  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  hid := public.current_household_id();
  if hid is null then
    raise exception 'issue55 tests require a bootstrapped household';
  end if;
  perform set_config('combinado.allow_clock_override', 'on', true);

  insert into public.children (household_id, name)
  values (hid, 'Issue 55 Mia')
  returning id into child_id;

  routine_id := public.create_weekly_routine(
    'Rotina Registro', 'child', child_id, array[6]::smallint[],
    '08:30', true, adult2, '2026-08-01'::date, null
  );

  snap := public.household_agenda_snapshot(at_morning);
  select item into occ
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = routine_id::text;
  if occ->>'status' is distinct from 'late'
     or occ->>'owner_user_id' is distinct from adult2::text then
    raise exception 'confirmable routine was not derived with planned owner: %', occ;
  end if;

  result := public.complete_weekly_routine(routine_id, '2026-08-01'::date, at_morning);
  if (result->>'ok')::boolean is not true then
    raise exception 'routine completion failed: %', result;
  end if;
  routine_completion_id := (result->>'confirmation_id')::uuid;
  first_routine_completion_id := routine_completion_id;

  snap := public.household_agenda_snapshot(at_morning);
  select item into occ
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = routine_id::text;
  if occ->>'status' is distinct from 'completed'
     or occ->>'confirmed_by_user_id' is distinct from adult1::text
     or occ->>'owner_user_id' is distinct from adult2::text then
    raise exception 'routine completion must preserve owner and executor: %', occ;
  end if;

  perform set_config('request.jwt.claim.sub', adult2::text, true);
  result := public.complete_weekly_routine(routine_id, '2026-08-01'::date, at_morning);
  if result->>'code' is distinct from 'already_completed'
     or result->>'confirmed_by_user_id' is distinct from adult1::text then
    raise exception 'routine completion conflict lost first executor: %', result;
  end if;

  result := public.reverse_weekly_routine_completion(routine_completion_id, at_morning);
  if (result->>'ok')::boolean is not true then
    raise exception 'routine correction failed: %', result;
  end if;
  result := public.complete_weekly_routine(routine_id, '2026-08-01'::date, at_morning);
  routine_completion_id := (result->>'confirmation_id')::uuid;
  result := public.reverse_weekly_routine_completion(routine_completion_id, at_next_day);
  if result->>'code' is distinct from 'correction_window_closed' then
    raise exception 'routine correction must close after the local day: %', result;
  end if;

  select id into routine_revision_id
  from public.routine_completions
  where id = routine_completion_id;
  if routine_revision_id is null then
    raise exception 'routine completion was not persisted';
  end if;
  select count(*) into audit_count
  from public.routine_audit ra
  where ra.routine_id = issue55_test.routine_id;
  if audit_count < 3 then
    raise exception 'routine completion/correction audit is incomplete: %', audit_count;
  end if;
  if not exists (
    select 1
    from public.routine_completions rc
    where rc.id = first_routine_completion_id
      and rc.planned_responsible_user_id = adult2
      and rc.confirmed_by = adult1
      and rc.confirmed_at = at_morning
  ) then
    raise exception 'routine Registro did not preserve planned and actual fields';
  end if;

  -- A future event gets an append-only revision and moves to the new date.
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  result := public.create_one_off_event(
    'Evento revisão 1', 'child', child_id, '2026-08-02', '12:00', true, adult2, at_morning
  );
  event_id := (result->>'event_id')::uuid;
  revision_id := (result->>'planning_revision_id')::uuid;
  result := public.edit_one_off_event(
    event_id, revision_id, 'Evento revisão 2', 'casa', null,
    '2026-08-02', '13:30', false, null, at_morning
  );
  if (result->>'ok')::boolean is not true then
    raise exception 'future event revision failed: %', result;
  end if;
  new_revision_id := (result->>'planning_revision_id')::uuid;

  select r.title into old_revision_title
  from public.one_off_event_revisions r where r.id = revision_id;
  if old_revision_title is distinct from 'Evento revisão 1' then
    raise exception 'previous planning revision was overwritten: %', old_revision_title;
  end if;
  if (select count(*) from public.one_off_event_revisions r where r.event_id = issue55_test.event_id) <> 2 then
    raise exception 'future event must have two planning revisions';
  end if;
  if not exists (
    select 1
    from public.event_audit ea
    where ea.event_id = issue55_test.event_id
      and ea.action = 'planning_revised'
      and ea.details->'before'->>'title' = 'Evento revisão 1'
      and ea.details->'after'->>'title' = 'Evento revisão 2'
  ) then
    raise exception 'event planning revision audit did not preserve both snapshots';
  end if;

  snap := public.household_agenda_snapshot(at_evening);
  select item into occ
  from jsonb_array_elements(snap->'tomorrow'->'occurrences') item
  where item->>'source_id' = event_id::text;
  if occ->>'title' is distinct from 'Evento revisão 2'
     or occ->>'target_kind' is distinct from 'casa'
     or occ->>'scheduled_time' is distinct from '13:30'
     or occ->>'planning_revision_id' is distinct from new_revision_id::text then
    raise exception 'snapshot did not use the newest event revision: %', occ;
  end if;

  result := public.edit_one_off_event(
    event_id, revision_id, 'Conflito', 'casa', null,
    '2026-08-02', null, false, null, at_morning
  );
  if result->>'code' is distinct from 'planning_revision_conflict' then
    raise exception 'stale event revision was accepted: %', result;
  end if;

  result := public.create_one_off_event(
    'Evento concluído não edita', 'casa', null, '2026-08-01', null, true, adult1, at_morning
  );
  completed_event := (result->>'event_id')::uuid;
  completed_event_revision := (result->>'planning_revision_id')::uuid;
  result := public.complete_one_off_event(completed_event, at_morning);
  if (result->>'ok')::boolean is not true then
    raise exception 'completed event setup failed: %', result;
  end if;
  result := public.edit_one_off_event(
    completed_event, completed_event_revision, 'Não editar', 'casa', null,
    '2026-08-02', null, true, adult1, at_morning
  );
  if result->>'code' is distinct from 'already_completed' then
    raise exception 'completed event was editable directly: %', result;
  end if;

  -- The second Adult can read neither this Casa's history nor use its RPC.
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.one_off_event_revisions r where r.event_id = issue55_test.event_id) then
    raise exception 'outsider read planning revisions through RLS';
  end if;
  raised := false;
  begin
    result := public.edit_one_off_event(
      event_id, new_revision_id, 'Intruso', 'casa', null,
      '2026-08-02', null, false, null, at_morning
    );
    if result->>'ok' is true then
      raise exception 'outsider could invoke event edit';
    end if;
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'outsider could invoke event edit: %', result;
  end if;
  execute 'reset role';

  -- Audit history is append-only, including the new planning action.
  begin
    update public.event_audit set details = jsonb_build_object('tampered', true)
    where event_audit.event_id = issue55_test.event_id
      and event_audit.action = 'planning_revised';
    raise exception 'event planning audit should be immutable' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    null;
  end;

  raise notice 'issue55 record and event revision tests OK';
end;
$$;
