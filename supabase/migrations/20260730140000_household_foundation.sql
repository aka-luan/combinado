-- M1 foundation: singleton household, membership, children (issue #4 / PRD §§3, 15.1).
-- Casa is intentionally not a row — see public.casa_target_label() and app constant.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Exactly one household in v1.
  singleton boolean not null default true,
  constraint households_singleton_true check (singleton = true),
  constraint households_singleton_unique unique (singleton)
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_display_name_nonempty check (length(trim(display_name)) > 0)
);

create unique index if not exists household_members_user_id_uidx
  on public.household_members (user_id);

create index if not exists household_members_household_id_idx
  on public.household_members (household_id);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint children_name_nonempty check (char_length(name) > 0)
);

create index if not exists children_household_id_idx
  on public.children (household_id);

create index if not exists children_household_active_idx
  on public.children (household_id)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- Name normalization (trim; reject empty)
-- ---------------------------------------------------------------------------

create or replace function public.normalize_person_name(raw text)
returns text
language sql
immutable
as $$
  select nullif(btrim(raw), '');
$$;

create or replace function public.children_normalize_name()
returns trigger
language plpgsql
as $$
declare
  normalized text;
begin
  normalized := public.normalize_person_name(new.name);
  if normalized is null then
    raise exception 'child name must be non-empty after trim';
  end if;
  new.name := normalized;
  return new;
end;
$$;

create or replace function public.children_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists children_normalize_name_trg on public.children;
create trigger children_normalize_name_trg
  before insert or update of name on public.children
  for each row
  execute function public.children_normalize_name();

drop trigger if exists children_touch_updated_at_trg on public.children;
create trigger children_touch_updated_at_trg
  before update on public.children
  for each row
  execute function public.children_touch_updated_at();

create or replace function public.household_members_normalize_name()
returns trigger
language plpgsql
as $$
declare
  normalized text;
begin
  normalized := public.normalize_person_name(new.display_name);
  if normalized is null then
    raise exception 'display name must be non-empty after trim';
  end if;
  new.display_name := normalized;
  return new;
end;
$$;

drop trigger if exists household_members_normalize_name_trg on public.household_members;
create trigger household_members_normalize_name_trg
  before insert or update of display_name on public.household_members
  for each row
  execute function public.household_members_normalize_name();

-- ---------------------------------------------------------------------------
-- Casa: fixed shared target (not a user-editable record)
-- ---------------------------------------------------------------------------

create or replace function public.casa_target_label()
returns text
language sql
immutable
as $$
  select 'Casa'::text;
$$;

comment on function public.casa_target_label() is
  'Fixed shared target label (PRD §3). Not stored as a child row.';

-- ---------------------------------------------------------------------------
-- Membership helpers (indexed lookups via household_members_user_id_uidx)
-- ---------------------------------------------------------------------------

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = target_household_id
      and m.user_id = auth.uid()
      and m.archived_at is null
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = auth.uid()
    and m.archived_at is null
  limit 1;
$$;

revoke all on function public.current_household_id() from public;
grant execute on function public.current_household_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Idempotent bootstrap: one household + exactly the two adults
-- ---------------------------------------------------------------------------

create or replace function public.bootstrap_household(
  adult_user_id_1 uuid,
  adult_display_name_1 text,
  adult_user_id_2 uuid,
  adult_display_name_2 text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  name1 text;
  name2 text;
begin
  if adult_user_id_1 is null or adult_user_id_2 is null then
    raise exception 'both adult user ids are required';
  end if;
  if adult_user_id_1 = adult_user_id_2 then
    raise exception 'adults must be two distinct users';
  end if;

  name1 := public.normalize_person_name(adult_display_name_1);
  name2 := public.normalize_person_name(adult_display_name_2);
  if name1 is null or name2 is null then
    raise exception 'both adult display names are required';
  end if;

  select id into hid from public.households where singleton = true;
  if hid is null then
    insert into public.households (singleton) values (true) returning id into hid;
  end if;

  insert into public.household_members (household_id, user_id, display_name, archived_at)
  values (hid, adult_user_id_1, name1, null)
  on conflict (household_id, user_id) do update
    set display_name = excluded.display_name,
        archived_at = null;

  insert into public.household_members (household_id, user_id, display_name, archived_at)
  values (hid, adult_user_id_2, name2, null)
  on conflict (household_id, user_id) do update
    set display_name = excluded.display_name,
        archived_at = null;

  -- Exactly the two authorized adults remain active (PRD §3 / issue #4).
  update public.household_members
  set archived_at = coalesce(archived_at, now())
  where household_id = hid
    and user_id not in (adult_user_id_1, adult_user_id_2)
    and archived_at is null;

  if (
    select count(*)
    from public.household_members
    where household_id = hid
      and archived_at is null
  ) <> 2 then
    raise exception 'household must have exactly two active adults after bootstrap';
  end if;

  return hid;
end;
$$;

revoke all on function public.bootstrap_household(uuid, text, uuid, text) from public;
-- Callable from SQL Editor / service role only (not granted to authenticated).

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.children enable row level security;

drop policy if exists "Members read singleton household" on public.households;
create policy "Members read singleton household"
  on public.households
  for select
  to authenticated
  using (public.is_household_member(id));

-- No insert/update/delete for authenticated — bootstrap is security definer.

drop policy if exists "Members read household members" on public.household_members;
create policy "Members read household members"
  on public.household_members
  for select
  to authenticated
  using (public.is_household_member(household_id));

-- Member rows are provisioned by bootstrap; adults do not self-insert.

drop policy if exists "Members manage children" on public.children;
drop policy if exists "Members select children" on public.children;
drop policy if exists "Members insert children" on public.children;
drop policy if exists "Members update children" on public.children;

create policy "Members select children"
  on public.children
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy "Members insert children"
  on public.children
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and household_id = public.current_household_id()
  );

create policy "Members update children"
  on public.children
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (
    public.is_household_member(household_id)
    and household_id = public.current_household_id()
  );

-- No DELETE policy: archival preserves identity (issue #4 AC). Hard deletes
-- remain service-role / owner only.

-- Privileges for the PostgREST roles (required even with RLS enabled).
grant select on table public.households to authenticated;
grant select on table public.household_members to authenticated;
grant select, insert, update on table public.children to authenticated;
revoke delete on table public.children from authenticated;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.current_household_id() to authenticated;
grant execute on function public.casa_target_label() to authenticated;
grant execute on function public.normalize_person_name(text) to authenticated;
-- bootstrap_household: no grant to authenticated (Studio / service role only).
