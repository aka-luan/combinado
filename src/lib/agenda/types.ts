export type OccurrenceStatus =
  | "scheduled"
  | "pending"
  | "late"
  | "completed"
  | "cancelled"
  | "unrecorded";

export type OccurrenceSource = "routine" | "medication" | "event";

export type SnapshotOccurrence = {
  key: string;
  source: OccurrenceSource;
  source_id: string;
  local_date: string;
  slot: string | null;
  title: string;
  target_kind: "casa" | "child";
  child_id: string | null;
  target_label: string;
  scheduled_time: string | null;
  requires_confirmation: boolean;
  owner_user_id: string | null;
  owner_display_name: string | null;
  status: OccurrenceStatus;
  needs_owner_alert: boolean;
  /** Optional medication instruction (PRD §9.2). */
  instruction?: string | null;
  confirmation_id?: string | null;
  confirmed_at?: string | null;
  confirmed_by_user_id?: string | null;
  confirmed_by_display_name?: string | null;
};

export type DaySnapshot = {
  local_date: string;
  occurrences: SnapshotOccurrence[];
  empty_message: string | null;
};

export type TomorrowSnapshot = DaySnapshot & {
  reveal: boolean;
  count: number;
};

export type AgendaSnapshot = {
  server_time: string;
  timezone: string;
  version: string;
  today: DaySnapshot;
  tomorrow: TomorrowSnapshot;
};
