import { PROC, COUNTRIES, TOP8, BLEND } from "./data.js";
import { render, photoRect, coverSize, fmtDate } from "./render.js";

const $ = (q) => document.querySelector(q);
const h = (tag, cls, text, on) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (on) e.addEventListener("click", on);
  return e;
};
// 端末内保存は入力補助のみ（最近の国・店、画像設定）。端末の外には出ない。
const KEYS = ["recentCountries", "recentShops", "prefs"];
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  clear() { try { KEYS.forEach((k) => localStorage.removeItem(k)); } catch {} },
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fresh = () => ({
  img: null, crop: { z: 1, fx: 0.5, fy: 0.5 },
  proc: null, sub: null, free: "", country: null, mode: null, shop: "", date: today(),
  pattern: "A", ratio: "9:16", bg: "paper", ...store.get("prefs", {}),
});
let s = fresh(), step = 0, editing = false, resultUrl = null;

const cv = $("#cv"), file = $("#file");
let raf = 0;
const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render(cv, s)); };

/* ---------- 画面切替 ---------- */
const NAMES = ["", "写真", "プロセス", "生産国", "場所", "プレビュー"];
function show(n) {
  step = n;
  $("#s0").hidden = n !== 0; $("#flow").hidden = n < 1 || n > 5; $("#s6").hidden = n !== 6;
  if (n >= 1 && n <= 5) {
    $("#flow").dataset.step = n;
    $("#stepname").textContent = NAMES[n];
    $("#jump").hidden = n === 1 || n === 5;
    for (let i = 1; i <= 5; i++) $("#p" + i).hidden = i !== n;
    [null, null, buildProc, buildCountry, buildPlace, buildPreview][n]?.();
    draw();
  }
  window.scrollTo(0, 0);
}
const next = () => { const e = editing; editing = false; show(e ? 5 : step + 1); };
$("#back").onclick = () => { if (editing) { editing = false; show(5); } else show(step - 1); };
$("#jump").onclick = () => { editing = false; show(5); };

/* ---------- 写真：Canvasへ描き直すのでEXIF（GPS等）は引き継がれない ---------- */
async function load(f) {
  let bmp;
  try { bmp = await createImageBitmap(f, { imageOrientation: "from-image" }); }
  catch {
    bmp = await new Promise((ok, ng) => {
      const im = new Image(), u = URL.createObjectURL(f);
      im.onload = () => { URL.revokeObjectURL(u); ok(im); };
      im.onerror = () => { URL.revokeObjectURL(u); ng(); };
      im.src = u;
    });
  }
  const sc = Math.min(1, 2160 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}
file.onchange = async () => {
  const f = file.files[0]; file.value = "";
  if (!f) return;
  try {
    const img = await load(f);
    if (step === 0 || step === 6) s = fresh();
    s.img = img; s.crop = { z: 1, fx: 0.5, fy: 0.5 };
    editing = false; show(1);
  } catch { alert("この写真を読み込めませんでした。別の写真を選んでください。"); }
};
const pick = () => file.click();
$("#start").onclick = pick; $("#repick").onclick = pick; $("#again").onclick = pick;
$("#usephoto").onclick = next;

// 位置合わせ（S1のみ）：ドラッグで移動、ピンチ／ホイールで拡大
const pts = new Map(); let pinch = 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
cv.addEventListener("pointerdown", (e) => { if (step !== 1) return; cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
cv.addEventListener("pointermove", (e) => {
  if (step !== 1 || !pts.has(e.pointerId)) return;
  const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 1) {
    const k = cv.width / cv.clientWidth, r = photoRect(s), d = coverSize(s.img, r, s.crop.z);
    if (d.w > r.w) s.crop.fx = clamp(s.crop.fx - (e.clientX - prev[0]) * k / (d.w - r.w), 0, 1);
    if (d.h > r.h) s.crop.fy = clamp(s.crop.fy - (e.clientY - prev[1]) * k / (d.h - r.h), 0, 1);
  } else if (pts.size === 2) {
    const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) s.crop.z = clamp(s.crop.z * dist / pinch, 1, 4);
    pinch = dist;
  }
  draw();
});
const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", (e) => { if (step !== 1) return; e.preventDefault(); s.crop.z = clamp(s.crop.z * (e.deltaY < 0 ? 1.06 : 0.94), 1, 4); draw(); }, { passive: false });

/* ---------- S2 プロセス ---------- */
function buildProc() {
  const main = $("#procMain"), sub = $("#procSub"), freeWrap = $("#procFreeWrap");
  main.textContent = ""; sub.textContent = ""; freeWrap.hidden = true;
  PROC.forEach((p) => {
    const b = h("button", "big", p.ja, () => {
      s.proc = p.k; s.sub = null; s.free = "";
      if (!p.subs.length) { draw(); return next(); }
      buildProc(); draw();
    });
    b.setAttribute("aria-pressed", s.proc === p.k);
    main.appendChild(b);
  });
  const p = PROC.find((x) => x.k === s.proc);
  if (!p || !p.subs.length) return;
  const chip = (label, key) => {
    const b = h("button", "chip", label, () => { s.sub = key; s.free = ""; draw(); next(); });
    b.setAttribute("aria-pressed", !s.free && s.sub === key && (key !== null || step === 2 && editing));
    sub.appendChild(b);
  };
  if (p.hero) chip(`${p.ja}のみ`, null);
  p.subs.forEach((x) => chip(x.ja, x.k));
  freeWrap.hidden = !p.free;
  $("#procFree").value = s.free;
}
$("#procFreeForm").onsubmit = (e) => {
  e.preventDefault();
  const v = $("#procFree").value.trim();
  if (!v) return;
  s.free = v; s.sub = null; draw(); next();
};
$("#skip2").onclick = () => { s.proc = s.sub = null; s.free = ""; next(); };

/* ---------- S3 生産国 ---------- */
const ja = (en) => (en === BLEND[0] ? BLEND[1] : COUNTRIES.find((c) => c[0] === en)?.[1] ?? en);
function buildCountry() {
  const set = (en) => { s.country = en; draw(); next(); };
  const fill = (box, list) => {
    box.textContent = "";
    list.forEach((en) => { const b = h("button", "chip", ja(en), () => set(en)); b.setAttribute("aria-pressed", s.country === en); box.appendChild(b); });
  };
  const rec = store.get("recentCountries", []).filter((x) => typeof x === "string").slice(0, 3);
  $("#cRecentWrap").hidden = !rec.length;
  fill($("#cRecent"), rec);
  fill($("#cTop"), [...TOP8.filter((x) => !rec.includes(x)), BLEND[0]]);
  $("#cAll").hidden = true; $("#cFilter").value = "";
  $("#cMore").hidden = false;
}
$("#cMore").onclick = () => { $("#cMore").hidden = true; $("#cAll").hidden = false; listAll(""); $("#cFilter").focus(); };
$("#cFilter").oninput = (e) => listAll(e.target.value.trim());
function listAll(q) {
  const box = $("#cList"); box.textContent = "";
  const k = q.toLowerCase();
  COUNTRIES.filter((c) => !q || c[1].includes(q) || c[0].toLowerCase().includes(k))
    .forEach((c) => box.appendChild(h("button", "row", c[1], () => { s.country = c[0]; draw(); next(); })));
}
$("#skip3").onclick = () => { s.country = null; next(); };

/* ---------- S4 場所（位置情報は使わない。店舗名は手入力） ---------- */
function buildPlace() {
  document.querySelectorAll("#placeMode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === s.mode));
  $("#shopWrap").hidden = s.mode !== "shop";
  const rec = store.get("recentShops", []).filter((x) => typeof x === "string").slice(0, 5), box = $("#shopRecent");
  box.textContent = "";
  rec.forEach((name) => box.appendChild(h("button", "chip", name, () => { s.shop = name; draw(); next(); })));
  $("#shop").value = s.shop;
}
document.querySelectorAll("#placeMode button").forEach((b) => b.onclick = () => {
  s.mode = b.dataset.m;
  if (s.mode === "home") { s.shop = ""; draw(); return next(); }
  buildPlace(); draw(); $("#shop").focus();
});
$("#shop").oninput = (e) => { s.shop = e.target.value.trim(); draw(); };
$("#shopForm").onsubmit = (e) => { e.preventDefault(); if (s.shop) next(); };
$("#skip4").onclick = () => { s.mode = null; s.shop = ""; next(); };

/* ---------- S5 プレビュー ---------- */
function buildPreview() {
  document.querySelectorAll("#p5 [data-set]").forEach((b) => {
    const [k, v] = b.dataset.set.split("=");
    b.setAttribute("aria-pressed", s[k] === v);
    b.onclick = () => { s[k] = v; buildPreview(); draw(); };
  });
  $("#bgSeg").hidden = s.pattern !== "B";
  $("#date").value = s.date;
  const p = PROC.find((x) => x.k === s.proc);
  const procText = s.free || p?.subs.find((x) => x.k === s.sub)?.ja || p?.ja;
  const items = [[2, "プロセス", procText], [3, "生産国", s.country && ja(s.country)], [4, "場所", s.mode === "home" ? "自宅" : s.shop]];
  const box = $("#edit"); box.textContent = "";
  items.forEach(([n, name, val]) => {
    const b = h("button", "row", null, () => { editing = true; show(n); });
    b.append(h("span", "k", name), h("span", "v", val || "未入力"));
    box.appendChild(b);
  });
}
$("#date").onchange = (e) => { s.date = e.target.value || today(); draw(); };

$("#save").onclick = async () => {
  const btn = $("#save"); btn.disabled = true;
  try {
    render(cv, s);
    const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.92));
    const name = `coffee-${fmtDate(s.date) || "log"}.jpg`;
    const f = new File([blob], name, { type: "image/jpeg" });
    let shared = false;
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f] }); shared = true; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    if (!shared) { const a = h("a"); a.href = resultUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    remember();
    $("#result").src = resultUrl;
    show(6);
  } finally { btn.disabled = false; }
};
function remember() {
  const push = (k, v, n) => { if (v) store.set(k, [v, ...store.get(k, []).filter((x) => x !== v)].slice(0, n)); };
  push("recentCountries", s.country, 3);
  if (s.mode === "shop") push("recentShops", s.shop, 5);
  store.set("prefs", { pattern: s.pattern, ratio: s.ratio, bg: s.bg });
}

/* ---------- トップ ---------- */
// 実例画像。写真の代わりに図形で描いた仮の絵（実写に差し替え可）
function sampleScene() {
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1920;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 1080, 1920);
  g.addColorStop(0, "#c9c6bf"); g.addColorStop(1, "#8f8b84");
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
  x.fillStyle = "rgba(0,0,0,.18)"; x.beginPath(); x.ellipse(590, 800, 400, 400, 0, 0, 7); x.fill();
  const disc = (r, col) => { x.fillStyle = col; x.beginPath(); x.arc(540, 760, r, 0, 7); x.fill(); };
  disc(400, "#efeeea"); disc(330, "#e2e0db"); disc(250, "#f7f6f3"); disc(215, "#2b1d17");
  const hl = x.createRadialGradient(470, 690, 10, 540, 760, 215);
  hl.addColorStop(0, "rgba(255,255,255,.22)"); hl.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = hl; x.beginPath(); x.arc(540, 760, 215, 0, 7); x.fill();
  return c;
}
function drawSample() {
  render($("#sample"), {
    img: sampleScene(), crop: { z: 1, fx: 0.5, fy: 0.5 }, pattern: "A", ratio: "9:16", bg: "paper",
    proc: "natural", sub: "anaerobic", free: "", country: "Ethiopia", mode: "shop", shop: "Kissa Hakko", date: today(),
  });
}
$("#clear").onclick = () => { store.clear(); $("#clear").textContent = "消しました"; };
if (/Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent)) $("#iab").hidden = false;

drawSample();
// 欧文フォントの読み込み後に描き直す。失敗しても端末の標準フォントで描ける
Promise.all([document.fonts.load('800 132px "Inter Tight"'), document.fonts.load('600 44px "Inter Tight"')])
  .catch(() => {}).then(() => { drawSample(); if (step >= 1 && step <= 5) draw(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
