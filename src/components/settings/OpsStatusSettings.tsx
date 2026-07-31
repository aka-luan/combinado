"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPushConfig } from "@/lib/push/config";
import { isInstalledPwa, readInstallProbe } from "@/lib/push/install";
import { resolvePushStatus, type PushUiStatus } from "@/lib/push/status";
import {
  formatConnectivityLabel,
  resolveSettingsOpsStatus,
} from "@/lib/ops/settings-status";
import { fetchBackupStatus } from "@/lib/backup/fetch";
import { formatBackupStatusMessage } from "@/lib/backup/status";
import { formatLastSyncLabel } from "@/lib/sync/policy";
import {
  getLastSyncedAt,
  subscribeSyncPhase,
} from "@/lib/sync/writes-gate";

async function readPushStatus(): Promise<PushUiStatus> {
  const config = getPushConfig();
  const pushSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  if (!config) return "config-missing";
  if (!pushSupported) return "unsupported";

  const installed = isInstalledPwa(readInstallProbe());
  const permission = Notification.permission;
  let hasSubscription = false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    hasSubscription = existing !== null;
  } catch {
    hasSubscription = false;
  }

  return resolvePushStatus({
    pushSupported: true,
    vapidConfigured: true,
    installed,
    permission,
    hasSubscription,
  });
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * Configurações block for connectivity, last sync, push summary, and backup
 * freshness — user-useful states only (PRD §§12.3, 21, 22).
 */
export function OpsStatusSettings({ client }: { client: SupabaseClient | null }) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const syncedAt = useSyncExternalStore(
    subscribeSyncPhase,
    getLastSyncedAt,
    () => null,
  );
  const [pushStatus, setPushStatus] = useState<PushUiStatus>("unsupported");
  const [backupMessage, setBackupMessage] = useState(
    "Backup automático: carregando estado… Operação best effort.",
  );

  useEffect(() => {
    void readPushStatus().then(setPushStatus);
  }, [online]);

  useEffect(() => {
    if (!client) {
      setBackupMessage(
        "Backup automático: ainda não há registro de execução. A rotina é best effort e usa artefato cifrado.",
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      const status = await fetchBackupStatus(client);
      if (cancelled) return;
      setBackupMessage(formatBackupStatusMessage(status));
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const status = resolveSettingsOpsStatus({
    online,
    lastSyncLabel: syncedAt ? formatLastSyncLabel(syncedAt) : null,
    pushStatus,
    backupMessage,
  });

  return (
    <section data-ops-status>
      <h2>Estado operacional</h2>
      <p data-ops-connectivity>{formatConnectivityLabel(status.connectivity)}</p>
      <p data-ops-last-sync>{status.lastSync.label}</p>
      <p data-ops-push-summary>
        {pushStatus === "active"
          ? "Notificações: ativas neste aparelho."
          : pushStatus === "permission-required"
            ? "Notificações: permissão necessária."
            : pushStatus === "reinstall-required"
              ? "Notificações: reinstalação ou reparo necessário."
              : pushStatus === "config-missing"
                ? "Notificações: não configuradas neste ambiente."
                : "Notificações: indisponíveis neste navegador."}
      </p>
      <p data-ops-backup>{status.backupMessage}</p>
      <p data-ops-best-effort>
        Pausas do plano gratuito, cotas, falhas de e-mail e atrasos de jobs são
        best effort — sem SLA.
      </p>
    </section>
  );
}
