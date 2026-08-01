"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createOneOffEvent,
  editOneOffEvent,
  listOneOffEvents,
  cancelOneOffEvent,
  type OneOffEventRow,
} from "@/lib/household/one-off-events";
import { listChildren } from "@/lib/household/children";
import { listHouseholdMembers } from "@/lib/household/children";
import { localDateInHousehold } from "@/lib/household/routine-form";
import { notifyHouseholdChanged } from "@/lib/household/events";
import { OCCURRENCE_TITLE_MAX_LENGTH } from "@/lib/agenda/title-limits";
import { useInteractionBusy } from "@/lib/pwa/use-interaction-busy";

type Props = { client: SupabaseClient };
type EventField = "title" | "date" | "target" | "time" | "responsible";

function errorCopy(message: string): string {
  switch (message) {
    case "title_required":
      return "Informe o título.";
    case "title_too_long":
      return "O título deve ter até 120 caracteres.";
    case "date_in_past":
      return "Escolha hoje ou uma data futura.";
    case "invalid_date":
      return "Informe uma data válida.";
    case "child_required":
      return "Escolha a criança.";
    case "invalid_time":
      return "Use um horário entre 00:00 e 23:59.";
    case "informational_no_responsible":
      return "Evento informativo não possui responsável.";
    case "planning_revision_conflict":
      return "Outra alteração chegou. Recarregue os Eventos antes de salvar.";
    case "event_not_future":
      return "A revisão só pode alterar um Evento futuro.";
    case "event_cancelled":
      return "Este Evento já foi cancelado.";
    case "already_completed":
      return "Este Evento já foi concluído; a correção usa o Registro.";
    case "household_missing":
      return "Casa ainda não configurada no servidor.";
    default:
      return "Não foi possível salvar o compromisso.";
  }
}

function eventErrorField(message?: string): EventField | null {
  switch (message) {
    case "title_required":
    case "title_too_long":
    case "Informe o título.":
    case "O título deve ter até 120 caracteres.":
      return "title";
    case "date_in_past":
    case "invalid_date":
    case "Escolha hoje ou uma data futura.":
    case "Informe uma data válida.":
      return "date";
    case "child_required":
    case "Escolha a criança.":
      return "target";
    case "invalid_time":
    case "Use um horário entre 00:00 e 23:59.":
      return "time";
    case "informational_no_responsible":
    case "Evento informativo não possui responsável.":
      return "responsible";
    default:
      return null;
  }
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function EventsSettings({ client }: Props) {
  const today = localDateInHousehold();
  const [events, setEvents] = useState<OneOffEventRow[] | null>(null);
  const [children, setChildren] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<{ userId: string; displayName: string }[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingRevisionId, setEditingRevisionId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [localDate, setLocalDate] = useState(today);
  const [targetKind, setTargetKind] = useState<"casa" | "child">("casa");
  const [childId, setChildId] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [requiresConfirmation, setRequiresConfirmation] = useState(true);
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  useInteractionBusy(
    pending || cancelId !== null || editingEventId !== null || title.trim().length > 0,
  );

  const childNames = useMemo(
    () => new Map(children.map((child) => [child.id, child.name])),
    [children],
  );
  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.userId, member.displayName])),
    [members],
  );

  async function refresh() {
    const [eventResult, childResult, memberResult, sessionResult] = await Promise.all([
      listOneOffEvents(client),
      listChildren(client),
      listHouseholdMembers(client),
      client.auth.getSession(),
    ]);
    if (!eventResult.ok) {
      setError("Não foi possível carregar os compromissos.");
      setEvents([]);
      return;
    }
    setEvents(eventResult.data);
    if (childResult.ok) {
      setChildren(
        childResult.data
          .filter((child) => !child.archived_at)
          .map((child) => ({ id: child.id, name: child.name })),
      );
    }
    if (memberResult.ok) {
      setMembers(
        memberResult.data
          .filter((member) => !member.archived_at)
          .map((member) => ({ userId: member.user_id, displayName: member.display_name })),
      );
    }
    const userId = sessionResult.data.session?.user?.id ?? null;
    setCurrentUserId(userId);
    if (!responsibleUserId && userId && !editingEventId) setResponsibleUserId(userId);
  }

  useEffect(() => {
    void refresh();
    // This settings section is mounted only while its focused screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  function resetForm() {
    setEditingEventId(null);
    setEditingRevisionId(null);
    setTitle("");
    setLocalDate(today);
    setTargetKind("casa");
    setChildId("");
    setScheduledTime("");
    setRequiresConfirmation(true);
    setResponsibleUserId(currentUserId ?? "");
    setError(null);
  }

  function beginEdit(event: OneOffEventRow) {
    if (!event.planningRevisionId || event.localDate <= today || event.cancelledAt) return;
    setEditingEventId(event.id);
    setEditingRevisionId(event.planningRevisionId);
    setTitle(event.title);
    setLocalDate(event.localDate);
    setTargetKind(event.targetKind);
    setChildId(event.childId ?? "");
    setScheduledTime(event.scheduledTime ?? "");
    setRequiresConfirmation(event.requiresConfirmation);
    setResponsibleUserId(event.responsibleUserId ?? "");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const nextTargetKind = targetKind === "casa" ? "casa" : "child";
    const input = {
      title,
      localDate,
      targetKind: nextTargetKind,
      childId: nextTargetKind === "child" ? childId || null : null,
      scheduledTime: scheduledTime || null,
      requiresConfirmation,
      responsibleUserId: requiresConfirmation ? responsibleUserId || null : null,
    } as const;
    const result = editingEventId && editingRevisionId
      ? await editOneOffEvent(client, {
          ...input,
          eventId: editingEventId,
          expectedRevisionId: editingRevisionId,
        })
      : await createOneOffEvent(client, input);
    setPending(false);
    if (!result.ok) {
      setError(errorCopy(result.error.message));
      return;
    }
    resetForm();
    notifyHouseholdChanged();
    await refresh();
  }

  async function handleCancel(eventId: string) {
    setPending(true);
    setError(null);
    const result = await cancelOneOffEvent(client, eventId);
    setCancelId(null);
    if (!result.ok) {
      setError(
        result.code === "already_completed"
          ? "Este compromisso já foi concluído."
          : "Não foi possível cancelar o compromisso.",
      );
      setPending(false);
      return;
    }
    setPending(false);
    notifyHouseholdChanged();
    await refresh();
  }

  if (events === null) return <p data-events-status="loading">Carregando compromissos…</p>;
  const activeEvents = events.filter((event) => !event.cancelledAt);
  const cancelledEvents = events.filter((event) => event.cancelledAt);
  const fieldError = eventErrorField(error ?? undefined);

  function renderEvent(event: OneOffEventRow) {
    const canCancel = !event.cancelledAt && event.localDate >= today;
    const canEdit = !event.cancelledAt && event.localDate > today && Boolean(event.planningRevisionId);
    return (
      <li key={event.id} data-event-id={event.id} data-event-archived={event.cancelledAt ? "true" : undefined}>
        <span>
          {formatDate(event.localDate)}
          {event.scheduledTime ? ` · ${event.scheduledTime}` : " · Sem horário"}
          {" · "}
          {event.title}
          {" · "}
          {event.targetKind === "casa" ? "Casa" : childNames.get(event.childId ?? "") ?? "criança"}
          {event.responsibleUserId
            ? ` · ${memberNames.get(event.responsibleUserId) ?? "responsável"}`
            : " · sem responsável"}
          {event.cancelledAt ? " · cancelado" : ""}
        </span>
        {!event.cancelledAt ? (
          <span className="event-actions">
            {canEdit ? (
              <button type="button" disabled={pending} onClick={() => beginEdit(event)}>
                Editar
              </button>
            ) : null}
            {canCancel ? (
              cancelId === event.id ? (
                <span data-event-list-cancel-confirm>
                  <p>Cancelar este compromisso e preservar o Registro?</p>
                  <button type="button" disabled={pending} onClick={() => void handleCancel(event.id)}>
                    Confirmar cancelamento
                  </button>
                  <button type="button" disabled={pending} onClick={() => setCancelId(null)}>
                    Voltar
                  </button>
                </span>
              ) : (
                <button type="button" disabled={pending} onClick={() => setCancelId(event.id)}>
                  Cancelar
                </button>
              )
            ) : null}
          </span>
        ) : null}
      </li>
    );
  }

  return (
    <section data-events-settings>
      <h2>Compromissos avulsos</h2>
      <p data-events-create-hint>
        Um compromisso compartilhado para uma data. Sem duração, local ou anotações.
        Revisões futuras preservam a auditoria do planejamento.
      </p>
      {error ? <p data-events-error role="alert">{error}</p> : null}
      <form
        data-event-create={editingEventId ? undefined : true}
        data-event-edit={editingEventId ?? undefined}
        data-event-form
        onSubmit={handleSubmit}
      >
        <label aria-invalid={fieldError === "title" || undefined}>
          Título
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={OCCURRENCE_TITLE_MAX_LENGTH}
            autoComplete="off"
            disabled={pending}
            required
            aria-describedby={fieldError === "title" ? "event-title-error" : undefined}
          />
          {fieldError === "title" ? <span id="event-title-error" data-field-error>{error}</span> : null}
        </label>

        <label aria-invalid={fieldError === "date" || undefined}>
          Data
          <input
            type="date"
            value={localDate}
            min={today}
            onChange={(event) => setLocalDate(event.target.value)}
            disabled={pending}
            required
            aria-describedby={fieldError === "date" ? "event-date-error" : undefined}
          />
          {fieldError === "date" ? <span id="event-date-error" data-field-error>{error}</span> : null}
        </label>

        <label aria-invalid={fieldError === "target" || undefined}>
          Alvo
          <select
            value={targetKind === "casa" ? "casa" : childId}
            onChange={(event) => {
              if (event.target.value === "casa") {
                setTargetKind("casa");
                setChildId("");
              } else {
                setTargetKind("child");
                setChildId(event.target.value);
              }
            }}
            disabled={pending}
            aria-describedby={fieldError === "target" ? "event-target-error" : undefined}
          >
            <option value="casa">Casa</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
          {fieldError === "target" ? <span id="event-target-error" data-field-error>{error}</span> : null}
        </label>

        <label aria-invalid={fieldError === "time" || undefined}>
          Horário (opcional)
          <input
            type="time"
            value={scheduledTime}
            onChange={(event) => setScheduledTime(event.target.value)}
            disabled={pending}
            aria-describedby={fieldError === "time" ? "event-time-error" : undefined}
          />
          {fieldError === "time" ? <span id="event-time-error" data-field-error>{error}</span> : null}
        </label>

        <label className="event-checkbox">
          <input
            type="checkbox"
            checked={requiresConfirmation}
            onChange={(event) => {
              const checked = event.target.checked;
              setRequiresConfirmation(checked);
              if (!checked) setResponsibleUserId("");
              else if (currentUserId) setResponsibleUserId(currentUserId);
            }}
            disabled={pending}
          />
          Requer confirmação
        </label>

        {requiresConfirmation ? (
          <label aria-invalid={fieldError === "responsible" || undefined}>
            Responsável planejado
            <select
              value={responsibleUserId}
              onChange={(event) => setResponsibleUserId(event.target.value)}
              disabled={pending}
              aria-describedby={fieldError === "responsible" ? "event-responsible-error" : undefined}
            >
              <option value="">Sem responsável</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
            {fieldError === "responsible" ? <span id="event-responsible-error" data-field-error>{error}</span> : null}
          </label>
        ) : null}

        <div className="event-form-actions">
          <button type="submit" disabled={pending || !currentUserId}>
            Salvar
          </button>
          <button type="button" disabled={pending} onClick={resetForm}>
            Cancelar
          </button>
        </div>
      </form>

      <h3>Ativos</h3>
      {activeEvents.length === 0 ? (
        <p data-events-empty>Nenhum compromisso avulso ativo.</p>
      ) : (
        <ul data-events-list>{activeEvents.map(renderEvent)}</ul>
      )}
      <h3>Cancelados</h3>
      {cancelledEvents.length === 0 ? (
        <p data-events-archived-empty>Nenhum compromisso cancelado.</p>
      ) : (
        <ul data-events-archived>{cancelledEvents.map(renderEvent)}</ul>
      )}
    </section>
  );
}
