import { MoreHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useIsTouch } from '../hooks/useIsTouch';
import { useIsPhone } from '../hooks/useMediaQuery';
import { useTaskStore } from '../store/tasks';
import styles from './TaskItem.module.css';

type Props = {
  id: string;
  initial: string;
  parentId: string | null;
  /**
   * Phones only: adds a trailing ⋯ that saves the title and opens the row's options sheet, since
   * the row itself carries no ⋯ there.
   */
  onMenu?: () => void;
};

/** Inline title input. Mounted only while `editingId === id`, so its draft state is fresh each time. */
export function TitleEditor({ id, initial, parentId, onMenu }: Props) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const touch = useIsTouch();
  const phone = useIsPhone();
  /** Set once a key action has handled saving, so the blur that follows is ignored. */
  const handled = useRef(false);

  // Focus synchronously on mount (before paint). On iOS this takes focus over from the proxy
  // input primed in the tap, which keeps the keyboard open.
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, []);

  // Bring the row into view: centred on phones for a new row (the keyboard takes half the
  // screen), otherwise only as far as needed. Again once the row has settled.
  useEffect(() => {
    const row = ref.current?.closest('[data-row-id]') ?? ref.current;
    const block = phone && initial === '' ? 'center' : 'nearest';
    const scroll = () => row?.scrollIntoView?.({ block });
    scroll();
    const timer = window.setTimeout(scroll, 260);
    return () => window.clearTimeout(timer);
  }, [phone, initial]);

  const store = useTaskStore;
  const save = () => {
    const title = draft.trim();
    if (title === '') store.getState().remove(id);
    else store.getState().update(id, { title });
  };
  const finish = () => store.getState().setEditingId(null);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const { add, update, indent, outdent, remove, setEditingId } = store.getState();
    const title = draft.trim();
    if (e.key === 'Enter') {
      e.preventDefault();
      handled.current = true;
      if (title === '') {
        remove(id);
        finish();
      } else if (touch) {
        // Phones: Enter means "done". Save and stop: no new sibling.
        update(id, { title });
        finish();
      } else {
        update(id, { title });
        setEditingId(add({ title: '', parentId, afterId: id }));
      }
      // Closes the on-screen keyboard.
      if (touch) ref.current?.blur();
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

  const input = (
    <input
      ref={ref}
      className={styles.titleInput}
      value={draft}
      aria-label="Task title"
      enterKeyHint={touch ? 'done' : 'next'}
      autoComplete="off"
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
  if (!onMenu) return input;

  return (
    <div className={styles.editorLine}>
      {input}
      <button
        type="button"
        className={styles.editorMenu}
        aria-label="More options"
        aria-haspopup="dialog"
        // Keep focus in the input until the click, so the blur does not end the edit first.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          handled.current = true;
          const empty = draft.trim() === '';
          save();
          finish();
          if (!empty) onMenu();
        }}
      >
        <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
