import { defineConfig } from 'vitest/config';

// Runs under `firebase emulators:exec`, which provides the emulator host variables.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/emulator/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
