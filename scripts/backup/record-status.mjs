#!/usr/bin/env node
/**
 * Record backup run / restore rehearsal status via psql without echoing secrets.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/backup/record-status.mjs success
 *   DATABASE_URL=... node scripts/backup/record-status.mjs failure dump_failed
 *   DATABASE_URL=... node scripts/backup/record-status.mjs restore_rehearsal
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

async function loadRedact() {
  const mod = await import(pathToFileURL(join(root, "src/lib/backup/redact.ts")).href);
  return mod.redactBackupLog;
}

function usage() {
  console.error(
    "Usage: DATABASE_URL=... node scripts/backup/record-status.mjs <success|failure|restore_rehearsal> [error_code]",
  );
  process.exit(2);
}

const mode = process.argv[2];
const errorCode = process.argv[3] ?? null;
if (!mode || !["success", "failure", "restore_rehearsal"].includes(mode)) usage();
if (mode === "failure" && (!errorCode || !/^[a-z][a-z0-9_]{0,63}$/.test(errorCode))) {
  console.error("failure requires a short operational error_code");
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

let sql;
if (mode === "restore_rehearsal") {
  sql = "select public.record_backup_restore_rehearsal(now());";
} else if (mode === "success") {
  sql = "select public.record_backup_run('success', null, now());";
} else {
  sql = `select public.record_backup_run('failure', '${errorCode}', now());`;
}

const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
  encoding: "utf8",
});

const redactBackupLog = await loadRedact();
if (result.stdout) process.stdout.write(redactBackupLog(result.stdout));
if (result.stderr) process.stderr.write(redactBackupLog(result.stderr));
if (result.status !== 0) process.exit(result.status ?? 1);
console.error(`backup: recorded ${mode}`);
