import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDoseReminderPayload,
  buildTomorrowSummaryPayload,
} from "../../src/lib/push/payload.ts";
import {
  parseAgendaDeepLink,
  doseOccurrenceUrl,
  tomorrowSummaryUrl,
} from "../../src/lib/agenda/deep-link.ts";
import { deepLinkFocusSelectors } from "../../src/lib/agenda/deep-link-focus.ts";

test("dose reminder says only Hora de verificar and includes child, medicine, time, instruction", () => {
  const payload = buildDoseReminderPayload({
    occurrenceKey: "medication:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-07-30:20:00",
    childName: "Mia",
    medicineName: "Amoxicilina",
    scheduledTime: "20:00",
    instruction: "Com água",
  });

  assert.equal(payload.title, "Hora de verificar");
  assert.equal(
    payload.body,
    "Mia, Amoxicilina, 20:00, Com água",
  );
  assert.doesNotMatch(payload.body, /pendente|ainda|confirma/i);
  assert.equal(
    payload.url,
    "/?occ=medication%3Aaaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa%3A2026-07-30%3A20%3A00",
  );
});

test("dose reminder omits empty instruction without trailing comma", () => {
  const payload = buildDoseReminderPayload({
    occurrenceKey: "medication:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:2026-07-30:12:00",
    childName: "Mia",
    medicineName: "Dipirona",
    scheduledTime: "12:00",
    instruction: null,
  });

  assert.equal(payload.body, "Mia, Dipirona, 12:00");
});

test("tomorrow summary counts commitments, doses, and items without responsável", () => {
  const payload = buildTomorrowSummaryPayload({
    commitmentCount: 3,
    doseCount: 2,
    withoutOwnerCount: 1,
  });

  assert.equal(payload.title, "Combinado");
  assert.equal(
    payload.body,
    "Amanhã: 3 compromissos, 2 doses, 1 sem responsável.",
  );
  assert.doesNotMatch(payload.body, /Mia|Amoxicilina|escola/i);
  assert.equal(payload.url, "/?amanha=1");
});

test("tomorrow summary uses singular Portuguese nouns", () => {
  const payload = buildTomorrowSummaryPayload({
    commitmentCount: 1,
    doseCount: 1,
    withoutOwnerCount: 1,
  });

  assert.equal(
    payload.body,
    "Amanhã: 1 compromisso, 1 dose, 1 sem responsável.",
  );
});

test("doseOccurrenceUrl and tomorrowSummaryUrl match parseAgendaDeepLink", () => {
  const occ =
    "medication:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-07-30:20:00";
  const doseUrl = doseOccurrenceUrl(occ);
  assert.deepEqual(parseAgendaDeepLink(doseUrl), {
    focusOccurrenceKey: occ,
    scrollToTomorrow: false,
  });

  assert.deepEqual(parseAgendaDeepLink(tomorrowSummaryUrl()), {
    focusOccurrenceKey: null,
    scrollToTomorrow: true,
  });
});

test("parseAgendaDeepLink ignores unrelated query params", () => {
  assert.deepEqual(parseAgendaDeepLink("/?foo=1"), {
    focusOccurrenceKey: null,
    scrollToTomorrow: false,
  });
  assert.deepEqual(parseAgendaDeepLink("/"), {
    focusOccurrenceKey: null,
    scrollToTomorrow: false,
  });
});

test("deepLinkFocusSelectors target occurrence key or Amanhã section", () => {
  const occ =
    "medication:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-07-30:20:00";
  assert.deepEqual(
    deepLinkFocusSelectors({
      focusOccurrenceKey: occ,
      scrollToTomorrow: false,
    }),
    {
      scrollSelector: `[data-occurrence-key="${occ}"]`,
      highlightSelector: `[data-occurrence-key="${occ}"]`,
    },
  );
  assert.deepEqual(
    deepLinkFocusSelectors({
      focusOccurrenceKey: null,
      scrollToTomorrow: true,
    }),
    {
      scrollSelector: "[data-tomorrow-inline]",
      highlightSelector: "[data-tomorrow-inline]",
    },
  );
});

test("stale notification click finds no occurrence to focus", async () => {
  const { applyAgendaDeepLinkFocus } = await import(
    "../../src/lib/agenda/deep-link-focus.ts"
  );
  const root = { querySelector: () => null };
  assert.equal(
    applyAgendaDeepLinkFocus(root, {
      focusOccurrenceKey:
        "medication:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-07-30:20:00",
      scrollToTomorrow: false,
    }),
    false,
  );
});
