// Ensure window.fetch has both getter and setter so third-party polyfills don't throw TypeError
if (typeof window !== 'undefined') {
  // Suppress harmless Vite WebSocket HMR and timeout AbortError in preview environment
  try {
    const origErr = console.error;
    console.error = (...args: any[]) => {
      const msg = args.map(a => (a?.message || a?.stack || a?.toString?.() || '') + ' ' + a).join(' ').toLowerCase();
      if (
        msg.includes('websocket') || 
        msg.includes('closed without opened') || 
        msg.includes('request timeout') ||
        msg.includes('aborted') ||
        msg.includes('three.clock') ||
        msg.includes('multiple instances of three.js')
      ) {
        return;
      }
      origErr.apply(console, args);
    };

    const origWarn = console.warn;
    console.warn = (...args: any[]) => {
      const msg = args.map(a => (a?.message || a?.stack || a?.toString?.() || '') + ' ' + a).join(' ').toLowerCase();
      if (
        msg.includes('websocket') || 
        msg.includes('closed without opened') || 
        msg.includes('three.clock') ||
        msg.includes('three.timer') ||
        msg.includes('multiple instances of three.js')
      ) {
        return;
      }
      origWarn.apply(console, args);
    };
  } catch (_) {}

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(event.reason?.message || event.reason?.name || event.reason || '').toLowerCase();
    if (
      reasonStr.includes('websocket') || 
      reasonStr.includes('closed without opened') ||
      reasonStr.includes('aborted') || 
      reasonStr.includes('aborterror') ||
      reasonStr.includes('timeout') ||
      reasonStr.includes('request timeout') ||
      reasonStr.includes('session configuration is not supported') ||
      reasonStr.includes('notsupportederror')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = String(event.message || '').toLowerCase();
    if (
      msg.includes('websocket') || 
      msg.includes('closed without opened') ||
      msg.includes('aborted') || 
      msg.includes('aborterror') || 
      msg.includes('timeout') ||
      msg.includes('request timeout') ||
      msg.includes('session configuration is not supported') ||
      msg.includes('notsupportederror') ||
      event.filename?.includes('vite')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  try {
    let _activeFetch = window.fetch ? window.fetch.bind(window) : null;
    Object.defineProperty(window, 'fetch', {
      get() { return _activeFetch; },
      set(fn) { _activeFetch = fn; },
      configurable: true,
      enumerable: true
    });
  } catch (_) {
    // Ignore if already patched or constrained
  }
}

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
