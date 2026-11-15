// Drives the live site (https://processhot.com) in an emulated iPhone and records
// every UI state as a screenshot plus tap coordinates. Also saves the JPEG the site produces.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const S = path.resolve(__dirname, '..');
const OUT = path.join(S, 'cap');
const VW = 393, VH = 720;

const JOBS = {
  cafe:  { photo: 'cafe.jpg',  main: 'ナチュラル', sub: 'アナエロビック', country: 'エチオピア', shop: 'Kissa Hakko', full: true },
  real:  { photo: 'cafe.jpg',  main: 'ウォッシュド', sub: null, country: 'エチオピア', shop: null, full: true },
  home:  { photo: 'home.jpg',  main: 'ナチュラル', sub: 'アナエロビック', country: 'エチオピア', shop: 'Kissa Hakko' },
  beans: { photo: 'beans.jpg', main: 'ハニー', sub: 'レッド', country: 'コスタリカ', shop: 'Hakko Roasters' },
  iced:  { photo: 'iced.jpg',  main: 'ナチュラル', sub: 'カーボニックマセレーション', country: 'コロンビア', shop: 'Hakko Stand' },
};

(async () => {
  const names = (process.argv[2] || 'cafe,home,beans,iced').split(',');
  const browser = await chromium.launch();
  for (const name of names) {
    const job = JOBS[name];
    const dir = path.join(OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({
      ...devices['iPhone 14 Pro'], viewport: { width: VW, height: VH },
      colorScheme: 'dark', locale: 'ja-JP', acceptDownloads: true,
    });
    const page = await ctx.newPage();
    await page.goto('https://processhot.com/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);

    const states = [];
    let n = 0;
    const settle = async () => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(120); };
    const snap = async (label, tap) => {
      await settle();
      const file = `${String(n++).padStart(2, '0')}_${label}.png`;
      if (job.full) {
        await page.screenshot({ path: path.join(dir, file) });
        if (await page.locator('#cv').isVisible()) fs.writeFileSync(path.join(dir, `cv_${label}.jpg`), Buffer.from((await page.evaluate(() => document.querySelector('#cv').toDataURL('image/jpeg', 0.95))).split(',')[1], 'base64'));
      }
      states.push({ label, file, tap: tap || null });
    };
    // centre of an element, in CSS px of the viewport — where the next tap lands
    const at = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const cvBox = async () => page.locator('#cv').boundingBox();

    // S0 top
    let tap = await at(page.locator('#start'));
    await snap('top', tap);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#start').click()]);
    await chooser.setFiles(path.join(S, 'photos', job.photo));
    await page.waitForSelector('#p1:not([hidden])');
    // S1 photo
    tap = await at(page.locator('#usephoto'));
    await snap('photo', tap);
    states[states.length - 1].cv = await cvBox();
    await page.locator('#usephoto').click();
    // S2 process
    const mainBtn = page.locator('#procMain button', { hasText: job.main });
    tap = await at(mainBtn);
    await snap('proc', tap);
    states[states.length - 1].cv = await cvBox();
    await mainBtn.click();
    if (job.sub) {
      const subBtn = page.locator('#procSub button', { hasText: new RegExp('^' + job.sub + '$') });
      tap = await at(subBtn);
      await snap('proc_main', tap);
      await subBtn.click();
    }
    // S3 country
    await page.waitForSelector('#p3:not([hidden])');
    const cBtn = page.locator('#cTop button', { hasText: new RegExp('^' + job.country + '$') });
    tap = await at(cBtn);
    await snap('country', tap);
    await cBtn.click();
    // S4 place
    await page.waitForSelector('#p4:not([hidden])');
    if (job.shop) {
      const shopBtn = page.locator('#placeMode button[data-m="shop"]');
      tap = await at(shopBtn);
      await snap('place', tap);
      await shopBtn.click();
      await snap('place_shop', null);
      for (let i = 1; i <= job.shop.length; i++) {
        await page.locator('#shop').pressSequentially(job.shop[i - 1]);
        if (i === job.shop.length) tap = await at(page.locator('#shopForm button'));
        if (i % 2 === 0 || i === job.shop.length) await snap(`place_type${String(i).padStart(2, '0')}`, i === job.shop.length ? tap : null);
      }
      await page.locator('#shopForm button').click();
    } else {
      const homeBtn = page.locator('#placeMode button[data-m="home"]');
      tap = await at(homeBtn);
      await snap('place', tap);
      await homeBtn.click();
    }
    // S5 preview
    await page.waitForSelector('#p5:not([hidden])');
    await page.locator('#shop').blur().catch(() => {});
    const seg = (v) => page.locator(`#p5 [data-set="${v}"]`);
    await seg('pattern=A').click(); await seg('ratio=9:16').click();
    if (job.full) {
      tap = await at(seg('pattern=B'));
      await snap('preview_full', tap);
      states[states.length - 1].cv = await cvBox();
      await seg('pattern=B').click();
      tap = await at(seg('pattern=A'));
      await snap('preview_label', tap);
      states[states.length - 1].cv = await cvBox();
      await seg('pattern=A').click();
      tap = await at(page.locator('#save'));
      await snap('preview_back', tap);
    }
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#save').click()]);
    await dl.saveAs(path.join(dir, 'final.jpg'));
    await page.waitForSelector('#s6:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#result').complete && document.querySelector('#result').naturalWidth > 0);
    await snap('saved', null);
    fs.writeFileSync(path.join(dir, 'states.json'), JSON.stringify({ vw: VW, vh: VH, states }, null, 1));
    console.log(name, 'ok', states.length, 'states', dl.suggestedFilename());
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
