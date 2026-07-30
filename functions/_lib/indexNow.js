const HOST = 'game-factory.tech';
const KEY = 'e90939133b37a6addb37a9fd380e9112';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const GENRE_PATHS = [
  '/genres',
  '/genre/arcade',
  '/genre/puzzle',
  '/genre/strategy',
  '/genre/cleaning',
  '/genre/sort',
  '/genre/merge',
  '/genre/physics',
  '/genre/simulation',
  '/genre/word',
  '/genre/tycoon',
];

export function indexNowUrlsForCuration(slug) {
  const safeSlug = String(slug || '').replace(/[^a-z0-9_-]/g, '');
  const paths = [
    '/',
    '/?lang=ru',
    '/?lang=es',
    '/?lang=pt',
    '/?lang=tr',
    '/?lang=ar',
    '/games.json',
    '/llms.txt',
    '/sitemap.xml',
    '/rss.xml',
    ...GENRE_PATHS,
  ];
  if (safeSlug) {
    paths.push(`/p/${safeSlug}`, `/p/${safeSlug}?lang=ru`);
  }
  return paths.map(path => `https://${HOST}${path}`);
}

export async function notifyIndexNow(urls) {
  const urlList = [...new Set((urls || []).map(normalizeSameHostUrl).filter(Boolean))].sort();
  if (!urlList.length) return { ok: true, status: 204, count: 0 };

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: KEY_LOCATION,
        urlList,
      }),
    });
    return {
      ok: response.status === 200 || response.status === 202,
      status: response.status,
      count: urlList.length,
    };
  } catch (_) {
    // This is a best-effort freshness notification after the authoritative KV
    // mutation. A transport outage must not roll back curation.
    return { ok: false, status: 0, count: urlList.length };
  }
}

function normalizeSameHostUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (
      url.protocol !== 'https:'
      || url.hostname !== HOST
      || url.username
      || url.password
      || url.port
    ) return '';
    url.hash = '';
    return url.href;
  } catch (_) {
    return '';
  }
}
