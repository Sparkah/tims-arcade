// chat.js -- the Player Lounge. A right-side drawer (reuses the leaderboard
// .lb-panel) opened from the meta-pill 💬. Anonymous-friendly. Players can post
// text OR share a gallery game (renders as a thumb+title card). All moderation
// (no links/images/profanity) is server-side. Tim 2026-06-15.
(function () {
  'use strict';

  var POLL_MS = 5000;
  var COOLDOWN_MS = 3000;
  var MAX_NAME = 18;
  var MAX_TEXT = 200;

  var $ = function (id) { return document.getElementById(id); };
  var panel    = $('chat-panel');
  var toggle   = $('meta-pill-chat');
  var closeBtn = $('chat-close');
  var list     = $('chat-messages');
  var statusEl = $('chat-status');
  var form     = $('chat-form');
  var nameInp  = $('chat-name');
  var textInp  = $('chat-text');
  var sendBtn  = $('chat-send');
  var shareBtn = $('chat-share');
  var picker   = $('chat-picker');
  var pickerSearch = $('chat-picker-search');
  var pickerList   = $('chat-picker-list');
  if (!panel || !toggle || !form || !list) return;

  var open = false, pollTimer = null, lastId = '', seen = Object.create(null);
  var namePrefilled = false, coolingDown = false, games = null;

  // ---- name ----
  function genName() {
    var uid = (window.IDENTITY && window.IDENTITY.uid) || '';
    var sfx = uid ? uid.replace(/[^a-z0-9]/gi, '').slice(-4) : Math.random().toString(36).slice(2, 6);
    return 'Player-' + (sfx || '0000');
  }
  function loadName() { try { return localStorage.getItem('chat_name') || ''; } catch (e) { return ''; } }
  function saveName(n) { try { localStorage.setItem('chat_name', n); } catch (e) {} }
  var savedName = loadName();
  if (savedName) { nameInp.value = savedName; namePrefilled = true; }
  function prefillName() {
    if (namePrefilled || nameInp.value.trim()) { namePrefilled = true; return; }
    fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        nameInp.value = (d && d.signed_in && d.email) ? d.email.split('@')[0].slice(0, MAX_NAME) : genName();
        namePrefilled = true;
      })
      .catch(function () { nameInp.value = nameInp.value || genName(); namePrefilled = true; });
  }
  nameInp.addEventListener('change', function () { nameInp.value = nameInp.value.trim().slice(0, MAX_NAME); saveName(nameInp.value); });

  // ---- render ----
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtTime(ts) {
    if (!ts) return '';
    var d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return 'now';
    if (d < 3600) return Math.floor(d / 60) + 'm';
    if (d < 86400) return Math.floor(d / 3600) + 'h';
    return new Date(ts).toLocaleDateString();
  }
  function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 80; }
  function toBottom() { list.scrollTop = list.scrollHeight; }
  function gameCard(g) {
    var a = document.createElement('a');
    a.className = 'chat-game-card';
    a.href = '/play.html?slug=' + encodeURIComponent(g.slug);
    var img = document.createElement('img');
    img.className = 'chat-game-thumb'; img.alt = ''; img.loading = 'lazy';
    img.src = '/thumbs/' + g.slug + '.webp';
    img.onerror = function () { this.onerror = null; this.src = '/thumbs/' + g.slug + '.png'; };
    var meta = document.createElement('span'); meta.className = 'chat-game-meta';
    var t = document.createElement('span'); t.className = 'chat-game-title'; t.textContent = g.title || g.slug;
    var pl = document.createElement('span'); pl.className = 'chat-game-play'; pl.textContent = 'Play ->';
    meta.appendChild(t); meta.appendChild(document.createElement('br')); meta.appendChild(pl);
    a.appendChild(img); a.appendChild(meta);
    return a;
  }
  function addMessage(m, autoscroll) {
    if (!m || !m.id || seen[m.id]) return;
    seen[m.id] = true;
    if (String(m.id) > lastId) lastId = String(m.id);
    var ph = list.querySelector('.chat-empty'); if (ph) ph.remove();
    var row = document.createElement('div');
    row.className = 'chat-msg';
    row.innerHTML = '<div class="chat-msg-head"><span class="chat-msg-name">' + esc(m.name || 'Player') +
      '</span><span class="chat-msg-time">' + fmtTime(m.ts) + '</span></div>' +
      (m.text ? '<div class="chat-msg-text">' + esc(m.text) + '</div>' : '');
    if (m.game && m.game.slug) row.appendChild(gameCard(m.game));
    list.appendChild(row);
    while (list.children.length > 120) list.removeChild(list.firstChild);
    if (autoscroll) toBottom();
  }

  // ---- poll ----
  function poll(initial) {
    fetch('/api/chat?' + (lastId ? 'since=' + encodeURIComponent(lastId) : 'limit=40'), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.messages) return;
        var stick = initial || nearBottom();
        var wasEmpty = list.children.length === 0;
        d.messages.forEach(function (m) { addMessage(m, false); });
        if (wasEmpty && list.children.length === 0) list.innerHTML = '<div class="chat-empty">No messages yet. Say hi, or share a game.</div>';
        if (stick) toBottom();
      })
      .catch(function () {});
  }
  function startPolling() { if (pollTimer) return; poll(true); pollTimer = setInterval(function () { if (document.visibilityState === 'visible' && open) poll(false); }, POLL_MS); }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  // ---- open / close (drawer; reuses .lb-panel .visible) ----
  function openChat() {
    var lb = $('lb-panel'); if (lb) lb.classList.remove('visible');   // don't stack with the leaderboard
    panel.classList.add('visible'); panel.setAttribute('aria-hidden', 'false');
    open = true; prefillName(); startPolling();
    if (window.innerWidth > 720) setTimeout(function () { textInp.focus(); }, 60);
  }
  function closeChat() {
    panel.classList.remove('visible'); panel.setAttribute('aria-hidden', 'true');
    open = false; closePicker(); stopPolling();
  }
  toggle.addEventListener('click', function () { open ? closeChat() : openChat(); });
  closeBtn.addEventListener('click', closeChat);
  // Symmetric with the leaderboard: opening it (📊) closes the chat (app.js opens
  // the leaderboard on the same button; we just stop our drawer + polling).
  var boardBtn = $('meta-pill-board');
  if (boardBtn) boardBtn.addEventListener('click', function () { if (open) closeChat(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) closeChat(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && open) poll(false); });

  // ---- send ----
  var ERRORS = {
    contact: "Links and contacts aren't allowed here.",
    blocked: "Let's keep it friendly.",
    empty: 'Type a message first.',
    rate_limit: 'Slow down a moment.',
    banned: 'You are not able to post right now.',
    bad_game: 'That game could not be shared.',
  };
  function setStatus(msg, kind) { statusEl.textContent = msg || ''; statusEl.className = 'chat-status' + (kind ? ' ' + kind : ''); }
  function startCooldown() { coolingDown = true; sendBtn.disabled = true; setTimeout(function () { coolingDown = false; sendBtn.disabled = false; if (open && window.innerWidth > 720) textInp.focus(); }, COOLDOWN_MS); }
  function sendMessage(text, game) {
    if (coolingDown) { setStatus('Slow down a moment.', 'warn'); return; }
    var name = (nameInp.value.trim() || genName()).slice(0, MAX_NAME); saveName(name);
    var payload = { name: name };
    if (text) payload.text = text.slice(0, MAX_TEXT);
    if (game) payload.game = game;
    sendBtn.disabled = true;
    fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d && res.d.message) {
          addMessage(res.d.message, true);
          if (text) textInp.value = '';
          setStatus('', ''); startCooldown();
        } else {
          var reason = (res.d && res.d.error) || 'blocked';
          setStatus(ERRORS[reason] || 'Message not sent.', reason === 'rate_limit' ? 'warn' : 'err');
          sendBtn.disabled = false;
        }
      })
      .catch(function () { setStatus('Network error. Try again.', 'err'); sendBtn.disabled = false; });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = textInp.value.trim();
    if (!text) { setStatus(ERRORS.empty, 'warn'); return; }
    sendMessage(text, null);
  });
  textInp.addEventListener('input', function () { if (statusEl.textContent) setStatus('', ''); });

  // ---- share a game ----
  function loadGames() {
    if (games) return Promise.resolve(games);
    return fetch('/games.json', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d) { games = Array.isArray(d) ? d : []; return games; })
      .catch(function () { games = []; return games; });
  }
  function gTitle(g) { return g.title || g.slug || ''; }
  function renderPicker(q) {
    q = (q || '').toLowerCase();
    var items = (games || []).filter(function (g) { return g.slug && (!q || gTitle(g).toLowerCase().indexOf(q) >= 0 || g.slug.indexOf(q) >= 0); }).slice(0, 40);
    pickerList.innerHTML = '';
    if (!items.length) { pickerList.innerHTML = '<div class="chat-empty">No games found.</div>'; return; }
    items.forEach(function (g) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chat-picker-item';
      var img = document.createElement('img'); img.alt = ''; img.loading = 'lazy';
      img.src = '/thumbs/' + g.slug + '.webp';
      img.onerror = function () { this.onerror = null; this.src = '/thumbs/' + g.slug + '.png'; };
      var s = document.createElement('span'); s.textContent = gTitle(g);
      b.appendChild(img); b.appendChild(s);
      b.addEventListener('click', function () { closePicker(); sendMessage('', { slug: g.slug, title: gTitle(g) }); });
      pickerList.appendChild(b);
    });
  }
  function openPicker() { shareBtn.classList.add('active'); picker.hidden = false; loadGames().then(function () { renderPicker(pickerSearch.value); }); setTimeout(function () { pickerSearch.focus(); }, 50); }
  function closePicker() { if (shareBtn) shareBtn.classList.remove('active'); if (picker) picker.hidden = true; }
  if (shareBtn) shareBtn.addEventListener('click', function () { picker.hidden ? openPicker() : closePicker(); });
  if (pickerSearch) pickerSearch.addEventListener('input', function () { renderPicker(pickerSearch.value); });
})();
