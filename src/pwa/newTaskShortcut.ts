/**
 * Ways into the composer from outside the app, all through the URL:
 * - `/?new=1`, the manifest shortcut "New task": focus the composer.
 * - `/?add=Pay%20rent%20tomorrow%20%23home`: prefill the composer with that text (parsed live
 *   by quick add, so the chips show). Never creates a task: the user confirms with Enter, so a
 *   crafted link can't add tasks on its own.
 * - The Web Share Target (Android PWA) opens `/?title=...&text=...&url=...`; those are folded
 *   into the same prefill.
 * Params are stripped from the address bar once read. A signed-out visitor's text waits in
 * sessionStorage and is applied after sign-in.
 */

const PENDING_KEY = 'tasks-pending-add';
/** More than a task title can hold anyway; keeps a hostile link from stuffing the field. */
const MAX_TEXT = 1000;
const TEXT_PARAMS = ['add', 'text', 'title', 'url'] as const;

export type LaunchParams = {
  /** The `?new=1` shortcut was used. */
  newTask: boolean;
  /** Text to prefill the composer with, or null. */
  text: string | null;
};

const tidy = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim();

/** The composer text a query string asks for, or null. `add` wins; otherwise title/text, then url. */
export function sharedText(params: URLSearchParams): string | null {
  const add = tidy(params.get('add'));
  let text = add;
  if (text === '') {
    const pieces = [tidy(params.get('title')), tidy(params.get('text'))].filter((p) => p !== '');
    // A share often repeats itself (the text contains the title): keep the longer one.
    const kept = pieces.filter(
      (piece, i) =>
        !pieces.some((other, j) => j !== i && other.includes(piece) && (other !== piece || j < i)),
    );
    text = kept.join(' ');
  }
  const url = tidy(params.get('url'));
  if (url !== '' && !text.includes(url)) text = text === '' ? url : `${text} ${url}`;
  return text === '' ? null : text.slice(0, MAX_TEXT);
}

const readPending = (): string | null => {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
};

const writePending = (text: string | null): void => {
  try {
    if (text === null) sessionStorage.removeItem(PENDING_KEY);
    else sessionStorage.setItem(PENDING_KEY, text);
  } catch {
    /* storage unavailable: the text still reaches a signed-in composer directly */
  }
};

/**
 * Moves text out of the URL into sessionStorage (and cleans the address bar), so it survives a
 * sign-in. Call once at startup. `?new=1` is left in the URL for the composer to handle.
 */
export function capturePendingText(): void {
  const url = new URL(window.location.href);
  if (!TEXT_PARAMS.some((name) => url.searchParams.has(name))) return;
  const text = sharedText(url.searchParams);
  for (const name of TEXT_PARAMS) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  if (text !== null) writePending(text);
}

/**
 * Reads what the URL and the pending slot ask of the composer, and clears both: `?new=1` and
 * the text params leave the address bar, and the pending text is used up.
 */
export function consumeLaunchParams(): LaunchParams {
  capturePendingText();
  const url = new URL(window.location.href);
  const newTask = url.searchParams.has('new');
  if (newTask) {
    url.searchParams.delete('new');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
  const text = readPending();
  writePending(null);
  return { newTask, text };
}
