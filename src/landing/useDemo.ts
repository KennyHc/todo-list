import { useCallback, useEffect, useRef, useState } from 'react';
import type { Difficulty, TaskTree } from '../types';
import { addTask, emptyTree, toggleDone, updateTask } from '../lib/tree';

export const DEMO_TITLE = 'Plan a weekend trip';
/** The parent's explicit colour; its subtasks inherit it, so the demo shows the row edge. */
export const DEMO_COLOR = '#C9B8F2';
export const DEMO_SUBTASKS: { title: string; difficulty: Difficulty }[] = [
  { title: 'Book the cabin', difficulty: 3 },
  { title: 'Pack hiking gear', difficulty: 2 },
  { title: 'Invite friends', difficulty: 1 },
];

const TYPE_STEP = 45;
const PAUSE_AFTER_INTERACTION = 6000;
const FADE_MS = 500;

/** The finished-looking list used for reduced motion (and as a stable fallback). */
export function buildDemoTree(checked: number): { tree: TaskTree; parentId: string } {
  let tree = emptyTree();
  const parent = addTask(tree, { title: DEMO_TITLE, color: DEMO_COLOR });
  tree = parent.tree;
  const childIds: string[] = [];
  for (const sub of DEMO_SUBTASKS) {
    const child = addTask(tree, { ...sub, parentId: parent.id });
    tree = child.tree;
    childIds.push(child.id);
  }
  for (const id of childIds.slice(0, checked)) tree = toggleDone(tree, id);
  return { tree, parentId: parent.id };
}

export type Demo = {
  tree: TaskTree;
  typed: string;
  fading: boolean;
  /** Last toggled task, for cascade delays. */
  toggled: string | null;
  toggle: (id: string) => void;
  setDifficulty: (id: string, d: Difficulty) => void;
};

/**
 * Self-contained autoplay for the landing demo. `enabled` switches the script off entirely
 * (tests, reduced motion); `active` is false while offscreen / tab hidden.
 */
export function useDemo({
  enabled,
  active,
  initial,
}: {
  enabled: boolean;
  active: boolean;
  initial?: TaskTree;
}): Demo {
  const [tree, setTreeState] = useState<TaskTree>(initial ?? emptyTree);
  const [typed, setTyped] = useState('');
  const [fading, setFading] = useState(false);
  const [toggled, setToggled] = useState<string | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [loop, setLoop] = useState(0);

  const treeRef = useRef(tree);
  const setTree = useCallback((next: TaskTree) => {
    treeRef.current = next;
    setTreeState(next);
  }, []);

  // Any touch pauses the script for a while, then a fresh loop starts.
  useEffect(() => {
    if (!interacted) return;
    const timer = setTimeout(() => {
      setInteracted(false);
      setLoop((n) => n + 1);
    }, PAUSE_AFTER_INTERACTION);
    return () => clearTimeout(timer);
  }, [interacted]);

  const running = enabled && active && !interacted;
  useEffect(() => {
    if (!running) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    setTree(emptyTree());
    setTyped('');
    setFading(false);
    setToggled(null);

    let t = 500;
    for (let i = 1; i <= DEMO_TITLE.length; i++) {
      at(t + i * TYPE_STEP, () => setTyped(DEMO_TITLE.slice(0, i)));
    }
    t += DEMO_TITLE.length * TYPE_STEP + 350;

    let parentId = '';
    const childIds: string[] = [];
    at(t, () => {
      const res = addTask(treeRef.current, { title: DEMO_TITLE, color: DEMO_COLOR });
      parentId = res.id;
      setTyped('');
      setTree(res.tree);
    });
    DEMO_SUBTASKS.forEach((sub, i) => {
      at(t + 500 + i * 420, () => {
        const res = addTask(treeRef.current, { ...sub, parentId });
        childIds.push(res.id);
        setTree(res.tree);
      });
    });
    t += 500 + DEMO_SUBTASKS.length * 420 + 600;

    // Each subtask, then the parent: checking the subtasks never completes it (#74).
    DEMO_SUBTASKS.forEach((_, i) => {
      at(t + i * 900, () => {
        setToggled(childIds[i]);
        setTree(toggleDone(treeRef.current, childIds[i]));
      });
    });
    t += DEMO_SUBTASKS.length * 900;
    at(t, () => {
      setToggled(parentId);
      setTree(toggleDone(treeRef.current, parentId));
    });
    t += 2400;

    at(t, () => setFading(true));
    at(t + FADE_MS, () => setLoop((n) => n + 1));

    return () => timers.forEach(clearTimeout);
  }, [running, loop, setTree]);

  const toggle = useCallback(
    (id: string) => {
      setInteracted(true);
      setTyped('');
      setFading(false);
      setToggled(id);
      setTree(toggleDone(treeRef.current, id));
    },
    [setTree],
  );

  const setDifficulty = useCallback(
    (id: string, d: Difficulty) => {
      setInteracted(true);
      setTyped('');
      setFading(false);
      setTree(updateTask(treeRef.current, id, { difficulty: d }));
    },
    [setTree],
  );

  return { tree, typed, fading, toggled, toggle, setDifficulty };
}
