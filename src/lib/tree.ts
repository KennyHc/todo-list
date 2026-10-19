import { nanoid } from 'nanoid';
import type { Difficulty, Task, TaskTree } from '../types';
import { DEFAULT_COLOR } from './colors';

type Tasks = Record<string, Task>;

export type NewTask = {
  title: string;
  parentId?: string | null;
  afterId?: string;
  difficulty?: Difficulty;
  color?: string;
};

export type TaskPatch = Partial<Pick<Task, 'title' | 'difficulty' | 'color' | 'collapsed'>>;

export const emptyTree = (): TaskTree => ({ tasks: {}, rootIds: [] });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const isLeaf = (tree: TaskTree, id: string): boolean =>
  tree.tasks[id] !== undefined && tree.tasks[id].childIds.length === 0;

/** Ancestor ids, nearest first. */
export function getAncestors(tree: TaskTree, id: string): string[] {
  const result: string[] = [];
  let parentId = tree.tasks[id]?.parentId ?? null;
  while (parentId !== null && tree.tasks[parentId]) {
    result.push(parentId);
    parentId = tree.tasks[parentId].parentId;
  }
  return result;
}

/** Descendant ids in pre-order. */
export function getDescendants(tree: TaskTree, id: string): string[] {
  const result: string[] = [];
  const visit = (taskId: string) => {
    for (const childId of tree.tasks[taskId]?.childIds ?? []) {
      result.push(childId);
      visit(childId);
    }
  };
  visit(id);
  return result;
}

/** A leaf's own difficulty, or the recursive sum over its children. */
export function effectiveDifficulty(tree: TaskTree, id: string): number {
  const task = tree.tasks[id];
  if (!task) return 0;
  if (task.childIds.length === 0) return task.difficulty;
  return task.childIds.reduce((sum, childId) => sum + effectiveDifficulty(tree, childId), 0);
}

/** Done/total counted over leaf descendants (a leaf counts itself). */
export function progress(tree: TaskTree, id: string): { done: number; total: number } {
  const task = tree.tasks[id];
  if (!task) return { done: 0, total: 0 };
  if (task.childIds.length === 0) return { done: task.done ? 1 : 0, total: 1 };
  return task.childIds.reduce(
    (acc, childId) => {
      const child = progress(tree, childId);
      return { done: acc.done + child.done, total: acc.total + child.total };
    },
    { done: 0, total: 0 },
  );
}

/** Stable sort: undone first, then done, original order kept within each group. */
export function sortedChildIds(tree: TaskTree, ids: string[]): string[] {
  const isDone = (id: string) => tree.tasks[id]?.done ?? false;
  return [...ids.filter((id) => !isDone(id)), ...ids.filter(isDone)];
}

// ---------------------------------------------------------------------------
// Internal helpers: copy-on-write drafts, so untouched tasks keep their identity
// ---------------------------------------------------------------------------

type Draft = {
  tasks: Tasks;
  /** Returns a private, mutable copy of the task (copied once, on first edit). */
  edit: (id: string) => Task;
  /** Returns a private, mutable copy of the root list (copied once). */
  roots: () => string[];
  /** The mutable child list of `parentId`, or the root list when null. */
  siblings: (parentId: string | null) => string[];
  finish: () => TaskTree;
};

function createDraft(tree: TaskTree): Draft {
  const tasks: Tasks = { ...tree.tasks };
  const edited = new Set<string>();
  let rootIds = tree.rootIds;
  let rootsCopied = false;

  const edit = (id: string): Task => {
    if (!edited.has(id)) {
      edited.add(id);
      tasks[id] = { ...tasks[id], childIds: [...tasks[id].childIds] };
    }
    return tasks[id];
  };
  const roots = (): string[] => {
    if (!rootsCopied) {
      rootsCopied = true;
      rootIds = [...rootIds];
    }
    return rootIds;
  };
  const siblings = (parentId: string | null) =>
    parentId === null ? roots() : edit(parentId).childIds;

  return { tasks, edit, roots, siblings, finish: () => ({ tasks, rootIds }) };
}

const siblingIds = (tree: TaskTree, task: Task): string[] =>
  task.parentId === null ? tree.rootIds : tree.tasks[task.parentId].childIds;

/** Sets done (and completedAt) only if the value actually changes. */
function setDone(draft: Draft, id: string, done: boolean, now: number): void {
  if (draft.tasks[id].done === done) return;
  const task = draft.edit(id);
  task.done = done;
  if (done) task.completedAt = now;
  else delete task.completedAt;
}

/**
 * Walks up from `startId`, setting each task's done flag from its children.
 * A task without children keeps its current flag.
 */
function reevaluateFrom(draft: Draft, startId: string | null, now: number): void {
  let id = startId;
  while (id !== null) {
    const task = draft.tasks[id];
    if (task.childIds.length > 0) {
      setDone(
        draft,
        id,
        task.childIds.every((childId) => draft.tasks[childId].done),
        now,
      );
    }
    id = task.parentId;
  }
}

function detach(draft: Draft, task: Task): void {
  const siblings = draft.siblings(task.parentId);
  siblings.splice(siblings.indexOf(task.id), 1);
}

// ---------------------------------------------------------------------------
// Mutations (all return a new tree; a no-op returns the same tree)
// ---------------------------------------------------------------------------

export function addTask(
  tree: TaskTree,
  { title, parentId = null, afterId, difficulty = 1, color }: NewTask,
  now = Date.now(),
): { tree: TaskTree; id: string } {
  if (parentId !== null && !tree.tasks[parentId]) return { tree, id: '' };

  const draft = createDraft(tree);
  const id = nanoid();
  draft.tasks[id] = {
    id,
    title,
    difficulty,
    color: color ?? (parentId === null ? undefined : tree.tasks[parentId].color) ?? DEFAULT_COLOR,
    done: false,
    collapsed: false,
    parentId,
    childIds: [],
    createdAt: now,
  };

  const siblings = draft.siblings(parentId);
  const afterIndex = afterId === undefined ? -1 : siblings.indexOf(afterId);
  siblings.splice(afterIndex === -1 ? siblings.length : afterIndex + 1, 0, id);

  // New open work: a done parent (and done ancestors) reopen.
  reevaluateFrom(draft, parentId, now);
  return { tree: draft.finish(), id };
}

export function updateTask(tree: TaskTree, id: string, patch: TaskPatch): TaskTree {
  const task = tree.tasks[id];
  if (!task) return tree;
  const changed = (Object.keys(patch) as (keyof TaskPatch)[]).some(
    (key) => patch[key] !== undefined && patch[key] !== task[key],
  );
  if (!changed) return tree;

  const draft = createDraft(tree);
  Object.assign(draft.edit(id), patch);
  return draft.finish();
}

export function deleteTask(tree: TaskTree, id: string, now = Date.now()): TaskTree {
  const task = tree.tasks[id];
  if (!task) return tree;

  const draft = createDraft(tree);
  for (const removedId of [id, ...getDescendants(tree, id)]) delete draft.tasks[removedId];
  detach(draft, task);
  reevaluateFrom(draft, task.parentId, now);
  return draft.finish();
}

export function toggleDone(tree: TaskTree, id: string, now = Date.now()): TaskTree {
  const task = tree.tasks[id];
  if (!task) return tree;

  const draft = createDraft(tree);
  const done = !task.done;
  for (const affectedId of [id, ...getDescendants(tree, id)]) {
    setDone(draft, affectedId, done, now);
  }

  if (done) {
    reevaluateFrom(draft, task.parentId, now);
  } else {
    for (const ancestorId of getAncestors(tree, id)) setDone(draft, ancestorId, false, now);
  }
  return draft.finish();
}

/** Makes the task the last child of its previous sibling. */
export function indentTask(tree: TaskTree, id: string, now = Date.now()): TaskTree {
  const task = tree.tasks[id];
  if (!task) return tree;

  const siblings = siblingIds(tree, task);
  const index = siblings.indexOf(id);
  if (index <= 0) return tree;

  const draft = createDraft(tree);
  const newParentId = siblings[index - 1];
  detach(draft, task);
  draft.edit(newParentId).childIds.push(id);
  draft.edit(id).parentId = newParentId;

  reevaluateFrom(draft, task.parentId, now);
  reevaluateFrom(draft, newParentId, now);
  return draft.finish();
}

/** Moves the task to sit directly after its parent. */
export function outdentTask(tree: TaskTree, id: string, now = Date.now()): TaskTree {
  const task = tree.tasks[id];
  if (!task || task.parentId === null) return tree;

  const draft = createDraft(tree);
  const oldParentId = task.parentId;
  const grandparentId = tree.tasks[oldParentId].parentId;
  detach(draft, task);

  const siblings = draft.siblings(grandparentId);
  siblings.splice(siblings.indexOf(oldParentId) + 1, 0, id);
  draft.edit(id).parentId = grandparentId;

  // The old parent lost a child; the grandparent gained one (possibly an undone one).
  reevaluateFrom(draft, oldParentId, now);
  return draft.finish();
}
