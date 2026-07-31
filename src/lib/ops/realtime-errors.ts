import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Records a Realtime channel failure as an operational counter (PRD §§17, 21).
 * Never sends family content — only a short status token.
 */
export async function recordRealtimeChannelError(
  client: SupabaseClient,
  status: string,
  _err?: Error | null,
): Promise<void> {
  const code =
    status === "TIMED_OUT"
      ? "realtime_timed_out"
      : status === "CHANNEL_ERROR"
        ? "realtime_channel_error"
        : "realtime_error";
  try {
    await client.rpc("record_realtime_error", { p_error_code: code });
  } catch {
    // Best effort — never block the agenda on ops telemetry.
  }
}
