import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateSW = vi.fn().mockResolvedValue(undefined);
let options: {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (url: string, r: ServiceWorkerRegistration | undefined) => void;
} = {};

vi.mock('virtual:pwa-register', () => ({
  registerSW: (o: typeof options) => {
    options = o;
    return updateSW;
  },
}));

import { useUIStore } from '../store/ui';
import { registerServiceWorker, resetInteractionForTests } from './registerSW';

beforeEach(() => {
  localStorage.clear();
  updateSW.mockClear();
  useUIStore.setState({ notice: null });
  resetInteractionForTests();
  registerServiceWorker();
});

const interact = () => window.dispatchEvent(new Event('pointerdown'));

describe('registerServiceWorker', () => {
  it('applies an update straight away when the page has not been used yet', () => {
    options.onNeedRefresh?.();
    expect(updateSW).toHaveBeenCalledWith(true);
    expect(useUIStore.getState().notice).toBeNull();
  });

  it('shows a persistent "New version ready" notice once the person is using the page', () => {
    interact();
    options.onNeedRefresh?.();
    expect(updateSW).not.toHaveBeenCalled();
    const notice = useUIStore.getState().notice;
    expect(notice).toMatchObject({ text: 'New version ready', persistent: true });
    expect(notice?.action?.label).toBe('Reload');
    notice?.action?.run();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('announces offline readiness only the first time', () => {
    options.onOfflineReady?.();
    expect(useUIStore.getState().notice?.text).toBe('Ready to work offline');
    expect(useUIStore.getState().notice?.persistent).toBeUndefined();
    expect(localStorage.getItem('offline-ready-shown')).toBe('1');

    useUIStore.setState({ notice: null });
    options.onOfflineReady?.();
    expect(useUIStore.getState().notice).toBeNull();
  });
});

describe('update checks', () => {
  it('checks for a new version when the tab becomes visible again', () => {
    const update = vi.fn().mockResolvedValue(undefined);
    options.onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalled();
  });
});

describe('stale chunks after a deploy', () => {
  it('reloads once when a lazy chunk fails to load, and not in a loop', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...original, reload },
      configurable: true,
    });
    sessionStorage.clear();

    const first = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(first);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', { value: original, configurable: true });
  });
});

describe('a new worker taking control', () => {
  const setup = (hasController: boolean) => {
    const listeners: Record<string, () => void> = {};
    const sw = {
      controller: hasController ? {} : null,
      addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...original, reload },
      configurable: true,
    });
    resetInteractionForTests();
    useUIStore.setState({ notice: null });
    registerServiceWorker();
    const restore = () =>
      Object.defineProperty(window, 'location', { value: original, configurable: true });
    return { fire: () => listeners.controllerchange?.(), reload, restore };
  };

  it('reloads an untouched page that was running an older build', () => {
    const { fire, reload, restore } = setup(true);
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
    restore();
  });

  it('offers a reload instead once the person is using the page', () => {
    const { fire, reload, restore } = setup(true);
    window.dispatchEvent(new Event('pointerdown'));
    fire();
    expect(reload).not.toHaveBeenCalled();
    expect(useUIStore.getState().notice?.text).toBe('New version ready');
    restore();
  });

  it('ignores the very first install, which is not an update', () => {
    const { fire, reload, restore } = setup(false);
    fire();
    expect(reload).not.toHaveBeenCalled();
    expect(useUIStore.getState().notice).toBeNull();
    restore();
  });
});
