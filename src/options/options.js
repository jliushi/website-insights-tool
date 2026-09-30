import { t, localizeDocument } from '../lib/i18n.js';
import { RADAR_ORIGIN, cruxOrigin, pageSpeed, radarRank, ApiError } from '../lib/api.js';

const ext = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = `status ${kind || ''}`;
}

function describe(err) {
  if (err instanceof ApiError) {
    if (err.code === 'auth') return t('err_auth');
    if (err.code === 'quota') return t('err_quota');
    if (err.code === 'network') return t('err_network');
  }
  return t('err_generic', err?.message || String(err));
}

async function load() {
  localizeDocument();
  $('version').textContent = ext.runtime.getManifest().version;
  const s = await ext.storage.local.get(['googleApiKey', 'cloudflareToken']);
  $('google-key').value = s.googleApiKey || '';
  $('cf-token').value = s.cloudflareToken || '';
  if (location.hash === '#privacy') $('privacy').scrollIntoView();
}

/** Saves both fields. Must run from a click so the Cloudflare permission prompt is allowed. */
async function save() {
  const googleApiKey = $('google-key').value.trim();
  const cloudflareToken = $('cf-token').value.trim();
  const status = $('save-status');
  if (cloudflareToken) {
    let granted = false;
    try {
      granted = await ext.permissions.request({ origins: [RADAR_ORIGIN] });
    } catch {
      granted = false;
    }
    if (!granted) {
      setStatus(status, t('opt_cf_permission_denied'), 'err');
      return false;
    }
  } else {
    await ext.permissions.remove({ origins: [RADAR_ORIGIN] }).catch(() => {});
  }
  await ext.storage.local.set({ googleApiKey, cloudflareToken });
  // Cached results may have been produced with the previous key.
  const all = await ext.storage.local.get(null);
  await ext.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('cache:radar:') || k.startsWith('cache:crux:')));
  setStatus(status, t('opt_saved'), 'ok');
  return true;
}

async function testGoogle() {
  const key = $('google-key').value.trim();
  const el = $('google-status');
  if (!key) return setStatus(el, t('opt_enter_first'), 'err');
  setStatus(el, t('opt_testing'));
  $('test-google').disabled = true;
  const results = [];
  try {
    try {
      await cruxOrigin('https://www.google.com', key);
      results.push(`CrUX ✓`);
    } catch (e) {
      results.push(`CrUX ✕ ${describe(e)}`);
    }
    try {
      await pageSpeed('https://example.com/', key, 'desktop');
      results.push(`PageSpeed ✓`);
    } catch (e) {
      results.push(`PageSpeed ✕ ${describe(e)}`);
    }
    const ok = results.every((r) => r.includes('✓'));
    setStatus(el, results.join(' · '), ok ? 'ok' : 'err');
  } finally {
    $('test-google').disabled = false;
  }
}

async function testCloudflare() {
  const token = $('cf-token').value.trim();
  const el = $('cf-status');
  if (!token) return setStatus(el, t('opt_enter_first'), 'err');
  $('test-cf').disabled = true;
  try {
    const granted = await ext.permissions.request({ origins: [RADAR_ORIGIN] }).catch(() => false);
    if (!granted) return setStatus(el, t('opt_cf_permission_denied'), 'err');
    setStatus(el, t('opt_testing'));
    await ext.storage.local.remove('cache:radar:google.com');
    const r = await radarRank('google.com', token);
    setStatus(el, t('opt_test_ok'), 'ok');
  } catch (e) {
    setStatus(el, describe(e), 'err');
  } finally {
    $('test-cf').disabled = false;
  }
}

async function clearCache() {
  const all = await ext.storage.local.get(null);
  await ext.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('cache:')));
  setStatus($('save-status'), t('opt_cache_cleared'), 'ok');
}

for (const b of document.querySelectorAll('.reveal')) {
  b.addEventListener('click', () => {
    const input = $(b.dataset.for);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.textContent = t(show ? 'opt_hide' : 'opt_show');
  });
}
$('save').addEventListener('click', save);
$('test-google').addEventListener('click', testGoogle);
$('test-cf').addEventListener('click', testCloudflare);
$('clear-cache').addEventListener('click', clearCache);
load();
