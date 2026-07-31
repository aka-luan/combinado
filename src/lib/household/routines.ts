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
  title: string;
  targetKind: "casa" | "child";
  childId: string | null;
  weekdays: number[];
  scheduledTime: string | null;
  requiresConfirmation: boolean;
  defaultOwnerUserId: string | null;
  validFrom: string;
  validUntil: string | null;
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
      title: latest.title as string,
      targetKind: latest.target_kind as "casa" | "child",
      childId: (latest.child_id as string | null) ?? null,
      weekdays: (latest.weekdays as number[]) ?? [],
      scheduledTime: (latest.scheduled_time as string | null) ?? null,
      requiresConfirmation: Boolean(latest.requires_confirmation),
      defaultOwnerUserId: (latest.default_owner_user_id as string | null) ?? null,
      validFrom: latest.valid_from as string,
      validUntil: (latest.valid_until as string | null) ?? null,
    });
  }

  return { ok: true, data: items };
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
