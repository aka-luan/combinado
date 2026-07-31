/** Backup operational status for Configurações (PRD §16). */

export const BACKUP_STALE_AFTER_MS = 26 * 60 * 60 * 1000;

export type BackupRunStatus = "success" | "failure";

export type BackupStatus = {
  lastStatus: BackupRunStatus | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastRestoreRehearsalAt: string | null;
};

export type BackupFreshness =
  | { kind: "unknown"; stale: true }
  | { kind: "ok"; stale: boolean; lastSuccessAt: string };

export function evaluateBackupFreshness(
  lastSuccessAt: string | null | undefined,
  now: Date = new Date(),
): BackupFreshness {
  if (!lastSuccessAt) {
    return { kind: "unknown", stale: true };
  }
  const successMs = Date.parse(lastSuccessAt);
  if (!Number.isFinite(successMs)) {
    return { kind: "unknown", stale: true };
  }
  const age = now.getTime() - successMs;
  return {
    kind: "ok",
    stale: age > BACKUP_STALE_AFTER_MS,
    lastSuccessAt,
  };
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function asErrorCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Keep only a short operational token — never free-form family data.
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(trimmed)) return null;
  return trimmed;
}

export function parseBackupStatusRow(row: unknown): BackupStatus | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const lastStatus = r.last_status;
  if (lastStatus !== "success" && lastStatus !== "failure" && lastStatus != null) {
    return null;
  }
  if (lastStatus == null) {
    // Row may exist solely for restore-rehearsal stamp before the first backup run.
    const rehearsal = asIso(r.last_restore_rehearsal_at);
    if (!rehearsal) return null;
    return {
      lastStatus: null,
      lastAttemptAt: null,
      lastSuccessAt: asIso(r.last_success_at),
      lastErrorCode: null,
      lastRestoreRehearsalAt: rehearsal,
    };
  }
  const lastAttemptAt = asIso(r.last_attempt_at);
  if (!lastAttemptAt) return null;
  return {
    lastStatus,
    lastAttemptAt,
    lastSuccessAt: asIso(r.last_success_at),
    lastErrorCode: asErrorCode(r.last_error_code),
    lastRestoreRehearsalAt: asIso(r.last_restore_rehearsal_at),
  };
}

function formatPtBrInstant(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatBackupStatusMessage(
  status: BackupStatus | null,
  now: Date = new Date(),
): string {
  if (!status || status.lastStatus == null) {
    return "Backup automático: ainda não há registro de execução. A rotina é best effort e usa artefato cifrado.";
  }

  const freshness = evaluateBackupFreshness(status.lastSuccessAt, now);
  const successLabel = status.lastSuccessAt
    ? formatPtBrInstant(status.lastSuccessAt)
    : null;

  if (status.lastStatus === "failure") {
    const code = status.lastErrorCode ? ` (${status.lastErrorCode})` : "";
    const lastOk = successLabel
      ? ` Último sucesso: ${successLabel}.`
      : " Nenhum sucesso registrado.";
    const staleNote = freshness.stale
      ? " Alerta: último backup bem-sucedido ultrapassou 26 h."
      : "";
    return `Backup automático: a última tentativa falhou${code}.${lastOk}${staleNote} Operação best effort.`;
  }

  if (freshness.kind === "unknown" || !successLabel) {
    return "Backup automático: estado indisponível. Operação best effort.";
  }

  if (freshness.stale) {
    return `Backup automático: último sucesso em ${successLabel} — desatualizado (mais de 26 h). Operação best effort.`;
  }

  return `Backup automático: último sucesso em ${successLabel}. Operação best effort; artefato cifrado.`;
}
