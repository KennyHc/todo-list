import { MoreHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useImeEnter } from '../hooks/useImeEnter';
import { useIsPhone } from '../hooks/useMediaQuery';
import { weekdayDate } from '../lib/dates';
import { parseQuickAdd, SUPPORTS_REPEAT, tokenKey, type QuickToken } from '../lib/quickAdd';
import { quickPatch } from '../lib/quickEdit';
import { todayISO } from '../lib/views';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { QuickChips } from './QuickChips';
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
  const phone = useIsPhone();
  /** Set once a key action has handled saving, so the blur that follows is ignored. */
  const handled = useRef(false);
  // The draft is parsed like the composer's. Phrases already in the saved title start out
  // dismissed, so an old "Meeting on friday" isn't turned into a date by editing it.
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(
    () => new Set(parseQuickAdd(initial, { repeats: SUPPORTS_REPEAT }).tokens.map(tokenKey)),
  );
  const parsed = useMemo(
    () => parseQuickAdd(draft, { ignore: ignored, repeats: SUPPORTS_REPEAT }),
    [draft, ignored],
  );
  const ignore = (...tokens: QuickToken[]) =>
    setIgnored((prev) => new Set([...prev, ...tokens.map(tokenKey)]));

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
  /** Saves the draft, or removes the task when it has no title. Returns false if removed. */
  const save = () => {
    const { tasks, update, remove } = store.getState();
    const task = tasks[id];
    const patch = draft.trim() === '' || !task ? { title: '' } : quickPatch(task, parsed);
    if (patch.title === '') {
      remove(id);
      return false;
    }
    update(id, patch);
    // A task that starts later leaves the lists; say so, like the composer.
    if (patch.startDate && patch.startDate > todayISO()) {
      useUIStore.getState().showNotice(`Hidden until ${weekdayDate(patch.startDate)}`);
    }
    return true;
  };
  const finish = () => store.getState().setEditingId(null);

  // Enter (and a phone's ✓ / return key) saves and opens a new sibling below, on every device.
  // The new row's editor takes focus as it mounts, so the on-screen keyboard stays up.
  const enter = () => {
    const { add, setEditingId } = store.getState();
    handled.current = true;
    if (!save()) finish();
    else setEditingId(add({ title: '', parentId, afterId: id }));
  };
  const ime = useImeEnter(enter);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (ime.intercept(e)) return;
    const { indent, outdent, remove } = store.getState();
    const title = draft.trim();
    if (e.key === 'Enter') {
      e.preventDefault();
      enter();
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
      if (!save()) return finish();
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
      enterKeyHint="next"
      autoComplete="off"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      {...ime.handlers}
      onBlur={() => {
        if (handled.current) return;
        handled.current = true;
        save();
        finish();
      }}
    />
  );
  const chips = <QuickChips parsed={parsed} onIgnore={ignore} />;
  if (!onMenu)
    return (
      <>
        {input}
        {chips}
      </>
    );

  return (
    <>
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
            const saved = save();
            finish();
            if (saved) onMenu();
          }}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {chips}
    </>
  );
}
