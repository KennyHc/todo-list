export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** At this level the UI suggests breaking the task down. */
export const MAX_DIFFICULTY = 5;
/** Limits mirrored in firestore.rules; the data layer clamps to them so writes are never rejected. */
export const MAX_TITLE_LENGTH = 500;
export const MAX_NOTES_LENGTH = 5000;
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
  /**
   * Planned for a day, 'YYYY-MM-DD' (the Today view; only ever set to a "today"), or null. A
   * task planned on an earlier day that is still open rolls over into the next Today.
   */
  plannedFor: string | null;
  /**
   * Hidden until this day, 'YYYY-MM-DD' (local), or null. While it is after today the task is
   * left out of the Tree, By deadline and Today views, with its whole subtree; the data is
   * untouched and it shows by itself on that day.
   */
  startDate: string | null;
  /** Plain-text, multi-line notes. Absent when there are none (never an empty string). */
  notes?: string;
  /** On a spawned copy: the id of the task it was created from (used to avoid duplicates). */
  spawnedFrom?: string;
  parentId: string | null;
  childIds: string[];
  createdAt: number;
  completedAt?: number;
};

/** Per-user preferences, synced in the meta document's `settings` map. Not part of undo. */
export type Settings = {
  /** The opt-in Today view (daily plan sized to a capacity). */
  todayView: boolean;
  /** Points (difficulty) of work a day is sized to; an integer, MIN_CAPACITY..MAX_CAPACITY. */
  dailyCapacity: number;
  /** One-time hints already offered, so they never show again (on any device). */
  hints: { todayOffered?: boolean };
};

export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 50;
export const DEFAULT_CAPACITY = 8;

export const DEFAULT_SETTINGS: Settings = {
  todayView: false,
  dailyCapacity: DEFAULT_CAPACITY,
  hints: {},
};

export type TaskTree = {
  tasks: Record<string, Task>;
  rootIds: string[];
};
