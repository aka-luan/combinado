/**
 * Generate a VAPID key pair for Combinado Web Push.
 *
 * Prints:
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY (browser applicationServerKey)
 *   - VAPID_KEYS JSON for the Supabase Edge Function secret
 *   - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY base64url (optional alternate secrets)
 *
 * Usage: node scripts/generate-vapid-keys.mjs
 */
import { generateKeyPairSync } from "node:crypto";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});

const pubJwk = publicKey.export({ format: "jwk" });
const privJwk = privateKey.export({ format: "jwk" });

// Uncompressed EC point: 0x04 || x || y
const x = Buffer.from(pubJwk.x, "base64url");
const y = Buffer.from(pubJwk.y, "base64url");
const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);
const d = Buffer.from(privJwk.d, "base64url");

const vapidKeys = {
  publicKey: {
    kty: "EC",
    crv: "P-256",
    x: pubJwk.x,
    y: pubJwk.y,
    key_ops: ["verify"],
    ext: true,
    alg: "ES256",
  },
  privateKey: {
    kty: "EC",
    crv: "P-256",
    x: pubJwk.x,
    y: pubJwk.y,
    d: privJwk.d,
    key_ops: ["sign"],
    ext: true,
    alg: "ES256",
  },
};

console.log("# Put this in the Cloudflare/CI build env and .env.* (public):");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${b64url(uncompressed)}`);
console.log("");
console.log("# Prefer this single Supabase Edge Function secret (JSON):");
console.log(`VAPID_KEYS='${JSON.stringify(vapidKeys)}'`);
console.log("");
console.log("# Alternate pair of Supabase secrets (base64url):");
console.log(`VAPID_PUBLIC_KEY=${b64url(uncompressed)}`);
console.log(`VAPID_PRIVATE_KEY=${b64url(d)}`);
console.log("");
console.log("# Also set (example):");
console.log("VAPID_SUBJECT=mailto:combinado-admin@example.com");
console.log("PUSH_CRON_SECRET=<random-long-string>");
