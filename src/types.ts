export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** At this level the UI suggests breaking the task down. */
export const MAX_DIFFICULTY = 5;

export type Task = {
  id: string;
  title: string;
  /** Only meaningful for leaves. */
  difficulty: Difficulty;
  /** Hex color. */
  color: string;
  done: boolean;
  collapsed: boolean;
  /** Normalized (see lib/tags): lowercase, no '#', deduped. */
  tags: string[];
  /** Local calendar date, 'YYYY-MM-DD'. */
  dueDate: string | null;
  parentId: string | null;
  childIds: string[];
  createdAt: number;
  completedAt?: number;
};

export type TaskTree = {
  tasks: Record<string, Task>;
  rootIds: string[];
};
