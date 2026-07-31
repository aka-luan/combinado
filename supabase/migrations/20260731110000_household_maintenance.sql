-- M6: complete the household catalog without database access (issue #10).
-- Catalog changes preserve rows and become effective tomorrow where the domain
-- uses versioned records. Adult replacement remains an administrative action.

-- ---------------------------------------------------------------------------
-- Children: dependency-safe archival and next-day reactivation
-- ---------------------------------------------------------------------------

alter table public.children
  add column if not exists active_from date;

update public.children
set active_from = coalesce(
  active_from,
  (created_at at time zone public.household_timezone())::date,
  '1900-01-01'::date
);

alter table public.children
  -- A newly created child is active immediately for the household's agenda;
  -- explicit reactivation is the only path that schedules a future date.
  alter column active_from set default '1900-01-01'::date,
  alter column active_from set not null;

create index if not exists children_household_active_from_idx
  on public.children (household_id, active_from);

create or replace function public.children_archive_fields_guard()
returns trigger
language plpgsql
as $$
begin
  if (
    new.archived_at is distinct from old.archived_at
    or new.active_from is distinct from old.active_from
  ) and coalesce(current_setting('combinado.child_maintenance_rpc', true), '') <> 'on' then
    raise exception 'child_maintenance_rpc_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists children_archive_fields_guard_trg on public.children;
create trigger children_archive_fields_guard_trg
  before update of archived_at, active_from on public.children
  for each row execute function public.children_archive_fields_guard();

create or replace function public.archive_child(
  p_child_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  at_effective timestamptz;
  effective_date date;
  child_row public.children%rowtype;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  at_effective := public.mutation_at(p_at);
  effective_date := public.local_date_in_household(at_effective);

  select c.* into child_row
  from public.children c
  where c.id = p_child_id and c.household_id = hid
  for update;
  if not found then
    raise exception 'child_not_found' using errcode = 'P0001';
  end if;
  if child_row.archived_at is not null then
    return jsonb_build_object(
      'ok', true, 'child_id', child_row.id, 'archived', true, 'already', true,
      'effective_from', effective_date
    );
  end if;

  -- A dependency already scheduled to archive tomorrow is resolved for the
  -- next active day. The current day remains represented by its own history.
  if exists (
    select 1
    from public.weekly_routines r
    join lateral (
      select vv.*
      from public.weekly_routine_versions vv
      where vv.routine_id = r.id
        and vv.effective_from <= effective_date + 1
      order by vv.effective_from desc, vv.created_at desc, vv.id desc
      limit 1
    ) v on true
    where r.household_id = hid
      and v.target_kind = 'child'
      and v.child_id = p_child_id
      and not v.archived
      and v.valid_from <= effective_date + 1
      and (v.valid_until is null or v.valid_until >= effective_date + 1)
  ) or exists (
    select 1
    from public.medications m
    join lateral (
      select vv.*
      from public.medication_versions vv
      where vv.medication_id = m.id
        and vv.effective_from <= effective_date + 1
      order by vv.effective_from desc, vv.created_at desc, vv.id desc
      limit 1
    ) v on true
    where m.household_id = hid
      and v.child_id = p_child_id
      and not v.archived
      and v.interrupted_at is null
      and v.valid_from <= effective_date + 1
      and (v.valid_until is null or v.valid_until >= effective_date + 1)
  ) then
    raise exception 'child_has_active_dependencies' using errcode = 'P0001';
  end if;

  perform set_config('combinado.child_maintenance_rpc', 'on', true);
  update public.children
  set archived_at = at_effective
  where id = child_row.id;

  return jsonb_build_object(
    'ok', true,
    'child_id', child_row.id,
    'archived', true,
    'effective_from', effective_date
  );
end;
$$;

create or replace function public.reactivate_child(
  p_child_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  at_effective timestamptz;
  effective_date date;
  child_row public.children%rowtype;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  at_effective := public.mutation_at(p_at);
  effective_date := public.local_date_in_household(at_effective) + 1;

  select c.* into child_row
  from public.children c
  where c.id = p_child_id and c.household_id = hid
  for update;
  if not found then
    raise exception 'child_not_found' using errcode = 'P0001';
  end if;
  if child_row.archived_at is null and child_row.active_from <= effective_date - 1 then
    return jsonb_build_object(
      'ok', true, 'child_id', child_row.id, 'archived', false, 'already', true,
      'effective_from', effective_date
    );
  end if;

  perform set_config('combinado.child_maintenance_rpc', 'on', true);
  update public.children
  set archived_at = null, active_from = effective_date
  where id = child_row.id;

  return jsonb_build_object(
    'ok', true,
    'child_id', child_row.id,
    'archived', false,
    'effective_from', effective_date
  );
end;
$$;

revoke all on function public.archive_child(uuid, timestamptz) from public;
revoke all on function public.reactivate_child(uuid, timestamptz) from public;
grant execute on function public.archive_child(uuid, timestamptz) to authenticated;
grant execute on function public.reactivate_child(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Routine catalog reactivation
-- ---------------------------------------------------------------------------

create or replace function public.restore_weekly_routine(
  p_routine_id uuid,
  p_expected_version_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  uid uuid := auth.uid();
  at_effective timestamptz;
  effective_date date;
  current_version public.weekly_routine_versions%rowtype;
  new_version_id uuid;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_routine_id::text, 0));
  select v.* into current_version
  from public.weekly_routine_versions v
  where v.routine_id = p_routine_id and v.household_id = hid
  order by v.effective_from desc, v.created_at desc, v.id desc
  limit 1;
  if current_version.id is null then
    raise exception 'routine_not_found' using errcode = 'P0001';
  end if;
  if current_version.id is distinct from p_expected_version_id then
    raise exception 'routine_version_conflict' using errcode = 'P0001';
  end if;
  if not current_version.archived then
    return jsonb_build_object(
      'ok', true, 'routine_id', p_routine_id, 'already', true,
      'effective_from', current_version.effective_from
    );
  end if;

  at_effective := public.mutation_at(p_at);
  effective_date := public.local_date_in_household(at_effective) + 1;
  if current_version.valid_until is not null
    and current_version.valid_until < effective_date then
    raise exception 'routine_not_active_tomorrow' using errcode = 'P0001';
  end if;

  insert into public.weekly_routine_versions (
    routine_id, household_id, title, target_kind, child_id, weekdays,
    scheduled_time, requires_confirmation, default_owner_user_id,
    valid_from, valid_until, effective_from, archived, created_by, created_at
  ) values (
    current_version.routine_id, current_version.household_id,
    current_version.title, current_version.target_kind, current_version.child_id,
    current_version.weekdays, current_version.scheduled_time,
    current_version.requires_confirmation, current_version.default_owner_user_id,
    current_version.valid_from, current_version.valid_until, effective_date,
    false, uid, clock_timestamp()
  ) returning id into new_version_id;

  return jsonb_build_object(
    'ok', true, 'routine_id', p_routine_id, 'version_id', new_version_id,
    'effective_from', effective_date
  );
end;
$$;

revoke all on function public.restore_weekly_routine(uuid, uuid, timestamptz) from public;
grant execute on function public.restore_weekly_routine(uuid, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Medication catalog: versioned edit, archive, and restore
-- ---------------------------------------------------------------------------

alter table public.medication_versions
  add column if not exists archived boolean not null default false;

create or replace function public.edit_medication(
  p_medication_id uuid,
  p_expected_version_id uuid,
  p_child_id uuid,
  p_name text,
  p_instruction text,
  p_slots text[],
  p_valid_from date,
  p_valid_until date,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  uid uuid := auth.uid();
  at_effective timestamptz;
  effective_date date;
  current_version public.medication_versions%rowtype;
  new_version_id uuid;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_medication_id::text, 0));

  select v.* into current_version
  from public.medication_versions v
  join public.medications m on m.id = v.medication_id
  where v.medication_id = p_medication_id and v.household_id = hid
  order by v.effective_from desc, v.created_at desc, v.id desc
  limit 1;
  if current_version.id is null then
    raise exception 'medication_not_found' using errcode = 'P0001';
  end if;
  if current_version.id is distinct from p_expected_version_id then
    raise exception 'medication_version_conflict' using errcode = 'P0001';
  end if;

  at_effective := public.mutation_at(p_at);
  effective_date := public.local_date_in_household(at_effective) + 1;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'name_required' using errcode = 'P0001';
  end if;
  if p_valid_from is null then
    raise exception 'valid_from_required' using errcode = 'P0001';
  end if;
  if p_valid_until is not null and p_valid_until < p_valid_from then
    raise exception 'invalid_valid_range' using errcode = 'P0001';
  end if;
  if p_valid_until is not null and p_valid_until < effective_date then
    raise exception 'medication_not_active_tomorrow' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.children c
    where c.id = p_child_id and c.household_id = hid
      and c.archived_at is null and c.active_from <= effective_date
  ) then
    raise exception 'child_not_in_household' using errcode = 'P0001';
  end if;

  insert into public.medication_versions (
    medication_id, household_id, child_id, name, instruction, slots,
    valid_from, valid_until, effective_from, interrupted_at, archived, created_at
  ) values (
    p_medication_id, hid, p_child_id, p_name, p_instruction, p_slots,
    p_valid_from, p_valid_until, effective_date, null, false, clock_timestamp()
  ) returning id into new_version_id;

  return jsonb_build_object(
    'ok', true, 'medication_id', p_medication_id, 'version_id', new_version_id,
    'effective_from', effective_date
  );
end;
$$;

create or replace function public.archive_medication(
  p_medication_id uuid,
  p_expected_version_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  uid uuid := auth.uid();
  at_effective timestamptz;
  effective_date date;
  current_version public.medication_versions%rowtype;
  new_version_id uuid;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_medication_id::text, 0));
  select v.* into current_version
  from public.medication_versions v
  where v.medication_id = p_medication_id and v.household_id = hid
  order by v.effective_from desc, v.created_at desc, v.id desc
  limit 1;
  if current_version.id is null then
    raise exception 'medication_not_found' using errcode = 'P0001';
  end if;
  if current_version.id is distinct from p_expected_version_id then
    raise exception 'medication_version_conflict' using errcode = 'P0001';
  end if;
  if current_version.archived then
    return jsonb_build_object(
      'ok', true, 'medication_id', p_medication_id, 'already', true,
      'effective_from', current_version.effective_from
    );
  end if;

  at_effective := public.mutation_at(p_at);
  effective_date := public.local_date_in_household(at_effective) + 1;
  insert into public.medication_versions (
    medication_id, household_id, child_id, name, instruction, slots,
    valid_from, valid_until, effective_from, interrupted_at, archived, created_at
  ) values (
    current_version.medication_id, current_version.household_id,
    current_version.child_id, current_version.name, current_version.instruction,
    current_version.slots, current_version.valid_from, current_version.valid_until,
    effective_date, current_version.interrupted_at, true, clock_timestamp()
  ) returning id into new_version_id;

  return jsonb_build_object(
    'ok', true, 'medication_id', p_medication_id, 'version_id', new_version_id,
    'effective_from', effective_date
  );
end;
$$;

create or replace function public.restore_medication(
  p_medication_id uuid,
  p_expected_version_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  uid uuid := auth.uid();
  at_effective timestamptz;
  effective_date date;
  current_version public.medication_versions%rowtype;
  new_version_id uuid;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_medication_id::text, 0));
  select v.* into current_version
  from public.medication_versions v
  where v.medication_id = p_medication_id and v.household_id = hid
  order by v.effective_from desc, v.created_at desc, v.id desc
  limit 1;
  if current_version.id is null then
    raise exception 'medication_not_found' using errcode = 'P0001';
  end if;
  if current_version.id is distinct from p_expected_version_id then
    raise exception 'medication_version_conflict' using errcode = 'P0001';
  end if;
  if not current_version.archived then
    return jsonb_build_object(
      'ok', true, 'medication_id', p_medication_id, 'already', true,
      'effective_from', current_version.effective_from
    );
  end if;

  at_effective := public.mutation_at(p_at);
  effective_date := public.local_date_in_household(at_effective) + 1;
  if current_version.valid_until is not null
    and current_version.valid_until < effective_date then
    raise exception 'medication_not_active_tomorrow' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.children c
    where c.id = current_version.child_id and c.household_id = hid
      and c.archived_at is null and c.active_from <= effective_date
  ) then
    raise exception 'child_not_in_household' using errcode = 'P0001';
  end if;

  insert into public.medication_versions (
    medication_id, household_id, child_id, name, instruction, slots,
    valid_from, valid_until, effective_from, interrupted_at, archived, created_at
  ) values (
    current_version.medication_id, current_version.household_id,
    current_version.child_id, current_version.name, current_version.instruction,
    current_version.slots, current_version.valid_from, current_version.valid_until,
    effective_date, null, false, clock_timestamp()
  ) returning id into new_version_id;

  return jsonb_build_object(
    'ok', true, 'medication_id', p_medication_id, 'version_id', new_version_id,
    'effective_from', effective_date
  );
end;
$$;

revoke all on function public.edit_medication(uuid, uuid, uuid, text, text, text[], date, date, timestamptz) from public;
revoke all on function public.archive_medication(uuid, uuid, timestamptz) from public;
revoke all on function public.restore_medication(uuid, uuid, timestamptz) from public;
grant execute on function public.edit_medication(uuid, uuid, uuid, text, text, text[], date, date, timestamptz) to authenticated;
grant execute on function public.archive_medication(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.restore_medication(uuid, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Derivation must respect child archival and next-day activation.
-- ---------------------------------------------------------------------------

create or replace function public.derive_routine_occurrences_for_day(
  p_household_id uuid,
  p_local_day date,
  p_now timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  local_hhmm text;
  is_today boolean;
  result jsonb := '[]'::jsonb;
begin
  local_hhmm := public.local_time_hhmm_in_household(p_now);
  is_today := public.local_date_in_household(p_now) = p_local_day;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', d.occ_key, 'source', 'routine', 'source_id', d.routine_id,
        'local_date', p_local_day, 'slot', null, 'title', d.title,
        'target_kind', d.target_kind, 'child_id', d.child_id,
        'target_label', d.target_label, 'scheduled_time', d.scheduled_time,
        'requires_confirmation', d.requires_confirmation,
        'owner_user_id', d.owner_user_id,
        'owner_display_name', d.owner_display_name, 'status', d.status,
        'needs_owner_alert', d.needs_owner_alert,
        'routine_version_id', d.routine_version_id,
        'routine_exception_version_id', d.routine_exception_version_id,
        'routine_exception_active', d.routine_exception_active,
        'routine_exception_time_overridden', d.routine_exception_time_overridden,
        'routine_exception_owner_overridden', d.routine_exception_owner_overridden
      )
      order by d.sort_group, d.scheduled_time nulls last, d.title, d.occ_key
    ), '[]'::jsonb
  ) into result
  from (
    select effective.routine_id, effective.title, effective.target_kind,
      effective.child_id, effective.target_label, effective.scheduled_time,
      effective.requires_confirmation, effective.owner_user_id,
      effective.owner_display_name, effective.occ_key, effective.cancelled,
      effective.routine_version_id, effective.routine_exception_version_id,
      effective.routine_exception_active, effective.routine_exception_time_overridden,
      effective.routine_exception_owner_overridden,
      case
        when effective.cancelled then 'cancelled'
        when not effective.requires_confirmation then 'scheduled'
        when effective.scheduled_time is not null and is_today
          and local_hhmm > effective.scheduled_time then 'late'
        else 'scheduled'
      end as status,
      (effective.requires_confirmation and not effective.cancelled
        and effective.owner_user_id is null) as needs_owner_alert,
      case
        when effective.cancelled then 5
        when effective.requires_confirmation and effective.scheduled_time is not null
          and is_today and local_hhmm > effective.scheduled_time then 2
        when effective.scheduled_time is not null then 3
        else 4
      end as sort_group
    from (
      select v.routine_id, v.title, v.target_kind, v.child_id,
        case when v.target_kind = 'casa' then public.casa_target_label() else c.name end as target_label,
        case when ex.id is not null and not ex.restored and ex.scheduled_time_overridden
          then ex.scheduled_time else v.scheduled_time end as scheduled_time,
        v.requires_confirmation,
        case when ex.id is not null and not ex.restored and ex.owner_overridden
          then ex.owner_user_id else v.default_owner_user_id end as owner_user_id,
        case when ex.id is not null and not ex.restored then ex.cancelled else false end as cancelled,
        m.display_name as owner_display_name,
        public.occurrence_key('routine', v.routine_id, p_local_day, null) as occ_key,
        v.id as routine_version_id, ex.id as routine_exception_version_id,
        (ex.id is not null and not ex.restored) as routine_exception_active,
        case when ex.id is not null and not ex.restored then ex.scheduled_time_overridden else false end as routine_exception_time_overridden,
        case when ex.id is not null and not ex.restored then ex.owner_overridden else false end as routine_exception_owner_overridden
      from public.weekly_routines r
      join lateral (
        select vv.* from public.weekly_routine_versions vv
        where vv.routine_id = r.id and vv.effective_from <= p_local_day
        order by vv.effective_from desc, vv.created_at desc, vv.id desc
        limit 1
      ) v on true
      left join lateral (
        select ee.* from public.weekly_routine_exceptions ee
        where ee.routine_id = r.id and ee.local_date = p_local_day
        order by ee.created_at desc, ee.id desc
        limit 1
      ) ex on true
      left join public.children c on c.id = v.child_id
      left join public.household_members m
        on m.household_id = r.household_id
       and m.user_id = case when ex.id is not null and not ex.restored
         and ex.owner_overridden then ex.owner_user_id else v.default_owner_user_id end
       and m.archived_at is null
      where r.household_id = p_household_id
        and not v.archived
        and v.valid_from <= p_local_day
        and (v.valid_until is null or v.valid_until >= p_local_day)
        and extract(dow from p_local_day)::smallint = any (v.weekdays)
        and (v.target_kind = 'casa'
          or (c.archived_at is null and c.active_from <= p_local_day))
    ) effective
  ) d;
  return result;
end;
$$;

create or replace function public.derive_medication_occurrences_for_day(
  p_household_id uuid,
  p_local_day date,
  p_now timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today_date date;
  local_hhmm text;
  is_today boolean;
  is_past boolean;
  result jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and not public.is_household_member(p_household_id) then
    return '[]'::jsonb;
  end if;
  today_date := public.local_date_in_household(p_now);
  local_hhmm := public.local_time_hhmm_in_household(p_now);
  is_today := today_date = p_local_day;
  is_past := p_local_day < today_date;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'key', d.occ_key, 'source', 'medication', 'source_id', d.medication_id,
      'local_date', p_local_day, 'slot', d.slot, 'title', d.name,
      'target_kind', 'child', 'child_id', d.child_id, 'target_label', d.child_name,
      'scheduled_time', d.slot, 'requires_confirmation', true,
      'owner_user_id', null, 'owner_display_name', null, 'status', d.status,
      'needs_owner_alert', false, 'instruction', d.instruction,
      'confirmation_id', d.confirmation_id, 'confirmed_at', d.confirmed_at,
      'confirmed_by_user_id', d.confirmed_by,
      'confirmed_by_display_name', d.confirmed_by_name
    ) order by d.slot, d.name, d.occ_key), '[]'::jsonb
  ) into result
  from (
    select m.id as medication_id, v.child_id, c.name as child_name, v.name,
      v.instruction, s.slot,
      public.occurrence_key('medication', m.id, p_local_day, s.slot) as occ_key,
      dc.id as confirmation_id, dc.confirmed_at, dc.confirmed_by,
      hm.display_name as confirmed_by_name,
      case
        when dc.id is not null then 'completed'
        when v.interrupted_at is not null
          and public.local_date_in_household(v.interrupted_at) = p_local_day
          and s.slot >= public.local_time_hhmm_in_household(v.interrupted_at) then 'cancelled'
        when is_past then 'unrecorded'
        when is_today and local_hhmm > s.slot then 'late'
        when is_today and local_hhmm = s.slot then 'pending'
        else 'scheduled'
      end as status
    from public.medications m
    join lateral (
      select vv.* from public.medication_versions vv
      where vv.medication_id = m.id and vv.effective_from <= p_local_day
      order by vv.effective_from desc, vv.created_at desc, vv.id desc
      limit 1
    ) v on true
    join public.children c on c.id = v.child_id
    cross join lateral unnest(v.slots) as s(slot)
    left join public.dose_confirmations dc
      on dc.medication_id = m.id and dc.local_date = p_local_day
     and dc.slot = s.slot and dc.reversed_at is null
    left join public.household_members hm
      on hm.household_id = m.household_id and hm.user_id = dc.confirmed_by
     and hm.archived_at is null
    where m.household_id = p_household_id and not v.archived
      and c.archived_at is null and c.active_from <= p_local_day
      and v.valid_from <= p_local_day
      and (v.valid_until is null or v.valid_until >= p_local_day)
      and not (p_local_day = v.valid_from
        and public.local_date_in_household(m.created_at) = p_local_day
        and s.slot <= public.local_time_hhmm_in_household(m.created_at))
  ) d;
  return result;
end;
$$;

grant execute on function public.derive_routine_occurrences_for_day(uuid, date, timestamptz) to authenticated;
grant execute on function public.derive_medication_occurrences_for_day(uuid, date, timestamptz) to authenticated;

-- Members can read the new child activation marker and medication archive state.
grant select on table public.children to authenticated;
grant select on table public.medication_versions to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.children;
  exception when undefined_object or duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.medication_versions;
  exception when undefined_object or duplicate_object then null;
  end;
end;
$$;
