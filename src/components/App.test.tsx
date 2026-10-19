import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { addDays } from '../lib/dates';
import { todayISO } from '../lib/views';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({
    view: 'tree',
    tagFilter: null,
    focusedId: null,
    filterOpen: false,
    paletteOpen: false,
    sheetOpen: false,
    deleteRequestId: null,
    revealFlash: null,
  });
});

function addViaInput(title: string) {
  const input = screen.getByLabelText('New task');
  fireEvent.change(input, { target: { value: title } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('App', () => {
  it('shows the empty state, then a task added via the input', () => {
    render(<App />);
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
    addViaInput('Buy milk');
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
    expect(screen.queryByText(/all clear/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('New task')).toHaveValue('');
  });

  it('checks a box and auto-completes the parent when its only child is done', () => {
    render(<App />);
    addViaInput('Parent');
    fireEvent.click(screen.getByRole('button', { name: 'Add subtask' }));
    const editor = screen.getByLabelText('Task title');
    fireEvent.change(editor, { target: { value: 'Child' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    // Enter opened a new empty sibling; escape discards it.
    fireEvent.keyDown(screen.getByLabelText('Task title'), { key: 'Escape' });

    const child = screen.getByRole('checkbox', { name: 'Done: Child' });
    expect(child).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(child);
    expect(screen.getByRole('checkbox', { name: 'Done: Child' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Done: Parent' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('shows the difficulty sum on a parent', () => {
    render(<App />);
    act(() => {
      const s = useTaskStore.getState();
      const p = s.add({ title: 'Parent' });
      s.add({ title: 'A', parentId: p, difficulty: 2 });
      s.add({ title: 'B', parentId: p, difficulty: 3 });
    });
    const parentRow = screen.getByText('Parent').closest('li')!;
    expect(within(parentRow).getAllByText('Σ 5')[0]).toBeInTheDocument();
    expect(within(parentRow).getAllByText('0/2')[0]).toBeInTheDocument();
  });

  it('deletes a leaf task straight away, without a dialog', async () => {
    render(<App />);
    addViaInput('Buy milk');
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // The row shakes first, then the store removal runs its exit animation.
    await waitFor(() => expect(screen.queryByText('Buy milk')).not.toBeInTheDocument());
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0);
  });

  it('shows an undo toast after deleting a leaf, and Undo brings it back', async () => {
    render(<App />);
    addViaInput('Buy milk');
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    const toast = await screen.findByRole('status');
    expect(within(toast).getByText('Deleted \u201cBuy milk\u201d')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Buy milk')).not.toBeInTheDocument());
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Buy milk')).toBeInTheDocument();
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('shows an undo toast after checking a task', () => {
    render(<App />);
    addViaInput('Write docs');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Write docs' }));
    expect(screen.getByRole('status')).toHaveTextContent('Completed \u201cWrite docs\u201d');
  });

  it('asks before deleting a parent and keeps it on Cancel', async () => {
    render(<App />);
    act(() => {
      const s = useTaskStore.getState();
      const p = s.add({ title: 'Parent' });
      s.add({ title: 'A', parentId: p });
      s.add({ title: 'B', parentId: p });
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete task' })[0]);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete "Parent"?')).toBeInTheDocument();
    expect(within(dialog).getByText('This will also delete 2 subtasks.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(3);
  });

  it('deletes a parent with its subtasks once confirmed', async () => {
    render(<App />);
    act(() => {
      const s = useTaskStore.getState();
      s.add({ title: 'Child', parentId: s.add({ title: 'Parent' }) });
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete task' })[0]);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('This will also delete 1 subtask.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0));
  });

  it('quick-add #tags become the new task tags and leave the title clean', () => {
    render(<App />);
    addViaInput('Buy milk #home #Errands');
    const task = Object.values(useTaskStore.getState().tasks)[0];
    expect(task.title).toBe('Buy milk');
    expect(task.tags).toEqual(['home', 'errands']);
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('suggests existing tags while typing a #prefix and accepts one with Tab', () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Old', tags: ['work'] });
    });
    const input = screen.getByLabelText('New task');
    fireEvent.change(input, { target: { value: 'Ship #wo', selectionStart: 8 } });
    expect(screen.getByRole('option', { name: /#work/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveValue('Ship #work ');
  });

  it('sets the difficulty by clicking a segment', () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Task', difficulty: 1 });
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Difficulty 4 of 5, Hard' }));
    expect(Object.values(useTaskStore.getState().tasks)[0].difficulty).toBe(4);
    expect(screen.getByRole('radiogroup', { name: 'Difficulty 4 of 5, Hard' })).toBeInTheDocument();
  });

  it('lists tasks flat by deadline with a breadcrumb for subtasks', async () => {
    render(<App />);
    const today = todayISO();
    act(() => {
      const s = useTaskStore.getState();
      const p = s.add({ title: 'Launch website', dueDate: addDays(today, 9) });
      s.add({ title: 'Build pages', parentId: p, dueDate: addDays(today, 1) });
      s.add({ title: 'Late one', dueDate: addDays(today, -2) });
    });
    fireEvent.click(screen.getByRole('radio', { name: 'By deadline' }));

    const late = await screen.findByRole('button', { name: 'Late one' });
    const build = screen.getByRole('button', { name: 'Build pages' });
    const launch = screen.getByRole('button', { name: 'Launch website' });
    // Ordered by date: overdue, then tomorrow, then later.
    expect(late.compareDocumentPosition(build) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(build.compareDocumentPosition(launch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow', { selector: 'li' })).toBeInTheDocument();
    // The subtask is flat, with its parent shown as a breadcrumb, and there are no chevrons.
    expect(screen.getByText('Launch website', { selector: 'div' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
  });

  it('shows a completed task in the history view', async () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Ship it', tags: ['work'] });
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Ship it' }));
    fireEvent.click(screen.getByRole('radio', { name: 'History' }));

    expect(await screen.findByText('Clear history')).toBeInTheDocument();
    expect(screen.getByText('Ship it')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.queryByText('No completed tasks yet')).not.toBeInTheDocument();
  });

  it('shows the empty history message', async () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Open' });
    });
    fireEvent.click(screen.getByRole('radio', { name: 'History' }));
    expect(await screen.findByText('No completed tasks yet')).toBeInTheDocument();
  });

  it('imports a valid backup file and shows confirm dialog', async () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Existing task' });
    });

    // Polyfill File.text() if not available (for happy-dom compatibility)
    if (!File.prototype.text) {
      Object.defineProperty(File.prototype, 'text', {
        value: async function (this: File) {
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsText(this);
          });
        },
      });
    }

    // Create a backup file
    const backupData = {
      app: 'tasks',
      version: 2,
      exportedAt: '2026-10-19T10:00:00Z',
      tasks: {
        '1': {
          id: '1',
          title: 'Restored task',
          done: false,
          collapsed: false,
          childIds: [],
          parentId: null,
          tags: [],
          dueDate: null,
          difficulty: 1,
          color: 'none',
          createdAt: 1000,
        },
      },
      rootIds: ['1'],
      history: [],
    };

    const fileContent = JSON.stringify(backupData);
    const file = new File([fileContent], 'backup.json', { type: 'application/json' });

    // Trigger file input change
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      // Wait for async file read
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Confirm dialog should appear
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Replace all tasks?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Oct 19, 2026 \(1 task\)/)).toBeInTheDocument();

    // Confirm the import
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));

    // Tasks should be replaced
    await waitFor(() => {
      const state = useTaskStore.getState();
      expect(Object.keys(state.tasks)).toHaveLength(1);
      expect(state.tasks['1'].title).toBe('Restored task');
    });

    // Undo toast should appear
    const toast = await screen.findByRole('status');
    expect(within(toast).getByText('Restored backup (1 task)')).toBeInTheDocument();
  });
});

describe('keyboard workflow', () => {
  const press = (key: string, init: KeyboardEventInit = {}) =>
    act(() => {
      fireEvent.keyDown(document.body, { key, ...init });
    });

  function seed() {
    const s = useTaskStore.getState();
    const a = s.add({ title: 'Alpha' });
    const b = s.add({ title: 'Bravo' });
    const c = s.add({ title: 'Charlie' });
    return { a, b, c };
  }

  it('moves focus with j and k through the visible rows', () => {
    const { a, b, c } = seed();
    render(<App />);
    press('j');
    expect(useUIStore.getState().focusedId).toBe(a);
    press('j');
    expect(useUIStore.getState().focusedId).toBe(b);
    press('ArrowDown');
    press('j');
    expect(useUIStore.getState().focusedId).toBe(c);
    press('k');
    expect(useUIStore.getState().focusedId).toBe(b);
    expect(screen.getByText('Bravo').closest('[data-focused]')).not.toBeNull();
    press('Escape');
    expect(useUIStore.getState().focusedId).toBeNull();
  });

  it('toggles the focused task with x and Space', () => {
    const { a } = seed();
    render(<App />);
    press('j');
    press('x');
    expect(useTaskStore.getState().tasks[a].done).toBe(true);
    press(' ');
    expect(useTaskStore.getState().tasks[a].done).toBe(false);
  });

  it('ignores shortcuts while typing in the composer', () => {
    seed();
    render(<App />);
    const input = screen.getByLabelText('New task');
    input.focus();
    fireEvent.keyDown(input, { key: 'j' });
    fireEvent.keyDown(input, { key: '?' });
    fireEvent.keyDown(input, { key: '2' });
    expect(useUIStore.getState().focusedId).toBeNull();
    expect(useUIStore.getState().sheetOpen).toBe(false);
    expect(useUIStore.getState().view).toBe('tree');
  });

  it('n focuses the composer', () => {
    render(<App />);
    press('n');
    expect(screen.getByLabelText('New task')).toHaveFocus();
  });

  it('opens the shortcuts sheet with ? and closes it with Escape', async () => {
    render(<App />);
    press('?', { shiftKey: true });
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('deletes through the confirm dialog for a parent, then focuses the next row', async () => {
    const s = useTaskStore.getState();
    const p = s.add({ title: 'Parent' });
    s.add({ title: 'Kid', parentId: p });
    const next = s.add({ title: 'Next' });
    render(<App />);
    press('j');
    expect(useUIStore.getState().focusedId).toBe(p);
    press('Backspace');
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(useTaskStore.getState().tasks[p]).toBeUndefined());
    expect(useUIStore.getState().focusedId).toBe(next);
  });

  it('sets the difficulty of the focused leaf with Alt+digit', () => {
    const { a } = seed();
    render(<App />);
    press('j');
    press('¡', { altKey: true, code: 'Digit4' });
    expect(useTaskStore.getState().tasks[a].difficulty).toBe(4);
  });

  describe('command palette', () => {
    it('opens with Cmd+K, filters as you type, and Enter reveals the task', async () => {
      const s = useTaskStore.getState();
      const parent = s.add({ title: 'Project' });
      const child = s.add({ title: 'Write the quarterly report', parentId: parent });
      s.add({ title: 'Buy milk' });
      s.update(parent, { collapsed: true });
      useUIStore.setState({ view: 'deadline' });
      render(<App />);

      press('k', { metaKey: true });
      const input = await screen.findByRole('combobox', { name: 'Search tasks and commands' });
      expect(input).toHaveFocus();

      fireEvent.change(input, { target: { value: 'quarterly' } });
      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveTextContent('Write the quarterly report');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
      expect(within(screen.getByRole('dialog')).queryByText('Buy milk')).not.toBeInTheDocument();
      expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      const state = useUIStore.getState();
      expect(state.view).toBe('tree');
      expect(state.focusedId).toBe(child);
      expect(state.paletteOpen).toBe(false);
      expect(useTaskStore.getState().tasks[parent].collapsed).toBe(false);
      expect(screen.getByText('Write the quarterly report')).toBeInTheDocument();
    });

    it('runs a command, clearing the tag filter if it hides the task', async () => {
      const s = useTaskStore.getState();
      s.add({ title: 'Tagged', tags: ['work'] });
      const plain = s.add({ title: 'Plain' });
      useUIStore.setState({ tagFilter: 'work' });
      render(<App />);
      press('k', { ctrlKey: true });
      const input = await screen.findByRole('combobox', { name: 'Search tasks and commands' });
      fireEvent.change(input, { target: { value: 'plain' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(useUIStore.getState().focusedId).toBe(plain));
      expect(useUIStore.getState().tagFilter).toBeNull();
    });

    it('lists recent tasks and commands, and runs a command', async () => {
      seed();
      render(<App />);
      press('k', { metaKey: true });
      expect(await screen.findByText('Recent')).toBeInTheDocument();
      expect(screen.getByText('Commands')).toBeInTheDocument();
      const input = screen.getByRole('combobox', { name: 'Search tasks and commands' });
      fireEvent.change(input, { target: { value: 'history' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(useUIStore.getState().view).toBe('history'));
      expect(useUIStore.getState().paletteOpen).toBe(false);
    });
  });
});
