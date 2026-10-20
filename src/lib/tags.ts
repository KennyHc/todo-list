import { MAX_TAGS } from '../types';
import { TASK_COLORS } from './colors';

export const MAX_TAG_LENGTH = 24;

/** Trimmed, lowercased, without leading '#', capped at MAX_TAG_LENGTH. May return ''. */
export const normalizeTag = (s: string): string =>
  s.trim().replace(/^#+/, '').trim().toLowerCase().slice(0, MAX_TAG_LENGTH);

/** Normalizes each tag, drops empties and duplicates (first occurrence wins), keeps at most MAX_TAGS. */
export function normalizeTags(list: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of list) {
    const tag = normalizeTag(raw);
    if (tag) seen.add(tag);
    if (seen.size === MAX_TAGS) break;
  }
  return [...seen];
}

// A '#tag' counts only at a word start, so 'C#' or 'a#b' stay in the title.
// A tag needs at least one letter: `#123` is almost always an issue or ticket reference, not a tag.
export const TAG_TOKEN = /(^|\s)#(?=[\p{N}_-]*\p{L})([\p{L}\p{N}_-]+)(?=\s|$)/gu;

/** Pulls `#tag` tokens out of text. Tags only; the composer uses the fuller parser in lib/quickAdd. */
export function parseQuickAdd(input: string): { title: string; tags: string[] } {
  const found: string[] = [];
  const stripped = input.replace(TAG_TOKEN, (_match, lead: string, tag: string) => {
    found.push(tag);
    return lead;
  });
  return { title: stripped.replace(/\s+/g, ' ').trim(), tags: normalizeTags(found) };
}

/** A stable pastel for a tag, picked by string hash from the task palette. */
export function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TASK_COLORS[hash % TASK_COLORS.length].hex;
}
