import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePersonName } from "../../src/lib/household/names.ts";
import { CASA_TARGET, isCasaTarget, listSharedTargets } from "../../src/lib/household/targets.ts";
import { partitionChildren } from "../../src/lib/household/partition.ts";

test("normalizePersonName trims and rejects empty", () => {
  assert.equal(normalizePersonName("  Mia  "), "Mia");
  assert.equal(normalizePersonName("   "), null);
  assert.equal(normalizePersonName(""), null);
});

test("Casa is a fixed target, not a child id", () => {
  assert.equal(CASA_TARGET.kind, "casa");
  assert.equal(CASA_TARGET.label, "Casa");
  assert.equal(isCasaTarget(CASA_TARGET), true);
  const targets = listSharedTargets([{ id: "c1", name: "Mia" }]);
  assert.equal(targets[0].kind, "casa");
  assert.equal(targets[1].kind, "child");
  assert.equal(targets[1].childId, "c1");
});

test("partitionChildren separates active and archived without dropping identity", () => {
  const { active, archived } = partitionChildren([
    {
      id: "1",
      household_id: "h",
      name: "A",
      archived_at: null,
      active_from: "1900-01-01",
      created_at: "",
      updated_at: "",
    },
    {
      id: "2",
      household_id: "h",
      name: "B",
      archived_at: "2026-01-01T00:00:00Z",
      active_from: "1900-01-01",
      created_at: "",
      updated_at: "",
    },
  ]);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, "1");
  assert.equal(archived.length, 1);
  assert.equal(archived[0].id, "2");
  assert.equal(archived[0].name, "B");
});

test("partitionChildren keeps next-day reactivation archived for today", () => {
  const { active, archived } = partitionChildren(
    [
      {
        id: "future",
        household_id: "h",
        name: "Nina",
        archived_at: null,
        active_from: "2026-08-01",
        created_at: "",
        updated_at: "",
      },
    ],
    "2026-07-31",
  );
  assert.equal(active.length, 0);
  assert.equal(archived[0].id, "future");
});
