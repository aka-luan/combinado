import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBackupStatusRow, type BackupStatus } from "./status";

export async function fetchBackupStatus(
  client: SupabaseClient,
): Promise<BackupStatus | null> {
  const { data, error } = await client.rpc("get_backup_status");
  if (error) {
    return null;
  }
  return parseBackupStatusRow(data);
}
