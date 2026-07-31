"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { loadBackupStatusMessage } from "@/lib/backup/fetch";

const FALLBACK =
  "Backup automático: administrado fora do PWA. O último horário não está disponível neste ambiente; a rotina é best effort e usa artefato cifrado.";

export function HouseholdInformation() {
  const [message, setMessage] = useState(FALLBACK);
  const client = getSupabaseBrowserClient();

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void (async () => {
      const next = await loadBackupStatusMessage(client as SupabaseClient);
      if (!cancelled) setMessage(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <section data-household-information>
      <h2>Casa, backup e privacidade</h2>
      <h3>Estado de backup</h3>
      <p data-backup-status>{message}</p>
      <h3>Aviso de privacidade</h3>
      <p data-privacy-notice>
        O Registro é compartilhado pelos dois Adultos desta Casa. O app não oferece
        orientação médica. Proteja o aparelho com código ou biometria e não inclua dados
        desnecessários em instruções.
      </p>
    </section>
  );
}
