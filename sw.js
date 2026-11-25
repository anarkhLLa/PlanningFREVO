/* Service worker : hors-ligne + rappel périodique (Android / Chrome installé) */
importScripts('logic.js');
const VERSION = 'planning-v8';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'badge-96.png', 'logic.js'];
const STATE = 'planning-state';
const TAG = 'planning-resume';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== STATE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // réseau d'abord (pour recevoir les mises à jour), cache si hors-ligne
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
async function firstToday() {
  const c = await caches.open(STATE), k = new URL('__loud', self.registration.scope), d = today();
  const r = await c.match(k); if (r && (await r.text()) === d) return false;
  await c.put(k, new Response(d)); return true;
}
async function check() {
  const c = await caches.open(STATE);
  const r = await c.match(new URL('__state', self.registration.scope));
  if (!r) return;
  const s = PlanningLogic.summary(await r.json(), today());
  if (!s.count) { (await self.registration.getNotifications({ tag: TAG })).forEach(n => n.close()); return; }
  const loud = await firstToday();
  await self.registration.showNotification(s.title, {
    body: s.body, tag: TAG, renotify: loud, silent: !loud, requireInteraction: true,
    icon: 'icon-192.png', badge: 'badge-96.png', data: { url: self.registration.scope }
  });
}
self.addEventListener('periodicsync', e => { if (e.tag === 'planning-check') e.waitUntil(check()); });
self.addEventListener('message', e => { if (e.data === 'check') e.waitUntil(check()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(self.registration.scope);
  }));
});
