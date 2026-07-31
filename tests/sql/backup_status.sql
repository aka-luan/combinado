-- Backup status RLS / recording (issue #13). Expects auth stub + migrations.

\set ON_ERROR_STOP on

do $$
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  outsider uuid := '33333333-3333-3333-3333-333333333333';
  hid uuid;
  n int;
  row public.backup_status;
begin
  insert into auth.users (id, email) values
    (adult1, 'a1@example.com'),
    (adult2, 'a2@example.com'),
    (outsider, 'out@example.com')
  on conflict (id) do nothing;

  hid := public.bootstrap_household(adult1, 'Ana', adult2, 'Beto');

  -- Privileged recorder writes success, then failure preserves last_success_at.
  row := public.record_backup_run('success', null, '2026-07-30T10:00:00Z'::timestamptz);
  if row.last_status is distinct from 'success'
     or row.last_success_at is distinct from '2026-07-30T10:00:00Z'::timestamptz then
    raise exception 'success record mismatch: %', row;
  end if;

  row := public.record_backup_run('failure', 'dump_failed', '2026-07-31T11:00:00Z'::timestamptz);
  if row.last_status is distinct from 'failure'
     or row.last_error_code is distinct from 'dump_failed'
     or row.last_success_at is distinct from '2026-07-30T10:00:00Z'::timestamptz then
    raise exception 'failure must preserve last success: %', row;
  end if;

  begin
    perform public.record_backup_run('failure', 'DROP TABLE; --');
    raise exception 'invalid error code must be rejected';
  exception
    when others then
      if sqlerrm = 'invalid error code must be rejected' then
        raise;
      end if;
      if sqlerrm not like '%invalid_backup_error_code%' then
        raise;
      end if;
  end;

  -- Roles dump incomplete is acceptable; schema+data must restore.
  row := public.record_backup_restore_rehearsal('2026-07-31T12:00:00Z'::timestamptz);
  if row.last_restore_rehearsal_at is distinct from '2026-07-31T12:00:00Z'::timestamptz then
    raise exception 'restore rehearsal timestamp missing: %', row;
  end if;

  -- Rehearsal-only row (no prior backup) must not invent a fake run status.
  delete from public.backup_status;
  row := public.record_backup_restore_rehearsal('2026-07-31T13:00:00Z'::timestamptz);
  if row.last_status is not null or row.last_restore_rehearsal_at is null then
    raise exception 'rehearsal-only row should leave last_status null: %', row;
  end if;
  row := public.record_backup_run('success', null, '2026-07-31T14:00:00Z'::timestamptz);
  if row.last_restore_rehearsal_at is distinct from '2026-07-31T13:00:00Z'::timestamptz then
    raise exception 'backup run must preserve rehearsal timestamp: %', row;
  end if;

  -- Members can read via get_backup_status / select.
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.backup_status;
  if n <> 1 then
    raise exception 'member should read backup_status, got %', n;
  end if;
  row := public.get_backup_status();
  if row.last_status is distinct from 'success'
     or row.last_restore_rehearsal_at is distinct from '2026-07-31T13:00:00Z'::timestamptz then
    raise exception 'get_backup_status mismatch: %', row;
  end if;
  begin
    insert into public.backup_status (
      singleton, last_status, last_attempt_at
    ) values (true, 'success', now());
    raise exception 'member insert must fail';
  exception
    when insufficient_privilege then
      null;
    when unique_violation then
      null; -- conflict still means write was attempted; RLS/priv should block first
    when others then
      if sqlerrm = 'member insert must fail' then
        raise;
      end if;
      -- RLS violation / policy
      null;
  end;
  execute 'reset role';

  -- Outsider / anon cannot read.
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.backup_status;
  if n <> 0 then
    raise exception 'outsider should not read backup_status, got %', n;
  end if;
  if public.get_backup_status() is not null then
    raise exception 'outsider get_backup_status must be null';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select count(*) into n from public.backup_status;
  if n <> 0 then
    raise exception 'anon should not read backup_status, got %', n;
  end if;
  execute 'reset role';

  raise notice 'backup_status tests OK (household %)', hid;
end
$$;
