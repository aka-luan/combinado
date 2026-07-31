import type { AgendaSnapshot } from "../agenda/types";
import type { CachedAgenda } from "./policy";

export type AgendaCacheStore = {
  get(userId: string): Promise<CachedAgenda | null>;
  put(entry: CachedAgenda): Promise<void>;
  delete(userId: string): Promise<void>;
  clearAll(): Promise<void>;
};

const DB_NAME = "combinado-agenda";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";

export function createMemoryAgendaCacheStore(): AgendaCacheStore {
  const map = new Map<string, CachedAgenda>();
  return {
    async get(userId) {
      return map.get(userId) ?? null;
    },
    async put(entry) {
      map.set(entry.userId, entry);
    },
    async delete(userId) {
      map.delete(userId);
    },
    async clearAll() {
      map.clear();
    },
  };
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

/** Adulto-scoped Hoje/Amanhã snapshots + last-sync metadata (PRD §14). */
export function createIndexedDbAgendaCacheStore(
  factory: IDBFactory | null = typeof indexedDB !== "undefined" ? indexedDB : null,
): AgendaCacheStore | null {
  if (!factory) return null;

  return {
    async get(userId) {
      const db = await openDb(factory);
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const value = await idbRequest(tx.objectStore(STORE_NAME).get(userId));
        return (value as CachedAgenda | undefined) ?? null;
      } finally {
        db.close();
      }
    },
    async put(entry) {
      const db = await openDb(factory);
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        await idbRequest(tx.objectStore(STORE_NAME).put(entry));
      } finally {
        db.close();
      }
    },
    async delete(userId) {
      const db = await openDb(factory);
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        await idbRequest(tx.objectStore(STORE_NAME).delete(userId));
      } finally {
        db.close();
      }
    },
    async clearAll() {
      const db = await openDb(factory);
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        await idbRequest(tx.objectStore(STORE_NAME).clear());
      } finally {
        db.close();
      }
    },
  };
}

let defaultStore: AgendaCacheStore | undefined;

export function getDefaultAgendaCacheStore(): AgendaCacheStore {
  if (!defaultStore) {
    defaultStore = createIndexedDbAgendaCacheStore() ?? createMemoryAgendaCacheStore();
  }
  return defaultStore;
}

/** Test-only: replace the process-wide default store. */
export function setDefaultAgendaCacheStoreForTests(store: AgendaCacheStore | undefined): void {
  defaultStore = store;
}

export async function putAgendaCache(
  store: AgendaCacheStore,
  userId: string,
  snapshot: AgendaSnapshot,
  syncedAt: string,
): Promise<void> {
  await store.put({ userId, snapshot, syncedAt });
}

export async function getAgendaCache(
  store: AgendaCacheStore,
  userId: string,
): Promise<CachedAgenda | null> {
  return store.get(userId);
}

export async function clearAgendaCache(store: AgendaCacheStore, userId: string): Promise<void> {
  await store.delete(userId);
}

/** Logout cleanup: drop this Adulto's snapshots (PRD §14). */
export async function clearUserAgendaCache(
  userId: string,
  store: AgendaCacheStore = getDefaultAgendaCacheStore(),
): Promise<void> {
  await clearAgendaCache(store, userId);
}
