import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  getDoc,
  initializeFirestore,
  memoryLocalCache,
  setDoc,
  terminate,
  type Firestore,
} from 'firebase/firestore';
import { createStore } from 'zustand/vanilla';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSync, type SyncStore } from '../../src/sync/firestoreSync';
import { createTaskStore } from '../../src/store/tasks';
import { toTaskDoc } from '../../src/sync/schema';
import type { Task } from '../../src/types';

type Client = {
  app: FirebaseApp;
  db: Firestore;
  store: ReturnType<typeof createTaskStore>;
  sink: ReturnType<typeof makeSink>;
  stop: () => void;
};

const makeSink = () => {
  const s = createStore(() => ({
    status: 'loading' as string,
    migrated: null as number | null,
    setSyncStatus(status: string) {
      s.setState({ status });
    },
    setMigratedCount(count: number | null) {
      s.setState({ migrated: count });
    },
  }));
  return s;
};

const EMAIL = 'sync@example.com';
const PASSWORD = 'correct horse battery';
// Unique per run: a long-lived emulator keeps the accounts earlier runs created.
const RUN = Date.now();
const FAST = { debounceMs: 15, maxWaitMs: 60, initialTimeoutMs: 5000 };
let counter = 0;
const clients: Client[] = [];
let uid = '';

async function signedInDb(
  create: boolean,
): Promise<{ app: FirebaseApp; db: Firestore; uid: string }> {
  const app = initializeApp({ apiKey: 'fake-key', projectId: 'demo-tasks' }, `app-${counter++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = create
    ? await createUserWithEmailAndPassword(auth, `${RUN}-${counter}-${EMAIL}`, PASSWORD)
    : await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    ignoreUndefinedProperties: true,
  });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, db, uid: cred.user.uid };
}

/** A second, independent client for the same account. */
async function sameUserDb(first: FirebaseApp): Promise<{ app: FirebaseApp; db: Firestore }> {
  const email = getAuth(first).currentUser!.email!;
  const app = initializeApp({ apiKey: 'fake-key', projectId: 'demo-tasks' }, `app-${counter++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, PASSWORD);
  const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    ignoreUndefinedProperties: true,
  });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, db };
}

async function client(
  app: FirebaseApp,
  db: Firestore,
  legacy?: Parameters<typeof startSync>[1]['legacy'],
): Promise<Client> {
  const store = createTaskStore();
  const sink = makeSink();
  const stop = startSync(uid, {
    db,
    store: store as unknown as SyncStore,
    status: sink as never,
    legacy: legacy ?? { read: () => null, clear: () => {} },
    ...FAST,
  });
  const c = { app, db, store, sink, stop };
  clients.push(c);
  await vi.waitFor(() => expect(sink.getState().status).toMatch(/ready|offline/), {
    timeout: 8000,
  });
  return c;
}

const mkOld = (id: string): Task => ({
  id,
  title: id,
  difficulty: 1,
  color: null,
  done: false,
  collapsed: false,
  tags: [],
  dueDate: null,
  repeat: null,
  plannedFor: null,
  parentId: null,
  childIds: [],
  createdAt: 1,
});

const titles = (c: Client) =>
  Object.values(c.store.getState().tasks)
    .map((t) => t.title)
    .sort();

beforeEach(() => {
  clients.length = 0;
});

afterEach(async () => {
  for (const c of clients) {
    c.stop();
    await terminate(c.db).catch(() => {});
    await deleteApp(c.app).catch(() => {});
  }
});

async function pair(): Promise<[Client, Client]> {
  const first = await signedInDb(true);
  uid = first.uid;
  const second = await sameUserDb(first.app);
  const a = await client(first.app, first.db);
  const b = await client(second.app, second.db);
  return [a, b];
}

describe('two clients, one account', () => {
  it('propagates adds, edits, subtasks and deletes', async () => {
    const [a, b] = await pair();

    const parent = a.store.getState().add({ title: 'Parent' });
    a.store.getState().add({ title: 'Child', parentId: parent });
    await vi.waitFor(() => expect(titles(b)).toEqual(['Child', 'Parent']), { timeout: 8000 });
    expect(b.store.getState().rootIds).toEqual([parent]);
    expect(b.store.getState().tasks[parent].childIds).toHaveLength(1);

    a.store.getState().update(parent, { title: 'Parent v2', tags: ['x'] });
    await vi.waitFor(() => expect(b.store.getState().tasks[parent].title).toBe('Parent v2'), {
      timeout: 8000,
    });

    // The other direction.
    const fromB = b.store.getState().add({ title: 'From B' });
    await vi.waitFor(() => expect(a.store.getState().tasks[fromB]?.title).toBe('From B'), {
      timeout: 8000,
    });

    a.store.getState().remove(parent);
    await vi.waitFor(() => expect(titles(b)).toEqual(['From B']), { timeout: 8000 });
    expect(b.store.getState().rootIds).toEqual([fromB]);
  });

  it('delivers a repeating task intact, and the copy spawned by completing it', async () => {
    const [a, b] = await pair();
    const repeat = { every: 'week', weekday: 0 } as const;
    const id = a.store.getState().add({ title: 'Water plants', dueDate: '2026-10-18', repeat });
    await vi.waitFor(() => expect(b.store.getState().tasks[id]?.repeat).toEqual(repeat), {
      timeout: 8000,
    });
    expect(b.store.getState().tasks[id]).toEqual(a.store.getState().tasks[id]);

    a.store.getState().toggle(id);
    const copyOf = (c: Client) =>
      Object.values(c.store.getState().tasks).find((t) => t.spawnedFrom === id);
    await vi.waitFor(() => expect(copyOf(b)).toBeDefined(), { timeout: 8000 });
    const copy = copyOf(a)!;
    expect(copyOf(b)).toEqual(copy);
    expect(copy).toMatchObject({ done: false, repeat, spawnedFrom: id });
    expect(copy.dueDate).not.toBe('2026-10-18');
    expect(b.store.getState().rootIds).toEqual([id, copy.id]);
    expect(b.store.getState().tasks[id].done).toBe(true);

    // Undoing on A removes the copy on B and reopens the original.
    a.store.getState().undoLast();
    await vi.waitFor(() => expect(copyOf(b)).toBeUndefined(), { timeout: 8000 });
    await vi.waitFor(() => expect(b.store.getState().tasks[id].done).toBe(false), {
      timeout: 8000,
    });
  });

  it('decodes a task document without repeat (written by an older client) as null', async () => {
    const first = await signedInDb(true);
    uid = first.uid;
    await setDoc(doc(first.db, `users/${uid}`), { rootIds: ['old'], schemaVersion: 3 });
    const { repeat: _omit, plannedFor: _omit2, ...legacy } = toTaskDoc({ ...mkOld('old') });
    await setDoc(doc(first.db, `users/${uid}/tasks/old`), legacy);
    const c = await client(first.app, first.db);
    expect(c.store.getState().tasks.old.repeat).toBeNull();
    expect(c.store.getState().tasks.old.plannedFor).toBeNull();
  });

  it('syncs completion history and keeps untouched task identities on the receiver', async () => {
    const [a, b] = await pair();
    const one = a.store.getState().add({ title: 'One' });
    const two = a.store.getState().add({ title: 'Two' });
    await vi.waitFor(() => expect(titles(b)).toEqual(['One', 'Two']), { timeout: 8000 });
    const untouched = b.store.getState().tasks[two];

    a.store.getState().toggle(one);
    await vi.waitFor(() => expect(b.store.getState().history).toHaveLength(1), { timeout: 8000 });
    expect(b.store.getState().tasks[one].done).toBe(true);
    expect(b.store.getState().tasks[two]).toBe(untouched);

    a.store.getState().toggle(one); // reopening removes the entry
    await vi.waitFor(() => expect(b.store.getState().history).toHaveLength(0), { timeout: 8000 });
  });

  it('does not echo remote changes back or lose concurrent edits to different tasks', async () => {
    const [a, b] = await pair();
    const x = a.store.getState().add({ title: 'X' });
    const y = a.store.getState().add({ title: 'Y' });
    await vi.waitFor(() => expect(titles(b)).toEqual(['X', 'Y']), { timeout: 8000 });

    a.store.getState().update(x, { title: 'X-a' });
    b.store.getState().update(y, { title: 'Y-b' });
    await vi.waitFor(
      () => {
        expect(a.store.getState().tasks[y].title).toBe('Y-b');
        expect(b.store.getState().tasks[x].title).toBe('X-a');
      },
      { timeout: 8000 },
    );
  });

  it('propagates tag colours, their removal, and undo, in both directions', async () => {
    const [a, b] = await pair();
    a.store.getState().setTagColor('work', '#C9B8F2');
    await vi.waitFor(() => expect(b.store.getState().tagColors).toEqual({ work: '#C9B8F2' }), {
      timeout: 8000,
    });

    b.store.getState().setTagColor('home', '#FFD3B6');
    await vi.waitFor(
      () => expect(a.store.getState().tagColors).toEqual({ work: '#C9B8F2', home: '#FFD3B6' }),
      { timeout: 8000 },
    );

    // Removing a colour really removes the key remotely (a plain merge would keep it).
    a.store.getState().setTagColor('work', null);
    await vi.waitFor(() => expect(b.store.getState().tagColors).toEqual({ home: '#FFD3B6' }), {
      timeout: 8000,
    });
    const meta = await getDoc(doc(a.db, 'users', uid));
    expect(meta.data()?.tagColors).toEqual({ home: '#FFD3B6' });
    expect(meta.data()?.schemaVersion).toBe(3);

    a.store.getState().undoLast();
    await vi.waitFor(
      () => expect(b.store.getState().tagColors).toEqual({ work: '#C9B8F2', home: '#FFD3B6' }),
      { timeout: 8000 },
    );
  });

  it('syncs settings both ways, without touching undo, and plannedFor with the task', async () => {
    const [a, b] = await pair();
    a.store.getState().setSetting({ todayView: true, dailyCapacity: 12 });
    await vi.waitFor(
      () =>
        expect(b.store.getState().settings).toEqual({
          todayView: true,
          dailyCapacity: 12,
          hints: {},
        }),
      { timeout: 8000 },
    );
    expect(b.store.getState().undo).toBeNull();

    b.store.getState().setSetting({ hints: { todayOffered: true } });
    await vi.waitFor(
      () => expect(a.store.getState().settings.hints).toEqual({ todayOffered: true }),
      {
        timeout: 8000,
      },
    );
    // Toggling it off on one device turns it off on the other, and the capacity is kept.
    a.store.getState().setSetting({ todayView: false });
    await vi.waitFor(() => expect(b.store.getState().settings.todayView).toBe(false), {
      timeout: 8000,
    });
    const meta = await getDoc(doc(a.db, 'users', uid));
    expect(meta.data()?.settings).toEqual({
      todayView: false,
      dailyCapacity: 12,
      hints: { todayOffered: true },
    });

    const id = a.store.getState().add({ title: 'Plan me', plannedFor: '2026-10-20' });
    await vi.waitFor(() => expect(b.store.getState().tasks[id]?.plannedFor).toBe('2026-10-20'), {
      timeout: 8000,
    });
    a.store.getState().plan(id, null);
    await vi.waitFor(() => expect(b.store.getState().tasks[id]?.plannedFor).toBeNull(), {
      timeout: 8000,
    });
  });

  it('writes settings to a fresh account even before any task exists', async () => {
    const [a] = await pair();
    a.store.getState().setSetting({ dailyCapacity: 5 });
    await vi.waitFor(
      async () => {
        const meta = await getDoc(doc(a.db, 'users', uid));
        expect(meta.data()).toMatchObject({ settings: { dailyCapacity: 5 }, rootIds: [] });
      },
      { timeout: 8000 },
    );
  });

  it('writes tagColors to a fresh account even before any task exists', async () => {
    const [a] = await pair();
    a.store.getState().setTagColor('first', '#B5E5CF');
    await vi.waitFor(
      async () => {
        const meta = await getDoc(doc(a.db, 'users', uid));
        expect(meta.data()).toMatchObject({ tagColors: { first: '#B5E5CF' }, rootIds: [] });
      },
      { timeout: 8000 },
    );
  });

  it('decodes schema 2 data: the old default blue becomes automatic', async () => {
    const first = await signedInDb(true);
    uid = first.uid;
    await setDoc(doc(first.db, 'users', uid), { rootIds: ['old'], schemaVersion: 2 });
    await setDoc(
      doc(first.db, 'users', uid, 'tasks', 'old'),
      toTaskDoc({ ...mkOld('old'), color: '#A9C6F5' }),
    );
    const c = await client(first.app, first.db);
    expect(c.store.getState().tasks.old.color).toBeNull();
    expect(c.store.getState().tagColors).toEqual({});
  });

  it('repairs a tree left inconsistent by concurrent edits (applier normalizes)', async () => {
    const [a, b] = await pair();
    const p = a.store.getState().add({ title: 'P' });
    await vi.waitFor(() => expect(titles(b)).toEqual(['P']), { timeout: 8000 });

    // A raw child document appears whose parent never lists it.
    const orphan: Task = {
      id: 'orphan',
      title: 'Orphan',
      difficulty: 1,
      color: null,
      done: false,
      collapsed: false,
      tags: [],
      dueDate: null,
      parentId: p,
      childIds: [],
      createdAt: 99,
    };
    await setDoc(doc(a.db, 'users', uid, 'tasks', 'orphan'), toTaskDoc(orphan));
    await vi.waitFor(() => expect(b.store.getState().tasks[p].childIds).toEqual(['orphan']), {
      timeout: 8000,
    });
  });
});

describe('initial load and migration', () => {
  it('loads an existing account into a fresh client', async () => {
    const [a] = await pair();
    a.store.getState().add({ title: 'Persisted' });
    await vi.waitFor(async () => {
      const snap = await getDocs(collection(a.db, 'users', uid, 'tasks'));
      expect(snap.size).toBe(1);
    });
    const other = await sameUserDb(a.app);
    const c = await client(other.app, other.db);
    expect(titles(c)).toEqual(['Persisted']);
  });

  it('uploads legacy local tasks once for an empty account, then clears them', async () => {
    const first = await signedInDb(true);
    uid = first.uid;
    const legacyStore = createTaskStore();
    legacyStore.getState().add({ title: 'Old 1' });
    legacyStore.getState().add({ title: 'Old 2' });
    const { tasks, rootIds, history, tagColors } = legacyStore.getState();
    const clear = vi.fn();
    const c = await client(first.app, first.db, {
      read: () => ({ tasks, rootIds, history, tagColors }),
      clear,
    });

    expect(titles(c)).toEqual(['Old 1', 'Old 2']);
    expect(c.sink.getState().migrated).toBe(2);
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(1), { timeout: 8000 });
    const snap = await getDocs(collection(first.db, 'users', uid, 'tasks'));
    expect(snap.size).toBe(2);
    const meta = await getDoc(doc(first.db, 'users', uid));
    expect(meta.data()?.rootIds).toEqual(rootIds);
  });

  it('does not migrate when the account already has data', async () => {
    const first = await signedInDb(true);
    uid = first.uid;
    await setDoc(doc(first.db, 'users', uid), { rootIds: [] });
    const read = vi.fn(() => null);
    await client(first.app, first.db, { read, clear: vi.fn() });
    expect(read).not.toHaveBeenCalled();
  });
});
