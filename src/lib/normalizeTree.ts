import type { Task, TaskTree } from '../types';

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Deterministic order for tasks that need re-attaching, so every device repairs identically. */
const byAge = (tasks: Record<string, Task>) => (a: string, b: string) =>
  tasks[a].createdAt - tasks[b].createdAt || (a < b ? -1 : a > b ? 1 : 0);

/**
 * Repairs inconsistencies that concurrent edits on two devices can leave behind. A task's own
 * `parentId` is authoritative (it is written atomically with the task); child lists follow it:
 *
 * - ids pointing at missing tasks are dropped from `childIds` / `rootIds`;
 * - a task listed under several parents (or twice) stays only in its `parentId`'s list, once;
 * - a task missing from its parent's list is appended to it (oldest first);
 * - a task whose parent is missing becomes a root;
 * - cycles are broken by making the smallest id in the cycle a root.
 *
 * `done` flags are never touched. Returns the same object when nothing changed, and keeps the
 * identity of every task that did not need a fix.
 */
export function normalizeTree<T extends TaskTree>(tree: T): T {
  const { tasks } = tree;
  const ids = Object.keys(tasks);

  // 1. Effective parent per task: its parentId if that task exists, else root (null).
  const parent = new Map<string, string | null>();
  for (const id of ids) {
    const p = tasks[id].parentId;
    parent.set(id, p !== null && p !== id && tasks[p] ? p : null);
  }

  // 2. Break cycles. Iterative walk; `state` 1 = on the current path, 2 = known acyclic.
  const state = new Map<string, 1 | 2>();
  for (const start of ids) {
    if (state.has(start)) continue;
    const path: string[] = [];
    let cur: string | null = start;
    while (cur !== null && !state.has(cur)) {
      state.set(cur, 1);
      path.push(cur);
      cur = parent.get(cur) ?? null;
    }
    if (cur !== null && state.get(cur) === 1) {
      const cycle = path.slice(path.indexOf(cur));
      const cut = cycle.reduce((min, id) => (id < min ? id : min));
      parent.set(cut, null);
    }
    for (const id of path) state.set(id, 2);
  }

  // 3. Rebuild each child list: valid, owned, first occurrence; then append orphans.
  const orphans = new Map<string | null, string[]>();
  for (const id of ids) {
    const p = parent.get(id) ?? null;
    let list = orphans.get(p);
    if (!list) orphans.set(p, (list = []));
    list.push(id);
  }
  const rebuild = (owner: string | null, current: string[]): string[] => {
    const owned = new Set(orphans.get(owner) ?? []);
    const seen = new Set<string>();
    const next: string[] = [];
    for (const id of current) {
      if (!owned.has(id) || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    const missing = (orphans.get(owner) ?? []).filter((id) => !seen.has(id));
    if (missing.length > 0) next.push(...missing.sort(byAge(tasks)));
    return sameList(next, current) ? current : next;
  };

  const rootIds = rebuild(null, tree.rootIds);
  let nextTasks: Record<string, Task> | null = null;
  for (const id of ids) {
    const task = tasks[id];
    const parentId = parent.get(id) ?? null;
    const childIds = rebuild(id, task.childIds);
    if (parentId === task.parentId && childIds === task.childIds) continue;
    nextTasks ??= { ...tasks };
    nextTasks[id] = { ...task, parentId, childIds };
  }

  if (!nextTasks && rootIds === tree.rootIds) return tree;
  return { ...tree, tasks: nextTasks ?? tasks, rootIds };
}
