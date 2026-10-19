import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  memoryLocalCache,
  setDoc,
  setLogLevel,
  terminate,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';

setLogLevel('silent'); // denied writes are expected here and the SDK logs each one

let env: RulesTestEnvironment;

const task = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: 'Write rules',
  difficulty: 3,
  color: null,
  done: false,
  collapsed: false,
  tags: ['a'],
  dueDate: null,
  parentId: null,
  childIds: [],
  createdAt: 1,
  ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tasks',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

// Plain modular clients: the emulator accepts a mock ID token, so no sign-in is needed.
const opened: { app: FirebaseApp; db: Firestore }[] = [];
let n = 0;
function client(uid: string | null): Firestore {
  const app = initializeApp({ projectId: 'demo-tasks' }, `rules-${n++}`);
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, '127.0.0.1', 8080, uid ? { mockUserToken: { sub: uid } } : {});
  opened.push({ app, db });
  return db;
}
afterEach(async () => {
  for (const { app, db } of opened.splice(0)) {
    await terminate(db).catch(() => {});
    await deleteApp(app).catch(() => {});
  }
});

const alice = () => client('alice');
const bob = () => client('bob');
const anon = () => client(null);

describe('owner access', () => {
  it('reads and writes their own meta, tasks and history', async () => {
    const db = alice();
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { rootIds: ['t1'], schemaVersion: 2 }));
    await assertSucceeds(setDoc(doc(db, 'users/alice/tasks/t1'), task('t1')));
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/history/h1'), { id: 'h1', completedAt: 5, title: 'x' }),
    );
    await assertSucceeds(getDoc(doc(db, 'users/alice')));
    await assertSucceeds(getDoc(doc(db, 'users/alice/tasks/t1')));
    await assertSucceeds(getDocs(collection(db, 'users/alice/tasks')));
    await assertSucceeds(setDoc(doc(db, 'users/alice/tasks/t1'), task('t1', { done: true })));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/tasks/t1')));
  });
});

describe('isolation', () => {
  beforeEach(async () => {
    // Seed through the owner's own (rule-checked) access: no admin client needed.
    const db = alice();
    await setDoc(doc(db, 'users/alice'), { rootIds: ['t1'] });
    await setDoc(doc(db, 'users/alice/tasks/t1'), task('t1'));
    await setDoc(doc(db, 'users/alice/history/h1'), { id: 'h1', completedAt: 5 });
  });

  it("another user cannot read or write someone else's data", async () => {
    const db = bob();
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(getDoc(doc(db, 'users/alice/tasks/t1')));
    await assertFails(getDocs(collection(db, 'users/alice/tasks')));
    await assertFails(getDocs(collection(db, 'users/alice/history')));
    await assertFails(setDoc(doc(db, 'users/alice/tasks/t2'), task('t2')));
    await assertFails(setDoc(doc(db, 'users/alice/tasks/t1'), task('t1', { title: 'pwned' })));
    await assertFails(setDoc(doc(db, 'users/alice'), { rootIds: [] }));
    await assertFails(deleteDoc(doc(db, 'users/alice/tasks/t1')));
  });

  it('unauthenticated clients are denied everything', async () => {
    const db = anon();
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(getDoc(doc(db, 'users/alice/tasks/t1')));
    await assertFails(getDocs(collection(db, 'users/alice/tasks')));
    await assertFails(setDoc(doc(db, 'users/alice/tasks/t2'), task('t2')));
    await assertFails(deleteDoc(doc(db, 'users/alice/history/h1')));
  });

  it('denies every path outside users/{uid}', async () => {
    await assertFails(setDoc(doc(alice(), 'other/doc'), { a: 1 }));
    await assertFails(getDoc(doc(alice(), 'users/alice/other/doc')));
  });
});

describe('task validation', () => {
  const write = (data: Record<string, unknown>, id = 't1') =>
    setDoc(doc(alice(), `users/alice/tasks/${id}`), data);

  it('accepts a valid task and the boundary values', async () => {
    await assertSucceeds(write(task('t1', { difficulty: 1, title: 'x'.repeat(500) })));
    await assertSucceeds(write(task('t1', { difficulty: 5, tags: Array(20).fill('t') })));
  });

  it('rejects an out-of-range or non-integer difficulty', async () => {
    await assertFails(write(task('t1', { difficulty: 9 })));
    await assertFails(write(task('t1', { difficulty: 0 })));
    await assertFails(write(task('t1', { difficulty: 2.5 })));
    await assertFails(write(task('t1', { difficulty: '3' })));
  });

  it('rejects an over-long or non-string title', async () => {
    await assertFails(write(task('t1', { title: 'x'.repeat(501) })));
    await assertFails(write(task('t1', { title: 5 })));
  });

  it('rejects bad tags, done and ids', async () => {
    await assertFails(write(task('t1', { tags: Array(21).fill('t') })));
    await assertFails(write(task('t1', { tags: 'a' })));
    await assertFails(write(task('t1', { done: 'yes' })));
    await assertFails(write(task('someone-else')));
  });

  it('requires rootIds on the meta document to be a list', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { rootIds: 'a' }));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { rootIds: [] }));
  });

  it('allows tagColors on the meta document only as a map', async () => {
    const meta = (extra: Record<string, unknown>) =>
      setDoc(doc(alice(), 'users/alice'), { rootIds: [], schemaVersion: 3, ...extra });
    await assertSucceeds(meta({ tagColors: { work: '#C9B8F2', home: '#FFD3B6' } }));
    await assertSucceeds(meta({ tagColors: {} }));
    await assertSucceeds(meta({})); // absent is fine (schema 2 clients)
    await assertFails(meta({ tagColors: 'red' }));
    await assertFails(meta({ tagColors: ['#C9B8F2'] }));
    await assertFails(meta({ tagColors: null }));
    // A merge that only touches tagColors still has to leave a valid document.
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice'), { tagColors: { a: '#fff' } }, { merge: true }),
    );
    await assertFails(setDoc(doc(alice(), 'users/alice'), { tagColors: 'x' }, { merge: true }));
    // Someone else's meta stays off limits.
    await assertFails(setDoc(doc(bob(), 'users/alice'), { rootIds: [], tagColors: {} }));
  });

  it('accepts tasks with a null (automatic) colour or an explicit one', async () => {
    await assertSucceeds(write(task('t1', { color: null })));
    await assertSucceeds(write(task('t1', { color: '#C9B8F2' })));
  });
});
