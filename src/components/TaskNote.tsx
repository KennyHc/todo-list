import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { splitNoteLinks } from '../lib/links';
import { useTaskStore } from '../store/tasks';
import { MAX_NOTES_LENGTH } from '../types';
import { LinkChip } from './LinkChip';
import styles from './TaskNote.module.css';
import { spring } from '../styles/motion';

export type NoteMode = 'closed' | 'read' | 'edit';

type Props = {
  id: string;
  notes: string | undefined;
  /** Only the two open modes render this component. */
  mode: Exclude<NoteMode, 'closed'>;
  onMode: (mode: NoteMode) => void;
};

/** Inline note editor. Mounted only while editing, so its draft state is fresh each time. */
function NoteEditor({
  id,
  initial,
  onMode,
}: {
  id: string;
  initial: string;
  onMode: Props['onMode'];
}) {
  const [draft, setDraft] = useState(initial);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);
  const reduced = useReducedMotion();
  /** Set once a key action has handled saving, so the blur that follows is ignored. */
  const handled = useRef(false);
  /** The first measurement sets the height without a spring: the block's own spring opens it. */
  const measured = useRef(false);

  // Focus synchronously on mount (before paint), with the caret at the end. On iOS this takes
  // focus over from the proxy input primed in the tap, which keeps the keyboard open.
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  // Grows with its text: the natural height is measured with the height released, then sprung to.
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const was = input.style.height;
    input.style.height = 'auto';
    const next = input.scrollHeight;
    input.style.height = was;
    setHeight(next > 0 ? next : undefined);
  }, [draft]);
  useLayoutEffect(() => {
    if (height !== undefined) measured.current = true;
  }, [height]);

  const save = () => {
    const notes = draft.trim();
    useTaskStore.getState().setNotes(id, notes);
    onMode(notes === '' ? 'closed' : 'read');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      handled.current = true;
      onMode('closed');
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handled.current = true;
      save();
    }
  };

  return (
    <motion.textarea
      ref={ref}
      className={styles.editor}
      value={draft}
      rows={1}
      maxLength={MAX_NOTES_LENGTH}
      aria-label="Note"
      placeholder="Add a note…"
      initial={false}
      animate={height === undefined ? undefined : { height }}
      transition={reduced || !measured.current ? { duration: 0 } : spring.layout}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (handled.current) return;
        handled.current = true;
        save();
      }}
    />
  );
}

/**
 * A task's note, under its title: read-only (links as the usual chips, a click edits it) or an
 * auto-growing editor that saves on blur and on ⌘/Ctrl+Enter, and drops its draft on Esc.
 * Opens and closes with a height spring.
 */
export function TaskNote({ id, notes, mode, onMode }: Props) {
  return (
    <motion.div
      className={styles.note}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={spring.layout}
      style={{ overflow: 'hidden' }}
    >
      {mode === 'edit' ? (
        <NoteEditor id={id} initial={notes ?? ''} onMode={onMode} />
      ) : (
        <div
          className={styles.text}
          role="group"
          aria-label="Note"
          tabIndex={0}
          title="Edit note"
          data-swipe-through
          onClick={(e) => {
            // A link (or its chip) opens; the rest of the note edits.
            if (!(e.target as Element).closest('a')) onMode('edit');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target === e.currentTarget) {
              e.preventDefault();
              onMode('edit');
            }
          }}
        >
          {splitNoteLinks(notes ?? '').map(({ text, links }, i) => (
            <p key={i} className={styles.line}>
              {text === '' && links.length === 0 ? ' ' : text}
              {links.map((href) => (
                <LinkChip key={href} href={href} />
              ))}
            </p>
          ))}
        </div>
      )}
    </motion.div>
  );
}
