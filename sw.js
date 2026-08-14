const VERSION="6";
const CACHE_NAME="unipop-formateur-v"+VERSION;

const STATIC_ASSETS=[
  "./",
  "./index.html",
  "./style.css?v=6",
  "./app.js?v=6",
  "./manifest.webmanifest?v=6",
  "./data/locations.json",
  "./assets/icon.svg",
  "./assets/luxembourg-skyline.png",
  "./assets/demo-map.jpg",
  "./assets/demo-building.jpg",
  "./assets/demo-entry.jpg",
  "./assets/demo-room.jpg"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("unipop-formateur-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // Always prefer fresh HTML so a deployment is detected immediately.
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Course JSON: network first, last successful copy as offline fallback.
  if (url.hostname === "raw.githubusercontent.com") {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App files: cache first; query-string versioning guarantees fresh release assets.
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
