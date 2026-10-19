import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { DifficultyIcon } from './DifficultyIcon';

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({ view: 'tree', tagFilter: null, focusedId: null, deleteRequestId: null });
});

describe('DifficultyIcon', () => {
  it('fills one bar per level and describes itself', () => {
    const { container, rerender } = render(<DifficultyIcon value={3} onChange={() => {}} />);
    const button = screen.getByRole('button', { name: 'Difficulty 3 of 5, Medium — change' });
    expect(button).toHaveAttribute('title', 'Medium');
    expect(container.querySelectorAll('rect')).toHaveLength(5);
    expect(container.querySelectorAll('rect[data-filled="true"]')).toHaveLength(3);
    rerender(<DifficultyIcon value={5} onChange={() => {}} />);
    expect(container.querySelectorAll('rect[data-filled="true"]')).toHaveLength(5);
  });

  it('opens a menu and reports the chosen level', () => {
    const onChange = vi.fn();
    render(<DifficultyIcon value={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^Difficulty 2 of 5/ }));
    const menu = screen.getByRole('dialog', { name: 'Difficulty' });
    expect(within(menu).getByText('Easy')).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('radio', { name: 'Difficulty 4 of 5, Hard' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('closes shortly after a choice, and on Escape', async () => {
    render(<DifficultyIcon value={2} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Difficulty 2 of 5/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Difficulty 3 of 5, Medium' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Difficulty 2 of 5/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves with arrow keys and commits with Enter', () => {
    const onChange = vi.fn();
    render(<DifficultyIcon value={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^Difficulty 2 of 5/ }));
    const current = screen.getByRole('radio', { name: 'Difficulty 2 of 5, Easy' });
    expect(current).toHaveFocus();
    fireEvent.keyDown(current, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    const next = screen.getByRole('radio', { name: 'Difficulty 3 of 5, Medium' });
    expect(next).toHaveFocus();
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });
});

describe('task menu', () => {
  const openMenu = (title: string) => {
    const row = screen.getByText(title).closest('li') as HTMLElement;
    fireEvent.click(within(row).getAllByRole('button', { name: 'More options' })[0]);
    return screen.getByRole('dialog', { name: 'Task options' });
  };

  it('changes the difficulty of a leaf', () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Task', difficulty: 1 });
    });
    const menu = openMenu('Task');
    fireEvent.click(within(menu).getByRole('radio', { name: 'Difficulty 5 of 5, Huge' }));
    expect(Object.values(useTaskStore.getState().tasks)[0].difficulty).toBe(5);
  });

  it('explains that a parent sums its subtasks', () => {
    render(<App />);
    act(() => {
      const s = useTaskStore.getState();
      const p = s.add({ title: 'Parent' });
      s.add({ title: 'A', parentId: p, difficulty: 2 });
      s.add({ title: 'B', parentId: p, difficulty: 3 });
    });
    const menu = openMenu('Parent');
    expect(within(menu).getByText('Difficulty is the sum of subtasks (Σ 5)')).toBeInTheDocument();
    expect(within(menu).queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('adds a subtask from the menu', () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Task' });
    });
    const menu = openMenu('Task');
    fireEvent.click(within(menu).getByRole('button', { name: 'Add subtask' }));
    expect(screen.getByLabelText('Task title')).toBeInTheDocument();
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(2);
  });

  it('deletes a leaf from the menu', async () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Task' });
    });
    fireEvent.click(within(openMenu('Task')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0));
  });

  it('asks before deleting a parent from the menu', async () => {
    render(<App />);
    act(() => {
      const s = useTaskStore.getState();
      s.add({ title: 'Child', parentId: s.add({ title: 'Parent' }) });
    });
    fireEvent.click(within(openMenu('Parent')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0));
  });
});

describe('theme control', () => {
  it('is gone from the header and lives in the account menu', () => {
    render(<App />);
    expect(screen.queryByRole('radiogroup', { name: 'Theme' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    const menu = screen.getByRole('menu', { name: 'Account' });
    const group = within(menu).getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
  });
});
