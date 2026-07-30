#!/usr/bin/env python3
"""Generate fail-closed static SEO/GEO fallbacks.

Production Pages Functions render the public catalogue at request time from
games.json plus the authoritative D1 hidden set. A build-time process cannot
read that live curation state safely, so these static assets intentionally
contain no game entries. If Functions are unavailable, hidden games must not
leak from a stale generated fallback.

The live equivalents share functions/_lib/seoSurface.js and are injected by
functions/index.js plus the /llms.txt, /sitemap.xml, and /rss.xml routes.

Idempotent: re-running replaces the marked regions in place. Wire it into
sync_games.sh so every catalogue change refreshes the SEO surface.

Usage:  python3 scripts/gen_seo.py            # from Gallery/
        python3 scripts/gen_seo.py --check    # exit 1 if outputs would change
"""
import json
import os
import re
import sys

SITE = "https://game-factory.tech"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # Gallery/
GAMES_JSON = os.path.join(HERE, "games.json")
INDEX_HTML = os.path.join(HERE, "index.html")
LLMS_TXT = os.path.join(HERE, "llms.txt")

# How many games to render as static cards in #grid. All published games go into
# llms.txt (full text index) and the JSON-LD ItemList (lean, all games); the
# static visible grid is capped so index.html stays lean - newest N is what a
# first-time crawler most wants to see as real HTML text.
STATIC_CARD_LIMIT = 60

# Cap the homepage JSON-LD ItemList to the newest N. Google only surfaces the
# first handful for carousels, and llms.txt + sitemap + per-page VideoGame schema
# already give AI and search the full 169-game tail - so embedding all of them
# here would just be dead page-weight.
JSONLD_LIMIT = 40


def load_games():
    # Validate that the manifest remains readable, but never project it into a
    # static crawl surface: live D1 is the only authoritative hidden-game set.
    with open(GAMES_JSON, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("games.json must be an array")
    return []


def esc(s):
    return (
        str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace('"', "&quot;").replace("'", "&#39;")
    )


def clip(s, n=180):
    s = (s or "").strip().replace("\n", " ")
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


# ---------------------------------------------------------------- llms.txt ----
def build_llms(games):
    lines = []
    lines.append("# Tim's Game Lab (game-factory.tech)")
    lines.append("")
    lines.append(
        "> A curated collection of small, original browser games and official "
        "platform releases. New experiments arrive regularly and player "
        "feedback shapes what gets improved."
    )
    lines.append("")
    lines.append("## About")
    lines.append("- Free to play in any browser (desktop or mobile). No download, no account.")
    lines.append("- Some games run here; official releases open on their verified distribution platform.")
    lines.append("- Interface and game copy are available in English and Russian (plus Spanish, Portuguese, Turkish, Arabic) via `?lang=`.")
    lines.append("- New games are added most days; players vote to shape what gets built next.")
    lines.append(f"- Browse everything: {SITE}/  -  Russian: {SITE}/?lang=ru")
    lines.append("")
    lines.append("## Curated games")
    if not games:
        lines.append(f"- Live curated index: {SITE}/")
    for g in games:
        url = f"{SITE}/p/{g['slug']}"
        title = g.get("title") or g["slug"]
        hook = clip(g.get("hook"), 200)
        genre = (g.get("genre") or "").strip()
        gtag = f" [{genre}]" if genre else ""
        lines.append(f"- [{title}]({url}){gtag}: {hook}")
    lines.append("")
    lines.append("## Also")
    lines.append(f"- New-games feed (RSS): {SITE}/rss.xml")
    lines.append(f"- Sitemap: {SITE}/sitemap.xml")
    lines.append(f"- Make your own game from one sentence: {SITE}/create")
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------- JSON-LD ------
def build_jsonld(games):
    # Lean per-item VideoGame nodes: name/url/image/description/genre. The full
    # VideoGame schema (offers, OS, playMode, publisher) lives on each /p/<slug>
    # page, so repeating it 169x here would only bloat the homepage.
    items = []
    for i, g in enumerate(games[:JSONLD_LIMIT], 1):
        item = {
            "@type": "VideoGame",
            "name": g.get("title") or g["slug"],
            "url": f"{SITE}/p/{g['slug']}",
            "image": f"{SITE}/thumbs/{g['slug']}.png",
            "description": clip(g.get("hook"), 120),
        }
        genre = (g.get("genre") or "").strip()
        if genre:
            item["genre"] = genre
        items.append({"@type": "ListItem", "position": i, "item": item})
    doc = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Tim's Game Lab - free browser games",
        "url": SITE + "/",
        "description": (
            "A curated collection of small, original browser games and official "
            "platform releases. The live edge-rendered catalogue supplies the "
            "current public ItemList."
        ),
        "inLanguage": ["en", "ru"],
        "isPartOf": {"@type": "WebSite", "name": "Tim's Game Lab", "url": SITE + "/"},
        "mainEntity": {
            "@type": "ItemList",
            "name": "Browser games at Tim's Game Lab (newest)",
            "numberOfItems": len(items),
            "itemListElement": items,
        },
    }
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


# --------------------------------------------------------- static grid cards --
def build_static_cards(games):
    cards = []
    for g in games[:STATIC_CARD_LIMIT]:
        slug = g["slug"]
        title = esc(g.get("title") or slug)
        hook = esc(clip(g.get("hook"), 140))
        genre = esc((g.get("genre") or "").strip())
        cards.append(
            f'<article class="seo-card"><a href="/p/{esc(slug)}">'
            f'<img src="/thumbs/{esc(slug)}.png" alt="{title}" loading="lazy" width="320" height="180">'
            f'<h3>{title}</h3><p>{hook}</p>'
            + (f'<span class="seo-genre">{genre}</span>' if genre else "")
            + "</a></article>"
        )
    # Self-contained styling so the fallback matches the dark theme. app.js wipes
    # #grid on load, so this only renders for no-JS crawlers or the brief window
    # before games.json arrives (content-first, better than a blank grid).
    style = (
        "<style>.seo-intro{grid-column:1/-1;color:#8a8aa0;font-size:14px;margin:0 0 4px}"
        ".seo-card a{display:block;color:#e7e7ee;text-decoration:none;background:#13131f;"
        "border:1px solid #1f1f2c;border-radius:10px;overflow:hidden;padding-bottom:10px}"
        ".seo-card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}"
        ".seo-card h3{font-size:15px;margin:8px 10px 4px}"
        ".seo-card p{font-size:13px;color:#8a8aa0;margin:0 10px;line-height:1.35}"
        ".seo-card .seo-genre{display:inline-block;margin:6px 10px 0;font-size:11px;"
        "color:#6a6a82;text-transform:uppercase;letter-spacing:.05em}</style>"
    )
    intro = (
        '<p class="seo-intro">Free browser games and official platform releases. '
        'The current curated list is loaded at the edge; '
        '<a href="/llms.txt">machine-readable index</a>.</p>'
    )
    return style + "\n" + intro + "\n" + "\n".join(cards)


# ------------------------------------------------------------- HTML injection -
def inject(html, start, end, payload):
    block = f"{start}\n{payload}\n{end}"
    pat = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    if pat.search(html):
        return pat.sub(lambda _: block, html)
    return None  # caller must place markers the first time


def main():
    check = "--check" in sys.argv
    games = load_games()

    llms = build_llms(games)
    jsonld = build_jsonld(games)
    cards = build_static_cards(games)

    with open(INDEX_HTML, encoding="utf-8") as f:
        html = f.read()
    orig = html

    # 1) JSON-LD collection block, before </head>
    S1, E1 = "<!-- SEO-COLLECTION:START (generated by scripts/gen_seo.py) -->", "<!-- SEO-COLLECTION:END -->"
    ld_block = f'<script type="application/ld+json">{jsonld}</script>'
    injected = inject(html, S1, E1, ld_block)
    if injected is None:
        html = html.replace("</head>", f"{S1}\n{ld_block}\n{E1}\n</head>", 1)
    else:
        html = injected

    # 2) Static crawlable cards inside <main id="grid">
    S2, E2 = "<!-- SEO-GRID:START (generated by scripts/gen_seo.py; app.js clears #grid on load) -->", "<!-- SEO-GRID:END -->"
    grid_block = inject(html, S2, E2, cards)
    if grid_block is None:
        html = re.sub(
            r'(<main id="grid" class="grid">)(</main>)',
            lambda m: f"{m.group(1)}\n{S2}\n{cards}\n{E2}\n{m.group(2)}",
            html, count=1,
        )
    else:
        html = grid_block

    llms_changed = (not os.path.exists(LLMS_TXT)) or (open(LLMS_TXT, encoding="utf-8").read() != llms)
    changed = (html != orig) or llms_changed

    if check:
        print("CHANGED" if changed else "up-to-date")
        sys.exit(1 if changed else 0)

    with open(INDEX_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    with open(LLMS_TXT, "w", encoding="utf-8") as f:
        f.write(llms)

    print("gen_seo: fail-closed static fallback (live catalogue is edge-rendered)")
    print(f"  llms.txt         -> {len(llms)} bytes")
    print(f"  JSON-LD ItemList -> {min(JSONLD_LIMIT, len(games))} newest VideoGame items in index.html <head>")
    print(f"  static grid      -> {min(STATIC_CARD_LIMIT, len(games))} crawlable cards in #grid")


if __name__ == "__main__":
    main()
