# Website Insights Tool

A browser extension (Chrome & Firefox, Manifest V3) that shows, in one click, any website's:

- **Popularity rank** — Tranco top-1M research ranking with a 30-day trend; optional Cloudflare Radar rank, categories and top countries.
- **Domain age** — registration, expiry, registrar, DNSSEC and name servers from public RDAP records.
- **Tech stack** — ~120 signatures: frameworks, CMS, e-commerce, analytics, ads, CDN, hosting, web servers.
- **SEO checks** — title, meta description, headings, alt text, canonical, robots.txt, sitemap, structured data, Open Graph, security headers, with a score.
- **Speed** — metrics measured in your own tab (TTFB, FCP, LCP, CLS); optional real-user Core Web Vitals (Chrome UX Report) and PageSpeed Insights lab tests.

Free data sources only. No servers, no accounts, no analytics. Minimal permissions: `activeTab`, `scripting`, `storage` (+ optional `api.cloudflare.com`). See [PRIVACY.md](PRIVACY.md).

UI languages: English, 简体中文.

## Development

No build step is needed to run the source; `src/` is the extension.

```sh
python scripts/messages.py      # regenerate _locales from scripts/messages.py
node scripts/gen-psl.mjs        # refresh the Public Suffix List snapshot
python scripts/build.py --test  # dist/chrome, dist/firefox, store zips, dist/chrome-test
npm install
npx web-ext lint --source-dir dist/firefox
node test/e2e.mjs [--shots] [--lang=zh-CN] [--only=github]
```

### Load locally

- **Chrome:** `chrome://extensions` → enable Developer mode → *Load unpacked* → select `dist/chrome`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* → select `dist/firefox/manifest.json`.

### Publish

- **Firefox (AMO):** create API credentials at <https://addons.mozilla.org/developers/addon/api/key/>, then
  `WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… npm run submit:amo`
- **Chrome Web Store:** upload `dist/website-insights-tool-<version>-chrome.zip` in the developer dashboard; listing copy is in `store/`.

## Data sources

| Data | Source | Key |
|---|---|---|
| Rank | [Tranco](https://tranco-list.eu/) | none |
| Rank, categories | [Cloudflare Radar](https://radar.cloudflare.com/) | free token (optional) |
| Domain age | RDAP via [IANA bootstrap](https://data.iana.org/rdap/) | none |
| Real-user speed | [Chrome UX Report API](https://developer.chrome.com/docs/crux/api) | free Google key (optional) |
| Lab speed | [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) | free Google key (recommended) |
| Public suffixes | [Public Suffix List](https://publicsuffix.org/) (bundled, MPL-2.0) | — |

## License

MIT
