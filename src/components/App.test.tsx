import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { addDays } from '../lib/dates';
import { todayISO } from '../lib/views';
import { useAuthStore } from '../store/auth';
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

/** The undo toast. dnd-kit keeps its own (empty) role="status" announcer on the page. */
const queryToast = () =>
  screen.queryAllByRole('status').find((el) => within(el).queryByRole('button', { name: 'Undo' }));
const findToast = () =>
  waitFor(() => {
    const toast = queryToast();
    if (!toast) throw new Error('no undo toast');
    return toast;
  });

function addViaInput(title: string) {
  const input = screen.getByLabelText('New task');
  fireEvent.change(input, { target: { value: title } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('first run after sign-in', () => {
  it('focuses the composer and welcomes the user when there are no tasks', () => {
    useAuthStore.setState({ freshSignIn: true });
    render(<App />);
    expect(screen.getByLabelText('New task')).toHaveFocus();
    expect(screen.getByText("What's on your mind?")).toBeInTheDocument();
    expect(screen.getByText('Type a task above and press Enter.')).toBeInTheDocument();
    useAuthStore.setState({ freshSignIn: false });
  });
});

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
    const toast = await findToast();
    expect(within(toast).getByText('Deleted \u201cBuy milk\u201d')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Buy milk')).not.toBeInTheDocument());
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Buy milk')).toBeInTheDocument();
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(1);
    await waitFor(() => expect(queryToast()).toBeUndefined());
  });

  it('shows an undo toast after checking a task', () => {
    render(<App />);
    addViaInput('Write docs');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Write docs' }));
    expect(queryToast()).toHaveTextContent('Completed \u201cWrite docs\u201d');
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

  it('sets the difficulty from the icon menu', () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Task', difficulty: 1 });
    });
    fireEvent.click(screen.getByRole('button', { name: /^Difficulty 1 of 5, Trivial/ }));
    const menu = screen.getByRole('dialog', { name: 'Difficulty' });
    fireEvent.click(within(menu).getByRole('radio', { name: 'Difficulty 4 of 5, Hard' }));
    expect(Object.values(useTaskStore.getState().tasks)[0].difficulty).toBe(4);
    expect(screen.getByRole('button', { name: /^Difficulty 4 of 5, Hard/ })).toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
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

  it('toggles the focused task with x and Space, moving focus on when it leaves the list', () => {
    const { a, b } = seed();
    render(<App />);
    press('j');
    press('x');
    expect(useTaskStore.getState().tasks[a].done).toBe(true);
    // Alpha is filed in History; focus moves to the next row that stays.
    expect(useUIStore.getState().focusedId).toBe(b);
    press(' ');
    expect(useTaskStore.getState().tasks[b].done).toBe(true);
    expect(useTaskStore.getState().tasks[a].done).toBe(true);
  });

  it('skips completed rows with j and k', () => {
    const { a, b, c } = seed();
    render(<App />);
    act(() => useTaskStore.getState().toggle(b));
    press('j');
    expect(useUIStore.getState().focusedId).toBe(a);
    press('j');
    expect(useUIStore.getState().focusedId).toBe(c);
    press('k');
    expect(useUIStore.getState().focusedId).toBe(a);
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

describe('drag and drop', () => {
  const grips = () => screen.queryAllByRole('button', { name: /^Reorder / });

  function seed() {
    const s = useTaskStore.getState();
    const a = s.add({ title: 'Alpha', tags: ['x'] });
    const b = s.add({ title: 'Bravo' });
    return { a, b };
  }

  it('shows a drag handle on every tree row', () => {
    seed();
    render(<App />);
    expect(grips().map((g) => g.getAttribute('aria-label'))).toEqual([
      'Reorder Alpha',
      'Reorder Bravo',
    ]);
  });

  it('hides the handles while a tag filter is active', () => {
    seed();
    useUIStore.setState({ tagFilter: 'x' });
    render(<App />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(grips()).toHaveLength(0);
  });

  it('has no handles in the deadline view', () => {
    seed();
    useUIStore.setState({ view: 'deadline' });
    render(<App />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(grips()).toHaveLength(0);
  });

  describe('Alt+arrow shortcuts', () => {
    const press = (key: string) =>
      act(() => {
        fireEvent.keyDown(document.body, { key, altKey: true });
      });
    const roots = () => useTaskStore.getState().rootIds;
    const parentOf = (id: string) => useTaskStore.getState().tasks[id].parentId;

    function three() {
      const s = useTaskStore.getState();
      const a = s.add({ title: 'Alpha' });
      const b = s.add({ title: 'Bravo' });
      const c = s.add({ title: 'Charlie' });
      return { a, b, c };
    }

    it('Alt+ArrowUp and Alt+ArrowDown move the focused row among its siblings', () => {
      const { a, b, c } = three();
      render(<App />);
      act(() => useUIStore.getState().setFocusedId(b));
      press('ArrowUp');
      expect(roots()).toEqual([b, a, c]);
      press('ArrowUp'); // already first: nothing happens
      expect(roots()).toEqual([b, a, c]);
      press('ArrowDown');
      press('ArrowDown');
      expect(roots()).toEqual([a, c, b]);
      expect(useTaskStore.getState().undo?.label).toBe('Moved “Bravo”');
    });

    it('Alt+ArrowRight indents under the previous sibling and Alt+ArrowLeft outdents', () => {
      const { a, b, c } = three();
      render(<App />);
      act(() => useUIStore.getState().setFocusedId(b));
      press('ArrowRight');
      expect(parentOf(b)).toBe(a);
      expect(roots()).toEqual([a, c]);
      expect(useUIStore.getState().focusedId).toBe(b);
      press('ArrowLeft');
      expect(parentOf(b)).toBeNull();
      expect(roots()).toEqual([a, b, c]);
    });

    it('opens a collapsed parent so the indented row stays visible', () => {
      const { a, b } = three();
      useTaskStore.getState().add({ title: 'Child', parentId: a });
      useTaskStore.getState().update(a, { collapsed: true });
      render(<App />);
      act(() => useUIStore.getState().setFocusedId(b));
      press('ArrowRight');
      expect(useTaskStore.getState().tasks[a].collapsed).toBe(false);
    });

    it('does nothing without a focused row or outside the tree view', () => {
      const { a, b } = three();
      render(<App />);
      press('ArrowUp');
      expect(roots()[0]).toBe(a);
      useUIStore.setState({ view: 'deadline', focusedId: b });
      press('ArrowRight');
      expect(parentOf(b)).toBeNull();
    });
  });
});

describe('completing tasks', () => {
  const rowIds = () => [...document.querySelectorAll('[data-row-id]')].map((el) => el.textContent);
  const gone = (title: string) =>
    waitFor(() => expect(screen.queryByRole('checkbox', { name: `Done: ${title}` })).toBeNull(), {
      timeout: 3000,
    });
  const openHistory = async () => {
    fireEvent.click(screen.getByRole('radio', { name: 'History' }));
    await screen.findByRole('button', { name: 'Edit' });
  };

  it('keeps a checked task struck through for a beat, then files it in History', async () => {
    render(<App />);
    act(() => void useTaskStore.getState().add({ title: 'Ship it' }));
    act(() => void useTaskStore.getState().add({ title: 'Other' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Ship it' }));
    expect(screen.getByRole('checkbox', { name: 'Done: Ship it' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(rowIds()).toHaveLength(2);
    await gone('Ship it');
    expect(rowIds()).toHaveLength(1);
    expect(useTaskStore.getState().history.map((e) => e.title)).toEqual(['Ship it']);
    await openHistory();
    expect(screen.getByText('Ship it')).toBeInTheDocument();
  });

  it('removes a completed subtask at once; the parent stays and shows its progress', async () => {
    render(<App />);
    let kid = '';
    act(() => {
      const p = useTaskStore.getState().add({ title: 'Project' });
      kid = useTaskStore.getState().add({ title: 'Step one', parentId: p });
      useTaskStore.getState().add({ title: 'Step two', parentId: p });
    });
    expect(screen.getByText('0/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Step one' }));
    await gone('Step one');
    expect(screen.getByRole('checkbox', { name: 'Done: Project' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('Step two')).toBeInTheDocument();
    expect(useTaskStore.getState().tasks[kid].done).toBe(true);
  });

  it('removes a whole project when its last subtask completes it', async () => {
    render(<App />);
    act(() => {
      const p = useTaskStore.getState().add({ title: 'Project' });
      useTaskStore.getState().add({ title: 'Only step', parentId: p });
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Only step' }));
    await gone('Project');
    expect(rowIds()).toHaveLength(0);
    expect(await screen.findByText('All clear. Nice work.')).toBeInTheDocument();
  });

  it('Undo during the hold keeps the row, with nothing removed afterwards', async () => {
    render(<App />);
    act(() => void useTaskStore.getState().add({ title: 'Oops' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Oops' }));
    fireEvent.click((await findToast()).querySelector('button')!);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.getByRole('checkbox', { name: 'Done: Oops' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('the deadline view has no Completed section', async () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Dated', dueDate: '2099-01-01' });
      useTaskStore.getState().add({ title: 'Finished' });
    });
    fireEvent.click(screen.getByRole('radio', { name: 'By deadline' }));
    // Deadline sections show up once the Tree has faded out.
    expect(await screen.findByText('No deadline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Finished' }));
    await gone('Finished');
    expect(screen.queryByText('Completed')).toBeNull();
    // The section it sat in goes with it.
    await waitFor(() => expect(screen.queryByText('No deadline')).toBeNull());
    expect(screen.getByText('Dated')).toBeInTheDocument();
  });

  it('restores a task from History into the Tree, with an Undo toast', async () => {
    render(<App />);
    let id = '';
    act(() => void (id = useTaskStore.getState().add({ title: 'Again' })));
    act(() => useTaskStore.getState().toggle(id));
    await gone('Again');
    await openHistory();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Again' }));
    expect(useTaskStore.getState().tasks[id].done).toBe(false);
    expect(useTaskStore.getState().history).toEqual([]);
    await waitFor(() => expect(queryToast()?.textContent).toContain('Restored \u201cAgain\u201d'));
    fireEvent.click(screen.getByRole('radio', { name: 'Tree' }));
    expect(await screen.findByRole('checkbox', { name: 'Done: Again' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('disables the check of an entry whose task was deleted', async () => {
    render(<App />);
    let id = '';
    act(() => void (id = useTaskStore.getState().add({ title: 'Gone' })));
    act(() => useTaskStore.getState().toggle(id));
    await gone('Gone');
    act(() => useTaskStore.getState().remove(id));
    await openHistory();
    const check = screen.getByRole('checkbox', { name: 'Done: Gone' });
    expect(check).toBeDisabled();
    expect(check).toHaveAttribute('title', 'This task was deleted');
  });
});

describe('History edit mode', () => {
  async function completedHistory(titles: string[]) {
    render(<App />);
    const ids: string[] = [];
    act(() => {
      for (const title of titles) ids.push(useTaskStore.getState().add({ title }));
    });
    act(() => {
      for (const id of ids) useTaskStore.getState().toggle(id);
    });
    await waitFor(() => expect(document.querySelector('[data-row-id]')).toBeNull(), {
      timeout: 3000,
    });
    fireEvent.click(screen.getByRole('radio', { name: 'History' }));
    await screen.findByRole('button', { name: 'Edit' });
    return ids;
  }

  it('shows delete buttons in edit mode; deleting removes the task for good, and Undo restores it', async () => {
    const [id] = await completedHistory(['First', 'Second']);
    expect(screen.queryByRole('button', { name: /Delete ".*" permanently/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    const del = await screen.findByRole('button', { name: 'Delete "First" permanently' });
    fireEvent.click(del);
    expect(useTaskStore.getState().tasks[id]).toBeUndefined();
    await waitFor(() => expect(screen.queryByText('First')).toBeNull());
    expect(screen.getByText('Second')).toBeInTheDocument();
    await waitFor(() => expect(queryToast()?.textContent).toContain('Deleted “First”'));
    fireEvent.click(within(queryToast()!).getByRole('button', { name: 'Undo' }));
    expect(useTaskStore.getState().tasks[id].done).toBe(true);
    expect(await screen.findByText('First')).toBeInTheDocument();
  });

  it('Done and Escape leave edit mode', async () => {
    await completedHistory(['One']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('button', { name: 'Delete "One" permanently' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Delete "One" permanently' })).toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('button', { name: 'Delete "One" permanently' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument());
  });

  it('Delete all asks first, then deletes every completed task in one undo', async () => {
    await completedHistory(['One', 'Two']);
    act(() => void useTaskStore.getState().add({ title: 'Still open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete all' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('2 completed tasks');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(useTaskStore.getState().history).toHaveLength(2);

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete all' }),
    );
    expect(useTaskStore.getState().history).toEqual([]);
    expect(Object.values(useTaskStore.getState().tasks).map((t) => t.title)).toEqual([
      'Still open',
    ]);
    await waitFor(() => expect(queryToast()?.textContent).toContain('Deleted all completed (2)'));
    expect(await screen.findByText('No completed tasks yet')).toBeInTheDocument();
  });
});
