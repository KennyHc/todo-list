import { beforeEach, describe, expect, it } from 'vitest';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { addSubtask } from './addSubtask';

describe('addSubtask', () => {
  beforeEach(() => resetTaskStore());

  it('appends an empty child after existing children and puts it in edit mode', () => {
    const s = useTaskStore.getState();
    const parent = s.add({ title: 'Plan trip' });
    const first = s.add({ title: 'Book flights', parentId: parent });

    const id = addSubtask(parent);

    const state = useTaskStore.getState();
    expect(id).not.toBeNull();
    expect(state.tasks[parent].childIds).toEqual([first, id]);
    expect(state.tasks[id!]).toMatchObject({ title: '', parentId: parent });
    expect(state.editingId).toBe(id);
  });

  it('expands a collapsed parent so the new row is visible', () => {
    const s = useTaskStore.getState();
    const parent = s.add({ title: 'Plan trip' });
    s.add({ title: 'Book flights', parentId: parent });
    s.update(parent, { collapsed: true });

    addSubtask(parent);

    expect(useTaskStore.getState().tasks[parent].collapsed).toBe(false);
  });

  it('does nothing for an unknown parent', () => {
    const before = useTaskStore.getState().tasks;
    expect(addSubtask('missing')).toBeNull();
    expect(useTaskStore.getState().tasks).toBe(before);
    expect(useTaskStore.getState().editingId).toBeNull();
  });
});
