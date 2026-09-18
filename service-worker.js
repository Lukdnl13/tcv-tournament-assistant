const CACHE = "tcv-assistant-v20-vcf-local";
const CORE = [
  "./",
  "index.html",
  "callback.html",
  "styles.css",
  "app.js",
  "contacts-vcf-local.js",
  "manifest.webmanifest",
  "assets/tcv-logo.png",
  "assets/icons/icon-192.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    const url = new URL(event.request.url);
    const fallback = url.pathname.endsWith("callback.html") ? "callback.html" : "index.html";
    event.respondWith(fetch(event.request).catch(() => caches.match(fallback)));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
