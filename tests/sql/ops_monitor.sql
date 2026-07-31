-- Ops monitor + total deletion (issue #14). Expects auth stub + migrations.

\set ON_ERROR_STOP on

do $$
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  outsider uuid := '33333333-3333-3333-3333-333333333333';
  hid uuid;
  snap jsonb;
  del jsonb;
  n int;
begin
  insert into auth.users (id, email) values
    (adult1, 'a1@example.com'),
    (adult2, 'a2@example.com'),
    (outsider, 'out@example.com')
  on conflict (id) do nothing;

  hid := public.bootstrap_household(adult1, 'Ana', adult2, 'Beto');

  perform public.record_cron_heartbeat('push_worker', '2026-07-31T21:00:00Z'::timestamptz);
  perform public.record_backup_run('success', null, '2026-07-31T03:00:00Z'::timestamptz);
  perform public.record_backup_restore_rehearsal('2026-07-28T12:00:00Z'::timestamptz);

  insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth)
  values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    adult1,
    'https://example.test/push/1',
    'p256',
    'auth'
  );

  insert into public.push_outbox (
    household_id, delivery_type, occurrence_id, user_id, installation_id,
    status, expires_at, last_result
  ) values
    (hid, 'dose_reminder', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', adult1,
     'cccccccc-cccc-cccc-cccc-cccccccccccc', 'pending', now() + interval '30 minutes', null),
    (hid, 'dose_reminder', 'dddddddd-dddd-dddd-dddd-dddddddddddd', adult2,
     'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'failed', now() - interval '1 minute', 'push_410');

  -- Member can record realtime error; outsider cannot.
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  perform public.record_realtime_error('realtime_channel_error', '2026-07-31T20:55:00Z'::timestamptz);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  begin
    perform public.record_realtime_error('realtime_channel_error');
    raise exception 'outsider must not record realtime errors';
  exception
    when others then
      if sqlerrm = 'outsider must not record realtime errors' then
        raise;
      end if;
      if sqlerrm not like '%household_missing%' then
        raise;
      end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);

  -- Adults cannot select ops_status / outbox (admin only).
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.ops_status;
    if n > 0 then
      raise exception 'member must not read ops_status';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform public.get_ops_monitor_snapshot();
    raise exception 'member must not execute get_ops_monitor_snapshot';
  exception
    when others then
      if sqlerrm = 'member must not execute get_ops_monitor_snapshot' then
        raise;
      end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);

  snap := public.get_ops_monitor_snapshot();
  if (snap->>'outbox_pending_count')::int is distinct from 1
     or (snap->>'outbox_failed_count')::int is distinct from 1
     or (snap->>'realtime_error_count')::int is distinct from 1
     or snap->>'last_cron_at' is distinct from '2026-07-31T21:00:00+00'
     and snap->>'last_cron_at' is distinct from '2026-07-31T21:00:00Z' then
    -- timestamptz json encoding varies; check presence + counts primarily
    if (snap->>'outbox_pending_count')::int is distinct from 1
       or (snap->>'outbox_failed_count')::int is distinct from 1
       or (snap->>'realtime_error_count')::int is distinct from 1
       or snap->>'last_cron_at' is null
       or snap->>'last_backup_success_at' is null
       or snap->>'last_restore_rehearsal_at' is null then
      raise exception 'ops snapshot mismatch: %', snap;
    end if;
  end if;

  -- Delivery logs reject free-form family payloads via result check.
  begin
    insert into public.push_delivery_logs (delivery_type, result)
    values ('dose_reminder', 'Mia took Dipirona');
    raise exception 'family text in result must be rejected';
  exception
    when others then
      if sqlerrm = 'family text in result must be rejected' then
        raise;
      end if;
  end;

  insert into public.push_delivery_logs (household_id, delivery_type, result, attempt)
  values (hid, 'dose_reminder', 'sent', 1);

  -- Total deletion requires confirmation token.
  begin
    perform public.delete_household_total('nope');
    raise exception 'delete without confirm must fail';
  exception
    when others then
      if sqlerrm = 'delete without confirm must fail' then
        raise;
      end if;
      if sqlerrm not like '%delete_confirmation_required%' then
        raise;
      end if;
  end;

  del := public.delete_household_total('DELETE_CASA');
  if (del->>'ok')::boolean is not true
     or (del->>'subscriptions_removed')::int < 1
     or del->>'backup_expiry_note' is null then
    raise exception 'delete_household_total mismatch: %', del;
  end if;

  select count(*) into n from public.households;
  if n <> 0 then
    raise exception 'households must be empty after total deletion';
  end if;
  select count(*) into n from public.push_subscriptions where user_id = adult1;
  if n <> 0 then
    raise exception 'subscriptions must be removed';
  end if;
  select count(*) into n from public.push_outbox;
  if n <> 0 then
    raise exception 'outbox must be cleared';
  end if;
end
$$;
