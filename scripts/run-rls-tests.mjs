#!/usr/bin/env node
/**
 * Applies auth stub + migrations against DATABASE_URL (default local CI Postgres)
 * and runs tests/sql/rls_household.sql.
 *
 * Usage:
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node scripts/run-rls-tests.mjs
 *
 * Outside CI, skips cleanly when Postgres/psql is unavailable.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const requireDb = process.env.CI === "true" || process.env.COMBINADO_REQUIRE_RLS === "1";

function psqlAvailable() {
  const which = spawnSync("psql", ["--version"], { encoding: "utf8" });
  if (which.status !== 0) return false;
  const ping = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", "select 1"], {
    encoding: "utf8",
  });
  return ping.status === 0;
}

if (!psqlAvailable()) {
  if (requireDb) {
    console.error("RLS tests require psql and a reachable DATABASE_URL in CI.");
    process.exit(1);
  }
  console.warn("Skipping RLS tests (psql/Postgres unavailable). Set COMBINADO_REQUIRE_RLS=1 to force.");
  process.exit(0);
}

function psql(file) {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", file],
    { encoding: "utf8" },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function psqlGrant() {
  // Migration already grants production privileges; re-apply for idempotent local runs
  // and ensure anon can attempt selects under RLS in the stub environment.
  const sql = `
grant select on all tables in schema public to authenticated, anon;
grant insert, update on table public.children to authenticated;
revoke delete on table public.children from authenticated;
grant usage, select on all sequences in schema public to authenticated;
`;
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

psql(join(root, "tests/sql/auth_stub.sql"));

const migrationsDir = join(root, "supabase/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

for (const name of migrations) {
  psql(join(migrationsDir, name));
}

psqlGrant();
psql(join(root, "tests/sql/rls_household.sql"));
console.log("RLS tests OK");
