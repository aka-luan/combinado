-- M6: edit/archive weekly routines and apply audited Today/Tomorrow exceptions
-- (issue #9 / PRD §§8.5–8.6).
-- Every change is append-only: historical routine versions and exception events
-- are never rewritten.

alter table public.weekly_routine_versions
  add column if not exists archived boolean not null default false;

alter table public.weekly_routine_versions
  add column if not exists created_by uuid references auth.users (id);

create table if not exists public.weekly_routine_exceptions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.weekly_routines (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  local_date date not null,
  cancelled boolean not null default false,
  scheduled_time text,
  scheduled_time_overridden boolean not null default false,
  owner_user_id uuid references auth.users (id),
  owner_overridden boolean not null default false,
  restored boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint weekly_routine_exceptions_time_format check (
    scheduled_time is null
    or scheduled_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  constraint weekly_routine_exceptions_time_state check (
    scheduled_time_overridden or scheduled_time is null
  ),
  constraint weekly_routine_exceptions_owner_state check (
    owner_overridden or owner_user_id is null
  ),
  constraint weekly_routine_exceptions_restore_state check (
    not restored
    or (not cancelled and not scheduled_time_overridden and not owner_overridden)
  )
);

create index if not exists weekly_routine_exceptions_lookup_idx
  on public.weekly_routine_exceptions (routine_id, local_date, created_at desc);

create or replace function public.weekly_routine_exception_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'weekly_routine_exception_immutable' using errcode = 'P0001';
end;
$$;

drop trigger if exists weekly_routine_exception_immutable_trg
  on public.weekly_routine_exceptions;
create trigger weekly_routine_exception_immutable_trg
before update or delete on public.weekly_routine_exceptions
for each row execute function public.weekly_routine_exception_immutable();

-- ---------------------------------------------------------------------------
-- Versioned routine edits and archival
-- ---------------------------------------------------------------------------

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

create or replace function public.archive_weekly_routine(
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
  if current_version.archived then
    return jsonb_build_object('ok', true, 'routine_id', p_routine_id, 'already', true);
  end if;

  at_effective := public.mutation_at(p_at);
  effective_date := public.local_date_in_household(at_effective) + 1;

  insert into public.weekly_routine_versions (
    routine_id, household_id, title, target_kind, child_id, weekdays,
    scheduled_time, requires_confirmation, default_owner_user_id,
    valid_from, valid_until, effective_from, archived, created_by, created_at
  ) values (
    current_version.routine_id, hid, current_version.title, current_version.target_kind,
    current_version.child_id, current_version.weekdays, current_version.scheduled_time,
    current_version.requires_confirmation, current_version.default_owner_user_id,
    current_version.valid_from, current_version.valid_until, effective_date, true, uid, clock_timestamp()
  ) returning id into new_version_id;

  return jsonb_build_object(
    'ok', true,
    'routine_id', p_routine_id,
    'version_id', new_version_id,
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

revoke all on function public.archive_weekly_routine(uuid, uuid, timestamptz) from public;
grant execute on function public.archive_weekly_routine(uuid, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Day-specific exception events
-- ---------------------------------------------------------------------------

create or replace function public.apply_weekly_routine_exception(
  p_routine_id uuid,
  p_local_date date,
  p_cancelled boolean,
  p_scheduled_time text,
  p_scheduled_time_overridden boolean,
  p_owner_user_id uuid,
  p_owner_overridden boolean,
  p_expected_exception_id uuid,
  p_restore boolean,
  p_at timestamptz
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
  latest_exception public.weekly_routine_exceptions%rowtype;
  base_version public.weekly_routine_versions%rowtype;
  exception_id uuid;
  actual_time text;
  actual_time_overridden boolean;
  actual_owner uuid;
  actual_owner_overridden boolean;
  active_cancelled boolean;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);
  if p_local_date is null or p_local_date not in (today_date, today_date + 1) then
    raise exception 'exception_date_out_of_range' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_routine_id::text || ':' || p_local_date::text, 0)
  );

  select v.* into base_version
  from public.weekly_routine_versions v
  where v.routine_id = p_routine_id
    and v.household_id = hid
    and v.effective_from <= p_local_date
  order by v.effective_from desc, v.created_at desc, v.id desc
  limit 1;
  if base_version.id is null then
    raise exception 'routine_not_found' using errcode = 'P0001';
  end if;
  if base_version.archived then
    raise exception 'routine_archived' using errcode = 'P0001';
  end if;
  if base_version.valid_from > p_local_date
     or (base_version.valid_until is not null and base_version.valid_until < p_local_date)
     or not (extract(dow from p_local_date)::smallint = any (base_version.weekdays)) then
    raise exception 'routine_not_scheduled' using errcode = 'P0001';
  end if;

  select e.* into latest_exception
  from public.weekly_routine_exceptions e
  where e.routine_id = p_routine_id
    and e.household_id = hid
    and e.local_date = p_local_date
  order by e.created_at desc, e.id desc
  limit 1;
  if latest_exception.id is distinct from p_expected_exception_id then
    raise exception 'routine_exception_conflict' using errcode = 'P0001';
  end if;

  if p_restore then
    active_cancelled := false;
    actual_time := null;
    actual_time_overridden := false;
    actual_owner := null;
    actual_owner_overridden := false;
  else
    active_cancelled := coalesce(p_cancelled, false);
    actual_time_overridden := coalesce(p_scheduled_time_overridden, false);
    actual_time := case when actual_time_overridden then nullif(btrim(coalesce(p_scheduled_time, '')), '') else null end;
    if actual_time_overridden and actual_time is not null
       and actual_time !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'invalid_time' using errcode = 'P0001';
    end if;
    actual_owner_overridden := coalesce(p_owner_overridden, false);
    actual_owner := case when actual_owner_overridden then p_owner_user_id else null end;
  end if;

  if not base_version.requires_confirmation and actual_owner_overridden then
    raise exception 'informational_no_owner' using errcode = 'P0001';
  end if;
  if actual_owner is not null and not exists (
    select 1 from public.household_members m
    where m.household_id = hid
      and m.user_id = actual_owner
      and m.archived_at is null
  ) then
    raise exception 'owner_not_in_household' using errcode = 'P0001';
  end if;

  insert into public.weekly_routine_exceptions (
    routine_id, household_id, local_date, cancelled, scheduled_time,
    scheduled_time_overridden, owner_user_id, owner_overridden, restored,
    created_by, created_at
  ) values (
    p_routine_id, hid, p_local_date, active_cancelled, actual_time,
    actual_time_overridden, actual_owner, actual_owner_overridden, p_restore,
    uid, at_effective
  ) returning id into exception_id;

  return jsonb_build_object(
    'ok', true,
    'exception_id', exception_id,
    'routine_id', p_routine_id,
    'local_date', p_local_date,
    'restored', p_restore,
    'cancelled', active_cancelled
  );
end;
$$;

create or replace function public.save_weekly_routine_exception(
  p_routine_id uuid,
  p_local_date date,
  p_cancelled boolean,
  p_scheduled_time text,
  p_scheduled_time_overridden boolean,
  p_owner_user_id uuid,
  p_owner_overridden boolean,
  p_expected_exception_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.apply_weekly_routine_exception(
    p_routine_id, p_local_date, p_cancelled, p_scheduled_time,
    p_scheduled_time_overridden, p_owner_user_id, p_owner_overridden,
    p_expected_exception_id, false, p_at
  );
$$;

create or replace function public.restore_weekly_routine_exception(
  p_routine_id uuid,
  p_local_date date,
  p_expected_exception_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.apply_weekly_routine_exception(
    p_routine_id, p_local_date, false, null, false, null, false,
    p_expected_exception_id, true, p_at
  );
$$;

revoke all on function public.apply_weekly_routine_exception(
  uuid, date, boolean, text, boolean, uuid, boolean, uuid, boolean, timestamptz
) from public;
revoke all on function public.save_weekly_routine_exception(
  uuid, date, boolean, text, boolean, uuid, boolean, uuid, timestamptz
) from public;
grant execute on function public.save_weekly_routine_exception(
  uuid, date, boolean, text, boolean, uuid, boolean, uuid, timestamptz
) to authenticated;
revoke all on function public.restore_weekly_routine_exception(uuid, date, uuid, timestamptz) from public;
grant execute on function public.restore_weekly_routine_exception(uuid, date, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Derivation: the latest exception for routine+date overlays the base version
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
        'key', d.occ_key,
        'source', 'routine',
        'source_id', d.routine_id,
        'local_date', p_local_day,
        'slot', null,
        'title', d.title,
        'target_kind', d.target_kind,
        'child_id', d.child_id,
        'target_label', d.target_label,
        'scheduled_time', d.scheduled_time,
        'requires_confirmation', d.requires_confirmation,
        'owner_user_id', d.owner_user_id,
        'owner_display_name', d.owner_display_name,
        'status', d.status,
        'needs_owner_alert', d.needs_owner_alert,
        'routine_version_id', d.routine_version_id,
        'routine_exception_version_id', d.routine_exception_version_id,
        'routine_exception_active', d.routine_exception_active,
        'routine_exception_time_overridden', d.routine_exception_time_overridden,
        'routine_exception_owner_overridden', d.routine_exception_owner_overridden
      )
      order by d.sort_group, d.scheduled_time nulls last, d.title, d.occ_key
    ),
    '[]'::jsonb
  )
  into result
  from (
    select
      effective.routine_id,
      effective.title,
      effective.target_kind,
      effective.child_id,
      effective.target_label,
      effective.scheduled_time,
      effective.requires_confirmation,
      effective.owner_user_id,
      effective.owner_display_name,
      effective.occ_key,
      effective.cancelled,
      effective.routine_version_id,
      effective.routine_exception_version_id,
      effective.routine_exception_active,
      effective.routine_exception_time_overridden,
      effective.routine_exception_owner_overridden,
      case
        when effective.cancelled then 'cancelled'
        when not effective.requires_confirmation then 'scheduled'
        when effective.scheduled_time is not null
          and is_today and local_hhmm > effective.scheduled_time then 'late'
        else 'scheduled'
      end as status,
      (
        effective.requires_confirmation
        and not effective.cancelled
        and effective.owner_user_id is null
      ) as needs_owner_alert,
      case
        when effective.cancelled then 5
        when effective.requires_confirmation
          and effective.scheduled_time is not null
          and is_today
          and local_hhmm > effective.scheduled_time then 2
        when effective.scheduled_time is not null then 3
        else 4
      end as sort_group
    from (
      select
        v.routine_id,
        v.title,
        v.target_kind,
        v.child_id,
        case when v.target_kind = 'casa' then public.casa_target_label() else c.name end as target_label,
        case when ex.id is not null and not ex.restored and ex.scheduled_time_overridden
          then ex.scheduled_time else v.scheduled_time end as scheduled_time,
        v.requires_confirmation,
        case when ex.id is not null and not ex.restored and ex.owner_overridden
          then ex.owner_user_id else v.default_owner_user_id end as owner_user_id,
        case when ex.id is not null and not ex.restored then ex.cancelled else false end as cancelled,
        m.display_name as owner_display_name,
        public.occurrence_key('routine', v.routine_id, p_local_day, null) as occ_key,
        v.id as routine_version_id,
        ex.id as routine_exception_version_id,
        (ex.id is not null and not ex.restored) as routine_exception_active,
        case when ex.id is not null and not ex.restored then ex.scheduled_time_overridden else false end as routine_exception_time_overridden,
        case when ex.id is not null and not ex.restored then ex.owner_overridden else false end as routine_exception_owner_overridden
      from public.weekly_routines r
      join lateral (
        select vv.*
        from public.weekly_routine_versions vv
        where vv.routine_id = r.id
          and vv.effective_from <= p_local_day
        order by vv.effective_from desc, vv.created_at desc, vv.id desc
        limit 1
      ) v on true
      left join lateral (
        select ee.*
        from public.weekly_routine_exceptions ee
        where ee.routine_id = r.id
          and ee.local_date = p_local_day
        order by ee.created_at desc, ee.id desc
        limit 1
      ) ex on true
      left join public.children c on c.id = v.child_id
      left join public.household_members m
        on m.household_id = r.household_id
       and m.user_id = case
         when ex.id is not null and not ex.restored and ex.owner_overridden then ex.owner_user_id
         else v.default_owner_user_id
       end
       and m.archived_at is null
      where r.household_id = p_household_id
        and not v.archived
        and v.valid_from <= p_local_day
        and (v.valid_until is null or v.valid_until >= p_local_day)
        and extract(dow from p_local_day)::smallint = any (v.weekdays)
    ) effective
  ) d;

  return result;
end;
$$;

-- Members can inspect immutable planning history; all writes remain RPC-only.
alter table public.weekly_routine_exceptions enable row level security;
drop policy if exists "Members select weekly_routine_exceptions" on public.weekly_routine_exceptions;
create policy "Members select weekly_routine_exceptions"
  on public.weekly_routine_exceptions
  for select to authenticated
  using (public.is_household_member(household_id));

grant select on table public.weekly_routine_exceptions to authenticated;
grant execute on function public.derive_routine_occurrences_for_day(uuid, date, timestamptz) to authenticated;

-- Invalidate Hoje/Amanhã when either the default or a day-specific plan changes.
do $$
begin
  begin
    alter publication supabase_realtime add table public.weekly_routine_versions;
  exception when undefined_object or duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.weekly_routine_exceptions;
  exception when undefined_object or duplicate_object then null;
  end;
end;
$$;
