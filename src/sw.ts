/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Precache all Vite-built assets
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ─── Push Notification Handler ─────────────────────────────────────
// This runs even when the app is closed or the screen is locked.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: { title: string; body: string; icon?: string; badge?: string; tag?: string; url?: string };

  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Flux',
      body: event.data.text(),
    };
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'flux-notification',
    data: { url: payload.url || '/' },
  };

  // These properties are valid in the Push API but not in all TS definitions
  (options as any).vibrate = [200, 100, 200];
  (options as any).actions = [
    { action: 'open', title: 'Abrir Flux' },
    { action: 'dismiss', title: 'Cerrar' },
  ];

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// ─── Notification Click Handler ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = (event.notification.data?.url as string) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if available
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ─── Activate immediately ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
