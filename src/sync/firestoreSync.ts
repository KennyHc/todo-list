import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  waitForPendingWrites,
  writeBatch,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
  type WriteBatch,
} from 'firebase/firestore';
import { synthesizeHistory } from '../lib/history';
import { normalizeTree } from '../lib/normalizeTree';
import {
  clearLegacyLocalTasks,
  readLegacyLocalTasks,
  useTaskStore,
  type PersistedTasks,
} from '../store/tasks';
import { applyRemote, buildState, emptyChanges, hasChanges } from './apply';
import { diffState, isEmptyDiff } from './diff';
import {
  fromHistoryDoc,
  fromSettings,
  fromTagColors,
  fromTaskDoc,
  historyOrds,
  SCHEMA_VERSION,
  toHistoryDoc,
  toSettingsDoc,
  toTaskDoc,
  type OrderedEntry,
} from './schema';
import { useSyncStore } from './status';
import { registerSyncController } from './syncControl';
import type { Task } from '../types';

/*
 * Layout:   users/{uid}                  meta: rootIds, tagColors, settings, schemaVersion, updatedAt
 *           users/{uid}/tasks/{id}       one document per task
 *           users/{uid}/history/{id}     one document per completion-log entry
 *
 * The Zustand store stays the UI's source of truth. Local -> remote is a debounced diff of the
 * store against `last` (the state as last written or applied); remote -> local decodes snapshot
 * changes and applies them on top of the live store (see apply.ts).
 */

export type SyncStore = {
  getState: () => PersistedTasks & { hydrate: (partial: Partial<PersistedTasks>) => void };
  subscribe: (listener: (state: PersistedTasks, prev: PersistedTasks) => void) => () => void;
};

export type SyncStatusSink = {
  getState: () => {
    setSyncStatus: (status: 'loading' | 'ready' | 'offline' | 'error') => void;
    setMigratedCount: (count: number | null) => void;
  };
};

export type SyncOptions = {
  db: Firestore;
  store?: SyncStore;
  status?: SyncStatusSink;
  legacy?: { read: () => PersistedTasks | null; clear: () => void };
  debounceMs?: number;
  maxWaitMs?: number;
  /** How long the initial load waits for the server before settling for the local cache. */
  initialTimeoutMs?: number;
};

const BATCH_LIMIT = 450;
const APPLY_DELAY_MS = 25;

const pick = ({
  tasks,
  rootIds,
  history,
  tagColors,
  settings,
}: PersistedTasks): PersistedTasks => ({
  tasks,
  rootIds,
  history,
  tagColors,
  settings,
});

type Active = { flush: () => Promise<void>; db: Firestore; stop: () => void };
let active: Active | null = null;

/** Pushes pending local edits and waits (bounded) for the server to take them. For sign-out. */
export async function flushActiveSync(timeoutMs = 3000): Promise<void> {
  const current = active;
  if (!current) return;
  const done = current.flush().then(() => waitForPendingWrites(current.db));
  await Promise.race([done, new Promise<void>((r) => setTimeout(r, timeoutMs))]).catch(() => {});
}

/**
 * Stops the running sync immediately. Must happen before the task store is reset, otherwise the
 * reset would be diffed and written to the cloud as a mass delete.
 */
export function stopActiveSync(): void {
  active?.stop();
}

export function startSync(uid: string, options: SyncOptions): () => void {
  const { db } = options;
  const store = options.store ?? (useTaskStore as SyncStore);
  const statusSink = options.status ?? useSyncStore;
  const legacy = options.legacy ?? { read: readLegacyLocalTasks, clear: clearLegacyLocalTasks };
  const debounceMs = options.debounceMs ?? 250;
  const maxWaitMs = options.maxWaitMs ?? 1000;
  const initialTimeoutMs = options.initialTimeoutMs ?? 8000;
  const setStatus = (s: 'loading' | 'ready' | 'offline' | 'error') =>
    statusSink.getState().setSyncStatus(s);

  setStatus('loading');
  const metaRef = doc(db, 'users', uid);
  const tasksCol = collection(db, 'users', uid, 'tasks');
  const historyCol = collection(db, 'users', uid, 'history');

  let stopped = false;
  let live = false;
  let failed = false;
  let last: PersistedTasks = pick(store.getState());

  const snaps: {
    meta: DocumentSnapshot | null;
    tasks: QuerySnapshot | null;
    history: QuerySnapshot | null;
  } = { meta: null, tasks: null, history: null };
  const waiters = new Set<() => void>();
  const notify = () => waiters.forEach((w) => w());
  const waitUntil = (pred: () => boolean, timeoutMs: number) =>
    new Promise<boolean>((resolve) => {
      if (pred()) return resolve(true);
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        waiters.delete(check);
        resolve(ok);
      };
      const check = () => pred() && finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      waiters.add(check);
    });

  const isOffline = () =>
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    (snaps.meta !== null &&
      snaps.tasks !== null &&
      snaps.history !== null &&
      snaps.meta.metadata.fromCache &&
      snaps.tasks.metadata.fromCache &&
      snaps.history.metadata.fromCache);

  const updateStatus = () => {
    if (!live || stopped) return;
    setStatus(failed ? 'error' : isOffline() ? 'offline' : 'ready');
  };

  const fail = (error: unknown) => {
    console.error('[sync]', error);
    failed = true;
    if (!stopped) setStatus('error');
  };

  // --- remote -> local ----------------------------------------------------------------------

  let changes = emptyChanges();
  let applyTimer: ReturnType<typeof setTimeout> | undefined;

  const applyPending = () => {
    applyTimer = undefined;
    if (stopped || !hasChanges(changes)) return;
    const batch = changes;
    changes = emptyChanges();
    const { next, nextLast, changed } = applyRemote(pick(store.getState()), last, batch);
    if (!changed) {
      last = nextLast;
      return;
    }
    last = nextLast;
    store.getState().hydrate({
      tasks: next.tasks,
      rootIds: next.rootIds,
      history: next.history,
      tagColors: next.tagColors,
      settings: next.settings,
    });
  };

  // Callbacks for the same server update arrive back to back; coalescing them keeps a task
  // and its parent's list from being applied (and normalized) one without the other.
  const queueApply = () => {
    applyTimer ??= setTimeout(applyPending, APPLY_DELAY_MS);
  };

  const onTasks = (snap: QuerySnapshot) => {
    snaps.tasks = snap;
    if (live) {
      for (const change of snap.docChanges({ includeMetadataChanges: true })) {
        if (change.doc.metadata.hasPendingWrites) continue; // our own write, still in flight
        const id = change.doc.id;
        if (change.type === 'removed') changes.tasks.set(id, null);
        else {
          const task = fromTaskDoc(id, change.doc.data());
          if (task) changes.tasks.set(id, task);
        }
      }
      queueApply();
      updateStatus();
    }
    notify();
  };

  const onHistory = (snap: QuerySnapshot) => {
    snaps.history = snap;
    if (live) {
      for (const change of snap.docChanges({ includeMetadataChanges: true })) {
        if (change.doc.metadata.hasPendingWrites) continue;
        const id = change.doc.id;
        if (change.type === 'removed') changes.history.set(id, null);
        else {
          const item = fromHistoryDoc(id, change.doc.data());
          if (item) changes.history.set(id, item);
        }
      }
      queueApply();
      updateStatus();
    }
    notify();
  };

  const onMeta = (snap: DocumentSnapshot) => {
    snaps.meta = snap;
    if (live) {
      const data = snap.data();
      if (!snap.metadata.hasPendingWrites && data) {
        if (Array.isArray(data.rootIds)) {
          changes.rootIds = data.rootIds.filter((x): x is string => typeof x === 'string');
        }
        changes.tagColors = fromTagColors(data.tagColors);
        changes.settings = fromSettings(data.settings);
        queueApply();
      }
      updateStatus();
    }
    notify();
  };

  const opts = { includeMetadataChanges: true } as const;
  const unsubs = [
    onSnapshot(metaRef, opts, onMeta, fail),
    onSnapshot(tasksCol, opts, onTasks, fail),
    onSnapshot(query(historyCol, orderBy('completedAt')), opts, onHistory, fail),
  ];

  // --- local -> remote ----------------------------------------------------------------------

  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let firstDirtyAt: number | null = null;

  const flush = (): Promise<void> => {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    firstDirtyAt = null;
    if (!live) return Promise.resolve();
    const current = pick(store.getState());
    const diff = diffState(last, current);
    if (isEmptyDiff(diff)) return Promise.resolve();
    last = current;

    const ops: ((b: WriteBatch) => void)[] = [];
    if (diff.rootIdsChanged) {
      ops.push((b) =>
        b.set(
          metaRef,
          { rootIds: current.rootIds, schemaVersion: SCHEMA_VERSION, updatedAt: serverTimestamp() },
          { merge: true },
        ),
      );
    }
    // mergeFields replaces a whole map, so a removed tag disappears (a plain merge would keep
    // its key). The rules need `rootIds` on a freshly created meta document.
    const metaOp = (field: 'tagColors' | 'settings', value: unknown) => {
      const needsRoots = !snaps.meta?.exists() || !Array.isArray(snaps.meta.data()?.rootIds);
      ops.push((b) =>
        b.set(
          metaRef,
          {
            [field]: value,
            ...(needsRoots ? { rootIds: current.rootIds } : {}),
            schemaVersion: SCHEMA_VERSION,
            updatedAt: serverTimestamp(),
          },
          {
            mergeFields: [field, ...(needsRoots ? ['rootIds'] : []), 'schemaVersion', 'updatedAt'],
          },
        ),
      );
    };
    if (diff.tagColorsChanged) metaOp('tagColors', current.tagColors);
    if (diff.settingsChanged) metaOp('settings', toSettingsDoc(current.settings));
    for (const task of diff.taskUpserts) {
      ops.push((b) => b.set(doc(tasksCol, task.id), toTaskDoc(task)));
    }
    for (const id of diff.taskDeletes) ops.push((b) => b.delete(doc(tasksCol, id)));
    if (diff.historyUpserts.length > 0) {
      const ords = historyOrds(current.history);
      for (const entry of diff.historyUpserts) {
        ops.push((b) =>
          b.set(doc(historyCol, entry.id), toHistoryDoc(entry, ords.get(entry.id) ?? 0)),
        );
      }
    }
    for (const id of diff.historyDeletes) ops.push((b) => b.delete(doc(historyCol, id)));

    const commits: Promise<void>[] = [];
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
      commits.push(batch.commit());
    }
    // Writes resolve against the offline queue; the UI never waits on them.
    return Promise.all(commits).then(
      () => undefined,
      (error: { code?: string }) => {
        console.error('[sync] write failed', error);
        if (error?.code === 'permission-denied') fail(error);
      },
    );
  };

  const schedule = () => {
    const now = Date.now();
    firstDirtyAt ??= now;
    clearTimeout(flushTimer);
    const wait = Math.max(0, Math.min(debounceMs, firstDirtyAt + maxWaitMs - now));
    flushTimer = setTimeout(() => void flush(), wait);
  };

  let unsubStore: (() => void) | undefined;
  const startLocalWatch = () => {
    unsubStore = store.subscribe((s, p) => {
      if (
        s.tasks !== p.tasks ||
        s.rootIds !== p.rootIds ||
        s.history !== p.history ||
        s.tagColors !== p.tagColors ||
        s.settings !== p.settings
      ) {
        schedule();
      }
    });
  };

  const onHidden = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') void flush();
  };
  const onConnectivity = () => updateStatus();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHidden);
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onHidden);
    window.addEventListener('online', onConnectivity);
    window.addEventListener('offline', onConnectivity);
  }

  // --- initial load -------------------------------------------------------------------------

  const allIn = () => snaps.meta !== null && snaps.tasks !== null && snaps.history !== null;
  const allFromServer = () =>
    allIn() &&
    !snaps.meta!.metadata.fromCache &&
    !snaps.tasks!.metadata.fromCache &&
    !snaps.history!.metadata.fromCache;

  const decodeSnapshots = (): PersistedTasks => {
    const tasks: Task[] = [];
    snaps.tasks?.forEach((d) => {
      const t = fromTaskDoc(d.id, d.data());
      if (t) tasks.push(t);
    });
    const history: OrderedEntry[] = [];
    snaps.history?.forEach((d) => {
      const h = fromHistoryDoc(d.id, d.data());
      if (h) history.push(h);
    });
    const meta = snaps.meta?.data();
    const rootIds = meta?.rootIds;
    return buildState(
      tasks,
      Array.isArray(rootIds) ? rootIds.filter((x): x is string => typeof x === 'string') : [],
      history,
      fromTagColors(meta?.tagColors),
      fromSettings(meta?.settings),
    );
  };

  /** Asks the server (not the cache) whether this account has any data. Null when offline. */
  const probeServer = async (): Promise<{ empty: boolean } | null> => {
    try {
      const [meta, someTask] = await Promise.all([
        getDocFromServer(metaRef),
        getDocsFromServer(query(tasksCol, limit(1))),
      ]);
      return { empty: !meta.exists() && someTask.empty };
    } catch {
      return null;
    }
  };

  const initialLoad = async () => {
    await waitUntil(allIn, initialTimeoutMs);
    if (stopped) return;
    const probe = await probeServer();
    if (stopped) return;
    // With the server reachable, wait for its snapshot so a cold or stale cache can't make an
    // existing account look empty.
    if (probe) await waitUntil(allFromServer, initialTimeoutMs);
    if (stopped) return;

    // From here to `live = true` is synchronous: no snapshot can slip between build and watch.
    const remote = decodeSnapshots();
    const legacyData =
      probe?.empty && Object.keys(remote.tasks).length === 0 ? legacy.read() : null;

    if (legacyData) {
      const migrated = normalizeTree(legacyData);
      store.getState().hydrate({
        tasks: migrated.tasks,
        rootIds: migrated.rootIds,
        history: migrated.history,
        tagColors: migrated.tagColors ?? {},
      });
      // Everything is new to the cloud.
      last = {
        tasks: {},
        rootIds: [],
        history: [],
        tagColors: {},
        settings: store.getState().settings,
      };
      live = true;
      startLocalWatch();
      updateStatus();
      statusSink.getState().setMigratedCount(Object.keys(migrated.tasks).length);
      void flush().then(() => {
        // Keep the legacy copy until the cloud has accepted it (or it never will: see caveats).
        if (!failed) legacy.clear();
      });
      return;
    }

    // `last` is the normalized state, so tree repairs are kept in memory but not written back.
    const state = normalizeTree(remote);
    // Done tasks are hidden from the Tree, so a done task without a History entry (data from
    // before the Tree hid them) gets one. Those entries differ from `last`, so they are written.
    const history = synthesizeHistory(state);
    store.getState().hydrate({
      tasks: state.tasks,
      rootIds: state.rootIds,
      history,
      tagColors: state.tagColors,
      settings: state.settings,
    });
    last = pick(state);
    live = true;
    startLocalWatch();
    if (history !== state.history) schedule();
    updateStatus();
  };

  void initialLoad();

  const stop = () => {
    if (stopped) return;
    void flush();
    stopped = true;
    live = false;
    if (active === handle) active = null;
    unsubs.forEach((u) => u());
    unsubStore?.();
    clearTimeout(flushTimer);
    clearTimeout(applyTimer);
    waiters.clear();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHidden);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', onHidden);
      window.removeEventListener('online', onConnectivity);
      window.removeEventListener('offline', onConnectivity);
    }
    setStatus('loading');
  };
  const handle: Active = { flush, db, stop };
  active = handle;
  return stop;
}

registerSyncController({ flush: flushActiveSync, stop: stopActiveSync });
