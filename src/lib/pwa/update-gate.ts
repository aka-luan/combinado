/** Pure gate for offering a downloaded PWA update (PRD §18). */

export function shouldOfferPwaUpdate(input: {
  hasWaitingWorker: boolean;
  interactionBusy: boolean;
}): boolean {
  return input.hasWaitingWorker && !input.interactionBusy;
}

type Listener = () => void;

let busyDepth = 0;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Marks an in-progress confirmation or form. Returns a release function. */
export function markInteractionBusy(): () => void {
  busyDepth += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busyDepth = Math.max(0, busyDepth - 1);
    notify();
  };
}

export function isInteractionBusy(): boolean {
  return busyDepth > 0;
}

export function subscribeInteractionBusy(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only seam — resets module state between unit cases. */
export function resetInteractionBusyForTests(): void {
  busyDepth = 0;
  listeners.clear();
}
