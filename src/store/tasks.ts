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
import { isISODate } from '../lib/dates';
import { applySettingsPatch, normalizeSettings, type SettingsPatch } from '../lib/settings';
import { isUntouchedCopy, nextLabel, normalizeRepeat, spawnNextOccurrence } from '../lib/recur';
import { hideUntilLabel, overdueIds, overdueMoveLabel, rescheduleLabel } from '../lib/reschedule';
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
  normalizeNotes,
  outdentTask,
  progress,
  sortedChildIds,
  toggleDone,
  updateTask,
  type MoveTarget,
  type NewTask,
  type TaskPatch,
} from '../lib/tree';
import { useSessionStore } from './session';
import { allTags, deadlineList, todayISO, visibleTreeIds } from '../lib/views';
import type { WeekMove } from '../lib/week';
import type { ColorSource } from '../lib/colorResolve';
import { DEFAULT_SETTINGS, type Settings, type Task, type TaskTree } from '../types';

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
  /** Per-user preferences. Persisted; not part of undo (they aren't content). */
  settings: Settings;
  /** Task whose title input should be in edit mode. Not persisted. */
  editingId: string | null;
  /** Most recent toggle, used to time the cascade animation. Not persisted. */
  lastToggle: { id: string; at: number } | null;
  /** The latest undoable action, shown as a toast. Not persisted. */
  undo: UndoEntry | null;
  /**
   * Undo history, oldest first, at most UNDO_DEPTH entries; `undo` (when set) is the last one.
   * Not persisted, and emptied by a reset (sign-out, account switch) or remote content.
   */
  past: UndoEntry[];
  /** Undone entries for redo, the next one last. Any new undoable action empties it. */
  future: UndoEntry[];
};

type TaskActions = {
  add: (input: NewTask) => string;
  update: (id: string, patch: TaskPatch) => void;
  /**
   * Plans a task for a day (the Today view; callers pass today) or, with null, takes it out
   * again. Leaves the due date alone. Records an undo.
   */
  plan: (id: string, plannedFor: string | null) => void;
  /** Changes preferences. Synced, but neither undoable nor part of an undo snapshot. */
  setSetting: (patch: SettingsPatch) => void;
  /**
   * Sets a task's notes ('' or blank removes them) and records an undo. Edits to notes go
   * through here (rather than `update`) so Undo takes them back.
   */
  setNotes: (id: string, notes: string) => void;
  /**
   * Hides a task (and its subtree) until a date, or with null shows it now, and records an undo.
   */
  hideUntil: (id: string, startDate: string | null) => void;
  /** Sets (or, with null, clears) a due date and records an undo ("Moved \u201cX\u201d to Sat, Oct 24"). */
  reschedule: (id: string, dueDate: string | null) => void;
  /**
   * Week view: moves a task's due date or its plan to another day and records an undo ("Moved
   * \u201cX\u201d to Thu, Oct 30").
   */
  moveToDay: (id: string, move: WeekMove) => void;
  /**
   * Moves every open overdue task (with `tag`, only those carrying it) to today in one undo
   * entry; repeat rules are kept. Returns how many moved.
   */
  moveOverdueToToday: (tag?: string | null) => number;
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
   * `lastToggle` is cleared if the toggled task was changed by the update. Older undo history
   * is dropped (its snapshots predate the remote change), keeping only the toast's entry.
   */
  hydrate: (partial: Partial<PersistedTasks>) => void;
  /**
   * Replaces tasks, rootIds, history and tag colours (e.g. a backup import) and records an undo.
   * Settings come with the data (parseBackup fills in the current ones for a backup without).
   */
  replaceAll: (data: PersistedTasks, label: string) => void;
  /** Appends imported (AI) tasks at the root, with an undo. Returns the new root ids. */
  appendTasks: (tasks: AiImportTask[], label: string) => string[];
  /** Replaces the whole list with imported (AI) tasks, keeping the history, with an undo. */
  replaceWithTasks: (tasks: AiImportTask[], label: string) => string[];
  /** Restores the state from before the latest undoable action, toast or not. */
  undoLast: () => void;
  /** The toast's Undo: steps back to before the toast's action, through any edits since. */
  undoToast: () => void;
  /** Re-applies the latest undone action. */
  redoLast: () => void;
  /** Hides the toast. The action stays in the undo history. */
  dismissUndo: () => void;
};

export type TaskStore = TaskState & TaskActions;

export type PersistedTasks = Pick<
  TaskStore,
  'tasks' | 'rootIds' | 'history' | 'tagColors' | 'settings'
>;

/**
 * v1 -> v2: every task gains `tags: []` and `dueDate: null`, and the store gains an empty
 * `history`. v2 -> v3: the old default blue (which meant "unset") becomes `color: null`
 * ("automatic"), and the store gains `tagColors`. Tasks also gain `repeat` (missing -> null).
 * Done tasks without a History entry get one. Idempotent, so it also tolerates partially
 * migrated data. Tasks gain `plannedFor` and `startDate` (missing -> null), lose a blank `notes`,
 * and the store gains `settings` (missing -> the defaults).
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
      plannedFor: isISODate(task.plannedFor) ? task.plannedFor : null,
      startDate: isISODate(task.startDate) ? task.startDate : null,
    };
    if (typeof task.spawnedFrom !== 'string') delete tasks[id].spawnedFrom;
    const notes = normalizeNotes(task.notes);
    if (notes === undefined) delete tasks[id].notes;
    else tasks[id].notes = notes;
  }
  const data = {
    tasks,
    rootIds: Array.isArray(old.rootIds) ? (old.rootIds as string[]) : [],
    history: Array.isArray(old.history) ? (old.history as HistoryEntry[]) : [],
    tagColors: normalizeTagColors(old.tagColors),
    settings: normalizeSettings(old.settings),
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

/** How many actions ⌘Z can take back. */
export const UNDO_DEPTH = 20;

const snapshotOf = (s: TaskState): UndoSnapshot => ({
  tasks: s.tasks,
  rootIds: s.rootIds,
  history: s.history,
  tagColors: s.tagColors,
});

/**
 * Records an undoable action and shows it as the toast. Snapshots are the old references:
 * structural sharing makes this free, so nothing is cloned.
 */
const undoEntry = (s: TaskState, label: string) => {
  const entry: UndoEntry = { id: nanoid(), label, snapshot: snapshotOf(s), at: Date.now() };
  return { undo: entry, past: [...s.past, entry].slice(-UNDO_DEPTH), future: [] };
};

/**
 * Records an action in the undo history without a toast (add, edit, indent). Snapshots restore
 * everything, so an edit left out of the history would be lost by undoing an older action.
 */
const quietEntry = (s: TaskState, label: string) => {
  const { past, future } = undoEntry(s, label);
  return { past, future };
};

/** Whether the latest history step is the quiet add of `id` (its snapshot predates the row). */
const isOwnAdd = (s: TaskState, id: string): boolean => {
  const top = s.past.at(-1);
  return top !== undefined && top.id !== s.undo?.id && !top.snapshot.tasks[id];
};

const pickUndoFields = (s: TaskState) => ({
  ...snapshotOf(s),
  past: s.past,
  future: s.future,
  lastToggle: s.lastToggle,
});

/** One step back: restores the latest entry's snapshot and keeps the current state for redo. */
const stepBack = (s: TaskState): Partial<TaskState> | null => {
  const entry = s.past.at(-1);
  if (!entry) return null;
  return {
    ...entry.snapshot,
    past: s.past.slice(0, -1),
    future: [...s.future, { ...entry, snapshot: snapshotOf(s) }],
    lastToggle: null,
    undo: s.undo?.id === entry.id ? null : s.undo,
  };
};

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
    settings: { ...DEFAULT_SETTINGS, hints: {} },
    editingId: null,
    lastToggle: null,
    undo: null,
    past: [],
    future: [],

    add: (input) => {
      const state = get();
      const { tree, id } = addTask(treeOf(state), input);
      set({
        tasks: tree.tasks,
        rootIds: tree.rootIds,
        history: historyAfter(state, tree),
        lastToggle: null,
        ...quietEntry(state, `Added \u201c${input.title}\u201d`),
      });
      return id;
    },
    update: (id, patch) => {
      const state = get();
      const after = updateTask(treeOf(state), id, patch);
      if (after.tasks === state.tasks) return;
      // Expanding and collapsing is view state, and the first edits of a row just added (a new
      // subtask getting its title) belong to its add: neither is an undo step of its own.
      const quiet = Object.keys(patch).every((key) => key === 'collapsed') || isOwnAdd(state, id);
      const title = state.tasks[id]?.title ?? '';
      set({ ...after, ...(quiet ? {} : quietEntry(state, `Edited \u201c${title}\u201d`)) });
    },
    plan: (id, plannedFor) => {
      const state = get();
      const task = state.tasks[id];
      if (!task) return;
      const after = updateTask(treeOf(state), id, { plannedFor });
      if (after.tasks === state.tasks) return;
      const label =
        plannedFor === null
          ? `Removed \u201c${task.title}\u201d from today`
          : `Planned \u201c${task.title}\u201d for today`;
      set({ ...after, ...undoEntry(state, label) });
    },
    setSetting: (patch) => {
      const settings = applySettingsPatch(get().settings, patch);
      if (settings !== get().settings) set({ settings });
    },
    setNotes: (id, notes) => {
      const state = get();
      const task = state.tasks[id];
      if (!task) return;
      const after = updateTask(treeOf(state), id, { notes });
      if (after.tasks === state.tasks) return;
      const label =
        after.tasks[id].notes === undefined
          ? `Removed note from \u201c${task.title}\u201d`
          : `${task.notes === undefined ? 'Added note to' : 'Edited note on'} \u201c${task.title}\u201d`;
      set({ ...after, ...undoEntry(state, label) });
    },
    hideUntil: (id, startDate) => {
      const state = get();
      const task = state.tasks[id];
      if (!task) return;
      const after = updateTask(treeOf(state), id, { startDate });
      if (after.tasks === state.tasks) return;
      set({ ...after, ...undoEntry(state, hideUntilLabel(task.title, startDate)) });
    },
    reschedule: (id, dueDate) => {
      const state = get();
      const task = state.tasks[id];
      if (!task) return;
      const after = updateTask(treeOf(state), id, { dueDate });
      if (after.tasks === state.tasks) return;
      set({ ...after, ...undoEntry(state, rescheduleLabel(task.title, dueDate)) });
    },
    moveToDay: (id, { field, date }) => {
      const state = get();
      const task = state.tasks[id];
      if (!task) return;
      const after = updateTask(treeOf(state), id, { [field]: date });
      if (after.tasks === state.tasks) return;
      set({ ...after, ...undoEntry(state, rescheduleLabel(task.title, date)) });
    },
    moveOverdueToToday: (tag = null) => {
      const state = get();
      const today = todayISO();
      const ids = overdueIds(treeOf(state), today, tag);
      if (ids.length === 0) return 0;
      let after = treeOf(state);
      for (const id of ids) after = updateTask(after, id, { dueDate: today });
      set({ ...after, ...undoEntry(state, overdueMoveLabel(ids.length)) });
      return ids.length;
    },
    remove: (id) => {
      const state = get();
      const task = state.tasks[id];
      if (!task) return;
      const count = getDescendants(treeOf(state), id).length;
      const label = `Deleted \u201c${task.title}\u201d${count > 0 ? ` and ${plural(count, 'subtask', 'subtasks')}` : ''}`;
      const after = deleteTask(treeOf(state), id);
      // An untitled, childless row is an abandoned draft (e.g. a new subtask left empty): removing
      // it is not a deletion worth an Undo toast, so the previous undo entry stays as it was, and
      // the history forgets the draft's own quiet "Added" step (its snapshot predates the row).
      const abandonedDraft = task.title.trim() === '' && count === 0;
      set({
        ...after,
        history: historyAfter(state, after),
        lastToggle: null,
        ...(abandonedDraft
          ? isOwnAdd(state, id)
            ? { past: state.past.slice(0, -1) }
            : {}
          : undoEntry(state, label)),
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
      let madeOneOff = false;
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
      } else {
        // Reopening takes back what completing spawned, so a series keeps one open occurrence: an
        // untouched copy goes away; one the user edited or worked on stays and the reopened task
        // becomes a one-off, so completing it again spawns nothing.
        const affected = [id, ...getDescendants(before, id), ...getAncestors(before, id)];
        for (const taskId of affected) {
          if (!before.tasks[taskId]?.done || before.tasks[taskId].repeat === null) continue;
          let kept = false;
          for (const copy of Object.values(before.tasks)) {
            if (copy.spawnedFrom !== taskId || !after.tasks[copy.id]) continue;
            if (isUntouchedCopy(before, copy.id)) after = deleteTask(after, copy.id, now);
            else kept = true;
          }
          if (kept) {
            after = updateTask(after, taskId, { repeat: null });
            if (taskId === id) madeOneOff = true;
          }
        }
      }

      const diff = diffCompletions(before, after, id, now, state.tagColors);
      if (toggled.tasks[id]?.done) useSessionStore.setState({ completedSomething: true });
      const history = applyHistory(state.history, diff);
      const title = state.tasks[id]?.title ?? '';
      const next = spawned.has(id) ? after.tasks[spawned.get(id)!].dueDate : null;
      const label =
        diff.completed.length > 1
          ? `Completed ${diff.completed.length} tasks`
          : `${toggled.tasks[id]?.done ? 'Completed' : 'Reopened'} \u201c${title}\u201d${
              next === null ? '' : ` \u00b7 ${nextLabel(next, todayISO(new Date(now)))}`
            }${madeOneOff ? ' \u00b7 no longer repeats' : ''}`;
      set({
        tasks: after.tasks,
        rootIds: after.rootIds,
        history,
        lastToggle: { id, at: now },
        ...undoEntry(state, label),
      });
    },
    clearCompleted: () => {
      const state = get();
      const after = clearCompleted(treeOf(state));
      const removed = Object.keys(state.tasks).length - Object.keys(after.tasks).length;
      if (removed === 0) return;
      set({ ...after, lastToggle: null, ...undoEntry(state, `Cleared ${removed} completed`) });
    },
    clearHistory: () => {
      const state = get();
      if (state.history.length === 0) return;
      set({
        history: [],
        ...undoEntry(
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
        ...undoEntry(state, 'Removed from history'),
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
        ...undoEntry(state, `Deleted \u201c${entry.title}\u201d`),
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
        ...undoEntry(state, `Deleted all completed (${count})`),
      });
    },
    restoreFromHistory: (entryId) => {
      const state = get();
      const entry = state.history.find((e) => e.id === entryId);
      const task = entry && state.tasks[entry.taskId];
      if (!entry || !task || !task.done) return;
      get().toggle(entry.taskId);
      // toggle labels its own undo "Reopened ..."; History calls it a restore.
      const { undo, past } = get();
      if (!undo) return;
      const relabeled = { ...undo, label: `Restored \u201c${entry.title}\u201d` };
      set({ undo: relabeled, past: past.map((e) => (e.id === undo.id ? relabeled : e)) });
    },
    indent: (id) => {
      const state = get();
      const after = indentTask(treeOf(state), id);
      if (after.tasks === state.tasks) return;
      set({
        ...after,
        history: historyAfter(state, after),
        lastToggle: null,
        ...quietEntry(state, 'Indented'),
      });
    },
    outdent: (id) => {
      const state = get();
      const after = outdentTask(treeOf(state), id);
      if (after.tasks === state.tasks) return;
      set({
        ...after,
        history: historyAfter(state, after),
        lastToggle: null,
        ...quietEntry(state, 'Outdented'),
      });
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
        ...undoEntry(state, `Moved \u201c${task.title}\u201d`),
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
      set({ tagColors, ...undoEntry(state, `Changed #${tag} colour`) });
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
        // Older snapshots predate the remote change, so undoing them would overwrite it. The
        // toast's entry stays, as it always has; any other step back is dropped.
        const content =
          partial.tasks !== undefined ||
          partial.rootIds !== undefined ||
          partial.history !== undefined ||
          partial.tagColors !== undefined;
        const kept = state.past.filter((e) => e.id === state.undo?.id);
        return {
          ...partial,
          ...(changed ? { lastToggle: null } : {}),
          ...(content ? { past: kept, future: [] } : {}),
        };
      }),
    replaceAll: (raw, label) => {
      const data = withHistoryRepaired(raw);
      set({
        tasks: data.tasks,
        rootIds: data.rootIds,
        history: data.history,
        tagColors: data.tagColors,
        settings: data.settings,
        lastToggle: null,
        ...undoEntry(get(), label),
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
        ...undoEntry(state, label),
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
        ...undoEntry(state, label),
      });
      return ids;
    },
    undoLast: () => {
      const back = stepBack(get());
      if (back) set(back);
    },
    undoToast: () => {
      const target = get().undo;
      if (!target) return;
      // Steps back through any quiet edits made since, then the toast's own action.
      let state: TaskState = get();
      while (state.past.some((e) => e.id === target.id)) {
        state = { ...state, ...stepBack(state) };
      }
      set({ ...pickUndoFields(state), undo: null });
    },
    redoLast: () => {
      const state = get();
      const entry = state.future.at(-1);
      if (!entry) return;
      set({
        ...entry.snapshot,
        future: state.future.slice(0, -1),
        past: [...state.past, { ...entry, snapshot: snapshotOf(state) }].slice(-UNDO_DEPTH),
        lastToggle: null,
      });
    },
    dismissUndo: () => set({ undo: null }),
  }));

export const useTaskStore = createTaskStore();

export const resetTaskStore = () =>
  useTaskStore.setState({
    ...emptyTree(),
    history: [],
    tagColors: {},
    settings: { ...DEFAULT_SETTINGS, hints: {} },
    editingId: null,
    lastToggle: null,
    undo: null,
    past: [],
    future: [],
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

/** Ids of the open overdue tasks (see overdueIds), compared shallowly so rows don't re-render. */
export const useOverdueIds = (tag: string | null): string[] =>
  useTaskStore(useShallow((s) => overdueIds(treeOf(s), todayISO(), tag)));

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
