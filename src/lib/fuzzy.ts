export type FuzzyMatch = {
  /** Higher is better. Comparable across texts for the same query. */
  score: number;
  /** Indices into the text of the matched characters, ascending. */
  indices: number[];
};

const TIER_SUBSTRING = 3000;
const TIER_WORD_START = 2000;
const TIER_SUBSEQUENCE = 1000;
/** Queries shorter than this skip the subsequence tier: scattered letters are mostly noise. */
const MIN_SUBSEQUENCE_QUERY = 4;

const isWordStart = (text: string, i: number) => i === 0 || /[^\p{L}\p{N}]/u.test(text[i - 1]);

const range = (start: number, length: number) => Array.from({ length }, (_, i) => start + i);

/** Query characters matched at the start of successive words ("bm" -> "Buy milk"). */
function wordStartMatch(q: string, t: string): number[] | null {
  const indices: number[] = [];
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (!isWordStart(t, i) || t[i] !== q[qi]) continue;
    let j = 0;
    while (qi + j < q.length && i + j < t.length && t[i + j] === q[qi + j]) {
      indices.push(i + j);
      j += 1;
    }
    qi += j;
    i += j - 1;
  }
  return qi === q.length ? indices : null;
}

function subsequenceMatch(q: string, t: string): number[] | null {
  const indices: number[] = [];
  let from = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at === -1) return null;
    indices.push(at);
    from = at + 1;
  }
  return indices;
}

/**
 * A small, forgiving matcher for titles. Case-insensitive, whitespace in the query is ignored
 * for the word-start and subsequence tiers. A contiguous substring beats a word-start match
 * (each query chunk starting a word), which beats a plain subsequence. Queries under 4
 * characters (ignoring whitespace) never fall back to a subsequence. Within a tier, earlier and
 * tighter matches, and shorter texts, win. An empty query matches everything with score 0.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (q === '') return { score: 0, indices: [] };
  const t = text.toLowerCase();
  const shortness = Math.max(0, 100 - t.length);

  const at = t.indexOf(q);
  if (at !== -1) {
    // Prefer the occurrence that starts a word, when the first one doesn't.
    let best = at;
    for (let i = at; i !== -1 && !isWordStart(t, best); i = t.indexOf(q, i + 1)) {
      if (isWordStart(t, i)) best = i;
    }
    const bonus = best === 0 ? 400 : isWordStart(t, best) ? 200 : 0;
    return {
      score: TIER_SUBSTRING + bonus + shortness - Math.min(best, 100),
      indices: range(best, q.length),
    };
  }

  const compact = q.replace(/\s+/g, '');
  const words = wordStartMatch(compact, t);
  if (words) {
    return { score: TIER_WORD_START + shortness - words[0], indices: words };
  }

  if (compact.length < MIN_SUBSEQUENCE_QUERY) return null;
  const sub = subsequenceMatch(compact, t);
  if (sub) {
    let adjacent = 0;
    for (let i = 1; i < sub.length; i++) if (sub[i] === sub[i - 1] + 1) adjacent += 1;
    const span = sub[sub.length - 1] - sub[0];
    return {
      score: TIER_SUBSEQUENCE + adjacent * 20 + shortness - Math.min(span, 100) - sub[0],
      indices: sub,
    };
  }
  return null;
}
