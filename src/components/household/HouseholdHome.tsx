"use client";

import { useCallback, useEffect, useState } from "react";
import { AgendaHome } from "@/components/agenda/AgendaHome";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { fetchCurrentHouseholdId, listChildren } from "@/lib/household/children";
import { HOUSEHOLD_CHANGED_EVENT } from "@/lib/household/events";
import { partitionChildren } from "@/lib/household/partition";
import {
  isHouseholdSetupNeeded,
  isSchemaMissingError,
  membershipMissingCopy,
  schemaMissingCopy,
  setupHomeCopy,
  type HouseholdGate,
} from "@/lib/household/setup-home";

/**
 * When the household has no active children, Hoje shows the setup cue (PRD §12.1 / issue #16).
 * Membership/schema gaps get distinct copy — they are not the child+routine path.
 */
export function HouseholdHome() {
  const [gate, setGate] = useState<HouseholdGate | { kind: "loading" }>({ kind: "loading" });

  const refresh = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setGate({ kind: "unavailable" });
      return;
    }

    const household = await fetchCurrentHouseholdId(client);
    if (!household.ok) {
      setGate(
        isSchemaMissingError(household.error.code, household.error.message)
          ? { kind: "schema_missing" }
          : { kind: "membership_missing" },
      );
      return;
    }
    if (!household.data) {
      setGate({ kind: "membership_missing" });
      return;
    }

    const result = await listChildren(client);
    if (!result.ok) {
      setGate(
        isSchemaMissingError(result.error.code, result.error.message)
          ? { kind: "schema_missing" }
          : { kind: "membership_missing" },
      );
      return;
    }
    const { active } = partitionChildren(result.data);
    setGate(isHouseholdSetupNeeded(active.length) ? { kind: "setup_children" } : { kind: "ready" });
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(HOUSEHOLD_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(HOUSEHOLD_CHANGED_EVENT, onChange);
  }, [refresh]);

  if (gate.kind === "loading") {
    return <p data-household-home="loading">Carregando…</p>;
  }

  if (gate.kind === "unavailable") {
    return null;
  }

  if (gate.kind === "membership_missing") {
    return (
      <p data-household-home="membership-missing" role="status">
        {membershipMissingCopy()}
      </p>
    );
  }

  if (gate.kind === "schema_missing") {
    return (
      <p data-household-home="schema-missing" role="status">
        {schemaMissingCopy()}
      </p>
    );
  }

  if (gate.kind === "setup_children") {
    return <p data-household-home="setup">{setupHomeCopy()}</p>;
  }

  return (
    <div data-household-home="ready" data-today-primary="true">
      <AgendaHome />
    </div>
  );
}
