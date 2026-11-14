// Renders video.html frame by frame (deterministic seek) and pipes PNG frames to ffmpeg.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
(async () => {
  const v = process.argv[2] || 'reel', out = process.argv[3], FPS = 30;
  const only = process.argv[4] ? process.argv[4].split(',').map(Number) : null; // still frames at given seconds
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await p.goto('file://' + path.join(__dirname, 'video.html') + '?v=' + v);
  await p.evaluate(() => window.ready);
  const dur = await p.evaluate(() => window.DUR);
  if (only) {
    for (const t of only) { await p.evaluate((t) => window.seek(t), t); await p.screenshot({ path: `${out}_${String(t).replace('.', '_')}.jpg`, type: 'jpeg', quality: 80 }); }
    await b.close(); return;
  }
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.seek(t), i / FPS);
    const buf = await p.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(v, i, '/', n);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  await b.close(); console.log('done', out);
})().catch((e) => { console.error(e); process.exit(1); });
