/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Precache all Vite-built assets
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ─── Activate immediately ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
