"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { signOut } from "@/lib/auth/session";
import { PushSettings } from "@/components/push/PushSettings";

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const client = getSupabaseBrowserClient();

  async function handleLogout() {
    if (!client) return;
    await signOut(client);
  }

  return (
    <div data-settings-panel>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        Configurações
      </button>
      {open && (
        <div data-settings-content>
          {client && <PushSettings client={client} />}
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)}>
              Sair
            </button>
          ) : (
            <div data-logout-confirm>
              <p>Encerrar sessão neste aparelho?</p>
              <button type="button" onClick={handleLogout}>
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
