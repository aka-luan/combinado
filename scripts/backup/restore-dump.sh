#!/usr/bin/env bash
# Decrypt an age artifact and restore into DATABASE_URL (disposable target).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/scripts/backup/lib.sh"

usage() {
  echo "Usage: DATABASE_URL=... AGE_IDENTITY_FILE=... $0 <backup.tar.gz.age>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
AGE_FILE="$1"

require_cmd age
require_cmd gzip
require_cmd tar
require_cmd psql
require_database_url

[[ -f "$AGE_FILE" ]] || die "artifact missing"
[[ -n "${AGE_IDENTITY_FILE:-}" ]] || die "AGE_IDENTITY_FILE is required"
[[ -f "$AGE_IDENTITY_FILE" ]] || die "AGE_IDENTITY_FILE not found"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

log "decrypting artifact"
age -d -i "$AGE_IDENTITY_FILE" -o "$tmp/dump.tar.gz" "$AGE_FILE"

log "extracting"
gzip -dc "$tmp/dump.tar.gz" >"$tmp/dump.tar"
mkdir -p "$tmp/dump"
tar -C "$tmp/dump" -xf "$tmp/dump.tar"

[[ -f "$tmp/dump/schema.sql" ]] || die "schema.sql missing after decrypt"
[[ -f "$tmp/dump/data.sql" ]] || die "data.sql missing after decrypt"

log "ensuring auth stub exists on target"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/tests/sql/auth_stub.sql" >/dev/null

log "resetting public schema on target"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
drop schema if exists public cascade;
create schema public;
grant all on schema public to postgres;
grant all on schema public to public;
grant usage on schema public to anon, authenticated;
" >/dev/null

log "applying roles (best effort)"
set +e
psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$tmp/dump/roles.sql" >/dev/null 2>"$tmp/roles_restore.err"
set -e

log "applying public schema"
# pg_dump emits CREATE SCHEMA public; target already has a clean public schema.
grep -v -E '^CREATE SCHEMA public;' "$tmp/dump/schema.sql" >"$tmp/schema.filtered.sql" || true
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$tmp/schema.filtered.sql" >/dev/null

if [[ -f "$tmp/dump/auth_users.sql" ]]; then
  log "applying auth.users rows"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$tmp/dump/auth_users.sql" >/dev/null
fi

log "applying public data"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$tmp/dump/data.sql" >/dev/null

log "restore complete"
