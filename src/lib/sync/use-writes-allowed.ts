"use client";

import { useSyncExternalStore } from "react";
import {
  getWritesAllowedServerSnapshot,
  getWritesAllowedSnapshot,
  subscribeSyncPhase,
} from "@/lib/sync/writes-gate";

/** Shared write gate: only true after a successful online snapshot refetch. */
export function useWritesAllowed(): boolean {
  return useSyncExternalStore(
    subscribeSyncPhase,
    getWritesAllowedSnapshot,
    getWritesAllowedServerSnapshot,
  );
}
