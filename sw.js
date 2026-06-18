/* Hanbit Church Sermon — offline shell + data cache */
const CACHE = 'hanbit-sermon-v55';

const DATA_PATHS = ['index.json', 'config.json', 'videos.json', 'upload-log.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        './icons/favicon-32.png',
        './icons/apple-touch-icon.png',
        './icons/icon-192.png',
        './icons/icon-512.png',
        './manifest.json'
      ])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isDataRequest(url) {
  if (DATA_PATHS.some((p) => url.pathname.endsWith(p))) return true;
  return url.pathname.includes('/shards/');
}

/** 영상 목록·샤드는 항상 네트워크만 (SW 캐시로 구버전 목록 고착 방지) */
function isFreshDataRequest(url) {
  if (url.pathname.endsWith('index.json')) return true;
  if (url.pathname.endsWith('upload-log.json')) return true;
  return url.pathname.includes('/shards/');
}

function isHtmlRequest(url) {
  const p = url.pathname;
  if (p.endsWith('.html') || p.endsWith('index.html')) return true;
  if (p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p.slice(0, -1))) return true;
  return false;
}

function isNetworkFirst(url) {
  if (isDataRequest(url)) return true;
  const p = url.pathname;
  if (p.endsWith('.js') || p.endsWith('.css')) return true;
  if (isHtmlRequest(url)) return true;
  return false;
}

function putCache(req, res) {
  if (!res.ok) return;
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy));
}

function networkFirst(req) {
  const url = new URL(req.url);
  const html = isHtmlRequest(url);
  return fetch(req).then((res) => {
    if (!html) putCache(req, res);
    return res;
  }).catch(() => caches.match(req));
}

function cacheFirst(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;
    return fetch(req).then((res) => {
      putCache(req, res);
      return res;
    });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!isSameOrigin(url)) return;

  if (url.pathname.endsWith('sw.js')) return;

  if (isFreshDataRequest(url)) {
    e.respondWith(fetch(new Request(req, { cache: 'no-store' })));
    return;
  }

  e.respondWith(isNetworkFirst(url) ? networkFirst(req) : cacheFirst(req));
});
