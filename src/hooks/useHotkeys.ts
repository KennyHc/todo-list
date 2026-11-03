import { useEffect } from 'react';
import { siblingMoveTarget } from '../lib/dnd';
import { isLeaf } from '../lib/tree';
import { weekStart, weekStepMove } from '../lib/week';
import { neighborAfterRemoval, todayISO, visibleOrder, visibleTreeIds } from '../lib/views';
import { useDragStore } from '../store/drag';
import { useTaskStore } from '../store/tasks';
import { currentView, useUIStore, viewOrder, type View } from '../store/ui';
import type { Difficulty } from '../types';

export type HotkeyAction =
  | { type: 'palette' }
  | { type: 'escape' }
  | { type: 'composer' }
  | { type: 'filter' }
  | { type: 'view'; view: View }
  | { type: 'move'; step: 1 | -1 }
  | { type: 'edge'; last: boolean }
  | { type: 'toggle' }
  | { type: 'edit' }
  | { type: 'delete' }
  | { type: 'reschedule' }
  | { type: 'plan' }
  | { type: 'difficulty'; value: Difficulty }
  | { type: 'collapse'; collapsed: boolean }
  | { type: 'reorder'; step: 1 | -1 }
  | { type: 'nest'; direction: 'in' | 'out' }
  | { type: 'day'; step: 1 | -1 }
  | { type: 'help' };

export type HotkeyEvent = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export type HotkeyContext = {
  /** Focus is in an input, textarea, select or contenteditable. */
  typing: boolean;
  /** A dialog, palette or popover is open. */
  modalOpen: boolean;
  /** Focus is on a button, link or other control that owns Enter, Space and the arrows. */
  interactive?: boolean;
  /** That control is one of a row's own buttons: ↑/↓ still move between rows. */
  inRow?: boolean;
  view: View;
  /** A visible row is focused. */
  hasFocus: boolean;
  /** The opt-in Today view is on: it takes key 1 and the others move up; `p` plans a row. */
  todayView?: boolean;
};

/**
 * Maps a key press to an action, or null when it isn't ours. Pure: everything it needs to know
 * about the page comes in through `ctx`.
 */
export function matchHotkey(e: HotkeyEvent, ctx: HotkeyContext): HotkeyAction | null {
  // Work from anywhere, including inputs and over dialogs.
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
    return { type: 'palette' };
  }
  if (e.key === 'Escape') return { type: 'escape' };
  if (ctx.typing || ctx.modalOpen || e.metaKey || e.ctrlKey) return null;

  if (e.altKey) {
    // Alt+arrows rearrange the focused row in the tree, even from a button inside it.
    if (e.key.startsWith('Arrow')) {
      if (e.shiftKey || !ctx.hasFocus || ctx.view !== 'tree') return null;
      switch (e.key) {
        case 'ArrowUp':
          return { type: 'reorder', step: -1 };
        case 'ArrowDown':
          return { type: 'reorder', step: 1 };
        case 'ArrowRight':
          return { type: 'nest', direction: 'in' };
        case 'ArrowLeft':
          return { type: 'nest', direction: 'out' };
        default:
          return null;
      }
    }
    const digit = /^Digit([1-5])$/.exec(e.code ?? '');
    if (!digit || e.shiftKey || !ctx.hasFocus || ctx.view === 'history') return null;
    return { type: 'difficulty', value: Number(digit[1]) as Difficulty };
  }

  if (e.key === '?') return { type: 'help' };
  if (e.shiftKey) return null;

  const rows = ctx.view !== 'history';
  const own = ctx.interactive === true;
  const rowControl = own && ctx.inRow === true;
  switch (e.key) {
    case 'n':
      return { type: 'composer' };
    case '/':
      return { type: 'filter' };
    case '1':
    case '2':
    case '3':
    case '4':
    case '5': {
      const view = viewOrder(ctx.todayView === true)[Number(e.key) - 1];
      return view ? { type: 'view', view } : null;
    }
    case 'j':
      return rows ? { type: 'move', step: 1 } : null;
    case 'k':
      return rows ? { type: 'move', step: -1 } : null;
    case 'ArrowDown':
      return rows && (!own || rowControl) ? { type: 'move', step: 1 } : null;
    case 'ArrowUp':
      return rows && (!own || rowControl) ? { type: 'move', step: -1 } : null;
    case 'Home':
    case 'End':
      return rows && !own ? { type: 'edge', last: e.key === 'End' } : null;
    case 'x':
      return ctx.hasFocus ? { type: 'toggle' } : null;
    case ' ':
      return ctx.hasFocus && !own ? { type: 'toggle' } : null;
    case 'e':
      return ctx.hasFocus ? { type: 'edit' } : null;
    case 'Enter':
      return ctx.hasFocus && !own ? { type: 'edit' } : null;
    case 's':
      return ctx.hasFocus ? { type: 'reschedule' } : null;
    case 'p':
      return ctx.hasFocus && ctx.todayView === true ? { type: 'plan' } : null;
    case 'Backspace':
    case 'Delete':
      return ctx.hasFocus ? { type: 'delete' } : null;
    case '[':
    case ']':
      return ctx.hasFocus && ctx.view === 'week'
        ? { type: 'day', step: e.key === ']' ? 1 : -1 }
        : null;
    case 'ArrowRight':
    case 'ArrowLeft':
      return ctx.hasFocus && rows && !own
        ? { type: 'collapse', collapsed: e.key === 'ArrowLeft' }
        : null;
    default:
      return null;
  }
}

export const TEXT_ENTRY =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const CONTROLS =
  'button, a[href], summary, [role="button"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"], [role="tab"]';
const OVERLAYS = '[role="dialog"], [role="alertdialog"]';
/** The controls inside a row item that ←/→ walk through (see TaskItem). */
export const ROW_CONTROLS = 'button:not(:disabled), a[href], [data-row-control]';

/** A row item's controls in order, skipping hidden ones (the phone's hidden ⋯, a closed tray). */
export function rowControls(item: Element): HTMLElement[] {
  return [...item.querySelectorAll<HTMLElement>(ROW_CONTROLS)].filter(
    (el) => el.getClientRects().length > 0 && el.closest('[aria-hidden="true"]') === null,
  );
}

/** Moves keyboard focus to a shown row's first control (→ on a row). */
function enterRow(id: string): void {
  const item = document.querySelector(`[data-row-id="${CSS.escape(id)}"]`);
  if (item) rowControls(item)[0]?.focus();
}

/** The visibleOrder options for what the UI currently shows. */
const orderOf = (ui: ReturnType<typeof useUIStore.getState>) => ({
  view: currentView(),
  tag: ui.tagFilter,
  completedCollapsed: ui.completedCollapsed,
  completedShowAll: ui.completedShowAll,
  showUpcoming: ui.showUpcoming,
  weekAnchor: ui.weekAnchor,
});

const asElement = (target: EventTarget | null) => (target instanceof Element ? target : null);

/** Global keyboard workflow: row focus, task shortcuts, views and the palette. Use once, in App. */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const el = asElement(e.target);
      const ui = useUIStore.getState();
      const tasks = useTaskStore.getState();
      const order = visibleOrder(tasks, orderOf(ui));
      const focusedId = ui.focusedId !== null && order.includes(ui.focusedId) ? ui.focusedId : null;
      const control = el?.closest(CONTROLS);
      const ctx: HotkeyContext = {
        typing: !!el?.closest(TEXT_ENTRY),
        modalOpen: !!document.querySelector(OVERLAYS),
        interactive: !!control,
        // While a grip carries a row by keyboard, the arrows are the drag's.
        inRow: !!control?.closest('[data-row-id]') && useDragStore.getState().activeId === null,
        view: currentView(),
        hasFocus: focusedId !== null,
        todayView: tasks.settings.todayView,
      };
      const action = matchHotkey(e, ctx);
      if (!action) return;
      if (action.type !== 'escape') e.preventDefault();

      switch (action.type) {
        case 'palette':
          ui.setSheetOpen(false);
          ui.setPaletteOpen(!ui.paletteOpen);
          break;
        case 'escape':
          ui.setPaletteOpen(false);
          ui.setSheetOpen(false);
          // Escape inside a field or over a popover belongs to that field or popover.
          if (!ctx.typing && !ctx.modalOpen) ui.setFocusedId(null);
          break;
        case 'composer':
          document.getElementById('composer')?.focus();
          break;
        case 'filter':
          ui.setFilterOpen(true);
          break;
        case 'view':
          ui.setView(action.view);
          break;
        case 'move': {
          if (order.length === 0) break;
          const at = focusedId === null ? -1 : order.indexOf(focusedId);
          const next =
            at === -1
              ? action.step === 1
                ? 0
                : order.length - 1
              : Math.min(order.length - 1, Math.max(0, at + action.step));
          ui.setFocusedId(order[next]);
          break;
        }
        case 'edge':
          if (order.length > 0) ui.setFocusedId(order[action.last ? order.length - 1 : 0]);
          break;
        case 'toggle': {
          if (!focusedId) break;
          tasks.toggle(focusedId);
          // A completed row leaves the list (with its subtree, and maybe its parent), so focus
          // moves on to the next row that stays, and j/k keep working.
          const stays = new Set(visibleOrder(useTaskStore.getState(), orderOf(ui)));
          if (!stays.has(focusedId)) {
            const gone = new Set(order.filter((other) => !stays.has(other)));
            ui.setFocusedId(neighborAfterRemoval(order, focusedId, gone));
          }
          break;
        }
        case 'edit':
          if (focusedId) tasks.setEditingId(focusedId);
          break;
        case 'delete':
          if (focusedId) ui.requestDelete(focusedId);
          break;
        case 'reschedule':
          if (focusedId) ui.requestReschedule(focusedId);
          break;
        case 'plan': {
          if (!focusedId) break;
          const task = tasks.tasks[focusedId];
          if (!task) break;
          const today = todayISO();
          // Planned (for today or an earlier day, so it is in Today) -> take it out; else plan it.
          const planned = task.plannedFor !== null && task.plannedFor <= today;
          tasks.plan(focusedId, planned ? null : today);
          // A row that leaves the list hands the keyboard focus on, like completing does.
          const stays = new Set(visibleOrder(useTaskStore.getState(), orderOf(ui)));
          if (!stays.has(focusedId)) {
            ui.setFocusedId(neighborAfterRemoval(order, focusedId, new Set([focusedId])));
          }
          break;
        }
        case 'difficulty':
          if (focusedId && isLeaf(tasks, focusedId)) {
            tasks.update(focusedId, { difficulty: action.value });
          }
          break;
        case 'collapse': {
          // The tree pattern: → opens a closed row, ← closes an open one or goes to its parent.
          // → on an open row or a leaf steps into the row's buttons (←/→ there, see TaskItem).
          if (!focusedId) break;
          const task = tasks.tasks[focusedId];
          const nested = ctx.view === 'tree' && task !== undefined;
          if (nested && !isLeaf(tasks, focusedId) && task.collapsed !== action.collapsed) {
            tasks.update(focusedId, { collapsed: action.collapsed });
          } else if (!action.collapsed) {
            enterRow(focusedId);
          } else if (nested && task.parentId !== null && order.includes(task.parentId)) {
            ui.setFocusedId(task.parentId);
          }
          break;
        }
        case 'reorder': {
          if (!focusedId) break;
          const target = siblingMoveTarget(
            tasks,
            focusedId,
            action.step,
            visibleTreeIds(tasks, ui.tagFilter),
          );
          if (target) tasks.move(focusedId, target);
          break;
        }
        case 'nest': {
          if (!focusedId) break;
          if (action.direction === 'out') {
            tasks.outdent(focusedId);
            break;
          }
          tasks.indent(focusedId);
          // Indenting under a collapsed row would hide the focused one; open it.
          const parentId = useTaskStore.getState().tasks[focusedId]?.parentId;
          if (parentId && useTaskStore.getState().tasks[parentId]?.collapsed) {
            tasks.update(parentId, { collapsed: false });
          }
          break;
        }
        case 'day': {
          if (!focusedId) break;
          const task = tasks.tasks[focusedId];
          if (!task) break;
          const today = todayISO();
          const current = weekStart(today);
          const start = ui.weekAnchor ?? current;
          const move = weekStepMove(task, action.step, start, today);
          if (!move) break;
          tasks.moveToDay(focusedId, move);
          // Past Sunday or before Monday: the week follows the row, so it stays selected.
          const shown = weekStart(move.date);
          if (shown !== start) ui.setWeekAnchor(shown === current ? null : shown);
          break;
        }
        case 'help':
          ui.setPaletteOpen(false);
          ui.setSheetOpen(true);
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Roving tabindex: keep tabStopId on the focused row, or the first row while none is focused.
  useEffect(() => {
    const sync = () => {
      const ui = useUIStore.getState();
      const order = visibleOrder(useTaskStore.getState(), orderOf(ui));
      const id =
        ui.focusedId !== null && order.includes(ui.focusedId) ? ui.focusedId : (order[0] ?? null);
      if (id !== ui.tabStopId) useUIStore.setState({ tabStopId: id });
    };
    sync();
    const offTasks = useTaskStore.subscribe(sync);
    const offUI = useUIStore.subscribe(sync);
    return () => {
      offTasks();
      offUI();
    };
  }, []);
}
