"use client";

import type { SnapshotOccurrence } from "@/lib/agenda/types";
import { ownerAlertPresentation, statusLabel } from "@/lib/agenda/presentation";

export function OccurrenceRow({ occurrence }: { occurrence: SnapshotOccurrence }) {
  const alert = ownerAlertPresentation(occurrence);
  const time = occurrence.scheduled_time ?? "Sem horário";

  return (
    <li
      data-occurrence-key={occurrence.key}
      data-occurrence-status={occurrence.status}
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
      </div>
      {alert.show ? (
        <p className="occurrence__alert" role="status">
          <span className="occurrence__alert-icon" aria-hidden="true">
            {alert.icon === "alert" ? "!" : null}
          </span>
          <span className="occurrence__alert-text">{alert.label}</span>
        </p>
      ) : null}
    </li>
  );
}
