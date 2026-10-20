import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import {
  Download,
  Gauge,
  LogOut,
  Minus,
  MonitorSmartphone,
  Palette,
  Plus,
  Share,
  Sparkles,
  Sun,
  Upload,
  WandSparkles,
} from 'lucide-react';
import { clampCapacity } from '../lib/settings';
import {
  canPromptInstall,
  isIosSafari,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from '../pwa/install';
import { useAuthStore } from '../store/auth';
import { useTaskStore } from '../store/tasks';
import { setTodayView, useUIStore } from '../store/ui';
import { useSyncStore, type SyncStatus } from '../sync/status';
import { Popover } from './Popover';
import { SwitchButton } from './Switch';
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

const HOLD_MS = 420;
const REPEAT_MS = 70;

/**
 * The daily capacity as "- 8 points +". A press steps once; holding it keeps stepping. Keyboard
 * activation arrives as a click with no pointer (detail 0) and steps once.
 */
function CapacityStepper() {
  const capacity = useTaskStore((s) => s.settings.dailyCapacity);
  const timers = useRef<{ hold?: number; repeat?: number }>({});
  const stop = () => {
    window.clearTimeout(timers.current.hold);
    window.clearInterval(timers.current.repeat);
  };
  useEffect(() => stop, []);

  /** Steps by `delta`; false once the end of the range has been reached. */
  const step = (delta: number): boolean => {
    const state = useTaskStore.getState();
    const current = state.settings.dailyCapacity;
    const next = clampCapacity(current + delta);
    if (next === current) return false;
    state.setSetting({ dailyCapacity: next });
    return true;
  };
  const press = (delta: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      stop();
      if (!step(delta)) return;
      timers.current.hold = window.setTimeout(() => {
        timers.current.repeat = window.setInterval(() => {
          if (!step(delta)) stop();
        }, REPEAT_MS);
      }, HOLD_MS);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onBlur: stop,
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) step(delta);
    },
  });

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.stepBtn}
        aria-label="Decrease daily capacity"
        disabled={capacity <= 1}
        {...press(-1)}
      >
        <Minus size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <span className={styles.stepValue}>
        <output aria-label="Daily capacity in points" className={styles.stepNumber}>
          {capacity}
        </output>
        <span className={styles.stepUnit}>points</span>
      </span>
      <button
        type="button"
        className={styles.stepBtn}
        aria-label="Increase daily capacity"
        disabled={capacity >= 50}
        {...press(1)}
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Opt-in features. Off by default: the app stays as simple as it was until one is switched on. */
function Features() {
  const todayView = useTaskStore((s) => s.settings.todayView);
  const labelId = useId();
  const descId = useId();
  return (
    <div role="group" aria-label="Features">
      <div className={styles.feature}>
        <Sun size={16} aria-hidden="true" className={styles.featureIcon} />
        <div className={styles.featureText}>
          <span id={labelId} className={styles.featureLabel}>
            Today view
          </span>
          <span id={descId} className={styles.featureDesc}>
            A daily plan sized to your capacity
          </span>
        </div>
        <SwitchButton
          checked={todayView}
          onChange={setTodayView}
          aria-labelledby={labelId}
          aria-describedby={descId}
        />
      </div>
      {todayView && (
        <div className={styles.feature}>
          <Gauge size={16} aria-hidden="true" className={styles.featureIcon} />
          <div className={styles.featureText}>
            <span className={styles.featureLabel}>Daily capacity</span>
          </div>
          <CapacityStepper />
        </div>
      )}
    </div>
  );
}

/** The header's account menu: who is signed in, sync state, backup and sign-out. */
export function SettingsPopover() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const syncStatus = useSyncStore((s) => s.syncStatus);
  const [photoFailed, setPhotoFailed] = useState(false);
  const installable = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [standalone] = useState(isStandalone);
  const [iosSafari] = useState(() => isIosSafari());
  const [iosHintOpen, setIosHintOpen] = useState(false);

  const openDialog = (dialog: 'copy' | 'import' | 'export' | 'paste') => {
    setPopoverOpen(false);
    useUIStore.getState().setAiDialog(dialog);
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // The theme control claims the arrow keys for itself.
    if (e.defaultPrevented || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const items = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled), [role="switch"]',
      ),
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
        width={272}
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

          {!standalone && installable && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setPopoverOpen(false);
                void promptInstall();
              }}
            >
              <MonitorSmartphone size={16} />
              <span>Install app</span>
            </button>
          )}

          {!standalone && !installable && iosSafari && (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                aria-expanded={iosHintOpen}
                onClick={() => setIosHintOpen(!iosHintOpen)}
              >
                <Download size={16} />
                <span>Add to Home Screen</span>
              </button>
              {iosHintOpen && (
                <p className={styles.hint}>
                  Tap <Share size={13} aria-label="Share" className={styles.hintIcon} />, then{' '}
                  <strong>Add to Home Screen</strong>.
                </p>
              )}
              {iosHintOpen && (
                <p className={`${styles.hint} ${styles.tip}`}>
                  Tip: any link to tasks-app-956r6.web.app/?add={'\u2026'} opens Tasks with that
                  text ready to add {'\u2014'} use it from Shortcuts or bookmarks.
                </p>
              )}
            </>
          )}

          <div className={styles.divider} role="separator" />
          <div className={styles.section}>Features</div>
          <Features />

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
