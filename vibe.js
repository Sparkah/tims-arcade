// vibe.js -- the /create page logic. Lets a signed-in player describe a game and
// have it built (async, by Tim's Mac relay) and played back in a sandboxed iframe.
// Economy: first game free, then 60 tokens per game (earned by play +1/min, rate a
// game +5, daily login +10), or a (placeholder) buy button. Dependency-free. Tim 2026-06-16.
(function () {
  'use strict';

  var POLL_MS = 4000;
  var JOB_KEY = 'vibe_job';

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    prompts: $('create-prompts'),
    signin: $('create-signin'),
    composer: $('create-composer'),
    prompt: $('vibe-prompt'),
    counter: $('vibe-counter'),
    generate: $('vibe-generate'),
    msg: $('vibe-msg'),
    gate: $('create-gate'),
    gateFill: $('create-gate-fill'),
    gateText: $('create-gate-text'),
    pay: $('vibe-pay'),
    payNote: $('create-pay-note'),
    status: $('create-status'),
    building: $('create-building'),
    ready: $('create-ready'),
    readyTitle: $('create-ready-title'),
    frameWrap: $('create-frame-wrap'),
    again: $('vibe-again'),
    open: $('vibe-open'),
    failed: $('create-failed'),
    retry: $('vibe-retry'),
    mine: $('create-mine'),
    list: $('create-list'),
    creatorName: $('vibe-creator-name'),
  };
  if (!els.composer) return;

  var pollTimer = null;
  var myName = '';
  var lastBuild = null, buildTicker = null;
  var BUILD_ETA_MIN = 22;   // Opus game gen under heavy concurrent-claude load (sonnet fallback is faster)

  function show(el, on) { if (el) el.hidden = !on; }
  function setMsg(t, kind) { els.msg.textContent = t || ''; els.msg.className = 'create-msg' + (kind ? ' ' + kind : ''); }
  function capture(ev, props) { try { if (window.posthog) window.posthog.capture(ev, props || {}); } catch (e) {} }

  var ERRORS = {
    prompt_too_short: 'Add a few more words about your game.',
    prompt_contact: 'Please describe a game -- no links or contacts.',
    prompt_blocked: "Let's keep it friendly. Try another idea.",
    no_prompts: 'You need 60 tokens to make a game. Play, rate, or log in to earn them.',
    need_tokens: 'You need 60 tokens to make a game. Play, rate, or log in to earn them.',
    daily_limit_reached: 'You have hit today\'s limit. Come back tomorrow.',
    sign_in_required: 'Please sign in first.',
    enqueue_failed: 'Something went wrong. Try again.',
    bad_json: 'Something went wrong. Try again.',
  };

  // ---- quota / routing ----
  function loadQuota() {
    return fetch('/api/gen/quota', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (q) {
        if (!q.signed_in) { show(els.signin, true); show(els.composer, false); show(els.mine, false); return q; }
        show(els.signin, false);
        show(els.composer, true);
        if (els.creatorName && !els.creatorName.value && q.displayName) els.creatorName.value = q.displayName;
        myName = (els.creatorName && els.creatorName.value) || q.displayName || '';
        renderQuota(q);
        loadCreations();
        return q;
      })
      .catch(function () { setMsg('Could not load your account. Refresh to retry.', 'err'); });
  }

  function renderQuota(q) {
    var cost   = q.generationCost || 60;
    var tokens = q.tokens || 0;
    els.prompts.hidden = false;
    els.prompts.textContent = q.freeAvailable ? 'First game free' : (tokens + ' / ' + cost + ' tokens');
    var canGen = q.freeAvailable || q.canGenerate || tokens >= cost;
    if (canGen) {
      show(els.gate, false);
      els.generate.disabled = false;
    } else {
      show(els.gate, true);
      els.generate.disabled = true;
      els.gateFill.style.width = Math.min(100, Math.round((tokens / cost) * 100)) + '%';
      var need = q.tokensToNext != null ? q.tokensToNext : Math.max(0, cost - tokens);
      els.gateText.textContent = 'Earn ' + need + ' more tokens to make a game - play (+1/min), rate a game (+5), or log in daily (+10).';
    }
  }

  // ---- generate ----
  function generate() {
    var prompt = (els.prompt.value || '').trim();
    if (prompt.length < 3) { setMsg(ERRORS.prompt_too_short, 'warn'); return; }
    els.generate.disabled = true;
    setMsg('Sending your idea...', '');
    capture('vibe_generate_submit', { len: prompt.length });
    fetch('/api/gen/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ prompt: prompt }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d && res.d.id) {
          setMsg('', '');
          beginJob(res.d.id);
        } else {
          var code = (res.d && res.d.error) || 'enqueue_failed';
          setMsg(ERRORS[code] || 'Could not start the build.', 'err');
          els.generate.disabled = false;
          if (code === 'no_prompts' || code === 'need_tokens') loadQuota();
        }
      })
      .catch(function () { setMsg('Network error. Try again.', 'err'); els.generate.disabled = false; });
  }

  function beginJob(id) {
    try { localStorage.setItem(JOB_KEY, JSON.stringify({ id: id, ts: Date.now() })); } catch (e) {}
    show(els.composer, false);
    show(els.status, true);
    show(els.building, true);
    show(els.ready, false);
    show(els.failed, false);
    startPolling(id);
  }

  // ---- status polling ----
  function startPolling(id) {
    stopPolling();
    pollOnce(id);
    pollTimer = setInterval(function () { pollOnce(id); }, POLL_MS);
    buildTicker = setInterval(renderBuildStatus, 1000);   // live elapsed between polls
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (buildTicker) { clearInterval(buildTicker); buildTicker = null; }
  }

  function pollOnce(id) {
    fetch('/api/gen/status?id=' + encodeURIComponent(id), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        if (s.status === 'ready' && s.playUrl) { stopPolling(); clearJob(); onReady(s); }
        else if (s.status === 'failed') { stopPolling(); clearJob(); onFailed(s); }
        else { lastBuild = { s: s, recvAt: Date.now() }; renderBuildStatus(); }   // pending/building -> live status
      })
      .catch(function () {});
  }

  // Live, reload-visible build progress: elapsed, ~ETA, attempt count, retry reason
  // (Tim 2026-06-15: "not just hanging there building"). Re-rendered every second
  // off the last poll + a skew-corrected local clock.
  function friendlyErr(e) {
    e = String(e || '');
    if (/timeout/i.test(e)) return 'the studio was busy and it timed out';
    if (/smoke/i.test(e)) return 'a glitch in the generated game';
    if (/html|empty|large/i.test(e)) return 'the output was not a clean game';
    return 'a temporary hiccup';
  }
  function renderBuildStatus() {
    if (!lastBuild) return;
    var phaseEl = $('build-phase'), detailEl = $('build-detail');
    if (!phaseEl || !detailEl) return;
    var s = lastBuild.s;
    var serverNow = (s.now || Date.now()) + (Date.now() - lastBuild.recvAt);
    if (s.status === 'pending') {
      if ((s.attempts || 0) > 0) {
        phaseEl.textContent = 'Restarting your build (attempt ' + ((s.attempts || 0) + 1) + ')';
        detailEl.textContent = (s.error ? 'Last attempt hit ' + friendlyErr(s.error) + '. ' : '') + 'It is queued and will restart automatically.';
      } else {
        phaseEl.textContent = 'In the queue';
        detailEl.textContent = 'Your game starts building when the studio is online. Builds take about ' + BUILD_ETA_MIN + ' minutes.';
      }
    } else if (s.status === 'building') {
      var elapsedMin = Math.max(0, Math.floor((serverNow - (s.updatedAt || serverNow)) / 60000));
      var tail = (s.attempts || 0) > 0 ? ' - attempt ' + ((s.attempts || 0) + 1) + ' after a restart.' : '.';
      phaseEl.textContent = 'Building your game now';
      if (elapsedMin < BUILD_ETA_MIN) {
        detailEl.textContent = elapsedMin + ' min elapsed, about ' + (BUILD_ETA_MIN - elapsedMin) + ' min to go (good games take ~' + BUILD_ETA_MIN + ' min)' + tail;
      } else {
        detailEl.textContent = elapsedMin + ' min elapsed - wrapping up, almost there' + tail;
      }
    }
  }

  function clearJob() { try { localStorage.removeItem(JOB_KEY); } catch (e) {} }

  function onReady(s) {
    show(els.building, false);
    show(els.failed, false);
    show(els.ready, true);
    els.readyTitle.textContent = (s.title ? '"' + s.title + '" is ready!' : 'Your game is ready!');
    els.open.href = s.playUrl;
    els.frameWrap.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.className = 'create-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-pointer-lock allow-fullscreen');
    iframe.setAttribute('allow', 'fullscreen; autoplay');
    iframe.setAttribute('title', s.title || 'Your game');
    iframe.src = s.playUrl;
    els.frameWrap.appendChild(iframe);
    capture('vibe_generate_ready', { slug: s.slug || '' });
    loadCreations();
  }

  function onFailed() {
    show(els.building, false);
    show(els.ready, false);
    show(els.failed, true);
    capture('vibe_generate_failed', {});
  }

  // ---- creations list ----
  function loadCreations() {
    fetch('/api/me/games', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.games) return;
        var mine = d.games.filter(function (g) { return g.source === 'vibe' || g.genre === 'vibe'; });
        if (!mine.length) { show(els.mine, false); return; }
        show(els.mine, true);
        els.list.innerHTML = '';
        mine.forEach(function (g) { els.list.appendChild(creationCard(g)); });
      })
      .catch(function () {});
  }

  function creationCard(g) {
    var min = Math.round((g.seconds || 0) / 60);
    var card = document.createElement('div');
    card.className = 'create-mine-card';
    var cover = document.createElement('div');
    cover.className = 'create-mine-cover';
    if (g.hasCover && g.id) { var im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.src = '/api/creation-cover?id=' + g.id; cover.appendChild(im); }
    var meta = document.createElement('div'); meta.className = 'create-mine-meta';
    var t = document.createElement('div'); t.className = 'create-mine-title'; t.textContent = g.title || g.slug || 'Untitled';
    var stats = document.createElement('div'); stats.className = 'create-mine-stats';
    stats.textContent = (g.plays || 0) + ' plays · ' + min + ' min played · ' + (g.likes || 0) + ' likes';
    var acts = document.createElement('div'); acts.className = 'create-mine-acts';
    // Play (instrumented wrapper)
    var play = document.createElement('a'); play.className = 'create-mini-btn'; play.textContent = 'Play'; play.target = '_blank'; play.rel = 'noopener';
    play.href = '/cplay?id=' + encodeURIComponent(g.id) + '&slug=' + encodeURIComponent(g.slug || '') + '&title=' + encodeURIComponent(g.title || '') + '&by=' + encodeURIComponent(myName || '');
    acts.appendChild(play);
    // Publish / unpublish
    var pub = document.createElement('button'); pub.type = 'button'; pub.className = 'create-mini-btn' + (g.published ? ' on' : '');
    pub.textContent = g.published ? 'Published ✓' : 'Publish to gallery';
    pub.addEventListener('click', function () { pub.disabled = true; creationAction(g.id, g.published ? 'unpublish' : 'publish', loadCreations); });
    acts.appendChild(pub);
    // Delete
    var del = document.createElement('button'); del.type = 'button'; del.className = 'create-mini-btn danger'; del.textContent = 'Delete';
    del.addEventListener('click', function () { if (confirm('Delete "' + (g.title || g.slug) + '"? This cannot be undone.')) { del.disabled = true; creationAction(g.id, 'delete', loadCreations); } });
    acts.appendChild(del);
    meta.appendChild(t); meta.appendChild(stats); meta.appendChild(acts);
    card.appendChild(cover); card.appendChild(meta);
    return card;
  }

  function creationAction(id, action, cb) {
    if (!id) return;
    fetch('/api/me/creations', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id: id, action: action }) })
      .then(function (r) { return r.json(); })
      .then(function () { if (cb) cb(); })
      .catch(function () {});
  }

  function saveCreatorName() {
    var n = (els.creatorName.value || '').trim().slice(0, 24);
    if (!n) return;
    myName = n;
    fetch('/api/me/name', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ name: n }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.displayName) { els.creatorName.value = d.displayName; myName = d.displayName; } })
      .catch(function () {});
  }

  // ---- pay (placeholder) ----
  function pay() {
    els.pay.disabled = true;
    capture('vibe_pay_click', {});
    fetch('/api/gen/pay', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json(); })
      .then(function () { show(els.payNote, true); })
      .catch(function () { show(els.payNote, true); })
      .then(function () { setTimeout(function () { els.pay.disabled = false; }, 1500); });
  }

  // ---- wire up ----
  els.prompt.addEventListener('input', function () {
    els.counter.textContent = (els.prompt.value || '').length + ' / 500';
    if (els.msg.textContent) setMsg('', '');
  });
  els.generate.addEventListener('click', generate);
  els.pay.addEventListener('click', pay);
  if (els.creatorName) els.creatorName.addEventListener('change', saveCreatorName);
  els.again.addEventListener('click', function () {
    show(els.status, false); show(els.composer, true);
    els.prompt.value = ''; els.counter.textContent = '0 / 500';
    loadQuota();
  });
  els.retry.addEventListener('click', function () {
    show(els.status, false); show(els.composer, true);
    loadQuota();
  });

  // Resume an in-flight job from a previous visit.
  function resume() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(JOB_KEY) || 'null'); } catch (e) {}
    if (saved && saved.id && (Date.now() - (saved.ts || 0) < 24 * 3600 * 1000)) {
      show(els.composer, false);
      show(els.status, true);
      show(els.building, true);
      startPolling(saved.id);
    } else {
      clearJob();
    }
  }

  loadQuota().then(resume);
})();
