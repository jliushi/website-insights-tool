// Runs the popup against real sites in Firefox (WebDriver BiDi) using dist/firefox-test.
// Usage: node test/e2e-firefox.mjs
// (Firefox blocks WebDriver input/screenshots in extension pages, so this checks content only.)
import puppeteer from 'puppeteer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { readdirSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(here, '../dist/firefox-test');

const ffRoot = path.join(homedir(), '.cache', 'puppeteer', 'firefox');
const ffDir = readdirSync(ffRoot).filter((d) => d.includes('stable')).sort().pop();
const executablePath = path.join(ffRoot, ffDir, 'core', process.platform === 'win32' ? 'firefox.exe' : 'firefox');

const GECKO_ID = 'website-insights-tool@jliushi';
const UUID = '6f1f0f9e-3d2a-4c55-9d1e-0c1b2a3f4e5d';

const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath,
  headless: true,
  args: ['-remote-allow-system-access'],
  extraPrefsFirefox: {
    'extensions.webextensions.uuids': JSON.stringify({ [GECKO_ID]: UUID }),
    'intl.locale.requested': 'en-US',
  },
});
const version = await browser.version();
await browser.installExtension(extPath);
const base = `moz-extension://${UUID}`;
console.log('firefox', version);

let failed = 0;
const SITES = [
  { url: 'https://wordpress.org/', tech: 'WordPress' },
  { url: 'https://nextjs.org/', tech: 'Next.js' },
  { url: 'https://github.com/', tech: 'React' },
];
for (const site of SITES) {
  const page = await browser.newPage();
  const notes = [];
  let ok = true;
  try {
    const before = new Set(await browser.pages());
    await page.goto(`${site.url}#wit-test`, { waitUntil: 'load', timeout: 45000 });
    // BiDi reports extension pages as about:blank, so find the new tab and check its real URL.
    let popup = null;
    for (let i = 0; i < 60 && !popup; i++) {
      await new Promise((r) => setTimeout(r, 500));
      for (const p of await browser.pages()) {
        if (before.has(p)) continue;
        const href = await p.evaluate(() => location.href).catch(() => '');
        if (href.startsWith(`${base}/popup/`)) popup = p;
      }
    }
    if (!popup) throw new Error('popup tab did not open');
    await popup.waitForFunction(() => !document.querySelector('.skeleton') && document.querySelector('.stat .v')?.textContent !== '…', { timeout: 40000 }).catch(() => notes.push('timeout'));
    const d = await popup.evaluate(() => ({
      overview: document.getElementById('panel-overview').innerText,
      tech: [...document.querySelectorAll('#panel-tech .chip')].map((c) => c.firstChild.textContent),
      seo: document.querySelector('#panel-seo .ring span')?.textContent,
      speed: document.getElementById('speed-local').innerText,
      errors: [...document.querySelectorAll('.hint.error')].map((e) => e.innerText),
    }));
    if (!/#[\d,]+/.test(d.overview)) { ok = false; notes.push('no rank'); }
    if (!/\d+ (yr|years|months)/.test(d.overview)) { ok = false; notes.push('no age'); }
    if (!d.tech.includes(site.tech)) { ok = false; notes.push(`missing ${site.tech}`); }
    if (!/^\d+$/.test(d.seo || '')) { ok = false; notes.push('no seo'); }
    if (!/TTFB/.test(d.speed)) { ok = false; notes.push('no speed'); }
    if (d.errors.length) notes.push(`errors: ${d.errors.join(' | ')}`);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${site.url} tech=[${d.tech.join(', ')}] seo=${d.seo} ${notes.join('; ')}`);
    await popup.close();
  } catch (e) {
    ok = false;
    console.log(`FAIL ${site.url} ${e.message}`);
  }
  if (!ok) failed++;
  await page.close();
  await new Promise((r) => setTimeout(r, 1200));
}
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall firefox checks passed');
process.exit(failed ? 1 : 0);
