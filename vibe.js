// vibe.js -- the /create page logic. Lets a signed-in player describe a game and
// have it built (async, by Tim's Mac relay) and played back in a sandboxed iframe.
// Economy: 60 tokens per game. New accounts get a 60-token signup bonus on first
// sign-in (covers the first game), then earn more by play (+1/min), rate (+5), or
// daily login (+10), or a (placeholder) buy button. Dependency-free. Tim 2026-06-16.
(function () {
  'use strict';

  var POLL_MS = 4000;
  var JOB_KEY = 'vibe_job';
  var MAX_REFERENCE_SOURCE_BYTES = 12 * 1024 * 1024;
  var MAX_REFERENCE_UPLOAD_BYTES = 2 * 1024 * 1024;
  var MAX_REFERENCE_EDGE = 1600;
  var REFERENCE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    prompts: $('create-prompts'),
    signin: $('create-signin'),
    composer: $('create-composer'),
    prompt: $('vibe-prompt'),
    promptLabel: $('vibe-prompt-label'),
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
    improveContext: $('vibe-improve-context'),
    improveTitle: $('vibe-improve-title'),
    improveCancel: $('vibe-improve-cancel'),
    reference: $('vibe-reference'),
    referenceInput: $('vibe-reference-input'),
    referencePreview: $('vibe-reference-preview'),
    referenceImage: $('vibe-reference-image'),
    referenceName: $('vibe-reference-name'),
    referenceDetail: $('vibe-reference-detail'),
    referenceRemove: $('vibe-reference-remove'),
    referenceStatus: $('vibe-reference-status'),
  };
  if (!els.composer) return;

  var pollTimer = null;
  var myName = '';
  var currentUid = '';
  var partnerAccess = false;
  var quotaCanGenerate = false;
  var submitInFlight = false;
  var referenceLoading = false;
  var referenceSelectionToken = 0;
  var selectedReference = null;
  var activeIteration = null;
  var pendingRequestId = '';
  var inspectingRecent = false;
  var lastLogEventKey = '';
  var recentOffset = 0;
  var recentSeen = Object.create(null);
  var lastBuild = null, buildTicker = null;
  // Studio Max runs one full generation and one polish/QA pass. Keep this
  // conservative until enough two-pass production canaries establish a useful
  // percentile; the UI should never imply that a fast draft is the final game.
  var BUILD_ETA_MIN = 20, BUILD_ETA_MAX = 45;

  function show(el, on) { if (el) el.hidden = !on; }
  function setMsg(t, kind) { els.msg.textContent = t || ''; els.msg.className = 'create-msg' + (kind ? ' ' + kind : ''); }
  function capture(ev, props) { try { if (window.posthog) window.posthog.capture(ev, props || {}); } catch (e) {} }

  // Brief, dependency-free confirmation toast. List/unlist/delete do NOT
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
    bad_form: 'Something went wrong. Try again.',
    image_not_available: 'Image references are currently available in the private Partner Studio.',
    image_count: 'Attach one reference image at a time.',
    image_missing: 'Choose a PNG, JPG, or WebP image.',
    image_type: 'Use a PNG, JPG, or WebP image.',
    image_too_small: 'That image appears to be empty.',
    image_too_large: 'That image is too large. Try a smaller screenshot or sketch.',
    image_dimensions: 'That image has unusually large dimensions. Export a version no larger than 2000 pixels per side.',
    image_unreadable: 'That image could not be read. Try exporting it as PNG or JPG.',
    image_mismatch: 'That file does not match its image type. Try exporting it again.',
    already_improving: 'You are already improving this game - hang tight.',
    iterate_not_found: 'That game could not be found.',
    builder_unavailable: 'The public builder is paused while the partner Codex pilot is tested.',
  };

  function syncGenerateButton() {
    els.generate.disabled = !quotaCanGenerate || referenceLoading || submitInFlight;
    // Freeze the request inputs while a multipart submit is in flight. This
    // keeps the visible draft aligned with the idempotency nonce if the network
    // response is interrupted and the player retries the same request.
    els.prompt.disabled = submitInFlight;
    if (els.referenceInput) els.referenceInput.disabled = submitInFlight || referenceLoading;
    if (els.referenceRemove) els.referenceRemove.disabled = submitInFlight;
    if (els.improveCancel) els.improveCancel.disabled = submitInFlight;
  }

  function setReferenceStatus(text, kind) {
    if (!els.referenceStatus) return;
    els.referenceStatus.textContent = text || '';
    els.referenceStatus.className = 'create-reference-status' + (kind ? ' ' + kind : '');
  }

  function clearReference(announce) {
    pendingRequestId = '';
    referenceSelectionToken++;
    referenceLoading = false;
    if (selectedReference && selectedReference.previewUrl) URL.revokeObjectURL(selectedReference.previewUrl);
    selectedReference = null;
    if (els.referenceInput) els.referenceInput.value = '';
    if (els.referenceImage) els.referenceImage.removeAttribute('src');
    if (els.referenceName) els.referenceName.textContent = 'Reference ready';
    if (els.referenceDetail) els.referenceDetail.textContent = '';
    show(els.referencePreview, false);
    setReferenceStatus(announce ? 'Reference removed.' : '', '');
    syncGenerateButton();
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('image_unreadable'));
        else resolve(blob);
      }, type, quality);
    });
  }

  function decodeReference(file) {
    if (window.createImageBitmap) {
      return window.createImageBitmap(file).then(function (bitmap) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: function () { try { bitmap.close(); } catch (e) {} },
        };
      });
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, close: function () {} });
      };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image_unreadable')); };
      image.src = url;
    });
  }

  function normalizeReference(file) {
    var sourceType = String(file && file.type || '').toLowerCase();
    var trustedExtension = /\.(?:png|jpe?g|webp)$/i.test(String(file && file.name || ''));
    if (!file || (sourceType && REFERENCE_TYPES.indexOf(sourceType) < 0) || (!sourceType && !trustedExtension)) {
      return Promise.reject(new Error('image_type'));
    }
    if (file.size < 32) return Promise.reject(new Error('image_too_small'));
    if (file.size > MAX_REFERENCE_SOURCE_BYTES) return Promise.reject(new Error('image_too_large'));

    return decodeReference(file).then(function (decoded) {
      if (!decoded.width || !decoded.height || decoded.width * decoded.height > 40 * 1000 * 1000) {
        decoded.close();
        throw new Error('image_too_large');
      }
      var scale = Math.min(1, MAX_REFERENCE_EDGE / Math.max(decoded.width, decoded.height));
      var width = Math.max(1, Math.round(decoded.width * scale));
      var height = Math.max(1, Math.round(decoded.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      var context = canvas.getContext('2d', { alpha: true });
      if (!context) { decoded.close(); throw new Error('image_unreadable'); }
      context.drawImage(decoded.source, 0, 0, width, height);
      decoded.close();
      // Canvas re-encoding removes filenames and normal image metadata while
      // keeping enough resolution for diagrams, UI screenshots, and sketches.
      return canvasBlob(canvas, 'image/webp', 0.9)
        .then(function (blob) {
          return blob.size <= MAX_REFERENCE_UPLOAD_BYTES ? blob : canvasBlob(canvas, 'image/webp', 0.72);
        })
        .then(function (blob) {
          if (REFERENCE_TYPES.indexOf(blob.type) < 0 || blob.size > MAX_REFERENCE_UPLOAD_BYTES) {
            throw new Error('image_too_large');
          }
          return { blob: blob, width: width, height: height };
        });
    });
  }

  function chooseReference(file) {
    clearReference(false);
    var token = referenceSelectionToken;
    referenceLoading = true;
    syncGenerateButton();
    setReferenceStatus('Preparing a private preview...', '');
    normalizeReference(file)
      .then(function (normalized) {
        if (token !== referenceSelectionToken) return;
        var previewUrl = URL.createObjectURL(normalized.blob);
        selectedReference = {
          blob: normalized.blob,
          previewUrl: previewUrl,
          name: String(file.name || 'Reference image'),
          width: normalized.width,
          height: normalized.height,
        };
        els.referenceImage.src = previewUrl;
        els.referenceName.textContent = selectedReference.name;
        els.referenceDetail.textContent = normalized.width + ' × ' + normalized.height + ' · ' + Math.max(1, Math.round(normalized.blob.size / 1024)) + ' KB · metadata removed';
        show(els.referencePreview, true);
        setReferenceStatus('Reference ready. Say what interaction or layout it should explain.', '');
      })
      .catch(function (error) {
        if (token !== referenceSelectionToken) return;
        var code = String(error && error.message || 'image_unreadable');
        if (els.referenceInput) els.referenceInput.value = '';
        setReferenceStatus(ERRORS[code] || ERRORS.image_unreadable, 'err');
      })
      .then(function () {
        if (token !== referenceSelectionToken) return;
        referenceLoading = false;
        syncGenerateButton();
      });
  }

  // ---- quota / routing ----
  function loadQuota() {
    return fetch('/api/gen/quota', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (q) {
        if (!q.signed_in) {
          resetComposerDraft();
          currentUid = '';
          partnerAccess = false;
          quotaCanGenerate = false;
          clearReference(false);
          show(els.signin, true); show(els.composer, false); show(els.mine, false); show(els.stats, false);
          show(els.partner, false); show(els.reference, false); show(els.recent, false);
          return q;
        }
        var nextUid = String(q.uid || '');
        if (currentUid && nextUid && currentUid !== nextUid) resetComposerDraft();
        currentUid = nextUid;
        show(els.signin, false);
        show(els.composer, true);
        partnerAccess = q.partnerAccess === true;
        show(els.partner, partnerAccess);
        show(els.reference, partnerAccess);
        if (!partnerAccess && selectedReference) clearReference(false);
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
    quotaCanGenerate = canGen;
    els.prompts.hidden = false;
    els.prompts.textContent = !builderAvailable
      ? 'Builder paused'
      : (isPartner ? 'Partner access' : (canGen ? (cost + ' tokens ready') : (tokens + ' / ' + cost + ' tokens')));
    show(els.pay, builderAvailable);
    if (!builderAvailable) {
      show(els.gate, true);
      els.gateFill.style.width = '0%';
      els.gateText.textContent = 'The public builder is paused while the partner Codex pilot is tested. Existing games remain available.';
    } else if (canGen) {
      show(els.gate, false);
    } else {
      show(els.gate, true);
      els.gateFill.style.width = Math.min(100, Math.round((tokens / cost) * 100)) + '%';
      var need = q.tokensToNext != null ? q.tokensToNext : Math.max(0, cost - tokens);
      els.gateText.textContent = 'Earn ' + need + ' more tokens to make a game - play (+1/min), rate a game (+5), or log in daily (+10).';
    }
    syncGenerateButton();
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
    if (referenceLoading) { setMsg('Wait for the reference preview to finish.', 'warn'); return; }
    submitInFlight = true;
    syncGenerateButton();
    setMsg(activeIteration ? 'Sending your improvement...' : 'Sending your idea...', '');
    var form = new FormData();
    form.append('prompt', prompt);
    // Retry deduplication is deliberately limited to the comped partner lane.
    // Paid/public generation needs a strongly consistent server reservation
    // before it can safely make the same promise.
    if (partnerAccess) {
      if (!pendingRequestId) pendingRequestId = createClientRequestId();
      form.append('requestId', pendingRequestId);
    } else {
      pendingRequestId = '';
    }
    if (activeIteration && activeIteration.id) form.append('iterateId', activeIteration.id);
    if (selectedReference && partnerAccess) form.append('referenceImage', selectedReference.blob, 'studio-reference.webp');
    capture(activeIteration ? 'vibe_improve_submit' : 'vibe_generate_submit', {
      len: prompt.length,
      has_reference: !!selectedReference,
    });
    fetch('/api/gen/submit', {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    })
      .then(function (r) {
        return r.json().then(
          function (d) { return { ok: r.ok, d: d, ambiguous: false }; },
          function () { return { ok: false, d: {}, ambiguous: r.ok }; },
        );
      })
      .then(function (res) {
        if (res.ok && res.d && res.d.id) {
          setMsg('', '');
          beginJob(res.d.id);
        } else {
          var code = (res.d && res.d.error) || 'enqueue_failed';
          if (!res.ambiguous) pendingRequestId = '';
          setMsg(res.ambiguous
            ? (partnerAccess
              ? 'The response was interrupted. Retry - Studio will safely resume the same request.'
              : 'The response was interrupted. Check Recent builds before trying again.')
            : (ERRORS[code] || (activeIteration ? 'Could not start the improvement.' : 'Could not start the build.')), 'err');
          submitInFlight = false;
          syncGenerateButton();
          if (code === 'no_prompts' || code === 'need_tokens') loadQuota();
        }
      })
      .catch(function () {
        setMsg(partnerAccess
          ? 'Network error. Retry - Studio will safely resume the same request.'
          : 'Network error. Check Recent builds before trying again.', 'err');
        submitInFlight = false;
        syncGenerateButton();
      });
  }

  function beginJob(id) {
    pendingRequestId = '';
    inspectingRecent = false;
    els.again.textContent = 'Make another';
    els.retry.textContent = 'Try again';
    submitInFlight = false;
    syncGenerateButton();
    saveJob(id, Date.now(), activeIteration);
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
        if (s.status === 'ready' && s.playUrl) { stopPolling(); onReady(s, { preserveDraft: inspectingRecent }); }
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
      var parts = [at, String(event.stage || 'build'), 'attempt ' + (+event.attempt || 1)];
      if (event.pass) parts.push('pass ' + (+event.pass || 1) + ' of 2');
      if (event.model) parts.push(String(event.model).slice(0, 48));
      if (event.reasoningEffort) parts.push(String(event.reasoningEffort).slice(0, 16) + ' reasoning');
      if (Number.isFinite(+event.durationMs) && +event.durationMs > 0) {
        parts.push((+event.durationMs / 1000).toFixed(1) + 's');
      }
      if (Number.isFinite(+event.inputTokens) && Number.isFinite(+event.outputTokens)) {
        parts.push((+event.inputTokens).toLocaleString() + ' input / ' + (+event.outputTokens).toLocaleString() + ' output tokens');
      }
      if (Number.isFinite(+event.reasoningTokens) && +event.reasoningTokens > 0) {
        parts.push((+event.reasoningTokens).toLocaleString() + ' reasoning tokens');
      }
      meta.textContent = parts.join(' · ');
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
      var elapsedMin = Math.max(0, Math.floor((serverNow - (s.buildingAt || s.updatedAt || serverNow)) / 60000));
      var tail = (s.attempts || 0) > 0 ? ' - attempt ' + ((s.attempts || 0) + 1) + ' after a restart.' : '.';
      var latest = Array.isArray(s.events) && s.events.length ? s.events[s.events.length - 1] : null;
      phaseEl.textContent = latest && latest.stage === 'polish'
        ? 'Polishing and QA in Studio Max'
        : (latest && latest.stage === 'validation'
          ? 'Validating your finished game'
          : (latest && latest.stage === 'smoke'
            ? 'Running the final browser test'
            : 'Building your game in Studio Max'));
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
  function saveJob(id, ts, iteration) {
    var key = jobStorageKey();
    if (!key) return;
    var saved = { id: id, ts: ts || Date.now() };
    if (iteration && iteration.id) {
      saved.iterateId = iteration.id;
      saved.iterateTitle = String(iteration.title || 'your game').slice(0, 100);
    }
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {}
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

  function onReady(s, options) {
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
    // A completed job no longer needs the private Blob/object URL or the
    // already-applied instruction. Keep failed jobs intact for explicit retry.
    if (!options || options.preserveDraft !== true) resetComposerDraft();
    if (inspectingRecent) els.again.textContent = 'Back to draft';
    loadCreations();
    loadRecentJobs();
  }

  function onFailed() {
    show(els.building, false);
    show(els.ready, false);
    show(els.failed, true);
    capture('vibe_generate_failed', {});
    if (inspectingRecent) els.retry.textContent = 'Back to draft';
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
    inspectingRecent = true;
    saveJob(job.id, job.queuedAt || Date.now(), null);
    show(els.composer, false);
    show(els.status, true);
    show(els.building, false);
    show(els.ready, false);
    show(els.failed, false);
    lastBuild = { s: job, recvAt: Date.now() };
    resetBuildLog();
    renderBuildLog(job.events || []);
    if (job.status === 'ready' && job.playUrl) onReady(job, { preserveDraft: true });
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

  // Switch the shared composer into an in-place improvement. This replaces the
  // old window.prompt so a change request can use the same private image input
  // as a fresh build, with a visible target and a cancellable mode.
  function improve(g) {
    if (!g || !g.id) return;
    if (els.status && !els.status.hidden && els.building && !els.building.hidden) {
      toast('Let the current Studio build finish first.', 'err');
      return;
    }
    var switchingTarget = !activeIteration || activeIteration.id !== g.id;
    if (switchingTarget) {
      els.prompt.value = '';
      els.counter.textContent = '0 / 500';
      clearReference(false);
    }
    activeIteration = { id: g.id, title: g.versionName || g.title || g.slug || 'your game' };
    pendingRequestId = '';
    if (els.improveTitle) els.improveTitle.textContent = activeIteration.title;
    show(els.improveContext, true);
    if (els.promptLabel) els.promptLabel.textContent = 'What should change?';
    els.prompt.setAttribute('aria-describedby', 'vibe-improve-title');
    els.prompt.placeholder = 'Describe the mechanic or layout change. If you attach an image, say exactly what it demonstrates.';
    els.generate.textContent = 'Improve game';
    clearJob(); stopPolling();
    show(els.status, false); show(els.composer, true);
    setMsg('', '');
    syncGenerateButton();
    try { els.composer.scrollIntoView({ block: 'start' }); } catch (e) {}
    requestAnimationFrame(function () { try { els.prompt.focus(); } catch (e) {} });
  }

  function resetComposerDraft() {
    pendingRequestId = '';
    activeIteration = null;
    show(els.improveContext, false);
    if (els.promptLabel) els.promptLabel.textContent = 'Your game idea';
    els.prompt.removeAttribute('aria-describedby');
    els.prompt.placeholder = 'A one-tap game where a frog hops between lily pads and dodges splashes';
    els.generate.textContent = 'Generate my game';
    els.prompt.value = '';
    els.counter.textContent = '0 / 500';
    clearReference(false);
    syncGenerateButton();
  }

  function cancelImprove() {
    resetComposerDraft();
    setMsg('', '');
    requestAnimationFrame(function () { try { els.prompt.focus(); } catch (e) {} });
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
    var imp = document.createElement('button'); imp.type = 'button'; imp.className = 'create-mini-btn';
    var impLabel = document.createElement('span'); impLabel.textContent = 'Improve';
    var impContext = document.createElement('span'); impContext.className = 'visually-hidden'; impContext.textContent = ' ' + (g.versionName || g.title || g.slug || 'game');
    imp.appendChild(impLabel); imp.appendChild(impContext);
    imp.addEventListener('click', function () { improve(g); });
    acts.appendChild(imp);
    // List / unlist -- repaint from the API's authoritative {published}
    // response, NOT a re-fetch. KV is eventually consistent, so re-reading
    // /api/me/games right after the write returns the STALE flag and the button
    // silently reverts (the bug Tim hit: publish looked like a no-op until reload).
    var pub = document.createElement('button'); pub.type = 'button';
    function paintPub() {
      pub.className = 'create-mini-btn' + (g.published ? ' on' : '');
      pub.textContent = g.published ? 'Listed in gallery ✓' : 'List in gallery';
      pub.disabled = false;
    }
    paintPub();
    pub.addEventListener('click', function () {
      var want = !g.published;
      // The direct link already works. Listing only makes the game discoverable
      // under the creator's name; returning to unlisted stays frictionless.
      if (want && !confirm('List "' + (g.title || g.slug) + '" in the public gallery?\nIts direct link already works. Listing makes it discoverable on the site.')) return;
      pub.disabled = true;
      pub.textContent = want ? 'Listing...' : 'Unlisting...';
      creationAction(g.id, want ? 'publish' : 'unpublish', function (ok, d) {
        // Paint from the server's authoritative {published}. A missing boolean
        // (even alongside ok) is a failure, not an optimistic assumption.
        if (ok && typeof d.published === 'boolean') {
          g.published = d.published;
          paintPub();
          toast(g.published ? 'Listed! Your game is now in the gallery.' : 'Removed from the gallery. Its direct link still works.');
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
    pendingRequestId = '';
    els.counter.textContent = (els.prompt.value || '').length + ' / 500';
    if (els.msg.textContent) setMsg('', '');
  });
  els.generate.addEventListener('click', generate);
  els.pay.addEventListener('click', pay);
  if (els.referenceInput) els.referenceInput.addEventListener('change', function () {
    var file = els.referenceInput.files && els.referenceInput.files[0];
    if (file) chooseReference(file);
  });
  if (els.referenceRemove) els.referenceRemove.addEventListener('click', function () {
    clearReference(true);
    if (els.referenceInput) els.referenceInput.focus();
  });
  if (els.improveCancel) els.improveCancel.addEventListener('click', cancelImprove);
  if (els.creatorName) els.creatorName.addEventListener('change', saveCreatorName);
  if (els.recentMore) els.recentMore.addEventListener('click', function () { loadRecentJobs(true); });
  els.again.addEventListener('click', function () {
    if (inspectingRecent) { returnToDraft(); return; }
    clearJob(); resetBuildLog();
    show(els.status, false); show(els.composer, true);
    cancelImprove(); clearReference(false);
    els.prompt.value = ''; els.counter.textContent = '0 / 500';
    loadQuota();
  });
  els.retry.addEventListener('click', function () {
    if (inspectingRecent) { returnToDraft(); return; }
    clearJob(); resetBuildLog();
    show(els.status, false); show(els.composer, true);
    loadQuota();
  });

  function returnToDraft() {
    stopPolling(); clearJob(); resetBuildLog();
    inspectingRecent = false;
    els.again.textContent = 'Make another';
    els.retry.textContent = 'Try again';
    show(els.status, false); show(els.composer, true);
    loadQuota();
    requestAnimationFrame(function () { try { els.prompt.focus(); } catch (e) {} });
  }

  function createClientRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID().replace(/-/g, '');
    }
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  // Resume an in-flight job from a previous visit.
  function resume(q) {
    // Status is owner-only. Signed-out visitors and a different signed-in UID
    // must never be trapped behind another account's stale localStorage job.
    if (!q || !q.signed_in || !currentUid) { clearJob(); return; }
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(jobStorageKey()) || 'null'); localStorage.removeItem(JOB_KEY); } catch (e) {}
    if (saved && saved.id && (Date.now() - (saved.ts || 0) < 30 * 24 * 3600 * 1000)) {
      if (saved.iterateId && /^[0-9a-z]{8,40}$/.test(String(saved.iterateId))) {
        activeIteration = { id: String(saved.iterateId), title: String(saved.iterateTitle || 'your game').slice(0, 100) };
        if (els.improveTitle) els.improveTitle.textContent = activeIteration.title;
        show(els.improveContext, true);
        if (els.promptLabel) els.promptLabel.textContent = 'What should change?';
        els.prompt.setAttribute('aria-describedby', 'vibe-improve-title');
        els.prompt.placeholder = 'Describe the mechanic or layout change. If you attach an image, say exactly what it demonstrates.';
        els.generate.textContent = 'Improve game';
      }
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
