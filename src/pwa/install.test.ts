import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canPromptInstall,
  initInstall,
  isIosSafari,
  isStandalone,
  promptInstall,
  resetInstallForTests,
} from './install';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.0.0 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0';
const IPAD_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const MAC_SAFARI = IPAD_SAFARI;

const mockDisplayMode = (standalone: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: standalone && query === '(display-mode: standalone)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { standalone?: boolean }).standalone;
});

describe('isStandalone', () => {
  it('reads the display-mode media query', () => {
    mockDisplayMode(true);
    expect(isStandalone()).toBe(true);
    mockDisplayMode(false);
    expect(isStandalone()).toBe(false);
  });

  it('falls back to navigator.standalone (iOS)', () => {
    mockDisplayMode(false);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isStandalone()).toBe(true);
  });
});

describe('isIosSafari', () => {
  beforeEach(() => mockDisplayMode(false));

  it('accepts Safari on iPhone and iPadOS (desktop UA plus touch)', () => {
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
    expect(isIosSafari(IPAD_SAFARI, 5)).toBe(true);
  });

  it('rejects desktop Safari, Chrome on iOS and in-app browsers', () => {
    expect(isIosSafari(MAC_SAFARI, 0)).toBe(false);
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
    expect(isIosSafari(IPHONE_INSTAGRAM, 5)).toBe(false);
  });

  it('is false once installed', () => {
    mockDisplayMode(true);
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(false);
  });
});

describe('install prompt', () => {
  it('captures beforeinstallprompt, suppresses the mini-infobar and prompts once', async () => {
    resetInstallForTests();
    initInstall();
    expect(canPromptInstall()).toBe(false);

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(canPromptInstall()).toBe(true);
    await expect(promptInstall()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    expect(canPromptInstall()).toBe(false);
    await expect(promptInstall()).resolves.toBe(false);
  });
});
