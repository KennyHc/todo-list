import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';

/** Fakes matchMedia: `touch` answers (hover: none), `phone` the narrow-viewport query. */
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
  useUIStore.setState({ view: 'tree', tagFilter: null, focusedId: null, notice: null });
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const get = () => useTaskStore.getState();
const seed = (title: string, notes?: string) => {
  let id = '';
  act(() => {
    id = get().add({ title, notes });
  });
  return id;
};
const rowOf = (title: string) => screen.getByText(title).closest('li') as HTMLElement;

/** The row's options sheet: ⋯ on the row, or on a phone the title editor's ⋯. */
const openMenu = (title: string) => {
  const row = rowOf(title);
  let more = within(row).queryAllByRole('button', { name: 'More options' })[0];
  if (!more) {
    fireEvent.click(within(row).getByRole('button', { name: title }));
    more = within(row).getByRole('button', { name: 'More options' });
  }
  fireEvent.click(more);
  return screen.getByRole('dialog', { name: 'Task options' });
};
const editor = () => screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement;
const noEditor = () => expect(screen.queryByRole('textbox', { name: 'Note' })).toBeNull();

describe('a task without notes', () => {
  it('has no note icon or editor, and the menu offers to add one', () => {
    seed('Call Sam');
    render(<App />);
    const row = rowOf('Call Sam');
    expect(within(row).queryByRole('button', { name: /note/i })).toBeNull();
    noEditor();
    const menu = openMenu('Call Sam');
    expect(within(menu).getByRole('button', { name: 'Add note' })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Edit note' })).toBeNull();
  });
});

describe('writing a note', () => {
  it('opens a focused editor under the row from the menu, and saves on blur', async () => {
    const id = seed('Call Sam');
    render(<App />);
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Add note' }));
    const box = editor();
    expect(box).toHaveFocus();
    expect(box).toHaveValue('');
    expect(rowOf('Call Sam').contains(box)).toBe(true);

    fireEvent.change(box, { target: { value: 'Ask about the roof\nand the gutters' } });
    // Nothing is saved while typing.
    expect(get().tasks[id].notes).toBeUndefined();
    fireEvent.blur(box);
    expect(get().tasks[id].notes).toBe('Ask about the roof\nand the gutters');
    expect(get().undo?.label).toBe('Added note to “Call Sam”');

    // The note stays open, read-only, and the row now has the icon.
    await waitFor(() => noEditor());
    expect(within(rowOf('Call Sam')).getByText('Ask about the roof')).toBeInTheDocument();
    expect(
      within(rowOf('Call Sam')).getByRole('button', { name: 'Hide note' }),
    ).toBeInTheDocument();
  });

  it('saves on Ctrl+Enter and on Cmd+Enter, and a plain Enter just adds a line', async () => {
    const id = seed('Call Sam');
    render(<App />);
    for (const key of [{ ctrlKey: true }, { metaKey: true }]) {
      fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: /note$/ }));
      fireEvent.change(editor(), { target: { value: `text ${JSON.stringify(key)}` } });
      expect(fireEvent.keyDown(editor(), { key: 'Enter' })).toBe(true);
      expect(get().tasks[id].notes).not.toBe(`text ${JSON.stringify(key)}`);
      fireEvent.keyDown(editor(), { key: 'Enter', ...key });
      expect(get().tasks[id].notes).toBe(`text ${JSON.stringify(key)}`);
      await waitFor(() => noEditor());
      // The blur that follows the key does not save a second time.
      expect(get().undo?.label).toMatch(/note (on|to) /);
      act(() => get().dismissUndo());
      // Back to closed for the next round.
      fireEvent.click(within(rowOf('Call Sam')).getByRole('button', { name: 'Hide note' }));
      await waitFor(() => expect(screen.queryByLabelText('Note')).toBeNull());
    }
  });

  it('Esc saves the draft and closes the editor, like blur', async () => {
    const id = seed('Call Sam', 'original');
    render(<App />);
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Edit note' }));
    expect(editor()).toHaveValue('original');
    fireEvent.change(editor(), { target: { value: 'changed it\n' } });
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(get().tasks[id].notes).toBe('changed it');
    await waitFor(() => noEditor());
    // Saved once, with an undo, and shown read-only.
    expect(get().undo?.label).toBe('Edited note on \u201cCall Sam\u201d');
    expect(await screen.findByText('changed it')).toBeInTheDocument();
    act(() => get().undoLast());
    expect(get().tasks[id].notes).toBe('original');
  });

  it('Esc on a new note keeps the draft', async () => {
    const id = seed('Call Sam');
    render(<App />);
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Add note' }));
    fireEvent.change(editor(), { target: { value: 'draft' } });
    fireEvent.keyDown(editor(), { key: 'Escape' });
    await waitFor(() => noEditor());
    expect(get().tasks[id].notes).toBe('draft');
  });

  it('Esc on an empty new note leaves the task without one', async () => {
    const id = seed('Call Sam');
    render(<App />);
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Add note' }));
    fireEvent.keyDown(editor(), { key: 'Escape' });
    await waitFor(() => noEditor());
    expect(get().tasks[id].notes).toBeUndefined();
    expect(get().undo).toBeNull();
  });

  it('Esc in the editor keeps the row selected', async () => {
    const id = seed('Call Sam');
    render(<App />);
    act(() => useUIStore.getState().setFocusedId(id));
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Add note' }));
    fireEvent.change(editor(), { target: { value: 'draft' } });
    fireEvent.keyDown(editor(), { key: 'Escape' });
    await waitFor(() => noEditor());
    expect(useUIStore.getState().focusedId).toBe(id);
  });

  it('shows the save and close keys under the editor', () => {
    seed('Call Sam');
    render(<App />);
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Add note' }));
    expect(editor()).toHaveAccessibleDescription(/to save · Esc to close/);
  });

  it('saving an empty note removes it, and the icon with it', async () => {
    const id = seed('Call Sam', 'to be removed');
    render(<App />);
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Edit note' }));
    fireEvent.change(editor(), { target: { value: '  \n ' } });
    fireEvent.blur(editor());
    expect('notes' in get().tasks[id]).toBe(false);
    expect(get().undo?.label).toBe('Removed note from “Call Sam”');
    await waitFor(() => noEditor());
    expect(within(rowOf('Call Sam')).queryByRole('button', { name: /note/i })).toBeNull();
  });

  it('Undo takes an edit back', async () => {
    const id = seed('Call Sam', 'first');
    render(<App />);
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Edit note' }));
    fireEvent.change(editor(), { target: { value: 'second' } });
    fireEvent.blur(editor());
    expect(get().tasks[id].notes).toBe('second');
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(get().tasks[id].notes).toBe('first');
  });

  it('keeps hotkeys out of the editor', () => {
    const id = seed('Call Sam');
    render(<App />);
    act(() => useUIStore.getState().setFocusedId(id));
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Add note' }));
    // "n" focuses the composer elsewhere; typed into the note it must not.
    fireEvent.keyDown(editor(), { key: 'n' });
    expect(editor()).toBeInTheDocument();
  });
});

describe('a task with a note', () => {
  it('shows a small icon on the meta line that opens and closes the note read-only', async () => {
    seed('Call Sam', 'Ask about the roof');
    render(<App />);
    const row = rowOf('Call Sam');
    const icon = within(row).getByRole('button', { name: 'Show note' });
    expect(icon).toHaveAttribute('aria-expanded', 'false');
    // Closed by default: the text is not on screen.
    expect(screen.queryByText('Ask about the roof')).toBeNull();

    fireEvent.click(icon);
    expect(await screen.findByText('Ask about the roof')).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-expanded', 'true');
    expect(icon).toHaveAccessibleName('Hide note');
    noEditor();

    fireEvent.click(icon);
    await waitFor(() => expect(screen.queryByText('Ask about the roof')).toBeNull());
  });

  it('renders links as the usual chips, and clicking the text edits it', async () => {
    const id = seed('Call Sam', 'See https://github.com/a/b for details\nhttps://example.com/x');
    render(<App />);
    fireEvent.click(within(rowOf('Call Sam')).getByRole('button', { name: 'Show note' }));
    const note = await screen.findByRole('group', { name: 'Note' });
    expect(within(note).getByText('See for details')).toBeInTheDocument();
    const chips = within(note).getAllByRole('link');
    expect(chips.map((a) => a.getAttribute('href'))).toEqual([
      'https://github.com/a/b',
      'https://example.com/x',
    ]);
    expect(within(note).getByText('github.com')).toBeInTheDocument();
    // The full text is untouched in the data.
    expect(get().tasks[id].notes).toContain('https://github.com/a/b');

    // Clicking a chip opens the link; it does not start editing.
    fireEvent.click(chips[0]);
    noEditor();
    // Clicking the text edits, with the original text (links and all).
    fireEvent.click(within(note).getByText('See for details'));
    expect(editor()).toHaveValue('See https://github.com/a/b for details\nhttps://example.com/x');
  });

  it('keeps blank lines and line breaks in the read-only note', async () => {
    seed('Call Sam', 'one\n\ntwo');
    render(<App />);
    fireEvent.click(within(rowOf('Call Sam')).getByRole('button', { name: 'Show note' }));
    const note = await screen.findByRole('group', { name: 'Note' });
    expect(note.querySelectorAll('p')).toHaveLength(3);
  });

  it('Edit note opens the editor with the text; removing it from elsewhere closes the note', async () => {
    const id = seed('Call Sam', 'hello');
    render(<App />);
    fireEvent.click(within(openMenu('Call Sam')).getByRole('button', { name: 'Edit note' }));
    expect(editor()).toHaveValue('hello');
    fireEvent.keyDown(editor(), { key: 'Escape' });
    await waitFor(() => noEditor());

    await screen.findByText('hello');
    act(() => get().update(id, { notes: '' }));
    await waitFor(() => expect(screen.queryByText('hello')).toBeNull());
  });

  it('does not change a row without notes', () => {
    seed('Plain');
    seed('Noted', 'x');
    render(<App />);
    expect(within(rowOf('Plain')).queryByRole('button', { name: /note/i })).toBeNull();
    expect(within(rowOf('Noted')).getByRole('button', { name: 'Show note' })).toBeInTheDocument();
  });
});

describe('on a phone', () => {
  it('the options sheet adds a note, with the editor opening under the title', async () => {
    mockMedia({ touch: true });
    const id = seed('Call Sam');
    render(<App />);
    const menu = openMenu('Call Sam');
    fireEvent.click(within(menu).getByRole('button', { name: 'Add note' }));
    const box = editor();
    expect(rowOf('Call Sam').contains(box)).toBe(true);
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: 'from my phone' } });
    fireEvent.blur(box);
    expect(get().tasks[id].notes).toBe('from my phone');
    await waitFor(() => noEditor());
    expect(
      within(rowOf('Call Sam')).getByRole('button', { name: 'Hide note' }),
    ).toBeInTheDocument();
  });

  it('the icon toggles the note, and the sheet says Edit note', async () => {
    mockMedia({ touch: true });
    seed('Call Sam', 'tap me');
    render(<App />);
    fireEvent.click(within(rowOf('Call Sam')).getByRole('button', { name: 'Show note' }));
    expect(await screen.findByText('tap me')).toBeInTheDocument();
    const menu = openMenu('Call Sam');
    expect(within(menu).getByRole('button', { name: 'Edit note' })).toBeInTheDocument();
  });
});
