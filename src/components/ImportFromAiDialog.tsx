import { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { buildImportPrompt, toAiJson } from '../lib/ai';
import { useAiDraft } from '../store/aiDraft';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { AiModal, CopyButton, CopyStatus, Switch, useCopy } from './AiModal';
import modal from './AiModal.module.css';
import { ImportPaste, useReplaceConfirm } from './ImportPaste';
import paste from './ImportPaste.module.css';
import styles from './ImportFromAiDialog.module.css';

/** How long the "Copied" state shows before step 1 moves on to the paste step. */
const ADVANCE_MS = 1100;

function StepIndicator({ step }: { step: 1 | 2 }) {
  const set = useAiDraft((s) => s.set);
  return (
    <ol className={styles.steps} aria-label="Steps">
      {(['Ask', 'Paste'] as const).map((label, i) => {
        const n = (i + 1) as 1 | 2;
        return (
          <li key={label}>
            <button
              type="button"
              className={styles.step}
              aria-current={step === n ? 'step' : undefined}
              onClick={() => set({ step: n })}
            >
              <span className={styles.stepNum}>{n}</span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function AskStep() {
  const goal = useAiDraft((s) => s.goal);
  const includeContext = useAiDraft((s) => s.includeContext);
  const set = useAiDraft((s) => s.set);
  const { copiedKey, failed, copy } = useCopy();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = async () => {
    const { tasks, rootIds, history } = useTaskStore.getState();
    const context = includeContext
      ? toAiJson({ tasks, rootIds, history }, { includeCompleted: false })
      : undefined;
    const ok = await copy(buildImportPrompt(goal, { context }), 'main');
    if (ok) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => set({ step: 2 }), ADVANCE_MS);
    }
  };

  return (
    <>
      <label className={modal.field}>
        What do you want to plan?
        <textarea
          data-autofocus
          autoFocus
          className={modal.textarea}
          rows={4}
          value={goal}
          placeholder="e.g. Launch my portfolio site by Nov 15"
          onChange={(e) => set({ goal: e.target.value })}
        />
      </label>
      <Switch checked={includeContext} onChange={(v) => set({ includeContext: v })}>
        Include my current tasks as context
      </Switch>
      <div className={paste.footer}>
        <CopyButton copied={copiedKey === 'main'} onClick={() => void onCopy()} />
        <button type="button" className={paste.link} onClick={() => set({ step: 2 })}>
          Next: paste reply
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.hint}>Paste it into your AI chat, then come back with the reply.</p>
      {failed && (
        <p className={modal.error}>Couldn{'’'}t copy. Your browser blocked clipboard access.</p>
      )}
      <CopyStatus copied={copiedKey !== null} failed={failed} />
    </>
  );
}

function PasteStep({
  onDone,
  onAskConfirm,
}: {
  onDone: () => void;
  onAskConfirm: ComponentProps<typeof ImportPaste>['onAskConfirm'];
}) {
  const reply = useAiDraft((s) => s.reply);
  const mode = useAiDraft((s) => s.mode);
  const set = useAiDraft((s) => s.set);

  return (
    <ImportPaste
      text={reply}
      onText={(text) => set({ reply: text })}
      mode={mode}
      onMode={(m) => set({ mode: m })}
      onDone={() => {
        useAiDraft.getState().reset();
        onDone();
      }}
      onAskConfirm={onAskConfirm}
      label={`Paste the AI\u2019s reply here`}
      placeholder="Paste the reply, code fences and all"
      footerLead={
        <button type="button" className={paste.link} onClick={() => set({ step: 1 })}>
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
          Back
        </button>
      }
    />
  );
}

/** "Import from AI": ask a chatbot for a plan in our format, paste its reply back, add it. */
export function ImportFromAiDialog() {
  const open = useUIStore((s) => s.aiDialog === 'import');
  const step = useAiDraft((s) => s.step);
  const confirm = useReplaceConfirm();
  const close = () => useUIStore.getState().setAiDialog(null);
  const stepper = useMemo(() => <StepIndicator step={step} />, [step]);

  return (
    <>
      <AiModal open={open} onClose={close} title="Import from AI" aside={stepper} sheet>
        {step === 1 ? (
          <AskStep key="ask" />
        ) : (
          <PasteStep key="paste" onDone={close} onAskConfirm={confirm.ask} />
        )}
      </AiModal>
      {confirm.dialog}
    </>
  );
}
