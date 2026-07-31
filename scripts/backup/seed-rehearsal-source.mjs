#!/usr/bin/env node
/**
 * Seed a disposable source database with a representative Casa for restore rehearsal.
 * Applies auth stub + migrations, then one household, two Adults, and one child.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

function psqlFile(file) {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", file],
    { encoding: "utf8" },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function psqlSql(sql) {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

psqlSql(`
drop schema if exists public cascade;
create schema public;
drop schema if exists auth cascade;
`);
psqlFile(join(root, "tests/sql/auth_stub.sql"));

const migrationsDir = join(root, "supabase/migrations");
for (const name of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort()) {
  psqlFile(join(migrationsDir, name));
}

psqlSql(`
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'a2@example.com')
on conflict (id) do nothing;

select public.bootstrap_household(
  '11111111-1111-1111-1111-111111111111'::uuid,
  'Ana',
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Beto'
);

insert into public.children (household_id, name)
select id, 'Mia' from public.households limit 1;
`);

console.error("backup: rehearsal source seeded");
