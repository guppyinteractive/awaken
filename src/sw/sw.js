// Service worker: makes the app work offline (design/ux-plan.md, Installable app).
// The build puts VERSION and PRECACHE (URLs relative to the scope) above this code.
// Pages come from the network when it answers quickly, so every open picks up a
// new deploy; otherwise they come from the cache. Built files have hashed names,
// so the cached copy of those is always right.

/* global VERSION, PRECACHE */
const CACHE = `primal-${VERSION}`;
const PAGE_TIMEOUT_MS = 3000;
const scope = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 'reload' skips the browser's HTTP cache, so a page can't be older than its files.
    await cache.addAll(PRECACHE.map((url) => new Request(new URL(url, scope), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('primal-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  event.respondWith(request.mode === 'navigate' ? page(request) : file(request));
});

/** A page: the network if it answers in time, else the cached copy. */
async function page(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok) void cache.put(pageKey(request), response.clone());
    return response;
  });
  network.catch(() => undefined); // the cache may answer instead
  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS));
  try {
    const fast = await Promise.race([network, timeout]);
    if (fast) return fast;
  } catch {
    // Offline; fall through to the cache.
  }
  const cached = await cache.match(pageKey(request), { ignoreVary: true });
  return cached ?? network;
}

/** The cache key for a page: no query (fight/?monster=…) and no index.html. */
function pageKey(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/index\.html$/, '');
  return url.href;
}

/** Any other file: the cache, else the network (and keep a copy). */
async function file(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());
  return response;
}
