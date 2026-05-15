// ── State ─────────────────────────────────────────────────────────────────
let games = [];   // from games.json
let counts = {};  // from /api/counts (cumulative all-time)
let todayScores = {}; // from /api/trending — { slug: {seconds, comments, score} }
let myVotes = JSON.parse(localStorage.getItem('myVotes') || '{}');
let me = null;    // { signed_in, email, uid, exp_ts } from /api/me
let metaState = null;           // { tokens, lifetime, streak, ... } from /api/me/meta
let todaysFeaturedSlug = null;  // slug of today's Featured Challenge (banner only — corner badge TBD)
let activeTab = 'top';
let activeGenre = 'all';
let searchTerm = '';

// ── Pagination ───────────────────────────────────────────────────────────
// 30 cards per page. Current page is mirrored in ?page=N so it survives
// reloads + browser back. Page resets to 1 whenever the user changes the
// filter set (tab / genre / search), so it never leaves them on a page
// number that's now empty.
const PAGE_SIZE = 30;
// First chunk paints synchronously with eager images + autoplay videos
// (above-the-fold). Subsequent chunks paint one per idle frame, each with
// lazy images + IntersectionObserver-hydrated videos — so a 30-card page
// hands the user something in <16ms and finishes paint in ~5 idle frames.
const CHUNK_SIZE = 6;
let currentPage = readPageFromUrl();
function readPageFromUrl() {
  const n = parseInt(new URLSearchParams(location.search).get('page') || '1', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
function setPageInUrl(n) {
  const url = new URL(location.href);
  if (n <= 1) url.searchParams.delete('page');
  else url.searchParams.set('page', String(n));
  history.replaceState(null, '', url.toString());
}
function resetPage() {
  if (currentPage !== 1) {
    currentPage = 1;
    setPageInUrl(1);
  }
}

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

const grid       = document.getElementById('grid');
const empty      = document.getElementById('empty');
const tabs       = document.getElementById('tabs');
const genres     = document.getElementById('genres');
const featured   = document.getElementById('featured');
const search     = document.getElementById('search');
const pagination = document.getElementById('pagination');

// ── Boot ──────────────────────────────────────────────────────────────────
init();

async function init() {
  // Fire all four network calls in parallel so first paint can happen
  // as soon as games.json lands instead of waiting for the sum of four
  // sequential round-trips. On a 400 ms RTT this drops time-to-first-card
  // from ~1.6 s of pure blocking to ~400 ms.
  //
  // Critical: games.json. The grid needs the catalogue to render at all.
  // Secondary: counts (vote/play numbers + Top-tab sort) and trending
  // (featured-game pick). The grid does its first paint with empty
  // numbers, then a second render swaps in real counts + the correct
  // featured game once both land. Cards' thumbs are HTTP-cached after
  // first paint, so the second render is visually subtle, not a refetch.
  // Independent: /api/me drives the sign-in pill — repaints when ready.
  const gamesP    = fetch('/games.json', { cache: 'no-store' })
                      .then(r => r.ok ? r.json() : [])
                      .catch(() => []);
  const countsP   = fetch('/api/counts', { cache: 'no-store' })
                      .then(r => r.ok ? r.json() : {})
                      .catch(() => ({}));
  const trendingP = fetch('/api/trending', { cache: 'no-store' })
                      .then(r => r.ok ? r.json() : { games: {} })
                      .catch(() => ({ games: {} }));
  const meP       = fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' })
                      .then(r => r.ok ? r.json() : null)
                      .catch(() => null);
  const metaP     = fetch('/api/me/meta', { cache: 'no-store', credentials: 'same-origin' })
                      .then(r => r.ok ? r.json() : null)
                      .catch(() => null);
  const featuredP = fetch('/api/featured', { cache: 'no-store' })
                      .then(r => r.ok ? r.json() : null)
                      .catch(() => null);

  // FIRST PAINT — block only on the catalogue.
  games = await gamesP;

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

  // SECOND PAINT — vote counts + featured game. We wait for BOTH so the
  // second render is the final state; a third render would just churn DOM.
  Promise.all([countsP, trendingP]).then(([c, t]) => {
    counts = c || {};
    todayScores = (t && t.games) || {};
    render();
  });

  // Auth pill — independent of the grid, paints whenever /api/me resolves.
  meP.then(m => {
    me = m;
    paintAuthPill();
    if (me && me.signed_in && window.posthog) {
      posthog.identify(me.uid, { email: me.email });
    }
  });

  // Meta-layer pill (tokens + streak). Repaints as soon as /api/me/meta lands.
  metaP.then(m => {
    if (!m) return;
    metaState = m;
    paintMetaPill(m);
    showMetaWelcomePops(m);
  });

  // Featured Challenge — /api/featured returns today's 2× tokens slug. We
  // store it so renderFeatured() can swap the hero badge from generic
  // "🔥 Trending" to "⭐ FEATURED TODAY · 2× TOKENS" when the slugs match.
  featuredP.then(f => {
    if (!f || !f.slug) return;
    todaysFeaturedSlug = f.slug;
    render();
  });
}


function paintMetaPill(m) {
  const pill   = document.getElementById('meta-pill');
  const tokens = document.getElementById('meta-pill-tokens');
  const streak = document.getElementById('meta-pill-streak');
  if (!pill) return;
  if (tokens) tokens.textContent = '🪙 ' + (m.tokens | 0);
  if (streak) {
    const s = m.streak | 0;
    if (s > 1) {
      streak.hidden = false;
      streak.textContent = '🔥 ' + s;
    } else {
      streak.hidden = true;
    }
  }
  pill.hidden = false;
}

function showMetaWelcomePops(m) {
  // Pop the daily-login and any milestone bonuses with a tiny floater.
  if (!m.newlyGranted) return;
  const pill = document.getElementById('meta-pill-tokens');
  if (!pill) return;
  if (m.newlyGranted.login) {
    pill.classList.add('pop');
    setTimeout(() => pill.classList.remove('pop'), 700);
  }
  if (m.newlyGranted.milestones && m.newlyGranted.milestones.length) {
    for (const ms of m.newlyGranted.milestones) {
      // Lightweight toast — reuse the gallery's posthog capture so the
      // event is searchable, then just log a console-friendly mark.
      if (window.posthog) posthog.capture('streak_milestone', { day: ms.day, bonus: ms.bonus });
    }
  }
}

async function openLeaderboard() {
  const panel = document.getElementById('lb-panel');
  const body  = document.getElementById('lb-body');
  if (!panel || !body) return;
  panel.classList.add('visible');
  panel.setAttribute('aria-hidden', 'false');
  body.innerHTML = '<div class="lb-empty">Loading top players…</div>';
  let data;
  try {
    const r = await fetch('/api/leaderboard?limit=30', { cache: 'no-store' });
    data = r.ok ? await r.json() : null;
  } catch (_) { /* swallow */ }
  if (!data || !data.players || !data.players.length) {
    body.innerHTML = '<div class="lb-empty">No players yet. Play a game to start earning tokens.</div>';
    return;
  }
  // Server returns shortHash(uid); compute the same hash locally so we can
  // highlight "you" on the board without ever sending the raw uid back.
  const myUidRaw = (window.IDENTITY && window.IDENTITY.uid) || '';
  const myHash = shortHashLocal(myUidRaw);
  body.innerHTML = '';
  data.players.forEach((p, i) => {
    const rank = (i + 1).toString().padStart(2, '0');
    const isMe = p.uid === myHash;
    const safeUid = String(p.uid || '').replace(/[^a-z0-9-]/gi, '').slice(0, 8);
    const row = document.createElement('div');
    row.className = 'lb-row' + (isMe ? ' me' : '');
    const rkEl = document.createElement('span');
    rkEl.className = 'lb-rank';
    rkEl.textContent = '#' + rank;
    const nmEl = document.createElement('span');
    nmEl.className = 'lb-name';
    nmEl.textContent = safeUid + (isMe ? ' (you)' : '');
    const scEl = document.createElement('span');
    scEl.className = 'lb-score';
    scEl.textContent = '🪙 ' + (p.lifetime | 0);
    if (p.streak > 1) {
      const stEl = document.createElement('span');
      stEl.className = 'lb-streak';
      stEl.textContent = '🔥' + (p.streak | 0);
      scEl.appendChild(stEl);
    }
    row.appendChild(rkEl);
    row.appendChild(nmEl);
    row.appendChild(scEl);
    body.appendChild(row);
  });
}

function closeLeaderboard() {
  const panel = document.getElementById('lb-panel');
  if (!panel) return;
  panel.classList.remove('visible');
  panel.setAttribute('aria-hidden', 'true');
}

// Mirror of leaderboard.js shortHash — keep these two in sync.
function shortHashLocal(s) {
  s = String(s || '');
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
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
    // Sign-in CTA hidden from gallery home (Tim 2026-05-15) — accounts work
    // but we're not promoting them yet. Keep the signed-in pill so anyone
    // already logged in can still see who they are + sign out.
    link.style.display = 'none';
    user.style.display = 'none';
  }
}

// Debounce helper for search tracking — avoids an event per keystroke.
let _searchDebounce = null;

function attachEvents() {
  // Meta-layer: leaderboard drawer toggle.
  const boardBtn = document.getElementById('meta-pill-board');
  const closeBtn = document.getElementById('lb-close');
  if (boardBtn) boardBtn.addEventListener('click', openLeaderboard);
  if (closeBtn) closeBtn.addEventListener('click', closeLeaderboard);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const panel = document.getElementById('lb-panel');
    if (panel && panel.classList.contains('visible')) closeLeaderboard();
  });

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    resetPage();
    if (window.posthog) posthog.capture('tab_changed', { tab: activeTab });
    render();
  });
  genres.addEventListener('click', (e) => {
    const btn = e.target.closest('.genre');
    if (!btn) return;
    document.querySelectorAll('.genre').forEach(g => g.classList.remove('active'));
    btn.classList.add('active');
    activeGenre = btn.dataset.genre;
    resetPage();
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
    resetPage();
    render();
  });
  if (pagination) {
    pagination.addEventListener('click', (e) => {
      const btn = e.target.closest('.pg-btn');
      if (!btn || btn.disabled || btn.classList.contains('pg-gap')) return;
      const p = parseInt(btn.dataset.page, 10);
      if (!Number.isFinite(p) || p === currentPage) return;
      currentPage = p;
      setPageInUrl(p);
      if (window.posthog) posthog.capture('gallery_page_changed', { page: p });
      // Cards are positioned below the tabs, so scroll back to the top of
      // the grid section instead of the page top — keeps tabs in view.
      const top = grid.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      render();
    });
  }
  window.addEventListener('popstate', () => {
    const next = readPageFromUrl();
    if (next !== currentPage) {
      currentPage = next;
      render();
    }
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
// Tracks the IntersectionObserver across renders so paginating away mid-paint
// doesn't leak observers watching cards that no longer exist.
let _lazyObserver = null;

function render() {
  const featuredSlug = renderFeatured();
  let list = visible();
  if (featuredSlug) list = list.filter(g => g.slug !== featuredSlug);

  // Clamp current page to the filtered list size — if a user lands on
  // ?page=7 but only 2 pages exist, paginate them back to the last page
  // instead of showing an empty grid.
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (currentPage > totalPages) {
    currentPage = totalPages;
    setPageInUrl(currentPage);
  }
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageList = list.slice(start, start + PAGE_SIZE);

  // Tear down any prior observer + clear the grid before repainting.
  if (_lazyObserver) { _lazyObserver.disconnect(); _lazyObserver = null; }
  grid.innerHTML = '';

  if (list.length === 0) {
    empty.classList.remove('hidden');
    empty.innerHTML = emptyMessage();
    renderPagination(0);
    return;
  }
  empty.classList.add('hidden');

  // Progressive paint in CHUNK_SIZE batches:
  //   - Chunk 0 renders synchronously, eager images + autoplay videos +
  //     fetchpriority="high" on the first 2 thumbs → visible area is
  //     interactive in <16ms.
  //   - Subsequent chunks paint one per requestIdleCallback frame with
  //     lazy images + video slots that hydrate per IntersectionObserver
  //     when they scroll into view.
  // Without this, the browser tries to fetch all 30 thumbs at once and
  // the slow-network user sees a 1-2s blank grid even though the WebP
  // savings dropped the total bytes 6×.
  const first = pageList.slice(0, CHUNK_SIZE);
  for (let i = 0; i < first.length; i++) {
    grid.appendChild(card(first[i], { eager: true, priority: i < 2 }));
  }
  const rest = pageList.slice(CHUNK_SIZE);
  paintChunks(rest, () => hydrateLazyVideos());
  renderPagination(totalPages);
}

function paintChunks(rest, done) {
  if (rest.length === 0) { done(); return; }
  let cursor = 0;
  const step = () => {
    const slice = rest.slice(cursor, cursor + CHUNK_SIZE);
    if (slice.length === 0) { done(); return; }
    const frag = document.createDocumentFragment();
    for (const g of slice) {
      frag.appendChild(card(g, { eager: false, priority: false }));
    }
    grid.appendChild(frag);
    cursor += CHUNK_SIZE;
    if (cursor < rest.length) schedule(step);
    else done();
  };
  schedule(step);
}

function schedule(fn) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 200 });
  else setTimeout(fn, 16);
}

function hydrateLazyVideos() {
  if (!('IntersectionObserver' in window)) return;
  _lazyObserver = new IntersectionObserver((entries) => {
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
      _lazyObserver.unobserve(ent.target);
    }
  }, { rootMargin: '160px 0px' });
  grid.querySelectorAll('.card[data-lazy="1"]').forEach(c => _lazyObserver.observe(c));
}

function renderPagination(totalPages) {
  if (!pagination) return;
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    pagination.classList.add('hidden');
    return;
  }
  pagination.classList.remove('hidden');
  const parts = [];
  const prevDisabled = currentPage === 1 ? 'disabled' : '';
  const nextDisabled = currentPage === totalPages ? 'disabled' : '';
  parts.push(`<button class="pg-btn pg-prev" data-page="${Math.max(1, currentPage - 1)}" ${prevDisabled} aria-label="Previous page">‹ Prev</button>`);
  for (const p of pageWindow(currentPage, totalPages)) {
    if (p === '…') {
      parts.push(`<span class="pg-gap" aria-hidden="true">…</span>`);
    } else {
      const active = p === currentPage ? 'active' : '';
      const ariaCurrent = p === currentPage ? 'aria-current="page"' : '';
      parts.push(`<button class="pg-btn pg-num ${active}" data-page="${p}" ${ariaCurrent}>${p}</button>`);
    }
  }
  parts.push(`<button class="pg-btn pg-next" data-page="${Math.min(totalPages, currentPage + 1)}" ${nextDisabled} aria-label="Next page">Next ›</button>`);
  pagination.innerHTML = parts.join('');
}

// Compact page window: always include first/last + neighbors of current,
// fill the rest with … gaps. e.g. 10 pages on page 5 → [1, …, 4, 5, 6, …, 10].
// Returns a mix of numbers and '…' literals.
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...keep].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
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
  // Featured runs only on the default top-rated tab with no filters/search.
  // The hero is painted only on page 1 (it's the headline above the grid),
  // but we still compute the slug on pages 2+ so render() can dedupe it
  // from the grid — otherwise the featured game would re-appear as a
  // regular card on a later page.
  if (activeTab !== 'top' || activeGenre !== 'all' || searchTerm) {
    featured.classList.add('hidden');
    featured.innerHTML = '';
    return null;
  }
  const eligible = games.filter(g => g.published !== false);
  if (eligible.length < 2) { featured.classList.add('hidden'); return null; }

  // Net-negative games never get featured. The today-score (seconds +
  // comments × 60) doesn't penalise dislikes or sentiment, so a single
  // complaint comment + downvote can launch a brand-new game to the top
  // of "trending". Filter at the candidate pool so every tier respects it.
  // Tim flagged a 1-dislike-1-comment game getting featured on 2026-05-11.
  const netVote = (g) => {
    const c = counts[g.slug] || {};
    return (c.likes || 0) - (c.dislikes || 0);
  };
  const featurable = eligible.filter(g => netVote(g) >= 0);
  if (featurable.length < 2) { featured.classList.add('hidden'); return null; }

  // Trending = top engagement TODAY (per-day seconds + comments × 60).
  // Falls through to all-time engagement if today's signal is empty (e.g.
  // first visitor of the day before any heartbeat lands), then to newest.
  const todayScore = (g) => (todayScores[g.slug] && todayScores[g.slug].score) || 0;
  const sortedToday = featurable.slice().sort((a, b) => todayScore(b) - todayScore(a));
  const todayTop   = sortedToday[0];
  const todayBest  = todayTop ? todayScore(todayTop) : 0;

  let game, topScore;
  if (todayBest > 0) {
    game = todayTop;
    topScore = todayBest;
  } else {
    const sortedAll = featurable.slice().sort((a, b) => engagementScore(b) - engagementScore(a));
    const allTop = sortedAll[0];
    if (allTop && engagementScore(allTop) > 0) {
      game = allTop;
      topScore = engagementScore(allTop);
    } else {
      game = featurable.slice().sort((a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0))[0];
      topScore = 0;
    }
  }

  // Past page 1 the hero is hidden, but the slug we just picked still needs
  // to flow back to render() so it gets removed from the grid slice on
  // later pages too.
  if (currentPage !== 1) {
    featured.classList.add('hidden');
    featured.innerHTML = '';
    return game.slug;
  }

  const c = counts[game.slug] || { likes: 0, dislikes: 0, plays: 0, seconds: 0 };
  const minutes = Math.round((c.seconds || 0) / 60);
  const playUrl = `/play.html?slug=${encodeURIComponent(game.slug)}`;

  // image-set() lets the browser pick WebP when supported and fall back
  // to PNG otherwise — same trick <picture> uses for the grid thumbs,
  // but expressed as a CSS background since hero is a tinted block, not
  // a content image.
  const heroBg = `image-set(url('/thumbs/${game.slug}.webp?v=2') type('image/webp'), url('/thumbs/${game.slug}.png?v=2') type('image/png'))`;
  // Badge: if today's daily-featured slug (2× tokens) matches the hero
  // pick, surface the FEATURED TODAY marker right here instead of running
  // a duplicate banner up top. Otherwise fall back to the generic
  // trending / featured pill.
  const isFeaturedToday = todaysFeaturedSlug && todaysFeaturedSlug === game.slug;
  const badgeText = isFeaturedToday
    ? '⭐ FEATURED TODAY · 2× TOKENS'
    : (topScore > 0 ? '🔥 Trending' : '✨ Featured');
  const badgeClass = isFeaturedToday ? 'hero-badge hero-badge-featured' : 'hero-badge';
  featured.innerHTML = `
    <article class="hero">
      <div class="hero-thumb" style="background-image: -webkit-${heroBg}; background-image: ${heroBg};"></div>
      <div class="hero-content">
        <div class="${badgeClass}">${badgeText}</div>
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
    ? `/thumbs/${slug}__v${variant}.png?v=2`
    : `/thumbs/${slug}.png?v=2`;
}

// Sibling WebP path. build_webp_thumbs.sh emits one .webp per .png in
// Gallery/thumbs/, served via <picture><source type="image/webp"> with the
// PNG as fallback for the ~3% of browsers that don't support WebP.
function thumbWebpUrl(slug, variant) {
  return variant > 1
    ? `/thumbs/${slug}__v${variant}.webp?v=2`
    : `/thumbs/${slug}.webp?v=2`;
}

function card(g, opts) {
  opts = opts || { eager: true, priority: false };
  const c = counts[g.slug] || { likes: 0, dislikes: 0, plays: 0 };
  const myVote = myVotes[g.slug] || null;
  const isRecent = g.addedDate && (Date.now() - new Date(g.addedDate).getTime() < 3 * 24 * 60 * 60 * 1000);
  const variant  = pickVariant(g.slug, g.thumbCount || 1);
  const thumb    = thumbUrl(g.slug, variant);
  const thumbWebp = thumbWebpUrl(g.slug, variant);
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
  // rest = lazy + low-priority background fetch. <picture> serves WebP
  // (5-8× smaller than PNG) to every modern browser, with PNG fallback
  // for the ~3% that don't support WebP.
  const imgLoading  = opts.eager ? 'eager' : 'lazy';
  const imgPriority = opts.priority ? 'high' : (opts.eager ? 'auto' : 'low');
  const imgDecoding = opts.eager ? 'sync' : 'async';
  const imgTag = `<picture>
                    <source srcset="${thumbWebp}" type="image/webp">
                    <img class="card-thumb-img" src="${thumb}" alt=""
                         loading="${imgLoading}" fetchpriority="${imgPriority}"
                         decoding="${imgDecoding}">
                  </picture>`;

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
      // If the user just up-voted for the first time on this slug, refetch
      // their meta state so the token pill updates instantly. The +5 grant
      // is one-shot per (uid, slug) — repeat votes don't earn — but a stale
      // pill never under-shows reality.
      if (next === 'like') refreshMetaPill();
    }
  } catch (e) { /* offline-tolerant */ }
}

async function refreshMetaPill() {
  try {
    const r = await fetch('/api/me/meta', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) return;
    const m = await r.json();
    const before = metaState ? (metaState.tokens | 0) : 0;
    metaState = m;
    paintMetaPill(m);
    if ((m.tokens | 0) > before) {
      const pill = document.getElementById('meta-pill-tokens');
      if (pill) {
        pill.classList.add('pop');
        setTimeout(() => pill.classList.remove('pop'), 700);
      }
    }
  } catch (_) { /* tolerate */ }
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
