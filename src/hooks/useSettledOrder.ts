import { useEffect, useState } from 'react';

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const sameMembers = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

type Options = {
  /**
   * Identifies the structure the ids were derived from. When it changes, a new order applies
   * immediately (e.g. a task was moved), not after the delay. Only done-sinking waits.
   */
  key?: string;
  /** Hold the current order (e.g. during a drag); new members still show up. */
  frozen?: boolean;
};

/**
 * Returns `ids` in the order they had before the latest reorder, until `delayMs` after the
 * order changed. Adding or removing an id applies immediately so inserts and deletes stay snappy.
 */
export function useSettledOrder(
  ids: string[],
  delayMs = 700,
  { key, frozen = false }: Options = {},
): string[] {
  const [settled, setSettled] = useState({ ids, key });
  const immediate = !sameMembers(ids, settled.ids) || key !== settled.key;

  useEffect(() => {
    if (frozen || (sameOrder(ids, settled.ids) && key === settled.key)) return;
    if (immediate) {
      setSettled({ ids, key });
      return;
    }
    const timer = setTimeout(() => setSettled({ ids, key }), delayMs);
    return () => clearTimeout(timer);
  }, [ids, key, settled, immediate, frozen, delayMs]);

  if (frozen) return sameMembers(ids, settled.ids) ? settled.ids : ids;
  return immediate ? ids : settled.ids;
}
