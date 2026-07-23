"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { signOut } from "@/lib/auth/session";

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleLogout() {
    const client = getSupabaseBrowserClient();
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
