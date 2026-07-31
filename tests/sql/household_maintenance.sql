-- M6 household catalog maintenance (issue #10 / PRD §§3, 12, 16).
\set ON_ERROR_STOP on

do $$
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  hid uuid;
  child_id uuid;
  routine_uuid uuid;
  routine_version_id uuid;
  medication_uuid uuid;
  medication_version_id uuid;
  row jsonb;
  raised boolean;
  at_friday timestamptz := ('2026-07-31 10:00:00'::timestamp at time zone 'America/Sao_Paulo');
begin
  insert into auth.users (id, email) values
    (adult1, 'a1@example.com'),
    (adult2, 'a2@example.com')
  on conflict (id) do nothing;

  hid := public.bootstrap_household(adult1, 'Ana', adult2, 'Beto');
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  perform set_config('combinado.allow_clock_override', 'on', true);

  insert into public.children (household_id, name)
  values (hid, 'Lia')
  returning id into child_id;

  routine_uuid := public.create_weekly_routine(
    'Escola', 'child', child_id, array[5]::smallint[], '08:00', true,
    null, '2026-07-31'::date, null
  );
  select v.id into routine_version_id
  from public.weekly_routine_versions v
  where v.routine_id = routine_uuid
  order by v.created_at desc
  limit 1;

  medication_uuid := public.create_medication(
    child_id, 'Tratamento', 'Conforme prescrição', array['09:00'],
    '2026-07-31'::date, null
  );
  select v.id into medication_version_id
  from public.medication_versions v
  where v.medication_id = medication_uuid
  order by v.created_at desc
  limit 1;

  -- A child with unresolved active dependencies cannot be archived.
  raised := false;
  begin
    perform public.archive_child(child_id, at_friday);
  exception when others then
    raised := sqlerrm like '%child_has_active_dependencies%';
  end;
  if not raised then
    raise exception 'child archive must guard active routine/medication dependencies';
  end if;

  -- Resolve both dependencies through append-only versions, then archive the child.
  row := public.archive_weekly_routine(routine_uuid, routine_version_id, at_friday);
  if row->>'effective_from' is distinct from '2026-08-01' then
    raise exception 'routine archive must start tomorrow: %', row;
  end if;

  row := public.archive_medication(medication_uuid, medication_version_id, at_friday);
  if row->>'effective_from' is distinct from '2026-08-01' then
    raise exception 'medication archive must start tomorrow: %', row;
  end if;

  row := public.archive_child(child_id, at_friday);
  if row->>'effective_from' is distinct from '2026-07-31'
     or row->>'archived' is distinct from 'true' then
    raise exception 'child archive response is wrong: %', row;
  end if;

  -- Reactivation is visible only from tomorrow and does not recreate today.
  row := public.reactivate_child(child_id, at_friday);
  if row->>'effective_from' is distinct from '2026-08-01' then
    raise exception 'child reactivation must start tomorrow: %', row;
  end if;
  if (select active_from from public.children where id = child_id) <> '2026-08-01' then
    raise exception 'child active_from was not versioned to tomorrow';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(public.household_agenda_snapshot(at_friday)->'today'->'occurrences') item
    where item->>'child_id' = child_id::text
  ) then
    raise exception 'reactivation must not recreate a past occurrence';
  end if;

  -- Restore both catalog records for tomorrow without rewriting their history.
  select v.id into routine_version_id
  from public.weekly_routine_versions v
  where v.routine_id = routine_uuid
  order by v.effective_from desc, v.created_at desc
  limit 1;
  row := public.restore_weekly_routine(routine_uuid, routine_version_id, at_friday);
  if row->>'effective_from' is distinct from '2026-08-01' then
    raise exception 'routine restoration must start tomorrow: %', row;
  end if;

  select v.id into medication_version_id
  from public.medication_versions v
  where v.medication_id = medication_uuid
  order by v.effective_from desc, v.created_at desc
  limit 1;
  row := public.restore_medication(medication_uuid, medication_version_id, at_friday);
  if row->>'effective_from' is distinct from '2026-08-01' then
    raise exception 'medication restoration must start tomorrow: %', row;
  end if;

  if (select count(*) from public.children where id = child_id) <> 1 then
    raise exception 'child maintenance must preserve the row';
  end if;
  if (select count(*) from public.weekly_routine_versions where weekly_routine_versions.routine_id = routine_uuid) < 3 then
    raise exception 'routine maintenance must preserve versions';
  end if;
  if (select count(*) from public.medication_versions where medication_versions.medication_id = medication_uuid) < 3 then
    raise exception 'medication maintenance must preserve versions';
  end if;

  execute 'reset role';
  raise notice 'household maintenance tests OK';
end;
$$;
