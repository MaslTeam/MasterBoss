const CACHE_NAME = 'masterboss-push-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}

  const options = {
    body: data.body || 'Новое уведомление от МастерБосс',
    icon: data.icon || '/favicon.ico',
    tag: data.tag || 'masterboss-push',
    data: {
      url: data.url || '/'
    },
    requireInteraction: false,
    silent: false
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'МастерБосс', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) || client.url.includes('localhost:5173')) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
