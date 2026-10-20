import { nanoid } from 'nanoid';
import type { TaskTree } from '../types';
import { effectiveColor } from './colorResolve';
import { taskPath } from './views';
import { effectiveDifficulty, progress } from './tree';

export type HistoryEntry = {
  id: string;
  taskId: string;
  title: string;
  /** The colour the row showed when it was completed; null for none (or the old default blue). */
  color: string | null;
  tags: string[];
  dueDate: string | null;
  /** effectiveDifficulty at completion time. */
  difficulty: number;
  isParent: boolean;
  /** Leaf descendants, 0 for a leaf. */
  subtaskCount: number;
  /** Ancestor titles, root first. */
  path: string[];
  createdAt: number;
  completedAt: number;
  /** True if completed by cascade rather than being the task the user toggled. */
  auto: boolean;
};

export type CompletionDiff = { completed: HistoryEntry[]; reopenedTaskIds: string[] };

/** Ids in post-order (children before their parent), following display order. */
function postOrder(tree: TaskTree): string[] {
  const result: string[] = [];
  const visit = (id: string) => {
    for (const childId of tree.tasks[id]?.childIds ?? []) visit(childId);
    result.push(id);
  };
  tree.rootIds.forEach(visit);
  return result;
}

/**
 * Compares done flags of tasks present in both trees. Snapshots use the `after` tree.
 * Completed entries are ordered children first, so a cascaded parent comes after its subtasks.
 */
export function diffCompletions(
  before: TaskTree,
  after: TaskTree,
  toggledId: string,
  now: number,
  tagColors: Readonly<Record<string, string>> = {},
): CompletionDiff {
  const completed: HistoryEntry[] = [];
  const reopenedTaskIds: string[] = [];
  if (before === after) return { completed, reopenedTaskIds };

  for (const id of postOrder(after)) {
    const was = before.tasks[id];
    const task = after.tasks[id];
    if (!was || was.done === task.done) continue;
    if (!task.done) {
      reopenedTaskIds.push(id);
      continue;
    }
    const isParent = task.childIds.length > 0;
    completed.push({
      id: nanoid(),
      taskId: id,
      title: task.title,
      color: effectiveColor(after, tagColors, id).color,
      tags: task.tags,
      dueDate: task.dueDate,
      difficulty: effectiveDifficulty(after, id),
      isParent,
      subtaskCount: isParent ? progress(after, id).total : 0,
      path: taskPath(after, id),
      createdAt: task.createdAt,
      completedAt: now,
      auto: id !== toggledId,
    });
  }
  return { completed, reopenedTaskIds };
}

/** Appends completed entries (newest last); each reopened task loses its latest entry only. */
export function applyHistory(history: HistoryEntry[], diff: CompletionDiff): HistoryEntry[] {
  if (diff.completed.length === 0 && diff.reopenedTaskIds.length === 0) return history;

  const next = [...history];
  for (const taskId of diff.reopenedTaskIds) {
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].taskId === taskId) {
        next.splice(i, 1);
        break;
      }
    }
  }
  return [...next, ...diff.completed];
}

/**
 * Done tasks are hidden from the Tree and live in History, so a done task without any History
 * entry would be invisible. This gives each one an entry (completedAt from the task, else
 * `now`). Ids are derived from the task id, so devices repairing the same data agree. Returns
 * the same array when nothing is missing.
 */
export function synthesizeHistory(
  data: TaskTree & { history: HistoryEntry[]; tagColors: Record<string, string> },
  now: number = Date.now(),
): HistoryEntry[] {
  const have = new Set(data.history.map((entry) => entry.taskId));
  const made: HistoryEntry[] = [];
  for (const id of postOrder(data)) {
    const task = data.tasks[id];
    if (!task.done || have.has(id)) continue;
    const isParent = task.childIds.length > 0;
    made.push({
      id: `h-${id}`,
      taskId: id,
      title: task.title,
      color: effectiveColor(data, data.tagColors, id).color,
      tags: task.tags,
      dueDate: task.dueDate,
      difficulty: effectiveDifficulty(data, id),
      isParent,
      subtaskCount: isParent ? progress(data, id).total : 0,
      path: taskPath(data, id),
      createdAt: task.createdAt,
      completedAt: task.completedAt ?? now,
      auto: false,
    });
  }
  if (made.length === 0) return data.history;
  // Stable merge by completedAt: existing entries win a tie, new ones keep tree order.
  const merged = [...data.history];
  for (const entry of made) {
    let at = merged.length;
    while (at > 0 && merged[at - 1].completedAt > entry.completedAt) at -= 1;
    merged.splice(at, 0, entry);
  }
  return merged;
}
