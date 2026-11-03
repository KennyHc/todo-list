import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Checkbox } from '../components/Checkbox';
import { DifficultyIcon } from '../components/DifficultyIcon';
import { StrikeText } from '../components/StrikeText';
import { toggleDelay } from '../lib/cascade';
import { effectiveColor } from '../lib/colorResolve';
import { effectiveDifficulty, progress } from '../lib/tree';
import type { TaskTree } from '../types';
import { buildDemoTree, useDemo } from './useDemo';
import styles from './DemoCard.module.css';
import { dur, ease } from '../styles/motion';

const NO_TAG_COLORS: Record<string, string> = {};

/** True while the element is on screen and the tab is visible. */
function useInView(ref: React.RefObject<Element | null>): boolean {
  const [intersecting, setIntersecting] = useState(true);
  const [tabVisible, setTabVisible] = useState(
    typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), {
      threshold: 0.1,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    const onChange = () => setTabVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return intersecting && tabVisible;
}

export function DemoCard({ autoplay = true }: { autoplay?: boolean }) {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [initial] = useState(() => (reduced ? buildDemoTree(2).tree : undefined));
  const demo = useDemo({ enabled: autoplay && !reduced, active: inView, initial });
  const { tree } = demo;

  return (
    <div className={styles.stage} role="img" aria-label="Preview">
      <div className={styles.glow} aria-hidden="true" />
      {/* A picture of the app, not the app: out of the Tab order and the accessibility tree.
          React 18 only passes `inert` through as a string attribute. */}
      <div ref={ref} className={styles.card} {...{ inert: '' }}>
        <div className={styles.composer} aria-hidden="true">
          <Plus size={16} strokeWidth={2} className={styles.plus} />
          {demo.typed ? (
            <span className={styles.typed}>
              {demo.typed}
              <span className={styles.caret} />
            </span>
          ) : (
            <span className={styles.placeholder}>Add a task…</span>
          )}
          <kbd className={styles.kbd}>N</kbd>
        </div>
        <motion.ul
          className={styles.list}
          animate={{ opacity: demo.fading ? 0 : 1 }}
          transition={{ duration: 0.45, ease: ease.inOut }}
        >
          <AnimatePresence initial={false}>
            {tree.rootIds.map((id) => (
              <Row key={id} tree={tree} id={id} depth={0} demo={demo} reduced={reduced} />
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>
    </div>
  );
}

type RowProps = {
  tree: TaskTree;
  id: string;
  depth: number;
  demo: ReturnType<typeof useDemo>;
  reduced: boolean;
};

function Row({ tree, id, depth, demo, reduced }: RowProps) {
  const task = tree.tasks[id];
  if (!task) return null;
  const isParent = task.childIds.length > 0;
  const { done, total } = progress(tree, id);
  const delay = demo.toggled ? toggleDelay(tree, demo.toggled, id) : 0;
  const { color } = effectiveColor(tree, NO_TAG_COLORS, id);

  return (
    <motion.li
      layout={reduced ? false : 'position'}
      className={styles.item}
      initial={reduced ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: dur.fast } }}
      transition={{ duration: dur.slow, ease: ease.out }}
    >
      <div
        className={styles.row}
        data-depth={depth}
        data-row-color={color ?? undefined}
        data-done={(color !== null && task.done) || undefined}
        data-inherited={(color !== null && depth > 0) || undefined}
        style={color ? ({ '--row-color': color } as CSSProperties) : undefined}
      >
        <Checkbox
          checked={task.done}
          label={`Mark "${task.title}" done`}
          delay={delay}
          onToggle={() => demo.toggle(id)}
        />
        <span className={styles.title}>
          <StrikeText done={task.done} delay={delay}>
            {task.title}
          </StrikeText>
        </span>
        {isParent ? (
          <span className={styles.meta}>
            <span className={styles.count} aria-label={`${done} of ${total} done`}>
              {done}/{total}
            </span>
            <span className={styles.badge}>Σ {effectiveDifficulty(tree, id)}</span>
          </span>
        ) : depth > 0 ? (
          <DifficultyIcon
            value={task.difficulty}
            dimmed={task.done}
            onChange={(d) => demo.setDifficulty(id, d)}
          />
        ) : null}
      </div>
      {isParent && (
        <ul className={styles.children}>
          <AnimatePresence initial={false}>
            {task.childIds.map((childId) => (
              <Row
                key={childId}
                tree={tree}
                id={childId}
                depth={depth + 1}
                demo={demo}
                reduced={reduced}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.li>
  );
}
