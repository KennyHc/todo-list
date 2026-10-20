import type { Auth } from 'firebase/auth';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';

declare global {
  interface Window {
    __e2e?: {
      /** Signs in through the Auth emulator as a fake Google user (no popup). */
      signIn: (sub: string, email?: string) => Promise<void>;
      /** Deletes the account with the re-authentication step stubbed out. */
      deleteAccount: () => Promise<void>;
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
  };
}
