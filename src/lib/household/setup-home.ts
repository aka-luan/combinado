/** First-run Hoje cue when the Casa has no active child (PRD §12.1 / issue #16). */

export function isHouseholdSetupNeeded(activeChildCount: number): boolean {
  return activeChildCount === 0;
}

export function setupHomeCopy(): string {
  return "Configurar casa — cadastre uma criança e uma rotina semanal em Configurações, depois volte para Hoje.";
}
