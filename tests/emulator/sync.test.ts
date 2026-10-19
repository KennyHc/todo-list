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
    ? await createUserWithEmailAndPassword(auth, `${counter}-${EMAIL}`, PASSWORD)
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

  it('repairs a tree left inconsistent by concurrent edits (applier normalizes)', async () => {
    const [a, b] = await pair();
    const p = a.store.getState().add({ title: 'P' });
    await vi.waitFor(() => expect(titles(b)).toEqual(['P']), { timeout: 8000 });

    // A raw child document appears whose parent never lists it.
    const orphan: Task = {
      id: 'orphan',
      title: 'Orphan',
      difficulty: 1,
      color: '#A9C6F5',
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
    const { tasks, rootIds, history } = legacyStore.getState();
    const clear = vi.fn();
    const c = await client(first.app, first.db, {
      read: () => ({ tasks, rootIds, history }),
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
