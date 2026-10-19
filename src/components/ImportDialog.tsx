import { useImportDraft } from '../store/importDraft';
import { useAiDraft } from '../store/aiDraft';
import { useUIStore } from '../store/ui';
import { AiModal } from './AiModal';
import { ImportPaste, useReplaceConfirm } from './ImportPaste';
import styles from './ImportPaste.module.css';

/** "Import": paste a Tasks backup or an AI reply; the app works out which it is. */
export function ImportDialog() {
  const open = useUIStore((s) => s.aiDialog === 'paste');
  const text = useImportDraft((s) => s.text);
  const mode = useImportDraft((s) => s.mode);
  const set = useImportDraft((s) => s.set);
  const confirm = useReplaceConfirm();
  const close = () => useUIStore.getState().setAiDialog(null);

  const getPrompt = () => {
    useAiDraft.getState().set({ step: 1 });
    useUIStore.getState().setAiDialog('import');
  };

  return (
    <>
      <AiModal
        open={open}
        onClose={close}
        title="Import"
        subtitle="Paste a backup or an AI reply."
        sheet
      >
        <ImportPaste
          text={text}
          onText={(t) => set({ text: t })}
          mode={mode}
          onMode={(m) => set({ mode: m })}
          onDone={() => {
            useImportDraft.getState().reset();
            close();
          }}
          onAskConfirm={confirm.ask}
          label="Paste here"
          placeholder="Paste a Tasks backup or an AI reply…"
          rows={7}
          emptyLead={
            <button type="button" className={styles.hintBtn} onClick={getPrompt}>
              Need tasks from an AI? Get a prompt {'→'}
            </button>
          }
        />
      </AiModal>
      {confirm.dialog}
    </>
  );
}
