import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'manifest.json'],
        manifest: false, // Use public/manifest.json directly
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
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
              urlPattern: ({ request, url }) => 
                request.destination === 'image' || 
                url.hostname.includes('nasa.gov') || 
                url.hostname.includes('unsplash.com'),
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
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 20,
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
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
      dedupe: ['react', 'react-dom', 'react-i18next', 'framer-motion', 'three', '@react-three/fiber', '@react-three/drei'],
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
      dedupe: ['react', 'react-dom', 'react-i18next', 'framer-motion', 'three', '@react-three/fiber', '@react-three/drei'],
    },
    server: {
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
