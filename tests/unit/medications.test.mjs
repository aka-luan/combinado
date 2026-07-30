import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMedicationCreate } from "../../src/lib/household/medication-form.ts";
import {
  isConfirmableDose,
  minutesUntilSlot,
  needsEarlyConfirmationAck,
  statusLabel,
} from "../../src/lib/agenda/presentation.ts";
import { parseAgendaSnapshot } from "../../src/lib/agenda/parse.ts";

test("normalizeMedicationCreate accepts unique HH:mm slots and optional instruction", () => {
  const result = normalizeMedicationCreate({
    childId: "c1",
    name: "  Amoxicilina  ",
    instruction: "  com água  ",
    slots: ["20:00", "08:00", "08:00"],
    validFrom: "2026-07-30",
    validUntil: null,
  });
  // duplicate in input should fail before sort
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "duplicate_slots");

  const ok = normalizeMedicationCreate({
    childId: "c1",
    name: "  Amoxicilina  ",
    instruction: "  com água  ",
    slots: ["20:00", "08:00"],
    validFrom: "2026-07-30",
    validUntil: "2026-08-05",
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.deepEqual(ok.data, {
    childId: "c1",
    name: "Amoxicilina",
    instruction: "com água",
    slots: ["08:00", "20:00"],
    validFrom: "2026-07-30",
    validUntil: "2026-08-05",
  });
});

test("normalizeMedicationCreate requires child, name, slots, and valid range", () => {
  assert.equal(
    normalizeMedicationCreate({
      childId: "",
      name: "X",
      instruction: null,
      slots: ["08:00"],
      validFrom: "2026-07-30",
      validUntil: null,
    }).ok,
    false,
  );
  assert.equal(
    normalizeMedicationCreate({
      childId: "c1",
      name: " ",
      instruction: null,
      slots: ["08:00"],
      validFrom: "2026-07-30",
      validUntil: null,
    }).ok,
    false,
  );
  const range = normalizeMedicationCreate({
    childId: "c1",
    name: "X",
    instruction: null,
    slots: ["08:00"],
    validFrom: "2026-07-30",
    validUntil: "2026-07-29",
  });
  assert.equal(range.ok, false);
  if (!range.ok) assert.equal(range.error, "invalid_valid_range");
});

const doseOccurrence = {
  key: "medication:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-07-30:20:00",
  source: "medication",
  source_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  local_date: "2026-07-30",
  slot: "20:00",
  title: "Amoxicilina",
  target_kind: "child",
  child_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  target_label: "Mia",
  scheduled_time: "20:00",
  requires_confirmation: true,
  owner_user_id: null,
  owner_display_name: null,
  status: "scheduled",
  needs_owner_alert: false,
  instruction: "conforme receita",
};

test("parseAgendaSnapshot accepts medication source and dose statuses", () => {
  const snapshot = {
    server_time: "2026-07-30T12:00:00-03:00",
    timezone: "America/Sao_Paulo",
    version: "abc",
    today: {
      local_date: "2026-07-30",
      occurrences: [doseOccurrence],
      empty_message: null,
    },
    tomorrow: {
      local_date: "2026-07-31",
      reveal: false,
      count: 0,
      occurrences: [],
      empty_message: null,
    },
  };
  const parsed = parseAgendaSnapshot(snapshot);
  assert.ok(parsed);
  assert.equal(parsed.today.occurrences[0].source, "medication");
  assert.equal(statusLabel(doseOccurrence), "Programada");
  assert.equal(
    statusLabel({ ...doseOccurrence, status: "cancelled" }),
    "Cancelada por alteração",
  );
  assert.equal(statusLabel({ ...doseOccurrence, status: "unrecorded" }), "Sem registro");
  assert.equal(statusLabel({ ...doseOccurrence, status: "completed" }), "Confirmada");
});

test("early confirmation ack and confirmable day rules", () => {
  // 07:00 local vs 20:00 slot → >30 min early
  const earlyServer = "2026-07-30T10:00:00.000Z"; // 07:00 America/Sao_Paulo (UTC-3)
  assert.equal(minutesUntilSlot("20:00", earlyServer), 13 * 60);
  assert.equal(needsEarlyConfirmationAck(doseOccurrence, earlyServer), true);
  assert.equal(isConfirmableDose(doseOccurrence, "today"), true);
  assert.equal(isConfirmableDose(doseOccurrence, "tomorrow"), false);
  assert.equal(
    isConfirmableDose({ ...doseOccurrence, status: "unrecorded" }, "today"),
    false,
  );
});

test("undoDeadlineFromServer exposes a shared 10s window from server times", async () => {
  const { undoDeadlineFromServer } = await import("../../src/lib/agenda/presentation.ts");
  const confirmedAt = "2026-07-30T20:00:00.000Z";
  const within = undoDeadlineFromServer(confirmedAt, "2026-07-30T20:00:05.000Z");
  assert.ok(within !== null && within > Date.now());
  const expired = undoDeadlineFromServer(confirmedAt, "2026-07-30T20:00:11.000Z");
  assert.equal(expired, null);
});
