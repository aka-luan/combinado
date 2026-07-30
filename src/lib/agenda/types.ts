export type OccurrenceStatus = "scheduled" | "late" | "completed" | "cancelled";

export type SnapshotOccurrence = {
  key: string;
  source: "routine";
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
