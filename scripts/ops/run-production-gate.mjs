#!/usr/bin/env node
/**
 * Run the automated half of the two-iPhone production gate (issue #15 / PRD §21).
 *
 * Verifies catalog evidence paths, then runs typecheck + unit + RLS (+ optional
 * full build/e2e when COMBINADO_GATE_FULL=1). Manual iPhone rows stay in
 * docs/production-gate.md.
 *
 *   COMBINADO_REQUIRE_RLS=1 DATABASE_URL=postgres://… node scripts/ops/run-production-gate.mjs
 *   COMBINADO_GATE_FULL=1 …  # also build + e2e
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

const {
  PRODUCTION_GATE_CHECKS,
  formatProductionGateCatalog,
  missingEvidencePaths,
  requiredEvidencePaths,
  evaluateGateReadiness,
} = await import(pathToFileURL(join(root, "src/lib/ops/production-gate.ts")).href);

const present = new Set(
  requiredEvidencePaths().filter((rel) => existsSync(join(root, rel))),
);
const missing = missingEvidencePaths(present);

process.stdout.write(formatProductionGateCatalog() + "\n\n");

if (missing.length > 0) {
  console.error("Missing evidence paths:\n" + missing.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("Catalog evidence paths: OK");

function run(label, command, args, env = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`${label} failed with status ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

run("typecheck", "pnpm", ["run", "typecheck"]);
run("unit", "pnpm", ["run", "test:unit"]);

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
run("rls", "pnpm", ["run", "test:rls"], {
  DATABASE_URL: databaseUrl,
  COMBINADO_REQUIRE_RLS: "1",
});

const full = process.env.COMBINADO_GATE_FULL === "1";
if (full) {
  run("build", "pnpm", ["run", "build"]);
  run("e2e", "pnpm", ["run", "test:e2e"]);
} else {
  console.log("\n(Skipping build/e2e — set COMBINADO_GATE_FULL=1 for the full automated gate.)");
}

const readiness = evaluateGateReadiness({
  presentEvidencePaths: present,
  automatedSuitesPassed: true,
  // Manual blockers remain open until humans complete docs/production-gate.md.
  manualBlockersOpen: PRODUCTION_GATE_CHECKS.filter((c) => c.kind === "manual").map(
    (c) => c.id,
  ),
  releaseExceptionsInPrd: true,
});

console.log("\n==> Automated suites: PASSED");
console.log(`Gate decision (with manual rows still open): ${readiness.decision}`);
for (const reason of readiness.reasons) {
  console.log(`  - ${reason}`);
}
console.log("\nFill manual evidence in docs/production-gate.md before starting stabilization.");
process.exit(0);
