import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { appendAiTasks, type AiImportTask } from '../lib/ai';
import { toggleDelay } from '../lib/cascade';
import { effectiveColor } from '../lib/colorResolve';
import { isHexColor, isSafeTagKey, normalizeTagColors, normalizeTaskColor } from '../lib/colors';
import { normalizeTag } from '../lib/tags';
import { nextLabel, normalizeRepeat, spawnNextOccurrence } from '../lib/recur';
import {
  applyHistory,
  diffCompletions,
  synthesizeHistory,
  type HistoryEntry,
} from '../lib/history';
import {
  addTask,
  clearCompleted,
  deleteTask,
  effectiveDifficulty,
  emptyTree,
  getAncestors,
  getDescendants,
  indentTask,
  isLeaf,
  moveTask,
  outdentTask,
  progress,
  sortedChildIds,
  toggleDone,
  updateTask,
  type MoveTarget,
  type NewTask,
  type TaskPatch,
} from '../lib/tree';
import { allTags, deadlineList, todayISO, visibleTreeIds } from '../lib/views';
import type { ColorSource } from '../lib/colorResolve';
import type { Task, TaskTree } from '../types';

export type UndoSnapshot = {
  tasks: TaskTree['tasks'];
  rootIds: string[];
  history: HistoryEntry[];
  tagColors: Record<string, string>;
};

export type UndoEntry = { id: string; label: string; snapshot: UndoSnapshot; at: number };

type TaskState = TaskTree & {
  /** Completion log, oldest first. Persisted; independent of task deletion. */
  history: HistoryEntry[];
  /** Tag -> hex colour. Tasks carrying a coloured tag show it (see lib/colorResolve). Persisted. */
  tagColors: Record<string, string>;
  /** Task whose title input should be in edit mode. Not persisted. */
  editingId: string | null;
  /** Most recent toggle, used to time the cascade animation. Not persisted. */
  lastToggle: { id: string; at: number } | null;
  /** The latest undoable action, shown as a toast. Not persisted. */
  undo: UndoEntry | null;
};

type TaskActions = {
  add: (input: NewTask) => string;
  update: (id: string, patch: TaskPatch) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  clearCompleted: () => void;
  clearHistory: () => void;
  removeHistoryEntry: (id: string) => void;
  /**
   * Deletes a completed task for good: its History entry and, if it still exists and is done,
   * the task with its subtree. One undo entry.
   */
  deleteCompleted: (entryId: string) => void;
  /** Deletes every completed task and the whole History in one undo entry. */
  deleteAllCompleted: () => void;
  /** Reopens the task behind a History entry (it returns to the Tree). No-op if it is gone. */
  restoreFromHistory: (entryId: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  /** Moves a task (with its subtree) to `target` and records an undo. */
  move: (id: string, target: MoveTarget) => void;
  setEditingId: (id: string | null) => void;
  /** Sets (or, with null, clears) a tag's colour and records an undo. */
  setTagColor: (tag: string, color: string | null) => void;
  /** Expands every collapsed ancestor of `id` in one update. Not undoable. */
  revealTask: (id: string) => void;
  /**
   * Applies remote state (cloud sync). Sets only the given fields; never touches `undo`.
   * `lastToggle` is cleared if the toggled task was changed by the update.
   */
  hydrate: (partial: Partial<PersistedTasks>) => void;
  /** Replaces tasks, rootIds, history and tag colours (e.g. a backup import) and records an undo. */
  replaceAll: (data: PersistedTasks, label: string) => void;
  /** Appends imported (AI) tasks at the root, with an undo. Returns the new root ids. */
  appendTasks: (tasks: AiImportTask[], label: string) => string[];
  /** Replaces the whole list with imported (AI) tasks, keeping the history, with an undo. */
  replaceWithTasks: (tasks: AiImportTask[], label: string) => string[];
  /** Restores the state from before the latest undoable action. */
  undoLast: () => void;
  dismissUndo: () => void;
};

export type TaskStore = TaskState & TaskActions;

export type PersistedTasks = Pick<TaskStore, 'tasks' | 'rootIds' | 'history' | 'tagColors'>;

/**
 * v1 -> v2: every task gains `tags: []` and `dueDate: null`, and the store gains an empty
 * `history`. v2 -> v3: the old default blue (which meant "unset") becomes `color: null`
 * ("automatic"), and the store gains `tagColors`. Tasks also gain `repeat` (missing -> null).
 * Done tasks without a History entry get one. Idempotent, so it also tolerates partially
 * migrated data.
 */
export function migrateTasksState(persisted: unknown): PersistedTasks {
  const old = (persisted ?? {}) as Partial<Record<keyof PersistedTasks, unknown>>;
  const tasks: Record<string, Task> = {};
  for (const [id, task] of Object.entries((old.tasks ?? {}) as Record<string, Task>)) {
    tasks[id] = {
      ...task,
      color: normalizeTaskColor(task.color),
      tags: task.tags ?? [],
      dueDate: task.dueDate ?? null,
      repeat: normalizeRepeat(task.repeat),
    };
    if (typeof task.spawnedFrom !== 'string') delete tasks[id].spawnedFrom;
  }
  const data = {
    tasks,
    rootIds: Array.isArray(old.rootIds) ? (old.rootIds as string[]) : [],
    history: Array.isArray(old.history) ? (old.history as HistoryEntry[]) : [],
    tagColors: normalizeTagColors(old.tagColors),
  };
  // Done tasks are hidden from the Tree, so each needs a History entry to be reachable.
  return { ...data, history: synthesizeHistory(data) };
}

/** `data` with History entries added for any done task that lacks one (see synthesizeHistory). */
export const withHistoryRepaired = (data: PersistedTasks): PersistedTasks => {
  const history = synthesizeHistory(data);
  return history === data.history ? data : { ...data, history };
};

const LEGACY_KEY = 'tasks-v1';

/** Reads and migrates the pre-cloud localStorage data. Null if there is none (or it is empty). */
export function readLegacyLocalTasks(): PersistedTasks | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: unknown } | null;
    const data = migrateTasksState(parsed?.state);
    return Object.keys(data.tasks).length > 0 ? data : null;
  } catch {
    return null;
  }
}

export function clearLegacyLocalTasks(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage unavailable */
  }
}

const treeOf = (s: TaskState): TaskTree => ({ tasks: s.tasks, rootIds: s.rootIds });

/** Snapshots are the old references: structural sharing makes this free, so nothing is cloned. */
const undoEntry = (s: TaskState, label: string): UndoEntry => ({
  id: nanoid(),
  label,
  snapshot: { tasks: s.tasks, rootIds: s.rootIds, history: s.history, tagColors: s.tagColors },
  at: Date.now(),
});

/**
 * History for a structural edit (add, delete, move, indent) that can flip a parent's done flag
 * (its last open subtask went away, or a subtask was added to a done parent): the parent files
 * itself in History, or leaves it, exactly as if it had been toggled.
 */
const historyAfter = (state: TaskState, after: TaskTree, now = Date.now()): HistoryEntry[] =>
  after.tasks === state.tasks
    ? state.history
    : applyHistory(state.history, diffCompletions(treeOf(state), after, '', now, state.tagColors));

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Task data lives in memory only; src/sync mirrors it to Firestore (whose IndexedDB cache gives
 * offline persistence). A factory so tests can build independent stores.
 */
export const createTaskStore = () =>
  create<TaskStore>()((set, get) => ({
    ...emptyTree(),
    history: [],
    tagColors: {},
    editingId: null,
    lastToggle: null,
    undo: null,

    add: (input) => {
      const state = get();
      const { tree, id } = addTask(treeOf(state), input);
      set({
        tasks: tree.tasks,
        rootIds: tree.rootIds,
        history: historyAfter(state, tree),
        lastToggle: null,
      });
      return id;
    },
    update: (id, patch) => set(updateTask(treeOf(get()), id, patch)),
    remove: (id) => {
      const state = get();
      const task = state.tasks[id];
      if (!task) return;
      const count = getDescendants(treeOf(state), id).length;
      const label = `Deleted \u201c${task.title}\u201d${count > 0 ? ` and ${plural(count, 'subtask', 'subtasks')}` : ''}`;
      const after = deleteTask(treeOf(state), id);
      set({
        ...after,
        history: historyAfter(state, after),
        lastToggle: null,
        undo: undoEntry(state, label),
      });
    },
    toggle: (id) => {
      const state = get();
      const before = treeOf(state);
      const now = Date.now();
      const toggled = toggleDone(before, id, now);
      if (toggled === before) return;

      // Repeating tasks that just became done (the one toggled, its subtasks, or a parent that
      // auto-completed) leave their next occurrence behind, inside this same update and undo.
      let after = toggled;
      const spawned = new Map<string, string>();
      if (toggled.tasks[id]?.done) {
        const affected = [id, ...getDescendants(before, id), ...getAncestors(before, id)];
        const becameDone = (taskId: string) =>
          before.tasks[taskId] !== undefined &&
          !before.tasks[taskId].done &&
          toggled.tasks[taskId].done &&
          toggled.tasks[taskId].repeat !== null &&
          toggled.tasks[taskId].dueDate !== null;
        const candidates = new Set(affected.filter(becameDone));
        for (const taskId of candidates) {
          // A repeating ancestor's copy already carries this subtask along.
          if (getAncestors(toggled, taskId).some((a) => candidates.has(a))) continue;
          const result = spawnNextOccurrence(after, taskId, now);
          if (!result) continue;
          after = result.tree;
          spawned.set(taskId, result.newId);
        }
      }

      const diff = diffCompletions(before, after, id, now, state.tagColors);
      const history = applyHistory(state.history, diff);
      const title = state.tasks[id]?.title ?? '';
      const next = spawned.has(id) ? after.tasks[spawned.get(id)!].dueDate : null;
      const label =
        diff.completed.length > 1
          ? `Completed ${diff.completed.length} tasks`
          : `${toggled.tasks[id]?.done ? 'Completed' : 'Reopened'} \u201c${title}\u201d${
              next === null ? '' : ` \u00b7 ${nextLabel(next, todayISO(new Date(now)))}`
            }`;
      set({
        tasks: after.tasks,
        rootIds: after.rootIds,
        history,
        lastToggle: { id, at: now },
        undo: undoEntry(state, label),
      });
    },
    clearCompleted: () => {
      const state = get();
      const after = clearCompleted(treeOf(state));
      const removed = Object.keys(state.tasks).length - Object.keys(after.tasks).length;
      if (removed === 0) return;
      set({ ...after, lastToggle: null, undo: undoEntry(state, `Cleared ${removed} completed`) });
    },
    clearHistory: () => {
      const state = get();
      if (state.history.length === 0) return;
      set({
        history: [],
        undo: undoEntry(
          state,
          `Cleared history (${plural(state.history.length, 'entry', 'entries')})`,
        ),
      });
    },
    removeHistoryEntry: (id) => {
      const state = get();
      if (!state.history.some((entry) => entry.id === id)) return;
      set({
        history: state.history.filter((entry) => entry.id !== id),
        undo: undoEntry(state, 'Removed from history'),
      });
    },
    deleteCompleted: (entryId) => {
      const state = get();
      const entry = state.history.find((e) => e.id === entryId);
      if (!entry) return;
      const task = state.tasks[entry.taskId];
      const removeTask = task !== undefined && task.done;
      const tree = removeTask ? deleteTask(treeOf(state), entry.taskId) : treeOf(state);
      // Entries of the deleted subtree go too, or History would list tasks that no longer exist.
      const gone = new Set(
        removeTask ? [entry.taskId, ...getDescendants(treeOf(state), entry.taskId)] : [],
      );
      const history = state.history.filter((e) => e.id !== entryId && !gone.has(e.taskId));
      set({
        tasks: tree.tasks,
        rootIds: tree.rootIds,
        history,
        lastToggle: null,
        undo: undoEntry(state, `Deleted \u201c${entry.title}\u201d`),
      });
    },
    deleteAllCompleted: () => {
      const state = get();
      const after = clearCompleted(treeOf(state));
      const removed = Object.keys(state.tasks).length - Object.keys(after.tasks).length;
      if (removed === 0 && state.history.length === 0) return;
      const count = state.history.length > 0 ? state.history.length : removed;
      set({
        tasks: after.tasks,
        rootIds: after.rootIds,
        history: [],
        lastToggle: null,
        undo: undoEntry(state, `Deleted all completed (${count})`),
      });
    },
    restoreFromHistory: (entryId) => {
      const state = get();
      const entry = state.history.find((e) => e.id === entryId);
      const task = entry && state.tasks[entry.taskId];
      if (!entry || !task || !task.done) return;
      get().toggle(entry.taskId);
      // toggle labels its own undo "Reopened ..."; History calls it a restore.
      const undo = get().undo;
      if (undo) set({ undo: { ...undo, label: `Restored \u201c${entry.title}\u201d` } });
    },
    indent: (id) => {
      const state = get();
      const after = indentTask(treeOf(state), id);
      set({ ...after, history: historyAfter(state, after), lastToggle: null });
    },
    outdent: (id) => {
      const state = get();
      const after = outdentTask(treeOf(state), id);
      set({ ...after, history: historyAfter(state, after), lastToggle: null });
    },
    move: (id, target) => {
      const state = get();
      const task = state.tasks[id];
      if (!task) return;
      const before = treeOf(state);
      const after = moveTask(before, id, target);
      if (after === before) return;
      set({
        tasks: after.tasks,
        rootIds: after.rootIds,
        history: historyAfter(state, after),
        lastToggle: null,
        undo: undoEntry(state, `Moved \u201c${task.title}\u201d`),
      });
    },
    setEditingId: (editingId) => set({ editingId }),
    setTagColor: (rawTag, color) => {
      const state = get();
      const tag = normalizeTag(rawTag);
      if (!isSafeTagKey(tag)) return;
      const current = state.tagColors[tag] ?? null;
      // Unlike on tasks, the legacy blue is a legitimate tag colour.
      const value = color !== null && isHexColor(color) ? color : null;
      if (value === current) return;
      const tagColors = { ...state.tagColors };
      if (value === null) delete tagColors[tag];
      else tagColors[tag] = value;
      set({ tagColors, undo: undoEntry(state, `Changed #${tag} colour`) });
    },
    revealTask: (id) => {
      const state = get();
      const collapsed = getAncestors(treeOf(state), id).filter((a) => state.tasks[a]?.collapsed);
      if (collapsed.length === 0) return;
      const tasks = { ...state.tasks };
      for (const a of collapsed) tasks[a] = { ...tasks[a], collapsed: false };
      set({ tasks });
    },
    hydrate: (partial) =>
      set((state) => {
        const toggled = state.lastToggle?.id;
        const changed =
          toggled !== undefined &&
          partial.tasks !== undefined &&
          partial.tasks[toggled] !== state.tasks[toggled];
        return { ...partial, ...(changed ? { lastToggle: null } : {}) };
      }),
    replaceAll: (raw, label) => {
      const data = withHistoryRepaired(raw);
      set({
        tasks: data.tasks,
        rootIds: data.rootIds,
        history: data.history,
        tagColors: data.tagColors,
        lastToggle: null,
        undo: undoEntry(get(), label),
      });
    },
    appendTasks: (tasks, label) => {
      const state = get();
      const { tree, ids, count } = appendAiTasks(treeOf(state), tasks);
      if (count === 0) return [];
      set({
        tasks: tree.tasks,
        rootIds: tree.rootIds,
        lastToggle: null,
        undo: undoEntry(state, label),
      });
      return ids;
    },
    replaceWithTasks: (tasks, label) => {
      const state = get();
      const { tree, ids, count } = appendAiTasks(emptyTree(), tasks);
      if (count === 0) return [];
      set({
        tasks: tree.tasks,
        rootIds: tree.rootIds,
        lastToggle: null,
        undo: undoEntry(state, label),
      });
      return ids;
    },
    undoLast: () => {
      const entry = get().undo;
      if (!entry) return;
      set({ ...entry.snapshot, lastToggle: null, undo: null });
    },
    dismissUndo: () => set({ undo: null }),
  }));

export const useTaskStore = createTaskStore();

export const resetTaskStore = () =>
  useTaskStore.setState({
    ...emptyTree(),
    history: [],
    tagColors: {},
    editingId: null,
    lastToggle: null,
    undo: null,
  });

// --- Selector hooks --------------------------------------------------------

export const useTask = (id: string): Task | undefined => useTaskStore((s) => s.tasks[id]);

export const useRootIds = (): string[] => useTaskStore((s) => s.rootIds);

/** Child ids in display order (undone first). `null` means the root list. */
export const useSortedChildIds = (parentId: string | null): string[] =>
  useTaskStore(
    useShallow((s) =>
      sortedChildIds(
        treeOf(s),
        parentId === null ? s.rootIds : (s.tasks[parentId]?.childIds ?? []),
      ),
    ),
  );

export const useEffectiveDifficulty = (id: string): number =>
  useTaskStore((s) => effectiveDifficulty(treeOf(s), id));

export const useProgress = (id: string): { done: number; total: number } =>
  useTaskStore(useShallow((s) => progress(treeOf(s), id)));

export const useIsLeaf = (id: string): boolean => useTaskStore((s) => isLeaf(treeOf(s), id));

/** Header stats: difficulty left over undone leaves, and leaf done/total over everything. */
export const useTotals = (): { openDifficulty: number; done: number; total: number } =>
  useTaskStore(
    useShallow((s) => {
      let openDifficulty = 0;
      let done = 0;
      let total = 0;
      for (const task of Object.values(s.tasks)) {
        if (task.childIds.length > 0) continue;
        total += 1;
        if (task.done) done += 1;
        else openDifficulty += task.difficulty;
      }
      return { openDifficulty, done, total };
    }),
  );

/**
 * Seconds this row should wait before animating a done-state change, relative to the latest
 * toggle. Returns a primitive so unaffected rows never re-render.
 */
export const useToggleDelay = (id: string): number => {
  const reduced = useReducedMotion();
  const delay = useTaskStore((s) =>
    s.lastToggle === null ? 0 : toggleDelay(treeOf(s), s.lastToggle.id, id),
  );
  return reduced ? 0 : delay;
};

// --- Derived views ----------------------------------------------------------
// These derive new arrays/sets, so they must not be returned straight from a zustand selector.
// Tag counts use a primitive string key (selector result is compared by ===, then parsed in a
// memo); the deadline list and visible-id set use useShallow, so a component only re-renders
// when the order/membership actually changes, not on every toggle or title edit.

export const useAllTags = (): { tag: string; count: number }[] => {
  const key = useTaskStore((s) =>
    allTags(treeOf(s))
      .map(({ tag, count }) => `${count}:${tag}`)
      .join('\n'),
  );
  return useMemo(
    () =>
      key === ''
        ? []
        : key.split('\n').map((line) => {
            const split = line.indexOf(':');
            return { tag: line.slice(split + 1), count: Number(line.slice(0, split)) };
          }),
    [key],
  );
};

export const useDeadlineList = (tag: string | null): string[] =>
  useTaskStore(useShallow((s) => deadlineList(treeOf(s), { tag })));

/** `null` means no filter (everything visible). */
export const useVisibleTreeIds = (tag: string | null): Set<string> | null =>
  useTaskStore(useShallow((s) => visibleTreeIds(treeOf(s), tag)));

/** The colour a row shows (own, tag, parent), as a primitive so rows re-render only on change. */
export const useEffectiveColor = (id: string): string | null =>
  useTaskStore((s) => effectiveColor(treeOf(s), s.tagColors, id).color);

/** Where a row's colour comes from, as a primitive `source` or `source:tag` key. */
export const useColorSource = (id: string): { source: ColorSource; tag?: string } => {
  const key = useTaskStore((s) => {
    const r = effectiveColor(treeOf(s), s.tagColors, id);
    return r.source === null ? '' : `${r.source}\n${r.tag ?? ''}`;
  });
  return useMemo(() => {
    if (key === '') return { source: null };
    const [source, tag] = key.split('\n');
    return tag ? { source: source as ColorSource, tag } : { source: source as ColorSource };
  }, [key]);
};

export const useTagColors = (): Record<string, string> => useTaskStore((s) => s.tagColors);
