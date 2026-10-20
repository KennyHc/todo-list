import { defineConfig, devices } from '@playwright/test';

const PORT = 5176;

export default defineConfig({
  testDir: 'e2e',
  timeout: 15_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Also makes the intro animation instant.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-chromium',
      // Pixel 7 is Chromium-based and already has hasTouch and isMobile set.
      use: { ...devices['Pixel 7'], hasTouch: true, isMobile: true },
    },
  ],
  // The dev server, not a preview build: the service worker is off in dev, so it cannot cache
  // anything between tests, and VITE_USE_EMULATORS=1 switches Auth and Firestore to the
  // emulators and installs window.__e2e (see src/test/e2eHook.ts).
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_USE_EMULATORS: '1',
      // Placeholders so a checkout without .env.local (CI) still initialises the SDK.
      VITE_FIREBASE_API_KEY: 'e2e-fake-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
      VITE_FIREBASE_PROJECT_ID: 'tasks-app-956r6',
      VITE_FIREBASE_APP_ID: '1:1:web:e2e',
    },
  },
});
