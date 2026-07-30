import * as webpush from "jsr:@negrel/webpush@0.3";
import { createClient } from "npm:@supabase/supabase-js@2";

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function b64urlToBytes(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Convert standard web-push base64url VAPID keys into negrel's JWK pair. */
function vapidBase64ToJwk(publicKey: string, privateKey: string) {
  const pub = b64urlToBytes(publicKey);
  const d = b64urlToBytes(privateKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID public key must be an uncompressed P-256 point");
  }
  if (d.length !== 32) {
    throw new Error("VAPID private key must be 32 bytes");
  }
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  const dB64 = bytesToB64url(d);
  return {
    publicKey: {
      kty: "EC" as const,
      crv: "P-256" as const,
      x,
      y,
      key_ops: ["verify"],
      ext: true,
      alg: "ES256",
    },
    privateKey: {
      kty: "EC" as const,
      crv: "P-256" as const,
      x,
      y,
      d: dB64,
      key_ops: ["sign"],
      ext: true,
      alg: "ES256",
    },
  };
}

async function loadVapidKeys(): Promise<CryptoKeyPair> {
  const json = Deno.env.get("VAPID_KEYS");
  if (json) {
    return await webpush.importVapidKeys(JSON.parse(json), { extractable: true });
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!vapidPublic || !vapidPrivate) {
    throw new Error("missing_vapid");
  }
  return await webpush.importVapidKeys(vapidBase64ToJwk(vapidPublic, vapidPrivate), {
    extractable: true,
  });
}

function authorize(req: Request): boolean {
  const cronSecret = Deno.env.get("PUSH_CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return true;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") ?? "";
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  if (!authorize(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:combinado@localhost";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "misconfigured" }), { status: 500 });
  }

  let vapidKeys: CryptoKeyPair;
  try {
    vapidKeys = await loadVapidKeys();
  } catch {
    return new Response(JSON.stringify({ error: "misconfigured_vapid" }), { status: 500 });
  }

  const appServer = await webpush.ApplicationServer.new({
    contactInformation: vapidSubject.startsWith("mailto:")
      ? vapidSubject
      : `mailto:${vapidSubject}`,
    vapidKeys,
  });

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const payload = JSON.stringify({
    title: "Combinado",
    body: "Teste de notificação — o caminho de push está ativo.",
    url: "/",
  });

  const results: { id: string; status: number | string }[] = [];
  const staleIds: string[] = [];

  for (const row of (rows ?? []) as SubscriptionRow[]) {
    try {
      const subscriber = appServer.subscribe({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      });
      await subscriber.pushTextMessage(payload, {
        ttl: 30 * 60,
        urgency: webpush.Urgency.Normal,
      });
      results.push({ id: row.id, status: "sent" });
    } catch (err) {
      const response =
        err instanceof webpush.PushMessageError ? err.response : null;
      const status = response?.status ?? "error";

      // 404/410 mean the endpoint is permanently gone (PRD §10.4).
      if (status === 404 || status === 410 || (err instanceof webpush.PushMessageError && err.isGone())) {
        staleIds.push(row.id);
      }
      results.push({ id: row.id, status });
    }
  }

  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }

  return new Response(
    JSON.stringify({
      attempted: results.length,
      removed: staleIds.length,
      results,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
