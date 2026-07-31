#!/usr/bin/env bash
# Verify representative household records after a disposable restore.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/scripts/backup/lib.sh"

require_cmd psql
require_database_url

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  households int;
  members int;
  children int;
begin
  select count(*) into households from public.households;
  select count(*) into members from public.household_members where archived_at is null;
  select count(*) into children from public.children;

  if households < 1 then
    raise exception 'restore verify: expected at least one household';
  end if;
  if members < 2 then
    raise exception 'restore verify: expected at least two active Adultos, got %', members;
  end if;
  if children < 1 then
    raise exception 'restore verify: expected at least one child row';
  end if;

  raise notice 'restore verify OK (households=%, adults=%, children=%)',
    households, members, children;
end
$$;
SQL
