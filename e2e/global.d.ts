export {};

declare global {
  interface Window {
    __e2e?: {
      signIn: (sub: string, email?: string) => Promise<void>;
      deleteAccount: () => Promise<void>;
    };
  }
}
