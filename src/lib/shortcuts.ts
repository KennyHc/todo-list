/** A key combination: tokens pressed together. 'mod' and 'alt' render per platform. */
export type Combo = string[];

export type Shortcut = {
  label: string;
  /** Alternatives, any of which works. */
  keys: Combo[];
};

export type ShortcutGroup = { title: string; items: Shortcut[] };

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    items: [
      { label: 'Next row', keys: [['j'], ['↓']] },
      { label: 'Previous row', keys: [['k'], ['↑']] },
      { label: 'First or last row', keys: [['Home'], ['End']] },
      { label: 'Expand, then the row’s buttons', keys: [['→']] },
      { label: 'Collapse, then the parent row', keys: [['←']] },
      { label: 'Back to the row from its buttons', keys: [['Esc']] },
      { label: 'Clear selection', keys: [['Esc']] },
    ],
  },
  {
    title: 'Tasks',
    items: [
      { label: 'New task', keys: [['n']] },
      { label: 'Complete or reopen', keys: [['x'], ['Space']] },
      { label: 'Edit title', keys: [['e'], ['↵']] },
      { label: 'Delete', keys: [['⌫']] },
      { label: 'Reschedule', keys: [['s']] },
      { label: 'Plan for today', keys: [['p']] },
      { label: 'Set difficulty', keys: [['alt', '1–5']] },
      {
        label: 'Move up or down',
        keys: [
          ['alt', '↑'],
          ['alt', '↓'],
        ],
      },
      {
        label: 'Indent or outdent',
        keys: [
          ['alt', '→'],
          ['alt', '←'],
        ],
      },
      { label: 'Week: previous or next day', keys: [['['], [']']] },
    ],
  },
  {
    title: 'In the Reschedule menu',
    items: [
      { label: 'Plan for today', keys: [['p']] },
      { label: 'Today', keys: [['t']] },
      { label: 'Tomorrow', keys: [['m']] },
      { label: 'This weekend', keys: [['w']] },
      { label: 'Next week', keys: [['n']] },
    ],
  },
  {
    title: 'Views',
    items: [
      { label: 'Today', keys: [['1']] },
      { label: 'Tree', keys: [['2']] },
      { label: 'By deadline', keys: [['3']] },
      { label: 'History', keys: [['4']] },
      { label: 'Week', keys: [['5']] },
      { label: 'Filter by tag', keys: [['/']] },
    ],
  },
  {
    title: 'General',
    items: [
      { label: 'Command palette', keys: [['mod', 'K']] },
      { label: 'Undo', keys: [['mod', 'Z']] },
      { label: 'Redo', keys: [['mod', '⇧', 'Z']] },
      { label: 'Keyboard shortcuts', keys: [['?']] },
      { label: 'Close', keys: [['Esc']] },
    ],
  },
];

/** Labels and keys that only exist while the Today view is on. */
const TODAY_ONLY = new Set(['Plan for today']);
const VIEW_KEYS_WITHOUT_TODAY: Record<string, string> = {
  Tree: '1',
  'By deadline': '2',
  History: '3',
  Week: '4',
};

/**
 * The shortcut list for what is on: without the Today view there is no `p`, no Plan for today
 * in the Reschedule menu, and the views are numbered 1-3 from the Tree.
 */
export function shortcutGroups(todayView: boolean): ShortcutGroup[] {
  if (todayView) return GROUPS;
  return GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter(
        (item) =>
          !TODAY_ONLY.has(item.label) && !(group.title === 'Views' && item.label === 'Today'),
      )
      .map((item) =>
        group.title === 'Views' && item.label in VIEW_KEYS_WITHOUT_TODAY
          ? { ...item, keys: [[VIEW_KEYS_WITHOUT_TODAY[item.label]]] }
          : item,
      ),
  }));
}
