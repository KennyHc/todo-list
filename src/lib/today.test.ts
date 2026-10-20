import { describe, expect, it } from 'vitest';
import { mkEntry, mkState, mkTask } from '../test/factories';
import type { Task } from '../types';
import {
  completedTodayCount,
  meterShape,
  openPoints,
  overflowIds,
  suggestions,
  todayItems,
  todayKind,
  todayList,
  todayLoad,
} from './today';
import { todayReason } from './todayReason';

// Tue 20 Oct 2026.
const TODAY = '2026-10-20';
const at = (iso: string, hour = 12) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour).getTime();
};

const treeOf = (tasks: Task[]) => mkState(tasks);

describe('todayKind', () => {
  it('names why an open task is in Today', () => {
    expect(todayKind(mkTask('a', { dueDate: '2026-10-19' }), TODAY)).toBe('overdue');
    expect(todayKind(mkTask('a', { dueDate: TODAY }), TODAY)).toBe('due');
    expect(todayKind(mkTask('a', { plannedFor: TODAY }), TODAY)).toBe('planned');
    expect(todayKind(mkTask('a', { plannedFor: '2026-10-17' }), TODAY)).toBe('planned');
  });

  it('is null for everything else', () => {
    expect(todayKind(mkTask('a'), TODAY)).toBeNull();
    expect(todayKind(mkTask('a', { dueDate: '2026-10-21' }), TODAY)).toBeNull();
    expect(todayKind(mkTask('a', { plannedFor: '2026-10-21' }), TODAY)).toBeNull();
    expect(todayKind(mkTask('a', { dueDate: '2026-10-19', done: true }), TODAY)).toBeNull();
    expect(todayKind(mkTask('a', { plannedFor: TODAY, done: true }), TODAY)).toBeNull();
  });

  it('prefers overdue and due over planned', () => {
    expect(todayKind(mkTask('a', { dueDate: '2026-10-19', plannedFor: TODAY }), TODAY)).toBe(
      'overdue',
    );
    expect(todayKind(mkTask('a', { dueDate: TODAY, plannedFor: TODAY }), TODAY)).toBe('due');
    // Planned for today but due later: it is in Today because of the plan.
    expect(todayKind(mkTask('a', { dueDate: '2026-10-30', plannedFor: TODAY }), TODAY)).toBe(
      'planned',
    );
  });
});

describe('openPoints', () => {
  it('is a leaf difficulty, or the sum over the open leaves of a parent', () => {
    const tree = treeOf([
      mkTask('p', { childIds: ['a', 'b', 'c'] }),
      mkTask('a', { parentId: 'p', difficulty: 2 }),
      mkTask('b', { parentId: 'p', difficulty: 3, done: true }),
      mkTask('c', { parentId: 'p', difficulty: 4 }),
      mkTask('solo', { difficulty: 5 }),
    ]);
    expect(openPoints(tree, 'solo')).toBe(5);
    // The finished child is not part of what is left.
    expect(openPoints(tree, 'p')).toBe(6);
    expect(openPoints(tree, 'b')).toBe(0);
    expect(openPoints(tree, 'nope')).toBe(0);
  });
});

describe('todayList', () => {
  it('orders overdue (oldest first), then due today, then planned, ties by tree order', () => {
    const tree = treeOf([
      mkTask('plannedB', { plannedFor: TODAY }),
      mkTask('dueA', { dueDate: TODAY }),
      mkTask('lateNew', { dueDate: '2026-10-19' }),
      mkTask('plannedA', { plannedFor: TODAY }),
      mkTask('lateOld', { dueDate: '2026-10-10' }),
      mkTask('dueB', { dueDate: TODAY }),
      mkTask('other'),
    ]);
    expect(todayList(tree, TODAY)).toEqual([
      'lateOld',
      'lateNew',
      'dueA',
      'dueB',
      'plannedB',
      'plannedA',
    ]);
    expect(todayItems(tree, TODAY).map((i) => i.kind)).toEqual([
      'overdue',
      'overdue',
      'due',
      'due',
      'planned',
      'planned',
    ]);
  });

  it('rolls an unfinished plan over and lists the older plan first', () => {
    const tree = treeOf([
      mkTask('today', { plannedFor: TODAY }),
      mkTask('mon', { plannedFor: '2026-10-19' }),
      mkTask('last', { plannedFor: '2026-10-12' }),
      mkTask('tomorrow', { plannedFor: '2026-10-21' }),
    ]);
    expect(todayList(tree, TODAY)).toEqual(['last', 'mon', 'today']);
  });

  it('leaves out done tasks, and everything under a done parent', () => {
    const tree = treeOf([
      mkTask('done', { dueDate: TODAY, done: true }),
      mkTask('p', { done: true, childIds: ['c'] }),
      mkTask('c', { parentId: 'p', dueDate: TODAY, done: true }),
      mkTask('open', { dueDate: TODAY }),
    ]);
    expect(todayList(tree, TODAY)).toEqual(['open']);
  });

  it('lists subtasks flat, whatever their depth, in tree order', () => {
    const tree = treeOf([
      mkTask('a', { childIds: ['a1'] }),
      mkTask('a1', { parentId: 'a', childIds: ['a1x'], dueDate: TODAY }),
      mkTask('a1x', { parentId: 'a1' }),
      mkTask('b', { childIds: ['b1'] }),
      mkTask('b1', { parentId: 'b', plannedFor: TODAY }),
    ]);
    expect(todayList(tree, TODAY)).toEqual(['a1', 'b1']);
  });

  it('counts a planned parent once: its qualifying subtasks are not listed again', () => {
    const tree = treeOf([
      mkTask('p', { plannedFor: TODAY, childIds: ['c1', 'c2'] }),
      mkTask('c1', { parentId: 'p', dueDate: '2026-10-01' }),
      mkTask('c2', { parentId: 'p', plannedFor: TODAY }),
    ]);
    expect(todayList(tree, TODAY)).toEqual(['p']);
  });

  it('keeps the topmost qualifying task even when an ancestor further up does not qualify', () => {
    const tree = treeOf([
      mkTask('root', { childIds: ['mid'] }),
      mkTask('mid', { parentId: 'root', childIds: ['leaf'], plannedFor: TODAY }),
      mkTask('leaf', { parentId: 'mid', dueDate: TODAY }),
    ]);
    expect(todayList(tree, TODAY)).toEqual(['mid']);
  });

  it('filters by tag', () => {
    const tree = treeOf([
      mkTask('a', { dueDate: TODAY, tags: ['work'] }),
      mkTask('b', { dueDate: TODAY, tags: ['home'] }),
    ]);
    expect(todayList(tree, TODAY, 'work')).toEqual(['a']);
    expect(todayList(tree, TODAY, 'nope')).toEqual([]);
  });
});

describe('todayLoad', () => {
  const capacity = 8;

  it('sums the open points of the Today rows', () => {
    const tree = treeOf([
      mkTask('a', { dueDate: TODAY, difficulty: 3 }),
      mkTask('b', { plannedFor: TODAY, difficulty: 2 }),
      mkTask('c', { difficulty: 5 }),
    ]);
    expect(todayLoad(tree, [], TODAY, capacity)).toEqual({ open: 5, done: 0, capacity });
  });

  it('counts a parent once, with the points of the subtasks still open', () => {
    const tree = treeOf([
      mkTask('p', { plannedFor: TODAY, childIds: ['c1', 'c2', 'c3'] }),
      mkTask('c1', { parentId: 'p', difficulty: 2, dueDate: TODAY }),
      mkTask('c2', { parentId: 'p', difficulty: 3, plannedFor: TODAY }),
      mkTask('c3', { parentId: 'p', difficulty: 4, done: true }),
    ]);
    expect(todayLoad(tree, [], TODAY, capacity).open).toBe(5);
  });

  it('counts the leaves finished today, and nothing from other days', () => {
    const history = [
      mkEntry('now', { completedAt: at(TODAY, 9), difficulty: 3 }),
      mkEntry('late', { completedAt: at(TODAY, 23), difficulty: 2 }),
      mkEntry('yesterday', { completedAt: at('2026-10-19', 23), difficulty: 5 }),
      mkEntry('tomorrow', { completedAt: at('2026-10-21', 0), difficulty: 5 }),
    ];
    expect(todayLoad(treeOf([]), history, TODAY, capacity).done).toBe(5);
  });

  it('never double-counts a parent and its subtasks', () => {
    const history = [
      mkEntry('l1', { completedAt: at(TODAY), difficulty: 2 }),
      mkEntry('l2', { completedAt: at(TODAY), difficulty: 3, auto: true }),
      // The cascaded parent restates the leaves under it (2 + 3).
      mkEntry('parent', {
        completedAt: at(TODAY),
        difficulty: 5,
        isParent: true,
        subtaskCount: 2,
        auto: true,
      }),
    ];
    expect(todayLoad(treeOf([]), history, TODAY, capacity).done).toBe(5);
  });

  it('does not count a leaf finished on an earlier day under a parent finished today', () => {
    const history = [
      mkEntry('old leaf', { completedAt: at('2026-10-19'), difficulty: 4 }),
      mkEntry('new leaf', { completedAt: at(TODAY), difficulty: 1 }),
      mkEntry('parent', { completedAt: at(TODAY), difficulty: 5, isParent: true, auto: true }),
    ];
    expect(todayLoad(treeOf([]), history, TODAY, capacity).done).toBe(1);
  });

  it('carries the capacity it was given', () => {
    expect(todayLoad(treeOf([]), [], TODAY, 13).capacity).toBe(13);
  });
});

describe('completedTodayCount', () => {
  it('counts entries completed today that the user completed (not cascaded ones)', () => {
    const history = [
      mkEntry('a', { completedAt: at(TODAY) }),
      mkEntry('b', { completedAt: at(TODAY, 1) }),
      mkEntry('c', { completedAt: at(TODAY), auto: true }),
      mkEntry('d', { completedAt: at('2026-10-19') }),
    ];
    expect(completedTodayCount(history, TODAY)).toBe(2);
  });
});

describe('meterShape', () => {
  it('splits the bar into done, planned and the capacity mark', () => {
    const shape = meterShape({ open: 3, done: 5, capacity: 10 });
    expect(shape.done).toBeCloseTo(0.5);
    expect(shape.planned).toBeCloseTo(0.3);
    expect(shape.over).toBe(0);
    expect(shape.mark).toBe(1);
    expect(shape.overBy).toBe(0);
  });

  it('turns the part past the capacity into an over segment', () => {
    const shape = meterShape({ open: 6, done: 5, capacity: 8 });
    expect(shape.overBy).toBe(3);
    // The bar now spans 11 points; the capacity mark moves in.
    expect(shape.done).toBeCloseTo(5 / 11);
    expect(shape.planned).toBeCloseTo(3 / 11);
    expect(shape.over).toBeCloseTo(3 / 11);
    expect(shape.mark).toBeCloseTo(8 / 11);
  });

  it('can be over on done points alone', () => {
    const shape = meterShape({ open: 2, done: 10, capacity: 8 });
    expect(shape.overBy).toBe(4);
    expect(shape.over).toBeCloseTo(2 / 12);
    expect(shape.planned).toBe(0);
  });

  it('copes with an empty day', () => {
    expect(meterShape({ open: 0, done: 0, capacity: 8 })).toMatchObject({ done: 0, planned: 0 });
  });
});

describe('overflowIds', () => {
  const tree = treeOf([
    mkTask('late', { dueDate: '2026-10-01', difficulty: 3, createdAt: 50 }),
    mkTask('old', { plannedFor: TODAY, difficulty: 2, createdAt: 10 }),
    mkTask('mid', { plannedFor: TODAY, difficulty: 2, createdAt: 20 }),
    mkTask('new', { plannedFor: TODAY, difficulty: 3, createdAt: 30 }),
  ]);

  it('is empty when the day fits', () => {
    const load = todayLoad(tree, [], TODAY, 10);
    expect(overflowIds(tree, TODAY, load).size).toBe(0);
  });

  it('names the latest-added planned rows until the day fits', () => {
    // 3 + 2 + 2 + 3 = 10 points against 6: 4 over, so "new" (3) and then "mid" (2).
    const load = todayLoad(tree, [], TODAY, 6);
    expect([...overflowIds(tree, TODAY, load)]).toEqual(['new', 'mid']);
  });

  it('never names an overdue or due row, even when that is not enough', () => {
    const load = todayLoad(tree, [], TODAY, 1);
    const named = overflowIds(tree, TODAY, load);
    expect(named.has('late')).toBe(false);
    expect([...named].sort()).toEqual(['mid', 'new', 'old']);
  });

  it('counts the points already finished today', () => {
    const history = [mkEntry('x', { completedAt: at(TODAY), difficulty: 4 })];
    // 10 open + 4 done = 14 against 11: 3 over, so just "new".
    const load = todayLoad(tree, history, TODAY, 11);
    expect([...overflowIds(tree, TODAY, load)]).toEqual(['new']);
  });
});

describe('suggestions', () => {
  it('prefers tasks due in the coming week, soonest first, then small undated ones by age', () => {
    const tree = treeOf([
      mkTask('undatedNew', { difficulty: 1, createdAt: 30 }),
      mkTask('fri', { dueDate: '2026-10-23', difficulty: 3 }),
      mkTask('undatedOld', { difficulty: 2, createdAt: 10 }),
      mkTask('wed', { dueDate: '2026-10-21', difficulty: 2 }),
      mkTask('sun', { dueDate: '2026-10-27', difficulty: 1 }),
    ]);
    expect(suggestions(tree, TODAY, 8, 5)).toEqual([
      'wed',
      'fri',
      'sun',
      'undatedOld',
      'undatedNew',
    ]);
  });

  it('defaults to three', () => {
    const tree = treeOf(['a', 'b', 'c', 'd', 'e'].map((id, i) => mkTask(id, { createdAt: i })));
    expect(suggestions(tree, TODAY, 8)).toEqual(['a', 'b', 'c']);
  });

  it('only suggests what fits in the capacity left', () => {
    const tree = treeOf([
      mkTask('big', { dueDate: '2026-10-21', difficulty: 4 }),
      mkTask('small', { dueDate: '2026-10-22', difficulty: 2 }),
      mkTask('tiny', { difficulty: 1 }),
    ]);
    expect(suggestions(tree, TODAY, 3)).toEqual(['small', 'tiny']);
    expect(suggestions(tree, TODAY, 1)).toEqual(['tiny']);
    expect(suggestions(tree, TODAY, 0)).toEqual([]);
    expect(suggestions(tree, TODAY, -2)).toEqual([]);
  });

  it('skips undated tasks that are not small, and dated ones beyond the week', () => {
    const tree = treeOf([
      mkTask('chunky', { difficulty: 3 }),
      mkTask('later', { dueDate: '2026-10-28', difficulty: 1 }),
      mkTask('edge', { dueDate: '2026-10-27', difficulty: 1 }),
    ]);
    expect(suggestions(tree, TODAY, 8)).toEqual(['edge']);
  });

  it('never suggests done tasks, or tasks already in Today', () => {
    const tree = treeOf([
      mkTask('done', { dueDate: '2026-10-21', done: true }),
      mkTask('overdue', { dueDate: '2026-10-01' }),
      mkTask('due', { dueDate: TODAY }),
      mkTask('planned', { plannedFor: TODAY }),
      mkTask('free'),
    ]);
    expect(suggestions(tree, TODAY, 8)).toEqual(['free']);
  });

  it('never suggests a task set aside for a later day', () => {
    const tree = treeOf([
      mkTask('snoozed', { plannedFor: '2026-10-21' }),
      mkTask('snoozedDated', { plannedFor: '2026-10-22', dueDate: '2026-10-23' }),
      mkTask('free'),
    ]);
    expect(suggestions(tree, TODAY, 8)).toEqual(['free']);
  });

  it('leaves out the subtasks of a task that is already in Today', () => {
    const tree = treeOf([
      mkTask('p', { plannedFor: TODAY, childIds: ['c'] }),
      mkTask('c', { parentId: 'p', dueDate: '2026-10-21' }),
    ]);
    expect(suggestions(tree, TODAY, 8)).toEqual([]);
  });

  it('suggests a parent by its open points, and not its subtasks as well', () => {
    const tree = treeOf([
      mkTask('p', { dueDate: '2026-10-22', childIds: ['c1', 'c2'] }),
      mkTask('c1', { parentId: 'p', difficulty: 2 }),
      mkTask('c2', { parentId: 'p', difficulty: 2, done: true }),
    ]);
    // c1 alone would be small, but the parent ranks first and covers it.
    expect(suggestions(tree, TODAY, 8)).toEqual(['p']);
    // The finished subtask is not counted against the capacity.
    expect(suggestions(tree, TODAY, 2)).toEqual(['p']);
    expect(suggestions(tree, TODAY, 1)).toEqual([]);
  });

  it('breaks ties by tree order', () => {
    const tree = treeOf([
      mkTask('x', { dueDate: '2026-10-22' }),
      mkTask('y', { dueDate: '2026-10-22' }),
    ]);
    expect(suggestions(tree, TODAY, 8)).toEqual(['x', 'y']);
  });
});

describe('todayReason', () => {
  it('says nothing for due-today and planned-today rows', () => {
    expect(todayReason(mkTask('a', { dueDate: TODAY }), TODAY)).toBeNull();
    expect(todayReason(mkTask('a', { plannedFor: TODAY }), TODAY)).toBeNull();
    expect(todayReason(mkTask('a'), TODAY)).toBeNull();
  });

  it('flags an overdue row with its date, in danger', () => {
    const reason = todayReason(mkTask('a', { dueDate: '2026-10-18' }), TODAY);
    expect(reason?.danger).toBe(true);
    expect(reason?.label).toMatch(/^Overdue · (Oct\s*18|18\s*Oct)$/);
  });

  it('names the weekday of a plan that rolled over', () => {
    const reason = todayReason(mkTask('a', { plannedFor: '2026-10-19' }), TODAY);
    expect(reason).toEqual({ label: 'From Mon', danger: false });
  });

  it('falls back to the date for an older plan', () => {
    const reason = todayReason(mkTask('a', { plannedFor: '2026-10-05' }), TODAY);
    expect(reason?.label).toMatch(/^From (Oct\s*5|5\s*Oct)$/);
  });

  it('prefers the overdue reason when a row is both overdue and rolled over', () => {
    const reason = todayReason(
      mkTask('a', { dueDate: '2026-10-18', plannedFor: '2026-10-19' }),
      TODAY,
    );
    expect(reason?.danger).toBe(true);
  });
});
