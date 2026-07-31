"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isInstalledPwa, readInstallProbe } from "@/lib/push/install";
import {
  PUSH_STATUS_COPY,
  readPushStatusSnapshot,
  type PushStatusSnapshot,
} from "@/lib/push/read-status";
import { getPushConfig } from "@/lib/push/config";
import {
  ensurePushSubscription,
  upsertPushSubscription,
  type ServiceWorkerRegistrationLike,
} from "@/lib/push/subscription";

export function PushSettings({ client }: { client: SupabaseClient }) {
  const [snapshot, setSnapshot] = useState<PushStatusSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setSnapshot(await readPushStatusSnapshot());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function subscribeAndStore() {
    const config = getPushConfig();
    if (!config) return;

    setPending(true);
    setError(null);
    try {
      const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistrationLike;
      const keys = await ensurePushSubscription(registration, config.vapidPublicKey);
      if (!keys) {
        setError("Não foi possível criar a inscrição de push.");
        return;
      }
      const result = await upsertPushSubscription(client, keys, navigator.userAgent);
      if (!result.ok) {
        setError("Não foi possível guardar a inscrição. Tente de novo.");
        return;
      }
    } catch {
      setError("Falha ao ativar notificações.");
    } finally {
      setPending(false);
      await refresh();
    }
  }

  async function handleEnable() {
    if (!isInstalledPwa(readInstallProbe())) {
      await refresh();
      return;
    }

    setPending(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPending(false);
        await refresh();
        return;
      }
      await subscribeAndStore();
    } catch {
      setError("Falha ao pedir permissão de notificação.");
      setPending(false);
      await refresh();
    }
  }

  async function handleRepair() {
    if (Notification.permission !== "granted") {
      await refresh();
      return;
    }
    await subscribeAndStore();
  }

  if (!snapshot) {
    return <p data-push-status="loading">Verificando notificações…</p>;
  }

  const copy = PUSH_STATUS_COPY[snapshot.status];

  return (
    <section data-push-settings data-push-status={snapshot.status}>
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      {error && <p data-push-error>{error}</p>}
      {snapshot.status === "permission-required" && isInstalledPwa(readInstallProbe()) && (
        <button type="button" data-push-enable disabled={pending} onClick={handleEnable}>
          {pending ? "Ativando…" : "Ativar notificações"}
        </button>
      )}
      {snapshot.status === "reinstall-required" && snapshot.permission === "granted" && (
        <button type="button" data-push-repair disabled={pending} onClick={handleRepair}>
          {pending ? "Reparando…" : "Reparar inscrição"}
        </button>
      )}
    </section>
  );
}
