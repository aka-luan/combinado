/** Shared household/setup copy and PostgREST error classification. */

export type HouseholdGate =
  | { kind: "ready" }
  | { kind: "setup_children" }
  | { kind: "membership_missing" }
  | { kind: "schema_missing" }
  | { kind: "unavailable" };

export function isHouseholdSetupNeeded(activeChildCount: number): boolean {
  return activeChildCount === 0;
}

export function setupHomeCopy(): string {
  return "Configurar casa — cadastre uma criança e uma rotina semanal em Configurações, depois volte para Hoje.";
}

/** Shown when the Adult is authenticated but not linked to the singleton Casa. */
export function membershipMissingCopy(): string {
  return "Esta conta ainda não faz parte da Casa. Peça o bootstrap à operação administrativa (bootstrap_household) com o identificador deste Adulto — ver o runbook da Casa.";
}

/** Shown when household RPCs/tables are not deployed to the linked project. */
export function schemaMissingCopy(): string {
  return "O servidor da Casa ainda não tem as migrations aplicadas. Peça à operação administrativa que aplique as migrations e rode o bootstrap.";
}

/** Pulls app exception tokens like `child_not_in_household` out of PostgREST wrappers. */
export function extractAppErrorToken(message?: string): string | undefined {
  if (!message) return undefined;
  const trimmed = message.trim();
  if (/^[a-z][a-z0-9_]+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\b([a-z][a-z0-9_]{2,})\b/);
  const known = [
    "household_missing",
    "name_required",
    "child_required",
    "child_not_in_household",
    "child_not_found",
    "child_has_active_dependencies",
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
  return "Falta aplicar a migration de medicamentos no servidor da Casa. Peça à operação administrativa que aplique o schema de medicamentos e recarregue o schema da API.";
}

export function householdWriteErrorCopy(message?: string, code?: string): string {
  const token = extractAppErrorToken(message);
  if (token === "household_missing") return membershipMissingCopy();
  if (isSchemaMissingError(code, message)) return schemaMissingCopy();
  return "Não foi possível salvar.";
}
