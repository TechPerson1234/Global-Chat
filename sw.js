const CACHE_NAME = 'chat-pwa-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/@supabase/supabase-js@2'
];


self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});


self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});


self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('Offline', { status: 503 }))
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./offline.html')))
  );
});


self.addEventListener('push', function(event) {
  console.log('📨 Push event received!', event);
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'New message', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || 'Someone sent a message',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'chat-message',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      messageId: data.messageId || null
    },
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Open Chat' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || '💬 Global Chat',
      options
    )
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('🔔 Notification clicked', event);
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
