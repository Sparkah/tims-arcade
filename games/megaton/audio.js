// ── audio.js — Megaton SOUND module ──────────────────────────────────────────
// The "sounds" iteration owns THIS file. Self-contained: depends only on the
// global GF (gf-lib.js) + the WebAudio context. index.html calls these as
// globals: beep(kind), nukeSfx(), collapseSfx(big), loadSfx(), startMusic().
// Shared globals it reads/writes from the main script: _sfxBuf (exposeState),
// _collapseClock (advanced in update()). SFX samples: audio/sfx/<name>.mp3;
// background music: audio/bg_track.mp3. Add new sounds here, not in index.html.
// ── REAL NUKE SOUND ──────────────────────────────────────────────────────────
var _nctx = null;
function nctx() { if (_nctx) return _nctx; try { _nctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { _nctx = null; } return _nctx; }
function nNoise(c, t, dur, peak, ftype, freq, q) { var n = Math.max(1, c.sampleRate * dur | 0), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); var s = c.createBufferSource(); s.buffer = buf; var f = c.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; if (q) f.Q.value = q; var g = c.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(c.destination); s.start(t); s.stop(t + dur + 0.03); }
function nOsc(c, t, dur, peak, type, f0, f1) { var o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03); }
function nukeSound() {   // MEGATON: crack -> sub-boom -> mid body -> long rolling rumble -> debris hiss
  if (GF.muted) return; var c = nctx(); if (!c) return; if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
  var t = c.currentTime;
  // 1. flash-crack: sharp wideband snap at t=0 so the hit lands instantly
  nNoise(c, t, 0.07, 0.7, 'highpass', 2200);
  nNoise(c, t, 0.16, 0.5, 'bandpass', 900, 0.4);
  // 2. sub-boom: two stacked sine sweeps -> a chest-thump that bottoms out near sub
  nOsc(c, t, 1.9, 0.95, 'sine', 130, 18);
  nOsc(c, t + 0.02, 1.5, 0.55, 'sine', 70, 14);
  // 3. mid body: detuned saws give the fireball a gritty, brassy growl
  nOsc(c, t + 0.015, 1.1, 0.42, 'sawtooth', 180, 36);
  nOsc(c, t + 0.03, 0.85, 0.3, 'sawtooth', 240, 52);
  // 4. rolling rumble tail: slow low-passed noise that keeps swelling for ~3.4s
  nNoise(c, t + 0.05, 3.4, 0.5, 'lowpass', 360);
  nNoise(c, t + 0.6, 2.6, 0.34, 'lowpass', 220);   // second, lower roll under the first = a tumbling shock front
  // 5. debris hiss: airy high band that decays last (dust/grit raining down)
  nNoise(c, t + 0.25, 2.2, 0.22, 'highpass', 3400);
}
function beep(kind) {
  if (GF.muted) return;
  // 'drop' — warhead launch: a falling whistle (long sine glide down) + a faint air-rush tail
  if (kind === 'drop') { GF.tone(1180, 0.62, 'sine', 0.11, 150); GF.tone(880, 0.5, 'triangle', 0.05, 130); nNoiseUI(0.45, 0.05, 'highpass', 2600); }
  // 'cash' — caps tick: short, bright, metallic two-step (Pip-Boy coin clink)
  else if (kind === 'cash') { GF.tone(1240, 0.045, 'square', 0.06, 1660); GF.tone(1760, 0.05, 'triangle', 0.07); }
  // 'upgrade' — perk-buy flourish: rising arp + a confirming low thunk underneath
  else if (kind === 'upgrade') { GF.arp([523, 659, 784, 1046, 1318], 55, 0.12, 'triangle', 0.15); GF.tone(196, 0.18, 'sawtooth', 0.08, 130); }
  // 'win' — city leveled fanfare: bold major arp, doubled an octave + a boom-tail to feel triumphant/heavy
  else if (kind === 'win') { GF.arp([392, 523, 659, 784, 1046, 1318], 85, 0.2, 'triangle', 0.17); GF.arp([196, 262, 330, 392], 85, 0.26, 'sawtooth', 0.07); GF.tone(98, 0.5, 'sine', 0.12, 60); }
  // 'crumble' — single chunk shedding off a tower: short, dirty, randomized low knock
  else if (kind === 'crumble') GF.tone(70 + Math.random() * 80, 0.13, 'sawtooth', 0.07, 44);
  // ── 5 themed ability stingers — fire CONCURRENTLY with nukeSfx(), so each is SHORT + bright + mid-high to cut THROUGH the boom, not muddy it ──
  // 'emp' — electromagnetic pulse: bright square zap that snaps UP, then a descending power-down whine + a high static crackle (systems frying)
  else if (kind === 'emp') { GF.tone(700, 0.05, 'square', 0.12, 2400); GF.tone(2200, 0.34, 'sawtooth', 0.09, 220); nNoiseUI(0.3, 0.06, 'highpass', 4200); }
  // 'orbital' — tungsten rod from orbit: a fast incoming high whistle that snaps into a hard, bright metallic CLANG (square + high noise tick)
  else if (kind === 'orbital') { GF.tone(2600, 0.16, 'sine', 0.11, 900); GF.tone(1400, 0.07, 'square', 0.13, 520); GF.tone(3200, 0.04, 'square', 0.08); nNoiseUI(0.05, 0.09, 'bandpass', 3000); }
  // 'cluster' — bomblet saturation: a rapid scattered rattle of little high pops (mistuned arp) + a dry crackle, like a string of firecrackers
  else if (kind === 'cluster') { GF.arp([1500, 1180, 1760, 1320, 1900, 1450, 1650], 26, 0.035, 'square', 0.075); nNoiseUI(0.22, 0.05, 'highpass', 3200); }
  // 'firestorm' — fire spreading: a rising whoosh (noise sweeping up via low->high band) + a swelling mid roar that grows instead of decaying first
  else if (kind === 'firestorm') { nNoiseUI(0.4, 0.07, 'bandpass', 700); nNoiseUI(0.42, 0.06, 'highpass', 1800); GF.tone(150, 0.45, 'sawtooth', 0.07, 520); GF.tone(300, 0.4, 'triangle', 0.05, 760); }
  // 'chain' — shophouses detonating down the row: a fast staccato string of pops, slightly ACCELERATING + rising, reading as a cascade along the street
  else if (kind === 'chain') { var cf = [380, 460, 560, 700, 880, 1100]; for (var ci = 0; ci < cf.length; ci++) (function (idx, f) { setTimeout(function () { if (GF.muted) return; GF.tone(f, 0.07, 'square', 0.1, f * 0.55); nNoiseUI(0.05, 0.04, 'bandpass', f * 2); }, idx * idx * 5 + idx * 24); })(ci, cf[ci]); }
  else GF.tone(560, 0.06, 'triangle', 0.07, 720);   // default blip so any NEW ability sound still plays something
}
// tiny UI-noise burst on the nuke ctx (GF.tone is oscillator-only); self-mutes + resumes like nNoise.
function nNoiseUI(dur, peak, ftype, freq) { if (GF.muted) return; var c = nctx(); if (!c) return; if (c.state === 'suspended') { try { c.resume(); } catch (e) {} } nNoise(c, c.currentTime, dur, peak, ftype, freq); }
// ── REAL SOUND SAMPLES (CC0/CC-BY explosion + building-break, decoded into the AudioContext) ──
var _sfxBuf = {}, _sfxNames = ['nuke', 'rubble1', 'rubble2', 'debris', 'crack'], _collapseClock = 0, _lastCollapseSfx = -1;
function loadSfx() { var c = nctx(); if (!c) return; _sfxNames.forEach(function (n) { try { fetch('audio/sfx/' + n + '.mp3').then(function (r) { return r.arrayBuffer(); }).then(function (ab) { c.decodeAudioData(ab, function (buf) { _sfxBuf[n] = buf; }, function () {}); }).catch(function () {}); } catch (e) {} }); }
function playBuf(name, vol, rate) { if (GF.muted) return true; var c = nctx(), b = _sfxBuf[name]; if (!c || !b) return false; if (c.state === 'suspended') { try { c.resume(); } catch (e) {} } try { var s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1; var g = c.createGain(); g.gain.value = (vol == null ? 1 : vol); s.connect(g); g.connect(c.destination); s.start(); } catch (e) { return false; } return true; }
function nukeSfx() {
  // real recorded nuclear explosion (full crack -> boom -> rolling rumble); procedural fallback only if the sample fails
  if (!playBuf('nuke', 1.0, 0.97 + Math.random() * 0.06)) nukeSound();
}
function collapseSfx(big) {   // rate-limited rolling crackle so a mass collapse is a ROAR, not 50 stacked clicks
  if (_collapseClock - _lastCollapseSfx < 0.05) return; _lastCollapseSfx = _collapseClock;
  var r = Math.random();
  if (r < 0.45) playBuf('crack', 0.55, 0.82 + Math.random() * 0.3);
  else if (r < 0.76) playBuf(big ? 'rubble1' : 'rubble2', 0.5, 0.88 + Math.random() * 0.28);
  else playBuf('debris', 0.45, 0.9 + Math.random() * 0.2);
  // Procedural BODY under every chunk so the texture reads as a continuous low roar,
  // not bare clicks — works even if the samples never loaded. Big collapses get a
  // deeper, longer low-passed rumble; small ones a short gravel knock.
  var c = nctx(); if (c) { if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    var t = c.currentTime;
    if (big) { nNoise(c, t, 0.32 + Math.random() * 0.18, 0.3, 'lowpass', 240 + Math.random() * 120); nOsc(c, t, 0.26, 0.14, 'sawtooth', 90 + Math.random() * 40, 38); }
    else nNoise(c, t, 0.12 + Math.random() * 0.08, 0.16, 'lowpass', 360 + Math.random() * 180);
  }
}
function startMusic() {
  // REVERTED to the bg_track.mp3 loop - the procedural 'tense' bed sounded worse
  // (Tim), and Suno/paid music is OFF so we can't author a new track. The file
  // loops + suspends on tab-hide via gf-lib; preset stays as the fallback if it
  // ever fails to load. setMusicMuted keeps that fallback mute-compliant.
  GF.bgMusic({ file: 'audio/bg_track.mp3', preset: 'tense', muted: GF.muted });
  if (GF.setMusicMuted) GF.setMusicMuted(GF.muted);
}
window.MA = { beep: beep, nukeSfx: nukeSfx, collapseSfx: collapseSfx, loadSfx: loadSfx, playBuf: playBuf, music: startMusic, names: _sfxNames };
