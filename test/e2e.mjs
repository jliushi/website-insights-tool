// End-to-end check: loads dist/chrome-test in Chrome for Testing, opens real websites and
// renders the popup (as a tab pointed at the site's tab id) for each one.
// Usage: node test/e2e.mjs [--shots]   (--shots also saves popup screenshots to test/out)
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(here, '../dist/chrome-test');
const outDir = path.resolve(here, 'out');
mkdirSync(outDir, { recursive: true });
const shots = process.argv.includes('--shots');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const lang = process.argv.find((a) => a.startsWith('--lang='))?.slice(7) || 'en-US';

const SITES = [
  { url: 'https://github.com/', expect: { rank: true, age: true, tech: ['React'] } },
  { url: 'https://wordpress.org/', expect: { rank: true, age: true, tech: ['WordPress'] } },
  { url: 'https://nextjs.org/', expect: { rank: true, age: true, tech: ['Next.js', 'React'] } },
  { url: 'https://vuejs.org/', expect: { rank: true, age: true, tech: ['Vue.js'] } },
  { url: 'https://www.bbc.co.uk/', expect: { rank: true, age: true } },
  { url: 'https://www.spiegel.de/', expect: { rank: true, age: false } },
  { url: 'https://example.com/', expect: { rank: true, age: true } },
  { url: 'http://httpforever.com/', expect: { rank: true, age: true } },
];

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: true,
  args: [`--lang=${lang}`, '--window-size=1280,800', '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable,HttpsFirstModeV2ForTypicallySecureUsers,HttpsFirstModeIncognito'],
  defaultViewport: { width: 1280, height: 800 },
});
const extId = await browser.installExtension(extPath);
console.log('extension id', extId);

const results = [];
for (const site of SITES) {
  if (only && !site.url.includes(only)) continue;
  const r = { url: site.url, ok: true, notes: [] };
  const page = await browser.newPage();
  try {
    await page.goto(site.url, { waitUntil: 'load', timeout: 45000 });
    await new Promise((res) => setTimeout(res, 2500));
    const popup = await browser.newPage();
    await popup.setViewport(shots ? { width: 400, height: 590, deviceScaleFactor: 2 } : { width: 440, height: 1400 });
    await popup.goto(`chrome-extension://${extId}/options/options.html`);
    const finalUrl = page.url();
    const tabId = await popup.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({});
      return (tabs.find((t) => t.url === u) || tabs.find((t) => /^https?:/.test(t.url || '')))?.id;
    }, finalUrl);
    if (!tabId) throw new Error('tab not found');
    await popup.goto(`chrome-extension://${extId}/popup/popup.html?tabId=${tabId}${shots ? '&frame=popup' : ''}`);
    // Wait until every skeleton placeholder has been replaced.
    await popup.waitForFunction(() => !document.querySelector('.skeleton') && document.querySelectorAll('.stat .v')[0]?.textContent !== '…', { timeout: 40000 }).catch(() => r.notes.push('timeout waiting for data'));
    const data = await popup.evaluate(() => {
      const txt = (sel) => document.querySelector(sel)?.innerText?.trim() || '';
      return {
        host: txt('#host'),
        overview: txt('#panel-overview'),
        tech: [...document.querySelectorAll('#panel-tech .chip')].map((c) => c.firstChild.textContent),
        seoScore: txt('#panel-seo .ring span'),
        speed: txt('#speed-local'),
        errors: [...document.querySelectorAll('.hint.error')].map((e) => e.innerText),
      };
    });
    r.data = { host: data.host, tech: data.tech, seoScore: data.seoScore, errors: data.errors };
    const rankOk = /#[\d,]+/.test(data.overview) || /top 1 million/i.test(data.overview);
    if (site.expect.rank && !rankOk) { r.ok = false; r.notes.push('no rank'); }
    const ageOk = /\d+ (yr|years|months|days|年|个月|天)/.test(data.overview);
    if (site.expect.age && !ageOk) { r.ok = false; r.notes.push('no domain age'); }
    if (!site.expect.age && !/registry doesn't publish/.test(data.overview) && lang.startsWith('en')) r.notes.push('expected RDAP unsupported message');
    for (const tname of site.expect.tech || []) if (!data.tech.includes(tname)) { r.ok = false; r.notes.push(`missing tech ${tname}`); }
    if (!/^\d+$/.test(data.seoScore)) { r.ok = false; r.notes.push('no SEO score'); }
    if (!/TTFB/.test(data.speed)) { r.ok = false; r.notes.push('no local speed'); }
    if (data.errors.length) r.notes.push(`errors shown: ${data.errors.join(' | ')}`);
    if (shots) {
      const slug = new URL(site.url).hostname.replace(/^www\./, '');
      for (const tab of ['overview', 'tech', 'seo', 'speed']) {
        await popup.click(`.tab[data-tab="${tab}"]`);
        await new Promise((res) => setTimeout(res, 150));
        const el = await popup.$('body');
        await el.screenshot({ path: path.join(outDir, `${slug}-${tab}-${lang}.png`) });
      }
      await page.bringToFront();
      await page.screenshot({ path: path.join(outDir, `${slug}-page.png`) });
    }
    await popup.close();
  } catch (e) {
    r.ok = false;
    r.notes.push(String(e.message || e));
  }
  await page.close();
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${site.url}  tech=[${(r.data?.tech || []).join(', ')}] seo=${r.data?.seoScore ?? '-'} ${r.notes.join('; ')}`);
  await new Promise((res) => setTimeout(res, 1200)); // stay under Tranco's 1 req/s limit
}

writeFileSync(path.join(outDir, `results-${lang}.json`), JSON.stringify(results, null, 2));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
