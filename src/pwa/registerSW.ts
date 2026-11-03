import { registerSW } from 'virtual:pwa-register';
import { useUIStore } from '../store/ui';

const OFFLINE_FLAG = 'offline-ready-shown';
const PRELOAD_RELOAD_FLAG = 'reloaded-for-stale-chunk';
/** How often a long-lived tab (e.g. an installed app left open) checks for a new deploy. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

function offlineReadyShown(): boolean {
  try {
    return localStorage.getItem(OFFLINE_FLAG) === '1';
  } catch {
    return true; // can't remember, so don't nag
  }
}

/**
 * Whether the person has started using this page load. Until then an update can be applied by
 * reloading straight away: nothing they did can be interrupted.
 */
let interacted = false;
function watchFirstInteraction(): void {
  const mark = () => {
    interacted = true;
    for (const type of ['pointerdown', 'keydown'] as const) {
      window.removeEventListener(type, mark, true);
    }
  };
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, mark, { capture: true, passive: true });
  }
}

/**
 * After a deploy, an already-open page can ask for a lazy chunk the server no longer has. Reload
 * once to pick up the new build instead of leaving a broken dialog; the flag stops a loop.
 */
function reloadOnStaleChunk(): void {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      if (sessionStorage.getItem(PRELOAD_RELOAD_FLAG) === '1') return;
      sessionStorage.setItem(PRELOAD_RELOAD_FLAG, '1');
    } catch {
      return;
    }
    event.preventDefault();
    window.location.reload();
  });
  window.addEventListener('load', () => {
    try {
      sessionStorage.removeItem(PRELOAD_RELOAD_FLAG);
    } catch {
      /* ignore */
    }
  });
}

/**
 * With skipWaiting/clientsClaim a new deploy's worker takes control by itself. If this page was
 * already controlled by an older worker, it is now running an outdated build: reload straight
 * away while untouched, otherwise offer the reload. A first install (no previous controller) is
 * not an update and is ignored.
 */
function applyWhenNewWorkerTakesOver(): void {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!sw || !sw.controller) return;
  let handled = false;
  sw.addEventListener('controllerchange', () => {
    if (handled) return;
    handled = true;
    if (!interacted) {
      window.location.reload();
      return;
    }
    useUIStore.getState().showNotice('New version ready', {
      persistent: true,
      action: { label: 'Reload', run: () => window.location.reload() },
    });
  });
}

/**
 * Registers the service worker. A new version is applied at once if the page hasn't been used
 * yet (so opening or reloading always lands on the latest build), and otherwise offered through
 * a "New version ready · Reload" notice so it never reloads under someone's fingers.
 */
export function registerServiceWorker(): void {
  watchFirstInteraction();
  reloadOnStaleChunk();
  applyWhenNewWorkerTakesOver();

  const updateSW = registerSW({
    onNeedRefresh() {
      if (!interacted) {
        void updateSW(true);
        return;
      }
      useUIStore.getState().showNotice('New version ready', {
        persistent: true,
        action: { label: 'Reload', run: () => void updateSW(true) },
      });
    },
    onOfflineReady() {
      if (offlineReadyShown()) return;
      try {
        localStorage.setItem(OFFLINE_FLAG, '1');
      } catch {
        /* ignore */
      }
      useUIStore.getState().showNotice('Ready to work offline');
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => undefined);
      window.setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
    onRegisterError(error) {
      console.warn('Service worker registration failed', error);
    },
  });
}

/** Test seam: forget whether the page has been used. */
export function resetInteractionForTests(): void {
  interacted = false;
}
