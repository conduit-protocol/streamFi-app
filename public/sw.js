// The build injects NEXT_PUBLIC_BUILD_ID during deployment. Keeping a
// deterministic build identifier here invalidates changed assets without a
// hand-edited cache bump. The fallback is changed by the deploy script when
// no build identifier is available.
const BUILD_ID = self.__CONDUIT_BUILD_ID__ || 'b72db71b7ced0578';
const CACHE_NAME = `conduit-${BUILD_ID}`;
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'REGISTER_BACKGROUND_SYNC' && 'sync' in self.registration) {
    event.waitUntil(self.registration.sync.register('conduit-transactions'));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'conduit-transactions') {
    // Wallet signing must happen in the page; wake controlled clients so the
    // page can flush its IndexedDB/local queue when connectivity is restored.
    event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) =>
      clients.forEach((client) => client.postMessage({ type: 'FLUSH_TRANSACTIONS' }))));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'conduit-cache-update') event.waitUntil(self.registration.update());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { url } = request;

  if (request.method !== 'GET') {
    return;
  }

  const isAsset = ASSET_PATTERNS.some((pattern) => pattern.test(url));
  // #317 — '/' is one of the STATIC_ASSETS entries, and a plain substring
  // .includes() check matches every same-origin URL (every path contains
  // '/'), so this used to be true for every request. Exact-match the
  // pathname instead.
  const isStaticPage = STATIC_ASSETS.includes(new URL(url).pathname);
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
