import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAgendaSnapshot } from "./parse";
import type { AgendaSnapshot } from "./types";

export type SnapshotResult =
  | { ok: true; data: AgendaSnapshot }
  | { ok: false; error: { message: string; code?: string } };

/**
 * Fetches the authoritative household agenda snapshot from the server.
 * Pass `at` only in tests; production callers omit it (server uses now()).
 */
export async function fetchAgendaSnapshot(
  client: SupabaseClient,
  at?: string,
): Promise<SnapshotResult> {
  const { data, error } = at
    ? await client.rpc("household_agenda_snapshot", { at })
    : await client.rpc("household_agenda_snapshot");

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  if (data == null) {
    return { ok: false, error: { message: "snapshot_unavailable" } };
  }

  const parsed = parseAgendaSnapshot(data);
  if (!parsed) {
    return { ok: false, error: { message: "snapshot_invalid" } };
  }
  return { ok: true, data: parsed };
}
