const CACHE_NAME = 'conduit-v1';
const STATIC_ASSETS = [
  '/',
  '/about',
  '/streams',
  '/create',
  '/dashboard',
];

const ASSET_PATTERNS = [
  /\.(js|css|woff2|woff|ttf|eot)$/,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { url } = request;

  if (request.method !== 'GET') {
    return;
  }

  const isAsset = ASSET_PATTERNS.some((pattern) => pattern.test(url));
  const isStaticPage = STATIC_ASSETS.some((page) => url.includes(page));
  const isExternalRequest = !url.includes(self.location.origin);

  if (isExternalRequest) {
    return;
  }

  if (isAsset || isStaticPage) {
    event.respondWith(
      caches.match(request).then((response) => {
        if (response) {
          return response;
        }

        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        });
      })
        .catch(() => {
          return caches.match(request);
        }),
    );
  }
});
