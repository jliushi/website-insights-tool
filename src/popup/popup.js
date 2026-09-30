import { t, localizeDocument, fmtNumber, fmtDate, fmtMs, fmtBytes, fmtAge, daysUntil } from '../lib/i18n.js';
import { registrableDomain, displayHost, tldOf } from '../lib/domain.js';
import { trancoRank, rdapLookup, radarRank, hasRadarPermission, cruxOrigin, pageSpeed, pruneCache, ApiError } from '../lib/api.js';
import { collectPage, collectGlobals } from '../lib/probe.js';
import { techInputs, detectTech } from '../lib/tech.js';
import { evaluateSeo, rate } from '../lib/seo.js';

const ext = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ DOM helper

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const card = (title, source, ...body) =>
  h('div', { class: 'card' }, h('div', { class: 'card-title' }, h('span', { text: title }), source ? h('span', { class: 'src' }, source) : null), ...body);

const hint = (text, linkText, onLink, extraClass = '') =>
  h('div', { class: `hint ${extraClass}` }, h('span', null, text, linkText ? ' ' : null,
    linkText ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); onLink(); } }, linkText) : null));

const skeleton = () => h('div', null, h('div', { class: 'skeleton lg' }), h('div', { class: 'skeleton' }));

const extLink = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

const openSettings = () => ext.runtime.openOptionsPage();

function errorText(err) {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited') return t('err_rate_limited');
    if (err.code === 'network') return t('err_network');
    if (err.code === 'auth') return t('err_auth');
    if (err.code === 'quota') return t('err_quota');
  }
  return t('err_generic', err?.message || String(err));
}

// ------------------------------------------------------------------ state

const state = {
  tab: null,
  url: null,
  domain: null,
  settings: {},
  page: null,
  pageError: null,
  tech: [],
  seo: null,
};

async function getTargetTab() {
  const params = new URLSearchParams(location.search);
  const param = params.get('tabId');
  if (param) {
    if (params.get('frame') !== 'popup') document.body.classList.add('tabview');
    return ext.tabs.get(Number(param));
  }
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ------------------------------------------------------------------ tabs

function selectTab(name) {
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `panel-${name}`;
  document.querySelector('main').scrollTop = 0;
}

function setupChrome() {
  localizeDocument();
  for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => selectTab(b.dataset.tab));
  $('settings').addEventListener('click', openSettings);
  $('privacy-link').addEventListener('click', (e) => {
    e.preventDefault();
    ext.tabs.create({ url: ext.runtime.getURL('options/options.html#privacy') });
  });
  $('refresh').addEventListener('click', refresh);
}

async function refresh() {
  if (state.domain) {
    const keys = [`cache:tranco:${state.domain}`, `cache:rdap:${state.domain}`, `cache:radar:${state.domain}`];
    if (state.url) for (const ff of ['ALL', 'PHONE', 'DESKTOP']) keys.push(`cache:crux:${ff}:${state.url.origin}`);
    await ext.storage.local.remove(keys).catch(() => {});
  }
  location.reload();
}

// ------------------------------------------------------------------ main

async function main() {
  setupChrome();
  state.settings = await ext.storage.local.get(['googleApiKey', 'cloudflareToken']).catch(() => ({}));
  pruneCache();

  try {
    state.tab = await getTargetTab();
  } catch {
    state.tab = null;
  }
  const rawUrl = state.tab?.url || '';
  if (!/^https?:\/\//i.test(rawUrl)) return renderUnsupported(rawUrl);

  state.url = new URL(rawUrl);
  state.domain = registrableDomain(state.url.hostname);
  renderHeader();

  for (const id of ['overview', 'tech', 'seo', 'speed']) $(`panel-${id}`).replaceChildren();
  const overview = $('panel-overview');
  const popCard = h('div', null, card(t('popularity'), null, skeleton()));
  const domainCard = h('div', null, card(t('domain'), null, skeleton()));
  const statsRow = h('div', { class: 'stats' }, statBox('…', t('stat_seo'), 'seo'), statBox('…', t('stat_tech'), 'tech'), statBox('…', t('stat_load'), 'speed'));
  overview.append(popCard, statsRow, domainCard);
  $('panel-tech').append(card(t('tab_tech'), null, skeleton()));
  $('panel-seo').append(card(t('tab_seo'), null, skeleton()));
  $('panel-speed').append(h('div', { id: 'speed-local' }, card(t('speed_local'), null, skeleton())), h('div', { id: 'speed-crux' }), h('div', { id: 'speed-psi' }));

  if (state.domain) {
    renderPopularity(popCard);
    renderDomain(domainCard);
  } else {
    popCard.replaceChildren(card(t('popularity'), null, hint(t('no_domain_data'))));
    domainCard.remove();
  }

  renderCrux();
  renderPsi();

  try {
    await inspectPage();
  } catch (e) {
    state.pageError = e;
  }
  renderTech();
  renderSeo();
  renderLocalSpeed();
  renderStats(statsRow);
}

function renderHeader() {
  const host = state.url.hostname;
  $('host').textContent = displayHost(state.domain || host);
  $('host').title = host;
  $('subhost').textContent = state.domain && host !== state.domain ? displayHost(host) : state.url.protocol === 'https:' ? t('secure_connection') : t('insecure_connection');
  const icon = state.tab.favIconUrl;
  if (icon && /^(https?:|data:image\/)/.test(icon)) {
    const img = $('favicon');
    img.src = icon;
    img.hidden = false;
    img.addEventListener('error', () => { img.hidden = true; });
  }
}

function renderUnsupported(rawUrl) {
  $('host').textContent = t('ext_short_name');
  $('subhost').textContent = rawUrl ? rawUrl.split(/[?#]/)[0].slice(0, 60) : '';
  document.querySelector('.tabs').hidden = true;
  $('panel-overview').replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'big-icon', text: '🌐' }), h('div', { text: t('unsupported_page') })));
}

// ------------------------------------------------------------------ page inspection

async function inspectPage() {
  const { globals, selectors, cssVars } = techInputs();
  const target = { tabId: state.tab.id };
  const [pageRes, globalsRes] = await Promise.allSettled([
    ext.scripting.executeScript({ target, func: collectPage, args: [selectors, cssVars] }),
    ext.scripting.executeScript({ target, func: collectGlobals, args: [globals], world: 'MAIN' }),
  ]);
  if (pageRes.status === 'rejected') throw pageRes.reason;
  const page = pageRes.value?.[0]?.result;
  if (!page) throw new Error(pageRes.value?.[0]?.error?.message || 'no result');
  state.page = page;
  const globalFacts = globalsRes.status === 'fulfilled' ? globalsRes.value?.[0]?.result || {} : {};
  state.tech = detectTech(page, globalFacts);
  state.seo = evaluateSeo(page);
}

function pageBlockedHint() {
  return hint(t('page_blocked'), null, null);
}

// ------------------------------------------------------------------ overview: popularity

function rankTier(rank) {
  if (rank == null) return t('tier_unranked');
  if (rank <= 1000) return t('tier_1k');
  if (rank <= 10000) return t('tier_10k');
  if (rank <= 100000) return t('tier_100k');
  return t('tier_1m');
}

function sparkline(history) {
  const pts = history.map((x) => Math.log10(Math.max(1, x.rank)));
  if (pts.length < 2) return null;
  const w = 120, hgt = 34, pad = 3;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const coords = pts.map((v, i) => [
    pad + (i / (pts.length - 1)) * (w - 2 * pad),
    pad + ((v - min) / span) * (hgt - 2 * pad), // lower rank number = higher on the chart
  ]);
  const d = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${d} L${coords[coords.length - 1][0].toFixed(1)} ${hgt} L${coords[0][0].toFixed(1)} ${hgt} Z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('width', w);
  svg.setAttribute('height', hgt);
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('rank_history'));
  const a = document.createElementNS(ns, 'path');
  a.setAttribute('class', 'area');
  a.setAttribute('d', area);
  const l = document.createElementNS(ns, 'path');
  l.setAttribute('d', d);
  svg.append(a, l);
  return svg;
}

async function renderPopularity(container) {
  const trancoBody = h('div', null, skeleton());
  const radarBody = h('div', { style: 'margin-top:12px' });
  container.replaceChildren(card(t('popularity'), extLink('https://tranco-list.eu/', 'Tranco'), trancoBody, radarBody));

  const radarTask = renderRadar(radarBody);
  try {
    const r = await trancoRank(state.domain);
    if (r.rank == null) {
      trancoBody.replaceChildren(
        h('div', { class: 'big-row' }, h('div', null, h('div', { class: 'big', text: '—' }), h('div', { class: 'label', text: t('tranco_rank') }))),
        h('div', { class: 'small muted', style: 'margin-top:6px', text: t('tranco_unranked') }),
      );
    } else {
      const first = r.history[0];
      let trend = null;
      if (first && r.history.length > 5 && first.rank !== r.rank) {
        const diff = first.rank - r.rank;
        const days = Math.round((new Date(r.date) - new Date(first.date)) / 864e5);
        trend = h('span', { class: `trend ${diff > 0 ? 'up' : 'down'}`, text: t(diff > 0 ? 'trend_up' : 'trend_down', [fmtNumber(Math.abs(diff)), days]) });
      } else if (first && r.history.length > 5) {
        trend = h('span', { class: 'trend muted', text: t('trend_flat') });
      }
      trancoBody.replaceChildren(
        h('div', { class: 'big-row' },
          h('div', null, h('div', { class: 'big', text: `#${fmtNumber(r.rank)}` }), h('div', { class: 'label', text: t('tranco_rank') })),
          sparkline(r.history)),
        h('div', { class: 'row small', style: 'margin-top:6px;justify-content:space-between' },
          h('span', { text: rankTier(r.rank) }), trend),
      );
    }
  } catch (e) {
    trancoBody.replaceChildren(hint(errorText(e), null, null, 'error'));
  }
  await radarTask;
}

async function renderRadar(el) {
  const token = state.settings.cloudflareToken;
  if (!token) {
    el.replaceChildren(hint(t('radar_hint'), t('open_settings'), openSettings));
    return;
  }
  if (!(await hasRadarPermission())) {
    el.replaceChildren(hint(t('radar_permission'), t('open_settings'), openSettings));
    return;
  }
  el.replaceChildren(h('div', { class: 'skeleton' }));
  try {
    const r = await radarRank(state.domain, token);
    const rankText = r.rank != null ? `#${fmtNumber(r.rank)}` : r.bucket ? t('radar_bucket', fmtNumber(Number(r.bucket) || r.bucket)) : t('radar_unranked');
    el.replaceChildren(
      h('dl', { class: 'kv', style: 'margin-top:0' },
        h('dt', null, extLink(`https://radar.cloudflare.com/domains/domain/${encodeURIComponent(state.domain)}`, 'Cloudflare Radar')),
        h('dd', { text: rankText }),
        r.locations.length ? [h('dt', { text: t('radar_top_locations') }), h('dd', { text: r.locations.slice(0, 3).map((l) => `${l.code}${l.rank ? ` #${fmtNumber(l.rank)}` : ''}`).join(' · ') })] : null),
      r.categories.length ? h('div', { class: 'chips', style: 'margin-top:8px' }, r.categories.slice(0, 6).map((c) => h('span', { class: 'chip', text: c }))) : null,
    );
  } catch (e) {
    el.replaceChildren(hint(`Cloudflare Radar: ${errorText(e)}`, null, null, 'error'));
  }
}

// ------------------------------------------------------------------ overview: domain

async function renderDomain(container) {
  const body = h('div', null, skeleton());
  const src = h('span');
  container.replaceChildren(card(t('domain'), src, body));
  try {
    const d = await rdapLookup(state.domain);
    src.replaceChildren(`RDAP · ${d.source}`);
    const age = fmtAge(d.registered);
    const left = daysUntil(d.expires);
    const expires = h('span', { text: fmtDate(d.expires) });
    if (left != null && left < 30) {
      expires.append(' ', h('span', { class: 'trend down', text: left < 0 ? t('expired') : t('expires_soon', left) }));
    }
    body.replaceChildren(
      h('div', { class: 'big', text: age || '—' }),
      h('div', { class: 'label', text: t('domain_age') }),
      h('dl', { class: 'kv' },
        h('dt', { text: t('registered') }), h('dd', { text: fmtDate(d.registered) }),
        h('dt', { text: t('expires') }), h('dd', null, expires),
        d.updated ? [h('dt', { text: t('updated') }), h('dd', { text: fmtDate(d.updated) })] : null,
        d.registrar ? [h('dt', { text: t('registrar') }), h('dd', { text: d.registrar })] : null,
        d.dnssec != null ? [h('dt', { text: 'DNSSEC' }), h('dd', { text: d.dnssec ? t('enabled') : t('disabled') })] : null,
        d.nameservers.length ? [h('dt', { text: t('nameservers') }), h('dd', { text: d.nameservers.slice(0, 2).join(', ') })] : null,
      ),
    );
  } catch (e) {
    src.replaceChildren('RDAP');
    let text;
    if (e instanceof ApiError && e.code === 'unsupported') text = t('rdap_unsupported', tldOf(state.domain));
    else if (e instanceof ApiError && e.code === 'not_found') text = t('rdap_not_found');
    else text = errorText(e);
    body.replaceChildren(hint(text, null, null, e?.code === 'unsupported' ? '' : 'error'));
  }
}

// ------------------------------------------------------------------ overview: stats

function statBox(value, label, tab) {
  return h('div', { class: 'stat', role: 'button', tabindex: '0', 'data-goto': tab, onclick: () => selectTab(tab),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTab(tab); } } },
  h('div', { class: 'v', text: value }), h('div', { class: 'l', text: label }));
}

function renderStats(row) {
  const p = state.page;
  const lcp = p?.perf?.lcp ?? p?.perf?.load ?? null;
  const loadLabel = p?.perf?.lcp != null ? t('stat_lcp') : t('stat_load');
  row.replaceChildren(
    statBox(state.seo?.score != null ? `${state.seo.score}` : '—', t('stat_seo'), 'seo'),
    statBox(p ? String(state.tech.length) : '—', t('stat_tech'), 'tech'),
    statBox(fmtMs(lcp), loadLabel, 'speed'),
  );
  const seoBox = row.children[0].querySelector('.v');
  if (state.seo?.score != null) seoBox.style.color = `var(--${state.seo.score >= 80 ? 'good' : state.seo.score >= 50 ? 'ni' : 'poor'})`;
  const lcpRating = p?.perf?.lcp != null ? rate('lcp', p.perf.lcp) : 'none';
  if (lcpRating !== 'none') row.children[2].querySelector('.v').style.color = `var(--${lcpRating})`;
}

// ------------------------------------------------------------------ tech

function renderTech() {
  const panel = $('panel-tech');
  if (!state.page) return panel.replaceChildren(card(t('tab_tech'), null, pageBlockedHint()));
  const groups = new Map();
  for (const item of state.tech) {
    if (!groups.has(item.cat)) groups.set(item.cat, []);
    groups.get(item.cat).push(item);
  }
  const body = [];
  if (!state.tech.length) body.push(h('div', { class: 'muted', text: t('tech_none') }));
  for (const [cat, items] of groups) {
    body.push(h('div', { class: 'group-title', text: t(`cat_${cat}`) }),
      h('div', { class: 'chips' }, items.map((i) => h('span', { class: 'chip' }, i.name, i.version ? h('span', { class: 'ver', text: i.version }) : null))));
  }
  const hd = state.page.headers || {};
  const proto = state.page.perf?.protocol;
  const facts = [
    hd.server ? [t('server'), hd.server] : null,
    hd['x-powered-by'] ? ['X-Powered-By', hd['x-powered-by']] : null,
    proto ? [t('protocol'), protoName(proto)] : null,
    hd['content-encoding'] ? [t('compression'), hd['content-encoding']] : null,
  ].filter(Boolean);
  panel.replaceChildren(
    card(t('tech_detected', state.tech.length), null, ...body),
    facts.length ? card(t('server_info'), null, h('dl', { class: 'kv', style: 'margin-top:0' }, facts.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]))) : null,
    h('div', { class: 'small muted', style: 'padding:0 4px', text: t('tech_note') }),
  );
}

function protoName(p) {
  const map = { h2: 'HTTP/2', h3: 'HTTP/3', 'http/1.1': 'HTTP/1.1', 'http/1.0': 'HTTP/1.0' };
  return map[p.toLowerCase()] || p.toUpperCase();
}

// ------------------------------------------------------------------ SEO

const SEO_DETAIL = {
  title: { pass: 'seod_chars', warn: 'seod_title_warn', fail: 'seod_missing' },
  description: { pass: 'seod_chars', warn: 'seod_desc_warn', fail: 'seod_missing' },
  h1: { pass: 'seod_h1_one', warn: 'seod_h1_many', fail: 'seod_missing' },
  subheadings: { pass: 'seod_h2_count', warn: 'seod_h2_none' },
  alt: { pass: 'seod_alt_ok', warn: 'seod_alt_missing', fail: 'seod_alt_missing', info: 'seod_no_images' },
  words: { pass: 'seod_words', warn: 'seod_words_thin', fail: 'seod_words_thin' },
  indexable: { pass: 'seod_indexable', fail: 'seod_noindex' },
  canonical: { pass: 'seod_value', info: 'seod_canonical_other', warn: 'seod_missing' },
  robots: { pass: 'seod_found', fail: 'seod_robots_block', info: 'seod_unchecked', warn: 'seod_not_found' },
  sitemap: { pass: 'seod_found', warn: 'seod_not_found', info: 'seod_unchecked' },
  lang: { pass: 'seod_value', warn: 'seod_missing' },
  hreflang: { info: 'seod_hreflang' },
  structured: { pass: 'seod_value', warn: 'seod_structured_none' },
  og: { pass: 'seod_og_all', warn: 'seod_og_partial', fail: 'seod_missing' },
  twitter: { pass: 'seod_value', warn: 'seod_missing' },
  https: { pass: 'seod_https', fail: 'seod_http' },
  viewport: { pass: 'seod_found', fail: 'seod_missing' },
  favicon: { pass: 'seod_found', warn: 'seod_missing' },
  charset: { pass: 'seod_value', warn: 'seod_value' },
  hsts: { pass: 'seod_header_set', warn: 'seod_header_missing', info: 'seod_hsts_http' },
  csp: { pass: 'seod_header_set', warn: 'seod_header_missing' },
  frame: { pass: 'seod_header_set', warn: 'seod_header_missing' },
  nosniff: { pass: 'seod_header_set', warn: 'seod_header_missing' },
  referrer: { pass: 'seod_header_set', warn: 'seod_header_missing' },
  headers_unavailable: { info: 'seod_headers_unavailable' },
};
const MARK = { pass: '✓', warn: '!', fail: '✕', info: 'i' };

function renderSeo() {
  const panel = $('panel-seo');
  if (!state.page) return panel.replaceChildren(card(t('tab_seo'), null, pageBlockedHint()));
  const { score, checks } = state.seo;
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) if (c.status in counts) counts[c.status]++;
  const ratingClass = score >= 80 ? 'good' : score >= 50 ? 'ni' : 'poor';
  const ring = h('div', { class: `ring ${ratingClass}`, style: `--p:${score ?? 0}` }, h('span', { text: score ?? '—' }));

  const p = state.page;
  const snippet = card(t('seo_snippet'), null,
    h('div', { class: 'label', text: t('seo_title') }), h('div', { class: 'quote', text: p.title || t('seod_missing') }),
    h('div', { class: 'label', style: 'margin-top:8px', text: t('seo_description') }), h('div', { class: 'quote', text: p.description || t('seod_missing') }),
    p.headings.h1.length ? [h('div', { class: 'label', style: 'margin-top:8px', text: 'H1' }), p.headings.h1.slice(0, 2).map((x) => h('div', { class: 'quote', text: x }))] : null,
  );

  const groups = ['content', 'indexing', 'social', 'technical', 'security'];
  const list = [];
  for (const g of groups) {
    const items = checks.filter((c) => c.group === g);
    if (!items.length) continue;
    list.push(h('div', { class: 'group-title', text: t(`seog_${g}`) }));
    for (const c of items) {
      const key = SEO_DETAIL[c.id]?.[c.status];
      list.push(h('div', { class: 'check' },
        h('span', { class: `dot ${c.status}`, text: MARK[c.status], 'aria-label': t(`status_${c.status}`) }),
        h('span', { class: 'name', text: t(`seo_${c.id}`) }),
        key ? h('span', { class: 'detail', text: t(key, c.args) }) : null));
    }
  }

  panel.replaceChildren(
    card(t('seo_score'), null, h('div', { class: 'score' }, ring, h('div', null,
      h('div', { text: t('seo_counts', [counts.pass, counts.warn, counts.fail]) }),
      h('div', { class: 'small muted', text: t('seo_page_note') })))),
    snippet,
    card(t('seo_checks'), null, ...list),
  );
}

// ------------------------------------------------------------------ speed

function metricBox(label, value, rating) {
  return h('div', { class: `metric ${rating}` }, h('div', { class: 'm', text: label }), h('div', { class: 'v', text: value }));
}

function renderLocalSpeed() {
  const el = $('speed-local');
  if (!state.page) return el.replaceChildren(card(t('speed_local'), null, pageBlockedHint()));
  const p = state.page.perf;
  const boxes = [
    metricBox('TTFB', fmtMs(p.ttfb), rate('ttfb', p.ttfb)),
    metricBox('FCP', fmtMs(p.fcp), rate('fcp', p.fcp)),
    metricBox('LCP', fmtMs(p.lcp), rate('lcp', p.lcp)),
    metricBox('CLS', p.cls == null ? '—' : p.cls.toFixed(3), rate('cls', p.cls)),
    metricBox(t('m_dcl'), fmtMs(p.domContentLoaded), 'none'),
    metricBox(t('m_load'), fmtMs(p.load), 'none'),
  ];
  el.replaceChildren(card(t('speed_local'), t('speed_local_src'),
    h('div', { class: 'metrics' }, boxes),
    h('dl', { class: 'kv' },
      h('dt', { text: t('m_requests') }), h('dd', { text: fmtNumber(p.requests) }),
      h('dt', { text: t('m_transfer') }), h('dd', { text: fmtBytes(p.transferBytes) }),
      h('dt', { text: t('m_dom') }), h('dd', { text: fmtNumber(p.domNodes) }),
      p.protocol ? [h('dt', { text: t('protocol') }), h('dd', { text: protoName(p.protocol) })] : null),
    h('div', { class: 'small muted', style: 'margin-top:8px', text: p.cls == null ? `${t('speed_local_note')} ${t('cls_unsupported')}` : t('speed_local_note') }),
  ));
}

async function renderCrux() {
  const el = $('speed-crux');
  const key = state.settings.googleApiKey;
  const src = extLink('https://developer.chrome.com/docs/crux', 'Chrome UX Report');
  if (!key) {
    el.replaceChildren(card(t('speed_crux'), src, hint(t('crux_hint'), t('open_settings'), openSettings)));
    return;
  }
  el.replaceChildren(card(t('speed_crux'), src, skeleton()));
  try {
    const r = await cruxOrigin(state.url.origin, key);
    if (!r) {
      el.replaceChildren(card(t('speed_crux'), src, h('div', { class: 'muted', text: t('crux_no_data') })));
      return;
    }
    const m = r.metrics;
    const fmtMetric = (k) => (m[k] ? (k === 'cls' ? m[k].p75.toFixed(2) : fmtMs(m[k].p75)) : '—');
    const cwvKnown = m.lcp && m.cls && m.inp;
    const passed = cwvKnown && ['lcp', 'inp', 'cls'].every((k) => rate(k, m[k].p75) === 'good');
    el.replaceChildren(card(t('speed_crux'), src,
      cwvKnown ? h('div', { class: 'row', style: 'margin-bottom:8px' },
        h('span', { class: `dot ${passed ? 'pass' : 'fail'}`, text: passed ? '✓' : '✕' }),
        h('strong', { text: passed ? t('cwv_passed') : t('cwv_failed') })) : null,
      h('div', { class: 'metrics' },
        ['lcp', 'inp', 'cls', 'fcp', 'ttfb'].map((k) => metricBox(`${k.toUpperCase()} p75`, fmtMetric(k), m[k] ? rate(k, m[k].p75) : 'none'))),
      h('div', { class: 'small muted', style: 'margin-top:8px', text: t('crux_note') }),
    ));
  } catch (e) {
    el.replaceChildren(card(t('speed_crux'), src, hint(errorText(e), t('open_settings'), openSettings, 'error')));
  }
}

function renderPsi() {
  const el = $('speed-psi');
  const key = state.settings.googleApiKey;
  const target = `${state.url.origin}${state.url.pathname}`;
  let strategy = 'mobile';
  const seg = h('div', { class: 'seg', role: 'group' },
    ['mobile', 'desktop'].map((s) => h('button', { type: 'button', 'aria-pressed': String(s === strategy), 'data-s': s, text: t(`psi_${s}`),
      onclick: (e) => { strategy = s; for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.s === s)); e.currentTarget.blur(); } })));
  const result = h('div');
  const run = h('button', { class: 'btn primary', type: 'button', text: t('psi_run'), title: t('psi_privacy') });
  run.addEventListener('click', async () => {
    run.disabled = true;
    run.replaceChildren(h('span', { class: 'spinner' }), t('psi_running'));
    result.replaceChildren();
    try {
      const r = await pageSpeed(target, key, strategy);
      const cls = r.score >= 90 ? 'good' : r.score >= 50 ? 'ni' : 'poor';
      const lab = r.lab;
      result.replaceChildren(
        h('div', { class: 'score', style: 'margin-top:10px' },
          h('div', { class: `ring ${cls}`, style: `--p:${r.score ?? 0}` }, h('span', { text: r.score ?? '—' })),
          h('div', null, h('div', { text: t('psi_score', t(`psi_${r.strategy}`)) }), extLink(r.reportUrl, t('psi_full_report')))),
        h('div', { class: 'metrics', style: 'margin-top:10px' },
          metricBox('FCP', fmtMs(lab.fcp.value), rate('fcp', lab.fcp.value)),
          metricBox('LCP', fmtMs(lab.lcp.value), rate('lcp', lab.lcp.value)),
          metricBox('TBT', fmtMs(lab.tbt.value), rate('tbt', lab.tbt.value)),
          metricBox('CLS', lab.cls.value == null ? '—' : lab.cls.value.toFixed(3), rate('cls', lab.cls.value)),
          metricBox('Speed Index', fmtMs(lab.si.value), rate('si', lab.si.value))),
      );
    } catch (e) {
      const needsKey = !key && e instanceof ApiError && (e.code === 'quota' || e.code === 'auth');
      result.replaceChildren(h('div', { style: 'margin-top:10px' },
        needsKey ? hint(t('psi_need_key'), t('open_settings'), openSettings) : hint(errorText(e), null, null, 'error')));
    } finally {
      run.disabled = false;
      run.replaceChildren(t('psi_run'));
    }
  });
  el.replaceChildren(card(t('speed_psi'), extLink('https://pagespeed.web.dev/', 'PageSpeed Insights'),
    h('div', { class: 'row' }, seg, run),
    h('div', { class: 'small muted', style: 'margin-top:8px', text: key ? t('psi_privacy') : `${t('psi_privacy')} ${t('psi_no_key')}` }),
    result));
}

main().catch((e) => {
  $('panel-overview').replaceChildren(hint(errorText(e), null, null, 'error'));
});
