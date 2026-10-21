// MM26 Karte - service worker: приложение работает без сети, данные - сначала из сети, иначе последняя копия.
const APP = "mm26-app-v1";
const DATA = "mm26-data";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(
    ks.filter((k) => k !== APP && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith("/data.enc")) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).then((r) => {
        if (r.ok) { const k = r.clone(); caches.open(DATA).then((c) => c.put("data.enc", k)); }
        return r;
      }).catch(() => caches.open(DATA).then((c) => c.match("data.enc")).then((r) => r || Response.error()))
    );
    return;
  }
  // приложение: сначала сеть (чтобы обновления доходили), без сети - из кеша
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok && e.request.method === "GET") { const k = r.clone(); caches.open(APP).then((c) => c.put(e.request, k)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
