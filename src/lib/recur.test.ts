import { describe, expect, it } from 'vitest';
import { mkTask } from '../test/factories';
import type { Repeat, Task, TaskTree } from '../types';
import {
  firstOccurrence,
  isUntouchedCopy,
  nextLabel,
  nextOccurrence,
  normalizeRepeat,
  repeatLabel,
  repeatPatch,
  repeatPhrase,
  repeatWord,
  spawnNextOccurrence,
} from './recur';

// 2026-10-20 is a Tuesday.
const TODAY = '2026-10-20';
const day: Repeat = { every: 'day' };
const weekdays: Repeat = { every: 'weekday' };
const week: Repeat = { every: 'week' };
const month: Repeat = { every: 'month' };
const mondays: Repeat = { every: 'week', weekday: 1 };

/** Always "today" is far in the past, so only the rule decides. */
const PAST = '2000-01-01';

describe('nextOccurrence: day', () => {
  it('is the next day', () => {
    expect(nextOccurrence('2026-10-20', day, PAST)).toBe('2026-10-21');
  });

  it('crosses month and year ends', () => {
    expect(nextOccurrence('2026-10-31', day, PAST)).toBe('2026-11-01');
    expect(nextOccurrence('2026-12-31', day, PAST)).toBe('2027-01-01');
  });

  it('catches up: an overdue task jumps to today', () => {
    expect(nextOccurrence('2026-10-01', day, TODAY)).toBe(TODAY);
  });

  it('is strictly after `from` even when due today or in the future', () => {
    expect(nextOccurrence('2026-10-20', day, TODAY)).toBe('2026-10-21');
    expect(nextOccurrence('2026-10-25', day, TODAY)).toBe('2026-10-26');
  });
});

describe('nextOccurrence: weekday', () => {
  it('goes to the next day on Monday to Thursday', () => {
    expect(nextOccurrence('2026-10-26', weekdays, PAST)).toBe('2026-10-27'); // Mon -> Tue
    expect(nextOccurrence('2026-10-22', weekdays, PAST)).toBe('2026-10-23'); // Thu -> Fri
  });

  it('skips the weekend from Friday', () => {
    expect(nextOccurrence('2026-10-23', weekdays, PAST)).toBe('2026-10-26');
  });

  it('skips Sunday from Saturday and lands on Monday from Sunday', () => {
    expect(nextOccurrence('2026-10-24', weekdays, PAST)).toBe('2026-10-26');
    expect(nextOccurrence('2026-10-25', weekdays, PAST)).toBe('2026-10-26');
  });

  it('catches up over a weekend: overdue since Friday, today is Sunday -> Monday', () => {
    expect(nextOccurrence('2026-10-23', weekdays, '2026-10-25')).toBe('2026-10-26');
  });

  it('catches up to today when today is a weekday', () => {
    expect(nextOccurrence('2026-10-05', weekdays, TODAY)).toBe(TODAY);
  });
});

describe('nextOccurrence: week', () => {
  it('adds seven days', () => {
    expect(nextOccurrence('2026-10-20', week, PAST)).toBe('2026-10-27');
  });

  it('crosses a year end', () => {
    expect(nextOccurrence('2026-12-28', week, PAST)).toBe('2027-01-04');
  });

  it('keeps the weekday when three weeks overdue: the next one on or after today', () => {
    // Mon 28 Sep is 22 days before Tue 20 Oct: Mondays are Oct 5, 12, 19, 26.
    expect(nextOccurrence('2026-09-28', week, TODAY)).toBe('2026-10-26');
    // Exactly three weeks overdue lands on today itself.
    expect(nextOccurrence('2026-09-29', week, TODAY)).toBe('2026-10-20');
  });

  it('with a weekday: the next date with that weekday, strictly after `from`', () => {
    expect(nextOccurrence('2026-10-26', mondays, PAST)).toBe('2026-11-02'); // Mon -> next Mon
    expect(nextOccurrence('2026-10-20', mondays, PAST)).toBe('2026-10-26'); // Tue -> Mon
    expect(nextOccurrence('2026-10-25', { every: 'week', weekday: 0 }, PAST)).toBe('2026-11-01');
  });

  it('with a weekday and overdue: the next such weekday on or after today', () => {
    expect(nextOccurrence('2026-09-28', mondays, TODAY)).toBe('2026-10-26');
    expect(nextOccurrence('2026-09-28', { every: 'week', weekday: 2 }, TODAY)).toBe(TODAY);
  });
});

describe('nextOccurrence: month', () => {
  it('keeps the day of the month', () => {
    expect(nextOccurrence('2026-10-15', month, PAST)).toBe('2026-11-15');
  });

  it('clamps to the end of a short month (non-leap February)', () => {
    expect(nextOccurrence('2026-01-31', month, PAST)).toBe('2026-02-28');
  });

  it('clamps to February 29 in a leap year', () => {
    expect(nextOccurrence('2024-01-31', month, PAST)).toBe('2024-02-29');
    expect(nextOccurrence('2024-01-30', month, PAST)).toBe('2024-02-29');
  });

  it('clamps Mar 31 to Apr 30', () => {
    expect(nextOccurrence('2026-03-31', month, PAST)).toBe('2026-04-30');
  });

  it('does not drift with an anchor day: Jan 31 -> Feb 28 -> Mar 31', () => {
    const feb = nextOccurrence('2026-01-31', month, PAST);
    expect(feb).toBe('2026-02-28');
    expect(nextOccurrence(feb, { every: 'month', anchorDay: 31 }, PAST)).toBe('2026-03-31');
    // Without the anchor the clamped day would stick.
    expect(nextOccurrence(feb, month, PAST)).toBe('2026-03-28');
  });

  it('rolls over the year', () => {
    expect(nextOccurrence('2026-12-15', month, PAST)).toBe('2027-01-15');
    expect(nextOccurrence('2026-12-31', month, PAST)).toBe('2027-01-31');
  });

  it('catches up: overdue by several months lands on the anchor day on or after today', () => {
    expect(nextOccurrence('2026-05-10', month, TODAY)).toBe('2026-11-10');
    expect(nextOccurrence('2026-05-20', month, TODAY)).toBe('2026-10-20');
    expect(nextOccurrence('2025-01-31', month, TODAY)).toBe('2026-10-31');
  });

  it('catches up across a year boundary', () => {
    expect(nextOccurrence('2026-03-05', month, '2027-01-03')).toBe('2027-01-05');
  });
});

describe('firstOccurrence', () => {
  it('is today for day, week and month', () => {
    expect(firstOccurrence(day, TODAY)).toBe(TODAY);
    expect(firstOccurrence(week, TODAY)).toBe(TODAY);
    expect(firstOccurrence(month, TODAY)).toBe(TODAY);
  });

  it('is the next occurrence of the weekday for a weekly repeat (today counts)', () => {
    expect(firstOccurrence(mondays, TODAY)).toBe('2026-10-26');
    expect(firstOccurrence({ every: 'week', weekday: 2 }, TODAY)).toBe(TODAY);
    expect(firstOccurrence({ every: 'week', weekday: 0 }, TODAY)).toBe('2026-10-25');
  });

  it('is today on a weekday for the weekday rule, else next Monday', () => {
    expect(firstOccurrence(weekdays, TODAY)).toBe(TODAY);
    expect(firstOccurrence(weekdays, '2026-10-23')).toBe('2026-10-23'); // Fri
    expect(firstOccurrence(weekdays, '2026-10-24')).toBe('2026-10-26'); // Sat
    expect(firstOccurrence(weekdays, '2026-10-25')).toBe('2026-10-26'); // Sun
  });
});

describe('normalizeRepeat', () => {
  it('keeps valid shapes and drops keys that do not apply', () => {
    expect(normalizeRepeat({ every: 'day' })).toEqual({ every: 'day' });
    expect(normalizeRepeat({ every: 'week', weekday: 3 })).toEqual({ every: 'week', weekday: 3 });
    expect(normalizeRepeat({ every: 'month', anchorDay: 31 })).toEqual({
      every: 'month',
      anchorDay: 31,
    });
    expect(normalizeRepeat({ every: 'day', weekday: 2, anchorDay: 4 })).toEqual({ every: 'day' });
  });

  it('turns anything invalid into null', () => {
    for (const bad of [
      undefined,
      null,
      'weekly',
      5,
      [],
      {},
      { every: 'year' },
      { every: 7 },
      { every: 'week', weekday: 7 },
      { every: 'week', weekday: -1 },
      { every: 'week', weekday: 1.5 },
      { every: 'week', weekday: '1' },
      { every: 'month', anchorDay: 0 },
      { every: 'month', anchorDay: 32 },
    ]) {
      expect(normalizeRepeat(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('labels and patches', () => {
  it('labels and words', () => {
    expect(repeatLabel(mondays)).toBe('Every Monday');
    expect(repeatLabel(weekdays)).toBe('Every weekday');
    expect(repeatLabel(month)).toBe('Monthly');
    expect(repeatPhrase(mondays)).toBe('every Monday');
    expect(repeatPhrase(day)).toBe('daily');
    expect(repeatWord(mondays)).toBe('every monday');
    expect(repeatWord(week)).toBe('weekly');
    expect(repeatWord(weekdays)).toBe('weekdays');
  });

  it('nextLabel names the weekday within a week, else the date', () => {
    expect(nextLabel('2026-10-25', TODAY)).toBe('next on Sun');
    expect(nextLabel('2026-10-21', TODAY)).toBe('next tomorrow');
    expect(nextLabel('2026-10-20', TODAY)).toBe('next today');
    expect(nextLabel('2026-10-28', TODAY)).toBe('next on Oct 28');
    expect(nextLabel('2027-01-04', TODAY)).toBe('next on Jan 4, 2027');
  });

  it('repeatPatch gives a dateless task its first occurrence and leaves a dated one alone', () => {
    expect(repeatPatch({ dueDate: null }, mondays, TODAY)).toEqual({
      repeat: mondays,
      dueDate: '2026-10-26',
    });
    expect(repeatPatch({ dueDate: '2026-11-01' }, day, TODAY)).toEqual({ repeat: day });
    expect(repeatPatch({ dueDate: null }, null, TODAY)).toEqual({ repeat: null });
  });
});

// ---------------------------------------------------------------------------

const NOW = new Date(2026, 9, 20, 10, 0).getTime();

const treeOf = (tasks: Task[], rootIds?: string[]): TaskTree => ({
  tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
  rootIds: rootIds ?? tasks.filter((t) => t.parentId === null).map((t) => t.id),
});

describe('spawnNextOccurrence', () => {
  const water = mkTask('water', {
    title: 'Water plants',
    difficulty: 3,
    color: '#C9B8F2',
    tags: ['home', 'plants'],
    dueDate: '2026-10-18',
    repeat: mondays,
    done: true,
    completedAt: 5,
    collapsed: true,
  });

  it('creates an undone copy right after the original with the next due date', () => {
    const tree = treeOf([mkTask('a'), { ...water }, mkTask('z')]);
    const result = spawnNextOccurrence(tree, 'water', NOW)!;
    expect(result.newId).not.toBe('water');
    expect(result.tree.rootIds).toEqual(['a', 'water', result.newId, 'z']);
    const copy = result.tree.tasks[result.newId];
    expect(copy).toEqual({
      id: result.newId,
      title: 'Water plants',
      difficulty: 3,
      color: '#C9B8F2',
      done: false,
      collapsed: false,
      tags: ['home', 'plants'],
      dueDate: '2026-10-26',
      repeat: mondays,
      plannedFor: null,
      startDate: null,
      spawnedFrom: 'water',
      parentId: null,
      childIds: [],
      createdAt: NOW,
    });
    expect(copy.tags).not.toBe(water.tags);
    expect(copy.repeat).not.toBe(water.repeat);
    // The original is untouched.
    expect(result.tree.tasks.water).toBe(tree.tasks.water);
  });

  it('keeps a null colour null', () => {
    const tree = treeOf([mkTask('t', { dueDate: '2026-10-20', repeat: day })]);
    const { tree: next, newId } = spawnNextOccurrence(tree, 't', NOW)!;
    expect(next.tasks[newId].color).toBeNull();
    expect(next.tasks[newId].dueDate).toBe('2026-10-21');
  });

  it('catches up an overdue task to today or later', () => {
    const tree = treeOf([mkTask('t', { dueDate: '2026-09-28', repeat: week })]);
    const { tree: next, newId } = spawnNextOccurrence(tree, 't', NOW)!;
    expect(next.tasks[newId].dueDate).toBe('2026-10-26');
  });

  it('inserts after the original among a parent’s children and reopens a done parent', () => {
    const tree = treeOf([
      mkTask('p', { childIds: ['c1', 'c2', 'c3'], done: true }),
      mkTask('c1', { parentId: 'p', done: true }),
      mkTask('c2', { parentId: 'p', done: true, dueDate: '2026-10-20', repeat: day }),
      mkTask('c3', { parentId: 'p', done: true }),
    ]);
    const { tree: next, newId } = spawnNextOccurrence(tree, 'c2', NOW)!;
    expect(next.tasks.p.childIds).toEqual(['c1', 'c2', newId, 'c3']);
    expect(next.tasks[newId].parentId).toBe('p');
    expect(next.tasks.p.done).toBe(false);
  });

  it('deep-copies the subtree with new ids, all undone, shifting subtask due dates', () => {
    const tree = treeOf([
      mkTask('p', {
        dueDate: '2026-10-20',
        repeat: week,
        done: true,
        childIds: ['a', 'b'],
      }),
      mkTask('a', {
        parentId: 'p',
        done: true,
        title: 'A',
        tags: ['x'],
        difficulty: 4,
        color: '#FFD3B6',
        dueDate: '2026-10-22',
        childIds: ['a1'],
      }),
      mkTask('a1', { parentId: 'a', done: true, title: 'A1', dueDate: null }),
      mkTask('b', { parentId: 'p', done: true, title: 'B', dueDate: null, collapsed: true }),
    ]);
    const { tree: next, newId } = spawnNextOccurrence(tree, 'p', NOW)!;
    const copy = next.tasks[newId];
    expect(copy.dueDate).toBe('2026-10-27');
    expect(copy.childIds).toHaveLength(2);
    const [na, nb] = copy.childIds.map((id) => next.tasks[id]);
    expect(copy.childIds).not.toContain('a');
    expect(copy.childIds).not.toContain('b');
    expect(na).toMatchObject({
      title: 'A',
      tags: ['x'],
      difficulty: 4,
      color: '#FFD3B6',
      done: false,
      parentId: newId,
      dueDate: '2026-10-29', // shifted by the parent's +7 days
    });
    expect(na.spawnedFrom).toBeUndefined();
    expect(na.completedAt).toBeUndefined();
    expect(nb).toMatchObject({ title: 'B', done: false, dueDate: null, parentId: newId });
    const grandchild = next.tasks[na.childIds[0]];
    expect(grandchild).toMatchObject({ title: 'A1', done: false, dueDate: null, parentId: na.id });
    // Fresh ids everywhere, and the originals are still there and done.
    const ids = [newId, na.id, nb.id, grandchild.id];
    expect(new Set(ids).size).toBe(4);
    expect(ids.some((id) => ['p', 'a', 'b', 'a1'].includes(id))).toBe(false);
    expect(next.tasks.a.done).toBe(true);
    expect(Object.keys(next.tasks)).toHaveLength(8);
  });

  it('shares every untouched task with the old tree', () => {
    const other = mkTask('other');
    const tree = treeOf([other, mkTask('t', { dueDate: '2026-10-20', repeat: day })]);
    const { tree: next } = spawnNextOccurrence(tree, 't', NOW)!;
    expect(next.tasks.other).toBe(other);
    expect(next.tasks.t).toBe(tree.tasks.t);
    expect(next).not.toBe(tree);
    expect(tree.rootIds).toEqual(['other', 't']); // the input is not mutated
  });

  it('shares the untouched siblings and copies only the parent when nested', () => {
    const tree = treeOf([
      mkTask('p', { childIds: ['c', 'd'] }),
      mkTask('c', { parentId: 'p', dueDate: '2026-10-20', repeat: day }),
      mkTask('d', { parentId: 'p' }),
    ]);
    const { tree: next } = spawnNextOccurrence(tree, 'c', NOW)!;
    expect(next.tasks.d).toBe(tree.tasks.d);
    expect(next.tasks.c).toBe(tree.tasks.c);
    expect(next.tasks.p).not.toBe(tree.tasks.p);
    expect(tree.tasks.p.childIds).toEqual(['c', 'd']);
  });

  it('returns null without a repeat, without a due date, or for an unknown id', () => {
    const tree = treeOf([
      mkTask('plain', { dueDate: '2026-10-20' }),
      mkTask('undated', { repeat: day }),
    ]);
    expect(spawnNextOccurrence(tree, 'plain', NOW)).toBeNull();
    expect(spawnNextOccurrence(tree, 'undated', NOW)).toBeNull();
    expect(spawnNextOccurrence(tree, 'ghost', NOW)).toBeNull();
  });

  it('returns null when a copy of this occurrence already exists', () => {
    const tree = treeOf([mkTask('t', { dueDate: '2026-10-20', repeat: day })]);
    const first = spawnNextOccurrence(tree, 't', NOW)!;
    expect(spawnNextOccurrence(first.tree, 't', NOW)).toBeNull();
    // A copy someone moved to another date does not block a new one.
    const moved = {
      ...first.tree,
      tasks: {
        ...first.tree.tasks,
        [first.newId]: { ...first.tree.tasks[first.newId], dueDate: '2026-11-30' },
      },
    };
    expect(spawnNextOccurrence(moved, 't', NOW)).not.toBeNull();
  });

  it('carries the monthly anchor day onto the copy so the day does not drift', () => {
    const tree = treeOf([mkTask('t', { dueDate: '2026-01-31', repeat: month })]);
    const first = spawnNextOccurrence(tree, 't', new Date(2026, 0, 31).getTime())!;
    const feb = first.tree.tasks[first.newId];
    expect(feb.dueDate).toBe('2026-02-28');
    expect(feb.repeat).toEqual({ every: 'month', anchorDay: 31 });
    const second = spawnNextOccurrence(first.tree, first.newId, new Date(2026, 1, 28).getTime())!;
    expect(second.tree.tasks[second.newId].dueDate).toBe('2026-03-31');
    expect(second.tree.tasks[second.newId].repeat).toEqual({ every: 'month', anchorDay: 31 });
  });
});

describe('spawnNextOccurrence: notes and start dates', () => {
  const base = {
    title: 'Pay rent',
    dueDate: '2026-10-18',
    repeat: mondays,
    done: true,
    completedAt: 5,
  };

  it('copies the notes', () => {
    const tree = treeOf([mkTask('r', { ...base, notes: 'Landlord: 555\nhttps://pay.test' })]);
    const result = spawnNextOccurrence(tree, 'r', NOW)!;
    expect(result.tree.tasks[result.newId].notes).toBe('Landlord: 555\nhttps://pay.test');
  });

  it('has no notes key when the original has none', () => {
    const tree = treeOf([mkTask('r', base)]);
    const result = spawnNextOccurrence(tree, 'r', NOW)!;
    expect('notes' in result.tree.tasks[result.newId]).toBe(false);
  });

  it('shifts the start date by the same number of days as the due date', () => {
    // Due Sun 18 Oct, next Monday 26 Oct (a catch-up from today, Tue 20 Oct): 8 days.
    const tree = treeOf([mkTask('r', { ...base, startDate: '2026-10-11' })]);
    const result = spawnNextOccurrence(tree, 'r', NOW)!;
    const copy = result.tree.tasks[result.newId];
    expect(copy.dueDate).toBe('2026-10-26');
    expect(copy.startDate).toBe('2026-10-19');
  });

  it('keeps a task without a start date without one', () => {
    const tree = treeOf([mkTask('r', base)]);
    const result = spawnNextOccurrence(tree, 'r', NOW)!;
    expect(result.tree.tasks[result.newId].startDate).toBeNull();
  });

  it('copies and shifts the notes and start dates of the subtree', () => {
    const tree = treeOf([
      mkTask('r', { ...base, childIds: ['s'], startDate: '2026-10-11' }),
      mkTask('s', {
        parentId: 'r',
        notes: 'sub note',
        startDate: '2026-10-12',
        done: true,
      }),
    ]);
    const result = spawnNextOccurrence(tree, 'r', NOW)!;
    const copy = result.tree.tasks[result.newId];
    const sub = result.tree.tasks[copy.childIds[0]];
    expect(sub).toMatchObject({ notes: 'sub note', startDate: '2026-10-20', done: false });
  });
});

describe('isUntouchedCopy', () => {
  const spawn = (tasks: Task[], id = 'r') => {
    const result = spawnNextOccurrence(treeOf(tasks), id, NOW)!;
    return { ...result, copy: result.tree.tasks[result.newId] };
  };
  const edit = (tree: TaskTree, id: string, patch: Partial<Task>): TaskTree => ({
    ...tree,
    tasks: { ...tree.tasks, [id]: { ...tree.tasks[id], ...patch } },
  });
  const rent = mkTask('r', {
    title: 'Pay rent',
    tags: ['home'],
    notes: 'Landlord',
    dueDate: '2026-10-18',
    startDate: '2026-10-11',
    repeat: mondays,
    done: true,
    completedAt: 5,
  });

  it('is true for a fresh copy, including a caught-up and a monthly one', () => {
    const { tree, newId } = spawn([rent]);
    expect(isUntouchedCopy(tree, newId)).toBe(true);
    const monthly = spawn([mkTask('m', { dueDate: '2026-01-31', repeat: month })], 'm');
    expect(isUntouchedCopy(monthly.tree, monthly.newId)).toBe(true);
  });

  it('is false once the copy is edited, rescheduled, planned, moved or completed', () => {
    const { tree, newId, copy } = spawn([rent]);
    const edits: Partial<Task>[] = [
      { title: 'Pay rent (late)' },
      { tags: ['home', 'money'] },
      { notes: 'Landlord, new account' },
      { difficulty: 4 },
      { color: '#C9B8F2' },
      { dueDate: '2026-10-27' },
      { startDate: null },
      { repeat: day },
      { plannedFor: '2026-10-20' },
      { parentId: 'elsewhere' },
      { done: true },
    ];
    for (const patch of edits) expect(isUntouchedCopy(edit(tree, newId, patch), newId)).toBe(false);
    // Collapsing is not an edit.
    expect(isUntouchedCopy(edit(tree, newId, { collapsed: !copy.collapsed }), newId)).toBe(true);
  });

  it('is false when a subtask of the copy is done, edited, added or removed', () => {
    const parent = mkTask('r', { ...rent, childIds: ['a', 'b'] });
    const a = mkTask('a', { parentId: 'r', title: 'A', done: true });
    const b = mkTask('b', { parentId: 'r', title: 'B', done: true });
    const { tree, newId, copy } = spawn([parent, a, b]);
    const [ca, cb] = copy.childIds;
    expect(isUntouchedCopy(tree, newId)).toBe(true);
    expect(isUntouchedCopy(edit(tree, ca, { done: true }), newId)).toBe(false);
    expect(isUntouchedCopy(edit(tree, cb, { title: 'B2' }), newId)).toBe(false);
    expect(isUntouchedCopy(edit(tree, newId, { childIds: [ca] }), newId)).toBe(false);
    const added = edit(tree, newId, { childIds: [ca, cb, 'x'] });
    added.tasks.x = mkTask('x', { parentId: newId, createdAt: NOW });
    expect(isUntouchedCopy(added, newId)).toBe(false);
  });

  it('is false for a task that is not a copy or whose original is gone', () => {
    const { tree, newId } = spawn([rent]);
    expect(isUntouchedCopy(tree, 'r')).toBe(false);
    const orphan = { tasks: { [newId]: tree.tasks[newId] }, rootIds: [newId] };
    expect(isUntouchedCopy(orphan, newId)).toBe(false);
    expect(isUntouchedCopy(tree, 'ghost')).toBe(false);
  });
});
