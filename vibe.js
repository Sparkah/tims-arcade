// vibe.js -- the /create page logic. Lets a signed-in player describe a game and
// have it built (async, by Tim's Mac relay) and played back in a sandboxed iframe.
// Economy: 60 tokens per game. New accounts get a 60-token signup bonus on first
// sign-in (covers the first game), then earn more by play (+1/min), rate (+5), or
// daily login (+10), or a (placeholder) buy button. Dependency-free. Tim 2026-06-16.
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
    admin: $('vibe-admin'),
    failed: $('create-failed'),
    retry: $('vibe-retry'),
    mine: $('create-mine'),
    list: $('create-list'),
    creatorName: $('vibe-creator-name'),
    stats: $('create-stats'),
    statsGrid: $('create-stats-grid'),
    statsEarn: $('create-stats-earn'),
    partner: $('create-partner'),
    buildLog: $('create-build-log'),
    buildEvents: $('create-build-events'),
    buildLive: $('create-build-log-live'),
    recent: $('create-recent'),
    recentList: $('create-recent-list'),
    recentMore: $('create-recent-more'),
  };
  if (!els.composer) return;

  var pollTimer = null;
  var myName = '';
  var currentUid = '';
  var partnerAccess = false;
  var lastLogEventKey = '';
  var recentOffset = 0;
  var recentSeen = Object.create(null);
  var lastBuild = null, buildTicker = null;
  // Provider-neutral estimate until the trusted Codex lane has enough canary data
  // for a measured percentile rather than a false single-minute promise.
  // Two real trusted-Codex canaries completed in 68s and 98s. Keep a generous
  // buffer for larger prompts and service load without showing the old Claude
  // worker's 20-30 minute estimate.
  var BUILD_ETA_MIN = 2, BUILD_ETA_MAX = 5;

  function show(el, on) { if (el) el.hidden = !on; }
  function setMsg(t, kind) { els.msg.textContent = t || ''; els.msg.className = 'create-msg' + (kind ? ' ' + kind : ''); }
  function capture(ev, props) { try { if (window.posthog) window.posthog.capture(ev, props || {}); } catch (e) {} }

  // Brief, dependency-free confirmation toast. Publish/unpublish/delete do NOT
  // reload the page, so the action needs visible feedback (Tim 2026-06-17: a
  // publish looked like a no-op until a manual reload). Bottom-center, safe-area
  // aware so it clears the iOS Safari toolbar.
  function toast(msg, kind) {
    var t = document.getElementById('vibe-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'vibe-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);color:#fff;padding:11px 17px;border-radius:10px;font-size:14px;line-height:1.3;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:88vw;text-align:center;pointer-events:none;transition:opacity .25s;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#7a2230' : '#1f7a4d';
    t.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.opacity = '0'; }, 3000);
  }

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
    already_improving: 'You are already improving this game - hang tight.',
    iterate_not_found: 'That game could not be found.',
    builder_unavailable: 'The public builder is paused while the partner Codex pilot is tested.',
  };

  // ---- quota / routing ----
  function loadQuota() {
    return fetch('/api/gen/quota', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (q) {
        if (!q.signed_in) {
          currentUid = '';
          show(els.signin, true); show(els.composer, false); show(els.mine, false); show(els.stats, false);
          show(els.partner, false); show(els.recent, false);
          return q;
        }
        currentUid = String(q.uid || '');
        show(els.signin, false);
        show(els.composer, true);
        partnerAccess = q.partnerAccess === true;
        show(els.partner, partnerAccess);
        if (els.creatorName && !els.creatorName.value && q.displayName) els.creatorName.value = q.displayName;
        myName = (els.creatorName && els.creatorName.value) || q.displayName || '';
        renderQuota(q);
        loadCreations();
        loadRecentJobs();
        return q;
      })
      .catch(function () { setMsg('Could not load your account. Refresh to retry.', 'err'); });
  }

  function renderQuota(q) {
    var cost   = q.generationCost || 60;
    var tokens = q.tokens || 0;
    var isPartner = q.partnerAccess === true;
    var builderAvailable = isPartner || q.builderAvailable !== false;
    var canGen = builderAvailable && (isPartner || q.canGenerate || tokens >= cost);
    els.prompts.hidden = false;
    els.prompts.textContent = !builderAvailable
      ? 'Builder paused'
      : (isPartner ? 'Partner access' : (canGen ? (cost + ' tokens ready') : (tokens + ' / ' + cost + ' tokens')));
    show(els.pay, builderAvailable);
    if (!builderAvailable) {
      show(els.gate, true);
      els.generate.disabled = true;
      els.gateFill.style.width = '0%';
      els.gateText.textContent = 'The public builder is paused while the partner Codex pilot is tested. Existing games remain available.';
    } else if (canGen) {
      show(els.gate, false);
      els.generate.disabled = false;
    } else {
      show(els.gate, true);
      els.generate.disabled = true;
      els.gateFill.style.width = Math.min(100, Math.round((tokens / cost) * 100)) + '%';
      var need = q.tokensToNext != null ? q.tokensToNext : Math.max(0, cost - tokens);
      els.gateText.textContent = 'Earn ' + need + ' more tokens to make a game - play (+1/min), rate a game (+5), or log in daily (+10).';
    }
    renderStats(q);
  }

  // Token analytics -- ONLY data we already store: balance + lifetime-earned + login
  // streak (we keep no per-source breakdown), plus the fixed cost. Tim 2026-06-17.
  function renderStats(q) {
    if (!els.stats || !els.statsGrid) return;
    // Coerce to numbers so a corrupted KV field can never become markup below.
    var cost = +q.generationCost || 60;
    var tokens = +q.tokens || 0;
    var lifetime = +q.lifetime || 0;
    var streak = +q.streak || 0, best = +q.bestStreak || 0;
    var canMake = Math.floor(tokens / cost);
    var tiles = q.partnerAccess === true ? [
      ['Included', 'game builds / improvements'],
      [q.dailyLimit || 20, 'daily safety limit'],
      [tokens, 'player tokens unchanged'],
      [lifetime, 'earned all-time'],
      [streak + 'd', 'login streak' + (best > streak ? ' (best ' + best + 'd)' : '')],
    ] : [
      [tokens, 'tokens now'],
      [canMake, canMake === 1 ? 'game you can make' : 'games you can make'],
      [cost, 'cost per game / improvement'],
      [lifetime, 'earned all-time'],
      [streak + 'd', 'login streak' + (best > streak ? ' (best ' + best + 'd)' : '')],
    ];
    var fragment = document.createDocumentFragment();
    tiles.forEach(function (t) {
      var tile = document.createElement('div');
      tile.className = 'create-stat';
      var num = document.createElement('div');
      num.className = 'n';
      num.textContent = t[0];
      var label = document.createElement('div');
      label.className = 'l';
      label.textContent = t[1];
      tile.appendChild(num);
      tile.appendChild(label);
      fragment.appendChild(tile);
    });
    els.statsGrid.replaceChildren(fragment);
    if (els.statsEarn) els.statsEarn.textContent = q.partnerAccess === true
      ? 'Partner builds do not spend or refund player tokens. Ownership, moderation, one-update-at-a-time, rate limits, and the daily safety limit still apply.'
      : 'Earn tokens by playing (+1/min), rating a game (+5, after 5 min on it), and logging in daily (+10, with bonuses at 3/7/14/30/60-day streaks). Each new game or improvement costs ' + cost + ' tokens.';
    show(els.stats, true);
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
    saveJob(id, Date.now());
    show(els.composer, false);
    show(els.status, true);
    show(els.building, true);
    show(els.ready, false);
    show(els.failed, false);
    resetBuildLog();
    focusStatus();
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
    fetch('/api/gen/status?id=' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401 || r.status === 404) {
          dropInaccessibleJob();
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then(function (s) {
        if (!s) return;
        renderBuildLog(s.events || []);
        lastBuild = { s: s, recvAt: Date.now() };
        if (s.status === 'ready' && s.playUrl) { stopPolling(); onReady(s); }
        else if (s.status === 'failed') { stopPolling(); onFailed(s); }
        else { renderBuildStatus(); }   // pending/building -> live status
      })
      .catch(function () {});
  }

  // Live, reload-visible build progress: elapsed, ~ETA, attempt count, retry reason
  // (Tim 2026-06-15: "not just hanging there building"). Re-rendered every second
  // off the last poll + a skew-corrected local clock.
  function friendlyErr(e) {
    e = String(e || '');
    if (/timeout/i.test(e)) return 'the studio was busy and it timed out';
    if (/smoke/i.test(e)) return 'a browser smoke-test failure';
    if (/html|empty|large|level|creator/i.test(e)) return 'a game-file validation failure';
    if (/limit|busy|capacity/i.test(e)) return 'the studio was temporarily busy';
    return 'a temporary hiccup';
  }

  function resetBuildLog() {
    lastLogEventKey = '';
    if (els.buildEvents) els.buildEvents.replaceChildren();
    if (els.buildLive) els.buildLive.textContent = '';
  }

  function renderBuildLog(events) {
    if (!els.buildEvents) return;
    var list = Array.isArray(events) ? events : [];
    var fragment = document.createDocumentFragment();
    list.forEach(function (event) {
      var item = document.createElement('li');
      item.className = 'create-build-event';
      var message = document.createElement('span');
      message.textContent = event.message || 'Build updated.';
      item.appendChild(message);
      if (event.code) {
        var code = document.createElement('span');
        code.className = 'create-build-event-code';
        code.textContent = ' [' + String(event.code).slice(0, 48) + ']';
        item.appendChild(code);
      }
      var meta = document.createElement('span');
      meta.className = 'create-build-event-meta';
      var at = event.ts ? new Date(event.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'time unavailable';
      meta.textContent = at + ' · ' + String(event.stage || 'build') + ' · attempt ' + (+event.attempt || 1);
      item.appendChild(meta);
      fragment.appendChild(item);
    });
    els.buildEvents.replaceChildren(fragment);

    var latest = list[list.length - 1];
    if (!latest) return;
    var key = [latest.stage, latest.state, latest.code, latest.attempt, latest.ts].join(':');
    if (key !== lastLogEventKey) {
      lastLogEventKey = key;
      if (els.buildLive) els.buildLive.textContent = latest.message || 'Build updated.';
    }
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
        detailEl.textContent = 'Your game starts building when the studio is online. Builds usually take about ' + BUILD_ETA_MIN + '-' + BUILD_ETA_MAX + ' minutes.';
      }
    } else if (s.status === 'building') {
      var elapsedMin = Math.max(0, Math.floor((serverNow - (s.updatedAt || serverNow)) / 60000));
      var tail = (s.attempts || 0) > 0 ? ' - attempt ' + ((s.attempts || 0) + 1) + ' after a restart.' : '.';
      phaseEl.textContent = 'Building your game now';
      if (elapsedMin < BUILD_ETA_MIN) {
        detailEl.textContent = elapsedMin + ' min elapsed - builds usually take ' + BUILD_ETA_MIN + '-' + BUILD_ETA_MAX + ' min total' + tail;
      } else if (elapsedMin < BUILD_ETA_MAX) {
        detailEl.textContent = elapsedMin + ' min elapsed - inside the usual ' + BUILD_ETA_MIN + '-' + BUILD_ETA_MAX + ' min build window' + tail;
      } else {
        detailEl.textContent = elapsedMin + ' min elapsed - wrapping up, almost there' + tail;
      }
    }
  }

  function jobStorageKey() { return currentUid ? JOB_KEY + ':' + currentUid : ''; }
  function saveJob(id, ts) {
    var key = jobStorageKey();
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify({ id: id, ts: ts || Date.now() })); } catch (e) {}
  }
  function clearJob() {
    var key = jobStorageKey();
    try {
      if (key) localStorage.removeItem(key);
      // Never resume the old origin-wide key: it may belong to a different
      // signed-in account on the same browser profile.
      localStorage.removeItem(JOB_KEY);
    } catch (e) {}
  }
  function focusStatus() {
    if (!els.status) return;
    requestAnimationFrame(function () { try { els.status.focus({ preventScroll: true }); } catch (e) { try { els.status.focus(); } catch (_) {} } });
  }
  function dropInaccessibleJob() {
    stopPolling();
    clearJob();
    resetBuildLog();
    lastBuild = null;
    show(els.status, false);
    show(els.composer, false);
    // Refresh auth/quota so a 401 shows sign-in and a same-browser account
    // switch shows that account's composer, instead of trusting stale JS state.
    loadQuota().then(function (q) {
      var target = q && q.signed_in
        ? els.prompt
        : (els.signin && els.signin.querySelector('a[href], button, [tabindex]:not([tabindex="-1"])'));
      if (!target) return;
      requestAnimationFrame(function () {
        try { target.focus({ preventScroll: true }); }
        catch (e) { try { target.focus(); } catch (_) {} }
      });
    });
  }

  function onReady(s) {
    show(els.building, false);
    show(els.failed, false);
    show(els.ready, true);
    els.readyTitle.textContent = (s.versionName || s.title ? '"' + (s.versionName || s.title) + '" is ready!' : 'Your game is ready!');
    // Full-screen open uses the WRAPPED player (/cplay) so the game keeps the same
    // back-to-gallery chrome as published games (s.playUrl is the RAW /g/<id> sandbox
    // host -- bare, no nav). The PLAY id is parsed from playUrl, so this is correct for
    // a fresh build (/g/<jobId>) AND an in-place upgrade (/g/<baseId>). The inline
    // preview iframe still embeds the raw host (create.html supplies its own back link).
    var playId = (String(s.playUrl || '').match(/\/g\/([0-9a-z]{8,40})/) || [])[1] || '';
    if (playId) {
      var qp = new URLSearchParams({ id: playId });
      if (s.slug)  qp.set('slug', s.slug);
      if (s.title) qp.set('title', s.title);
      if (myName)  qp.set('by', myName);
      els.open.href = '/cplay?' + qp.toString();
      if (els.admin) els.admin.href = '/creator-admin?id=' + encodeURIComponent(playId);
    } else {
      els.open.href = s.playUrl || '#';
      if (els.admin) els.admin.href = '/creator';
    }
    els.frameWrap.replaceChildren();
    var iframe = document.createElement('iframe');
    iframe.className = 'create-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    iframe.setAttribute('allow', 'autoplay');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('title', s.title || 'Your game');
    iframe.src = s.playUrl;
    els.frameWrap.appendChild(iframe);
    capture('vibe_generate_ready', { slug: s.slug || '' });
    loadCreations();
    loadRecentJobs();
  }

  function onFailed() {
    show(els.building, false);
    show(els.ready, false);
    show(els.failed, true);
    capture('vibe_generate_failed', {});
    loadRecentJobs();
  }

  // Recent jobs are indexed by owner UID, so this includes first-build failures
  // that never created an upload card. No KV LIST is used server-side.
  function loadRecentJobs(append) {
    if (!els.recent || !els.recentList) return;
    if (!append) {
      recentOffset = 0;
      recentSeen = Object.create(null);
      els.recentList.replaceChildren();
    }
    if (els.recentMore) els.recentMore.disabled = true;
    fetch('/api/gen/jobs?limit=20&offset=' + recentOffset, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var jobs = data && Array.isArray(data.jobs) ? data.jobs : [];
        var fragment = document.createDocumentFragment();
        jobs.forEach(function (job) {
          if (!job || !job.id || recentSeen[job.id]) return;
          recentSeen[job.id] = true;
          fragment.appendChild(recentJobItem(job));
        });
        els.recentList.appendChild(fragment);
        recentOffset = data && Number.isFinite(Number(data.nextOffset))
          ? Math.max(recentOffset, Number(data.nextOffset))
          : recentOffset + jobs.length;
        var hasAny = els.recentList.children.length > 0;
        show(els.recent, hasAny);
        show(els.recentMore, !!(data && data.hasMore && hasAny));
        if (els.recentMore) els.recentMore.disabled = false;
      })
      .catch(function () { if (els.recentMore) els.recentMore.disabled = false; });
  }

  function recentJobItem(job) {
    var item = document.createElement('li');
    item.className = 'create-recent-item';
    var copy = document.createElement('span');
    copy.className = 'create-recent-copy';
    var title = document.createElement('span');
    title.className = 'create-recent-title';
    title.textContent = job.versionName || job.title || 'Game build';
    var meta = document.createElement('span');
    meta.className = 'create-recent-meta';
    var when = job.updatedAt || job.queuedAt;
    var stamp = when ? new Date(when).toLocaleString() : 'time unavailable';
    meta.textContent = String(job.status || 'pending') + ' · ' + stamp + (job.error ? ' · ' + String(job.error).slice(0, 48) : '');
    copy.appendChild(title); copy.appendChild(meta);

    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'create-mini-btn create-recent-open';
    var label = document.createElement('span'); label.textContent = 'View log';
    var context = document.createElement('span'); context.className = 'visually-hidden'; context.textContent = ' for ' + title.textContent;
    open.appendChild(label); open.appendChild(context);
    open.addEventListener('click', function () { inspectRecentJob(job); });

    item.appendChild(copy); item.appendChild(open);
    return item;
  }

  function inspectRecentJob(job) {
    if (!job || !job.id) return;
    saveJob(job.id, job.queuedAt || Date.now());
    show(els.composer, false);
    show(els.status, true);
    show(els.building, false);
    show(els.ready, false);
    show(els.failed, false);
    lastBuild = { s: job, recvAt: Date.now() };
    resetBuildLog();
    renderBuildLog(job.events || []);
    if (job.status === 'ready' && job.playUrl) onReady(job);
    else if (job.status === 'failed') onFailed(job);
    else {
      show(els.building, true);
      renderBuildStatus();
      startPolling(job.id);
    }
    focusStatus();
    try { els.status.scrollIntoView({ block: 'start' }); } catch (e) {}
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
        els.list.replaceChildren();
        mine.forEach(function (g) { els.list.appendChild(creationCard(g)); });
      })
      .catch(function () {});
  }

  // Iterate on an existing creation: prompt a change, enqueue an IN-PLACE upgrade
  // (iterateId), then hand to the shared build/poll UI. onReady shows the upgraded
  // game (status.playUrl points at the base game). Tim 2026-06-17.
  function improve(g) {
    if (!g || !g.id) return;
    var billing = partnerAccess ? 'Included with Partner access.' : 'Costs 60 tokens, like a new build.';
    var change = (window.prompt('What should change or be added to "' + (g.title || g.slug || 'your game') + '"?\n(' + billing + ')') || '').trim();
    if (!change) return;
    if (change.length < 3) { toast('Add a few more words about the change.', 'err'); return; }
    toast('Sending your change...');
    fetch('/api/gen/submit', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ iterateId: g.id, prompt: change }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }, function () { return { ok: false, d: {} }; }); })
      .then(function (res) {
        if (res.ok && res.d && res.d.id) {
          capture('vibe_improve_submit', { id: g.id });
          try { window.scrollTo(0, 0); } catch (e) {}
          beginJob(res.d.id);   // build-status view + polling; onReady shows the upgraded game
        } else {
          var code = (res.d && res.d.error) || 'enqueue_failed';
          toast(ERRORS[code] || 'Could not start the improvement.', 'err');
          if (code === 'need_tokens' || code === 'no_prompts') loadQuota();
        }
      })
      .catch(function () { toast('Network error. Try again.', 'err'); });
  }

  function creationCard(g) {
    var min = Math.round((g.seconds || 0) / 60);
    var card = document.createElement('div');
    card.className = 'create-mine-card';
    var cover = document.createElement('div');
    cover.className = 'create-mine-cover';
    if (g.hasCover && g.id) { var im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.src = '/api/creation-cover?id=' + g.id; cover.appendChild(im); }
    var meta = document.createElement('div'); meta.className = 'create-mine-meta';
    var t = document.createElement('div'); t.className = 'create-mine-title'; t.textContent = g.versionName || g.title || g.slug || 'Untitled';
    var summary = document.createElement('div'); summary.className = 'create-mine-summary';
    summary.textContent = g.lastUpdateSummary || '';
    var stats = document.createElement('div'); stats.className = 'create-mine-stats';
    stats.textContent = (g.plays || 0) + ' plays · ' + min + ' min played · ' + (g.likes || 0) + ' likes';
    var acts = document.createElement('div'); acts.className = 'create-mine-acts';
    // Play (instrumented wrapper)
    var play = document.createElement('a'); play.className = 'create-mini-btn'; play.textContent = 'Play'; play.target = '_blank'; play.rel = 'noopener';
    play.href = '/cplay?id=' + encodeURIComponent(g.id) + '&slug=' + encodeURIComponent(g.slug || '') + '&title=' + encodeURIComponent(g.title || '') + '&by=' + encodeURIComponent(myName || '');
    acts.appendChild(play);
    // Admin -- level builder + owner-only iterate controls for this generated game.
    var admin = document.createElement('a'); admin.className = 'create-mini-btn'; admin.textContent = 'Admin';
    admin.href = g.adminUrl || ('/creator-admin?id=' + encodeURIComponent(g.id));
    acts.appendChild(admin);
    // Improve -- iterate IN PLACE: prompt a change, the relay evolves THIS game and
    // overwrites it (same link + plays/likes). Reuses the build/poll UI; costs 60
    // tokens like a fresh build. (Tim 2026-06-17: creation "upgrade" button.)
    var imp = document.createElement('button'); imp.type = 'button'; imp.className = 'create-mini-btn'; imp.textContent = 'Iterate';
    imp.addEventListener('click', function () { improve(g); });
    acts.appendChild(imp);
    // Publish / unpublish -- repaint from the API's authoritative {published}
    // response, NOT a re-fetch. KV is eventually consistent, so re-reading
    // /api/me/games right after the write returns the STALE flag and the button
    // silently reverts (the bug Tim hit: publish looked like a no-op until reload).
    var pub = document.createElement('button'); pub.type = 'button';
    function paintPub() {
      pub.className = 'create-mini-btn' + (g.published ? ' on' : '');
      pub.textContent = g.published ? 'Published ✓' : 'Publish to gallery';
      pub.disabled = false;
    }
    paintPub();
    pub.addEventListener('click', function () {
      var want = !g.published;
      // Publishing makes the game public under the creator's name -- confirm intent
      // (Tim expected a confirmation step). Unpublish stays frictionless.
      if (want && !confirm('Publish "' + (g.title || g.slug) + '" to the public gallery?\nAnyone will be able to play it. You can unpublish anytime.')) return;
      pub.disabled = true;
      pub.textContent = want ? 'Publishing...' : 'Removing...';
      creationAction(g.id, want ? 'publish' : 'unpublish', function (ok, d) {
        // Paint from the server's authoritative {published}. A missing boolean
        // (even alongside ok) is a failure, not an optimistic assumption.
        if (ok && typeof d.published === 'boolean') {
          g.published = d.published;
          paintPub();
          toast(g.published ? 'Published! Your game is now in the gallery.' : 'Removed from the gallery.');
        } else {
          paintPub();   // revert to the prior state
          toast('Could not update. Please try again.', 'err');
        }
      });
    });
    acts.appendChild(pub);
    // Delete -- drop the card straight from the DOM on success (no stale re-fetch).
    var del = document.createElement('button'); del.type = 'button'; del.className = 'create-mini-btn danger'; del.textContent = 'Delete';
    del.addEventListener('click', function () {
      if (!confirm('Delete "' + (g.title || g.slug) + '"? This cannot be undone.')) return;
      del.disabled = true; del.textContent = 'Deleting...';
      creationAction(g.id, 'delete', function (ok, d) {
        if (ok && d.deleted === true) {
          card.remove();
          toast('Deleted.');
          if (!els.list.children.length) show(els.mine, false);
        } else {
          del.disabled = false; del.textContent = 'Delete';
          toast('Could not delete. Please try again.', 'err');
        }
      });
    });
    acts.appendChild(del);
    meta.appendChild(t);
    if (g.lastUpdateSummary) meta.appendChild(summary);
    meta.appendChild(stats); meta.appendChild(acts);
    card.appendChild(cover); card.appendChild(meta);
    return card;
  }

  // onResult(ok, data): ok reflects HTTP status AND the body's {ok:true}; data
  // carries {published} (publish/unpublish) or {deleted} (delete) so callers paint
  // the UI from the server's authoritative state instead of re-fetching stale KV.
  function creationAction(id, action, onResult) {
    if (!id) return;
    fetch('/api/me/creations', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id: id, action: action }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok && !!d && d.ok === true, d: d || {} }; }, function () { return { ok: false, d: {} }; }); })
      .then(function (res) { if (onResult) onResult(res.ok, res.d); })
      .catch(function () { if (onResult) onResult(false, {}); });
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
  if (els.recentMore) els.recentMore.addEventListener('click', function () { loadRecentJobs(true); });
  els.again.addEventListener('click', function () {
    clearJob(); resetBuildLog();
    show(els.status, false); show(els.composer, true);
    els.prompt.value = ''; els.counter.textContent = '0 / 500';
    loadQuota();
  });
  els.retry.addEventListener('click', function () {
    clearJob(); resetBuildLog();
    show(els.status, false); show(els.composer, true);
    loadQuota();
  });

  // Resume an in-flight job from a previous visit.
  function resume(q) {
    // Status is owner-only. Signed-out visitors and a different signed-in UID
    // must never be trapped behind another account's stale localStorage job.
    if (!q || !q.signed_in || !currentUid) { clearJob(); return; }
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(jobStorageKey()) || 'null'); localStorage.removeItem(JOB_KEY); } catch (e) {}
    if (saved && saved.id && (Date.now() - (saved.ts || 0) < 30 * 24 * 3600 * 1000)) {
      show(els.composer, false);
      show(els.status, true);
      show(els.building, true);
      focusStatus();
      startPolling(saved.id);
    } else {
      clearJob();
    }
  }

  loadQuota().then(resume);
})();
