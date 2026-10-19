import { DEFAULT_COLOR, TASK_COLORS, normalizeTagColors, normalizeTaskColor } from './colors';

describe('colors', () => {
  it('should have 8 task colors', () => {
    expect(TASK_COLORS).toHaveLength(8);
  });
});

describe('normalizeTaskColor', () => {
  it('maps the old default blue (any case) to null, and keeps other colours', () => {
    expect(normalizeTaskColor(DEFAULT_COLOR)).toBeNull();
    expect(normalizeTaskColor('#a9c6f5')).toBeNull();
    expect(normalizeTaskColor('#C9B8F2')).toBe('#C9B8F2');
  });

  it('is idempotent and treats anything that is not a hex colour as automatic', () => {
    for (const v of [DEFAULT_COLOR, '#C9B8F2', null, undefined, 'none', 5, '']) {
      const once = normalizeTaskColor(v);
      expect(normalizeTaskColor(once)).toBe(once);
    }
    expect(normalizeTaskColor('none')).toBeNull();
    expect(normalizeTaskColor(undefined)).toBeNull();
  });
});

describe('normalizeTagColors', () => {
  it('keeps hex values, drops junk and reserved keys, and allows the default blue', () => {
    expect(
      normalizeTagColors({ work: '#C9B8F2', blue: DEFAULT_COLOR, bad: 'red', n: 3, __x__: '#fff' }),
    ).toEqual({ work: '#C9B8F2', blue: DEFAULT_COLOR });
    expect(normalizeTagColors(undefined)).toEqual({});
    expect(normalizeTagColors([])).toEqual({});
  });
});
