import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import {
  buildImportPrompt,
  importStats,
  parseAiImport,
  toAiJson,
  type AiImportTask,
  type AiParseResult,
} from '../lib/ai';
import { useAiDraft } from '../store/aiDraft';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { AiModal, CopyButton, CopyStatus, Switch, useCopy } from './AiModal';
import modal from './AiModal.module.css';
import { ConfirmDialog } from './ConfirmDialog';
import { DuePill } from './DuePill';
import { TagChip } from './TagChip';
import styles from './ImportFromAiDialog.module.css';

const PREVIEW_ROWS = 12;
/** How long the "Copied" state shows before step 1 moves on to the paste step. */
const ADVANCE_MS = 1100;
const PARSE_DEBOUNCE_MS = 200;

type PreviewRow = { task: AiImportTask; depth: number };

function flatten(tasks: AiImportTask[], depth = 0, out: PreviewRow[] = []): PreviewRow[] {
  for (const task of tasks) {
    out.push({ task, depth });
    flatten(task.subtasks, depth + 1, out);
  }
  return out;
}

const sumDifficulty = (task: AiImportTask): number =>
  task.subtasks.length === 0
    ? task.difficulty
    : task.subtasks.reduce((n, t) => n + sumDifficulty(t), 0);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
      <div className={styles.footer}>
        <CopyButton copied={copiedKey === 'main'} onClick={() => void onCopy()} />
        <button type="button" className={styles.link} onClick={() => set({ step: 2 })}>
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

function Preview({ result }: { result: Extract<AiParseResult, { ok: true }> }) {
  const stats = importStats(result.tasks);
  const rows = flatten(result.tasks);
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <div className={styles.preview}>
      <div className={styles.previewHead}>
        <strong>{plural(stats.count, 'task', 'tasks')}</strong>
        <span className={styles.sigma}>
          {'·'} {'Σ'} {stats.difficulty} difficulty
        </span>
      </div>
      <ul className={styles.tree} aria-label="Preview">
        {shown.map(({ task, depth }, i) => (
          <li key={i} className={styles.row} style={{ paddingLeft: depth * 16 }}>
            <span className={`${styles.rowTitle} ${task.done ? styles.rowDone : ''}`}>
              {task.title}
            </span>
            {task.tags.slice(0, 2).map((tag) => (
              <TagChip key={tag} tag={tag} hash />
            ))}
            {task.due && <DuePill dueDate={task.due} done={task.done} />}
            <span className={styles.badge} title="Difficulty">
              {sumDifficulty(task)}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && (
        <div className={styles.more}>+ {rows.length - shown.length} more</div>
      )}
      {result.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {result.warnings.map((warning) => (
            <li key={warning}>
              <Info size={13} strokeWidth={1.75} aria-hidden="true" />
              {warning}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PasteStep({
  onDone,
  onAskReplace,
}: {
  onDone: () => void;
  onAskReplace: (count: number, run: () => void) => void;
}) {
  const reply = useAiDraft((s) => s.reply);
  const mode = useAiDraft((s) => s.mode);
  const set = useAiDraft((s) => s.set);
  const hasTasks = useTaskStore((s) => s.rootIds.length > 0);
  const [parsed, setParsed] = useState<AiParseResult | null>(() =>
    reply.trim() ? parseAiImport(reply) : null,
  );

  // Parse live, but wait for a pause in typing/pasting.
  useEffect(() => {
    if (!reply.trim()) {
      setParsed(null);
      return;
    }
    const timer = window.setTimeout(() => setParsed(parseAiImport(reply)), PARSE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [reply]);

  // With nothing on the list there is nothing to replace.
  const effectiveMode = hasTasks ? mode : 'add';
  const result = parsed?.ok ? parsed : null;
  const count = result?.count ?? 0;

  const apply = () => {
    if (!result) return;
    const store = useTaskStore.getState();
    const ids =
      effectiveMode === 'replace'
        ? store.replaceWithTasks(
            result.tasks,
            `Replaced list with ${plural(count, 'task', 'tasks')} from AI`,
          )
        : store.appendTasks(result.tasks, `Added ${plural(count, 'task', 'tasks')} from AI`);
    const ui = useUIStore.getState();
    ui.setView('tree');
    ui.setTagFilter(null);
    if (ids[0]) ui.flashRow(ids[0]);
    useAiDraft.getState().reset();
    onDone();
  };

  return (
    <>
      <label className={modal.field}>
        Paste the AI{'’'}s reply here
        <textarea
          data-autofocus
          autoFocus
          className={`${modal.textarea} ${styles.paste}`}
          rows={5}
          value={reply}
          spellCheck={false}
          placeholder="Paste the reply, code fences and all"
          onChange={(e) => set({ reply: e.target.value })}
        />
      </label>

      <div aria-live="polite">
        {parsed && !parsed.ok && <p className={modal.error}>{parsed.error}</p>}
        {result && <Preview result={result} />}
      </div>

      {hasTasks && (
        <div className={styles.mode} role="radiogroup" aria-label="How to import">
          {(
            [
              ['add', 'Add to my list'],
              ['replace', 'Replace my list'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={effectiveMode === value}
              className={styles.modeOption}
              onClick={() => set({ mode: value })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {effectiveMode === 'replace' && (
        <p className={styles.danger}>This replaces all current tasks. You can undo right after.</p>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.link} onClick={() => set({ step: 1 })}>
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
          Back
        </button>
        <button
          type="button"
          className={modal.primary}
          disabled={!result}
          onClick={() => (effectiveMode === 'replace' ? onAskReplace(count, apply) : apply())}
        >
          {effectiveMode === 'replace'
            ? `Replace with ${plural(count, 'task', 'tasks')}`
            : `Add ${plural(count, 'task', 'tasks')}`}
        </button>
      </div>
    </>
  );
}

/** "Import from AI": ask a chatbot for a plan in our format, paste its reply back, add it. */
export function ImportFromAiDialog() {
  const open = useUIStore((s) => s.aiDialog === 'import');
  const step = useAiDraft((s) => s.step);
  const [confirm, setConfirm] = useState<{ count: number; run: () => void } | null>(null);
  const close = () => useUIStore.getState().setAiDialog(null);
  const stepper = useMemo(() => <StepIndicator step={step} />, [step]);

  return (
    <>
      <AiModal open={open} onClose={close} title="Import from AI" aside={stepper} sheet>
        {step === 1 ? (
          <AskStep key="ask" />
        ) : (
          <PasteStep
            key="paste"
            onDone={close}
            onAskReplace={(count, run) => setConfirm({ count, run })}
          />
        )}
      </AiModal>
      <ConfirmDialog
        open={confirm !== null}
        title="Replace all tasks?"
        body={`This replaces your whole list with ${plural(confirm?.count ?? 0, 'new task', 'new tasks')}. You can undo right after.`}
        confirmLabel="Replace"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const run = confirm?.run;
          setConfirm(null);
          run?.();
        }}
      />
    </>
  );
}
