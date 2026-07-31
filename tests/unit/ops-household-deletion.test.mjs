import { test } from "node:test";
import assert from "node:assert/strict";
import { planHouseholdDeletion } from "../../src/lib/ops/household-deletion.ts";

test("planHouseholdDeletion invalidates sessions/subscriptions and documents backup expiry", () => {
  const plan = planHouseholdDeletion();
  assert.equal(plan.confirmationToken, "DELETE_CASA");
  assert.equal(plan.invalidatesSessions, true);
  assert.equal(plan.removesSubscriptions, true);
  assert.match(plan.backupExpiryNote, /7 dias/);
  assert.match(plan.backupExpiryNote, /expir/i);
});
