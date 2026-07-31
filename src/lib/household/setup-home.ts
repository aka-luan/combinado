/** First-run Hoje cue when the Casa has no active child (PRD §12.1 / issue #16). */

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
  return "Esta conta ainda não faz parte da Casa. Peça o bootstrap no Supabase (SQL Editor → bootstrap_household) com o UUID deste Adulto — ver docs/runbook-household.md.";
}

/** Shown when household RPCs/tables are not deployed to the linked Supabase project. */
export function schemaMissingCopy(): string {
  return "O servidor da Casa ainda não tem as migrations aplicadas. Aplique supabase/migrations no projeto Supabase e rode o bootstrap.";
}

export function isSchemaMissingError(code?: string, message?: string): boolean {
  if (code === "PGRST202" || code === "42883" || code === "42P01") return true;
  if (!message) return false;
  return (
    message.includes("Could not find the function") ||
    message.includes("does not exist")
  );
}

export function householdWriteErrorCopy(message?: string, code?: string): string {
  if (message === "household_missing") return membershipMissingCopy();
  if (isSchemaMissingError(code, message)) return schemaMissingCopy();
  return "Não foi possível salvar.";
}
