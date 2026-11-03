import { useId, useState, type FormEvent } from 'react';
import { deleteAccount, DeleteAccountError } from '../sync/deleteAccount';
import { useUIStore } from '../store/ui';
import { AiModal } from './AiModal';
import modal from './AiModal.module.css';
import styles from './DeleteAccountDialog.module.css';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

type BodyProps = { busy: boolean; setBusy: (busy: boolean) => void; onClose: () => void };

function Body({ busy, setBusy, onClose }: BodyProps) {
  const inputId = useId();
  const errorId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const armed = text.trim().toLowerCase() === 'delete';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      // The page reloads once everything is gone, so stay busy rather than flash the form again.
    } catch (err) {
      setBusy(false);
      if (err instanceof DeleteAccountError) {
        if (err.code !== 'cancelled') setError(err.message);
      } else setError(GENERIC_ERROR);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <p className={styles.body}>
        This permanently deletes your account and all your tasks, tags and history from every
        device. This can{'’'}t be undone.
      </p>
      <button
        type="button"
        className={styles.link}
        disabled={busy}
        onClick={() => useUIStore.getState().setAiDialog('export')}
      >
        Export a backup first
      </button>

      <label className={modal.field} htmlFor={inputId}>
        Type delete to confirm
      </label>
      <input
        id={inputId}
        data-autofocus
        className={styles.input}
        type="text"
        value={text}
        readOnly={busy}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      {error && (
        <p id={errorId} className={modal.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={`${modal.secondary} ${styles.cancel}`}
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button type="submit" className={styles.danger} disabled={!armed || busy} aria-busy={busy}>
          {busy && <span className={styles.spinner} aria-hidden="true" />}
          {busy ? 'Deleting…' : 'Delete everything'}
        </button>
      </div>
    </form>
  );
}

/** "Delete account…": a typed confirmation, then deleteAccount(). Closes only when not busy. */
export function DeleteAccountDialog() {
  const open = useUIStore((s) => s.deleteAccountOpen);
  const [busy, setBusy] = useState(false);
  const close = () => useUIStore.getState().setDeleteAccountOpen(false);
  return (
    // Escape, the backdrop and the X must not interrupt a deletion in flight.
    <AiModal open={open} onClose={() => !busy && close()} title="Delete your account?" sheet>
      <Body busy={busy} setBusy={setBusy} onClose={close} />
    </AiModal>
  );
}
