#!/usr/bin/env bash
# Dump roles, schema, and data for Combinado household backup (PRD §16).
# Writes plaintext only under OUT_DIR (never upload this directory).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/scripts/backup/lib.sh"

usage() {
  echo "Usage: DATABASE_URL=... $0 <out_dir>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
OUT_DIR="$1"
mkdir -p "$OUT_DIR"

require_cmd pg_dump
require_cmd pg_dumpall
require_cmd psql
require_database_url

log "dumping roles"
# Supabase Free often denies full pg_dumpall; household schema+data still ship.
# A roles stub is recorded so restore remains best effort without failing the job.
set +e
pg_dumpall --roles-only --no-role-passwords -d "$DATABASE_URL" >"$OUT_DIR/roles.sql" 2>"$OUT_DIR/roles.err"
roles_rc=$?
set -e
if [[ $roles_rc -ne 0 ]]; then
  log "roles dump incomplete (exit $roles_rc); continuing with schema+data"
  {
    echo "-- roles dump incomplete; see automation logs (redacted)"
    echo "-- exit_code=$roles_rc"
  } >"$OUT_DIR/roles.sql"
fi

log "dumping public schema"
pg_dump --schema-only --no-owner --no-acl -n public -d "$DATABASE_URL" -f "$OUT_DIR/schema.sql"

log "dumping auth.users (ids only; needed for membership FKs)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c \
  "select 'insert into auth.users (id, email) values (' || quote_literal(id::text) || '::uuid, null) on conflict (id) do nothing;' from auth.users;" \
  >"$OUT_DIR/auth_users.sql"

log "dumping public data"
pg_dump --data-only --no-owner --no-acl -n public -d "$DATABASE_URL" -f "$OUT_DIR/data.sql"

printf '%s\n' "roles.sql" "schema.sql" "auth_users.sql" "data.sql" >"$OUT_DIR/MANIFEST.txt"
log "dump complete under $(basename "$OUT_DIR")"
