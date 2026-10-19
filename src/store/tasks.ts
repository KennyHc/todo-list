import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { toggleDelay } from '../lib/cascade';
import { applyHistory, diffCompletions, type HistoryEntry } from '../lib/history';
import {
  addTask,
  clearCompleted,
  deleteTask,
  effectiveDifficulty,
  emptyTree,
  indentTask,
  isLeaf,
  outdentTask,
  progress,
  sortedChildIds,
  toggleDone,
  updateTask,
  type NewTask,
  type TaskPatch,
} from '../lib/tree';
import { allTags, deadlineList, visibleTreeIds } from '../lib/views';
import type { Task, TaskTree } from '../types';
import { taskStorage } from './storage';

type TaskState = TaskTree & {
  /** Completion log, oldest first. Persisted; independent of task deletion. */
  history: HistoryEntry[];
  /** Task whose title input should be in edit mode. Not persisted. */
  editingId: string | null;
  /** Most recent toggle, used to time the cascade animation. Not persisted. */
  lastToggle: { id: string; at: number } | null;
};

type TaskActions = {
  add: (input: NewTask) => string;
  update: (id: string, patch: TaskPatch) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  clearCompleted: () => void;
  clearHistory: () => void;
  removeHistoryEntry: (id: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  setEditingId: (id: string | null) => void;
};

export type TaskStore = TaskState & TaskActions;

export type PersistedTasks = Pick<TaskStore, 'tasks' | 'rootIds' | 'history'>;

/**
 * v1 -> v2: every task gains `tags: []` and `dueDate: null`, and the store gains an empty
 * `history`. Idempotent, so it also tolerates partially migrated data.
 */
export function migrateTasksState(persisted: unknown): PersistedTasks {
  const old = (persisted ?? {}) as Partial<Record<keyof PersistedTasks, unknown>>;
  const tasks: Record<string, Task> = {};
  for (const [id, task] of Object.entries((old.tasks ?? {}) as Record<string, Task>)) {
    tasks[id] = { ...task, tags: task.tags ?? [], dueDate: task.dueDate ?? null };
  }
  return {
    tasks,
    rootIds: Array.isArray(old.rootIds) ? (old.rootIds as string[]) : [],
    history: Array.isArray(old.history) ? (old.history as HistoryEntry[]) : [],
  };
}

const treeOf = (s: TaskState): TaskTree => ({ tasks: s.tasks, rootIds: s.rootIds });

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      ...emptyTree(),
      history: [],
      editingId: null,
      lastToggle: null,

      add: (input) => {
        const { tree, id } = addTask(treeOf(get()), input);
        set({ tasks: tree.tasks, rootIds: tree.rootIds, lastToggle: null });
        return id;
      },
      update: (id, patch) => set(updateTask(treeOf(get()), id, patch)),
      remove: (id) => set({ ...deleteTask(treeOf(get()), id), lastToggle: null }),
      toggle: (id) => {
        const before = treeOf(get());
        const now = Date.now();
        const after = toggleDone(before, id, now);
        const history = applyHistory(get().history, diffCompletions(before, after, id, now));
        set({ tasks: after.tasks, rootIds: after.rootIds, history, lastToggle: { id, at: now } });
      },
      clearCompleted: () => set({ ...clearCompleted(treeOf(get())), lastToggle: null }),
      clearHistory: () => set({ history: [] }),
      removeHistoryEntry: (id) =>
        set({ history: get().history.filter((entry) => entry.id !== id) }),
      indent: (id) => set({ ...indentTask(treeOf(get()), id), lastToggle: null }),
      outdent: (id) => set({ ...outdentTask(treeOf(get()), id), lastToggle: null }),
      setEditingId: (editingId) => set({ editingId }),
    }),
    {
      // The key stays 'tasks-v1' so existing data survives; `version` drives migrations.
      name: 'tasks-v1',
      version: 2,
      storage: taskStorage<PersistedTasks>(),
      partialize: ({ tasks, rootIds, history }) => ({ tasks, rootIds, history }),
      migrate: (persisted) => migrateTasksState(persisted),
    },
  ),
);

export const resetTaskStore = () =>
  useTaskStore.setState({ ...emptyTree(), history: [], editingId: null, lastToggle: null });

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
