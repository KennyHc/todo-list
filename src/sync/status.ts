import { create } from 'zustand';

export type SyncStatus = 'loading' | 'ready' | 'offline' | 'error';

type SyncState = {
  syncStatus: SyncStatus;
  /** One-shot: tasks moved from this device on first sign-in. The toast clears it. */
  migratedCount: number | null;
  setSyncStatus: (status: SyncStatus) => void;
  setMigratedCount: (count: number | null) => void;
};

export const useSyncStore = create<SyncState>()((set) => ({
  syncStatus: 'loading',
  migratedCount: null,
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setMigratedCount: (migratedCount) => set({ migratedCount }),
}));
