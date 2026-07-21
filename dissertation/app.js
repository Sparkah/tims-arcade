(() => {
  "use strict";

  const RATING_DELAY_SECONDS = 10;
  const FRAME_READY_TIMEOUT_MS = 20000;
  const PLAYER_LAYOUT_VERSION = "mobile-fit-v1";
  const STORAGE_KEY = "dissertation-service-evaluation-v2";
  const STORAGE_PROTOCOL = "all-56-v2";
  const LOCAL_PREVIEW_HOSTS = new Set(["localhost", "127.0.0.1"]);
  const MOBILE_PLAYER_QUERY = window.matchMedia("(max-width: 64rem)");
  const PREVIEW_MODE = LOCAL_PREVIEW_HOSTS.has(window.location.hostname)
    && new URLSearchParams(window.location.search).get("preview") === "1";

  const elements = {
    status: document.querySelector("#study-status"),
    statusLabel: document.querySelector("#status-label"),
    closedNotice: document.querySelector("#closed-notice"),
    dataNotice: document.querySelector("#data-notice"),
    startButton: document.querySelector("#start-button"),
    startLabel: document.querySelector("#start-label"),
    buttonNote: document.querySelector("#button-note"),
    introView: document.querySelector("#intro-view"),
    playerView: document.querySelector("#player-view"),
    finishView: document.querySelector("#finish-view"),
    finishHeading: document.querySelector("#finish-heading"),
    finishCopy: document.querySelector("#finish-copy"),
    footerMode: document.querySelector("#footer-mode"),
    progressLabel: document.querySelector("#progress-label"),
    progressMeter: document.querySelector("#progress-meter"),
    frameShell: document.querySelector("#frame-shell"),
    frameLoading: document.querySelector("#frame-loading"),
    frameLoadingCopy: document.querySelector("#frame-loading-copy"),
    frame: document.querySelector("#game-frame"),
    gameHeading: document.querySelector("#game-heading"),
    ratingHelp: document.querySelector("#rating-help"),
    likeButton: document.querySelector("#like-button"),
    dislikeButton: document.querySelector("#dislike-button"),
    skipToggle: document.querySelector("#skip-toggle"),
    skipPanel: document.querySelector("#skip-panel"),
    confirmSkip: document.querySelector("#confirm-skip"),
    retryGame: document.querySelector("#retry-game"),
    technicalFailure: document.querySelector("#technical-failure"),
    responseError: document.querySelector("#response-error"),
  };

  const state = {
    mode: "closed",
    status: null,
    sessionId: null,
    creationId: null,
    games: [],
    position: 0,
    completedCount: 0,
    visibleElapsedMs: 0,
    visibleTickStartedAt: null,
    gameTimingActive: false,
    visibilityLossCount: 0,
    inputMethod: "unknown",
    timer: null,
    submitting: false,
    readyWait: null,
    gameLoadToken: 0,
    lastCheckpointSecond: -1,
    ratingPhase: "locked",
    gameLayouts: null,
    currentFrameLayout: null,
  };

  class ApiError extends Error {
    constructor(code, status) {
      super(code || "The evaluation service could not complete that request.");
      this.code = code || "study_request_failed";
      this.status = status;
    }
  }

  function playerErrorMessage(error, fallback) {
    if (!(error instanceof ApiError)) {
      return error && error.message ? error.message : fallback;
    }
    const messages = {
      play_more_before_rating: "Please play for at least ten seconds before rating.",
      rate_limited: "The evaluation service is busy. Please wait a moment and try again.",
      response_save_failed: "The response could not be confirmed right now.",
      study_database_error: "The evaluation service is temporarily unavailable.",
      study_unavailable: "The evaluation service is temporarily unavailable.",
      game_out_of_order: "Your saved position changed and needs to be refreshed.",
      session_not_active: "This evaluation session is no longer active.",
    };
    return messages[error.code] || fallback;
  }

  function setStatus(mode, label) {
    state.mode = mode;
    elements.status.dataset.state = mode;
    elements.statusLabel.textContent = label;
    elements.status.classList.toggle("is-hidden", !label);
  }

  function setStartState(enabled, label, note) {
    elements.startButton.disabled = !enabled;
    elements.startLabel.textContent = label;
    elements.buttonNote.textContent = note;
    elements.buttonNote.classList.toggle("is-hidden", !note);
  }

  function showError(message) {
    elements.responseError.textContent = message;
    elements.responseError.classList.remove("is-hidden");
  }

  function clearError() {
    elements.responseError.textContent = "";
    elements.responseError.classList.add("is-hidden");
  }

  function setPlayerActive(active) {
    if (active) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.classList.toggle("study-playing", active);
    document.body.classList.toggle("study-playing", active);
    if (!active) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  async function loadGameLayouts() {
    if (state.gameLayouts) return state.gameLayouts;
    const response = await fetch("/dissertation/game-layouts.json?v=mobile-fit-v1", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("The mobile game layout map is unavailable.");
    const payload = await response.json();
    const layouts = payload && payload.games;
    if (payload.playerLayoutVersion !== PLAYER_LAYOUT_VERSION
        || !layouts
        || Object.keys(layouts).length !== 56) {
      throw new Error("The mobile game layout map is incomplete.");
    }
    for (const layout of Object.values(layouts)) {
      const fixed = layout && layout.mode === "fixed";
      const fluid = layout && layout.mode === "fluid";
      if (!fluid && (!fixed
          || !Number.isInteger(layout.width)
          || !Number.isInteger(layout.height)
          || layout.width < 240
          || layout.width > 1200
          || layout.height < 240
          || layout.height > 1200)) {
        throw new Error("The mobile game layout map contains an invalid entry.");
      }
    }
    state.gameLayouts = layouts;
    return layouts;
  }

  function resetFrameFit() {
    state.currentFrameLayout = null;
    elements.frame.dataset.fit = "fluid";
    for (const property of ["width", "height", "left", "top", "transform"]) {
      elements.frame.style.removeProperty(property);
    }
  }

  function applyFrameFit() {
    const layout = state.currentFrameLayout;
    if (!MOBILE_PLAYER_QUERY.matches || !layout || layout.mode !== "fixed") {
      elements.frame.dataset.fit = "fluid";
      for (const property of ["width", "height", "left", "top", "transform"]) {
        elements.frame.style.removeProperty(property);
      }
      return;
    }

    const shellWidth = elements.frameShell.clientWidth;
    const shellHeight = elements.frameShell.clientHeight;
    if (shellWidth < 1 || shellHeight < 1) return;
    const scale = Math.min(
      shellWidth / layout.width,
      shellHeight / layout.height,
      1,
    );
    const renderedWidth = layout.width * scale;
    elements.frame.dataset.fit = "fixed";
    elements.frame.style.width = `${layout.width}px`;
    elements.frame.style.height = `${layout.height}px`;
    elements.frame.style.left = `${Math.max(0, (shellWidth - renderedWidth) / 2)}px`;
    elements.frame.style.top = "0px";
    elements.frame.style.transform = `scale(${scale})`;
  }

  function configureFrameFit(game) {
    resetFrameFit();
    const layout = state.gameLayouts && state.gameLayouts[game.publicId];
    if (!layout) throw new Error("This game is missing mobile layout metadata.");
    state.currentFrameLayout = layout;
    applyFrameFit();
  }

  function randomOrder(items) {
    const result = [...items];
    const random = new Uint32Array(result.length);
    crypto.getRandomValues(random);
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = random[index] % (index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function readStoredSession() {
    if (PREVIEW_MODE) return null;
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!value || value.protocol !== STORAGE_PROTOCOL) return null;
      return value;
    } catch {
      return null;
    }
  }

  function persistSession({ completed = false, current = undefined } = {}) {
    if (PREVIEW_MODE) return;
    const previous = readStoredSession();
    const value = {
      protocol: STORAGE_PROTOCOL,
      creationId: state.creationId,
      sessionId: state.sessionId,
      completed,
    };
    if (!completed && current === undefined && previous && previous.current) {
      value.current = previous.current;
    } else if (!completed && current !== null && current !== undefined) {
      value.current = current;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // The server remains the source of truth. A storage-restricted browser
      // can finish in this tab, but cannot be promised close-and-return resume.
    }
  }

  function clearStoredSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage restrictions.
    }
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });
    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (!response.ok) throw new ApiError(body.error, response.status);
    return body;
  }

  function broadContext() {
    const width = window.innerWidth;
    return {
      deviceClass: width < 640 ? "mobile" : width < 1100 ? "tablet" : "desktop",
      viewportClass: width < 640 ? "narrow" : width < 1100 ? "medium" : "wide",
      inputMethod: state.inputMethod,
      visibilityLossCount: state.visibilityLossCount,
    };
  }

  function visibleElapsedMs() {
    if (!state.gameTimingActive || state.visibleTickStartedAt === null) {
      return state.visibleElapsedMs;
    }
    return state.visibleElapsedMs + Math.max(0, performance.now() - state.visibleTickStartedAt);
  }

  function checkpointTiming() {
    if (!state.sessionId || !state.games[state.position] || !state.gameTimingActive) return;
    persistSession({
      current: {
        publicId: state.games[state.position].publicId,
        visibleElapsedMs: Math.round(visibleElapsedMs()),
        visibilityLossCount: state.visibilityLossCount,
      },
    });
  }

  function pauseVisibleGameTiming() {
    if (!state.gameTimingActive || state.visibleTickStartedAt === null) return;
    state.visibleElapsedMs = visibleElapsedMs();
    state.visibleTickStartedAt = null;
  }

  function resumeVisibleGameTiming() {
    if (!state.gameTimingActive || document.hidden || state.visibleTickStartedAt !== null) return;
    state.visibleTickStartedAt = performance.now();
  }

  function startVisibleGameTiming() {
    state.visibleTickStartedAt = null;
    state.gameTimingActive = true;
    resumeVisibleGameTiming();
  }

  function stopVisibleGameTiming() {
    pauseVisibleGameTiming();
    state.gameTimingActive = false;
  }

  function restoreCheckpoint(publicId) {
    const stored = readStoredSession();
    const current = stored && stored.current;
    if (!current || current.publicId !== publicId) {
      state.visibleElapsedMs = 0;
      state.visibilityLossCount = 0;
      return;
    }
    state.visibleElapsedMs = Math.max(0, Number(current.visibleElapsedMs) || 0);
    state.visibilityLossCount = Math.max(
      0,
      Math.min(1000, Number(current.visibilityLossCount) || 0),
    );
  }

  function applySession(payload) {
    state.sessionId = payload.sessionId;
    state.games = Array.isArray(payload.assignments) ? payload.assignments : [];
    state.completedCount = Number(payload.completedCount) || 0;
    const nextIndex = state.games.findIndex(game => !game.responded);
    state.position = nextIndex >= 0 ? nextIndex : state.games.length;
    persistSession({ completed: payload.status === "complete" });
  }

  function showFinish() {
    stopVisibleGameTiming();
    clearInterval(state.timer);
    state.submitting = false;
    elements.frame.removeAttribute("src");
    elements.introView.classList.add("is-hidden");
    elements.playerView.classList.add("is-hidden");
    elements.finishView.classList.remove("is-hidden");
    setPlayerActive(false);
    if (PREVIEW_MODE) {
      setStatus("preview", "Preview complete");
      elements.footerMode.textContent = "Preview only · responses discarded";
    } else {
      setStatus("complete", "Evaluation complete");
      elements.footerMode.textContent = "Anonymous service-evaluation responses saved";
    }
    persistSession({ completed: true });
    elements.finishHeading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function tryResume(stored) {
    if (!stored || !stored.sessionId) return false;
    state.creationId = stored.creationId || null;
    state.sessionId = stored.sessionId;
    try {
      const session = await api("/api/dissertation/resume", {
        method: "POST",
        body: JSON.stringify({ sessionId: stored.sessionId }),
      });
      state.status = { informationVersion: session.informationVersion };
      applySession(session);
      if (session.status !== "complete" && state.completedCount === session.sessionSize) {
        await api("/api/dissertation/complete", {
          method: "POST",
          body: JSON.stringify({ sessionId: state.sessionId }),
        });
        session.status = "complete";
      }
      if (session.status === "complete") {
        showFinish();
        return true;
      }
      setStatus("open", "Session ready");
      elements.closedNotice.classList.add("is-hidden");
      elements.dataNotice.classList.remove("is-hidden");
      elements.footerMode.textContent = "Anonymous service-evaluation session saved";
      setStartState(
        true,
        `Resume at game ${state.position + 1} of ${session.sessionSize}`,
        `${state.completedCount} responses saved on this browser.`,
      );
      return true;
    } catch (error) {
      if (["session_not_found", "invalid_session", "session_protocol_mismatch"].includes(error.code)) {
        clearStoredSession();
        state.sessionId = null;
        state.creationId = null;
        return false;
      }
      setStatus("closed", "Resume temporarily unavailable");
      setStartState(
        false,
        "Session saved",
        "Your progress is still saved. Please try this page again shortly.",
      );
      return true;
    }
  }

  async function initialise() {
    if (PREVIEW_MODE) {
      setStatus("preview", "Preview · not recording");
      elements.closedNotice.innerHTML =
        "<strong>Preview mode is local to this browser tab.</strong><span>You can play the full flow, but no evaluation record is created.</span>";
      elements.footerMode.textContent = "Preview only · responses discarded";
      setStartState(true, "Open 56-game preview", "No responses will be recorded.");
      return;
    }

    const stored = readStoredSession();
    if (await tryResume(stored)) return;
    if (stored && stored.creationId) state.creationId = stored.creationId;

    try {
      const status = await api("/api/dissertation/status", { method: "GET", headers: {} });
      state.status = status;
      if (status.open) {
        setStatus("open", "");
        elements.closedNotice.classList.add("is-hidden");
        elements.dataNotice.classList.remove("is-hidden");
        elements.footerMode.textContent = "Anonymous service-evaluation records";
        setStartState(
          true,
          "Begin",
          "",
        );
      } else if (status.recruitmentComplete) {
        setStatus("closed", "Evaluation complete");
        elements.closedNotice.innerHTML =
          "<strong>The planned evaluation is complete.</strong><span>No new session will be issued.</span>";
        setStartState(false, "Evaluation complete", "No more responses are being collected.");
      } else if (status.collectionEnabled && status.scheduleReady) {
        setStatus("closed", "Sequences in progress");
        elements.closedNotice.innerHTML =
          "<strong>All currently available orders are in progress.</strong><span>Please try again tomorrow. No evaluation record has been created from this page.</span>";
        setStartState(false, "Temporarily unavailable", "Inactive orders are reissued after 24 hours.");
      } else {
        setStatus("closed", "Evaluation unavailable");
      }
    } catch {
      setStatus("closed", "Evaluation unavailable");
      elements.buttonNote.textContent =
        "The evaluation service is unavailable and no response can be recorded.";
    }
  }

  async function beginSession() {
    if (state.submitting) return;
    state.submitting = true;
    elements.startButton.dataset.state = "loading";
    elements.startButton.disabled = true;
    elements.startLabel.textContent = "Preparing games…";

    try {
      await loadGameLayouts();
      if (PREVIEW_MODE && state.games.length === 0) {
        const pool = await api("/dissertation/pool.json", { method: "GET", headers: {} });
        state.games = randomOrder(pool.games).map((game, index) => ({
          publicId: game.id,
          path: game.path,
          order: index + 1,
          responded: false,
        }));
        state.completedCount = 0;
        state.position = 0;
      } else if (!PREVIEW_MODE && !state.sessionId) {
        state.creationId = state.creationId || crypto.randomUUID();
        persistSession();
        const session = await api("/api/dissertation/session", {
          method: "POST",
          body: JSON.stringify({
            informationVersion: state.status.informationVersion,
            creationId: state.creationId,
          }),
        });
        applySession(session);
        if (session.status === "complete") {
          showFinish();
          return;
        }
      }

      if (state.games.length !== 56 || state.position >= state.games.length) {
        throw new Error("The complete 56-game order is unavailable.");
      }

      elements.introView.classList.add("is-hidden");
      elements.finishView.classList.add("is-hidden");
      elements.playerView.classList.remove("is-hidden");
      setPlayerActive(true);
      await loadCurrentGame();
    } catch (error) {
      state.submitting = false;
      setPlayerActive(false);
      elements.playerView.classList.add("is-hidden");
      elements.introView.classList.remove("is-hidden");
      setStartState(
        true,
        "Try again",
        playerErrorMessage(error, "The evaluation session could not be prepared."),
      );
    } finally {
      delete elements.startButton.dataset.state;
    }
  }

  function resetResponseControls() {
    clearError();
    state.inputMethod = "unknown";
    state.ratingPhase = "locked";
    elements.likeButton.disabled = true;
    elements.dislikeButton.disabled = true;
    elements.skipToggle.disabled = true;
    elements.confirmSkip.disabled = true;
    elements.retryGame.classList.add("is-hidden");
    elements.retryGame.textContent = "Retry game";
    delete elements.retryGame.dataset.action;
    elements.technicalFailure.classList.add("is-hidden");
    elements.technicalFailure.disabled = false;
    elements.skipPanel.classList.add("is-hidden");
    elements.skipToggle.setAttribute("aria-expanded", "false");
    document.querySelectorAll('input[name="skip-reason"]').forEach((input) => {
      input.checked = false;
    });
  }

  function waitForGameReady(token) {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (!state.readyWait || state.readyWait.token !== token) return;
        state.readyWait = null;
        reject(new Error("game_ready_timeout"));
      }, FRAME_READY_TIMEOUT_MS);
      state.readyWait = {
        token,
        resolve: () => {
          clearTimeout(timeout);
          state.readyWait = null;
          resolve();
        },
      };
    });
  }

  async function loadCurrentGame() {
    state.submitting = true;
    stopVisibleGameTiming();
    clearInterval(state.timer);
    resetResponseControls();
    const game = state.games[state.position];
    const total = state.games.length;
    const remaining = total - state.completedCount;
    elements.progressLabel.textContent =
      `Game ${state.position + 1} of ${total} · ${state.completedCount} completed · ${remaining} remaining`;
    elements.progressMeter.max = total;
    elements.progressMeter.value = state.completedCount;
    elements.progressMeter.setAttribute("aria-valuetext", `${state.completedCount} of ${total} games completed`);
    elements.gameHeading.textContent = `Game ${state.position + 1} of ${total}`;
    elements.ratingHelp.textContent =
      `Rating unlocks after ${RATING_DELAY_SECONDS} seconds.`;
    elements.frame.title = `Game ${state.position + 1} of ${total}`;
    elements.frameShell.dataset.state = "loading";
    elements.frameLoading.removeAttribute("aria-hidden");
    elements.frameLoadingCopy.textContent = "Loading game…";
    configureFrameFit(game);
    restoreCheckpoint(game.publicId);
    state.lastCheckpointSecond = -1;

    if (!PREVIEW_MODE) {
      try {
        const started = await api("/api/dissertation/start", {
          method: "POST",
          body: JSON.stringify({
            sessionId: state.sessionId,
            publicId: game.publicId,
          }),
        });
        if (started.alreadyResponded) {
          await refreshSession();
          return;
        }
      } catch (error) {
        showError(
          `${playerErrorMessage(error, "The game could not be started right now.")} `
          + "Your saved session has not been changed.",
        );
        elements.retryGame.classList.remove("is-hidden");
        state.submitting = false;
        return;
      }
    }

    const token = state.gameLoadToken + 1;
    state.gameLoadToken = token;
    const ready = waitForGameReady(token);
    elements.frame.src = `${game.path}?studyLoad=${token}`;
    try {
      await ready;
    } catch {
      if (token !== state.gameLoadToken) return;
      elements.frameShell.dataset.state = "error";
      elements.frameLoading.removeAttribute("aria-hidden");
      elements.frameLoadingCopy.textContent = "Game did not load.";
      showError("This game did not finish loading. Retry it, or record a technical failure and continue.");
      elements.retryGame.classList.remove("is-hidden");
      elements.technicalFailure.classList.remove("is-hidden");
      state.submitting = false;
      return;
    }
    if (token !== state.gameLoadToken) return;

    elements.frameShell.dataset.state = "ready";
    elements.frameLoadingCopy.textContent = "Game ready.";
    elements.frameLoading.setAttribute("aria-hidden", "true");
    startVisibleGameTiming();
    state.submitting = false;
    elements.skipToggle.disabled = false;
    updateTimer();
    state.timer = window.setInterval(updateTimer, 250);
    elements.gameHeading.focus({ preventScroll: true });
  }

  function updateTimer() {
    const elapsed = Math.max(0, Math.floor(visibleElapsedMs() / 1000));
    const ratingAvailable = elapsed >= RATING_DELAY_SECONDS;
    if (ratingAvailable && state.ratingPhase === "locked") {
      state.ratingPhase = "open";
      elements.ratingHelp.textContent = "Rating is available.";
    }
    elements.likeButton.disabled = state.submitting || !ratingAvailable;
    elements.dislikeButton.disabled = state.submitting || !ratingAvailable;
    if (elapsed > 0 && elapsed % 5 === 0 && elapsed !== state.lastCheckpointSecond) {
      state.lastCheckpointSecond = elapsed;
      checkpointTiming();
    }
  }

  async function submitResponse({ rating = null, skipReason = null }) {
    if (state.submitting) return;
    state.submitting = true;
    clearError();
    pauseVisibleGameTiming();
    elements.likeButton.disabled = true;
    elements.dislikeButton.disabled = true;
    elements.confirmSkip.disabled = true;
    elements.technicalFailure.disabled = true;
    const game = state.games[state.position];

    try {
      if (!PREVIEW_MODE) {
        const playtimeSeconds = Math.round((visibleElapsedMs() / 1000) * 10) / 10;
        await api("/api/dissertation/response", {
          method: "POST",
          body: JSON.stringify({
            sessionId: state.sessionId,
            publicId: game.publicId,
            playerLayoutVersion: PLAYER_LAYOUT_VERSION,
            playtimeSeconds,
            rating,
            skipReason,
            ...broadContext(),
          }),
        });
      }
      if (!game.responded) {
        game.responded = true;
        state.completedCount += 1;
      }
      persistSession({ current: null });
      await advance();
    } catch (error) {
      if (game.responded) {
        showError("Your response is saved, but the next step was not confirmed. Continue the saved session.");
        state.submitting = false;
        elements.retryGame.textContent = "Continue saved session";
        elements.retryGame.dataset.action = "continue";
        elements.retryGame.classList.remove("is-hidden");
        return;
      }
      showError(
        `${playerErrorMessage(error, "We could not confirm the save.")} `
        + "Try again; duplicate submissions are safely ignored.",
      );
      state.submitting = false;
      resumeVisibleGameTiming();
      updateTimer();
      if (skipReason) {
        elements.confirmSkip.disabled = false;
        elements.technicalFailure.disabled = false;
      }
    }
  }

  async function advance() {
    clearInterval(state.timer);
    stopVisibleGameTiming();
    const nextIndex = state.games.findIndex(game => !game.responded);
    if (nextIndex >= 0) {
      state.position = nextIndex;
      await loadCurrentGame();
      return;
    }

    if (!PREVIEW_MODE) {
      await api("/api/dissertation/complete", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
    } else {
      elements.finishCopy.textContent =
        "Preview complete. Every response was kept only in memory and has now been discarded.";
    }
    showFinish();
  }

  async function refreshSession() {
    if (PREVIEW_MODE) return;
    const session = await api("/api/dissertation/resume", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.sessionId }),
    });
    applySession(session);
    if (session.status !== "complete" && state.position >= state.games.length) {
      await api("/api/dissertation/complete", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
      session.status = "complete";
    }
    if (session.status === "complete") {
      showFinish();
      return;
    }
    await loadCurrentGame();
  }

  elements.startButton.addEventListener("click", beginSession);
  elements.likeButton.addEventListener("click", () => submitResponse({ rating: "like" }));
  elements.dislikeButton.addEventListener("click", () => submitResponse({ rating: "dislike" }));
  elements.retryGame.addEventListener("click", () => {
    if (elements.retryGame.dataset.action === "continue") {
      refreshSession().catch((error) => {
        showError(playerErrorMessage(error, "The saved session could not be refreshed."));
      });
      return;
    }
    loadCurrentGame();
  });
  elements.technicalFailure.addEventListener(
    "click",
    () => submitResponse({ skipReason: "technical_failure" }),
  );
  elements.skipToggle.addEventListener("click", () => {
    const open = elements.skipPanel.classList.toggle("is-hidden") === false;
    elements.skipToggle.setAttribute("aria-expanded", String(open));
    if (open) elements.skipPanel.querySelector("input").focus();
  });
  document.querySelectorAll('input[name="skip-reason"]').forEach((input) => {
    input.addEventListener("change", () => {
      elements.confirmSkip.disabled = false;
    });
  });
  elements.confirmSkip.addEventListener("click", () => {
    const selected = document.querySelector('input[name="skip-reason"]:checked');
    if (selected) submitResponse({ skipReason: selected.value });
  });

  document.addEventListener("visibilitychange", () => {
    if (!state.gameTimingActive) return;
    if (document.hidden) {
      pauseVisibleGameTiming();
      state.visibilityLossCount += 1;
      checkpointTiming();
    } else {
      resumeVisibleGameTiming();
    }
  });

  window.addEventListener("pagehide", () => {
    pauseVisibleGameTiming();
    checkpointTiming();
  });

  if (typeof ResizeObserver === "function") {
    const frameResizeObserver = new ResizeObserver(() => applyFrameFit());
    frameResizeObserver.observe(elements.frameShell);
  } else {
    window.addEventListener("resize", applyFrameFit);
  }
  if (typeof MOBILE_PLAYER_QUERY.addEventListener === "function") {
    MOBILE_PLAYER_QUERY.addEventListener("change", applyFrameFit);
  } else {
    MOBILE_PLAYER_QUERY.addListener(applyFrameFit);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== elements.frame.contentWindow) return;
    if (!event.data || event.data.source !== "dissertation-game") return;
    const loadToken = Number(event.data.loadToken);
    if (!Number.isInteger(loadToken) || loadToken !== state.gameLoadToken) return;
    if (event.data.type === "ready"
        && state.readyWait
        && loadToken === state.readyWait.token) {
      state.readyWait.resolve();
      return;
    }
    if (event.data.type === "first-input") {
      const allowed = new Set(["touch", "mouse-or-trackpad", "keyboard"]);
      if (allowed.has(event.data.inputMethod)) state.inputMethod = event.data.inputMethod;
    }
  });

  initialise();
})();
