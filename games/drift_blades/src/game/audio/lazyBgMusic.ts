// Factory music loader - keeps the bespoke track OFF the preload barrier
// (a 2MB mp3 in PreloadScene made games non-interactive through the whole
// boot - gallery-perf-diagnosis-2026-06-11). Bespoke-first with fallback:
//
//   startLazyBgMusic(this)  call from the MENU scene's create(), after the
//                           scene is interactive. It kicks a background
//                           download of assets/audio/bg_track.mp3, starts a
//                           quiet procedural WebAudio bed at the first
//                           gesture, and crossfades to the bespoke track
//                           when (and only when) it is decoded. A missing
//                           or failed mp3 leaves the procedural bed playing.
//                           Nothing here ever blocks boot or input.
//
// Wire the game's mute button to setBgMusicMuted(); Phaser's global
// this.sound.mute is mirrored automatically. window.__bgMusic exposes
// { mode: 'silent' | 'procedural' | 'bespoke', muted } for the gates.
import Phaser from 'phaser';

export type LazyBgMusicOptions = {
  url?: string;
  volume?: number;
  procedural?: boolean;
};

type MusicMode = 'silent' | 'procedural' | 'bespoke';

declare global {
  interface Window {
    __bgMusic?: { mode: MusicMode; muted: boolean };
  }
}

let started = false;
let muted = false;
let pausedAll = false;
let globalVolume = 1;
let mode: MusicMode = 'silent';
let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let stopBed: (() => void) | undefined;
let bespokeStarted = false;
let htmlAudio: HTMLAudioElement | undefined;
let targetVolume = 0.35;

function publish(): void {
  window.__bgMusic = { mode, muted };
}

function applyMute(): void {
  // One gain law for every silencing source: explicit mute, hidden tab,
  // this.sound.pauseAll(), and the Phaser global volume.
  const silent = muted || pausedAll || document.hidden;
  if (master && ctx) {
    master.gain.setValueAtTime(silent ? 0 : globalVolume, ctx.currentTime);
  }
  if (htmlAudio) {
    htmlAudio.muted = muted;
    htmlAudio.volume = Math.max(0, Math.min(1, targetVolume * globalVolume));
    if (silent) {
      htmlAudio.pause();
    } else if (mode === 'bespoke' && htmlAudio.paused) {
      void htmlAudio.play().catch(() => undefined);
    }
  }
  publish();
}

export function setBgMusicMuted(value: boolean): void {
  muted = value;
  applyMute();
}

export function isBgMusicMuted(): boolean {
  return muted;
}

function startProceduralBed(audioCtx: AudioContext, out: GainNode): () => void {
  // Two detuned triangle oscillators walking a tiny progression - a quiet
  // placeholder bed, not the soundtrack. The bespoke mp3 replaces it.
  const roots = [220, 174.61, 196, 146.83];
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  osc1.type = 'triangle';
  osc2.type = 'triangle';
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(out);

  let bar = 0;
  const applyBar = (): void => {
    const t = audioCtx.currentTime;
    const root = roots[bar % roots.length];
    osc1.frequency.setValueAtTime(root, t);
    osc2.frequency.setValueAtTime(root * 1.5 * 1.003, t);
    bar += 1;
  };

  applyBar();
  osc1.start();
  osc2.start();
  gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 1.2);
  const timer = window.setInterval(applyBar, 2400);

  return () => {
    window.clearInterval(timer);
    const t = audioCtx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.6);
    window.setTimeout(() => {
      try {
        osc1.stop();
        osc2.stop();
        gain.disconnect();
      } catch {
        // already torn down
      }
    }, 700);
  };
}

async function fetchAndDecode(url: string, audioCtx: AudioContext): Promise<AudioBuffer | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return undefined;
    }
    const raw = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(raw);
  } catch {
    return undefined;
  }
}

function startHtmlAudio(url: string): void {
  // No-WebAudio fallback (rare): plain looping element, started on the
  // unlock gesture so autoplay policy is satisfied.
  const el = document.createElement('audio');
  el.src = url;
  el.loop = true;
  el.preload = 'auto';
  el.volume = targetVolume;
  htmlAudio = el;
  const p = el.play();
  if (p) {
    p.then(() => {
      mode = 'bespoke';
      publish();
    }).catch(() => undefined);
  }
}

export function startLazyBgMusic(scene: Phaser.Scene, options: LazyBgMusicOptions = {}): void {
  if (started) {
    return;
  }
  started = true;
  targetVolume = options.volume ?? 0.35;
  const url = options.url ?? 'assets/audio/bg_track.mp3';
  const wantBed = options.procedural ?? true;

  const sm = scene.sound;
  if (sm instanceof Phaser.Sound.WebAudioSoundManager) {
    ctx = sm.context;
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
  }
  publish();

  // Mirror the Phaser sound manager so games that mute/pause/volume through
  // this.sound.* control this channel too (we connect to the context
  // directly, outside the manager's own graph).
  globalVolume = sm.volume;
  muted = sm.mute;
  sm.on(Phaser.Sound.Events.GLOBAL_MUTE, (_manager: unknown, value: boolean) => {
    muted = value;
    applyMute();
  });
  sm.on(Phaser.Sound.Events.GLOBAL_VOLUME, (_manager: unknown, value: number) => {
    globalVolume = value;
    applyMute();
  });
  sm.on(Phaser.Sound.Events.PAUSE_ALL, () => {
    pausedAll = true;
    applyMute();
  });
  sm.on(Phaser.Sound.Events.RESUME_ALL, () => {
    pausedAll = false;
    applyMute();
  });
  document.addEventListener('visibilitychange', applyMute);

  let buffer: AudioBuffer | undefined;
  let unlocked = false;

  const tryStartBespoke = (): void => {
    if (!ctx || !master || !buffer || bespokeStarted || !unlocked) {
      return;
    }
    bespokeStarted = true;
    if (stopBed) {
      stopBed();
      stopBed = undefined;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
    gain.gain.linearRampToValueAtTime(targetVolume, ctx.currentTime + 0.8);
    mode = 'bespoke';
    publish();
  };

  const onUnlock = (): void => {
    unlocked = true;
    if (!ctx) {
      startHtmlAudio(url);
      return;
    }
    if (buffer) {
      tryStartBespoke();
      return;
    }
    if (wantBed && master) {
      mode = 'procedural';
      stopBed = startProceduralBed(ctx, master);
      publish();
    }
  };

  if (sm.locked) {
    sm.once(Phaser.Sound.Events.UNLOCKED, onUnlock);
  } else {
    onUnlock();
  }

  if (ctx) {
    // The download starts NOW (post-menu, off the preload barrier, no
    // gesture needed); playback waits for the unlock above.
    void fetchAndDecode(url, ctx).then((decoded) => {
      buffer = decoded;
      tryStartBespoke();
    });
  }
}
