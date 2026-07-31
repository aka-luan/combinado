import { test } from "node:test";
import assert from "node:assert/strict";
import { redactBackupLogLine } from "../../src/lib/backup/redact.ts";

test("redactBackupLogLine masks postgres connection strings", () => {
  const line =
    "pg_dump: connecting to postgres://postgres:s3cret@db.example.com:5432/postgres";
  const out = redactBackupLogLine(line);
  assert.match(out, /\[REDACTED_DATABASE_URL\]/);
  assert.doesNotMatch(out, /s3cret/);
  assert.doesNotMatch(out, /db\.example\.com/);
});

test("redactBackupLogLine masks password assignments", () => {
  const line = "export PGPASSWORD=hunter2 DATABASE_URL=postgres://u:p@h/db";
  const out = redactBackupLogLine(line);
  assert.match(out, /PGPASSWORD=\[REDACTED\]/);
  assert.match(out, /\[REDACTED_DATABASE_URL\]/);
  assert.doesNotMatch(out, /hunter2/);
});

test("redactBackupLogLine masks age identity material", () => {
  const line = "AGE-SECRET-KEY-1QYQSZQG";
  const out = redactBackupLogLine(line);
  assert.match(out, /\[REDACTED_AGE_SECRET\]/);
  assert.doesNotMatch(out, /AGE-SECRET-KEY-1QYQSZQG/);
});

test("redactBackupLogLine leaves operational codes intact", () => {
  const line = "backup status=failure error_code=dump_failed";
  assert.equal(redactBackupLogLine(line), line);
});

test("redactBackupLogLine masks email addresses", () => {
  const line = "member a1@example.com joined Casa";
  const out = redactBackupLogLine(line);
  assert.match(out, /\[REDACTED_EMAIL\]/);
  assert.doesNotMatch(out, /a1@example\.com/);
});
