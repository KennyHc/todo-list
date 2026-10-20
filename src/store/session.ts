import { create } from 'zustand';

/** Things that are true only until the page is reloaded. */
type SessionState = {
  /** A task was completed in this session, so an emptied list is cause for a little celebration. */
  completedSomething: boolean;
};

export const useSessionStore = create<SessionState>(() => ({ completedSomething: false }));
