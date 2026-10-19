import { useRef, useState } from 'react';
import { Download, LogOut, Sparkles, Upload, WandSparkles } from 'lucide-react';
import { useTaskStore, type PersistedTasks } from '../store/tasks';
import { exportBackup, parseBackup, formatBackupDescription } from '../lib/backup';
import { useAuthStore } from '../store/auth';
import { useUIStore } from '../store/ui';
import { useSyncStore, type SyncStatus } from '../sync/status';
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

const SYNC_LABELS: Record<SyncStatus, string> = {
  loading: 'Syncing\u2026',
  ready: 'Synced',
  offline: 'Offline \u2014 changes will sync',
  error: 'Sync error',
};

const initialsOf = (name: string, email: string) => {
  const parts = (name || email).trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 1);
  return letters.toUpperCase();
};

/** The header's account menu: who is signed in, sync state, backup and sign-out. */
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
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const syncStatus = useSyncStore((s) => s.syncStatus);
  const [photoFailed, setPhotoFailed] = useState(false);

  const openAi = (dialog: 'copy' | 'import') => {
    setPopoverOpen(false);
    useUIStore.getState().setAiDialog(dialog);
  };

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
        aria-label="Account"
        title={user?.email || 'Account'}
        aria-haspopup="menu"
        aria-expanded={popoverOpen}
        className={styles.button}
        onClick={() => setPopoverOpen(!popoverOpen)}
      >
        {user?.photoURL && !photoFailed ? (
          <img
            className={styles.avatar}
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className={styles.avatar} aria-hidden="true">
            {initialsOf(user?.name ?? '', user?.email ?? '')}
          </span>
        )}
      </button>

      <Popover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        anchorRef={buttonRef}
        label="Account"
        align="end"
        width={240}
      >
        <div className={styles.menu} role="menu" aria-label="Account" onKeyDown={onMenuKeyDown}>
          {user && (
            <>
              <div className={styles.identity}>
                <div className={styles.name}>{user.name}</div>
                {user.email && <div className={styles.email}>{user.email}</div>}
                <div className={styles.sync} data-status={syncStatus} role="status">
                  <span className={styles.dot} aria-hidden="true" />
                  {SYNC_LABELS[syncStatus]}
                </div>
              </div>
              <div className={styles.divider} role="separator" />
            </>
          )}
          <div className={styles.section}>AI</div>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => openAi('copy')}
          >
            <Sparkles size={15} />
            <span>Copy for AI</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => openAi('import')}
          >
            <WandSparkles size={15} />
            <span>Import from AI…</span>
          </button>

          <div className={styles.divider} role="separator" />
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

          <div className={styles.divider} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`${styles.item} ${styles.last}`}
            onClick={() => {
              setPopoverOpen(false);
              void signOut();
            }}
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
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
