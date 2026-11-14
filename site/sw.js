// 一度開いた端末ではオフラインでも起動・画像生成できるようにする（設計書 7.9）
const CACHE = "app-v2";
const ASSETS = ["./", "index.html", "privacy.html", "css/app.css", "js/app.js", "js/render.js", "js/data.js", "fonts/inter-tight.woff2"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
// キャッシュを先に返し、裏で最新を取り直す。同一オリジンのGETのみ扱う
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
