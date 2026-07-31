import type { SnapshotOccurrence } from "./types";

/** Builds a same-day Hoje fixture with at least `count` occurrences (PRD §19 / issue #12). */
export function buildDenseTodayOccurrences(
  count: number,
  localDate = "2026-07-31",
): SnapshotOccurrence[] {
  if (count < 1) return [];
  const occurrences: SnapshotOccurrence[] = [];
  for (let i = 0; i < count; i += 1) {
    const hour = String(Math.floor(i / 60) % 24).padStart(2, "0");
    const minute = String(i % 60).padStart(2, "0");
    const titleBase = `Ocorrência de teste ${i + 1} com título longo o suficiente para ocupar duas linhas na lista de Hoje`;
    occurrences.push({
      key: `event:${localDate}:fixture-${i}`,
      source: "event",
      source_id: `fixture-${i}`,
      local_date: localDate,
      slot: null,
      title: titleBase.slice(0, 120),
      target_kind: "casa",
      child_id: null,
      target_label: "Casa",
      scheduled_time: `${hour}:${minute}`,
      requires_confirmation: true,
      owner_user_id: i % 7 === 0 ? null : "adult-a",
      owner_display_name: i % 7 === 0 ? null : "Adulto A",
      status: "pending",
      needs_owner_alert: i % 7 === 0,
    });
  }
  return occurrences;
}
