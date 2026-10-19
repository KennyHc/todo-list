import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { taskStorage } from './storage';

export type View = 'tree' | 'deadline' | 'history';

type UIState = {
  view: View;
  /** Normalized tag the lists are filtered by, or null for everything. */
  tagFilter: string | null;
  setView: (view: View) => void;
  setTagFilter: (tag: string | null) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      view: 'tree',
      tagFilter: null,
      setView: (view) => set({ view }),
      setTagFilter: (tagFilter) => set({ tagFilter }),
    }),
    {
      name: 'ui-v1',
      version: 1,
      storage: taskStorage<Pick<UIState, 'view' | 'tagFilter'>>(),
      partialize: ({ view, tagFilter }) => ({ view, tagFilter }),
    },
  ),
);
