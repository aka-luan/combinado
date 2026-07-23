import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESEND_COOLDOWN_MS,
  CODE_EXPIRY_MS,
  secondsUntilResend,
  isCodeExpired,
} from "../../src/lib/auth/otp-timing.ts";

test("RESEND_COOLDOWN_MS is 60 seconds", () => {
  assert.equal(RESEND_COOLDOWN_MS, 60_000);
});

test("CODE_EXPIRY_MS is 10 minutes", () => {
  assert.equal(CODE_EXPIRY_MS, 10 * 60_000);
});

test("secondsUntilResend is the full cooldown right after sending", () => {
  const sentAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(secondsUntilResend(sentAt, now), 60);
});

test("secondsUntilResend counts down as time passes", () => {
  const sentAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date("2026-01-01T00:00:25.000Z");
  assert.equal(secondsUntilResend(sentAt, now), 35);
});

test("secondsUntilResend is zero once the cooldown has elapsed", () => {
  const sentAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date("2026-01-01T00:01:00.000Z");
  assert.equal(secondsUntilResend(sentAt, now), 0);
});

test("secondsUntilResend never goes negative after the cooldown", () => {
  const sentAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date("2026-01-01T05:00:00.000Z");
  assert.equal(secondsUntilResend(sentAt, now), 0);
});

test("isCodeExpired is false before 10 minutes have passed", () => {
  const sentAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date("2026-01-01T00:09:59.000Z");
  assert.equal(isCodeExpired(sentAt, now), false);
});

test("isCodeExpired is true at and after 10 minutes", () => {
  const sentAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date("2026-01-01T00:10:00.000Z");
  assert.equal(isCodeExpired(sentAt, now), true);
});
