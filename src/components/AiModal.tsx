import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, X } from 'lucide-react';
import { copyText } from '../lib/clipboard';
import styles from './AiModal.module.css';
import { dur, ease, spring } from '../styles/motion';

const FOCUSABLE =
  'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  onClose: () => void;
  title: string;
  /** Rendered next to the title (e.g. a step indicator). */
  aside?: ReactNode;
  subtitle?: string;
  /** At phone width, slide up as a full-width bottom sheet instead of a floating card. */
  sheet?: boolean;
  children: ReactNode;
};

function Modal({ onClose, title, aside, subtitle, sheet, children }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Focus the first field on open and hand focus back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const target = card?.querySelector<HTMLElement>('[data-autofocus]') ?? card;
    target?.focus({ preventScroll: true });
    return () => opener?.focus?.({ preventScroll: true });
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      // Trap focus: wrap around the card's controls.
      const items = [...(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === cardRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      // Keep Enter from reaching the task list behind the dialog.
      e.stopPropagation();
    }
  };

  return (
    <motion.div
      className={`${styles.backdrop} ${sheet ? styles.sheet : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: dur.base, ease: ease.out }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={spring.snappy}
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <div className={styles.headline}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {aside}
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </motion.div>
    </motion.div>
  );
}

/** A portal modal for the AI copy/paste dialogs. Children mount only while open. */
export function AiModal({ open, ...rest }: ModalProps & { open: boolean }) {
  return createPortal(
    <AnimatePresence>{open && <Modal key="modal" {...rest} />}</AnimatePresence>,
    document.body,
  );
}

// --- Switch -----------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={styles.switchRow}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} aria-hidden="true" />
      </button>
      <label htmlFor={id} className={styles.switchLabel}>
        {children}
      </label>
    </div>
  );
}

// --- Copy -------------------------------------------------------------------

const COPIED_MS = 1600;

/** Clipboard copy with a transient "copied" state, keyed so several buttons can share it. */
export function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string, key: string): Promise<boolean> => {
    const ok = await copyText(text);
    window.clearTimeout(timer.current);
    setFailed(!ok);
    setCopiedKey(ok ? key : null);
    if (ok) timer.current = window.setTimeout(() => setCopiedKey(null), COPIED_MS);
    return ok;
  }, []);

  return { copiedKey, failed, copy };
}

/** Screen-reader announcement for the copied / failed state. */
export function CopyStatus({ copied, failed }: { copied: boolean; failed: boolean }) {
  return (
    <span className={styles.srOnly} role="status" aria-live="polite">
      {copied ? 'Copied to clipboard' : failed ? 'Copy failed' : ''}
    </span>
  );
}

export function CopyButton({
  copied,
  onClick,
  label = 'Copy prompt',
}: {
  copied: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`${styles.primary} ${copied ? styles.primaryDone : ''}`}
      onClick={onClick}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? 'done' : 'idle'}
          className={styles.btnInner}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: dur.fast }}
        >
          {copied ? (
            <Check size={14} strokeWidth={2.25} aria-hidden="true" />
          ) : (
            <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
          )}
          {copied ? 'Copied' : label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
