// Clients for the free public data sources. Every request is made directly from the
// extension to the source; nothing passes through a server of ours.
import { tldOf } from './domain.js';

const ext = globalThis.browser ?? globalThis.chrome;

const HOUR = 3600e3;
const DAY = 24 * HOUR;

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.code = code; // 'network' | 'rate_limited' | 'not_found' | 'unsupported' | 'auth' | 'quota' | 'http'
    this.status = status;
  }
}

async function cached(key, ttl, fn) {
  const storeKey = `cache:${key}`;
  try {
    const hit = (await ext.storage.local.get(storeKey))[storeKey];
    if (hit && Date.now() - hit.t < ttl) return hit.v;
  } catch { /* storage unavailable: fall through to a live request */ }
  const value = await fn();
  try {
    await ext.storage.local.set({ [storeKey]: { t: Date.now(), v: value } });
  } catch { /* caching is best-effort */ }
  return value;
}

async function request(url, init = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', ...init, signal: ctrl.signal });
  } catch (e) {
    throw new ApiError('network', e.name === 'AbortError' ? 'timeout' : e.message);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Removes expired cache entries so storage does not grow without bound. */
export async function pruneCache(maxAge = 7 * DAY) {
  try {
    const all = await ext.storage.local.get(null);
    const stale = Object.keys(all).filter((k) => k.startsWith('cache:') && Date.now() - (all[k]?.t ?? 0) > maxAge);
    if (stale.length) await ext.storage.local.remove(stale);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------- Tranco

/**
 * Tranco research ranking (https://tranco-list.eu). Returns
 * { rank, date, history: [{date, rank}] oldest→newest } or { rank: null } when unranked.
 */
export function trancoRank(domain) {
  return cached(`tranco:${domain}`, 12 * HOUR, async () => {
    const url = `https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`;
    let res = await request(url);
    if (res.status === 429) {
      await sleep(1200);
      res = await request(url);
    }
    if (res.status === 429) throw new ApiError('rate_limited', 'Tranco rate limit', 429);
    if (!res.ok) throw new ApiError('http', `Tranco HTTP ${res.status}`, res.status);
    const data = await res.json();
    const ranks = Array.isArray(data.ranks) ? data.ranks : [];
    if (!ranks.length) return { rank: null, history: [] };
    const history = ranks
      .filter((r) => Number.isFinite(r.rank) && r.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = history[history.length - 1];
    return { rank: latest.rank, date: latest.date, history };
  });
}

// ---------------------------------------------------------------- RDAP

// TLDs whose registries run RDAP but are missing from the IANA bootstrap file.
const RDAP_FALLBACK = {
  io: 'https://rdap.identitydigital.services/rdap/',
};

async function rdapBootstrap() {
  return cached('rdap-bootstrap', 7 * DAY, async () => {
    const res = await request('https://data.iana.org/rdap/dns.json');
    if (!res.ok) throw new ApiError('http', `IANA bootstrap HTTP ${res.status}`, res.status);
    const data = await res.json();
    const map = {};
    for (const [tlds, urls] of data.services) {
      const https = urls.find((u) => u.startsWith('https://')) || urls[0];
      for (const t of tlds) map[t.toLowerCase()] = https;
    }
    return map;
  });
}

export async function rdapServerFor(domain) {
  const tld = tldOf(domain);
  const map = await rdapBootstrap();
  return map[tld] || RDAP_FALLBACK[tld] || null;
}

/**
 * Domain registration record via RDAP. Returns
 * { registered, expires, updated, registrar, status[], nameservers[], dnssec, source }.
 */
export function rdapLookup(domain) {
  return cached(`rdap:${domain}`, DAY, async () => {
    const server = await rdapServerFor(domain);
    if (!server) throw new ApiError('unsupported', `No public RDAP service for .${tldOf(domain)}`);
    const base = server.endsWith('/') ? server : `${server}/`;
    const res = await request(`${base}domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/rdap+json, application/json' },
    });
    if (res.status === 404) throw new ApiError('not_found', 'Domain not found in registry', 404);
    if (res.status === 429) throw new ApiError('rate_limited', 'Registry rate limit', 429);
    if (!res.ok) throw new ApiError('http', `RDAP HTTP ${res.status}`, res.status);
    return parseRdap(await res.json(), new URL(base).hostname);
  });
}

export function parseRdap(data, source) {
  const events = {};
  for (const ev of data.events || []) {
    if (ev.eventAction && ev.eventDate && !events[ev.eventAction]) events[ev.eventAction] = ev.eventDate;
  }
  let registrar = null;
  const walk = (entities) => {
    for (const ent of entities || []) {
      if (!registrar && (ent.roles || []).includes('registrar')) {
        const fn = (ent.vcardArray?.[1] || []).find((f) => f[0] === 'fn');
        registrar = fn?.[3] || ent.publicIds?.[0]?.identifier || ent.handle || null;
      }
      walk(ent.entities);
    }
  };
  walk(data.entities);
  return {
    registered: events.registration || null,
    expires: events.expiration || null,
    updated: events['last changed'] || events['last update of RDAP database'] || null,
    registrar,
    status: data.status || [],
    nameservers: (data.nameservers || []).map((n) => (n.ldhName || '').toLowerCase()).filter(Boolean),
    dnssec: data.secureDNS?.delegationSigned ?? null,
    source,
  };
}

// ---------------------------------------------------------------- Cloudflare Radar (optional token)

export const RADAR_ORIGIN = 'https://api.cloudflare.com/*';

export async function hasRadarPermission() {
  try {
    return await ext.permissions.contains({ origins: [RADAR_ORIGIN] });
  } catch {
    return false;
  }
}

/** Returns { rank, bucket, categories[], locations[] } from Cloudflare Radar. */
export function radarRank(domain, token) {
  return cached(`radar:${domain}`, 12 * HOUR, async () => {
    const url = `https://api.cloudflare.com/client/v4/radar/ranking/domain/${encodeURIComponent(domain)}?includeTopLocations=true&limit=5`;
    const res = await request(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) throw new ApiError('auth', 'Cloudflare token rejected', res.status);
    if (res.status === 404) return { rank: null, bucket: null, categories: [], locations: [] };
    if (res.status === 429) throw new ApiError('rate_limited', 'Cloudflare rate limit', 429);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      const msg = data?.errors?.[0]?.message || `HTTP ${res.status}`;
      if (/not found|no data/i.test(msg)) return { rank: null, bucket: null, categories: [], locations: [] };
      throw new ApiError('http', `Cloudflare: ${msg}`, res.status);
    }
    const d = data.result?.details_0 || {};
    return {
      rank: Number.isFinite(d.rank) ? d.rank : null,
      bucket: d.bucket || null,
      categories: (d.categories || []).map((c) => c.name).filter(Boolean),
      locations: (d.top_locations || []).map((l) => ({ code: l.locationCode, name: l.locationName, rank: l.rank })),
    };
  });
}

// ---------------------------------------------------------------- Chrome UX Report (optional key)

const CRUX_METRICS = {
  largest_contentful_paint: 'lcp',
  interaction_to_next_paint: 'inp',
  cumulative_layout_shift: 'cls',
  first_contentful_paint: 'fcp',
  experimental_time_to_first_byte: 'ttfb',
};

/** Real-user p75 metrics for an origin over the last 28 days. Returns null when CrUX has no data. */
export function cruxOrigin(origin, key, formFactor) {
  return cached(`crux:${formFactor || 'ALL'}:${origin}`, 12 * HOUR, async () => {
    const body = { origin, metrics: Object.keys(CRUX_METRICS) };
    if (formFactor) body.formFactor = formFactor;
    const res = await request(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 404) return null;
    await throwGoogleError(res);
    const data = await res.json();
    const out = { period: data.record?.collectionPeriod || null, metrics: {} };
    for (const [name, short] of Object.entries(CRUX_METRICS)) {
      const m = data.record?.metrics?.[name];
      if (!m) continue;
      const p75 = Number(m.percentiles?.p75);
      out.metrics[short] = {
        p75,
        good: m.histogram?.[0]?.density ?? null,
      };
    }
    return out;
  });
}

async function throwGoogleError(res) {
  if (res.ok) return;
  let msg = `HTTP ${res.status}`;
  try {
    msg = (await res.json()).error?.message || msg;
  } catch { /* keep default */ }
  if (res.status === 429) throw new ApiError('quota', msg, 429);
  if (res.status === 400 && /api key/i.test(msg)) throw new ApiError('auth', msg, 400);
  if (res.status === 403) throw new ApiError('auth', msg, 403);
  throw new ApiError('http', msg, res.status);
}

// ---------------------------------------------------------------- PageSpeed Insights (key optional)

/** Runs a Lighthouse lab test through PageSpeed Insights. Takes 10–60 s. */
export async function pageSpeed(url, key, strategy = 'mobile') {
  const params = new URLSearchParams({ url, strategy, category: 'performance' });
  if (key) params.set('key', key);
  const res = await request(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {}, 90000);
  await throwGoogleError(res);
  const data = await res.json();
  const lh = data.lighthouseResult;
  const audit = (id) => lh?.audits?.[id];
  const pick = (id) => ({ value: audit(id)?.numericValue ?? null, display: audit(id)?.displayValue ?? null, score: audit(id)?.score ?? null });
  return {
    score: lh?.categories?.performance?.score != null ? Math.round(lh.categories.performance.score * 100) : null,
    strategy,
    fetchedAt: lh?.fetchTime || null,
    lab: {
      fcp: pick('first-contentful-paint'),
      lcp: pick('largest-contentful-paint'),
      tbt: pick('total-blocking-time'),
      cls: pick('cumulative-layout-shift'),
      si: pick('speed-index'),
    },
    reportUrl: `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}`,
  };
}
