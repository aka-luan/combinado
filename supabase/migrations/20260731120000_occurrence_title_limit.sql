-- Issue #12 / PRD §7.1: occurrence titles capped at 120 characters.
alter table public.weekly_routine_versions
  drop constraint if exists weekly_routine_versions_title_length;

alter table public.weekly_routine_versions
  add constraint weekly_routine_versions_title_length
  check (char_length(title) <= 120);

create or replace function public.create_weekly_routine(
  p_title text,
  p_target_kind text,
  p_child_id uuid,
  p_weekdays smallint[],
  p_scheduled_time text,
  p_requires_confirmation boolean,
  p_default_owner_user_id uuid,
  p_valid_from date,
  p_valid_until date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  rid uuid;
  title_norm text;
  time_norm text;
  requires_conf boolean;
  owner_id uuid;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  title_norm := nullif(btrim(p_title), '');
  if title_norm is null then
    raise exception 'title_required' using errcode = 'P0001';
  end if;
  if char_length(title_norm) > 120 then
    raise exception 'title_too_long' using errcode = 'P0001';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from_required' using errcode = 'P0001';
  end if;

  if p_weekdays is null or cardinality(p_weekdays) = 0 then
    raise exception 'weekdays_required' using errcode = 'P0001';
  end if;

  if p_target_kind is distinct from 'casa' and p_target_kind is distinct from 'child' then
    raise exception 'invalid_target_kind' using errcode = 'P0001';
  end if;

  if p_target_kind = 'casa' then
    if p_child_id is not null then
      raise exception 'casa_target_has_child' using errcode = 'P0001';
    end if;
  else
    if p_child_id is null then
      raise exception 'child_required' using errcode = 'P0001';
    end if;
    if not exists (
      select 1
      from public.children c
      where c.id = p_child_id
        and c.household_id = hid
        and c.archived_at is null
    ) then
      raise exception 'child_not_in_household' using errcode = 'P0001';
    end if;
  end if;

  requires_conf := coalesce(p_requires_confirmation, true);
  owner_id := p_default_owner_user_id;

  if not requires_conf and owner_id is not null then
    raise exception 'informational_no_owner' using errcode = 'P0001';
  end if;

  if owner_id is not null and not exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = owner_id
      and m.archived_at is null
  ) then
    raise exception 'owner_not_in_household' using errcode = 'P0001';
  end if;

  time_norm := nullif(btrim(coalesce(p_scheduled_time, '')), '');

  insert into public.weekly_routines (household_id)
  values (hid)
  returning id into rid;

  insert into public.weekly_routine_versions (
    routine_id,
    household_id,
    title,
    target_kind,
    child_id,
    weekdays,
    scheduled_time,
    requires_confirmation,
    default_owner_user_id,
    valid_from,
    valid_until,
    effective_from
  ) values (
    rid,
    hid,
    title_norm,
    p_target_kind,
    p_child_id,
    p_weekdays,
    time_norm,
    requires_conf,
    owner_id,
    p_valid_from,
    p_valid_until,
    p_valid_from
  );

  return rid;
end;
$$;

revoke all on function public.create_weekly_routine(
  text, text, uuid, smallint[], text, boolean, uuid, date, date
) from public;
grant execute on function public.create_weekly_routine(
  text, text, uuid, smallint[], text, boolean, uuid, date, date
) to authenticated;

create or replace function public.edit_weekly_routine(
  p_routine_id uuid,
  p_expected_version_id uuid,
  p_title text,
  p_target_kind text,
  p_child_id uuid,
  p_weekdays smallint[],
  p_scheduled_time text,
  p_requires_confirmation boolean,
  p_default_owner_user_id uuid,
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
  today_date date;
  effective_date date;
  current_version public.weekly_routine_versions%rowtype;
  title_norm text;
  time_norm text;
  requires_conf boolean;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_routine_id::text, 0));

  select v.* into current_version
  from public.weekly_routine_versions v
  join public.weekly_routines r on r.id = v.routine_id
  where v.routine_id = p_routine_id
    and v.household_id = hid
  order by v.effective_from desc, v.created_at desc, v.id desc
  limit 1;

  if current_version.id is null then
    raise exception 'routine_not_found' using errcode = 'P0001';
  end if;
  if current_version.id is distinct from p_expected_version_id then
    raise exception 'routine_version_conflict' using errcode = 'P0001';
  end if;
  if current_version.archived then
    raise exception 'routine_archived' using errcode = 'P0001';
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);
  effective_date := today_date + 1;

  title_norm := nullif(btrim(p_title), '');
  if title_norm is null then
    raise exception 'title_required' using errcode = 'P0001';
  end if;
  if char_length(title_norm) > 120 then
    raise exception 'title_too_long' using errcode = 'P0001';
  end if;
  if p_target_kind is distinct from 'casa' and p_target_kind is distinct from 'child' then
    raise exception 'invalid_target_kind' using errcode = 'P0001';
  end if;
  if p_target_kind = 'casa' and p_child_id is not null then
    raise exception 'casa_target_has_child' using errcode = 'P0001';
  end if;
  if p_target_kind = 'child' then
    if p_child_id is null then
      raise exception 'child_required' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.children c
      where c.id = p_child_id
        and c.household_id = hid
        and c.archived_at is null
    ) then
      raise exception 'child_not_in_household' using errcode = 'P0001';
    end if;
  end if;
  if p_weekdays is null or cardinality(p_weekdays) = 0 then
    raise exception 'weekdays_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_weekdays) day_value where day_value < 0 or day_value > 6) then
    raise exception 'invalid_weekday' using errcode = 'P0001';
  end if;
  time_norm := nullif(btrim(coalesce(p_scheduled_time, '')), '');
  if time_norm is not null and time_norm !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'invalid_time' using errcode = 'P0001';
  end if;
  if p_valid_from is null then
    raise exception 'valid_from_required' using errcode = 'P0001';
  end if;
  if p_valid_until is not null and p_valid_until < p_valid_from then
    raise exception 'invalid_valid_range' using errcode = 'P0001';
  end if;
  if p_valid_until is not null and p_valid_until < effective_date then
    raise exception 'routine_not_active_tomorrow' using errcode = 'P0001';
  end if;

  requires_conf := coalesce(p_requires_confirmation, true);
  if not requires_conf and p_default_owner_user_id is not null then
    raise exception 'informational_no_owner' using errcode = 'P0001';
  end if;
  if p_default_owner_user_id is not null and not exists (
    select 1 from public.household_members m
    where m.household_id = hid
      and m.user_id = p_default_owner_user_id
      and m.archived_at is null
  ) then
    raise exception 'owner_not_in_household' using errcode = 'P0001';
  end if;

  insert into public.weekly_routine_versions (
    routine_id, household_id, title, target_kind, child_id, weekdays,
    scheduled_time, requires_confirmation, default_owner_user_id,
    valid_from, valid_until, effective_from, archived, created_by, created_at
  ) values (
    p_routine_id, hid, title_norm, p_target_kind, p_child_id, p_weekdays,
    time_norm, requires_conf, p_default_owner_user_id,
    p_valid_from, p_valid_until, effective_date, false, uid, clock_timestamp()
  ) returning id into current_version.id;

  return jsonb_build_object(
    'ok', true,
    'routine_id', p_routine_id,
    'version_id', current_version.id,
    'effective_from', effective_date
  );
end;
$$;

revoke all on function public.edit_weekly_routine(
  uuid, uuid, text, text, uuid, smallint[], text, boolean, uuid, date, date, timestamptz
) from public;
grant execute on function public.edit_weekly_routine(
  uuid, uuid, text, text, uuid, smallint[], text, boolean, uuid, date, date, timestamptz
) to authenticated;
