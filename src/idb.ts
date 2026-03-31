/**
 * IndexedDB storage layer for shre-chat.
 *
 * Provides async load/save that mirror the localStorage API in store.ts,
 * but without the 5 MB cap.  On first run the existing localStorage data
 * is migrated into IDB and the old keys are cleared.
 */

import type { Session, ActivityEvent, FeedEntry, UploadedFile, QueuedMessage } from './store';

// ── Constants ────────────────────────────────────────────────────────

const DB_NAME = 'shre-chat';
const DB_VERSION = 1;

const STORE_SESSIONS = 'sessions';
const STORE_ACTIVITY = 'activity';
const STORE_FEED = 'feed';
const STORE_FILES = 'files';
const STORE_QUEUE = 'queue';
const STORE_META = 'meta'; // tabs, activeSession, misc flags

const MIGRATION_FLAG = 'shre-idb-migrated';

// localStorage keys (must stay in sync with store.ts)
const LS_KEYS = {
  sessions: 'shre-sessions',
  activity: 'shre-activity',
  feed: 'shre-feed',
  files: 'shre-files',
  tabs: 'shre-open-tabs',
  active: 'shre-active-session',
  queue: 'shre-queue',
} as const;

// ── Database handle (singleton) ──────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      // Each store holds a single record keyed by a fixed string ("data")
      // except meta which uses arbitrary string keys.
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) db.createObjectStore(STORE_SESSIONS);
      if (!db.objectStoreNames.contains(STORE_ACTIVITY)) db.createObjectStore(STORE_ACTIVITY);
      if (!db.objectStoreNames.contains(STORE_FEED)) db.createObjectStore(STORE_FEED);
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES);
      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Generic helpers ──────────────────────────────────────────────────

function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbPut<T>(storeName: string, key: string, value: T): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// ── Public async load/save ───────────────────────────────────────────

export async function idbLoadSessions(): Promise<Session[]> {
  return (await idbGet<Session[]>(STORE_SESSIONS, 'data')) ?? [];
}

export async function idbSaveSessions(sessions: Session[]): Promise<void> {
  await idbPut(STORE_SESSIONS, 'data', sessions);
}

export async function idbLoadActivity(): Promise<ActivityEvent[]> {
  return (await idbGet<ActivityEvent[]>(STORE_ACTIVITY, 'data')) ?? [];
}

export async function idbSaveActivity(events: ActivityEvent[]): Promise<void> {
  await idbPut(STORE_ACTIVITY, 'data', events);
}

export async function idbLoadFeed(): Promise<FeedEntry[]> {
  return (await idbGet<FeedEntry[]>(STORE_FEED, 'data')) ?? [];
}

export async function idbSaveFeed(entries: FeedEntry[]): Promise<void> {
  await idbPut(STORE_FEED, 'data', entries);
}

export async function idbLoadFiles(): Promise<UploadedFile[]> {
  return (await idbGet<UploadedFile[]>(STORE_FILES, 'data')) ?? [];
}

export async function idbSaveFiles(files: UploadedFile[]): Promise<void> {
  await idbPut(STORE_FILES, 'data', files);
}

export async function idbLoadQueue(): Promise<QueuedMessage[]> {
  return (await idbGet<QueuedMessage[]>(STORE_QUEUE, 'data')) ?? [];
}

export async function idbSaveQueue(queue: QueuedMessage[]): Promise<void> {
  await idbPut(STORE_QUEUE, 'data', queue);
}

export async function idbLoadTabs(): Promise<string[]> {
  return (await idbGet<string[]>(STORE_META, 'tabs')) ?? [];
}

export async function idbSaveTabs(tabs: string[]): Promise<void> {
  await idbPut(STORE_META, 'tabs', tabs);
}

export async function idbLoadActiveSession(): Promise<string | null> {
  return (await idbGet<string | null>(STORE_META, 'activeSession')) ?? null;
}

export async function idbSaveActiveSession(id: string | null): Promise<void> {
  await idbPut(STORE_META, 'activeSession', id);
}

export async function idbLoadScrollPositions(): Promise<Record<string, number>> {
  return (await idbGet<Record<string, number>>(STORE_META, 'scrollPositions')) ?? {};
}

export async function idbSaveScrollPositions(positions: Record<string, number>): Promise<void> {
  await idbPut(STORE_META, 'scrollPositions', positions);
}

// ── Migration ────────────────────────────────────────────────────────

/** Migrate localStorage data into IndexedDB (runs once). */
async function migrateFromLocalStorage(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG) === '1') return;

  const db = await openDB();

  // Helper: read from localStorage and write into IDB in one transaction
  const migrateStore = (storeName: string, key: string, lsKey: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const raw = localStorage.getItem(lsKey);
      if (!raw) {
        resolve();
        return;
      }
      try {
        const data = JSON.parse(raw);
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(data, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch {
        // Malformed JSON — skip
        resolve();
      }
    });
  };

  await Promise.all([
    migrateStore(STORE_SESSIONS, 'data', LS_KEYS.sessions),
    migrateStore(STORE_ACTIVITY, 'data', LS_KEYS.activity),
    migrateStore(STORE_FEED, 'data', LS_KEYS.feed),
    migrateStore(STORE_FILES, 'data', LS_KEYS.files),
    migrateStore(STORE_QUEUE, 'data', LS_KEYS.queue),
    migrateStore(STORE_META, 'tabs', LS_KEYS.tabs),
    // activeSession is a plain string, not JSON
    (async () => {
      const active = localStorage.getItem(LS_KEYS.active);
      if (active) await idbPut(STORE_META, 'activeSession', active);
    })(),
  ]);

  // Set flag — keep the flag in localStorage so we don't re-migrate
  localStorage.setItem(MIGRATION_FLAG, '1');
}

// ── Init ─────────────────────────────────────────────────────────────

/** Whether IDB is ready. Before this is true the sync localStorage
 *  functions are the only persistence path. */
let _idbReady = false;
export function isIdbReady(): boolean {
  return _idbReady;
}

/**
 * Initialize IndexedDB storage:
 * 1. Open the database
 * 2. Migrate existing localStorage data (first time only)
 * 3. Mark IDB as ready so future saves go to both LS + IDB
 */
export async function initIdb(): Promise<void> {
  try {
    await openDB();
    await migrateFromLocalStorage();
    _idbReady = true;
  } catch (err) {
    console.warn('[idb] IndexedDB init failed, falling back to localStorage', err);
    // Graceful degradation — everything still works via localStorage
  }
}
