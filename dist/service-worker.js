// Wani Service Worker — enables PWA install prompt and offline shell
const CACHE = 'wani-v1'
const SHELL = ['/', '/index.html', '/favicon.png', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim())
})

// Network first — always fresh from server, fall back to cache
self.addEventListener('fetch', e => {
  // Only cache GET requests for same origin
  if (e.request.method !== 'GET') return
  if (!e.request.url.startsWith(self.location.origin)) return
  // API calls always go to network — never cache
  if (e.request.url.includes('/api/')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request))
  )
})
