#!/usr/bin/env node
/**
 * Applies auth stub + migrations against DATABASE_URL (default local CI Postgres)
 * and runs tests/sql/rls_household.sql, agenda_snapshot.sql, weekly_routine_create.sql,
 * and medication_doses.sql.
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

function psqlSql(sql) {
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function psqlGrant() {
  // Migration already grants production privileges; re-apply for idempotent local runs
  // and ensure anon can attempt selects under RLS in the stub environment.
  psqlSql(`
grant select on all tables in schema public to authenticated, anon;
grant insert, update on table public.children to authenticated;
revoke delete on table public.children from authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.household_agenda_snapshot(timestamptz) to authenticated;
grant execute on function public.household_timezone() to authenticated;
grant execute on function public.local_date_in_household(timestamptz) to authenticated;
grant execute on function public.occurrence_key(text, uuid, date, text) to authenticated;
grant execute on function public.create_weekly_routine(text, text, uuid, smallint[], text, boolean, uuid, date, date) to authenticated;
grant execute on function public.create_medication(uuid, text, text, text[], date, date) to authenticated;
grant execute on function public.confirm_dose(uuid, date, text, boolean, timestamptz) to authenticated;
grant execute on function public.reverse_dose_confirmation(uuid, timestamptz) to authenticated;
grant execute on function public.interrupt_medication_immediate(uuid, timestamptz) to authenticated;
grant execute on function public.derive_medication_occurrences_for_day(uuid, date, timestamptz) to authenticated;
grant execute on function public.create_one_off_event(text, text, uuid, date, text, boolean, uuid, timestamptz) to authenticated;
grant execute on function public.complete_one_off_event(uuid, timestamptz) to authenticated;
grant execute on function public.reverse_event_completion(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_one_off_event(uuid, timestamptz) to authenticated;
grant execute on function public.derive_one_off_event_occurrences_for_day(uuid, date, timestamptz) to authenticated;
`);
}

// Fresh schemas so migrations are not blocked by leftover policies from prior runs.
psqlSql(`
drop schema if exists public cascade;
create schema public;
grant all on schema public to postgres;
grant all on schema public to public;
drop schema if exists auth cascade;
`);

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
psql(join(root, "tests/sql/agenda_snapshot.sql"));
psql(join(root, "tests/sql/weekly_routine_create.sql"));
psql(join(root, "tests/sql/weekly_routine_planning.sql"));
psql(join(root, "tests/sql/household_maintenance.sql"));
psql(join(root, "tests/sql/medication_doses.sql"));
psql(join(root, "tests/sql/events.sql"));
console.log("RLS + agenda snapshot + weekly routine create + weekly routine planning + household maintenance + medication dose + event tests OK");
