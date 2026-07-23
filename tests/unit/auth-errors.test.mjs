import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAuthError } from "../../src/lib/auth/errors.ts";

test("maps rate limit / too many requests to a resend-cooldown message", () => {
  const message = mapAuthError({ status: 429, code: "over_email_send_rate_limit" });
  assert.match(message, /aguarde/i);
  assert.doesNotMatch(message, /rate.?limit/i);
});

test("maps an unknown or unauthorized email to a generic message, never confirming the account state", () => {
  const message = mapAuthError({ status: 400, code: "otp_disabled" });
  assert.doesNotMatch(message, /não existe|not found|unknown user|signups not allowed/i);
  assert.match(message, /não foi possível/i);
});

test("maps an invalid or expired code to a message that names neither cause as certain", () => {
  const message = mapAuthError({ status: 403, code: "otp_expired" });
  assert.match(message, /código/i);
  assert.match(message, /inválido|expirad/i);
});

test("maps too many verification attempts to an explicit rejection message", () => {
  const message = mapAuthError({ status: 429, code: "over_request_rate_limit" });
  assert.match(message, /tentativa/i);
});

test("never leaks the raw provider error message or credentials", () => {
  const message = mapAuthError({
    status: 500,
    message: "SMTP auth failed for user secret-gmail-app-password@gmail.com",
  });
  assert.doesNotMatch(message, /secret-gmail-app-password/);
  assert.doesNotMatch(message, /smtp/i);
  assert.doesNotMatch(message, /gmail/i);
});

test("falls back to a generic message for unrecognized errors", () => {
  const message = mapAuthError(new Error("something exploded"));
  assert.equal(typeof message, "string");
  assert.ok(message.length > 0);
  assert.doesNotMatch(message, /exploded/);
});

test("falls back to a generic message for non-error values", () => {
  const message = mapAuthError(null);
  assert.equal(typeof message, "string");
  assert.ok(message.length > 0);
});
