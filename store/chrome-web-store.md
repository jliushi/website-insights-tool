# Chrome Web Store — submission kit (copy/paste)

Upload: `dist/website-insights-tool-1.0.0-chrome.zip`

## Store listing tab
- **Title** (from package): Website Insights Tool: Rank, Age, Tech & SEO
- **Summary** (from package): See any site's popularity rank, domain age, tech stack, SEO checks and speed in one click. Free data, no account, no tracking.
- **Description:** paste from `store/en/listing.md` → "Description". Add the Chinese one under *Localize* → 中文（中国）from `store/zh_CN/listing.md`.
- **Category:** Developer Tools
- **Language:** English (plus Chinese (China) localization, since the package includes `_locales/zh_CN`)
- **Store icon:** `store/icon-128.png`
- **Screenshots (1280×800):** `store/screenshots/01-overview.png` … `04-speed.png` (English). For the zh_CN localization use `05-zh-overview.png`, `06-zh-tech.png`.
- **Small promo tile (440×280):** `store/promo-small-440x280.png`
- **Official URL:** none · **Homepage URL:** https://github.com/jliushi/website-insights-tool
- **Support URL:** https://github.com/jliushi/website-insights-tool/issues

## Privacy practices tab

**Single purpose description**
> Shows public information about the website in the current tab (popularity rank, domain registration age, detected technologies, SEO checks and page-speed metrics) when the user clicks the toolbar icon.

**Permission justifications**
- `activeTab`: Lets the extension read the tab the user clicked the icon on, only at that moment, to analyze that page. No access to other tabs or background browsing.
- `scripting`: Injects a read-only script into the clicked tab to collect SEO tags, technology signatures and performance timings for display in the popup.
- `storage`: Stores the user's optional API keys and caches public lookup results locally (up to 7 days) to avoid repeated requests.
- Optional host permission `https://api.cloudflare.com/*`: Requested only when the user adds their own Cloudflare token, to query the Cloudflare Radar ranking API (which does not allow browser cross-origin requests without it).

**Remote code:** No, I am not using remote code. (All JavaScript is in the package; only JSON data is fetched.)

**Data usage: what user data do you plan to collect?**
Tick **Web history**. Reason: when the user opens the popup, the current site's domain is sent to public data sources (Tranco, RDAP registries; Google/Cloudflare only if the user adds keys) to look it up. Nothing else is ticked: no personally identifiable info, health, financial, authentication, personal communications, location, user activity or website content is transmitted. Page content is analyzed locally and never sent.

**Certify all three:**
- I do not sell or transfer user data to third parties, outside of the approved use cases. ✔ (Sending the domain to the lookup service the user asked for is the extension's single purpose.)
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose. ✔
- I do not use or transfer user data to determine creditworthiness or for lending purposes. ✔

**Privacy policy URL:** https://github.com/jliushi/website-insights-tool/blob/main/PRIVACY.md

## Distribution tab
- Visibility: Public · Regions: All regions · Pricing: Free

## Test instructions (optional field)
Open any website (e.g. https://github.com) and click the toolbar icon. No login or key is needed. Optional keys can be added on the Settings page; without them the related sections show a hint.
