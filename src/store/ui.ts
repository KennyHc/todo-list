import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { taskStorage } from './storage';

export type View = 'tree' | 'deadline' | 'history';
/** copy/import: the AI dialogs. export/paste: backup export and the unified paste import. */
export type AiDialog = 'copy' | 'import' | 'export' | 'paste' | null;

/** An optional button on a notice, and whether the notice stays until dismissed. */
export type NoticeOptions = {
  action?: { label: string; run: () => void };
  persistent?: boolean;
};
export type Notice = NoticeOptions & { text: string; n: number };

type UIState = {
  view: View;
  /** Normalized tag the lists are filtered by, or null for everything. */
  tagFilter: string | null;
  /** The By deadline view's Completed section is collapsed. Persisted. */
  completedCollapsed: boolean;
  /** Its "Show all" is pressed (otherwise only the first few rows show). Not persisted. */
  completedShowAll: boolean;
  /** The row the keyboard acts on. Not persisted. */
  focusedId: string | null;
  /** Whether the tag filter popover is open, so a hotkey can open it. Not persisted. */
  filterOpen: boolean;
  paletteOpen: boolean;
  sheetOpen: boolean;
  /** Which AI copy/paste dialog is open. Not persisted. */
  aiDialog: AiDialog;
  /** Whether the "Delete your account?" dialog is open. Not persisted. */
  deleteAccountOpen: boolean;
  /** Whether the "Tag colours" dialog is open. Not persisted. */
  tagColorsOpen: boolean;
  /** A one-shot info toast; `n` changes on every notice. Not persisted. */
  notice: Notice | null;
  /** A row asked (by hotkey or palette) to run its own delete flow. Not persisted. */
  deleteRequestId: string | null;
  /** A row asked (by the `s` hotkey) to open its Reschedule menu. Not persisted. */
  rescheduleRequestId: string | null;
  /** Latest "reveal" pulse; `n` changes on every pulse so the same row can flash again. */
  revealFlash: { id: string; n: number } | null;
  setView: (view: View) => void;
  setTagFilter: (tag: string | null) => void;
  setCompletedCollapsed: (collapsed: boolean) => void;
  setCompletedShowAll: (showAll: boolean) => void;
  setFocusedId: (id: string | null) => void;
  setFilterOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setSheetOpen: (open: boolean) => void;
  setAiDialog: (dialog: AiDialog) => void;
  setDeleteAccountOpen: (open: boolean) => void;
  setTagColorsOpen: (open: boolean) => void;
  showNotice: (text: string, options?: NoticeOptions) => void;
  clearNotice: () => void;
  requestDelete: (id: string) => void;
  clearDeleteRequest: () => void;
  requestReschedule: (id: string) => void;
  clearRescheduleRequest: () => void;
  flashRow: (id: string) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      view: 'tree',
      tagFilter: null,
      completedCollapsed: false,
      completedShowAll: false,
      focusedId: null,
      filterOpen: false,
      paletteOpen: false,
      sheetOpen: false,
      aiDialog: null,
      deleteAccountOpen: false,
      tagColorsOpen: false,
      notice: null,
      deleteRequestId: null,
      rescheduleRequestId: null,
      revealFlash: null,
      setView: (view) => set({ view }),
      setTagFilter: (tagFilter) => set({ tagFilter }),
      setCompletedCollapsed: (completedCollapsed) => set({ completedCollapsed }),
      setCompletedShowAll: (completedShowAll) => set({ completedShowAll }),
      setFocusedId: (focusedId) => set({ focusedId }),
      setFilterOpen: (filterOpen) => set({ filterOpen }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setSheetOpen: (sheetOpen) => set({ sheetOpen }),
      setAiDialog: (aiDialog) => set({ aiDialog }),
      setDeleteAccountOpen: (deleteAccountOpen) => set({ deleteAccountOpen }),
      setTagColorsOpen: (tagColorsOpen) => set({ tagColorsOpen }),
      showNotice: (text, options) =>
        set((s) => ({ notice: { ...options, text, n: (s.notice?.n ?? 0) + 1 } })),
      clearNotice: () => set({ notice: null }),
      requestDelete: (deleteRequestId) => set({ deleteRequestId }),
      clearDeleteRequest: () => set({ deleteRequestId: null }),
      requestReschedule: (rescheduleRequestId) => set({ rescheduleRequestId }),
      clearRescheduleRequest: () => set({ rescheduleRequestId: null }),
      flashRow: (id) => set((s) => ({ revealFlash: { id, n: (s.revealFlash?.n ?? 0) + 1 } })),
    }),
    {
      name: 'ui-v1',
      version: 1,
      storage: taskStorage<Pick<UIState, 'view' | 'tagFilter' | 'completedCollapsed'>>(),
      partialize: ({ view, tagFilter, completedCollapsed }) => ({
        view,
        tagFilter,
        completedCollapsed,
      }),
    },
  ),
);
