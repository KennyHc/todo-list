import type { HistoryEntry } from './history';
import { normalizeTree } from './normalizeTree';
import type { Task, TaskTree } from '../types';

/** The undoable content of the task store. Snapshots share structure, so they cost nothing. */
export type UndoSnapshot = TaskTree & {
  history: HistoryEntry[];
  tagColors: Record<string, string>;
};

/** Deep equality for plain data (task fields, history entries): primitives, arrays, objects. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bs = b as unknown[];
    return a.length === bs.length && a.every((v, i) => sameValue(v, bs[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!sameValue(ao[k], bo[k])) return false;
  return true;
}

/** `cur` equals `from` apart from expanding and collapsing, which is view state. */
const unchangedSince = (cur: Task, from: Task): boolean =>
  cur === from || sameValue({ ...cur, collapsed: false }, { ...from, collapsed: false });

/**
 * Moves a list of ids by the change `from` -> `to`: ids the change removes are taken out, ids it
 * adds are put back after their nearest earlier neighbour in `to`. Everything else in `cur`
 * stays where it is. (A pure reorder is only replayed when `cur` still equals `from`.)
 */
export function mergeIds(cur: string[], from: string[], to: string[]): string[] {
  if (cur === from || sameValue(cur, from)) return to;
  const fromSet = new Set(from);
  const toSet = new Set(to);
  const next = cur.filter((id) => !fromSet.has(id) || toSet.has(id));
  for (let i = 0; i < to.length; i++) {
    const id = to[i];
    if (fromSet.has(id) || next.includes(id)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = next.indexOf(to[j]);
      if (k !== -1) {
        at = k + 1;
        break;
      }
    }
    next.splice(at, 0, id);
  }
  return sameValue(next, cur) ? cur : next;
}

/**
 * One task moved by `from` -> `to` (either may be undefined: created or deleted), given its
 * current value. A field changed since `from` (by another device, or by sync) keeps its
 * current value; the change's other fields still apply. Undefined means "no task".
 */
function mergeTask(cur: Task | undefined, from: Task | undefined, to: Task | undefined) {
  if (cur === from) return to;
  // Deleted since: it stays deleted.
  if (cur === undefined) return undefined;
  // The change creates it, but it exists already: keep what is there.
  if (from === undefined) return cur;
  // The change deletes it: only if nothing but its expanded state changed since.
  if (to === undefined) return unchangedSince(cur, from) ? undefined : cur;
  let next: Task | null = null;
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]) as Set<keyof Task>;
  for (const key of keys) {
    if (from[key] === to[key] || sameValue(from[key], to[key])) continue;
    let value: unknown;
    if (sameValue(cur[key], from[key])) value = to[key];
    else if (key === 'childIds') value = mergeIds(cur.childIds, from.childIds, to.childIds);
    else continue;
    next ??= { ...cur };
    if (value === undefined) delete (next as Partial<Task>)[key];
    else (next as Record<string, unknown>)[key] = value;
  }
  return next ?? cur;
}

function mergeHistory(
  cur: HistoryEntry[],
  from: HistoryEntry[],
  to: HistoryEntry[],
): HistoryEntry[] {
  if (cur === from) return to;
  if (from === to) return cur;
  const fromById = new Map(from.map((e) => [e.id, e]));
  const toById = new Map(to.map((e) => [e.id, e]));
  const kept = cur.filter((e) => !fromById.has(e.id) || toById.has(e.id));
  // Entries the change replaces (same id, new value), where nobody else changed them.
  let next = kept.map((e) => {
    const f = fromById.get(e.id);
    const t = toById.get(e.id);
    return f && t && f !== t && sameValue(e, f) ? t : e;
  });
  const ids = mergeIds(
    next.map((e) => e.id),
    from.map((e) => e.id),
    to.map((e) => e.id),
  );
  const byId = new Map(next.map((e) => [e.id, e]));
  next = ids.map((id) => byId.get(id) ?? toById.get(id)!);
  return next.length === cur.length && next.every((e, i) => e === cur[i]) ? cur : next;
}

function mergeTagColors(
  cur: Record<string, string>,
  from: Record<string, string>,
  to: Record<string, string>,
): Record<string, string> {
  if (cur === from) return to;
  if (from === to) return cur;
  let next: Record<string, string> | null = null;
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[key] === to[key] || cur[key] !== from[key]) continue;
    next ??= { ...cur };
    if (to[key] === undefined) delete next[key];
    else next[key] = to[key];
  }
  return next ?? cur;
}

/**
 * Applies the change that took `from` to `to` (an action, or its undo) on top of `cur`, the
 * live state, touching only what that change touched. Whatever changed since `from`, on this
 * device or another, wins where the two overlap:
 *
 * - tasks are merged field by field; a field that changed since keeps its current value;
 * - a task the change deletes is only deleted if it is unchanged since (expanding aside);
 * - a task deleted since stays deleted; one the change recreates comes back;
 * - child lists, rootIds and History merge by id, so ids others added or removed survive;
 * - tag colours merge per tag.
 *
 * The tree is normalized afterwards (see normalizeTree). Unchanged parts keep their identity.
 */
export function applyChange(cur: UndoSnapshot, from: UndoSnapshot, to: UndoSnapshot): UndoSnapshot {
  // Nothing changed since: the change applies whole (and identities are kept).
  if (cur.tasks === from.tasks && cur.rootIds === from.rootIds) {
    return {
      tasks: to.tasks,
      rootIds: to.rootIds,
      history: mergeHistory(cur.history, from.history, to.history),
      tagColors: mergeTagColors(cur.tagColors, from.tagColors, to.tagColors),
    };
  }
  let tasks = cur.tasks;
  if (from.tasks !== to.tasks) {
    const ids = new Set([...Object.keys(from.tasks), ...Object.keys(to.tasks)]);
    for (const id of ids) {
      if (from.tasks[id] === to.tasks[id]) continue;
      const next = mergeTask(cur.tasks[id], from.tasks[id], to.tasks[id]);
      if (next === cur.tasks[id]) continue;
      if (tasks === cur.tasks) tasks = { ...cur.tasks };
      if (next === undefined) delete tasks[id];
      else tasks[id] = next;
    }
  }
  const rootIds =
    from.rootIds === to.rootIds ? cur.rootIds : mergeIds(cur.rootIds, from.rootIds, to.rootIds);
  const tree = normalizeTree({ tasks, rootIds });
  return {
    tasks: tree.tasks,
    rootIds: tree.rootIds,
    history: mergeHistory(cur.history, from.history, to.history),
    tagColors: mergeTagColors(cur.tagColors, from.tagColors, to.tagColors),
  };
}
