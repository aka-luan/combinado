-- M5: one-off family commitments, completion/correction, cancellation, and audit (issue #8 / PRD §8.7).

-- ---------------------------------------------------------------------------
-- One-off commitments and immutable audit
-- ---------------------------------------------------------------------------

create table if not exists public.one_off_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  target_kind text not null,
  child_id uuid references public.children (id),
  local_date date not null,
  scheduled_time text,
  requires_confirmation boolean not null default true,
  responsible_user_id uuid references auth.users (id),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id),
  constraint one_off_events_title_nonempty check (length(btrim(title)) > 0),
  constraint one_off_events_title_length check (char_length(title) <= 120),
  constraint one_off_events_target_kind check (target_kind in ('casa', 'child')),
  constraint one_off_events_child_consistency check (
    (target_kind = 'casa' and child_id is null)
    or (target_kind = 'child' and child_id is not null)
  ),
  constraint one_off_events_time_format check (
    scheduled_time is null
    or scheduled_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  constraint one_off_events_informational_no_responsible check (
    requires_confirmation or responsible_user_id is null
  ),
  constraint one_off_events_cancel_consistency check (
    (cancelled_at is null and cancelled_by is null)
    or (cancelled_at is not null and cancelled_by is not null)
  )
);

create index if not exists one_off_events_household_day_idx
  on public.one_off_events (household_id, local_date);

create table if not exists public.event_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  event_id uuid not null references public.one_off_events (id) on delete cascade,
  occurrence_key text not null,
  confirmed_by uuid not null references auth.users (id),
  confirmed_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users (id),
  constraint event_completions_reverse_consistency check (
    (reversed_at is null and reversed_by is null)
    or (reversed_at is not null and reversed_by is not null)
  )
);

create unique index if not exists event_completions_active_uidx
  on public.event_completions (event_id)
  where reversed_at is null;

create index if not exists event_completions_household_idx
  on public.event_completions (household_id);

create table if not exists public.event_audit (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  event_id uuid not null references public.one_off_events (id) on delete cascade,
  action text not null,
  actor_user_id uuid not null references auth.users (id),
  occurred_at timestamptz not null default now(),
  completion_id uuid references public.event_completions (id),
  details jsonb not null default '{}'::jsonb,
  constraint event_audit_action check (
    action in ('created', 'completed', 'completion_reversed', 'cancelled')
  )
);

create index if not exists event_audit_event_idx
  on public.event_audit (event_id, occurred_at);

create or replace function public.event_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'event_audit_immutable' using errcode = 'P0001';
end;
$$;

drop trigger if exists event_audit_immutable_trg on public.event_audit;
create trigger event_audit_immutable_trg
before update or delete on public.event_audit
for each row execute function public.event_audit_immutable();

-- ---------------------------------------------------------------------------
-- Authenticated mutations
-- ---------------------------------------------------------------------------

create or replace function public.create_one_off_event(
  p_title text,
  p_target_kind text,
  p_child_id uuid,
  p_local_date date,
  p_scheduled_time text,
  p_requires_confirmation boolean,
  p_responsible_user_id uuid,
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
  title_norm text;
  time_norm text;
  requires_conf boolean;
  event_id uuid;
begin
  hid := public.current_household_id();
  if hid is null or uid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  title_norm := nullif(btrim(coalesce(p_title, '')), '');
  if title_norm is null then
    raise exception 'title_required' using errcode = 'P0001';
  end if;
  if char_length(title_norm) > 120 then
    raise exception 'title_too_long' using errcode = 'P0001';
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);
  if p_local_date is null then
    raise exception 'date_required' using errcode = 'P0001';
  end if;
  if p_local_date < today_date then
    raise exception 'date_in_past' using errcode = 'P0001';
  end if;

  if p_target_kind is distinct from 'casa' and p_target_kind is distinct from 'child' then
    raise exception 'invalid_target_kind' using errcode = 'P0001';
  end if;
  if p_target_kind = 'casa' and p_child_id is not null then
    raise exception 'casa_target_has_child' using errcode = 'P0001';
  end if;
  if p_target_kind = 'child' and p_child_id is null then
    raise exception 'child_required' using errcode = 'P0001';
  end if;
  if p_target_kind = 'child' and not exists (
    select 1 from public.children c
    where c.id = p_child_id
      and c.household_id = hid
      and c.archived_at is null
  ) then
    raise exception 'child_not_in_household' using errcode = 'P0001';
  end if;

  time_norm := nullif(btrim(coalesce(p_scheduled_time, '')), '');
  if time_norm is not null
     and time_norm !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  then
    raise exception 'invalid_time' using errcode = 'P0001';
  end if;

  requires_conf := coalesce(p_requires_confirmation, true);
  if not requires_conf and p_responsible_user_id is not null then
    raise exception 'informational_no_responsible' using errcode = 'P0001';
  end if;
  if p_responsible_user_id is not null and not exists (
    select 1 from public.household_members m
    where m.household_id = hid
      and m.user_id = p_responsible_user_id
      and m.archived_at is null
  ) then
    raise exception 'responsible_not_in_household' using errcode = 'P0001';
  end if;

  insert into public.one_off_events (
    household_id, title, target_kind, child_id, local_date, scheduled_time,
    requires_confirmation, responsible_user_id, created_by, created_at
  ) values (
    hid, title_norm, p_target_kind, p_child_id, p_local_date, time_norm,
    requires_conf, p_responsible_user_id, uid, at_effective
  ) returning id into event_id;

  insert into public.event_audit (
    household_id, event_id, action, actor_user_id, occurred_at, details
  ) values (
    hid, event_id, 'created', uid, at_effective,
    jsonb_build_object(
      'title', title_norm,
      'target_kind', p_target_kind,
      'child_id', p_child_id,
      'local_date', p_local_date,
      'scheduled_time', time_norm,
      'requires_confirmation', requires_conf,
      'responsible_user_id', p_responsible_user_id
    )
  );

  return jsonb_build_object('ok', true, 'event_id', event_id);
end;
$$;

revoke all on function public.create_one_off_event(
  text, text, uuid, date, text, boolean, uuid, timestamptz
) from public;
grant execute on function public.create_one_off_event(
  text, text, uuid, date, text, boolean, uuid, timestamptz
) to authenticated;

create or replace function public.complete_one_off_event(
  p_event_id uuid,
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
  event_row public.one_off_events%rowtype;
  existing public.event_completions%rowtype;
  completion_id uuid;
  completion_at timestamptz;
  confirmer_name text;
  occ_key text;
begin
  hid := public.current_household_id();
  if hid is null or uid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);

  select e.* into event_row
  from public.one_off_events e
  where e.id = p_event_id and e.household_id = hid
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'event_not_found');
  end if;
  if event_row.local_date <> today_date then
    return jsonb_build_object('ok', false, 'code', 'not_confirmable_day');
  end if;
  if not event_row.requires_confirmation then
    return jsonb_build_object('ok', false, 'code', 'not_confirmable');
  end if;
  if event_row.cancelled_at is not null then
    return jsonb_build_object('ok', false, 'code', 'cancelled');
  end if;

  select c.* into existing
  from public.event_completions c
  where c.event_id = event_row.id and c.reversed_at is null;
  if found then
    select m.display_name into confirmer_name
    from public.household_members m
    where m.household_id = hid and m.user_id = existing.confirmed_by;
    return jsonb_build_object(
      'ok', false,
      'code', 'already_completed',
      'confirmation_id', existing.id,
      'confirmed_at', existing.confirmed_at,
      'confirmed_by_user_id', existing.confirmed_by,
      'confirmed_by_display_name', confirmer_name
    );
  end if;

  occ_key := public.occurrence_key('event', event_row.id, event_row.local_date, null);
  begin
    insert into public.event_completions (
      household_id, event_id, occurrence_key, confirmed_by, confirmed_at
    ) values (
      hid, event_row.id, occ_key, uid, at_effective
    ) returning id, confirmed_at into completion_id, completion_at;
  exception
    when unique_violation then
      select c.* into existing
      from public.event_completions c
      where c.event_id = event_row.id and c.reversed_at is null;
      select m.display_name into confirmer_name
      from public.household_members m
      where m.household_id = hid and m.user_id = existing.confirmed_by;
      return jsonb_build_object(
        'ok', false,
        'code', 'already_completed',
        'confirmation_id', existing.id,
        'confirmed_at', existing.confirmed_at,
        'confirmed_by_user_id', existing.confirmed_by,
        'confirmed_by_display_name', confirmer_name
      );
  end;

  insert into public.event_audit (
    household_id, event_id, action, actor_user_id, occurred_at, completion_id
  ) values (hid, event_row.id, 'completed', uid, at_effective, completion_id);

  select m.display_name into confirmer_name
  from public.household_members m
  where m.household_id = hid and m.user_id = uid;

  return jsonb_build_object(
    'ok', true,
    'confirmation_id', completion_id,
    'confirmed_at', completion_at,
    'confirmed_by_user_id', uid,
    'confirmed_by_display_name', confirmer_name,
    'occurrence_key', occ_key
  );
end;
$$;

revoke all on function public.complete_one_off_event(uuid, timestamptz) from public;
grant execute on function public.complete_one_off_event(uuid, timestamptz) to authenticated;

create or replace function public.reverse_event_completion(
  p_completion_id uuid,
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
  completion public.event_completions%rowtype;
  event_day date;
begin
  hid := public.current_household_id();
  if hid is null or uid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  select c.* into completion
  from public.event_completions c
  join public.one_off_events e on e.id = c.event_id
  where c.id = p_completion_id and c.household_id = hid
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'confirmation_not_found');
  end if;
  if completion.reversed_at is not null then
    return jsonb_build_object('ok', false, 'code', 'already_reversed');
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);
  select e.local_date into event_day
  from public.one_off_events e where e.id = completion.event_id;
  if event_day <> today_date then
    return jsonb_build_object('ok', false, 'code', 'correction_window_closed');
  end if;

  update public.event_completions
  set reversed_at = at_effective, reversed_by = uid
  where id = completion.id;

  insert into public.event_audit (
    household_id, event_id, action, actor_user_id, occurred_at, completion_id,
    details
  ) values (
    hid, completion.event_id, 'completion_reversed', uid, at_effective, completion.id,
    jsonb_build_object(
      'original_confirmed_by', completion.confirmed_by,
      'original_confirmed_at', completion.confirmed_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'confirmation_id', completion.id,
    'reversed_at', at_effective,
    'reversed_by', uid,
    'original_confirmed_by', completion.confirmed_by,
    'original_confirmed_at', completion.confirmed_at
  );
end;
$$;

revoke all on function public.reverse_event_completion(uuid, timestamptz) from public;
grant execute on function public.reverse_event_completion(uuid, timestamptz) to authenticated;

create or replace function public.cancel_one_off_event(
  p_event_id uuid,
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
  event_row public.one_off_events%rowtype;
begin
  hid := public.current_household_id();
  if hid is null or uid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  select e.* into event_row
  from public.one_off_events e
  where e.id = p_event_id and e.household_id = hid
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'event_not_found');
  end if;
  if event_row.cancelled_at is not null then
    return jsonb_build_object('ok', true, 'event_id', event_row.id, 'already', true);
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);
  if event_row.local_date < today_date then
    return jsonb_build_object('ok', false, 'code', 'cancellation_window_closed');
  end if;
  if exists (
    select 1 from public.event_completions c
    where c.event_id = event_row.id and c.reversed_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_completed');
  end if;

  update public.one_off_events
  set cancelled_at = at_effective, cancelled_by = uid
  where id = event_row.id;

  insert into public.event_audit (
    household_id, event_id, action, actor_user_id, occurred_at, details
  ) values (
    hid, event_row.id, 'cancelled', uid, at_effective,
    jsonb_build_object('cancelled_at', at_effective)
  );

  return jsonb_build_object(
    'ok', true, 'event_id', event_row.id, 'cancelled_at', at_effective
  );
end;
$$;

revoke all on function public.cancel_one_off_event(uuid, timestamptz) from public;
grant execute on function public.cancel_one_off_event(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Derive events and merge them into the authoritative snapshot
-- ---------------------------------------------------------------------------

create or replace function public.derive_one_off_event_occurrences_for_day(
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
  result jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and not public.is_household_member(p_household_id) then
    return '[]'::jsonb;
  end if;

  today_date := public.local_date_in_household(p_now);
  local_hhmm := public.local_time_hhmm_in_household(p_now);
  is_today := today_date = p_local_day;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', d.occ_key,
        'source', 'event',
        'source_id', d.event_id,
        'local_date', p_local_day,
        'slot', null,
        'title', d.title,
        'target_kind', d.target_kind,
        'child_id', d.child_id,
        'target_label', d.target_label,
        'scheduled_time', d.scheduled_time,
        'requires_confirmation', d.requires_confirmation,
        'owner_user_id', d.responsible_user_id,
        'owner_display_name', d.responsible_display_name,
        'status', d.status,
        'needs_owner_alert', d.needs_owner_alert,
        'confirmation_id', d.confirmation_id,
        'confirmed_at', d.confirmed_at,
        'confirmed_by_user_id', d.confirmed_by,
        'confirmed_by_display_name', d.confirmed_by_name
      )
      order by d.sort_group, d.scheduled_time nulls last, d.title, d.occ_key
    ),
    '[]'::jsonb
  ) into result
  from (
    select
      e.id as event_id,
      e.title,
      e.target_kind,
      e.child_id,
      case when e.target_kind = 'casa' then public.casa_target_label() else c.name end as target_label,
      e.scheduled_time,
      e.requires_confirmation,
      e.responsible_user_id,
      responsible.display_name as responsible_display_name,
      public.occurrence_key('event', e.id, e.local_date, null) as occ_key,
      comp.id as confirmation_id,
      comp.confirmed_at,
      comp.confirmed_by,
      confirmer.display_name as confirmed_by_name,
      case
        when comp.id is not null then 'completed'
        when e.cancelled_at is not null then 'cancelled'
        when e.requires_confirmation
          and e.scheduled_time is not null
          and is_today
          and local_hhmm > e.scheduled_time then 'late'
        else 'scheduled'
      end as status,
      (e.requires_confirmation and e.responsible_user_id is null and e.cancelled_at is null) as needs_owner_alert,
      case
        when comp.id is not null or e.cancelled_at is not null then 5
        when e.requires_confirmation and e.scheduled_time is not null and is_today and local_hhmm > e.scheduled_time then 2
        when e.scheduled_time is not null then 3
        else 4
      end as sort_group
    from public.one_off_events e
    left join public.children c on c.id = e.child_id
    left join public.household_members responsible
      on responsible.household_id = e.household_id
     and responsible.user_id = e.responsible_user_id
     and responsible.archived_at is null
    left join public.event_completions comp
      on comp.event_id = e.id and comp.reversed_at is null
    left join public.household_members confirmer
      on confirmer.household_id = e.household_id
     and confirmer.user_id = comp.confirmed_by
     and confirmer.archived_at is null
    where e.household_id = p_household_id
      and e.local_date = p_local_day
  ) d;

  return result;
end;
$$;

revoke all on function public.derive_one_off_event_occurrences_for_day(uuid, date, timestamptz) from public;
grant execute on function public.derive_one_off_event_occurrences_for_day(uuid, date, timestamptz) to authenticated;

create or replace function public.merge_day_occurrences(
  p_routines jsonb,
  p_medications jsonb,
  p_events jsonb
)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      occ.item
      order by occ.sort_group, occ.scheduled_time nulls last, occ.title, occ.occ_key
    ),
    '[]'::jsonb
  )
  from (
    select elem as item, elem->>'key' as occ_key, elem->>'title' as title,
      elem->>'scheduled_time' as scheduled_time,
      case
        when elem->>'source' = 'medication' and elem->>'status' in ('scheduled', 'pending', 'late') then 1
        when elem->>'status' = 'late' then 2
        when elem->>'scheduled_time' is not null and elem->>'status' not in ('completed', 'cancelled', 'unrecorded') then 3
        when elem->>'status' in ('completed', 'cancelled', 'unrecorded') then 5
        else 4
      end as sort_group
    from jsonb_array_elements(coalesce(p_routines, '[]'::jsonb)) elem
    union all
    select elem as item, elem->>'key', elem->>'title', elem->>'scheduled_time',
      case
        when elem->>'source' = 'medication' and elem->>'status' in ('scheduled', 'pending', 'late') then 1
        when elem->>'status' = 'late' then 2
        when elem->>'scheduled_time' is not null and elem->>'status' not in ('completed', 'cancelled', 'unrecorded') then 3
        when elem->>'status' in ('completed', 'cancelled', 'unrecorded') then 5
        else 4
      end
    from jsonb_array_elements(coalesce(p_medications, '[]'::jsonb)) elem
    union all
    select elem as item, elem->>'key', elem->>'title', elem->>'scheduled_time',
      case
        when elem->>'status' = 'late' then 2
        when elem->>'scheduled_time' is not null and elem->>'status' not in ('completed', 'cancelled') then 3
        when elem->>'status' in ('completed', 'cancelled') then 5
        else 4
      end
    from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) elem
  ) occ;
$$;

revoke all on function public.merge_day_occurrences(jsonb, jsonb, jsonb) from public;

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
  today_events jsonb;
  tomorrow_routines jsonb;
  tomorrow_meds jsonb;
  tomorrow_events jsonb;
  today_occs jsonb;
  tomorrow_occs jsonb;
  tomorrow_count int;
  reveal boolean;
  version_hash text;
begin
  hid := public.current_household_id();
  if hid is null then return null; end if;

  today_date := public.local_date_in_household(at);
  tomorrow_date := today_date + 1;
  local_hhmm := public.local_time_hhmm_in_household(at);
  reveal := local_hhmm >= '19:00';

  today_routines := public.derive_routine_occurrences_for_day(hid, today_date, at);
  today_meds := public.derive_medication_occurrences_for_day(hid, today_date, at);
  today_events := public.derive_one_off_event_occurrences_for_day(hid, today_date, at);
  today_occs := public.merge_day_occurrences(today_routines, today_meds, today_events);

  tomorrow_routines := public.derive_routine_occurrences_for_day(hid, tomorrow_date, at);
  tomorrow_meds := public.derive_medication_occurrences_for_day(hid, tomorrow_date, at);
  tomorrow_events := public.derive_one_off_event_occurrences_for_day(hid, tomorrow_date, at);
  tomorrow_occs := public.merge_day_occurrences(tomorrow_routines, tomorrow_meds, tomorrow_events);
  select count(*) into tomorrow_count
  from jsonb_array_elements(tomorrow_occs) item
  where item->>'status' <> 'cancelled';

  version_hash := md5(coalesce(today_occs::text, '') || '|' || coalesce(tomorrow_occs::text, ''));
  return jsonb_build_object(
    'server_time', at,
    'timezone', tz,
    'version', version_hash,
    'today', jsonb_build_object(
      'local_date', today_date,
      'occurrences', today_occs,
      'empty_message', case when jsonb_array_length(today_occs) = 0 then 'Nada combinado para hoje' else null end
    ),
    'tomorrow', jsonb_build_object(
      'local_date', tomorrow_date,
      'reveal', reveal,
      'count', tomorrow_count,
      'occurrences', tomorrow_occs,
      'empty_message', case when reveal and jsonb_array_length(tomorrow_occs) = 0 then 'Nada combinado para amanhã' else null end
    )
  );
end;
$$;

revoke all on function public.household_agenda_snapshot(timestamptz) from public;
grant execute on function public.household_agenda_snapshot(timestamptz) to authenticated;

-- Members read shared event state; all writes go through the security-definer RPCs.
alter table public.one_off_events enable row level security;
alter table public.event_completions enable row level security;
alter table public.event_audit enable row level security;

drop policy if exists "Members select one_off_events" on public.one_off_events;
create policy "Members select one_off_events"
  on public.one_off_events for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "Members select event_completions" on public.event_completions;
create policy "Members select event_completions"
  on public.event_completions for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "Members select event_audit" on public.event_audit;
create policy "Members select event_audit"
  on public.event_audit for select to authenticated
  using (public.is_household_member(household_id));

grant select on table public.one_off_events to authenticated;
grant select on table public.event_completions to authenticated;
grant select on table public.event_audit to authenticated;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.one_off_events';
  exception when undefined_object or duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.event_completions';
  exception when undefined_object or duplicate_object then null;
  end;
end;
$$;
