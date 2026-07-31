#!/usr/bin/env bash
# End-to-end restoration rehearsal on a disposable database (ephemeral age key).
# Proves dump → compress → encrypt → decrypt → restore → verify without the offline private key.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/scripts/backup/lib.sh"

require_cmd age
require_cmd age-keygen
require_cmd psql
require_cmd pg_dump
require_database_url

SOURCE_URL="${DATABASE_URL}"
TARGET_URL="${RESTORE_DATABASE_URL:-}"
[[ -n "$TARGET_URL" ]] || die "RESTORE_DATABASE_URL is required for the disposable restore target"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

log "generating ephemeral age keypair for rehearsal only"
age-keygen -o "$work/rehearsal.key" >/dev/null 2>"$work/rehearsal.pub.raw"
# age-keygen prints the public key to stderr as "Public key: age1..."
BACKUP_AGE_PUBLIC_KEY="$(grep -oE 'age1[0-9a-z]+' "$work/rehearsal.pub.raw" | head -n1 || true)"
if [[ -z "$BACKUP_AGE_PUBLIC_KEY" ]]; then
  BACKUP_AGE_PUBLIC_KEY="$(age-keygen -y "$work/rehearsal.key")"
fi
export BACKUP_AGE_PUBLIC_KEY

mkdir -p "$work/dump"
log "dumping source"
DATABASE_URL="$SOURCE_URL" "$ROOT/scripts/backup/dump-household.sh" "$work/dump"

log "encrypting"
"$ROOT/scripts/backup/encrypt-dump.sh" "$work/dump" "$work/backup.tar.gz.age"

# Ensure plaintext dump is not mistaken for an upload candidate.
rm -rf "$work/dump"

log "restoring into disposable target"
AGE_IDENTITY_FILE="$work/rehearsal.key" DATABASE_URL="$TARGET_URL" \
  "$ROOT/scripts/backup/restore-dump.sh" "$work/backup.tar.gz.age"

log "verifying representative records"
DATABASE_URL="$TARGET_URL" "$ROOT/scripts/backup/verify-restore.sh"

log "restoration rehearsal OK"
