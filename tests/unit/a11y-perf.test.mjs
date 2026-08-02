import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runWithSeparatedPhases } from "../../src/lib/pwa/action-phases.ts";
import { buildDenseTodayOccurrences } from "../../src/lib/agenda/dense-fixture.ts";
import { OCCURRENCE_TITLE_MAX_LENGTH } from "../../src/lib/agenda/title-limits.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("runWithSeparatedPhases marks feedback before persistence completes", async () => {
  /** @type {string[]} */
  const order = [];
  let clock = 0;
  const { marks } = await runWithSeparatedPhases({
    now: () => {
      clock += 10;
      return clock;
    },
    onImmediateFeedback: () => {
      order.push("feedback");
    },
    persist: async () => {
      order.push("persist");
      return "ok";
    },
  });

  assert.deepEqual(order, ["feedback", "persist"]);
  assert.ok(marks.feedbackAt < marks.persistenceStartedAt);
  assert.ok(marks.persistenceStartedAt < marks.persistenceEndedAt);
});

test("dense Hoje fixture stays within title limit and includes at least 100 occurrences", () => {
  const occurrences = buildDenseTodayOccurrences(100);
  assert.equal(occurrences.length, 100);
  assert.ok(occurrences.every((o) => o.title.length <= OCCURRENCE_TITLE_MAX_LENGTH));
  assert.ok(occurrences.some((o) => o.needs_owner_alert));

  const started = performance.now();
  const labels = occurrences.map((o) => `${o.scheduled_time}|${o.title}|${o.status}`);
  const elapsed = performance.now() - started;
  assert.equal(labels.length, 100);
  // Flat list mapping must stay cheap — guards accidental O(n²) prep before paint.
  assert.ok(elapsed < 50, `dense fixture prep took ${elapsed}ms`);
});

test("globals.css keeps system light/dark, 44px targets, and two-line titles", () => {
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  assert.match(css, /color-scheme:\s*light dark/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /-webkit-line-clamp:\s*2/);
  assert.match(css, /\.occurrence--owner-alert/);
  assert.match(css, /\[data-push-error\]/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /safe-area-inset-top/);
});
