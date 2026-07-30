import {
  DISCOVERY_SITE,
  GENRE_PAGES,
  genreGroups,
  platformEntries,
} from './seoSurface.js';

export function renderGenreDirectory(games) {
  const groups = genreGroups(games);
  const title = "Browse free browser games by genre — Tim's Game Lab";
  const description = 'Explore the public game collection by mechanic: arcade, puzzle, strategy, merge, physics, tycoon, and more.';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Browser game genres',
    url: `${DISCOVERY_SITE}/genres`,
    description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: groups.length,
      itemListElement: groups.map((group, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: group.title,
        url: `${DISCOVERY_SITE}/genre/${group.slug}`,
      })),
    },
  };
  const content = groups.map(group => (
    `<li><a href="/genre/${group.slug}"><strong>${escapeHtml(group.title)}</strong>`
    + `<span>${group.games.length} ${group.games.length === 1 ? 'game' : 'games'}</span>`
    + `<p>${escapeHtml(group.description)}</p></a></li>`
  )).join('');
  return shell({
    title,
    description,
    canonical: `${DISCOVERY_SITE}/genres`,
    ld,
    eyebrow: 'Game collections',
    heading: 'Browse by genre',
    intro: 'Pick the kind of loop you want. Every list reflects the same live curation used by the main gallery.',
    body: `<ul class="collections">${content}</ul>`,
  });
}

export function renderGenrePage(games, genreSlug) {
  const meta = GENRE_PAGES[genreSlug];
  if (!meta) return null;
  const selected = genreGroups(games).find(group => group.slug === genreSlug);
  if (!selected) return null;
  const canonical = `${DISCOVERY_SITE}/genre/${genreSlug}`;
  const title = `${meta.title} you can play in a browser — Tim's Game Lab`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: meta.title,
    url: canonical,
    description: meta.description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: selected.games.length,
      itemListElement: selected.games.map((game, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'VideoGame',
          name: game.title || game.slug,
          url: `${DISCOVERY_SITE}/p/${game.slug}`,
          image: `${DISCOVERY_SITE}/thumbs/${game.slug}.png`,
          description: clip(game.hook, 160),
          datePublished: game.addedDate || undefined,
          dateModified: game.updatedDate || game.addedDate || undefined,
          sameAs: platformEntries(game.platforms).map(entry => entry.href) || undefined,
        },
      })),
    },
  };
  const cards = selected.games.map(game => {
    const platforms = platformEntries(game.platforms);
    const platformText = platforms.length
      ? `<span>Also on ${escapeHtml(platforms.map(entry => entry.label).join(', '))}</span>`
      : '<span>Play in this browser</span>';
    return (
      `<article><a href="/p/${game.slug}">`
      + `<img src="/thumbs/${game.slug}.webp?v=2" alt="" width="320" height="180" loading="lazy">`
      + `<div><h2>${escapeHtml(game.title || game.slug)}</h2>`
      + `<p>${escapeHtml(clip(game.hook, 180))}</p>${platformText}</div>`
      + '</a></article>'
    );
  }).join('');
  return shell({
    title,
    description: meta.description,
    canonical,
    ld,
    eyebrow: `${selected.games.length} curated ${selected.games.length === 1 ? 'game' : 'games'}`,
    heading: meta.title,
    intro: meta.description,
    body: `<div class="games">${cards}</div>`,
  });
}

function shell({ title, description, canonical, ld, eyebrow, heading, intro, body }) {
  const jsonLd = JSON.stringify(ld, (_key, value) => value === undefined ? undefined : value)
    .replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;background:#0a0a14;color:#e7e7ee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}
    main{width:min(1040px,calc(100% - 32px));margin:0 auto;padding:48px 0 72px}
    nav a{color:#8a8aa0;text-decoration:none}nav a:hover{color:#e7e7ee}
    .eyebrow{margin:42px 0 6px;color:#4dd0e1;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}
    h1{font-size:clamp(34px,6vw,68px);line-height:1;margin:0;max-width:900px}
    .intro{color:#a7a7b6;font-size:18px;max-width:760px;margin:18px 0 38px}
    .collections{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
    .collections a,.games a{display:block;color:inherit;text-decoration:none;background:#13131f;border:1px solid #262637;border-radius:14px;overflow:hidden;transition:transform .16s,border-color .16s}
    .collections a{padding:18px;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:start}.collections a:hover,.games a:hover{transform:translateY(-2px);border-color:#4dd0e1}
    .collections strong{font-size:19px}.collections span{color:#8a8aa0;font-size:12px;white-space:nowrap;padding-top:4px}.collections p{grid-column:1/-1;color:#9696aa;margin:10px 0 0}
    .games{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
    .games img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#1b1b28}
    .games div{padding:14px 16px 17px}.games h2{font-size:20px;margin:0 0 6px}.games p{color:#a7a7b6;margin:0 0 12px}.games span{color:#4dd0e1;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
    footer{margin-top:42px;color:#77778d}footer a{color:#a7a7b6}
  </style>
</head>
<body>
  <main>
    <nav aria-label="Breadcrumb"><a href="/">Tim's Game Lab</a> · <a href="/genres">Genres</a></nav>
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h1>${escapeHtml(heading)}</h1>
    <p class="intro">${escapeHtml(intro)}</p>
    ${body}
    <footer><a href="/">← Back to all games</a></footer>
  </main>
</body>
</html>`;
}

function clip(value, limit) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}
