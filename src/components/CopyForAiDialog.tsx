import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { buildExportPrompt, estimateTokens, toAiJson } from '../lib/ai';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { AiModal, CopyButton, CopyStatus, Switch, useCopy } from './AiModal';
import modal from './AiModal.module.css';
import styles from './CopyForAiDialog.module.css';

const SUGGESTIONS = [
  'What should I focus on today?',
  'Summarize my progress this week',
  'Which tasks should I break down?',
];

function Body() {
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const { copiedKey, failed, copy } = useCopy();
  // A snapshot taken when the option changes: the dialog is about the list as it was opened.
  const prompt = useMemo(() => {
    const { tasks, rootIds, history } = useTaskStore.getState();
    return buildExportPrompt(toAiJson({ tasks, rootIds, history }, { includeCompleted }));
  }, [includeCompleted]);

  return (
    <>
      <Switch checked={includeCompleted} onChange={setIncludeCompleted}>
        Include completed tasks
      </Switch>

      <div className={styles.previewWrap}>
        <pre className={styles.preview} tabIndex={0} aria-label="Prompt preview">
          {prompt}
        </pre>
        <span className={styles.tokens}>
          {'≈'} {estimateTokens(prompt).toLocaleString()} tokens
        </span>
      </div>

      <div className={styles.actions}>
        <CopyButton copied={copiedKey === 'main'} onClick={() => void copy(prompt, 'main')} />
        {failed && (
          <span className={modal.error}>Couldn{'’'}t copy. Select the text above instead.</span>
        )}
      </div>

      <div className={styles.chips} role="group" aria-label="Copy with a question">
        {SUGGESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            className={styles.chip}
            onClick={() => void copy(prompt + question, question)}
          >
            {copiedKey === question && <Check size={12} strokeWidth={2.25} aria-hidden="true" />}
            {question}
          </button>
        ))}
      </div>
      <CopyStatus copied={copiedKey !== null} failed={failed} />
    </>
  );
}

/** "Copy for AI": the list as a ready-to-paste prompt for any chatbot. */
export function CopyForAiDialog() {
  const open = useUIStore((s) => s.aiDialog === 'copy');
  const close = () => useUIStore.getState().setAiDialog(null);
  return (
    <AiModal
      open={open}
      onClose={close}
      title="Copy for AI"
      subtitle="Paste into ChatGPT, Claude or Gemini and ask anything about your tasks."
    >
      <Body />
    </AiModal>
  );
}
