import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production' || process.env.NODE_ENV === 'production';
  return {
    define: {
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : (process.env.NODE_ENV || 'production')),
    },
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // `auto` injects an inline registration script into index.html, which is
        // the other reason script-src needed 'unsafe-inline'. An external
        // /registerSW.js keeps the CSP at 'self'.
        injectRegister: 'script',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'manifest.json'],
        manifest: false, // Use public/manifest.json directly
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          // Navigations fall back to the cached app shell. That must never apply
          // to the API: otherwise opening /api/nova/config in a tab (or curling
          // it from a browser session) returns index.html instead of JSON, which
          // is exactly how a healthy endpoint looks broken.
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
          // The social preview is fetched by crawlers, never by the app, so it has
          // no business in the offline precache (it is also the largest image).
          globIgnores: ['**/brand/og-image.png'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/apod'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'nasa-apod-data',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              // POWER responses carry retrieval timestamps and have their own
              // provenance-aware cache. A service-worker fallback would return
              // old data without marking it cached, so do not cache it here.
              urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/api/earth/') && url.pathname !== '/api/earth/power',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'earth-intelligence-api',
                networkTimeoutSeconds: 12,
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 3 // 3 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              // NASA GIBS imagery tiles: CacheFirst so panning/zooming back over
              // previously seen areas is instant and works offline.
              urlPattern: ({ url }) => url.hostname.endsWith('gibs.earthdata.nasa.gov'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'gibs-imagery-tiles',
                expiration: {
                  maxEntries: 400,
                  maxAgeSeconds: 60 * 60 * 24 * 21 // 21 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: ({ url }) => 
                url.pathname.startsWith('/api/iss') ||
                url.pathname.startsWith('/api/epic') ||
                url.pathname.startsWith('/api/asteroids') ||
                url.pathname.startsWith('/api/exoplanets') ||
                url.pathname.startsWith('/api/nasa-archive') ||
                url.pathname.startsWith('/api/missions'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'nasa-mission-telemetry',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 14 // 14 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              // Only image requests belong in this long-lived cache. Matching
              // hostnames also captured NASA JSON and made it stale for 60 days.
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'nasa-imagery-assets',
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 60 * 24 * 60 // 60 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: true,
          type: 'module'
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        three: path.resolve(__dirname, 'node_modules/three'),
        '@react-three/fiber': path.resolve(__dirname, 'node_modules/@react-three/fiber'),
        '@react-three/drei': path.resolve(__dirname, 'node_modules/@react-three/drei'),
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
      dedupe: [
        'three',
        '@react-three/fiber',
        '@react-three/drei',
        '@react-three/postprocessing',
        'postprocessing',
        'react',
        'react-dom',
        'react-i18next',
        'framer-motion'
      ],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-i18next',
        'i18next',
        'framer-motion',
        'three',
        '@react-three/fiber',
        '@react-three/drei',
      ],
      dedupe: [
        'three',
        '@react-three/fiber',
        '@react-three/drei',
        '@react-three/postprocessing',
        'postprocessing',
        'react',
        'react-dom',
        'react-i18next',
        'framer-motion'
      ],
    },
    server: {
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Allow proxied sandbox preview hosts (e.g. *.e2b.app) to reach the dev server
      allowedHosts: true,
    },
  };
});
