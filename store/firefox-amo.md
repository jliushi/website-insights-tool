# Firefox Add-ons (AMO) — submission kit

Package: `dist/website-insights-tool-1.0.0-firefox.zip` (passes `web-ext lint` with 0 errors / 0 warnings).
No source-code upload is needed: nothing is minified, bundled or transpiled.

## Option A — one command (needs AMO API credentials)
1. Sign in at https://addons.mozilla.org/developers/addon/api/key/ and click **Generate new credentials** (AMO may email you a confirmation link first).
2. In `F:\vibe\website-insights-tool` run:
   ```sh
   WEB_EXT_API_KEY="user:…" WEB_EXT_API_SECRET="…" npm run submit:amo
   ```
   This creates the listed add-on with summary, description (EN + 中文), category and license from `store/amo-metadata.json`, then uploads the package for review.
3. Afterwards, on the add-on's **Edit Product Page**, add the screenshots, homepage, support URL and privacy policy below (the API doesn't accept images).

## Option B — web upload (about 10 minutes)
1. https://addons.mozilla.org/developers/addon/submit/distribution → **On this site** → Continue.
2. Upload `dist/website-insights-tool-1.0.0-firefox.zip`. Platforms: Firefox (desktop) and Firefox for Android.
3. "Do you need to submit source code?" → **No**.
4. Describe add-on:
   - **Name:** Website Insights Tool: Rank, Age, Tech & SEO
   - **Add-on URL:** website-insights-tool
   - **Summary:** from `store/en/listing.md` → Summary
   - **Description:** from `store/en/listing.md` → Description
   - **Category:** Web Development
   - **Support website:** https://github.com/jliushi/website-insights-tool/issues
   - **License:** MIT
   - **Privacy policy:** tick "This add-on has a privacy policy" and paste `PRIVACY.md` (English part)
   - **Notes to reviewer:** the `approval_notes` text in `store/amo-metadata.json`
5. Submit. Then on **Edit Product Page**: upload `store/screenshots/01…04` (and 05–06), and add the zh-CN translation of summary and description from `store/zh_CN/listing.md` (locale switcher at the top of the edit page).

## Data collection declaration
The manifest declares `data_collection_permissions.required = ["browsingActivity"]`: the current site's domain is sent to public lookup services when the popup is opened. Firefox shows this at install time.
