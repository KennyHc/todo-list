import type { Task, TaskTree } from '../types';
import { addDays, parseISO } from './dates';
import { hiddenUntilStart, notStarted } from './tree';

/*
 * The Week view's maths. Pure: dates are 'YYYY-MM-DD' strings (they sort like the dates they
 * are) and `today` is always passed in.
 *
 * A task shows on its due day ('due') and, when planned for another day, on that day too
 * ('planned', shown quietly). An open plan from an earlier day has rolled over to today, as in
 * the Today view, so it shows on today (only in the week that contains today) instead of on
 * the day it was made for. Done tasks stay on their days. A task that has not started by the
 * day in question, and everything under it, is left off that day.
 */

export type WeekKind = 'due' | 'planned';

export type WeekItem = {
  id: string;
  kind: WeekKind;
  /** An open plan from an earlier day that rolled over onto today. */
  carried: boolean;
};

export type WeekDay = {
  date: string;
  isToday: boolean;
  items: WeekItem[];
  /** Points still to do on the day, each open task counted once (see `weekDays`). */
  points: number;
};

/** The Monday of the week that contains `date`. */
export function weekStart(date: string): string {
  const sinceMonday = (parseISO(date).getDay() + 6) % 7;
  return addDays(date, -sinceMonday);
}

/** The seven dates of the week starting `start`, Monday first. */
export const weekDates = (start: string): string[] =>
  Array.from({ length: 7 }, (_, i) => addDays(start, i));

/**
 * The day an open task's points land on: its planned day if it has one (an earlier plan has
 * rolled over to today), otherwise its due day.
 */
function pointsDay(task: Task, today: string): string | null {
  if (task.plannedFor !== null) return task.plannedFor < today ? today : task.plannedFor;
  return task.dueDate;
}

/** Task ids in tree order (parents before their children). */
function preorder(tree: TaskTree): string[] {
  const out: string[] = [];
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const task = tree.tasks[id];
      if (!task) continue;
      out.push(id);
      walk(task.childIds);
    }
  };
  walk(tree.rootIds);
  return out;
}

/**
 * The seven days of the week starting `start` (a Monday): the rows on each day, due ones first
 * and then planned ones, each in tree order, and the day's points. With a tag, only tasks
 * carrying it.
 *
 * A day's points count every open task once, on the day it is planned for or else due. A task
 * counts the open points of its subtree, except for subtasks that have a day of their own,
 * which count there. So a parent and its subtask never add up twice.
 */
export function weekDays(
  tree: TaskTree,
  start: string,
  today: string,
  tag: string | null = null,
): WeekDay[] {
  const ids = preorder(tree);
  const dates = weekDates(start);
  const days: WeekDay[] = dates.map((date) => ({
    date,
    isToday: date === today,
    items: [],
    points: 0,
  }));
  const index = new Map(dates.map((date, i) => [date, i]));
  const matches = (task: Task) => tag === null || task.tags.includes(tag);

  // Open tasks that have a day of their own for their points, and that day.
  const placed = new Map<string, string>();
  for (const id of ids) {
    const task = tree.tasks[id];
    if (task.done || !matches(task)) continue;
    const day = pointsDay(task, today);
    if (day !== null && !hiddenUntilStart(tree, id, day)) placed.set(id, day);
  }

  const pointsUnder = (id: string, day: string, root: boolean): number => {
    const task = tree.tasks[id];
    if (!task || task.done || notStarted(task, day)) return 0;
    if (!root && placed.has(id)) return 0;
    if (task.childIds.length === 0) return task.difficulty;
    return task.childIds.reduce((sum, child) => sum + pointsUnder(child, day, false), 0);
  };
  for (const [id, day] of placed) {
    const at = index.get(day);
    if (at !== undefined) days[at].points += pointsUnder(id, day, true);
  }

  const due: WeekItem[][] = dates.map(() => []);
  const planned: WeekItem[][] = dates.map(() => []);
  for (const id of ids) {
    const task = tree.tasks[id];
    if (!matches(task)) continue;
    const visibleOn = (date: string) => task.done || !hiddenUntilStart(tree, id, date);

    const dueAt = task.dueDate === null ? undefined : index.get(task.dueDate);
    if (dueAt !== undefined && visibleOn(dates[dueAt])) {
      due[dueAt].push({ id, kind: 'due', carried: false });
    }

    if (task.plannedFor === null) continue;
    const carried = !task.done && task.plannedFor < today;
    const day = carried ? today : task.plannedFor;
    const plannedAt = index.get(day);
    if (plannedAt === undefined || day === task.dueDate || !visibleOn(day)) continue;
    planned[plannedAt].push({ id, kind: 'planned', carried });
  }
  dates.forEach((_, i) => {
    days[i].items = [...due[i], ...planned[i]];
  });
  return days;
}

/** Ids of the rows in the week, in display order (day by day); a task on two days appears once. */
export function weekIds(
  tree: TaskTree,
  start: string,
  today: string,
  tag: string | null = null,
): string[] {
  const seen = new Set<string>();
  for (const day of weekDays(tree, start, today, tag)) {
    for (const item of day.items) seen.add(item.id);
  }
  return [...seen];
}

const rangeFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const rangeYearFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Oct 26 – Nov 1" (with the year when the week is not in `today`'s year). */
export function weekRange(start: string, today: string): string {
  const from = parseISO(start);
  const to = parseISO(addDays(start, 6));
  const sameYear =
    from.getFullYear() === parseISO(today).getFullYear() && to.getFullYear() === from.getFullYear();
  const format = sameYear ? rangeFormat : rangeYearFormat;
  return `${format.format(from)} – ${format.format(to)}`;
}
