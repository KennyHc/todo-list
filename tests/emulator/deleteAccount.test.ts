import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  initializeFirestore,
  memoryLocalCache,
  setDoc,
  terminate,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { toHistoryDoc, toTaskDoc } from '../../src/sync/schema';
import type { Task } from '../../src/types';

// The browser bootstrap needs IndexedDB and Vite env; this suite injects its own clients.
vi.mock('../../src/lib/firebase', () => ({ auth: {}, db: {}, googleProvider: {} }));

import { deleteAccount } from '../../src/sync/deleteAccount';

const PROJECT = 'demo-tasks';
const RUN = Date.now();
const PASSWORD = 'correct horse battery';
const apps: FirebaseApp[] = [];
let counter = 0;

type Client = { app: FirebaseApp; auth: Auth; db: Firestore; uid: string; email: string };

async function newClient(label: string): Promise<Client> {
  const app = initializeApp({ apiKey: 'fake-key', projectId: PROJECT }, `del-${RUN}-${counter++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const email = `${label}-${RUN}@example.com`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    ignoreUndefinedProperties: true,
  });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, auth, db, uid: cred.user.uid, email };
}

const mkTask = (id: string): Task => ({
  id,
  title: id,
  difficulty: 1,
  color: null,
  done: false,
  collapsed: false,
  tags: [],
  dueDate: null,
  repeat: null,
  parentId: null,
  childIds: [],
  createdAt: 1,
});

async function seed({ db, uid }: Client, tasks: number, history: number) {
  await setDoc(doc(db, 'users', uid), { rootIds: [], schemaVersion: 3 });
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
  for (let i = 0; i < tasks; i++) {
    const id = `t${i}`;
    ops.push((b) => b.set(doc(db, 'users', uid, 'tasks', id), toTaskDoc(mkTask(id))));
  }
  for (let i = 0; i < history; i++) {
    const entry = { id: `h${i}`, taskId: 't0', title: 'done', completedAt: 1000 + i } as never;
    ops.push((b) => b.set(doc(db, 'users', uid, 'history', `h${i}`), toHistoryDoc(entry, i)));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

/** Reads through the emulator's admin bypass, so rules and auth state can't hide anything. */
async function adminCount(path: string): Promise<number> {
  let count = 0;
  let token = '';
  do {
    const res = await fetch(
      `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}?pageSize=100${token}`,
      { headers: { Authorization: 'Bearer owner' } },
    );
    const body = (await res.json()) as { documents?: unknown[]; nextPageToken?: string };
    count += body.documents?.length ?? 0;
    token = body.nextPageToken ? `&pageToken=${encodeURIComponent(body.nextPageToken)}` : '';
  } while (token);
  return count;
}

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a).catch(() => {})));
});

describe('deleteAccount against the emulators', () => {
  it('removes one user, their data and their auth record, leaving another user intact', async () => {
    const a = await newClient('del-a');
    const b = await newClient('del-b');
    await seed(a, 500, 6); // 506 documents: more than one batch
    await seed(b, 5, 2);
    expect(await adminCount(`users/${a.uid}/tasks`)).toBe(500);

    const events: string[] = [];
    await deleteAccount({
      auth: a.auth,
      db: a.db,
      reauthenticate: async () => void events.push('reauth'),
      reload: () => void events.push('reload'),
    });
    expect(events).toEqual(['reauth', 'reload']);

    // A: every document, including the meta doc, is gone.
    expect(await adminCount(`users/${a.uid}/tasks`)).toBe(0);
    expect(await adminCount(`users/${a.uid}/history`)).toBe(0);
    expect(await adminCount('users')).toBeGreaterThan(0); // B's meta doc is still listed
    const metaRes = await fetch(
      `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/users/${a.uid}`,
      { headers: { Authorization: 'Bearer owner' } },
    );
    expect(metaRes.status).toBe(404);

    // A: the auth user no longer exists.
    const fresh = initializeApp({ apiKey: 'fake-key', projectId: PROJECT }, `del-check-${RUN}`);
    apps.push(fresh);
    const freshAuth = getAuth(fresh);
    connectAuthEmulator(freshAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    await expect(signInWithEmailAndPassword(freshAuth, a.email, PASSWORD)).rejects.toMatchObject({
      code: 'auth/user-not-found',
    });

    // B: untouched, and still signed in with their data readable.
    expect(await adminCount(`users/${b.uid}/tasks`)).toBe(5);
    expect(await adminCount(`users/${b.uid}/history`)).toBe(2);
    expect(b.auth.currentUser?.uid).toBe(b.uid);
    expect((await getDocs(collection(b.db, 'users', b.uid, 'tasks'))).size).toBe(5);
    await terminate(b.db).catch(() => {});
    await terminate(a.db).catch(() => {});
  });

  it('is idempotent: running it again after the data is gone only needs the account', async () => {
    const c = await newClient('del-c');
    await seed(c, 3, 1);
    // Simulate a previous run that removed the data but failed to remove the user.
    const { deleteDoc, getDocs: list } = await import('firebase/firestore');
    for (const sub of ['tasks', 'history']) {
      const snap = await list(collection(c.db, 'users', c.uid, sub));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }
    await deleteDoc(doc(c.db, 'users', c.uid));
    await deleteAccount({
      auth: c.auth,
      db: c.db,
      reauthenticate: async () => {},
      reload: () => {},
    });
    expect(c.auth.currentUser).toBeNull();
  });
});
