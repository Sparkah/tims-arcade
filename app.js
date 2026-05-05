// ── State ─────────────────────────────────────────────────────────────────
let games = [];   // from games.json
let counts = {};  // from /api/counts
let myVotes = JSON.parse(localStorage.getItem('myVotes') || '{}');
let activeTab = 'top';
let searchTerm = '';

const grid   = document.getElementById('grid');
const empty  = document.getElementById('empty');
const tabs   = document.getElementById('tabs');
const search = document.getElementById('search');

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

  attachEvents();
  render();
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
  search.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });
}

// ── Filtering / sorting ───────────────────────────────────────────────────
function visible() {
  let list = games.filter(g => g.published !== false);

  if (searchTerm) {
    list = list.filter(g =>
      (g.title || '').toLowerCase().includes(searchTerm) ||
      (g.hook  || '').toLowerCase().includes(searchTerm)
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

function emptyMessage() {
  if (activeTab === 'liked')  return '<h2>No liked games yet.</h2><p>Tap 👍 on something you enjoyed.</p>';
  if (activeTab === 'recent') return '<h2>No new games this week.</h2><p>Check back tomorrow — the factory builds one most days.</p>';
  if (searchTerm)             return `<h2>No games matching “${escapeHtml(searchTerm)}”.</h2>`;
  return '<h2>No games yet.</h2>';
}

function card(g) {
  const c = counts[g.slug] || { likes: 0, dislikes: 0 };
  const myVote = myVotes[g.slug] || null;
  const isRecent = g.addedDate && (Date.now() - new Date(g.addedDate).getTime() < 3 * 24 * 60 * 60 * 1000);

  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <div class="card-thumb" style="background-image: url('/thumbs/${g.slug}.png?v=1')">
      ${isRecent ? '<span class="recent-badge">NEW</span>' : ''}
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
        <a class="play-link" href="/play.html?slug=${encodeURIComponent(g.slug)}">▶ Play</a>
      </div>
    </div>
  `;
  el.querySelector('.card-title').textContent = g.title;
  el.querySelector('.card-hook').textContent  = g.hook || '';
  el.querySelector('.card-thumb').addEventListener('click', () => {
    location.href = `/play.html?slug=${encodeURIComponent(g.slug)}`;
  });
  el.querySelectorAll('.vote').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      vote(g.slug, btn.dataset.action, el);
    });
  });
  return el;
}

// ── Voting ────────────────────────────────────────────────────────────────
async function vote(slug, action, cardEl) {
  const prev = myVotes[slug] || null;
  let next;
  if (prev === action) next = null;        // toggle off — remove vote
  else next = action;                      // switch or new vote

  // delta math
  let dl = 0, dd = 0;
  if (prev === 'like')    dl -= 1;
  if (prev === 'dislike') dd -= 1;
  if (next === 'like')    dl += 1;
  if (next === 'dislike') dd += 1;

  // Optimistic update
  if (next) myVotes[slug] = next; else delete myVotes[slug];
  localStorage.setItem('myVotes', JSON.stringify(myVotes));
  if (!counts[slug]) counts[slug] = { likes: 0, dislikes: 0 };
  counts[slug].likes    = Math.max(0, (counts[slug].likes    || 0) + dl);
  counts[slug].dislikes = Math.max(0, (counts[slug].dislikes || 0) + dd);
  refreshCard(cardEl, slug);

  // Server update
  try {
    const r = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, deltaLike: dl, deltaDislike: dd }),
    });
    if (r.ok) {
      const updated = await r.json();
      counts[slug] = updated;
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
