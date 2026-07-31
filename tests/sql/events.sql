-- M5 one-off event, completion, correction, cancellation, and date-boundary tests.

\set ON_ERROR_STOP on

do $$
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  hid uuid;
  child_id uuid;
  planned_event uuid;
  info_event uuid;
  cancelled_event uuid;
  tomorrow_event uuid;
  late_event uuid;
  untimed_event uuid;
  snap jsonb;
  occ jsonb;
  result jsonb;
  audit_count int;
  audit_trigger_count int;
  audit_error text;
  tomorrow_before int;
  at_10 timestamptz := ('2026-07-31 10:00:00'::timestamp at time zone 'America/Sao_Paulo');
  at_19 timestamptz := ('2026-07-31 19:00:00'::timestamp at time zone 'America/Sao_Paulo');
  at_midnight timestamptz := ('2026-08-01 00:00:00'::timestamp at time zone 'America/Sao_Paulo');
begin
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  hid := public.current_household_id();
  if hid is null then
    raise exception 'event tests require a bootstrapped household';
  end if;

  perform set_config('combinado.allow_clock_override', 'on', true);

  insert into public.children (household_id, name)
  values (hid, 'Evento Mia')
  returning id into child_id;

  -- Planned Responsável is independent from the adult who later executes it.
  result := public.create_one_off_event(
    'Buscar Mia', 'child', child_id, '2026-07-31', '15:00', true, adult2, at_10
  );
  planned_event := (result->>'event_id')::uuid;
  if (result->>'ok')::boolean is not true then
    raise exception 'event with planned Responsável create failed: %', result;
  end if;

  result := public.create_one_off_event(
    'Informativo Casa', 'casa', null, '2026-07-31', null, false, null, at_10
  );
  info_event := (result->>'event_id')::uuid;
  if (result->>'ok')::boolean is not true then
    raise exception 'informational event create failed: %', result;
  end if;

  result := public.create_one_off_event(
    'Atrasado sem responsável', 'casa', null, '2026-07-31', '09:00', true, null, at_10
  );
  late_event := (result->>'event_id')::uuid;
  result := public.create_one_off_event(
    'Sem horário', 'casa', null, '2026-07-31', null, true, null, at_10
  );
  untimed_event := (result->>'event_id')::uuid;

  result := public.create_one_off_event(
    'Cancelar amanhã', 'casa', null, '2026-08-01', '09:00', true, null, at_10
  );
  cancelled_event := (result->>'event_id')::uuid;
  result := public.create_one_off_event(
    'Virada do dia', 'child', child_id, '2026-08-01', null, true, adult1, at_10
  );
  tomorrow_event := (result->>'event_id')::uuid;

  snap := public.household_agenda_snapshot(at_10);
  select item into occ
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = planned_event::text;
  if occ->>'owner_user_id' is distinct from adult2::text then
    raise exception 'planned Responsável must be adult2: %', occ;
  end if;
  if occ->>'status' is distinct from 'scheduled' then
    raise exception 'early event must remain scheduled: %', occ;
  end if;
  if (occ->>'needs_owner_alert')::boolean is true then
    raise exception 'event with planned Responsável must not alert: %', occ;
  end if;

  select item into occ
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = late_event::text;
  if occ->>'status' is distinct from 'late'
     or (occ->>'needs_owner_alert')::boolean is not true
  then
    raise exception 'timed event should be late and show missing Responsável alert at 10:00: %', occ;
  end if;

  select item into occ
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = untimed_event::text;
  if occ->>'status' is distinct from 'scheduled' then
    raise exception 'untimed event should remain scheduled: %', occ;
  end if;

  select item into occ
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = info_event::text;
  if occ->>'status' is distinct from 'scheduled'
     or (occ->>'requires_confirmation')::boolean is not false
     or (occ->>'owner_user_id') is not null
  then
    raise exception 'informational event contract mismatch: %', occ;
  end if;

  -- Early completion is allowed on the same local day.
  result := public.complete_one_off_event(planned_event, at_10);
  if (result->>'ok')::boolean is not true then
    raise exception 'early completion failed: %', result;
  end if;

  snap := public.household_agenda_snapshot(at_10);
  select item into occ
  from jsonb_array_elements(snap->'today'->'occurrences') item
  where item->>'source_id' = planned_event::text;
  if occ->>'status' is distinct from 'completed'
     or occ->>'confirmed_by_user_id' is distinct from adult1::text
     or occ->>'owner_user_id' is distinct from adult2::text
  then
    raise exception 'executor must be separate from planned Responsável: %', occ;
  end if;

  -- A second Adult loses the active unique completion and receives the winner.
  perform set_config('request.jwt.claim.sub', adult2::text, true);
  result := public.complete_one_off_event(planned_event, at_10);
  if result->>'code' is distinct from 'already_completed'
     or result->>'confirmed_by_user_id' is distinct from adult1::text
     or (result->>'confirmed_at')::timestamptz <> at_10
     or result->>'confirmed_by_display_name' is distinct from 'Ana'
  then
    raise exception 'completion conflict did not identify executor: %', result;
  end if;

  -- Informational events and tomorrow cannot be completed.
  result := public.complete_one_off_event(info_event, at_10);
  if result->>'code' is distinct from 'not_confirmable' then
    raise exception 'informational completion should be rejected: %', result;
  end if;
  result := public.complete_one_off_event(tomorrow_event, at_10);
  if result->>'code' is distinct from 'not_confirmable_day' then
    raise exception 'tomorrow completion should be rejected: %', result;
  end if;

  -- Correcting preserves the completion audit, and a new Adult may then complete.
  result := public.reverse_event_completion((
    select id from public.event_completions
    where event_id = planned_event and reversed_at is null
  ), at_10);
  if (result->>'ok')::boolean is not true then
    raise exception 'event correction failed: %', result;
  end if;
  result := public.complete_one_off_event(planned_event, at_10);
  if (result->>'ok')::boolean is not true then
    raise exception 'completion after correction failed: %', result;
  end if;

  select count(*) into audit_count
  from public.event_audit
  where event_id = planned_event;
  if audit_count < 3 then
    raise exception 'completion and correction audit must be immutable: % rows', audit_count;
  end if;

  -- The audit trigger rejects mutation of a real history row, even as the
  -- database role; authenticated clients have no direct write grant either.
  execute 'reset role';
  begin
    update public.event_audit
    set details = jsonb_build_object('tampered', true)
    where event_id = planned_event and action = 'created';
    raise exception 'audit update should have been rejected' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics audit_error = message_text;
    if audit_error is distinct from 'event_audit_immutable' then
      raise;
    end if;
  end;
  begin
    delete from public.event_audit
    where event_id = planned_event and action = 'created';
    raise exception 'audit delete should have been rejected' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    get stacked diagnostics audit_error = message_text;
    if audit_error is distinct from 'event_audit_immutable' then
      raise;
    end if;
  end;
  execute 'set local role authenticated';

  -- The audit trigger is also installed as a named guard for deploy checks.
  select count(*) into audit_trigger_count
  from pg_trigger
  where tgrelid = 'public.event_audit'::regclass
    and tgname = 'event_audit_immutable_trg'
    and not tgisinternal;
  if audit_trigger_count <> 1 then
    raise exception 'immutable event audit trigger missing';
  end if;

  -- Cancelling keeps the row/audit but removes it from tomorrow's active count.
  snap := public.household_agenda_snapshot(at_19);
  tomorrow_before := (snap->'tomorrow'->>'count')::int;
  result := public.cancel_one_off_event(cancelled_event, at_19);
  if (result->>'ok')::boolean is not true then
    raise exception 'future cancellation failed: %', result;
  end if;
  snap := public.household_agenda_snapshot(at_19);
  if (snap->'tomorrow'->>'count')::int <> tomorrow_before - 1 then
    raise exception 'cancelled tomorrow event must reduce active count by one: %', snap;
  end if;
  select item into occ
  from jsonb_array_elements(snap->'tomorrow'->'occurrences') item
  where item->>'source_id' = cancelled_event::text;
  if occ->>'status' is distinct from 'cancelled' then
    raise exception 'cancelled event must remain visible in revealed tomorrow: %', occ;
  end if;
  select item into occ
  from jsonb_array_elements(snap->'tomorrow'->'occurrences') item
  where item->>'source_id' = tomorrow_event::text;
  if occ->>'owner_user_id' is distinct from adult1::text then
    raise exception 'default UI responsibility must persist as creator: %', occ;
  end if;

  -- At local midnight, tomorrow becomes today and a same-day completion is valid.
  snap := public.household_agenda_snapshot(at_midnight);
  if snap->'today'->>'local_date' is distinct from '2026-08-01' then
    raise exception 'midnight did not advance household date: %', snap;
  end if;
  result := public.complete_one_off_event(tomorrow_event, at_midnight);
  if (result->>'ok')::boolean is not true then
    raise exception 'event on new today should be completable at midnight: %', result;
  end if;

  execute 'reset role';
  raise notice 'one-off event tests OK';
end;
$$;
