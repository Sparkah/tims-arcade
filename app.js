// ── State ─────────────────────────────────────────────────────────────────
let games = [];   // from games.json
let hiddenSlugs = new Set();   // admin-hidden slugs (low-quality, curated out of the grid)
let counts = {};  // from /api/counts (cumulative all-time)
let todayScores = {}; // from /api/trending — { slug: {seconds, comments, score} }
let myVotes = JSON.parse(localStorage.getItem('myVotes') || '{}');
// Slugs voted on THIS page load — the late /api/counts paint must not clobber
// the optimistic/server-corrected numbers for them (counts is 60s edge-cached).
let votedSlugsThisSession = new Set();
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
  // Two-request first paint: games.json (the catalogue) + /api/boot (counts +
  // trending + featured in ONE response, KV-snapshot backed + edge-cached).
  // First paint WAITS for boot — bounded by BOOT_WAIT_MS — so the hero is the
  // real trending game, cards carry real like/comment numbers, and the Top
  // sort is final from frame one. The old flow painted with zeros and
  // re-sorted when counts/trending landed seconds later — the visible
  // hero-swap + grid shuffle Tim flagged 2026-06-12.
  //
  // Degradation ladder: boot slow → paint without it, apply when it lands
  // (one refinement render, the pre-2026-06-12 behavior). Boot failed →
  // fall back to the individual counts/trending/featured endpoints.
  // Independent either way: /api/me + /api/me/meta (auth/meta pills),
  // /api/hidden (curation filter, fail-closed via localStorage).
  const BOOT_WAIT_MS = 1500;
  const gamesP    = fetch('/games.json', { cache: 'no-store' })
                      .then(r => r.ok ? r.json() : [])
                      .catch(() => []);
  const bootP     = fetch('/api/boot', { cache: 'no-store' })
                      .then(r => r.ok ? r.json() : null)
                      .catch(() => null);
  const meP       = fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' })
                      .then(r => r.ok ? r.json() : null)
                      .catch(() => null);
  const metaP     = fetch('/api/me/meta', { cache: 'no-store', credentials: 'same-origin' })
                      .then(r => r.ok ? r.json() : null)
                      .catch(() => null);
  // Admin-hidden (low-quality) slugs curated out of the public grid. Fetched in
  // parallel so the filter below rarely adds latency and never blocks paint.
  const hiddenP   = fetch('/api/hidden', { cache: 'no-store' })
                      .then(r => r.ok ? r.json() : null)
                      .catch(() => null);

  // FIRST PAINT — block only on the catalogue.
  games = await gamesP;

  // Drop hidden games from the public catalogue before anything renders, so the
  // grid, search, and genre counts all operate on the visible set. The set is
  // cached to localStorage so a transient /api/hidden failure FAILS CLOSED (uses
  // the last known hidden set) instead of resurfacing hidden games.
  try {
    let list = null;
    const hid = await hiddenP;
    if (hid && Array.isArray(hid.hidden)) {
      list = hid.hidden;
      try { localStorage.setItem('gf_hidden', JSON.stringify(list)); } catch (e) { /* private mode */ }
    } else {
      try { const c = JSON.parse(localStorage.getItem('gf_hidden') || '[]'); if (Array.isArray(c)) list = c; } catch (e) { /* ignore */ }
    }
    if (list && list.length) {
      hiddenSlugs = new Set(list);
      games = games.filter(g => !hiddenSlugs.has(g.slug));
    }
  } catch (e) { /* hidden filter is best-effort — never block the grid */ }

  attachEvents();
  renderGenres();

  // Honour ?q=... from URL — wires the SearchAction in JSON-LD into the
  // actual search input so external links / Google sitelinks searchbox
  // land on a pre-filtered grid instead of the unfiltered homepage.
  try {
    const q = new URLSearchParams(location.search).get('q');
    if (q) {
      const trimmed = q.trim().toLowerCase().slice(0, 80);
      if (trimmed) {
        searchTerm = trimmed;
        if (search) search.value = trimmed;
      }
    }
  } catch (e) { /* malformed URL — ignore */ }

  // Boot gate — wait (bounded) for the combined payload so the FIRST paint
  // is the correct one. Race resolves: object = boot landed, null = boot
  // FAILED fast, undefined = still in flight at the deadline.
  const boot = await Promise.race([
    bootP,
    new Promise(res => setTimeout(() => res(undefined), BOOT_WAIT_MS)),
  ]);
  if (boot) applyBoot(boot);

  render();

  // Hidden Gems shelf - the least-attention tail surfaced as a discovery
  // section below the grid. The fetch is deferred until the visitor scrolls
  // near the footer, so the homepage critical path never pays for it.
  setupGemsLazyLoad();

  if (boot) {
    // Painted correct already. Featured pick can be absent early in the UTC
    // day (nothing cached yet) — resolve it async; it only swaps badge text.
    if (!boot.featured) fetchFeaturedAsync();
  } else if (boot === null) {
    legacyRefine();
  } else {
    bootP.then(b => {
      if (b) {
        applyBoot(b);
        render();
        if (!b.featured) fetchFeaturedAsync();
      } else {
        legacyRefine();
      }
    });
  }

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

}

// Fold a /api/boot payload into render state. Counts go through the same
// vote shields as the old /api/counts fetch — the snapshot can be minutes
// old, and a fresh vote must never be repainted over.
function applyBoot(b) {
  counts = mergeFreshVoteState((b && b.counts) || {});
  todayScores = (b && b.trending && b.trending.games) || {};
  const f = b && b.featured;
  if (f && !hiddenSlugs.has(f)) todaysFeaturedSlug = f;  // hidden wins over featured
}

// Featured Challenge — /api/featured returns today's 2× tokens slug (and
// CREATES the day's pick when none exists yet). renderFeatured() swaps the
// hero badge from generic "🔥 Trending" to "⭐ FEATURED TODAY · 2× TOKENS"
// when the slugs match. Called only when boot didn't already carry the pick.
function fetchFeaturedAsync() {
  fetch('/api/featured', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null)
    .then(f => {
      if (!f || !f.slug) return;
      if (hiddenSlugs.has(f.slug)) return;   // hidden wins over featured — never badge a hidden game
      if (todaysFeaturedSlug === f.slug) return;
      todaysFeaturedSlug = f.slug;
      render();
    });
}

// Pre-boot fallback: /api/boot unavailable (failed request, old function
// cache mid-deploy) — fetch counts + trending individually and refine in a
// second render, exactly the pre-2026-06-12 flow.
function legacyRefine() {
  const countsP   = fetch('/api/counts', { cache: 'no-store' })
                      .then(r => r.ok ? r.json() : {})
                      .catch(() => ({}));
  const trendingP = fetch('/api/trending', { cache: 'no-store' })
                      .then(r => r.ok ? r.json() : { games: {} })
                      .catch(() => ({ games: {} }));
  Promise.all([countsP, trendingP]).then(([c, t]) => {
    counts = mergeFreshVoteState(c || {});
    todayScores = (t && t.games) || {};
    render();
  });
  fetchFeaturedAsync();
}


let lastMeta = {};

function paintMetaPill(m) {
  lastMeta = m || {};
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
  // Tag the body so the meta-pill (tokens/streak/board) drops BELOW the signed-in
  // auth pill instead of overlapping it — both sit top-right. (Tim 2026-05-29)
  document.body.classList.toggle('is-signed-in', !!(me && me.signed_in));
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

  // Token explainer popover (tap the 🪙 balance) - answers "why do I need tokens".
  const GEN_COST  = 60;
  const tokTokens = document.getElementById('meta-pill-tokens');
  const tokPop    = document.getElementById('token-pop');
  const tokPopX   = document.getElementById('token-pop-x');
  function renderTokenPop() {
    const t = lastMeta.tokens | 0;
    const fill = document.getElementById('token-pop-fill');
    const txt  = document.getElementById('token-pop-prog-txt');
    if (fill) fill.style.width = Math.min(100, Math.round(t / GEN_COST * 100)) + '%';
    if (txt) {
      if (t >= GEN_COST) txt.textContent = t + ' / ' + GEN_COST + ' - you can make a game now';
      else {
        const need = GEN_COST - t;
        txt.textContent = t + ' / ' + GEN_COST + ' - ' + need + ' to go (play ' + need + ' min or rate ' + Math.ceil(need / 5) + ' games)';
      }
    }
  }
  if (tokTokens && tokPop) {
    tokTokens.style.cursor = 'pointer';
    tokTokens.addEventListener('click', (e) => {
      e.stopPropagation();
      const show = tokPop.hidden;
      if (show) renderTokenPop();
      tokPop.hidden = !show;
      const hint = document.getElementById('token-hint');
      if (hint) hint.hidden = true;
      try { localStorage.setItem('tokenHintSeen', '1'); } catch (_) {}
    });
    if (tokPopX) tokPopX.addEventListener('click', () => { tokPop.hidden = true; });
    document.addEventListener('click', (e) => {
      if (!tokPop.hidden && !tokPop.contains(e.target) && e.target !== tokTokens && !tokTokens.contains(e.target)) tokPop.hidden = true;
    });
  }
  // First-visit nudge pointing at the balance (once per browser).
  try {
    if (!localStorage.getItem('tokenHintSeen')) {
      const hint = document.getElementById('token-hint');
      if (hint) { hint.hidden = false; setTimeout(() => { hint.hidden = true; }, 6000); }
    }
  } catch (_) {}
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
  if (distinct.length <= 1) { genres.replaceChildren(); return; }

  // Order: all first, then by frequency desc
  const ordered = ['all', ...distinct.sort((a, b) => counts[b] - counts[a])];
  const frag = document.createDocumentFragment();
  for (const g of ordered) {
    const btn = document.createElement('button');
    btn.className = `genre ${g === activeGenre ? 'active' : ''}`;
    btn.dataset.genre = g;
    btn.appendChild(document.createTextNode(g === 'all' ? 'All genres' : g));
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = counts[g];
    btn.appendChild(count);
    frag.appendChild(btn);
  }
  genres.replaceChildren(frag);
}

// ── Filtering / sorting ───────────────────────────────────────────────────

// TikTok-style EXPLORATION INJECTION (Tim 2026-05-31).
// The Top feed used to be strict engagement-desc order, so a brand-new game
// (seconds≈0, no votes → engagementScore≈0) sank to the bottom and never got
// the impressions it needs to EARN engagement — a rich-get-richer cold start.
// TikTok solves this by spending impressions to TEST fresh content: between
// proven hits it injects under-exposed items, rotated per viewer, and promotes
// whatever converts. We mirror that on the Top feed: every EXPLORE_CADENCE-th
// grid slot is an under-seen game (plays < EXPLORE_PLAY_CAP), shuffled per
// pageview so different fresh games get a "test audience" slot. Pattern at
// cadence 3 → [proven, proven, explore, proven, proven, explore, …].
// Kill switch: append ?feed=classic to fall back to pure engagement order.
const EXPLORE_CADENCE  = 3;    // inject at every 3rd grid slot → "2 proven + 1 fresh"
const EXPLORE_PLAY_CAP = 15;   // < this many plays = under-seen, hasn't had its test
const EXPLORE_MAX      = 5;    // CAP exploration at 5 slots so the rest of the feed
                               // stays proven engagement-ranked content, NOT a random
                               // low-rated tail (95 games / 91 under-cap / 42 net-neg)
const EXPLORE_WINDOW   = 12;   // rotate fresh slots among the 12 NEWEST eligible games
                               // so exploration prefers new over stale long-tail
const EXPLORE_FEED = new URLSearchParams(location.search).get('feed') !== 'classic';
// One seed per pageview: keeps the rotation STABLE across the many re-renders
// (counts / trending / featured each trigger render()) but fresh on each visit.
const _exploreSeed = Math.floor(Math.random() * 4294967296) >>> 0;
function _seededShuffle(arr, seed) {
  let a = seed >>> 0;                        // mulberry32 → deterministic per seed
  const rnd = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
// Reorder a by-engagement list into explore-injected order. Pure function of
// (ranked, counts, seed). Flagship link-outs are left for the flagship splice
// below, so they're excluded from the explore pool here.
function interleaveExploration(ranked) {
  // Before /api/counts lands, every play count is 0 → don't reshuffle on first
  // paint; show the base order and let the re-render (once counts arrive) inject.
  if (Object.keys(counts).length === 0) return ranked;
  const stat  = g => counts[g.slug] || {};
  const plays = g => stat(g).plays || 0;
  const net   = g => (stat(g).likes || 0) - (stat(g).dislikes || 0);
  // Exploration pool: under-seen AND NOT net-negative — never PROMOTE a disliked
  // game into a prime slot (it still appears in its low ranked position in the
  // backbone). Newest first so fresh games beat stale long-tail; then rotate per
  // pageview within the newest window and CAP the count, so the rest of the feed
  // stays proven engagement-ranked content rather than a random low-rated tail.
  const pool = ranked
    .filter(g => !g.flagship && plays(g) < EXPLORE_PLAY_CAP && net(g) >= 0)
    .sort((a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0));
  const fresh = _seededShuffle(pool.slice(0, EXPLORE_WINDOW), _exploreSeed).slice(0, EXPLORE_MAX);
  if (fresh.length === 0) return ranked;             // nothing fresh + non-negative → unchanged
  const freshSet = new Set(fresh.map(g => g.slug));
  const backbone = ranked.filter(g => !freshSet.has(g.slug));  // full ranked order, minus injected
  const out = [];
  let bi = 0, ei = 0;
  for (let slot = 0; bi < backbone.length || ei < fresh.length; slot++) {
    const exploreSlot = (slot + 1) % EXPLORE_CADENCE === 0;
    if (exploreSlot && ei < fresh.length) out.push(fresh[ei++]);
    else if (bi < backbone.length)        out.push(backbone[bi++]);
    else                                  out.push(fresh[ei++]);  // backbone exhausted (tiny catalog)
  }
  return out;
}

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
    // Canonical engagement = seconds + net*5 (see engagementScore +
    // _lib/engagement.js). Was netScore (votes only), which dropped the
    // load-bearing play-time signal the formula is built around.
    list.sort((a, b) => engagementScore(b) - engagementScore(a));
  } else {
    // 'all' — newest first by default
    list.sort((a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0));
  }

  // Flagship cross-platform showcase games (merge_conquest/merge_guns, live on
  // Yandex/CG) are link-OUTS. Pinning them to the very top pushed native playable
  // games out of the first row and sent users off-site immediately. Interleave
  // them deeper instead — ~position 5, then 15 — so local games lead but the
  // showcases still get prominent exposure. Personal tabs (liked/myplayed) and
  // the date-filtered 'recent' tab are left alone.

  // TikTok-style exploration injection on the Top feed (helpers above). Only the
  // Top tab (the default landing) is strict-ranked and needs it; All is already
  // newest-first and search wants relevance. Runs BEFORE the flagship splice so
  // flagships still land at pos 5/15.
  if (activeTab === 'top' && !searchTerm && EXPLORE_FEED) {
    list = interleaveExploration(list);
  }

  if (activeTab === 'all' || activeTab === 'top') {
    const flags = list.filter(g => g.flagship);
    if (flags.length) {
      list = list.filter(g => !g.flagship);
      // One showcase per ~10 cards: positions 5, 15, 25, 35 … (0-indexed 4 + i*10).
      // Scales to any number of flagships; clamps to the end on short lists.
      flags.forEach((g, i) => {
        const at = Math.min(4 + i * 10, list.length);
        list.splice(at, 0, g);
      });
    }
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
// Bumped on every render() so deferred paintChunks() callbacks from a prior
// render detect they've been superseded and stop appending stale cards into
// the freshly-cleared grid (counts/trending/featured each trigger a render).
let _renderGen = 0;

function render() {
  const gen = ++_renderGen;
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
    renderGems();
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
  paintChunks(rest, () => hydrateLazyVideos(), gen);
  renderPagination(totalPages);
  renderGems();
}

function paintChunks(rest, done, gen) {
  if (rest.length === 0) { done(); return; }
  let cursor = 0;
  const step = () => {
    // A newer render() superseded us — drop these stale chunks instead of
    // appending them into the grid the new render already cleared+repainted.
    if (gen !== _renderGen) return;
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
  // CANONICAL FORMULA — MIRROR of Gallery/functions/_lib/engagement.js.
  // When changing this, update that file AND
  // Shared/skills/game-factory/tools/eligibility_check.sh AND
  // Knowledge/Operations/Engagement Formula.md.
  //
  // engagement = seconds + (likes - dislikes) * 5
  //
  // History: 2026-05-19 unified. Previously this was
  // (minutes*3 + plays + net*5), which weighted clicks vs depth differently
  // from the factory's iteration ranker and produced drift in "Top Rated".
  const c = counts[g.slug] || {};
  const seconds = c.seconds || 0;
  const net = (c.likes || 0) - (c.dislikes || 0);
  return seconds + net * 5;
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
      // counts/trending not loaded yet (first paint) or no engagement signal —
      // reuse the last scored pick (localStorage) so the hero doesn't flash-swap
      // when scores land; the post-hydration pick is almost always the same game.
      let cached = null;
      try { const s = localStorage.getItem('gf_featured'); if (s) cached = featurable.find(g => g.slug === s); } catch (e) {}
      game = cached || featurable.slice().sort((a, b) => new Date(b.addedDate || 0) - new Date(a.addedDate || 0))[0];
      topScore = 0;
    }
  }

  // Remember a real (scored) pick so the NEXT first paint can show it instantly
  // (consumed by the fallback branch above) — kills the hero flash-swap on revisit.
  if (topScore > 0) { try { localStorage.setItem('gf_featured', game.slug); } catch (e) {} }

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

  // Badge: if today's daily-featured slug (2× tokens) matches the hero
  // pick, surface the FEATURED TODAY marker right here instead of running
  // a duplicate banner up top. Otherwise fall back to the generic
  // trending / featured pill.
  const isFeaturedToday = todaysFeaturedSlug && todaysFeaturedSlug === game.slug;
  const badgeText = isFeaturedToday
    ? '⭐ FEATURED TODAY · 2× TOKENS'
    : (topScore > 0 ? '🔥 Trending' : '✨ Featured');
  const badgeClass = isFeaturedToday ? 'hero-badge hero-badge-featured' : 'hero-badge';
  featured.textContent = '';

  const hero = document.createElement('article');
  hero.className = 'hero';
  const thumb = document.createElement('div');
  thumb.className = 'hero-thumb';
  const heroBg = imageSetBackground(game.slug);
  thumb.style.backgroundImage = `-webkit-${heroBg}`;
  thumb.style.backgroundImage = heroBg;

  const content = document.createElement('div');
  content.className = 'hero-content';
  const badge = document.createElement('div');
  badge.className = badgeClass;
  badge.textContent = badgeText;
  const title = document.createElement('h2');
  title.className = 'hero-title';
  title.textContent = gameTitle(game);
  const hook = document.createElement('p');
  hook.className = 'hero-hook';
  hook.textContent = gameHook(game);
  const stats = document.createElement('div');
  stats.className = 'hero-stats';
  for (const label of [`👍 ${c.likes || 0}`, `▶ ${c.plays || 0}`]) {
    const span = document.createElement('span');
    span.textContent = label;
    stats.appendChild(span);
  }
  if (minutes > 0) {
    const span = document.createElement('span');
    span.textContent = `⏱ ${minutes}m total play`;
    stats.appendChild(span);
  }
  const cta = document.createElement('a');
  cta.className = 'hero-cta';
  cta.href = playUrl;
  cta.textContent = '▶ Play featured game';

  content.appendChild(badge);
  content.appendChild(title);
  content.appendChild(hook);
  content.appendChild(stats);
  content.appendChild(cta);
  hero.appendChild(thumb);
  hero.appendChild(content);
  featured.appendChild(hero);
  featured.classList.remove('hidden');
  return game.slug;
}

// ── Hidden Gems shelf ─────────────────────────────────────────────────────
// "Least attention" surfaced with player-positive framing: the games at the
// bottom of the attention ranking (/api/least-attention: plays + votes*3 +
// comments*5, ascending, 48h grace for new games) get a shelf of their own
// below the grid so they can earn the impressions the Top feed never gives
// them. Lazy: the fetch fires only when the visitor nears the footer.
const GEMS_LIMIT = 12;
let gemsGames = null;      // game objects resolved from /api/least-attention
let gemsRequested = false; // fetch-once guard

function setupGemsLazyLoad() {
  // The #gems section itself is display:none until data lands, so it can't
  // be observed directly - watch the (always-rendered) footer instead.
  const sentinel = document.querySelector('footer');
  if (!document.getElementById('gems') || !sentinel) return;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      loadGems();
    }, { rootMargin: '600px 0px' });
    io.observe(sentinel);
  } else {
    schedule(loadGems);
  }
}

async function loadGems() {
  if (gemsRequested) return;
  gemsRequested = true;
  let data = null;
  try {
    const r = await fetch(`/api/least-attention?limit=${GEMS_LIMIT * 2}`, { cache: 'no-store' });
    data = r.ok ? await r.json() : null;
  } catch (e) { /* shelf is best-effort - never break the page */ }
  if (!data || !Array.isArray(data.games)) return;
  // Resolve slugs against the already-filtered catalogue (hidden/unpublished
  // games can't resurface here even if the API view is briefly stale). Fetch
  // 2x the shelf size so dropped slugs still leave a full shelf.
  const bySlug = new Map(games.map(g => [g.slug, g]));
  gemsGames = data.games
    .map(row => bySlug.get(row.slug))
    .filter(Boolean)
    .slice(0, GEMS_LIMIT);
  renderGems();
}

function renderGems() {
  const section = document.getElementById('gems');
  const gemsGrid = document.getElementById('gems-grid');
  if (!section || !gemsGrid) return;
  // Same exposure rule as the featured hero: the shelf belongs to the default
  // landing view only - a filtered/searching player is already exploring.
  const onDefaultView = activeTab === 'top' && activeGenre === 'all' && !searchTerm;
  if (!onDefaultView || !gemsGames || gemsGames.length < 3) {
    section.classList.add('hidden');
    return;
  }
  if (!gemsGrid.childElementCount) {
    for (const g of gemsGames) {
      gemsGrid.appendChild(card(g, { eager: false, noVideo: true, from: 'gems_shelf' }));
    }
    if (window.posthog) posthog.capture('gems_shelf_viewed', { count: gemsGames.length });
  }
  section.classList.remove('hidden');
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
  const safeSlug = encodeURIComponent(String(slug || ''));
  return variant > 1
    ? `/thumbs/${safeSlug}__v${variant}.png?v=2`
    : `/thumbs/${safeSlug}.png?v=2`;
}

// Sibling WebP path. build_webp_thumbs.sh emits one .webp per .png in
// Gallery/thumbs/, served via <picture><source type="image/webp"> with the
// PNG as fallback for the ~3% of browsers that don't support WebP.
function thumbWebpUrl(slug, variant) {
  const safeSlug = encodeURIComponent(String(slug || ''));
  return variant > 1
    ? `/thumbs/${safeSlug}__v${variant}.webp?v=2`
    : `/thumbs/${safeSlug}.webp?v=2`;
}

function encodedThumbUrl(slug, ext) {
  return `/thumbs/${encodeURIComponent(String(slug || ''))}.${ext}?v=2`;
}

function imageSetBackground(slug) {
  const webp = encodedThumbUrl(slug, 'webp');
  const png = encodedThumbUrl(slug, 'png');
  return `image-set(url("${webp}") type("image/webp"), url("${png}") type("image/png"))`;
}

function safeExternalHref(raw) {
  if (!raw) return '';
  const value = String(raw).trim();
  if (!/^https:\/\//i.test(value)) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch (_) {
    return '';
  }
}

function platformEntries(platforms) {
  if (!platforms) return [];
  const specs = [
    { key: 'yandex', label: 'Yandex', badge: 'Yandex' },
    { key: 'crazygames', label: 'CrazyGames', badge: 'CG' },
  ];
  const out = [];
  for (const spec of specs) {
    const href = safeExternalHref(platforms[spec.key]);
    if (href) out.push(Object.assign({ href }, spec));
  }
  return out;
}

function appendPlatformLinks(parent, entries) {
  for (const entry of entries) {
    const link = document.createElement('a');
    link.className = 'play-link ext';
    link.href = entry.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.dataset.plat = entry.key;
    link.textContent = `▶ ${entry.label}`;
    parent.appendChild(link);
  }
}

function makeVoteButton(kind, active, icon, label, value) {
  const btn = document.createElement('button');
  btn.className = `vote ${kind}${active ? ' active' : ''}`;
  btn.dataset.action = kind;
  btn.type = 'button';
  btn.setAttribute('aria-label', label);
  btn.appendChild(document.createTextNode(`${icon} `));
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = value || 0;
  btn.appendChild(num);
  return btn;
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

  // Cross-platform showcase: `external` games (e.g. merge_conquest live on
  // Yandex + CrazyGames) aren't hosted locally — the card links straight out.
  // `platforms` may also decorate a normal local game as "also on …" chips.
  const platforms = g.platforms || null;
  const platformsSafe = platformEntries(platforms);
  const isExternal = !!g.external;
  const primaryExtUrl = platformsSafe.length ? platformsSafe[0].href : null;
  // Badge text reflects the ACTUAL platforms this game links to — never hardcode
  // "Yandex / CG" (a Yandex-only game must not claim CG, and vice versa).
  const platLabel = platformsSafe.map(p => p.badge).join(' / ');

  // Native lazy-loading + fetchpriority lets the browser sequence requests:
  // first 2 cards = high priority + eager fetch; next 2 = eager but normal;
  // rest = lazy + low-priority background fetch. <picture> serves WebP
  // (5-8× smaller than PNG) to every modern browser, with PNG fallback
  // for the ~3% that don't support WebP.
  const imgLoading  = opts.eager ? 'eager' : 'lazy';
  const imgPriority = opts.priority ? 'high' : (opts.eager ? 'auto' : 'low');
  const imgDecoding = opts.eager ? 'sync' : 'async';

  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.variant = variant;
  if (!opts.eager) el.dataset.lazy = '1';

  const thumbEl = document.createElement('div');
  thumbEl.className = 'card-thumb';
  thumbEl.dataset.num = specimenNum(g);

  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.srcset = thumbWebp;
  source.type = 'image/webp';
  const img = document.createElement('img');
  img.className = 'card-thumb-img';
  img.src = thumb;
  img.alt = '';
  img.loading = imgLoading;
  img.setAttribute('fetchpriority', imgPriority);
  img.decoding = imgDecoding;
  picture.appendChild(source);
  picture.appendChild(img);
  thumbEl.appendChild(picture);

  // Eager (above-the-fold) cards get the inline autoplay video right away.
  // Lazy cards get a slot div the IntersectionObserver upgrades to a real
  // <video> when the card scrolls into view — keeps initial bandwidth small.
  // opts.noVideo skips previews entirely (gems shelf: static thumbs only,
  // its cards live outside #grid so the observer never hydrates them).
  if (g.hasPreview && !opts.noVideo) {
    const previewSrc = `/previews/${encodeURIComponent(g.slug)}.webm`;
    if (opts.eager) {
      const video = document.createElement('video');
      video.className = 'card-video';
      video.src = previewSrc;
      video.poster = thumb;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('aria-hidden', 'true');
      thumbEl.appendChild(video);
    } else {
      const slot = document.createElement('div');
      slot.className = 'card-video-slot';
      slot.dataset.src = previewSrc;
      slot.dataset.poster = thumb;
      thumbEl.appendChild(slot);
    }
  }

  if (isExternal && platLabel) {
    const badge = document.createElement('span');
    badge.className = 'flagship-badge';
    badge.textContent = `★ ${platLabel}`;
    thumbEl.appendChild(badge);
  } else if (isRecent) {
    const badge = document.createElement('span');
    badge.className = 'recent-badge';
    badge.textContent = 'NEW';
    thumbEl.appendChild(badge);
  }

  if (!isExternal && c.plays) {
    const plays = document.createElement('span');
    plays.className = 'play-count';
    plays.textContent = `▶ ${c.plays}`;
    thumbEl.appendChild(plays);
  }
  if (!isExternal && c.comments) {
    const comments = document.createElement('span');
    comments.className = 'comment-count';
    comments.textContent = `💬 ${c.comments}`;
    thumbEl.appendChild(comments);
  }
  if (!isExternal) {
    const lab = document.createElement('a');
    lab.className = 'lab-link';
    lab.href = `/lab.html?slug=${encodeURIComponent(g.slug)}`;
    lab.title = 'Build journal';
    lab.setAttribute('aria-label', 'Open build journal');
    lab.textContent = '📓';
    thumbEl.appendChild(lab);
  }

  const body = document.createElement('div');
  body.className = 'card-body';
  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = gameTitle(g);
  const hook = document.createElement('div');
  hook.className = 'card-hook';
  hook.textContent = gameHook(g);
  const foot = document.createElement('div');
  foot.className = isExternal ? 'card-foot ext-foot' : 'card-foot';
  if (isExternal) {
    const extLabel = document.createElement('span');
    extLabel.className = 'ext-label';
    extLabel.textContent = 'Play on';
    foot.appendChild(extLabel);
    appendPlatformLinks(foot, platformsSafe);
  } else {
    foot.appendChild(makeVoteButton('like', myVote === 'like', '👍', 'Like', c.likes));
    foot.appendChild(makeVoteButton('dislike', myVote === 'dislike', '👎', 'Dislike', c.dislikes));
    const commentBtn = makeVoteButton('comments', false, '💬', 'Read & leave comments', c.comments);
    commentBtn.classList.add('comments-open');
    foot.appendChild(commentBtn);
    const play = document.createElement('a');
    play.className = 'play-link';
    play.href = playUrl;
    play.textContent = '▶ Play';
    foot.appendChild(play);
    appendPlatformLinks(foot, platformsSafe);
  }
  body.appendChild(title);
  body.appendChild(hook);
  body.appendChild(foot);
  el.appendChild(thumbEl);
  el.appendChild(body);

  function goPlay() {
    if ((g.thumbCount || 1) > 1) logVariantClick(g.slug, variant);
    if (isExternal && primaryExtUrl) {
      const plat = platformsSafe[0] ? platformsSafe[0].key : null;
      if (window.posthog) posthog.capture('game_card_clicked', { slug: g.slug, game_title: gameTitle(g), source: 'thumbnail_external', platform: plat });
      window.open(primaryExtUrl, '_blank', 'noopener');
      return;
    }
    if (window.posthog) posthog.capture('game_card_clicked', { slug: g.slug, game_title: gameTitle(g), source: opts.from || 'thumbnail' });
    location.href = playUrl;
  }
  el.querySelector('.card-thumb').addEventListener('click', (e) => {
    // The 📓 lab link sits inside .card-thumb — let it navigate without
    // triggering goPlay.
    if (e.target.closest('.lab-link')) return;
    goPlay();
  });
  el.querySelectorAll('.play-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((g.thumbCount || 1) > 1) logVariantClick(g.slug, variant);
      const plat = link.dataset.plat || null;
      if (window.posthog) posthog.capture('game_card_clicked', { slug: g.slug, game_title: gameTitle(g), source: plat ? 'platform_link' : 'play_link', platform: plat });
      // let the link navigation proceed (external chips are target=_blank)
    });
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
  document.getElementById('comment-modal-list').replaceChildren(commentModalEmpty('Loading…'));
  if (!m.open) m.showModal();
  loadModalComments(g.slug);
  if (window.posthog) posthog.capture('comments_modal_opened', { slug: g.slug });
}

function closeCommentModal() {
  // Delegate to the wireModal-returned helper when available (it also runs
  // onClose cleanup); fallback to dialog.close() directly.
  if (commentModal && commentModal.close) {
    commentModal.close();
  } else {
    const m = document.getElementById('comment-modal');
    if (m && m.open) m.close();
  }
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

function commentModalEmpty(text) {
  const el = document.createElement('div');
  el.className = 'comment-modal-empty';
  el.textContent = text;
  return el;
}

function commentModalRow(comment, whenText, emoji) {
  const row = document.createElement('div');
  row.className = 'comment-modal-row';
  const vote = document.createElement('div');
  vote.className = 'vote-emoji';
  vote.textContent = emoji || (comment.vote === 'like' ? '👍' : comment.vote === 'dislike' ? '👎' : '💬');
  const body = document.createElement('div');
  const text = document.createElement('div');
  text.textContent = comment.comment || '';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = whenText || relTimeShort(comment.ts);
  body.appendChild(text);
  body.appendChild(meta);
  row.appendChild(vote);
  row.appendChild(body);
  return row;
}

async function loadModalComments(slug) {
  const list = document.getElementById('comment-modal-list');
  try {
    const r = await fetch(`/api/comments?slug=${encodeURIComponent(slug)}&limit=20`, { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    const d = await r.json();
    const cs = (d && d.comments) || [];
    if (!cs.length) {
      list.replaceChildren(commentModalEmpty('No comments yet — leave the first one above.'));
      return;
    }
    list.replaceChildren(...cs.map(cm => commentModalRow(cm)));
  } catch (e) {
    list.replaceChildren(commentModalEmpty('Couldn\'t load comments. Try again.'));
  }
}

// Comment modal — open is driven by `openCommentModal(g)` above (slug-aware,
// loads comments async). This helper call wires the submit/close/escape/
// counter machinery shared with the suggest-a-game modal. Helper lives in
// `Gallery/modal.js` (see that file's header for the host-page contract).
const commentModal = window.wireModal && window.wireModal({
  modalId:  'comment-modal',
  formId:   'comment-modal-form',
  inputId:  'comment-modal-input',
  counterId:'comment-modal-counter',
  submitId: 'comment-modal-submit',
  minLength: 2,
  labels: { idle: 'Post', sending: '…', sent: 'Post' },
  errorMessages: {
    no_slug: 'Pick a game first.',
    network: 'Network error — try again.',
    default: 'Try again.',
  },
  onClose() {
    _commentModalState.slug = null;
  },
  async onSubmit(text) {
    const slug = _commentModalState.slug;
    if (!slug) return { ok: false, errorCode: 'no_slug' };
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, vote: 'neutral', comment: text }),
        keepalive: true,
      });
      if (window.posthog) posthog.capture('comment_posted_modal', { slug, length: text.length });
      return { ok: true };
    } catch (err) {
      return { ok: false, errorCode: 'network' };
    }
  },
  onSuccess(text) {
    // Optimistic local prepend to the visible comment list
    const list = document.getElementById('comment-modal-list');
    if (!list) return;
    const empty = list.querySelector('.comment-modal-empty');
    const row = commentModalRow({ comment: text, vote: 'neutral' }, 'just now · you', '💬');
    if (empty) list.replaceChildren(row);
    else list.prepend(row);
  },
});

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

// Counts arriving from /api/boot (KV snapshot ≤ ~5min + 60s edge) or
// /api/counts (60s edge) can predate a vote just cast, so a reload shortly
// after voting could repaint pre-vote numbers over the optimistic bump
// (scorecard P2, review-20260611-194919). Two shields:
//   1. slugs voted THIS page load keep their in-memory numbers;
//   2. a vote's authoritative server response is stashed in sessionStorage
//      for ~17 min and overlaid on the next load's counts/boot payload.
// 1020s == boot.js STALE_SERVE_MAX (960s) + edge TTL (60s) exactly — boot
// never serves data older than this shield; change them together.
// (Raised 420->1020 on 2026-06-16 with the snapshot rebuild cadence, to keep
// KV list ops under the free 1000/day cap — see boot.js / counts.js.)
const VOTE_OVERRIDE_TTL_MS = 1020 * 1000;

function mergeFreshVoteState(fresh) {
  for (const slug of votedSlugsThisSession) {
    if (counts[slug]) fresh[slug] = Object.assign({}, fresh[slug], counts[slug]);
  }
  try {
    const stale = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || k.indexOf('voteOverride:') !== 0) continue;
      const v = JSON.parse(sessionStorage.getItem(k) || 'null');
      if (!v || Date.now() - v.ts > VOTE_OVERRIDE_TTL_MS) { stale.push(k); continue; }
      const slug = k.slice('voteOverride:'.length);
      if (votedSlugsThisSession.has(slug)) continue;  // in-memory shield already applied
      fresh[slug] = Object.assign({}, fresh[slug], { likes: v.likes, dislikes: v.dislikes });
    }
    stale.forEach(k => sessionStorage.removeItem(k));
  } catch (e) { /* private mode / quota — bounded staleness is acceptable */ }
  return fresh;
}

async function vote(slug, action, cardEl) {
  const wasInSession = votedSlugsThisSession.has(slug);
  votedSlugsThisSession.add(slug);
  const prev = myVotes[slug] || null;
  const next = prev === action ? null : action;
  // Snapshot pre-click counts so a gated 403 can roll the optimistic bump back.
  const prevCounts = counts[slug] ? { likes: counts[slug].likes | 0, dislikes: counts[slug].dislikes | 0 } : null;

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

  // Server update. The server enforces per-voter state for both signed-in and
  // anonymous players; localStorage is only the instant UI hint.
  try {
    const r = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ slug, vote: next || 'clear' }),
    });
    if (r.ok) {
      const updated = await r.json();
      counts[slug] = { likes: updated.likes, dislikes: updated.dislikes };
      // Survive a reload inside the counts edge-cache TTL (see mergeFreshVoteState).
      try {
        sessionStorage.setItem('voteOverride:' + slug,
          JSON.stringify({ likes: updated.likes, dislikes: updated.dislikes, ts: Date.now() }));
      } catch (e) { /* best-effort */ }
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
    } else if (r.status === 403) {
      // Vote gate (Tim 2026-06-16): rating needs ~5 min of active play on this
      // game. The server rejected it, so roll the optimistic state back to
      // pre-click and nudge toward the play page, where the countdown lives.
      if (prev) myVotes[slug] = prev; else delete myVotes[slug];
      if (prevCounts) counts[slug] = prevCounts; else delete counts[slug];
      if (!wasInSession) votedSlugsThisSession.delete(slug);
      localStorage.setItem('myVotes', JSON.stringify(myVotes));
      refreshCard(cardEl, slug);
      showRateHint();
    }
  } catch (e) { /* offline-tolerant */ }
}

// Brief, dependency-free toast nudging the player to earn rating by playing. Shown
// when /api/vote rejects a gallery-card vote with the 5-min play gate. (Tim 2026-06-16)
function showRateHint() {
  let t = document.getElementById('rate-hint-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'rate-hint-toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b1b22;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;line-height:1.3;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.35);max-width:88vw;text-align:center;transition:opacity .25s;';
    document.body.appendChild(t);
  }
  t.textContent = 'Play about 5 minutes to rate this game - open it and play first.';
  t.style.opacity = '1';
  clearTimeout(showRateHint._t);
  showRateHint._t = setTimeout(function () { t.style.opacity = '0'; }, 2800);
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

// Suggest-a-game modal wiring lives in /suggest.js (shared with play.html).
// index.html loads it after app.js via a separate <script> tag.
