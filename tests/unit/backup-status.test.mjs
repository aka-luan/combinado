import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_STALE_AFTER_MS,
  evaluateBackupFreshness,
  formatBackupStatusMessage,
  parseBackupStatusRow,
} from "../../src/lib/backup/status.ts";

const HOUR = 60 * 60 * 1000;

test("BACKUP_STALE_AFTER_MS is exactly 26 hours", () => {
  assert.equal(BACKUP_STALE_AFTER_MS, 26 * HOUR);
});

test("evaluateBackupFreshness marks missing success as stale", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  assert.deepEqual(evaluateBackupFreshness(null, now), {
    kind: "unknown",
    stale: true,
  });
});

test("evaluateBackupFreshness is fresh within 26 hours of last success", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  const lastSuccessAt = new Date(now.getTime() - 25 * HOUR).toISOString();
  assert.deepEqual(evaluateBackupFreshness(lastSuccessAt, now), {
    kind: "ok",
    stale: false,
    lastSuccessAt,
  });
});

test("evaluateBackupFreshness becomes stale after 26 hours", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  const lastSuccessAt = new Date(now.getTime() - 26 * HOUR - 1).toISOString();
  assert.deepEqual(evaluateBackupFreshness(lastSuccessAt, now), {
    kind: "ok",
    stale: true,
    lastSuccessAt,
  });
});

test("parseBackupStatusRow accepts success without secrets", () => {
  assert.deepEqual(
    parseBackupStatusRow({
      last_status: "success",
      last_attempt_at: "2026-07-31T10:00:00.000Z",
      last_success_at: "2026-07-31T10:00:00.000Z",
      last_error_code: null,
      last_restore_rehearsal_at: "2026-07-30T09:00:00.000Z",
    }),
    {
      lastStatus: "success",
      lastAttemptAt: "2026-07-31T10:00:00.000Z",
      lastSuccessAt: "2026-07-31T10:00:00.000Z",
      lastErrorCode: null,
      lastRestoreRehearsalAt: "2026-07-30T09:00:00.000Z",
    },
  );
});

test("parseBackupStatusRow keeps failure code and drops unknown fields", () => {
  assert.deepEqual(
    parseBackupStatusRow({
      last_status: "failure",
      last_attempt_at: "2026-07-31T11:00:00.000Z",
      last_success_at: "2026-07-30T10:00:00.000Z",
      last_error_code: "dump_failed",
      password: "should-not-leak",
      connection_string: "postgres://secret",
    }),
    {
      lastStatus: "failure",
      lastAttemptAt: "2026-07-31T11:00:00.000Z",
      lastSuccessAt: "2026-07-30T10:00:00.000Z",
      lastErrorCode: "dump_failed",
      lastRestoreRehearsalAt: null,
    },
  );
});

test("formatBackupStatusMessage reports success with freshness", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  const msg = formatBackupStatusMessage(
    {
      lastStatus: "success",
      lastAttemptAt: "2026-07-31T10:00:00.000Z",
      lastSuccessAt: "2026-07-31T10:00:00.000Z",
      lastErrorCode: null,
      lastRestoreRehearsalAt: null,
    },
    now,
  );
  assert.match(msg, /sucesso/i);
  assert.match(msg, /31\/07\/2026/);
  assert.doesNotMatch(msg, /postgres:\/\//i);
  assert.doesNotMatch(msg, /AGE-SECRET/i);
});

test("formatBackupStatusMessage alerts when last success is stale", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  const msg = formatBackupStatusMessage(
    {
      lastStatus: "success",
      lastAttemptAt: "2026-07-29T10:00:00.000Z",
      lastSuccessAt: "2026-07-29T10:00:00.000Z",
      lastErrorCode: null,
      lastRestoreRehearsalAt: null,
    },
    now,
  );
  assert.match(msg, /atrasado|26\s*h|desatualizado/i);
});

test("formatBackupStatusMessage reports failure without family data", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  const msg = formatBackupStatusMessage(
    {
      lastStatus: "failure",
      lastAttemptAt: "2026-07-31T11:00:00.000Z",
      lastSuccessAt: "2026-07-30T10:00:00.000Z",
      lastErrorCode: "encrypt_failed",
      lastRestoreRehearsalAt: null,
    },
    now,
  );
  assert.match(msg, /falhou|falha/i);
  assert.match(msg, /encrypt_failed/);
  assert.doesNotMatch(msg, /Mia|remédio|dose/i);
});

test("formatBackupStatusMessage handles never-run state", () => {
  const msg = formatBackupStatusMessage(null, new Date("2026-07-31T12:00:00.000Z"));
  assert.match(msg, /ainda não|indisponível|nunca/i);
});

test("formatBackupStatusMessage includes last restore rehearsal", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  const msg = formatBackupStatusMessage(
    {
      lastStatus: "success",
      lastAttemptAt: "2026-07-31T10:00:00.000Z",
      lastSuccessAt: "2026-07-31T10:00:00.000Z",
      lastErrorCode: null,
      lastRestoreRehearsalAt: "2026-07-30T09:00:00.000Z",
    },
    now,
  );
  assert.match(msg, /restauração/i);
  assert.match(msg, /30\/07\/2026/);
});
