import { describe, expect, it } from 'vitest';
import { matchHotkey, type HotkeyContext, type HotkeyEvent } from './useHotkeys';

const ev = (key: string, extra: Partial<HotkeyEvent> = {}): HotkeyEvent => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});
const ctx = (extra: Partial<HotkeyContext> = {}): HotkeyContext => ({
  typing: false,
  modalOpen: false,
  view: 'tree',
  hasFocus: true,
  ...extra,
});

describe('matchHotkey', () => {
  it('maps the plain keys', () => {
    expect(matchHotkey(ev('n'), ctx())).toEqual({ type: 'composer' });
    expect(matchHotkey(ev('/'), ctx())).toEqual({ type: 'filter' });
    expect(matchHotkey(ev('2'), ctx())).toEqual({ type: 'view', view: 'deadline' });
    expect(matchHotkey(ev('j'), ctx())).toEqual({ type: 'move', step: 1 });
    expect(matchHotkey(ev('ArrowUp'), ctx())).toEqual({ type: 'move', step: -1 });
    expect(matchHotkey(ev(' '), ctx())).toEqual({ type: 'toggle' });
    expect(matchHotkey(ev('x'), ctx())).toEqual({ type: 'toggle' });
    expect(matchHotkey(ev('Enter'), ctx())).toEqual({ type: 'edit' });
    expect(matchHotkey(ev('Backspace'), ctx())).toEqual({ type: 'delete' });
    expect(matchHotkey(ev('s'), ctx())).toEqual({ type: 'reschedule' });
    expect(matchHotkey(ev('ArrowLeft'), ctx())).toEqual({ type: 'collapse', collapsed: true });
    expect(matchHotkey(ev('ArrowRight'), ctx())).toEqual({ type: 'collapse', collapsed: false });
    expect(matchHotkey(ev('?', { shiftKey: true }), ctx())).toEqual({ type: 'help' });
  });

  it('uses e.code for Alt+digit, since Alt changes e.key on macOS', () => {
    expect(matchHotkey(ev('¡', { altKey: true, code: 'Digit1' }), ctx())).toEqual({
      type: 'difficulty',
      value: 1,
    });
    expect(matchHotkey(ev('€', { altKey: true, code: 'Digit5' }), ctx())).toEqual({
      type: 'difficulty',
      value: 5,
    });
    expect(matchHotkey(ev('x', { altKey: true, code: 'Digit6' }), ctx())).toBeNull();
    expect(
      matchHotkey(ev('1', { altKey: true, code: 'Digit1' }), ctx({ hasFocus: false })),
    ).toBeNull();
  });

  it('maps Alt+arrows to reorder and nest in the tree only, for a focused row', () => {
    const alt = { altKey: true };
    expect(matchHotkey(ev('ArrowUp', alt), ctx())).toEqual({ type: 'reorder', step: -1 });
    expect(matchHotkey(ev('ArrowDown', alt), ctx())).toEqual({ type: 'reorder', step: 1 });
    expect(matchHotkey(ev('ArrowRight', alt), ctx())).toEqual({ type: 'nest', direction: 'in' });
    expect(matchHotkey(ev('ArrowLeft', alt), ctx())).toEqual({ type: 'nest', direction: 'out' });
    // Still works from a button inside the row, unlike the plain arrows.
    expect(matchHotkey(ev('ArrowUp', alt), ctx({ interactive: true }))).toEqual({
      type: 'reorder',
      step: -1,
    });
    expect(matchHotkey(ev('ArrowUp', alt), ctx({ hasFocus: false }))).toBeNull();
    expect(matchHotkey(ev('ArrowUp', alt), ctx({ view: 'deadline' }))).toBeNull();
    expect(matchHotkey(ev('ArrowUp', alt), ctx({ typing: true }))).toBeNull();
    expect(matchHotkey(ev('ArrowUp', { ...alt, metaKey: true }), ctx())).toBeNull();
    expect(matchHotkey(ev('ArrowUp', { ...alt, shiftKey: true }), ctx())).toBeNull();
  });

  it('opens the palette with Cmd+K or Ctrl+K, even while typing or over a dialog', () => {
    const typing = ctx({ typing: true, modalOpen: true });
    expect(matchHotkey(ev('k', { metaKey: true }), typing)).toEqual({ type: 'palette' });
    expect(matchHotkey(ev('K', { ctrlKey: true }), typing)).toEqual({ type: 'palette' });
  });

  it('keeps Escape working while typing or over a dialog', () => {
    expect(matchHotkey(ev('Escape'), ctx({ typing: true }))).toEqual({ type: 'escape' });
    expect(matchHotkey(ev('Escape'), ctx({ modalOpen: true }))).toEqual({ type: 'escape' });
  });

  it('ignores everything else while typing or over a dialog', () => {
    for (const key of ['n', 'j', 'x', 's', '/', '1', ' ', 'Enter', 'Backspace', '?']) {
      expect(matchHotkey(ev(key), ctx({ typing: true }))).toBeNull();
      expect(matchHotkey(ev(key), ctx({ modalOpen: true }))).toBeNull();
    }
  });

  it('ignores modified keys that are not ours', () => {
    expect(matchHotkey(ev('n', { metaKey: true }), ctx())).toBeNull();
    expect(matchHotkey(ev('j', { ctrlKey: true }), ctx())).toBeNull();
    expect(matchHotkey(ev('J', { shiftKey: true }), ctx())).toBeNull();
    expect(matchHotkey(ev('n', { altKey: true, code: 'KeyN' }), ctx())).toBeNull();
  });

  it('needs a focused row for row actions, but not for navigation', () => {
    const none = ctx({ hasFocus: false });
    for (const key of ['x', ' ', 'e', 's', 'Enter', 'Backspace', 'Delete', 'ArrowLeft']) {
      expect(matchHotkey(ev(key), none)).toBeNull();
    }
    expect(matchHotkey(ev('j'), none)).toEqual({ type: 'move', step: 1 });
  });

  it('leaves Enter, Space and the arrows to a focused control', () => {
    const onButton = ctx({ interactive: true });
    expect(matchHotkey(ev('Enter'), onButton)).toBeNull();
    expect(matchHotkey(ev(' '), onButton)).toBeNull();
    expect(matchHotkey(ev('ArrowDown'), onButton)).toBeNull();
    expect(matchHotkey(ev('ArrowRight'), onButton)).toBeNull();
    expect(matchHotkey(ev('j'), onButton)).toEqual({ type: 'move', step: 1 });
  });

  it('only expands and collapses in the tree view, and has no rows in history', () => {
    expect(matchHotkey(ev('ArrowRight'), ctx({ view: 'deadline' }))).toBeNull();
    expect(matchHotkey(ev('j'), ctx({ view: 'history' }))).toBeNull();
    expect(matchHotkey(ev('1'), ctx({ view: 'history' }))).toEqual({ type: 'view', view: 'tree' });
  });

  it('[ and ] move the focused row a day in Week only', () => {
    expect(matchHotkey(ev('['), ctx({ view: 'week' }))).toEqual({ type: 'day', step: -1 });
    expect(matchHotkey(ev(']'), ctx({ view: 'week' }))).toEqual({ type: 'day', step: 1 });
    expect(matchHotkey(ev(']'), ctx({ view: 'tree' }))).toBeNull();
    expect(matchHotkey(ev(']'), ctx({ view: 'week', hasFocus: false }))).toBeNull();
  });
});

describe('matchHotkey with the Today view on', () => {
  const on = (extra: Partial<HotkeyContext> = {}) => ctx({ todayView: true, ...extra });

  it('numbers the views from Today: 1 Today, 2 Tree, 3 By deadline, 4 History, 5 Week', () => {
    expect(matchHotkey(ev('1'), on())).toEqual({ type: 'view', view: 'today' });
    expect(matchHotkey(ev('2'), on())).toEqual({ type: 'view', view: 'tree' });
    expect(matchHotkey(ev('3'), on())).toEqual({ type: 'view', view: 'deadline' });
    expect(matchHotkey(ev('4'), on())).toEqual({ type: 'view', view: 'history' });
    expect(matchHotkey(ev('5'), on())).toEqual({ type: 'view', view: 'week' });
  });

  it('leaves the numbering alone while it is off: Week is 4 and 5 does nothing', () => {
    expect(matchHotkey(ev('1'), ctx())).toEqual({ type: 'view', view: 'tree' });
    expect(matchHotkey(ev('3'), ctx())).toEqual({ type: 'view', view: 'history' });
    expect(matchHotkey(ev('4'), ctx())).toEqual({ type: 'view', view: 'week' });
    expect(matchHotkey(ev('5'), ctx())).toBeNull();
  });

  it('p plans the focused row, only with the feature on', () => {
    expect(matchHotkey(ev('p'), on())).toEqual({ type: 'plan' });
    expect(matchHotkey(ev('p'), on({ hasFocus: false }))).toBeNull();
    expect(matchHotkey(ev('p'), ctx())).toBeNull();
    expect(matchHotkey(ev('p'), on({ typing: true }))).toBeNull();
    expect(matchHotkey(ev('p', { metaKey: true }), on())).toBeNull();
  });
});
