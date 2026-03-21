// Shre Chat — PWA service worker with auto-update on deploy
// BUILD_TS is replaced by build script; change triggers SW update
const CACHE_VERSION = "shre-chat-v2";
const APP_SHELL = ["/", "/index.html", "/assets/icon.svg", "/assets/icon.png"];

// Install: pre-cache app shell, activate immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: purge ALL old caches, claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for everything except hashed assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API/WebSocket calls
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws")) {
    return;
  }

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Hashed assets (contain content hash in filename) → cache-first (immutable)
  if (/\/assets\/.*-[A-Za-z0-9]{8,}\.\w+$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Navigation + other assets → network-first, cache fallback for offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        request.mode === "navigate"
          ? caches.match("/index.html")
          : caches.match(request)
      )
  );
});

// Listen for update messages from the app
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
