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

/* ------------------------------------------------------------------ *
 * Deployment self-healing.
 *
 * Hashed JS chunks are replaced on every deployment. A tab kept open across
 * a deploy (or a service worker holding an old precache) will request a chunk
 * that no longer exists; the static host's SPA fallback answers with
 * index.html (200 + HTML), so the dynamic import rejects and a lazy
 * destination dies behind the error boundary. Two guards make this recover
 * without the user touching DevTools:
 *
 *  1. `vite:preloadError` — Vite fires it when a lazy chunk import fails;
 *     reload once so the new index.html references the current hashes. A
 *     session flag prevents an infinite reload loop if the chunk is genuinely
 *     broken on the server.
 *  2. service-worker `controllerchange` — when a freshly installed worker
 *     takes control (skipWaiting + clientsClaim), reload so the new precache
 *     manifest and the page agree on asset hashes.
 * ------------------------------------------------------------------ */
const PRELOAD_RELOAD_FLAG = 'asa.preload-reloaded';

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    try {
      if (sessionStorage.getItem(PRELOAD_RELOAD_FLAG)) return;
      sessionStorage.setItem(PRELOAD_RELOAD_FLAG, '1');
    } catch {
      // Storage unavailable (private mode): fall through and reload anyway.
    }
    window.location.reload();
  });

  // A fully successful load means the current chunks work; clear the guard so
  // a genuinely later deployment can still trigger one recovery reload.
  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        sessionStorage.removeItem(PRELOAD_RELOAD_FLAG);
      } catch {
        // Ignore storage failures.
      }
    }, 4000);
  });

  if ('serviceWorker' in navigator) {
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swRefreshing) return;
      swRefreshing = true;
      window.location.reload();
    });

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
