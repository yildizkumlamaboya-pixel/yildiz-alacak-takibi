const CACHE = 'emanet-takip-v3';
const ASSETS = ['./', './index.html', './app.js', './config.js', './manifest.json', '../logo-yildiz.webp', '../icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('emanet-takip-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Supabase isteklerine dokunma; diğerlerinde önce ağ, olmazsa önbellek
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('supabase.co')) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
