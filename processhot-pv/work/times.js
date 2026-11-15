const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const out = {};
  for (const v of ['reel', 'story']) { const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
    await p.goto('file://' + path.join(__dirname, 'video.html') + '?v=' + v); await p.evaluate(() => window.ready);
    out[v] = await p.evaluate(() => ({ dur: T.dur, taps: T.taps.map((x) => x[0]), screens: T.screens.map((x) => x[0]), heroSwap: T.heroSwap, ui: T.ui, lift: T.lift, facts: T.facts, gallery: T.gallery, end: T.end, outro: T.outro || null })); await p.close(); }
  console.log(JSON.stringify(out)); await b.close(); })();
