import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isConfirmableRoutine,
  isEditableEvent,
  isReversibleRoutine,
} from "../../src/lib/agenda/presentation.ts";
import { normalizeOneOffEventEdit } from "../../src/lib/household/event-form.ts";
import { runWithSeparatedPhases } from "../../src/lib/pwa/action-phases.ts";

const routine = {
  key: "routine:routine-1:2026-08-01",
  source: "routine",
  source_id: "routine-1",
  local_date: "2026-08-01",
  slot: null,
  title: "Levar à escola",
  target_kind: "child",
  child_id: "child-1",
  target_label: "Mia",
  scheduled_time: "08:30",
  requires_confirmation: true,
  owner_user_id: "adult-2",
  owner_display_name: "Beto",
  status: "late",
  needs_owner_alert: false,
};

test("Rotina confirmável follows the Hoje Registro action rules", () => {
  assert.equal(isConfirmableRoutine(routine, "today"), true);
  assert.equal(isConfirmableRoutine(routine, "tomorrow"), false);
  assert.equal(isConfirmableRoutine({ ...routine, requires_confirmation: false }, "today"), false);
  assert.equal(isConfirmableRoutine({ ...routine, status: "completed" }, "today"), false);
});

test("completed Rotina remains correctable only on Hoje", () => {
  const completed = { ...routine, status: "completed", confirmation_id: "completion-1" };
  assert.equal(isReversibleRoutine(completed, "today"), true);
  assert.equal(isReversibleRoutine(completed, "tomorrow"), false);
  assert.equal(isReversibleRoutine({ ...completed, confirmation_id: null }, "today"), false);
});

test("future Event revision reuses the complete planning-field validation", () => {
  const result = normalizeOneOffEventEdit(
    {
      title: "Buscar Mia",
      localDate: "2026-08-02",
      targetKind: "child",
      childId: "child-1",
      scheduledTime: "17:30",
      requiresConfirmation: true,
      responsibleUserId: "adult-1",
    },
    "2026-08-01",
  );
  assert.deepEqual(result, {
    ok: true,
    data: {
      title: "Buscar Mia",
      localDate: "2026-08-02",
      targetKind: "child",
      childId: "child-1",
      scheduledTime: "17:30",
      requiresConfirmation: true,
      responsibleUserId: "adult-1",
    },
  });
});

test("Event revision rejects a date before Hoje", () => {
  assert.deepEqual(
    normalizeOneOffEventEdit(
      {
        title: "Buscar Mia",
        localDate: "2026-07-31",
        targetKind: "casa",
        childId: null,
        scheduledTime: null,
        requiresConfirmation: false,
        responsibleUserId: null,
      },
      "2026-08-01",
    ),
    { ok: false, error: "date_in_past" },
  );
});

test("future Event editing is limited to an uncompleted Amanhã occurrence", () => {
  const event = {
    ...routine,
    source: "event",
    status: "scheduled",
    planning_revision_id: "revision-1",
  };
  assert.equal(isEditableEvent(event, "tomorrow"), true);
  assert.equal(isEditableEvent(event, "today"), false);
  assert.equal(isEditableEvent({ ...event, status: "completed" }, "tomorrow"), false);
  assert.equal(isEditableEvent({ ...event, status: "cancelled" }, "tomorrow"), false);
});

test("Registro feedback starts before persistence and ends after the server result", async () => {
  const phases = [];
  let clock = 0;
  const result = await runWithSeparatedPhases({
    onImmediateFeedback: () => phases.push("Registrando…"),
    persist: async () => {
      phases.push("database");
      return "persisted";
    },
    now: () => ++clock,
  });
  assert.deepEqual(phases, ["Registrando…", "database"]);
  assert.equal(result.result, "persisted");
  assert.ok(result.marks.persistenceStartedAt > result.marks.feedbackAt);
  assert.ok(result.marks.persistenceEndedAt > result.marks.persistenceStartedAt);
});

test("persistence failure does not produce a completed phase", async () => {
  const phases = [];
  await assert.rejects(
    runWithSeparatedPhases({
      onImmediateFeedback: () => phases.push("Registrando…"),
      persist: async () => {
        phases.push("database");
        throw new Error("write_failed");
      },
    }),
    /write_failed/,
  );
  assert.deepEqual(phases, ["Registrando…", "database"]);
});
