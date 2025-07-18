// A robust service worker with cache-first strategy and cache versioning.

const CACHE_NAME = 'lexiverse-cache-v1';
const OFFLINE_URL = 'offline.html';

// On install, pre-cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache. Caching offline page.');
      // Pre-caching the offline page is crucial.
      // Other critical assets like manifest, main icon, etc., can also be added here.
      return cache.addAll([
          OFFLINE_URL,
          '/manifest.json',
          // Add other critical, non-versioned assets if needed
          // e.g., '/icons/icon-192x192.png'
      ]);
    })
  );
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
});

// On activate, clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Enable navigation preloading if it's supported.
      // This allows the browser to start fetching the page while the service worker is starting up.
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
      
      // Remove old caches to save space and avoid conflicts.
      const cacheNames = await caches.keys();
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })()
  );
  // Tell the active service worker to take control of the page immediately.
  self.clients.claim();
});


// On fetch, implement cache-first strategy
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests for web pages and assets
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
      return;
  }
  
  // For navigation requests (e.g., loading a new page), try network first, then cache, then offline page.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // First, try to use the navigation preload response if it's available.
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }

          // Always try the network first for navigation to get the freshest content.
          const networkResponse = await fetch(event.request);
          // If successful, cache the new response for future offline use.
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          // The network failed, so we try to serve from the cache.
          console.log('Network request failed, trying cache for:', event.request.url);
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // If the request is not in the cache, show the offline page.
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage;
        }
      })()
    );
  } else { // For non-navigation requests (JS, CSS, images)
    // Use a cache-first strategy.
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Return the cached response if it exists.
        if (cachedResponse) {
          return cachedResponse;
        }

        // If not in cache, fetch from the network.
        return fetch(event.request).then((networkResponse) => {
          // Cache the new response for future use.
          return caches.open(CACHE_NAME).then((cache) => {
            // We only cache successful responses (status 200)
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
  }
});
