import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { exportBackup, serializeBackup } from '../lib/backup';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { AiModal, CopyButton, CopyStatus, useCopy } from './AiModal';
import modal from './AiModal.module.css';
import styles from './ExportBackupDialog.module.css';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Body() {
  const { copiedKey, failed, copy } = useCopy();
  // A snapshot taken when the dialog opens: it is about the list as it was then.
  const backup = useMemo(() => {
    const { tasks, rootIds, history } = useTaskStore.getState();
    const json = serializeBackup({ tasks, rootIds, history });
    return {
      json,
      tasks: Object.keys(tasks).length,
      history: history.length,
      kb: Math.max(0.1, new Blob([json]).size / 1024),
    };
  }, []);

  return (
    <>
      <div className={styles.previewWrap}>
        <pre className={styles.preview} tabIndex={0} aria-label="Backup preview">
          {backup.json}
        </pre>
      </div>
      <p className={styles.meta}>
        {plural(backup.tasks, 'task', 'tasks')} {'·'}{' '}
        {plural(backup.history, 'history entry', 'history entries')} {'·'} {backup.kb.toFixed(1)} KB
      </p>

      <div className={styles.actions}>
        <CopyButton
          copied={copiedKey === 'main'}
          label="Copy"
          onClick={() => void copy(backup.json, 'main')}
        />
        <button type="button" className={modal.secondary} onClick={() => exportBackup()}>
          <span className={modal.btnInner}>
            <Download size={14} strokeWidth={1.75} aria-hidden="true" />
            Download .json
          </span>
        </button>
      </div>
      {failed && <p className={modal.error}>Couldn{'’'}t copy. Select the text above instead.</p>}
      <CopyStatus copied={copiedKey !== null} failed={failed} />
    </>
  );
}

/** "Export backup": the whole list as JSON to copy or download. */
export function ExportBackupDialog() {
  const open = useUIStore((s) => s.aiDialog === 'export');
  const close = () => useUIStore.getState().setAiDialog(null);
  return (
    <AiModal
      open={open}
      onClose={close}
      title="Export backup"
      subtitle="Your full list, history included. Keep it somewhere safe, or paste it back with Import."
      sheet
    >
      <Body />
    </AiModal>
  );
}
