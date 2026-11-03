import { beforeEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
  getRedirectResult: vi.fn(),
  listener: null as null | ((user: unknown) => void),
}));
const calls = vi.hoisted(() => [] as string[]);

vi.mock('firebase/auth', () => ({
  signInWithPopup: fb.signInWithPopup,
  signInWithRedirect: fb.signInWithRedirect,
  signOut: fb.signOut,
  getRedirectResult: fb.getRedirectResult,
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    fb.listener = cb;
    return () => {};
  },
}));
vi.mock('../sync/syncControl', () => ({
  flushActiveSync: vi.fn(async () => {
    calls.push('flush');
  }),
  stopActiveSync: vi.fn(() => {
    calls.push('stop');
  }),
}));

import { hasAuthHint, initAuth, isInAppBrowser, useAuthStore } from './auth';
import { resetTaskStore, useTaskStore } from './tasks';

const reset = () =>
  useAuthStore.setState({ status: 'loading', user: null, error: null, freshSignIn: false });

const fakeUser = {
  uid: 'u1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoURL: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  fb.getRedirectResult.mockResolvedValue(null);
  fb.signOut.mockImplementation(async () => {
    calls.push('signOut');
    fb.listener?.(null);
  });
  reset();
  resetTaskStore();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
});

describe('auth state', () => {
  it('maps the Firebase user and keeps the auth hint in sync', () => {
    initAuth();
    fb.listener!(fakeUser);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signedIn',
      user: { uid: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', photoURL: null },
    });
    expect(hasAuthHint()).toBe(true);
    fb.listener!(null);
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(hasAuthHint()).toBe(false);
  });

  it('stops sync before clearing the tasks when the user disappears', () => {
    initAuth();
    useTaskStore.getState().add({ title: 'x' });
    calls.length = 0;
    fb.listener!(null);
    expect(calls).toEqual(['stop']);
    expect(useTaskStore.getState().rootIds).toEqual([]);
  });
});

describe('signInWithGoogle', () => {
  it('uses the popup and flags a fresh sign-in', async () => {
    fb.signInWithPopup.mockResolvedValue({});
    await useAuthStore.getState().signInWithGoogle();
    expect(fb.signInWithPopup).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ freshSignIn: true, error: null });
  });

  it('shows no error when the popup is closed', async () => {
    fb.signInWithPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    await useAuthStore.getState().signInWithGoogle();
    expect(useAuthStore.getState().error).toBeNull();
    fb.signInWithPopup.mockRejectedValue({ code: 'auth/cancelled-popup-request' });
    await useAuthStore.getState().signInWithGoogle();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('surfaces other errors', async () => {
    fb.signInWithPopup.mockRejectedValue({ code: 'auth/network-request-failed' });
    await useAuthStore.getState().signInWithGoogle();
    expect(useAuthStore.getState().error).toMatch(/connection/i);
  });

  it('falls back to redirect when the popup is blocked', async () => {
    fb.signInWithPopup.mockRejectedValue({ code: 'auth/popup-blocked' });
    fb.signInWithRedirect.mockResolvedValue(undefined);
    await useAuthStore.getState().signInWithGoogle();
    expect(fb.signInWithRedirect).toHaveBeenCalled();
    expect(useAuthStore.getState().error).toBeNull();
    expect(hasAuthHint()).toBe(true); // so the splash, not the landing page, shows on return
  });

  it('uses the popup in a browser tab, including touch devices', async () => {
    window.matchMedia = vi.fn((q: string) => ({ matches: q === '(pointer: coarse)' })) as never;
    fb.signInWithPopup.mockResolvedValue({ user: fakeUser });
    await useAuthStore.getState().signInWithGoogle();
    expect(window.matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
    expect(fb.signInWithPopup).toHaveBeenCalled();
    expect(fb.signInWithRedirect).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('auth-redirecting')).toBeNull();
  });

  it('redirects without a popup when installed (display-mode: standalone)', async () => {
    window.matchMedia = vi.fn((q: string) => ({
      matches: q === '(display-mode: standalone)',
    })) as never;
    fb.signInWithRedirect.mockResolvedValue(undefined);
    await useAuthStore.getState().signInWithGoogle();
    expect(fb.signInWithRedirect).toHaveBeenCalled();
    expect(fb.signInWithRedirect.mock.calls[0]).toHaveLength(3);
    expect(fb.signInWithPopup).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('auth-redirecting')).toBe('1');
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('redirects when installed on iOS (navigator.standalone)', async () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    try {
      fb.signInWithRedirect.mockResolvedValue(undefined);
      await useAuthStore.getState().signInWithGoogle();
      expect(fb.signInWithRedirect).toHaveBeenCalled();
      expect(fb.signInWithPopup).not.toHaveBeenCalled();
      expect(hasAuthHint()).toBe(true);
    } finally {
      delete (navigator as { standalone?: boolean }).standalone;
    }
  });

  it('clears the redirect marker when the installed redirect fails', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    fb.signInWithRedirect.mockRejectedValue({ code: 'auth/network-request-failed' });
    await useAuthStore.getState().signInWithGoogle();
    expect(sessionStorage.getItem('auth-redirecting')).toBeNull();
    expect(useAuthStore.getState().error).toMatch(/connection/i);
  });

  it('finishes an installed-app redirect on return', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    fb.signInWithRedirect.mockResolvedValue(undefined);
    await useAuthStore.getState().signInWithGoogle();
    fb.getRedirectResult.mockResolvedValue({ user: fakeUser });
    initAuth();
    expect(fb.getRedirectResult).toHaveBeenCalled();
    await vi.waitFor(() => expect(useAuthStore.getState().freshSignIn).toBe(true));
  });

  it('handles the redirect result on startup when a redirect sign-in is pending', async () => {
    sessionStorage.setItem('auth-redirecting', '1');
    fb.getRedirectResult.mockResolvedValue({ user: fakeUser });
    initAuth();
    await vi.waitFor(() => expect(useAuthStore.getState().freshSignIn).toBe(true));
    expect(sessionStorage.getItem('auth-redirecting')).toBeNull();
  });

  it('does not fetch a redirect result on a normal load', () => {
    // getRedirectResult pulls in Google's iframe script; a slow or blocked script used to keep
    // every page load on the splash, so it must only run when a redirect is in flight.
    initAuth();
    expect(fb.getRedirectResult).not.toHaveBeenCalled();
  });

  it('passes the popup/redirect resolver explicitly to sign-in calls', async () => {
    fb.signInWithPopup.mockResolvedValue({});
    await useAuthStore.getState().signInWithGoogle();
    expect(fb.signInWithPopup.mock.calls[0]).toHaveLength(3);
  });
});

describe('signOut', () => {
  it('flushes, stops sync, signs out, then resets the tasks', async () => {
    initAuth();
    fb.listener!(fakeUser);
    useTaskStore.getState().add({ title: 'keep until flushed' });
    useTaskStore.setState({ editingId: 'x' });
    calls.length = 0;
    await useAuthStore.getState().signOut();
    expect(calls.slice(0, 3)).toEqual(['flush', 'stop', 'signOut']);
    const s = useTaskStore.getState();
    expect(s.rootIds).toEqual([]);
    expect(s.editingId).toBeNull();
    expect(s.undo).toBeNull();
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(hasAuthHint()).toBe(false);
  });

  it('keeps UI prefs', async () => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('ui-v1', '{}');
    initAuth();
    fb.listener!(fakeUser);
    await useAuthStore.getState().signOut();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('ui-v1')).toBe('{}');
  });
});

describe('isInAppBrowser', () => {
  it('flags embedded app browsers that Google blocks', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit Instagram 300.0')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/400.0]')).toBe(true);
  });
  it('allows regular mobile browsers', () => {
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1',
      ),
    ).toBe(false);
    expect(
      isInAppBrowser('Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Mobile Safari/537.36'),
    ).toBe(false);
  });
});
