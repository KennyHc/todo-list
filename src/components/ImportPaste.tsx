import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DatabaseBackup } from 'lucide-react';
import { formatBackupDescription, formatExportDate } from '../lib/backup';
import { detectImport, type ImportDetection } from '../lib/importDetect';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { ConfirmDialog } from './ConfirmDialog';
import { ImportPreview, plural } from './ImportPreview';
import modal from './AiModal.module.css';
import styles from './ImportPaste.module.css';
import { dur } from '../styles/motion';

const DETECT_DEBOUNCE_MS = 200;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const initialDetection = (text: string): ImportDetection =>
  text.trim() ? detectImport(text) : { kind: 'empty' };

/** File.text() with a FileReader fallback for older engines. */
function readFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

type Confirm = { body: string; run: () => void };

/** Confirmation for the destructive imports. Render `dialog` outside the modal it serves. */
export function useReplaceConfirm() {
  const [pending, setPending] = useState<Confirm | null>(null);
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title="Replace all tasks?"
      body={pending?.body}
      confirmLabel="Replace"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const run = pending?.run;
        setPending(null);
        run?.();
      }}
    />
  );
  return { ask: setPending, dialog };
}

type Props = {
  text: string;
  onText: (text: string) => void;
  mode: 'add' | 'replace';
  onMode: (mode: 'add' | 'replace') => void;
  /** Called after a successful import; the owner closes the dialog and resets its draft. */
  onDone: () => void;
  onAskConfirm: (confirm: Confirm) => void;
  label: string;
  placeholder: string;
  rows?: number;
  /** Shown in the empty state, e.g. a link to the "Ask" step. */
  emptyLead?: ReactNode;
  /** Rendered at the start of the footer (e.g. a Back button). */
  footerLead?: ReactNode;
};

/**
 * Paste (or drop, or choose) a Tasks backup or an AI reply. The text is detected live and the
 * result area shows what will happen: a full restore, an add/replace preview, or why not.
 */
export function ImportPaste({
  text,
  onText,
  mode,
  onMode,
  onDone,
  onAskConfirm,
  label,
  placeholder,
  rows = 6,
  emptyLead,
  footerLead,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const hasTasks = useTaskStore((s) => s.rootIds.length > 0);
  const [detected, setDetected] = useState<ImportDetection>(() => initialDetection(text));
  const [dragging, setDragging] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const [fileError, setFileError] = useState(false);

  // Detect live, but wait for a pause in typing/pasting.
  useEffect(() => {
    if (!text.trim()) {
      setDetected({ kind: 'empty' });
      return;
    }
    const timer = window.setTimeout(() => setDetected(detectImport(text)), DETECT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(true);
      return;
    }
    try {
      onText(await readFile(file));
      setFileError(false);
    } catch {
      setFileError(true);
    }
  };

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setDragging(false);
    void loadFile(e.dataTransfer.files?.[0]);
  };

  const canReadClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      setPasteHint(false);
      onText(clip);
    } catch {
      setPasteHint(true);
    }
  };

  // With nothing on the list there is nothing to replace.
  const effectiveMode = hasTasks ? mode : 'add';

  const finish = (firstId: string | undefined) => {
    const ui = useUIStore.getState();
    ui.setView('tree');
    ui.setTagFilter(null);
    if (firstId) ui.flashRow(firstId);
    onDone();
  };

  const restore = () => {
    if (detected.kind !== 'backup') return;
    const { data, taskCount, exportedAt } = detected;
    onAskConfirm({
      body: `This replaces your current list with the backup from ${formatBackupDescription(exportedAt, taskCount)}. You can undo right after.`,
      run: () => {
        useTaskStore
          .getState()
          .replaceAll(data, `Restored backup (${plural(taskCount, 'task', 'tasks')})`);
        finish(data.rootIds[0]);
      },
    });
  };

  const applyAi = () => {
    if (detected.kind !== 'ai') return;
    const { tasks, count } = detected;
    const store = useTaskStore.getState();
    const run = () => {
      const ids =
        effectiveMode === 'replace'
          ? store.replaceWithTasks(
              tasks,
              `Replaced list with ${plural(count, 'task', 'tasks')} from AI`,
            )
          : store.appendTasks(tasks, `Added ${plural(count, 'task', 'tasks')} from AI`);
      finish(ids[0]);
    };
    if (effectiveMode === 'replace') {
      onAskConfirm({
        body: `This replaces your whole list with ${plural(count, 'new task', 'new tasks')}. You can undo right after.`,
        run,
      });
    } else run();
  };

  const primaryLabel =
    detected.kind === 'backup'
      ? 'Restore backup'
      : detected.kind === 'ai'
        ? effectiveMode === 'replace'
          ? `Replace with ${plural(detected.count, 'task', 'tasks')}`
          : `Add ${plural(detected.count, 'task', 'tasks')}`
        : 'Import';

  return (
    <>
      <label className={modal.field}>
        {label}
        <textarea
          data-autofocus
          autoFocus
          className={`${modal.textarea} ${styles.paste} ${dragging ? styles.dragging : ''}`}
          rows={rows}
          value={text}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => onText(e.target.value)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        />
      </label>

      <div className={styles.under}>
        <button type="button" className={styles.fileLink} onClick={() => fileRef.current?.click()}>
          or choose a file
        </button>
        {fileError && <span className={styles.fileError}>Couldn{'’'}t read that file.</span>}
        <input
          ref={fileRef}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          aria-label="Choose a file"
          tabIndex={-1}
          style={{ display: 'none' }}
          onChange={(e) => {
            const input = e.currentTarget;
            const file = input.files?.[0];
            // Reset so choosing the same file again still fires a change event.
            input.value = '';
            void loadFile(file);
          }}
        />
      </div>

      <div className={styles.result} aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={detected.kind}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: dur.fast }}
          >
            {detected.kind === 'error' && <p className={modal.error}>{detected.error}</p>}
            {detected.kind === 'ai' && (
              <ImportPreview tasks={detected.tasks} warnings={detected.warnings} />
            )}
            {detected.kind === 'backup' && (
              <>
                <div className={styles.backup}>
                  <DatabaseBackup size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    Full backup
                    {detected.exportedAt ? ` · ${formatExportDate(detected.exportedAt)}` : ''}
                    {' · '}
                    {plural(detected.taskCount, 'task', 'tasks')}
                  </span>
                </div>
                <p className={styles.danger}>
                  Replaces your current list. You can undo right after.
                </p>
              </>
            )}
            {detected.kind === 'empty' && (
              <div className={styles.hints}>
                {emptyLead}
                {canReadClipboard && (
                  <button
                    type="button"
                    className={styles.hintBtn}
                    onClick={() => void pasteFromClipboard()}
                  >
                    Paste from clipboard
                  </button>
                )}
                {pasteHint && <span className={styles.hintText}>Press ⌘V / Ctrl+V</span>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {detected.kind === 'ai' && hasTasks && (
        <div className={styles.mode} role="radiogroup" aria-label="How to import">
          {(
            [
              ['add', 'Add to my list'],
              ['replace', 'Replace my list'],
            ] as const
          ).map(([value, name]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={effectiveMode === value}
              className={styles.modeOption}
              onClick={() => onMode(value)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {detected.kind === 'ai' && effectiveMode === 'replace' && (
        <p className={styles.danger}>This replaces all current tasks. You can undo right after.</p>
      )}

      <div className={styles.footer}>
        {footerLead ?? <span />}
        <button
          type="button"
          className={modal.primary}
          disabled={detected.kind !== 'backup' && detected.kind !== 'ai'}
          onClick={detected.kind === 'backup' ? restore : applyAi}
        >
          {primaryLabel}
        </button>
      </div>
    </>
  );
}
