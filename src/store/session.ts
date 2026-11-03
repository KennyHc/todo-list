import { create } from 'zustand';

/** Things that are true only until the page is reloaded. */
type SessionState = {
  /** A task was completed in this session, so an emptied list is cause for a little celebration. */
  completedSomething: boolean;
  /** Today view suggestions the user dismissed with the cross. */
  dismissedSuggestions: string[];
  /** The one-time "try the Today view" hint has been shown in this session. */
  todayHintShown: boolean;
};

export const useSessionStore = create<SessionState>(() => ({
  completedSomething: false,
  dismissedSuggestions: [],
  todayHintShown: false,
}));

export const dismissSuggestion = (id: string) =>
  useSessionStore.setState((s) => ({ dismissedSuggestions: [...s.dismissedSuggestions, id] }));
