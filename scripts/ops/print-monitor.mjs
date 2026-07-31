#!/usr/bin/env node
/**
 * Print the administrative ops monitor snapshot (issue #14 / PRD §21).
 *
 * Requires DATABASE_URL with a role that can execute get_ops_monitor_snapshot
 * (service role / table owner). Never prints family content.
 *
 *   DATABASE_URL=postgres://… node scripts/ops/print-monitor.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = "select public.get_ops_monitor_snapshot()::text;";
const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
  encoding: "utf8",
});
if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const raw = (result.stdout || "").trim();
let row;
try {
  row = JSON.parse(raw);
} catch {
  console.error("Could not parse ops snapshot JSON");
  process.exit(1);
}

const { parseAdminMonitorSnapshot, formatAdminMonitorReport } = await import(
  pathToFileURL(join(root, "src/lib/ops/admin-monitor.ts")).href
);

const snapshot = parseAdminMonitorSnapshot(row);
process.stdout.write(formatAdminMonitorReport(snapshot) + "\n");
