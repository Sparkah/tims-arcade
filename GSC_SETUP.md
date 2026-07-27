# Search Console + AI-search setup — game-factory.tech

Everything that needs *your* login (Google/Yandex/Bing accounts). All the
on-site SEO/GEO work is already shipped in the repo (see the "What's already
done" list at the bottom); this file is only the steps a human has to click.

Stack context: `game-factory.tech` runs on **Cloudflare** (DNS + Pages). That
makes the DNS-TXT verification the cleanest path — one record, covers the whole
domain, no redeploy.

---

## 1. Google Search Console (primary)

1. Go to https://search.google.com/search-console → **Add property**.
2. Choose the **Domain** property type (left box) and enter `game-factory.tech`.
   - Domain property covers `http`+`https`, `www`+non-`www`, and every path in
     one shot. Prefer it over URL-prefix.
3. Google shows a **TXT record** like `google-site-verification=abcd1234...`.
   Add it in **Cloudflare → DNS → Records**:
   - Type `TXT`, Name `@` (or `game-factory.tech`), Content = the exact string
     Google gave you, TTL Auto. Save.
4. Back in Search Console click **Verify** (DNS can take a few minutes to
   propagate; if it fails first try, wait 5-10 min and retry).
5. Once verified: **Sitemaps** (left nav) → submit `sitemap.xml`
   (enter `sitemap.xml`, Google resolves it to
   `https://game-factory.tech/sitemap.xml`). It already lists all 169 games with
   hreflang alternates.
6. Optional but worth it on day one: **URL Inspection** → paste
   `https://game-factory.tech/` → **Request indexing**. Do the same for 2-3 of
   your best game pages (e.g. `/p/loot_goblin`).

**Alternative if you'd rather not touch DNS** (URL-prefix property, needs a
redeploy): Google gives a `<meta name="google-site-verification" content="…">`
tag — paste it into `index.html`'s `<head>` and push. The DNS method is better
(no code, survives redeploys), so use that unless DNS is a hassle.

---

## 2. Yandex Webmaster (do this too — RU is half the point)

The RU localization work below is aimed at Yandex as much as Google.

1. https://webmaster.yandex.com → **Add site** → `https://game-factory.tech`.
2. Verify by **DNS TXT** (same Cloudflare DNS panel; Yandex gives a
   `yandex-verification: …` string) or the meta-tag method.
3. Submit the sitemap (`sitemap.xml`), and under **Indexing → Reindex pages**
   nudge the homepage + a few `/p/<slug>?lang=ru` URLs so the Russian versions
   get picked up.
4. Yandex Webmaster also has a **Turbo/again re-crawl** and a "site quality"
   panel worth checking after a couple of weeks.

---

## 3. Bing Webmaster (2 minutes, feeds ChatGPT/Copilot search)

Bing's index backs Copilot and some ChatGPT search results, so it's a real GEO
channel, not just Bing traffic.

1. https://www.bing.com/webmasters → **Add site**. Fastest path: **Import from
   Google Search Console** (one click once step 1 is done). Otherwise DNS TXT.
2. Submit `sitemap.xml`.

---

## 4. After it's live — what to watch

- **Search Console → Pages/Coverage**: confirm the `/p/<slug>` pages get
  *Indexed* (not "Crawled - currently not indexed"). The homepage now ships a
  static crawlable game list + JSON-LD, so it should index as a real collection.
- **Performance → Queries**: watch for "browser games", "free html5 games",
  "играть браузерные игры" etc. This tells you what's landing.
- **AI answer visibility** (the "AI recommends my site" goal): there's no console
  for it. Spot-check by asking ChatGPT / Perplexity / Gemini things like *"free
  browser games you can play instantly without signup"* every few weeks and see
  whether game-factory.tech shows up. The levers we shipped for this: `/llms.txt`,
  the static homepage game list, `CollectionPage`/`ItemList` structured data, and
  the explicit AI-crawler `Allow` rules in `robots.txt`.

---

## What's already done in the repo (shipped on next deploy)

- `llms.txt` — full 169-game AI index at `/llms.txt` (the GEO artifact assistants read).
- Homepage: static crawlable game cards inside `#grid` (no-JS crawlers now see the
  games as real HTML) + `CollectionPage`/`ItemList` JSON-LD + hreflang (en/ru/es/pt/tr/ar).
- `robots.txt` — explicitly welcomes GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot,
  Google-Extended, Applebot-Extended, CCBot, etc.; points at the sitemap.
- `sitemap.xml` — every game annotated with en/ru hreflang alternates.
- `/p/<slug>` share pages — `?lang=ru` now serves Russian and self-canonicalizes
  (the RU page will index instead of being folded into the EN URL).
- Homepage (`functions/index.js`) — `/?lang=ru` etc. self-canonicalizes too, so the
  localized homepage isn't dropped as a duplicate of `/`. English is untouched.
- All of the above regenerate automatically from `games.json` via
  `scripts/gen_seo.py`, wired into `scripts/sync_games.sh`.

Deploy = the usual `git push` of `Gallery/` (CF Pages auto-deploys). After it's
live, verify: `curl -s https://game-factory.tech/llms.txt | head` and view-source
the homepage for the `SEO-GRID` block.
