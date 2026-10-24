import { hiddenUntilStart } from '../lib/tree';
import { todayISO, visibleTreeIds } from '../lib/views';
import { useTaskStore } from './tasks';
import { useUIStore } from './ui';

/**
 * Show a task wherever it lives: switch to the tree, drop a tag filter that hides it, expand
 * its collapsed ancestors, show the tasks that start later if it is one of them, focus it and
 * pulse it. TaskItem scrolls it into view once mounted.
 */
export function revealTask(id: string): void {
  const tasks = useTaskStore.getState();
  if (!tasks.tasks[id]) return;
  const ui = useUIStore.getState();
  ui.setPaletteOpen(false);
  ui.setView('tree');
  if (ui.tagFilter !== null && !visibleTreeIds(tasks, ui.tagFilter)?.has(id)) {
    ui.setTagFilter(null);
  }
  if (hiddenUntilStart(tasks, id, todayISO())) ui.setShowUpcoming(true);
  tasks.revealTask(id);
  ui.setFocusedId(id);
  ui.flashRow(id);
}
