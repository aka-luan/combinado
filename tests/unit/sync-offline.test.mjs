import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatLastSyncLabel,
  formatStaleOfflineLabel,
  msUntilHouseholdMidnight,
  REFETCH_INTERVAL_MS,
  resolveOfflineAgendaView,
  shouldRevealTomorrow,
  writesAllowed,
} from "../../src/lib/sync/policy.ts";
import {
  clearUserAgendaCache,
  createMemoryAgendaCacheStore,
  getAgendaCache,
  putAgendaCache,
} from "../../src/lib/sync/agenda-cache.ts";

const sampleOccurrence = {
  key: "routine:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-07-30",
  source: "routine",
  source_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  local_date: "2026-07-30",
  slot: null,
  title: "Levar à escola",
  target_kind: "child",
  child_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  target_label: "Mia",
  scheduled_time: "08:30",
  requires_confirmation: true,
  owner_user_id: null,
  owner_display_name: null,
  status: "late",
  needs_owner_alert: true,
};

const sampleSnapshot = {
  server_time: "2026-07-30T22:00:00+00:00",
  timezone: "America/Sao_Paulo",
  version: "abc",
  today: {
    local_date: "2026-07-30",
    occurrences: [sampleOccurrence],
    empty_message: null,
  },
  tomorrow: {
    local_date: "2026-07-31",
    reveal: false,
    count: 1,
    occurrences: [{ ...sampleOccurrence, local_date: "2026-07-31", status: "scheduled" }],
    empty_message: null,
  },
};

const cache = {
  userId: "user-1",
  snapshot: sampleSnapshot,
  syncedAt: "2026-07-30T21:00:00.000Z",
};

test("resolveOfflineAgendaView is unavailable without a prior snapshot", () => {
  const view = resolveOfflineAgendaView(null, new Date("2026-07-30T22:00:00Z"));
  assert.deepEqual(view, { kind: "unavailable" });
});

test("resolveOfflineAgendaView keeps same-day cache readable", () => {
  // 19:30 America/Sao_Paulo on 2026-07-30
  const now = new Date("2026-07-30T22:30:00Z");
  const view = resolveOfflineAgendaView(cache, now);
  assert.equal(view.kind, "same_day");
  if (view.kind !== "same_day") return;
  assert.equal(view.cachedDate, "2026-07-30");
  assert.equal(view.syncedAt, cache.syncedAt);
  assert.equal(view.revealTomorrow, true);
  assert.equal(view.snapshot.version, "abc");
});

test("resolveOfflineAgendaView does not reveal Amanhã before 19h offline", () => {
  // 18:00 America/Sao_Paulo on 2026-07-30
  const now = new Date("2026-07-30T21:00:00Z");
  const view = resolveOfflineAgendaView(cache, now);
  assert.equal(view.kind, "same_day");
  if (view.kind !== "same_day") return;
  assert.equal(view.revealTomorrow, false);
});

test("resolveOfflineAgendaView preserves Amanhã already revealed by the cached snapshot", () => {
  const revealedCache = {
    ...cache,
    snapshot: {
      ...cache.snapshot,
      tomorrow: { ...cache.snapshot.tomorrow, reveal: true },
    },
  };
  const view = resolveOfflineAgendaView(revealedCache, new Date("2026-07-30T21:00:00Z"));
  assert.equal(view.kind, "same_day");
  if (view.kind !== "same_day") return;
  assert.equal(view.revealTomorrow, true);
});

test("offline midnight labels yesterday's cache with its original date", () => {
  // 00:30 America/Sao_Paulo on 2026-07-31
  const now = new Date("2026-07-31T03:30:00Z");
  const view = resolveOfflineAgendaView(cache, now);
  assert.equal(view.kind, "stale_day");
  if (view.kind !== "stale_day") return;
  assert.equal(view.cachedDate, "2026-07-30");
  assert.equal(view.staleLabel, "Dados de 30/07 — offline");
  assert.equal(view.revealTomorrow, false);
});

test("formatStaleOfflineLabel uses DD/MM from the cached local_date", () => {
  assert.equal(formatStaleOfflineLabel("2026-07-30"), "Dados de 30/07 — offline");
  assert.equal(formatStaleOfflineLabel("2026-01-05"), "Dados de 05/01 — offline");
});

test("shouldRevealTomorrow is true from 19:00 household local time", () => {
  assert.equal(shouldRevealTomorrow(new Date("2026-07-30T21:59:00Z")), false);
  assert.equal(shouldRevealTomorrow(new Date("2026-07-30T22:00:00Z")), true);
});

test("refetch triggers expose five-minute interval and midnight delay", () => {
  assert.equal(REFETCH_INTERVAL_MS, 5 * 60 * 1000);
  assert.equal(shouldRevealTomorrow(new Date("2026-07-30T22:00:00Z")), true);

  // 23:00 America/Sao_Paulo → one hour until midnight
  const ms = msUntilHouseholdMidnight(new Date("2026-07-31T02:00:00Z"));
  assert.ok(ms > 59 * 60 * 1000 && ms <= 60 * 60 * 1000);
});

test("writesAllowed blocks offline cache and reconnecting phases", () => {
  assert.equal(writesAllowed({ phase: "offline_cached" }), false);
  assert.equal(writesAllowed({ phase: "reconnecting" }), false);
  assert.equal(writesAllowed({ phase: "online_ready" }), true);
  assert.equal(writesAllowed({ phase: "loading" }), true);
});

test("formatLastSyncLabel includes pt-BR date and time", () => {
  const label = formatLastSyncLabel("2026-07-30T21:00:00.000Z");
  assert.match(label, /^Última sincronização:/);
  assert.match(label, /30\/07\/2026/);
});

test("clearUserAgendaCache removes only that Adulto's snapshots on logout", async () => {
  const store = createMemoryAgendaCacheStore();
  await putAgendaCache(store, "user-1", sampleSnapshot, "2026-07-30T21:00:00.000Z");
  await putAgendaCache(store, "user-2", sampleSnapshot, "2026-07-30T22:00:00.000Z");
  await clearUserAgendaCache("user-1", store);
  assert.equal(await getAgendaCache(store, "user-1"), null);
  assert.ok(await getAgendaCache(store, "user-2"));
});
