// SoundKit - zero-asset procedural sound effects on a shared WebAudio context.
//
// Rule #8: every game ships SFX + background music. Music is the factory lazy
// procedural bed (startLazyBgMusic). This kit covers the SFX half: short
// synthesized blips so there is nothing to download. The context is created
// lazily and resumed on the first user gesture (the first swipe / PLAY tap);
// audio is suspended while the tab is hidden.

type Wave = OscillatorType;

class SoundKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor: typeof AudioContext =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      document.addEventListener('visibilitychange', () => this.onVisibility());
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Call on the first user gesture so iOS/Safari unlocks the context. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private onVisibility(): void {
    if (!this.ctx) return;
    if (document.hidden) {
      void this.ctx.suspend();
    } else if (!this._muted) {
      void this.ctx.resume();
    }
  }

  setMuted(value: boolean): void {
    this._muted = value;
    if (this.master) this.master.gain.value = value ? 0 : 0.5;
    if (this.ctx) {
      if (value) void this.ctx.suspend();
      else void this.ctx.resume();
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  private blip(
    freq: number,
    durMs: number,
    type: Wave = 'sine',
    gain = 0.5,
    sweepTo?: number,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this._muted) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), now + durMs / 1000);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + durMs / 1000 + 0.02);
  }

  private noise(durMs: number, gain = 0.3): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this._muted) return;
    const len = Math.floor((ctx.sampleRate * durMs) / 1000);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start();
  }

  // ---- named SFX ----
  swipe(side: 'left' | 'right'): void {
    this.blip(side === 'left' ? 520 : 620, 90, 'triangle', 0.32, side === 'left' ? 300 : 360);
  }
  accept(): void {
    this.blip(660, 70, 'square', 0.28, 880);
    setTimeout(() => this.blip(990, 90, 'sine', 0.26), 55);
  }
  hit(): void {
    this.noise(120, 0.34);
    this.blip(140, 110, 'sawtooth', 0.3, 70);
  }
  crit(): void {
    this.blip(1180, 70, 'square', 0.3, 1600);
    setTimeout(() => this.blip(1560, 90, 'sine', 0.28), 40);
  }
  shatter(): void {
    this.blip(900, 60, 'triangle', 0.28, 1400);
    setTimeout(() => this.noise(90, 0.22), 30);
    setTimeout(() => this.blip(1320, 80, 'sine', 0.24), 70);
  }
  lose(): void {
    this.blip(220, 280, 'sawtooth', 0.34, 90);
  }
  win(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 220, 'triangle', 0.3), i * 110));
  }
  unlockChime(): void {
    const notes = [784, 988, 1319];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 180, 'sine', 0.3), i * 90));
  }
}

export const soundKit = new SoundKit();
