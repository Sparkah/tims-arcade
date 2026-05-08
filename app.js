// ── State ─────────────────────────────────────────────────────────────────
let games = [];   // from games.json
let counts = {};  // from /api/counts (cumulative all-time)
let todayScores = {}; // from /api/trending — { slug: {seconds, comments, score} }
let myVotes = JSON.parse(localStorage.getItem('myVotes') || '{}');
let me = null;    // { signed_in, email, uid, exp_ts } from /api/me
let activeTab = 'top';
let activeGenre = 'all';
let searchTerm = '';

// Language detection — 6 supported: en (default), ru, es, pt, tr, ar.
// Override via ?lang=<code> or localStorage.lang. navigator.language picks
// the best match by 2-letter prefix; unknown languages fall through to en.
const SUPPORTED_LANGS = ['en', 'ru', 'es', 'pt', 'tr', 'ar'];
const LANG = (function () {
  const url = new URLSearchParams(location.search).get('lang');
  if (url && SUPPORTED_LANGS.includes(url)) {
    localStorage.setItem('lang', url);
    return url;
  }
  const stored = localStorage.getItem('lang');
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  const nav = (navigator.language || 'en').toLowerCase().slice(0, 2);
  return SUPPORTED_LANGS.includes(nav) ? nav : 'en';
})();
// Per-language UI strings. The title/hook field names follow the convention
// `title_<lang>` / `hook_<lang>`; English uses bare `title` / `hook`.
const TI18N = {
  en: { title: 'title',    hook: 'hook',    play: '▶ Play' },
  ru: { title: 'title_ru', hook: 'hook_ru', play: '▶ Играть' },
  es: { title: 'title_es', hook: 'hook_es', play: '▶ Jugar' },
  pt: { title: 'title_pt', hook: 'hook_pt', play: '▶ Jogar' },
  tr: { title: 'title_tr', hook: 'hook_tr', play: '▶ Oyna' },
  ar: { title: 'title_ar', hook: 'hook_ar', play: '▶ العب' },
};
const T = TI18N[LANG] || TI18N.en;
T.play_count_pre = '▶ ';
// Set <html lang> + dir for screen readers + RTL handling on Arabic.
document.documentElement.setAttribute('lang', LANG);
if (LANG === 'ar') document.documentElement.setAttribute('dir', 'rtl');
// gameTitle / gameHook fall back: requested-lang → english → undefined-safe ''.
function gameTitle(g) { return g[T.title] || g.title || ''; }
function gameHook(g)  { return g[T.hook]  || g.hook  || ''; }

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

  // Today's trending signal (per-day seconds + comments). Used by the
  // featured hero so the spotlight rotates daily instead of camping on
  // the all-time leader.
  try {
    const r = await fetch('/api/trending', { cache: 'no-store' });
    if (r.ok) {
      const payload = await r.json();
      todayScores = payload.games || {};
    }
  } catch (e) { todayScores = {}; }

  // Read auth state — populates the sign-in pill + per-user vote map.
  // When signed in, the user's votes come from server (no per-device drift).
  try {
    const r = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' });
    if (r.ok) me = await r.json();
  } catch (e) { me = null; }
  paintAuthPill();
  // Identify signed-in user so PostHog links events to the person profile.
  if (me && me.signed_in && window.posthog) {
    posthog.identify(me.uid, { email: me.email });
  }

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

// Debounce helper for search tracking — avoids an event per keystroke.
let _searchDebounce = null;

function attachEvents() {
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    if (window.posthog) posthog.capture('tab_changed', { tab: activeTab });
    render();
  });
  genres.addEventListener('click', (e) => {
    const btn = e.target.closest('.genre');
    if (!btn) return;
    document.querySelectorAll('.genre').forEach(g => g.classList.remove('active'));
    btn.classList.add('active');
    activeGenre = btn.dataset.genre;
    if (window.posthog) posthog.capture('genre_filter_applied', { genre: activeGenre });
    render();
  });
  search.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    clearTimeout(_searchDebounce);
    if (searchTerm) {
      _searchDebounce = setTimeout(() => {
        if (window.posthog) posthog.capture('game_searched', { query_length: searchTerm.length });
      }, 600);
    }
    render();
  });

  // Reset PostHog identity when user signs out.
  const signOutLink = document.querySelector('.out[href*="logout"]');
  if (signOutLink) {
    signOutLink.addEventListener('click', () => {
      if (window.posthog) posthog.reset();
    });
  }
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
  } else if (activeTab === 'myplayed') {
    // Personal play history — read localStorage entries written by play.html.
    // Sort by recency of MY plays, not addedDate.
    let played;
    try { played = JSON.parse(localStorage.getItem('myPlayed') || '[]'); }
    catch { played = []; }
    const orderBySlug = new Map(played.map((e, i) => [e.slug, i]));
    list = list.filter(g => orderBySlug.has(g.slug));
    list.sort((a, b) => orderBySlug.get(a.slug) - orderBySlug.get(b.slug));
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
  const featuredSlug = renderFeatured();
  let list = visible();
  if (featuredSlug) list = list.filter(g => g.slug !== featuredSlug);
  grid.innerHTML = '';
  if (list.length === 0) {
    empty.classList.remove('hidden');
    empty.innerHTML = emptyMessage();
    return;
  }
  empty.classList.add('hidden');

  // Two-pass paint:
  //   1. First 4 cards render with EAGER images + video previews → visible
  //      area is interactive immediately.
  //   2. The rest paint in a single idle batch with LAZY native loading and
  //      no inline video — videos hydrate per-card when scrolled into view.
  // Without this, 17+ thumbs (~250KB each) all start downloading at once,
  // causing the 1-2s hitching Tim observed.
  const EAGER = 4;
  const eagerSet = list.slice(0, EAGER);
  const rest     = list.slice(EAGER);
  for (let i = 0; i < eagerSet.length; i++) {
    grid.appendChild(card(eagerSet[i], { eager: true, priority: i < 2 }));
  }
  if (rest.length === 0) return;
  const paintRest = () => {
    const frag = document.createDocumentFragment();
    for (const g of rest) frag.appendChild(card(g, { eager: false, priority: false }));
    grid.appendChild(frag);
    // Hydrate videos lazily as cards scroll into view.
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries) => {
        for (const ent of entries) {
          if (!ent.isIntersecting) continue;
          const slot = ent.target.querySelector('.card-video-slot[data-src]');
          if (slot) {
            const v = document.createElement('video');
            v.className = 'card-video';
            v.src = slot.dataset.src;
            v.poster = slot.dataset.poster || '';
            v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
            v.preload = 'metadata';
            v.setAttribute('aria-hidden', 'true');
            slot.replaceWith(v);
          }
          obs.unobserve(ent.target);
        }
      }, { rootMargin: '160px 0px' });
      grid.querySelectorAll('.card[data-lazy="1"]').forEach(c => obs.observe(c));
    }
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(paintRest, { timeout: 800 });
  } else {
    setTimeout(paintRest, 50);
  }
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
  // Only show on the default top-rated tab with no filters/search applied.
  // Returns the slug of the featured game so render() can dedupe it from
  // the card grid below — otherwise the same game appears twice.
  if (activeTab !== 'top' || activeGenre !== 'all' || searchTerm) {
    featured.classList.add('hidden');
    featured.innerHTML = '';
    return null;
  }
  const eligible = games.filter(g => g.published !== false);
  if (eligible.length < 2) { featured.classList.add('hidden'); return null; }

  // Trending = top engagement TODAY (per-day seconds + comments × 60).
  // Falls through to all-time engagement if today's signal is empty (e.g.
  // first visitor of the day before any heartbeat lands), then to newest.
  const todayScore = (g) => (todayScores[g.slug] && todayScores[g.slug].score) || 0;
  const sortedToday = eligible.slice().sort((a, b) => todayScore(b) - todayScore(a));
  const todayTop   = sortedToday[0];
  const todayBest  = todayTop ? todayScore(todayTop) : 0;

  let game, topScore;
  if (todayBest > 0) {
    game = todayTop;
    topScore = todayBest;
  } else {
    const sortedAll = eligible.slice().sort((a, b) => engagementScore(b) - engagementScore(a));
    const allTop = sortedAll[0];
    if (allTop && engagementScore(allTop) > 0) {
      game = allTop;
      topScore = engagementScore(allTop);
    } else {
      game = eligible.slice().sort((a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0))[0];
      topScore = 0;
    }
  }

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
  return game.slug;
}

function emptyMessage() {
  if (activeTab === 'liked')    return '<h2>No liked games yet.</h2><p>Tap 👍 on something you enjoyed.</p>';
  if (activeTab === 'myplayed') return '<h2>No play history yet.</h2><p>Open any game and it\'ll show up here. Up to your last 50 plays are remembered locally on this device.</p>';
  if (activeTab === 'recent')   return '<h2>No new games this week.</h2><p>Check back tomorrow — the factory builds one most days.</p>';
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

function card(g, opts) {
  opts = opts || { eager: true, priority: false };
  const c = counts[g.slug] || { likes: 0, dislikes: 0, plays: 0 };
  const myVote = myVotes[g.slug] || null;
  const isRecent = g.addedDate && (Date.now() - new Date(g.addedDate).getTime() < 3 * 24 * 60 * 60 * 1000);
  const variant  = pickVariant(g.slug, g.thumbCount || 1);
  const thumb    = thumbUrl(g.slug, variant);
  const playUrl  = `/play.html?slug=${encodeURIComponent(g.slug)}`;

  // Eager (above-the-fold) cards get the inline autoplay video right away.
  // Lazy cards get a slot div the IntersectionObserver upgrades to a real
  // <video> when the card scrolls into view — keeps initial bandwidth small.
  let mediaInner = '';
  if (g.hasPreview) {
    if (opts.eager) {
      mediaInner = `<video class="card-video" src="/previews/${g.slug}.webm" poster="${thumb}"
                          autoplay loop muted playsinline preload="metadata" aria-hidden="true"></video>`;
    } else {
      mediaInner = `<div class="card-video-slot"
                         data-src="/previews/${g.slug}.webm"
                         data-poster="${thumb}"></div>`;
    }
  }

  // Native lazy-loading + fetchpriority lets the browser sequence requests:
  // first 2 cards = high priority + eager fetch; next 2 = eager but normal;
  // rest = lazy + low-priority background fetch.
  const imgLoading  = opts.eager ? 'eager' : 'lazy';
  const imgPriority = opts.priority ? 'high' : (opts.eager ? 'auto' : 'low');
  const imgDecoding = opts.eager ? 'sync' : 'async';
  const imgTag = `<img class="card-thumb-img" src="${thumb}" alt=""
                       loading="${imgLoading}" fetchpriority="${imgPriority}"
                       decoding="${imgDecoding}">`;

  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.variant = variant;
  if (!opts.eager) el.dataset.lazy = '1';
  el.innerHTML = `
    <div class="card-thumb" data-num="${specimenNum(g)}">
      ${imgTag}
      ${mediaInner}
      ${isRecent ? '<span class="recent-badge">NEW</span>' : ''}
      ${c.plays ? `<span class="play-count">▶ ${c.plays}</span>` : ''}
      ${c.comments ? `<span class="comment-count">💬 ${c.comments}</span>` : ''}
      <a class="lab-link" href="/lab.html?slug=${encodeURIComponent(g.slug)}" title="Build journal" aria-label="Open build journal">📓</a>
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
        <button class="vote comments-open" data-action="comments" aria-label="Read & leave comments">
          💬 <span class="num">${c.comments || 0}</span>
        </button>
        <a class="play-link" href="${playUrl}">▶ Play</a>
      </div>
    </div>
  `;
  el.querySelector('.card-title').textContent = gameTitle(g);
  el.querySelector('.card-hook').textContent  = gameHook(g);

  function goPlay() {
    if ((g.thumbCount || 1) > 1) logVariantClick(g.slug, variant);
    if (window.posthog) posthog.capture('game_card_clicked', { slug: g.slug, game_title: gameTitle(g), source: 'thumbnail' });
    location.href = playUrl;
  }
  el.querySelector('.card-thumb').addEventListener('click', (e) => {
    // The 📓 lab link sits inside .card-thumb — let it navigate without
    // triggering goPlay.
    if (e.target.closest('.lab-link')) return;
    goPlay();
  });
  el.querySelector('.play-link').addEventListener('click', (e) => {
    if ((g.thumbCount || 1) > 1) logVariantClick(g.slug, variant);
    if (window.posthog) posthog.capture('game_card_clicked', { slug: g.slug, game_title: gameTitle(g), source: 'play_link' });
    // let the link navigation proceed
  });
  el.querySelectorAll('.vote').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'comments') {
        openCommentModal(g);
        return;
      }
      vote(g.slug, action, el);
    });
  });
  return el;
}

// ── Comment modal ─────────────────────────────────────────────────────────
// Opens from any card's 💬 button. Reads /api/comments and posts via
// /api/feedback (vote='neutral' so freeform notes don't pollute like/dislike).
const _commentModalState = { slug: null };

function openCommentModal(g) {
  _commentModalState.slug = g.slug;
  const m = document.getElementById('comment-modal');
  if (!m) return;
  document.getElementById('comment-modal-title').textContent = `Comments — ${gameTitle(g)}`;
  document.getElementById('comment-modal-input').value = '';
  document.getElementById('comment-modal-counter').textContent = '0 / 500';
  document.getElementById('comment-modal-submit').disabled = true;
  document.getElementById('comment-modal-list').innerHTML =
    '<div class="comment-modal-empty">Loading…</div>';
  m.classList.remove('hidden');
  m.setAttribute('aria-hidden', 'false');
  loadModalComments(g.slug);
  if (window.posthog) posthog.capture('comments_modal_opened', { slug: g.slug });
}

function closeCommentModal() {
  const m = document.getElementById('comment-modal');
  if (!m) return;
  m.classList.add('hidden');
  m.setAttribute('aria-hidden', 'true');
  _commentModalState.slug = null;
}

function relTimeShort(ts) {
  if (!ts) return '';
  const sec = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return sec + 's ago';
  const min = Math.round(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.round(min / 60);
  if (hr < 24) return hr + 'h ago';
  const d = Math.round(hr / 24);
  return d + 'd ago';
}

function escapeText(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

async function loadModalComments(slug) {
  const list = document.getElementById('comment-modal-list');
  try {
    const r = await fetch(`/api/comments?slug=${encodeURIComponent(slug)}&limit=20`, { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    const d = await r.json();
    const cs = (d && d.comments) || [];
    if (!cs.length) {
      list.innerHTML = '<div class="comment-modal-empty">No comments yet — leave the first one above.</div>';
      return;
    }
    list.innerHTML = cs.map(cm => {
      const emoji = cm.vote === 'like' ? '👍' : cm.vote === 'dislike' ? '👎' : '💬';
      return `<div class="comment-modal-row">
        <div class="vote-emoji">${emoji}</div>
        <div>
          <div>${escapeText(cm.comment)}</div>
          <div class="meta">${escapeText(relTimeShort(cm.ts))}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="comment-modal-empty">Couldn\'t load comments. Try again.</div>';
  }
}

(function wireCommentModal() {
  const m = document.getElementById('comment-modal');
  if (!m) return;
  m.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.close) closeCommentModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !m.classList.contains('hidden')) closeCommentModal();
  });
  const input = document.getElementById('comment-modal-input');
  const counter = document.getElementById('comment-modal-counter');
  const submit = document.getElementById('comment-modal-submit');
  input.addEventListener('input', () => {
    const n = input.value.length;
    counter.textContent = `${n} / 500`;
    submit.disabled = n < 2;
  });
  document.getElementById('comment-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const slug = _commentModalState.slug;
    const text = input.value.trim().slice(0, 500);
    if (!slug || text.length < 2) return;
    submit.disabled = true;
    submit.textContent = '…';
    try {
      const body = JSON.stringify({ slug, vote: 'neutral', comment: text });
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body, keepalive: true,
      });
      // Optimistic local prepend
      const list = document.getElementById('comment-modal-list');
      const empty = list.querySelector('.comment-modal-empty');
      if (empty) list.innerHTML = '';
      list.insertAdjacentHTML('afterbegin',
        `<div class="comment-modal-row">
          <div class="vote-emoji">💬</div>
          <div>
            <div>${escapeText(text)}</div>
            <div class="meta">just now · you</div>
          </div>
        </div>`);
      input.value = '';
      counter.textContent = '0 / 500';
      if (window.posthog) posthog.capture('comment_posted_modal', { slug, length: text.length });
    } catch (err) {
      counter.textContent = 'Error — try again';
    } finally {
      submit.textContent = 'Post';
      submit.disabled = input.value.length < 2;
    }
  });
})();

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
  if (window.posthog) posthog.capture('gallery_vote_cast', { slug, action: next || 'clear', previous_vote: prev });
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
