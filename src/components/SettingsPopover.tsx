import { useRef, useState } from 'react';
import { Download, Settings2, Upload } from 'lucide-react';
import { useTaskStore, type PersistedTasks } from '../store/tasks';
import { exportBackup, parseBackup, formatBackupDescription } from '../lib/backup';
import { Popover } from './Popover';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './SettingsPopover.module.css';

type ImportState = {
  pending: boolean;
  error: null | 'invalid-json' | 'not-a-backup' | 'corrupt';
  data: PersistedTasks | null;
  exportedAt: string | null;
  taskCount: number;
};

export function SettingsPopover() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importState, setImportState] = useState<ImportState>({
    pending: false,
    error: null,
    data: null,
    exportedAt: null,
    taskCount: 0,
  });

  const replaceAll = useTaskStore((s) => s.replaceAll);

  const handleExport = () => {
    if (exportBackup()) setPopoverOpen(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    // Reset right away so choosing the same file again still fires a change event.
    input.value = '';
    if (!file) return;

    setImportState({ pending: true, error: null, data: null, exportedAt: null, taskCount: 0 });

    try {
      const text = await file.text();
      const result = parseBackup(text);

      if (result.ok) {
        setImportState({
          pending: false,
          error: null,
          data: result.data,
          exportedAt: result.exportedAt,
          taskCount: result.taskCount,
        });
        setDialogOpen(true);
      } else {
        setImportState((s) => ({ ...s, pending: false, error: result.error }));
      }
    } catch (err) {
      console.error('File read failed:', err);
      setImportState((s) => ({ ...s, pending: false, error: 'invalid-json' }));
    }
  };

  const handleConfirmImport = () => {
    if (!importState.data) return;
    const taskCount = importState.taskCount;
    replaceAll(
      importState.data,
      `Restored backup (${taskCount} ${taskCount === 1 ? 'task' : 'tasks'})`,
    );
    setDialogOpen(false);
    setPopoverOpen(false);
    setImportState({ pending: false, error: null, data: null, exportedAt: null, taskCount: 0 });
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  };

  const handleCancelImport = () => {
    setDialogOpen(false);
    setImportState({ pending: false, error: null, data: null, exportedAt: null, taskCount: 0 });
  };

  const errorMessages: Record<Exclude<ImportState['error'], null>, string> = {
    'invalid-json': "That file isn't a valid backup.",
    'not-a-backup': "That file isn't a valid backup.",
    corrupt: "Backup is damaged and can't be restored.",
  };

  const dialogBody = importState.data
    ? `This replaces your current list with the backup from ${formatBackupDescription(importState.exportedAt, importState.taskCount)}. You can undo right after.`
    : '';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Settings"
        title="Settings"
        className={styles.button}
        onClick={() => setPopoverOpen(!popoverOpen)}
      >
        <Settings2 size={15} strokeWidth={1.75} />
      </button>

      <Popover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        anchorRef={buttonRef}
        label="Settings"
        align="end"
        width={220}
      >
        <div className={styles.menu} role="menu" aria-label="Settings" onKeyDown={onMenuKeyDown}>
          <div className={styles.section}>Data</div>

          <button type="button" role="menuitem" className={styles.item} onClick={handleExport}>
            <Download size={15} />
            <span>Export backup</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={handleImportClick}
            disabled={importState.pending}
          >
            <Upload size={15} />
            <span>Import backup…</span>
          </button>

          {importState.error && (
            <div className={styles.error}>{errorMessages[importState.error]}</div>
          )}
        </div>
      </Popover>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      <ConfirmDialog
        open={dialogOpen}
        title="Replace all tasks?"
        body={dialogBody}
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
      />
    </>
  );
}
