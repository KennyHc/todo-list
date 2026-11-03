import { describe, expect, it } from 'vitest';
import { TASK_COLORS } from './colors';
import { normalizeTag, normalizeTags, parseQuickAdd, TAG_TOKEN, tagColor } from './tags';

describe('normalizeTag', () => {
  it('trims, lowercases and strips leading #', () => {
    expect(normalizeTag('  #Home ')).toBe('home');
    expect(normalizeTag('##Deep')).toBe('deep');
    expect(normalizeTag('a#b')).toBe('a#b');
  });

  it('caps at 24 chars and yields empty for blanks', () => {
    expect(normalizeTag('x'.repeat(40))).toBe('x'.repeat(24));
    expect(normalizeTag('   ')).toBe('');
    expect(normalizeTag('#')).toBe('');
  });
});

describe('normalizeTags', () => {
  it('dedupes after normalizing, drops empties, keeps first-seen order', () => {
    expect(normalizeTags(['B', '#a', 'b', '', ' ', 'A', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('dedupes tags that collide after truncation', () => {
    expect(normalizeTags(['x'.repeat(30), 'x'.repeat(24)])).toEqual(['x'.repeat(24)]);
  });
});

describe('parseQuickAdd', () => {
  it('extracts tags and strips them from the title', () => {
    expect(parseQuickAdd('Pay rent #home #money')).toEqual({
      title: 'Pay rent',
      tags: ['home', 'money'],
    });
  });

  it('handles tags in the middle and collapses whitespace', () => {
    expect(parseQuickAdd('  Buy   #Food  milk  ')).toEqual({ title: 'Buy milk', tags: ['food'] });
  });

  it('dedupes and lowercases', () => {
    expect(parseQuickAdd('x #A #a #b')).toEqual({ title: 'x', tags: ['a', 'b'] });
  });

  it('supports - and _ and digits, but a number-only token stays in the title', () => {
    expect(parseQuickAdd('go #side-project #q3_goals #2026')).toEqual({
      title: 'go #2026',
      tags: ['side-project', 'q3_goals'],
    });
  });

  it('leaves non-tag hashes alone', () => {
    expect(parseQuickAdd('Learn C# today')).toEqual({ title: 'Learn C# today', tags: [] });
    expect(parseQuickAdd('call # now')).toEqual({ title: 'call # now', tags: [] });
    expect(parseQuickAdd('a#b')).toEqual({ title: 'a#b', tags: [] });
    expect(parseQuickAdd('wow #hi!')).toEqual({ title: 'wow #hi!', tags: [] });
  });

  it('handles tag-only and empty input', () => {
    expect(parseQuickAdd('#only')).toEqual({ title: '', tags: ['only'] });
    expect(parseQuickAdd('')).toEqual({ title: '', tags: [] });
    expect(parseQuickAdd('   ')).toEqual({ title: '', tags: [] });
  });

  it('truncates long tags', () => {
    expect(parseQuickAdd(`t #${'z'.repeat(30)}`).tags).toEqual(['z'.repeat(24)]);
  });
});

describe('tagColor', () => {
  it('is stable and comes from the palette', () => {
    const hexes: string[] = TASK_COLORS.map((c) => c.hex);
    for (const tag of ['home', 'work', 'money', 'x', '']) {
      expect(tagColor(tag)).toBe(tagColor(tag));
      expect(hexes).toContain(tagColor(tag));
    }
  });

  it('spreads different tags over several colors', () => {
    const colors = new Set(['a', 'b', 'c', 'd', 'e', 'home', 'work', 'money'].map(tagColor));
    expect(colors.size).toBeGreaterThan(2);
  });
});

describe('TAG_TOKEN', () => {
  it('requires at least one letter so issue numbers are not tags', () => {
    const found = (text: string) => [...text.matchAll(TAG_TOKEN)].map((m) => m[2]);
    expect(found('PR #123 #2fa #q4 #_x #-1')).toEqual(['2fa', 'q4', '_x']);
  });
});
