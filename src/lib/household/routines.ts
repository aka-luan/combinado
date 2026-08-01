import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCurrentHouseholdId,
  type MutationResult,
} from "./children";
import {
  normalizeWeeklyRoutineCreate,
  type WeeklyRoutineCreateInput,
} from "./routine-form";

export type {
  WeeklyRoutineCreateInput,
  WeeklyRoutineCreatePayload,
  NormalizeRoutineResult,
} from "./routine-form";
export { normalizeWeeklyRoutineCreate, localDateInHousehold } from "./routine-form";
export {
  setupHomeCopy,
  isHouseholdSetupNeeded,
  membershipMissingCopy,
  schemaMissingCopy,
  householdWriteErrorCopy,
  isSchemaMissingError,
} from "./setup-home";

export type WeeklyRoutineListItem = {
  id: string;
  versionId: string;
  title: string;
  targetKind: "casa" | "child";
  childId: string | null;
  weekdays: number[];
  scheduledTime: string | null;
  requiresConfirmation: boolean;
  defaultOwnerUserId: string | null;
  validFrom: string;
  validUntil: string | null;
  archived: boolean;
};

export async function listWeeklyRoutines(
  client: SupabaseClient,
): Promise<MutationResult<WeeklyRoutineListItem[]>> {
  const { data, error } = await client
    .from("weekly_routines")
    .select(
      `
      id,
      weekly_routine_versions (
        id,
        title,
        target_kind,
        child_id,
        weekdays,
        scheduled_time,
        requires_confirmation,
        default_owner_user_id,
        valid_from,
        valid_until,
        effective_from,
        archived,
        created_at
      )
    `,
    )
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: { message: error.message, code: error.code } };

  const items: WeeklyRoutineListItem[] = [];
  for (const row of data ?? []) {
    const versions = Array.isArray(row.weekly_routine_versions)
      ? row.weekly_routine_versions
      : row.weekly_routine_versions
        ? [row.weekly_routine_versions]
        : [];
    if (versions.length === 0) continue;
    const latest = [...versions].sort((a, b) => {
      const byEffective = String(b.effective_from).localeCompare(String(a.effective_from));
      if (byEffective !== 0) return byEffective;
      return String(b.created_at).localeCompare(String(a.created_at));
    })[0];
    items.push({
      id: row.id as string,
      versionId: latest.id as string,
      title: latest.title as string,
      targetKind: latest.target_kind as "casa" | "child",
      childId: (latest.child_id as string | null) ?? null,
      weekdays: (latest.weekdays as number[]) ?? [],
      scheduledTime: (latest.scheduled_time as string | null) ?? null,
      requiresConfirmation: Boolean(latest.requires_confirmation),
      defaultOwnerUserId: (latest.default_owner_user_id as string | null) ?? null,
      validFrom: latest.valid_from as string,
      validUntil: (latest.valid_until as string | null) ?? null,
      archived: Boolean(latest.archived),
    });
  }

  return { ok: true, data: items };
}

export type WeeklyRoutineEditInput = WeeklyRoutineCreateInput & {
  routineId: string;
  expectedVersionId: string;
};

export type WeeklyRoutineMutationResult = MutationResult<{
  routineId: string;
  versionId?: string;
  effectiveFrom?: string;
  already?: boolean;
}>;

function rpcMutationError(error: { message: string; code?: string }) {
  return { ok: false as const, error: { message: error.message, code: error.code } };
}

export async function editWeeklyRoutine(
  client: SupabaseClient,
  input: WeeklyRoutineEditInput,
): Promise<WeeklyRoutineMutationResult> {
  const normalized = normalizeWeeklyRoutineCreate(input);
  if (!normalized.ok) return { ok: false, error: { message: normalized.error } };

  const payload = normalized.data;
  const { data, error } = await client.rpc("edit_weekly_routine", {
    p_routine_id: input.routineId,
    p_expected_version_id: input.expectedVersionId,
    p_title: payload.title,
    p_target_kind: payload.targetKind,
    p_child_id: payload.childId,
    p_weekdays: payload.weekdays,
    p_scheduled_time: payload.scheduledTime,
    p_requires_confirmation: payload.requiresConfirmation,
    p_default_owner_user_id: payload.defaultOwnerUserId,
    p_valid_from: payload.validFrom,
    p_valid_until: payload.validUntil,
  });
  if (error) return rpcMutationError(error);
  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true || typeof row.routine_id !== "string") {
    return { ok: false, error: { message: "invalid_routine_edit_response" } };
  }
  return {
    ok: true,
    data: {
      routineId: row.routine_id,
      versionId: typeof row.version_id === "string" ? row.version_id : undefined,
      effectiveFrom: typeof row.effective_from === "string" ? row.effective_from : undefined,
    },
  };
}

export async function archiveWeeklyRoutine(
  client: SupabaseClient,
  routineId: string,
  expectedVersionId: string,
): Promise<WeeklyRoutineMutationResult> {
  const { data, error } = await client.rpc("archive_weekly_routine", {
    p_routine_id: routineId,
    p_expected_version_id: expectedVersionId,
  });
  if (error) return rpcMutationError(error);
  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true || typeof row.routine_id !== "string") {
    return { ok: false, error: { message: "invalid_routine_archive_response" } };
  }
  return {
    ok: true,
    data: {
      routineId: row.routine_id,
      versionId: typeof row.version_id === "string" ? row.version_id : undefined,
      effectiveFrom: typeof row.effective_from === "string" ? row.effective_from : undefined,
      already: row.already === true,
    },
  };
}

export async function restoreWeeklyRoutine(
  client: SupabaseClient,
  routineId: string,
  expectedVersionId: string,
): Promise<WeeklyRoutineMutationResult> {
  const { data, error } = await client.rpc("restore_weekly_routine", {
    p_routine_id: routineId,
    p_expected_version_id: expectedVersionId,
  });
  if (error) return rpcMutationError(error);
  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true || typeof row.routine_id !== "string") {
    return { ok: false, error: { message: "invalid_routine_restore_response" } };
  }
  return {
    ok: true,
    data: {
      routineId: row.routine_id,
      versionId: typeof row.version_id === "string" ? row.version_id : undefined,
      effectiveFrom: typeof row.effective_from === "string" ? row.effective_from : undefined,
      already: row.already === true,
    },
  };
}

export type WeeklyRoutineExceptionInput = {
  routineId: string;
  localDate: string;
  cancelled: boolean;
  scheduledTime: string | null;
  scheduledTimeOverridden: boolean;
  ownerUserId: string | null;
  ownerOverridden: boolean;
  expectedExceptionId: string | null;
};

export type WeeklyRoutineExceptionResult = MutationResult<{
  exceptionId: string;
  routineId: string;
  localDate: string;
  restored: boolean;
  cancelled: boolean;
}>;

function parseExceptionResult(data: unknown): WeeklyRoutineExceptionResult {
  const row = data as Record<string, unknown> | null;
  if (
    !row ||
    row.ok !== true ||
    typeof row.exception_id !== "string" ||
    typeof row.routine_id !== "string" ||
    typeof row.local_date !== "string"
  ) {
    return { ok: false, error: { message: "invalid_routine_exception_response" } };
  }
  return {
    ok: true,
    data: {
      exceptionId: row.exception_id,
      routineId: row.routine_id,
      localDate: row.local_date,
      restored: row.restored === true,
      cancelled: row.cancelled === true,
    },
  };
}

export async function saveWeeklyRoutineException(
  client: SupabaseClient,
  input: WeeklyRoutineExceptionInput,
): Promise<WeeklyRoutineExceptionResult> {
  const { data, error } = await client.rpc("save_weekly_routine_exception", {
    p_routine_id: input.routineId,
    p_local_date: input.localDate,
    p_cancelled: input.cancelled,
    p_scheduled_time: input.scheduledTime,
    p_scheduled_time_overridden: input.scheduledTimeOverridden,
    p_owner_user_id: input.ownerUserId,
    p_owner_overridden: input.ownerOverridden,
    p_expected_exception_id: input.expectedExceptionId,
  });
  if (error) return rpcMutationError(error) as WeeklyRoutineExceptionResult;
  return parseExceptionResult(data);
}

export async function restoreWeeklyRoutineException(
  client: SupabaseClient,
  routineId: string,
  localDate: string,
  expectedExceptionId: string,
): Promise<WeeklyRoutineExceptionResult> {
  const { data, error } = await client.rpc("restore_weekly_routine_exception", {
    p_routine_id: routineId,
    p_local_date: localDate,
    p_expected_exception_id: expectedExceptionId,
  });
  if (error) return rpcMutationError(error) as WeeklyRoutineExceptionResult;
  return parseExceptionResult(data);
}

export async function createWeeklyRoutine(
  client: SupabaseClient,
  input: WeeklyRoutineCreateInput,
): Promise<MutationResult<{ id: string }>> {
  const normalized = normalizeWeeklyRoutineCreate(input);
  if (!normalized.ok) {
    return { ok: false, error: { message: normalized.error } };
  }

  const household = await fetchCurrentHouseholdId(client);
  if (!household.ok) return household;
  if (!household.data) {
    return { ok: false, error: { message: "household_missing" } };
  }

  const payload = normalized.data;
  const { data, error } = await client.rpc("create_weekly_routine", {
    p_title: payload.title,
    p_target_kind: payload.targetKind,
    p_child_id: payload.childId,
    p_weekdays: payload.weekdays,
    p_scheduled_time: payload.scheduledTime,
    p_requires_confirmation: payload.requiresConfirmation,
    p_default_owner_user_id: payload.defaultOwnerUserId,
    p_valid_from: payload.validFrom,
    p_valid_until: payload.validUntil,
  });

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, data: { id: data as string } };
}

export type CompleteWeeklyRoutineResult =
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
        | "routine_not_scheduled"
        | "unknown";
      confirmationId?: string;
      confirmedAt?: string;
      confirmedByUserId?: string;
      confirmedByDisplayName?: string | null;
      message?: string;
    };

export async function completeWeeklyRoutine(
  client: SupabaseClient,
  routineId: string,
  localDate: string,
): Promise<CompleteWeeklyRoutineResult> {
  const { data, error } = await client.rpc("complete_weekly_routine", {
    p_routine_id: routineId,
    p_local_date: localDate,
  });
  if (error) return { ok: false, code: "unknown", message: error.message };
  const row = data as Record<string, unknown> | null;
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
    code === "routine_not_scheduled"
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

export type ReverseWeeklyRoutineResult =
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

export async function reverseWeeklyRoutineCompletion(
  client: SupabaseClient,
  confirmationId: string,
): Promise<ReverseWeeklyRoutineResult> {
  const { data, error } = await client.rpc("reverse_weekly_routine_completion", {
    p_completion_id: confirmationId,
  });
  if (error) return { ok: false, code: "unknown", message: error.message };
  const row = data as Record<string, unknown> | null;
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
