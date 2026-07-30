"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { listChildren } from "@/lib/household/children";
import { HOUSEHOLD_CHANGED_EVENT } from "@/lib/household/events";
import { partitionChildren } from "@/lib/household/partition";

/**
 * When the household has no active children, Hoje shows the setup cue (PRD §12.1).
 */
export function HouseholdHome() {
  const [state, setState] = useState<"loading" | "setup" | "ready" | "unavailable">("loading");

  const refresh = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setState("unavailable");
      return;
    }

    const result = await listChildren(client);
    if (!result.ok) {
      setState("setup");
      return;
    }
    const { active } = partitionChildren(result.data);
    setState(active.length === 0 ? "setup" : "ready");
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(HOUSEHOLD_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(HOUSEHOLD_CHANGED_EVENT, onChange);
  }, [refresh]);

  if (state === "loading") {
    return <p data-household-home="loading">Carregando…</p>;
  }

  if (state === "unavailable") {
    return null;
  }

  if (state === "setup") {
    return (
      <p data-household-home="setup">
        Configurar casa — cadastre a primeira criança em Configurações.
      </p>
    );
  }

  return <p data-household-home="ready">Hoje</p>;
}
