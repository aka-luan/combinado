#!/usr/bin/env bash
# Wrap a command, redact secrets from stdout/stderr, preserve exit code.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 2
fi

out="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$out" "$err"' EXIT

set +e
"$@" >"$out" 2>"$err"
rc=$?
set -e

export COMBINADO_REDACT_OUT="$out"
export COMBINADO_REDACT_ERR="$err"
export COMBINADO_REDACT_MODULE="$ROOT/src/lib/backup/redact.ts"

NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--experimental-strip-types" \
  node --input-type=module <<'EOF'
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { redactBackupLog } = await import(pathToFileURL(process.env.COMBINADO_REDACT_MODULE).href);
const out = readFileSync(process.env.COMBINADO_REDACT_OUT, "utf8");
const err = readFileSync(process.env.COMBINADO_REDACT_ERR, "utf8");
if (out) process.stdout.write(redactBackupLog(out));
if (err) process.stderr.write(redactBackupLog(err));
EOF

exit "$rc"
