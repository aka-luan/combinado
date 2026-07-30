import type { SupabaseClient } from "@supabase/supabase-js";

export type ConfirmDoseSuccess = {
  ok: true;
  confirmationId: string;
  confirmedAt: string;
  confirmedByUserId: string;
  confirmedByDisplayName: string | null;
  occurrenceKey: string;
};

export type ConfirmDoseConflict = {
  ok: false;
  code: "already_confirmed";
  confirmationId: string;
  confirmedAt: string;
  confirmedByUserId: string;
  confirmedByDisplayName: string | null;
};

export type ConfirmDoseRejected = {
  ok: false;
  code:
    | "early_confirmation_required"
    | "not_confirmable_day"
    | "dose_not_scheduled"
    | "cancelled_by_change"
    | "unknown";
  minutesUntil?: number;
  message?: string;
};

export type ConfirmDoseResult = ConfirmDoseSuccess | ConfirmDoseConflict | ConfirmDoseRejected;

export type ReverseDoseResult =
  | {
      ok: true;
      confirmationId: string;
      reversedAt: string;
      originalConfirmedBy: string;
      originalConfirmedAt: string;
    }
  | {
      ok: false;
      code:
        | "confirmation_not_found"
        | "already_reversed"
        | "correction_window_closed"
        | "unknown";
      message?: string;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function confirmDose(
  client: SupabaseClient,
  args: {
    medicationId: string;
    localDate: string;
    slot: string;
    acknowledgeEarly?: boolean;
  },
): Promise<ConfirmDoseResult> {
  const { data, error } = await client.rpc("confirm_dose", {
    p_medication_id: args.medicationId,
    p_local_date: args.localDate,
    p_slot: args.slot,
    p_acknowledge_early: Boolean(args.acknowledgeEarly),
  });

  if (error) {
    return { ok: false, code: "unknown", message: error.message };
  }

  const row = asRecord(data);
  if (!row) return { ok: false, code: "unknown", message: "empty_response" };

  if (row.ok === true) {
    return {
      ok: true,
      confirmationId: String(row.confirmation_id),
      confirmedAt: String(row.confirmed_at),
      confirmedByUserId: String(row.confirmed_by_user_id),
      confirmedByDisplayName:
        typeof row.confirmed_by_display_name === "string"
          ? row.confirmed_by_display_name
          : null,
      occurrenceKey: String(row.occurrence_key),
    };
  }

  const code = typeof row.code === "string" ? row.code : "unknown";
  if (code === "already_confirmed") {
    return {
      ok: false,
      code: "already_confirmed",
      confirmationId: String(row.confirmation_id),
      confirmedAt: String(row.confirmed_at),
      confirmedByUserId: String(row.confirmed_by_user_id),
      confirmedByDisplayName:
        typeof row.confirmed_by_display_name === "string"
          ? row.confirmed_by_display_name
          : null,
    };
  }

  if (
    code === "early_confirmation_required" ||
    code === "not_confirmable_day" ||
    code === "dose_not_scheduled" ||
    code === "cancelled_by_change"
  ) {
    return {
      ok: false,
      code,
      minutesUntil: typeof row.minutes_until === "number" ? row.minutes_until : undefined,
    };
  }

  return { ok: false, code: "unknown" };
}

export async function reverseDoseConfirmation(
  client: SupabaseClient,
  confirmationId: string,
): Promise<ReverseDoseResult> {
  const { data, error } = await client.rpc("reverse_dose_confirmation", {
    p_confirmation_id: confirmationId,
  });

  if (error) {
    return { ok: false, code: "unknown", message: error.message };
  }

  const row = asRecord(data);
  if (!row) return { ok: false, code: "unknown", message: "empty_response" };

  if (row.ok === true) {
    return {
      ok: true,
      confirmationId: String(row.confirmation_id),
      reversedAt: String(row.reversed_at),
      originalConfirmedBy: String(row.original_confirmed_by),
      originalConfirmedAt: String(row.original_confirmed_at),
    };
  }

  const code = typeof row.code === "string" ? row.code : "unknown";
  if (
    code === "confirmation_not_found" ||
    code === "already_reversed" ||
    code === "correction_window_closed"
  ) {
    return { ok: false, code };
  }
  return { ok: false, code: "unknown" };
}
