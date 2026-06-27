const CACHE = 'peak-os-v21';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './js/app.js',
  './js/db.js',
  './js/calc.js',
  './js/health-import.js',
  './js/health-screen.js',
  './js/body-dashboard.js',
  './js/training-data.js',
  './js/training-tracker.js',
  './js/training-analytics.js',
  './js/nutrition-tracker.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  // Only intercept same-origin requests (not Google Fonts etc.)
  if (!request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, toCache));
        return response;
      });
    })
  );
});
