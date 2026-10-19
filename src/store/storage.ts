import { createJSONStorage } from 'zustand/middleware';

/** The single place that picks the persistence backend (swap for Capacitor Preferences later). */
export const taskStorage = <S>() => createJSONStorage<S>(() => localStorage);
