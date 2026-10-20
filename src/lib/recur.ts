import { nanoid } from 'nanoid';
import type { Repeat, Task, TaskTree } from '../types';
import { addDays, daysBetween, parseISO } from './dates';
import { createDraft, reevaluateFrom } from './tree';
import { todayISO } from './views';

/**
 * Recurring tasks. All dates are local calendar dates ('YYYY-MM-DD'); nothing here touches UTC,
 * so a task never drifts around midnight or a DST change.
 */

const EVERY: readonly string[] = ['day', 'weekday', 'week', 'month'];

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Defensive read of a stored repeat: a valid `Repeat` (with only the keys that apply to its
 * `every`) or null. Anything malformed, including an out-of-range `weekday`/`anchorDay`, is null.
 */
export function normalizeRepeat(value: unknown): Repeat | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.every !== 'string' || !EVERY.includes(raw.every)) return null;
  const every = raw.every as Repeat['every'];
  const repeat: Repeat = { every };
  if (raw.weekday !== undefined && raw.weekday !== null) {
    if (!isInt(raw.weekday, 0, 6)) return null;
    if (every === 'week') repeat.weekday = raw.weekday;
  }
  if (raw.anchorDay !== undefined && raw.anchorDay !== null) {
    if (!isInt(raw.anchorDay, 1, 31)) return null;
    if (every === 'month') repeat.anchorDay = raw.anchorDay;
  }
  return repeat;
}

const weekdayOf = (iso: string): number => parseISO(iso).getDay();
const maxISO = (a: string, b: string): string => (a >= b ? a : b);

/** First date on or after `iso` that falls on `weekday` (0=Sun..6). */
function onOrAfterWeekday(iso: string, weekday: number): string {
  return addDays(iso, (weekday - weekdayOf(iso) + 7) % 7);
}

/** The `day` of month `monthsAhead` months after `from`'s month, clamped to that month's length. */
function monthDate(from: string, monthsAhead: number, day: number): string {
  const [y, m] = from.split('-').map(Number);
  const first = new Date(y, m - 1 + monthsAhead, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return todayISO(new Date(first.getFullYear(), first.getMonth(), Math.min(day, last)));
}

/**
 * The next due date after completing an occurrence due on `from`. Steps by the rule until the
 * result is strictly after `from` AND on or after `today`, so an overdue task catches up
 * instead of producing a date in the past.
 *
 * - day: the next day. weekday: the next Monday-Friday.
 * - week: +7 days (same weekday as `from`); with `weekday`, the next date on that weekday.
 * - month: the same day next month, clamped to the month's length. The day it clamps from is
 *   `repeat.anchorDay`, else the day of `from`, so Jan 31 -> Feb 28 -> Mar 31 doesn't drift.
 */
export function nextOccurrence(from: string, repeat: Repeat, today: string): string {
  const floor = maxISO(addDays(from, 1), today);
  switch (repeat.every) {
    case 'day':
      return floor;
    case 'weekday': {
      const dow = weekdayOf(floor);
      return dow === 6 ? addDays(floor, 2) : dow === 0 ? addDays(floor, 1) : floor;
    }
    case 'week': {
      if (repeat.weekday !== undefined) return onOrAfterWeekday(floor, repeat.weekday);
      return addDays(from, Math.max(1, Math.ceil(daysBetween(from, floor) / 7)) * 7);
    }
    case 'month': {
      const anchor = repeat.anchorDay ?? Number(from.slice(8, 10));
      const [fy, fm] = from.split('-').map(Number);
      const [ty, tm] = floor.split('-').map(Number);
      // Candidates grow with the month count and the one before the floor's month is too early.
      let n = Math.max(1, (ty - fy) * 12 + (tm - fm));
      for (;;) {
        const candidate = monthDate(from, n, anchor);
        if (candidate >= floor) return candidate;
        n += 1;
      }
    }
  }
}

/**
 * The due date for a task that just became repeating without one (or a new repeating task):
 * today for day/week/month, the next date on `weekday` for a weekly repeat with one (today
 * counts), and today or the coming Monday for weekdays.
 */
export function firstOccurrence(repeat: Repeat, today: string): string {
  if (repeat.every === 'week' && repeat.weekday !== undefined) {
    return onOrAfterWeekday(today, repeat.weekday);
  }
  if (repeat.every === 'weekday') {
    const dow = weekdayOf(today);
    return dow === 6 ? addDays(today, 2) : dow === 0 ? addDays(today, 1) : today;
  }
  return today;
}

/**
 * Changes to apply when `repeat` is set (or cleared) on a task: choosing a repeat on a task
 * without a due date gives it one (firstOccurrence); clearing it leaves the date alone.
 */
export function repeatPatch(
  task: Pick<Task, 'dueDate'>,
  repeat: Repeat | null,
  today: string = todayISO(),
): { repeat: Repeat | null; dueDate?: string } {
  if (repeat === null || task.dueDate !== null) return { repeat };
  return { repeat, dueDate: firstOccurrence(repeat, today) };
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** "Daily", "Every weekday", "Weekly", "Every Monday", "Monthly". */
export function repeatLabel(repeat: Repeat): string {
  if (repeat.every === 'week' && repeat.weekday !== undefined) {
    return `Every ${WEEKDAY_NAMES[repeat.weekday]}`;
  }
  return { day: 'Daily', weekday: 'Every weekday', week: 'Weekly', month: 'Monthly' }[repeat.every];
}

/** Mid-sentence form: "daily", "every weekday", "weekly", "every Monday", "monthly". */
export function repeatPhrase(repeat: Repeat): string {
  const label = repeatLabel(repeat);
  return label.startsWith('Every') ? `every${label.slice(5)}` : label.toLowerCase();
}

/** The lowercase form used in the AI import/export: daily, weekdays, weekly, monthly, every monday. */
export function repeatWord(repeat: Repeat): string {
  if (repeat.every === 'week' && repeat.weekday !== undefined) {
    return `every ${WEEKDAY_NAMES[repeat.weekday].toLowerCase()}`;
  }
  return { day: 'daily', weekday: 'weekdays', week: 'weekly', month: 'monthly' }[repeat.every];
}

/**
 * Creates the next occurrence of a repeating task right after it among its siblings and returns
 * the new tree and the copy's id. The copy has a new id, the same title, tags, difficulty, colour,
 * repeat and parent, is undone and expanded, and is due `nextOccurrence(...)`. Its subtree is
 * deep-copied with new ids, all undone and without due dates, except that a subtask with its own
 * due date keeps it, shifted by the same number of days as the parent's due date.
 *
 * Returns null when there is nothing to spawn: no such task, no repeat, no due date, or a copy of
 * this occurrence already exists (a task with `spawnedFrom === id` and the same due date), so
 * completing the same occurrence twice (done, undone, done) never doubles it.
 *
 * `now` is a timestamp (ms): it stamps `createdAt` and decides what "today" is for catch-up.
 */
export function spawnNextOccurrence(
  tree: TaskTree,
  id: string,
  now: number = Date.now(),
): { tree: TaskTree; newId: string } | null {
  const task = tree.tasks[id];
  if (!task || task.repeat === null || task.dueDate === null) return null;

  const today = todayISO(new Date(now));
  const next = nextOccurrence(task.dueDate, task.repeat, today);
  const duplicate = Object.values(tree.tasks).some(
    (other) => other.spawnedFrom === id && other.dueDate === next,
  );
  if (duplicate) return null;

  const shift = daysBetween(task.dueDate, next);
  const draft = createDraft(tree);

  const repeat: Repeat = { ...task.repeat };
  if (repeat.every === 'month')
    repeat.anchorDay = repeat.anchorDay ?? Number(task.dueDate.slice(8, 10));

  const copy = (source: Task, parentId: string | null, root: boolean): string => {
    const newId = nanoid();
    const childIds = source.childIds.map((childId) => copy(tree.tasks[childId], newId, false));
    draft.tasks[newId] = {
      id: newId,
      title: source.title,
      difficulty: source.difficulty,
      color: source.color,
      done: false,
      collapsed: root ? false : source.collapsed,
      tags: [...source.tags],
      dueDate: root ? next : source.dueDate === null ? null : addDays(source.dueDate, shift),
      repeat: root ? repeat : source.repeat === null ? null : { ...source.repeat },
      ...(root ? { spawnedFrom: id } : {}),
      parentId,
      childIds,
      createdAt: now,
    };
    return newId;
  };

  const newId = copy(task, task.parentId, true);
  const siblings = draft.siblings(task.parentId);
  siblings.splice(siblings.indexOf(id) + 1, 0, newId);
  // New open work: a done parent (and done ancestors) reopen.
  reevaluateFrom(draft, task.parentId, now);
  return { tree: draft.finish(), newId };
}

const shortWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const longDate = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/**
 * Where the next occurrence falls, for the undo toast: "next tomorrow", "next on Sun" (within
 * the coming week), "next on Oct 28" (later).
 */
export function nextLabel(next: string, today: string): string {
  const days = daysBetween(today, next);
  if (days <= 0) return 'next today';
  if (days === 1) return 'next tomorrow';
  const date = parseISO(next);
  if (days <= 6) return `next on ${shortWeekday.format(date)}`;
  const sameYear = date.getFullYear() === parseISO(today).getFullYear();
  return `next on ${(sameYear ? shortDate : longDate).format(date)}`;
}
