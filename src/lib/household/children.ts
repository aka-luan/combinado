import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePersonName } from "./names";
import type { ChildRow, HouseholdMemberRow } from "./types";

export type { ChildRow, HouseholdMemberRow };

export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; code?: string } };

export async function fetchCurrentHouseholdId(
  client: SupabaseClient,
): Promise<MutationResult<string | null>> {
  const { data, error } = await client.rpc("current_household_id");
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, data: data ?? null };
}

export async function listChildren(
  client: SupabaseClient,
): Promise<MutationResult<ChildRow[]>> {
  const { data, error } = await client
    .from("children")
    .select("id, household_id, name, archived_at, active_from, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, data: (data ?? []) as ChildRow[] };
}

export async function listHouseholdMembers(
  client: SupabaseClient,
): Promise<MutationResult<HouseholdMemberRow[]>> {
  const { data, error } = await client
    .from("household_members")
    .select("household_id, user_id, display_name, archived_at")
    .order("display_name", { ascending: true });

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, data: (data ?? []) as HouseholdMemberRow[] };
}

export async function createChild(
  client: SupabaseClient,
  rawName: string,
): Promise<MutationResult<ChildRow>> {
  const name = normalizePersonName(rawName);
  if (!name) {
    return { ok: false, error: { message: "name_required" } };
  }

  const household = await fetchCurrentHouseholdId(client);
  if (!household.ok) return household;
  if (!household.data) {
    return { ok: false, error: { message: "household_missing" } };
  }

  const { data, error } = await client
    .from("children")
    .insert({ household_id: household.data, name })
    .select("id, household_id, name, archived_at, active_from, created_at, updated_at")
    .single();

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, data: data as ChildRow };
}

export async function renameChild(
  client: SupabaseClient,
  childId: string,
  rawName: string,
): Promise<MutationResult<ChildRow>> {
  const name = normalizePersonName(rawName);
  if (!name) {
    return { ok: false, error: { message: "name_required" } };
  }

  const { data, error } = await client
    .from("children")
    .update({ name })
    .eq("id", childId)
    .select("id, household_id, name, archived_at, active_from, created_at, updated_at")
    .single();

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, data: data as ChildRow };
}

export async function archiveChild(
  client: SupabaseClient,
  childId: string,
): Promise<MutationResult<{ id: string; archived: boolean; effectiveFrom: string }>> {
  const { data, error } = await client.rpc("archive_child", { p_child_id: childId });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  const row = data as Record<string, unknown> | null;
  if (row?.ok !== true || typeof row.child_id !== "string" || typeof row.effective_from !== "string") {
    return { ok: false, error: { message: "invalid_child_archive_response" } };
  }
  return {
    ok: true,
    data: { id: row.child_id, archived: row.archived === true, effectiveFrom: row.effective_from },
  };
}

export async function unarchiveChild(
  client: SupabaseClient,
  childId: string,
): Promise<MutationResult<{ id: string; archived: boolean; effectiveFrom: string }>> {
  const { data, error } = await client.rpc("reactivate_child", { p_child_id: childId });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  const row = data as Record<string, unknown> | null;
  if (row?.ok !== true || typeof row.child_id !== "string" || typeof row.effective_from !== "string") {
    return { ok: false, error: { message: "invalid_child_reactivation_response" } };
  }
  return {
    ok: true,
    data: { id: row.child_id, archived: row.archived === true, effectiveFrom: row.effective_from },
  };
}

export { partitionChildren } from "./partition";
