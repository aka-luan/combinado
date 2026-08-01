"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-client";
import { fetchAgendaSnapshot } from "@/lib/agenda/snapshot";
import { tomorrowView } from "@/lib/agenda/presentation";
import type { AgendaSnapshot } from "@/lib/agenda/types";
import { HOUSEHOLD_CHANGED_EVENT } from "@/lib/household/events";
import {
  getAgendaCache,
  getDefaultAgendaCacheStore,
  putAgendaCache,
} from "@/lib/sync/agenda-cache";
import {
  formatLastSyncLabel,
  msUntilHouseholdMidnight,
  REFETCH_INTERVAL_MS,
  resolveOfflineAgendaView,
  type OfflineAgendaView,
} from "@/lib/sync/policy";
import { recordRealtimeChannelError } from "@/lib/ops/realtime-errors";
import { getSyncPhase, setLastSyncedAt, setSyncPhase } from "@/lib/sync/writes-gate";
import { OccurrenceRow } from "./OccurrenceRow";

type LoadState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string }
  | { kind: "online"; snapshot: AgendaSnapshot }
  | { kind: "offline"; view: OfflineAgendaView };

/**
 * Renders Hoje + Amanhã from the authoritative server snapshot (PRD §§7, 13, 14).
 * Realtime / reconnect / midnight only invalidate → full refetch; never patch locally.
 */
export function AgendaHome() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const userIdRef = useRef<string | null>(null);
  const onlineRef = useRef(typeof navigator === "undefined" ? true : navigator.onLine);
  const blockWritesUntilRefetchRef = useRef(false);

  const applyOffline = useCallback(async (uid: string | null) => {
    setSyncPhase("offline_cached");
    blockWritesUntilRefetchRef.current = true;
    if (!uid) {
      setSyncPhase("unavailable");
      setState({ kind: "offline", view: { kind: "unavailable" } });
      return;
    }
    const cached = await getAgendaCache(getDefaultAgendaCacheStore(), uid);
    const view = resolveOfflineAgendaView(cached, new Date());
    if (view.kind === "unavailable") setSyncPhase("unavailable");
    setState({ kind: "offline", view });
  }, []);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setClient(supabase);
    if (!supabase) {
      setSyncPhase("unavailable");
      setState({ kind: "unavailable" });
      return;
    }

    const sessionResult = await supabase.auth.getSession();
    const uid = sessionResult.data.session?.user?.id ?? null;
    userIdRef.current = uid;

    if (!onlineRef.current) {
      await applyOffline(uid);
      return;
    }

    if (blockWritesUntilRefetchRef.current || getSyncPhase() === "offline_cached") {
      setSyncPhase("reconnecting");
    }

    const result = await fetchAgendaSnapshot(supabase);
    if (!result.ok) {
      const cached = uid ? await getAgendaCache(getDefaultAgendaCacheStore(), uid) : null;
      if (cached) {
        await applyOffline(uid);
        return;
      }
      setSyncPhase("error");
      setState({ kind: "error", message: result.error.message });
      return;
    }

    const syncedAt = new Date().toISOString();
    if (uid) {
      await putAgendaCache(getDefaultAgendaCacheStore(), uid, result.data, syncedAt);
    }
    blockWritesUntilRefetchRef.current = false;
    setLastSyncedAt(syncedAt);
    setSyncPhase("online_ready");
    setState({ kind: "online", snapshot: result.data });
  }, [applyOffline]);

  useEffect(() => {
    void refresh();

    const onHousehold = () => {
      void refresh();
    };
    window.addEventListener(HOUSEHOLD_CHANGED_EVENT, onHousehold);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    const onOnline = () => {
      onlineRef.current = true;
      blockWritesUntilRefetchRef.current = true;
      setSyncPhase("reconnecting");
      void refresh();
    };
    const onOffline = () => {
      onlineRef.current = false;
      void applyOffline(userIdRef.current);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const interval = window.setInterval(() => {
      if (onlineRef.current) void refresh();
    }, REFETCH_INTERVAL_MS);

    let midnightTimer: number | undefined;
    const scheduleMidnight = () => {
      midnightTimer = window.setTimeout(() => {
        if (onlineRef.current) {
          void refresh();
        } else {
          void applyOffline(userIdRef.current);
        }
        scheduleMidnight();
      }, msUntilHouseholdMidnight(new Date()) + 50);
    };
    scheduleMidnight();

    return () => {
      window.removeEventListener(HOUSEHOLD_CHANGED_EVENT, onHousehold);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(interval);
      if (midnightTimer !== undefined) window.clearTimeout(midnightTimer);
    };
  }, [applyOffline, refresh]);

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "one_off_events" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_completions" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_routine_versions" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_routine_exceptions" },
        () => {
          void refresh();
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void recordRealtimeChannelError(client, status, err);
        }
      });
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, refresh]);

  if (state.kind === "loading") {
    return <p data-agenda="loading">Carregando o Registro…</p>;
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

  if (state.kind === "offline" && state.view.kind === "unavailable") {
    return (
      <p data-agenda="unavailable" role="status">
        Dados indisponíveis.
      </p>
    );
  }

      const writesAllowed = state.kind === "online";
  const snapshot =
    state.kind === "online"
      ? state.snapshot
      : state.view.kind === "unavailable"
        ? null
        : state.view.snapshot;
  if (!snapshot) return null;

  const offlineMeta =
    state.kind === "offline" && state.view.kind !== "unavailable" ? state.view : null;
  const revealOverride =
    offlineMeta && offlineMeta.kind === "same_day" ? offlineMeta.revealTomorrow : undefined;
  const tomorrow = tomorrowView({
    ...snapshot.tomorrow,
    reveal: revealOverride === undefined ? snapshot.tomorrow.reveal : revealOverride,
  });
  const stale = offlineMeta?.kind === "stale_day" ? offlineMeta : null;

  return (
    <section
      data-agenda={state.kind === "online" ? "ready" : "offline"}
      data-agenda-version={snapshot.version}
      data-writes-allowed={writesAllowed ? "true" : "false"}
    >
      {offlineMeta ? (
        <p data-agenda-offline-banner role="status">
          {stale ? stale.staleLabel : `Offline · cache de ${formatShortDate(offlineMeta.cachedDate)}`}
          <br />
          {formatLastSyncLabel(offlineMeta.syncedAt, snapshot.timezone)}
        </p>
      ) : null}

      <header className="agenda__header">
        <h2>{stale ? "Registro em cache" : "Hoje"}</h2>
        <p
          className="agenda__date"
          data-today-date={snapshot.today.local_date}
          data-stale-day={stale ? "true" : undefined}
        >
          {stale ? stale.staleLabel : formatShortDate(snapshot.today.local_date)}
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
              writesAllowed={writesAllowed}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}

      {!stale && tomorrow.mode === "count_only" ? (
        <p data-tomorrow-count className="agenda__tomorrow-count">
          Amanhã: {tomorrow.count}{" "}
          {tomorrow.count === 1 ? "item" : "itens"}
        </p>
      ) : null}

      {!stale && tomorrow.mode === "inline" ? (
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
                  writesAllowed={writesAllowed}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}
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
