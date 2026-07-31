import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatConnectivityLabel,
  formatSettingsOpsLines,
  resolveSettingsOpsStatus,
} from "../../src/lib/ops/settings-status.ts";

test("resolveSettingsOpsStatus surfaces connectivity, last sync, push, and backup freshness", () => {
  const status = resolveSettingsOpsStatus({
    online: true,
    lastSyncLabel: "Última sincronização: 31/07/2026, 12:30",
    pushStatus: "active",
    backupMessage: "Backup automático: último sucesso em 31/07/2026, 12:00. Operação best effort.",
  });

  assert.equal(status.connectivity.kind, "online");
  assert.equal(status.lastSync.kind, "known");
  assert.match(status.lastSync.label, /Última sincronização/);
  assert.equal(status.pushStatus, "active");
  assert.match(status.backupMessage, /best effort/i);
});

test("offline connectivity and missing sync stay user-useful without provider names", () => {
  const status = resolveSettingsOpsStatus({
    online: false,
    lastSyncLabel: null,
    pushStatus: "permission-required",
    backupMessage: "Backup automático: ainda não há registro de execução. A rotina é best effort.",
  });

  const lines = formatSettingsOpsLines(status).join("\n");
  assert.equal(status.connectivity.kind, "offline");
  assert.equal(status.lastSync.kind, "unknown");
  assert.match(formatConnectivityLabel(status.connectivity), /offline/i);
  assert.doesNotMatch(lines, /Supabase|VAPID|Gmail|Cloudflare|GitHub/i);
});
