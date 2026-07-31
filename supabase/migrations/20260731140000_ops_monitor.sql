-- Operational monitoring, privacy-safe outbox skeleton, and total Casa deletion
-- (issue #14 / PRD §§15.2, 16, 17, 21, 22, M7).

-- ---------------------------------------------------------------------------
-- Ops status singleton (cron + Realtime counters; no family content)
-- ---------------------------------------------------------------------------

create table if not exists public.ops_status (
  singleton boolean primary key default true,
  last_cron_at timestamptz,
  last_cron_job text,
  realtime_error_count bigint not null default 0,
  last_realtime_error_at timestamptz,
  last_realtime_error_code text,
  updated_at timestamptz not null default now(),
  constraint ops_status_singleton_true check (singleton = true),
  constraint ops_status_cron_job_check check (
    last_cron_job is null or last_cron_job ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint ops_status_realtime_code_check check (
    last_realtime_error_code is null
    or last_realtime_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  )
);

comment on table public.ops_status is
  'Singleton operational heartbeats. Codes and counts only — never family data.';

alter table public.ops_status enable row level security;

revoke all on table public.ops_status from public;
-- No authenticated SELECT: administrative monitoring only (PRD §17).

create or replace function public.record_cron_heartbeat(
  p_job text default 'push_worker',
  p_at timestamptz default now()
)
returns public.ops_status
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.ops_status;
  job text;
begin
  job := nullif(btrim(coalesce(p_job, '')), '');
  if job is null or job !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'invalid_cron_job_code';
  end if;

  insert into public.ops_status as o (
    singleton, last_cron_at, last_cron_job, updated_at
  )
  values (true, coalesce(p_at, now()), job, now())
  on conflict (singleton) do update
  set
    last_cron_at = excluded.last_cron_at,
    last_cron_job = excluded.last_cron_job,
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.record_cron_heartbeat(text, timestamptz) from public;

create or replace function public.record_realtime_error(
  p_error_code text default 'realtime_error',
  p_at timestamptz default now()
)
returns public.ops_status
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.ops_status;
  code text;
begin
  if public.current_household_id() is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  code := nullif(btrim(coalesce(p_error_code, '')), '');
  if code is null or code !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'invalid_realtime_error_code';
  end if;

  insert into public.ops_status as o (
    singleton,
    realtime_error_count,
    last_realtime_error_at,
    last_realtime_error_code,
    updated_at
  )
  values (true, 1, coalesce(p_at, now()), code, now())
  on conflict (singleton) do update
  set
    realtime_error_count = o.realtime_error_count + 1,
    last_realtime_error_at = excluded.last_realtime_error_at,
    last_realtime_error_code = excluded.last_realtime_error_code,
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.record_realtime_error(text, timestamptz) from public;
grant execute on function public.record_realtime_error(text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Push outbox + delivery logs (monitoring surface; workers may arrive later)
-- ---------------------------------------------------------------------------

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  delivery_type text not null,
  occurrence_id uuid,
  user_id uuid not null references auth.users (id) on delete cascade,
  installation_id uuid,
  subscription_id uuid references public.push_subscriptions (id) on delete set null,
  status text not null default 'pending',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_outbox_type_check check (
    delivery_type in ('dose_reminder', 'tomorrow_summary', 'test')
  ),
  constraint push_outbox_status_check check (
    status in ('pending', 'claimed', 'sent', 'failed', 'expired', 'cancelled')
  ),
  constraint push_outbox_result_check check (
    last_result is null or last_result ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint push_outbox_unique_delivery unique (
    delivery_type, occurrence_id, user_id, installation_id
  )
);

create index if not exists push_outbox_pending_idx
  on public.push_outbox (status, next_attempt_at)
  where status in ('pending', 'claimed');

comment on table public.push_outbox is
  'Transactional push deliveries. No child/title/medicine/instruction columns.';

alter table public.push_outbox enable row level security;
revoke all on table public.push_outbox from public;
-- No Adult policies: outbox is worker/admin only.

create table if not exists public.push_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete set null,
  delivery_type text not null,
  occurrence_id uuid,
  user_id uuid,
  result text not null,
  attempt int not null default 1,
  created_at timestamptz not null default now(),
  constraint push_delivery_logs_result_check check (
    result ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint push_delivery_logs_type_check check (
    delivery_type in ('dose_reminder', 'tomorrow_summary', 'test')
  )
);

create index if not exists push_delivery_logs_created_at_idx
  on public.push_delivery_logs (created_at);

comment on table public.push_delivery_logs is
  'Push delivery metadata for 30 days. Codes only — never family content.';

alter table public.push_delivery_logs enable row level security;
revoke all on table public.push_delivery_logs from public;

create or replace function public.purge_push_delivery_logs(
  p_older_than interval default interval '30 days'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.push_delivery_logs
  where created_at < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_push_delivery_logs(interval) from public;

-- ---------------------------------------------------------------------------
-- Admin monitor snapshot (service role / SQL Editor)
-- ---------------------------------------------------------------------------

create or replace function public.get_ops_monitor_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ops public.ops_status%rowtype;
  backup public.backup_status%rowtype;
  pending_count bigint;
  failed_count bigint;
begin
  select * into ops from public.ops_status where singleton = true;
  select * into backup from public.backup_status where singleton = true;

  select count(*) into pending_count
  from public.push_outbox
  where status in ('pending', 'claimed');

  select count(*) into failed_count
  from public.push_outbox
  where status = 'failed';

  return jsonb_build_object(
    'last_cron_at', ops.last_cron_at,
    'outbox_pending_count', coalesce(pending_count, 0),
    'outbox_failed_count', coalesce(failed_count, 0),
    'realtime_error_count', coalesce(ops.realtime_error_count, 0),
    'last_realtime_error_at', ops.last_realtime_error_at,
    'last_backup_success_at', backup.last_success_at,
    'last_restore_rehearsal_at', backup.last_restore_rehearsal_at
  );
end;
$$;

revoke all on function public.get_ops_monitor_snapshot() from public;
-- Intentionally not granted to authenticated — administrative SQL only.

-- ---------------------------------------------------------------------------
-- Total household deletion (administrative; invalidates access)
-- ---------------------------------------------------------------------------

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
    return jsonb_build_object(
      'ok', true,
      'already_empty', true,
      'backup_expiry_note',
        'Artefatos de backup restantes expiram pela retenção de 7 dias.'
    );
  end if;

  select coalesce(array_agg(user_id), '{}') into member_ids
  from public.household_members
  where household_id = hid;

  delete from public.push_subscriptions
  where user_id = any (member_ids);
  get diagnostics subscriptions_removed = row_count;

  delete from public.push_outbox where household_id = hid;
  get diagnostics outbox_removed = row_count;

  -- Invalidate Auth sessions/refresh tokens when the hosted schema provides them.
  begin
    execute
      'delete from auth.refresh_tokens where user_id = any ($1)'
      using member_ids;
    get diagnostics n = row_count;
    sessions_invalidated := sessions_invalidated + n;
  exception
    when undefined_table then
      null;
  end;

  begin
    execute
      'delete from auth.sessions where user_id = any ($1)'
      using member_ids;
    get diagnostics n = row_count;
    sessions_invalidated := sessions_invalidated + n;
  exception
    when undefined_table then
      null;
  end;

  -- Append-only audit/exception rows block ordinary DELETE; total wipe may drop them.
  alter table public.event_audit disable trigger event_audit_immutable_trg;
  alter table public.weekly_routine_exceptions
    disable trigger weekly_routine_exception_immutable_trg;
  begin
    delete from public.households where id = hid;
  exception
    when others then
      alter table public.event_audit enable trigger event_audit_immutable_trg;
      alter table public.weekly_routine_exceptions
        enable trigger weekly_routine_exception_immutable_trg;
      raise;
  end;
  alter table public.event_audit enable trigger event_audit_immutable_trg;
  alter table public.weekly_routine_exceptions
    enable trigger weekly_routine_exception_immutable_trg;

  -- Clear operational counters tied to the former Casa.
  delete from public.ops_status;
  delete from public.backup_status;

  return jsonb_build_object(
    'ok', true,
    'household_id', hid,
    'member_count', coalesce(cardinality(member_ids), 0),
    'subscriptions_removed', subscriptions_removed,
    'outbox_removed', outbox_removed,
    'sessions_invalidated', sessions_invalidated,
    'backup_expiry_note',
      'Artefatos de backup restantes expiram pela retenção de 7 dias; não há restauração após exclusão total.'
  );
end;
$$;

revoke all on function public.delete_household_total(text) from public;
-- Service role / SQL Editor only — never exposed to the PWA.
