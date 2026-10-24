import { describe, expect, it } from 'vitest';
import { parseQuickAdd, parseRepeatPhrase, tokenKey, type QuickAddOptions } from './quickAdd';
import { firstOccurrence } from './recur';
import { todayISO } from './views';

// Tue 20 Oct 2026 (local time).
const TUE = new Date(2026, 9, 20, 10, 30);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9);
const US = 'en-US';
const GB = 'en-GB';

type Case = [
  input: string,
  title: string,
  due: string | null,
  extra?: { now?: Date; locale?: string; label?: string },
];

const run = (input: string, extra: QuickAddOptions = {}) =>
  parseQuickAdd(input, { now: TUE, locale: US, ...extra });

describe('dates', () => {
  const cases: Case[] = [
    // relative words
    ['Call mum today', 'Call mum', '2026-10-20', { label: 'Today' }],
    ['Dinner tonight', 'Dinner', '2026-10-20'],
    ['Pay rent TOMORROW', 'Pay rent', '2026-10-21', { label: 'Tomorrow' }],
    ['Pay rent tmr', 'Pay rent', '2026-10-21'],
    ['Pay rent tmrw', 'Pay rent', '2026-10-21'],
    // weekdays: next occurrence, today's weekday means today
    ['Gym fri', 'Gym', '2026-10-23', { label: 'Friday' }],
    ['Gym Friday', 'Gym', '2026-10-23'],
    ['Gym thurs', 'Gym', '2026-10-22'],
    ['Gym tues', 'Gym', '2026-10-20'],
    ['Gym monday', 'Gym', '2026-10-26', { label: 'Monday' }],
    ['Gym sun', 'Gym', '2026-10-25'],
    ['Gym friday', 'Gym', '2026-10-23', { now: at(2026, 10, 23) }],
    // "next <weekday>" is that weekday in the following Mon-Sun week
    ['Gym next friday', 'Gym', '2026-10-30'],
    ['Gym next monday', 'Gym', '2026-10-26'],
    ['Gym next sunday', 'Gym', '2026-11-01'],
    ['Gym next tuesday', 'Gym', '2026-10-27'],
    ['Gym next friday', 'Gym', '2026-10-30', { now: at(2026, 10, 24) }],
    ['Gym next friday', 'Gym', '2026-10-30', { now: at(2026, 10, 23) }],
    ['Gym next monday', 'Gym', '2026-10-26', { now: at(2026, 10, 25) }],
    ['Gym next monday', 'Gym', '2026-11-02', { now: at(2026, 10, 26) }],
    // week / month / weekend
    ['Plan next week', 'Plan', '2026-10-26'],
    ['Plan next week', 'Plan', '2026-11-02', { now: at(2026, 10, 26) }],
    ['Review next month', 'Review', '2026-11-01'],
    ['Review next month', 'Review', '2027-01-01', { now: at(2026, 12, 15) }],
    ['Hike this weekend', 'Hike', '2026-10-24'],
    ['Hike weekend', 'Hike', '2026-10-24'],
    ['Hike this weekend', 'Hike', '2026-10-24', { now: at(2026, 10, 24) }],
    ['Hike this weekend', 'Hike', '2026-10-25', { now: at(2026, 10, 25) }],
    // in N units
    ['Renew in 3 days', 'Renew', '2026-10-23'],
    ['Renew in 2 weeks', 'Renew', '2026-11-03'],
    ['Renew in 2 months', 'Renew', '2026-12-20'],
    ['Renew in a week', 'Renew', '2026-10-27'],
    ['Renew in 1 day', 'Renew', '2026-11-01', { now: at(2026, 10, 31) }],
    ['Renew in 1 day', 'Renew', '2027-01-01', { now: at(2026, 12, 31) }],
    ['Renew in 1 month', 'Renew', '2027-02-28', { now: at(2027, 1, 31) }],
    ['Renew in 365 days', 'Renew', '2027-10-20'],
    // month names
    ['Party oct 24', 'Party', '2026-10-24', { label: 'Saturday' }],
    ['Party 24 oct', 'Party', '2026-10-24'],
    ['Party October 24', 'Party', '2026-10-24'],
    ['Party oct 24th', 'Party', '2026-10-24'],
    ['Party 24th of october', 'Party', '2026-10-24'],
    ['Party oct 24 2027', 'Party', '2027-10-24', { label: 'Oct 24, 2027' }],
    ['Party Oct 24, 2027', 'Party', '2027-10-24'],
    ['Party 24 Oct 2027', 'Party', '2027-10-24'],
    ['Party oct 31', 'Party', '2026-10-31', { label: 'Oct 31' }],
    ['Party oct 31', 'Party', '2026-10-31', { locale: GB, label: '31 Oct' }],
    ['Party sept 3', 'Party', '2027-09-03'],
    ['Trip oct 20', 'Trip', '2026-10-20'],
    ['Trip jan 5', 'Trip', '2027-01-05', { label: 'Jan 5, 2027' }],
    ['Trip oct 19', 'Trip', '2027-10-19'],
    ['Party oct 24', 'Party', '2026-10-24', { locale: GB, label: 'Saturday' }],
    // leap years
    ['Cake feb 29', 'Cake', '2028-02-29'],
    ['Cake feb 29 2028', 'Cake', '2028-02-29'],
    ['Cake 29 feb', 'Cake', '2028-02-29', { now: at(2027, 3, 1) }],
    // ISO and numeric
    ['File 2026-10-24', 'File', '2026-10-24'],
    ['File 2027-02-03', 'File', '2027-02-03'],
    ['File 24/10', 'File', '2026-10-24'],
    ['File 10/24', 'File', '2026-10-24'],
    ['File by 24.10', 'File', '2026-10-24'],
    ['File 24.10.2026', 'File', '2026-10-24'],
    ['Party 24.10.2026', 'Party', '2026-10-24'],
    ['Call mum fri', 'Call mum', '2026-10-23'],
    ['Call mum fri #family !2', 'Call mum', '2026-10-23'],
    ['Submit form 24/10', 'Submit form', '2026-10-24'],
    ['Pay rent by 24/10 #home', 'Pay rent', '2026-10-24'],
    ['Meet on sat', 'Meet', '2026-10-24'],
    ['Report due wed', 'Report', '2026-10-21'],
    ['Gym this fri', 'Gym', '2026-10-23'],
    ['Gym next fri', 'Gym', '2026-10-30'],
    ['Gym before fri tonight', 'Gym before fri', '2026-10-20'],
    ['Run 5.2 km', 'Run 5.2 km', null],
    ['Pay 24.10 tomorrow', 'Pay 24.10', '2026-10-21'],
    ['Pay 24.10', 'Pay 24.10', null],
    ['1/2 cup flour', '1/2 cup flour', null],
    ['Clean the sun room', 'Clean the sun room', null],
    ['SAT prep', 'SAT prep', null],
    ['Wed planning doc', 'Wed planning doc', null],
    ['Fri night drinks', 'Fri night drinks', null],
    ['Mon-Fri schedule', 'Mon-Fri schedule', null],
    ['Buy 3/4 inch pipe now', 'Buy 3/4 inch pipe now', null],
    ['File 24/10/2026', 'File', '2026-10-24'],
    ['File 24/10/27', 'File', '2027-10-24'],
    ['File 3/4', 'File', '2027-03-04', { locale: US }],
    ['File 3/4', 'File', '2027-04-03', { locale: GB }],
    ['File 3/4/2026', 'File', '2026-03-04', { locale: US }],
    ['File 3/4/2026', 'File', '2026-04-03', { locale: GB }],
    ['File 10/24', 'File', '2026-10-24', { locale: GB }],
    ['File 24/10', 'File', '2026-10-24', { locale: GB }],
    ['File 29/2', 'File', '2028-02-29'],
    // leading words
    ['Pay rent by friday', 'Pay rent', '2026-10-23', { label: 'Friday' }],
    ['Pay rent on friday', 'Pay rent', '2026-10-23'],
    ['Pay rent due friday', 'Pay rent', '2026-10-23'],
    ['Pay rent due by oct 24', 'Pay rent', '2026-10-24'],
    ['Pay rent by next friday', 'Pay rent', '2026-10-30'],
    ['Pay rent, tomorrow', 'Pay rent', '2026-10-21'],
    ['Call mum , tomorrow', 'Call mum', '2026-10-21'],
    ['Call mum tomorrow.', 'Call mum', '2026-10-21'],
    ['Tomorrow call mum', 'call mum', '2026-10-21'],
    ['Buy (tomorrow) milk', 'Buy milk', '2026-10-21'],
    // the last date wins
    ['Read Tomorrow and tomorrow', 'Read Tomorrow and', '2026-10-21'],
    ['Visit friday or oct 30', 'Visit friday or', '2026-10-30'],
    ['Visit oct 30 or friday', 'Visit oct 30 or', '2026-10-23'],
    // not dates
    ['Plan may', 'Plan may', null],
    ['Read march', 'Read march', null],
    ['Read march 40', 'Read march 40', null],
    ['Call in 0 days', 'Call in 0 days', null],
    ['Call in 366 days', 'Call in 366 days', null],
    ['Cake feb 30', 'Cake feb 30', null],
    ['Cake feb 29 2027', 'Cake feb 29 2027', null],
    ['File 31/31', 'File 31/31', null],
    ['File 2026-02-30', 'File 2026-02-30', null],
    ['File 32/10', 'File 32/10', null],
    ['Anniversary of the nextfriday', 'Anniversary of the nextfriday', null],
    ['tomorrow', 'tomorrow', null],
    ['by friday', 'by friday', null],
  ];
  it.each(cases)('%j -> %j due %j', (input, title, due, extra = {}) => {
    const { label, now, locale } = extra;
    const result = parseQuickAdd(input, { now: now ?? TUE, locale: locale ?? US });
    expect(result.title).toBe(title);
    expect(result.dueDate).toBe(due);
    if (label) expect(result.tokens.find((t) => t.kind === 'date')?.label).toBe(label);
    if (due === null) expect(result.tokens).toEqual([]);
  });

  it('labels a weekday within six days, otherwise a date, and adds the year when it differs', () => {
    const label = (s: string) => run(s).tokens[0].label;
    expect(label('x oct 25')).toBe('Sunday');
    expect(label('x oct 26')).toBe('Monday');
    expect(label('x oct 27')).toBe('Oct 27');
    expect(label('x in 6 days')).toBe('Monday');
    expect(label('x in 7 days')).toBe('Oct 27');
    expect(label('x 2027-01-05')).toBe('Jan 5, 2027');
  });

  it('uses the local date rather than UTC near midnight', () => {
    const late = new Date(2026, 9, 20, 23, 59);
    expect(parseQuickAdd('x today', { now: late }).dueDate).toBe('2026-10-20');
    expect(parseQuickAdd('x tomorrow', { now: late }).dueDate).toBe('2026-10-21');
    const early = new Date(2026, 9, 20, 0, 1);
    expect(parseQuickAdd('x today', { now: early }).dueDate).toBe('2026-10-20');
  });
});

describe('difficulty', () => {
  it.each([
    ['Draft report !3', 'Draft report', 3],
    ['!5 ship it', 'ship it', 5],
    ['Draft !1 report !4', 'Draft !1 report', 4],
    ['Draft report !2.', 'Draft report', 2],
  ])('%j', (input, title, level) => {
    const r = run(input);
    expect(r.title).toBe(title);
    expect(r.difficulty).toBe(level);
  });

  it.each(['Wow !', 'Wow !!', 'Wow !9', 'Wow !0', 'Wow a!3', 'Wow !33', 'Wow !3x'])(
    'does not match %j',
    (input) => {
      const r = run(input);
      expect(r.difficulty).toBeNull();
      expect(r.title).toBe(input);
    },
  );

  it('labels the chip', () => {
    expect(run('x !2').tokens[0]).toMatchObject({ kind: 'difficulty', label: 'Difficulty 2' });
  });
});

describe('tags', () => {
  it('keeps the word-start semantics', () => {
    expect(run('Learn C# today').tags).toEqual([]);
    expect(run('Learn C# today').title).toBe('Learn C#');
    expect(run('a#b').title).toBe('a#b');
    expect(run('wow #hi!').tags).toEqual([]);
  });

  it('is not fooled by an email address', () => {
    const r = run('Mail a@b.com #tag');
    expect(r.title).toBe('Mail a@b.com');
    expect(r.tags).toEqual(['tag']);
  });

  it('normalises, dedupes and labels', () => {
    const r = run('x #A #a #b');
    expect(r.tags).toEqual(['a', 'b']);
    expect(r.tokens.map((t) => t.label)).toEqual(['#a', '#a', '#b']);
  });

  it('a tag-only input gives an empty title as before', () => {
    expect(run('#only')).toMatchObject({ title: '', tags: ['only'] });
  });
});

describe('repeat', () => {
  const R = { repeats: true };
  const cases: [string, string, object, string | null, string][] = [
    ['Gym every day', 'Gym', { every: 'day' }, '2026-10-20', 'Daily'],
    ['Gym daily', 'Gym', { every: 'day' }, '2026-10-20', 'Daily'],
    ['Gym every weekday', 'Gym', { every: 'weekday' }, '2026-10-20', 'Every weekday'],
    ['Gym weekdays', 'Gym', { every: 'weekday' }, '2026-10-20', 'Every weekday'],
    ['Gym every week', 'Gym', { every: 'week' }, '2026-10-20', 'Weekly'],
    ['Gym weekly', 'Gym', { every: 'week' }, '2026-10-20', 'Weekly'],
    ['Gym every month', 'Gym', { every: 'month' }, '2026-10-20', 'Monthly'],
    ['Gym monthly', 'Gym', { every: 'month' }, '2026-10-20', 'Monthly'],
    ['Gym every monday', 'Gym', { every: 'week', weekday: 1 }, '2026-10-26', 'Every Monday'],
    ['Gym every tue', 'Gym', { every: 'week', weekday: 2 }, '2026-10-20', 'Every Tuesday'],
    ['Gym every friday', 'Gym', { every: 'week', weekday: 5 }, '2026-10-23', 'Every Friday'],
  ];
  it.each(cases)('%j', (input, title, repeat, due, label) => {
    const r = run(input, R);
    expect(r.title).toBe(title);
    expect(r.repeat).toEqual(repeat);
    expect(r.dueDate).toBe(due);
    expect(r.tokens[0]).toMatchObject({ kind: 'repeat', label });
  });

  it('an explicit date wins over the first occurrence', () => {
    const r = run('Gym every monday by oct 30', R);
    expect(r.repeat).toEqual({ every: 'week', weekday: 1 });
    expect(r.dueDate).toBe('2026-10-30');
    expect(r.title).toBe('Gym');
  });

  it('weekday repeats start next Monday on a weekend', () => {
    const sat = at(2026, 10, 24);
    expect(run('x every weekday', { now: sat }).dueDate).toBe('2026-10-26');
    expect(run('x every weekday', { now: at(2026, 10, 25) }).dueDate).toBe('2026-10-26');
    expect(run('x daily', { now: sat }).dueDate).toBe('2026-10-24');
  });

  it('combines with the other parts', () => {
    const r = run('Gym every monday !3 #health', R);
    expect(r.title).toBe('Gym');
    expect(r.difficulty).toBe(3);
    expect(r.tags).toEqual(['health']);
  });

  it('leaves the words alone when repeats are switched off', () => {
    const r = run('Gym every monday', { repeats: false });
    expect(r.title).toBe('Gym every monday');
    expect(r.repeat).toBeNull();
    expect(r.dueDate).toBeNull();
    expect(r.tokens).toEqual([]);
  });
});

describe('title and ignore', () => {
  it('collapses whitespace and tidies punctuation', () => {
    expect(run('  Buy   milk   tomorrow  ').title).toBe('Buy milk');
    expect(run('Call mum , tomorrow !2 , ok').title).toBe('Call mum, ok');
    expect(run('Pay rent: tomorrow').title).toBe('Pay rent');
    expect(run('- tomorrow: pay rent').title).toBe('pay rent');
  });

  it('never leaves an empty title because of parsing', () => {
    for (const input of ['tomorrow', 'tomorrow !2', 'by friday', 'oct 24']) {
      const r = run(input);
      expect(r.title).toBe(input);
      expect(r.tokens).toEqual([]);
      expect(r.dueDate).toBeNull();
      expect(r.difficulty).toBeNull();
    }
  });

  it('keeps the tags when only the non-tag parts would empty the title', () => {
    const r = run('tomorrow #home');
    expect(r.title).toBe('tomorrow');
    expect(r.tags).toEqual(['home']);
    expect(r.dueDate).toBeNull();
  });

  it('skips dismissed tokens and leaves them in the title', () => {
    const first = run('Pay rent tomorrow #home !2');
    const key = (kind: string) => tokenKey(first.tokens.find((t) => t.kind === kind)!);
    const no = (kind: string) =>
      run('Pay rent tomorrow #home !2', { ignore: new Set([key(kind)]) });
    expect(no('date')).toMatchObject({ title: 'Pay rent tomorrow', dueDate: null, difficulty: 2 });
    expect(no('difficulty')).toMatchObject({ title: 'Pay rent !2', dueDate: '2026-10-21' });
    expect(no('tag')).toMatchObject({ title: 'Pay rent #home', tags: [] });
  });

  it('a dismissed phrase does not fall back to a part of itself', () => {
    const r = run('Gym next friday');
    const ignore = new Set([tokenKey(r.tokens[0])]);
    expect(run('Gym next friday', { ignore })).toMatchObject({
      title: 'Gym next friday',
      dueDate: null,
    });
    const rep = run('Gym every monday', { repeats: true });
    const ignoreRepeat = new Set([tokenKey(rep.tokens[0])]);
    expect(run('Gym every monday', { repeats: true, ignore: ignoreRepeat })).toMatchObject({
      title: 'Gym every monday',
      dueDate: null,
      repeat: null,
    });
  });

  it('exposes positions that slice back to the raw text', () => {
    const text = 'Pay rent by friday #home !2';
    const r = run(text);
    expect(r.tokens.map((t) => text.slice(t.start, t.end))).toEqual(['by friday', '#home', '!2']);
    expect(r.tokens.map((t) => t.raw)).toEqual(['by friday', '#home', '!2']);
  });

  it('parses the full example', () => {
    expect(run('Pay rent tomorrow #home !2')).toMatchObject({
      title: 'Pay rent',
      tags: ['home'],
      dueDate: '2026-10-21',
      difficulty: 2,
    });
  });
});

describe('real-world titles', () => {
  const now = new Date(2026, 9, 20, 10); // Tue 20 Oct 2026
  const parse = (text: string) => parseQuickAdd(text, { now, locale: 'en-GB' });

  it('treats number-only #refs as part of the title, not tags', () => {
    expect(parse('Review PR #123 today')).toMatchObject({
      title: 'Review PR #123',
      tags: [],
      dueDate: '2026-10-20',
    });
    expect(parse('Fix #42 #bug')).toMatchObject({ title: 'Fix #42', tags: ['bug'] });
    expect(parse('Plan #q4 launch').tags).toEqual(['q4']);
  });

  it('consumes a dangling "for" before a date', () => {
    expect(parse('Prep slides for next week')).toMatchObject({
      title: 'Prep slides',
      dueDate: '2026-10-26',
    });
    expect(parse('Buy a gift for mum tomorrow')).toMatchObject({
      title: 'Buy a gift for mum',
      dueDate: '2026-10-21',
    });
  });
});

describe('repeat phrases and the first occurrence', () => {
  it('parseRepeatPhrase reads a whole string that is just a repeat', () => {
    expect(parseRepeatPhrase('daily')).toEqual({ every: 'day' });
    expect(parseRepeatPhrase(' Weekdays ')).toEqual({ every: 'weekday' });
    expect(parseRepeatPhrase('weekly')).toEqual({ every: 'week' });
    expect(parseRepeatPhrase('monthly')).toEqual({ every: 'month' });
    expect(parseRepeatPhrase('every day')).toEqual({ every: 'day' });
    expect(parseRepeatPhrase('Every   Monday')).toEqual({ every: 'week', weekday: 1 });
    expect(parseRepeatPhrase('every sun')).toEqual({ every: 'week', weekday: 0 });
  });

  it('parseRepeatPhrase rejects anything else', () => {
    for (const text of [
      '',
      'every',
      'sometimes',
      'gym every monday',
      'every second day',
      'daily!',
    ]) {
      expect(parseRepeatPhrase(text), text).toBeNull();
    }
  });

  it('the parser dates a dateless repeat exactly as firstOccurrence does, on every weekday', () => {
    const phrases = ['daily', 'weekdays', 'weekly', 'monthly', 'every sunday', 'every friday'];
    for (let d = 19; d <= 25; d++) {
      const now = at(2026, 10, d);
      for (const phrase of phrases) {
        const r = parseQuickAdd(`Thing ${phrase}`, { now, locale: US });
        expect(r.repeat, phrase).not.toBeNull();
        expect(r.dueDate, `${phrase} on ${d}`).toBe(firstOccurrence(r.repeat!, todayISO(now)));
      }
    }
  });
});

describe('start dates', () => {
  it.each([
    ['Renew passport from nov 1', 'Renew passport', '2026-11-01'],
    ['Renew passport starting nov 1', 'Renew passport', '2026-11-01'],
    ['Renew passport start nov 1', 'Renew passport', '2026-11-01'],
    ['Renew passport after nov 1', 'Renew passport', '2026-11-01'],
    ['Renew passport FROM Nov 1', 'Renew passport', '2026-11-01'],
    ['from nov 1 renew passport', 'renew passport', '2026-11-01'],
    ['Plan trip from tomorrow', 'Plan trip', '2026-10-21'],
    ['Plan trip from next monday', 'Plan trip', '2026-10-26'],
    ['Plan trip from next week', 'Plan trip', '2026-10-26'],
    ['Plan trip from in 3 days', 'Plan trip', '2026-10-23'],
    ['Plan trip from 2026-12-01', 'Plan trip', '2026-12-01'],
    ['Plan trip from 24 oct', 'Plan trip', '2026-10-24'],
    ['Plan trip from 24th of october', 'Plan trip', '2026-10-24'],
    ['Plan trip from 12/25', 'Plan trip', '2026-12-25'],
    ['Plan trip from 25.12.2026', 'Plan trip', '2026-12-25'],
    ['Plan trip from oct 24, 2027', 'Plan trip', '2027-10-24'],
    // an ambiguous form counts after these cue words, like after "on" or "by"
    ['Gym from mon', 'Gym', '2026-10-26'],
    ['Gym after fri', 'Gym', '2026-10-23'],
  ])('%s: starts on the date, which leaves the title', (input, title, start) => {
    const r = run(input);
    expect(r).toMatchObject({ title, startDate: start, dueDate: null });
    expect(r.tokens).toHaveLength(1);
    expect(r.tokens[0]).toMatchObject({ kind: 'start' });
  });

  it('labels the chip with the weekday and date', () => {
    expect(run('x from mon oct 26').tokens[0].label).toBe('Starts Mon, Oct 26');
    expect(run('x from nov 1').tokens[0].label).toBe('Starts Sun, Nov 1');
    expect(run('x from nov 1 2027').tokens[0].label).toBe('Starts Mon, Nov 1, 2027');
    expect(run('x from nov 1', { locale: 'en-GB' }).tokens[0].label).toBe('Starts Sun 1 Nov');
  });

  it('records the span of the cue and the date for the token', () => {
    const r = run('Renew passport from nov 1 now');
    expect(r.tokens[0]).toMatchObject({ kind: 'start', raw: 'from nov 1', start: 15, end: 25 });
    expect(r.title).toBe('Renew passport now');
  });

  it('coexists with a due date in either order', () => {
    const a = run('Renew passport from nov 1 by nov 30');
    expect(a).toMatchObject({
      title: 'Renew passport',
      startDate: '2026-11-01',
      dueDate: '2026-11-30',
    });
    expect(a.tokens.map((t) => t.kind)).toEqual(['start', 'date']);
    const b = run('Renew passport due nov 30 starting nov 1');
    expect(b).toMatchObject({
      title: 'Renew passport',
      startDate: '2026-11-01',
      dueDate: '2026-11-30',
    });
    expect(b.tokens.map((t) => t.kind)).toEqual(['date', 'start']);
    const c = run('Renew passport from nov 1 tomorrow #admin !2');
    expect(c).toMatchObject({
      title: 'Renew passport',
      startDate: '2026-11-01',
      dueDate: '2026-10-21',
      tags: ['admin'],
      difficulty: 2,
    });
  });

  it('the last start phrase wins and the earlier one stays in the title', () => {
    const r = run('x from nov 1 from nov 8');
    expect(r.startDate).toBe('2026-11-08');
    expect(r.title).toBe('x from nov 1');
    expect(r.tokens).toHaveLength(1);
  });

  it('dismissing the start chip leaves the phrase in the title and no start date', () => {
    const first = run('Renew from nov 1');
    const r = run('Renew from nov 1', { ignore: new Set([tokenKey(first.tokens[0])]) });
    expect(r).toMatchObject({ title: 'Renew from nov 1', startDate: null, dueDate: null });
    expect(r.tokens).toEqual([]);
  });

  it('dismissing the last one falls back to the one before', () => {
    const first = run('x from nov 1 from nov 8');
    const r = run('x from nov 1 from nov 8', { ignore: new Set([tokenKey(first.tokens[0])]) });
    expect(r.startDate).toBe('2026-11-01');
    expect(r.title).toBe('x from nov 8');
  });

  it('a start date with a repeat: the repeat still sets the first due date', () => {
    const r = run('Gym every monday from oct 30');
    expect(r).toMatchObject({
      title: 'Gym',
      startDate: '2026-10-30',
      dueDate: '2026-10-26',
      repeat: { every: 'week', weekday: 1 },
    });
  });

  it('a start date alone is not a due date, and an input of only that keeps its text', () => {
    expect(run('Taxes from nov 1').dueDate).toBeNull();
    const only = run('from nov 1');
    expect(only).toMatchObject({ title: 'from nov 1', startDate: null, dueDate: null });
    expect(only.tokens).toEqual([]);
  });

  it('a tag does not stop the date after the cue being found', () => {
    const r = run('Taxes #money from nov 1');
    expect(r).toMatchObject({ title: 'Taxes', tags: ['money'], startDate: '2026-11-01' });
  });

  describe('no false positives', () => {
    it.each([
      'from home',
      'Work from home tomorrow',
      'from 5 to 6',
      'Open 9 from 5 to 6',
      'start the car',
      'Start fresh',
      'starting point',
      'after lunch',
      'Call after work',
      'Gift from mum',
      'Learn from mistakes',
      'Email from John',
      'Read the start of chapter 3',
      'after 3 weeks',
      'from 10 apples',
      'from may',
      'start in time',
      'Buy 1/2 cup after',
    ])('%s stays in the title', (input) => {
      const r = run(input);
      expect(r.startDate).toBeNull();
      expect(r.tokens.filter((t) => t.kind === 'start')).toEqual([]);
      if (!/tomorrow/.test(input)) expect(r.title).toBe(input);
    });

    it('a due phrase after a plain "from" word is just a due date', () => {
      const r = run('Work from home tomorrow');
      expect(r).toMatchObject({ title: 'Work from home', dueDate: '2026-10-21', startDate: null });
    });

    it('an impossible date after the cue matches nothing', () => {
      expect(run('x from feb 30')).toMatchObject({ title: 'x from feb 30', startDate: null });
      expect(run('x from 31/02')).toMatchObject({ startDate: null });
    });

    it('a cue separated from the date by punctuation does not count', () => {
      expect(run('x from, nov 1')).toMatchObject({ startDate: null, dueDate: '2026-11-01' });
    });
  });
});
