import { useEffect } from 'react';
import { detectImport } from '../lib/importDetect';
import { useImportDraft } from '../store/importDraft';
import { useUIStore } from '../store/ui';

const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const OVERLAYS = '[role="dialog"], [role="alertdialog"]';

/**
 * Power-user shortcut: pasting a Tasks backup or an AI task list anywhere on the page (outside
 * fields and dialogs) opens the Import dialog with it. Any other paste is left alone.
 */
export function usePasteImport(): void {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(TEXT_ENTRY) || document.querySelector(OVERLAYS)) return;
      if (useUIStore.getState().aiDialog !== null) return;
      const text = e.clipboardData?.getData('text') ?? '';
      const kind = text.trim() ? detectImport(text).kind : 'empty';
      if (kind !== 'backup' && kind !== 'ai') return;
      e.preventDefault();
      useImportDraft.getState().set({ text });
      useUIStore.getState().setAiDialog('paste');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);
}
