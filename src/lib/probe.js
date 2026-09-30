// Functions injected into the inspected tab with scripting.executeScript.
// They must stay self-contained: no references to anything outside their own body.

/**
 * Runs in the extension's isolated world. Reads the DOM, the performance timeline and a
 * few same-origin files (response headers, robots.txt, sitemap.xml). Nothing leaves the page
 * except the returned object, which goes straight back to the popup.
 */
export async function collectPage(selectors, cssVars) {
  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const attr = (sel, name) => document.querySelector(sel)?.getAttribute(name) ?? null;
  const meta = (key) =>
    attr(`meta[name="${key}" i]`, 'content') ?? attr(`meta[property="${key}" i]`, 'content');

  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  const sameOrigin = async (path, method = 'GET') => {
    try {
      const ctrl = new AbortController();
      const res = await withTimeout(
        fetch(new URL(path, location.origin), { method, credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: ctrl.signal }),
        6000,
      );
      if (!res) { ctrl.abort(); return null; }
      return res;
    } catch {
      return null;
    }
  };

  // ---- SEO / content
  const h1s = [...document.querySelectorAll('h1')];
  const images = [...document.images];
  const anchors = [...document.querySelectorAll('a[href]')];
  let internal = 0, external = 0, nofollow = 0;
  for (const a of anchors) {
    let u;
    try { u = new URL(a.getAttribute('href'), location.href); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    if (u.hostname === location.hostname) internal++; else external++;
    if (/\bnofollow\b/i.test(a.rel)) nofollow++;
  }
  const jsonLdTypes = new Set();
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        const t = o['@type'];
        if (t) (Array.isArray(t) ? t : [t]).forEach((x) => jsonLdTypes.add(String(x)));
        if (o['@graph']) walk(o['@graph']);
      };
      walk(JSON.parse(s.textContent));
    } catch { /* invalid JSON-LD is reported as absent */ }
  }
  const bodyText = document.body ? document.body.innerText || '' : '';
  const words = bodyText.match(/[\p{L}\p{N}]+/gu) || [];
  const cjk = (bodyText.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;

  // ---- performance (this visit, this tab)
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = performance.getEntriesByType('paint');
  const resources = performance.getEntriesByType('resource');
  const observe = (type, pick) =>
    new Promise((resolve) => {
      try {
        const seen = [];
        const po = new PerformanceObserver((list) => seen.push(...list.getEntries()));
        po.observe({ type, buffered: true });
        setTimeout(() => {
          seen.push(...po.takeRecords());
          po.disconnect();
          resolve(pick(seen));
        }, 120);
      } catch {
        resolve(null);
      }
    });
  const lcpPromise = observe('largest-contentful-paint', (e) => (e.length ? e[e.length - 1].startTime : null));
  const clsPromise = observe('layout-shift', (entries) => {
    // Largest session window (1 s gap, 5 s cap), as in the CLS definition.
    let max = 0, cur = 0, start = 0, prev = 0;
    for (const e of entries) {
      if (e.hadRecentInput) continue;
      if (cur && (e.startTime - prev > 1000 || e.startTime - start > 5000)) { cur = 0; }
      if (!cur) start = e.startTime;
      cur += e.value;
      prev = e.startTime;
      max = Math.max(max, cur);
    }
    return max;
  });
  const clsSupported = (() => {
    try { return PerformanceObserver.supportedEntryTypes.includes('layout-shift'); } catch { return false; }
  })();

  // ---- same-origin network checks
  const [headRes, robotsRes, sitemapRes, lcp, cls] = await Promise.all([
    sameOrigin(location.href, 'HEAD'),
    sameOrigin('/robots.txt'),
    sameOrigin('/sitemap.xml', 'HEAD'),
    lcpPromise,
    clsPromise,
  ]);

  const HEADER_NAMES = [
    'server', 'x-powered-by', 'via', 'x-generator', 'x-drupal-cache', 'x-drupal-dynamic-cache', 'x-shopify-stage',
    'x-shopid', 'x-wix-request-id', 'cf-ray', 'cf-cache-status', 'x-vercel-id', 'x-vercel-cache', 'x-nf-request-id',
    'x-served-by', 'x-fastly-request-id', 'x-amz-cf-id', 'x-amz-cf-pop', 'x-cache', 'x-github-request-id',
    'x-akamai-transformed', 'akamai-grn', 'x-azure-ref', 'x-litespeed-cache', 'x-varnish', 'x-pingback',
    'x-aspnet-version', 'x-aspnetmvc-version', 'x-turbo-charged-by', 'x-kinsta-cache', 'x-hw', 'x-render-origin-server',
    'fly-request-id', 'x-railway-request-id', 'x-cdn', 'x-sucuri-id', 'x-ah-environment', 'x-pantheon-styx-hostname',
    'x-envoy-upstream-service-time', 'x-goog-generation', 'x-guploader-uploadid', 'x-deno-ray', 'eagleid', 'x-swift-cachetime',
    'strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options',
    'referrer-policy', 'permissions-policy', 'alt-svc', 'content-encoding',
  ];
  const headers = {};
  if (headRes) {
    for (const name of HEADER_NAMES) {
      const v = headRes.headers.get(name);
      if (v != null) headers[name] = v.slice(0, 300);
    }
  }

  let robots = { status: robotsRes ? robotsRes.status : null, disallowAll: false, sitemaps: [] };
  if (robotsRes && robotsRes.ok && /text\/plain/i.test(robotsRes.headers.get('content-type') || 'text/plain')) {
    const body = (await robotsRes.text().catch(() => '')).slice(0, 200000);
    let applies = false;
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*/, '').trim();
      const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!m) continue;
      const [, key, value] = m;
      if (/^user-agent$/i.test(key)) applies = value.trim() === '*';
      else if (/^disallow$/i.test(key) && applies && value.trim() === '/') robots.disallowAll = true;
      else if (/^sitemap$/i.test(key)) robots.sitemaps.push(value.trim());
    }
  } else if (robotsRes && robotsRes.ok) {
    robots.status = 0; // served, but not a text file (commonly an HTML soft-404)
  }

  const selectorHits = {};
  for (const sel of selectors || []) {
    try { selectorHits[sel] = !!document.querySelector(sel); } catch { selectorHits[sel] = false; }
  }

  const cssVarHits = {};
  try {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = document.body ? getComputedStyle(document.body) : rootStyle;
    for (const v of cssVars || []) {
      cssVarHits[v] = !!(rootStyle.getPropertyValue(v).trim() || bodyStyle.getPropertyValue(v).trim());
    }
  } catch { /* ignore */ }

  const generators = [...document.querySelectorAll('meta[name="generator" i]')].map((m) => m.content).filter(Boolean);

  return {
    url: location.href,
    https: location.protocol === 'https:',
    title: document.title || '',
    lang: document.documentElement.getAttribute('lang') || '',
    charset: document.characterSet,
    description: meta('description'),
    robotsMeta: meta('robots'),
    viewport: meta('viewport'),
    generators,
    og: { title: meta('og:title'), description: meta('og:description'), image: meta('og:image'), type: meta('og:type') },
    twitterCard: meta('twitter:card'),
    canonical: attr('link[rel="canonical" i]', 'href'),
    hreflangCount: document.querySelectorAll('link[rel="alternate" i][hreflang]').length,
    favicon: !!document.querySelector('link[rel~="icon" i]'),
    headings: {
      h1: h1s.slice(0, 5).map((h) => text(h).slice(0, 160)),
      h1Count: h1s.length,
      h2Count: document.querySelectorAll('h2').length,
      h3Count: document.querySelectorAll('h3').length,
    },
    images: { total: images.length, missingAlt: images.filter((i) => !i.hasAttribute('alt')).length },
    links: { internal, external, nofollow },
    wordCount: words.length + cjk,
    jsonLdTypes: [...jsonLdTypes].slice(0, 20),
    microdata: !!document.querySelector('[itemscope]'),
    scripts: [...document.scripts].map((s) => s.src).filter(Boolean).slice(0, 300),
    stylesheets: [...document.querySelectorAll('link[rel~="stylesheet" i]')].map((l) => l.href).filter(Boolean).slice(0, 100),
    resourceUrls: resources.map((r) => r.name).slice(0, 500),
    selectorHits,
    cssVarHits,
    headersFetched: !!headRes,
    headers,
    robots,
    sitemapStatus: sitemapRes ? sitemapRes.status : null,
    perf: {
      protocol: nav?.nextHopProtocol || null,
      ttfb: nav ? Math.max(0, nav.responseStart - nav.startTime) : null,
      fcp: paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null,
      lcp,
      cls: clsSupported ? cls : null,
      domContentLoaded: nav && nav.domContentLoadedEventEnd > 0 ? nav.domContentLoadedEventEnd - nav.startTime : null,
      load: nav && nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.startTime : null,
      requests: resources.length + (nav ? 1 : 0),
      transferBytes: resources.reduce((s, r) => s + (r.transferSize || 0), nav?.transferSize || 0),
      domNodes: document.getElementsByTagName('*').length,
      navType: nav?.type || null,
    },
  };
}

/**
 * Runs in the page's main world so it can see JavaScript globals set by the site
 * (framework versions, analytics objects). Reads values only; never calls page code.
 */
export function collectGlobals(paths) {
  const out = {};
  const read = (path) => {
    let cur = window;
    for (const key of path.split('.')) {
      if (cur == null) return undefined;
      const desc = Object.getOwnPropertyDescriptor(cur, key) ||
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(cur) || {}, key);
      if (desc && typeof desc.get === 'function' && cur !== window) return undefined; // avoid running page getters
      cur = cur[key];
    }
    return cur;
  };
  for (const path of paths) {
    try {
      const v = read(path);
      if (v === undefined || v === null || v === false) continue;
      out[path] = typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 40) : true;
    } catch { /* inaccessible property */ }
  }
  // Framework markers stored as expando properties on DOM nodes.
  try {
    // React 18+ tags its root container with "__reactContainer$…"; Vue 3 sets __vue_app__.
    const roots = [document.body, ...document.querySelectorAll('body *')].slice(0, 4000);
    for (const el of roots) {
      if (!el) continue;
      for (const k of Object.keys(el)) {
        if (k.startsWith('__reactContainer') || k.startsWith('__reactFiber') || k === '_reactRootContainer') out['@react'] = true;
      }
      if (el.__vue_app__) { out['@vue3'] = el.__vue_app__.version || true; }
      if (el.__vue__) out['@vue2'] = el.__vue__.$root?.constructor?.version || true;
    }
  } catch { /* ignore */ }
  return out;
}
