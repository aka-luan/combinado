/** Shared household/setup copy and PostgREST error classification. */

export function isHouseholdSetupNeeded(activeChildCount: number): boolean {
  return activeChildCount === 0;
}

export function setupHomeCopy(): string {
  return "Configurar casa — cadastre uma criança e uma rotina semanal em Configurações, depois volte para Hoje.";
}

export function membershipMissingCopy(): string {
  return "Esta conta ainda não faz parte da Casa. Peça o bootstrap no Supabase (SQL Editor → bootstrap_household) com o UUID deste Adulto — ver docs/runbook-household.md.";
}

export function schemaMissingCopy(): string {
  return "Falta aplicar a migration de medicamentos no Supabase (arquivo 20260730200000_medications.sql no SQL Editor). Depois: NOTIFY pgrst, 'reload schema';";
}

/** Pulls app exception tokens like `child_not_in_household` out of PostgREST wrappers. */
export function extractAppErrorToken(message?: string): string | undefined {
  if (!message) return undefined;
  const trimmed = message.trim();
  if (/^[a-z][a-z0-9_]+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\b([a-z][a-z0-9_]{2,})\b/);
  // Prefer known tokens when nested in longer PostgREST text.
  const known = [
    "household_missing",
    "name_required",
    "child_required",
    "child_not_in_household",
    "slots_required",
    "duplicate_slots",
    "invalid_slot",
    "valid_from_required",
    "invalid_valid_range",
    "invalid_valid_until",
  ];
  for (const token of known) {
    if (trimmed.includes(token)) return token;
  }
  return match?.[1];
}

export function isSchemaMissingError(code?: string, message?: string): boolean {
  if (
    code === "PGRST202" ||
    code === "PGRST204" ||
    code === "42883" ||
    code === "42P01" ||
    code === "42501"
  ) {
    return true;
  }
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the function") ||
    lower.includes("could not find the table") ||
    lower.includes("does not exist") ||
    lower.includes("permission denied for function") ||
    lower.includes("permission denied for table") ||
    lower.includes("schema cache")
  );
}

export function medicationSchemaMissingCopy(): string {
  return schemaMissingCopy();
}
