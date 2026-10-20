import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateSW = vi.fn().mockResolvedValue(undefined);
let options: { onNeedRefresh?: () => void; onOfflineReady?: () => void } = {};

vi.mock('virtual:pwa-register', () => ({
  registerSW: (o: typeof options) => {
    options = o;
    return updateSW;
  },
}));

import { useUIStore } from '../store/ui';
import { registerServiceWorker } from './registerSW';

beforeEach(() => {
  localStorage.clear();
  updateSW.mockClear();
  useUIStore.setState({ notice: null });
  registerServiceWorker();
});

describe('registerServiceWorker', () => {
  it('shows a persistent "New version ready" notice whose action reloads via updateSW(true)', () => {
    options.onNeedRefresh?.();
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
