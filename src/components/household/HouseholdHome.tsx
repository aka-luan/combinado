"use client";

import { useCallback, useEffect, useState } from "react";
import { AgendaHome } from "@/components/agenda/AgendaHome";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { listChildren } from "@/lib/household/children";
import { HOUSEHOLD_CHANGED_EVENT } from "@/lib/household/events";
import { partitionChildren } from "@/lib/household/partition";
import { setupHomeCopy, isHouseholdSetupNeeded } from "@/lib/household/setup-home";

/**
 * When the household has no active children, Hoje shows the setup cue (PRD §12.1 / issue #16).
 * Otherwise the authoritative agenda snapshot drives Hoje / Amanhã.
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
    setState(isHouseholdSetupNeeded(active.length) ? "setup" : "ready");
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
    return <p data-household-home="setup">{setupHomeCopy()}</p>;
  }

  return (
    <div data-household-home="ready">
      <AgendaHome />
    </div>
  );
}
