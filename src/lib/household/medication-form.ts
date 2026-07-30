/** Client-side validation for medication create (PRD §9.2). */

export type MedicationCreateInput = {
  childId: string;
  name: string;
  instruction: string | null;
  slots: string[];
  validFrom: string;
  validUntil: string | null;
};

export type MedicationCreatePayload = {
  childId: string;
  name: string;
  instruction: string | null;
  slots: string[];
  validFrom: string;
  validUntil: string | null;
};

export type NormalizeMedicationResult =
  | { ok: true; data: MedicationCreatePayload }
  | { ok: false; error: string };

const TIME_RE = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeMedicationCreate(
  input: MedicationCreateInput,
): NormalizeMedicationResult {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "name_required" };

  if (!input.childId) return { ok: false, error: "child_required" };

  const slotsRaw = input.slots.map((s) => s.trim()).filter(Boolean);
  if (slotsRaw.length === 0) return { ok: false, error: "slots_required" };

  const seen = new Set<string>();
  for (const slot of slotsRaw) {
    if (!TIME_RE.test(slot)) return { ok: false, error: "invalid_slot" };
    if (seen.has(slot)) return { ok: false, error: "duplicate_slots" };
    seen.add(slot);
  }
  const slots = [...seen].sort();

  if (!input.validFrom || !DATE_RE.test(input.validFrom)) {
    return { ok: false, error: "valid_from_required" };
  }
  const validUntil = input.validUntil?.trim() || null;
  if (validUntil && !DATE_RE.test(validUntil)) {
    return { ok: false, error: "invalid_valid_until" };
  }
  if (validUntil && validUntil < input.validFrom) {
    return { ok: false, error: "invalid_valid_range" };
  }

  const instruction = input.instruction?.trim() || null;

  return {
    ok: true,
    data: {
      childId: input.childId,
      name,
      instruction,
      slots,
      validFrom: input.validFrom,
      validUntil,
    },
  };
}
