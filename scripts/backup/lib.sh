#!/usr/bin/env bash
# Shared helpers for backup scripts. Never print secrets.
set -euo pipefail

die() {
  echo "backup: $*" >&2
  exit 1
}

log() {
  echo "backup: $*" >&2
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

require_database_url() {
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is required"
}

require_age_public_key() {
  [[ -n "${BACKUP_AGE_PUBLIC_KEY:-}" ]] || die "BACKUP_AGE_PUBLIC_KEY is required"
  case "$BACKUP_AGE_PUBLIC_KEY" in
    age1*) ;;
    *) die "BACKUP_AGE_PUBLIC_KEY must be an age recipient (age1…)" ;;
  esac
}
