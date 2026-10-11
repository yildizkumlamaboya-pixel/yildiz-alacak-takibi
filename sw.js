const CACHE = 'yildiz-alacak-web-v9';
const ASSETS = ['./', './index.html', './config.js', './logos.js', './app1.js', './app2.js', './app3.js', './app4.js', './manifest.json',
  './logo-yildiz.webp', './logo-delta.webp', './logo-minimar.webp',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Supabase isteklerini önbelleğe alma; diğerlerinde önce ağ, olmazsa önbellek
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('supabase.co')) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
