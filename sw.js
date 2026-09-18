// Slow Spain — Service Worker v3.0.0
// 激进清缓存版:激活时删除所有老 SW 缓存,保证用户拿到最新数据

const CACHE_VERSION = 'slow-spain-v3.2.0';
const STATIC_CACHE = CACHE_VERSION + '-static';

const STATIC_ASSETS = [
  './',
  './index.html',
  './data.js',
  './data-loader.js',
  './data.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './pages/now.html',
  './pages/explore.html',
  './pages/journey.html',
  './pages/city.html',
  './pages/spot.html',
  './pages/wishlist.html',
  './pages/me.html',
  './pages/spanish.html',
  './pages/journal.html'
];

// 安装:立即接管
self.addEventListener('install', event => {
  console.log('[SW v3] install', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      Promise.all(STATIC_ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('[SW v3] skip:', url, err.message))
      ))
    ).then(() => self.skipWaiting())  // 立即跳过等待
  );
});

// 激活:删掉所有不是 v3.0.0 的 cache(关键!)
self.addEventListener('activate', event => {
  console.log('[SW v3] activate, deleting ALL old caches');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => {
        console.log('[SW v3] delete:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim())  // 立即接管所有页面
  );
});

// fetch:网络优先,只缓存 200 OK 的同源响应
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 只缓存同源(避免第三方 CDN 缓存污染)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(res => {
        // 只缓存 200 响应
        if (res.ok) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then(c => c || new Response('Offline', { status: 503 })))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'CLEAR_ALL') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});