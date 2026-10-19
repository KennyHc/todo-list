import { create } from 'zustand';

/**
 * The import dialog's inputs, kept for the session (not persisted) so switching to the chatbot
 * and back never loses the goal or the pasted reply.
 */
type AiDraft = {
  step: 1 | 2;
  goal: string;
  includeContext: boolean;
  reply: string;
  mode: 'add' | 'replace';
  set: (patch: Partial<Omit<AiDraft, 'set' | 'reset'>>) => void;
  reset: () => void;
};

const initial = {
  step: 1 as const,
  goal: '',
  includeContext: false,
  reply: '',
  mode: 'add' as const,
};

export const useAiDraft = create<AiDraft>()((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));
