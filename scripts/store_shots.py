# Composes 1280x800 store screenshots from real captures in test/out
# (run `node test/e2e.mjs --shots` first). Output: store/screenshots/*.png
import pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "out"
OUT = ROOT / "store" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
FONTS = pathlib.Path("C:/Windows/Fonts")

W, H = 1280, 800

SLIDES = [
    ("01-overview", "github.com", "overview", "en-US",
     "Know any website in one click", "Global popularity rank, 30-day trend and domain age\nfrom Tranco and official registry records."),
    ("02-tech", "nextjs.org", "tech", "en-US",
     "See what it's built with", "About 120 technologies: frameworks, CMS, analytics,\nCDN, hosting and web servers, with versions."),
    ("03-seo", "bbc.co.uk", "seo", "en-US",
     "Instant SEO audit", "Title, description, headings, canonical, robots.txt,\nstructured data, social tags and security headers."),
    ("04-speed", "nextjs.org", "speed", "en-US",
     "Speed metrics that matter", "TTFB, FCP, LCP and CLS from your own tab, plus optional\nreal-user Core Web Vitals and PageSpeed lab tests."),
    ("05-zh-overview", "github.com", "overview", "zh-CN",
     "一键了解任意网站", "全球流行度排名、30 天走势和域名年龄，\n数据来自 Tranco 与注册局官方记录。"),
    ("06-zh-tech", "nextjs.org", "tech", "zh-CN",
     "看清网站用了什么技术", "约 120 种技术：框架、CMS、统计分析、\nCDN、托管与 Web 服务器，并显示版本。"),
]


def font(lang, bold, size):
    if lang.startswith("zh"):
        name = "msyhbd.ttc" if bold else "msyh.ttc"
    else:
        name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(FONTS / name), size)


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im, (0, 0), mask)
    return out


def compose(name, site, tab, lang, title, subtitle):
    page = Image.open(SHOTS / f"{site}-page.png").convert("RGB").resize((W, H))
    bg = page.filter(ImageFilter.GaussianBlur(6)).convert("RGBA")
    shade = Image.new("RGBA", (W, H), (12, 18, 40, 0))
    grad = ImageDraw.Draw(shade)
    for x in range(W):  # darker on the left where the caption sits
        grad.line([(x, 0), (x, H)], fill=(12, 18, 40, int(238 - 70 * x / W)))
    bg = Image.alpha_composite(bg, shade)

    popup = Image.open(SHOTS / f"{site}-{tab}-{lang}.png").convert("RGBA")
    ph = 700
    pw = round(popup.width * ph / popup.height)
    popup = rounded(popup.resize((pw, ph), Image.LANCZOS), 14)
    px, py = W - pw - 80, (H - ph) // 2

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((px - 4, py + 10, px + pw + 4, py + ph + 18), 18, fill=(0, 0, 0, 150))
    bg = Image.alpha_composite(bg, shadow.filter(ImageFilter.GaussianBlur(18)))
    bg.alpha_composite(popup, (px, py))

    d = ImageDraw.Draw(bg)
    icon = Image.open(ROOT / "src" / "icons" / "icon-96.png").convert("RGBA").resize((64, 64), Image.LANCZOS)
    bg.alpha_composite(icon, (80, 200))
    title_font = font(lang, True, 48)
    lines, cur = [], ""
    for word in (title.split(" ") if " " in title else [title]):
        test = f"{cur} {word}".strip()
        if cur and d.textlength(test, font=title_font) > px - 130:
            lines.append(cur)
            cur = word
        else:
            cur = test
    lines.append(cur)
    y = 290
    for line in lines:
        d.text((80, y), line, font=title_font, fill=(255, 255, 255))
        y += 64
    d.multiline_text((80, y + 18), subtitle, font=font(lang, False, 24), fill=(214, 222, 245), spacing=12)
    tag = "网站洞察工具" if lang.startswith("zh") else "Website Insights Tool"
    d.text((160, 216), tag, font=font(lang, True, 26), fill=(255, 224, 102))
    bg.convert("RGB").save(OUT / f"{name}.png", optimize=True)
    print(f"{name}.png")


for slide in SLIDES:
    compose(*slide)
