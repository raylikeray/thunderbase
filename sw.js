/* Tipoff service worker: makes the site installable and keeps the shell available when the network is slow.
   Network first for everything on this origin, cache as a fallback. Live data from ESPN is never intercepted. */
const V = 'tipoff-25';
const SHELL = ['./', './index.html', './manifest.webmanifest', './img/mark.svg', './img/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).catch(() => { })); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && !u.pathname.includes('/data/') && !u.pathname.includes('/ai/')) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)).catch(() => { }); } return r; }).catch(() => caches.match(e.request).then(m => m || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs.find(x => 'focus' in x); if (c) { c.focus(); if (url) c.postMessage({ url }); } else return clients.openWindow(url || './'); }));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Tipoff', body: e.data && e.data.text() }; }
  const o = { body: d.body || '', icon: './img/icon-192.png', badge: './img/icon-192.png', tag: d.tag || undefined, renotify: !!d.renotify, silent: !!d.silent, data: { url: d.url || '#' } };
  e.waitUntil(self.registration.showNotification(d.title || 'Tipoff', o));
});
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage({ resync: true }))));
});
