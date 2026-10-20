import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { TaskInput } from './TaskInput';

// Tue 20 Oct 2026, local time.
const NOW = new Date(2026, 9, 20, 10, 30);

beforeEach(() => {
  vi.useRealTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetTaskStore();
});

afterEach(() => {
  vi.useRealTimers();
});

const type = (value: string) => {
  const input = screen.getByLabelText('New task');
  fireEvent.change(input, { target: { value } });
  return input;
};
const submit = (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Enter' });
const tasks = () => Object.values(useTaskStore.getState().tasks);
const chips = () => screen.queryByRole('list', { name: 'Recognised in this task' });

describe('quick add in the composer', () => {
  it('creates a task from "Pay rent tomorrow #home !2"', () => {
    render(<TaskInput />);
    submit(type('Pay rent tomorrow #home !2'));
    expect(tasks()).toHaveLength(1);
    expect(tasks()[0]).toMatchObject({
      title: 'Pay rent',
      tags: ['home'],
      dueDate: '2026-10-21',
      difficulty: 2,
    });
    expect(screen.getByLabelText('New task')).toHaveValue('');
  });

  it('shows a chip for each recognised part with the right label', () => {
    render(<TaskInput />);
    type('Pay rent tomorrow #home !2');
    const row = chips()!;
    expect(within(row).getByText('Tomorrow')).toBeInTheDocument();
    expect(within(row).getByTitle('Difficulty 2')).toHaveTextContent('2');
    expect(within(row).getByText('home')).toBeInTheDocument();
    expect(within(row).getAllByRole('button')).toHaveLength(3);
  });

  it('dismissing the date chip keeps the phrase in the title and sets no date', async () => {
    render(<TaskInput />);
    const input = type('Pay rent tomorrow');
    fireEvent.click(screen.getByRole('button', { name: /Don't treat "tomorrow" as a due date/ }));
    await waitFor(() => expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument());
    expect(input).toHaveValue('Pay rent tomorrow');
    submit(input);
    expect(tasks()[0]).toMatchObject({ title: 'Pay rent tomorrow', dueDate: null });
  });

  it('forgets dismissals once the input is cleared', () => {
    render(<TaskInput />);
    type('Pay rent tomorrow');
    fireEvent.click(screen.getByRole('button', { name: /Don't treat "tomorrow"/ }));
    type('');
    type('Pay rent tomorrow');
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
  });

  it('a due date picked in the toolbar wins over the parsed one', () => {
    render(<TaskInput />);
    const input = type('Pay rent tomorrow');
    fireEvent.click(screen.getByRole('button', { name: /Due date/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    submit(input);
    expect(tasks()[0]).toMatchObject({ title: 'Pay rent', dueDate: '2026-10-20' });
  });

  it('keeps "tomorrow" as the title when it is the whole input', () => {
    render(<TaskInput />);
    const input = type('tomorrow');
    expect(chips()).not.toBeInTheDocument();
    submit(input);
    expect(tasks()[0]).toMatchObject({ title: 'tomorrow', dueDate: null });
  });

  it('leaves the default difficulty alone when none is typed', () => {
    render(<TaskInput />);
    submit(type('Plain task'));
    expect(tasks()[0].difficulty).toBe(1);
  });

  it('does not consume repeat phrases until repeats are supported', () => {
    render(<TaskInput />);
    submit(type('Gym every monday'));
    expect(tasks()[0]).toMatchObject({ title: 'Gym every monday', dueDate: null });
  });

  it('can dismiss a tag chip, leaving #tag in the title', () => {
    render(<TaskInput />);
    const input = type('Buy milk #home');
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag home' }));
    submit(input);
    expect(tasks()[0]).toMatchObject({ title: 'Buy milk #home', tags: [] });
  });

  it('keeps the #tag autocomplete working', () => {
    render(<TaskInput />);
    act(() => {
      useTaskStore.getState().add({ title: 'Old', tags: ['work'] });
    });
    const input = screen.getByLabelText('New task');
    fireEvent.change(input, { target: { value: 'Ship #wo', selectionStart: 8 } });
    expect(screen.getByRole('option', { name: /#work/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveValue('Ship #work ');
  });
});

describe('placeholder', () => {
  it('cycles through examples while focused and empty, keeping the aria-label', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    render(<TaskInput />);
    const input = screen.getByLabelText('New task');
    expect(input).toHaveAttribute('placeholder', 'Add a task…');
    act(() => input.focus());
    act(() => {
      vi.advanceTimersByTime(4000 + 200);
    });
    expect(input).toHaveAttribute('placeholder', 'Pay rent tomorrow #home');
    expect(input).toHaveAttribute('aria-label', 'New task');
    act(() => {
      vi.advanceTimersByTime(4000 + 200);
    });
    expect(input).toHaveAttribute('placeholder', 'Draft report fri !3');
  });

  it('does not cycle when unfocused', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    render(<TaskInput />);
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(screen.getByLabelText('New task')).toHaveAttribute('placeholder', 'Add a task…');
  });
});
