"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { fetchBackupStatus } from "@/lib/backup/fetch";
import { formatBackupStatusMessage } from "@/lib/backup/status";

const LOADING = "Backup automático: carregando estado… Operação best effort.";

export function HouseholdInformation() {
  const [message, setMessage] = useState(LOADING);
  const client = getSupabaseBrowserClient();

  useEffect(() => {
    if (!client) {
      setMessage(
        "Backup automático: ainda não há registro de execução. A rotina é best effort e usa artefato cifrado.",
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      const status = await fetchBackupStatus(client as SupabaseClient);
      if (cancelled) return;
      // null = never run or unreadable; formatter still covers freshness/unknown copy.
      setMessage(formatBackupStatusMessage(status));
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
        O Registro é compartilhado pelos dois Adultos desta Casa. Dados da família
        ficam no cache offline deste aparelho; o app shell público pode permanecer
        após sair. Notificações push podem mostrar conteúdo de dose na tela de
        bloqueio. Exclusão total da Casa é administrativa e invalida sessões e
        inscrições; backups cifrados expiram pela política de retenção. O app não
        oferece orientação médica. Proteja o aparelho com código ou biometria e não
        inclua dados desnecessários em instruções.
      </p>
    </section>
  );
}
