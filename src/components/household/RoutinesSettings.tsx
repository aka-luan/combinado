"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  archiveWeeklyRoutine,
  createWeeklyRoutine,
  editWeeklyRoutine,
  listWeeklyRoutines,
  restoreWeeklyRoutine,
  type WeeklyRoutineEditInput,
  type WeeklyRoutineListItem,
} from "@/lib/household/routines";
import {
  fetchCurrentHouseholdId,
  listChildren,
  listHouseholdMembers,
  type ChildRow,
  type HouseholdMemberRow,
} from "@/lib/household/children";
import { notifyHouseholdChanged } from "@/lib/household/events";
import { partitionChildren } from "@/lib/household/partition";
import { localDateInHousehold } from "@/lib/household/routine-form";
import { OCCURRENCE_TITLE_MAX_LENGTH } from "@/lib/agenda/title-limits";
import { useInteractionBusy } from "@/lib/pwa/use-interaction-busy";
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
    case "title_too_long":
      return "O título deve ter até 120 caracteres.";
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
    case "routine_version_conflict":
      return "Outra alteração chegou. Recarregue as rotinas antes de salvar.";
    case "routine_archived":
      return "Esta rotina já foi arquivada.";
    case "routine_not_active_tomorrow":
      return "A rotina precisa continuar válida amanhã para ser editada.";
    case "invalid_routine_restore_response":
      return "Não foi possível reativar a rotina.";
    case "invalid_weekday":
      return "Escolha dias válidos da semana.";
    default: {
      const mapped = householdWriteErrorCopy(message, code);
      return mapped === "Não foi possível salvar."
        ? "Não foi possível salvar a rotina."
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
  const [archiveId, setArchiveId] = useState<string | null>(null);

  const today = localDateInHousehold();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [targetKey, setTargetKey] = useState("casa");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [requiresConfirmation, setRequiresConfirmation] = useState(true);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [validFrom, setValidFrom] = useState(today);
  const [validUntil, setValidUntil] = useState("");

  const activeChildren = useMemo(() => partitionChildren(children).active, [children]);
  const targets = useMemo(() => listSharedTargets(activeChildren), [activeChildren]);
  const activeMembers = useMemo(
    () => members.filter((member) => member.archived_at == null),
    [members],
  );
  const activeRoutines = useMemo(
    () => (routines ?? []).filter((routine) => !routine.archived),
    [routines],
  );
  useInteractionBusy(pending || editingId !== null || archiveId !== null || title.trim().length > 0);
  const archivedRoutines = useMemo(
    () => (routines ?? []).filter((routine) => routine.archived),
    [routines],
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
    if (routinesResult.ok && editingId === null) setError(null);
  }, [client, editingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setEditingVersionId(null);
    setTitle("");
    setTargetKey("casa");
    setWeekdays([]);
    setScheduledTime("08:00");
    setRequiresConfirmation(true);
    setOwnerUserId("");
    setValidFrom(localDateInHousehold());
    setValidUntil("");
  }

  function beginEdit(routine: WeeklyRoutineListItem) {
    setEditingId(routine.id);
    setEditingVersionId(routine.versionId);
    setTitle(routine.title);
    setTargetKey(routine.targetKind === "casa" ? "casa" : routine.childId ?? "casa");
    setWeekdays(routine.weekdays);
    setScheduledTime(routine.scheduledTime ?? "");
    setRequiresConfirmation(routine.requiresConfirmation);
    setOwnerUserId(routine.defaultOwnerUserId ?? "");
    setValidFrom(routine.validFrom);
    setValidUntil(routine.validUntil ?? "");
    setError(null);
  }

  function toggleWeekday(day: number) {
    setWeekdays((previous) =>
      previous.includes(day)
        ? previous.filter((value) => value !== day)
        : [...previous, day].sort((a, b) => a - b),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const targetKind = targetKey === "casa" ? "casa" : "child";
    const input = {
      title,
      targetKind,
      childId: targetKind === "child" ? targetKey : null,
      weekdays,
      scheduledTime: scheduledTime.trim() || null,
      requiresConfirmation,
      defaultOwnerUserId: requiresConfirmation && ownerUserId ? ownerUserId : null,
      validFrom,
      validUntil: validUntil.trim() || null,
    } as const;

    const result =
      editingId && editingVersionId
        ? await editWeeklyRoutine(client, {
            ...input,
            routineId: editingId,
            expectedVersionId: editingVersionId,
          } satisfies WeeklyRoutineEditInput)
        : await createWeeklyRoutine(client, input);

    setPending(false);
    if (!result.ok) {
      setError(mapRoutineError(result.error.message, result.error.code));
      return;
    }

    resetForm();
    notifyHouseholdChanged();
    await refresh();
  }

  async function handleArchive(routine: WeeklyRoutineListItem) {
    if (archiveId !== routine.id) {
      setArchiveId(routine.id);
      return;
    }
    setPending(true);
    setError(null);
    const result = await archiveWeeklyRoutine(client, routine.id, routine.versionId);
    setArchiveId(null);
    setPending(false);
    if (!result.ok) {
      setError(mapRoutineError(result.error.message, result.error.code));
      return;
    }
    notifyHouseholdChanged();
    await refresh();
  }

  async function handleRestore(routine: WeeklyRoutineListItem) {
    setPending(true);
    setError(null);
    const result = await restoreWeeklyRoutine(client, routine.id, routine.versionId);
    setPending(false);
    if (!result.ok) {
      setError(mapRoutineError(result.error.message, result.error.code));
      return;
    }
    notifyHouseholdChanged();
    await refresh();
  }

  if (routines === null) {
    return <p data-routines-status="loading">Carregando rotinas…</p>;
  }

  return (
    <section data-routines-settings>
      <h2>Rotinas semanais</h2>
      <p data-routines-planning-hint>
        Edições e arquivamento passam a valer amanhã. Hoje pode receber uma exceção.
      </p>
      {error ? <p data-routines-error>{error}</p> : null}

      <form data-routine-create={editingId ? undefined : true} data-routine-edit={editingId ?? undefined} onSubmit={handleSubmit}>
        <label>
          Título
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoComplete="off"
            disabled={pending}
            maxLength={OCCURRENCE_TITLE_MAX_LENGTH}
            required
          />
        </label>

        <label>
          Alvo
          <select value={targetKey} onChange={(event) => setTargetKey(event.target.value)} disabled={pending}>
            {targets.map((target) => (
              <option
                key={target.kind === "casa" ? "casa" : target.childId}
                value={target.kind === "casa" ? "casa" : target.childId}
              >
                {target.label}
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
            onChange={(event) => setScheduledTime(event.target.value)}
            disabled={pending}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={requiresConfirmation}
            onChange={(event) => {
              const next = event.target.checked;
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
            onChange={(event) => setOwnerUserId(event.target.value)}
            disabled={pending || !requiresConfirmation}
          >
            <option value="">Nenhum</option>
            {activeMembers.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Data inicial
          <input
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            disabled={pending}
            required
          />
        </label>

        <label>
          Data final (opcional)
          <input
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            disabled={pending}
          />
        </label>

        <div className="routine-form-actions">
          <button type="submit" disabled={pending || !householdReady}>
            {editingId ? "Salvar alteração para amanhã" : "Adicionar rotina"}
          </button>
          {editingId ? (
            <button type="button" disabled={pending} onClick={resetForm}>
              Cancelar edição
            </button>
          ) : null}
        </div>
      </form>

      <h3>Ativas</h3>
      {activeRoutines.length === 0 ? (
        <p data-routines-empty>Nenhuma rotina ativa.</p>
      ) : (
        <ul data-routines-list>
          {activeRoutines.map((routine) => (
            <li key={routine.id} data-routine-id={routine.id}>
              <span>
                {routine.title}
                {" · "}
                {routine.targetKind === "casa"
                  ? CASA_TARGET.label
                  : (activeChildren.find((child) => child.id === routine.childId)?.name ?? "criança")}
                {" · "}
                {weekdayLabels(routine.weekdays)}
                {routine.scheduledTime ? ` · ${routine.scheduledTime}` : ""}
              </span>
              <span className="routine-actions">
                <button type="button" disabled={pending} onClick={() => beginEdit(routine)}>
                  Editar
                </button>
                {archiveId === routine.id ? (
                  <>
                    <button type="button" disabled={pending} onClick={() => void handleArchive(routine)}>
                      Confirmar arquivamento
                    </button>
                    <button type="button" disabled={pending} onClick={() => setArchiveId(null)}>
                      Voltar
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={pending} onClick={() => void handleArchive(routine)}>
                    Arquivar amanhã
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3>Arquivadas</h3>
      {archivedRoutines.length === 0 ? (
        <p data-routines-archived-empty>Nenhuma rotina arquivada.</p>
      ) : (
        <ul data-routines-archived>
          {archivedRoutines.map((routine) => (
            <li key={routine.id} data-routine-id={routine.id} data-routine-archived="true">
              <span>{routine.title} · {weekdayLabels(routine.weekdays)}</span>
              <button type="button" disabled={pending} onClick={() => void handleRestore(routine)}>
                Reativar amanhã
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
