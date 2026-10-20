/** A key combination: tokens pressed together. 'mod' and 'alt' render per platform. */
export type Combo = string[];

export type Shortcut = {
  label: string;
  /** Alternatives, any of which works. */
  keys: Combo[];
};

export type ShortcutGroup = { title: string; items: Shortcut[] };

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    items: [
      { label: 'Next row', keys: [['j'], ['↓']] },
      { label: 'Previous row', keys: [['k'], ['↑']] },
      { label: 'Expand', keys: [['→']] },
      { label: 'Collapse', keys: [['←']] },
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
    ],
  },
  {
    title: 'In the Reschedule menu',
    items: [
      { label: 'Today', keys: [['t']] },
      { label: 'Tomorrow', keys: [['m']] },
      { label: 'This weekend', keys: [['w']] },
      { label: 'Next week', keys: [['n']] },
    ],
  },
  {
    title: 'Views',
    items: [
      { label: 'Tree', keys: [['1']] },
      { label: 'By deadline', keys: [['2']] },
      { label: 'History', keys: [['3']] },
      { label: 'Filter by tag', keys: [['/']] },
    ],
  },
  {
    title: 'General',
    items: [
      { label: 'Command palette', keys: [['mod', 'K']] },
      { label: 'Keyboard shortcuts', keys: [['?']] },
      { label: 'Close', keys: [['Esc']] },
    ],
  },
];
