# Privacy Policy — Website Insights Tool

_Last updated: October 1, 2026_

Website Insights Tool ("the extension") shows public information about the website you are viewing: popularity rank, domain registration data, detected technologies, SEO checks and speed metrics.

## Summary

- **No servers.** The developer runs no servers. The extension has no backend, no accounts and no analytics.
- **Nothing is collected by the developer.** The developer never receives your browsing history, personal data, page contents or API keys.
- **Only on click.** The extension does nothing until you click its toolbar icon, and it only looks at the tab you clicked it on.

## What is sent, and to whom

When you open the popup, the extension requests public data **directly from your browser** to these services:

| When | What is sent | Sent to |
|---|---|---|
| You open the popup | The site's registrable domain name (e.g. `example.com`) | [Tranco](https://tranco-list.eu/) (popularity rank) |
| You open the popup | The site's registrable domain name | The domain registry's public RDAP server, located via [IANA's bootstrap file](https://data.iana.org/rdap/dns.json) (domain age) |
| You open the popup | Requests for the page's response headers, `/robots.txt` and `/sitemap.xml`, **without cookies** | The website you are viewing |
| You open the popup, **only if you added a Cloudflare token** | The site's registrable domain name | Cloudflare Radar API (`api.cloudflare.com`) |
| You open the popup, **only if you added a Google API key** | The site's origin (e.g. `https://www.example.com`) | Google Chrome UX Report API |
| You click **Run test**, and only then | The page address **without query string or fragment** | Google PageSpeed Insights API |

These services receive the request together with your IP address, as any website does, and handle it under their own privacy policies. The extension sends no identifiers, cookies or other data with these requests.

## What is stored

- **API keys** you choose to enter (Google API key, Cloudflare token) are stored in the browser's local extension storage on your device. They are sent only to the service they belong to.
- **Cached results** (rank, domain data, speed data) are stored locally for up to 7 days to avoid repeated requests. You can clear them at any time on the settings page, or by removing the extension.

Nothing is synced to other devices or shared with anyone.

## Page inspection

To detect technologies and run SEO and speed checks, the extension reads the current page (its HTML, headers, script addresses and performance timings) inside your browser. These results are shown in the popup and are never transmitted anywhere.

## Permissions

- `activeTab` and `scripting`: read the page you clicked the icon on, only at that moment.
- `storage`: keep your optional API keys and the local cache.
- Optional `https://api.cloudflare.com/*`: requested only if you add a Cloudflare token.

## Children

The extension is not directed at children and collects no personal information from anyone.

## Changes

Changes to this policy will be published in this file in the project's public repository, with a new "Last updated" date.

## Contact

Questions or concerns: open an issue at <https://github.com/jliushi/website-insights-tool/issues>.

---

# 隐私政策 —— 网站洞察工具

_最后更新：2026 年 10 月 1 日_

网站洞察工具（“本扩展”）用于显示你正在浏览的网站的公开信息：流行度排名、域名注册信息、所用技术、SEO 检查和速度指标。

## 概要

- **没有服务器。** 开发者不运行任何服务器；本扩展没有后端、没有账号、没有统计分析。
- **开发者不收集任何数据。** 开发者不会收到你的浏览记录、个人数据、页面内容或 API 密钥。
- **仅在点击时工作。** 在你点击工具栏图标之前，本扩展不做任何事，且只查看你点击时所在的标签页。

## 发送了什么、发送给谁

打开弹窗时，本扩展会**直接从你的浏览器**向以下服务请求公开数据：

| 时机 | 发送内容 | 接收方 |
|---|---|---|
| 打开弹窗时 | 网站的可注册域名（如 `example.com`） | Tranco（流行度排名） |
| 打开弹窗时 | 网站的可注册域名 | 该域名注册局的公开 RDAP 服务器（通过 IANA 引导文件查找；用于域名年龄） |
| 打开弹窗时 | 请求页面响应头、`/robots.txt` 和 `/sitemap.xml`（**不带 Cookie**） | 你正在浏览的网站 |
| 打开弹窗时（**仅当你添加了 Cloudflare 令牌**） | 网站的可注册域名 | Cloudflare Radar API |
| 打开弹窗时（**仅当你添加了 Google API 密钥**） | 网站源地址（如 `https://www.example.com`） | Google Chrome UX Report API |
| 仅当你点击“开始测试”时 | 页面地址（**不含查询参数和片段**） | Google PageSpeed Insights API |

这些服务会像任何网站一样收到请求及你的 IP 地址，并依据其自身隐私政策处理。本扩展不会随请求发送任何标识符、Cookie 或其他数据。

## 存储了什么

- 你自愿填写的 **API 密钥**（Google API 密钥、Cloudflare 令牌）保存在你设备上浏览器的本地扩展存储中，只会发送给其所属的服务。
- **缓存结果**（排名、域名数据、速度数据）在本地最多保存 7 天，以避免重复请求。你可以随时在设置页清除，或卸载扩展。

以上数据不会同步到其他设备，也不会与任何人共享。

## 页面检查

为检测技术并进行 SEO 与速度检查，本扩展会在你的浏览器内读取当前页面（HTML、响应头、脚本地址和性能计时）。结果仅显示在弹窗中，绝不会被传输到任何地方。

## 权限

- `activeTab` 和 `scripting`：仅在你点击图标时读取该页面。
- `storage`：保存你可选的 API 密钥和本地缓存。
- 可选 `https://api.cloudflare.com/*`：仅在你添加 Cloudflare 令牌时请求。

## 联系方式

如有疑问，请在 <https://github.com/jliushi/website-insights-tool/issues> 提交 issue。
