-- RLS checks for household foundation (issue #4).
-- Expects auth stub + migrations applied. Run via scripts/run-rls-tests.mjs.

\set ON_ERROR_STOP on

do $$
declare
  adult1 uuid := '11111111-1111-1111-1111-111111111111';
  adult2 uuid := '22222222-2222-2222-2222-222222222222';
  outsider uuid := '33333333-3333-3333-3333-333333333333';
  adult3 uuid := '44444444-4444-4444-4444-444444444444';
  hid uuid;
  child_id uuid;
  n int;
  casa text;
begin
  insert into auth.users (id, email) values
    (adult1, 'a1@example.com'),
    (adult2, 'a2@example.com'),
    (outsider, 'out@example.com'),
    (adult3, 'a3@example.com')
  on conflict (id) do nothing;

  hid := public.bootstrap_household(adult1, 'Ana', adult2, 'Beto');
  if public.bootstrap_household(adult1, 'Ana', adult2, 'Beto') is distinct from hid then
    raise exception 'bootstrap is not idempotent';
  end if;

  -- A third adult via bootstrap with a different pair must archive the odd one out.
  perform public.bootstrap_household(adult1, 'Ana', adult3, 'Caio');
  select count(*) into n
  from public.household_members
  where household_id = hid and archived_at is null;
  if n <> 2 then
    raise exception 'bootstrap must keep exactly two active adults, got %', n;
  end if;
  if exists (
    select 1 from public.household_members
    where user_id = adult2 and archived_at is null
  ) then
    raise exception 'replaced adult2 should be archived';
  end if;
  -- Restore the canonical pair for the rest of the suite.
  perform public.bootstrap_household(adult1, 'Ana', adult2, 'Beto');

  casa := public.casa_target_label();
  if casa is distinct from 'Casa' then
    raise exception 'casa label mismatch: %', casa;
  end if;

  -- Unauthenticated: no rows.
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select count(*) into n from public.households;
  if n <> 0 then
    raise exception 'anon should not read households, got %', n;
  end if;
  select count(*) into n from public.children;
  if n <> 0 then
    raise exception 'anon should not read children, got %', n;
  end if;
  execute 'reset role';

  -- Outsider authenticated non-member: no access.
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.households;
  if n <> 0 then
    raise exception 'outsider should not read households, got %', n;
  end if;
  begin
    insert into public.children (household_id, name) values (hid, 'X');
    raise exception 'outsider insert should fail';
  exception
    when insufficient_privilege then
      null; -- expected RLS / privilege denial (42501)
    when others then
      if sqlerrm = 'outsider insert should fail' then
        raise;
      end if;
      if sqlstate = '42501' or sqlerrm ilike '%row-level security%' then
        null;
      else
        raise exception 'unexpected outsider insert error [%]: %', sqlstate, sqlerrm;
      end if;
  end;
  select count(*) into n from public.children;
  if n <> 0 then
    raise exception 'outsider should not see children after failed insert, got %', n;
  end if;
  execute 'reset role';

  -- Adult 1 can create/rename/archive; blank names rejected.
  perform set_config('request.jwt.claim.sub', adult1::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.children (household_id, name) values (hid, '   ');
    raise exception 'blank name should fail';
  exception
    when others then
      if sqlerrm = 'blank name should fail' then
        raise;
      end if;
      if sqlerrm ilike '%non-empty%' or sqlerrm ilike '%children_name%' then
        null;
      else
        raise exception 'unexpected blank name error [%]: %', sqlstate, sqlerrm;
      end if;
  end;

  insert into public.children (household_id, name)
  values (hid, '  Mia  ')
  returning id into child_id;

  if (select name from public.children where id = child_id) is distinct from 'Mia' then
    raise exception 'name was not trimmed';
  end if;

  update public.children set name = 'Mia Renomeada' where id = child_id;
  begin
    update public.children set archived_at = now() where id = child_id;
    raise exception 'direct child archival should fail';
  exception
    when others then
      if sqlerrm = 'direct child archival should fail'
        or sqlerrm not like '%child_maintenance_rpc_required%' then
        raise;
      end if;
  end;
  perform public.archive_child(child_id, now());

  if (select archived_at is not null from public.children where id = child_id) is not true then
    raise exception 'archive did not preserve child row';
  end if;

  -- Hard delete must not be permitted for authenticated members.
  begin
    delete from public.children where id = child_id;
    raise exception 'delete should fail';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm = 'delete should fail' then
        raise;
      end if;
      if sqlstate = '42501' or sqlerrm ilike '%row-level security%' then
        null;
      else
        raise exception 'unexpected delete error [%]: %', sqlstate, sqlerrm;
      end if;
  end;
  if not exists (select 1 from public.children where id = child_id) then
    raise exception 'child row was hard-deleted';
  end if;
  execute 'reset role';

  -- Adult 2 has equivalent read access to archived child (identity preserved).
  perform set_config('request.jwt.claim.sub', adult2::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.children where id = child_id and name = 'Mia Renomeada';
  if n <> 1 then
    raise exception 'adult2 cannot see archived child';
  end if;

  perform public.reactivate_child(child_id, now());
  insert into public.children (household_id, name) values (hid, 'Sam');
  select count(*) into n from public.children where archived_at is null;
  if n < 2 then
    raise exception 'adult2 cannot create/reactivate children';
  end if;
  execute 'reset role';

  raise notice 'RLS household tests passed';
end;
$$;
