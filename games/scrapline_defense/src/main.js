import { platform } from "./platform.js";
import { loadSave, saveGame } from "./storage.js";
import { createAudio } from "./audio.js";
import { createGame } from "./game.js";
import { createI18n } from "./i18n.js";
import { setupInput } from "./input.js";
import { renderGame, renderLoading } from "./render.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const i18n = createI18n(platform.getLanguage());
const audio = createAudio();

let cssWidth = 1;
let cssHeight = 1;
let game = null;
let bootMode = "loading";
let lastFrameTime = performance.now();
let lastPersistTime = 0;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  cssWidth = Math.max(1, rect.width);
  cssHeight = Math.max(1, rect.height);
  const nextWidth = Math.round(cssWidth * dpr);
  const nextHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderFrame();
}

function renderFrame() {
  if (game) {
    renderGame(ctx, game, cssWidth, cssHeight);
  } else {
    renderLoading(ctx, cssWidth, cssHeight, i18n, bootMode === "error" ? "loadError" : "loading");
  }
}

function persist(force = false) {
  if (!game) return;
  const now = performance.now();
  if (!force && now - lastPersistTime < 1200 && !game.saveDirty) return;
  if (force || game.consumeSaveDirty()) {
    saveGame(game.exportSave(), platform);
    lastPersistTime = now;
  }
}

async function loadBalance() {
  const response = await fetch("./data/balance.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("balance");
  return response.json();
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
    resizeCanvas();
  } catch (_) {}
}

function handleKeyDown(event) {
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    toggleFullscreen();
    return;
  }
  game?.handleKeyDown(event);
}

function frame(now) {
  const dt = Math.min(0.08, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  if (game) {
    game.update(dt);
    persist(false);
  }
  renderFrame();
  window.requestAnimationFrame(frame);
}

async function boot() {
  resizeCanvas();
  try {
    await platform.init();
    i18n.setLanguage(platform.getLanguage());
    const balance = await loadBalance();
    game = createGame({
      balance,
      save: loadSave(),
      platform,
      audio,
      i18n
    });
    if (window.__GF_AUTOSTART) {
      game.setStatus("statusReady", {}, 0);
    }
    setupInput(canvas, {
      onPointerDown(point) {
        game.handlePointerDown(point);
        persist(false);
      },
      onPointerMove(point) {
        game.handlePointerMove(point);
      },
      onPointerUp(point) {
        game.handlePointerUp(point);
        persist(false);
      },
      onKeyDown: handleKeyDown
    });
    platform.onPause?.(() => {
      persist(true);
      audio.pause();
    });
    platform.onResume?.(() => {
      audio.resume();
      lastFrameTime = performance.now();
    });
    platform.loadingReady();
    window.render_game_to_text = () => game.toText();
    window.advanceTime = (ms) => {
      game.advanceTime(ms);
      persist(false);
      renderFrame();
      return game.toText();
    };
    persist(true);
  } catch (_) {
    bootMode = "error";
    window.render_game_to_text = () => JSON.stringify({ mode: "error" });
    window.advanceTime = () => window.render_game_to_text();
  }
  renderFrame();
  window.requestAnimationFrame(frame);
}

window.addEventListener("resize", resizeCanvas);
document.addEventListener("fullscreenchange", resizeCanvas);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    persist(true);
    audio.pause();
    platform.gameplayStop();
  } else {
    audio.resume();
    lastFrameTime = performance.now();
  }
});
window.addEventListener("pagehide", () => persist(true));

boot();
