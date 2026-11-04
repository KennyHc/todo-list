import type { Auth } from 'firebase/auth';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';

declare global {
  interface Window {
    __e2e?: {
      /** Signs in through the Auth emulator as a fake Google user (no popup). */
      signIn: (sub: string, email?: string) => Promise<void>;
      /** Deletes the account with the re-authentication step stubbed out. */
      deleteAccount: () => Promise<void>;
      /** Sets the due date of the open task with this exact title (e.g. a past date). */
      setDueDate: (title: string, dueDate: string | null) => Promise<void>;
      /** Replaces the list with `count` plain root tasks in one change, like restoring a backup. */
      restoreTasks: (count: number) => Promise<void>;
      /** Sets the note of the open task with this exact title. */
      setNotes: (title: string, notes: string) => Promise<void>;
    };
  }
}

/**
 * Playwright's entry point into the app. Only `src/lib/firebase.ts` imports this, behind
 * `import.meta.env.DEV && VITE_USE_EMULATORS === '1'`, so it never reaches a production bundle.
 */
export function installE2eHook(auth: Auth): void {
  window.__e2e = {
    async signIn(sub, email = `${sub}@e2e.test`) {
      const credential = GoogleAuthProvider.credential(
        JSON.stringify({ sub, email, email_verified: true, name: 'E2E' }),
      );
      await signInWithCredential(auth, credential);
    },
    async deleteAccount() {
      const { deleteAccount } = await import('../sync/deleteAccount');
      await deleteAccount({ reauthenticate: async () => {} });
    },
    async setDueDate(title, dueDate) {
      const { useTaskStore } = await import('../store/tasks');
      const { tasks, update } = useTaskStore.getState();
      const found = Object.values(tasks).find((t) => t.title === title && !t.done);
      if (!found) throw new Error(`no open task titled "${title}"`);
      update(found.id, { dueDate });
    },
    async restoreTasks(count) {
      const { useTaskStore } = await import('../store/tasks');
      const { settings, replaceAll } = useTaskStore.getState();
      const now = Date.now();
      const tasks = Object.fromEntries(
        Array.from({ length: count }, (_, i) => {
          const id = `restored-${now}-${i}`;
          return [
            id,
            {
              id,
              title: `Restored ${i + 1}`,
              difficulty: 1 as const,
              color: null,
              done: false,
              collapsed: false,
              tags: [],
              dueDate: null,
              repeat: null,
              plannedFor: null,
              startDate: null,
              parentId: null,
              childIds: [],
              createdAt: now,
            },
          ];
        }),
      );
      replaceAll(
        { tasks, rootIds: Object.keys(tasks), history: [], tagColors: {}, settings },
        `Restored backup (${count} tasks)`,
      );
    },
    async setNotes(title, notes) {
      const { useTaskStore } = await import('../store/tasks');
      const { tasks, update } = useTaskStore.getState();
      const found = Object.values(tasks).find((t) => t.title === title && !t.done);
      if (!found) throw new Error(`no open task titled "${title}"`);
      update(found.id, { notes });
    },
  };
}
