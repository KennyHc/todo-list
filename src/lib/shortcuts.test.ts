import { describe, expect, it } from 'vitest';
import { shortcutGroups } from './shortcuts';

describe('shortcutGroups', () => {
  it('lists ⌘Z Undo under General, with and without the Today view', () => {
    for (const todayView of [true, false]) {
      const general = shortcutGroups(todayView).find((g) => g.title === 'General')!;
      expect(general.items).toContainEqual({ label: 'Undo', keys: [['mod', 'Z']] });
    }
  });
});
