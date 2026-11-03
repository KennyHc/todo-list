/** Links in task titles: shown as a chip in the row, while the stored title keeps the full URL. */

const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;
const PUNCTUATION = '.,;:!?\'"\u2019\u201d\u2026';
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

const count = (text: string, ch: string) => text.split(ch).length - 1;

/** A URL without the punctuation that follows it in prose; a `)` stays if the URL opened one. */
function trimUrl(raw: string): string {
  let url = raw;
  while (url.length > 0) {
    const last = url[url.length - 1];
    const open = PAIRS[last];
    if (PUNCTUATION.includes(last) || (open !== undefined && count(url, last) > count(url, open))) {
      url = url.slice(0, -1);
    } else break;
  }
  return url;
}

const isLink = (url: string): boolean => {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === 'http:' || protocol === 'https:') && hostname !== '';
  } catch {
    return false;
  }
};

/**
 * Splits a title into its text (links removed, spacing tidied) and its http(s) links in order.
 * Trailing punctuation is not part of a link ("see https://a.com." links to https://a.com).
 */
export function splitTitleLinks(title: string): { text: string; links: string[] } {
  const links: string[] = [];
  const removed = title.replace(URL_PATTERN, (raw) => {
    const url = trimUrl(raw);
    if (!isLink(url)) return raw;
    links.push(url);
    return raw.slice(url.length);
  });
  if (links.length === 0) return { text: title, links };
  const text = removed
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+([.,;:!?)\]])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, links };
}

/**
 * A note's lines, each split like a title: its text with links removed, and its links in order.
 * Line breaks are kept, since notes are multi-line; a blank line is `{ text: '', links: [] }`.
 */
export function splitNoteLinks(notes: string): { text: string; links: string[] }[] {
  return notes.split(/\r?\n/).map((line) => {
    const { text, links } = splitTitleLinks(line);
    return { text, links: [...new Set(links)] };
  });
}

/** "github.com": the host without a leading www. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}
