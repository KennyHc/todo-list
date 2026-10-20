import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      // The user decides when to swap in a new version (see src/pwa/registerSW.ts).
      registerType: 'prompt',
      injectRegister: null,
      // public/manifest.webmanifest stays the source of truth and is linked from index.html.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        // Never answer these from the SW: Firebase's auth handler and the static legal pages.
        navigateFallbackDenylist: [/^\/__\//, /^\/privacy\.html$/, /^\/terms\.html$/],
        // Served as plain files (and excluded from the SPA fallback above); no need to precache.
        globIgnores: ['privacy.html', 'terms.html', 'og-image.*'],
        cleanupOutdatedCaches: true,
        // The main bundle is ~1.2 MB; leave headroom for growth.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // No runtimeCaching: the Firebase SDKs handle their own offline persistence.
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: 'src/test/setup.ts',
    alias: {
      'virtual:pwa-register': fileURLToPath(
        new URL('./src/pwa/stubRegisterSW.ts', import.meta.url),
      ),
    },
    // Emulator tests need running emulators: `npm run test:emulators`.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
