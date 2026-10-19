import type { HistoryEntry } from '../lib/history';
import type { PersistedTasks } from '../store/tasks';
import type { Task } from '../types';
import { isEqualTagColors } from './schema';

export type StateDiff = {
  taskUpserts: Task[];
  taskDeletes: string[];
  historyUpserts: HistoryEntry[];
  historyDeletes: string[];
  rootIdsChanged: boolean;
  tagColorsChanged: boolean;
};

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * What must be written to bring a remote that holds `prev` up to `next`. Compares by reference,
 * which is exact because the store is copy-on-write with structural sharing.
 */
export function diffState(prev: PersistedTasks, next: PersistedTasks): StateDiff {
  const diff: StateDiff = {
    taskUpserts: [],
    taskDeletes: [],
    historyUpserts: [],
    historyDeletes: [],
    rootIdsChanged: prev.rootIds !== next.rootIds && !sameIds(prev.rootIds, next.rootIds),
    tagColorsChanged:
      prev.tagColors !== next.tagColors && !isEqualTagColors(prev.tagColors, next.tagColors),
  };

  if (prev.tasks !== next.tasks) {
    for (const id in next.tasks) {
      if (prev.tasks[id] !== next.tasks[id]) diff.taskUpserts.push(next.tasks[id]);
    }
    for (const id in prev.tasks) {
      if (!(id in next.tasks)) diff.taskDeletes.push(id);
    }
  }

  if (prev.history !== next.history) {
    const before = new Map(prev.history.map((e) => [e.id, e]));
    for (const entry of next.history) {
      if (before.get(entry.id) !== entry) diff.historyUpserts.push(entry);
      before.delete(entry.id);
    }
    diff.historyDeletes.push(...before.keys());
  }

  return diff;
}

export const isEmptyDiff = (d: StateDiff) =>
  d.taskUpserts.length === 0 &&
  d.taskDeletes.length === 0 &&
  d.historyUpserts.length === 0 &&
  d.historyDeletes.length === 0 &&
  !d.rootIdsChanged &&
  !d.tagColorsChanged;
