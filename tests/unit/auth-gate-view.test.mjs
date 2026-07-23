import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGateView } from "../../src/lib/auth/gate-view.ts";

test("shows config-missing when Supabase isn't configured, regardless of session state", () => {
  assert.equal(resolveGateView({ configured: false, status: "loading", hasSession: false }), "config-missing");
  assert.equal(resolveGateView({ configured: false, status: "ready", hasSession: true }), "config-missing");
});

test("shows loading while the session hasn't resolved yet", () => {
  assert.equal(resolveGateView({ configured: true, status: "loading", hasSession: false }), "loading");
});

test("shows login once ready with no session", () => {
  assert.equal(resolveGateView({ configured: true, status: "ready", hasSession: false }), "login");
});

test("shows authenticated only once ready and a session exists", () => {
  assert.equal(resolveGateView({ configured: true, status: "ready", hasSession: true }), "authenticated");
});

test("never resolves to authenticated without a session, for any status", () => {
  for (const status of ["loading", "ready"]) {
    assert.notEqual(resolveGateView({ configured: true, status, hasSession: false }), "authenticated");
  }
});
