import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTaskStore } from '../store/tasks';
import styles from './TaskItem.module.css';

type Props = { id: string; initial: string; parentId: string | null };

/** Inline title input. Mounted only while `editingId === id`, so its draft state is fresh each time. */
export function TitleEditor({ id, initial, parentId }: Props) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  /** Set once a key action has handled saving, so the blur that follows is ignored. */
  const handled = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const store = useTaskStore;
  const save = () => {
    const title = draft.trim();
    if (title === '') store.getState().remove(id);
    else store.getState().update(id, { title });
  };
  const finish = () => store.getState().setEditingId(null);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const { add, update, indent, outdent, remove, setEditingId } = store.getState();
    const title = draft.trim();
    if (e.key === 'Enter') {
      e.preventDefault();
      handled.current = true;
      if (title === '') {
        remove(id);
        finish();
        return;
      }
      update(id, { title });
      setEditingId(add({ title: '', parentId, afterId: id }));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handled.current = true;
      if (initial === '') remove(id);
      finish();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (title === '') return;
      // The row remounts under its new parent; editingId stays, so focus follows the task.
      handled.current = true;
      update(id, { title });
      if (e.shiftKey) outdent(id);
      else indent(id);
    }
  };

  return (
    <input
      ref={ref}
      className={styles.titleInput}
      value={draft}
      aria-label="Task title"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (handled.current) return;
        handled.current = true;
        save();
        finish();
      }}
    />
  );
}
