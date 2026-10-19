export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** At this level the UI suggests breaking the task down. */
export const MAX_DIFFICULTY = 5;
/** Limits mirrored in firestore.rules; the data layer clamps to them so writes are never rejected. */
export const MAX_TITLE_LENGTH = 500;
export const MAX_TAGS = 20;

export type Task = {
  id: string;
  title: string;
  /** Only meaningful for leaves. */
  difficulty: Difficulty;
  /** Explicit hex colour override, or null for "automatic" (tag colour, then the parent's). */
  color: string | null;
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
