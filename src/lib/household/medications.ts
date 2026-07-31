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
  versionId: string;
  childId: string;
  name: string;
  instruction: string | null;
  slots: string[];
  validFrom: string;
  validUntil: string | null;
  interruptedAt: string | null;
  archived: boolean;
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
        id,
        child_id,
        name,
        instruction,
        slots,
        valid_from,
        valid_until,
        effective_from,
        interrupted_at,
        archived,
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
      versionId: latest.id as string,
      childId: latest.child_id as string,
      name: latest.name as string,
      instruction: (latest.instruction as string | null) ?? null,
      slots: (latest.slots as string[]) ?? [],
      validFrom: latest.valid_from as string,
      validUntil: (latest.valid_until as string | null) ?? null,
      interruptedAt: (latest.interrupted_at as string | null) ?? null,
      archived: Boolean(latest.archived),
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

export type MedicationEditInput = MedicationCreateInput & {
  medicationId: string;
  expectedVersionId: string;
};

type MedicationMutationResult = MutationResult<{
  medicationId: string;
  versionId?: string;
  effectiveFrom?: string;
  already?: boolean;
}>;

function parseMedicationMutation(data: unknown, fallback: string): MedicationMutationResult {
  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true || typeof row.medication_id !== "string") {
    return { ok: false, error: { message: fallback } };
  }
  return {
    ok: true,
    data: {
      medicationId: row.medication_id,
      versionId: typeof row.version_id === "string" ? row.version_id : undefined,
      effectiveFrom: typeof row.effective_from === "string" ? row.effective_from : undefined,
      already: row.already === true,
    },
  };
}

export async function editMedication(
  client: SupabaseClient,
  input: MedicationEditInput,
): Promise<MedicationMutationResult> {
  const normalized = normalizeMedicationCreate(input);
  if (!normalized.ok) return { ok: false, error: { message: normalized.error } };
  const { data, error } = await client.rpc("edit_medication", {
    p_medication_id: input.medicationId,
    p_expected_version_id: input.expectedVersionId,
    p_child_id: normalized.data.childId,
    p_name: normalized.data.name,
    p_instruction: normalized.data.instruction,
    p_slots: normalized.data.slots,
    p_valid_from: normalized.data.validFrom,
    p_valid_until: normalized.data.validUntil,
  });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return parseMedicationMutation(data, "invalid_medication_edit_response");
}

export async function archiveMedication(
  client: SupabaseClient,
  medicationId: string,
  expectedVersionId: string,
): Promise<MedicationMutationResult> {
  const { data, error } = await client.rpc("archive_medication", {
    p_medication_id: medicationId,
    p_expected_version_id: expectedVersionId,
  });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return parseMedicationMutation(data, "invalid_medication_archive_response");
}

export async function restoreMedication(
  client: SupabaseClient,
  medicationId: string,
  expectedVersionId: string,
): Promise<MedicationMutationResult> {
  const { data, error } = await client.rpc("restore_medication", {
    p_medication_id: medicationId,
    p_expected_version_id: expectedVersionId,
  });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return parseMedicationMutation(data, "invalid_medication_restore_response");
}
