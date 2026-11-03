import { useEffect, useMemo, useState } from 'react';

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const sameMembers = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

type Options = {
  /**
   * Identifies the structure the ids were derived from. When it changes without ids coming or
   * going (e.g. a task was moved), the new order applies immediately, not after the delay.
   * Only done-sinking waits.
   */
  key?: string;
  /** Hold the current order (e.g. during a drag); new members still show up. */
  frozen?: boolean;
  /**
   * Ids (such as section headers) that other ids are laid out around. When one of them appears or
   * disappears the whole new order applies at once, since the rows can't keep their old place
   * without it.
   */
  isAnchor?: (id: string) => boolean;
};

/**
 * Keeps the retained ids in `prev`'s order and puts each new id before the next id that follows
 * it in `ids` (else at the end), so an added row shows up where it belongs while the rest wait.
 */
function mergeOrder(prev: string[], ids: string[]): string[] {
  const keep = new Set(ids);
  const had = new Set(prev);
  const out = prev.filter((id) => keep.has(id));
  ids.forEach((id, i) => {
    if (had.has(id)) return;
    let at = out.length;
    for (let j = i + 1; j < ids.length; j++) {
      const found = out.indexOf(ids[j]);
      if (found !== -1) {
        at = found;
        break;
      }
    }
    out.splice(at, 0, id);
  });
  return out;
}

/**
 * Returns `ids` in the order they had before the latest reorder, until `delayMs` after the
 * order changed. Rows that are added or removed show up or go away immediately (so inserts and
 * deletes stay snappy) while the rows that stayed keep their old order for the rest of the
 * delay; that is what lets a completed row finish its strike-through before it sinks, even when
 * completing it also adds a row (a repeating task's next occurrence).
 */
export function useSettledOrder(
  ids: string[],
  delayMs = 700,
  { key, frozen = false, isAnchor }: Options = {},
): string[] {
  const [settled, setSettled] = useState({ ids, key });
  const membersChanged = !sameMembers(ids, settled.ids);
  const anchorChanged =
    membersChanged &&
    isAnchor !== undefined &&
    (ids.some((id) => isAnchor(id) && !settled.ids.includes(id)) ||
      settled.ids.some((id) => isAnchor(id) && !ids.includes(id)));
  const immediate = anchorChanged || (!membersChanged && key !== settled.key);
  const merged = useMemo(
    () => (membersChanged && !immediate ? mergeOrder(settled.ids, ids) : null),
    [membersChanged, immediate, settled.ids, ids],
  );
  const shown = immediate ? ids : (merged ?? settled.ids);

  useEffect(() => {
    if (frozen) return;
    if (immediate) {
      setSettled({ ids, key });
      return;
    }
    if (merged) {
      // Adopt the membership change now; the reorder (if any) follows after the delay.
      setSettled({ ids: merged, key });
      return;
    }
    if (sameOrder(ids, settled.ids) && key === settled.key) return;
    const timer = setTimeout(() => setSettled({ ids, key }), delayMs);
    return () => clearTimeout(timer);
  }, [ids, key, settled, immediate, merged, frozen, delayMs]);

  if (frozen) return membersChanged ? ids : settled.ids;
  return shown;
}
