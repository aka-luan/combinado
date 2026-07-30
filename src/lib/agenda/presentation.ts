import type { SnapshotOccurrence, TomorrowSnapshot } from "./types";

export const OWNER_ALERT_LABEL = "Sem responsável";

/** Accessible missing-owner cue: color + icon + text (PRD §4). */
export function ownerAlertPresentation(occurrence: SnapshotOccurrence): {
  show: boolean;
  label: string;
  icon: "alert";
} {
  return {
    show: occurrence.needs_owner_alert,
    label: OWNER_ALERT_LABEL,
    icon: "alert",
  };
}

export function statusLabel(occurrence: SnapshotOccurrence): string {
  const isDose = occurrence.source === "medication";
  switch (occurrence.status) {
    case "pending":
      return "Pendente";
    case "late":
      return isDose ? "Atrasada" : "Atrasado";
    case "completed":
      return isDose ? "Confirmada" : "Concluído";
    case "cancelled":
      return isDose ? "Cancelada por alteração" : "Cancelado";
    case "unrecorded":
      return "Sem registro";
    default:
      if (isDose) return "Programada";
      return occurrence.requires_confirmation ? "Programado" : "Informativo";
  }
}

export type TomorrowView =
  | { mode: "count_only"; count: number }
  | { mode: "inline"; empty_message: string | null; occurrences: SnapshotOccurrence[] };

/** Client only applies reveal; occurrence lists come from the snapshot. */
export function tomorrowView(tomorrow: TomorrowSnapshot): TomorrowView {
  if (!tomorrow.reveal) {
    return { mode: "count_only", count: tomorrow.count };
  }
  return {
    mode: "inline",
    empty_message: tomorrow.empty_message,
    occurrences: tomorrow.occurrences,
  };
}

/** Minutes from household local clock until an HH:mm slot (negative if past). */
export function minutesUntilSlot(
  scheduledTime: string,
  serverTimeIso: string,
  timezone: string = "America/Sao_Paulo",
): number | null {
  if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(scheduledTime)) return null;
  const now = new Date(serverTimeIso);
  if (Number.isNaN(now.getTime())) return null;

  const localHhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [nh, nm] = localHhmm.split(":").map(Number);
  const [sh, sm] = scheduledTime.split(":").map(Number);
  if ([nh, nm, sh, sm].some((n) => Number.isNaN(n))) return null;
  return sh * 60 + sm - (nh * 60 + nm);
}

/** PRD §9.3: more than 30 minutes before the slot needs a neutral extra confirm. */
export function needsEarlyConfirmationAck(
  occurrence: SnapshotOccurrence,
  serverTimeIso: string,
  timezone: string = "America/Sao_Paulo",
): boolean {
  if (occurrence.source !== "medication") return false;
  if (!occurrence.scheduled_time) return false;
  if (occurrence.status === "completed" || occurrence.status === "cancelled") return false;
  if (occurrence.status === "unrecorded") return false;
  const minutes = minutesUntilSlot(occurrence.scheduled_time, serverTimeIso, timezone);
  return minutes !== null && minutes > 30;
}

/** Device-clock deadline for the 10s undo window, derived from server times. */
export function undoDeadlineFromServer(
  confirmedAtIso: string | null | undefined,
  serverTimeIso: string,
  undoMs: number = 10_000,
): number | null {
  if (!confirmedAtIso) return null;
  const confirmed = Date.parse(confirmedAtIso);
  const server = Date.parse(serverTimeIso);
  if (Number.isNaN(confirmed) || Number.isNaN(server)) return null;
  const remaining = confirmed + undoMs - server;
  if (remaining <= 0) return null;
  return Date.now() + remaining;
}

export function isConfirmableDose(
  occurrence: SnapshotOccurrence,
  day: "today" | "tomorrow",
): boolean {
  if (occurrence.source !== "medication") return false;
  if (day !== "today") return false;
  return (
    occurrence.status === "scheduled" ||
    occurrence.status === "pending" ||
    occurrence.status === "late"
  );
}

export function isReversibleDose(occurrence: SnapshotOccurrence, day: "today" | "tomorrow"): boolean {
  if (occurrence.source !== "medication") return false;
  if (day !== "today") return false;
  return occurrence.status === "completed" && Boolean(occurrence.confirmation_id);
}
