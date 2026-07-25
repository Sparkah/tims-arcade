// Procedural SFX for Caravan Thief. Shares ONE AudioContext with Phaser's
// WebAudio sound manager (a single unlock gesture covers the bg-music bed and
// these blips) and respects the same mute state. Zero asset files, gate-safe
// (no <audio> element per effect, no console). Rate-limited so rapid loots
// don't machine-gun.
import Phaser from 'phaser';
import { isBgMusicMuted } from '../audio/lazyBgMusic';

export type SfxName =
  | 'loot'
  | 'dash'
  | 'spotted'
  | 'caught'
  | 'exfil'
  | 'smoke'
  | 'upgrade'
  | 'tier'
  | 'tap'
  | 'deny';

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
const lastPlayed: Record<string, number> = {};

export function initSfx(scene: Phaser.Scene): void {
  if (ctx) return;
  const sm = scene.sound;
  if (sm instanceof Phaser.Sound.WebAudioSoundManager) {
    ctx = sm.context;
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
}

function tone(
  freq: number,
  durMs: number,
  type: OscillatorType,
  gain: number,
  whenOffset = 0,
  freqTo?: number,
): void {
  if (!ctx || !master) return;
  const now = ctx.currentTime + whenOffset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), now + durMs / 1000);
  }
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, now + durMs / 1000);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + durMs / 1000 + 0.02);
}

function noise(durMs: number, gain: number, whenOffset = 0): void {
  if (!ctx || !master) return;
  const now = ctx.currentTime + whenOffset;
  const frames = Math.floor((durMs / 1000) * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0008, now + durMs / 1000);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(now);
  src.stop(now + durMs / 1000 + 0.02);
}

export function sfx(name: SfxName): void {
  if (!ctx || !master) return;
  if (isBgMusicMuted()) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

  const now = performance.now();
  const minGap: Record<string, number> = { loot: 60, tap: 40, dash: 70 };
  const gap = minGap[name] ?? 0;
  if (gap && lastPlayed[name] && now - lastPlayed[name] < gap) return;
  lastPlayed[name] = now;

  switch (name) {
    case 'loot':
      tone(880, 70, 'square', 0.14, 0, 1180);
      tone(1320, 90, 'sine', 0.1, 0.05);
      break;
    case 'dash':
      noise(120, 0.12);
      tone(320, 90, 'sine', 0.08, 0, 180);
      break;
    case 'spotted':
      tone(180, 140, 'sawtooth', 0.2, 0, 520);
      tone(520, 160, 'square', 0.14, 0.1, 180);
      break;
    case 'caught':
      tone(200, 260, 'sawtooth', 0.24, 0, 70);
      noise(200, 0.16, 0.02);
      break;
    case 'exfil':
      tone(523, 90, 'triangle', 0.16, 0);
      tone(392, 110, 'triangle', 0.16, 0.08);
      tone(261, 200, 'sine', 0.14, 0.16);
      break;
    case 'smoke':
      noise(240, 0.18);
      tone(400, 200, 'sine', 0.08, 0, 120);
      break;
    case 'upgrade':
      tone(440, 80, 'sawtooth', 0.14, 0, 660);
      tone(660, 80, 'sawtooth', 0.13, 0.07, 990);
      tone(990, 130, 'sine', 0.12, 0.14);
      break;
    case 'tier':
      tone(523, 110, 'triangle', 0.16, 0);
      tone(659, 110, 'triangle', 0.16, 0.1);
      tone(784, 110, 'triangle', 0.16, 0.2);
      tone(1047, 240, 'sine', 0.15, 0.3);
      break;
    case 'tap':
      tone(420, 45, 'sine', 0.1, 0);
      break;
    case 'deny':
      tone(200, 120, 'square', 0.16, 0, 130);
      break;
  }
}
