// 一度開いた端末ではオフラインでも起動・画像生成できるようにする（設計書 7.9）
const CACHE = "app-v4";
const ASSETS = ["./", "index.html", "privacy.html", "css/app.css", "js/app.js", "js/render.js", "js/data.js", "fonts/inter-tight.woff2"];

// 配信側が .html を拡張子なしのURLへ転送することがある。転送された応答はページ遷移に
// そのまま使えないので、中身だけ取り出して保存する
const clean = async (res) => res.redirected
  ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers })
  : res;

self.addEventListener("install", (e) => e.waitUntil(
  caches.open(CACHE)
    .then((c) => Promise.all(ASSETS.map(async (u) => {
      const res = await fetch(u, { cache: "no-cache" });
      if (!res.ok) throw new Error(u);
      await c.put(u, await clean(res));
    })))
    .then(() => self.skipWaiting())
));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
// キャッシュを先に返し、裏で最新を取り直す。同一オリジンのGETのみ扱う
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(async (res) => {
      if (!res.ok) return res;
      const r = await clean(res);
      c.put(req, r.clone());
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
