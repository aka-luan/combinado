-- M2: versioned weekly routines + derived agenda snapshot (issue #5 / PRD §§5–8, 13).
-- Occurrences are never materialized; household_agenda_snapshot derives them.

create table if not exists public.weekly_routines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists weekly_routines_household_id_idx
  on public.weekly_routines (household_id);

create table if not exists public.weekly_routine_versions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.weekly_routines (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  target_kind text not null,
  child_id uuid references public.children (id),
  -- PostgreSQL DOW: 0=Sunday … 6=Saturday
  weekdays smallint[] not null,
  scheduled_time text,
  requires_confirmation boolean not null default true,
  default_owner_user_id uuid references auth.users (id),
  -- Inclusive calendar span for this version's config
  valid_from date not null,
  valid_until date,
  -- Version becomes active for dates >= effective_from
  effective_from date not null,
  created_at timestamptz not null default now(),
  constraint weekly_routine_versions_title_nonempty check (length(btrim(title)) > 0),
  constraint weekly_routine_versions_target_kind check (target_kind in ('casa', 'child')),
  constraint weekly_routine_versions_child_consistency check (
    (target_kind = 'casa' and child_id is null)
    or (target_kind = 'child' and child_id is not null)
  ),
  constraint weekly_routine_versions_weekdays_nonempty check (cardinality(weekdays) > 0),
  constraint weekly_routine_versions_time_format check (
    scheduled_time is null
    or scheduled_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  constraint weekly_routine_versions_informational_no_owner check (
    requires_confirmation or default_owner_user_id is null
  ),
  constraint weekly_routine_versions_valid_range check (
    valid_until is null or valid_until >= valid_from
  )
);

create index if not exists weekly_routine_versions_routine_id_idx
  on public.weekly_routine_versions (routine_id);

create index if not exists weekly_routine_versions_household_id_idx
  on public.weekly_routine_versions (household_id);

create index if not exists weekly_routine_versions_effective_from_idx
  on public.weekly_routine_versions (routine_id, effective_from desc);

-- ---------------------------------------------------------------------------
-- Time helpers (household timezone fixed: America/Sao_Paulo)
-- ---------------------------------------------------------------------------

create or replace function public.household_timezone()
returns text
language sql
immutable
as $$
  select 'America/Sao_Paulo'::text;
$$;

comment on function public.household_timezone() is
  'Fixed household timezone (PRD §6). Device timezone never applies.';

create or replace function public.local_date_in_household(at timestamptz)
returns date
language sql
stable
as $$
  select (at at time zone public.household_timezone())::date;
$$;

create or replace function public.local_time_hhmm_in_household(at timestamptz)
returns text
language sql
stable
as $$
  select to_char(at at time zone public.household_timezone(), 'HH24:MI');
$$;

create or replace function public.occurrence_key(
  source text,
  logical_id uuid,
  local_day date,
  slot text default null
)
returns text
language sql
immutable
as $$
  select case
    when slot is null or slot = '' then source || ':' || logical_id::text || ':' || local_day::text
    else source || ':' || logical_id::text || ':' || local_day::text || ':' || slot
  end;
$$;

-- ---------------------------------------------------------------------------
-- Seed a versioned weekly routine (Studio / service role; also used in tests)
-- ---------------------------------------------------------------------------

create or replace function public.seed_weekly_routine(
  p_household_id uuid,
  p_title text,
  p_target_kind text,
  p_child_id uuid,
  p_weekdays smallint[],
  p_scheduled_time text,
  p_requires_confirmation boolean,
  p_default_owner_user_id uuid,
  p_valid_from date,
  p_valid_until date,
  p_effective_from date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  title_norm text;
begin
  title_norm := nullif(btrim(p_title), '');
  if title_norm is null then
    raise exception 'title is required';
  end if;
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;
  if not exists (select 1 from public.households h where h.id = p_household_id) then
    raise exception 'household not found';
  end if;

  insert into public.weekly_routines (household_id)
  values (p_household_id)
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
    p_household_id,
    title_norm,
    p_target_kind,
    p_child_id,
    p_weekdays,
    nullif(p_scheduled_time, ''),
    coalesce(p_requires_confirmation, true),
    p_default_owner_user_id,
    p_valid_from,
    p_valid_until,
    p_effective_from
  );

  return rid;
end;
$$;

revoke all on function public.seed_weekly_routine(
  uuid, text, text, uuid, smallint[], text, boolean, uuid, date, date, date
) from public;
-- No grant to authenticated — seed from SQL Editor / tests / service role.

-- ---------------------------------------------------------------------------
-- Derive routine occurrences for one local calendar day
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
        'needs_owner_alert', d.needs_owner_alert
      )
      order by d.sort_group, d.scheduled_time nulls last, d.title, d.occ_key
    ),
    '[]'::jsonb
  )
  into result
  from (
    select
      v.routine_id,
      v.title,
      v.target_kind,
      v.child_id,
      case
        when v.target_kind = 'casa' then public.casa_target_label()
        else c.name
      end as target_label,
      v.scheduled_time,
      v.requires_confirmation,
      v.default_owner_user_id as owner_user_id,
      m.display_name as owner_display_name,
      public.occurrence_key('routine', v.routine_id, p_local_day, null) as occ_key,
      case
        when not v.requires_confirmation then 'scheduled'
        when v.scheduled_time is not null
          and is_today
          and local_hhmm > v.scheduled_time then 'late'
        else 'scheduled'
      end as status,
      (v.requires_confirmation and v.default_owner_user_id is null) as needs_owner_alert,
      -- PRD §7.1 groups (doses=1 unused in M2; completed=5 unused in M2)
      case
        when v.requires_confirmation
          and v.scheduled_time is not null
          and is_today
          and local_hhmm > v.scheduled_time then 2
        when v.scheduled_time is not null then 3
        else 4
      end as sort_group
    from public.weekly_routines r
    join lateral (
      select vv.*
      from public.weekly_routine_versions vv
      where vv.routine_id = r.id
        and vv.effective_from <= p_local_day
      order by vv.effective_from desc, vv.created_at desc
      limit 1
    ) v on true
    left join public.children c on c.id = v.child_id
    left join public.household_members m
      on m.household_id = r.household_id
     and m.user_id = v.default_owner_user_id
     and m.archived_at is null
    where r.household_id = p_household_id
      and v.valid_from <= p_local_day
      and (v.valid_until is null or v.valid_until >= p_local_day)
      and (extract(dow from p_local_day)::smallint = any (v.weekdays))
  ) d;

  return result;
end;
$$;

revoke all on function public.derive_routine_occurrences_for_day(uuid, date, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- Authoritative household agenda snapshot
-- ---------------------------------------------------------------------------

create or replace function public.household_agenda_snapshot(
  at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hid uuid;
  tz text := public.household_timezone();
  today_date date;
  tomorrow_date date;
  local_hhmm text;
  today_occs jsonb;
  tomorrow_occs jsonb;
  tomorrow_count int;
  reveal boolean;
  version_hash text;
  payload jsonb;
begin
  hid := public.current_household_id();
  if hid is null then
    return null;
  end if;

  today_date := public.local_date_in_household(at);
  tomorrow_date := today_date + 1;
  local_hhmm := public.local_time_hhmm_in_household(at);
  reveal := local_hhmm >= '19:00';

  today_occs := public.derive_routine_occurrences_for_day(hid, today_date, at);
  tomorrow_occs := public.derive_routine_occurrences_for_day(hid, tomorrow_date, at);
  tomorrow_count := jsonb_array_length(tomorrow_occs);

  version_hash := md5(
    coalesce(today_occs::text, '') || '|' || coalesce(tomorrow_occs::text, '')
  );

  payload := jsonb_build_object(
    'server_time', at,
    'timezone', tz,
    'version', version_hash,
    'today', jsonb_build_object(
      'local_date', today_date,
      'occurrences', today_occs,
      'empty_message', case
        when jsonb_array_length(today_occs) = 0 then 'Nada combinado para hoje'
        else null
      end
    ),
    'tomorrow', jsonb_build_object(
      'local_date', tomorrow_date,
      'reveal', reveal,
      'count', tomorrow_count,
      'occurrences', tomorrow_occs,
      'empty_message', case
        when reveal and tomorrow_count = 0 then 'Nada combinado para amanhã'
        else null
      end
    )
  );

  return payload;
end;
$$;

revoke all on function public.household_agenda_snapshot(timestamptz) from public;
grant execute on function public.household_agenda_snapshot(timestamptz) to authenticated;

grant execute on function public.household_timezone() to authenticated;
grant execute on function public.local_date_in_household(timestamptz) to authenticated;
grant execute on function public.occurrence_key(text, uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: members read routines; writes via seed/service role only (M5 adds writes)
-- ---------------------------------------------------------------------------

alter table public.weekly_routines enable row level security;
alter table public.weekly_routine_versions enable row level security;

drop policy if exists "Members select weekly_routines" on public.weekly_routines;
create policy "Members select weekly_routines"
  on public.weekly_routines
  for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "Members select weekly_routine_versions" on public.weekly_routine_versions;
create policy "Members select weekly_routine_versions"
  on public.weekly_routine_versions
  for select
  to authenticated
  using (public.is_household_member(household_id));

grant select on table public.weekly_routines to authenticated;
grant select on table public.weekly_routine_versions to authenticated;
