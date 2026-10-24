/**
 * Application entry point.
 *
 * Deliberately free of console/fetch monkey-patching: a host that suppresses
 * console output and rejected promises also suppresses the evidence needed to
 * diagnose a failing API. Failures are surfaced in the UI instead (see
 * `src/hooks/useApiResource.ts` and the components that consume it).
 */
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import i18n from './i18n.ts';
import { I18nextProvider } from 'react-i18next';
import { TrilingualProvider } from './context/TrilingualProvider.jsx';
import App from './App.tsx';
import './index.css';

// Register Service Worker for offline NASA assets and APOD caching
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                installingWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            };
          }
        };
      })
      .catch(() => {
        // Non-fatal registration in preview containers
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <TrilingualProvider>
        <App />
      </TrilingualProvider>
    </I18nextProvider>
  </StrictMode>,
);
