// Edge-case checks: options page, keyless PageSpeed run, browser-internal and
// extension-blocked pages. Usage: node test/e2e-extra.mjs
import puppeteer from 'puppeteer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(here, '../dist/chrome-test');
const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: true, args: ['--lang=en-US'] });
const extId = await browser.installExtension(extPath);
const base = `chrome-extension://${extId}`;
let failed = 0;
const check = (name, ok, info = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? `  (${info})` : ''}`);
};

async function tabIdFor(match) {
  const helper = await browser.newPage();
  await helper.goto(`${base}/options/options.html`);
  const id = await helper.evaluate(async (m) => (await chrome.tabs.query({})).find((t) => (t.url || '').includes(m))?.id, match);
  await helper.close();
  return id;
}

async function openPopupFor(match) {
  const id = await tabIdFor(match);
  const popup = await browser.newPage();
  await popup.goto(`${base}/popup/popup.html?tabId=${id}`);
  return popup;
}

// 1. Options page renders with every string localized.
{
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/options/options.html#privacy`);
  const text = await p.evaluate(() => document.body.innerText);
  const rawKeys = text.match(/\b(opt|privacy|options)_[a-z_]+\b/g) || [];
  check('options page localized', rawKeys.length === 0 && /Google API key/.test(text) && /Privacy/.test(text), rawKeys.join(','));
  check('options page no JS errors', errors.length === 0, errors.join(' | '));
  // Saving an empty form must succeed without any permission prompt.
  await p.click('#save');
  await p.waitForFunction(() => document.getElementById('save-status').textContent.length > 0, { timeout: 5000 });
  check('options save (no keys)', (await p.$eval('#save-status', (e) => e.textContent)) === 'Saved.');
  await p.close();
}

// 2. Keyless PageSpeed run ends in a result or a clear "add a key" hint, never a hang.
{
  const site = await browser.newPage();
  await site.goto('https://example.com/', { waitUntil: 'load' });
  const popup = await openPopupFor('example.com');
  const errors = [];
  popup.on('pageerror', (e) => errors.push(e.message));
  await popup.waitForFunction(() => !document.querySelector('.skeleton'), { timeout: 30000 });
  await popup.click('.tab[data-tab="speed"]');
  await popup.click('#speed-psi .btn.primary');
  await popup.waitForFunction(() => !document.querySelector('#speed-psi .spinner'), { timeout: 95000 });
  const out = await popup.$eval('#speed-psi', (e) => e.innerText);
  check('PageSpeed keyless run resolves', /Performance score|shared free quota|API key/i.test(out), out.split('\n').slice(-2).join(' / '));
  check('popup no JS errors (example.com)', errors.length === 0, errors.join(' | '));
  await popup.close();
  await site.close();
}

// 3. Browser-internal page: friendly message, no tabs.
{
  const internal = await browser.newPage();
  await internal.goto('chrome://version/');
  const popup = await openPopupFor('chrome://version');
  await popup.waitForFunction(() => document.querySelector('.empty'), { timeout: 10000 }).catch(() => {});
  const out = await popup.evaluate(() => ({ text: document.body.innerText, tabsHidden: document.querySelector('.tabs').hidden }));
  check('internal page shows unsupported message', /Open a website/.test(out.text) && out.tabsHidden);
  await popup.close();
  await internal.close();
}

// 4. Page where extensions can't inject (Chrome Web Store): domain data still shows.
{
  const store = await browser.newPage();
  await store.goto('https://chromewebstore.google.com/', { waitUntil: 'domcontentloaded' });
  const popup = await openPopupFor('chromewebstore.google.com');
  await popup.waitForFunction(() => !document.querySelector('.skeleton'), { timeout: 40000 }).catch(() => {});
  const out = await popup.evaluate(() => ({
    overview: document.getElementById('panel-overview').innerText,
    tech: document.getElementById('panel-tech').innerText,
  }));
  check('blocked page keeps rank + domain', /#[\d,]+/.test(out.overview) && /Domain age/.test(out.overview));
  check('blocked page explains inspection limit', /can't be inspected/.test(out.tech));
  await popup.close();
  await store.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall extra checks passed');
process.exit(failed ? 1 : 0);
