export const TASK_COLORS = [
  { name: 'Blue', hex: '#A9C6F5' },
  { name: 'Lavender', hex: '#C9B8F2' },
  { name: 'Mint', hex: '#B5E5CF' },
  { name: 'Peach', hex: '#FFD3B6' },
  { name: 'Pink', hex: '#F7C6D9' },
  { name: 'Butter', hex: '#FBE7A1' },
  { name: 'Sage', hex: '#CFE3C1' },
  { name: 'Sky', hex: '#BDE6F2' },
] as const;

/** The colour every task used to get; before the tag-colour redesign it meant "unset". */
export const DEFAULT_COLOR = '#A9C6F5';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isHexColor = (value: string) => HEX.test(value);

/**
 * Reads a stored task colour. The legacy default blue (and anything that is not a hex colour)
 * means "automatic", i.e. null. Idempotent.
 */
export function normalizeTaskColor(value: unknown): string | null {
  if (typeof value !== 'string' || !HEX.test(value)) return null;
  return value.toLowerCase() === DEFAULT_COLOR.toLowerCase() ? null : value;
}

/** Tag name that Firestore would reject as a map key (`__x__`), or one that would pollute objects. */
const isUnsafeKey = (key: string) => /^__.*__$/.test(key);

/** Cleans a tag to colour map: normalized keys, hex values only. Returns a fresh object. */
export function normalizeTagColors(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const [tag, color] of Object.entries(value)) {
    if (tag === '' || isUnsafeKey(tag) || typeof color !== 'string' || !HEX.test(color)) continue;
    out[tag] = color;
  }
  return out;
}

export const isSafeTagKey = (tag: string) => tag !== '' && !isUnsafeKey(tag);
