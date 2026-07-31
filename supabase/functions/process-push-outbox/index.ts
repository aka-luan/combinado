import * as webpush from "jsr:@negrel/webpush@0.3";
import { createClient } from "npm:@supabase/supabase-js@2";

type ClaimedDelivery = {
  id: string;
  household_id: string;
  delivery_type: string;
  occurrence_ref: string;
  user_id: string;
  subscription_id: string;
  payload: { title?: string; body?: string; url?: string };
  scheduled_for: string;
  expires_at: string;
  attempts: number;
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
    },
    privateKey: {
      kty: "EC" as const,
      crv: "P-256" as const,
      x,
      y,
      d: dB64,
    },
  };
}

/** Secrets UI often gets shell-quoted paste from the generator (`'{...}'`). */
function normalizeSecret(value: string): string {
  let v = value.trim();
  if (
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('"') && v.endsWith('"'))
  ) {
    v = v.slice(1, -1).trim();
  }
  if (v.startsWith("VAPID_KEYS=")) {
    v = v.slice("VAPID_KEYS=".length).trim();
    if (
      (v.startsWith("'") && v.endsWith("'")) ||
      (v.startsWith('"') && v.endsWith('"'))
    ) {
      v = v.slice(1, -1).trim();
    }
  }
  return v;
}

function sanitizeExportedVapidKeys(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    throw new Error("vapid_keys_not_object");
  }
  const { publicKey, privateKey } = raw as {
    publicKey?: JsonWebKey;
    privateKey?: JsonWebKey;
  };
  if (!publicKey || !privateKey) {
    throw new Error("vapid_keys_missing_pair");
  }
  return {
    publicKey: {
      kty: publicKey.kty,
      crv: publicKey.crv,
      x: publicKey.x,
      y: publicKey.y,
    },
    privateKey: {
      kty: privateKey.kty,
      crv: privateKey.crv,
      x: privateKey.x,
      y: privateKey.y,
      d: privateKey.d,
    },
  };
}

async function loadVapidKeys(): Promise<CryptoKeyPair> {
  const raw = Deno.env.get("VAPID_KEYS");
  if (raw) {
    const normalized = normalizeSecret(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(normalized);
    } catch {
      throw new Error("vapid_keys_invalid_json");
    }
    return await webpush.importVapidKeys(sanitizeExportedVapidKeys(parsed));
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  if (!vapidPublic || !vapidPrivate) {
    throw new Error("missing_vapid");
  }
  return await webpush.importVapidKeys(vapidBase64ToJwk(vapidPublic, vapidPrivate));
}

function authorize(req: Request): boolean {
  const cronSecret = Deno.env.get("PUSH_CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return true;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") ?? "";
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;

  return false;
}

function isPushMessageError(
  err: unknown,
): err is { response: Response; isGone: () => boolean } {
  return (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response?: unknown }).response === "object" &&
    "isGone" in err &&
    typeof (err as { isGone?: unknown }).isGone === "function"
  );
}

function ttlSecondsUntil(expiresAtIso: string): number {
  const expires = Date.parse(expiresAtIso);
  if (Number.isNaN(expires)) return 30 * 60;
  const seconds = Math.floor((expires - Date.now()) / 1000);
  return Math.max(1, Math.min(seconds, 60 * 60));
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

  try {
    return await handleProcess(req, {
      vapidSubject,
      supabaseUrl,
      serviceKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return new Response(JSON.stringify({ error: "internal", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function handleProcess(
  _req: Request,
  env: { vapidSubject: string; supabaseUrl: string; serviceKey: string },
) {
  let vapidKeys: CryptoKeyPair;
  try {
    vapidKeys = await loadVapidKeys();
  } catch (err) {
    const reason = err instanceof Error ? err.message : "import_failed";
    return new Response(JSON.stringify({ error: "misconfigured_vapid", reason }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const appServer = await webpush.ApplicationServer.new({
    contactInformation: env.vapidSubject.startsWith("mailto:")
      ? env.vapidSubject
      : `mailto:${env.vapidSubject}`,
    vapidKeys,
  });

  const admin = createClient(env.supabaseUrl, env.serviceKey);

  const { data: enqueued, error: enqueueError } = await admin.rpc(
    "enqueue_due_push_deliveries",
  );
  if (enqueueError) {
    return new Response(JSON.stringify({ error: enqueueError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: claimedRaw, error: claimError } = await admin.rpc(
    "claim_push_outbox_batch",
    { p_limit: 50, p_worker: "process-push-outbox" },
  );
  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const claimed = (Array.isArray(claimedRaw) ? claimedRaw : []) as ClaimedDelivery[];
  const results: {
    id: string;
    outcome: string;
    status?: number | string;
  }[] = [];

  for (const row of claimed) {
    if (row.delivery_type === "dose_reminder") {
      const { data: stillOk, error: checkError } = await admin.rpc(
        "dose_push_still_deliverable",
        { p_occurrence_ref: row.occurrence_ref },
      );
      if (checkError) {
        await admin.rpc("complete_push_outbox_attempt", {
          p_outbox_id: row.id,
          p_outcome: "temp_fail",
          p_error: checkError.message,
        });
        results.push({ id: row.id, outcome: "temp_fail", status: "check_error" });
        continue;
      }
      if (!stillOk) {
        await admin.rpc("complete_push_outbox_attempt", {
          p_outbox_id: row.id,
          p_outcome: "skipped_confirmed_or_cancelled",
        });
        results.push({ id: row.id, outcome: "skipped_confirmed_or_cancelled" });
        continue;
      }
    }

    const title =
      typeof row.payload?.title === "string" && row.payload.title
        ? row.payload.title
        : "Combinado";
    const body =
      typeof row.payload?.body === "string" && row.payload.body
        ? row.payload.body
        : "Você tem uma atualização no Combinado.";
    const url =
      typeof row.payload?.url === "string" && row.payload.url ? row.payload.url : "/";
    const payload = JSON.stringify({ title, body, url });

    try {
      const subscriber = appServer.subscribe({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      });
      await subscriber.pushTextMessage(payload, {
        ttl: ttlSecondsUntil(row.expires_at),
        urgency: "normal" as webpush.Urgency,
      });
      await admin.rpc("complete_push_outbox_attempt", {
        p_outbox_id: row.id,
        p_outcome: "sent",
        p_http_status: 201,
      });
      results.push({ id: row.id, outcome: "sent" });
    } catch (err) {
      const response = isPushMessageError(err) ? err.response : null;
      const status = response?.status ?? "error";
      let detail: string | undefined;
      if (response) {
        try {
          detail = (await response.text()).slice(0, 500);
        } catch {
          detail = response.statusText;
        }
      } else if (err instanceof Error) {
        detail = err.message || err.toString();
      }

      const gone =
        status === 404 ||
        status === 410 ||
        (isPushMessageError(err) && err.isGone());
      const outcome = gone ? "gone" : "temp_fail";

      await admin.rpc("complete_push_outbox_attempt", {
        p_outbox_id: row.id,
        p_outcome: outcome,
        p_http_status: typeof status === "number" ? status : null,
        p_error: detail ?? null,
      });
      results.push({ id: row.id, outcome, status });
    }
  }

  const { data: cleaned } = await admin.rpc("cleanup_push_delivery_logs");

  return new Response(
    JSON.stringify({
      enqueued,
      claimed: claimed.length,
      results,
      logs_cleaned: cleaned ?? 0,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
