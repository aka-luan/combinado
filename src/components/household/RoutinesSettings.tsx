"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCurrentHouseholdId,
  listChildren,
  listHouseholdMembers,
  type ChildRow,
  type HouseholdMemberRow,
} from "@/lib/household/children";
import { notifyHouseholdChanged } from "@/lib/household/events";
import { partitionChildren } from "@/lib/household/partition";
import {
  createWeeklyRoutine,
  listWeeklyRoutines,
  type WeeklyRoutineListItem,
} from "@/lib/household/routines";
import { localDateInHousehold } from "@/lib/household/routine-form";
import {
  householdWriteErrorCopy,
  isSchemaMissingError,
  membershipMissingCopy,
  schemaMissingCopy,
} from "@/lib/household/setup-home";
import { CASA_TARGET, listSharedTargets } from "@/lib/household/targets";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

function mapRoutineError(message?: string, code?: string): string {
  switch (message) {
    case "title_required":
      return "Informe um título.";
    case "weekdays_required":
      return "Escolha ao menos um dia da semana.";
    case "child_required":
      return "Escolha a criança.";
    case "informational_no_owner":
      return "Rotina informativa não pode ter responsável.";
    case "valid_from_required":
      return "Informe a data inicial.";
    case "invalid_time":
      return "Horário inválido (use HH:mm).";
    case "invalid_valid_range":
      return "Data final deve ser após a inicial.";
    case "household_missing":
      return householdWriteErrorCopy(message, code);
    default: {
      const mapped = householdWriteErrorCopy(message, code);
      return mapped === "Não foi possível salvar."
        ? "Não foi possível cadastrar a rotina."
        : mapped;
    }
  }
}

function weekdayLabels(weekdays: number[]): string {
  const map = new Map(WEEKDAYS.map((d) => [d.value, d.label]));
  return weekdays.map((d) => map.get(d) ?? String(d)).join(", ");
}

export function RoutinesSettings({ client }: { client: SupabaseClient }) {
  const [routines, setRoutines] = useState<WeeklyRoutineListItem[] | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [members, setMembers] = useState<HouseholdMemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [householdReady, setHouseholdReady] = useState(false);

  const [title, setTitle] = useState("");
  const [targetKey, setTargetKey] = useState<string>("casa");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [requiresConfirmation, setRequiresConfirmation] = useState(true);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [validFrom, setValidFrom] = useState(() => localDateInHousehold());
  const [validUntil, setValidUntil] = useState("");

  const activeChildren = useMemo(() => partitionChildren(children).active, [children]);
  const targets = useMemo(() => listSharedTargets(activeChildren), [activeChildren]);
  const activeMembers = useMemo(
    () => members.filter((m) => m.archived_at == null),
    [members],
  );

  const refresh = useCallback(async () => {
    const household = await fetchCurrentHouseholdId(client);
    if (!household.ok) {
      setHouseholdReady(false);
      setError(
        isSchemaMissingError(household.error.code, household.error.message)
          ? schemaMissingCopy()
          : membershipMissingCopy(),
      );
      setRoutines([]);
      return;
    }
    if (!household.data) {
      setHouseholdReady(false);
      setError(membershipMissingCopy());
      setRoutines([]);
      return;
    }
    setHouseholdReady(true);

    const [routinesResult, childrenResult, membersResult] = await Promise.all([
      listWeeklyRoutines(client),
      listChildren(client),
      listHouseholdMembers(client),
    ]);
    if (!routinesResult.ok) {
      setError("Não foi possível carregar as rotinas.");
      setRoutines([]);
    } else {
      setRoutines(routinesResult.data);
    }
    if (childrenResult.ok) setChildren(childrenResult.data);
    if (membersResult.ok) setMembers(membersResult.data);
    if (routinesResult.ok) setError(null);
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function toggleWeekday(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const targetKind = targetKey === "casa" ? "casa" : "child";
    const childId = targetKind === "child" ? targetKey : null;
    const owner = requiresConfirmation && ownerUserId ? ownerUserId : null;

    const result = await createWeeklyRoutine(client, {
      title,
      targetKind,
      childId,
      weekdays,
      scheduledTime: scheduledTime.trim() || null,
      requiresConfirmation,
      defaultOwnerUserId: owner,
      validFrom,
      validUntil: validUntil.trim() || null,
    });

    setPending(false);
    if (!result.ok) {
      setError(mapRoutineError(result.error.message, result.error.code));
      return;
    }

    setTitle("");
    setWeekdays([]);
    setOwnerUserId("");
    setValidUntil("");
    setValidFrom(localDateInHousehold());
    notifyHouseholdChanged();
    await refresh();
  }

  if (routines === null) {
    return <p data-routines-status="loading">Carregando rotinas…</p>;
  }

  return (
    <section data-routines-settings>
      <h2>Rotinas semanais</h2>
      <p data-routines-create-only>Cadastro apenas — edição e exceções vêm depois.</p>

      {error && <p data-routines-error>{error}</p>}

      <form data-routine-create onSubmit={handleCreate}>
        <label>
          Título
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
            disabled={pending}
            required
          />
        </label>

        <label>
          Alvo
          <select
            value={targetKey}
            onChange={(e) => setTargetKey(e.target.value)}
            disabled={pending}
          >
            {targets.map((t) => (
              <option key={t.kind === "casa" ? "casa" : t.childId} value={t.kind === "casa" ? "casa" : t.childId}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset data-routine-weekdays>
          <legend>Dias da semana</legend>
          {WEEKDAYS.map((day) => (
            <label key={day.value}>
              <input
                type="checkbox"
                checked={weekdays.includes(day.value)}
                onChange={() => toggleWeekday(day.value)}
                disabled={pending}
              />
              {day.label}
            </label>
          ))}
        </fieldset>

        <label>
          Horário
          <input
            type="time"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            disabled={pending}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={requiresConfirmation}
            onChange={(e) => {
              const next = e.target.checked;
              setRequiresConfirmation(next);
              if (!next) setOwnerUserId("");
            }}
            disabled={pending}
          />
          Requer confirmação
        </label>

        <label>
          Responsável padrão
          <select
            value={ownerUserId}
            onChange={(e) => setOwnerUserId(e.target.value)}
            disabled={pending || !requiresConfirmation}
          >
            <option value="">Nenhum</option>
            {activeMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Data inicial
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            disabled={pending}
            required
          />
        </label>

        <label>
          Data final (opcional)
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            disabled={pending}
          />
        </label>

        <button type="submit" disabled={pending || !householdReady}>
          Adicionar rotina
        </button>
      </form>

      <h3>Cadastradas</h3>
      {routines.length === 0 ? (
        <p data-routines-empty>Nenhuma rotina ainda.</p>
      ) : (
        <ul data-routines-list>
          {routines.map((routine) => (
            <li key={routine.id} data-routine-id={routine.id}>
              <span>
                {routine.title}
                {" · "}
                {routine.targetKind === "casa"
                  ? CASA_TARGET.label
                  : (activeChildren.find((c) => c.id === routine.childId)?.name ?? "criança")}
                {" · "}
                {weekdayLabels(routine.weekdays)}
                {routine.scheduledTime ? ` · ${routine.scheduledTime}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
