import {
  deleteUser,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  terminate,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { auth as defaultAuth, googleProvider, popupRedirect } from '../lib/firebase';
import { db as defaultDb } from '../lib/firestore';
import { useAiDraft } from '../store/aiDraft';
import { isStandalone } from '../store/auth';
import { useImportDraft } from '../store/importDraft';
import { resetTaskStore } from '../store/tasks';
import {
  clearDeletePending,
  DELETE_PENDING_KEY,
  session,
  ACCOUNT_DELETED_KEY,
} from './deletePending';
import { startSync, stopActiveSync } from './firestoreSync';

export {
  ACCOUNT_DELETED_KEY,
  ACCOUNT_DELETED_NOTICE,
  clearDeletePending,
  DELETE_PENDING_KEY,
  isDeletePending,
} from './deletePending';

const BATCH_LIMIT = 450;
const MAX_PASSES = 3;

export type DeleteAccountErrorCode =
  | 'cancelled'
  | 'not-signed-in'
  | 'wrong-account'
  | 'reauth-failed'
  | 'offline'
  | 'delete-incomplete'
  | 'account-not-removed';

const MESSAGES: Record<DeleteAccountErrorCode, string> = {
  cancelled: '',
  'not-signed-in': 'You need to be signed in to delete your account.',
  'wrong-account': "Please choose the same Google account you're signed in with.",
  'reauth-failed': "Couldn't confirm it's you. Please try again.",
  offline: "You're offline. Connect to delete your account.",
  'delete-incomplete': "Couldn't delete everything. Please try again.",
  'account-not-removed': "Your data was deleted, but the account couldn't be removed. Try again.",
};

export class DeleteAccountError extends Error {
  readonly code: DeleteAccountErrorCode;
  constructor(code: DeleteAccountErrorCode, options?: { cause?: unknown }) {
    super(MESSAGES[code], options);
    this.name = 'DeleteAccountError';
    this.code = code;
  }
}

export type DeleteAccountOptions = {
  db?: Firestore;
  auth?: Auth;
  /**
   * Re-authenticates the signed-in user. The default opens the Google popup (a redirect that
   * resumes the deletion afterwards when installed or when the popup is blocked). Tests and the redirect resume replace it.
   */
  reauthenticate?: (user: User) => Promise<void>;
  /** Runs once everything is gone. Defaults to a full page reload. */
  reload?: () => void;
};

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

const CANCEL_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

/**
 * Must be called synchronously from the click so the browser allows the popup. Installed apps
 * redirect straight away, like sign-in (#37): their popup opens a separate browser context that
 * cannot hand the result back. The redirect sets DELETE_PENDING_KEY so `initAuth` resumes the
 * deletion when the page comes back.
 */
async function reauthenticateWithGoogle(user: User): Promise<void> {
  if (!isStandalone()) {
    try {
      await reauthenticateWithPopup(user, googleProvider, popupRedirect);
      return;
    } catch (error) {
      if (codeOf(error) !== 'auth/popup-blocked') throw error;
    }
  }
  session.set(DELETE_PENDING_KEY, '1');
  try {
    await reauthenticateWithRedirect(user, googleProvider, popupRedirect); // navigates away
  } catch (redirectError) {
    clearDeletePending();
    throw redirectError;
  }
}

async function reauthenticate(user: User, run: (user: User) => Promise<void>): Promise<void> {
  try {
    await run(user);
  } catch (error) {
    const code = codeOf(error);
    if (code && CANCEL_CODES.has(code)) throw new DeleteAccountError('cancelled');
    if (code === 'auth/user-mismatch') throw new DeleteAccountError('wrong-account');
    throw new DeleteAccountError('reauth-failed', { cause: error });
  }
}

const isOffline = (error: unknown) =>
  codeOf(error) === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine);

const fail = (error: unknown): never => {
  throw error instanceof DeleteAccountError
    ? error
    : new DeleteAccountError('delete-incomplete', { cause: error });
};

/** Deletes everything under users/{uid}: subcollections in chunked batches, then the meta doc. */
async function deleteUserData(db: Firestore, uid: string): Promise<void> {
  const metaRef = doc(db, 'users', uid);
  const list = async (): Promise<DocumentReference[]> => {
    const [tasks, history] = await Promise.all([
      getDocsFromServer(collection(db, 'users', uid, 'tasks')),
      getDocsFromServer(collection(db, 'users', uid, 'history')),
    ]);
    return [...tasks.docs, ...history.docs].map((d) => d.ref);
  };

  // Another device may write while this runs, so look again after each pass.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // Nothing is deleted before the first listing, so an unreachable server is simply "offline".
    const refs = await list().catch((error) =>
      pass === 0 && isOffline(error) ? fail(new DeleteAccountError('offline')) : fail(error),
    );
    if (pass > 0 && refs.length === 0) return;
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc(metaRef);
  }
  if ((await list()).length > 0) throw new Error('documents remain');
}

/** Forgets everything this browser kept about the account. Keeps `theme` and `ui-v1`. */
function cleanUpLocally() {
  resetTaskStore();
  useAiDraft.getState().reset();
  useImportDraft.getState().reset();
  try {
    localStorage.removeItem('auth-hint');
    localStorage.removeItem('tasks-v1');
  } catch {
    /* storage unavailable */
  }
}

/**
 * Permanently deletes the signed-in account: re-authenticates, stops sync, deletes all cloud
 * data, deletes the auth user, clears local state and reloads. Rejects with a
 * {@link DeleteAccountError}. Retrying after a failure is safe: it is idempotent, and once the
 * data is gone it goes straight to removing the account.
 */
export async function deleteAccount(opts: DeleteAccountOptions = {}): Promise<void> {
  const auth = opts.auth ?? defaultAuth;
  const db = opts.db ?? defaultDb;
  const user = auth.currentUser;
  if (!user) throw new DeleteAccountError('not-signed-in');
  const uid = user.uid;

  // 1. Re-authenticate (no await before this: the popup needs the click's user activation).
  await reauthenticate(user, opts.reauthenticate ?? reauthenticateWithGoogle);

  // 2. Stop sync so neither the listeners nor the writer can recreate documents.
  stopActiveSync();

  // 3. Delete the data.
  try {
    await deleteUserData(db, uid);
  } catch (error) {
    // The data may be partly gone; resume syncing so the app reflects what the server holds.
    startSync(uid, { db });
    return fail(error);
  }

  // 4. Delete the auth user.
  try {
    await deleteUser(user);
  } catch (error) {
    // The cloud data is gone, so show an empty list and leave sync stopped; a retry only needs
    // to remove the account.
    resetTaskStore();
    throw new DeleteAccountError('account-not-removed', { cause: error });
  }

  // 5. Clean up and reload for a fresh SDK state.
  cleanUpLocally();
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    /* best effort */
  }
  session.set(ACCOUNT_DELETED_KEY, '1');
  (opts.reload ?? (() => window.location.reload()))();
}

/** Continues a deletion after the redirect re-authentication returned. Resolves the error, if any. */
export async function resumeDeleteAccount(): Promise<DeleteAccountError | null> {
  clearDeletePending();
  try {
    await deleteAccount({ reauthenticate: async () => {} });
    return null;
  } catch (error) {
    return error instanceof DeleteAccountError
      ? error
      : new DeleteAccountError('delete-incomplete');
  }
}
