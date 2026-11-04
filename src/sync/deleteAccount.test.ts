import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const log = (name: string) => calls.push(name);

const fb = vi.hoisted(() => ({
  batches: [] as { size: number }[],
  listings: [] as string[][],
  getDocsError: null as unknown,
  deleteUserError: null as unknown,
}));

vi.mock('firebase/auth', () => ({
  deleteUser: vi.fn(async () => {
    log('deleteUser');
    if (fb.deleteUserError) throw fb.deleteUserError;
  }),
  reauthenticateWithPopup: vi.fn(),
  reauthenticateWithRedirect: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDocsFromServer: vi.fn(async (col: { path: string }) => {
    log(`list:${col.path.split('/').pop()}`);
    if (fb.getDocsError) throw fb.getDocsError;
    // Each call pair (tasks, history) consumes one scripted listing, all returned as "tasks".
    const isTasks = col.path.endsWith('/tasks');
    const ids = isTasks ? (fb.listings[0] ?? []) : [];
    if (!isTasks) fb.listings.shift();
    return { docs: ids.map((id) => ({ ref: { path: `${col.path}/${id}` } })) };
  }),
  writeBatch: () => {
    let size = 0;
    return {
      delete: () => void size++,
      commit: async () => {
        log('batch');
        fb.batches.push({ size });
      },
    };
  },
  deleteDoc: vi.fn(async () => log('meta')),
  terminate: vi.fn(async () => log('terminate')),
  clearIndexedDbPersistence: vi.fn(async () => log('clearCache')),
}));

vi.mock('./firestoreSync', () => ({
  stopActiveSync: vi.fn(() => log('stopSync')),
  startSync: vi.fn(() => {
    log('startSync');
    return () => {};
  }),
}));

vi.mock('../store/tasks', () => ({ resetTaskStore: vi.fn(() => log('resetStore')) }));

import { deleteUser, reauthenticateWithPopup, reauthenticateWithRedirect } from 'firebase/auth';
import { startSync } from './firestoreSync';
import { deleteAccount, DeleteAccountError } from './deleteAccount';

const ids = (n: number, prefix = 't') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const user = { uid: 'u1' };
const auth = { currentUser: user } as never;
const db = {} as never;
const reload = vi.fn(() => log('reload'));

const run = (extra: Partial<Parameters<typeof deleteAccount>[0]> = {}) =>
  deleteAccount({
    auth,
    db,
    reauthenticate: async () => void log('reauth'),
    reload,
    ...extra,
  });

beforeEach(() => {
  calls.length = 0;
  fb.batches = [];
  fb.listings = [];
  fb.getDocsError = null;
  fb.deleteUserError = null;
  vi.mocked(deleteUser).mockClear();
  vi.mocked(startSync).mockClear();
  reload.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(reauthenticateWithPopup).mockReset();
  vi.mocked(reauthenticateWithRedirect).mockReset();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
});

describe('deleteAccount', () => {
  it('runs reauth, stop sync, chunked deletes, meta, deleteUser, cleanup in order', async () => {
    fb.listings = [ids(1000), []];
    await run();
    expect(fb.batches.map((b) => b.size)).toEqual([450, 450, 100]);
    const order = calls.filter((c) => !c.startsWith('list:'));
    expect(order).toEqual([
      'reauth',
      'stopSync',
      'batch',
      'batch',
      'batch',
      'meta',
      'deleteUser',
      'resetStore',
      'terminate',
      'clearCache',
      'reload',
    ]);
    expect(sessionStorage.getItem('account-deleted')).toBe('1');
    expect(startSync).not.toHaveBeenCalled();
  });

  it('aborts silently with no deletes when the reauth popup is cancelled', async () => {
    const reauthenticate = vi.fn().mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    const error = await run({ reauthenticate }).catch((e) => e);
    expect(error).toBeInstanceOf(DeleteAccountError);
    expect(error.code).toBe('cancelled');
    expect(calls).toEqual([]);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('explains a user-mismatch', async () => {
    const reauthenticate = vi.fn().mockRejectedValue({ code: 'auth/user-mismatch' });
    await expect(run({ reauthenticate })).rejects.toMatchObject({
      code: 'wrong-account',
      message: "Please choose the same Google account you're signed in with.",
    });
    expect(calls).toEqual([]);
  });

  it('reports an offline server and restarts sync, deleting nothing', async () => {
    fb.getDocsError = { code: 'unavailable' };
    await expect(run()).rejects.toMatchObject({
      code: 'offline',
      message: "You're offline. Connect to delete your account.",
    });
    expect(calls).toContain('stopSync');
    expect(calls).not.toContain('batch');
    expect(calls).not.toContain('meta');
    expect(startSync).toHaveBeenCalledWith('u1', { db });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reports a partial failure and keeps the account', async () => {
    fb.listings = [ids(3), []];
    // The meta delete rejects: data may be partly gone.
    const firestore = await import('firebase/firestore');
    vi.mocked(firestore.deleteDoc).mockRejectedValueOnce({ code: 'permission-denied' });
    await expect(run()).rejects.toMatchObject({
      code: 'delete-incomplete',
      message: "Couldn't delete everything. Please try again.",
    });
    expect(startSync).toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('reports a failed account removal after the data is gone, and a retry finishes it', async () => {
    fb.listings = [ids(2), []];
    fb.deleteUserError = { code: 'auth/network-request-failed' };
    await expect(run()).rejects.toMatchObject({
      code: 'account-not-removed',
      message: "Your data was deleted, but the account couldn't be removed. Try again.",
    });
    expect(calls).toContain('meta');
    expect(calls).toContain('resetStore');
    expect(reload).not.toHaveBeenCalled();
    expect(startSync).not.toHaveBeenCalled();

    // Retry: nothing left to delete, straight to removing the account.
    calls.length = 0;
    fb.batches = [];
    fb.listings = [[], []];
    fb.deleteUserError = null;
    await run();
    expect(fb.batches).toEqual([]);
    expect(calls.filter((c) => !c.startsWith('list:'))).toEqual([
      'reauth',
      'stopSync',
      'meta',
      'deleteUser',
      'resetStore',
      'terminate',
      'clearCache',
      'reload',
    ]);
  });

  it('loops when documents reappear, up to three passes', async () => {
    fb.listings = [ids(2), ids(1, 'late'), []];
    await run();
    expect(fb.batches.map((b) => b.size)).toEqual([2, 1]);
    expect(calls.filter((c) => c === 'meta')).toHaveLength(2);
    expect(reload).toHaveBeenCalled();
  });

  it('gives up with an incomplete error when documents keep reappearing', async () => {
    // Every listing has something, including the final check.
    for (let i = 0; i < 4; i++) fb.listings.push(ids(1, `x${i}`));
    await expect(run()).rejects.toMatchObject({ code: 'delete-incomplete' });
    expect(fb.batches).toHaveLength(3);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(startSync).toHaveBeenCalled();
  });

  it('clears the account keys from localStorage but keeps theme and ui-v1', async () => {
    localStorage.setItem('auth-hint', '1');
    localStorage.setItem('tasks-v1', '{}');
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('ui-v1', '{}');
    fb.listings = [[], []];
    await run();
    expect(localStorage.getItem('auth-hint')).toBeNull();
    expect(localStorage.getItem('tasks-v1')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('ui-v1')).toBe('{}');
  });

  it('refuses when nobody is signed in', async () => {
    await expect(run({ auth: { currentUser: null } as never })).rejects.toMatchObject({
      code: 'not-signed-in',
    });
  });
});

describe('default re-authentication', () => {
  // Uses the real reauthenticateWithGoogle (no `reauthenticate` override).
  const runDefault = () => deleteAccount({ auth, db, reload });
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('uses the popup in a browser tab, then deletes', async () => {
    vi.mocked(reauthenticateWithPopup).mockResolvedValue({} as never);
    await runDefault();
    expect(reauthenticateWithPopup).toHaveBeenCalled();
    expect(reauthenticateWithRedirect).not.toHaveBeenCalled();
    expect(calls).toContain('deleteUser');
    expect(sessionStorage.getItem('delete-pending')).toBeNull();
  });

  it('falls back to the redirect in a browser tab when the popup is blocked', async () => {
    vi.mocked(reauthenticateWithPopup).mockRejectedValue({ code: 'auth/popup-blocked' });
    vi.mocked(reauthenticateWithRedirect).mockReturnValue(new Promise<never>(() => {}));
    void runDefault();
    await tick();
    expect(reauthenticateWithRedirect).toHaveBeenCalled();
    expect(sessionStorage.getItem('delete-pending')).toBe('1');
    expect(calls).toEqual([]);
  });

  it.each([
    [
      'display-mode: standalone',
      () => void (window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never),
    ],
    [
      'iOS navigator.standalone',
      () =>
        void Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }),
    ],
  ])(
    'redirects straight away when installed (%s), deleting nothing yet',
    async (_name, install) => {
      install();
      vi.mocked(reauthenticateWithRedirect).mockReturnValue(new Promise<never>(() => {})); // navigates away
      void runDefault();
      await tick();
      expect(reauthenticateWithPopup).not.toHaveBeenCalled();
      expect(reauthenticateWithRedirect).toHaveBeenCalled();
      expect(sessionStorage.getItem('delete-pending')).toBe('1');
      expect(calls).toEqual([]);
      Reflect.deleteProperty(navigator, 'standalone');
    },
  );

  it('clears the pending flag and reports a failure when the installed redirect fails', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    vi.mocked(reauthenticateWithRedirect).mockRejectedValue({
      code: 'auth/network-request-failed',
    });
    await expect(runDefault()).rejects.toMatchObject({ code: 'reauth-failed' });
    expect(sessionStorage.getItem('delete-pending')).toBeNull();
    expect(calls).toEqual([]);
  });
});
