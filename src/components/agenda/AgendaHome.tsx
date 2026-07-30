"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { fetchAgendaSnapshot } from "@/lib/agenda/snapshot";
import { tomorrowView } from "@/lib/agenda/presentation";
import type { AgendaSnapshot } from "@/lib/agenda/types";
import { HOUSEHOLD_CHANGED_EVENT } from "@/lib/household/events";
import { OccurrenceRow } from "./OccurrenceRow";

type LoadState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string }
  | { kind: "ready"; snapshot: AgendaSnapshot };

/**
 * Renders Hoje + Amanhã from the authoritative server snapshot (PRD §§7, 13).
 */
export function AgendaHome() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [client, setClient] = useState<SupabaseClient | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setClient(supabase);
    if (!supabase) {
      setState({ kind: "unavailable" });
      return;
    }

    const result = await fetchAgendaSnapshot(supabase);
    if (!result.ok) {
      setState({ kind: "error", message: result.error.message });
      return;
    }
    setState({ kind: "ready", snapshot: result.data });
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(HOUSEHOLD_CHANGED_EVENT, onChange);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);
    return () => {
      window.removeEventListener(HOUSEHOLD_CHANGED_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [refresh]);

  // Realtime only invalidates; occurrences still come from a full snapshot refetch (PRD §13).
  useEffect(() => {
    if (!client) return;
    const channel = client
      .channel("agenda-dose-invalidate")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dose_confirmations" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medication_versions" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, refresh]);

  if (state.kind === "loading") {
    return <p data-agenda="loading">Carregando…</p>;
  }

  if (state.kind === "unavailable") {
    return null;
  }

  if (state.kind === "error") {
    return (
      <p data-agenda="error" role="alert">
        Não foi possível carregar a agenda.
      </p>
    );
  }

  const { snapshot } = state;
  const tomorrow = tomorrowView(snapshot.tomorrow);

  return (
    <section data-agenda="ready" data-agenda-version={snapshot.version}>
      <header className="agenda__header">
        <h2>Hoje</h2>
        <p className="agenda__date" data-today-date={snapshot.today.local_date}>
          {formatShortDate(snapshot.today.local_date)}
        </p>
      </header>

      {snapshot.today.empty_message ? (
        <p data-today-empty>{snapshot.today.empty_message}</p>
      ) : (
        <ul data-today-list className="occurrence-list">
          {snapshot.today.occurrences.map((occ) => (
            <OccurrenceRow
              key={occ.key}
              occurrence={occ}
              day="today"
              serverTime={snapshot.server_time}
              timezone={snapshot.timezone}
              client={client}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}

      {tomorrow.mode === "count_only" ? (
        <p data-tomorrow-count className="agenda__tomorrow-count">
          Amanhã: {tomorrow.count}{" "}
          {tomorrow.count === 1 ? "item" : "itens"}
        </p>
      ) : (
        <section data-tomorrow-inline className="agenda__tomorrow">
          <header className="agenda__header">
            <h2>Amanhã</h2>
            <p className="agenda__date" data-tomorrow-date={snapshot.tomorrow.local_date}>
              {formatShortDate(snapshot.tomorrow.local_date)}
            </p>
          </header>
          {tomorrow.empty_message ? (
            <p data-tomorrow-empty>{tomorrow.empty_message}</p>
          ) : (
            <ul data-tomorrow-list className="occurrence-list">
              {tomorrow.occurrences.map((occ) => (
                <OccurrenceRow
                  key={occ.key}
                  occurrence={occ}
                  day="tomorrow"
                  serverTime={snapshot.server_time}
                  timezone={snapshot.timezone}
                  client={client}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const value = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(value);
}
