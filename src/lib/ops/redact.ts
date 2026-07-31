/**
 * Operational log redaction (PRD §17): telemetry may keep codes/latency/counts
 * but never child names, titles, medicines, or instructions.
 */

const FAMILY_FIELD =
  /\b(child(?:_name)?|title|medicine(?:_name)?|medication|instruction|instrução|criança|medicamento)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi;

const ALLOWED_KEYS = new Set([
  "type",
  "result",
  "attempt",
  "attempts",
  "occurrence_id",
  "user_id",
  "installation_id",
  "subscription_id",
  "code",
  "error_code",
  "latency_ms",
  "expires_at",
  "next_attempt_at",
  "status",
]);

export function redactOperationalLogLine(line: string): string {
  return line.replace(FAMILY_FIELD, (_match, field: string) => `${field}=[redacted]`);
}

export function redactOperationalLog(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => redactOperationalLogLine(line))
    .join("\n");
}

/** Drop disallowed keys from a structured ops payload before persistence/logging. */
export function sanitizeOperationalFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}
