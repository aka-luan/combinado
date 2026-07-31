#!/usr/bin/env bash
# Compress and age-encrypt a dump directory. Uploads must use only the .age file.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/scripts/backup/lib.sh"

usage() {
  echo "Usage: BACKUP_AGE_PUBLIC_KEY=... $0 <dump_dir> <out_file.age>" >&2
  exit 2
}

[[ $# -eq 2 ]] || usage
DUMP_DIR="$1"
OUT_AGE="$2"

require_cmd tar
require_cmd gzip
require_cmd age
require_age_public_key

[[ -d "$DUMP_DIR" ]] || die "dump dir missing"
[[ -f "$DUMP_DIR/MANIFEST.txt" ]] || die "MANIFEST.txt missing"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

log "compressing dump"
tar -C "$DUMP_DIR" -cf "$tmp/dump.tar" .
gzip -n "$tmp/dump.tar"

log "encrypting with age (public key only)"
age -r "$BACKUP_AGE_PUBLIC_KEY" -o "$OUT_AGE" "$tmp/dump.tar.gz"

[[ -f "$OUT_AGE" ]] || die "encrypted artifact missing"
# Refuse accidental plaintext sibling upload names.
case "$OUT_AGE" in
  *.sql|*.sql.gz|*.tar|*.tar.gz) die "refusing non-.age output path" ;;
esac

log "encrypted artifact ready"
