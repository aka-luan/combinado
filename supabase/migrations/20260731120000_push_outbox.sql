-- M7: transactional push outbox for dose reminders + 22:00 Amanhã summary
-- (issue #11 / PRD §10). Service-role workers claim deliveries; Adults never
-- write the outbox directly. Logs retain non-sensitive metadata for 30 days.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.household_slot_timestamptz(
  p_local_date date,
  p_hhmm text
)
returns timestamptz
language sql
immutable
as $$
  select ((p_local_date::text || ' ' || p_hhmm || ':00')::timestamp
    at time zone public.household_timezone());
$$;

comment on function public.household_slot_timestamptz(date, text) is
  'Interpret HH:MM on a household local calendar day as timestamptz.';

revoke all on function public.household_slot_timestamptz(date, text) from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  delivery_type text not null
    check (delivery_type in ('dose_reminder', 'tomorrow_summary')),
  -- Dose: occurrence_key. Summary: summary:{local_date of send day}.
  occurrence_ref text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.push_subscriptions (id) on delete set null,
  payload jsonb not null,
  scheduled_for timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in (
      'pending', 'claimed', 'sent', 'failed', 'expired', 'cancelled', 'skipped'
    )),
  attempts integer not null default 0
    check (attempts >= 0),
  max_attempts integer not null default 5
    check (max_attempts >= 1),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  last_error text,
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_outbox_expiry_after_schedule check (expires_at > scheduled_for),
  constraint push_outbox_unique_delivery unique (
    delivery_type, occurrence_ref, user_id, subscription_id
  )
);

create index if not exists push_outbox_claim_idx
  on public.push_outbox (status, next_attempt_at)
  where status in ('pending', 'claimed');

create index if not exists push_outbox_household_idx
  on public.push_outbox (household_id);

create index if not exists push_outbox_occurrence_ref_idx
  on public.push_outbox (occurrence_ref);

create table if not exists public.push_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid references public.push_outbox (id) on delete set null,
  household_id uuid not null references public.households (id) on delete cascade,
  delivery_type text not null,
  occurrence_ref text not null,
  user_id uuid not null,
  subscription_id uuid,
  attempt integer not null,
  outcome text not null,
  http_status integer,
  created_at timestamptz not null default now()
);

create index if not exists push_delivery_logs_created_at_idx
  on public.push_delivery_logs (created_at);

create index if not exists push_delivery_logs_household_idx
  on public.push_delivery_logs (household_id);

alter table public.push_outbox enable row level security;
alter table public.push_delivery_logs enable row level security;

-- No policies for authenticated: Adults never read/write outbox or logs.
-- Service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- Payload builders (mirror src/lib/push/payload.ts — keep strings in sync)
-- ---------------------------------------------------------------------------

create or replace function public.push_dose_reminder_payload(
  p_occurrence_key text,
  p_child_name text,
  p_medicine_name text,
  p_scheduled_time text,
  p_instruction text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  body text;
  instr text := nullif(btrim(coalesce(p_instruction, '')), '');
begin
  body := p_child_name || ', ' || p_medicine_name || ', ' || p_scheduled_time;
  if instr is not null then
    body := body || ', ' || instr;
  end if;
  return jsonb_build_object(
    'title', 'Hora de verificar',
    'body', body,
    'url', '/?occ=' || replace(replace(replace(p_occurrence_key, '%', '%25'), ':', '%3A'), ' ', '%20')
  );
end;
$$;

revoke all on function public.push_dose_reminder_payload(text, text, text, text, text) from public;

create or replace function public.push_tomorrow_summary_payload(
  p_commitment_count integer,
  p_dose_count integer,
  p_without_owner_count integer
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'title', 'Combinado',
    'body',
      'Amanhã: '
      || p_commitment_count::text || ' '
      || case when p_commitment_count = 1 then 'compromisso' else 'compromissos' end
      || ', '
      || p_dose_count::text || ' '
      || case when p_dose_count = 1 then 'dose' else 'doses' end
      || ', '
      || p_without_owner_count::text || ' sem responsável.',
    'url', '/?amanha=1'
  );
$$;

revoke all on function public.push_tomorrow_summary_payload(integer, integer, integer) from public;

-- ---------------------------------------------------------------------------
-- Cancel unsent dose deliveries (interrupt / eligibility loss)
-- ---------------------------------------------------------------------------

create or replace function public.cancel_unsent_dose_push(
  p_household_id uuid,
  p_medication_id uuid,
  p_local_date date,
  p_from_slot text default null,
  p_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  at_effective timestamptz := public.mutation_at(p_at);
  cancelled_count integer := 0;
begin
  update public.push_outbox o
  set
    status = 'cancelled',
    result = 'cancelled_by_change',
    updated_at = at_effective,
    claimed_at = null,
    claimed_by = null
  where o.household_id = p_household_id
    and o.delivery_type = 'dose_reminder'
    and o.status in ('pending', 'claimed')
    and o.occurrence_ref like (
      'medication:' || p_medication_id::text || ':' || p_local_date::text || ':%'
    )
    and (
      p_from_slot is null
      or right(o.occurrence_ref, 5) >= p_from_slot
    );

  get diagnostics cancelled_count = row_count;
  return cancelled_count;
end;
$$;

revoke all on function public.cancel_unsent_dose_push(uuid, uuid, date, text, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- Enqueue due deliveries (idempotent via unique key)
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_due_push_deliveries(
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  at_effective timestamptz := public.mutation_at(p_at);
  today_date date := public.local_date_in_household(at_effective);
  tomorrow_date date := today_date + 1;
  local_hhmm text := public.local_time_hhmm_in_household(at_effective);
  dose_inserted integer := 0;
  summary_inserted integer := 0;
  hid uuid;
  meds jsonb;
  occ jsonb;
  occ_key text;
  slot text;
  occ_status text;
  scheduled_for timestamptz;
  expires_at timestamptz;
  payload jsonb;
  tomorrow_routines jsonb;
  tomorrow_meds jsonb;
  tomorrow_events jsonb;
  tomorrow_occs jsonb;
  commitment_count integer;
  dose_count integer;
  without_owner_count integer;
  summary_ref text;
  n integer;
begin
  -- Expire anything past its delivery window before enqueueing.
  update public.push_outbox o
  set
    status = 'expired',
    result = coalesce(o.result, 'expired'),
    updated_at = at_effective,
    claimed_at = null,
    claimed_by = null
  where o.status in ('pending', 'claimed')
    and o.expires_at <= at_effective;

  for hid in
    select h.id from public.households h
  loop
    meds := public.derive_medication_occurrences_for_day(hid, today_date, at_effective);

    for occ in
      select value from jsonb_array_elements(coalesce(meds, '[]'::jsonb))
    loop
      occ_status := occ->>'status';
      if occ_status not in ('pending', 'late') then
        continue;
      end if;

      occ_key := occ->>'key';
      slot := occ->>'slot';
      if occ_key is null or slot is null then
        continue;
      end if;

      scheduled_for := public.household_slot_timestamptz(today_date, slot);
      expires_at := scheduled_for + interval '30 minutes';

      -- Only enqueue once the programmed time has arrived and within TTL.
      if at_effective < scheduled_for or at_effective >= expires_at then
        continue;
      end if;

      payload := public.push_dose_reminder_payload(
        occ_key,
        coalesce(occ->>'target_label', ''),
        coalesce(occ->>'title', ''),
        slot,
        occ->>'instruction'
      );

      insert into public.push_outbox (
        household_id,
        delivery_type,
        occurrence_ref,
        user_id,
        subscription_id,
        payload,
        scheduled_for,
        expires_at,
        status,
        next_attempt_at,
        created_at,
        updated_at
      )
      select
        hid,
        'dose_reminder',
        occ_key,
        ps.user_id,
        ps.id,
        payload,
        scheduled_for,
        expires_at,
        'pending',
        scheduled_for,
        at_effective,
        at_effective
      from public.push_subscriptions ps
      join public.household_members hm
        on hm.user_id = ps.user_id
       and hm.household_id = hid
       and hm.archived_at is null
      on conflict (delivery_type, occurrence_ref, user_id, subscription_id) do nothing;

      get diagnostics n = row_count;
      dose_inserted := dose_inserted + n;
    end loop;

    -- 22:00 Amanhã summary — once per local calendar day when tomorrow has items.
    if local_hhmm >= '22:00' then
      tomorrow_routines := public.derive_routine_occurrences_for_day(hid, tomorrow_date, at_effective);
      tomorrow_meds := public.derive_medication_occurrences_for_day(hid, tomorrow_date, at_effective);
      tomorrow_events := public.derive_one_off_event_occurrences_for_day(hid, tomorrow_date, at_effective);

      select coalesce(jsonb_agg(e), '[]'::jsonb) into tomorrow_occs
      from (
        select value as e from jsonb_array_elements(coalesce(tomorrow_routines, '[]'::jsonb))
        union all
        select value from jsonb_array_elements(coalesce(tomorrow_meds, '[]'::jsonb))
        union all
        select value from jsonb_array_elements(coalesce(tomorrow_events, '[]'::jsonb))
      ) u;

      if jsonb_array_length(tomorrow_occs) > 0 then
        select
          count(*) filter (where e->>'source' in ('routine', 'event')),
          count(*) filter (where e->>'source' = 'medication'),
          count(*) filter (
            where coalesce((e->>'requires_confirmation')::boolean, false)
              and (e->>'owner_user_id') is null
              and e->>'source' <> 'medication'
          )
        into commitment_count, dose_count, without_owner_count
        from jsonb_array_elements(tomorrow_occs) e;

        summary_ref := 'summary:' || today_date::text;
        scheduled_for := public.household_slot_timestamptz(today_date, '22:00');
        -- Summary keeps a same-night window; no multi-day retries.
        expires_at := scheduled_for + interval '60 minutes';
        payload := public.push_tomorrow_summary_payload(
          coalesce(commitment_count, 0),
          coalesce(dose_count, 0),
          coalesce(without_owner_count, 0)
        );

        insert into public.push_outbox (
          household_id,
          delivery_type,
          occurrence_ref,
          user_id,
          subscription_id,
          payload,
          scheduled_for,
          expires_at,
          status,
          next_attempt_at,
          created_at,
          updated_at
        )
        select
          hid,
          'tomorrow_summary',
          summary_ref,
          ps.user_id,
          ps.id,
          payload,
          scheduled_for,
          expires_at,
          'pending',
          scheduled_for,
          at_effective,
          at_effective
        from public.push_subscriptions ps
        join public.household_members hm
          on hm.user_id = ps.user_id
         and hm.household_id = hid
         and hm.archived_at is null
        on conflict (delivery_type, occurrence_ref, user_id, subscription_id) do nothing;

        get diagnostics n = row_count;
        summary_inserted := summary_inserted + n;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'dose_inserted', dose_inserted,
    'summary_inserted', summary_inserted,
    'at', at_effective
  );
end;
$$;

revoke all on function public.enqueue_due_push_deliveries(timestamptz) from public;

-- ---------------------------------------------------------------------------
-- Claim + complete (workers)
-- ---------------------------------------------------------------------------

create or replace function public.dose_push_still_deliverable(
  p_occurrence_ref text,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[];
  med_id uuid;
  local_day date;
  slot text;
  hid uuid;
  occs jsonb;
  occ jsonb;
  st text;
begin
  -- medication:{uuid}:{YYYY-MM-DD}:{HH:MM}
  parts := string_to_array(p_occurrence_ref, ':');
  if coalesce(parts[1], '') <> 'medication' or array_length(parts, 1) < 4 then
    return false;
  end if;

  med_id := parts[2]::uuid;
  local_day := parts[3]::date;
  -- slot may contain colon (HH:MM) — rejoin tail
  slot := parts[4] || case when parts[5] is not null then ':' || parts[5] else '' end;

  select m.household_id into hid
  from public.medications m
  where m.id = med_id;
  if hid is null then
    return false;
  end if;

  occs := public.derive_medication_occurrences_for_day(hid, local_day, public.mutation_at(p_at));
  for occ in select value from jsonb_array_elements(coalesce(occs, '[]'::jsonb))
  loop
    if occ->>'key' = p_occurrence_ref then
      st := occ->>'status';
      return st in ('pending', 'late');
    end if;
  end loop;

  return false;
end;
$$;

revoke all on function public.dose_push_still_deliverable(text, timestamptz) from public;

create or replace function public.claim_push_outbox_batch(
  p_limit integer default 50,
  p_worker text default 'worker',
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  at_effective timestamptz := public.mutation_at(p_at);
  claimed jsonb := '[]'::jsonb;
  candidate record;
  row_data public.push_outbox%rowtype;
  deliverable boolean;
  endpoint text;
  p256dh text;
  auth_key text;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 50;
  end if;

  -- Release stale claims older than 2 minutes back to pending (overlapping cron).
  update public.push_outbox
  set
    status = 'pending',
    claimed_at = null,
    claimed_by = null,
    updated_at = at_effective
  where status = 'claimed'
    and claimed_at is not null
    and claimed_at < at_effective - interval '2 minutes'
    and expires_at > at_effective;

  update public.push_outbox o
  set
    status = 'expired',
    result = coalesce(o.result, 'expired'),
    updated_at = at_effective,
    claimed_at = null,
    claimed_by = null
  where o.status in ('pending', 'claimed')
    and o.expires_at <= at_effective;

  for candidate in
    select o.id
    from public.push_outbox o
    where o.status = 'pending'
      and o.next_attempt_at <= at_effective
      and o.expires_at > at_effective
    order by o.next_attempt_at, o.created_at
    for update of o skip locked
    limit p_limit
  loop
    update public.push_outbox o
    set
      status = 'claimed',
      claimed_at = at_effective,
      claimed_by = left(coalesce(p_worker, 'worker'), 120),
      attempts = o.attempts + 1,
      updated_at = at_effective
    where o.id = candidate.id
    returning * into row_data;

    if row_data.delivery_type = 'dose_reminder' then
      deliverable := public.dose_push_still_deliverable(
        row_data.occurrence_ref, at_effective
      );
      if not deliverable then
        update public.push_outbox
        set
          status = 'skipped',
          result = 'skipped_confirmed_or_cancelled',
          claimed_at = null,
          claimed_by = null,
          updated_at = at_effective
        where id = row_data.id;

        insert into public.push_delivery_logs (
          outbox_id, household_id, delivery_type, occurrence_ref,
          user_id, subscription_id, attempt, outcome, http_status, created_at
        ) values (
          row_data.id, row_data.household_id, row_data.delivery_type,
          row_data.occurrence_ref, row_data.user_id, row_data.subscription_id,
          row_data.attempts, 'skipped_confirmed_or_cancelled', null, at_effective
        );
        continue;
      end if;
    end if;

    select s.endpoint, s.p256dh, s.auth
      into endpoint, p256dh, auth_key
    from public.push_subscriptions s
    where s.id = row_data.subscription_id;

    if endpoint is null then
      update public.push_outbox
      set
        status = 'failed',
        result = 'gone',
        claimed_at = null,
        claimed_by = null,
        updated_at = at_effective
      where id = row_data.id;
      continue;
    end if;

    claimed := claimed || jsonb_build_array(jsonb_build_object(
      'id', row_data.id,
      'household_id', row_data.household_id,
      'delivery_type', row_data.delivery_type,
      'occurrence_ref', row_data.occurrence_ref,
      'user_id', row_data.user_id,
      'subscription_id', row_data.subscription_id,
      'payload', row_data.payload,
      'scheduled_for', row_data.scheduled_for,
      'expires_at', row_data.expires_at,
      'attempts', row_data.attempts,
      'endpoint', endpoint,
      'p256dh', p256dh,
      'auth', auth_key
    ));
  end loop;

  return claimed;
end;
$$;

revoke all on function public.claim_push_outbox_batch(integer, text, timestamptz) from public;

create or replace function public.complete_push_outbox_attempt(
  p_outbox_id uuid,
  p_outcome text,
  p_http_status integer default null,
  p_error text default null,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  at_effective timestamptz := public.mutation_at(p_at);
  rec public.push_outbox%rowtype;
  next_at timestamptz;
  final_status text;
  final_result text;
begin
  select * into rec from public.push_outbox where id = p_outbox_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if rec.status not in ('claimed', 'pending') then
    return jsonb_build_object('ok', false, 'error', 'not_claimable', 'status', rec.status);
  end if;

  -- Race: confirmation landed while the worker held the claim.
  if rec.delivery_type = 'dose_reminder'
     and p_outcome = 'sent'
     and not public.dose_push_still_deliverable(rec.occurrence_ref, at_effective) then
    p_outcome := 'skipped_confirmed_or_cancelled';
  end if;

  if p_outcome = 'sent' then
    final_status := 'sent';
    final_result := 'sent';
  elsif p_outcome in ('gone', '404', '410') then
    final_status := 'failed';
    final_result := 'gone';
  elsif p_outcome in ('skipped_confirmed_or_cancelled', 'skipped') then
    final_status := 'skipped';
    final_result := 'skipped_confirmed_or_cancelled';
  elsif p_outcome = 'expired' then
    final_status := 'expired';
    final_result := 'expired';
  else
    -- Temporary failure: retry only within the delivery window.
    next_at := at_effective + interval '2 minutes';
    if rec.attempts >= rec.max_attempts or next_at >= rec.expires_at then
      final_status := 'failed';
      final_result := 'temp_fail_exhausted';
    else
      final_status := 'pending';
      final_result := 'temp_fail_retry';
      update public.push_outbox
      set
        status = 'pending',
        result = final_result,
        next_attempt_at = next_at,
        last_error = left(coalesce(p_error, p_outcome), 500),
        claimed_at = null,
        claimed_by = null,
        updated_at = at_effective
      where id = rec.id;

      insert into public.push_delivery_logs (
        outbox_id, household_id, delivery_type, occurrence_ref,
        user_id, subscription_id, attempt, outcome, http_status, created_at
      ) values (
        rec.id, rec.household_id, rec.delivery_type, rec.occurrence_ref,
        rec.user_id, rec.subscription_id, rec.attempts,
        'temp_fail', p_http_status, at_effective
      );

      return jsonb_build_object(
        'ok', true,
        'status', 'pending',
        'result', final_result,
        'next_attempt_at', next_at
      );
    end if;
  end if;

  update public.push_outbox
  set
    status = final_status,
    result = final_result,
    last_error = left(p_error, 500),
    claimed_at = null,
    claimed_by = null,
    updated_at = at_effective
  where id = rec.id;

  insert into public.push_delivery_logs (
    outbox_id, household_id, delivery_type, occurrence_ref,
    user_id, subscription_id, attempt, outcome, http_status, created_at
  ) values (
    rec.id, rec.household_id, rec.delivery_type, rec.occurrence_ref,
    rec.user_id, rec.subscription_id, rec.attempts,
    final_result, p_http_status, at_effective
  );

  if final_result = 'gone' and rec.subscription_id is not null then
    delete from public.push_subscriptions where id = rec.subscription_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', final_status,
    'result', final_result
  );
end;
$$;

revoke all on function public.complete_push_outbox_attempt(uuid, text, integer, text, timestamptz) from public;

create or replace function public.cleanup_push_delivery_logs(
  p_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  at_effective timestamptz := public.mutation_at(p_at);
  deleted_count integer;
begin
  delete from public.push_delivery_logs
  where created_at < at_effective - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_push_delivery_logs(timestamptz) from public;

-- ---------------------------------------------------------------------------
-- Hook interrupt → cancel unsent dose pushes
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
  from_slot text;
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
  order by vv.effective_from desc, vv.created_at desc, vv.id desc
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

  from_slot := public.local_time_hhmm_in_household(at_effective);
  perform public.cancel_unsent_dose_push(
    hid, p_medication_id, today_date, from_slot, at_effective
  );

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

-- Edge Function (service_role) needs EXECUTE; role may be absent in local stub DBs.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.enqueue_due_push_deliveries(timestamptz) to service_role;
    grant execute on function public.claim_push_outbox_batch(integer, text, timestamptz) to service_role;
    grant execute on function public.complete_push_outbox_attempt(uuid, text, integer, text, timestamptz) to service_role;
    grant execute on function public.cleanup_push_delivery_logs(timestamptz) to service_role;
    grant execute on function public.dose_push_still_deliverable(text, timestamptz) to service_role;
    grant execute on function public.cancel_unsent_dose_push(uuid, uuid, date, text, timestamptz) to service_role;
  end if;
end;
$$;
