import { nanoid } from 'nanoid';
import { MAX_TITLE_LENGTH, type Difficulty, type Task, type TaskTree } from '../types';
import { DEFAULT_COLOR } from './colors';
import { normalizeTags } from './tags';

type Tasks = Record<string, Task>;

export type NewTask = {
  title: string;
  parentId?: string | null;
  afterId?: string;
  difficulty?: Difficulty;
  color?: string;
  tags?: string[];
  dueDate?: string | null;
};

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'difficulty' | 'color' | 'collapsed' | 'tags' | 'dueDate'>
>;

const clampTitle = (title: string) => title.slice(0, MAX_TITLE_LENGTH);

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
  { title, parentId = null, afterId, difficulty = 1, color, tags, dueDate = null }: NewTask,
  now = Date.now(),
): { tree: TaskTree; id: string } {
  if (parentId !== null && !tree.tasks[parentId]) return { tree, id: '' };

  const draft = createDraft(tree);
  const id = nanoid();
  draft.tasks[id] = {
    id,
    title: clampTitle(title),
    difficulty,
    color: color ?? (parentId === null ? undefined : tree.tasks[parentId].color) ?? DEFAULT_COLOR,
    done: false,
    collapsed: false,
    tags: normalizeTags(tags ?? []),
    dueDate,
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

const sameValue = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((item, i) => item === b[i])
    : a === b;

export function updateTask(tree: TaskTree, id: string, rawPatch: TaskPatch): TaskTree {
  const task = tree.tasks[id];
  if (!task) return tree;
  const patch: TaskPatch = { ...rawPatch };
  if (patch.tags !== undefined) patch.tags = normalizeTags(patch.tags);
  if (patch.title !== undefined) patch.title = clampTitle(patch.title);
  const changed = (Object.keys(patch) as (keyof TaskPatch)[]).some(
    (key) => patch[key] !== undefined && !sameValue(patch[key], task[key]),
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

export type MoveTarget = {
  /** New parent, or null for the root list. */
  parentId: string | null;
  /** Position among the target parent's children once the task has been taken out. */
  index: number;
};

/**
 * Moves a task (with its subtree) to `target`. The index is clamped to the valid range. Returns
 * the same tree when the task or parent is unknown, the parent is the task or one of its
 * descendants, or the task would end up where it already is.
 */
export function moveTask(
  tree: TaskTree,
  id: string,
  target: MoveTarget,
  now = Date.now(),
): TaskTree {
  const task = tree.tasks[id];
  if (!task) return tree;
  const { parentId } = target;
  if (parentId !== null) {
    if (!tree.tasks[parentId]) return tree;
    if (parentId === id || getAncestors(tree, parentId).includes(id)) return tree;
  }

  const sameParent = parentId === task.parentId;
  const targetSiblings = parentId === null ? tree.rootIds : tree.tasks[parentId].childIds;
  const remaining = targetSiblings.length - (sameParent ? 1 : 0);
  const wanted = Number.isNaN(target.index) ? remaining : Math.trunc(target.index);
  const index = Math.min(remaining, Math.max(0, wanted));
  if (sameParent && index === siblingIds(tree, task).indexOf(id)) return tree;

  const draft = createDraft(tree);
  const oldParentId = task.parentId;
  detach(draft, task);
  draft.siblings(parentId).splice(index, 0, id);
  if (!sameParent) draft.edit(id).parentId = parentId;

  // Both ends changed their children: the old parent may now be complete, the new one may
  // have gained open work (or, as a former leaf, a done child).
  if (!sameParent) {
    reevaluateFrom(draft, oldParentId, now);
    reevaluateFrom(draft, parentId, now);
  }
  return draft.finish();
}

/** Removes every done task with its subtree. Returns the same tree if nothing is done. */
export function clearCompleted(tree: TaskTree): TaskTree {
  // A done parent's subtree is entirely done, so only the topmost done tasks need removing.
  const topmost = Object.values(tree.tasks).filter(
    (task) => task.done && (task.parentId === null || !tree.tasks[task.parentId]?.done),
  );
  if (topmost.length === 0) return tree;

  const draft = createDraft(tree);
  for (const task of topmost) {
    for (const removedId of [task.id, ...getDescendants(tree, task.id)]) {
      delete draft.tasks[removedId];
    }
    detach(draft, task);
  }
  return draft.finish();
}
