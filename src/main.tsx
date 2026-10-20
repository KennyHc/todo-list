import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { AuthGate } from './AuthGate';
import { initAuth } from './store/auth';
import { initInstall } from './pwa/install';
import { registerServiceWorker } from './pwa/registerSW';
import { initTheme } from './store/theme';

initTheme();
initAuth();
initInstall();
if (import.meta.env.PROD) registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
