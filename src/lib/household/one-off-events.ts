import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCurrentHouseholdId,
  type MutationResult,
} from "./children";
import {
  normalizeOneOffEventCreate,
  normalizeOneOffEventEdit,
  type OneOffEventCreateInput,
} from "./event-form";
import { localDateInHousehold } from "./routine-form";

export type {
  OneOffEventCreateInput,
  NormalizeOneOffEventResult,
} from "./event-form";
export { normalizeOneOffEventCreate } from "./event-form";
export { normalizeOneOffEventEdit } from "./event-form";

export type OneOffEventRow = {
  id: string;
  householdId: string;
  title: string;
  targetKind: "casa" | "child";
  childId: string | null;
  localDate: string;
  scheduledTime: string | null;
  requiresConfirmation: boolean;
  responsibleUserId: string | null;
  createdBy: string;
  createdAt: string;
  cancelledAt: string | null;
  planningRevisionId: string | null;
};

export type OneOffEventEditInput = OneOffEventCreateInput & {
  eventId: string;
  expectedRevisionId: string;
};

type EventRpcResult = Record<string, unknown>;

function asRecord(value: unknown): EventRpcResult | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as EventRpcResult)
    : null;
}

function rpcCode(error: { message: string; code?: string }): string {
  return error.code ?? error.message;
}

export async function listOneOffEvents(
  client: SupabaseClient,
): Promise<MutationResult<OneOffEventRow[]>> {
  const today = localDateInHousehold();
  const { data, error } = await client
    .from("one_off_events")
    .select(
      "id, household_id, title, target_kind, child_id, local_date, scheduled_time, requires_confirmation, responsible_user_id, created_by, created_at, cancelled_at",
    )
    .gte("local_date", today)
    .order("local_date", { ascending: true })
    .order("scheduled_time", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  const rows = data ?? [];
  const eventIds = rows.map((row) => row.id as string).filter(Boolean);
  let revisions: Array<{ id: string; event_id: string; revision_number: number }> = [];
  if (eventIds.length > 0) {
    const revisionsResult = await client
      .from("one_off_event_revisions")
      .select("id, event_id, revision_number")
      .in("event_id", eventIds)
      .order("revision_number", { ascending: false });
    if (revisionsResult.error) {
      return {
        ok: false,
        error: {
          message: revisionsResult.error.message,
          code: revisionsResult.error.code,
        },
      };
    }
    revisions = (revisionsResult.data ?? []).map((row) => ({
      id: row.id as string,
      event_id: row.event_id as string,
      revision_number: Number(row.revision_number),
    }));
  }
  const currentRevisionByEvent = new Map<string, string>();
  for (const revision of revisions) {
    if (!currentRevisionByEvent.has(revision.event_id)) {
      currentRevisionByEvent.set(revision.event_id, revision.id);
    }
  }
  if (eventIds.some((eventId) => !currentRevisionByEvent.has(eventId))) {
    return { ok: false, error: { message: "event_revision_missing" } };
  }
  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id as string,
      householdId: row.household_id as string,
      title: row.title as string,
      targetKind: row.target_kind as "casa" | "child",
      childId: (row.child_id as string | null) ?? null,
      localDate: row.local_date as string,
      scheduledTime: (row.scheduled_time as string | null) ?? null,
      requiresConfirmation: Boolean(row.requires_confirmation),
      responsibleUserId: (row.responsible_user_id as string | null) ?? null,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
      cancelledAt: (row.cancelled_at as string | null) ?? null,
      planningRevisionId: currentRevisionByEvent.get(row.id as string) ?? null,
    })),
  };
}

export async function createOneOffEvent(
  client: SupabaseClient,
  input: OneOffEventCreateInput,
): Promise<MutationResult<{ id: string }>> {
  const normalized = normalizeOneOffEventCreate(input, localDateInHousehold());
  if (!normalized.ok) return { ok: false, error: { message: normalized.error } };

  const household = await fetchCurrentHouseholdId(client);
  if (!household.ok) return household;
  if (!household.data) return { ok: false, error: { message: "household_missing" } };

  const payload = normalized.data;
  const { data, error } = await client.rpc("create_one_off_event", {
    p_title: payload.title,
    p_target_kind: payload.targetKind,
    p_child_id: payload.childId,
    p_local_date: payload.localDate,
    p_scheduled_time: payload.scheduledTime,
    p_requires_confirmation: payload.requiresConfirmation,
    p_responsible_user_id: payload.responsibleUserId,
  });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };

  const result = asRecord(data);
  const id = typeof result?.event_id === "string" ? result.event_id : null;
  if (result?.ok !== true || !id) {
    return { ok: false, error: { message: "event_create_invalid_response" } };
  }
  return { ok: true, data: { id } };
}

export type EditOneOffEventResult = MutationResult<{
  eventId: string;
  planningRevisionId: string;
  revisionNumber: number | null;
  localDate: string;
}>;

export async function editOneOffEvent(
  client: SupabaseClient,
  input: OneOffEventEditInput,
): Promise<EditOneOffEventResult> {
  const normalized = normalizeOneOffEventEdit(input, localDateInHousehold());
  if (!normalized.ok) return { ok: false, error: { message: normalized.error } };
  const payload = normalized.data;
  const { data, error } = await client.rpc("edit_one_off_event", {
    p_event_id: input.eventId,
    p_expected_revision_id: input.expectedRevisionId,
    p_title: payload.title,
    p_target_kind: payload.targetKind,
    p_child_id: payload.childId,
    p_local_date: payload.localDate,
    p_scheduled_time: payload.scheduledTime,
    p_requires_confirmation: payload.requiresConfirmation,
    p_responsible_user_id: payload.responsibleUserId,
  });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  const row = asRecord(data);
  if (row?.ok !== true || typeof row.event_id !== "string" || typeof row.planning_revision_id !== "string") {
    const message = typeof row?.code === "string" ? row.code : "invalid_event_edit_response";
    return { ok: false, error: { message } };
  }
  return {
    ok: true,
    data: {
      eventId: row.event_id,
      planningRevisionId: row.planning_revision_id,
      revisionNumber: typeof row.revision_number === "number" ? row.revision_number : null,
      localDate: typeof row.local_date === "string" ? row.local_date : payload.localDate,
    },
  };
}

export type CompleteOneOffEventResult =
  | {
      ok: true;
      confirmationId: string;
      confirmedAt: string;
      confirmedByUserId: string;
      confirmedByDisplayName: string | null;
      occurrenceKey: string;
    }
  | {
      ok: false;
      code:
        | "already_completed"
        | "not_confirmable_day"
        | "not_confirmable"
        | "cancelled"
        | "event_not_found"
        | "unknown";
      confirmationId?: string;
      confirmedAt?: string;
      confirmedByUserId?: string;
      confirmedByDisplayName?: string | null;
      message?: string;
    };

export async function completeOneOffEvent(
  client: SupabaseClient,
  eventId: string,
): Promise<CompleteOneOffEventResult> {
  const { data, error } = await client.rpc("complete_one_off_event", {
    p_event_id: eventId,
  });
  if (error) return { ok: false, code: "unknown", message: rpcCode(error) };
  const row = asRecord(data);
  if (!row) return { ok: false, code: "unknown", message: "empty_response" };

  if (row.ok === true) {
    return {
      ok: true,
      confirmationId: String(row.confirmation_id),
      confirmedAt: String(row.confirmed_at),
      confirmedByUserId: String(row.confirmed_by_user_id),
      confirmedByDisplayName:
        typeof row.confirmed_by_display_name === "string" ? row.confirmed_by_display_name : null,
      occurrenceKey: String(row.occurrence_key),
    };
  }

  const code = typeof row.code === "string" ? row.code : "unknown";
  if (
    code === "already_completed" ||
    code === "not_confirmable_day" ||
    code === "not_confirmable" ||
    code === "cancelled" ||
    code === "event_not_found"
  ) {
    return {
      ok: false,
      code,
      confirmationId: typeof row.confirmation_id === "string" ? row.confirmation_id : undefined,
      confirmedAt: typeof row.confirmed_at === "string" ? row.confirmed_at : undefined,
      confirmedByUserId:
        typeof row.confirmed_by_user_id === "string" ? row.confirmed_by_user_id : undefined,
      confirmedByDisplayName:
        typeof row.confirmed_by_display_name === "string" ? row.confirmed_by_display_name : null,
    };
  }
  return { ok: false, code: "unknown" };
}

export type ReverseOneOffEventResult =
  | {
      ok: true;
      confirmationId: string;
      reversedAt: string;
      originalConfirmedBy: string;
      originalConfirmedAt: string;
    }
  | {
      ok: false;
      code: "confirmation_not_found" | "already_reversed" | "correction_window_closed" | "unknown";
      message?: string;
    };

export async function reverseOneOffEventCompletion(
  client: SupabaseClient,
  confirmationId: string,
): Promise<ReverseOneOffEventResult> {
  const { data, error } = await client.rpc("reverse_event_completion", {
    p_completion_id: confirmationId,
  });
  if (error) return { ok: false, code: "unknown", message: rpcCode(error) };
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
  if (code === "confirmation_not_found" || code === "already_reversed" || code === "correction_window_closed") {
    return { ok: false, code };
  }
  return { ok: false, code: "unknown" };
}

export type CancelOneOffEventResult =
  | { ok: true; eventId: string; cancelledAt?: string; already?: boolean }
  | {
      ok: false;
      code: "event_not_found" | "cancellation_window_closed" | "already_completed" | "unknown";
      message?: string;
    };

export async function cancelOneOffEvent(
  client: SupabaseClient,
  eventId: string,
): Promise<CancelOneOffEventResult> {
  const { data, error } = await client.rpc("cancel_one_off_event", {
    p_event_id: eventId,
  });
  if (error) return { ok: false, code: "unknown", message: rpcCode(error) };
  const row = asRecord(data);
  if (!row) return { ok: false, code: "unknown", message: "empty_response" };
  if (row.ok === true) {
    return {
      ok: true,
      eventId: String(row.event_id),
      cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : undefined,
      already: row.already === true,
    };
  }
  const code = typeof row.code === "string" ? row.code : "unknown";
  if (code === "event_not_found" || code === "cancellation_window_closed" || code === "already_completed") {
    return { ok: false, code };
  }
  return { ok: false, code: "unknown" };
}
