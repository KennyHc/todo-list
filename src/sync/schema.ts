import { normalizeTagColors, normalizeTaskColor } from '../lib/colors';
import type { HistoryEntry } from '../lib/history';
import { normalizeRepeat } from '../lib/recur';
import { sameRepeat } from '../lib/tree';
import type { Difficulty, Task } from '../types';

/** Plain-data helpers for the Firestore documents. No Firebase imports: unit-testable. */

/**
 * 3: task `color` may be null ("automatic") and the meta document carries `tagColors`.
 * Version 2 documents stay readable: their default blue decodes to null.
 * Tasks may also carry `repeat` (a map, or null) and `spawnedFrom`; both are optional on read,
 * so there is no version bump.
 */
export const SCHEMA_VERSION = 3;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const sameStrings = (a: readonly string[], b: readonly string[]) =>
  a === b || (a.length === b.length && a.every((v, i) => v === b[i]));

export function isEqualTask(a: Task, b: Task): boolean {
  return (
    a === b ||
    (a.id === b.id &&
      a.title === b.title &&
      a.difficulty === b.difficulty &&
      a.color === b.color &&
      a.done === b.done &&
      a.collapsed === b.collapsed &&
      a.dueDate === b.dueDate &&
      sameRepeat(a.repeat, b.repeat) &&
      a.spawnedFrom === b.spawnedFrom &&
      a.parentId === b.parentId &&
      a.createdAt === b.createdAt &&
      a.completedAt === b.completedAt &&
      sameStrings(a.tags, b.tags) &&
      sameStrings(a.childIds, b.childIds))
  );
}

export function isEqualEntry(a: HistoryEntry, b: HistoryEntry): boolean {
  return (
    a === b ||
    (a.id === b.id &&
      a.taskId === b.taskId &&
      a.title === b.title &&
      a.color === b.color &&
      a.dueDate === b.dueDate &&
      a.difficulty === b.difficulty &&
      a.isParent === b.isParent &&
      a.subtaskCount === b.subtaskCount &&
      a.createdAt === b.createdAt &&
      a.completedAt === b.completedAt &&
      a.auto === b.auto &&
      sameStrings(a.tags, b.tags) &&
      sameStrings(a.path, b.path))
  );
}

export const isEqualIds = sameStrings;

export function isEqualTagColors(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** Defensive read of the meta document's `tagColors` map (absent means none). */
export const fromTagColors = normalizeTagColors;

/** Document body for a task. `completedAt` is omitted (not undefined) when unset. */
export function toTaskDoc(task: Task): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    id: task.id,
    title: task.title,
    difficulty: task.difficulty,
    color: task.color,
    done: task.done,
    collapsed: task.collapsed,
    tags: task.tags,
    dueDate: task.dueDate,
    repeat: task.repeat,
    parentId: task.parentId,
    childIds: task.childIds,
    createdAt: task.createdAt,
  };
  if (task.spawnedFrom !== undefined) doc.spawnedFrom = task.spawnedFrom;
  if (task.completedAt !== undefined) doc.completedAt = task.completedAt;
  return doc;
}

/** Defensive read: a malformed document yields null rather than poisoning the store. */
export function fromTaskDoc(id: string, data: unknown): Task | null {
  if (!isRecord(data)) return null;
  const difficulty = Math.min(5, Math.max(1, Math.round(num(data.difficulty, 1)))) as Difficulty;
  const task: Task = {
    id,
    title: str(data.title),
    difficulty,
    color: normalizeTaskColor(data.color),
    done: data.done === true,
    collapsed: data.collapsed === true,
    tags: strings(data.tags),
    dueDate: typeof data.dueDate === 'string' ? data.dueDate : null,
    repeat: normalizeRepeat(data.repeat),
    parentId: typeof data.parentId === 'string' ? data.parentId : null,
    childIds: strings(data.childIds),
    createdAt: num(data.createdAt),
  };
  if (typeof data.spawnedFrom === 'string') task.spawnedFrom = data.spawnedFrom;
  if (typeof data.completedAt === 'number') task.completedAt = data.completedAt;
  return task;
}

/**
 * History is an ordered array but Firestore returns documents ordered by `completedAt` only,
 * and entries completed together (a cascade) share a timestamp. `ord` is an entry's index
 * among entries with the same `completedAt`, so the original order survives the round trip.
 */
export type OrderedEntry = { entry: HistoryEntry; ord: number };

export function historyOrds(history: readonly HistoryEntry[]): Map<string, number> {
  const ords = new Map<string, number>();
  let run = 0;
  let prev: number | null = null;
  for (const entry of history) {
    run = entry.completedAt === prev ? run + 1 : 0;
    prev = entry.completedAt;
    ords.set(entry.id, run);
  }
  return ords;
}

export function toHistoryDoc(entry: HistoryEntry, ord: number): Record<string, unknown> {
  return {
    id: entry.id,
    taskId: entry.taskId,
    title: entry.title,
    color: entry.color,
    tags: entry.tags,
    dueDate: entry.dueDate,
    difficulty: entry.difficulty,
    isParent: entry.isParent,
    subtaskCount: entry.subtaskCount,
    path: entry.path,
    createdAt: entry.createdAt,
    completedAt: entry.completedAt,
    auto: entry.auto,
    ord,
  };
}

export function fromHistoryDoc(id: string, data: unknown): OrderedEntry | null {
  if (!isRecord(data) || typeof data.completedAt !== 'number') return null;
  return {
    ord: num(data.ord),
    entry: {
      id,
      taskId: str(data.taskId),
      title: str(data.title),
      color: typeof data.color === 'string' ? data.color : null,
      tags: strings(data.tags),
      dueDate: typeof data.dueDate === 'string' ? data.dueDate : null,
      difficulty: num(data.difficulty, 1),
      isParent: data.isParent === true,
      subtaskCount: num(data.subtaskCount),
      path: strings(data.path),
      createdAt: num(data.createdAt),
      completedAt: data.completedAt,
      auto: data.auto === true,
    },
  };
}
