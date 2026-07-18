(() => {
  "use strict";

  const RATING_DELAY_SECONDS = 10;
  const PLAYTIME_PROMPT_SECONDS = 90;
  const PREVIEW_MODE = new URLSearchParams(window.location.search).get("preview") === "1";

  const elements = {
    status: document.querySelector("#study-status"),
    statusLabel: document.querySelector("#status-label"),
    closedNotice: document.querySelector("#closed-notice"),
    acknowledgementWrap: document.querySelector("#acknowledgement-wrap"),
    acknowledgement: document.querySelector("#acknowledgement"),
    startButton: document.querySelector("#start-button"),
    startLabel: document.querySelector("#start-label"),
    buttonNote: document.querySelector("#button-note"),
    introView: document.querySelector("#intro-view"),
    playerView: document.querySelector("#player-view"),
    finishView: document.querySelector("#finish-view"),
    finishCopy: document.querySelector("#finish-copy"),
    footerMode: document.querySelector("#footer-mode"),
    progressLabel: document.querySelector("#progress-label"),
    progressFill: document.querySelector("#progress-fill"),
    elapsedLabel: document.querySelector("#elapsed-label"),
    frameShell: document.querySelector("#frame-shell"),
    frameLoading: document.querySelector("#frame-loading"),
    frame: document.querySelector("#game-frame"),
    ratingHelp: document.querySelector("#rating-help"),
    likeButton: document.querySelector("#like-button"),
    dislikeButton: document.querySelector("#dislike-button"),
    skipToggle: document.querySelector("#skip-toggle"),
    skipPanel: document.querySelector("#skip-panel"),
    confirmSkip: document.querySelector("#confirm-skip"),
    responseError: document.querySelector("#response-error"),
  };

  const state = {
    mode: "closed",
    status: null,
    sessionId: null,
    games: [],
    position: 0,
    gameStartedAt: 0,
    visibilityLossCount: 0,
    inputMethod: "unknown",
    timer: null,
    submitting: false,
  };

  function setStatus(mode, label) {
    state.mode = mode;
    elements.status.dataset.state = mode;
    elements.statusLabel.textContent = label;
  }

  function setStartState(enabled, label, note) {
    elements.startButton.disabled = !enabled;
    elements.startLabel.textContent = label;
    elements.buttonNote.textContent = note;
  }

  function showError(message) {
    elements.responseError.textContent = message;
    elements.responseError.classList.remove("is-hidden");
  }

  function clearError() {
    elements.responseError.textContent = "";
    elements.responseError.classList.add("is-hidden");
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
    if (!response.ok) {
      throw new Error(body.error || "The study service could not complete that request.");
    }
    return body;
  }

  function broadContext() {
    const width = window.innerWidth;
    return {
      deviceClass: width < 768 ? "mobile" : "desktop",
      viewportClass: width < 640 ? "narrow" : width < 1100 ? "medium" : "wide",
      inputMethod: state.inputMethod,
      visibilityLossCount: state.visibilityLossCount,
    };
  }

  async function initialise() {
    if (PREVIEW_MODE) {
      setStatus("preview", "Preview · not recording");
      elements.closedNotice.innerHTML =
        "<strong>Preview mode is local to this browser tab.</strong><span>You can play the full flow, but nothing is sent or saved.</span>";
      elements.footerMode.textContent = "Preview only · responses discarded";
      setStartState(true, "Open five-game preview", "No responses will be recorded.");
      return;
    }

    try {
      const status = await api("/api/dissertation/status", { method: "GET", headers: {} });
      state.status = status;
      if (status.open) {
        setStatus("open", "Study open");
        elements.closedNotice.classList.add("is-hidden");
        elements.acknowledgementWrap.classList.remove("is-hidden");
        elements.footerMode.textContent = "Anonymous participant data collection";
        setStartState(false, "Begin five-game session", "Tick the acknowledgement to continue.");
      } else {
        setStatus("closed", "Collection closed");
      }
    } catch {
      setStatus("closed", "Collection closed");
      elements.buttonNote.textContent = "The study service is unavailable and no response can be recorded.";
    }
  }

  async function beginSession() {
    if (state.submitting) return;
    state.submitting = true;
    elements.startButton.dataset.state = "loading";
    elements.startButton.disabled = true;
    elements.startLabel.textContent = "Preparing games…";

    try {
      if (PREVIEW_MODE) {
        const pool = await api("/dissertation/pool.json", { method: "GET", headers: {} });
        state.games = randomOrder(pool.games)
          .slice(0, pool.sessionSize || 5)
          .map((game, index) => ({
            publicId: game.id,
            path: game.path,
            order: index + 1,
          }));
      } else {
        const session = await api("/api/dissertation/session", {
          method: "POST",
          body: JSON.stringify({
            consent: true,
            consentVersion: state.status.consentVersion,
          }),
        });
        state.sessionId = session.sessionId;
        state.games = session.assignments;
      }

      if (!Array.isArray(state.games) || state.games.length === 0) {
        throw new Error("No study games are available.");
      }

      elements.introView.classList.add("is-hidden");
      elements.playerView.classList.remove("is-hidden");
      await loadCurrentGame();
    } catch (error) {
      state.submitting = false;
      setStartState(true, "Try again", error.message);
    } finally {
      delete elements.startButton.dataset.state;
    }
  }

  function resetResponseControls() {
    clearError();
    state.visibilityLossCount = 0;
    state.inputMethod = "unknown";
    elements.likeButton.disabled = true;
    elements.dislikeButton.disabled = true;
    elements.skipToggle.disabled = true;
    elements.confirmSkip.disabled = true;
    elements.skipPanel.classList.add("is-hidden");
    elements.skipToggle.setAttribute("aria-expanded", "false");
    document.querySelectorAll('input[name="skip-reason"]').forEach((input) => {
      input.checked = false;
    });
  }

  async function loadCurrentGame() {
    state.submitting = true;
    clearInterval(state.timer);
    resetResponseControls();
    const game = state.games[state.position];
    const total = state.games.length;
    const progress = (state.position + 1) / total;
    elements.progressLabel.textContent = `Game ${state.position + 1} of ${total}`;
    elements.progressFill.style.transform = `scaleX(${progress})`;
    elements.elapsedLabel.textContent = "0:00";
    elements.ratingHelp.textContent = `Try the game first. Rating unlocks in ${RATING_DELAY_SECONDS} seconds.`;
    elements.frame.title = `Game ${state.position + 1} of ${total}`;
    elements.frameShell.dataset.state = "loading";

    const loaded = new Promise((resolve) => {
      elements.frame.addEventListener("load", resolve, { once: true });
    });
    elements.frame.src = game.path;
    await loaded;
    elements.frameShell.dataset.state = "ready";

    if (!PREVIEW_MODE) {
      try {
        await api("/api/dissertation/start", {
          method: "POST",
          body: JSON.stringify({
            sessionId: state.sessionId,
            publicId: game.publicId,
          }),
        });
      } catch (error) {
        showError(`${error.message} Reload the page before continuing.`);
        return;
      }
    }

    state.gameStartedAt = Date.now();
    state.submitting = false;
    elements.skipToggle.disabled = false;
    updateTimer();
    state.timer = window.setInterval(updateTimer, 250);
    elements.frame.focus({ preventScroll: true });
  }

  function updateTimer() {
    const elapsed = Math.max(0, Math.floor((Date.now() - state.gameStartedAt) / 1000));
    const minutes = Math.floor(elapsed / 60);
    const seconds = String(elapsed % 60).padStart(2, "0");
    elements.elapsedLabel.textContent = `${minutes}:${seconds}`;

    if (elapsed >= RATING_DELAY_SECONDS) {
      elements.likeButton.disabled = state.submitting;
      elements.dislikeButton.disabled = state.submitting;
      elements.ratingHelp.textContent =
        elapsed >= PLAYTIME_PROMPT_SECONDS
          ? "You have played for 90 seconds. Rate now, or continue if you want."
          : "Rating is open. Choose based on the game you just played.";
    } else {
      elements.ratingHelp.textContent =
        `Try the game first. Rating unlocks in ${RATING_DELAY_SECONDS - elapsed} seconds.`;
    }
  }

  async function submitResponse({ rating = null, skipReason = null }) {
    if (state.submitting) return;
    state.submitting = true;
    clearError();
    elements.likeButton.disabled = true;
    elements.dislikeButton.disabled = true;
    elements.confirmSkip.disabled = true;
    const game = state.games[state.position];

    try {
      if (!PREVIEW_MODE) {
        const playtimeSeconds = Math.round(
          ((Date.now() - state.gameStartedAt) / 1000) * 10,
        ) / 10;
        await api("/api/dissertation/response", {
          method: "POST",
          body: JSON.stringify({
            sessionId: state.sessionId,
            publicId: game.publicId,
            playtimeSeconds,
            rating,
            skipReason,
            ...broadContext(),
          }),
        });
      }
      await advance();
    } catch (error) {
      showError(`${error.message} Your response has not been lost; please try again.`);
      state.submitting = false;
      updateTimer();
      if (skipReason) elements.confirmSkip.disabled = false;
    }
  }

  async function advance() {
    clearInterval(state.timer);
    const isFinalGame = state.position === state.games.length - 1;
    if (!isFinalGame) {
      state.position += 1;
      await loadCurrentGame();
      return;
    }

    // Keep the final position intact until completion succeeds. A transient
    // failure can then be retried: the response POST is idempotent and this
    // completion call is idempotent too.
    if (!PREVIEW_MODE) {
      await api("/api/dissertation/complete", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
    }
    elements.frame.removeAttribute("src");
    elements.playerView.classList.add("is-hidden");
    elements.finishView.classList.remove("is-hidden");
    if (PREVIEW_MODE) {
      elements.finishCopy.textContent =
        "Preview complete. Every response was kept only in memory and has now been discarded.";
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  elements.acknowledgement.addEventListener("change", () => {
    setStartState(
      elements.acknowledgement.checked,
      "Begin five-game session",
      elements.acknowledgement.checked
        ? "A random anonymous session will be created."
        : "Tick the acknowledgement to continue.",
    );
  });

  elements.startButton.addEventListener("click", beginSession);
  elements.likeButton.addEventListener("click", () => submitResponse({ rating: "like" }));
  elements.dislikeButton.addEventListener("click", () => submitResponse({ rating: "dislike" }));
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
    if (document.hidden && !elements.playerView.classList.contains("is-hidden")) {
      state.visibilityLossCount += 1;
    }
  });

  window.addEventListener("message", (event) => {
    if (event.source !== elements.frame.contentWindow) return;
    if (!event.data || event.data.source !== "dissertation-game") return;
    if (event.data.type === "first-input") {
      const allowed = new Set(["touch", "mouse-or-trackpad", "keyboard"]);
      if (allowed.has(event.data.inputMethod)) state.inputMethod = event.data.inputMethod;
    }
  });

  initialise();
})();
