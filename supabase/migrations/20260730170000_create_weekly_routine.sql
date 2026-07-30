-- Issue #16: authenticated create for weekly routines (PWA setup path).
-- Mirrors seed_weekly_routine invariants but binds to current_household_id().

create or replace function public.create_weekly_routine(
  p_title text,
  p_target_kind text,
  p_child_id uuid,
  p_weekdays smallint[],
  p_scheduled_time text,
  p_requires_confirmation boolean,
  p_default_owner_user_id uuid,
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
  rid uuid;
  title_norm text;
  time_norm text;
  requires_conf boolean;
  owner_id uuid;
begin
  hid := public.current_household_id();
  if hid is null then
    raise exception 'household_missing' using errcode = 'P0001';
  end if;

  title_norm := nullif(btrim(p_title), '');
  if title_norm is null then
    raise exception 'title_required' using errcode = 'P0001';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from_required' using errcode = 'P0001';
  end if;

  if p_weekdays is null or cardinality(p_weekdays) = 0 then
    raise exception 'weekdays_required' using errcode = 'P0001';
  end if;

  if p_target_kind is distinct from 'casa' and p_target_kind is distinct from 'child' then
    raise exception 'invalid_target_kind' using errcode = 'P0001';
  end if;

  if p_target_kind = 'casa' then
    if p_child_id is not null then
      raise exception 'casa_target_has_child' using errcode = 'P0001';
    end if;
  else
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
  end if;

  requires_conf := coalesce(p_requires_confirmation, true);
  owner_id := p_default_owner_user_id;

  if not requires_conf and owner_id is not null then
    raise exception 'informational_no_owner' using errcode = 'P0001';
  end if;

  if owner_id is not null and not exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = owner_id
      and m.archived_at is null
  ) then
    raise exception 'owner_not_in_household' using errcode = 'P0001';
  end if;

  time_norm := nullif(btrim(coalesce(p_scheduled_time, '')), '');

  insert into public.weekly_routines (household_id)
  values (hid)
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
    hid,
    title_norm,
    p_target_kind,
    p_child_id,
    p_weekdays,
    time_norm,
    requires_conf,
    owner_id,
    p_valid_from,
    p_valid_until,
    p_valid_from
  );

  return rid;
end;
$$;

comment on function public.create_weekly_routine(
  text, text, uuid, smallint[], text, boolean, uuid, date, date
) is
  'Authenticated Adult creates a weekly routine + first version in their Casa (issue #16).';

revoke all on function public.create_weekly_routine(
  text, text, uuid, smallint[], text, boolean, uuid, date, date
) from public;
grant execute on function public.create_weekly_routine(
  text, text, uuid, smallint[], text, boolean, uuid, date, date
) to authenticated;
