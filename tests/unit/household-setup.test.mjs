import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasUsefulHouseholdSetup,
  isActiveConfigurationOnDate,
  isHouseholdSetupNeeded,
} from "../../src/lib/household/setup-home.ts";

test("the first-access gate requires a child and one useful configuration", () => {
  assert.equal(
    hasUsefulHouseholdSetup({
      activeChildCount: 0,
      activeRoutineCount: 1,
      activeMedicationCount: 0,
    }),
    false,
  );
  assert.equal(
    hasUsefulHouseholdSetup({
      activeChildCount: 1,
      activeRoutineCount: 0,
      activeMedicationCount: 0,
    }),
    false,
  );
  assert.equal(
    hasUsefulHouseholdSetup({
      activeChildCount: 1,
      activeRoutineCount: 1,
      activeMedicationCount: 0,
    }),
    true,
  );
  assert.equal(
    hasUsefulHouseholdSetup({
      activeChildCount: 1,
      activeRoutineCount: 0,
      activeMedicationCount: 1,
    }),
    true,
  );
});

test("the setup predicate remains compatible with the old child-only caller", () => {
  assert.equal(isHouseholdSetupNeeded(1, 0), true);
  assert.equal(isHouseholdSetupNeeded(1, 1), false);
});

test("only configurations active on the household date count toward the gate", () => {
  assert.equal(isActiveConfigurationOnDate("2026-08-01", null, "2026-08-01"), true);
  assert.equal(isActiveConfigurationOnDate("2026-08-02", null, "2026-08-01"), false);
  assert.equal(isActiveConfigurationOnDate("2026-07-01", "2026-08-01", "2026-08-01"), true);
  assert.equal(isActiveConfigurationOnDate("2026-07-01", "2026-07-31", "2026-08-01"), false);
});
