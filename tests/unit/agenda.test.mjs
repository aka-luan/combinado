import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgendaSnapshot } from "../../src/lib/agenda/parse.ts";
import {
  OWNER_ALERT_LABEL,
  isCancellableEvent,
  isConfirmableEvent,
  isReversibleEvent,
  ownerAlertPresentation,
  statusLabel,
  tomorrowView,
} from "../../src/lib/agenda/presentation.ts";

const sampleOccurrence = {
  key: "routine:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-07-30",
  source: "routine",
  source_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  local_date: "2026-07-30",
  slot: null,
  title: "Levar à escola",
  target_kind: "child",
  child_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  target_label: "Mia",
  scheduled_time: "08:30",
  requires_confirmation: true,
  owner_user_id: null,
  owner_display_name: null,
  status: "late",
  needs_owner_alert: true,
};

const sampleSnapshot = {
  server_time: "2026-07-30T22:00:00+00:00",
  timezone: "America/Sao_Paulo",
  version: "abc",
  today: {
    local_date: "2026-07-30",
    occurrences: [sampleOccurrence],
    empty_message: null,
  },
  tomorrow: {
    local_date: "2026-07-31",
    reveal: false,
    count: 1,
    occurrences: [{ ...sampleOccurrence, local_date: "2026-07-31", status: "scheduled" }],
    empty_message: null,
  },
};

test("parseAgendaSnapshot accepts a well-formed server payload", () => {
  const parsed = parseAgendaSnapshot(sampleSnapshot);
  assert.ok(parsed);
  assert.equal(parsed.timezone, "America/Sao_Paulo");
  assert.equal(parsed.today.occurrences[0].key, sampleOccurrence.key);
  assert.equal(parsed.tomorrow.reveal, false);
  assert.equal(parsed.tomorrow.count, 1);
});

test("parseAgendaSnapshot rejects malformed payloads", () => {
  assert.equal(parseAgendaSnapshot(null), null);
  assert.equal(parseAgendaSnapshot({ ...sampleSnapshot, version: 1 }), null);
  assert.equal(
    parseAgendaSnapshot({
      ...sampleSnapshot,
      today: { ...sampleSnapshot.today, occurrences: [{ ...sampleOccurrence, source: "dose" }] },
    }),
    null,
  );
});

test("parseAgendaSnapshot accepts medication occurrences", () => {
  const med = {
    ...sampleOccurrence,
    key: "medication:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-07-30:08:00",
    source: "medication",
    slot: "08:00",
    status: "pending",
    needs_owner_alert: false,
  };
  const parsed = parseAgendaSnapshot({
    ...sampleSnapshot,
    today: { ...sampleSnapshot.today, occurrences: [med] },
  });
  assert.ok(parsed);
  assert.equal(parsed.today.occurrences[0].source, "medication");
  assert.equal(parsed.today.occurrences[0].status, "pending");
});

test("parseAgendaSnapshot accepts one-off event occurrences and event actions obey the day rules", () => {
  const event = {
    ...sampleOccurrence,
    key: "event:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-07-30",
    source: "event",
    scheduled_time: "15:00",
    owner_user_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    owner_display_name: "Beto",
    status: "scheduled",
    needs_owner_alert: false,
  };
  const parsed = parseAgendaSnapshot({
    ...sampleSnapshot,
    today: { ...sampleSnapshot.today, occurrences: [event] },
  });
  assert.ok(parsed);
  const occurrence = parsed.today.occurrences[0];
  assert.equal(occurrence.source, "event");
  assert.equal(isConfirmableEvent(occurrence, "today"), true);
  assert.equal(isConfirmableEvent(occurrence, "tomorrow"), false);
  assert.equal(isCancellableEvent(occurrence, "today"), true);
  assert.equal(isReversibleEvent({ ...occurrence, status: "completed", confirmation_id: "c" }, "today"), true);
});

test("ownerAlertPresentation exposes color+icon+text cue only when flagged", () => {
  const alert = ownerAlertPresentation(sampleOccurrence);
  assert.equal(alert.show, true);
  assert.equal(alert.label, OWNER_ALERT_LABEL);
  assert.equal(alert.icon, "alert");

  const quiet = ownerAlertPresentation({ ...sampleOccurrence, needs_owner_alert: false });
  assert.equal(quiet.show, false);
});

test("tomorrowView is count-only before reveal and inline after", () => {
  const before = tomorrowView(sampleSnapshot.tomorrow);
  assert.deepEqual(before, { mode: "count_only", count: 1 });

  const after = tomorrowView({
    ...sampleSnapshot.tomorrow,
    reveal: true,
    empty_message: null,
  });
  assert.equal(after.mode, "inline");
  if (after.mode === "inline") {
    assert.equal(after.occurrences.length, 1);
  }

  const empty = tomorrowView({
    ...sampleSnapshot.tomorrow,
    reveal: true,
    count: 0,
    occurrences: [],
    empty_message: "Nada combinado para amanhã",
  });
  assert.equal(empty.mode, "inline");
  if (empty.mode === "inline") {
    assert.equal(empty.empty_message, "Nada combinado para amanhã");
  }
});

test("statusLabel maps server statuses for the UI", () => {
  assert.equal(statusLabel(sampleOccurrence), "Atrasado");
  assert.equal(
    statusLabel({ ...sampleOccurrence, status: "scheduled", requires_confirmation: false }),
    "Programado",
  );
  assert.equal(
    statusLabel({
      ...sampleOccurrence,
      source: "medication",
      status: "late",
      needs_owner_alert: false,
    }),
    "Atrasada",
  );
});
