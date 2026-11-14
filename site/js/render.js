// シェア画像の描画（設計書 4章）。Canvas 2D のみ。外部通信なし。
import { PROC, WORDMARK } from "./data.js";

const INK = "#0E0E0E", PAPER = "#F5F4F0";
const JP = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Noto Sans JP","Yu Gothic",sans-serif';
const F_HERO = `"Inter Tight",${JP}`, F_TXT = F_HERO;
const W = 1080, MX = 72, CW = W - MX * 2, CAP = 0.727;

export const sizeOf = (s) => ({ w: W, h: s.ratio === "4:5" ? 1350 : 1920 });

export function photoRect(s) {
  const { h } = sizeOf(s);
  if (s.pattern !== "B") return { x: 0, y: 0, w: W, h };
  return h === 1920 ? { x: MX, y: 250, w: CW, h: CW } : { x: MX, y: 72, w: CW, h: 702 };
}

// 写真の表示倍率（ドラッグ量を焦点位置に換算するのに使う）
export function coverSize(img, r, z) {
  const sc = Math.max(r.w / img.width, r.h / img.height) * z;
  return { w: img.width * sc, h: img.height * sc };
}

export function fmtDate(d) { return d ? d.replaceAll("-", ".") : ""; }

function heroSpec(s) {
  const p = PROC.find((x) => x.k === s.proc);
  if (p) {
    if (s.free) return { label: "PROCESS", lines: [s.free] };
    const sub = p.subs.find((x) => x.k === s.sub);
    if (sub) return { label: sub.tag ? `PROCESS · ${sub.tag}` : "PROCESS", lines: sub.hero };
    if (p.hero) return { label: "PROCESS", lines: p.hero };
  }
  if (s.country) return { label: "ORIGIN", lines: [s.country.toUpperCase()], used: "country" };
  if (s.mode === "shop" && s.shop) return { label: "PLACE", lines: [s.shop], used: "place" };
  return { label: "", lines: [] };
}

function rowSpec(s, used) {
  const r = [];
  if (s.country && used !== "country") r.push(["ORIGIN", s.country.toUpperCase()]);
  const place = s.mode === "home" ? "HOME" : s.mode === "shop" ? s.shop : "";
  if (place && used !== "place") r.push(["PLACE", place, true]);
  if (s.date) r.push(["DATE", fmtDate(s.date)]);
  return r;
}

const base = (top, box, size) => top + (box + CAP * size) / 2;
const isJP = (t) => /[^\u0000-ɏ]/.test(t);

function tracked(ctx, t, x, y, tr, right) {
  const ch = [...t];
  const w = ch.reduce((a, c) => a + ctx.measureText(c).width + tr, 0) - tr;
  let cx = right ? x - w : x;
  for (const c of ch) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + tr; }
}
function ellip(ctx, t, max) {
  if (ctx.measureText(t).width <= max) return t;
  const a = [...t];
  while (a.length > 1 && ctx.measureText(a.join("") + "…").width > max) a.pop();
  return a.join("") + "…";
}

function textBlock(ctx, s, o) {
  const hero = heroSpec(s), row = rowSpec(s, hero.used);
  // 主役のサイズ：最も長い行が幅に収まるまで縮める（下限72px）
  let size = o.hero;
  for (const l of hero.lines) {
    const sz = o.hero * (isJP(l) ? 0.8 : 1);
    ctx.font = `800 ${sz}px ${F_HERO}`;
    const w = ctx.measureText(l).width;
    size = Math.min(size, w > CW ? Math.max(72, sz * CW / w) : sz);
  }
  const lh = size * 0.95, heroH = hero.lines.length * lh;
  const valSize = o.val, rowH = row.length ? 32 + valSize : 0;
  const gapRow = !row.length ? 0 : !heroH ? 28 : o.rule ? 64 : 48;
  // 主役がないときはラベル行を作らず、ワードマークを副次データのラベル行に置く
  const head = heroH || !row.length ? 26 : 0;
  const total = head + (heroH ? 20 + heroH : 0) + (head ? gapRow : 0) + rowH;
  let y = o.bottom != null ? o.bottom - total : o.top;

  ctx.fillStyle = o.color; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  // ラベル行＋ワードマーク
  ctx.globalAlpha = 0.7; ctx.font = `600 26px ${F_TXT}`;
  if (hero.label) tracked(ctx, hero.label, MX, base(y, 26, 26), 26 * 0.16);
  ctx.globalAlpha = 0.8; ctx.font = `700 22px ${F_TXT}`;
  tracked(ctx, WORDMARK, W - MX, base(y, head || 22, 22), 22 * 0.12, true);
  ctx.globalAlpha = 1;
  y += head;
  // 主役
  if (heroH) {
    y += 20;
    ctx.font = `800 ${size}px ${F_HERO}`;
    for (const l of hero.lines) { ctx.fillText(ellip(ctx, l, CW), MX, base(y, lh, size)); y += lh; }
  }
  if (!row.length) return;
  if (o.rule && heroH) { ctx.globalAlpha = 0.2; ctx.fillRect(MX, y + 32, CW, 2); ctx.globalAlpha = 1; }
  if (head) y += gapRow;
  // 副次データ：収まるなら312pxの固定3列、収まらなければ内容幅で詰め、店舗名を省略
  ctx.font = `600 ${valSize}px ${F_TXT}`;
  const col = CW / 3, gap = 40;
  let ws = row.map((r) => ctx.measureText(r[1]).width);
  const fixed = ws.every((w) => w <= col - 24);
  if (!fixed) {
    const over = ws.reduce((a, w) => a + w, 0) + gap * (row.length - 1) - CW;
    if (over > 0) {
      const i = row.findIndex((r) => r[2]), k = i >= 0 ? i : ws.indexOf(Math.max(...ws));
      const max = Math.max(120, ws[k] - over);
      row[k][3] = Math.max(30, Math.min(valSize, valSize * max / ws[k]));
      ctx.font = `600 ${row[k][3]}px ${F_TXT}`;
      row[k][1] = ellip(ctx, row[k][1], max);
      ws[k] = ctx.measureText(row[k][1]).width;
    }
  }
  let x = MX;
  row.forEach((r, i) => {
    ctx.globalAlpha = 0.7; ctx.font = `600 22px ${F_TXT}`;
    tracked(ctx, r[0], x, base(y, 22, 22), 22 * 0.16);
    ctx.globalAlpha = 1; ctx.font = `600 ${r[3] || valSize}px ${F_TXT}`;
    ctx.fillText(r[1], x, base(y + 32, valSize, valSize));
    x += fixed ? col : ws[i] + gap;
  });
}

export function render(cv, s) {
  const { w, h } = sizeOf(s);
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  const ctx = cv.getContext("2d");
  const r = photoRect(s), story = h === 1920;
  const B = s.pattern === "B", ink = s.bg === "ink";
  ctx.globalAlpha = 1;
  ctx.fillStyle = B ? (ink ? INK : PAPER) : "#222";
  ctx.fillRect(0, 0, w, h);
  if (s.img) {
    const d = coverSize(s.img, r, s.crop.z);
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.drawImage(s.img, r.x - (d.w - r.w) * s.crop.fx, r.y - (d.h - r.h) * s.crop.fy, d.w, d.h);
    ctx.restore();
  }
  if (B) {
    textBlock(ctx, s, { top: r.y + r.h + 64, hero: 112, val: 40, rule: true, color: ink ? "#fff" : INK });
  } else {
    const g = ctx.createLinearGradient(0, h / 2, 0, h);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.65)");
    ctx.fillStyle = g; ctx.fillRect(0, h / 2, w, h / 2);
    textBlock(ctx, s, { bottom: story ? 1670 : 1278, hero: 132, val: 44, color: "#fff" });
  }
}
