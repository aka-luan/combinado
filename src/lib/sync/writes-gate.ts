import type { SyncPhaseName } from "./policy";

type Listener = () => void;

/** Starts permissive so Casa setup works before the first agenda refetch. */
let phase: SyncPhaseName = "online_ready";
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** Process-wide write gate so Settings and Hoje share one lock (PRD §14). */
export function setSyncPhase(next: SyncPhaseName): void {
  if (phase === next) return;
  phase = next;
  emit();
}

export function getSyncPhase(): SyncPhaseName {
  return phase;
}

export function subscribeSyncPhase(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
    }
  };
}

/**
 * Writes stay off while offline or until a reconnect refetch succeeds (PRD §14).
 * `online_ready` (and initial load) allow writes when the browser is online.
 */
export function getWritesAllowedSnapshot(): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  return phase !== "offline_cached" && phase !== "reconnecting";
}

export function getWritesAllowedServerSnapshot(): boolean {
  return true;
}
