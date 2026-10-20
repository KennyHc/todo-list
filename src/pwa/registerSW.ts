import { registerSW } from 'virtual:pwa-register';
import { useUIStore } from '../store/ui';

const OFFLINE_FLAG = 'offline-ready-shown';

function offlineReadyShown(): boolean {
  try {
    return localStorage.getItem(OFFLINE_FLAG) === '1';
  } catch {
    return true; // can't remember, so don't nag
  }
}

/** Registers the service worker and surfaces update / offline-ready notices. */
export function registerServiceWorker(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
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
    onRegisterError(error) {
      console.warn('Service worker registration failed', error);
    },
  });
}
