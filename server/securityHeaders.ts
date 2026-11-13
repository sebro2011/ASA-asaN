/**
 * Security headers, in one place and testable.
 *
 * The Content-Security-Policy used to be a string literal inside `server.ts`,
 * which meant no test could assert what production actually sent. It is built
 * here so `scripts/test-security-headers.mjs` can hold the two claims that
 * matter:
 *
 *   1. production ships no `'unsafe-inline'` in `script-src`;
 *   2. every origin the app actually talks to is allowed, and nothing else is.
 *
 * `'unsafe-inline'` was there for two reasons, and both are gone: React does not
 * use inline event attributes (it attaches listeners through the DOM), and the
 * two inline `<script>` blocks — the theme boot and the service-worker
 * registration — are now `public/theme-boot.js` and vite-plugin-pwa's external
 * `/registerSW.js`.
 */

export interface SecurityHeaderOptions {
  /** Production (`NODE_ENV === 'production'`) — the only mode that drops unsafe-inline. */
  isSecure: boolean;
}

export function buildCsp({ isSecure }: SecurityHeaderOptions): string {
  return [
    "default-src 'self'",
    // Dev needs 'unsafe-inline' for Vite's HMR client and 'unsafe-eval' for the
    // React refresh preamble. Production needs neither.
    isSecure
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Tailwind compiles to a stylesheet, but hundreds of components set inline
    // `style` attributes (Framer Motion, SVG geometry). Style values cannot
    // execute, so this stays — it is the one 'unsafe-inline' with no script path.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:", // NASA / YouTube thumbnails, GIBS tiles
    "connect-src 'self' https:", // API calls only
    "font-src 'self' data:",
    "media-src 'self' blob: https:",
    // APOD video entries are YouTube watch URLs, rewritten to /embed/. Both hosts
    // stay explicit — never `frame-src https:`.
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function securityHeaders({ isSecure }: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Content-Security-Policy': buildCsp({ isSecure }),
  };
  if (isSecure) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}
