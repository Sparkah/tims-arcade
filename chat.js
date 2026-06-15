// chat.js -- the Player Lounge sticky chat widget. Talks to /api/chat (global
// room). Dependency-free, mobile-first. Anonymous-friendly: the name is cosmetic
// and user-set, no sign-in required. All moderation (no links, no images, no
// profanity) is server-side in _lib/chatmod.js; the client only shows the reason.
// Tim 2026-06-15.
(function () {
  'use strict';

  var ROOM = 'global';
  var POLL_MS = 5000;      // poll cadence while open (reads are cheap)
  var COOLDOWN_MS = 3000;  // client-side anti-rapid-fire (server caps at 6/min)
  var MAX_NAME = 18;
  var MAX_TEXT = 200;

  var launcher = document.getElementById('chat-launcher');
  var panel    = document.getElementById('chat-panel');
  var closeBtn = document.getElementById('chat-close');
  var list     = document.getElementById('chat-messages');
  var statusEl = document.getElementById('chat-status');
  var form     = document.getElementById('chat-form');
  var nameInp  = document.getElementById('chat-name');
  var textInp  = document.getElementById('chat-text');
  var sendBtn  = document.getElementById('chat-send');
  if (!launcher || !panel || !form || !list) return;

  var open = false;
  var pollTimer = null;
  var lastId = '';
  var seen = Object.create(null);
  var namePrefilled = false;
  var coolingDown = false;

  // ---- name handling (persisted in localStorage) ----
  function genName() {
    var uid = (window.IDENTITY && window.IDENTITY.uid) || '';
    var suffix = uid ? uid.replace(/[^a-z0-9]/gi, '').slice(-4) : Math.random().toString(36).slice(2, 6);
    return 'Player-' + (suffix || '0000');
  }
  function loadName() { try { return localStorage.getItem('chat_name') || ''; } catch (e) { return ''; } }
  function saveName(n) { try { localStorage.setItem('chat_name', n); } catch (e) {} }

  var savedName = loadName();
  if (savedName) { nameInp.value = savedName; namePrefilled = true; }

  // First open with no saved name: prefill from the signed-in email, else generate.
  function prefillName() {
    if (namePrefilled || nameInp.value.trim()) { namePrefilled = true; return; }
    fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        nameInp.value = (d && d.signed_in && d.email)
          ? d.email.split('@')[0].slice(0, MAX_NAME)
          : genName();
        namePrefilled = true;
      })
      .catch(function () { nameInp.value = nameInp.value || genName(); namePrefilled = true; });
  }
  nameInp.addEventListener('change', function () {
    nameInp.value = nameInp.value.trim().slice(0, MAX_NAME);
    saveName(nameInp.value);
  });

  // ---- rendering ----
  function fmtTime(ts) {
    if (!ts) return '';
    var diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return new Date(ts).toLocaleDateString();
  }
  function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 80; }
  function scrollToBottom() { list.scrollTop = list.scrollHeight; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function addMessage(m, autoscroll) {
    if (!m || !m.id || seen[m.id]) return;
    seen[m.id] = true;
    if (String(m.id) > lastId) lastId = String(m.id);
    var row = document.createElement('div');
    row.className = 'chat-msg';
    row.innerHTML =
      '<div class="chat-msg-head"><span class="chat-msg-name">' + esc(m.name || 'Player') + '</span>' +
      '<span class="chat-msg-time">' + fmtTime(m.ts) + '</span></div>' +
      '<div class="chat-msg-text">' + esc(m.text || '') + '</div>';
    list.appendChild(row);
    while (list.children.length > 120) list.removeChild(list.firstChild);
    if (autoscroll) scrollToBottom();
  }

  // ---- networking ----
  function poll(initial) {
    var url = '/api/chat?room=' + ROOM + (lastId ? '&since=' + encodeURIComponent(lastId) : '&limit=40');
    fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.messages) return;
        var stick = initial || nearBottom();
        var empty = list.children.length === 0;
        d.messages.forEach(function (m) { addMessage(m, false); });
        if (empty && list.children.length === 0) {
          list.innerHTML = '<div class="chat-empty">No messages yet. Say hi to other players.</div>';
        }
        if (stick) scrollToBottom();
      })
      .catch(function () {});
  }
  function startPolling() {
    if (pollTimer) return;
    poll(true);
    pollTimer = setInterval(function () {
      if (document.visibilityState === 'visible' && open) poll(false);
    }, POLL_MS);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  // ---- open / close ----
  function openPanel() {
    open = true;
    panel.hidden = false;
    document.body.classList.add('chat-open');
    launcher.classList.add('active');
    launcher.setAttribute('aria-label', 'Close chat');
    prefillName();
    startPolling();
    if (window.innerWidth > 720) setTimeout(function () { textInp.focus(); }, 60);
  }
  function closePanel() {
    open = false;
    panel.hidden = true;
    document.body.classList.remove('chat-open');
    launcher.classList.remove('active');
    launcher.setAttribute('aria-label', 'Open chat');
    stopPolling();
  }
  launcher.addEventListener('click', function () { open ? closePanel() : openPanel(); });
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) closePanel(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && open) poll(false);
  });

  // ---- send ----
  var ERRORS = {
    contact: "Links and contacts aren't allowed here.",
    blocked: "Let's keep it friendly.",
    empty: 'Type a message first.',
    rate_limit: 'Slow down a moment.',
    bad_json: 'Something went wrong. Try again.',
  };
  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'chat-status' + (kind ? ' ' + kind : '');
  }
  function startCooldown() {
    coolingDown = true;
    sendBtn.disabled = true;
    setTimeout(function () {
      coolingDown = false; sendBtn.disabled = false;
      if (open && window.innerWidth > 720) textInp.focus();
    }, COOLDOWN_MS);
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (coolingDown) return;
    var text = textInp.value.trim();
    if (!text) { setStatus(ERRORS.empty, 'warn'); return; }
    var name = (nameInp.value.trim() || genName()).slice(0, MAX_NAME);
    saveName(name);
    sendBtn.disabled = true;
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ room: ROOM, name: name, text: text.slice(0, MAX_TEXT) }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d && res.d.message) {
          var ph = list.querySelector('.chat-empty'); if (ph) ph.remove();
          addMessage(res.d.message, true);
          textInp.value = '';
          setStatus('', '');
          startCooldown();
        } else {
          var reason = (res.d && res.d.error) || 'blocked';
          setStatus(ERRORS[reason] || 'Message not sent.', reason === 'rate_limit' ? 'warn' : 'err');
          sendBtn.disabled = false;
        }
      })
      .catch(function () { setStatus('Network error. Try again.', 'err'); sendBtn.disabled = false; });
  });
  textInp.addEventListener('input', function () { if (statusEl.textContent) setStatus('', ''); });
})();
