"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushUiStatus } from "@/lib/push/status";
import { PUSH_STATUS_COPY, readPushStatusSnapshot } from "@/lib/push/read-status";
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
    void readPushStatusSnapshot().then((snap) => setPushStatus(snap.status));
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
        {PUSH_STATUS_COPY[pushStatus].title}. {PUSH_STATUS_COPY[pushStatus].body}
      </p>
      <p data-ops-backup>{status.backupMessage}</p>
      <p data-ops-best-effort>
        Pausas do plano gratuito, cotas, falhas de e-mail e atrasos de jobs são
        best effort — sem SLA.
      </p>
    </section>
  );
}
