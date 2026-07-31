import type {
  AgendaSnapshot,
  DaySnapshot,
  OccurrenceSource,
  OccurrenceStatus,
  SnapshotOccurrence,
  TomorrowSnapshot,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const STATUSES: ReadonlySet<string> = new Set([
  "scheduled",
  "pending",
  "late",
  "completed",
  "cancelled",
  "unrecorded",
]);

const SOURCES: ReadonlySet<string> = new Set(["routine", "medication", "event"]);

function parseOccurrence(raw: unknown): SnapshotOccurrence | null {
  const o = asRecord(raw);
  if (!o) return null;
  const key = asString(o.key);
  const source = asString(o.source);
  const source_id = asString(o.source_id);
  const local_date = asString(o.local_date);
  const title = asString(o.title);
  const target_kind = asString(o.target_kind);
  const target_label = asString(o.target_label);
  const status = asString(o.status);
  const requires_confirmation = asBoolean(o.requires_confirmation);
  const needs_owner_alert = asBoolean(o.needs_owner_alert);
  if (
    !key ||
    !source ||
    !SOURCES.has(source) ||
    !source_id ||
    !local_date ||
    !title ||
    (target_kind !== "casa" && target_kind !== "child") ||
    !target_label ||
    !status ||
    !STATUSES.has(status) ||
    requires_confirmation === null ||
    needs_owner_alert === null
  ) {
    return null;
  }

  return {
    key,
    source: source as OccurrenceSource,
    source_id,
    local_date,
    slot: asString(o.slot),
    title,
    target_kind,
    child_id: asString(o.child_id),
    target_label,
    scheduled_time: asString(o.scheduled_time),
    requires_confirmation,
    owner_user_id: asString(o.owner_user_id),
    owner_display_name: asString(o.owner_display_name),
    status: status as OccurrenceStatus,
    needs_owner_alert,
    instruction: o.instruction === undefined ? undefined : asString(o.instruction),
    confirmation_id:
      o.confirmation_id === undefined ? undefined : asString(o.confirmation_id),
    confirmed_at: o.confirmed_at === undefined ? undefined : asString(o.confirmed_at),
    confirmed_by_user_id:
      o.confirmed_by_user_id === undefined ? undefined : asString(o.confirmed_by_user_id),
    confirmed_by_display_name:
      o.confirmed_by_display_name === undefined
        ? undefined
        : asString(o.confirmed_by_display_name),
  };
}

function parseDay(raw: unknown): DaySnapshot | null {
  const d = asRecord(raw);
  if (!d) return null;
  const local_date = asString(d.local_date);
  if (!local_date || !Array.isArray(d.occurrences)) return null;
  const occurrences: SnapshotOccurrence[] = [];
  for (const item of d.occurrences) {
    const occ = parseOccurrence(item);
    if (!occ) return null;
    occurrences.push(occ);
  }
  const empty_message = d.empty_message === null ? null : asString(d.empty_message);
  if (d.empty_message != null && empty_message === null) return null;
  return { local_date, occurrences, empty_message };
}

function parseTomorrow(raw: unknown): TomorrowSnapshot | null {
  const day = parseDay(raw);
  const t = asRecord(raw);
  if (!day || !t) return null;
  const reveal = asBoolean(t.reveal);
  const count = asNumber(t.count);
  if (reveal === null || count === null) return null;
  return { ...day, reveal, count };
}

/**
 * Maps RPC JSON to a typed agenda snapshot. Does not re-derive occurrences.
 */
export function parseAgendaSnapshot(raw: unknown): AgendaSnapshot | null {
  const root = asRecord(raw);
  if (!root) return null;
  const server_time = asString(root.server_time);
  const timezone = asString(root.timezone);
  const version = asString(root.version);
  const today = parseDay(root.today);
  const tomorrow = parseTomorrow(root.tomorrow);
  if (!server_time || !timezone || !version || !today || !tomorrow) return null;
  return { server_time, timezone, version, today, tomorrow };
}
