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
  useUIStore.setState({ view: 'tree', tagFilter: null });
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
});
