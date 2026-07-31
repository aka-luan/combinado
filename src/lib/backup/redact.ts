/** Redact secrets and connection material from backup automation logs. */

const DATABASE_URL_RE =
  /(?:postgres(?:ql)?:\/\/[^\s"']+)|(?:DATABASE_URL\s*=\s*[^\s"']+)/gi;

const PGPASSWORD_RE = /\bPGPASSWORD\s*=\s*[^\s"']+/gi;

const AGE_SECRET_RE = /\bAGE-SECRET-KEY-[A-Z0-9]+/gi;

const GENERIC_PASSWORD_RE =
  /\b((?:password|passwd|db_password|supabase_db_password)\s*[=:]\s*)([^\s"']+)/gi;

export function redactBackupLogLine(line: string): string {
  return line
    .replace(DATABASE_URL_RE, "[REDACTED_DATABASE_URL]")
    .replace(PGPASSWORD_RE, "PGPASSWORD=[REDACTED]")
    .replace(AGE_SECRET_RE, "[REDACTED_AGE_SECRET]")
    .replace(GENERIC_PASSWORD_RE, "$1[REDACTED]");
}

export function redactBackupLog(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => redactBackupLogLine(line))
    .join("\n");
}
