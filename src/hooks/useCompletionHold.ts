import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { popDelays as planPops, strikeHoldMs } from '../lib/cascade';
import { useTaskStore } from '../store/tasks';

/** A reduced-motion completion only waits long enough to see the check. */
export const REDUCED_HOLD_MS = 150;

/**
 * Seconds after a completed row is removed that it starts popping (see lib/cascade popDelays).
 * Read by the row's exit animation, which runs after the row has left the list.
 */
export const popDelays = new Map<string, number>();

type Options = {
  /** Extra keys to keep with a held row, e.g. the section header it sits under. */
  holdWith?: (previous: string[], id: string) => string[];
};

/**
 * Done tasks are filed in History and drop out of the list, but a row that was just completed
 * must stay (struck through) until its strike has played, and a whole cascade leaves together.
 * Returns `keys` with every row that vanished because it became done put back where it was,
 * until its hold runs out; then it is removed and its exit animation plays. Added rows and
 * everything else show up immediately. A row that is undone again, or deleted, is dropped from
 * the hold at once.
 */
export function useCompletionHold(keys: string[], { holdWith }: Options = {}): string[] {
  const reduced = useReducedMotion();
  const tasks = useTaskStore((s) => s.tasks);
  const held = useRef(new Map<string, number>());
  const previous = useRef(keys);
  const [count, tick] = useState(0);

  const now = Date.now();
  const present = new Set(keys);
  const map = held.current;

  // Rows whose hold ran out are let go for good: forget them, or they'd look newly vanished.
  const expired = new Set<string>();
  for (const [id, until] of map) {
    if (present.has(id) || !tasks[id]?.done) map.delete(id);
    else if (until <= now) {
      map.delete(id);
      expired.add(id);
    }
  }
  if (expired.size > 0) previous.current = previous.current.filter((key) => !expired.has(key));

  const vanished = previous.current.filter(
    (key) => !present.has(key) && !map.has(key) && tasks[key]?.done,
  );
  if (vanished.length > 0) {
    const state = useTaskStore.getState();
    const toggled = state.lastToggle?.id ?? null;
    const hold = reduced ? REDUCED_HOLD_MS : strikeHoldMs(state, toggled, vanished);
    const pops = planPops(state, reduced ? null : toggled, vanished);
    for (const id of vanished) {
      map.set(id, now + hold);
      popDelays.set(id, reduced ? 0 : (pops.get(id) ?? 0));
    }
  }

  let out = keys;
  if (map.size > 0) {
    const keep = new Set<string>();
    for (const id of map.keys()) {
      keep.add(id);
      for (const extra of holdWith?.(previous.current, id) ?? []) keep.add(extra);
    }
    out = [...keys];
    const inOut = new Set(out);
    previous.current.forEach((key, at) => {
      if (!keep.has(key) || inOut.has(key)) return;
      let slot = 0;
      for (let i = at - 1; i >= 0; i -= 1) {
        const found = out.indexOf(previous.current[i]);
        if (found !== -1) {
          slot = found + 1;
          break;
        }
      }
      out.splice(slot, 0, key);
      inOut.add(key);
    });
  }
  previous.current = out;

  const nextExpiry = map.size > 0 ? Math.min(...map.values()) : null;
  useEffect(() => {
    if (nextExpiry === null) return;
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(0, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [nextExpiry, count]);

  return out;
}
