-- M3: scheduled medications, dose derivation, confirmation, reverse, interrupt (issue #6 / PRD §9).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists medications_household_id_idx
  on public.medications (household_id);

create table if not exists public.medication_versions (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  child_id uuid not null references public.children (id),
  name text not null,
  instruction text,
  slots text[] not null,
  valid_from date not null,
  valid_until date,
  effective_from date not null,
  -- When set, remaining unconfirmed same-day slots become cancelled-by-change.
  interrupted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint medication_versions_name_nonempty check (length(btrim(name)) > 0),
  constraint medication_versions_slots_nonempty check (cardinality(slots) > 0),
  constraint medication_versions_valid_range check (
    valid_until is null or valid_until >= valid_from
  )
);

create index if not exists medication_versions_medication_id_idx
  on public.medication_versions (medication_id);

create index if not exists medication_versions_household_id_idx
  on public.medication_versions (household_id);

create index if not exists medication_versions_effective_from_idx
  on public.medication_versions (medication_id, effective_from desc);

create or replace function public.medication_versions_validate_slots()
returns trigger
language plpgsql
as $$
declare
  slot text;
  distinct_count int;
begin
  new.name := nullif(btrim(new.name), '');
  if new.name is null then
    raise exception 'name_required' using errcode = 'P0001';
  end if;

  if new.instruction is not null then
    new.instruction := nullif(btrim(new.instruction), '');
  end if;

  if new.slots is null or cardinality(new.slots) = 0 then
    raise exception 'slots_required' using errcode = 'P0001';
  end if;

  foreach slot in array new.slots loop
    if slot is null or slot !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'invalid_slot' using errcode = 'P0001';
    end if;
  end loop;

  select count(distinct s) into distinct_count from unnest(new.slots) as s;
  if distinct_count <> cardinality(new.slots) then
    raise exception 'duplicate_slots' using errcode = 'P0001';
  end if;

  -- Stable order for display and deterministic keys
  new.slots := (
    select array_agg(s order by s)
    from unnest(new.slots) as s
  );

  return new;
end;
$$;

drop trigger if exists medication_versions_validate_slots_trg on public.medication_versions;
create trigger medication_versions_validate_slots_trg
  before insert or update of name, instruction, slots
  on public.medication_versions
  for each row
  execute function public.medication_versions_validate_slots();

-- Active confirmation: at most one per scheduled-dose key (medication + date + slot).
create table if not exists public.dose_confirmations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  local_date date not null,
  slot text not null,
  occurrence_key text not null,
  confirmed_by uuid not null references auth.users (id),
  confirmed_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users (id),
  constraint dose_confirmations_slot_format check (
    slot ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  constraint dose_confirmations_reverse_consistency check (
    (reversed_at is null and reversed_by is null)
    or (reversed_at is not null and reversed_by is not null)
  )
);

create unique index if not exists dose_confirmations_active_uidx
  on public.dose_confirmations (medication_id, local_date, slot)
  where reversed_at is null;

create index if not exists dose_confirmations_household_id_idx
  on public.dose_confirmations (household_id);

create index if not exists dose_confirmations_occurrence_key_idx
  on public.dose_confirmations (occurrence_key);

create index if not exists dose_confirmations_medication_day_idx
  on public.dose_confirmations (medication_id, local_date);

-- ---------------------------------------------------------------------------
-- Seed (tests / service role) + authenticated create
-- ---------------------------------------------------------------------------

create or replace function public.seed_medication(
  p_household_id uuid,
  p_child_id uuid,
  p_name text,
  p_instruction text,
  p_slots text[],
  p_valid_from date,
  p_valid_until date,
  p_effective_from date,
  p_created_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;
  if not exists (select 1 from public.households h where h.id = p_household_id) then
    raise exception 'household not found';
  end if;
  if p_child_id is null then
    raise exception 'child_required';
  end if;
  if not exists (
    select 1 from public.children c
    where c.id = p_child_id and c.household_id = p_household_id
  ) then
    raise exception 'child_not_in_household';
  end if;
  if p_valid_from is null or p_effective_from is null then
    raise exception 'dates_required';
  end if;

  insert into public.medications (household_id, created_at)
  values (p_household_id, coalesce(p_created_at, now()))
  returning id into mid;

  insert into public.medication_versions (
    medication_id,
    household_id,
    child_id,
    name,
    instruction,
    slots,
    valid_from,
    valid_until,
    effective_from
  ) values (
    mid,
    p_household_id,
    p_child_id,
    p_name,
    p_instruction,
    p_slots,
    p_valid_from,
    p_valid_until,
    p_effective_from
  );

  return mid;
end;
$$;

revoke all on function public.seed_medication(
  uuid, uuid, text, text, text[], date, date, date, timestamptz
) from public;

create or replace function public.create_medication(
  p_child_id uuid,
  p_name text,
  p_instruction text,
  p_slots text[],
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
  mid uuid;
  name_norm text;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  name_norm := nullif(btrim(coalesce(p_name, '')), '');
  if name_norm is null then
    raise exception 'name_required' using errcode = 'P0001';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from_required' using errcode = 'P0001';
  end if;

  if p_valid_until is not null and p_valid_until < p_valid_from then
    raise exception 'invalid_valid_range' using errcode = 'P0001';
  end if;

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

  if p_slots is null or cardinality(p_slots) = 0 then
    raise exception 'slots_required' using errcode = 'P0001';
  end if;

  insert into public.medications (household_id)
  values (hid)
  returning id into mid;

  insert into public.medication_versions (
    medication_id,
    household_id,
    child_id,
    name,
    instruction,
    slots,
    valid_from,
    valid_until,
    effective_from
  ) values (
    mid,
    hid,
    p_child_id,
    name_norm,
    p_instruction,
    p_slots,
    p_valid_from,
    p_valid_until,
    p_valid_from
  );

  return mid;
end;
$$;

comment on function public.create_medication(uuid, text, text, text[], date, date) is
  'Authenticated Adult creates a medication + first version in their Casa (issue #6).';

revoke all on function public.create_medication(uuid, text, text, text[], date, date) from public;
grant execute on function public.create_medication(uuid, text, text, text[], date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Mutation clock: authenticated callers cannot spoof p_at (backfill / early bypass).
-- SQL tests enable override: set_config('combinado.allow_clock_override', 'on', true)
-- ---------------------------------------------------------------------------

create or replace function public.mutation_at(p_at timestamptz default null)
returns timestamptz
language plpgsql
stable
as $$
begin
  if current_setting('combinado.allow_clock_override', true) = 'on' then
    return coalesce(p_at, now());
  end if;
  return now();
end;
$$;

revoke all on function public.mutation_at(timestamptz) from public;

-- ---------------------------------------------------------------------------
-- Immediate interruption (cancel remaining same-day doses)
-- ---------------------------------------------------------------------------

create or replace function public.interrupt_medication_immediate(
  p_medication_id uuid,
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
  today_date date;
  ver public.medication_versions%rowtype;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.medications m
    where m.id = p_medication_id and m.household_id = hid
  ) then
    raise exception 'medication_not_found' using errcode = 'P0001';
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);

  select vv.* into ver
  from public.medication_versions vv
  where vv.medication_id = p_medication_id
    and vv.effective_from <= today_date
  order by vv.effective_from desc, vv.created_at desc
  limit 1;

  if not found then
    raise exception 'medication_version_missing' using errcode = 'P0001';
  end if;

  if ver.interrupted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'medication_id', p_medication_id,
      'interrupted_at', ver.interrupted_at,
      'already', true
    );
  end if;

  -- Close treatment on the interrupt day; remaining slots derive as cancelled.
  update public.medication_versions
  set
    interrupted_at = at_effective,
    valid_until = case
      when valid_until is null or valid_until > today_date then today_date
      else valid_until
    end
  where id = ver.id;

  return jsonb_build_object(
    'ok', true,
    'medication_id', p_medication_id,
    'interrupted_at', at_effective,
    'already', false
  );
end;
$$;

revoke all on function public.interrupt_medication_immediate(uuid, timestamptz) from public;
grant execute on function public.interrupt_medication_immediate(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Confirm / reverse dose
-- ---------------------------------------------------------------------------

create or replace function public.confirm_dose(
  p_medication_id uuid,
  p_local_date date,
  p_slot text,
  p_acknowledge_early boolean default false,
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
  local_hhmm text;
  slot_norm text;
  occ_key text;
  ver public.medication_versions%rowtype;
  creation_day date;
  creation_hhmm text;
  minutes_until int;
  existing public.dose_confirmations%rowtype;
  confirmer_name text;
  new_id uuid;
  conf_at timestamptz;
begin
  hid := public.current_household_id();
  if hid is null or uid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  slot_norm := nullif(btrim(coalesce(p_slot, '')), '');
  if slot_norm is null or slot_norm !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'invalid_slot' using errcode = 'P0001';
  end if;

  if p_local_date is null then
    raise exception 'local_date_required' using errcode = 'P0001';
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);
  local_hhmm := public.local_time_hhmm_in_household(at_effective);

  -- v1: no backfill after midnight / past days; no tomorrow confirmation.
  if p_local_date <> today_date then
    return jsonb_build_object('ok', false, 'code', 'not_confirmable_day');
  end if;

  if not exists (
    select 1 from public.medications m
    where m.id = p_medication_id and m.household_id = hid
  ) then
    raise exception 'medication_not_found' using errcode = 'P0001';
  end if;

  select vv.* into ver
  from public.medication_versions vv
  where vv.medication_id = p_medication_id
    and vv.effective_from <= p_local_date
  order by vv.effective_from desc, vv.created_at desc
  limit 1;

  if not found
    or ver.valid_from > p_local_date
    or (ver.valid_until is not null and ver.valid_until < p_local_date)
    or not (slot_norm = any (ver.slots))
  then
    return jsonb_build_object('ok', false, 'code', 'dose_not_scheduled');
  end if;

  -- First-day filter: past slots at creation never become confirmable.
  select public.local_date_in_household(m.created_at),
         public.local_time_hhmm_in_household(m.created_at)
    into creation_day, creation_hhmm
  from public.medications m
  where m.id = p_medication_id;

  if p_local_date = ver.valid_from
    and p_local_date = creation_day
    and slot_norm <= creation_hhmm
  then
    return jsonb_build_object('ok', false, 'code', 'dose_not_scheduled');
  end if;

  -- Interrupted: remaining slots not confirmable.
  if ver.interrupted_at is not null
    and public.local_date_in_household(ver.interrupted_at) = p_local_date
    and slot_norm >= public.local_time_hhmm_in_household(ver.interrupted_at)
  then
    return jsonb_build_object('ok', false, 'code', 'cancelled_by_change');
  end if;

  -- Early confirmation (>30 minutes before slot) needs explicit ack.
  minutes_until := (
    (split_part(slot_norm, ':', 1)::int * 60 + split_part(slot_norm, ':', 2)::int)
    - (split_part(local_hhmm, ':', 1)::int * 60 + split_part(local_hhmm, ':', 2)::int)
  );
  if minutes_until > 30 and not coalesce(p_acknowledge_early, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'early_confirmation_required',
      'minutes_until', minutes_until
    );
  end if;

  occ_key := public.occurrence_key('medication', p_medication_id, p_local_date, slot_norm);

  select dc.* into existing
  from public.dose_confirmations dc
  where dc.medication_id = p_medication_id
    and dc.local_date = p_local_date
    and dc.slot = slot_norm
    and dc.reversed_at is null;

  if found then
    select m.display_name into confirmer_name
    from public.household_members m
    where m.household_id = hid and m.user_id = existing.confirmed_by;

    return jsonb_build_object(
      'ok', false,
      'code', 'already_confirmed',
      'confirmation_id', existing.id,
      'confirmed_at', existing.confirmed_at,
      'confirmed_by_user_id', existing.confirmed_by,
      'confirmed_by_display_name', confirmer_name
    );
  end if;

  begin
    insert into public.dose_confirmations (
      household_id,
      medication_id,
      local_date,
      slot,
      occurrence_key,
      confirmed_by,
      confirmed_at
    ) values (
      hid,
      p_medication_id,
      p_local_date,
      slot_norm,
      occ_key,
      uid,
      at_effective
    )
    returning id, confirmed_at into new_id, conf_at;
  exception
    when unique_violation then
      select dc.* into existing
      from public.dose_confirmations dc
      where dc.medication_id = p_medication_id
        and dc.local_date = p_local_date
        and dc.slot = slot_norm
        and dc.reversed_at is null;

      select m.display_name into confirmer_name
      from public.household_members m
      where m.household_id = hid and m.user_id = existing.confirmed_by;

      return jsonb_build_object(
        'ok', false,
        'code', 'already_confirmed',
        'confirmation_id', existing.id,
        'confirmed_at', existing.confirmed_at,
        'confirmed_by_user_id', existing.confirmed_by,
        'confirmed_by_display_name', confirmer_name
      );
  end;

  select m.display_name into confirmer_name
  from public.household_members m
  where m.household_id = hid and m.user_id = uid;

  return jsonb_build_object(
    'ok', true,
    'confirmation_id', new_id,
    'confirmed_at', conf_at,
    'confirmed_by_user_id', uid,
    'confirmed_by_display_name', confirmer_name,
    'occurrence_key', occ_key
  );
end;
$$;

revoke all on function public.confirm_dose(uuid, date, text, boolean, timestamptz) from public;
grant execute on function public.confirm_dose(uuid, date, text, boolean, timestamptz) to authenticated;

create or replace function public.reverse_dose_confirmation(
  p_confirmation_id uuid,
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
  conf public.dose_confirmations%rowtype;
begin
  hid := public.current_household_id();
  if hid is null or uid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  select dc.* into conf
  from public.dose_confirmations dc
  where dc.id = p_confirmation_id
    and dc.household_id = hid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'confirmation_not_found');
  end if;

  if conf.reversed_at is not null then
    return jsonb_build_object('ok', false, 'code', 'already_reversed');
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);
  -- Correction allowed until end of the local day of the dose (and undo within that day).
  if conf.local_date <> today_date then
    return jsonb_build_object('ok', false, 'code', 'correction_window_closed');
  end if;

  update public.dose_confirmations
  set reversed_at = at_effective, reversed_by = uid
  where id = conf.id;

  return jsonb_build_object(
    'ok', true,
    'confirmation_id', conf.id,
    'reversed_at', at_effective,
    'reversed_by', uid,
    'original_confirmed_by', conf.confirmed_by,
    'original_confirmed_at', conf.confirmed_at
  );
end;
$$;

revoke all on function public.reverse_dose_confirmation(uuid, timestamptz) from public;
grant execute on function public.reverse_dose_confirmation(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Derive medication dose occurrences for one local day
-- ---------------------------------------------------------------------------

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
  -- When called by an authenticated Adult, only their Casa is readable.
  if auth.uid() is not null
    and not public.is_household_member(p_household_id)
  then
    return '[]'::jsonb;
  end if;

  today_date := public.local_date_in_household(p_now);
  local_hhmm := public.local_time_hhmm_in_household(p_now);
  is_today := today_date = p_local_day;
  is_past := p_local_day < today_date;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', d.occ_key,
        'source', 'medication',
        'source_id', d.medication_id,
        'local_date', p_local_day,
        'slot', d.slot,
        'title', d.name,
        'target_kind', 'child',
        'child_id', d.child_id,
        'target_label', d.child_name,
        'scheduled_time', d.slot,
        'requires_confirmation', true,
        'owner_user_id', null,
        'owner_display_name', null,
        'status', d.status,
        'needs_owner_alert', false,
        'instruction', d.instruction,
        'confirmation_id', d.confirmation_id,
        'confirmed_at', d.confirmed_at,
        'confirmed_by_user_id', d.confirmed_by,
        'confirmed_by_display_name', d.confirmed_by_name
      )
      order by d.slot, d.name, d.occ_key
    ),
    '[]'::jsonb
  )
  into result
  from (
    select
      m.id as medication_id,
      v.child_id,
      c.name as child_name,
      v.name,
      v.instruction,
      s.slot,
      public.occurrence_key('medication', m.id, p_local_day, s.slot) as occ_key,
      dc.id as confirmation_id,
      dc.confirmed_at,
      dc.confirmed_by,
      hm.display_name as confirmed_by_name,
      case
        when dc.id is not null then 'completed'
        when v.interrupted_at is not null
          and public.local_date_in_household(v.interrupted_at) = p_local_day
          and s.slot >= public.local_time_hhmm_in_household(v.interrupted_at)
          then 'cancelled'
        when is_past then 'unrecorded'
        when is_today and local_hhmm > s.slot then 'late'
        when is_today and local_hhmm = s.slot then 'pending'
        else 'scheduled'
      end as status
    from public.medications m
    join lateral (
      select vv.*
      from public.medication_versions vv
      where vv.medication_id = m.id
        and vv.effective_from <= p_local_day
      order by vv.effective_from desc, vv.created_at desc
      limit 1
    ) v on true
    join public.children c on c.id = v.child_id
    cross join lateral unnest(v.slots) as s(slot)
    left join public.dose_confirmations dc
      on dc.medication_id = m.id
     and dc.local_date = p_local_day
     and dc.slot = s.slot
     and dc.reversed_at is null
    left join public.household_members hm
      on hm.household_id = m.household_id
     and hm.user_id = dc.confirmed_by
     and hm.archived_at is null
    where m.household_id = p_household_id
      and v.valid_from <= p_local_day
      and (v.valid_until is null or v.valid_until >= p_local_day)
      and (
        -- First day: only slots after creation moment when created that same day
        not (
          p_local_day = v.valid_from
          and public.local_date_in_household(m.created_at) = p_local_day
          and s.slot <= public.local_time_hhmm_in_household(m.created_at)
        )
      )
  ) d;

  return result;
end;
$$;

revoke all on function public.derive_medication_occurrences_for_day(uuid, date, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- Merge routine + medication arrays with PRD §7.1 sort groups
-- ---------------------------------------------------------------------------

create or replace function public.merge_day_occurrences(
  p_routines jsonb,
  p_medications jsonb
)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      occ.item - 'sort_group'
      order by occ.sort_group, occ.scheduled_time nulls last, occ.title, occ.occ_key
    ),
    '[]'::jsonb
  )
  from (
    select
      elem as item,
      elem->>'key' as occ_key,
      elem->>'title' as title,
      elem->>'scheduled_time' as scheduled_time,
      case
        when elem->>'source' = 'medication'
          and elem->>'status' in ('scheduled', 'pending', 'late') then 1
        when elem->>'status' = 'late' then 2
        when elem->>'scheduled_time' is not null
          and elem->>'status' not in ('completed', 'cancelled', 'unrecorded') then 3
        when elem->>'status' in ('completed', 'cancelled', 'unrecorded') then 5
        else 4
      end as sort_group
    from jsonb_array_elements(coalesce(p_routines, '[]'::jsonb)) as elem
    union all
    select
      elem as item,
      elem->>'key' as occ_key,
      elem->>'title' as title,
      elem->>'scheduled_time' as scheduled_time,
      case
        when elem->>'source' = 'medication'
          and elem->>'status' in ('scheduled', 'pending', 'late') then 1
        when elem->>'status' = 'late' then 2
        when elem->>'scheduled_time' is not null
          and elem->>'status' not in ('completed', 'cancelled', 'unrecorded') then 3
        when elem->>'status' in ('completed', 'cancelled', 'unrecorded') then 5
        else 4
      end as sort_group
    from jsonb_array_elements(coalesce(p_medications, '[]'::jsonb)) as elem
  ) occ;
$$;

revoke all on function public.merge_day_occurrences(jsonb, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Replace household_agenda_snapshot to include medication doses
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
  today_routines jsonb;
  today_meds jsonb;
  tomorrow_routines jsonb;
  tomorrow_meds jsonb;
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

  today_routines := public.derive_routine_occurrences_for_day(hid, today_date, at);
  today_meds := public.derive_medication_occurrences_for_day(hid, today_date, at);
  today_occs := public.merge_day_occurrences(today_routines, today_meds);

  tomorrow_routines := public.derive_routine_occurrences_for_day(hid, tomorrow_date, at);
  tomorrow_meds := public.derive_medication_occurrences_for_day(hid, tomorrow_date, at);
  tomorrow_occs := public.merge_day_occurrences(tomorrow_routines, tomorrow_meds);
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.medications enable row level security;
alter table public.medication_versions enable row level security;
alter table public.dose_confirmations enable row level security;

drop policy if exists "Members select medications" on public.medications;
create policy "Members select medications"
  on public.medications
  for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "Members select medication_versions" on public.medication_versions;
create policy "Members select medication_versions"
  on public.medication_versions
  for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "Members select dose_confirmations" on public.dose_confirmations;
create policy "Members select dose_confirmations"
  on public.dose_confirmations
  for select
  to authenticated
  using (public.is_household_member(household_id));

grant select on table public.medications to authenticated;
grant select on table public.medication_versions to authenticated;
grant select on table public.dose_confirmations to authenticated;

-- Realtime: invalidate client snapshot on dose/medication writes (PRD §§9.3, 13).
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.dose_confirmations';
  exception
    when undefined_object then null; -- local stub / non-Supabase
    when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.medication_versions';
  exception
    when undefined_object then null;
    when duplicate_object then null;
  end;
end;
$$;
