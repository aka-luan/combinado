"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  confirmDose,
  reverseDoseConfirmation,
} from "@/lib/agenda/confirm-dose";
import {
  cancelOneOffEvent,
  completeOneOffEvent,
  editOneOffEvent,
  reverseOneOffEventCompletion,
} from "@/lib/household/one-off-events";
import {
  listChildren,
  listHouseholdMembers,
  type ChildRow,
  type HouseholdMemberRow,
} from "@/lib/household/children";
import {
  completeWeeklyRoutine,
  restoreWeeklyRoutineException,
  reverseWeeklyRoutineCompletion,
  saveWeeklyRoutineException,
} from "@/lib/household/routines";
import {
  isCancellableEvent,
  isConfirmableDose,
  isConfirmableEvent,
  isConfirmableRoutine,
  isEditableEvent,
  isReversibleDose,
  isReversibleEvent,
  isReversibleRoutine,
  needsEarlyConfirmationAck,
  statusLabel,
  ownerAlertPresentation,
  undoDeadlineFromServer,
} from "@/lib/agenda/presentation";
import type { SnapshotOccurrence } from "@/lib/agenda/types";
import { runWithSeparatedPhases } from "@/lib/pwa/action-phases";
import { useInteractionBusy } from "@/lib/pwa/use-interaction-busy";
import { OccurrenceSheet } from "./OccurrenceSheet";

type Props = {
  occurrence: SnapshotOccurrence;
  day: "today" | "tomorrow";
  serverTime: string;
  timezone: string;
  client: SupabaseClient | null;
  /** False while offline or awaiting reconnect refetch (PRD §14). */
  writesAllowed?: boolean;
  onChanged: () => Promise<void>;
  detailsOpen: boolean;
  onOpenDetails: () => void;
  onCloseDetails: () => void;
};

function eventEditErrorCopy(message: string): string {
  switch (message) {
    case "title_required":
      return "Informe o título do compromisso.";
    case "title_too_long":
      return "O título deve ter até 120 caracteres.";
    case "invalid_date":
    case "date_required":
      return "Informe uma data válida.";
    case "date_in_past":
      return "Escolha Hoje ou uma data futura.";
    case "event_not_future":
      return "Eventos de Hoje não podem ser editados diretamente.";
    case "invalid_time":
      return "Use um horário entre 00:00 e 23:59.";
    case "child_required":
      return "Escolha uma Criança para este alvo.";
    case "informational_no_responsible":
      return "Um compromisso informativo não possui Responsável.";
    case "responsible_not_in_household":
      return "Escolha um Responsável desta Casa.";
    case "event_cancelled":
      return "Este compromisso foi cancelado e não pode ser editado.";
    case "event_not_found":
      return "Este compromisso não está mais disponível. Atualize a agenda.";
    default:
      return "Não foi possível editar o compromisso. Nada foi alterado. Tente novamente.";
  }
}

type EventEditErrorField = "title" | "date" | "target" | "time" | "responsible";

function eventEditErrorField(message: string): EventEditErrorField | null {
  switch (message) {
    case "title_required":
    case "title_too_long":
      return "title";
    case "invalid_date":
    case "date_required":
    case "date_in_past":
    case "event_not_future":
      return "date";
    case "invalid_target_kind":
    case "casa_target_has_child":
    case "child_required":
    case "child_not_in_household":
      return "target";
    case "invalid_time":
      return "time";
    case "informational_no_responsible":
    case "responsible_not_in_household":
      return "responsible";
    default:
      return null;
  }
}

export function OccurrenceRow({
  occurrence,
  day,
  serverTime,
  timezone,
  client,
  writesAllowed = true,
  onChanged,
  detailsOpen,
  onOpenDetails,
  onCloseDetails,
}: Props) {
  const alert = ownerAlertPresentation(occurrence);
  const time = occurrence.scheduled_time ?? "Sem horário";
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [earlyPrompt, setEarlyPrompt] = useState(false);
  const [correctPrompt, setCorrectPrompt] = useState(false);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [eventAction, setEventAction] = useState<"edit" | null>(null);
  const [eventTitle, setEventTitle] = useState(occurrence.title);
  const [eventDate, setEventDate] = useState(occurrence.local_date);
  const [eventTarget, setEventTarget] = useState(
    occurrence.target_kind === "casa" ? "casa" : occurrence.child_id ?? "casa",
  );
  const [eventTime, setEventTime] = useState(occurrence.scheduled_time ?? "");
  const [eventRequiresConfirmation, setEventRequiresConfirmation] = useState(
    occurrence.requires_confirmation,
  );
  const [eventResponsibleUserId, setEventResponsibleUserId] = useState(
    occurrence.owner_user_id ?? "",
  );
  const [eventEditError, setEventEditError] = useState<{
    field: EventEditErrorField;
    message: string;
  } | null>(null);
  const [routineAction, setRoutineAction] = useState<
    "cancel" | "reschedule" | "owner" | "details" | null
  >(null);
  const [routineTime, setRoutineTime] = useState(occurrence.scheduled_time ?? "");
  const [routineOwner, setRoutineOwner] = useState(occurrence.owner_user_id ?? "");
  const [routineCancel, setRoutineCancel] = useState(occurrence.status === "cancelled");
  const [routineMembers, setRoutineMembers] = useState<HouseholdMemberRow[]>([]);
  const [eventMembers, setEventMembers] = useState<HouseholdMemberRow[]>([]);
  const [eventChildren, setEventChildren] = useState<ChildRow[]>([]);
  const [, setTick] = useState(0);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);

  const editingInProgress =
    busy ||
    earlyPrompt ||
    correctPrompt ||
    cancelPrompt ||
    eventAction !== null ||
    routineAction !== null;
  useInteractionBusy(editingInProgress);

  const confirmable =
    (isConfirmableDose(occurrence, day) ||
      isConfirmableEvent(occurrence, day) ||
      isConfirmableRoutine(occurrence, day)) &&
    !busy &&
    writesAllowed;
  const reversibleEligible =
    isReversibleDose(occurrence, day) ||
    isReversibleEvent(occurrence, day) ||
    isReversibleRoutine(occurrence, day);
  const reversible = reversibleEligible && writesAllowed;
  const cancellableEligible =
    isCancellableEvent(occurrence, day) && occurrence.status !== "completed";
  const cancellable = cancellableEligible && !busy && writesAllowed;
  const undoUntil = undoDeadlineFromServer(
    occurrence.confirmed_at ?? null,
    serverTime,
  );
  const showUndo = reversible && undoUntil !== null && Date.now() < undoUntil;

  const routineCanShowActions = occurrence.source === "routine" && Boolean(client);
  const routineHasActiveException = occurrence.routine_exception_active === true;
  const eventCanEdit =
    isEditableEvent(occurrence, day) &&
    Boolean(client) &&
    Boolean(occurrence.planning_revision_id);

  useEffect(() => {
    setRoutineTime(occurrence.scheduled_time ?? "");
    setRoutineOwner(occurrence.owner_user_id ?? "");
    setRoutineCancel(occurrence.status === "cancelled");
    setRoutineAction(null);
    if (eventAction === "edit") return;
    setEventAction(null);
    setEventEditError(null);
    setEventTitle(occurrence.title);
    setEventDate(occurrence.local_date);
    setEventTarget(occurrence.target_kind === "casa" ? "casa" : occurrence.child_id ?? "casa");
    setEventTime(occurrence.scheduled_time ?? "");
    setEventRequiresConfirmation(occurrence.requires_confirmation);
    setEventResponsibleUserId(occurrence.owner_user_id ?? "");
  }, [
    eventAction,
    occurrence.key,
    occurrence.scheduled_time,
    occurrence.owner_user_id,
    occurrence.status,
  ]);

  useEffect(() => {
    if (!writesAllowed) setEarlyPrompt(false);
  }, [writesAllowed]);

  useEffect(() => {
    if (!detailsOpen || !client || (!routineCanShowActions && occurrence.source !== "event")) return;
    void Promise.all([listHouseholdMembers(client), listChildren(client)]).then(
      ([membersResult, childrenResult]) => {
        if (membersResult.ok) {
          if (routineCanShowActions) setRoutineMembers(membersResult.data);
          if (occurrence.source === "event") setEventMembers(membersResult.data);
        }
        if (childrenResult.ok && occurrence.source === "event") {
          setEventChildren(childrenResult.data);
        }
      },
    );
  }, [client, detailsOpen, occurrence.source, routineCanShowActions]);

  useEffect(() => {
    if (undoUntil === null) return;
    const remaining = undoUntil - Date.now();
    if (remaining <= 0) {
      setTick((n) => n + 1);
      return;
    }
    const t = window.setTimeout(() => setTick((n) => n + 1), remaining);
    return () => window.clearTimeout(t);
  }, [undoUntil]);

  async function runConfirm(acknowledgeEarly: boolean) {
    if (!client || !writesAllowed) return;
    setEarlyPrompt(false);

    await runWithSeparatedPhases({
      onImmediateFeedback: () => {
        setBusy(true);
        setFeedback(null);
      },
      persist: async () => {
        if (occurrence.source === "event") {
          const result = await completeOneOffEvent(client, occurrence.source_id);
          if (result.ok) {
            await onChanged();
            setBusy(false);
            return;
          }
          if (result.code === "already_completed") {
            const when = formatConfirmTime(result.confirmedAt ?? "", timezone);
            const who = result.confirmedByDisplayName ?? "Outro adulto";
            setFeedback(`Já concluído por ${who}${when ? ` às ${when}` : ""}.`);
            await onChanged();
          } else {
            setFeedback("Não foi possível concluir o compromisso. Nada foi alterado. Tente novamente.");
          }
          setBusy(false);
          return;
        }

        if (occurrence.source === "routine") {
          const result = await completeWeeklyRoutine(client, occurrence.source_id, occurrence.local_date);
          if (result.ok) {
            await onChanged();
            setBusy(false);
            return;
          }
          if (result.code === "already_completed") {
            const when = formatConfirmTime(result.confirmedAt ?? "", timezone);
            const who = result.confirmedByDisplayName ?? "Outro adulto";
            setFeedback(`Já concluído por ${who}${when ? ` às ${when}` : ""}.`);
            await onChanged();
          } else {
            setFeedback("Não foi possível concluir a rotina. Nada foi alterado. Tente novamente.");
          }
          setBusy(false);
          return;
        }

        if (occurrence.source !== "medication" || !occurrence.slot) {
          setBusy(false);
          return;
        }

        const result = await confirmDose(client, {
          medicationId: occurrence.source_id,
          localDate: occurrence.local_date,
          slot: occurrence.slot,
          acknowledgeEarly,
        });

        if (result.ok) {
          await onChanged();
          setBusy(false);
          return;
        }

        if (result.code === "early_confirmation_required") {
          setBusy(false);
          setEarlyPrompt(true);
          return;
        }

        if (result.code === "already_confirmed") {
          const when = formatConfirmTime(result.confirmedAt, timezone);
          const who = result.confirmedByDisplayName ?? "Outro adulto";
          setFeedback(`Já registrada por ${who}${when ? ` às ${when}` : ""}.`);
          await onChanged();
          setBusy(false);
          return;
        }

        setBusy(false);
        setFeedback("Não foi possível confirmar a dose. Nada foi alterado. Tente novamente.");
      },
    });
  }

  async function handleConfirmClick() {
    if (!client || !writesAllowed) return;
    if (occurrence.source === "event") {
      await runConfirm(false);
      return;
    }
    // Prefer server early gate; client hint avoids an extra round-trip when obvious.
    if (needsEarlyConfirmationAck(occurrence, serverTime, timezone)) {
      setEarlyPrompt(true);
      return;
    }
    await runConfirm(false);
  }

  async function handleReverse(mode: "undo" | "correct") {
    if (!client || !occurrence.confirmation_id) return;
    if (mode === "correct" && !correctPrompt) {
      setCorrectPrompt(true);
      return;
    }
    setBusy(true);
    setFeedback(null);
    setEventEditError(null);
    const result =
      occurrence.source === "event"
        ? await reverseOneOffEventCompletion(client, occurrence.confirmation_id)
        : occurrence.source === "routine"
          ? await reverseWeeklyRoutineCompletion(client, occurrence.confirmation_id)
          : await reverseDoseConfirmation(client, occurrence.confirmation_id);
    if (!result.ok) {
      setBusy(false);
      setCorrectPrompt(false);
      setFeedback(
        result.code === "correction_window_closed"
          ? "Correção disponível só até o fim do dia."
          : "Não foi possível corrigir o Registro. Nada foi alterado. Tente novamente.",
      );
      return;
    }
    setCorrectPrompt(false);
    await onChanged();
    setBusy(false);
  }

  async function handleCancelEvent() {
    if (!client || occurrence.source !== "event") return;
    setBusy(true);
    setFeedback(null);
    const result = await cancelOneOffEvent(client, occurrence.source_id);
    setCancelPrompt(false);
    if (!result.ok) {
      setFeedback(
        result.code === "already_completed"
          ? "Este compromisso já foi concluído."
          : "Não foi possível cancelar o compromisso. Nada foi alterado. Tente novamente.",
      );
      setBusy(false);
      return;
    }
    await onChanged();
    setBusy(false);
  }

  async function handleEventSave() {
    if (!client || occurrence.source !== "event" || !occurrence.planning_revision_id) return;
    setBusy(true);
    setFeedback(null);
    const targetKind = eventTarget === "casa" ? "casa" : "child";
    const result = await editOneOffEvent(client, {
      eventId: occurrence.source_id,
      expectedRevisionId: occurrence.planning_revision_id,
      title: eventTitle,
      localDate: eventDate,
      targetKind,
      childId: targetKind === "child" ? eventTarget : null,
      scheduledTime: eventTime || null,
      requiresConfirmation: eventRequiresConfirmation,
      responsibleUserId: eventRequiresConfirmation ? eventResponsibleUserId || null : null,
    });
    if (!result.ok) {
      const conflict = result.error.message === "planning_revision_conflict";
      const alreadyCompleted = result.error.message === "already_completed";
      if (conflict) {
        setFeedback("Outra alteração chegou. A agenda foi atualizada; revise este formulário antes de tentar novamente.");
        await onChanged();
        setBusy(false);
        return;
      }
      if (alreadyCompleted) {
        setEventAction(null);
        setFeedback("Este compromisso já foi concluído; use a correção do Registro.");
        await onChanged();
        setBusy(false);
        return;
      }
      setFeedback(eventEditErrorCopy(result.error.message));
      const field = eventEditErrorField(result.error.message);
      setEventEditError(field ? { field, message: eventEditErrorCopy(result.error.message) } : null);
      setBusy(false);
      return;
    }
    setEventAction(null);
    await onChanged();
    setBusy(false);
  }

  async function handleRoutineSave() {
    if (!client || occurrence.source !== "routine") return;
    setBusy(true);
    setFeedback(null);
    const editingDetails = routineAction === "details";
    const changingTime = editingDetails || routineAction === "reschedule";
    const changingOwner = (editingDetails && occurrence.requires_confirmation) || routineAction === "owner";
    const result = await saveWeeklyRoutineException(client, {
      routineId: occurrence.source_id,
      localDate: occurrence.local_date,
      cancelled: routineCancel || routineAction === "cancel",
      scheduledTime: changingTime
        ? routineTime.trim() || null
        : occurrence.scheduled_time,
      scheduledTimeOverridden: changingTime
        ? true
        : occurrence.routine_exception_time_overridden === true,
      ownerUserId: changingOwner ? routineOwner || null : occurrence.owner_user_id,
      ownerOverridden: changingOwner
        ? true
        : occurrence.routine_exception_owner_overridden === true,
      expectedExceptionId: occurrence.routine_exception_version_id ?? null,
    });
    if (!result.ok) {
      setBusy(false);
      setRoutineAction(null);
      setFeedback(
        result.error.message.includes("conflict")
          ? "Outra alteração chegou. Atualize a agenda e tente novamente."
          : result.error.message === "exception_date_out_of_range"
            ? "Exceções só podem alterar Hoje ou Amanhã."
          : "Não foi possível alterar esta ocorrência. Nada foi alterado. Tente novamente.",
      );
      return;
    }
    setRoutineAction(null);
    await onChanged();
    setBusy(false);
  }

  async function handleRoutineRestore() {
    if (!client || occurrence.source !== "routine" || !occurrence.routine_exception_version_id) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    const result = await restoreWeeklyRoutineException(
      client,
      occurrence.source_id,
      occurrence.local_date,
      occurrence.routine_exception_version_id,
    );
    if (!result.ok) {
      setBusy(false);
      setFeedback(
        result.error.message.includes("conflict")
          ? "Outra alteração chegou. Atualize a agenda e tente novamente."
          : "Não foi possível restaurar a rotina. Nada foi alterado. Tente novamente.",
      );
      return;
    }
    await onChanged();
    setBusy(false);
  }

  const confirmableEligible =
    (isConfirmableDose(occurrence, day) ||
      isConfirmableEvent(occurrence, day) ||
      isConfirmableRoutine(occurrence, day)) &&
    !busy &&
    Boolean(client);
  const primaryActionLabel = occurrence.source === "event"
    ? "Concluir"
    : occurrence.source === "routine"
      ? "Concluir"
      : "Confirmar dose";

  return (
    <li
      data-occurrence-key={occurrence.key}
      data-occurrence-status={occurrence.status}
      data-occurrence-source={occurrence.source}
      data-owner-alert={alert.show ? "true" : "false"}
      aria-busy={busy ? "true" : undefined}
      className={alert.show ? "occurrence occurrence--owner-alert" : "occurrence"}
    >
      <div className="occurrence__line">
        <button
          ref={detailsTriggerRef}
          type="button"
          className="occurrence__main occurrence__details"
          data-occurrence-details
          aria-expanded={detailsOpen}
          aria-haspopup="dialog"
          onClick={onOpenDetails}
        >
          <span className="occurrence__summary">
            <span className="occurrence__time">{time}</span>
            <span className="occurrence__title">{occurrence.title}</span>
          </span>
          <span className="occurrence__meta">
            <span className="occurrence__target">{occurrence.target_label}</span>
            <span className="occurrence__status">{statusLabel(occurrence)}</span>
          </span>
          {occurrence.owner_display_name ? (
            <span className="occurrence__owner">Responsável: {occurrence.owner_display_name}</span>
          ) : null}
        </button>

        <div className="occurrence__primary-action">
          {confirmableEligible ? (
            earlyPrompt && writesAllowed ? (
              <div className="occurrence__confirmation-prompt" data-early-confirm>
                <p>Confirmar esta dose agora?</p>
                <button type="button" onClick={() => void runConfirm(true)}>
                  Confirmar
                </button>
                <button type="button" onClick={() => setEarlyPrompt(false)}>
                  Voltar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="occurrence__primary-button"
                data-confirm-dose={occurrence.source === "medication" ? "true" : undefined}
                data-complete-event={occurrence.source === "event" ? "true" : undefined}
                data-complete-routine={occurrence.source === "routine" ? "true" : undefined}
                disabled={!confirmable}
                onClick={() => void handleConfirmClick()}
              >
                {primaryActionLabel}
              </button>
            )
          ) : null}

          {busy ? (
            <span data-dose-registering role="status" className="occurrence__persisting">
              Registrando…
            </span>
          ) : null}

          {reversibleEligible && client && !busy && showUndo ? (
            <button type="button" data-undo-dose onClick={() => void handleReverse("undo")}>
              Desfazer
            </button>
          ) : null}
        </div>
      </div>

      {alert.show ? (
        <p className="occurrence__alert" role="status">
          <span className="occurrence__alert-icon" aria-hidden="true">
            !
          </span>
          <span className="occurrence__alert-text">{alert.label}</span>
        </p>
      ) : null}

      <OccurrenceSheet
        open={detailsOpen}
        title={eventAction === "edit" ? "Editar compromisso" : occurrence.title}
        triggerRef={detailsTriggerRef}
        onClose={onCloseDetails}
      >
        {eventAction !== "edit" ? (
          <>
            <div className="occurrence-sheet__facts">
              <p>
                <strong>Horário</strong>
                {time}
              </p>
              <p>
                <strong>Alvo</strong>
                {occurrence.target_label}
              </p>
              <p>
                <strong>Status</strong>
                {statusLabel(occurrence)}
              </p>
              {occurrence.owner_display_name ? (
                <p>
                  <strong>Responsável</strong>
                  {occurrence.owner_display_name}
                </p>
              ) : null}
              {occurrence.confirmed_by_display_name ? (
                <p data-confirmed-by>
                  <strong>Registro</strong>
                  Executado por {occurrence.confirmed_by_display_name}
                  {occurrence.confirmed_at ? ` · ${formatConfirmTime(occurrence.confirmed_at, timezone)}` : null}
                </p>
              ) : null}
            </div>

            {alert.show ? (
              <p className="occurrence-sheet__alert" role="status">
                <span aria-hidden="true">!</span> {alert.label}
              </p>
            ) : null}

            {occurrence.source === "medication" && occurrence.instruction ? (
              <section data-medication-details>
                <h3>Instrução registrada</h3>
                <p>{occurrence.instruction}</p>
              </section>
            ) : null}
          </>
        ) : null}

        {occurrence.source === "event" ? (
          <section data-event-details>
            <h3>Compromisso</h3>
            {eventAction === "edit" ? (
              <div data-event-edit-form>
                <p>Atualize o planejamento de {occurrence.title}.</p>
                <label>
                  Título
                  <input
                    aria-describedby={eventEditError?.field === "title" ? "event-edit-title-error" : undefined}
                    aria-invalid={eventEditError?.field === "title" ? true : undefined}
                    value={eventTitle}
                    maxLength={120}
                    onChange={(event) => setEventTitle(event.target.value)}
                    disabled={busy || !writesAllowed}
                  />
                </label>
                {eventEditError?.field === "title" ? (
                  <p id="event-edit-title-error" role="alert">{eventEditError.message}</p>
                ) : null}
                <label>
                  Data
                  <input
                    aria-describedby={eventEditError?.field === "date" ? "event-edit-date-error" : undefined}
                    aria-invalid={eventEditError?.field === "date" ? true : undefined}
                    type="date"
                    value={eventDate}
                    onChange={(event) => setEventDate(event.target.value)}
                    disabled={busy || !writesAllowed}
                  />
                </label>
                {eventEditError?.field === "date" ? (
                  <p id="event-edit-date-error" role="alert">{eventEditError.message}</p>
                ) : null}
                <label>
                  Alvo
                  <select
                    aria-describedby={eventEditError?.field === "target" ? "event-edit-target-error" : undefined}
                    aria-invalid={eventEditError?.field === "target" ? true : undefined}
                    value={eventTarget}
                    onChange={(event) => setEventTarget(event.target.value)}
                    disabled={busy || !writesAllowed}
                  >
                    <option value="casa">Casa</option>
                    {eventChildren
                      .filter((child) => child.archived_at == null)
                      .map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.name}
                        </option>
                      ))}
                  </select>
                </label>
                {eventEditError?.field === "target" ? (
                  <p id="event-edit-target-error" role="alert">{eventEditError.message}</p>
                ) : null}
                <label>
                  Horário (opcional)
                  <input
                    aria-describedby={eventEditError?.field === "time" ? "event-edit-time-error" : undefined}
                    aria-invalid={eventEditError?.field === "time" ? true : undefined}
                    type="time"
                    value={eventTime}
                    onChange={(event) => setEventTime(event.target.value)}
                    disabled={busy || !writesAllowed}
                  />
                </label>
                {eventEditError?.field === "time" ? (
                  <p id="event-edit-time-error" role="alert">{eventEditError.message}</p>
                ) : null}
                <label className="event-checkbox">
                  <input
                    type="checkbox"
                    checked={eventRequiresConfirmation}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setEventRequiresConfirmation(checked);
                      if (!checked) setEventResponsibleUserId("");
                    }}
                    disabled={busy || !writesAllowed}
                  />
                  Requer confirmação
                </label>
                {eventRequiresConfirmation ? (
                  <label>
                    Responsável planejado
                    <select
                      aria-describedby={eventEditError?.field === "responsible" ? "event-edit-responsible-error" : undefined}
                      aria-invalid={eventEditError?.field === "responsible" ? true : undefined}
                      value={eventResponsibleUserId}
                      onChange={(event) => setEventResponsibleUserId(event.target.value)}
                      disabled={busy || !writesAllowed}
                    >
                      <option value="">Sem Responsável</option>
                      {eventMembers
                        .filter((member) => member.archived_at == null)
                        .map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.display_name}
                          </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {eventEditError?.field === "responsible" ? (
                  <p id="event-edit-responsible-error" role="alert">{eventEditError.message}</p>
                ) : null}
                <div className="occurrence-sheet__actions">
                  <button type="button" disabled={busy || !writesAllowed} onClick={() => void handleEventSave()}>
                    {busy ? "Salvando…" : "Salvar alteração"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setEventAction(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p>
                  {occurrence.owner_display_name
                    ? `Responsável planejado: ${occurrence.owner_display_name}.`
                    : "Sem Responsável planejado."}
                </p>
                {eventCanEdit ? (
                  <button
                    type="button"
                    data-edit-event
                    disabled={busy || !writesAllowed}
                    onClick={() => setEventAction("edit")}
                  >
                    Editar compromisso
                  </button>
                ) : null}
              </>
            )}
            {eventAction !== "edit" && cancellableEligible && client ? (
              cancelPrompt ? (
                <div data-event-cancel-confirm>
                  <p>Cancelar este compromisso?</p>
                  <button type="button" disabled={busy || !writesAllowed} onClick={() => void handleCancelEvent()}>
                    Confirmar cancelamento
                  </button>
                  <button type="button" disabled={busy} onClick={() => setCancelPrompt(false)}>
                    Voltar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-cancel-event
                  disabled={!cancellable}
                  onClick={() => setCancelPrompt(true)}
                >
                  Cancelar compromisso
                </button>
              )
            ) : null}
          </section>
        ) : null}

        {occurrence.source === "routine" && routineCanShowActions ? (
          <section data-routine-details>
            <h3>Rotina desta data</h3>
            <p>
              {routineHasActiveException
                ? "Esta ocorrência tem uma exceção para esta data."
                : "Esta ocorrência segue a rotina padrão."}
            </p>
            {!writesAllowed ? (
              <p data-occurrence-write-blocked role="status">
                Ações bloqueadas até atualizar o Registro.
              </p>
            ) : routineAction === null ? (
              <div className="occurrence-sheet__actions">
                {occurrence.status !== "cancelled" && occurrence.status !== "completed" ? (
                  <>
                    <button type="button" onClick={() => setRoutineAction("cancel")}>
                      Cancelar ocorrência
                    </button>
                    <button type="button" onClick={() => setRoutineAction("reschedule")}>
                      Remarcar horário
                    </button>
                    {occurrence.requires_confirmation ? (
                      <button type="button" onClick={() => setRoutineAction("owner")}>
                        Trocar Responsável
                      </button>
                    ) : null}
                    <button type="button" onClick={() => setRoutineAction("details")}>
                      Editar detalhes
                    </button>
                  </>
                ) : null}
                {routineHasActiveException && occurrence.status !== "completed" ? (
                  <button type="button" onClick={() => void handleRoutineRestore()}>
                    Restaurar rotina
                  </button>
                ) : null}
              </div>
            ) : (
              <div data-routine-exception-form>
                {routineAction === "cancel" ? (
                  <p data-routine-cancel-confirm>
                    Cancelar esta ocorrência da rotina?
                  </p>
                ) : null}
                {routineAction === "details" ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={routineCancel}
                      onChange={(event) => setRoutineCancel(event.target.checked)}
                    />
                    Cancelar ocorrência
                  </label>
                ) : null}
                {routineAction === "reschedule" || routineAction === "details" ? (
                  <label>
                    Novo horário (opcional)
                    <input
                      type="time"
                      value={routineTime}
                      onChange={(event) => setRoutineTime(event.target.value)}
                    />
                  </label>
                ) : null}
                {routineAction === "owner" ||
                (routineAction === "details" && occurrence.requires_confirmation) ? (
                  <label>
                    Responsável nesta Ocorrência
                    <select value={routineOwner} onChange={(event) => setRoutineOwner(event.target.value)}>
                      <option value="">Sem Responsável</option>
                      {routineMembers
                        .filter((member) => member.archived_at == null)
                        .map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.display_name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <div className="occurrence-sheet__actions">
                  <button type="button" disabled={busy} onClick={() => void handleRoutineSave()}>
                    {routineAction === "cancel" ? "Confirmar cancelamento" : "Confirmar alteração"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setRoutineAction(null)}>
                    Voltar
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {reversibleEligible && client ? (
          <section className="occurrence-sheet__record-actions" data-dose-reverse>
            <h3>Registro</h3>
            {showUndo ? (
              <p>O Registro recente pode ser desfeito pela ação na linha.</p>
            ) : correctPrompt ? (
              <div data-correct-confirm>
                <p>Corrigir este Registro?</p>
                <button type="button" disabled={busy || !writesAllowed} onClick={() => void handleReverse("correct")}>
                  Confirmar correção
                </button>
                <button type="button" disabled={busy} onClick={() => setCorrectPrompt(false)}>
                  Voltar
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-correct-dose
                disabled={busy || !writesAllowed}
                onClick={() => void handleReverse("correct")}
              >
                Corrigir Registro
              </button>
            )}
          </section>
        ) : null}

        {feedback ? (
          <p className="occurrence-sheet__feedback" data-dose-feedback role="status">
            {feedback}
          </p>
        ) : null}
      </OccurrenceSheet>

      {feedback && !detailsOpen ? (
        <p data-dose-feedback role="status">
          {feedback}
        </p>
      ) : null}
    </li>
  );
}

function formatConfirmTime(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
