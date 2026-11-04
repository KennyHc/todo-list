import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { UndoToast } from './UndoToast';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-02T12:00:00'));
  localStorage.clear();
  resetTaskStore();
});

afterEach(() => {
  vi.useRealTimers();
});

const toasts = () =>
  screen
    .queryAllByRole('status')
    .filter((el) => within(el).queryByRole('button', { name: 'Undo' }));
const bar = (toast: HTMLElement) => toast.querySelector(':scope > span[aria-hidden="true"]')!;

describe('UndoToast', () => {
  it('runs an 8 s timer and dismisses when it ends', () => {
    render(<UndoToast />);
    act(() => useTaskStore.getState().setTagColor('work', '#c0333a'));
    const [toast] = toasts();
    expect(toast).toHaveTextContent('Changed #work colour');
    expect(bar(toast)).toHaveStyle({ animationDuration: '8000ms' });

    act(() => {
      fireEvent.animationEnd(bar(toast));
    });
    expect(useTaskStore.getState().undo).toBeNull();
  });

  it('replaces the toast in place on rapid actions instead of stacking a second one', () => {
    render(<UndoToast />);
    act(() => useTaskStore.getState().setTagColor('work', '#c0333a'));
    const first = toasts()[0];
    const firstBar = bar(first);
    act(() => useTaskStore.getState().setTagColor('home', '#3d5fc2'));

    const now = toasts();
    expect(now).toHaveLength(1);
    expect(now[0]).toBe(first);
    expect(now[0]).toHaveTextContent('Changed #home colour');
    expect(now[0]).not.toHaveTextContent('Changed #work colour');
    // The timer restarts for the newer action.
    expect(bar(now[0])).not.toBe(firstBar);
  });

  it('undoes the latest action on ⌘Z', () => {
    render(<UndoToast />);
    act(() => useTaskStore.getState().setTagColor('work', '#c0333a'));
    act(() => {
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
    });
    expect(useTaskStore.getState().tagColors).toEqual({});
    expect(useTaskStore.getState().undo).toBeNull();
  });

  it('keeps undoing on ⌘Z after the toast has gone, and redoes on ⇧⌘Z and Ctrl+Y', () => {
    render(<UndoToast />);
    act(() => useTaskStore.getState().setTagColor('work', '#c0333a'));
    act(() => useTaskStore.getState().setTagColor('home', '#3d5fc2'));
    act(() => {
      fireEvent.animationEnd(bar(toasts()[0]));
    });
    expect(useTaskStore.getState().undo).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(useTaskStore.getState().tagColors).toEqual({});
    act(() => {
      fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    });
    expect(useTaskStore.getState().tagColors).toEqual({ work: '#c0333a' });
    act(() => {
      fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    });
    expect(useTaskStore.getState().tagColors).toEqual({ work: '#c0333a', home: '#3d5fc2' });
  });

  it('leaves ⌘Z to text fields', () => {
    render(
      <>
        <input aria-label="field" />
        <UndoToast />
      </>,
    );
    act(() => useTaskStore.getState().setTagColor('work', '#c0333a'));
    act(() => {
      fireEvent.keyDown(screen.getByLabelText('field'), { key: 'z', metaKey: true });
    });
    expect(useTaskStore.getState().tagColors).toEqual({ work: '#c0333a' });
  });
});
