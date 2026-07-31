"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createOneOffEvent,
  listOneOffEvents,
  cancelOneOffEvent,
  type OneOffEventRow,
} from "@/lib/household/one-off-events";
import { listChildren } from "@/lib/household/children";
import { listHouseholdMembers } from "@/lib/household/children";
import { localDateInHousehold } from "@/lib/household/routine-form";
import { notifyHouseholdChanged } from "@/lib/household/events";

type Props = { client: SupabaseClient };

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
    case "household_missing":
      return "Casa ainda não configurada no servidor.";
    default:
      return "Não foi possível salvar o compromisso.";
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
      setError(errorCopy(eventResult.error.message));
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
    if (!responsibleUserId && userId) setResponsibleUserId(userId);
  }

  useEffect(() => {
    void refresh();
    // This settings section is mounted only while Configurações is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await createOneOffEvent(client, {
      title,
      localDate,
      targetKind,
      childId: targetKind === "child" ? childId || null : null,
      scheduledTime: scheduledTime || null,
      requiresConfirmation,
      responsibleUserId: requiresConfirmation ? responsibleUserId || null : null,
    });
    if (!result.ok) {
      setError(errorCopy(result.error.message));
      setPending(false);
      return;
    }
    setTitle("");
    setScheduledTime("");
    setPending(false);
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

  return (
    <section data-events-settings>
      <h2>Compromissos avulsos</h2>
      <p data-events-create-hint>
        Um compromisso compartilhado para uma data. Sem duração, local ou anotações.
      </p>
      {error ? <p data-events-error>{error}</p> : null}
      <form data-event-create onSubmit={handleCreate}>
        <label>
          Título
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            autoComplete="off"
            disabled={pending}
            required
          />
        </label>

        <label>
          Data
          <input
            type="date"
            value={localDate}
            min={today}
            onChange={(event) => setLocalDate(event.target.value)}
            disabled={pending}
            required
          />
        </label>

        <label>
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
          >
            <option value="casa">Casa</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Horário (opcional)
          <input
            type="time"
            value={scheduledTime}
            onChange={(event) => setScheduledTime(event.target.value)}
            disabled={pending}
          />
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
          <label>
            Responsável planejado
            <select
              value={responsibleUserId}
              onChange={(event) => setResponsibleUserId(event.target.value)}
              disabled={pending}
            >
              <option value="">Sem responsável</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button type="submit" disabled={pending || !currentUserId}>
          Adicionar compromisso
        </button>
      </form>

      <h3>Próximos compromissos</h3>
      {events.length === 0 ? (
        <p data-events-empty>Nenhum compromisso avulso ainda.</p>
      ) : (
        <ul data-events-list>
          {events.map((event) => {
            const canCancel = !event.cancelledAt && event.localDate >= today;
            return (
              <li key={event.id} data-event-id={event.id}>
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
                {canCancel ? (
                  cancelId === event.id ? (
                    <span data-event-list-cancel-confirm>
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
