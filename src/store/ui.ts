import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { taskStorage } from './storage';
import { useTaskStore } from './tasks';

export type View = 'today' | 'tree' | 'deadline' | 'history' | 'week';
/** copy/import: the AI dialogs. export/paste: backup export and the unified paste import. */
export type AiDialog = 'copy' | 'import' | 'export' | 'paste' | null;

/** An optional button on a notice, and whether the notice stays until dismissed. */
export type NoticeOptions = {
  action?: { label: string; run: () => void };
  persistent?: boolean;
  /** Runs when the notice is dismissed (its close button, its action, or the countdown). */
  onDismiss?: () => void;
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
  /** The Tree view shows the tasks that start later, dimmed, inline. Not persisted. */
  showUpcoming: boolean;
  /** Monday of the week the Week view shows, or null for the current week. Not persisted. */
  weekAnchor: string | null;
  /** A Week day's "+" asked the composer to open set to this due date. Not persisted. */
  composerDay: string | null;
  /** The row the keyboard acts on. Not persisted. */
  focusedId: string | null;
  /**
   * The one row in the Tab order: the focused row while it is shown, else the first row (roving
   * tabindex). Derived by useHotkeys. Not persisted.
   */
  tabStopId: string | null;
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
  setShowUpcoming: (show: boolean) => void;
  setWeekAnchor: (weekStart: string | null) => void;
  setComposerDay: (date: string | null) => void;
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
      showUpcoming: false,
      weekAnchor: null,
      composerDay: null,
      focusedId: null,
      tabStopId: null,
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
      setShowUpcoming: (showUpcoming) => set({ showUpcoming }),
      setWeekAnchor: (weekAnchor) => set({ weekAnchor }),
      setComposerDay: (composerDay) => set({ composerDay }),
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

/** The views in switch order. Today comes first, and only exists while the feature is on. */
export const viewOrder = (todayView: boolean): View[] =>
  todayView
    ? ['today', 'tree', 'deadline', 'history', 'week']
    : ['tree', 'deadline', 'history', 'week'];

/** The view actually shown: a persisted 'today' falls back to the Tree while the feature is off. */
export const effectiveView = (view: View, todayView: boolean): View =>
  view === 'today' && !todayView ? 'tree' : view;

/** The view being shown (see effectiveView). */
export const useView = (): View => {
  const view = useUIStore((s) => s.view);
  const todayView = useTaskStore((s) => s.settings.todayView);
  return effectiveView(view, todayView);
};

/** The same, read on demand (event handlers). */
export const currentView = (): View =>
  effectiveView(useUIStore.getState().view, useTaskStore.getState().settings.todayView);

/** Turns the Today view on (and shows it) or off (leaving it if it is showing). */
export function setTodayView(on: boolean): void {
  useTaskStore.getState().setSetting({ todayView: on });
  const ui = useUIStore.getState();
  if (on) ui.setView('today');
  else if (ui.view === 'today') ui.setView('tree');
}
