import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { DuePill } from './DuePill';

// Tue 20 Oct 2026, local time.
const NOW = new Date(2026, 9, 20, 10, 30);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({ view: 'tree', tagFilter: null, focusedId: null, deleteRequestId: null });
});

afterEach(() => vi.useRealTimers());

const tasks = () => Object.values(useTaskStore.getState().tasks);
const byTitle = (title: string) => tasks().filter((t) => t.title === title);

const openMenu = (title: string) => {
  const row = screen.getByText(title).closest('li') as HTMLElement;
  fireEvent.click(within(row).getAllByRole('button', { name: 'More options' })[0]);
  return screen.getByRole('dialog', { name: 'Task options' });
};

describe('DuePill', () => {
  it('shows the repeat icon and describes the repeat', () => {
    render(<DuePill dueDate="2026-10-23" repeat={{ every: 'week' }} />);
    expect(screen.getByLabelText('Due Friday, repeats weekly')).toBeInTheDocument();
    expect(screen.getByTestId('repeat-icon')).toBeInTheDocument();
    expect(screen.getByText('Friday')).toBeInTheDocument();
  });

  it('describes weekday-specific repeats', () => {
    render(<DuePill dueDate="2026-10-26" repeat={{ every: 'week', weekday: 1 }} />);
    expect(screen.getByLabelText('Due Monday, repeats every Monday')).toBeInTheDocument();
  });

  it('has no repeat icon or label for a one-off task', () => {
    render(<DuePill dueDate="2026-10-23" />);
    expect(screen.queryByTestId('repeat-icon')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('Repeat in the task menu', () => {
  it('sets the repeat from the due date, and shows when the next one is', () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Report', dueDate: '2026-10-22' });
    });
    const menu = openMenu('Report');
    expect(within(menu).getByRole('radio', { name: 'None' })).toBeChecked();
    expect(within(menu).queryByText(/^Next:/)).not.toBeInTheDocument();

    fireEvent.click(within(menu).getByRole('radio', { name: 'Weekly' }));
    expect(byTitle('Report')[0]).toMatchObject({
      repeat: { every: 'week' },
      dueDate: '2026-10-22',
    });
    expect(within(menu).getByRole('radio', { name: 'Weekly' })).toBeChecked();
    expect(within(menu).getByText('Next: Thu, Oct 29')).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole('radio', { name: 'Monthly' }));
    expect(within(menu).getByText('Next: Sun, Nov 22')).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole('radio', { name: 'None' }));
    expect(byTitle('Report')[0].repeat).toBeNull();
    expect(within(menu).queryByText(/^Next:/)).not.toBeInTheDocument();
  });

  it('gives a task without a due date its first occurrence', () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'Stretch' });
    });
    const menu = openMenu('Stretch');
    fireEvent.click(within(menu).getByRole('radio', { name: 'Weekdays' }));
    expect(byTitle('Stretch')[0]).toMatchObject({
      repeat: { every: 'weekday' },
      dueDate: '2026-10-20',
    });
    expect(within(menu).getByText('Next: Wed, Oct 21')).toBeInTheDocument();
  });

  it('shows "Weekly" for an every-Monday repeat and leaves it alone when re-picked', () => {
    render(<App />);
    act(() => {
      useTaskStore
        .getState()
        .add({ title: 'Gym', dueDate: '2026-10-26', repeat: { every: 'week', weekday: 1 } });
    });
    const menu = openMenu('Gym');
    expect(within(menu).getByRole('radio', { name: 'Weekly' })).toBeChecked();
    fireEvent.click(within(menu).getByRole('radio', { name: 'Weekly' }));
    expect(byTitle('Gym')[0].repeat).toEqual({ every: 'week', weekday: 1 });
    expect(within(menu).getByText('Next: Mon, Nov 2')).toBeInTheDocument();
  });

  it('clearing the due date also clears the repeat', () => {
    render(<App />);
    act(() => {
      useTaskStore
        .getState()
        .add({ title: 'Gym', dueDate: '2026-10-26', repeat: { every: 'day' } });
    });
    const menu = openMenu('Gym');
    fireEvent.click(within(menu).getByRole('button', { name: 'Clear date' }));
    expect(byTitle('Gym')[0]).toMatchObject({ dueDate: null, repeat: null });
    expect(within(menu).getByRole('radio', { name: 'None' })).toBeChecked();
  });
});

describe('completing a repeating task', () => {
  const addWater = () => {
    act(() => {
      useTaskStore.getState().add({
        title: 'Water plants',
        dueDate: '2026-10-18',
        repeat: { every: 'week', weekday: 0 },
      });
    });
  };

  it('creates the next one with the right due date and the repeat pill', async () => {
    render(<App />);
    addWater();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Water plants' }));
    const all = byTitle('Water plants');
    expect(all).toHaveLength(2);
    const copy = all.find((t) => !t.done)!;
    expect(copy.dueDate).toBe('2026-10-25');
    // Both rows carry the pill; the new one is due Sunday.
    await waitFor(() => expect(screen.getAllByTestId('repeat-icon')).toHaveLength(2));
    expect(screen.getByLabelText('Due Sunday, repeats every Sunday')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Done: Water plants' })).toHaveLength(2);
    expect(screen.getByText('Completed “Water plants” · next on Sun')).toBeInTheDocument();
  });

  it('undo removes the copy and reopens the task', async () => {
    render(<App />);
    addWater();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Water plants' }));
    expect(byTitle('Water plants')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(byTitle('Water plants')).toHaveLength(1);
    expect(byTitle('Water plants')[0].done).toBe(false);
    await waitFor(() =>
      expect(screen.getAllByRole('checkbox', { name: 'Done: Water plants' })).toHaveLength(1),
    );
  });

  it('shows the new occurrence in the deadline view, in its date section', async () => {
    useUIStore.setState({ view: 'deadline' });
    render(<App />);
    act(() => {
      useTaskStore.getState().add({
        title: 'Stand-up',
        dueDate: '2026-10-20',
        repeat: { every: 'weekday' },
      });
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Stand-up' }));
    const copy = byTitle('Stand-up').find((t) => !t.done)!;
    expect(copy.dueDate).toBe('2026-10-21');
    await waitFor(() =>
      expect(screen.getAllByRole('checkbox', { name: 'Done: Stand-up' })).toHaveLength(2),
    );
    // The section header says it; the rows under it show only the repeat icon.
    expect(screen.getAllByText('Tomorrow')).toHaveLength(1);
    expect(screen.getAllByTestId('repeat-icon')).toHaveLength(2);
  });
});
