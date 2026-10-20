export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** At this level the UI suggests breaking the task down. */
export const MAX_DIFFICULTY = 5;
/** Limits mirrored in firestore.rules; the data layer clamps to them so writes are never rejected. */
export const MAX_TITLE_LENGTH = 500;
export const MAX_TAGS = 20;

/**
 * How a task recurs. When a repeating task with a due date is completed, the next occurrence is
 * created (see lib/recur).
 */
export type Repeat = {
  every: 'day' | 'weekday' | 'week' | 'month';
  /** 0=Sun..6; only for 'week': always land on that weekday. Without it, +7 days from the due date. */
  weekday?: number;
  /**
   * Only for 'month': the day of the month the rule is anchored to (1-31). Months that are too
   * short clamp (Jan 31 -> Feb 28), and the anchor keeps the next month from drifting
   * (-> Mar 31). When absent, the anchor is the day of the due date. Set on spawned copies.
   */
  anchorDay?: number;
};

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
  /** Recurrence, or null for a one-off task. Only acts together with a due date. */
  repeat: Repeat | null;
  /** On a spawned copy: the id of the task it was created from (used to avoid duplicates). */
  spawnedFrom?: string;
  parentId: string | null;
  childIds: string[];
  createdAt: number;
  completedAt?: number;
};

export type TaskTree = {
  tasks: Record<string, Task>;
  rootIds: string[];
};
