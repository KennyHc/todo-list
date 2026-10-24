import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { weekdayDate } from '../lib/dates';
import { revealTask } from '../store/reveal';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';

vi.mock('../hooks/useIsTouch', async (original) => ({
  ...(await original<typeof import('../hooks/useIsTouch')>()),
  useIsTouch: () => false,
}));

// Tue 20 Oct 2026.
const TODAY = '2026-10-20';
const MONDAY = '2026-10-26';
const get = () => useTaskStore.getState();

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({
    view: 'tree',
    tagFilter: null,
    focusedId: null,
    showUpcoming: false,
    notice: null,
    paletteOpen: false,
    rescheduleRequestId: null,
  });
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 20, 10, 30));
});
afterEach(() => vi.useRealTimers());

type NewTask = Parameters<ReturnType<typeof get>['add']>[0];
const add = (title: string, over: Partial<NewTask> = {}) => {
  let id = '';
  act(() => {
    id = get().add({ title, ...over });
  });
  return id;
};
const rowOf = (title: string) => screen.getByText(title).closest('li') as HTMLElement;
const footer = () => screen.queryByText(/starting later/);
const toggle = (name: 'Show' | 'Hide') => fireEvent.click(screen.getByRole('button', { name }));

/** A tree with one hidden parent (two subtasks) and one hidden leaf: two tasks "starting later". */
function seed() {
  const visible = add('Visible');
  const parent = add('Hidden parent', { startDate: MONDAY });
  const child = add('Hidden child', { parentId: parent });
  const grandchild = add('Hidden grandchild', { parentId: child });
  const leaf = add('Hidden leaf', { startDate: '2026-11-02' });
  return { visible, parent, child, grandchild, leaf };
}

describe('the Tree view and tasks that start later', () => {
  it('shows nothing extra, not even a footer, while no task is hidden', () => {
    add('Plain');
    add('Started', { startDate: TODAY });
    add('Long ago', { startDate: '2020-01-01' });
    render(<App />);
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Long ago')).toBeInTheDocument();
    expect(footer()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
  });

  it('hides them with their subtrees and counts only the topmost in the footer', () => {
    seed();
    render(<App />);
    expect(screen.getByText('Visible')).toBeInTheDocument();
    for (const title of ['Hidden parent', 'Hidden child', 'Hidden grandchild', 'Hidden leaf']) {
      expect(screen.queryByText(title)).toBeNull();
    }
    // Two top-most hidden tasks, not four.
    expect(footer()).toHaveTextContent('2 starting later · Show');
  });

  it('Show lists them inline, dimmed, with when they start; Hide puts them away again', async () => {
    seed();
    render(<App />);
    toggle('Show');
    expect(footer()).toHaveTextContent('2 starting later · Hide');
    expect(useUIStore.getState().showUpcoming).toBe(true);

    const parent = rowOf('Hidden parent');
    expect(within(parent).getByText('Starts Mon')).toBeInTheDocument();
    expect(within(rowOf('Hidden leaf')).getByText('Starts Nov 2')).toBeInTheDocument();
    const dim = (title: string) =>
      rowOf(title).querySelector('[data-upcoming]') as HTMLElement | null;
    expect(dim('Hidden parent')).not.toBeNull();
    // Its subtasks are dimmed with it, but only the task that has the date says when.
    expect(dim('Hidden grandchild')).not.toBeNull();
    expect(within(rowOf('Hidden child')).queryByText(/^Starts/)).toBeNull();
    expect(dim('Visible')).toBeNull();
    expect(within(rowOf('Visible')).queryByText(/^Starts/)).toBeNull();

    toggle('Hide');
    await waitFor(() => expect(screen.queryByText('Hidden parent')).toBeNull());
    expect(footer()).toHaveTextContent('2 starting later · Show');
  });

  it('is not remembered: the toggle starts off on a fresh load', () => {
    seed();
    render(<App />);
    toggle('Show');
    expect(JSON.stringify(localStorage)).not.toContain('showUpcoming');
  });

  it('shows a task by itself once its day comes, and the footer goes', async () => {
    add('Waiting', { startDate: MONDAY });
    render(<App />);
    expect(screen.queryByText('Waiting')).toBeNull();
    // Monday morning: re-render with the new date (a store update, as any edit would be).
    vi.setSystemTime(new Date(2026, 9, 26, 8, 0));
    act(() => {
      get().add({ title: 'Anything' });
    });
    expect(await screen.findByText('Waiting')).toBeInTheDocument();
    expect(footer()).toBeNull();
    expect(get().tasks[Object.keys(get().tasks)[0]].startDate).toBe(MONDAY);
  });

  it('turns the toggle back off when nothing is left to show', async () => {
    const id = add('Waiting', { startDate: MONDAY });
    render(<App />);
    toggle('Show');
    act(() => get().hideUntil(id, null));
    await waitFor(() => expect(footer()).toBeNull());
    expect(useUIStore.getState().showUpcoming).toBe(false);
  });

  it('keeps parent sums and progress as they were', () => {
    const p = add('Project');
    add('Small', { parentId: p, difficulty: 2 });
    add('Later', { parentId: p, difficulty: 3, startDate: MONDAY });
    render(<App />);
    expect(screen.queryByText('Later')).toBeNull();
    const row = rowOf('Project');
    expect(within(row).getByText('Σ 5')).toBeInTheDocument();
    expect(within(row).getByText('0/2')).toBeInTheDocument();
  });

  it('counts only what the tag filter would show', () => {
    add('A', { startDate: MONDAY, tags: ['x'] });
    add('B', { startDate: MONDAY, tags: ['y'] });
    add('C', { tags: ['x'] });
    render(<App />);
    expect(footer()).toHaveTextContent('2 starting later');
    act(() => useUIStore.getState().setTagFilter('x'));
    expect(footer()).toHaveTextContent('1 starting later');
  });

  it('the By deadline and Today views leave them out too', () => {
    const { parent } = seed();
    add('Due soon', { dueDate: TODAY });
    act(() => {
      get().setSetting({ todayView: true });
      get().update(parent, { dueDate: TODAY });
      useUIStore.setState({ view: 'deadline' });
    });
    const { unmount } = render(<App />);
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    for (const title of ['Hidden parent', 'Hidden child', 'Hidden leaf']) {
      expect(screen.queryByText(title)).toBeNull();
    }
    unmount();
    act(() => useUIStore.setState({ view: 'today' }));
    render(<App />);
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    expect(screen.queryByText('Hidden parent')).toBeNull();
  });

  it('revealing a hidden task (the palette) switches the toggle on', () => {
    const { grandchild } = seed();
    render(<App />);
    act(() => revealTask(grandchild));
    expect(useUIStore.getState().showUpcoming).toBe(true);
    expect(screen.getByText('Hidden grandchild')).toBeInTheDocument();
  });
});

describe('Hide until… and Show now', () => {
  const openTaskMenu = (title: string) => {
    fireEvent.click(within(rowOf(title)).getByRole('button', { name: 'More options' }));
    return screen.getByRole('dialog', { name: 'Task options' });
  };
  const openReschedule = async (title: string) => {
    fireEvent.click(within(rowOf(title)).getByRole('button', { name: 'Reschedule' }));
    return screen.findByRole('dialog', { name: 'Reschedule' });
  };

  it('the ⋯ menu hides a task until a quick-picked date, with an undo', async () => {
    const id = add('Pay rent');
    render(<App />);
    fireEvent.click(within(openTaskMenu('Pay rent')).getByRole('button', { name: /^Hide until/ }));
    const picker = await screen.findByLabelText('Hide until');
    expect(picker).toBeInTheDocument();
    // The menu's Due date section has a Tomorrow too; the Hide until picker is the last one.
    fireEvent.click(screen.getAllByRole('button', { name: 'Tomorrow' }).at(-1)!);
    expect(get().tasks[id].startDate).toBe('2026-10-21');
    await waitFor(() => expect(screen.queryByText('Pay rent')).toBeNull());
    expect(screen.getByText(/Hid .Pay rent. until/)).toBeInTheDocument();
    expect(footer()).toHaveTextContent('1 starting later');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(get().tasks[id].startDate).toBeNull();
    expect(await screen.findByText('Pay rent')).toBeInTheDocument();
  });

  it('the ⋯ menu takes a typed date, and waits for a real year', async () => {
    const id = add('Pay rent');
    render(<App />);
    fireEvent.click(within(openTaskMenu('Pay rent')).getByRole('button', { name: /^Hide until/ }));
    const input = await screen.findByLabelText('Hide until');
    fireEvent.change(input, { target: { value: '0002-01-01' } });
    expect(get().tasks[id].startDate).toBeNull();
    fireEvent.change(input, { target: { value: '2026-12-25' } });
    expect(get().tasks[id].startDate).toBe('2026-12-25');
  });

  it('Show now only appears once a start date is set, and clears it', async () => {
    const id = add('Pay rent');
    render(<App />);
    expect(within(openTaskMenu('Pay rent')).queryByRole('button', { name: 'Show now' })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    act(() => get().hideUntil(id, MONDAY));
    toggle('Show');
    fireEvent.click(within(openTaskMenu('Pay rent')).getByRole('button', { name: 'Show now' }));
    expect(get().tasks[id].startDate).toBeNull();
    expect(get().undo?.label).toBe('Showing “Pay rent” now');
  });

  it('the reschedule menu has both too', async () => {
    const id = add('Pay rent');
    render(<App />);
    let menu = await openReschedule('Pay rent');
    expect(within(menu).queryByRole('menuitem', { name: 'Show now' })).toBeNull();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^Hide until/ }));
    expect(screen.getByRole('heading', { name: 'Hide until' })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Hide until'), {
      target: { value: '2026-11-03' },
    });
    expect(get().tasks[id].startDate).toBe('2026-11-03');
    await waitFor(() => expect(screen.queryByText('Pay rent')).toBeNull());

    toggle('Show');
    menu = await openReschedule('Pay rent');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Show now' }));
    expect(get().tasks[id].startDate).toBeNull();
  });
});

describe('typing a start date in the composer', () => {
  const type = (value: string) => {
    const input = screen.getByLabelText('New task');
    fireEvent.change(input, { target: { value } });
    return input;
  };
  const submit = (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Enter' });
  const chips = () => screen.getByRole('list', { name: 'Recognised in this task' });

  it('shows a Starts chip beside the due-date chip, and creates the task with both', () => {
    render(<App />);
    const input = type('Renew passport from nov 1 by nov 30');
    const row = chips();
    expect(within(row).getByText(`Starts ${weekdayDate('2026-11-01')}`)).toBeInTheDocument();
    expect(within(row).getByText('Nov 30')).toBeInTheDocument();
    submit(input);
    const created = Object.values(get().tasks)[0];
    expect(created).toMatchObject({
      title: 'Renew passport',
      startDate: '2026-11-01',
      dueDate: '2026-11-30',
    });
  });

  it('says where a hidden task went, in the Tree', () => {
    render(<App />);
    submit(type('Renew passport from monday'));
    expect(useUIStore.getState().notice?.text).toBe(`Hidden until ${weekdayDate(MONDAY)}`);
    expect(screen.queryByText('Renew passport')).toBeNull();
    expect(footer()).toHaveTextContent('1 starting later');
  });

  it('adds no notice when the task starts today or has no start', () => {
    render(<App />);
    submit(type('Soon from today'));
    submit(type('Plain task'));
    expect(useUIStore.getState().notice).toBeNull();
    expect(screen.getByText('Soon')).toBeInTheDocument();
  });

  it('dismissing the chip keeps the words in the title and sets no start date', async () => {
    render(<App />);
    const input = type('Renew from nov 1');
    fireEvent.click(
      screen.getByRole('button', { name: /Don't treat "from nov 1" as a start date/ }),
    );
    await waitFor(() => expect(screen.queryByText(/^Starts/)).toBeNull());
    submit(input);
    expect(Object.values(get().tasks)[0]).toMatchObject({
      title: 'Renew from nov 1',
      startDate: null,
    });
    expect(useUIStore.getState().notice).toBeNull();
  });

  it('does not make a plain "from home" a start date', () => {
    render(<App />);
    submit(type('Work from home'));
    expect(Object.values(get().tasks)[0]).toMatchObject({
      title: 'Work from home',
      startDate: null,
    });
  });

  it('in Today, a task that starts later is not planned for today', () => {
    act(() => {
      get().setSetting({ todayView: true });
      useUIStore.setState({ view: 'today' });
    });
    render(<App />);
    submit(type('Later thing from monday'));
    submit(type('Now thing'));
    const tasks = Object.values(get().tasks);
    expect(tasks.find((t) => t.title === 'Later thing')?.plannedFor).toBeNull();
    expect(tasks.find((t) => t.title === 'Now thing')?.plannedFor).toBe(TODAY);
  });
});
