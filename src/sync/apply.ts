import type { HistoryEntry } from '../lib/history';
import { normalizeTree } from '../lib/normalizeTree';
import { normalizeSettings } from '../lib/settings';
import type { PersistedTasks } from '../store/tasks';
import type { Settings, Task } from '../types';
import {
  historyOrds,
  isEqualEntry,
  isEqualIds,
  isEqualSettings,
  isEqualTagColors,
  isEqualTask,
  type OrderedEntry,
} from './schema';

/** A batch of remote document changes already decoded to plain data. `null` means removed. */
export type RemoteChanges = {
  tasks: Map<string, Task | null>;
  history: Map<string, OrderedEntry | null>;
  rootIds: string[] | null;
  tagColors: Record<string, string> | null;
  settings: Settings | null;
};

export const emptyChanges = (): RemoteChanges => ({
  tasks: new Map(),
  history: new Map(),
  rootIds: null,
  tagColors: null,
  settings: null,
});

export const hasChanges = (c: RemoteChanges) =>
  c.tasks.size > 0 ||
  c.history.size > 0 ||
  c.rootIds !== null ||
  c.tagColors !== null ||
  c.settings !== null;

/** Build the state a full set of documents describes (initial load). */
export function buildState(
  tasks: Iterable<Task>,
  rootIds: string[],
  history: Iterable<OrderedEntry>,
  tagColors: Record<string, string> = {},
  settings: Settings = normalizeSettings(undefined),
): PersistedTasks {
  const byId: Record<string, Task> = {};
  for (const task of tasks) byId[task.id] = task;
  return { tasks: byId, rootIds, history: sortHistory([...history]), tagColors, settings };
}

const sortHistory = (items: OrderedEntry[]): HistoryEntry[] =>
  items
    .sort(
      (a, b) =>
        a.entry.completedAt - b.entry.completedAt ||
        a.ord - b.ord ||
        (a.entry.id < b.entry.id ? -1 : 1),
    )
    .map((i) => i.entry);

/**
 * Applies remote changes on top of `cur` (the live store state), never on top of `last`.
 *
 * - Documents whose local value differs from `last` carry an unflushed local edit; those win
 *   (they are about to be written, last-writer-wins) and the remote change is skipped.
 * - Remote values deep-equal to the current ones are ignored, so identities are preserved.
 * - The result is normalized. `nextLast` is `last` with the same remote changes applied, so
 *   applied changes are not echoed back as writes while pending local edits still are.
 *   Normalization repairs are folded into `nextLast` only where there is no pending edit.
 */
export function applyRemote(
  cur: PersistedTasks,
  last: PersistedTasks,
  changes: RemoteChanges,
): { next: PersistedTasks; nextLast: PersistedTasks; changed: boolean } {
  let tasks = cur.tasks;
  let lastTasks = last.tasks;
  let rootIds = cur.rootIds;
  let lastRootIds = last.rootIds;

  for (const [id, incoming] of changes.tasks) {
    const have = cur.tasks[id];
    if (have !== last.tasks[id]) continue;
    if (incoming === null) {
      if (!have) continue;
      if (tasks === cur.tasks) tasks = { ...cur.tasks };
      if (lastTasks === last.tasks) lastTasks = { ...last.tasks };
      delete tasks[id];
      delete lastTasks[id];
    } else {
      if (have && isEqualTask(have, incoming)) continue;
      if (tasks === cur.tasks) tasks = { ...cur.tasks };
      if (lastTasks === last.tasks) lastTasks = { ...last.tasks };
      tasks[id] = incoming;
      lastTasks[id] = incoming;
    }
  }

  if (
    changes.rootIds &&
    cur.rootIds === last.rootIds &&
    !isEqualIds(cur.rootIds, changes.rootIds)
  ) {
    rootIds = lastRootIds = changes.rootIds;
  }

  let tagColors = cur.tagColors;
  let lastTagColors = last.tagColors;
  if (
    changes.tagColors &&
    cur.tagColors === last.tagColors &&
    !isEqualTagColors(cur.tagColors, changes.tagColors)
  ) {
    tagColors = lastTagColors = changes.tagColors;
  }

  let settings = cur.settings;
  let lastSettings = last.settings;
  if (
    changes.settings &&
    cur.settings === last.settings &&
    !isEqualSettings(cur.settings, changes.settings)
  ) {
    settings = lastSettings = changes.settings;
  }

  let history = cur.history;
  let lastHistory = last.history;
  if (changes.history.size > 0) {
    const curMap = new Map(cur.history.map((e) => [e.id, e]));
    const lastMap = new Map(last.history.map((e) => [e.id, e]));
    const apply = new Map<string, OrderedEntry | null>();
    for (const [id, incoming] of changes.history) {
      const have = curMap.get(id);
      if (have !== lastMap.get(id)) continue;
      if (incoming === null ? !have : have && isEqualEntry(have, incoming.entry)) continue;
      apply.set(id, incoming);
    }
    if (apply.size > 0) {
      history = applyHistory(cur.history, apply);
      lastHistory = applyHistory(last.history, apply);
    }
  }

  const applied: PersistedTasks = { tasks, rootIds, history, tagColors, settings };
  const normalized = normalizeTree(applied);
  const changed =
    normalized.tasks !== cur.tasks ||
    normalized.rootIds !== cur.rootIds ||
    normalized.history !== cur.history ||
    tagColors !== cur.tagColors ||
    settings !== cur.settings;
  if (!changed) return { next: cur, nextLast: last, changed: false };

  // Fold repairs into `last` only for documents without a pending local edit.
  if (normalized.tasks !== tasks) {
    for (const id in normalized.tasks) {
      if (normalized.tasks[id] === tasks[id] || lastTasks[id] !== tasks[id]) continue;
      if (lastTasks === last.tasks) lastTasks = { ...last.tasks };
      lastTasks[id] = normalized.tasks[id];
    }
  }
  if (normalized.rootIds !== rootIds && lastRootIds === rootIds) lastRootIds = normalized.rootIds;

  return {
    next: { tasks: normalized.tasks, rootIds: normalized.rootIds, history, tagColors, settings },
    nextLast: {
      tasks: lastTasks,
      rootIds: lastRootIds,
      history: lastHistory,
      tagColors: lastTagColors,
      settings: lastSettings,
    },
    changed: true,
  };
}

/** Removes/replaces entries in place and merges added ones by (completedAt, ord, id). */
function applyHistory(
  history: HistoryEntry[],
  apply: Map<string, OrderedEntry | null>,
): HistoryEntry[] {
  const present = new Set(history.map((e) => e.id));
  const ords = historyOrds(history);
  const items: OrderedEntry[] = [];
  for (const entry of history) {
    const change = apply.get(entry.id);
    if (change === null) continue;
    items.push(change ? change : { entry, ord: ords.get(entry.id) ?? 0 });
  }
  for (const [id, change] of apply) if (change && !present.has(id)) items.push(change);
  const next = sortHistory(items);
  return next.length === history.length && next.every((e, i) => e === history[i]) ? history : next;
}
