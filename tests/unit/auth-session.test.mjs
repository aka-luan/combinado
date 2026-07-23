import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requestOtp,
  verifyOtp,
  signInWithTemporaryPassword,
  signOut,
} from "../../src/lib/auth/session.ts";

function fakeClient({
  otpError = null,
  verifyError = null,
  verifyData = null,
  passwordError = null,
  passwordData = null,
} = {}) {
  const calls = { signInWithOtp: [], verifyOtp: [], signInWithPassword: [], signOut: 0 };
  return {
    calls,
    auth: {
      async signInWithOtp(args) {
        calls.signInWithOtp.push(args);
        return { data: {}, error: otpError };
      },
      async verifyOtp(args) {
        calls.verifyOtp.push(args);
        return { data: verifyData ?? { session: null, user: null }, error: verifyError };
      },
      async signInWithPassword(args) {
        calls.signInWithPassword.push(args);
        return { data: passwordData ?? { session: null, user: null }, error: passwordError };
      },
      async signOut() {
        calls.signOut += 1;
        return { error: null };
      },
    },
  };
}

test("requestOtp always sets shouldCreateUser: false, for any email", async () => {
  const client = fakeClient();
  await requestOtp(client, "known@example.com");
  await requestOtp(client, "unknown@example.com");

  assert.equal(client.calls.signInWithOtp.length, 2);
  for (const call of client.calls.signInWithOtp) {
    assert.equal(call.options?.shouldCreateUser, false);
  }
});

test("requestOtp never throws on a provider error; it returns the error instead", async () => {
  const client = fakeClient({ otpError: { code: "otp_disabled" } });
  const result = await requestOtp(client, "unknown@example.com");

  assert.equal(result.ok, false);
  assert.deepEqual(result.error, { code: "otp_disabled" });
});

test("requestOtp reports success only when the provider reports no error", async () => {
  const client = fakeClient();
  const result = await requestOtp(client, "known@example.com");
  assert.equal(result.ok, true);
});

test("verifyOtp uses the email OTP type, not a magic link", async () => {
  const client = fakeClient({ verifyData: { session: { access_token: "t" }, user: { id: "u1" } } });
  await verifyOtp(client, "known@example.com", "123456");

  assert.equal(client.calls.verifyOtp.length, 1);
  assert.equal(client.calls.verifyOtp[0].type, "email");
  assert.equal(client.calls.verifyOtp[0].token, "123456");
});

test("verifyOtp never reports a session on a provider error, even with a wrong/unknown code", async () => {
  const client = fakeClient({ verifyError: { code: "otp_expired" } });
  const result = await verifyOtp(client, "unknown@example.com", "000000");

  assert.equal(result.ok, false);
  assert.equal(result.session, undefined);
});

test("signInWithTemporaryPassword succeeds only when the provider returns a session", async () => {
  const client = fakeClient({
    passwordData: { session: { access_token: "t" }, user: { id: "u1" } },
  });
  const result = await signInWithTemporaryPassword(client, "known@example.com", "temp-pass");

  assert.equal(client.calls.signInWithPassword.length, 1);
  assert.deepEqual(client.calls.signInWithPassword[0], {
    email: "known@example.com",
    password: "temp-pass",
  });
  assert.equal(result.ok, true);
});

test("signInWithTemporaryPassword never reports a session on a provider error", async () => {
  const client = fakeClient({ passwordError: { code: "invalid_credentials" } });
  const result = await signInWithTemporaryPassword(client, "unknown@example.com", "wrong");

  assert.equal(result.ok, false);
  assert.equal(result.session, undefined);
});

test("signOut delegates to the client", async () => {
  const client = fakeClient();
  await signOut(client);
  assert.equal(client.calls.signOut, 1);
});
