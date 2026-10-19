import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { AuthGate } from './AuthGate';
import { initAuth } from './store/auth';
import { initTheme } from './store/theme';

initTheme();
initAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
