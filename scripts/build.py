# Builds store packages from src/.
#   python scripts/build.py          -> dist/chrome, dist/firefox, dist/*.zip
#   python scripts/build.py --test   -> also dist/*-test (adds <all_urls> so the e2e tests can
#                                       inspect tabs without a toolbar click; never shipped)
import json, pathlib, shutil, sys, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
VERSION = "1.0.0"
HOMEPAGE = "https://github.com/jliushi/website-insights-tool"
GECKO_ID = "website-insights-tool@jliushi"

BASE = {
    "manifest_version": 3,
    "name": "__MSG_extName__",
    "description": "__MSG_extDescription__",
    "default_locale": "en",
    "version": VERSION,
    "homepage_url": HOMEPAGE,
    "icons": {s: f"icons/icon-{s}.png" for s in ("16", "32", "48", "96", "128")},
    "action": {
        "default_popup": "popup/popup.html",
        "default_title": "__MSG_extActionTitle__",
        "default_icon": {s: f"icons/icon-{s}.png" for s in ("16", "32", "48")},
    },
    "options_ui": {"page": "options/options.html", "open_in_tab": True},
    "permissions": ["activeTab", "scripting", "storage"],
    "optional_host_permissions": ["https://api.cloudflare.com/*"],
}


def manifest(target):
    m = json.loads(json.dumps(BASE))
    if target.startswith("chrome"):
        m["minimum_chrome_version"] = "116"
    if target.startswith("firefox"):
        m["browser_specific_settings"] = {
            "gecko": {
                "id": GECKO_ID,
                "strict_min_version": "140.0",
                # The current site's domain is sent to public data sources (Tranco, RDAP, …)
                # when the user opens the popup, which Mozilla classifies as browsing activity.
                "data_collection_permissions": {"required": ["browsingActivity"]},
            },
            "gecko_android": {"strict_min_version": "142.0"},
        }
    if target.endswith("-test"):
        m["host_permissions"] = ["<all_urls>"]
    if target == "firefox-test":
        m["background"] = {"scripts": ["test-hook.js"]}
    return m


# Test-only: WebDriver BiDi can't navigate to moz-extension:// URLs, so the Firefox test build
# opens the popup page itself for any tab whose URL ends with "#wit-test".
TEST_HOOK = """browser.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && (tab.url || '').endsWith('#wit-test')) {
    browser.tabs.create({ url: `popup/popup.html?tabId=${tabId}&frame=popup` });
  }
});
"""


def build(target):
    out = DIST / target
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(SRC, out, ignore=shutil.ignore_patterns("*.map", ".DS_Store", "Thumbs.db"))
    if target == "firefox-test":
        (out / "test-hook.js").write_text(TEST_HOOK, encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps(manifest(target), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out


def zip_dir(folder, zip_path):
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(folder.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(folder).as_posix())


def main():
    DIST.mkdir(exist_ok=True)
    for target in ("chrome", "firefox"):
        folder = build(target)
        zip_path = DIST / f"website-insights-tool-{VERSION}-{target}.zip"
        zip_dir(folder, zip_path)
        print(f"{target}: {zip_path.name} ({zip_path.stat().st_size // 1024} KB)")
    if "--test" in sys.argv:
        for target in ("chrome-test", "firefox-test"):
            build(target)
            print(f"{target}: dist/{target}")


if __name__ == "__main__":
    main()
