import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCurrentHouseholdId,
  type MutationResult,
} from "./children";
import {
  normalizeMedicationCreate,
  type MedicationCreateInput,
} from "./medication-form";

export type {
  MedicationCreateInput,
  MedicationCreatePayload,
  NormalizeMedicationResult,
} from "./medication-form";
export { normalizeMedicationCreate } from "./medication-form";

export type MedicationListItem = {
  id: string;
  childId: string;
  name: string;
  instruction: string | null;
  slots: string[];
  validFrom: string;
  validUntil: string | null;
  interruptedAt: string | null;
};

export async function listMedications(
  client: SupabaseClient,
): Promise<MutationResult<MedicationListItem[]>> {
  const { data, error } = await client
    .from("medications")
    .select(
      `
      id,
      medication_versions (
        child_id,
        name,
        instruction,
        slots,
        valid_from,
        valid_until,
        effective_from,
        interrupted_at,
        created_at
      )
    `,
    )
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: { message: error.message, code: error.code } };

  const items: MedicationListItem[] = [];
  for (const row of data ?? []) {
    const versions = Array.isArray(row.medication_versions)
      ? row.medication_versions
      : row.medication_versions
        ? [row.medication_versions]
        : [];
    if (versions.length === 0) continue;
    const latest = [...versions].sort((a, b) => {
      const byEffective = String(b.effective_from).localeCompare(String(a.effective_from));
      if (byEffective !== 0) return byEffective;
      return String(b.created_at).localeCompare(String(a.created_at));
    })[0];
    items.push({
      id: row.id as string,
      childId: latest.child_id as string,
      name: latest.name as string,
      instruction: (latest.instruction as string | null) ?? null,
      slots: (latest.slots as string[]) ?? [],
      validFrom: latest.valid_from as string,
      validUntil: (latest.valid_until as string | null) ?? null,
      interruptedAt: (latest.interrupted_at as string | null) ?? null,
    });
  }

  return { ok: true, data: items };
}

export async function createMedication(
  client: SupabaseClient,
  input: MedicationCreateInput,
): Promise<MutationResult<{ id: string }>> {
  const normalized = normalizeMedicationCreate(input);
  if (!normalized.ok) {
    return { ok: false, error: { message: normalized.error } };
  }

  const household = await fetchCurrentHouseholdId(client);
  if (!household.ok) return household;
  if (!household.data) {
    return { ok: false, error: { message: "household_missing" } };
  }

  const payload = normalized.data;
  const { data, error } = await client.rpc("create_medication", {
    p_child_id: payload.childId,
    p_name: payload.name,
    p_instruction: payload.instruction,
    p_slots: payload.slots,
    p_valid_from: payload.validFrom,
    p_valid_until: payload.validUntil,
  });

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, data: { id: data as string } };
}

export async function interruptMedicationImmediate(
  client: SupabaseClient,
  medicationId: string,
): Promise<MutationResult<{ interruptedAt: string; already: boolean }>> {
  const { data, error } = await client.rpc("interrupt_medication_immediate", {
    p_medication_id: medicationId,
  });

  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  const row = data as {
    ok?: boolean;
    interrupted_at?: string;
    already?: boolean;
  } | null;
  if (!row?.ok || !row.interrupted_at) {
    return { ok: false, error: { message: "interrupt_failed" } };
  }
  return {
    ok: true,
    data: { interruptedAt: row.interrupted_at, already: Boolean(row.already) },
  };
}
