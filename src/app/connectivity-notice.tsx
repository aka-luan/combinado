"use client";

import { useSyncExternalStore } from "react";
import { formatLastSyncLabel } from "@/lib/sync/policy";
import {
  getLastSyncedAt,
  getSyncPhase,
  subscribeSyncPhase,
} from "@/lib/sync/writes-gate";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function ConnectivityNotice({ surface = "registro" }: { surface?: "access" | "registro" }) {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const syncPhase = useSyncExternalStore(subscribeSyncPhase, getSyncPhase, () => "loading");
  const lastSyncedAt = useSyncExternalStore(subscribeSyncPhase, getLastSyncedAt, () => null);

  let statusKind = "ready";
  let message = lastSyncedAt
    ? `Conexão ativa · ${formatLastSyncLabel(lastSyncedAt)}`
    : "Conexão ativa";

  if (surface === "access" && isOnline) {
    return null;
  }

  if (surface === "access") {
    statusKind = "offline";
    message = "Sem conexão. O acesso ao Combinado precisa de conexão.";
  } else if (!isOnline && syncPhase === "unavailable") {
    statusKind = "offline";
    message = "Sem conexão. O Registro está indisponível neste aparelho.";
  } else if (!isOnline || syncPhase === "offline_cached") {
    statusKind = "offline";
    message =
      "Sem conexão. Mostrando a última versão sincronizada; ações ficam bloqueadas até atualizar o Registro.";
  } else if (syncPhase === "reconnecting") {
    statusKind = "reconnecting";
    message = "Atualizando o Registro…";
  } else if (syncPhase === "error" || syncPhase === "unavailable") {
    statusKind = "error";
    message = "Não foi possível atualizar o Registro. Nada foi alterado. Tente novamente.";
  } else if (syncPhase === "loading") {
    statusKind = "loading";
    message = "Carregando o Registro…";
  }

  return (
    <p
      className={`shell-status shell-status--${statusKind}`}
      data-shell-status={statusKind}
      data-offline-notice={statusKind === "offline" ? "" : undefined}
      role="status"
    >
      <span className="shell-status__icon" aria-hidden="true">
        {statusKind === "error" ? "!" : statusKind === "offline" ? "⌁" : statusKind === "loading" || statusKind === "reconnecting" ? "…" : "✓"}
      </span>
      <span>{message}</span>
    </p>
  );
}
