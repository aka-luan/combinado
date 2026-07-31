"use client";

import { useEffect, useState } from "react";
import {
  isInteractionBusy,
  markInteractionBusy,
  subscribeInteractionBusy,
} from "./update-gate";

/** Keeps the PWA update gate aware of an open confirmation or form. */
export function useInteractionBusy(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return markInteractionBusy();
  }, [active]);
}

export function useIsInteractionBusy(): boolean {
  const [busy, setBusy] = useState(isInteractionBusy);
  useEffect(() => {
    setBusy(isInteractionBusy());
    return subscribeInteractionBusy(() => setBusy(isInteractionBusy()));
  }, []);
  return busy;
}
