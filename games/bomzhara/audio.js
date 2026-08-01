// Sample-based audio layer. Starts only after a real user gesture so browsers do not block playback.
var SFX = {
  throw: { file: './assets/audio/sfx/throw.ogg', volume: 0.36, cooldown: 0.055, jitter: 0.06 },
  bottleImpact: { file: './assets/audio/sfx/bottle_impact.ogg', volume: 0.27, cooldown: 0.045, jitter: 0.08 },
  enemyHit: { file: './assets/audio/sfx/enemy_hit.ogg', volume: 0.31, cooldown: 0.05, jitter: 0.07 },
  pickup: { file: './assets/audio/sfx/pickup.ogg', volume: 0.32, cooldown: 0.08, jitter: 0.02 },
  playerHurt: { file: './assets/audio/sfx/player_hurt.ogg', volume: 0.38, cooldown: 0.24, jitter: 0.04 },
  deathSplat: { file: './assets/audio/sfx/death_splat.mp3', volume: 0.42, cooldown: 0.5, jitter: 0.06 },
};

var MUSIC_FILE = './assets/audio/music/theme_ancient_caverns.ogg';
var MUSIC_VOLUME = 0.19;

var ctx = null;
var masterGain = null;
var buffers = Object.create(null);
var loading = Object.create(null);
var errors = Object.create(null);
var lastPlay = Object.create(null);
var music = null;
var unlocked = false;
var muted = readMuted();
var unlockCount = 0;

function readMuted() {
  try { return localStorage.getItem('bomzhara_audio_muted') === '1'; }
  catch (e) { return false; }
}

function writeMuted() {
  try { localStorage.setItem('bomzhara_audio_muted', muted ? '1' : '0'); }
  catch (e) {}
}

function url(file) {
  return new URL(file, import.meta.url).href + '?v=20260801a';
}

function ensureContext() {
  if (ctx) return ctx;
  var Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ctx.destination);
  } catch (e) {
    ctx = null;
    masterGain = null;
  }
  return ctx;
}

// Music runs through Web Audio, never an HTMLMediaElement. An Audio element
// registers an OS MediaSession, which puts the game in the phone's media
// player / lock screen - Yandex rejects that under 1.6.2.5 / 1.6.1.6, and it is
// the root of the 1.3 + 4.7 rejections (CLAUDE.md hard rule #6). The SFX path
// below was already Web Audio; this brings the loop onto the same graph, so one
// masterGain mutes everything and one ctx.suspend() silences the game for ads.
function ensureMusic() {
  if (music) return music;
  var context = ensureContext();
  if (!context || !masterGain) return null;

  music = {
    gain: context.createGain(),
    source: null,
    buffer: null,
    loading: false,
    playing: false,
  };
  music.gain.gain.value = muted ? 0 : MUSIC_VOLUME;
  music.gain.connect(masterGain);

  music.loading = true;
  fetch(url(MUSIC_FILE))
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + MUSIC_FILE);
      return res.arrayBuffer();
    })
    .then(function (data) { return decodeAudio(context, data); })
    .then(function (buffer) {
      music.buffer = buffer;
      music.loading = false;
      // Unlock may have happened while the track was still downloading.
      if (unlocked && !muted) startMusic();
    })
    .catch(function () { music.loading = false; });

  return music;
}

function startMusic() {
  var context = ensureContext();
  if (!context || !music || !music.buffer || music.playing) return;
  var src = context.createBufferSource();
  src.buffer = music.buffer;
  src.loop = true;
  src.connect(music.gain);
  try { src.start(0); } catch (e) { return; }
  music.source = src;
  music.playing = true;
}

function stopMusic() {
  if (!music || !music.source) return;
  try { music.source.stop(0); } catch (e) {}
  try { music.source.disconnect(); } catch (e) {}
  music.source = null;
  music.playing = false;
}

function decodeAudio(context, arrayBuffer) {
  if (context.decodeAudioData.length <= 1) return context.decodeAudioData(arrayBuffer);
  return new Promise(function (resolve, reject) {
    context.decodeAudioData(arrayBuffer, resolve, reject);
  });
}

function loadSfx(name) {
  if (buffers[name] || loading[name] || errors[name]) return loading[name] || Promise.resolve(buffers[name]);
  var spec = SFX[name];
  var context = ensureContext();
  if (!spec || !context) return Promise.resolve(null);
  loading[name] = fetch(url(spec.file))
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + spec.file);
      return res.arrayBuffer();
    })
    .then(function (data) { return decodeAudio(context, data); })
    .then(function (buffer) {
      buffers[name] = buffer;
      delete loading[name];
      return buffer;
    })
    .catch(function (err) {
      errors[name] = err && err.message ? err.message : String(err);
      delete loading[name];
      return null;
    });
  return loading[name];
}

export function preloadGameAudio() {
  ensureMusic();
  if (!ensureContext()) return;
  Object.keys(SFX).forEach(loadSfx);
}

export function unlockGameAudio() {
  if (!unlocked) {
    unlocked = true;
    unlockCount++;
  }
  preloadGameAudio();
  bindVisibility();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
  var m = ensureMusic();
  if (!m) return;
  m.gain.gain.value = muted ? 0 : MUSIC_VOLUME;
  // If the buffer is still downloading, ensureMusic's handler starts it.
  if (!muted) startMusic();
}

// Ambient wind. Lives here rather than in main.js so it shares ONE AudioContext
// and hangs off masterGain like everything else: previously it built its own
// context wired straight to destination, so muting the game left the wind
// audible and its per-frame resume() would undo any suspend (ad, tab-hide).
var wind = null;
function ensureWind() {
  if (wind) return wind;
  var context = ensureContext();
  if (!context || !masterGain) return null;
  try {
    // One second of noise, looped and bandpassed - cheap and seamless enough.
    var buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    var src = context.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    var filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    var gain = context.createGain();
    gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(masterGain);
    src.start();
    wind = { gain: gain, src: src };
  } catch (e) { wind = null; }
  return wind;
}

// level 0..1. Called every frame by the game loop; never resumes the context
// itself, so a suspend for an ad or a hidden tab actually holds.
export function setWindLevel(level) {
  if (!unlocked) return;
  var w = ensureWind();
  if (!w || !ctx) return;
  try {
    w.gain.gain.setTargetAtTime(Math.max(0, level || 0), ctx.currentTime, 0.08);
  } catch (e) {}
}

// Yandex 1.3 / CLAUDE.md #8: everything must go silent when the tab is hidden,
// and the game must not be the thing still making noise over an ad. Suspending
// the single shared context covers music, SFX and wind in one move.
function bindVisibility() {
  if (typeof document === 'undefined' || bindVisibility.bound) return;
  bindVisibility.bound = true;
  var onHide = function () {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') {
      if (ctx.state === 'running') ctx.suspend().catch(function () {});
    } else if (unlocked && !muted && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', function () {
    if (ctx && ctx.state === 'running') ctx.suspend().catch(function () {});
  });
}

export function playSfx(name, intensity) {
  if (!unlocked || muted) return;
  var spec = SFX[name];
  var context = ensureContext();
  if (!spec || !context || !masterGain) return;
  if (context.state === 'suspended') context.resume().catch(function () {});
  var now = context.currentTime || 0;
  if (lastPlay[name] && now - lastPlay[name] < spec.cooldown) return;
  var buffer = buffers[name];
  if (!buffer) { loadSfx(name); return; }
  lastPlay[name] = now;
  try {
    var src = context.createBufferSource();
    var gain = context.createGain();
    var amt = Math.max(0, Math.min(1.35, intensity == null ? 1 : intensity));
    var pitch = 1 + (Math.random() * 2 - 1) * spec.jitter;
    src.buffer = buffer;
    src.playbackRate.value = pitch;
    gain.gain.value = spec.volume * amt;
    src.connect(gain);
    gain.connect(masterGain);
    src.start();
  } catch (e) {}
}

export function setGameAudioMuted(nextMuted) {
  muted = !!nextMuted;
  writeMuted();
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
  if (music) {
    music.gain.gain.value = muted ? 0 : MUSIC_VOLUME;
    // Free the source while muted rather than looping it silently.
    if (muted) stopMusic();
    else if (unlocked) startMusic();
  }
  return muted;
}

export function toggleGameAudioMuted() {
  return setGameAudioMuted(!muted);
}

export function audioDebug() {
  return {
    unlocked: unlocked,
    unlockCount: unlockCount,
    muted: muted,
    context: ctx ? ctx.state : 'none',
    loaded: Object.keys(buffers).length,
    pending: Object.keys(loading).length,
    errors: Object.keys(errors).length,
    musicReady: !!(music && music.buffer),
    musicPaused: music ? !music.playing : true,
    windReady: !!wind,
    windGain: wind ? +wind.gain.gain.value.toFixed(4) : null,
    masterGain: masterGain ? +masterGain.gain.value.toFixed(4) : null,
  };
}
