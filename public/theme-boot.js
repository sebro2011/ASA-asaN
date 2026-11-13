/* Theme boot.
 *
 * Resolve the stored appearance before the first paint so the workspace never
 * flashes the wrong palette. This used to be an inline <script> in index.html;
 * it lives in its own file because a nonce cannot be injected into a statically
 * served HTML document, and an inline script forces `script-src 'unsafe-inline'`
 * on the whole application. A blocking, same-origin script in <head> runs before
 * the body is parsed, so the guarantee is unchanged.
 *
 * Mirrors src/app/theme.ts — keep the two in step.
 */
(function () {
  try {
    var stored = localStorage.getItem('nova_theme') || 'light';
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    var theme = stored === 'system' ? (prefersLight ? 'light' : 'dark') : stored === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-nova-theme', theme);
    if (localStorage.getItem('nova_motion') === 'reduced') {
      document.documentElement.setAttribute('data-nova-motion', 'reduced');
    }
    if (localStorage.getItem('nova_contrast') === 'high') {
      document.documentElement.setAttribute('data-nova-contrast', 'high');
    }
  } catch (e) {
    /* storage blocked: the default theme is already on <html> */
  }
})();
