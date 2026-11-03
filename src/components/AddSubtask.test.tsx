import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { useDragStore } from '../store/drag';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';

/** Fakes matchMedia: `touch` answers the (hover: none) and (pointer: coarse) query. */
function mockMedia({ touch, phone = touch }: { touch: boolean; phone?: boolean }) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('hover: none')
      ? touch
      : query.includes('max-width: 480px')
        ? phone
        : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as never;
}

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({ view: 'tree', tagFilter: null, focusedId: null });
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const openMenu = (title: string) => {
  const row = screen.getByText(title).closest('li') as HTMLElement;
  let more = within(row).queryAllByRole('button', { name: 'More options' })[0];
  if (!more) {
    // Phone rows carry no ⋯: tap the title to edit it, then the editor's trailing ⋯.
    fireEvent.click(within(row).getByRole('button', { name: title }));
    const editing = document.querySelector<HTMLElement>(`li[data-row-id="${row.dataset.rowId}"]`)!;
    more = within(editing).getByRole('button', { name: 'More options' });
  }
  fireEvent.click(more);
  return screen.getByRole('dialog', { name: 'Task options' });
};

const seed = () => {
  let parent = '';
  act(() => {
    const s = useTaskStore.getState();
    parent = s.add({ title: 'Plan trip' });
    s.add({ title: 'Existing child', parentId: parent });
  });
  return parent;
};

/** Types one character at a time the way a keyboard does: keydown, input, keyup. */
function typeInto(input: HTMLInputElement, text: string) {
  let value = '';
  for (const ch of text) {
    const code = ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`;
    const proceeded = fireEvent.keyDown(input, { key: ch, code });
    // A handler that calls preventDefault swallows the character, exactly as in a browser.
    if (proceeded) {
      value += ch;
      fireEvent.change(input, { target: { value } });
    }
    fireEvent.keyUp(input, { key: ch, code });
  }
}

describe('Add subtask from the task menu', () => {
  it('closes the menu, adds the child after the existing children, and focuses the editor', async () => {
    render(<App />);
    const parent = seed();
    fireEvent.click(within(openMenu('Plan trip')).getByRole('button', { name: 'Add subtask' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Task options' })).not.toBeInTheDocument(),
    );
    const { tasks, editingId } = useTaskStore.getState();
    expect(tasks[parent].childIds).toHaveLength(2);
    expect(tasks[parent].childIds[1]).toBe(editingId);
    expect(tasks[editingId!]).toMatchObject({ title: '', parentId: parent });
    expect(useTaskStore.getState().rootIds).toEqual([parent]);
    expect(screen.getByLabelText('Task title')).toHaveFocus();
  });

  it('expands a collapsed parent so the new row is visible', () => {
    render(<App />);
    const parent = seed();
    act(() => useTaskStore.getState().update(parent, { collapsed: true }));
    fireEvent.click(within(openMenu('Plan trip')).getByRole('button', { name: 'Add subtask' }));
    expect(useTaskStore.getState().tasks[parent].collapsed).toBe(false);
    expect(screen.getByLabelText('Task title')).toHaveFocus();
  });

  it('Enter on desktop saves and starts a sibling (unchanged)', () => {
    mockMedia({ touch: false });
    render(<App />);
    const parent = seed();
    fireEvent.click(within(openMenu('Plan trip')).getByRole('button', { name: 'Add subtask' }));
    const input = screen.getByLabelText('Task title') as HTMLInputElement;
    expect(input).toHaveAttribute('enterkeyhint', 'next');
    typeInto(input, 'Book flights');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    const s = useTaskStore.getState();
    expect(s.tasks[parent].childIds).toHaveLength(3);
    expect(s.tasks[s.tasks[parent].childIds[1]].title).toBe('Book flights');
    expect(s.tasks[s.editingId!].title).toBe('');
  });

  describe('on a touch device', () => {
    it('primes the keyboard synchronously, then hands focus to the editor', async () => {
      mockMedia({ touch: true });
      render(<App />);
      seed();
      const proxy = document.querySelector<HTMLInputElement>('[data-focus-proxy]')!;
      expect(proxy).toBeInTheDocument();
      const focus = vi.spyOn(proxy, 'focus');
      const button = within(openMenu('Plan trip')).getByRole('button', { name: 'Add subtask' });

      let primedBeforeAdd = false;
      const unsubscribe = useTaskStore.subscribe(() => {
        primedBeforeAdd ||= focus.mock.calls.length > 0;
      });
      fireEvent.click(button);
      unsubscribe();

      expect(primedBeforeAdd).toBe(true);
      expect(proxy).toHaveAttribute('aria-hidden', 'true');
      expect(proxy).toHaveAttribute('tabindex', '-1');
      const input = screen.getByLabelText('Task title');
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('enterkeyhint', 'done');
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Task options' })).not.toBeInTheDocument(),
      );
    });

    it('Enter saves and closes the keyboard without creating a sibling', () => {
      mockMedia({ touch: true });
      render(<App />);
      const parent = seed();
      fireEvent.click(within(openMenu('Plan trip')).getByRole('button', { name: 'Add subtask' }));
      const input = screen.getByLabelText('Task title') as HTMLInputElement;
      typeInto(input, 'Book the flights to Rome');
      const blur = vi.spyOn(input, 'blur');
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      const s = useTaskStore.getState();
      expect(s.tasks[parent].childIds).toHaveLength(2);
      expect(s.tasks[s.tasks[parent].childIds[1]].title).toBe('Book the flights to Rome');
      expect(Object.keys(s.tasks)).toHaveLength(3);
      expect(s.editingId).toBeNull();
      expect(blur).toHaveBeenCalled();
      expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();
    });

    it('Enter on an empty title removes the row instead of leaving a blank one', () => {
      mockMedia({ touch: true });
      render(<App />);
      const parent = seed();
      fireEvent.click(within(openMenu('Plan trip')).getByRole('button', { name: 'Add subtask' }));
      fireEvent.keyDown(screen.getByLabelText('Task title'), { key: 'Enter', code: 'Enter' });
      expect(useTaskStore.getState().tasks[parent].childIds).toHaveLength(1);
      expect(useTaskStore.getState().editingId).toBeNull();
    });
  });
});

describe('spaces in the title editor', () => {
  // On touch the whole row is the dnd-kit activator, so its keyboard listener sees every key
  // pressed in the editor. It must not start a drag (and swallow Space) from a text field.
  for (const touch of [true, false]) {
    it(`keeps spaces and Enter for the field (${touch ? 'touch' : 'desktop'})`, () => {
      mockMedia({ touch });
      render(<App />);
      const parent = seed();
      fireEvent.click(within(openMenu('Plan trip')).getByRole('button', { name: 'Add subtask' }));
      const input = screen.getByLabelText('Task title') as HTMLInputElement;

      typeInto(input, 'Book the flights');
      expect(input.value).toBe('Book the flights');
      // No drag was picked up by the keyboard sensor, and the key was not cancelled.
      expect(useDragStore.getState().activeId).toBeNull();
      expect(fireEvent.keyDown(input, { key: ' ', code: 'Space' })).toBe(true);
      expect(fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).toBe(false); // ours

      const s = useTaskStore.getState();
      expect(s.tasks[s.tasks[parent].childIds[1]].title).toBe('Book the flights');
      expect(useDragStore.getState().activeId).toBeNull();
    });
  }

  it('does not hijack Space for the hotkeys either (no toggle of the focused row)', () => {
    mockMedia({ touch: false });
    render(<App />);
    const parent = seed();
    act(() => useUIStore.getState().setFocusedId(parent));
    fireEvent.click(within(openMenu('Plan trip')).getByRole('button', { name: 'Add subtask' }));
    const input = screen.getByLabelText('Task title');
    expect(fireEvent.keyDown(input, { key: ' ', code: 'Space' })).toBe(true);
    expect(useTaskStore.getState().tasks[parent].done).toBe(false);
  });
});
