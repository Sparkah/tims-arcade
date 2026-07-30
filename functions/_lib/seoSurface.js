const SITE = 'https://game-factory.tech';
const STATIC_CARD_LIMIT = 60;
const JSONLD_LIMIT = 40;

export const GENRE_PAGES = Object.freeze({
  arcade: {
    title: 'Arcade games',
    description: 'Short, replayable games built around timing, movement, aiming, and chasing a better run.',
  },
  puzzle: {
    title: 'Puzzle games',
    description: 'Browser puzzles about patterns, spatial reasoning, sequencing, and finding a clean solution.',
  },
  strategy: {
    title: 'Strategy games',
    description: 'Games where positioning, resource choices, and planning matter more than raw reaction speed.',
  },
  cleaning: {
    title: 'Cleaning and restoration games',
    description: 'Tactile games about clearing mess, repairing spaces, and turning a rough scene into a satisfying result.',
  },
  sort: {
    title: 'Sorting games',
    description: 'Order-making puzzles about separating colours, routes, objects, and crowded systems.',
  },
  merge: {
    title: 'Merge games',
    description: 'Progression games where combining matching pieces unlocks stronger tools, units, or recipes.',
  },
  physics: {
    title: 'Physics games',
    description: 'Games driven by momentum, balance, collisions, trajectories, and playful physical systems.',
  },
  simulation: {
    title: 'Simulation games',
    description: 'Compact simulations with systems to operate, improve, and learn through experimentation.',
  },
  word: {
    title: 'Word games',
    description: 'Language games about vocabulary, clues, spelling, and making useful connections between words.',
  },
  tycoon: {
    title: 'Tycoon games',
    description: 'Growth and automation games about building an operation, reinvesting earnings, and unlocking the next layer.',
  },
});

// app.js is a classic browser script while this file is a Worker module, so
// they cannot share a runtime import. The release-blocking discovery test
// compares every key and host to prevent either allowlist from drifting.
export const PLATFORM_SPECS = Object.freeze([
  { key: 'yandex', label: 'Yandex Games', hosts: ['yandex.com'] },
  { key: 'crazygames', label: 'CrazyGames', hosts: ['www.crazygames.com'] },
  { key: 'gamepix', label: 'GamePix', hosts: ['www.gamepix.com'] },
  { key: 'playgama', label: 'Playgama', hosts: ['playgama.com'] },
  { key: 'gamepush', label: 'GamePush', hosts: ['gamepush.com', 'html5.gamedistribution.com'] },
  { key: 'gamedistribution', label: 'GameDistribution', hosts: ['gamedistribution.com', 'html5.gamedistribution.com'] },
  { key: 'youtube', label: 'YouTube Playables', hosts: ['www.youtube.com', 'youtube.com'] },
  { key: 'roblox', label: 'Roblox', hosts: ['www.roblox.com', 'roblox.com'] },
]);

export function platformEntries(platforms) {
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) return [];
  const entries = [];
  for (const spec of PLATFORM_SPECS) {
    const raw = platforms[spec.key];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    try {
      const url = new URL(raw);
      const hostname = url.hostname.toLowerCase();
      if (
        url.protocol !== 'https:'
        || url.username
        || url.password
        || url.port
        || !spec.hosts.includes(hostname)
      ) continue;
      entries.push({ key: spec.key, label: spec.label, href: url.href });
    } catch (_) {
      // Invalid catalogue URLs are omitted rather than emitted into HTML/schema.
    }
  }
  return entries;
}

export function primaryExternalEntry(game) {
  const entries = platformEntries(game && game.platforms);
  return game && game.external === true ? (entries[0] || null) : null;
}

export function sortNewest(games) {
  return [...games].sort((a, b) => {
    const byDate = String(b.addedDate || '').localeCompare(String(a.addedDate || ''));
    return byDate || String(a.slug || '').localeCompare(String(b.slug || ''));
  });
}

export function genreGroups(games) {
  const groups = [];
  for (const [slug, meta] of Object.entries(GENRE_PAGES)) {
    const matching = sortNewest(games.filter(game => game.genre === slug));
    // Keep configured collection URLs stable even when curation temporarily
    // hides every game in one genre. Omitting the route makes the directory,
    // sitemap, and LLM index disagree with the promised collection set; an
    // honest zero-game page is safer than exposing a hidden title to fill it.
    groups.push({ slug, ...meta, games: matching });
  }
  return groups.sort((a, b) => b.games.length - a.games.length || a.title.localeCompare(b.title));
}

export function buildHomepageJsonLd(games) {
  const newest = sortNewest(games);
  const items = newest.slice(0, JSONLD_LIMIT).map((game, index) => {
    const platforms = platformEntries(game.platforms);
    const primary = game.external === true ? platforms[0] : null;
    const item = {
      '@type': 'VideoGame',
      name: game.title || game.slug,
      url: `${SITE}/p/${game.slug}`,
      image: `${SITE}/thumbs/${game.slug}.png`,
      description: clip(game.hook, 120),
      datePublished: validDate(game.addedDate) || undefined,
      dateModified: validDate(game.updatedDate) || validDate(game.addedDate) || undefined,
      genre: String(game.genre || '').trim() || undefined,
      sameAs: platforms.length ? platforms.map(entry => entry.href) : undefined,
      gamePlatform: platforms.length ? platforms.map(entry => entry.label) : 'Web Browser',
      potentialAction: primary ? {
        '@type': 'PlayAction',
        target: primary.href,
      } : undefined,
    };
    return { '@type': 'ListItem', position: index + 1, item };
  });
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: "Tim's Game Lab - free browser games",
    url: `${SITE}/`,
    description: (
      `A curated collection of ${games.length} small, original browser games and `
      + 'official platform releases. Play instantly with no signup.'
    ),
    inLanguage: ['en', 'ru'],
    isPartOf: { '@type': 'WebSite', name: "Tim's Game Lab", url: `${SITE}/` },
    mainEntity: {
      '@type': 'ItemList',
      name: "Curated browser games at Tim's Game Lab",
      numberOfItems: items.length,
      itemListElement: items,
    },
  };
  return safeJson(doc);
}

export function buildHomepageCards(games) {
  const newest = sortNewest(games);
  const cards = newest.slice(0, STATIC_CARD_LIMIT).map(game => {
    const platforms = platformEntries(game.platforms);
    const availability = platforms.length
      ? `<span class="seo-platforms">Available on ${escapeHtml(platforms.map(p => p.label).join(', '))}</span>`
      : '';
    const genre = String(game.genre || '').trim();
    return (
      `<article class="seo-card"><a href="/p/${escapeHtml(game.slug)}">`
      + `<img src="/thumbs/${escapeHtml(game.slug)}.png" alt="${escapeHtml(game.title || game.slug)}" loading="lazy" width="320" height="180">`
      + `<h3>${escapeHtml(game.title || game.slug)}</h3>`
      + `<p>${escapeHtml(clip(game.hook, 140))}</p>`
      + (genre ? `<span class="seo-genre">${escapeHtml(genre)}</span>` : '')
      + availability
      + '</a></article>'
    );
  });
  const style = (
    '<style>.seo-intro{grid-column:1/-1;color:#8a8aa0;font-size:14px;margin:0 0 4px}'
    + '.seo-card a{display:block;color:#e7e7ee;text-decoration:none;background:#13131f;border:1px solid #1f1f2c;border-radius:10px;overflow:hidden;padding-bottom:10px}'
    + '.seo-card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}'
    + '.seo-card h3{font-size:15px;margin:8px 10px 4px}'
    + '.seo-card p{font-size:13px;color:#8a8aa0;margin:0 10px;line-height:1.35}'
    + '.seo-card .seo-genre,.seo-card .seo-platforms{display:inline-block;margin:6px 10px 0;font-size:11px;color:#6a6a82;text-transform:uppercase;letter-spacing:.05em}</style>'
  );
  const intro = (
    '<p class="seo-intro">Free browser games and official platform releases. '
    + `Showing the ${Math.min(STATIC_CARD_LIMIT, games.length)} newest of ${games.length} curated games; `
    + '<a href="/llms.txt">full index</a>.</p>'
  );
  return `${style}\n${intro}\n${cards.join('\n')}`;
}

export function injectHomepageSurfaces(html, games) {
  const collectionStart = '<!-- SEO-COLLECTION:START (generated by scripts/gen_seo.py) -->';
  const collectionEnd = '<!-- SEO-COLLECTION:END -->';
  const gridStart = '<!-- SEO-GRID:START (generated by scripts/gen_seo.py; app.js clears #grid on load) -->';
  const gridEnd = '<!-- SEO-GRID:END -->';
  let output = replaceMarkedBlock(
    html,
    collectionStart,
    collectionEnd,
    `<script type="application/ld+json">${buildHomepageJsonLd(games)}</script>`,
  );
  output = replaceMarkedBlock(output, gridStart, gridEnd, buildHomepageCards(games));
  return output;
}

export function buildLlms(games) {
  const newest = sortNewest(games);
  const lines = [
    "# Tim's Game Lab (game-factory.tech)",
    '',
    '> A curated collection of small, original browser games and official platform releases. Play instantly, with no signup. New experiments arrive regularly and player feedback shapes what gets improved.',
    '',
    '## About',
    '- Free browser games for desktop and mobile; some releases open on their official distribution platform.',
    '- Each listed game has been intentionally selected for the public gallery; hidden experiments are not included.',
    '- Game pages provide English and Russian descriptions, direct play links, and verified platform destinations.',
    `- Browse the gallery: ${SITE}/  -  Russian: ${SITE}/?lang=ru`,
    '',
    `## Curated games (${newest.length}, newest first)`,
  ];
  for (const game of newest) {
    const genre = String(game.genre || '').trim();
    const genreTag = genre ? ` [${genre}]` : '';
    const platforms = platformEntries(game.platforms);
    const platformText = platforms.length
      ? ` Available on ${platforms.map(p => `[${p.label}](${p.href})`).join(', ')}.`
      : '';
    lines.push(
      `- [${markdownText(game.title || game.slug)}](${SITE}/p/${game.slug})${genreTag}: `
      + `${clip(game.hook, 200)}${platformText}`,
    );
  }
  const genres = genreGroups(games);
  if (genres.length) {
    lines.push('', '## Browse by genre', `- [All genre collections](${SITE}/genres)`);
    for (const genre of genres) {
      lines.push(`- [${genre.title}](${SITE}/genre/${genre.slug}): ${genre.description}`);
    }
  }
  lines.push(
    '',
    '## Also',
    `- New-games feed (RSS): ${SITE}/rss.xml`,
    `- Sitemap: ${SITE}/sitemap.xml`,
    `- Make your own game from one sentence: ${SITE}/create`,
    '',
  );
  return lines.join('\n');
}

export function buildSitemap(games, curationUpdatedAt = '') {
  const newest = sortNewest(games);
  const rootDate = latestDate(
    ...newest.map(game => game.updatedDate || game.addedDate),
    String(curationUpdatedAt || '').slice(0, 10),
  );
  const urls = [];
  urls.push(
    '  <url>'
    + `<loc>${SITE}/</loc>`
    + `<xhtml:link rel="alternate" hreflang="en" href="${SITE}/"/>`
    + `<xhtml:link rel="alternate" hreflang="ru" href="${SITE}/?lang=ru"/>`
    + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`
    + (rootDate ? `<lastmod>${rootDate}</lastmod>` : '')
    + '<priority>1.0</priority></url>',
  );
  const genres = genreGroups(games);
  if (genres.length) {
    urls.push(
      '  <url>'
      + `<loc>${SITE}/genres</loc>`
      + (rootDate ? `<lastmod>${rootDate}</lastmod>` : '')
      + '<priority>0.7</priority></url>',
    );
    for (const genre of genres) {
      const lastmod = latestDate(...genre.games.map(game => game.updatedDate || game.addedDate));
      urls.push(
        '  <url>'
        + `<loc>${SITE}/genre/${genre.slug}</loc>`
        + (lastmod ? `<lastmod>${lastmod}</lastmod>` : '')
        + '<priority>0.7</priority></url>',
      );
    }
  }
  for (const game of newest) {
    const page = `${SITE}/p/${game.slug}`;
    const lastmod = validDate(game.updatedDate) || validDate(game.addedDate);
    urls.push(
      '  <url>'
      + `<loc>${page}</loc>`
      + `<xhtml:link rel="alternate" hreflang="en" href="${page}"/>`
      + `<xhtml:link rel="alternate" hreflang="ru" href="${page}?lang=ru"/>`
      + `<xhtml:link rel="alternate" hreflang="x-default" href="${page}"/>`
      + (lastmod ? `<lastmod>${lastmod}</lastmod>` : '')
      + '<priority>0.8</priority></url>',
    );
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + `${urls.join('\n')}\n`
    + '</urlset>\n'
  );
}

export function buildRss(games, curationUpdatedAt = '') {
  const newest = sortNewest(games);
  const latest = latestDate(
    ...newest.map(game => game.updatedDate || game.addedDate),
    String(curationUpdatedAt || '').slice(0, 10),
  );
  const items = newest.map(game => {
    const page = `${SITE}/p/${game.slug}`;
    return (
      '  <item>\n'
      + `    <title>${escapeXml(game.title || game.slug)}</title>\n`
      + `    <link>${page}</link>\n`
      + `    <guid isPermaLink="true">${page}</guid>\n`
      + `    <description>${escapeXml(game.hook || '')}</description>\n`
      + (validDate(game.addedDate) ? `    <pubDate>${dateToRfc(game.addedDate)}</pubDate>\n` : '')
      + '  </item>'
    );
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
    + '<channel>\n'
    + "  <title>Tim's Game Lab</title>\n"
    + `  <link>${SITE}/</link>\n`
    + '  <description>Curated HTML5 browser games and official platform releases.</description>\n'
    + '  <language>en</language>\n'
    + `  <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>\n`
    + (latest ? `  <lastBuildDate>${dateToRfc(latest)}</lastBuildDate>\n` : '')
    + `${items.join('\n')}\n`
    + '</channel>\n'
    + '</rss>\n'
  );
}

export function validDate(value) {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))
    ? text
    : '';
}

function latestDate(...values) {
  return values.map(validDate).filter(Boolean).sort().pop() || '';
}

function dateToRfc(value) {
  return new Date(`${validDate(value)}T00:00:00Z`).toUTCString();
}

function replaceMarkedBlock(html, start, end, payload) {
  const startAt = html.indexOf(start);
  const endAt = html.indexOf(end, startAt + start.length);
  if (startAt < 0 || endAt < 0) throw new Error(`Missing generated HTML marker: ${start}`);
  return (
    html.slice(0, startAt)
    + `${start}\n${payload}\n${end}`
    + html.slice(endAt + end.length)
  );
}

function safeJson(value) {
  return JSON.stringify(value, (_key, item) => item === undefined ? undefined : item)
    .replace(/</g, '\\u003c');
}

function clip(value, limit = 180) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function markdownText(value) {
  return String(value || '').replace(/[[\]\\]/g, '\\$&').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function escapeXml(value) {
  return escapeHtml(value);
}

export const DISCOVERY_SITE = SITE;
