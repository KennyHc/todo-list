import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { addDays } from '../lib/dates';
import { todayISO } from '../lib/views';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';

/** Desktop: a fine pointer with hover, so rows show their "+" and the Enter key adds a sibling. */
function mockMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    // framer-motion's reduced-motion check still uses the old listener API.
    addListener: () => {},
    removeListener: () => {},
  })) as never;
}

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({ view: 'tree', tagFilter: null, focusedId: null });
  mockMedia();
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const rowOf = (title: string) => screen.getByText(title).closest('li') as HTMLElement;
const editor = () => screen.getByLabelText('Task title') as HTMLInputElement;
const chips = () => screen.queryByRole('list', { name: 'Recognised in this task' });
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } });
const enter = () => fireEvent.keyDown(editor(), { key: 'Enter', code: 'Enter' });
const childOf = (parent: string, i: number) => {
  const { tasks } = useTaskStore.getState();
  return tasks[tasks[parent].childIds[i]];
};

describe('quick-add syntax in a new subtask', () => {
  it('parses tags, difficulty, dates and repeats from the row "+"', () => {
    render(<App />);
    let parent = '';
    act(() => {
      parent = useTaskStore.getState().add({ title: 'Plan trip' });
    });
    fireEvent.click(within(rowOf('Plan trip')).getByRole('button', { name: 'Add subtask' }));
    type('Book flights !3 #travel tomorrow');

    const list = chips()!;
    expect(within(list).getByText('Tomorrow')).toBeInTheDocument();
    expect(within(list).getByText('3')).toBeInTheDocument();
    expect(within(list).getByText('travel')).toBeInTheDocument();

    enter();
    const child = childOf(parent, 0);
    expect(child).toMatchObject({
      title: 'Book flights',
      difficulty: 3,
      tags: ['travel'],
      dueDate: addDays(todayISO(), 1),
    });
  });

  it('parses a repeat from "Add subtasks →" and gives the task its first occurrence', () => {
    render(<App />);
    let parent = '';
    act(() => {
      parent = useTaskStore.getState().add({ title: 'Big job', difficulty: 5 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add subtasks →' }));
    type('Water plants daily');
    expect(within(chips()!).getByText('Daily')).toBeInTheDocument();
    enter();
    expect(childOf(parent, 0)).toMatchObject({
      title: 'Water plants',
      repeat: { every: 'day' },
      dueDate: todayISO(),
    });
  });

  it('dismissing a chip keeps the phrase in the title', () => {
    render(<App />);
    let parent = '';
    act(() => {
      parent = useTaskStore.getState().add({ title: 'Plan trip' });
    });
    fireEvent.click(within(rowOf('Plan trip')).getByRole('button', { name: 'Add subtask' }));
    type('Read chapter !3');
    fireEvent.click(screen.getByRole('button', { name: `Don't treat "!3" as a difficulty` }));
    expect(chips()).not.toBeInTheDocument();
    expect(editor()).toHaveFocus();
    enter();
    expect(childOf(parent, 0)).toMatchObject({ title: 'Read chapter !3', difficulty: 1 });
  });
});

describe('quick-add syntax when renaming', () => {
  const seed = () => {
    let id = '';
    act(() => {
      id = useTaskStore.getState().add({
        title: 'Old name',
        tags: ['home'],
        difficulty: 2,
        dueDate: '2030-01-15',
      });
    });
    return id;
  };
  const rename = (text: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Old name' }));
    type(text);
    fireEvent.blur(editor());
  };

  it('keeps existing fields unless the new text sets them', () => {
    render(<App />);
    const id = seed();
    rename('Book flights #travel');
    expect(useTaskStore.getState().tasks[id]).toMatchObject({
      title: 'Book flights',
      tags: ['home', 'travel'],
      difficulty: 2,
      dueDate: '2030-01-15',
    });
  });

  it('replaces the fields the new text sets', () => {
    render(<App />);
    const id = seed();
    rename('Book flights !4 tomorrow');
    expect(useTaskStore.getState().tasks[id]).toMatchObject({
      title: 'Book flights',
      tags: ['home'],
      difficulty: 4,
      dueDate: addDays(todayISO(), 1),
    });
  });

  it('leaves phrases already in the saved title alone', () => {
    render(<App />);
    let id = '';
    act(() => {
      id = useTaskStore.getState().add({ title: 'Meeting on friday' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Meeting on friday' }));
    expect(chips()).not.toBeInTheDocument();
    type('Meeting on friday !2');
    fireEvent.blur(editor());
    expect(useTaskStore.getState().tasks[id]).toMatchObject({
      title: 'Meeting on friday',
      difficulty: 2,
      dueDate: null,
    });
  });
});
