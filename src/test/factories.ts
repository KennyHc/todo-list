import type { HistoryEntry } from '../lib/history';
import type { PersistedTasks } from '../store/tasks';
import type { Task } from '../types';

export const mkTask = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: id,
  difficulty: 1,
  color: null,
  done: false,
  collapsed: false,
  tags: [],
  dueDate: null,
  parentId: null,
  childIds: [],
  createdAt: 1,
  ...over,
});

export const mkEntry = (id: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  taskId: `t-${id}`,
  title: id,
  color: '#A9C6F5',
  tags: [],
  dueDate: null,
  difficulty: 1,
  isParent: false,
  subtaskCount: 0,
  path: [],
  createdAt: 1,
  completedAt: 10,
  auto: false,
  ...over,
});

export const mkState = (
  tasks: Task[],
  rootIds: string[] = tasks.filter((t) => t.parentId === null).map((t) => t.id),
  history: HistoryEntry[] = [],
  tagColors: Record<string, string> = {},
): PersistedTasks => ({
  tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
  rootIds,
  history,
  tagColors,
});
