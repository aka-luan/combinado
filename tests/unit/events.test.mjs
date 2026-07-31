import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOneOffEventCreate } from "../../src/lib/household/event-form.ts";

const baseEvent = {
  title: "Buscar Mia",
  localDate: "2026-07-31",
  targetKind: "child",
  childId: "child-1",
  scheduledTime: "17:30",
  requiresConfirmation: true,
  responsibleUserId: "adult-1",
};

test("one-off events preserve an explicit Responsável, no Responsável, and Casa target", () => {
  const assigned = normalizeOneOffEventCreate(baseEvent, "2026-07-30");
  assert.deepEqual(assigned, { ok: true, data: baseEvent });

  const unassigned = normalizeOneOffEventCreate(
    { ...baseEvent, responsibleUserId: null },
    "2026-07-30",
  );
  assert.equal(unassigned.ok, true);
  if (unassigned.ok) assert.equal(unassigned.data.responsibleUserId, null);

  const casa = normalizeOneOffEventCreate(
    { ...baseEvent, targetKind: "casa", childId: null },
    "2026-07-30",
  );
  assert.equal(casa.ok, true);
  if (casa.ok) assert.equal(casa.data.targetKind, "casa");
});

test("informational events cannot carry a Responsável", () => {
  const result = normalizeOneOffEventCreate(
    { ...baseEvent, requiresConfirmation: false, responsibleUserId: "adult-1" },
    "2026-07-30",
  );
  assert.deepEqual(result, { ok: false, error: "informational_no_responsible" });
});

test("one-off events reject retroactive, invalid, and out-of-scope fields", () => {
  assert.deepEqual(
    normalizeOneOffEventCreate({ ...baseEvent, localDate: "2026-07-29" }, "2026-07-30"),
    { ok: false, error: "date_in_past" },
  );
  assert.deepEqual(
    normalizeOneOffEventCreate({ ...baseEvent, scheduledTime: "25:00" }, "2026-07-30"),
    { ok: false, error: "invalid_time" },
  );
  assert.deepEqual(
    normalizeOneOffEventCreate({ ...baseEvent, title: "x".repeat(121) }, "2026-07-30"),
    { ok: false, error: "title_too_long" },
  );
});
