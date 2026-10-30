import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHotkeys } from '../hooks/useHotkeys';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { TaskInput } from './TaskInput';
import { WeekView } from './WeekView';

// Tue 20 Oct 2026, local time: the week is Mon 19 - Sun 25 Oct.
const NOW = new Date(2026, 9, 20, 10, 30);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({ view: 'week', weekAnchor: null, composerDay: null, tagFilter: null });
});

afterEach(() => {
  vi.useRealTimers();
});

const renderWeek = () =>
  render(
    <>
      <TaskInput />
      <WeekView />
    </>,
  );
const composer = () => screen.getByLabelText('New task');
const type = (value: string) => fireEvent.change(composer(), { target: { value } });
const submit = () => fireEvent.keyDown(composer(), { key: 'Enter' });
const tasks = () => Object.values(useTaskStore.getState().tasks);
const addOn = (day: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Add a task on ${day}` }));
const dayOf = (date: string) => document.querySelector<HTMLElement>(`[data-date="${date}"]`)!;

describe('adding into a Week day', () => {
  it('"+" opens the composer set to that day, and the task lands there', () => {
    renderWeek();
    addOn('Thursday, Oct 22');
    expect(composer()).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Clear due date' })).toBeInTheDocument();
    type('Groceries');
    submit();
    expect(tasks()).toHaveLength(1);
    expect(tasks()[0]).toMatchObject({ title: 'Groceries', dueDate: '2026-10-22' });
    expect(
      within(dayOf('2026-10-22')).getByRole('button', { name: 'Groceries' }),
    ).toBeInTheDocument();
  });

  it('keeps the quick-add syntax, and a date typed in the text wins over the day', () => {
    renderWeek();
    addOn('Thursday, Oct 22');
    type('Pay rent tomorrow #home !2');
    submit();
    expect(tasks()[0]).toMatchObject({
      title: 'Pay rent',
      tags: ['home'],
      difficulty: 2,
      dueDate: '2026-10-21',
    });
  });

  it('only sets the day for the next task', () => {
    renderWeek();
    addOn('Saturday, Oct 24');
    type('First');
    submit();
    type('Second');
    submit();
    const byTitle = Object.fromEntries(tasks().map((t) => [t.title, t.dueDate]));
    expect(byTitle).toEqual({ First: '2026-10-24', Second: null });
  });

  it('forgets the day when the composer is cleared from its toolbar', () => {
    renderWeek();
    addOn('Friday, Oct 23');
    fireEvent.click(screen.getByRole('button', { name: 'Clear due date' }));
    type('Undated');
    submit();
    expect(tasks()[0]).toMatchObject({ title: 'Undated', dueDate: null });
  });
});

describe('the day header', () => {
  it('switches to By deadline with the first task due that day selected', () => {
    useTaskStore.getState().add({ title: 'Later', dueDate: '2026-10-25' });
    const id = useTaskStore.getState().add({ title: 'Thursday thing', dueDate: '2026-10-22' });
    renderWeek();
    act(() => {
      within(dayOf('2026-10-22')).getByTitle('Show in By deadline').click();
    });
    expect(useUIStore.getState().view).toBe('deadline');
    expect(useUIStore.getState().focusedId).toBe(id);
  });
});

function WithHotkeys() {
  useHotkeys();
  return <WeekView />;
}

describe('[ and ] in Week', () => {
  const press = (key: string) => act(() => void fireEvent.keyDown(document.body, { key }));

  it('move the selected row a day, with Undo, and the week follows past Sunday', () => {
    const id = useTaskStore.getState().add({ title: 'Report', dueDate: '2026-10-24' });
    render(<WithHotkeys />);
    useUIStore.getState().setFocusedId(id);
    press(']');
    expect(useTaskStore.getState().tasks[id].dueDate).toBe('2026-10-25');
    expect(useTaskStore.getState().undo?.label).toMatch(/^Moved “Report” to Sun, /);
    press(']');
    expect(useTaskStore.getState().tasks[id].dueDate).toBe('2026-10-26');
    expect(useUIStore.getState().weekAnchor).toBe('2026-10-26');
    press('[');
    press('[');
    expect(useTaskStore.getState().tasks[id].dueDate).toBe('2026-10-24');
    expect(useUIStore.getState().weekAnchor).toBeNull();
  });
});
