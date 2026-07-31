-- Operational backup status for the singleton Casa (issue #13 / PRD §16).
-- Written only by automation (service role / table owner); Adults may read.

create table if not exists public.backup_status (
  singleton boolean primary key default true,
  last_status text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  last_restore_rehearsal_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint backup_status_singleton_true check (singleton = true),
  constraint backup_status_last_status_check check (
    last_status is null or last_status in ('success', 'failure')
  ),
  constraint backup_status_error_code_check check (
    last_error_code is null
    or last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint backup_status_attempt_when_status check (
    (last_status is null and last_attempt_at is null)
    or (last_status is not null and last_attempt_at is not null)
  )
);

comment on table public.backup_status is
  'Singleton operational backup status. No secrets, connection strings, or family data.';

alter table public.backup_status enable row level security;

revoke all on table public.backup_status from public;
grant select on table public.backup_status to authenticated;

drop policy if exists backup_status_select_member on public.backup_status;
create policy backup_status_select_member
  on public.backup_status
  for select
  to authenticated
  using (public.current_household_id() is not null);

-- Automation records success/failure without family data (service_role / owner).
create or replace function public.record_backup_run(
  p_status text,
  p_error_code text default null,
  p_attempted_at timestamptz default now()
)
returns public.backup_status
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.backup_status;
  code text;
begin
  if p_status is distinct from 'success' and p_status is distinct from 'failure' then
    raise exception 'invalid_backup_status';
  end if;

  code := nullif(btrim(coalesce(p_error_code, '')), '');
  if code is not null and code !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'invalid_backup_error_code';
  end if;
  if p_status = 'success' then
    code := null;
  end if;

  insert into public.backup_status as b (
    singleton,
    last_status,
    last_attempt_at,
    last_success_at,
    last_error_code,
    last_restore_rehearsal_at,
    updated_at
  )
  values (
    true,
    p_status,
    coalesce(p_attempted_at, now()),
    case when p_status = 'success' then coalesce(p_attempted_at, now()) else null end,
    code,
    null,
    now()
  )
  on conflict (singleton) do update
  set
    last_status = excluded.last_status,
    last_attempt_at = excluded.last_attempt_at,
    last_success_at = case
      when excluded.last_status = 'success' then excluded.last_attempt_at
      else b.last_success_at
    end,
    last_error_code = excluded.last_error_code,
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.record_backup_run(text, text, timestamptz) from public;
-- Intentionally not granted to authenticated/anon — automation uses a privileged role.

create or replace function public.record_backup_restore_rehearsal(
  p_rehearsed_at timestamptz default now()
)
returns public.backup_status
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.backup_status;
begin
  insert into public.backup_status as b (
    singleton,
    last_status,
    last_attempt_at,
    last_success_at,
    last_error_code,
    last_restore_rehearsal_at,
    updated_at
  )
  values (
    true,
    null,
    null,
    null,
    null,
    coalesce(p_rehearsed_at, now()),
    now()
  )
  on conflict (singleton) do update
  set
    last_restore_rehearsal_at = coalesce(p_rehearsed_at, now()),
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.record_backup_restore_rehearsal(timestamptz) from public;

-- Read helper for the PWA (members only via current_household_id check).
create or replace function public.get_backup_status()
returns public.backup_status
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row public.backup_status;
begin
  if public.current_household_id() is null then
    return null;
  end if;
  select * into row from public.backup_status where singleton = true;
  return row;
end;
$$;

revoke all on function public.get_backup_status() from public;
grant execute on function public.get_backup_status() to authenticated;
