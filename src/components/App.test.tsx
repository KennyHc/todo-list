import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { resetTaskStore, useTaskStore } from '../store/tasks';

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
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
});
