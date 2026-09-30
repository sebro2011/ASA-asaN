// Ensure window.fetch has both getter and setter so third-party polyfills don't throw TypeError
if (typeof window !== 'undefined') {
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
import './i18n.ts';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
