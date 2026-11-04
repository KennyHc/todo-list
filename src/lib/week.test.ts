import { describe, expect, it } from 'vitest';
import { mkState, mkTask } from '../test/factories';
import type { Task } from '../types';
import {
  firstDueFrom,
  weekDays,
  weekDropMove,
  weekIds,
  weekRange,
  weekStart,
  weekStepMove,
} from './week';

// Wed 21 Oct 2026, so the week is Mon 19 - Sun 25 Oct.
const TODAY = '2026-10-21';
const START = '2026-10-19';

const treeOf = (tasks: Task[]) => mkState(tasks);
const day = (days: ReturnType<typeof weekDays>, date: string) => days.find((d) => d.date === date)!;
const idsOn = (days: ReturnType<typeof weekDays>, date: string) =>
  day(days, date).items.map((item) => item.id);

describe('weekStart', () => {
  it('is the Monday on or before the date', () => {
    expect(weekStart('2026-10-19')).toBe('2026-10-19'); // Monday
    expect(weekStart('2026-10-21')).toBe('2026-10-19'); // Wednesday
    expect(weekStart('2026-10-24')).toBe('2026-10-19'); // Saturday
  });

  it('puts Sunday at the end of its week, not the start of the next', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
  });

  it('crosses month and year boundaries', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // Sunday 1 Nov
    expect(weekStart('2026-03-01')).toBe('2026-02-23'); // Sunday 1 Mar
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // Friday
    expect(weekStart('2026-01-01')).toBe('2025-12-29'); // Thursday
  });
});

describe('weekDays', () => {
  it('lists Monday to Sunday and marks today', () => {
    const days = weekDays(treeOf([]), START, TODAY);
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(days.filter((d) => d.isToday).map((d) => d.date)).toEqual([TODAY]);
  });

  it('runs across a month boundary and a year boundary', () => {
    const month = weekDays(treeOf([]), '2026-10-26', TODAY).map((d) => d.date);
    expect(month[0]).toBe('2026-10-26');
    expect(month[6]).toBe('2026-11-01');
    const year = weekDays(treeOf([]), '2026-12-28', TODAY).map((d) => d.date);
    expect(year).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('has no today in another week', () => {
    expect(weekDays(treeOf([]), '2026-10-26', TODAY).some((d) => d.isToday)).toBe(false);
  });

  it('puts a task on its due day, and a task due on Sunday in this week', () => {
    const tree = treeOf([
      mkTask('mon', { dueDate: '2026-10-19' }),
      mkTask('sun', { dueDate: '2026-10-25' }),
      mkTask('next', { dueDate: '2026-10-26' }),
      mkTask('none'),
    ]);
    const days = weekDays(tree, START, TODAY);
    expect(idsOn(days, '2026-10-19')).toEqual(['mon']);
    expect(idsOn(days, '2026-10-25')).toEqual(['sun']);
    expect(days.flatMap((d) => d.items.map((i) => i.id))).toEqual(['mon', 'sun']);
  });

  it('shows a planned task on its planned day as well as its due day', () => {
    const tree = treeOf([mkTask('a', { dueDate: '2026-10-23', plannedFor: '2026-10-22' })]);
    const days = weekDays(tree, START, TODAY);
    expect(day(days, '2026-10-22').items).toEqual([{ id: 'a', kind: 'planned', carried: false }]);
    expect(day(days, '2026-10-23').items).toEqual([{ id: 'a', kind: 'due', carried: false }]);
  });

  it('shows a task planned for its due day once', () => {
    const tree = treeOf([mkTask('a', { dueDate: '2026-10-22', plannedFor: '2026-10-22' })]);
    const days = weekDays(tree, START, TODAY);
    expect(day(days, '2026-10-22').items).toEqual([{ id: 'a', kind: 'due', carried: false }]);
  });

  it('shows a task planned for an undated day', () => {
    const tree = treeOf([mkTask('a', { plannedFor: '2026-10-24' })]);
    expect(day(weekDays(tree, START, TODAY), '2026-10-24').items).toEqual([
      { id: 'a', kind: 'planned', carried: false },
    ]);
  });

  it('lists due rows before planned ones, each in tree order', () => {
    const tree = treeOf([
      mkTask('p1', { plannedFor: '2026-10-22' }),
      mkTask('d1', { dueDate: '2026-10-22' }),
      mkTask('p2', { plannedFor: '2026-10-22' }),
      mkTask('d2', { dueDate: '2026-10-22' }),
    ]);
    expect(idsOn(weekDays(tree, START, TODAY), '2026-10-22')).toEqual(['d1', 'd2', 'p1', 'p2']);
  });

  it('carries an unfinished plan from an earlier day over to today', () => {
    const tree = treeOf([mkTask('a', { plannedFor: '2026-10-19' })]);
    const days = weekDays(tree, START, TODAY);
    expect(idsOn(days, '2026-10-19')).toEqual([]);
    expect(day(days, TODAY).items).toEqual([{ id: 'a', kind: 'planned', carried: true }]);
  });

  it('carries a plan from an earlier week, but only into the week that has today', () => {
    const tree = treeOf([mkTask('a', { plannedFor: '2026-10-05' })]);
    expect(day(weekDays(tree, START, TODAY), TODAY).items.map((i) => i.id)).toEqual(['a']);
    for (const start of ['2026-10-05', '2026-10-26']) {
      expect(weekDays(tree, start, TODAY).flatMap((d) => d.items)).toEqual([]);
    }
  });

  it('does not carry a finished plan: it stays on its day, struck through', () => {
    const tree = treeOf([mkTask('a', { plannedFor: '2026-10-19', done: true })]);
    const days = weekDays(tree, START, TODAY);
    expect(idsOn(days, '2026-10-19')).toEqual(['a']);
    expect(idsOn(days, TODAY)).toEqual([]);
  });

  it('keeps a carried task due today once', () => {
    const tree = treeOf([mkTask('a', { dueDate: TODAY, plannedFor: '2026-10-19' })]);
    expect(day(weekDays(tree, START, TODAY), TODAY).items).toEqual([
      { id: 'a', kind: 'due', carried: false },
    ]);
  });

  it('shows done tasks on their due day', () => {
    const tree = treeOf([mkTask('a', { dueDate: '2026-10-20', done: true })]);
    expect(idsOn(weekDays(tree, START, TODAY), '2026-10-20')).toEqual(['a']);
  });

  it('still shows an open task that is overdue on the day it was due', () => {
    const tree = treeOf([mkTask('a', { dueDate: '2026-10-19' })]);
    expect(idsOn(weekDays(tree, START, TODAY), '2026-10-19')).toEqual(['a']);
  });
});

describe('weekDays: start dates', () => {
  it('hides a task on the days before it starts', () => {
    const tree = treeOf([
      mkTask('a', { dueDate: '2026-10-20', plannedFor: '2026-10-22', startDate: '2026-10-22' }),
    ]);
    const days = weekDays(tree, START, TODAY);
    expect(idsOn(days, '2026-10-20')).toEqual([]);
    expect(idsOn(days, '2026-10-22')).toEqual(['a']);
  });

  it('shows a task on the day it starts', () => {
    const tree = treeOf([mkTask('a', { dueDate: '2026-10-23', startDate: '2026-10-23' })]);
    expect(idsOn(weekDays(tree, START, TODAY), '2026-10-23')).toEqual(['a']);
  });

  it('hides the subtasks of a task that has not started', () => {
    const tree = treeOf([
      mkTask('p', { childIds: ['c'], startDate: '2026-10-25' }),
      mkTask('c', { parentId: 'p', dueDate: '2026-10-22' }),
    ]);
    const days = weekDays(tree, START, TODAY);
    expect(idsOn(days, '2026-10-22')).toEqual([]);
    expect(day(days, '2026-10-22').points).toBe(0);
  });

  it('does not hide a done task', () => {
    const tree = treeOf([
      mkTask('a', { dueDate: '2026-10-20', startDate: '2026-10-22', done: true }),
    ]);
    expect(idsOn(weekDays(tree, START, TODAY), '2026-10-20')).toEqual(['a']);
  });

  it('does not count the points of subtasks that have not started', () => {
    const tree = treeOf([
      mkTask('p', { childIds: ['a', 'b'], dueDate: '2026-10-22' }),
      mkTask('a', { parentId: 'p', difficulty: 2 }),
      mkTask('b', { parentId: 'p', difficulty: 3, startDate: '2026-10-30' }),
    ]);
    expect(day(weekDays(tree, START, TODAY), '2026-10-22').points).toBe(2);
  });
});

describe('weekDays: tag filter', () => {
  it('keeps only tasks carrying the tag', () => {
    const tree = treeOf([
      mkTask('a', { dueDate: '2026-10-20', tags: ['work'], difficulty: 2 }),
      mkTask('b', { dueDate: '2026-10-20', tags: ['home'], difficulty: 3 }),
      mkTask('c', { dueDate: '2026-10-20' }),
    ]);
    const days = weekDays(tree, START, TODAY, 'work');
    expect(idsOn(days, '2026-10-20')).toEqual(['a']);
    expect(day(days, '2026-10-20').points).toBe(2);
    expect(idsOn(weekDays(tree, START, TODAY), '2026-10-20')).toEqual(['a', 'b', 'c']);
  });
});

describe('weekDays: points', () => {
  it('sums the open tasks of a day and skips done ones', () => {
    const tree = treeOf([
      mkTask('a', { dueDate: '2026-10-22', difficulty: 2 }),
      mkTask('b', { dueDate: '2026-10-22', difficulty: 3 }),
      mkTask('c', { dueDate: '2026-10-22', difficulty: 5, done: true }),
    ]);
    expect(day(weekDays(tree, START, TODAY), '2026-10-22').points).toBe(5);
  });

  it('counts a task once, on its planned day when it has one', () => {
    const tree = treeOf([
      mkTask('a', { dueDate: '2026-10-24', plannedFor: '2026-10-22', difficulty: 4 }),
    ]);
    const days = weekDays(tree, START, TODAY);
    expect(day(days, '2026-10-22').points).toBe(4);
    expect(day(days, '2026-10-24').points).toBe(0);
    expect(days.reduce((sum, d) => sum + d.points, 0)).toBe(4);
  });

  it('counts a task planned for its due day once', () => {
    const tree = treeOf([
      mkTask('a', { dueDate: '2026-10-22', plannedFor: '2026-10-22', difficulty: 3 }),
    ]);
    expect(day(weekDays(tree, START, TODAY), '2026-10-22').points).toBe(3);
  });

  it('counts a carried plan on today', () => {
    const tree = treeOf([mkTask('a', { plannedFor: '2026-10-19', difficulty: 3 })]);
    const days = weekDays(tree, START, TODAY);
    expect(day(days, TODAY).points).toBe(3);
    expect(day(days, '2026-10-19').points).toBe(0);
  });

  it('counts a parent as the open points of its subtree', () => {
    const tree = treeOf([
      mkTask('p', { childIds: ['a', 'b', 'c'], dueDate: '2026-10-22', difficulty: 1 }),
      mkTask('a', { parentId: 'p', difficulty: 2 }),
      mkTask('b', { parentId: 'p', difficulty: 3, done: true }),
      mkTask('c', { parentId: 'p', difficulty: 4 }),
    ]);
    expect(day(weekDays(tree, START, TODAY), '2026-10-22').points).toBe(6);
  });

  it('does not count a subtask twice when it has a day of its own', () => {
    const tree = treeOf([
      mkTask('p', { childIds: ['a', 'b'], dueDate: '2026-10-23' }),
      mkTask('a', { parentId: 'p', difficulty: 2, dueDate: '2026-10-21' }),
      mkTask('b', { parentId: 'p', difficulty: 3 }),
    ]);
    const days = weekDays(tree, START, TODAY);
    expect(day(days, '2026-10-21').points).toBe(2);
    expect(day(days, '2026-10-23').points).toBe(3);
  });

  it('does not count a subtask twice when parent and subtask share a day', () => {
    const tree = treeOf([
      mkTask('p', { childIds: ['a', 'b'], dueDate: '2026-10-23' }),
      mkTask('a', { parentId: 'p', difficulty: 2, dueDate: '2026-10-23' }),
      mkTask('b', { parentId: 'p', difficulty: 3 }),
    ]);
    expect(day(weekDays(tree, START, TODAY), '2026-10-23').points).toBe(5);
  });

  it('counts an undated subtask of a filtered-out parent only if it matches', () => {
    const tree = treeOf([
      mkTask('p', { childIds: ['a'], dueDate: '2026-10-23' }),
      mkTask('a', { parentId: 'p', difficulty: 2, tags: ['x'], dueDate: '2026-10-21' }),
    ]);
    const days = weekDays(tree, START, TODAY, 'x');
    expect(idsOn(days, '2026-10-23')).toEqual([]);
    expect(day(days, '2026-10-21').points).toBe(2);
  });
});

describe('weekIds', () => {
  it('lists the rows day by day, a task on two days once', () => {
    const tree = treeOf([
      mkTask('a', { dueDate: '2026-10-23', plannedFor: '2026-10-20' }),
      mkTask('b', { dueDate: '2026-10-20' }),
    ]);
    expect(weekIds(tree, START, TODAY)).toEqual(['b', 'a']);
  });
});

describe('weekRange', () => {
  it('writes the range, month change included', () => {
    expect(weekRange('2026-10-26', TODAY)).toMatch(/Oct\s*26\s*–\s*Nov\s*1/);
    expect(weekRange(START, TODAY)).toMatch(/Oct\s*19\s*–\s*Oct\s*25/);
  });

  it('adds the year outside today’s year', () => {
    expect(weekRange('2026-12-28', TODAY)).toMatch(/2027/);
    expect(weekRange('2025-06-02', TODAY)).toMatch(/2025/);
  });
});

describe('weekDropMove', () => {
  it('moves the due date when a due row lands on another day', () => {
    expect(weekDropMove('due', '2026-10-21', '2026-10-23', TODAY)).toEqual({
      field: 'dueDate',
      date: '2026-10-23',
    });
  });

  it('lets a due date move into the past (the task becomes overdue)', () => {
    expect(weekDropMove('due', '2026-10-21', '2026-10-19', TODAY)).toEqual({
      field: 'dueDate',
      date: '2026-10-19',
    });
  });

  it('moves the plan, not the due date, when a planned row lands on another day', () => {
    expect(weekDropMove('planned', '2026-10-22', '2026-10-24', TODAY)).toEqual({
      field: 'plannedFor',
      date: '2026-10-24',
    });
    expect(weekDropMove('planned', '2026-10-22', TODAY, TODAY)).toEqual({
      field: 'plannedFor',
      date: TODAY,
    });
  });

  it('is null for a drop on the same day', () => {
    expect(weekDropMove('due', '2026-10-21', '2026-10-21', TODAY)).toBeNull();
    expect(weekDropMove('planned', '2026-10-22', '2026-10-22', TODAY)).toBeNull();
  });

  it('is null for a plan dropped before today, where it would only roll over again', () => {
    expect(weekDropMove('planned', TODAY, '2026-10-20', TODAY)).toBeNull();
  });
});

describe('weekStepMove', () => {
  it('moves a due date this week a day either way', () => {
    const task = mkTask('t', { dueDate: '2026-10-21' });
    expect(weekStepMove(task, 1, START, TODAY)).toEqual({ field: 'dueDate', date: '2026-10-22' });
    expect(weekStepMove(task, -1, START, TODAY)).toEqual({ field: 'dueDate', date: '2026-10-20' });
  });

  it('crosses the week, month and year', () => {
    expect(weekStepMove(mkTask('t', { dueDate: '2026-10-25' }), 1, START, TODAY)).toEqual({
      field: 'dueDate',
      date: '2026-10-26',
    });
    expect(weekStepMove(mkTask('t', { dueDate: '2026-12-31' }), 1, '2026-12-28', TODAY)).toEqual({
      field: 'dueDate',
      date: '2027-01-01',
    });
  });

  it('moves the due date when the task is both due and planned this week', () => {
    const task = mkTask('t', { dueDate: '2026-10-24', plannedFor: '2026-10-22' });
    expect(weekStepMove(task, -1, START, TODAY)).toEqual({ field: 'dueDate', date: '2026-10-23' });
  });

  it('moves the plan when only the plan is this week', () => {
    const task = mkTask('t', { dueDate: '2026-11-05', plannedFor: '2026-10-22' });
    expect(weekStepMove(task, 1, START, TODAY)).toEqual({
      field: 'plannedFor',
      date: '2026-10-23',
    });
    expect(weekStepMove(mkTask('t', { plannedFor: '2026-10-22' }), -1, START, TODAY)).toEqual({
      field: 'plannedFor',
      date: TODAY,
    });
  });

  it('steps a rolled-over plan from today, where it shows', () => {
    const task = mkTask('t', { plannedFor: '2026-10-19' });
    expect(weekStepMove(task, 1, START, TODAY)).toEqual({
      field: 'plannedFor',
      date: '2026-10-22',
    });
  });

  it('is null for a plan that would go before today, or a task with no date', () => {
    expect(weekStepMove(mkTask('t', { plannedFor: TODAY }), -1, START, TODAY)).toBeNull();
    expect(weekStepMove(mkTask('t'), 1, START, TODAY)).toBeNull();
  });
});

describe('firstDueFrom', () => {
  const tasks = Object.fromEntries(
    [
      mkTask('a', { dueDate: '2026-10-20' }),
      mkTask('b', { dueDate: '2026-10-22', done: true }),
      mkTask('c', { dueDate: '2026-10-22' }),
      mkTask('d', { dueDate: '2026-10-24' }),
      mkTask('e', { dueDate: null }),
    ].map((task) => [task.id, task]),
  );
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('is the first open task due that day', () => {
    expect(firstDueFrom(tasks, ids, '2026-10-22')).toBe('c');
  });

  it('falls through to the next one due after the day', () => {
    expect(firstDueFrom(tasks, ids, '2026-10-23')).toBe('d');
    expect(firstDueFrom(tasks, ids, '2026-10-01')).toBe('a');
  });

  it('is null when nothing is due from that day on', () => {
    expect(firstDueFrom(tasks, ids, '2026-10-25')).toBeNull();
  });
});
