
// Basic service worker for PWA functionality (caching strategy)
const CACHE_NAME = 'lexiverse-cache-v1';
const urlsToCache = [
  '/',
  '/offline.html', // Placeholder for an offline page - you'd need to create this
  // Add other important assets you want to cache (e.g., CSS, JS bundles if not automatically handled by Next.js PWA solutions)
  // Be careful with caching dynamic Next.js pages without a proper strategy.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        // Add core assets that make up the app shell
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })));
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Basic cache-first strategy for GET requests
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            return response; // Serve from cache
          }
          // Not in cache, fetch from network
          return fetch(event.request).then(
            (networkResponse) => {
              // Optionally, cache the new response if it's a valid one
              if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                // IMPORTANT: Clone the response. A response is a stream
                // and because we want the browser to consume the response
                // as well as the cache consuming the response, we need
                // to clone it so we have two streams.
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(event.request, responseToCache);
                  });
              }
              return networkResponse;
            }
          ).catch(() => {
            // If both cache and network fail, you could serve an offline fallback page
            // For example, if you cached '/offline.html'
             if (event.request.mode === 'navigate') {
                return caches.match('/offline.html');
             }
             return undefined; // Or a more generic error response
          });
        })
    );
  }
});
