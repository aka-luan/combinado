import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTH_CLIENT_OPTIONS } from "../../src/lib/auth/auth-client-options.ts";

test("persists the session so it survives closing and reopening the PWA", () => {
  assert.equal(AUTH_CLIENT_OPTIONS.persistSession, true);
  assert.equal(AUTH_CLIENT_OPTIONS.autoRefreshToken, true);
});

test("never signs in via a URL redirect — the code is entered in-app", () => {
  assert.equal(AUTH_CLIENT_OPTIONS.detectSessionInUrl, false);
});
