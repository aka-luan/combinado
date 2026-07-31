import { getPushConfig } from "./config";
import { isInstalledPwa, readInstallProbe } from "./install";
import { resolvePushStatus, type PushUiStatus } from "./status";

export type PushStatusSnapshot = {
  status: PushUiStatus;
  permission: NotificationPermission | "unsupported";
  hasSubscription: boolean;
};

/** Shared browser probe for Configurações push surfaces (PRD §10.4). */
export async function readPushStatusSnapshot(): Promise<PushStatusSnapshot> {
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

export const PUSH_STATUS_COPY: Record<PushUiStatus, { title: string; body: string }> = {
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
