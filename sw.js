const CACHE_NAME = 'ronsho-app-cache-v190';
const PRECACHE_URLS = [
  './',
  './index.html',
  './js/core.js',
  './js/theme.js',
  './js/duplicate-check.js',
  './js/entry-edit.js',
  './js/study-table.js',
  './js/quiz.js',
  './js/speech.js',
  './js/countdown.js',
  './js/past-exam.js',
  './js/precedent.js',
  './js/gamification.js',
  './js/settings.js',
  './js/backup.js',
  './js/pet.js',
  './js/init.js',
  './style.css',
  './drive-sync.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isSyncOrAuthRequest(url) {
  return /googleapis\.com|accounts\.google\.com|google\.com\/gsi|script\.google\.com/.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (isSyncOrAuthRequest(url)) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => {
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Promise.reject('offline and not cached');
      }))
  );
});
