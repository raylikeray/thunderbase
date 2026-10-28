/* Hardwood service worker: makes the site installable and keeps the shell available when the network is slow.
   Network first for everything on this origin, cache as a fallback. Live data from ESPN is never intercepted. */
const V = 'hardwood-14';
const SHELL = ['./', './index.html', './manifest.webmanifest', './img/mark.svg', './img/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).catch(() => { })); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && !u.pathname.includes('/data/') && !u.pathname.includes('/ai/')) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)).catch(() => { }); } return r; }).catch(() => caches.match(e.request).then(m => m || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});
