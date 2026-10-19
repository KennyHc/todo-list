import { useTaskStore } from '../store/tasks';
import { primeKeyboard } from './focusProxy';

/**
 * Adds an empty child after the parent's existing children, expands the parent, and puts the
 * new row in edit mode (TitleEditor focuses itself and scrolls into view). Primes the iOS
 * keyboard first: this must run synchronously inside the tap, before any state update.
 * Callers that show a menu or sheet close it before calling.
 */
export function addSubtask(parentId: string): string | null {
  primeKeyboard();
  const s = useTaskStore.getState();
  const parent = s.tasks[parentId];
  if (!parent) return null;
  if (parent.collapsed) s.update(parentId, { collapsed: false });
  const id = s.add({ title: '', parentId });
  s.setEditingId(id);
  return id;
}
