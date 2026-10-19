import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import {
  addTask,
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
import type { Task, TaskTree } from '../types';
import { taskStorage } from './storage';

type TaskState = TaskTree & {
  /** Task whose title input should be in edit mode. Not persisted. */
  editingId: string | null;
};

type TaskActions = {
  add: (input: NewTask) => string;
  update: (id: string, patch: TaskPatch) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  setEditingId: (id: string | null) => void;
};

export type TaskStore = TaskState & TaskActions;

const treeOf = (s: TaskState): TaskTree => ({ tasks: s.tasks, rootIds: s.rootIds });

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      ...emptyTree(),
      editingId: null,

      add: (input) => {
        const { tree, id } = addTask(treeOf(get()), input);
        set({ tasks: tree.tasks, rootIds: tree.rootIds });
        return id;
      },
      update: (id, patch) => set(updateTask(treeOf(get()), id, patch)),
      remove: (id) => set(deleteTask(treeOf(get()), id)),
      toggle: (id) => set(toggleDone(treeOf(get()), id)),
      indent: (id) => set(indentTask(treeOf(get()), id)),
      outdent: (id) => set(outdentTask(treeOf(get()), id)),
      setEditingId: (editingId) => set({ editingId }),
    }),
    {
      name: 'tasks-v1',
      version: 1,
      storage: taskStorage<Pick<TaskStore, 'tasks' | 'rootIds'>>(),
      partialize: ({ tasks, rootIds }) => ({ tasks, rootIds }),
    },
  ),
);

export const resetTaskStore = () => useTaskStore.setState({ ...emptyTree(), editingId: null });

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
