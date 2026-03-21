// Shre Chat — PWA service worker with auto-update on deploy
// BUILD_TS is replaced by build script; change triggers SW update
const CACHE_VERSION = "shre-chat-v3";
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

// ── Web Push — background notifications (iOS 16.4+, Android, desktop) ──

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Shre AI", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: "/assets/icon-192.png",
    badge: "/assets/icon-192.png",
    tag: payload.type || "shre-notification",
    data: { url: payload.url || "/", type: payload.type },
    vibrate: [100, 50, 100],
    renotify: true,
    actions: payload.type === "reminders_due"
      ? [{ action: "snooze", title: "Snooze" }, { action: "open", title: "Open" }]
      : [{ action: "open", title: "Open" }],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Shre AI", options)
  );
});

// Notification click — open/focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";
  const action = event.action;

  if (action === "snooze") {
    // Snooze: just close the notification (server handles snooze via reminder API)
    return;
  }

  // Open or focus the app
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // If app is already open, focus it and navigate
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if (url !== "/") client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});

// Listen for update messages from the app
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
