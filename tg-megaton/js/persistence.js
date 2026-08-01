export function createPersistence(options) {
  options = options || {};

  var saveKey = options.saveKey;
  var gameId = options.gameId;
  var telegram = options.telegram;
  var hasTelegram = Boolean(options.hasTelegram);
  var timeoutMs = Number(options.timeoutMs || 8000);
  var getStartMeta = options.getStartMeta || function () { return {}; };
  var stateProtocol = String(options.stateProtocol || 'megaton-state-rev-v1');
  var saveTimer = 0;
  var revisionKey = saveKey + '_remote_rev';

  function normalizeRevision(value) {
    if (value == null || value === '') return null;
    var revision = Number(value);
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
  }

  function readRemoteRevision() {
    try { return normalizeRevision(localStorage.getItem(revisionKey)); } catch (e) { return null; }
  }

  function writeRemoteRevision(value) {
    var revision = normalizeRevision(value);
    if (revision == null) return false;
    try {
      localStorage.setItem(revisionKey, String(revision));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearRemoteRevision() {
    remoteStateRev = null;
    try {
      localStorage.removeItem(revisionKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  var remoteStateRev = readRemoteRevision();

  async function apiPost(path, body, keepalive, requestTimeoutMs) {
    var controller = null;
    var timer = 0;
    if (!keepalive && typeof AbortController === 'function') {
      controller = new AbortController();
      timer = setTimeout(function () {
        try { controller.abort(); } catch (e) {}
      }, Math.max(1000, requestTimeoutMs || timeoutMs));
    }

    var response;
    try {
      response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: Boolean(keepalive),
        signal: controller && controller.signal
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(data.error || ('http_' + response.status));
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function readLocalState() {
    try {
      var raw = localStorage.getItem(saveKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeLocalState(state) {
    if (!state || typeof state !== 'object') return false;
    try {
      localStorage.setItem(saveKey, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function adoptAuthoritativeState(state, stateRev) {
    var revision = normalizeRevision(stateRev);
    if (!state || typeof state !== 'object' || revision == null) return false;
    if (!writeLocalState(state)) return false;
    remoteStateRev = revision;
    writeRemoteRevision(revision);
    return true;
  }

  function stateStamp(state) {
    return state && Number(state.lastSeen || state.state_rev || 0) || 0;
  }

  async function loadRemoteState() {
    if (!hasTelegram) return null;
    try {
      var meta = getStartMeta();
      var data = await apiPost('/api/tg-state', {
        action: 'load',
        game: gameId,
        initData: telegram.initData,
        stateProtocol: stateProtocol,
        source: meta.source,
        startParam: meta.startParam
      }, false, 3500);
      if (!data || !data.state) {
        // A successful empty load means this Telegram account has no row. A
        // cached revision can belong to an earlier reset/account and would make
        // every first save conflict without an authoritative state to adopt.
        if (data && data.ok) clearRemoteRevision();
        return null;
      }

      var local = readLocalState();
      var serverRevision = normalizeRevision(data.stateRev);
      if (serverRevision != null && (remoteStateRev == null || serverRevision > remoteStateRev)) {
        adoptAuthoritativeState(data.state, serverRevision);
      } else if (!local || stateStamp(data.state) >= stateStamp(local)) {
        writeLocalState(data.state);
        if (serverRevision != null) {
          remoteStateRev = serverRevision;
          writeRemoteRevision(serverRevision);
        }
      } else {
        queueSave(600);
      }
      return data.state;
    } catch (e) {
      if (e.status !== 503) console.warn('Megaton Telegram state load failed', e.message);
      return null;
    }
  }

  async function saveRemoteState(reason, keepalive) {
    if (!hasTelegram) return false;
    var state = readLocalState();
    if (!state || typeof state !== 'object') return false;
    try {
      var meta = getStartMeta();
      var body = {
        action: 'save',
        game: gameId,
        initData: telegram.initData,
        stateProtocol: stateProtocol,
        reason: reason || 'autosave',
        source: meta.source,
        startParam: meta.startParam,
        state: state
      };
      if (remoteStateRev != null) body.expectedStateRev = remoteStateRev;
      var saved = await apiPost('/api/tg-state', body, keepalive);
      var savedRevision = normalizeRevision(saved && saved.stateRev);
      if (savedRevision != null) {
        remoteStateRev = savedRevision;
        writeRemoteRevision(savedRevision);
      }
      return true;
    } catch (e) {
      if (e.status === 409 && e.data && e.data.state && normalizeRevision(e.data.stateRev) != null) {
        adoptAuthoritativeState(e.data.state, e.data.stateRev);
      }
      if (e.status !== 503) console.warn('Megaton Telegram state save failed', e.message);
      return false;
    }
  }

  function queueSave(ms) {
    if (!hasTelegram) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveRemoteState('queued'); }, ms || 900);
  }

  return {
    apiPost: apiPost,
    readLocalState: readLocalState,
    writeLocalState: writeLocalState,
    adoptAuthoritativeState: adoptAuthoritativeState,
    getRemoteStateRevision: function () { return remoteStateRev; },
    loadRemoteState: loadRemoteState,
    saveRemoteState: saveRemoteState,
    queueSave: queueSave
  };
}
