import { useRef, useState } from 'react';
import { Download, LogOut, Palette, Sparkles, Upload, WandSparkles } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { useUIStore } from '../store/ui';
import { useSyncStore, type SyncStatus } from '../sync/status';
import { Popover } from './Popover';
import { ThemeToggle } from './ThemeToggle';
import styles from './SettingsPopover.module.css';

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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const syncStatus = useSyncStore((s) => s.syncStatus);
  const [photoFailed, setPhotoFailed] = useState(false);

  const openDialog = (dialog: 'copy' | 'import' | 'export' | 'paste') => {
    setPopoverOpen(false);
    useUIStore.getState().setAiDialog(dialog);
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // The theme control claims the arrow keys for itself.
    if (e.defaultPrevented || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const items = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  };

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
          <div className={styles.appearance} role="group" aria-label="Appearance">
            <span className={styles.appearanceLabel}>Theme</span>
            <ThemeToggle size="sm" />
          </div>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setPopoverOpen(false);
              useUIStore.getState().setTagColorsOpen(true);
            }}
          >
            <Palette size={16} />
            <span>Tag colours</span>
          </button>

          <div className={styles.divider} role="separator" />
          <div className={styles.section}>AI</div>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => openDialog('copy')}
          >
            <Sparkles size={16} />
            <span>Copy for AI</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => openDialog('import')}
          >
            <WandSparkles size={16} />
            <span>Import from AI…</span>
          </button>

          <div className={styles.divider} role="separator" />
          <div className={styles.section}>Data</div>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => openDialog('export')}
          >
            <Download size={16} />
            <span>Export backup…</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => openDialog('paste')}
          >
            <Upload size={16} />
            <span>Import…</span>
          </button>

          <div className={styles.divider} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setPopoverOpen(false);
              void signOut();
            }}
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>

          <div className={styles.divider} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`${styles.item} ${styles.danger} ${styles.last}`}
            onClick={() => {
              setPopoverOpen(false);
              useUIStore.getState().setDeleteAccountOpen(true);
            }}
          >
            <span>Delete account…</span>
          </button>
        </div>
      </Popover>
    </>
  );
}
