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
  switch (occurrence.status) {
    case "late":
      return "Atrasado";
    case "completed":
      return "Concluído";
    case "cancelled":
      return "Cancelado";
    default:
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
