import type { TaskTree } from '../types';
import { getAncestors, getDescendants, sortedChildIds } from './tree';

export type DueStatus = 'overdue' | 'today' | 'soon' | 'later';

/** Days (inclusive of today+N) that count as 'soon'. */
export const SOON_DAYS = 3;

/** Tags with usage counts, most used first, then alphabetical. */
export function allTags(tree: TaskTree): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const task of Object.values(tree.tasks)) {
    for (const tag of task.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

/** Ancestor titles, root first. */
export function taskPath(tree: TaskTree, id: string): string[] {
  return getAncestors(tree, id)
    .reverse()
    .map((ancestorId) => tree.tasks[ancestorId].title);
}

/**
 * Ids to show in the tree under a tag filter: matching tasks, their ancestors (context) and
 * all descendants of a match. `null` means no filter: everything is visible.
 */
export function visibleTreeIds(tree: TaskTree, tag: string | null): Set<string> | null {
  if (tag === null) return null;
  const visible = new Set<string>();
  for (const task of Object.values(tree.tasks)) {
    if (!task.tags.includes(tag)) continue;
    visible.add(task.id);
    for (const id of getAncestors(tree, task.id)) visible.add(id);
    for (const id of getDescendants(tree, task.id)) visible.add(id);
  }
  return visible;
}

/**
 * Every task (parents and subtasks alike, hierarchy ignored), optionally filtered by tag:
 * undone with a due date (soonest first), undone without one (oldest first), then done
 * (most recently completed first). Ties keep the tree's insertion order.
 */
export function deadlineList(tree: TaskTree, { tag }: { tag: string | null }): string[] {
  const tasks = Object.values(tree.tasks).filter((task) => tag === null || task.tags.includes(tag));
  const dated = tasks
    .filter((t) => !t.done && t.dueDate !== null)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0));
  const undated = tasks.filter((t) => !t.done && t.dueDate === null).sort(byCreated);
  const finished = tasks
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return [...dated, ...undated, ...finished].map((t) => t.id);
}

const byCreated = (a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt;

/** Local calendar date as 'YYYY-MM-DD' (not UTC). */
export function todayISO(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

export function dueStatus(dueDate: string | null, today: string): DueStatus | null {
  if (dueDate === null) return null;
  const days = dayNumber(dueDate) - dayNumber(today);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= SOON_DAYS ? 'soon' : 'later';
}

/**
 * True when a task is only visible under a tag filter for context: it doesn't carry the tag and
 * neither does any of its ancestors (so it is an ancestor of a match, not part of one).
 */
export function isContextOnly(tree: TaskTree, id: string, tag: string): boolean {
  const task = tree.tasks[id];
  if (!task || task.tags.includes(tag)) return false;
  return !getAncestors(tree, id).some((ancestorId) => tree.tasks[ancestorId].tags.includes(tag));
}

/**
 * Ids of the rows currently on screen, in display order: tree order (undone before done,
 * skipping collapsed subtrees and anything the tag filter hides) or deadline order. History
 * rows aren't tasks, so that view has no keyboard order.
 */
export function visibleOrder(
  tree: TaskTree,
  { view, tag }: { view: 'tree' | 'deadline' | 'history'; tag: string | null },
): string[] {
  if (view === 'history') return [];
  if (view === 'deadline') return deadlineList(tree, { tag });
  const visible = visibleTreeIds(tree, tag);
  const out: string[] = [];
  const walk = (ids: string[]) => {
    for (const id of sortedChildIds(tree, ids)) {
      const task = tree.tasks[id];
      if (!task || (visible && !visible.has(id))) continue;
      out.push(id);
      if (!task.collapsed) walk(task.childIds);
    }
  };
  walk(tree.rootIds);
  return out;
}

/** The row to focus once `id` (and everything in `removed`) is gone: the next one, else the previous. */
export function neighborAfterRemoval(
  order: string[],
  id: string,
  removed: ReadonlySet<string> = new Set([id]),
): string | null {
  const index = order.indexOf(id);
  if (index === -1) return null;
  const after = order.slice(index + 1).find((other) => !removed.has(other));
  if (after !== undefined) return after;
  const before = order.slice(0, index).reverse();
  return before.find((other) => !removed.has(other)) ?? null;
}
