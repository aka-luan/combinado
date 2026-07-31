import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCTION_GATE_CHECKS,
  automatedGateChecks,
  requiredEvidencePaths,
  missingEvidencePaths,
  formatProductionGateCatalog,
  evaluateGateReadiness,
} from "../../src/lib/ops/production-gate.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function presentAtRoot() {
  return new Set(requiredEvidencePaths().filter((rel) => existsSync(join(root, rel))));
}

test("catalog covers every PRD §21 automated requirement id", () => {
  const ids = new Set(PRODUCTION_GATE_CHECKS.map((c) => c.id));
  for (const id of [
    "occurrence-rules",
    "versioning",
    "constraints",
    "rls",
    "concurrent-dose",
    "concurrent-commitment",
    "clock-19h",
    "clock-22h",
    "clock-midnight",
    "treatment-boundaries",
    "effective-dates",
    "offline-reconnect",
    "backup-restore-path",
  ]) {
    assert.ok(ids.has(id), `missing gate check ${id}`);
  }
});

test("every automated check lists at least one evidence path that exists in the repo", () => {
  const automated = automatedGateChecks();
  assert.ok(automated.length >= 10);
  for (const check of automated) {
    assert.ok(check.evidence.length > 0, `${check.id} has no evidence`);
    for (const rel of check.evidence) {
      assert.ok(existsSync(join(root, rel)), `${check.id}: missing ${rel}`);
    }
  }
  assert.deepEqual(missingEvidencePaths(presentAtRoot()), []);
});

test("requiredEvidencePaths is the unique union of automated and ops evidence", () => {
  const paths = requiredEvidencePaths();
  assert.ok(paths.includes("tests/sql/medication_doses.sql"));
  assert.ok(paths.includes("tests/sql/events.sql"));
  assert.ok(paths.includes("tests/sql/rls_household.sql"));
  assert.ok(paths.includes("tests/unit/sync-offline.test.mjs"));
  assert.ok(paths.includes("docs/runbook-ops.md"));
  assert.equal(new Set(paths).size, paths.length);
});

test("formatProductionGateCatalog lists ids and kinds without family content", () => {
  const text = formatProductionGateCatalog();
  assert.match(text, /occurrence-rules/);
  assert.match(text, /automated|manual|ops/);
  assert.doesNotMatch(text, /Mia|Dipirona|tomar com água/i);
});

test("evaluateGateReadiness is go only when automated evidence exists and manual blockers are unchecked", () => {
  const present = presentAtRoot();
  const ready = evaluateGateReadiness({
    presentEvidencePaths: present,
    automatedSuitesPassed: true,
    manualBlockersOpen: ["onboarding-iphone"],
    releaseExceptionsInPrd: true,
  });
  assert.equal(ready.decision, "hold");
  assert.ok(ready.reasons.some((r) => /onboarding-iphone/.test(r)));

  const go = evaluateGateReadiness({
    presentEvidencePaths: present,
    automatedSuitesPassed: true,
    manualBlockersOpen: [],
    releaseExceptionsInPrd: true,
  });
  assert.equal(go.decision, "go");
  assert.deepEqual(go.reasons, []);
});
