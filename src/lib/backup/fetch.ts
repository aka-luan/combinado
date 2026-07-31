import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatBackupStatusMessage,
  parseBackupStatusRow,
  type BackupStatus,
} from "./status";

export async function fetchBackupStatus(
  client: SupabaseClient,
): Promise<BackupStatus | null> {
  const { data, error } = await client.rpc("get_backup_status");
  if (error) {
    return null;
  }
  return parseBackupStatusRow(data);
}

export async function loadBackupStatusMessage(
  client: SupabaseClient,
  now: Date = new Date(),
): Promise<string> {
  const status = await fetchBackupStatus(client);
  return formatBackupStatusMessage(status, now);
}
