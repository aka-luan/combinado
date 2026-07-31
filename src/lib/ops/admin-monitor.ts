/** Administrative ops snapshot formatting (PRD §§17, 21) — codes and counts only. */

export type AdminMonitorSnapshot = {
  lastCronAt: string | null;
  outboxPendingCount: number;
  outboxFailedCount: number;
  realtimeErrorCount: number;
  lastRealtimeErrorAt: string | null;
  lastBackupSuccessAt: string | null;
  lastRestoreRehearsalAt: string | null;
};

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function asNonNegInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return 0;
}

export function parseAdminMonitorSnapshot(row: unknown): AdminMonitorSnapshot | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return {
    lastCronAt: asIso(r.last_cron_at),
    outboxPendingCount: asNonNegInt(r.outbox_pending_count),
    outboxFailedCount: asNonNegInt(r.outbox_failed_count),
    realtimeErrorCount: asNonNegInt(r.realtime_error_count),
    lastRealtimeErrorAt: asIso(r.last_realtime_error_at),
    lastBackupSuccessAt: asIso(r.last_backup_success_at),
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

function stamp(label: string, iso: string | null): string {
  return iso ? `${label}: ${formatPtBrInstant(iso)}` : `${label}: (nenhum)`;
}

/** Plain-text admin report — safe to paste into logs (no family content). */
export function formatAdminMonitorReport(snapshot: AdminMonitorSnapshot | null): string {
  if (!snapshot) {
    return "Monitoramento operacional: snapshot indisponível. Operação best effort (sem SLA).";
  }
  return [
    "Monitoramento operacional (best effort, sem SLA):",
    stamp("Último cron", snapshot.lastCronAt),
    `Outbox pendente: ${snapshot.outboxPendingCount}; falhas: ${snapshot.outboxFailedCount}`,
    `Erros de Realtime: ${snapshot.realtimeErrorCount}` +
      (snapshot.lastRealtimeErrorAt
        ? ` (último ${formatPtBrInstant(snapshot.lastRealtimeErrorAt)})`
        : ""),
    stamp("Último backup com sucesso", snapshot.lastBackupSuccessAt),
    stamp("Último teste de restauração", snapshot.lastRestoreRehearsalAt),
  ].join("\n");
}
