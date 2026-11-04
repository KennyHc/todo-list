import { create } from 'zustand';

export type SyncStatus = 'loading' | 'ready' | 'offline' | 'error';

type SyncState = {
  syncStatus: SyncStatus;
  /** One-shot: tasks moved from this device on first sign-in. The toast clears it. */
  migratedCount: number | null;
  /**
   * Changes written but not yet confirmed by the server, published once they have been pending
   * for a moment (0 otherwise), so a quick edit never flashes "Saving".
   */
  pendingWrites: number;
  setSyncStatus: (status: SyncStatus) => void;
  setMigratedCount: (count: number | null) => void;
  setPendingWrites: (count: number) => void;
};

export const useSyncStore = create<SyncState>()((set) => ({
  syncStatus: 'loading',
  migratedCount: null,
  pendingWrites: 0,
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setMigratedCount: (migratedCount) => set({ migratedCount }),
  setPendingWrites: (pendingWrites) => set({ pendingWrites }),
}));
