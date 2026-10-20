import { lazy, Suspense, useEffect, useRef } from 'react';
import { useUIStore } from '../store/ui';

/*
 * The heavy, rarely opened dialogs live in their own chunks. Each one mounts the first time its
 * flag turns true and then stays mounted, so closing it still plays its exit animation and its
 * local state survives (the AI and import drafts are separate stores either way). Right after
 * the app mounts, every chunk is prefetched while the browser is idle, so the first open is
 * normally instant; if not, Suspense shows nothing for the few milliseconds the chunk needs.
 */
const loaders = {
  palette: () => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })),
  sheet: () => import('./ShortcutsSheet').then((m) => ({ default: m.ShortcutsSheet })),
  copy: () => import('./CopyForAiDialog').then((m) => ({ default: m.CopyForAiDialog })),
  importAi: () => import('./ImportFromAiDialog').then((m) => ({ default: m.ImportFromAiDialog })),
  backup: () => import('./ExportBackupDialog').then((m) => ({ default: m.ExportBackupDialog })),
  deleteAccount: () =>
    import('./DeleteAccountDialog').then((m) => ({ default: m.DeleteAccountDialog })),
  paste: () => import('./ImportDialog').then((m) => ({ default: m.ImportDialog })),
  tagColors: () => import('./TagColorsDialog').then((m) => ({ default: m.TagColorsDialog })),
};

const CommandPalette = lazy(loaders.palette);
const ShortcutsSheet = lazy(loaders.sheet);
const CopyForAiDialog = lazy(loaders.copy);
const ImportFromAiDialog = lazy(loaders.importAi);
const ExportBackupDialog = lazy(loaders.backup);
const DeleteAccountDialog = lazy(loaders.deleteAccount);
const ImportDialog = lazy(loaders.paste);
const TagColorsDialog = lazy(loaders.tagColors);

/** Loads every dialog chunk when the browser is idle (or after 2 s where that API is missing). */
export function prefetchDialogs(): () => void {
  const run = () => Object.values(loaders).forEach((load) => void load().catch(() => {}));
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 4000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(run, 2000);
  return () => clearTimeout(id);
}

/** True from the first render in which `open` was true, for the rest of the component's life. */
function useEverOpen(open: boolean): boolean {
  const ever = useRef(open);
  if (open) ever.current = true;
  return ever.current;
}

export function LazyDialogs() {
  const palette = useEverOpen(useUIStore((s) => s.paletteOpen));
  const sheet = useEverOpen(useUIStore((s) => s.sheetOpen));
  const copy = useEverOpen(useUIStore((s) => s.aiDialog === 'copy'));
  const importAi = useEverOpen(useUIStore((s) => s.aiDialog === 'import'));
  const backup = useEverOpen(useUIStore((s) => s.aiDialog === 'export'));
  const paste = useEverOpen(useUIStore((s) => s.aiDialog === 'paste'));
  const deleteAccount = useEverOpen(useUIStore((s) => s.deleteAccountOpen));
  const tagColors = useEverOpen(useUIStore((s) => s.tagColorsOpen));

  useEffect(() => {
    return prefetchDialogs();
  }, []);

  return (
    <Suspense fallback={null}>
      {palette && <CommandPalette />}
      {sheet && <ShortcutsSheet />}
      {copy && <CopyForAiDialog />}
      {importAi && <ImportFromAiDialog />}
      {backup && <ExportBackupDialog />}
      {paste && <ImportDialog />}
      {deleteAccount && <DeleteAccountDialog />}
      {tagColors && <TagColorsDialog />}
    </Suspense>
  );
}
