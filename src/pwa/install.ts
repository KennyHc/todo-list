import { isInAppBrowser } from '../store/auth';

/** The (non-standard) event Chromium fires when the app is installable. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Subscribe to changes in `canPromptInstall()`. Returns an unsubscribe function. */
export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Start listening for the install prompt. Call once, as early as possible. */
export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export const canPromptInstall = (): boolean => deferred !== null;

/** Shows the browser's install dialog. The event is single-use, so it is dropped afterwards. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  emit();
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}

/** True when running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mql =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;
  return !!mql?.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Safari on iOS/iPadOS, the only iOS browser flow described by "Share, then Add to Home
 * Screen" here. Chrome/Firefox/Edge/Opera on iOS (CriOS, FxiOS, EdgiOS, OPiOS) are excluded.
 */
export function isIosSafari(
  ua = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  maxTouchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
): boolean {
  // iPadOS 13+ reports a desktop Mac UA; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (!ios) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua)) return false;
  if (isInAppBrowser(ua)) return false;
  if (!/Safari\//.test(ua)) return false; // WKWebView shells omit the Safari token
  return !isStandalone();
}

/** Test seam: forget any captured prompt. */
export function resetInstallForTests(): void {
  deferred = null;
  listeners.clear();
}
