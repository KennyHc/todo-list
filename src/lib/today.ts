import type { Task, TaskTree } from '../types';
import type { HistoryEntry } from './history';
import { getAncestors } from './tree';

/*
 * The Today view's maths. Pure and self-contained (dates are compared as 'YYYY-MM-DD' strings,
 * which sort like the dates they are), so views.ts can use it without an import cycle.
 *
 * A task is "in Today" when it is open and (a) overdue, (b) due today or (c) planned for today
 * or an earlier day (an unfinished plan rolls over). When a task and one of its ancestors both
 * qualify, only the topmost is in Today: the parent stands for its whole subtree, counted once
 * with the points of the subtasks still open.
 */

export type TodayKind = 'overdue' | 'due' | 'planned';

/** Suggestions look this many days ahead for due dates. */
export const SUGGEST_WITHIN_DAYS = 7;
/** An undated task is a "small" suggestion up to this many points. */
export const SMALL_TASK_POINTS = 2;

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Local calendar date of a timestamp, 'YYYY-MM-DD'. */
function isoOf(timestamp: number): string {
  const date = new Date(timestamp);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** Why an open task is in Today, or null when it is not (or is done). */
export function todayKind(task: Task, today: string): TodayKind | null {
  if (task.done) return null;
  if (task.dueDate !== null) {
    if (task.dueDate < today) return 'overdue';
    if (task.dueDate === today) return 'due';
  }
  if (task.plannedFor !== null && task.plannedFor <= today) return 'planned';
  return null;
}

/** Ids of the open tasks in tree order (a done task takes its whole subtree with it). */
function openPreorder(tree: TaskTree): string[] {
  const out: string[] = [];
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const task = tree.tasks[id];
      if (!task || task.done) continue;
      out.push(id);
      walk(task.childIds);
    }
  };
  walk(tree.rootIds);
  return out;
}

/** Difficulty still to do under a task: the sum over its open leaves (a leaf is its own). */
export function openPoints(tree: TaskTree, id: string): number {
  const task = tree.tasks[id];
  if (!task || task.done) return 0;
  if (task.childIds.length === 0) return task.difficulty;
  return task.childIds.reduce((sum, childId) => sum + openPoints(tree, childId), 0);
}

export type TodayItem = { id: string; kind: TodayKind };

const RANK: Record<TodayKind, number> = { overdue: 0, due: 1, planned: 2 };

/**
 * The open tasks in Today, with why, in display order: overdue first (oldest due date first),
 * then due today, then planned (the oldest plan first), ties in tree order. With a tag, only
 * tasks carrying it. A task whose ancestor is in Today is left out (the ancestor covers it).
 */
export function todayItems(tree: TaskTree, today: string, tag: string | null = null): TodayItem[] {
  const order = openPreorder(tree);
  const kinds = new Map<string, TodayKind>();
  for (const id of order) {
    const task = tree.tasks[id];
    const kind = todayKind(task, today);
    if (kind !== null && (tag === null || task.tags.includes(tag))) kinds.set(id, kind);
  }
  const items: (TodayItem & { at: number })[] = [];
  order.forEach((id, at) => {
    const kind = kinds.get(id);
    if (kind === undefined) return;
    if (getAncestors(tree, id).some((ancestor) => kinds.has(ancestor))) return;
    items.push({ id, kind, at });
  });
  const key = (item: TodayItem): string => {
    const task = tree.tasks[item.id];
    return item.kind === 'overdue'
      ? (task.dueDate ?? '')
      : item.kind === 'planned'
        ? (task.plannedFor ?? '')
        : '';
  };
  items.sort((a, b) => {
    if (RANK[a.kind] !== RANK[b.kind]) return RANK[a.kind] - RANK[b.kind];
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : a.at - b.at;
  });
  return items.map(({ id, kind }) => ({ id, kind }));
}

/** Ids of the Today rows (see todayItems). */
export const todayList = (tree: TaskTree, today: string, tag: string | null = null): string[] =>
  todayItems(tree, today, tag).map((item) => item.id);

export type TodayLoad = {
  /** Points still to do in Today. */
  open: number;
  /** Points completed today (any task), counted over the leaves that were completed. */
  done: number;
  capacity: number;
};

/**
 * Points still open in Today and points finished today. Finished work comes from the History
 * entries completed on `today`; only leaf entries count, because a parent's entry restates the
 * leaves under it (each has its own), and a leaf finished on another day is not today's.
 */
export function todayLoad(
  tree: TaskTree,
  history: readonly HistoryEntry[],
  today: string,
  capacity: number,
): TodayLoad {
  let open = 0;
  for (const id of todayList(tree, today)) open += openPoints(tree, id);
  let done = 0;
  for (const entry of history) {
    if (!entry.isParent && isoOf(entry.completedAt) === today) done += entry.difficulty;
  }
  return { open, done, capacity };
}

/** How many History entries the user completed on `today` (cascaded ones don't count). */
export function completedTodayCount(history: readonly HistoryEntry[], today: string): number {
  let count = 0;
  for (const entry of history) if (!entry.auto && isoOf(entry.completedAt) === today) count += 1;
  return count;
}

/** The meter's pieces as fractions of its width. */
export type MeterShape = {
  done: number;
  planned: number;
  /** The part of the planned work past the capacity. */
  over: number;
  /** Where the capacity mark sits. */
  mark: number;
  overBy: number;
};

export function meterShape({ open, done, capacity }: TodayLoad): MeterShape {
  const total = open + done;
  const scale = Math.max(capacity, total, 1);
  const overBy = Math.max(0, total - capacity);
  const over = Math.min(open, overBy);
  return {
    done: done / scale,
    planned: (open - over) / scale,
    over: over / scale,
    mark: capacity / scale,
    overBy,
  };
}

/**
 * The planned rows that push the day over capacity: the latest-added ones, newest first, until
 * enough points are gone. Overdue and due rows are commitments, so they are never named.
 */
export function overflowIds(tree: TaskTree, today: string, load: TodayLoad): Set<string> {
  let excess = load.open + load.done - load.capacity;
  const out = new Set<string>();
  if (excess <= 0) return out;
  const planned = todayItems(tree, today)
    .filter((item) => item.kind === 'planned')
    .map((item, at) => ({ id: item.id, at, createdAt: tree.tasks[item.id].createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt || b.at - a.at);
  for (const { id } of planned) {
    if (excess <= 0) break;
    out.add(id);
    excess -= openPoints(tree, id);
  }
  return out;
}

/**
 * Up to `max` tasks worth adding to the day, each fitting in `capacityLeft` points: first those
 * due within the next week (soonest first), then small undated ones (oldest first). Never done
 * tasks, tasks already in Today (or under one that is), or tasks planned for a later day.
 * Of a task and its ancestor, only the better ranked is suggested.
 */
export function suggestions(
  tree: TaskTree,
  today: string,
  capacityLeft: number,
  max = 3,
): string[] {
  if (capacityLeft <= 0 || max <= 0) return [];
  const order = openPreorder(tree);
  const inToday = new Set(order.filter((id) => todayKind(tree.tasks[id], today) !== null));

  const dated: { id: string; due: string; at: number }[] = [];
  const undated: { id: string; created: number; at: number }[] = [];
  order.forEach((id, at) => {
    const task = tree.tasks[id];
    if (inToday.has(id) || getAncestors(tree, id).some((a) => inToday.has(a))) return;
    // Planned for a later day: set aside on purpose.
    if (task.plannedFor !== null && task.plannedFor > today) return;
    const points = openPoints(tree, id);
    if (points <= 0 || points > capacityLeft) return;
    if (task.dueDate !== null) {
      const days = dayNumber(task.dueDate) - dayNumber(today);
      if (days >= 1 && days <= SUGGEST_WITHIN_DAYS) dated.push({ id, due: task.dueDate, at });
    } else if (points <= SMALL_TASK_POINTS) {
      undated.push({ id, created: task.createdAt, at });
    }
  });
  dated.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.at - b.at));
  undated.sort((a, b) => a.created - b.created || a.at - b.at);

  const picked: string[] = [];
  for (const { id } of [...dated, ...undated]) {
    if (picked.length >= max) break;
    const related = (other: string) =>
      getAncestors(tree, id).includes(other) || getAncestors(tree, other).includes(id);
    if (picked.some(related)) continue;
    picked.push(id);
  }
  return picked;
}
