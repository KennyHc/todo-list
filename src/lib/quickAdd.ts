import { addDays, daysBetween } from './dates';
import { normalizeTags, TAG_TOKEN } from './tags';
import { todayISO } from './views';

/**
 * Natural-language quick add. `parseQuickAdd` pulls tags, a due date, a difficulty and a repeat
 * out of one line of text and reports each recognised piece as a token with its position, so the
 * composer can show it as a chip and let the user dismiss it.
 *
 * Rules (all matching is case-insensitive, on whole words, in local time):
 * - Tags: `#tag` at a word start (see lib/tags). `C#` and `a#b` stay in the title.
 * - Difficulty: `!1`..`!5` as a whole word. The last one wins.
 * - Ambiguous forms (3-letter weekdays, numeric dates without a year, and dot-separated ones
 *   without a year) count only after a cue word (on, by, due, next, this, until, before) or as the
 *   last word of the input (not for dotted numerics, which need a cue or a year).
 * - Dates: today, tonight, tomorrow, tmr, tmrw; weekday names (full or 3-letter, plus
 *   thur/thurs/tues/weds): the next occurrence, where the same weekday as today means TODAY;
 *   `next <weekday>`: that weekday in the FOLLOWING Monday-to-Sunday week (so on Tue 20 Oct,
 *   "friday" is 23 Oct and "next friday" is 30 Oct; "next monday" is 26 Oct; on Sat 24 Oct,
 *   "next friday" is 30 Oct); `next week`: next Monday (a week ahead when today is Monday);
 *   `next month`: the 1st of next month; `this weekend` / `weekend`: the coming Saturday (today
 *   on Saturday or Sunday); `in N days|weeks|months` (N 1..365, month ends clamp) and
 *   `in a day|week|month`; month names next to a day (`oct 24`, `24 oct`, `october 24th`,
 *   `24th of october`, optional 4-digit year, `oct 24, 2027`), which without a year mean the next
 *   occurrence on or after today; ISO `2026-10-24`; numeric `24/10`, `10/24`, `24.10`,
 *   `24/10/2026` (day-first or month-first per locale, falling back to the other order when
 *   only that one is a real date). Impossible dates match nothing. With several date phrases the
 *   LAST one wins and the others stay in the title. `on`, `by`, `due`, `due on`, `due by`
 *   directly before a date are consumed with it.
 * - Repeat: every day, daily, every weekday, weekdays, every week, weekly, every <weekday>,
 *   every month, monthly. Without an explicit date the due date is the first occurrence.
 * - Title: the text minus the tokens, whitespace collapsed and stray punctuation tidied. It is
 *   never empty because of parsing: if the title would be empty, the non-tag tokens are left in
 *   the text instead (a tag-only input still gives an empty title, as before).
 */

export type QuickRepeat = {
  every: 'day' | 'weekday' | 'week' | 'month';
  weekday?: number /* 0=Sun..6 */;
};
export type QuickToken = {
  kind: 'tag' | 'date' | 'difficulty' | 'repeat';
  start: number;
  end: number;
  raw: string;
  label: string;
};
export type QuickAdd = {
  title: string;
  tags: string[];
  dueDate: string | null;
  difficulty: 1 | 2 | 3 | 4 | 5 | null;
  repeat: QuickRepeat | null;
  tokens: QuickToken[];
};
export type QuickAddOptions = {
  now?: Date;
  locale?: string;
  /** Token keys (`${start}:${raw}`) the user dismissed. */
  ignore?: ReadonlySet<string>;
  /** Recognise repeats. When false the repeat words stay in the title untouched. */
  repeats?: boolean;
};

/** Flip once the store can keep a repeat; until then the composer neither shows nor consumes it. */
export const SUPPORTS_REPEAT = false;

export const tokenKey = (t: Pick<QuickToken, 'start' | 'raw'>): string => `${t.start}:${t.raw}`;

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTHS: Record<string, number> = {};
[
  ['jan', 'january'],
  ['feb', 'february'],
  ['mar', 'march'],
  ['apr', 'april'],
  ['may', 'may'],
  ['jun', 'june'],
  ['jul', 'july'],
  ['aug', 'august'],
  ['sep', 'september'],
  ['oct', 'october'],
  ['nov', 'november'],
  ['dec', 'december'],
].forEach(([short, long], i) => {
  MONTHS[short] = i + 1;
  MONTHS[long] = i + 1;
});
MONTHS.sept = 9;

const DAY = /^(\d{1,2})(?:st|nd|rd|th)?$/;
const YEAR = /^\d{4}$/;
const DIFFICULTY = /^\(*!([1-5])[,.;:)]*$/;
// Consumed together with a date that follows them ("for next week" → just the date).
const LEAD_WORDS = new Set(['on', 'by', 'due', 'for']);

type Word = {
  start: number;
  /** Lowercased text without leading '(' and trailing punctuation. */
  core: string;
  /** Offset of `core` in the original text. */
  coreStart: number;
  end: number;
  trail: string;
};

function splitWords(text: string): Word[] {
  const words: Word[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const parts = /^(\(*)(.*?)([,.;:!?)]*)$/s.exec(m[0]);
    const [, lead, core, trail] = parts ?? ['', '', m[0], ''];
    const coreStart = m.index + lead.length;
    words.push({
      start: m.index,
      core: core.toLowerCase(),
      coreStart,
      end: coreStart + core.length,
      trail,
    });
  }
  return words;
}

const iso = (d: Date): string => todayISO(d);

/** 'YYYY-MM-DD' for a real calendar date, else null. */
function validISO(y: number, m: number, d: number): string | null {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return iso(dt);
}

const dayFirstFor = (locale: string | undefined): boolean => {
  try {
    const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(2000, 10, 22));
    return parts.findIndex((p) => p.type === 'day') < parts.findIndex((p) => p.type === 'month');
  } catch {
    return false;
  }
};

function dateLabel(date: string, today: string, locale: string | undefined): string {
  const days = daysBetween(today, date);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (days >= 2 && days <= 6) return WEEKDAY_NAMES[dt.getDay()];
  const sameYear = y === Number(today.slice(0, 4));
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(dt);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(dt);
  }
}

function repeatLabel(r: QuickRepeat): string {
  if (r.weekday !== undefined) return `Every ${WEEKDAY_NAMES[r.weekday]}`;
  return { day: 'Daily', weekday: 'Every weekday', week: 'Weekly', month: 'Monthly' }[r.every];
}

export function parseQuickAdd(text: string, opts: QuickAddOptions = {}): QuickAdd {
  const now = opts.now ?? new Date();
  const ignore = opts.ignore ?? new Set<string>();
  const today = todayISO(now);
  const dow = now.getDay();
  const dayFirst = dayFirstFor(opts.locale);
  const words = splitWords(text);
  const W = words.length;

  // --- Date arithmetic relative to `now` ---
  const plainWeekday = (w: number) => addDays(today, (w - dow + 7) % 7);
  const nextMonday = () => addDays(today, 7 - ((dow + 6) % 7));
  const nextWeekday = (w: number) => addDays(nextMonday(), (w + 6) % 7);
  const weekend = () => (dow === 6 || dow === 0 ? today : addDays(today, 6 - dow));
  const nextMonth = () => iso(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const addMonths = (n: number) => {
    const first = new Date(now.getFullYear(), now.getMonth() + n, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return iso(new Date(first.getFullYear(), first.getMonth(), Math.min(now.getDate(), last)));
  };
  /** Next date on or after today with this month/day (skips years where it doesn't exist). */
  const nextOccurrence = (m: number, d: number): string | null => {
    for (let y = now.getFullYear(); y <= now.getFullYear() + 8; y++) {
      const found = validISO(y, m, d);
      if (found && found >= today) return found;
    }
    return null;
  };
  const monthDay = (m: number, d: number, y?: number) =>
    y === undefined ? nextOccurrence(m, d) : validISO(y, m, d);

  // --- Repeats (scanned first, so their words are not read as dates) ---
  const masked: boolean[] = new Array(W).fill(false);
  type Found = { i: number; n: number };
  const repeatFound: (Found & { repeat: QuickRepeat })[] = [];
  const seqOk = (i: number, n: number, allowComma = false) => {
    if (i + n > W) return false;
    for (let k = 0; k < n; k++) if (masked[i + k]) return false;
    for (let k = 0; k < n - 1; k++) {
      const t = words[i + k].trail;
      if (t !== '' && !(allowComma && t === ',')) return false;
    }
    return true;
  };

  for (let i = 0; i < W; i++) {
    const c0 = words[i].core;
    let hit: { n: number; repeat: QuickRepeat } | null = null;
    if (c0 === 'daily') hit = { n: 1, repeat: { every: 'day' } };
    else if (c0 === 'weekdays') hit = { n: 1, repeat: { every: 'weekday' } };
    else if (c0 === 'weekly') hit = { n: 1, repeat: { every: 'week' } };
    else if (c0 === 'monthly') hit = { n: 1, repeat: { every: 'month' } };
    else if (c0 === 'every' && seqOk(i, 2)) {
      const c1 = words[i + 1].core;
      if (c1 === 'day') hit = { n: 2, repeat: { every: 'day' } };
      else if (c1 === 'weekday') hit = { n: 2, repeat: { every: 'weekday' } };
      else if (c1 === 'week') hit = { n: 2, repeat: { every: 'week' } };
      else if (c1 === 'month') hit = { n: 2, repeat: { every: 'month' } };
      else if (c1 in WEEKDAYS) hit = { n: 2, repeat: { every: 'week', weekday: WEEKDAYS[c1] } };
    }
    if (hit) {
      repeatFound.push({ i, ...hit });
      for (let k = 0; k < hit.n; k++) masked[i + k] = true;
    }
  }

  const tokens: QuickToken[] = [];
  const rangeOf = (i: number, n: number) => ({
    start: words[i].coreStart,
    end: words[i + n - 1].end,
  });
  const push = (kind: QuickToken['kind'], start: number, end: number, label: string) => {
    const token = { kind, start, end, raw: text.slice(start, end), label };
    if (ignore.has(tokenKey(token))) return false;
    tokens.push(token);
    return true;
  };

  // The last repeat that isn't dismissed wins; every repeat phrase keeps its words out of dates.
  let repeat: QuickRepeat | null = null;
  if (opts.repeats !== false) {
    for (let k = repeatFound.length - 1; k >= 0 && !repeat; k--) {
      const f = repeatFound[k];
      const { start, end } = rangeOf(f.i, f.n);
      if (push('repeat', start, end, repeatLabel(f.repeat))) repeat = f.repeat;
    }
  }

  // --- Dates ---
  // Ambiguous forms (3-letter weekdays, yearless numerics) need a cue word before them or must
  // end the input (ignoring trailing #tags and !N), so "Wed planning doc" or "1/2 cup" stay text.
  const CUES = new Set(['on', 'by', 'due', 'next', 'this', 'until', 'before']);
  const hasCue = (i: number) =>
    i > 0 && !masked[i - 1] && words[i - 1].trail === '' && CUES.has(words[i - 1].core);
  const endsInput = (i: number) => {
    for (let j = i + 1; j < W; j++) {
      const raw = text.slice(words[j].start, words[j].end + words[j].trail.length);
      if (!raw.startsWith('#') && !DIFFICULTY.test(raw)) return false;
    }
    return true;
  };
  const matchDateAt = (i: number): { n: number; date: string } | null => {
    const c = (k: number) => words[i + k].core;
    const c0 = c(0);

    if (c0 === 'next' && seqOk(i, 2)) {
      const c1 = c(1);
      if (c1 === 'week') return { n: 2, date: nextMonday() };
      if (c1 === 'month') return { n: 2, date: nextMonth() };
      if (c1 in WEEKDAYS) return { n: 2, date: nextWeekday(WEEKDAYS[c1]) };
    }
    if (c0 === 'this' && seqOk(i, 2)) {
      if (c(1) === 'weekend') return { n: 2, date: weekend() };
      if (c(1) in WEEKDAYS) return { n: 2, date: plainWeekday(WEEKDAYS[c(1)]) };
    }

    if (c0 === 'in' && seqOk(i, 3)) {
      const amount = c(1) === 'a' ? 1 : /^\d{1,3}$/.test(c(1)) ? Number(c(1)) : 0;
      const unit = /^(day|week|month)s?$/.exec(c(2))?.[1];
      if (unit && amount >= 1 && amount <= 365) {
        if (unit === 'month') return { n: 3, date: addMonths(amount) };
        return { n: 3, date: addDays(today, amount * (unit === 'week' ? 7 : 1)) };
      }
    }

    // "oct 24", "october 24th", "oct 24 2027", "oct 24, 2027"
    const month0 = MONTHS[c0];
    if (month0 !== undefined && seqOk(i, 2)) {
      const day = DAY.exec(c(1));
      if (day) {
        if (seqOk(i, 3, true) && YEAR.test(c(2))) {
          const date = monthDay(month0, Number(day[1]), Number(c(2)));
          return date ? { n: 3, date } : null;
        }
        const date = monthDay(month0, Number(day[1]));
        if (date) return { n: 2, date };
      }
    }

    // "24 oct", "24th of october", "24 oct 2027"
    const day0 = DAY.exec(c0);
    if (day0) {
      const k = i + 1 < W && c(1) === 'of' && seqOk(i, 2) ? 2 : 1;
      const month = i + k < W && seqOk(i, k + 1) ? MONTHS[c(k)] : undefined;
      if (month !== undefined) {
        if (i + k + 1 < W && seqOk(i, k + 2) && YEAR.test(c(k + 1))) {
          const date = monthDay(month, Number(day0[1]), Number(c(k + 1)));
          return date ? { n: k + 2, date } : null;
        }
        const date = monthDay(month, Number(day0[1]));
        if (date) return { n: k + 1, date };
      }
    }

    if (masked[i]) return null;
    if (c0 === 'today' || c0 === 'tonight') return { n: 1, date: today };
    if (c0 === 'tomorrow' || c0 === 'tmr' || c0 === 'tmrw')
      return { n: 1, date: addDays(today, 1) };
    if (c0 === 'weekend') return { n: 1, date: weekend() };
    if (c0 in WEEKDAYS) {
      const full = c0.length > 4 && c0.endsWith('day');
      if (full || hasCue(i) || endsInput(i)) return { n: 1, date: plainWeekday(WEEKDAYS[c0]) };
      return null;
    }

    const isoParts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(c0);
    if (isoParts) {
      const date = validISO(Number(isoParts[1]), Number(isoParts[2]), Number(isoParts[3]));
      return date ? { n: 1, date } : null;
    }

    const num = /^(\d{1,2})([/.])(\d{1,2})(?:\2(\d{2}|\d{4}))?$/.exec(c0);
    if (num) {
      const hasYear = num[4] !== undefined;
      if (!hasYear && !(hasCue(i) || (num[2] === '/' && endsInput(i)))) return null;
      const a = Number(num[1]);
      const b = Number(num[3]);
      const year =
        num[4] === undefined ? undefined : Number(num[4]) + (num[4].length === 2 ? 2000 : 0);
      const [first, second] = dayFirst
        ? [
            [b, a],
            [a, b],
          ]
        : [
            [a, b],
            [b, a],
          ];
      // [month, day] in the locale's order first, then the other way round.
      const date = monthDay(first[0], first[1], year) ?? monthDay(second[0], second[1], year);
      return date ? { n: 1, date } : null;
    }
    return null;
  };

  type DateHit = { start: number; end: number; date: string };
  const dateHits: DateHit[] = [];
  let free = 0;
  for (let i = 0; i < W;) {
    if (masked[i]) {
      i++;
      continue;
    }
    const m = matchDateAt(i);
    if (!m) {
      i++;
      continue;
    }
    let first = i;
    const prev = (k: number) => (i - k >= free && !masked[i - k] ? words[i - k] : undefined);
    const p1 = prev(1);
    if (p1 && LEAD_WORDS.has(p1.core) && p1.trail === '') {
      first = i - 1;
      const p2 = prev(2);
      if (p1.core !== 'due' && p2 && p2.core === 'due' && p2.trail === '') first = i - 2;
    }
    dateHits.push({ start: words[first].coreStart, end: words[i + m.n - 1].end, date: m.date });
    i += m.n;
    free = i;
  }
  let dueDate: string | null = null;
  let dateTokenAdded = false;
  for (let k = dateHits.length - 1; k >= 0 && !dateTokenAdded; k--) {
    const h = dateHits[k];
    dateTokenAdded = push('date', h.start, h.end, dateLabel(h.date, today, opts.locale));
    if (dateTokenAdded) dueDate = h.date;
  }

  // --- Difficulty (last non-dismissed wins) ---
  let difficulty: QuickAdd['difficulty'] = null;
  for (let k = W - 1; k >= 0 && difficulty === null; k--) {
    const w = words[k];
    const raw = text.slice(w.start, w.end + w.trail.length);
    const m = DIFFICULTY.exec(raw);
    if (!m) continue;
    const start = w.start + raw.indexOf('!');
    if (push('difficulty', start, start + 2, `Difficulty ${m[1]}`)) {
      difficulty = Number(m[1]) as 1 | 2 | 3 | 4 | 5;
    }
  }

  // --- Tags (same word-start rule as lib/tags) ---
  const found: string[] = [];
  for (const m of text.matchAll(TAG_TOKEN)) {
    const start = m.index + m[1].length;
    const end = m.index + m[0].length;
    if (ignore.has(`${start}:${text.slice(start, end)}`)) continue;
    found.push(m[2]);
    tokens.push({
      kind: 'tag',
      start,
      end,
      raw: text.slice(start, end),
      label: `#${m[2].toLowerCase()}`,
    });
  }
  const tags = normalizeTags(found);

  if (repeat && !dateTokenAdded) {
    if (repeat.weekday !== undefined) dueDate = plainWeekday(repeat.weekday);
    else if (repeat.every === 'weekday') dueDate = dow >= 1 && dow <= 5 ? today : plainWeekday(1);
    else dueDate = today;
  }

  tokens.sort((a, b) => a.start - b.start);
  const title = buildTitle(text, tokens);
  if (title === '' && tokens.some((t) => t.kind !== 'tag')) {
    // Everything but tags was consumed: keep that text as the title instead.
    const tagTokens = tokens.filter((t) => t.kind === 'tag');
    return {
      title: buildTitle(text, tagTokens),
      tags,
      dueDate: null,
      difficulty: null,
      repeat: null,
      tokens: tagTokens,
    };
  }
  return { title, tags, dueDate, difficulty, repeat, tokens };
}

function buildTitle(text: string, tokens: readonly QuickToken[]): string {
  let out = '';
  let at = 0;
  for (const t of tokens) {
    out += `${text.slice(at, t.start)} `;
    at = t.end;
  }
  out += text.slice(at);
  let title = out.replace(/\s+/g, ' ').trim();
  if (tokens.length > 0) {
    title = title
      .replace(/\(\s*\)/g, '')
      .replace(/\s+([,;:.])/g, '$1')
      .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '');
  }
  return title;
}
