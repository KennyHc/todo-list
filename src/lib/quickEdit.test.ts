import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickAdd';
import { quickPatch } from './quickEdit';

// Tue 20 Oct 2026 (local time).
const TUE = new Date(2026, 9, 20, 10, 30);
const TODAY = '2026-10-20';
const parse = (text: string) => parseQuickAdd(text, { now: TUE, locale: 'en-US' });
const task = { title: 'Old', tags: ['home'], dueDate: '2026-11-02' };

describe('quickPatch', () => {
  it('only renames when the text sets nothing else', () => {
    expect(quickPatch(task, parse('Book flights'), TODAY)).toEqual({ title: 'Book flights' });
  });

  it('sets the difficulty, start date and due date the text names', () => {
    expect(quickPatch(task, parse('Book flights !3 tomorrow'), TODAY)).toEqual({
      title: 'Book flights',
      difficulty: 3,
      dueDate: '2026-10-21',
    });
    expect(quickPatch(task, parse('Book flights from friday'), TODAY)).toMatchObject({
      startDate: '2026-10-23',
    });
  });

  it('adds typed tags to the existing ones', () => {
    expect(quickPatch(task, parse('Book flights #travel #home'), TODAY)).toEqual({
      title: 'Book flights',
      tags: ['home', 'travel'],
    });
  });

  it('keeps the current title when the text is only tags', () => {
    expect(quickPatch(task, parse('#travel'), TODAY)).toEqual({
      title: 'Old',
      tags: ['home', 'travel'],
    });
  });

  it('keeps an existing due date for a typed repeat, like the Repeat menu', () => {
    expect(quickPatch(task, parse('Gym every week'), TODAY)).toEqual({
      title: 'Gym',
      repeat: { every: 'week' },
    });
  });

  it('gives a task without a due date the repeat’s first occurrence', () => {
    expect(quickPatch({ ...task, dueDate: null }, parse('Gym every monday'), TODAY)).toEqual({
      title: 'Gym',
      repeat: { every: 'week', weekday: 1 },
      dueDate: '2026-10-26',
    });
  });

  it('uses a typed date together with a typed repeat', () => {
    expect(quickPatch(task, parse('Gym daily tomorrow'), TODAY)).toEqual({
      title: 'Gym',
      repeat: { every: 'day' },
      dueDate: '2026-10-21',
    });
  });
});
