/* Cashout service worker: offline shell cache + background push (Firebase Cloud Messaging) */
const CACHE = 'cashout-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/config.js', 'js/util.js', 'js/model.js', 'js/store.js', 'js/views.js', 'js/more.js', 'js/auth.js', 'js/push.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;     // Firebase/Google traffic goes straight to the network
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

/* Background push. The messaging SDK needs its own config; it reads the same values as js/config.js. */
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js');
importScripts('js/config.js');
try {
  if (FIREBASE_CONFIG.apiKey !== 'PASTE_ME') {
    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage(payload => {
      const n = payload.notification || {};
      self.registration.showNotification(n.title || APP_NAME, { body: n.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: payload.data || {}, tag: 'cashout-nudge' });
    });
  }
} catch (e) { /* messaging unsupported in this browser */ }
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => { const c = list.find(w => 'focus' in w); return c ? c.focus() : clients.openWindow('./'); }));
});
