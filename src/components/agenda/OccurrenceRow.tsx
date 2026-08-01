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
  reverseOneOffEventCompletion,
} from "@/lib/household/one-off-events";
import {
  listHouseholdMembers,
  type HouseholdMemberRow,
} from "@/lib/household/children";
import {
  restoreWeeklyRoutineException,
  saveWeeklyRoutineException,
} from "@/lib/household/routines";
import {
  isCancellableEvent,
  isConfirmableDose,
  isConfirmableEvent,
  isReversibleDose,
  isReversibleEvent,
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
  const [routineAction, setRoutineAction] = useState<
    "cancel" | "reschedule" | "owner" | "details" | null
  >(null);
  const [routineTime, setRoutineTime] = useState(occurrence.scheduled_time ?? "");
  const [routineOwner, setRoutineOwner] = useState(occurrence.owner_user_id ?? "");
  const [routineCancel, setRoutineCancel] = useState(occurrence.status === "cancelled");
  const [routineMembers, setRoutineMembers] = useState<HouseholdMemberRow[]>([]);
  const [, setTick] = useState(0);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);

  const editingInProgress =
    busy ||
    earlyPrompt ||
    correctPrompt ||
    cancelPrompt ||
    routineAction !== null;
  useInteractionBusy(editingInProgress);

  const confirmable =
    (isConfirmableDose(occurrence, day) || isConfirmableEvent(occurrence, day)) &&
    !busy &&
    writesAllowed;
  const reversibleEligible =
    isReversibleDose(occurrence, day) || isReversibleEvent(occurrence, day);
  const reversible = reversibleEligible && writesAllowed;
  const cancellableEligible =
    isCancellableEvent(occurrence, day) && occurrence.status !== "completed";
  const cancellable = cancellableEligible && !busy && writesAllowed;
  const undoUntil = undoDeadlineFromServer(
    occurrence.confirmed_at ?? null,
    serverTime,
  );
  const showUndo = reversible && undoUntil !== null && Date.now() < undoUntil;

  const routineCanChange = occurrence.source === "routine" && writesAllowed && Boolean(client);
  const routineCanShowActions = occurrence.source === "routine" && Boolean(client);
  const routineHasActiveException = occurrence.routine_exception_active === true;

  useEffect(() => {
    setRoutineTime(occurrence.scheduled_time ?? "");
    setRoutineOwner(occurrence.owner_user_id ?? "");
    setRoutineCancel(occurrence.status === "cancelled");
    setRoutineAction(null);
  }, [
    occurrence.key,
    occurrence.scheduled_time,
    occurrence.owner_user_id,
    occurrence.status,
  ]);

  useEffect(() => {
    if (!writesAllowed) setEarlyPrompt(false);
  }, [writesAllowed]);

  useEffect(() => {
    if (!detailsOpen || !routineCanShowActions || !client) return;
    void listHouseholdMembers(client).then((result) => {
      if (result.ok) setRoutineMembers(result.data);
    });
  }, [client, detailsOpen, routineCanShowActions]);

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
    const result =
      occurrence.source === "event"
        ? await reverseOneOffEventCompletion(client, occurrence.confirmation_id)
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
    (isConfirmableDose(occurrence, day) || isConfirmableEvent(occurrence, day)) &&
    !busy &&
    Boolean(client);
  const primaryActionLabel = occurrence.source === "event" ? "Concluir" : "Confirmar dose";

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
        title={occurrence.title}
        triggerRef={detailsTriggerRef}
        onClose={onCloseDetails}
      >
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

        {occurrence.source === "event" ? (
          <section data-event-details>
            <h3>Compromisso</h3>
            <p>
              {occurrence.owner_display_name
                ? `Responsável planejado: ${occurrence.owner_display_name}.`
                : "Sem Responsável planejado."}
            </p>
            {cancellableEligible && client ? (
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
                {occurrence.status !== "cancelled" ? (
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
                {routineHasActiveException ? (
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
