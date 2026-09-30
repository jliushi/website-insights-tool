const ext = globalThis.browser ?? globalThis.chrome;

/** Localized message; falls back to the key so a missing string is visible, not blank. */
export function t(key, subs) {
  const list = subs == null ? undefined : (Array.isArray(subs) ? subs : [subs]).map(String);
  return ext.i18n.getMessage(key, list) || key;
}

export const uiLocale = (() => {
  try {
    return ext.i18n.getUILanguage() || 'en';
  } catch {
    return 'en';
  }
})();

/** Fills [data-i18n], [data-i18n-title] and [data-i18n-placeholder] elements. */
export function localizeDocument(root = document) {
  document.documentElement.lang = uiLocale;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
}

const nf = new Intl.NumberFormat(uiLocale);
export const fmtNumber = (n) => (n == null ? '—' : nf.format(n));

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(uiLocale, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

export function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)} s` : `${Math.round(ms)} ms`;
}

export function fmtBytes(b) {
  if (!b) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 999.5 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** "12 yr 3 mo" style age between an ISO date and now. */
export function fmtAge(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months--;
  if (months < 1) {
    const days = Math.max(0, Math.floor((now - d) / 864e5));
    return t('age_days', days);
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return t('age_months', m);
  return m ? t('age_years_months', [y, m]) : t('age_years', y);
}

export function daysUntil(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  return Math.floor((d - new Date()) / 864e5);
}
