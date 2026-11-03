import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { addDays } from '../lib/dates';
import { TODAY_HINT } from '../hooks/useTodayHint';
import { useSessionStore } from '../store/session';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { useSyncStore } from '../sync/status';

vi.mock('../hooks/useIsTouch', async (original) => ({
  ...(await original<typeof import('../hooks/useIsTouch')>()),
  useIsTouch: () => false,
}));

// Tue 20 Oct 2026.
const TODAY = '2026-10-20';
const get = () => useTaskStore.getState();

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useSessionStore.setState({
    completedSomething: false,
    dismissedSuggestions: [],
    todayHintShown: false,
  });
  useSyncStore.setState({ syncStatus: 'loading' });
  useUIStore.setState({
    view: 'tree',
    tagFilter: null,
    focusedId: null,
    paletteOpen: false,
    sheetOpen: false,
    deleteRequestId: null,
    rescheduleRequestId: null,
    notice: null,
  });
  // Only the date is faked, but it keeps ticking: a completed row's hold runs on it.
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 20, 10, 30));
});
afterEach(() => vi.useRealTimers());

const enable = (capacity = 8) => {
  get().setSetting({ todayView: true, dailyCapacity: capacity });
  useUIStore.setState({ view: 'today' });
};
const add = (
  title: string,
  over: Parameters<ReturnType<typeof get>['add']>[0] extends infer T ? Partial<T> : never = {},
) => get().add({ title, ...over });
const planned = (title: string, difficulty: 1 | 2 | 3 | 4 | 5 = 1) =>
  add(title, { difficulty, plannedFor: TODAY });
const meter = () => screen.getByRole('meter', { name: "Today's load" });
const line = () => meter().previousElementSibling as HTMLElement;
const viewTab = (name: string) => screen.queryByRole('radio', { name });
const openAccount = () => fireEvent.click(screen.getByRole('button', { name: 'Account' }));

describe('Features in the avatar menu', () => {
  it('offers the Today view off by default, with the Today segment absent', async () => {
    add('A task');
    render(<App />);
    expect(viewTab('Today')).toBeNull();
    openAccount();
    const menu = await screen.findByRole('menu', { name: 'Account' });
    expect(within(menu).getByText('Features')).toBeInTheDocument();
    expect(within(menu).getByText('A daily plan sized to your capacity')).toBeInTheDocument();
    const toggle = within(menu).getByRole('switch', { name: 'Today view' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(within(menu).queryByText('Daily capacity')).toBeNull();
  });

  it('switching it on adds the first Today segment and goes there; off removes it again', async () => {
    add('A task');
    render(<App />);
    openAccount();
    const toggle = within(await screen.findByRole('menu', { name: 'Account' })).getByRole(
      'switch',
      { name: 'Today view' },
    );
    fireEvent.click(toggle);

    expect(get().settings.todayView).toBe(true);
    const radios = within(screen.getByRole('radiogroup', { name: 'View' }))
      .getAllByRole('radio')
      .map((r) => r.getAttribute('aria-label'));
    expect(radios).toEqual(['Today', 'Tree', 'By deadline', 'History', 'Week']);
    expect(viewTab('Today')).toHaveAttribute('aria-checked', 'true');
    expect(useUIStore.getState().view).toBe('today');

    fireEvent.click(toggle);
    expect(get().settings.todayView).toBe(false);
    expect(viewTab('Today')).toBeNull();
    // Leaving the feature while on it falls back to the Tree.
    expect(useUIStore.getState().view).toBe('tree');
    expect(viewTab('Tree')).toHaveAttribute('aria-checked', 'true');
  });

  it('turning it off from another view keeps that view', async () => {
    enable();
    useUIStore.setState({ view: 'deadline' });
    add('A task');
    render(<App />);
    openAccount();
    fireEvent.click(
      within(await screen.findByRole('menu', { name: 'Account' })).getByRole('switch', {
        name: 'Today view',
      }),
    );
    expect(useUIStore.getState().view).toBe('deadline');
  });

  it('shows the capacity stepper only while on, and it steps within 1-50', async () => {
    enable(8);
    render(<App />);
    openAccount();
    const menu = await screen.findByRole('menu', { name: 'Account' });
    expect(within(menu).getByText('Daily capacity')).toBeInTheDocument();
    expect(within(menu).getByText('points')).toBeInTheDocument();
    const value = () => within(menu).getByLabelText('Daily capacity in points');
    expect(value()).toHaveTextContent('8');

    fireEvent.click(within(menu).getByRole('button', { name: 'Increase daily capacity' }));
    fireEvent.click(within(menu).getByRole('button', { name: 'Increase daily capacity' }));
    expect(value()).toHaveTextContent('10');
    expect(get().settings.dailyCapacity).toBe(10);
    fireEvent.click(within(menu).getByRole('button', { name: 'Decrease daily capacity' }));
    expect(get().settings.dailyCapacity).toBe(9);

    act(() => get().setSetting({ dailyCapacity: 1 }));
    expect(within(menu).getByRole('button', { name: 'Decrease daily capacity' })).toBeDisabled();
    act(() => get().setSetting({ dailyCapacity: 50 }));
    expect(within(menu).getByRole('button', { name: 'Increase daily capacity' })).toBeDisabled();
  });

  it('keeps stepping while a button is held, and stops on release', async () => {
    enable(8);
    render(<App />);
    openAccount();
    const menu = await screen.findByRole('menu', { name: 'Account' });
    const up = within(menu).getByRole('button', { name: 'Increase daily capacity' });
    vi.useFakeTimers();
    fireEvent.pointerDown(up, { button: 0 });
    expect(get().settings.dailyCapacity).toBe(9);
    act(() => {
      vi.advanceTimersByTime(420 + 70 * 5);
    });
    expect(get().settings.dailyCapacity).toBeGreaterThanOrEqual(13);
    fireEvent.pointerUp(up);
    const stopped = get().settings.dailyCapacity;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(get().settings.dailyCapacity).toBe(stopped);
    // The click that follows a pointer press must not step a second time.
    fireEvent.click(up, { detail: 1 });
    expect(get().settings.dailyCapacity).toBe(stopped);
    vi.useRealTimers();
  });

  it('a persisted Today view falls back to the Tree while the feature is off', () => {
    useUIStore.setState({ view: 'today' });
    add('A task');
    render(<App />);
    expect(viewTab('Tree')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('meter')).toBeNull();
  });
});

describe('Plan for today', () => {
  it('is absent from the Reschedule menu while the feature is off', async () => {
    add('Write');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    const menu = await screen.findByRole('dialog', { name: 'Reschedule' });
    expect(within(menu).queryByRole('menuitem', { name: /Plan for today/ })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: /^Today/ })).toBeInTheDocument();
  });

  it('from the Reschedule menu adds the row to Today and leaves the due date alone', async () => {
    get().setSetting({ todayView: true });
    const id = add('Write', { dueDate: '2026-10-30' });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    const menu = await screen.findByRole('dialog', { name: 'Reschedule' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Plan for today');
    // The date pick is told apart from it.
    expect(within(menu).getByRole('menuitem', { name: /^Due today/ })).toBeInTheDocument();
    fireEvent.click(items[0]);

    expect(get().tasks[id]).toMatchObject({ plannedFor: TODAY, dueDate: '2026-10-30' });
    act(() => useUIStore.getState().setView('today'));
    expect(await screen.findByRole('meter', { name: "Today's load" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write' })).toBeInTheDocument();
    expect(line()).toHaveTextContent('1 planned');
  });

  it('from the task menu, and Remove from today for a planned row', async () => {
    get().setSetting({ todayView: true });
    const id = add('Write');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Plan for today' }));
    expect(get().tasks[id].plannedFor).toBe(TODAY);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Task options' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from today' }));
    expect(get().tasks[id].plannedFor).toBeNull();
  });

  it('a due-today row has no Remove from today', async () => {
    enable();
    add('Pay rent', { dueDate: TODAY, plannedFor: TODAY });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const menu = await screen.findByRole('dialog', { name: 'Task options' });
    expect(within(menu).queryByRole('button', { name: 'Remove from today' })).toBeNull();
    expect(within(menu).queryByRole('button', { name: 'Plan for today' })).toBeNull();
  });

  it('p on a focused row toggles it, and only with the feature on', () => {
    const id = add('Write');
    render(<App />);
    useUIStore.setState({ focusedId: id });
    fireEvent.keyDown(document.body, { key: 'p' });
    expect(get().tasks[id].plannedFor).toBeNull();

    act(() => get().setSetting({ todayView: true }));
    fireEvent.keyDown(document.body, { key: 'p' });
    expect(get().tasks[id].plannedFor).toBe(TODAY);
    fireEvent.keyDown(document.body, { key: 'p' });
    expect(get().tasks[id].plannedFor).toBeNull();
  });

  it('1-4 follow the new order when enabled', () => {
    enable();
    add('Write');
    render(<App />);
    fireEvent.keyDown(document.body, { key: '2' });
    expect(useUIStore.getState().view).toBe('tree');
    fireEvent.keyDown(document.body, { key: '4' });
    expect(useUIStore.getState().view).toBe('history');
    fireEvent.keyDown(document.body, { key: '1' });
    expect(useUIStore.getState().view).toBe('today');
  });

  it('a task added in Today is planned for today, unless it has a due date', () => {
    enable();
    add('Existing');
    render(<App />);
    const input = screen.getByLabelText('New task');
    fireEvent.change(input, { target: { value: 'Quick one' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'Report friday' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const byTitle = (title: string) => Object.values(get().tasks).find((t) => t.title === title)!;
    expect(byTitle('Quick one').plannedFor).toBe(TODAY);
    expect(byTitle('Report').dueDate).not.toBeNull();
    expect(byTitle('Report').plannedFor).toBeNull();

    act(() => useUIStore.setState({ view: 'tree' }));
    fireEvent.change(input, { target: { value: 'In the tree' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(byTitle('In the tree').plannedFor).toBeNull();
  });
});

describe('the Today view', () => {
  it('shows the capacity meter and its numbers', () => {
    enable(8);
    planned('A', 2);
    planned('B', 1);
    add('Not today');
    render(<App />);
    expect(line()).toHaveTextContent('Today · 0 of 8 points done · 3 planned');
    expect(meter()).toHaveAttribute('aria-valuemax', '8');
    expect(meter()).toHaveAttribute('aria-valuenow', '0');
    expect(meter()).toHaveAttribute('aria-valuetext', '0 of 8 points done, 3 planned');
    expect(screen.queryByText(/^Over by/)).toBeNull();
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not today' })).toBeNull();
  });

  it('counts a parent once, with its open subtasks', () => {
    enable(10);
    const parent = planned('Parent');
    const a = add('Sub a', { parentId: parent, difficulty: 3, plannedFor: TODAY });
    add('Sub b', { parentId: parent, difficulty: 2 });
    render(<App />);
    expect(a).toBeTruthy();
    expect(line()).toHaveTextContent('5 planned');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('labels overdue and rolled-over rows, and nothing else', () => {
    enable();
    add('Late', { dueDate: addDays(TODAY, -2) });
    add('Rolled', { plannedFor: addDays(TODAY, -1) });
    add('Due', { dueDate: TODAY });
    planned('Plan');
    render(<App />);
    expect(screen.getByText(/^Overdue · /)).toBeInTheDocument();
    expect(screen.getByText('From Mon')).toBeInTheDocument();
    // Order: overdue, due today, then planned (older plan first).
    const titles = screen
      .getAllByRole('checkbox')
      .map((c) => c.getAttribute('aria-label')?.replace('Done: ', ''));
    expect(titles).toEqual(['Late', 'Due', 'Rolled', 'Plan']);
    const due = screen.getByRole('button', { name: 'Due' }).closest('li')!;
    expect(within(due).queryByText(/Overdue|From/)).toBeNull();
  });

  it('warns when over capacity and "move something" tints the latest planned rows', () => {
    enable(4);
    planned('First', 2);
    planned('Second', 2);
    planned('Third', 3);
    render(<App />);
    expect(line()).toHaveTextContent('7 planned');
    const nudge = screen.getByText(/^Over by 3/);
    expect(nudge).toHaveTextContent('Over by 3 — move something to tomorrow?');
    expect(meter()).toHaveAttribute('data-over');

    const rowOf = (title: string) =>
      screen
        .getByRole('button', { name: title })
        .closest('li')!
        .querySelector('[data-row-color], [data-meta], div[class*="row"]');
    expect(rowOf('Third')).not.toHaveAttribute('data-over');
    fireEvent.click(within(nudge).getByRole('button', { name: 'move something' }));
    const overRows = document.querySelectorAll('[data-over]:not([role="meter"])');
    // The newest planned row (Third, 3 points) already covers the 3 over.
    expect(overRows).toHaveLength(1);
    expect(overRows[0].closest('li')).toContainElement(
      screen.getByRole('button', { name: 'Third' }),
    );
  });

  it('suggests tasks that fit, and "+" plans one', async () => {
    enable(8);
    planned('Already', 2);
    const soon = add('Due friday', { dueDate: addDays(TODAY, 3), difficulty: 2 });
    add('Tiny chore', { difficulty: 1 });
    add('Huge thing', { difficulty: 5 });
    render(<App />);

    const block = screen.getByRole('region', { name: 'Suggested' });
    expect(within(block).getByText('6 points left')).toBeInTheDocument();
    const names = within(block)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('span')?.textContent);
    expect(names).toEqual(['Due friday', 'Tiny chore']);

    fireEvent.click(within(block).getByRole('button', { name: /Plan .Due friday. for today/ }));
    expect(get().tasks[soon].plannedFor).toBe(TODAY);
    expect(get().tasks[soon].dueDate).toBe(addDays(TODAY, 3));
    // It joined the list...
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toContain(
      'Done: Due friday',
    );
    expect(line()).toHaveTextContent('4 planned');
    // (Its suggestion row glides out on a shared layout; happy-dom can't measure, so that is
    // covered by eye and the e2e run, not here.)
  });

  it('dismisses a suggestion for the session, and hides the block when nothing fits', async () => {
    enable(3);
    planned('Already', 1);
    add('Small', { difficulty: 1 });
    add('Smaller', { difficulty: 1, dueDate: addDays(TODAY, 2) });
    render(<App />);
    const block = screen.getByRole('region', { name: 'Suggested' });
    fireEvent.click(within(block).getByRole('button', { name: /Dismiss suggestion .Smaller./ }));
    await waitFor(() => expect(within(block).queryByText('Smaller')).toBeNull());
    expect(within(block).getByText('Small')).toBeInTheDocument();
    expect(useSessionStore.getState().dismissedSuggestions).toHaveLength(1);

    // No capacity left: the block goes.
    act(() => {
      get().add({ title: 'Heavy', plannedFor: TODAY, difficulty: 2 });
    });
    expect(screen.queryByRole('region', { name: 'Suggested' })).toBeNull();
  });

  it('shows an empty state that points at the suggestions', () => {
    enable(8);
    add('Small', { difficulty: 1 });
    render(<App />);
    expect(screen.getByText('Nothing planned for today')).toBeInTheDocument();
    expect(line()).toHaveTextContent('Today · 0 of 8 points done');
    expect(line()).not.toHaveTextContent('planned');
    const focusSpy = vi.fn();
    const add1 = screen.getByRole('button', { name: /Plan .Small. for today/ });
    add1.focus = focusSpy;
    fireEvent.click(screen.getByRole('button', { name: 'Plan your day' }));
    expect(focusSpy).toHaveBeenCalled();
  });

  it('with nothing to suggest, the empty state says how to add tasks', () => {
    enable(8);
    add('Big', { difficulty: 5 });
    render(<App />);
    expect(screen.getByText('Nothing planned for today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plan your day' })).toBeNull();
    expect(screen.getByText(/Add tasks with/)).toHaveTextContent(
      'Add tasks with today or !n in the composer',
    );
  });

  it('completing a row pops it out and raises "done"', async () => {
    enable(8);
    planned('Write', 3);
    planned('Read', 2);
    render(<App />);
    expect(line()).toHaveTextContent('0 of 8 points done · 5 planned');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Write' }));
    // Counted at once...
    expect(line()).toHaveTextContent('Today · 3 of 8 points done · 2 planned');
    expect(meter()).toHaveAttribute('aria-valuenow', '3');
    // ...and the row pops out once its strike has played.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Write' })).toBeNull(), {
      timeout: 4000,
    });
    expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  });

  it('says so when the day is cleared', async () => {
    enable(8);
    planned('Write', 3);
    render(<App />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Write' }));
    expect(await screen.findByText('Nothing left for today', {}, { timeout: 4000 })).toBeVisible();
    expect(line()).toHaveTextContent('3 of 8 points done');
  });

  it('respects the tag filter', () => {
    enable();
    add('Work thing', { plannedFor: TODAY, tags: ['work'] });
    add('Home thing', { plannedFor: TODAY, tags: ['home'] });
    useUIStore.setState({ tagFilter: 'work' });
    render(<App />);
    expect(screen.getByRole('button', { name: 'Work thing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Home thing' })).toBeNull();
    // The meter is about the whole day, not the filter.
    expect(line()).toHaveTextContent('2 planned');
  });
});

describe('the one-time hint', () => {
  const completeTasks = (n: number) => {
    for (let i = 0; i < n; i += 1) {
      const id = add(`Task ${i}`);
      act(() => get().toggle(id));
    }
    act(() => get().dismissUndo());
  };
  const hint = () => screen.queryByText(TODAY_HINT);

  beforeEach(() => useSyncStore.setState({ syncStatus: 'ready' }));

  it('does not show before the fifth completion today', () => {
    render(<App />);
    completeTasks(4);
    expect(hint()).toBeNull();
  });

  it('shows after five completions with the feature off, with its action', () => {
    render(<App />);
    completeTasks(5);
    expect(hint()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Today view' })).toBeInTheDocument();
    // Nothing is decided until the user acts.
    expect(get().settings.hints.todayOffered).toBeUndefined();
  });

  it('waits for the first sync, because the answer may be in the cloud', () => {
    useSyncStore.setState({ syncStatus: 'loading' });
    render(<App />);
    completeTasks(5);
    expect(hint()).toBeNull();
    act(() => useSyncStore.setState({ syncStatus: 'ready' }));
    expect(hint()).toBeInTheDocument();
  });

  it('never shows with the feature on, or once offered on any device', () => {
    get().setSetting({ todayView: true });
    render(<App />);
    completeTasks(5);
    expect(hint()).toBeNull();
    act(() => get().setSetting({ todayView: false, hints: { todayOffered: true } }));
    completeTasks(1);
    expect(hint()).toBeNull();
  });

  it('dismissing it is remembered, and it does not come back', async () => {
    render(<App />);
    completeTasks(5);
    const card = screen.getByText(TODAY_HINT).closest('[role="status"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Dismiss' }));
    expect(get().settings.hints.todayOffered).toBe(true);
    await waitFor(() => expect(hint()).toBeNull());
    expect(get().settings.todayView).toBe(false);
    completeTasks(3);
    expect(hint()).toBeNull();
  });

  it('taking it up turns the feature on, shows Today and remembers the offer', () => {
    render(<App />);
    completeTasks(5);
    fireEvent.click(screen.getByRole('button', { name: 'Try Today view' }));
    expect(get().settings.todayView).toBe(true);
    expect(get().settings.hints.todayOffered).toBe(true);
    expect(useUIStore.getState().view).toBe('today');
    expect(viewTab('Today')).toHaveAttribute('aria-checked', 'true');
  });

  it('is offered at most once per session even if ignored', async () => {
    render(<App />);
    completeTasks(5);
    expect(hint()).toBeInTheDocument();
    act(() => useUIStore.getState().clearNotice());
    await waitFor(() => expect(hint()).toBeNull());
    completeTasks(2);
    expect(hint()).toBeNull();
  });

  it('only counts completions made today', () => {
    // Five completions, but yesterday.
    vi.setSystemTime(new Date(2026, 9, 19, 10, 0));
    completeTasks(5);
    vi.setSystemTime(new Date(2026, 9, 20, 10, 30));
    render(<App />);
    completeTasks(1);
    expect(hint()).toBeNull();
  });
});
