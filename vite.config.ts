import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vitest/config';

/**
 * Long-lived vendor chunks, so an app release does not invalidate them. Only `firestore` and
 * `dnd` are lazy; the rest is what a signed-out visitor needs. Firestore depends on the shared
 * Firebase core (inside `firebase-auth`) and never the other way round, so there is no cycle.
 */
function manualChunks(id: string): string | undefined {
  const m = /node_modules\/(.+)$/.exec(id.replaceAll('\\', '/'));
  if (!m) return undefined;
  const path = m[1];
  if (/^(react|react-dom|scheduler)\//.test(path)) return 'react';
  if (/^(framer-motion|motion-dom|motion-utils)\//.test(path)) return 'motion';
  if (path.startsWith('@dnd-kit/')) return 'dnd';
  if (/^(@firebase\/firestore|firebase\/firestore|@grpc|@firebase\/webchannel-wrapper)/.test(path))
    return 'firestore';
  if (/^(@firebase|firebase|idb|tslib)\//.test(path)) return 'firebase-auth';
  return undefined;
}

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
        // A new deploy takes over at once instead of waiting for every tab to close or for a
        // "Reload" tap. Pages already open keep running until they reload (see registerSW.ts),
        // and older clients still on the waiting-SW code are rescued by the next plain reload.
        skipWaiting: true,
        clientsClaim: true,
        // Every JS chunk, lazy ones included, is precached so the app also starts offline.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // No runtimeCaching: the Firebase SDKs handle their own offline persistence.
      },
      devOptions: { enabled: false },
    }),
    // `npm run analyze` (ANALYZE=1) writes stats.html, a treemap of what each chunk holds.
    process.env.ANALYZE === '1' &&
      visualizer({ filename: 'stats.html', gzipSize: true, template: 'treemap' }),
  ],
  build: {
    // dist/.vite/manifest.json feeds scripts/check-bundle.mjs.
    manifest: true,
    // Firestore (~530 kB) is deliberately its own lazy chunk; scripts/check-bundle.mjs polices size.
    chunkSizeWarningLimit: 600,
    rollupOptions: { output: { manualChunks } },
  },
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
