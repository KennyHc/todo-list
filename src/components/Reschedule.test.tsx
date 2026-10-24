import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { addDays } from '../lib/dates';
import { nextMondayDate, pickDateLabel, weekendDate } from '../lib/reschedule';
import { todayISO } from '../lib/views';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';

vi.mock('../hooks/useIsTouch', async (original) => ({
  ...(await original<typeof import('../hooks/useIsTouch')>()),
  useIsTouch: () => false,
}));

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({
    view: 'tree',
    tagFilter: null,
    focusedId: null,
    paletteOpen: false,
    sheetOpen: false,
    deleteRequestId: null,
    rescheduleRequestId: null,
  });
  // Tue 20 Oct 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 20, 10, 30));
});
afterEach(() => vi.useRealTimers());

const add = (title: string, dueDate: string | null = null) =>
  useTaskStore.getState().add({ title, dueDate });
const task = (id: string) => useTaskStore.getState().tasks[id];
const menu = () => screen.findByRole('dialog', { name: 'Reschedule' });

describe('Reschedule menu', () => {
  it('opens from the hover button with each quick pick and the date it resolves to', async () => {
    add('Pay rent');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    const dialog = await menu();
    const items = within(dialog).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      `Today${pickDateLabel('2026-10-20')}`,
      `Tomorrow${pickDateLabel('2026-10-21')}`,
      `This weekend${pickDateLabel('2026-10-24')}`,
      `Next week${pickDateLabel('2026-10-26')}`,
      'Pick date…',
      'Hide until…',
    ]);
    // Nothing to remove or show yet.
    expect(within(dialog).queryByRole('menuitem', { name: 'Remove date' })).toBeNull();
  });

  it('sets the date with a labelled undo, and undo puts it back', async () => {
    const id = add('Pay rent', '2026-10-19');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    fireEvent.click(within(await menu()).getByRole('menuitem', { name: /^This weekend/ }));
    expect(task(id).dueDate).toBe(weekendDate('2026-10-20'));
    expect(useTaskStore.getState().undo?.label).toBe(
      `Moved “Pay rent” to ${pickDateLabel('2026-10-24')}`,
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Reschedule' })).toBeNull());

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(task(id).dueDate).toBe('2026-10-19');
  });

  it('moves to next Monday and removes a date', async () => {
    const id = add('Pay rent', '2026-10-20');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    fireEvent.click(within(await menu()).getByRole('menuitem', { name: /^Next week/ }));
    expect(task(id).dueDate).toBe(nextMondayDate('2026-10-20'));

    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    fireEvent.click(within(await menu()).getByRole('menuitem', { name: 'Remove date' }));
    expect(task(id).dueDate).toBeNull();
    expect(useTaskStore.getState().undo?.label).toBe('Removed date from “Pay rent”');
  });

  it('Pick date… shows the date picker, and a chosen date applies', async () => {
    const id = add('Pay rent');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    fireEvent.click(within(await menu()).getByRole('menuitem', { name: /^Pick date/ }));
    const input = await screen.findByLabelText('Due date');
    fireEvent.change(input, { target: { value: '0002-01-01' } });
    expect(task(id).dueDate).toBeNull();
    fireEvent.change(input, { target: { value: '2026-12-25' } });
    expect(task(id).dueDate).toBe('2026-12-25');
  });

  it('t, m, w and n pick inside the menu', async () => {
    const id = add('Pay rent');
    render(<App />);
    const cases: [string, string][] = [
      ['t', '2026-10-20'],
      ['m', '2026-10-21'],
      ['w', '2026-10-24'],
      ['n', '2026-10-26'],
    ];
    for (const [key, date] of cases) {
      useTaskStore.getState().update(id, { dueDate: null });
      fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
      await menu();
      fireEvent.keyDown(document.body, { key });
      expect(task(id).dueDate).toBe(date);
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Reschedule' })).not.toBeInTheDocument(),
      );
    }
  });

  it('`s` on a focused row opens it', async () => {
    const a = add('A');
    add('B');
    render(<App />);
    act(() => useUIStore.getState().setFocusedId(a));
    fireEvent.keyDown(document.body, { key: 's' });
    fireEvent.keyDown(await menu(), { key: 'm' });
    // The first row is A; the key goes to the dialog's own document listener.
    expect(task(a).dueDate).toBe('2026-10-21');
  });

  it('`s` does nothing without a focused row', () => {
    add('A');
    render(<App />);
    fireEvent.keyDown(document.body, { key: 's' });
    expect(screen.queryByRole('dialog', { name: 'Reschedule' })).toBeNull();
  });
});

describe('overdue line', () => {
  it('is absent when nothing is overdue', () => {
    add('Today', '2026-10-20');
    add('Later', '2026-10-30');
    add('Open');
    render(<App />);
    expect(screen.queryByText(/overdue/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move to today' })).toBeNull();
  });

  it('does not count a completed overdue task', () => {
    const id = add('Old', '2026-10-01');
    useTaskStore.getState().toggle(id);
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Move to today' })).toBeNull();
  });

  it('counts overdue tasks and moves them all to today in one undo', async () => {
    const a = add('A', '2026-10-01');
    const b = add('B', '2026-10-19');
    const c = add('C', '2026-10-25');
    render(<App />);
    const line = screen.getByText('2 overdue').closest('[role="status"]') as HTMLElement;
    expect(line).toHaveTextContent('2 overdue');
    fireEvent.click(within(line).getByRole('button', { name: 'Move to today' }));
    expect(task(a).dueDate).toBe('2026-10-20');
    expect(task(b).dueDate).toBe('2026-10-20');
    expect(task(c).dueDate).toBe('2026-10-25');
    expect(useTaskStore.getState().undo?.label).toBe('Moved 2 overdue tasks to today');

    await waitFor(() => expect(screen.queryByText(/overdue$/)).toBeNull());
    act(() => useTaskStore.getState().undoLast());
    expect(task(a).dueDate).toBe('2026-10-01');
    expect(await screen.findByText('2 overdue')).toBeInTheDocument();
  });

  it('shows in By deadline, above the Overdue header', () => {
    add('A', '2026-10-01');
    useUIStore.setState({ view: 'deadline' });
    render(<App />);
    const line = screen.getByText('1 overdue');
    const header = screen.getByText('Overdue', { selector: 'li' });
    expect(line.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is not shown in History', () => {
    add('A', '2026-10-01');
    const done = add('B');
    useTaskStore.getState().toggle(done);
    useUIStore.setState({ view: 'history' });
    render(<App />);
    expect(screen.queryByText(/overdue/)).toBeNull();
  });
});

describe('link chip', () => {
  it('shows the host and hides the URL in the title; the stored title keeps it', () => {
    const id = add('Read this https://www.github.com/anthropics/claude-code');
    render(<App />);
    const chip = screen.getByRole('link', { name: 'github.com' });
    expect(chip).toHaveAttribute('href', 'https://www.github.com/anthropics/claude-code');
    expect(chip).toHaveAttribute('target', '_blank');
    expect(chip).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('button', { name: 'Read this' })).toBeInTheDocument();
    expect(screen.queryByText(/anthropics/)).toBeNull();
    expect(task(id).title).toBe('Read this https://www.github.com/anthropics/claude-code');
  });

  it('clicking the title edits the full title; the chip does not', () => {
    const id = add('Read this https://example.com/a');
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'example.com' }));
    expect(useTaskStore.getState().editingId).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Read this' }));
    expect(useTaskStore.getState().editingId).toBe(id);
    expect(screen.getByLabelText('Task title')).toHaveValue('Read this https://example.com/a');
  });

  it('a title that is only a link keeps showing it, without a chip', () => {
    add('https://example.com/a');
    render(<App />);
    expect(screen.getByRole('button', { name: 'https://example.com/a' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('plain titles have no chip', () => {
    add('Buy milk');
    render(<App />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('date picker quick picks', () => {
  it('match the Reschedule menu', async () => {
    const id = add('Pay rent');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const dialog = await screen.findByRole('dialog', { name: 'Task options' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Weekend' }));
    expect(task(id).dueDate).toBe(addDays(todayISO(), 4));
  });
});
