import { create } from 'zustand';

type DragState = {
  /** The row being dragged. */
  activeId: string | null;
  /** Rows that travel with it (its descendants) and are hidden meanwhile. */
  hiddenIds: ReadonlySet<string>;
  /** Framer layout animations are held off from drag start until just after the drop settles. */
  layoutOff: boolean;
  start: (activeId: string, hiddenIds: ReadonlySet<string>) => void;
  /** Ends the drag; layout animations come back on once `layoutOff` is cleared. */
  stop: () => void;
  releaseLayout: () => void;
};

const NONE: ReadonlySet<string> = new Set();

/** Drag state shared with the rows. Per-row selectors keep unaffected rows from re-rendering. */
export const useDragStore = create<DragState>()((set) => ({
  activeId: null,
  hiddenIds: NONE,
  layoutOff: false,
  start: (activeId, hiddenIds) => set({ activeId, hiddenIds, layoutOff: true }),
  stop: () => set({ activeId: null, hiddenIds: NONE }),
  releaseLayout: () => set((s) => (s.activeId === null ? { layoutOff: false } : s)),
}));
