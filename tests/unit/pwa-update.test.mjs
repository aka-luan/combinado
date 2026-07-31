import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldOfferPwaUpdate,
  markInteractionBusy,
  isInteractionBusy,
  resetInteractionBusyForTests,
} from "../../src/lib/pwa/update-gate.ts";

test("shouldOfferPwaUpdate is false while an Adult action or edit is in progress", () => {
  assert.equal(
    shouldOfferPwaUpdate({ hasWaitingWorker: true, interactionBusy: true }),
    false,
  );
  assert.equal(
    shouldOfferPwaUpdate({ hasWaitingWorker: true, interactionBusy: false }),
    true,
  );
  assert.equal(
    shouldOfferPwaUpdate({ hasWaitingWorker: false, interactionBusy: false }),
    false,
  );
});

test("markInteractionBusy nests and clears so overlapping prompts stay busy", () => {
  resetInteractionBusyForTests();
  assert.equal(isInteractionBusy(), false);

  const releaseA = markInteractionBusy();
  const releaseB = markInteractionBusy();
  assert.equal(isInteractionBusy(), true);

  releaseA();
  assert.equal(isInteractionBusy(), true);

  releaseB();
  assert.equal(isInteractionBusy(), false);
});
