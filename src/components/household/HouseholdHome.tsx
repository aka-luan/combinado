"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgendaHome } from "@/components/agenda/AgendaHome";
import { HouseholdSetupFlow } from "@/components/household/HouseholdSetupFlow";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import {
  fetchCurrentHouseholdId,
  listChildren,
  type ChildRow,
} from "@/lib/household/children";
import { HOUSEHOLD_CHANGED_EVENT } from "@/lib/household/events";
import { partitionChildren } from "@/lib/household/partition";
import { listMedications } from "@/lib/household/medications";
import { listWeeklyRoutines } from "@/lib/household/routines";
import { localDateInHousehold } from "@/lib/household/routine-form";
import {
  hasUsefulHouseholdSetup,
  isActiveConfigurationOnDate,
  isSchemaMissingError,
  membershipMissingCopy,
  schemaMissingCopy,
  type HouseholdSetupProgress,
} from "@/lib/household/setup-home";

type HouseholdGate =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "setup"; children: ChildRow[]; progress: HouseholdSetupProgress }
  | { kind: "membership_missing" }
  | { kind: "schema_missing" }
  | { kind: "unavailable" };

/**
 * When the household has no active children, Hoje shows the setup cue (PRD §12.1 / issue #16).
 * Membership/schema gaps get distinct copy — they are not the child+routine path.
 */
export function HouseholdHome() {
  const [client] = useState(() => getSupabaseBrowserClient());
  const [gate, setGate] = useState<HouseholdGate | { kind: "loading" }>({ kind: "loading" });
  const onboardingLocked = useRef(false);

  const refresh = useCallback(async () => {
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
    if (active.length === 0) {
      onboardingLocked.current = true;
      setGate({
        kind: "setup",
        children: active,
        progress: { activeChildCount: 0, activeRoutineCount: 0, activeMedicationCount: 0 },
      });
      return;
    }

    const [routines, medications] = await Promise.all([
      listWeeklyRoutines(client),
      listMedications(client),
    ]);
    const localDate = localDateInHousehold();
    const activeChildIds = new Set(active.map((child) => child.id));
    const progress: HouseholdSetupProgress = {
      activeChildCount: active.length,
      activeRoutineCount: routines.ok
        ? routines.data.filter(
            (routine) =>
              !routine.archived &&
              isActiveConfigurationOnDate(routine.validFrom, routine.validUntil, localDate) &&
              (routine.targetKind === "casa" ||
                (routine.childId !== null && activeChildIds.has(routine.childId))),
          ).length
        : 0,
      activeMedicationCount: medications.ok
        ? medications.data.filter(
            (medication) =>
              !medication.archived &&
              !medication.interruptedAt &&
              activeChildIds.has(medication.childId) &&
              isActiveConfigurationOnDate(medication.validFrom, medication.validUntil, localDate),
          ).length
        : 0,
    };

    if (hasUsefulHouseholdSetup(progress)) {
      if (onboardingLocked.current) {
        setGate({ kind: "setup", children: active, progress });
      } else {
        setGate({ kind: "ready" });
      }
      return;
    }

    const failedResult = !routines.ok ? routines : !medications.ok ? medications : null;
    if (failedResult) {
      setGate(
        isSchemaMissingError(failedResult.error.code, failedResult.error.message)
          ? { kind: "schema_missing" }
          : { kind: "unavailable" },
      );
      return;
    }

    onboardingLocked.current = true;
    setGate({
      kind: "setup",
      children: active,
      progress,
    });
  }, [client]);

  const openToday = useCallback(async () => {
    onboardingLocked.current = false;
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(HOUSEHOLD_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(HOUSEHOLD_CHANGED_EVENT, onChange);
  }, [refresh]);

  if (gate.kind === "loading") {
    return <p data-household-home="loading">Carregando a Casa…</p>;
  }

  if (!client || gate.kind === "unavailable") {
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

  if (gate.kind === "setup") {
    return (
      <div data-household-home="setup">
        <HouseholdSetupFlow
          client={client}
          activeChildren={gate.children}
          progress={gate.progress}
          onOpenToday={openToday}
        />
      </div>
    );
  }

  return (
    <div data-household-home="ready" data-today-primary="true">
      <AgendaHome />
    </div>
  );
}
