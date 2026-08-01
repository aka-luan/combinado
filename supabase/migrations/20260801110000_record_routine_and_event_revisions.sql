-- Issue #55: complete confirmable Rotinas and revise future Eventos without
-- losing the planning or Registro history.

-- ---------------------------------------------------------------------------
-- Future Evento planning revisions
-- ---------------------------------------------------------------------------

create table if not exists public.one_off_event_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.one_off_events (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  revision_number integer not null,
  title text not null,
  target_kind text not null,
  child_id uuid references public.children (id),
  local_date date not null,
  scheduled_time text,
  requires_confirmation boolean not null,
  responsible_user_id uuid references auth.users (id),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint one_off_event_revisions_number_positive check (revision_number > 0),
  constraint one_off_event_revisions_title_nonempty check (length(btrim(title)) > 0),
  constraint one_off_event_revisions_title_length check (char_length(title) <= 120),
  constraint one_off_event_revisions_target_kind check (target_kind in ('casa', 'child')),
  constraint one_off_event_revisions_child_consistency check (
    (target_kind = 'casa' and child_id is null)
    or (target_kind = 'child' and child_id is not null)
  ),
  constraint one_off_event_revisions_time_format check (
    scheduled_time is null
    or scheduled_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  constraint one_off_event_revisions_informational_no_responsible check (
    requires_confirmation or responsible_user_id is null
  ),
  unique (event_id, revision_number)
);

create index if not exists one_off_event_revisions_current_idx
  on public.one_off_event_revisions (event_id, revision_number desc, created_at desc);

create or replace function public.one_off_event_revision_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'one_off_event_revision_immutable' using errcode = 'P0001';
end;
$$;

drop trigger if exists one_off_event_revision_immutable_trg
  on public.one_off_event_revisions;
create trigger one_off_event_revision_immutable_trg
before update or delete on public.one_off_event_revisions
for each row execute function public.one_off_event_revision_immutable();

-- Events created before this migration receive an immutable revision 1.
insert into public.one_off_event_revisions (
  event_id, household_id, revision_number, title, target_kind, child_id,
  local_date, scheduled_time, requires_confirmation, responsible_user_id,
  created_by, created_at
)
select
  e.id, e.household_id, 1, e.title, e.target_kind, e.child_id,
  e.local_date, e.scheduled_time, e.requires_confirmation,
  e.responsible_user_id, e.created_by, e.created_at
from public.one_off_events e
where not exists (
  select 1 from public.one_off_event_revisions r where r.event_id = e.id
);

alter table public.event_audit
  drop constraint if exists event_audit_action;
alter table public.event_audit
  add constraint event_audit_action check (
    action in ('created', 'planning_revised', 'completed', 'completion_reversed', 'cancelled')
  );

alter table public.event_completions
  add column if not exists planning_revision_id uuid references public.one_off_event_revisions (id),
  add column if not exists planned_title text,
  add column if not exists planned_target_kind text,
  add column if not exists planned_child_id uuid,
  add column if not exists planned_local_date date,
  add column if not exists planned_scheduled_time text,
  add column if not exists planned_responsible_user_id uuid;

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
  revision_id uuid;
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
    where c.id = p_child_id and c.household_id = hid and c.archived_at is null
  ) then
    raise exception 'child_not_in_household' using errcode = 'P0001';
  end if;

  time_norm := nullif(btrim(coalesce(p_scheduled_time, '')), '');
  if time_norm is not null and time_norm !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'invalid_time' using errcode = 'P0001';
  end if;

  requires_conf := coalesce(p_requires_confirmation, true);
  if not requires_conf and p_responsible_user_id is not null then
    raise exception 'informational_no_responsible' using errcode = 'P0001';
  end if;
  if p_responsible_user_id is not null and not exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = p_responsible_user_id and m.archived_at is null
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

  insert into public.one_off_event_revisions (
    event_id, household_id, revision_number, title, target_kind, child_id,
    local_date, scheduled_time, requires_confirmation, responsible_user_id,
    created_by, created_at
  ) values (
    event_id, hid, 1, title_norm, p_target_kind, p_child_id, p_local_date,
    time_norm, requires_conf, p_responsible_user_id, uid, at_effective
  ) returning id into revision_id;

  insert into public.event_audit (
    household_id, event_id, action, actor_user_id, occurred_at, details
  ) values (
    hid, event_id, 'created', uid, at_effective,
    jsonb_build_object(
      'planning_revision_id', revision_id,
      'revision_number', 1,
      'title', title_norm,
      'target_kind', p_target_kind,
      'child_id', p_child_id,
      'local_date', p_local_date,
      'scheduled_time', time_norm,
      'requires_confirmation', requires_conf,
      'responsible_user_id', p_responsible_user_id
    )
  );

  return jsonb_build_object(
    'ok', true, 'event_id', event_id, 'planning_revision_id', revision_id,
    'revision_number', 1
  );
end;
$$;

create or replace function public.edit_one_off_event(
  p_event_id uuid,
  p_expected_revision_id uuid,
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
  event_row public.one_off_events%rowtype;
  current_revision public.one_off_event_revisions%rowtype;
  new_revision_id uuid;
  new_revision_number integer;
begin
  hid := public.current_household_id();
  if hid is null or uid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  select e.* into event_row
  from public.one_off_events e
  where e.id = p_event_id and e.household_id = hid
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'event_not_found');
  end if;

  select r.* into current_revision
  from public.one_off_event_revisions r
  where r.event_id = event_row.id and r.household_id = hid
  order by r.revision_number desc, r.created_at desc, r.id desc
  limit 1;
  if current_revision.id is null then
    raise exception 'event_revision_missing' using errcode = 'P0001';
  end if;
  if current_revision.id is distinct from p_expected_revision_id then
    return jsonb_build_object('ok', false, 'code', 'planning_revision_conflict');
  end if;

  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);
  if exists (
    select 1 from public.event_completions c
    where c.event_id = event_row.id and c.reversed_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_completed');
  end if;
  if current_revision.local_date <= today_date then
    return jsonb_build_object('ok', false, 'code', 'event_not_future');
  end if;
  if event_row.cancelled_at is not null then
    return jsonb_build_object('ok', false, 'code', 'event_cancelled');
  end if;

  title_norm := nullif(btrim(coalesce(p_title, '')), '');
  if title_norm is null then
    raise exception 'title_required' using errcode = 'P0001';
  end if;
  if char_length(title_norm) > 120 then
    raise exception 'title_too_long' using errcode = 'P0001';
  end if;
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
    where c.id = p_child_id and c.household_id = hid and c.archived_at is null
  ) then
    raise exception 'child_not_in_household' using errcode = 'P0001';
  end if;
  time_norm := nullif(btrim(coalesce(p_scheduled_time, '')), '');
  if time_norm is not null and time_norm !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'invalid_time' using errcode = 'P0001';
  end if;
  requires_conf := coalesce(p_requires_confirmation, true);
  if not requires_conf and p_responsible_user_id is not null then
    raise exception 'informational_no_responsible' using errcode = 'P0001';
  end if;
  if p_responsible_user_id is not null and not exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = p_responsible_user_id and m.archived_at is null
  ) then
    raise exception 'responsible_not_in_household' using errcode = 'P0001';
  end if;

  new_revision_number := current_revision.revision_number + 1;
  insert into public.one_off_event_revisions (
    event_id, household_id, revision_number, title, target_kind, child_id,
    local_date, scheduled_time, requires_confirmation, responsible_user_id,
    created_by, created_at
  ) values (
    event_row.id, hid, new_revision_number, title_norm, p_target_kind, p_child_id,
    p_local_date, time_norm, requires_conf, p_responsible_user_id, uid, at_effective
  ) returning id into new_revision_id;

  update public.one_off_events
  set title = title_norm,
      target_kind = p_target_kind,
      child_id = p_child_id,
      local_date = p_local_date,
      scheduled_time = time_norm,
      requires_confirmation = requires_conf,
      responsible_user_id = p_responsible_user_id
  where id = event_row.id;

  insert into public.event_audit (
    household_id, event_id, action, actor_user_id, occurred_at, details
  ) values (
    hid, event_row.id, 'planning_revised', uid, at_effective,
    jsonb_build_object(
      'previous_revision_id', current_revision.id,
      'previous_revision_number', current_revision.revision_number,
      'planning_revision_id', new_revision_id,
      'revision_number', new_revision_number,
      'before', jsonb_build_object(
        'title', current_revision.title,
        'target_kind', current_revision.target_kind,
        'child_id', current_revision.child_id,
        'local_date', current_revision.local_date,
        'scheduled_time', current_revision.scheduled_time,
        'requires_confirmation', current_revision.requires_confirmation,
        'responsible_user_id', current_revision.responsible_user_id
      ),
      'after', jsonb_build_object(
        'title', title_norm,
        'target_kind', p_target_kind,
        'child_id', p_child_id,
        'local_date', p_local_date,
        'scheduled_time', time_norm,
        'requires_confirmation', requires_conf,
        'responsible_user_id', p_responsible_user_id
      )
    )
  );

  return jsonb_build_object(
    'ok', true, 'event_id', event_row.id, 'planning_revision_id', new_revision_id,
    'revision_number', new_revision_number, 'local_date', p_local_date
  );
end;
$$;

revoke all on function public.edit_one_off_event(uuid, uuid, text, text, uuid, date, text, boolean, uuid, timestamptz) from public;
grant execute on function public.edit_one_off_event(uuid, uuid, text, text, uuid, date, text, boolean, uuid, timestamptz) to authenticated;

-- Completed Events retain the planning snapshot that was actually executed.
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
  revision_row public.one_off_event_revisions%rowtype;
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
  select r.* into revision_row
  from public.one_off_event_revisions r
  where r.event_id = event_row.id and r.household_id = hid
  order by r.revision_number desc, r.created_at desc, r.id desc
  limit 1;
  if revision_row.id is null then
    raise exception 'event_revision_missing' using errcode = 'P0001';
  end if;
  if revision_row.local_date <> today_date then
    return jsonb_build_object('ok', false, 'code', 'not_confirmable_day');
  end if;
  if not revision_row.requires_confirmation then
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
      'ok', false, 'code', 'already_completed', 'confirmation_id', existing.id,
      'confirmed_at', existing.confirmed_at, 'confirmed_by_user_id', existing.confirmed_by,
      'confirmed_by_display_name', confirmer_name
    );
  end if;

  occ_key := public.occurrence_key('event', event_row.id, revision_row.local_date, null);
  begin
    insert into public.event_completions (
      household_id, event_id, occurrence_key, confirmed_by, confirmed_at,
      planning_revision_id, planned_title, planned_target_kind, planned_child_id,
      planned_local_date, planned_scheduled_time, planned_responsible_user_id
    ) values (
      hid, event_row.id, occ_key, uid, at_effective, revision_row.id,
      revision_row.title, revision_row.target_kind, revision_row.child_id,
      revision_row.local_date, revision_row.scheduled_time, revision_row.responsible_user_id
    ) returning id, confirmed_at into completion_id, completion_at;
  exception when unique_violation then
    select c.* into existing
    from public.event_completions c
    where c.event_id = event_row.id and c.reversed_at is null;
    select m.display_name into confirmer_name
    from public.household_members m
    where m.household_id = hid and m.user_id = existing.confirmed_by;
    return jsonb_build_object(
      'ok', false, 'code', 'already_completed', 'confirmation_id', existing.id,
      'confirmed_at', existing.confirmed_at, 'confirmed_by_user_id', existing.confirmed_by,
      'confirmed_by_display_name', confirmer_name
    );
  end;

  insert into public.event_audit (
    household_id, event_id, action, actor_user_id, occurred_at, completion_id, details
  ) values (
    hid, event_row.id, 'completed', uid, at_effective, completion_id,
    jsonb_build_object(
      'planning_revision_id', revision_row.id,
      'planned_title', revision_row.title,
      'planned_target_kind', revision_row.target_kind,
      'planned_child_id', revision_row.child_id,
      'planned_local_date', revision_row.local_date,
      'planned_scheduled_time', revision_row.scheduled_time,
      'planned_responsible_user_id', revision_row.responsible_user_id,
      'executed_at', completion_at,
      'executed_by', uid
    )
  );
  select m.display_name into confirmer_name
  from public.household_members m
  where m.household_id = hid and m.user_id = uid;
  return jsonb_build_object(
    'ok', true, 'confirmation_id', completion_id, 'confirmed_at', completion_at,
    'confirmed_by_user_id', uid, 'confirmed_by_display_name', confirmer_name,
    'occurrence_key', occ_key
  );
end;
$$;

-- The snapshot reads the current revision, never a stale planning row.
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', d.occ_key, 'source', 'event', 'source_id', d.event_id,
    'local_date', p_local_day, 'slot', null, 'title', d.title,
    'target_kind', d.target_kind, 'child_id', d.child_id,
    'target_label', d.target_label, 'scheduled_time', d.scheduled_time,
    'requires_confirmation', d.requires_confirmation,
    'owner_user_id', d.responsible_user_id,
    'owner_display_name', d.responsible_display_name, 'status', d.status,
    'needs_owner_alert', d.needs_owner_alert,
    'confirmation_id', d.confirmation_id, 'confirmed_at', d.confirmed_at,
    'confirmed_by_user_id', d.confirmed_by,
    'confirmed_by_display_name', d.confirmed_by_name,
    'planning_revision_id', d.planning_revision_id
  ) order by d.sort_group, d.scheduled_time nulls last, d.title, d.occ_key), '[]'::jsonb)
  into result
  from (
    select r.event_id, r.title, r.target_kind, r.child_id, r.target_label,
      r.scheduled_time, r.requires_confirmation, r.responsible_user_id,
      r.responsible_display_name, r.occ_key, r.planning_revision_id,
      comp.id as confirmation_id, comp.confirmed_at, comp.confirmed_by,
      confirmer.display_name as confirmed_by_name,
      case
        when comp.id is not null then 'completed'
        when e.cancelled_at is not null then 'cancelled'
        when r.requires_confirmation and r.scheduled_time is not null
          and is_today and local_hhmm > r.scheduled_time then 'late'
        else 'scheduled'
      end as status,
      (r.requires_confirmation and r.responsible_user_id is null
        and e.cancelled_at is null and comp.id is null) as needs_owner_alert,
      case
        when comp.id is not null or e.cancelled_at is not null then 5
        when r.requires_confirmation and r.scheduled_time is not null
          and is_today and local_hhmm > r.scheduled_time then 2
        when r.scheduled_time is not null then 3
        else 4
      end as sort_group
    from public.one_off_events e
    join lateral (
      select rr.*,
        rr.id as planning_revision_id,
        case when rr.target_kind = 'casa' then public.casa_target_label() else c.name end as target_label,
        responsible.display_name as responsible_display_name,
        public.occurrence_key('event', rr.event_id, rr.local_date, null) as occ_key
      from public.one_off_event_revisions rr
      left join public.children c on c.id = rr.child_id
      left join public.household_members responsible
        on responsible.household_id = rr.household_id
       and responsible.user_id = rr.responsible_user_id
       and responsible.archived_at is null
      where rr.event_id = e.id and rr.household_id = p_household_id
      order by rr.revision_number desc, rr.created_at desc, rr.id desc
      limit 1
    ) r on true
    left join public.event_completions comp
      on comp.event_id = e.id and comp.reversed_at is null
    left join public.household_members confirmer
      on confirmer.household_id = e.household_id
     and confirmer.user_id = comp.confirmed_by and confirmer.archived_at is null
    where e.household_id = p_household_id and r.local_date = p_local_day
  ) d;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirmable Rotina Registro and immutable audit
-- ---------------------------------------------------------------------------

create table if not exists public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  routine_id uuid not null references public.weekly_routines (id) on delete cascade,
  local_date date not null,
  occurrence_key text not null,
  routine_version_id uuid references public.weekly_routine_versions (id),
  routine_exception_version_id uuid references public.weekly_routine_exceptions (id),
  planned_title text not null,
  planned_target_kind text not null,
  planned_child_id uuid,
  planned_scheduled_time text,
  planned_responsible_user_id uuid,
  confirmed_by uuid not null references auth.users (id),
  confirmed_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users (id),
  constraint routine_completions_reverse_consistency check (
    (reversed_at is null and reversed_by is null)
    or (reversed_at is not null and reversed_by is not null)
  )
);

create unique index if not exists routine_completions_active_uidx
  on public.routine_completions (routine_id, local_date)
  where reversed_at is null;
create index if not exists routine_completions_household_idx
  on public.routine_completions (household_id);

create table if not exists public.routine_audit (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  routine_id uuid not null references public.weekly_routines (id) on delete cascade,
  local_date date not null,
  action text not null,
  actor_user_id uuid not null references auth.users (id),
  occurred_at timestamptz not null default now(),
  completion_id uuid references public.routine_completions (id),
  details jsonb not null default '{}'::jsonb,
  constraint routine_audit_action check (action in ('completed', 'completion_reversed'))
);

create index if not exists routine_audit_routine_idx
  on public.routine_audit (routine_id, local_date, occurred_at);

create or replace function public.routine_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'routine_audit_immutable' using errcode = 'P0001';
end;
$$;

drop trigger if exists routine_audit_immutable_trg on public.routine_audit;
create trigger routine_audit_immutable_trg
before update or delete on public.routine_audit
for each row execute function public.routine_audit_immutable();

create or replace function public.routine_exception_after_completion_guard()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.routine_completions c
    where c.routine_id = new.routine_id
      and c.local_date = new.local_date
      and c.reversed_at is null
  ) then
    raise exception 'routine_completed_requires_correction' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists routine_exception_after_completion_guard_trg on public.weekly_routine_exceptions;
create trigger routine_exception_after_completion_guard_trg
before insert on public.weekly_routine_exceptions
for each row execute function public.routine_exception_after_completion_guard();

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
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', d.occ_key, 'source', 'routine', 'source_id', d.routine_id,
    'local_date', p_local_day, 'slot', null, 'title', d.title,
    'target_kind', d.target_kind, 'child_id', d.child_id,
    'target_label', d.target_label, 'scheduled_time', d.scheduled_time,
    'requires_confirmation', d.requires_confirmation,
    'owner_user_id', d.owner_user_id, 'owner_display_name', d.owner_display_name,
    'status', d.status, 'needs_owner_alert', d.needs_owner_alert,
    'confirmation_id', d.confirmation_id, 'confirmed_at', d.confirmed_at,
    'confirmed_by_user_id', d.confirmed_by,
    'confirmed_by_display_name', d.confirmed_by_name,
    'routine_version_id', d.routine_version_id,
    'routine_exception_version_id', d.routine_exception_version_id,
    'routine_exception_active', d.routine_exception_active,
    'routine_exception_time_overridden', d.routine_exception_time_overridden,
    'routine_exception_owner_overridden', d.routine_exception_owner_overridden
  ) order by d.sort_group, d.scheduled_time nulls last, d.title, d.occ_key), '[]'::jsonb)
  into result
  from (
    select effective.*, comp.id as confirmation_id, comp.confirmed_at,
      comp.confirmed_by, confirmer.display_name as confirmed_by_name,
      case
        when comp.id is not null then 'completed'
        when effective.cancelled then 'cancelled'
        when not effective.requires_confirmation then 'scheduled'
        when effective.scheduled_time is not null and is_today
          and local_hhmm > effective.scheduled_time then 'late'
        else 'scheduled'
      end as status,
      (effective.requires_confirmation and not effective.cancelled
        and comp.id is null and effective.owner_user_id is null) as needs_owner_alert,
      case
        when comp.id is not null or effective.cancelled then 5
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
        and (v.target_kind = 'casa' or (c.archived_at is null and c.active_from <= p_local_day))
    ) effective
    left join public.routine_completions comp
      on comp.routine_id = effective.routine_id
     and comp.local_date = p_local_day and comp.reversed_at is null
    left join public.household_members confirmer
      on confirmer.household_id = p_household_id
     and confirmer.user_id = comp.confirmed_by and confirmer.archived_at is null
  ) d;
  return result;
end;
$$;

create or replace function public.complete_weekly_routine(
  p_routine_id uuid,
  p_local_date date,
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
  occ_key text;
  occurrence jsonb;
  existing public.routine_completions%rowtype;
  completion_id uuid;
  completion_at timestamptz;
  confirmer_name text;
begin
  hid := public.current_household_id();
  if hid is null or uid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;
  at_effective := public.mutation_at(p_at);
  today_date := public.local_date_in_household(at_effective);
  if p_local_date is distinct from today_date then
    return jsonb_build_object('ok', false, 'code', 'not_confirmable_day');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_routine_id::text || ':' || p_local_date::text, 0)
  );
  select c.* into existing
  from public.routine_completions c
  where c.routine_id = p_routine_id and c.local_date = p_local_date and c.reversed_at is null;
  if found then
    select m.display_name into confirmer_name
    from public.household_members m
    where m.household_id = hid and m.user_id = existing.confirmed_by;
    return jsonb_build_object(
      'ok', false, 'code', 'already_completed', 'confirmation_id', existing.id,
      'confirmed_at', existing.confirmed_at, 'confirmed_by_user_id', existing.confirmed_by,
      'confirmed_by_display_name', confirmer_name
    );
  end if;

  occ_key := public.occurrence_key('routine', p_routine_id, p_local_date, null);
  select item into occurrence
  from jsonb_array_elements(
    public.derive_routine_occurrences_for_day(hid, p_local_date, at_effective)
  ) item
  where item->>'key' = occ_key;
  if occurrence is null then
    return jsonb_build_object('ok', false, 'code', 'routine_not_scheduled');
  end if;
  if occurrence->>'status' = 'cancelled' then
    return jsonb_build_object('ok', false, 'code', 'cancelled');
  end if;
  if occurrence->>'requires_confirmation' <> 'true' then
    return jsonb_build_object('ok', false, 'code', 'not_confirmable');
  end if;

  insert into public.routine_completions (
    household_id, routine_id, local_date, occurrence_key,
    routine_version_id, routine_exception_version_id, planned_title,
    planned_target_kind, planned_child_id, planned_scheduled_time,
    planned_responsible_user_id, confirmed_by, confirmed_at
  ) values (
    hid, p_routine_id, p_local_date, occ_key,
    nullif(occurrence->>'routine_version_id', '')::uuid,
    nullif(occurrence->>'routine_exception_version_id', '')::uuid,
    occurrence->>'title', occurrence->>'target_kind',
    nullif(occurrence->>'child_id', '')::uuid,
    nullif(occurrence->>'scheduled_time', ''),
    nullif(occurrence->>'owner_user_id', '')::uuid,
    uid, at_effective
  ) returning id, confirmed_at into completion_id, completion_at;

  insert into public.routine_audit (
    household_id, routine_id, local_date, action, actor_user_id,
    occurred_at, completion_id, details
  ) values (
    hid, p_routine_id, p_local_date, 'completed', uid, at_effective, completion_id,
    jsonb_build_object(
      'planned_title', occurrence->>'title',
      'planned_target_kind', occurrence->>'target_kind',
      'planned_child_id', occurrence->>'child_id',
      'planned_scheduled_time', occurrence->>'scheduled_time',
      'planned_responsible_user_id', occurrence->>'owner_user_id',
      'routine_version_id', occurrence->>'routine_version_id',
      'routine_exception_version_id', occurrence->>'routine_exception_version_id',
      'executed_at', completion_at, 'executed_by', uid
    )
  );
  select m.display_name into confirmer_name
  from public.household_members m
  where m.household_id = hid and m.user_id = uid;
  return jsonb_build_object(
    'ok', true, 'confirmation_id', completion_id, 'confirmed_at', completion_at,
    'confirmed_by_user_id', uid, 'confirmed_by_display_name', confirmer_name,
    'occurrence_key', occ_key
  );
end;
$$;

create or replace function public.reverse_weekly_routine_completion(
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
  completion public.routine_completions%rowtype;
begin
  hid := public.current_household_id();
  if hid is null or uid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;
  select c.* into completion
  from public.routine_completions c
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
  if completion.local_date <> today_date then
    return jsonb_build_object('ok', false, 'code', 'correction_window_closed');
  end if;
  update public.routine_completions
  set reversed_at = at_effective, reversed_by = uid
  where id = completion.id;
  insert into public.routine_audit (
    household_id, routine_id, local_date, action, actor_user_id,
    occurred_at, completion_id, details
  ) values (
    hid, completion.routine_id, completion.local_date, 'completion_reversed',
    uid, at_effective, completion.id,
    jsonb_build_object(
      'original_confirmed_by', completion.confirmed_by,
      'original_confirmed_at', completion.confirmed_at,
      'corrected_by', uid
    )
  );
  return jsonb_build_object(
    'ok', true, 'confirmation_id', completion.id, 'reversed_at', at_effective,
    'original_confirmed_by', completion.confirmed_by,
    'original_confirmed_at', completion.confirmed_at
  );
end;
$$;

revoke all on function public.complete_weekly_routine(uuid, date, timestamptz) from public;
grant execute on function public.complete_weekly_routine(uuid, date, timestamptz) to authenticated;
revoke all on function public.reverse_weekly_routine_completion(uuid, timestamptz) from public;
grant execute on function public.reverse_weekly_routine_completion(uuid, timestamptz) to authenticated;
grant execute on function public.derive_routine_occurrences_for_day(uuid, date, timestamptz) to authenticated;
grant execute on function public.derive_one_off_event_occurrences_for_day(uuid, date, timestamptz) to authenticated;

alter table public.one_off_event_revisions enable row level security;
alter table public.routine_completions enable row level security;
alter table public.routine_audit enable row level security;

drop policy if exists "Members select one_off_event_revisions" on public.one_off_event_revisions;
create policy "Members select one_off_event_revisions"
  on public.one_off_event_revisions for select to authenticated
  using (public.is_household_member(household_id));
drop policy if exists "Members select routine_completions" on public.routine_completions;
create policy "Members select routine_completions"
  on public.routine_completions for select to authenticated
  using (public.is_household_member(household_id));
drop policy if exists "Members select routine_audit" on public.routine_audit;
create policy "Members select routine_audit"
  on public.routine_audit for select to authenticated
  using (public.is_household_member(household_id));

grant select on table public.one_off_event_revisions to authenticated;
grant select on table public.routine_completions to authenticated;
grant select on table public.routine_audit to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.one_off_event_revisions;
  exception when undefined_object or duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.routine_completions;
  exception when undefined_object or duplicate_object then null;
  end;
end;
$$;

-- The operational total-delete RPC already disables the older immutable audit
-- triggers. Include the new Registro audit in the same administrative wipe.
create or replace function public.delete_household_total(
  p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  member_ids uuid[];
  sessions_invalidated bigint := 0;
  subscriptions_removed bigint := 0;
  outbox_removed bigint := 0;
  n bigint;
begin
  if p_confirm is distinct from 'DELETE_CASA' then
    raise exception 'delete_confirmation_required';
  end if;
  select id into hid from public.households limit 1;
  if hid is null then
    return jsonb_build_object('ok', true, 'already_empty', true,
      'backup_expiry_note', 'Artefatos de backup restantes expiram pela retenção de 7 dias.');
  end if;
  select coalesce(array_agg(user_id), '{}') into member_ids
  from public.household_members where household_id = hid;
  delete from public.push_subscriptions where user_id = any (member_ids);
  get diagnostics subscriptions_removed = row_count;
  delete from public.push_outbox where household_id = hid;
  get diagnostics outbox_removed = row_count;
  begin
    execute 'delete from auth.refresh_tokens where user_id = any ($1)' using member_ids;
    get diagnostics n = row_count;
    sessions_invalidated := sessions_invalidated + n;
  exception when undefined_table then null;
  end;
  begin
    execute 'delete from auth.sessions where user_id = any ($1)' using member_ids;
    get diagnostics n = row_count;
    sessions_invalidated := sessions_invalidated + n;
  exception when undefined_table then null;
  end;

  alter table public.event_audit disable trigger event_audit_immutable_trg;
  alter table public.weekly_routine_exceptions disable trigger weekly_routine_exception_immutable_trg;
  alter table public.routine_audit disable trigger routine_audit_immutable_trg;
  alter table public.one_off_event_revisions disable trigger one_off_event_revision_immutable_trg;
  begin
    delete from public.households where id = hid;
  exception when others then
    alter table public.event_audit enable trigger event_audit_immutable_trg;
    alter table public.weekly_routine_exceptions enable trigger weekly_routine_exception_immutable_trg;
    alter table public.routine_audit enable trigger routine_audit_immutable_trg;
    alter table public.one_off_event_revisions enable trigger one_off_event_revision_immutable_trg;
    raise;
  end;
  alter table public.event_audit enable trigger event_audit_immutable_trg;
  alter table public.weekly_routine_exceptions enable trigger weekly_routine_exception_immutable_trg;
  alter table public.routine_audit enable trigger routine_audit_immutable_trg;
  alter table public.one_off_event_revisions enable trigger one_off_event_revision_immutable_trg;
  delete from public.ops_status;
  delete from public.backup_status;
  return jsonb_build_object(
    'ok', true, 'household_id', hid, 'member_count', coalesce(cardinality(member_ids), 0),
    'subscriptions_removed', subscriptions_removed, 'outbox_removed', outbox_removed,
    'sessions_invalidated', sessions_invalidated,
    'backup_expiry_note', 'Artefatos de backup restantes expiram pela retenção de 7 dias; não há restauração após exclusão total.'
  );
end;
$$;
