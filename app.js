// ── State ─────────────────────────────────────────────────────────────────
let games = [];   // from games.json
let counts = {};  // from /api/counts
let myVotes = JSON.parse(localStorage.getItem('myVotes') || '{}');
let me = null;    // { signed_in, email, uid, exp_ts } from /api/me
let activeTab = 'top';
let activeGenre = 'all';
let searchTerm = '';

// Language detection: ru-* visitors get Russian copy, everyone else English.
// Override available via localStorage.lang ('en' | 'ru') or ?lang= query.
const LANG = (function () {
  const url = new URLSearchParams(location.search).get('lang');
  if (url === 'en' || url === 'ru') {
    localStorage.setItem('lang', url);
    return url;
  }
  const stored = localStorage.getItem('lang');
  if (stored === 'en' || stored === 'ru') return stored;
  return (navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
})();
const T = LANG === 'ru'
  ? { title: 'title_ru', hook: 'hook_ru', play: '▶ Играть', play_count_pre: '▶ ' }
  : { title: 'title',    hook: 'hook',    play: '▶ Play',   play_count_pre: '▶ ' };
function gameTitle(g) { return g[T.title] || g.title; }
function gameHook(g)  { return g[T.hook]  || g.hook; }

const grid     = document.getElementById('grid');
const empty    = document.getElementById('empty');
const tabs     = document.getElementById('tabs');
const genres   = document.getElementById('genres');
const featured = document.getElementById('featured');
const search   = document.getElementById('search');

// ── Boot ──────────────────────────────────────────────────────────────────
init();

async function init() {
  try {
    const res = await fetch('/games.json', { cache: 'no-store' });
    games = await res.json();
  } catch (e) {
    games = [];
  }
  // Try to load shared vote counts; fall back to 0/0 if API isn't deployed yet
  try {
    const r = await fetch('/api/counts', { cache: 'no-store' });
    if (r.ok) counts = await r.json();
  } catch (e) { /* ignore — works offline-style */ }

  // Read auth state — populates the sign-in pill + per-user vote map.
  // When signed in, the user's votes come from server (no per-device drift).
  try {
    const r = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' });
    if (r.ok) me = await r.json();
  } catch (e) { me = null; }
  paintAuthPill();

  // Header metadata: build = highest specimen number, date = today
  const hero = document.getElementById('hero');
  if (hero) {
    const maxN = games.reduce((m, g) => Math.max(m, parseInt(g.num) || 0), 0);
    const dateStr = new Date().toLocaleDateString(LANG === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    hero.setAttribute('data-build', String(maxN).padStart(3, '0'));
    hero.setAttribute('data-date', dateStr);
  }

  attachEvents();
  renderGenres();
  render();
}

// Helper — specimen number padded for display ("022")
function specimenNum(g) {
  return g.num ? String(g.num).padStart(3, '0') : '—';
}

function paintAuthPill() {
  const link    = document.getElementById('auth-link');
  const user    = document.getElementById('auth-user');
  const initial = document.getElementById('auth-user-initial');
  const emailEl = document.getElementById('auth-user-email');
  if (!link || !user) return;
  if (me && me.signed_in) {
    link.style.display = 'none';
    user.style.display = 'inline-flex';
    if (initial) initial.textContent = (me.email[0] || '?').toUpperCase();
    if (emailEl) emailEl.textContent = ' · ' + me.email.split('@')[0];
  } else {
    link.style.display = 'inline-flex';
    user.style.display = 'none';
  }
}

function attachEvents() {
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    render();
  });
  genres.addEventListener('click', (e) => {
    const btn = e.target.closest('.genre');
    if (!btn) return;
    document.querySelectorAll('.genre').forEach(g => g.classList.remove('active'));
    btn.classList.add('active');
    activeGenre = btn.dataset.genre;
    render();
  });
  search.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });
}

function renderGenres() {
  // Count games per genre (only published ones)
  const counts = { all: 0 };
  for (const g of games) {
    if (g.published === false) continue;
    counts.all += 1;
    const k = g.genre || 'other';
    counts[k] = (counts[k] || 0) + 1;
  }
  // Hide row if there's only one genre — filter is meaningless
  const distinct = Object.keys(counts).filter(k => k !== 'all');
  if (distinct.length <= 1) { genres.innerHTML = ''; return; }

  // Order: all first, then by frequency desc
  const ordered = ['all', ...distinct.sort((a, b) => counts[b] - counts[a])];
  genres.innerHTML = ordered.map(g => `
    <button class="genre ${g === activeGenre ? 'active' : ''}" data-genre="${g}">
      ${g === 'all' ? 'All genres' : g}<span class="count">${counts[g]}</span>
    </button>
  `).join('');
}

// ── Filtering / sorting ───────────────────────────────────────────────────
function visible() {
  let list = games.filter(g => g.published !== false);

  if (activeGenre !== 'all') {
    list = list.filter(g => (g.genre || 'other') === activeGenre);
  }

  if (searchTerm) {
    list = list.filter(g =>
      gameTitle(g).toLowerCase().includes(searchTerm) ||
      gameHook(g).toLowerCase().includes(searchTerm)
    );
  }

  if (activeTab === 'recent') {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    list = list.filter(g => new Date(g.addedDate || 0).getTime() >= cutoff);
    list.sort((a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0));
  } else if (activeTab === 'liked') {
    list = list.filter(g => myVotes[g.slug] === 'like');
  } else if (activeTab === 'top') {
    list.sort((a, b) => netScore(b) - netScore(a));
  } else {
    // 'all' — newest first by default
    list.sort((a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0));
  }
  return list;
}

function netScore(g) {
  const c = counts[g.slug] || { likes: 0, dislikes: 0 };
  return (c.likes || 0) - (c.dislikes || 0);
}

// ── Rendering ─────────────────────────────────────────────────────────────
function render() {
  renderFeatured();
  const list = visible();
  grid.innerHTML = '';
  if (list.length === 0) {
    empty.classList.remove('hidden');
    empty.innerHTML = emptyMessage();
    return;
  }
  empty.classList.add('hidden');
  for (const g of list) grid.appendChild(card(g));
}

function engagementScore(g) {
  const c = counts[g.slug] || {};
  // Total minutes weighted heaviest, then plays, then likes-dislikes
  const minutes = (c.seconds || 0) / 60;
  const plays   = c.plays || 0;
  const net     = (c.likes || 0) - (c.dislikes || 0);
  return minutes * 3 + plays * 1 + net * 5;
}

function renderFeatured() {
  // Only show on the default top-rated tab with no filters/search applied
  if (activeTab !== 'top' || activeGenre !== 'all' || searchTerm) {
    featured.classList.add('hidden');
    featured.innerHTML = '';
    return;
  }
  const eligible = games.filter(g => g.published !== false);
  if (eligible.length < 2) { featured.classList.add('hidden'); return; }

  const top = eligible.slice().sort((a, b) => engagementScore(b) - engagementScore(a))[0];
  if (!top) { featured.classList.add('hidden'); return; }

  // If there's no engagement data anywhere, fall back to the newest game
  const topScore = engagementScore(top);
  const game = topScore > 0
    ? top
    : eligible.slice().sort((a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0))[0];

  const c = counts[game.slug] || { likes: 0, dislikes: 0, plays: 0, seconds: 0 };
  const minutes = Math.round((c.seconds || 0) / 60);
  const playUrl = `/play.html?slug=${encodeURIComponent(game.slug)}`;

  featured.innerHTML = `
    <article class="hero">
      <div class="hero-thumb" style="background-image: url('/thumbs/${game.slug}.png?v=1')"></div>
      <div class="hero-content">
        <div class="hero-badge">${topScore > 0 ? '🔥 Trending' : '✨ Featured'}</div>
        <h2 class="hero-title"></h2>
        <p class="hero-hook"></p>
        <div class="hero-stats">
          <span>👍 ${c.likes || 0}</span>
          <span>▶ ${c.plays || 0}</span>
          ${minutes > 0 ? `<span>⏱ ${minutes}m total play</span>` : ''}
        </div>
        <a class="hero-cta" href="${playUrl}">▶ Play featured game</a>
      </div>
    </article>
  `;
  featured.querySelector('.hero-title').textContent = gameTitle(game);
  featured.querySelector('.hero-hook').textContent  = gameHook(game);
  featured.classList.remove('hidden');
}

function emptyMessage() {
  if (activeTab === 'liked')  return '<h2>No liked games yet.</h2><p>Tap 👍 on something you enjoyed.</p>';
  if (activeTab === 'recent') return '<h2>No new games this week.</h2><p>Check back tomorrow — the factory builds one most days.</p>';
  if (searchTerm)             return `<h2>No games matching “${escapeHtml(searchTerm)}”.</h2>`;
  return '<h2>No games yet.</h2>';
}

function pickVariant(slug, thumbCount) {
  // Random per pageview — with random pick, impressions are roughly uniform
  // across variants, so raw click counts give a directional CTR signal
  // without us paying for impression-write KV ops.
  if (!thumbCount || thumbCount < 2) return 1;
  return 1 + Math.floor(Math.random() * thumbCount);
}

function thumbUrl(slug, variant) {
  return variant > 1
    ? `/thumbs/${slug}__v${variant}.png?v=1`
    : `/thumbs/${slug}.png?v=1`;
}

function card(g) {
  const c = counts[g.slug] || { likes: 0, dislikes: 0, plays: 0 };
  const myVote = myVotes[g.slug] || null;
  const isRecent = g.addedDate && (Date.now() - new Date(g.addedDate).getTime() < 3 * 24 * 60 * 60 * 1000);
  const variant  = pickVariant(g.slug, g.thumbCount || 1);
  const thumb    = thumbUrl(g.slug, variant);
  const playUrl  = `/play.html?slug=${encodeURIComponent(g.slug)}`;

  // If a preview WebM exists, render it as a muted-autoloop video laid over
  // the static thumb (still the poster while the video is buffering).
  const mediaInner = g.hasPreview
    ? `<video class="card-video" src="/previews/${g.slug}.webm" poster="${thumb}"
              autoplay loop muted playsinline preload="metadata" aria-hidden="true"></video>`
    : '';

  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.variant = variant;
  el.innerHTML = `
    <div class="card-thumb" data-num="${specimenNum(g)}" style="background-image: url('${thumb}')">
      ${mediaInner}
      ${isRecent ? '<span class="recent-badge">NEW</span>' : ''}
      ${c.plays ? `<span class="play-count">▶ ${c.plays}</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-title"></div>
      <div class="card-hook"></div>
      <div class="card-foot">
        <button class="vote like ${myVote === 'like' ? 'active' : ''}" data-action="like" aria-label="Like">
          👍 <span class="num">${c.likes || 0}</span>
        </button>
        <button class="vote dislike ${myVote === 'dislike' ? 'active' : ''}" data-action="dislike" aria-label="Dislike">
          👎 <span class="num">${c.dislikes || 0}</span>
        </button>
        <a class="play-link" href="${playUrl}">▶ Play</a>
      </div>
    </div>
  `;
  el.querySelector('.card-title').textContent = gameTitle(g);
  el.querySelector('.card-hook').textContent  = gameHook(g);

  function goPlay() {
    if ((g.thumbCount || 1) > 1) logVariantClick(g.slug, variant);
    location.href = playUrl;
  }
  el.querySelector('.card-thumb').addEventListener('click', goPlay);
  el.querySelector('.play-link').addEventListener('click', (e) => {
    if ((g.thumbCount || 1) > 1) logVariantClick(g.slug, variant);
    // let the link navigation proceed
  });
  el.querySelectorAll('.vote').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      vote(g.slug, btn.dataset.action, el);
    });
  });
  return el;
}

function logVariantClick(slug, variant) {
  // sendBeacon survives the navigation that's about to happen
  const body = JSON.stringify({ slug, variant });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/click', new Blob([body], { type: 'application/json' }));
  } else {
    fetch('/api/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
      .catch(() => {});
  }
}

// ── Voting ────────────────────────────────────────────────────────────────
async function vote(slug, action, cardEl) {
  const prev = myVotes[slug] || null;
  const next = prev === action ? null : action;

  // Optimistic local update — paint instantly, server reconciles
  let dl = 0, dd = 0;
  if (prev === 'like')    dl -= 1;
  if (prev === 'dislike') dd -= 1;
  if (next === 'like')    dl += 1;
  if (next === 'dislike') dd += 1;
  if (next) myVotes[slug] = next; else delete myVotes[slug];
  localStorage.setItem('myVotes', JSON.stringify(myVotes));
  if (!counts[slug]) counts[slug] = { likes: 0, dislikes: 0 };
  counts[slug].likes    = Math.max(0, (counts[slug].likes    || 0) + dl);
  counts[slug].dislikes = Math.max(0, (counts[slug].dislikes || 0) + dd);
  refreshCard(cardEl, slug);

  // Server update. Two paths:
  //   - Signed in: server enforces per-user vote map (multi-vote-proof)
  //   - Anon: legacy delta path (client-side dedup via localStorage)
  try {
    const body = (me && me.signed_in)
      ? { slug, vote: next || 'clear' }
      : { slug, deltaLike: dl, deltaDislike: dd };
    const r = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const updated = await r.json();
      counts[slug] = { likes: updated.likes, dislikes: updated.dislikes };
      // Server may correct our optimistic state (e.g. desync). Trust it.
      if (updated.myVote !== undefined) {
        if (updated.myVote === 'like' || updated.myVote === 'dislike') myVotes[slug] = updated.myVote;
        else delete myVotes[slug];
        localStorage.setItem('myVotes', JSON.stringify(myVotes));
      }
      refreshCard(cardEl, slug);
    }
  } catch (e) { /* offline-tolerant */ }
}

function refreshCard(el, slug) {
  const c = counts[slug] || { likes: 0, dislikes: 0 };
  const myVote = myVotes[slug] || null;
  const likeBtn    = el.querySelector('.vote.like');
  const dislikeBtn = el.querySelector('.vote.dislike');
  likeBtn.querySelector('.num').textContent    = c.likes || 0;
  dislikeBtn.querySelector('.num').textContent = c.dislikes || 0;
  likeBtn.classList.toggle('active',    myVote === 'like');
  dislikeBtn.classList.toggle('active', myVote === 'dislike');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
