import type { AgendaSnapshot } from "../agenda/types";

export const REFETCH_INTERVAL_MS = 5 * 60 * 1000;

const HOUSEHOLD_TIMEZONE = "America/Sao_Paulo";

export type CachedAgenda = {
  userId: string;
  snapshot: AgendaSnapshot;
  syncedAt: string;
};

export type OfflineAgendaView =
  | { kind: "unavailable" }
  | {
      kind: "same_day";
      snapshot: AgendaSnapshot;
      syncedAt: string;
      cachedDate: string;
      revealTomorrow: boolean;
    }
  | {
      kind: "stale_day";
      snapshot: AgendaSnapshot;
      syncedAt: string;
      cachedDate: string;
      staleLabel: string;
      revealTomorrow: false;
    };

export type SyncPhaseName =
  | "loading"
  | "online_ready"
  | "offline_cached"
  | "reconnecting"
  | "unavailable"
  | "error";

export type SyncPhase = { phase: SyncPhaseName };

function localDateInTimezone(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True when household local clock is at or after 19:00 (PRD §7 / §14). */
export function shouldRevealTomorrow(
  now: Date,
  timezone: string = HOUSEHOLD_TIMEZONE,
): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return false;
  return hour * 60 + minute >= 19 * 60;
}

/**
 * Milliseconds until the next household local midnight.
 * Used to refetch online or re-label stale offline cache (PRD §13 / §14).
 */
export function msUntilHouseholdMidnight(
  now: Date,
  timezone: string = HOUSEHOLD_TIMEZONE,
): number {
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(timeParts.find((p) => p.type === "hour")?.value);
  const minute = Number(timeParts.find((p) => p.type === "minute")?.value);
  const second = Number(timeParts.find((p) => p.type === "second")?.value);

  if ([hour, minute, second].some((n) => Number.isNaN(n))) {
    return 60 * 60 * 1000;
  }

  const msIntoDay = ((hour * 60 + minute) * 60 + second) * 1000 + now.getMilliseconds();
  const msPerDay = 24 * 60 * 60 * 1000;
  const remaining = msPerDay - msIntoDay;
  return remaining <= 0 ? msPerDay : remaining;
}

/** Label when the cached day is no longer the current Hoje (PRD §14). */
export function formatStaleOfflineLabel(localDate: string): string {
  const [year, month, day] = localDate.split("-");
  if (!year || !month || !day) return `Dados de ${localDate} — offline`;
  return `Dados de ${day}/${month} — offline`;
}

/**
 * Pure offline presentation over a previously synced snapshot.
 * Never recalculates ocorrências — only labels and Amanhã reveal (PRD §14).
 */
export function resolveOfflineAgendaView(
  cache: CachedAgenda | null,
  now: Date,
  timezone: string = HOUSEHOLD_TIMEZONE,
): OfflineAgendaView {
  if (!cache) {
    return { kind: "unavailable" };
  }

  const cachedDate = cache.snapshot.today.local_date;
  const currentDate = localDateInTimezone(now, timezone);
  const revealTomorrow = shouldRevealTomorrow(now, timezone);

  if (cachedDate !== currentDate) {
    return {
      kind: "stale_day",
      snapshot: cache.snapshot,
      syncedAt: cache.syncedAt,
      cachedDate,
      staleLabel: formatStaleOfflineLabel(cachedDate),
      revealTomorrow: false,
    };
  }

  return {
    kind: "same_day",
    snapshot: cache.snapshot,
    syncedAt: cache.syncedAt,
    cachedDate,
    revealTomorrow,
  };
}

/** False while offline-cached or awaiting reconnect refetch (PRD §14). */
export function writesAllowed(state: SyncPhase): boolean {
  return state.phase !== "offline_cached" && state.phase !== "reconnecting";
}

/** Human-readable last-sync line for offline banners (PRD §14). */
export function formatLastSyncLabel(
  syncedAt: string,
  timezone: string = HOUSEHOLD_TIMEZONE,
): string {
  const date = new Date(syncedAt);
  if (Number.isNaN(date.getTime())) return syncedAt;
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `Última sincronização: ${formatted}`;
}
