import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatAdminMonitorReport,
  parseAdminMonitorSnapshot,
} from "../../src/lib/ops/admin-monitor.ts";

test("parseAdminMonitorSnapshot exposes cron, outbox, realtime, backup, and restore stamps", () => {
  const snap = parseAdminMonitorSnapshot({
    last_cron_at: "2026-07-31T21:00:00Z",
    outbox_pending_count: 2,
    outbox_failed_count: 1,
    realtime_error_count: 3,
    last_realtime_error_at: "2026-07-31T20:55:00Z",
    last_backup_success_at: "2026-07-31T03:00:00Z",
    last_restore_rehearsal_at: "2026-07-28T12:00:00Z",
  });

  assert.ok(snap);
  assert.equal(snap.outboxPendingCount, 2);
  assert.equal(snap.outboxFailedCount, 1);
  assert.equal(snap.realtimeErrorCount, 3);
  assert.equal(snap.lastCronAt, "2026-07-31T21:00:00Z");
  assert.equal(snap.lastBackupSuccessAt, "2026-07-31T03:00:00Z");
  assert.equal(snap.lastRestoreRehearsalAt, "2026-07-28T12:00:00Z");
});

test("formatAdminMonitorReport is codes-only — no child, title, medicine, or instruction", () => {
  const report = formatAdminMonitorReport(
    parseAdminMonitorSnapshot({
      last_cron_at: "2026-07-31T21:00:00Z",
      outbox_pending_count: 0,
      outbox_failed_count: 0,
      realtime_error_count: 0,
      last_realtime_error_at: null,
      last_backup_success_at: "2026-07-31T03:00:00Z",
      last_restore_rehearsal_at: null,
    }),
  );

  assert.match(report, /cron/i);
  assert.match(report, /outbox/i);
  assert.match(report, /Realtime|realtime/i);
  assert.match(report, /backup/i);
  assert.doesNotMatch(report, /Mia|Dipirona|tomar com água|consulta pediátrica/i);
});
