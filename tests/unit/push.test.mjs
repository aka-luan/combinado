import { test } from "node:test";
import assert from "node:assert/strict";
import { isInstalledPwa } from "../../src/lib/push/install.ts";
import { resolvePushStatus } from "../../src/lib/push/status.ts";
import { readPushConfig } from "../../src/lib/push/config.ts";
import {
  arrayBufferToBase64Url,
  serializePushSubscription,
  upsertPushSubscription,
  urlBase64ToUint8Array,
  repairPushSubscription,
} from "../../src/lib/push/subscription.ts";

test("isInstalledPwa is true for iOS standalone", () => {
  assert.equal(isInstalledPwa({ standalone: true }), true);
});

test("isInstalledPwa is true for display-mode standalone", () => {
  assert.equal(
    isInstalledPwa({
      matchMedia: (q) => ({ matches: q.includes("standalone") }),
    }),
    true,
  );
});

test("isInstalledPwa is false in a regular browser tab", () => {
  assert.equal(
    isInstalledPwa({
      standalone: false,
      matchMedia: () => ({ matches: false }),
    }),
    false,
  );
});

test("resolvePushStatus requires install before permission", () => {
  assert.equal(
    resolvePushStatus({
      pushSupported: true,
      vapidConfigured: true,
      installed: false,
      permission: "default",
      hasSubscription: false,
    }),
    "reinstall-required",
  );
});

test("resolvePushStatus maps default/denied permission to permission-required when installed", () => {
  assert.equal(
    resolvePushStatus({
      pushSupported: true,
      vapidConfigured: true,
      installed: true,
      permission: "default",
      hasSubscription: false,
    }),
    "permission-required",
  );
  assert.equal(
    resolvePushStatus({
      pushSupported: true,
      vapidConfigured: true,
      installed: true,
      permission: "denied",
      hasSubscription: false,
    }),
    "permission-required",
  );
});

test("resolvePushStatus is active only with granted permission and a subscription", () => {
  assert.equal(
    resolvePushStatus({
      pushSupported: true,
      vapidConfigured: true,
      installed: true,
      permission: "granted",
      hasSubscription: true,
    }),
    "active",
  );
  assert.equal(
    resolvePushStatus({
      pushSupported: true,
      vapidConfigured: true,
      installed: true,
      permission: "granted",
      hasSubscription: false,
    }),
    "reinstall-required",
  );
});

test("resolvePushStatus reports config-missing without VAPID", () => {
  assert.equal(
    resolvePushStatus({
      pushSupported: true,
      vapidConfigured: false,
      installed: true,
      permission: "granted",
      hasSubscription: true,
    }),
    "config-missing",
  );
});

test("readPushConfig requires NEXT_PUBLIC_VAPID_PUBLIC_KEY", () => {
  assert.equal(readPushConfig({}), null);
  assert.deepEqual(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "abc" }), {
    vapidPublicKey: "abc",
  });
});

test("urlBase64ToUint8Array round-trips with arrayBufferToBase64Url", () => {
  const sample = Buffer.from([1, 2, 3, 250]).toString("base64url");
  const bytes = urlBase64ToUint8Array(sample);
  assert.equal(arrayBufferToBase64Url(bytes.buffer), sample);
});

test("serializePushSubscription rejects incomplete PushSubscription JSON", () => {
  assert.equal(
    serializePushSubscription({
      toJSON: () => ({ endpoint: "https://example/push", keys: { p256dh: "x" } }),
    }),
    null,
  );
});

test("upsertPushSubscription stores endpoint keys for the authenticated adult", async () => {
  const calls = [];
  const client = {
    auth: {
      async getUser() {
        return { data: { user: { id: "adult-1" } }, error: null };
      },
    },
    from(table) {
      assert.equal(table, "push_subscriptions");
      return {
        upsert(row, opts) {
          calls.push({ row, opts });
          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      endpoint: row.endpoint,
                      p256dh: row.p256dh,
                      auth: row.auth,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await upsertPushSubscription(
    client,
    { endpoint: "https://push.example/a", p256dh: "p", auth: "a" },
    "TestAgent",
  );

  assert.equal(result.ok, true);
  assert.equal(calls[0].row.user_id, "adult-1");
  assert.equal(calls[0].opts.onConflict, "endpoint");
});

test("repairPushSubscription skips when permission is not granted", async () => {
  const result = await repairPushSubscription({
    client: {},
    registration: { pushManager: { getSubscription: async () => null, subscribe: async () => {
      throw new Error("should not subscribe");
    } } },
    vapidPublicKey: "x",
    permission: "default",
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});
