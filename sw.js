const CACHE_VERSION = 'v1.0.0.1.9.1'; // 👈 ভার্সন বাড়িয়ে দিলাম
const CACHE_NAME = 'likhipata-' + CACHE_VERSION;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './sub-books.html',
  './builder.html',
  './view.html',
  './about.html',
  './feedback.html',
  './changelog.html',
  './credits.html',
  './recycle-bin.html',
  './guide.html',
  './help.html',
  './privacy.html',
  './css/common.css',
  './css/dashboard.css',
  './css/builder.css',
  './css/view.css',
  './css/pages.css',
  './css/dashboard-book.css',
  './css/sync-backup.css',
  './js/config.js',
  './js/common.js',
  './js/storage-indexeddb.js',
  './js/backup-manager.js',
  './js/sync-status.js',
  './js/dashboard.js',
  './js/sub-books.js',
  './js/builder.js',
  './js/view.js',
  './js/formula-engine.js',
  './js/drive-sync.js',
  './js/ui.js',
  './js/xlsx-engine.js',
  './js/xlsx.full.min.js',
  './js/csv-import.js',
  './js/csv-import-ui.js',
  './js/chart.min.js',
  './js/dashboard-book.js',
  './manifest.json',
  './logo-192.png',
  './logo-512.png'
];

const FONT_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@300;400;500;600;700;800&display=swap'
];

const NETWORK_FIRST_EXT = /\.(?:html|js|json|css)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => console.warn('Cache failed:', url, err))
        )
      );
    }).then(() => {
      return caches.open(CACHE_NAME).then(cache =>
        Promise.all(
          FONT_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('Font cache failed:', url, err))
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.map(n => n !== CACHE_NAME ? caches.delete(n) : null)
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ─── ১. Google Fonts: Cache-First
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => Response.error());
      })
    );
    return;
  }

  // ─── ২. অন্য origin: সরাসরি নেটওয়ার্ক
  if (url.origin !== self.location.origin) {
    return;
  }

  // ─── ৩. নিজের origin: Network-First
  const isAsset = NETWORK_FIRST_EXT.test(url.pathname);
  const isNavigation = req.mode === 'navigate';

  if (isNavigation) {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match(req, { ignoreSearch: true }).then(cached => {
          if (cached) return cached;
          return caches.match('./index.html', { ignoreSearch: true });
        });
      })
    );
    return;
  }

  if (isAsset) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => {
          return caches.match(req, { ignoreSearch: true }).then(cached => {
            return cached || Response.error();
          });
        })
    );
  }
   else {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => {
          return Response.error();
        });
      })
    );
  }
});
