export {};

declare global {
  interface Window {
    __e2e?: {
      signIn: (sub: string, email?: string) => Promise<void>;
      deleteAccount: () => Promise<void>;
      setDueDate: (title: string, dueDate: string | null) => Promise<void>;
      restoreTasks: (count: number) => Promise<void>;
      setNotes: (title: string, notes: string) => Promise<void>;
    };
  }
}
