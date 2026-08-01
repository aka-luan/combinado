"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { signOut } from "@/lib/auth/session";
import { ChildrenSettings } from "@/components/household/ChildrenSettings";
import { MedicationsSettings } from "@/components/household/MedicationsSettings";
import { EventsSettings } from "@/components/household/EventsSettings";
import { RoutinesSettings } from "@/components/household/RoutinesSettings";
import { AdultsSettings } from "@/components/household/AdultsSettings";
import { HouseholdInformation } from "@/components/household/HouseholdInformation";
import { PushSettings } from "@/components/push/PushSettings";
import { OpsStatusSettings } from "@/components/settings/OpsStatusSettings";
import {
  SETTINGS_GROUPS,
  parseSettingsHash,
  settingsHash,
  settingsScreenLabel,
  type SettingsLocation,
  type SettingsScreen,
} from "@/lib/settings/navigation";
import { clearUserAgendaCache, getDefaultAgendaCacheStore } from "@/lib/sync/agenda-cache";
import { useWritesAllowed } from "@/lib/sync/use-writes-allowed";
import { setSyncPhase } from "@/lib/sync/writes-gate";

function writeSettingsLocation(location: SettingsLocation, replace = false) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.hash = settingsHash(location);
  if (replace) {
    window.history.replaceState({ settings: location.kind !== "closed" }, "", url);
  } else {
    window.history.pushState({ settings: location.kind !== "closed" }, "", url);
  }
}

function isWritableScreen(screen: SettingsScreen): boolean {
  return screen === "children" || screen === "routines" || screen === "medications" || screen === "events" || screen === "notifications";
}

export function SettingsPanel() {
  const [location, setLocation] = useState<SettingsLocation>(() =>
    typeof window === "undefined" ? { kind: "closed" } : parseSettingsHash(window.location.hash),
  );
  const [confirming, setConfirming] = useState(false);
  const client = getSupabaseBrowserClient();
  const writesAllowed = useWritesAllowed();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasVisitedSettings = useRef(location.kind !== "closed");
  const hasOwnedHistoryEntry = useRef(false);

  useEffect(() => {
    const onHistoryChange = () => {
      const next = parseSettingsHash(window.location.hash);
      setLocation(next);
      if (next.kind === "closed") hasOwnedHistoryEntry.current = false;
    };
    window.addEventListener("popstate", onHistoryChange);
    return () => window.removeEventListener("popstate", onHistoryChange);
  }, []);

  useEffect(() => {
    if (location.kind === "closed") {
      if (hasVisitedSettings.current) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
      return;
    }
    hasVisitedSettings.current = true;
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }, [location]);

  function openSettings() {
    if (location.kind !== "closed") {
      closeSettings();
      return;
    }
    writeSettingsLocation({ kind: "index" });
    hasOwnedHistoryEntry.current = true;
    setLocation({ kind: "index" });
  }

  function closeSettings() {
    if (hasOwnedHistoryEntry.current) {
      window.history.back();
      return;
    }
    writeSettingsLocation({ kind: "closed" }, true);
    setLocation({ kind: "closed" });
  }

  function navigateToScreen(screen: SettingsScreen) {
    writeSettingsLocation({ kind: "screen", screen });
    hasOwnedHistoryEntry.current = true;
    setLocation({ kind: "screen", screen });
  }

  function goBack() {
    if (location.kind === "screen") {
      if (hasOwnedHistoryEntry.current) {
        window.history.back();
      } else {
        writeSettingsLocation({ kind: "index" }, true);
        setLocation({ kind: "index" });
      }
      return;
    }
    closeSettings();
  }

  async function handleLogout() {
    if (!client) return;
    const { data } = await client.auth.getSession();
    const userId = data.session?.user?.id;
    if (userId) {
      await clearUserAgendaCache(userId, getDefaultAgendaCacheStore());
    }
    setSyncPhase("loading");
    await signOut(client);
  }

  const screen = location.kind === "screen" ? location.screen : null;

  return (
    <div data-settings-panel>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={location.kind !== "closed"}
        aria-controls="settings-content"
        onClick={openSettings}
      >
        {location.kind === "closed" ? "Configurações" : "Fechar Configurações"}
      </button>

      {location.kind !== "closed" ? (
        <div
          id="settings-content"
          data-settings-content
          data-settings-route={location.kind}
          data-settings-screen={screen ?? undefined}
        >
          {location.kind === "index" ? (
            <SettingsIndex
              confirming={confirming}
              headingRef={headingRef}
              onConfirmLogout={() => void handleLogout()}
              onNavigate={navigateToScreen}
              onStartLogout={() => setConfirming(true)}
              onCancelLogout={() => setConfirming(false)}
            />
          ) : (
            <SettingsScreen
              client={client}
              headingRef={headingRef}
              screen={location.screen}
              writesAllowed={writesAllowed}
              onBack={goBack}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function SettingsIndex({
  confirming,
  headingRef,
  onNavigate,
  onStartLogout,
  onConfirmLogout,
  onCancelLogout,
}: {
  confirming: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onNavigate: (screen: SettingsScreen) => void;
  onStartLogout: () => void;
  onConfirmLogout: () => void;
  onCancelLogout: () => void;
}) {
  return (
    <section data-settings-index aria-labelledby="settings-index-heading">
      <h2 id="settings-index-heading" ref={headingRef} tabIndex={-1}>
        Configurações
      </h2>
      <p data-settings-index-intro>
        Área secundária da Casa. Escolha um assunto para abrir uma tela focada.
      </p>
      <nav aria-label="Índice de Configurações">
        {SETTINGS_GROUPS.map((group) => (
          <section key={group.label} data-settings-group={group.label}>
            <h3>{group.label}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-settings-link={item.id}
                    onClick={() => onNavigate(item.id)}
                  >
                    <span>{item.label}</span>
                    <small>{item.description}</small>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <section data-settings-session aria-labelledby="settings-session-heading">
        <h3 id="settings-session-heading">Sessão</h3>
        {!confirming ? (
          <button type="button" onClick={onStartLogout}>
            Sair
          </button>
        ) : (
          <div data-logout-confirm>
            <p>Encerrar sessão neste aparelho?</p>
            <button type="button" onClick={onConfirmLogout}>
              Confirmar saída
            </button>
            <button type="button" onClick={onCancelLogout}>
              Cancelar
            </button>
          </div>
        )}
      </section>
    </section>
  );
}

function SettingsScreen({
  client,
  headingRef,
  screen,
  writesAllowed,
  onBack,
}: {
  client: ReturnType<typeof getSupabaseBrowserClient>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  screen: SettingsScreen;
  writesAllowed: boolean;
  onBack: () => void;
}) {
  const writable = isWritableScreen(screen);

  return (
    <section data-settings-focused aria-labelledby="settings-focused-heading">
      <div className="settings-focused__header">
        <button type="button" data-settings-back onClick={onBack}>
          Voltar
        </button>
        <h2 id="settings-focused-heading" ref={headingRef} tabIndex={-1}>
          {settingsScreenLabel(screen)}
        </h2>
      </div>
      {writable && !writesAllowed ? (
        <p data-settings-writes-blocked role="status">
          Ações desabilitadas até reconectar e sincronizar.
        </p>
      ) : null}
      <FocusedSettingsContent
        client={client}
        screen={screen}
        writable={writable}
        writesAllowed={writesAllowed}
      />
    </section>
  );
}

function FocusedSettingsContent({
  client,
  screen,
  writable,
  writesAllowed,
}: {
  client: ReturnType<typeof getSupabaseBrowserClient>;
  screen: SettingsScreen;
  writable: boolean;
  writesAllowed: boolean;
}) {
  if (screen === "household-state") {
    return (
      <section data-household-state-settings>
        <OpsStatusSettings client={client} />
        <HouseholdInformation />
      </section>
    );
  }

  if (!client) {
    return <p role="status">Supabase não configurado.</p>;
  }

  const content = (() => {
    switch (screen) {
      case "adults":
        return <AdultsSettings client={client} />;
      case "children":
        return <ChildrenSettings client={client} />;
      case "routines":
        return <RoutinesSettings client={client} />;
      case "medications":
        return <MedicationsSettings client={client} />;
      case "events":
        return <EventsSettings client={client} />;
      case "notifications":
        return <PushSettings client={client} />;
    }
  })();

  return writable ? (
    <fieldset disabled={!writesAllowed} data-settings-writes={writesAllowed ? "on" : "off"}>
      {content}
    </fieldset>
  ) : (
    content
  );
}
