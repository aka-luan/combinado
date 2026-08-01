"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listHouseholdMembers, type HouseholdMemberRow } from "@/lib/household/children";

export function AdultsSettings({ client }: { client: SupabaseClient }) {
  const [members, setMembers] = useState<HouseholdMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listHouseholdMembers(client);
    if (!result.ok) {
      setError("Não foi possível carregar os Adultos autorizados.");
      setMembers([]);
      return;
    }
    setError(null);
    setMembers(result.data);
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (members === null) return <p data-adults-status="loading">Carregando Adultos…</p>;
  const active = members.filter((member) => member.archived_at === null);
  const archived = members.filter((member) => member.archived_at !== null);

  return (
    <section data-adults-settings>
      <h2>Adultos</h2>
      <p>Os dois Adultos têm as mesmas permissões e veem o mesmo Registro.</p>
      {error ? <p data-adults-error>{error}</p> : null}
      <h3>Ativos</h3>
      {active.length === 0 ? (
        <p data-adults-active-empty>Nenhum Adulto ativo encontrado.</p>
      ) : (
        <ul data-adults-active>
          {active.map((member) => <li key={member.user_id}>{member.display_name}</li>)}
        </ul>
      )}
      {archived.length > 0 ? (
        <>
          <h3>Arquivados</h3>
          <ul data-adults-archived>
            {archived.map((member) => <li key={member.user_id}>{member.display_name}</li>)}
          </ul>
        </>
      ) : null}
      <p data-adults-admin-note>
        Troca de Adulto é uma operação administrativa: preserve a autoria histórica e siga
        docs/runbook-auth.md e docs/runbook-household.md.
      </p>
    </section>
  );
}
