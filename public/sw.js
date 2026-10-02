/**
 * NASA Learn Web - Dedicated Offline Service Worker with Background Sync Manager
 * Caches critical NASA assets, APOD daily images, and automatically re-syncs
 * pending mission telemetry once connectivity is restored.
 */

const CACHE_NAME_SHELL = 'nasa-app-shell-v2';
const CACHE_NAME_APOD = 'nasa-apod-data-v2';
const CACHE_NAME_MISSIONS = 'nasa-mission-telemetry-v2';
const CACHE_NAME_IMAGES = 'nasa-imagery-cache-v2';

const SYNC_TAG_TELEMETRY = 'sync-nasa-telemetry';
const DB_NAME = 'nasa_telemetry_sync_db';
const DB_VERSION = 1;
const DB_STORE = 'pending_requests';

// Static Shell Assets to Pre-cache on Install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/api/apod',
  '/api/iss',
  '/api/epic',
  '/api/asteroids',
  '/api/missions'
];

// --- IndexedDB Helper for Persistent Background Sync Queue ---
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'url' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueuePendingRequest(url, category = 'telemetry') {
  try {
    const db = await openSyncDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.put({
      url,
      category,
      timestamp: Date.now()
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    notifyClientsQueueStatus();
  } catch (err) {
    // Non-fatal queue fallback
  }
}

async function getPendingRequests() {
  try {
    const db = await openSyncDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const request = store.getAll();
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = reject;
    });
  } catch {
    return [];
  }
}

async function deletePendingRequest(url) {
  try {
    const db = await openSyncDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.delete(url);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    notifyClientsQueueStatus();
  } catch {}
}

async function clearPendingRequests() {
  try {
    const db = await openSyncDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    notifyClientsQueueStatus();
  } catch {}
}

async function notifyClientsQueueStatus() {
  try {
    const pending = await getPendingRequests();
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: 'SYNC_QUEUE_STATUS',
        pendingCount: pending.length,
        items: pending
      });
    }
  } catch {}
}

// --- Background Re-Sync Engine ---
async function processTelemetrySyncQueue() {
  const pending = await getPendingRequests();
  if (pending.length === 0) return;

  // Broadcast sync start
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({
      type: 'SYNC_STARTED',
      pendingCount: pending.length
    });
  }

  let syncedCount = 0;

  for (const item of pending) {
    try {
      const response = await fetch(item.url, { cache: 'reload' });
      if (response && response.status === 200) {
        // Cache in proper store
        const cacheName = item.url.includes('/api/apod') ? CACHE_NAME_APOD : CACHE_NAME_MISSIONS;
        const cache = await caches.open(cacheName);
        await cache.put(item.url, response.clone());
        await deletePendingRequest(item.url);
        syncedCount++;
      }
    } catch {
      // Keep in queue for next connectivity attempt
    }
  }

  // Broadcast sync completed
  const remaining = await getPendingRequests();
  for (const client of clients) {
    client.postMessage({
      type: 'SYNC_COMPLETED',
      syncedCount,
      remainingCount: remaining.length,
      timestamp: new Date().toLocaleTimeString()
    });
  }
}

// 1. Install Event: Pre-cache core shell & initial NASA telemetry
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME_SHELL).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          const res = await fetch(asset, { cache: 'no-cache' });
          if (res.ok) {
            await cache.put(asset, res);
          }
        } catch (_) {}
      }
    })
  );
});

// 2. Activate Event: Clean up outdated caches & claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (
              key !== CACHE_NAME_SHELL &&
              key !== CACHE_NAME_APOD &&
              key !== CACHE_NAME_MISSIONS &&
              key !== CACHE_NAME_IMAGES
            ) {
              return caches.delete(key);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// 3. Background Sync Event (Standard Web Background Sync API)
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG_TELEMETRY || event.tag === 'sync-nasa-telemetry') {
    event.waitUntil(processTelemetrySyncQueue());
  }
});

// 4. Message Event: Direct client-to-worker synchronization triggers & status requests
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'SYNC_TELEMETRY_NOW') {
    processTelemetrySyncQueue();
  } else if (data.type === 'GET_SYNC_QUEUE_STATUS') {
    notifyClientsQueueStatus();
  } else if (data.type === 'CLEAR_SYNC_QUEUE') {
    clearPendingRequests();
  }
});

// 5. Fetch Event: Intelligent multi-tier routing & automatic queueing on network failure
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Skip Vite dev websocket
  if (url.pathname.includes('vite-hmr') || url.pathname.includes('/@vite')) {
    return;
  }

  // --- Strategy A: APOD Daily Image & Imagery (Cache-First with Background Revalidation) ---
  const isImageRequest = 
    request.destination === 'image' ||
    url.hostname.includes('nasa.gov') ||
    url.hostname.includes('unsplash.com') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp');

  if (isImageRequest) {
    event.respondWith(
      caches.open(CACHE_NAME_IMAGES).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return cachedResponse || new Response('', { status: 408, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // --- Strategy B: NASA APOD Endpoint (Network-First with Cache Fallback & Auto-Sync Queue) ---
  if (url.pathname.startsWith('/api/apod')) {
    event.respondWith(
      caches.open(CACHE_NAME_APOD).then(async (cache) => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (netErr) {
          // Network failed: Enqueue for background sync and register sync tag
          enqueuePendingRequest(request.url, 'APOD Daily Telemetry');
          if (self.registration && 'sync' in self.registration) {
            self.registration.sync.register(SYNC_TAG_TELEMETRY).catch(() => {});
          }

          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const baseCached = await cache.match('/api/apod');
          if (baseCached) return baseCached;
          throw netErr;
        }
      })
    );
    return;
  }

  // --- Strategy C: NASA Mission Data (Network-First with Cache Fallback & Auto-Sync Queue) ---
  if (
    url.pathname.startsWith('/api/iss') ||
    url.pathname.startsWith('/api/epic') ||
    url.pathname.startsWith('/api/asteroids') ||
    url.pathname.startsWith('/api/exoplanets') ||
    url.pathname.startsWith('/api/nasa-archive') ||
    url.pathname.startsWith('/api/missions')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME_MISSIONS).then(async (cache) => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (netErr) {
          // Network failed: Enqueue for background sync and register sync tag
          enqueuePendingRequest(request.url, 'NASA Mission Telemetry');
          if (self.registration && 'sync' in self.registration) {
            self.registration.sync.register(SYNC_TAG_TELEMETRY).catch(() => {});
          }

          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          throw netErr;
        }
      })
    );
    return;
  }

  // --- Strategy D: App Shell & Navigation (Stale-While-Revalidate) ---
  event.respondWith(
    caches.open(CACHE_NAME_SHELL).then(async (cache) => {
      const cachedResponse = await cache.match(request);

      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        return await fetchPromise;
      } catch (_) {
        if (request.mode === 'navigate') {
          const rootCached = await cache.match('/');
          if (rootCached) return rootCached;
        }
        return new Response('NASA Offline Mode Active', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })
  );
});
