import { useEffect, useState } from 'react';

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const sameMembers = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

/**
 * Returns `ids` in the order they had before the latest reorder, until `delayMs` after the
 * order changed. Adding or removing an id applies immediately so inserts and deletes stay snappy.
 */
export function useSettledOrder(ids: string[], delayMs = 700): string[] {
  const [settled, setSettled] = useState(ids);
  const membersChanged = !sameMembers(ids, settled);

  useEffect(() => {
    if (sameOrder(ids, settled)) return;
    if (membersChanged) {
      setSettled(ids);
      return;
    }
    const timer = setTimeout(() => setSettled(ids), delayMs);
    return () => clearTimeout(timer);
  }, [ids, settled, membersChanged, delayMs]);

  return membersChanged ? ids : settled;
}
