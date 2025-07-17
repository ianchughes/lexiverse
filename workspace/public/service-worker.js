// A robust, production-ready service worker
// v1.0

const CACHE_NAME = 'lexiverse-cache-v1';

// We only want to cache the shell of the application, not every single asset.
// The build process of Next.js already handles content hashing for cache-busting of JS/CSS chunks.
// Caching the main pages ensures the app can load offline, and the dynamic assets will be fetched from the network.
const urlsToCache = [
  '/',
  '/manifest.json',
  '/favicon.ico', // Assuming you have one
  '/icons/icon-192x192.png', // Example icon path from manifest
  '/icons/icon-512x512.png', // Example icon path from manifest
];

// 1. Install the service worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        // Add all the assets to the cache
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force the waiting service worker to become the active service worker.
        return self.skipWaiting();
      })
  );
});

// 2. Activate the service worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // If the cache name is not our current one, delete it.
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
        // Tell the active service worker to take control of the page immediately.
        return self.clients.claim();
    })
  );
});


// 3. Fetch event - Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  // For navigation requests, use a network-first strategy to ensure users get the latest HTML.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/')) // Fallback to the cached root page on network error
    );
    return;
  }

  // For other requests (CSS, JS, images), use a cache-first strategy.
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // If the request is in the cache, return it.
        if (response) {
          return response;
        }
        
        // Otherwise, fetch the request from the network.
        return fetch(event.request).then((networkResponse) => {
            // OPTIONAL: You could cache non-essential dynamic assets here, but it's often not necessary with Next.js's setup.
            // For example, to cache images on-the-fly:
            // if (event.request.destination === 'image') {
            //     let responseToCache = networkResponse.clone();
            //     caches.open(CACHE_NAME).then((cache) => {
            //         cache.put(event.request, responseToCache);
            //     });
            // }
            return networkResponse;
        });

      }).catch((error) => {
        // This catch handles errors from both caches.match and fetch.
        // You could return a custom offline page here if you had one.
        console.warn('[Service Worker] Fetch failed; returning offline page if available.', error);
        // e.g., return caches.match('/offline.html');
      })
  );
});
