/**
 * Normalize a person/child name: trim outer whitespace; empty → null.
 * Names need not be unique (PRD §3).
 */
export function normalizePersonName(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
