"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { signOut } from "@/lib/auth/session";
import { ChildrenSettings } from "@/components/household/ChildrenSettings";
import { MedicationsSettings } from "@/components/household/MedicationsSettings";
import { EventsSettings } from "@/components/household/EventsSettings";
import { RoutinesSettings } from "@/components/household/RoutinesSettings";
import { AdultsSettings } from "@/components/household/AdultsSettings";
import { HouseholdInformation } from "@/components/household/HouseholdInformation";
import { PushSettings } from "@/components/push/PushSettings";
import { clearUserAgendaCache, getDefaultAgendaCacheStore } from "@/lib/sync/agenda-cache";
import { useWritesAllowed } from "@/lib/sync/use-writes-allowed";
import { setSyncPhase } from "@/lib/sync/writes-gate";

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const client = getSupabaseBrowserClient();
  const writesAllowed = useWritesAllowed();

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

  return (
    <div data-settings-panel>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        Configurações
      </button>
      {open && (
        <div data-settings-content>
          {!writesAllowed ? (
            <p data-settings-writes-blocked role="status">
              Ações desabilitadas até reconectar e sincronizar.
            </p>
          ) : null}
          <fieldset disabled={!writesAllowed} data-settings-writes={writesAllowed ? "on" : "off"}>
            {client && <AdultsSettings client={client} />}
            {client && <ChildrenSettings client={client} />}
            {client && <RoutinesSettings client={client} />}
            {client && <MedicationsSettings client={client} />}
            {client && <EventsSettings client={client} />}
            {client && <PushSettings client={client} />}
          </fieldset>
          <HouseholdInformation />
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)}>
              Sair
            </button>
          ) : (
            <div data-logout-confirm>
              <p>Encerrar sessão neste aparelho?</p>
              <button type="button" onClick={() => void handleLogout()}>
                Confirmar saída
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
