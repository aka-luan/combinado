import { test } from "node:test";
import assert from "node:assert/strict";
import {
  redactOperationalLogLine,
  sanitizeOperationalFields,
} from "../../src/lib/ops/redact.ts";

test("redactOperationalLogLine strips child, title, medicine, and instruction values", () => {
  const line =
    'delivery ok child="Mia" title="Consulta" medicine="Dipirona" instruction="tomar com água" code=sent';
  const out = redactOperationalLogLine(line);
  assert.doesNotMatch(out, /Mia|Consulta|Dipirona|tomar com água/);
  assert.match(out, /code=sent/);
  assert.match(out, /\[redacted\]/);
});

test("sanitizeOperationalFields keeps only allowed operational keys", () => {
  const cleaned = sanitizeOperationalFields({
    type: "dose_reminder",
    result: "sent",
    attempt: 1,
    child_name: "Mia",
    medicine_name: "Dipirona",
    title: "Consulta",
    instruction: "tomar com água",
    occurrence_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  });
  assert.deepEqual(cleaned, {
    type: "dose_reminder",
    result: "sent",
    attempt: 1,
    occurrence_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  });
});
