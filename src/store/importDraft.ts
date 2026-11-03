import { create } from 'zustand';

/** The Import dialog's pasted text and mode, kept for the session (not persisted). */
type ImportDraft = {
  text: string;
  mode: 'add' | 'replace';
  set: (patch: Partial<Omit<ImportDraft, 'set' | 'reset'>>) => void;
  reset: () => void;
};

const initial = { text: '', mode: 'add' as const };

export const useImportDraft = create<ImportDraft>()((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));
