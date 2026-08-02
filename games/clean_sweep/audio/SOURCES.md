# Audio provenance — Clean Sweep Donut

All files CC0 (Creative Commons 0) from freesound.org, downloaded 2026-07-21,
processed with ffmpeg (peak-normalize to -1 dBFS, leading-silence trim, mono
96 kbps for SFX). Played via Web Audio `decodeAudioData` only — never
HTMLMediaElement (Yandex 1.6.2.5 / YouTube policy).

- `sfx_pop.mp3` — "Pop Free" by AardsReal, https://freesound.org/people/AardsReal/sounds/842184/
  (crumb pickup; big-pickup variant = same buffer at lower playbackRate)
- `sfx_win.mp3` — "WinDoot.wav" by Fupicat, https://freesound.org/people/Fupicat/sounds/521638/
  (level complete)
- `sfx_gameover.mp3` — "j1game_over_mono.wav" by jivatma07, https://freesound.org/people/jivatma07/sounds/173859/
  (time up)
- `sfx_sparkle.mp3` — "ShiningRinging" by NoisyRedFox, https://freesound.org/people/NoisyRedFox/sounds/759840/
  (achievement badge; skin-select variant = higher playbackRate)
- `sfx_click.mp3` — "Videogame Menu BUTTON CLICK" by Christopherderp, https://freesound.org/people/Christopherderp/sounds/342200/
  (UI click)

## Music

The background music is NOT from freesound. It is `bg_loop.mp3`, a Suno Pro
track ("Glazed Dash Loop") — provenance, licence and import method are recorded
in `audio_manifest.json` next to this file. It is the game's ONLY music: there is
no procedural/synth bed and no second track to fall back to.

Removed 2026-07-21: `bg_track.mp3` (2.7 MB, was never referenced by the game —
dead weight flagged by the MCPlay size advisory).

Removed 2026-07-29: `music_loop.mp3` — "Cartoon_Waltz (Dmajor-110bpm)" by Pax11
(https://freesound.org/people/Pax11/sounds/447970/), the previous background
loop, superseded by `bg_loop.mp3`. Deleted rather than left unreferenced, along
with the procedural synth scheduler that used to cover the decode window; that
scheduler is what made old music replay intermittently after a restart.

Auditioned alternates (kept only in the session scratchpad / sound board, not
shipped): Quick pop (Rvgerxini 465264), WinBanjo + WinGrandPiano (Fupicat
521640/521643), Game Over 06 (LilMati 435194), Wind Chimes Blip (mogalini
424248), Button click (Kolombooo 629020), ukulele loop (muri_kuri 682461),
GRANULAR UKULELE #6 (Lentikula 733661).
