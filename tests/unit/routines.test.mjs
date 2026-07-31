import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWeeklyRoutineCreate,
} from "../../src/lib/household/routine-form.ts";
import {
  householdWriteErrorCopy,
  isHouseholdSetupNeeded,
  isSchemaMissingError,
  membershipMissingCopy,
  schemaMissingCopy,
  setupHomeCopy,
} from "../../src/lib/household/setup-home.ts";

test("normalizeWeeklyRoutineCreate accepts full §8.5 confirmable routine", () => {
  const result = normalizeWeeklyRoutineCreate({
    title: "  Levar à escola  ",
    targetKind: "child",
    childId: "c1",
    weekdays: [4, 5],
    scheduledTime: "08:30",
    requiresConfirmation: true,
    defaultOwnerUserId: "u1",
    validFrom: "2026-07-30",
    validUntil: "2026-07-31",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, {
    title: "Levar à escola",
    targetKind: "child",
    childId: "c1",
    weekdays: [4, 5],
    scheduledTime: "08:30",
    requiresConfirmation: true,
    defaultOwnerUserId: "u1",
    validFrom: "2026-07-30",
    validUntil: "2026-07-31",
  });
});

test("normalizeWeeklyRoutineCreate rejects blank title", () => {
  const result = normalizeWeeklyRoutineCreate({
    title: "   ",
    targetKind: "casa",
    childId: null,
    weekdays: [1],
    scheduledTime: "09:00",
    requiresConfirmation: true,
    defaultOwnerUserId: null,
    validFrom: "2026-07-30",
    validUntil: null,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "title_required");
});

test("normalizeWeeklyRoutineCreate rejects informational routine with owner", () => {
  const result = normalizeWeeklyRoutineCreate({
    title: "Aviso",
    targetKind: "casa",
    childId: null,
    weekdays: [4],
    scheduledTime: null,
    requiresConfirmation: false,
    defaultOwnerUserId: "u1",
    validFrom: "2026-07-30",
    validUntil: null,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "informational_no_owner");
});

test("normalizeWeeklyRoutineCreate requires child id for child target", () => {
  const result = normalizeWeeklyRoutineCreate({
    title: "Escola",
    targetKind: "child",
    childId: null,
    weekdays: [4],
    scheduledTime: "08:00",
    requiresConfirmation: true,
    defaultOwnerUserId: null,
    validFrom: "2026-07-30",
    validUntil: null,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "child_required");
});

test("normalizeWeeklyRoutineCreate rejects empty weekdays", () => {
  const result = normalizeWeeklyRoutineCreate({
    title: "Escola",
    targetKind: "casa",
    childId: null,
    weekdays: [],
    scheduledTime: "08:00",
    requiresConfirmation: true,
    defaultOwnerUserId: null,
    validFrom: "2026-07-30",
    validUntil: null,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "weekdays_required");
});

test("setupHomeCopy covers child then weekly routine path", () => {
  const copy = setupHomeCopy();
  assert.match(copy, /Configurar casa/i);
  assert.match(copy, /criança/i);
  assert.match(copy, /rotina/i);
  assert.match(copy, /Hoje|hoje/);
});

test("isHouseholdSetupNeeded is true only with no active children", () => {
  assert.equal(isHouseholdSetupNeeded(0), true);
  assert.equal(isHouseholdSetupNeeded(1), false);
});

test("membership and schema gaps are distinct from the child+routine setup cue", () => {
  assert.match(membershipMissingCopy(), /bootstrap_household/);
  assert.doesNotMatch(membershipMissingCopy(), /Configurar casa/);
  assert.match(schemaMissingCopy(), /migrations/);
  assert.equal(isSchemaMissingError("PGRST202"), true);
  assert.equal(isSchemaMissingError(undefined, "household_missing"), false);
  assert.match(householdWriteErrorCopy("household_missing"), /bootstrap_household/);
});
