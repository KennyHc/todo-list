/**
 * The auth store (landing path) must stop and flush sync without importing the sync engine,
 * which pulls in Firestore. The engine registers itself here when its lazy chunk loads; before
 * that there is nothing to stop.
 */
export type SyncController = { flush: () => Promise<void>; stop: () => void };

let controller: SyncController | null = null;

export function registerSyncController(next: SyncController): void {
  controller = next;
}

export const flushActiveSync = (): Promise<void> => controller?.flush() ?? Promise.resolve();
export const stopActiveSync = (): void => controller?.stop();
