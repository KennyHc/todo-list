import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { tagColor } from '../lib/tags';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { mkEntry } from '../test/factories';
import { useUIStore } from '../store/ui';

const PURPLE = '#C9B8F2';
const PEACH = '#FFD3B6';

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({ view: 'tree', tagFilter: null, focusedId: null, tagColorsOpen: false });
});

const rowOf = (id: string) => document.querySelector(`[data-row-id="${id}"]`) as HTMLElement;
/** The element carrying the indicator, or null when the row shows none. */
const indicator = (id: string) => rowOf(id).querySelector<HTMLElement>('[data-row-color]');

const openMenu = (title: string) => {
  const row = screen.getByText(title).closest('li') as HTMLElement;
  fireEvent.click(within(row).getAllByRole('button', { name: 'More options' })[0]);
  return screen.getByRole('dialog', { name: 'Task options' });
};

describe('row colour indicator', () => {
  it('shows nothing for an uncoloured task, and a tag colour once the tag has one', () => {
    render(<App />);
    let id = '';
    act(() => {
      id = useTaskStore.getState().add({ title: 'Write report', tags: ['work'] });
    });
    expect(indicator(id)).toBeNull();

    act(() => useTaskStore.getState().setTagColor('work', PURPLE));
    expect(indicator(id)).toHaveAttribute('data-row-color', PURPLE);
    expect(indicator(id)).toHaveStyle({ '--row-color': PURPLE });
  });

  it('tagging a task with an already-coloured tag colours it automatically', () => {
    render(<App />);
    let id = '';
    act(() => {
      useTaskStore.getState().setTagColor('home', PEACH);
      id = useTaskStore.getState().add({ title: 'Clean' });
    });
    expect(indicator(id)).toBeNull();
    act(() => useTaskStore.getState().update(id, { tags: ['home'] }));
    expect(indicator(id)).toHaveAttribute('data-row-color', PEACH);
  });

  it('a task override beats the tag, and Auto clears it again', () => {
    render(<App />);
    let id = '';
    act(() => {
      useTaskStore.getState().setTagColor('work', PURPLE);
      id = useTaskStore.getState().add({ title: 'Write report', tags: ['work'] });
    });

    fireEvent.click(within(openMenu('Write report')).getByRole('button', { name: 'Peach' }));
    expect(useTaskStore.getState().tasks[id].color).toBe(PEACH);
    expect(indicator(id)).toHaveAttribute('data-row-color', PEACH);

    const menu = screen.getByRole('dialog', { name: 'Task options' });
    const taskColours = within(menu).getByRole('group', { name: 'Task colour' });
    fireEvent.click(within(taskColours).getByRole('button', { name: 'Auto' }));
    expect(useTaskStore.getState().tasks[id].color).toBeNull();
    expect(indicator(id)).toHaveAttribute('data-row-color', PURPLE);
    expect(within(menu).getByText('From #work')).toBeInTheDocument();
  });

  it("subtasks inherit their parent's colour; Auto explains where it comes from", () => {
    render(<App />);
    let child = '';
    act(() => {
      const s = useTaskStore.getState();
      const parent = s.add({ title: 'Project', color: PURPLE });
      child = s.add({ title: 'Step', parentId: parent });
    });
    expect(indicator(child)).toHaveAttribute('data-row-color', PURPLE);
    expect(within(openMenu('Step')).getByText('From parent')).toBeInTheDocument();
  });

  it('says "No colour" when nothing applies', () => {
    render(<App />);
    act(() => void useTaskStore.getState().add({ title: 'Plain' }));
    expect(within(openMenu('Plain')).getByText('No colour')).toBeInTheDocument();
  });

  it('marks done rows so the indicator is faded', () => {
    render(<App />);
    let id = '';
    act(() => {
      id = useTaskStore.getState().add({ title: 'Done soon', color: PURPLE });
      useTaskStore.getState().toggle(id);
    });
    expect(indicator(id)).toHaveAttribute('data-done');
  });

  it('keeps the checkbox neutral: no inline task colour', () => {
    render(<App />);
    let id = '';
    act(() => {
      id = useTaskStore.getState().add({ title: 'Coloured', color: PURPLE });
    });
    const box = within(rowOf(id)).getByRole('checkbox');
    expect(box.outerHTML).not.toContain('#');
    for (const el of [box, ...box.querySelectorAll<HTMLElement>('*')]) {
      expect(el.getAttribute('style') ?? '').not.toMatch(/#|rgb|task-color/i);
    }
  });

  it('also shows in the deadline view', () => {
    render(<App />);
    let id = '';
    act(() => {
      id = useTaskStore.getState().add({ title: 'Due', tags: ['work'] });
      useTaskStore.getState().setTagColor('work', PURPLE);
      useUIStore.getState().setView('deadline');
    });
    expect(indicator(id)).toHaveAttribute('data-row-color', PURPLE);
  });
});

describe('tag chips', () => {
  it('use the assigned colour, falling back to the hash colour', () => {
    render(<App />);
    act(() => {
      useTaskStore.getState().add({ title: 'A', tags: ['work', 'other'] });
      useTaskStore.getState().setTagColor('work', '#123456');
    });
    const chip = (tag: string) =>
      screen.getByRole('button', { name: `Filter by tag ${tag}` }).closest('span[style]');
    expect(chip('work')).toHaveStyle({ '--tag': '#123456' });
    expect(chip('other')).toHaveStyle({ '--tag': tagColor('other') });
  });

  it('a hash-coloured tag does not colour its tasks', () => {
    render(<App />);
    let id = '';
    act(() => {
      id = useTaskStore.getState().add({ title: 'A', tags: ['unassigned'] });
    });
    expect(indicator(id)).toBeNull();
  });
});

describe('tag colour management', () => {
  it('sets a tag colour from the dot in the task menu (and leaves new tags neutral)', () => {
    render(<App />);
    let id = '';
    act(() => {
      id = useTaskStore.getState().add({ title: 'Task', tags: ['work'] });
    });
    expect(useTaskStore.getState().tagColors).toEqual({});
    const menu = openMenu('Task');
    fireEvent.click(within(menu).getByRole('button', { name: 'Colour for #work' }));
    const picker = within(menu).getByRole('group', { name: 'Colour for #work' });
    expect(within(menu).getByText('Applies to every task tagged #work.')).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole('button', { name: 'Peach' }));
    expect(useTaskStore.getState().tagColors).toEqual({ work: PEACH });
    expect(indicator(id)).toHaveAttribute('data-row-color', PEACH);

    fireEvent.click(within(picker).getByRole('button', { name: 'No colour' }));
    expect(useTaskStore.getState().tagColors).toEqual({});
    expect(indicator(id)).toBeNull();
  });

  it('adding a brand new tag does not assign it a colour', () => {
    render(<App />);
    act(() => void useTaskStore.getState().add({ title: 'Task' }));
    const menu = openMenu('Task');
    const input = within(menu).getByLabelText('Add tag');
    fireEvent.change(input, { target: { value: 'fresh' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(Object.values(useTaskStore.getState().tasks)[0].tags).toEqual(['fresh']);
    expect(useTaskStore.getState().tagColors).toEqual({});
  });

  it('the Tag colours dialog lists tags with counts and edits their colours', async () => {
    render(<App />);
    act(() => {
      const s = useTaskStore.getState();
      s.add({ title: 'A', tags: ['work', 'home'] });
      s.add({ title: 'B', tags: ['work'] });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tag colours' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tag colours' });
    expect(within(dialog).getByText('2 tasks')).toBeInTheDocument();
    expect(within(dialog).getByText('1 task')).toBeInTheDocument();

    const work = within(dialog).getByRole('group', { name: 'Colour for #work' });
    // "No colour" comes first and is the current choice.
    expect(within(work).getAllByRole('button')[0]).toHaveAccessibleName('No colour');
    expect(within(work).getByRole('button', { name: 'No colour' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(work).getByRole('button', { name: 'Lavender' }));
    expect(useTaskStore.getState().tagColors).toEqual({ work: PURPLE });
    expect(within(work).getByRole('button', { name: 'Lavender' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('the filter popover has an Edit colours shortcut that opens the dialog', async () => {
    render(<App />);
    act(() => void useTaskStore.getState().add({ title: 'A', tags: ['work'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit colours' }));
    expect(await screen.findByRole('dialog', { name: 'Tag colours' })).toBeInTheDocument();
  });

  it('undoes a tag colour change from the toast', () => {
    render(<App />);
    act(() => void useTaskStore.getState().add({ title: 'A', tags: ['work'] }));
    act(() => useTaskStore.getState().setTagColor('work', PURPLE));
    expect(screen.getByText('Changed #work colour')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useTaskStore.getState().tagColors).toEqual({});
  });
});

describe('history and imports', () => {
  it('history shows the edge from the snapshot, except for the old default blue', () => {
    useTaskStore.setState({
      history: [
        mkEntry('old', { title: 'Old blue', color: '#A9C6F5', completedAt: 5 }),
        mkEntry('none', { title: 'No colour', color: null, completedAt: 6 }),
        mkEntry('new', { title: 'Purple', color: PURPLE, completedAt: 7 }),
      ],
    });
    useUIStore.setState({ view: 'history' });
    render(<App />);
    const coloured = document.querySelectorAll('li[data-row-color]');
    expect(coloured).toHaveLength(1);
    expect(coloured[0]).toHaveAttribute('data-row-color', PURPLE);
    expect(coloured[0]).toHaveTextContent('Purple');
  });

  it('records the colour a row showed (tag colours included) when it is completed', () => {
    const s = useTaskStore.getState();
    s.setTagColor('work', PEACH);
    const id = s.add({ title: 'Report', tags: ['work'] });
    useTaskStore.getState().toggle(id);
    expect(useTaskStore.getState().history[0].color).toBe(PEACH);
  });

  it('AI-imported tasks stay automatic and pick up existing tag colours', () => {
    render(<App />);
    let ids: string[] = [];
    act(() => {
      useTaskStore.getState().setTagColor('work', PURPLE);
      ids = useTaskStore
        .getState()
        .appendTasks(
          [{ title: 'Imported', difficulty: 1, tags: ['work'], subtasks: [] }],
          'Imported from AI',
        );
    });
    expect(useTaskStore.getState().tasks[ids[0]].color).toBeNull();
    expect(indicator(ids[0])).toHaveAttribute('data-row-color', PURPLE);
  });
});
