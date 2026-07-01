// Audio subsystem: one WebAudio context, decoded SFX buffers, procedural tone fallback, bg music.
// Unlocks on first user gesture. audioMuted/musicEnabled are module-private; render/debug read mute
// via isMuted(), input flips it via toggleMute(). SFX/tone are called from many systems.
import { qs } from './flags.js?v=bm8';
import { rnd } from './lib/rng.js?v=bm8';

var audioMuted = qs.has('mute') || qs.get('sound') === '0';
var musicEnabled = qs.get('music') !== '0' && qs.get('bgm') !== '0';
var audioCtx = null;
var audioLoading = false;
var audioBuffers = Object.create(null);
var audioLast = Object.create(null);
var musicEl = null;
var SFX_FILES = {
  cannon: 'audio/sfx/cannon.mp3',
  laser: 'audio/sfx/laser.mp3',
  squish: 'audio/sfx/squish.mp3',
  metal: 'audio/sfx/metal.mp3',
  rock: 'audio/sfx/rock.mp3',
  hitflesh: 'audio/sfx/hitflesh.mp3',
  flesh1: 'audio/sfx/flesh1.mp3',   // CC0 wet-squish impacts (see CREDITS) - rolled-over organic kills
  flesh2: 'audio/sfx/flesh2.mp3',
  flesh3: 'audio/sfx/flesh3.mp3',
  bone1: 'audio/sfx/bone1.mp3',     // CC0 deep bone cracks (see CREDITS) - breaking skeletal env decals
  bone2: 'audio/sfx/bone2.mp3',
  bone3: 'audio/sfx/bone3.mp3',
  // KEPT CRUSH/BREAK CANDIDATES (Tim 2026-06-24, reviewed audio/sfx_candidates/ and chose these 47 keepers).
  // Wired into the crush-kill pool (systems/enemies.js), the breakable-bone-env pool (systems/collision.js), and
  // the big-body-thud (cand_fall*). Auto-loaded: loadAudioSamples iterates Object.keys(SFX_FILES). Provenance in
  // the candidate manifest -> flag for CREDITS once the dropped candidates are pruned from the folder.
  cand_flesh4: 'audio/sfx_candidates/cand_flesh4.mp3',
  cand_flesh5: 'audio/sfx_candidates/cand_flesh5.mp3',
  cand_flesh6: 'audio/sfx_candidates/cand_flesh6.mp3',
  cand_flesh7: 'audio/sfx_candidates/cand_flesh7.mp3',
  cand_flesh8: 'audio/sfx_candidates/cand_flesh8.mp3',
  cand_flesh9: 'audio/sfx_candidates/cand_flesh9.mp3',
  cand_flesh10: 'audio/sfx_candidates/cand_flesh10.mp3',
  cand_flesh11: 'audio/sfx_candidates/cand_flesh11.mp3',
  cand_bone4: 'audio/sfx_candidates/cand_bone4.mp3',
  cand_bone5: 'audio/sfx_candidates/cand_bone5.mp3',
  cand_bone6: 'audio/sfx_candidates/cand_bone6.mp3',
  cand_bone7: 'audio/sfx_candidates/cand_bone7.mp3',
  cand_bone8: 'audio/sfx_candidates/cand_bone8.mp3',
  cand_bone9: 'audio/sfx_candidates/cand_bone9.mp3',
  cand_bone10: 'audio/sfx_candidates/cand_bone10.mp3',
  cand_bone11: 'audio/sfx_candidates/cand_bone11.mp3',
  cand_bone12: 'audio/sfx_candidates/cand_bone12.mp3',
  cand_meat1: 'audio/sfx_candidates/cand_meat1.mp3',
  cand_meat2: 'audio/sfx_candidates/cand_meat2.mp3',
  cand_meat3: 'audio/sfx_candidates/cand_meat3.mp3',
  cand_meat4: 'audio/sfx_candidates/cand_meat4.mp3',
  cand_meat5: 'audio/sfx_candidates/cand_meat5.mp3',
  cand_meat6: 'audio/sfx_candidates/cand_meat6.mp3',
  cand_meat7: 'audio/sfx_candidates/cand_meat7.mp3',
  cand_meat8: 'audio/sfx_candidates/cand_meat8.mp3',
  cand_meat9: 'audio/sfx_candidates/cand_meat9.mp3',
  cand_meat10: 'audio/sfx_candidates/cand_meat10.mp3',
  cand_gore1: 'audio/sfx_candidates/cand_gore1.mp3',
  cand_gore2: 'audio/sfx_candidates/cand_gore2.mp3',
  cand_gore3: 'audio/sfx_candidates/cand_gore3.mp3',
  cand_gore4: 'audio/sfx_candidates/cand_gore4.mp3',
  cand_gore5: 'audio/sfx_candidates/cand_gore5.mp3',
  cand_gore6: 'audio/sfx_candidates/cand_gore6.mp3',
  cand_gore7: 'audio/sfx_candidates/cand_gore7.mp3',
  cand_skull1: 'audio/sfx_candidates/cand_skull1.mp3',
  cand_skull4: 'audio/sfx_candidates/cand_skull4.mp3',
  cand_skull5: 'audio/sfx_candidates/cand_skull5.mp3',
  cand_skull6: 'audio/sfx_candidates/cand_skull6.mp3',
  cand_rip1: 'audio/sfx_candidates/cand_rip1.mp3',
  cand_rip2: 'audio/sfx_candidates/cand_rip2.mp3',
  cand_rip3: 'audio/sfx_candidates/cand_rip3.mp3',
  cand_rip4: 'audio/sfx_candidates/cand_rip4.mp3',
  cand_viscera3: 'audio/sfx_candidates/cand_viscera3.mp3',
  cand_viscera4: 'audio/sfx_candidates/cand_viscera4.mp3',
  cand_fall1: 'audio/sfx_candidates/cand_fall1.mp3',
  cand_fall2: 'audio/sfx_candidates/cand_fall2.mp3',
  cand_fall3: 'audio/sfx_candidates/cand_fall3.mp3',
  // FINAL WEAPON-SOUND PICKS (Tim 2026-06-25, kept multiple per slot -> each weapon is a randomised playSfxOneOf
  // pool). Shotgun(flak)/rocket(missile)/explosion(boom) REPLACE the old single flak/missile/boom samples (those
  // keys are removed below). rep_crunch/skull/viscera also extend the crush + bone-break pools. Auto-loaded via
  // loadAudioSamples (Object.keys(SFX_FILES)). Provenance in the candidate manifest -> flag for CREDITS.
  rep_shotgun4: 'audio/sfx_candidates/rep_shotgun4.mp3',
  rep_shotgun6: 'audio/sfx_candidates/rep_shotgun6.mp3',
  rep_shotgun8: 'audio/sfx_candidates/rep_shotgun8.mp3',
  rep_explosion1: 'audio/sfx_candidates/rep_explosion1.mp3',
  rep_explosion2: 'audio/sfx_candidates/rep_explosion2.mp3',
  rep_explosion3: 'audio/sfx_candidates/rep_explosion3.mp3',
  rep_rocket6: 'audio/sfx_candidates/rep_rocket6.mp3',
  rep_rocket7: 'audio/sfx_candidates/rep_rocket7.mp3',
  rep_rocket9: 'audio/sfx_candidates/rep_rocket9.mp3',
  rep_crunch1: 'audio/sfx_candidates/rep_crunch1.mp3',
  rep_crunch2: 'audio/sfx_candidates/rep_crunch2.mp3',
  rep_crunch3: 'audio/sfx_candidates/rep_crunch3.mp3',
  rep_skull1: 'audio/sfx_candidates/rep_skull1.mp3',
  rep_skull2: 'audio/sfx_candidates/rep_skull2.mp3',
  rep_skull3: 'audio/sfx_candidates/rep_skull3.mp3',
  rep_viscera1: 'audio/sfx_candidates/rep_viscera1.mp3',
  rep_viscera2: 'audio/sfx_candidates/rep_viscera2.mp3',
  rep_viscera3: 'audio/sfx_candidates/rep_viscera3.mp3'
};

export function isMuted() { return audioMuted; }
export function audioCtxState() { return audioCtx ? audioCtx.state : null; }
export function bufferCount() { return Object.keys(audioBuffers).length; }

export function unlockAudio() {
  if (audioMuted) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) {
    audioCtx = new AC();
    loadAudioSamples();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!musicEl) {
    musicEl = new Audio('audio/bg_track.mp3');
    musicEl.loop = true;
    musicEl.volume = 0.18;
  }
  if (musicEnabled) {
    var p = musicEl.play();
    if (p && p.catch) p.catch(function () {});
  }
}

function loadAudioSamples() {
  if (!audioCtx || audioLoading) return;
  audioLoading = true;
  var names = Object.keys(SFX_FILES);
  for (var i = 0; i < names.length; i++) {
    loadOneSample(names[i]);
  }
}

function loadOneSample(name) {
  fetch(SFX_FILES[name]).then(function (r) {
    return r.arrayBuffer();
  }).then(function (buf) {
    return audioCtx.decodeAudioData(buf);
  }).then(function (decoded) {
    audioBuffers[name] = decoded;
  }).catch(function () {});
}

export function playTone(freq, dur, vol) {
  if (audioMuted || !audioCtx) return;
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = 'triangle';
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol || 0.035), now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (dur || 0.06));
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + (dur || 0.06) + 0.02);
}

// PRESTIGE hit for the level-up upgrade draft: a RESURRECT-style visceral slam (mirrors beginResurrect's
// reverse-suck whump), NOT a melodic chime. A synth WHIP-CRACK + the game's own wet explosion whump + a blood
// squelch + a low sub for weight. One-shot. (playSfx/playSfxOneOf are hoisted function decls below.)
export function playPrestige() {
  if (audioMuted || !audioCtx) return;
  var t0 = audioCtx.currentTime;
  // WHIP-CRACK: a fast high->low pitch snap
  var wo = audioCtx.createOscillator(), wg = audioCtx.createGain();
  wo.type = 'sawtooth';
  wo.frequency.setValueAtTime(1900, t0);
  wo.frequency.exponentialRampToValueAtTime(170, t0 + 0.09);
  wg.gain.setValueAtTime(0.0001, t0);
  wg.gain.exponentialRampToValueAtTime(0.16, t0 + 0.006);
  wg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
  wo.connect(wg); wg.connect(audioCtx.destination);
  wo.start(t0); wo.stop(t0 + 0.15);
  // low sub for body/weight
  playTone(54, 0.5, 0.06);
  // the game's own gore/impact samples, pitched like the resurrect whump (reverse-suck) + wet blood + metal shear
  playSfxOneOf(['rep_explosion1', 'rep_explosion2', 'rep_explosion3'], 0.5, 0, 1.05);
  playSfx('flesh1', 0.55, 0, 0.85);
  playSfx('metal', 0.4, 0, 1.3);
}

export function playSfx(name, vol, minGap, rate) {
  if (audioMuted || !audioCtx) return;
  var now = audioCtx.currentTime;
  minGap = minGap == null ? 0.05 : minGap;
  if (audioLast[name] != null && now - audioLast[name] < minGap) return;
  audioLast[name] = now;
  var buf = audioBuffers[name];
  if (!buf) {
    if (name === 'hitflesh' || name === 'squish') playTone(150 + rnd() * 60, 0.055, (vol || 0.25) * 0.16);
    else if (name === 'cannon') playTone(80 + rnd() * 35, 0.08, (vol || 0.35) * 0.18);   // missile/boom dropped (no buffers, no beep fallback wanted - they're real rep_ samples now)
    return;
  }
  var src = audioCtx.createBufferSource();
  var gain = audioCtx.createGain();
  src.buffer = buf;
  src.playbackRate.value = rate || (0.94 + rnd() * 0.12);
  gain.gain.value = vol == null ? 0.35 : vol;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start(now);
}

// Play a RANDOM name from a list so repeated impacts (crushing a horde, smashing bone piles) vary
// instead of machine-gunning one sample. playSfx already pitch-jitters via `rate` and throttles
// per-name; we add ONE shared throttle keyed on the list so the *group* respects minGap even though
// each call hits a different name (per-name gaps alone wouldn't stop a 3-sample group from tripling).
function playSfxOneOf(names, vol, minGap, rate) {
  if (audioMuted || !audioCtx) return;
  var now = audioCtx.currentTime;
  var groupKey = '#' + names[0];
  minGap = minGap == null ? 0.05 : minGap;
  if (audioLast[groupKey] != null && now - audioLast[groupKey] < minGap) return;
  audioLast[groupKey] = now;
  playSfx(names[(rnd() * names.length) | 0], vol, 0, rate);   // optional rate (pitch) forwarded so the explosion call-sites keep their per-site pitch; existing callers pass no rate = identical behaviour
}
export { playSfxOneOf };

export function toggleMute() {
  audioMuted = !audioMuted;
  if (musicEl) {
    if (audioMuted) musicEl.pause();
    else unlockAudio();
  }
}

// tab-hide / tab-show: pause bg music when hidden, resume on return (registered by input.initInput).
export function handleVisibility() {
  if (!musicEl) return;
  if (document.hidden) {
    musicEl.pause();
  } else if (!audioMuted && musicEnabled && audioCtx) {
    var p = musicEl.play();
    if (p && p.catch) p.catch(function () {});
  }
}

// debug-API observability (read by main.js __perfStats / render_game_to_text) over private audio state.
export function musicEnabledState() { return musicEnabled; }
export function musicPlaying() { return !!(musicEl && !musicEl.paused); }
