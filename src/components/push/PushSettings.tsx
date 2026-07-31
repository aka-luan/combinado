"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPushConfig } from "@/lib/push/config";
import { isInstalledPwa, readInstallProbe } from "@/lib/push/install";
import { resolvePushStatus, type PushUiStatus } from "@/lib/push/status";
import {
  ensurePushSubscription,
  upsertPushSubscription,
  type ServiceWorkerRegistrationLike,
} from "@/lib/push/subscription";

type Snapshot = {
  status: PushUiStatus;
  permission: NotificationPermission | "unsupported";
  hasSubscription: boolean;
};

async function readSnapshot(): Promise<Snapshot> {
  const config = getPushConfig();
  const pushSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  if (!config) {
    return { status: "config-missing", permission: "unsupported", hasSubscription: false };
  }
  if (!pushSupported) {
    return { status: "unsupported", permission: "unsupported", hasSubscription: false };
  }

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

  return {
    status: resolvePushStatus({
      pushSupported: true,
      vapidConfigured: true,
      installed,
      permission,
      hasSubscription,
    }),
    permission,
    hasSubscription,
  };
}

const STATUS_COPY: Record<PushUiStatus, { title: string; body: string }> = {
  active: {
    title: "Notificações ativas",
    body: "Este aparelho receberá lembretes quando o Combinado enviar.",
  },
  "permission-required": {
    title: "Permissão necessária",
    body: "As notificações são opcionais. Elas ajudam a lembrar doses e o resumo de amanhã, mas o registro compartilhado continua funcionando sem elas. No iPhone, se o Modo Foco silenciar alertas, permita o Combinado no Focus relevante.",
  },
  "reinstall-required": {
    title: "Reinstalação ou reparo necessário",
    body: "Instale o Combinado na Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra pelo ícone. Se já estiver instalado e a permissão estiver concedida, toque em Reparar inscrição.",
  },
  unsupported: {
    title: "Notificações indisponíveis",
    body: "Este navegador não oferece Web Push.",
  },
  "config-missing": {
    title: "Notificações não configuradas",
    body: "As notificações push não estão disponíveis neste ambiente.",
  },
};

export function PushSettings({ client }: { client: SupabaseClient }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setSnapshot(await readSnapshot());
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

  const copy = STATUS_COPY[snapshot.status];

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
