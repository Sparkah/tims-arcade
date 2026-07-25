export function createAudio() {
  let context = null;
  let muted = false;
  let musicTimer = null;
  let musicGain = null;
  let musicStep = 0;
  const musicPattern = [0, 7, 5, 10, 3, 8, 12, 7, 2, 9, 5, 14];

  function ensureContext() {
    if (muted) return null;
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        context = new AudioContextClass();
      }
      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }
      return context;
    } catch (_) {
      return null;
    }
  }

  function tone(frequency, duration, type, gainValue) {
    const ctx = ensureContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration + 0.02);
  }

  function scheduleMusic() {
    const ctx = ensureContext();
    if (!ctx || musicTimer) return;
    if (!musicGain) {
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.018;
      musicGain.connect(ctx.destination);
    }

    const root = 82.41;
    const semitone = musicPattern[musicStep % musicPattern.length];
    const octave = musicStep % 4 === 3 ? 2 : 1;
    const frequency = root * 2 ** ((semitone + octave * 12) / 12);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = musicStep % 6 === 0 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
    oscillator.connect(gain);
    gain.connect(musicGain);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.38);
    musicStep += 1;
    musicTimer = window.setTimeout(() => {
      musicTimer = null;
      scheduleMusic();
    }, musicStep % 4 === 0 ? 620 : 430);
  }

  function stopMusicTimer() {
    if (musicTimer) {
      window.clearTimeout(musicTimer);
      musicTimer = null;
    }
  }

  return {
    unlock() {
      ensureContext();
      scheduleMusic();
    },
    click() {
      tone(330, 0.08, "square", 0.035);
    },
    merge() {
      tone(260, 0.08, "triangle", 0.04);
      setTimeout(() => tone(520, 0.1, "triangle", 0.035), 65);
    },
    reward() {
      tone(420, 0.08, "sine", 0.04);
      setTimeout(() => tone(640, 0.12, "sine", 0.035), 80);
    },
    startWave() {
      scheduleMusic();
      tone(140, 0.12, "sawtooth", 0.035);
      setTimeout(() => tone(210, 0.12, "sawtooth", 0.03), 95);
    },
    hit() {
      tone(95, 0.07, "square", 0.025);
    },
    pause() {
      stopMusicTimer();
      if (context && context.state === "running") {
        context.suspend().catch(() => {});
      }
    },
    resume() {
      ensureContext();
      scheduleMusic();
    },
    setMuted(value) {
      muted = Boolean(value);
      if (muted) stopMusicTimer();
      if (muted && context && context.state === "running") {
        context.suspend().catch(() => {});
      }
    }
  };
}
