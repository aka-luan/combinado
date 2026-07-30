import type { SupabaseClient } from "@supabase/supabase-js";

export type PushSubscriptionKeys = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type UpsertResult =
  | { ok: true; subscription: PushSubscriptionKeys }
  | { ok: false; error: { message: string; code?: string } };

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function serializePushSubscription(sub: PushSubscription): PushSubscriptionKeys | null {
  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

export type PushManagerLike = {
  getSubscription(): Promise<PushSubscription | null>;
  subscribe(options: PushSubscriptionOptionsInit): Promise<PushSubscription>;
};

export type ServiceWorkerRegistrationLike = {
  pushManager: PushManagerLike;
};

/**
 * Returns the existing subscription, or creates one with the given VAPID key.
 * Never calls Notification.requestPermission — callers must already be granted.
 */
export async function ensurePushSubscription(
  registration: ServiceWorkerRegistrationLike,
  vapidPublicKey: string,
): Promise<PushSubscriptionKeys | null> {
  const existing = await registration.pushManager.getSubscription();
  if (existing) return serializePushSubscription(existing);

  const created = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
  return serializePushSubscription(created);
}

export async function upsertPushSubscription(
  client: SupabaseClient,
  keys: PushSubscriptionKeys,
  userAgent?: string,
): Promise<UpsertResult> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: { message: "not_authenticated", code: userError?.code } };
  }

  const row = {
    user_id: userData.user.id,
    endpoint: keys.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" })
    .select("endpoint, p256dh, auth")
    .single();

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }

  return {
    ok: true,
    subscription: {
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
    },
  };
}

/**
 * When permission is still granted but the local subscription is missing,
 * recreate and upsert. No-op when permission is not granted.
 */
export async function repairPushSubscription(options: {
  client: SupabaseClient;
  registration: ServiceWorkerRegistrationLike;
  vapidPublicKey: string;
  permission: NotificationPermission;
  userAgent?: string;
}): Promise<UpsertResult | { ok: true; subscription: null; skipped: true }> {
  if (options.permission !== "granted") {
    return { ok: true, subscription: null, skipped: true };
  }

  const keys = await ensurePushSubscription(options.registration, options.vapidPublicKey);
  if (!keys) {
    return { ok: false, error: { message: "subscription_incomplete" } };
  }

  return upsertPushSubscription(options.client, keys, options.userAgent);
}
