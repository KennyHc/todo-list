/**
 * Session flags shared by the landing page and the auth store. Kept out of deleteAccount.ts,
 * which imports Firestore and so belongs to the lazy app chunk.
 */

/** Set before a redirect re-authentication so the deletion resumes when the page comes back. */
export const DELETE_PENDING_KEY = 'delete-pending';
/** Set just before the post-deletion reload; the landing page shows a notice and clears it. */
export const ACCOUNT_DELETED_KEY = 'account-deleted';
export const ACCOUNT_DELETED_NOTICE = 'Your account and data were deleted.';

export const session = {
  set(key: string, value: string | null) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
};

export const isDeletePending = () => session.get(DELETE_PENDING_KEY) === '1';
export const clearDeletePending = () => session.set(DELETE_PENDING_KEY, null);
