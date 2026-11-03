import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { AuthGate } from './AuthGate';
import { initAuth } from './store/auth';
import { initInstall } from './pwa/install';
import { capturePendingText } from './pwa/newTaskShortcut';
import { registerServiceWorker } from './pwa/registerSW';
import { initTheme } from './store/theme';

initTheme();
// ?add= / share-target text waits in sessionStorage until the composer exists (after sign-in).
capturePendingText();
initAuth();
initInstall();
if (import.meta.env.PROD) registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
