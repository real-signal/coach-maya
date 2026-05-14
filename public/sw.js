/**
 * Coach Maya — Service Worker
 * Installable PWA + offline shell + future push notifications.
 */
const CACHE = 'coach-maya-v2'
const SHELL = ['/']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Only handle GETs from same origin
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return

  // Never intercept Vite-internal paths. If a stale SW is left registered
  // while the dev server is running, caching these would serve old
  // optimized-deps chunks and the page would end up with two copies of
  // React (→ null useContext, Invalid hook call). Belt-and-suspenders:
  // the SW skips dev registration in push.js, but bail here too.
  if (
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/@id/') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/src/') ||
    url.search.includes('?v=') ||
    url.search.includes('?t=')
  ) return

  // Network-first for HTML / API
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(e.request).then((m) => m || caches.match('/')))
    )
    return
  }

  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached
      return fetch(e.request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
        return res
      }).catch(() => cached)
    })
  )
})

// ─── Push Notifications ───
self.addEventListener('push', (event) => {
  const data = (() => { try { return event.data?.json() } catch { return {} } })() || {}
  const title = data.title || 'Coach Maya'
  const options = {
    body: data.body || 'Time to lock in.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'maya-nudge',
    data: data.url || '/',
    vibrate: [100, 50, 100],
    actions: data.actions || [
      { action: 'open', title: 'Open Maya' },
      { action: 'dismiss', title: 'Later' },
    ],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawUrl = event.notification.data || '/'
  const safeUrl = (typeof rawUrl === 'string' && rawUrl.startsWith(self.location.origin)) ? rawUrl : '/'

  if (event.action === 'dismiss') return

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(safeUrl)
          return client.focus()
        }
      }
      return clients.openWindow(safeUrl)
    })
  )
})

// ─── Scheduled local notifications (triggered by main thread) ───
self.addEventListener('message', (event) => {
  if (event.origin && event.origin !== self.location.origin) return
  if (event.data?.type === 'SCHEDULE_NOTIFICATION') {
    const { delay, title, body, tag, url } = event.data
    setTimeout(() => {
      self.registration.showNotification(title || 'Coach Maya', {
        body: body || 'Time to check in.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: tag || 'maya-scheduled',
        data: url || '/',
        vibrate: [100, 50, 100],
      })
    }, delay || 0)
  }
})
