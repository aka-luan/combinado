"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  confirmDose,
  reverseDoseConfirmation,
} from "@/lib/agenda/confirm-dose";
import {
  isConfirmableDose,
  isReversibleDose,
  needsEarlyConfirmationAck,
  statusLabel,
  ownerAlertPresentation,
} from "@/lib/agenda/presentation";
import type { SnapshotOccurrence } from "@/lib/agenda/types";

const UNDO_MS = 10_000;
/** Survives snapshot refresh so the 10s undo window stays available. */
const undoDeadlines = new Map<string, number>();

type Props = {
  occurrence: SnapshotOccurrence;
  day: "today" | "tomorrow";
  serverTime: string;
  timezone: string;
  client: SupabaseClient | null;
  onChanged: () => void;
};

export function OccurrenceRow({
  occurrence,
  day,
  serverTime,
  timezone,
  client,
  onChanged,
}: Props) {
  const alert = ownerAlertPresentation(occurrence);
  const time = occurrence.scheduled_time ?? "Sem horário";
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [earlyPrompt, setEarlyPrompt] = useState(false);
  const [correctPrompt, setCorrectPrompt] = useState(false);
  const [, setTick] = useState(0);

  const confirmable = isConfirmableDose(occurrence, day);
  const reversible = isReversibleDose(occurrence, day);
  const undoUntil =
    occurrence.confirmation_id != null
      ? (undoDeadlines.get(occurrence.confirmation_id) ?? null)
      : null;
  const showUndo = reversible && undoUntil !== null && Date.now() < undoUntil;

  useEffect(() => {
    if (undoUntil === null) return;
    const remaining = undoUntil - Date.now();
    if (remaining <= 0) {
      if (occurrence.confirmation_id) undoDeadlines.delete(occurrence.confirmation_id);
      setTick((n) => n + 1);
      return;
    }
    const t = window.setTimeout(() => {
      if (occurrence.confirmation_id) undoDeadlines.delete(occurrence.confirmation_id);
      setTick((n) => n + 1);
    }, remaining);
    return () => window.clearTimeout(t);
  }, [undoUntil, occurrence.confirmation_id]);

  async function runConfirm(acknowledgeEarly: boolean) {
    if (!client || occurrence.source !== "medication" || !occurrence.slot) return;
    setBusy(true);
    setFeedback(null);
    setEarlyPrompt(false);

    const result = await confirmDose(client, {
      medicationId: occurrence.source_id,
      localDate: occurrence.local_date,
      slot: occurrence.slot,
      acknowledgeEarly,
    });

    setBusy(false);

    if (result.ok) {
      undoDeadlines.set(result.confirmationId, Date.now() + UNDO_MS);
      onChanged();
      return;
    }

    if (result.code === "early_confirmation_required") {
      setEarlyPrompt(true);
      return;
    }

    if (result.code === "already_confirmed") {
      const when = formatConfirmTime(result.confirmedAt, timezone);
      const who = result.confirmedByDisplayName ?? "Outro adulto";
      setFeedback(`Já registrada por ${who}${when ? ` às ${when}` : ""}.`);
      onChanged();
      return;
    }

    setFeedback("Não foi possível confirmar a dose.");
  }

  async function handleConfirmClick() {
    if (!client) return;
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
    const confirmationId = occurrence.confirmation_id;
    const result = await reverseDoseConfirmation(client, confirmationId);
    setBusy(false);
    setCorrectPrompt(false);
    undoDeadlines.delete(confirmationId);
    if (!result.ok) {
      setFeedback(
        result.code === "correction_window_closed"
          ? "Correção disponível só até o fim do dia."
          : "Não foi possível reverter o registro.",
      );
      return;
    }
    onChanged();
  }

  return (
    <li
      data-occurrence-key={occurrence.key}
      data-occurrence-status={occurrence.status}
      data-occurrence-source={occurrence.source}
      data-owner-alert={alert.show ? "true" : "false"}
      className={alert.show ? "occurrence occurrence--owner-alert" : "occurrence"}
    >
      <div className="occurrence__main">
        <span className="occurrence__time">{time}</span>
        <span className="occurrence__title">{occurrence.title}</span>
        <span className="occurrence__target">{occurrence.target_label}</span>
        <span className="occurrence__status">{statusLabel(occurrence)}</span>
        {occurrence.owner_display_name ? (
          <span className="occurrence__owner">{occurrence.owner_display_name}</span>
        ) : null}
        {occurrence.source === "medication" && occurrence.confirmed_by_display_name ? (
          <span className="occurrence__owner" data-confirmed-by>
            {occurrence.confirmed_by_display_name}
            {occurrence.confirmed_at
              ? ` · ${formatConfirmTime(occurrence.confirmed_at, timezone)}`
              : null}
          </span>
        ) : null}
        {occurrence.instruction ? (
          <span className="occurrence__instruction">{occurrence.instruction}</span>
        ) : null}
      </div>

      {alert.show ? (
        <p className="occurrence__alert" role="status">
          <span className="occurrence__alert-icon" aria-hidden="true">
            !
          </span>
          <span className="occurrence__alert-text">{alert.label}</span>
        </p>
      ) : null}

      {confirmable && client ? (
        <div className="occurrence__actions" data-dose-actions>
          {busy ? (
            <span data-dose-registering role="status">
              registrando…
            </span>
          ) : earlyPrompt ? (
            <div data-early-confirm>
              <p>Confirmar esta dose agora?</p>
              <button type="button" onClick={() => void runConfirm(true)}>
                Confirmar
              </button>
              <button type="button" onClick={() => setEarlyPrompt(false)}>
                Voltar
              </button>
            </div>
          ) : (
            <button type="button" data-confirm-dose onClick={() => void handleConfirmClick()}>
              Confirmar dose
            </button>
          )}
        </div>
      ) : null}

      {reversible && client ? (
        <div className="occurrence__actions" data-dose-reverse>
          {busy ? (
            <span data-dose-registering role="status">
              registrando…
            </span>
          ) : showUndo ? (
            <button type="button" data-undo-dose onClick={() => void handleReverse("undo")}>
              Desfazer
            </button>
          ) : correctPrompt ? (
            <div data-correct-confirm>
              <p>Corrigir este registro?</p>
              <button type="button" onClick={() => void handleReverse("correct")}>
                Confirmar correção
              </button>
              <button type="button" onClick={() => setCorrectPrompt(false)}>
                Voltar
              </button>
            </div>
          ) : (
            <button type="button" data-correct-dose onClick={() => void handleReverse("correct")}>
              Corrigir registro
            </button>
          )}
        </div>
      ) : null}

      {feedback ? (
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
