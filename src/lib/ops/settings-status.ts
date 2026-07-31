import type { PushUiStatus } from "../push/status";

export type SettingsOpsInput = {
  online: boolean;
  /** Already formatted via `formatLastSyncLabel`, or null when never synced. */
  lastSyncLabel: string | null;
  pushStatus: PushUiStatus;
  backupMessage: string;
};

export type SettingsConnectivity =
  | { kind: "online" }
  | { kind: "offline" };

export type SettingsLastSync =
  | { kind: "known"; label: string }
  | { kind: "unknown"; label: string };

export type SettingsOpsStatus = {
  connectivity: SettingsConnectivity;
  lastSync: SettingsLastSync;
  pushStatus: PushUiStatus;
  backupMessage: string;
};

const UNKNOWN_SYNC = "Última sincronização: ainda não sincronizado neste aparelho.";

/** User-facing Configurações ops block (PRD §§12.3, 21, 22) — no vendor names. */
export function resolveSettingsOpsStatus(input: SettingsOpsInput): SettingsOpsStatus {
  const connectivity: SettingsConnectivity = input.online
    ? { kind: "online" }
    : { kind: "offline" };

  const lastSync: SettingsLastSync = input.lastSyncLabel
    ? { kind: "known", label: input.lastSyncLabel }
    : { kind: "unknown", label: UNKNOWN_SYNC };

  return {
    connectivity,
    lastSync,
    pushStatus: input.pushStatus,
    backupMessage: input.backupMessage,
  };
}

export function formatConnectivityLabel(connectivity: SettingsConnectivity): string {
  return connectivity.kind === "online"
    ? "Conectividade: online"
    : "Conectividade: offline — ações ficam desabilitadas até reconectar.";
}

export function formatSettingsOpsLines(status: SettingsOpsStatus): string[] {
  return [
    formatConnectivityLabel(status.connectivity),
    status.lastSync.label,
    `Notificações: ${status.pushStatus}`,
    status.backupMessage,
  ];
}
