import { useEffect } from 'react';
import { isLeaf } from '../lib/tree';
import { visibleOrder } from '../lib/views';
import { useTaskStore } from '../store/tasks';
import { useUIStore, type View } from '../store/ui';
import type { Difficulty } from '../types';

export type HotkeyAction =
  | { type: 'palette' }
  | { type: 'escape' }
  | { type: 'composer' }
  | { type: 'filter' }
  | { type: 'view'; view: View }
  | { type: 'move'; step: 1 | -1 }
  | { type: 'toggle' }
  | { type: 'edit' }
  | { type: 'delete' }
  | { type: 'difficulty'; value: Difficulty }
  | { type: 'collapse'; collapsed: boolean }
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
  view: View;
  /** A visible row is focused. */
  hasFocus: boolean;
};

const VIEW_KEYS: Record<string, View> = { '1': 'tree', '2': 'deadline', '3': 'history' };

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
    const digit = /^Digit([1-5])$/.exec(e.code ?? '');
    if (!digit || e.shiftKey || !ctx.hasFocus || ctx.view === 'history') return null;
    return { type: 'difficulty', value: Number(digit[1]) as Difficulty };
  }

  if (e.key === '?') return { type: 'help' };
  if (e.shiftKey) return null;

  const rows = ctx.view !== 'history';
  const own = ctx.interactive === true;
  switch (e.key) {
    case 'n':
      return { type: 'composer' };
    case '/':
      return { type: 'filter' };
    case '1':
    case '2':
    case '3':
      return { type: 'view', view: VIEW_KEYS[e.key] };
    case 'j':
      return rows ? { type: 'move', step: 1 } : null;
    case 'k':
      return rows ? { type: 'move', step: -1 } : null;
    case 'ArrowDown':
      return rows && !own ? { type: 'move', step: 1 } : null;
    case 'ArrowUp':
      return rows && !own ? { type: 'move', step: -1 } : null;
    case 'x':
      return ctx.hasFocus ? { type: 'toggle' } : null;
    case ' ':
      return ctx.hasFocus && !own ? { type: 'toggle' } : null;
    case 'e':
      return ctx.hasFocus ? { type: 'edit' } : null;
    case 'Enter':
      return ctx.hasFocus && !own ? { type: 'edit' } : null;
    case 'Backspace':
    case 'Delete':
      return ctx.hasFocus ? { type: 'delete' } : null;
    case 'ArrowRight':
    case 'ArrowLeft':
      return ctx.hasFocus && ctx.view === 'tree' && !own
        ? { type: 'collapse', collapsed: e.key === 'ArrowLeft' }
        : null;
    default:
      return null;
  }
}

const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const CONTROLS =
  'button, a[href], summary, [role="button"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"], [role="tab"]';
const OVERLAYS = '[role="dialog"], [role="alertdialog"]';

const asElement = (target: EventTarget | null) => (target instanceof Element ? target : null);

/** Global keyboard workflow: row focus, task shortcuts, views and the palette. Use once, in App. */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const el = asElement(e.target);
      const ui = useUIStore.getState();
      const tasks = useTaskStore.getState();
      const order = visibleOrder(tasks, { view: ui.view, tag: ui.tagFilter });
      const focusedId = ui.focusedId !== null && order.includes(ui.focusedId) ? ui.focusedId : null;
      const ctx: HotkeyContext = {
        typing: !!el?.closest(TEXT_ENTRY),
        modalOpen: !!document.querySelector(OVERLAYS),
        interactive: !!el?.closest(CONTROLS),
        view: ui.view,
        hasFocus: focusedId !== null,
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
        case 'toggle':
          if (focusedId) tasks.toggle(focusedId);
          break;
        case 'edit':
          if (focusedId) tasks.setEditingId(focusedId);
          break;
        case 'delete':
          if (focusedId) ui.requestDelete(focusedId);
          break;
        case 'difficulty':
          if (focusedId && isLeaf(tasks, focusedId)) {
            tasks.update(focusedId, { difficulty: action.value });
          }
          break;
        case 'collapse':
          if (focusedId && !isLeaf(tasks, focusedId)) {
            tasks.update(focusedId, { collapsed: action.collapsed });
          }
          break;
        case 'help':
          ui.setPaletteOpen(false);
          ui.setSheetOpen(true);
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
