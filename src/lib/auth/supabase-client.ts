import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";
import { AUTH_CLIENT_OPTIONS } from "./auth-client-options";

let cachedClient: SupabaseClient | null | undefined;

/**
 * Returns `null` when Supabase isn't configured for this build (no project
 * provisioned yet). Callers must treat that as "auth unavailable", not throw.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const config = getSupabaseConfig();
  if (!config) {
    cachedClient = null;
    return null;
  }

  cachedClient = createClient(config.url, config.anonKey, { auth: AUTH_CLIENT_OPTIONS });
  return cachedClient;
}
