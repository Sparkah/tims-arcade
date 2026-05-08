# DESIGN — Clean Sweep Donut

> Backfilled 2026-05-06 for an existing shipped game.

## Lose condition

`gs = 'GAMEOVER'` when `timeLeft <= 0` AND `cleaned_pct < target_pct` — ran out of time without hitting the cleanup target.

## Win / progression

Level-based. Each level: clean ≥ target percentage (rises per level) within the time budget. Beat all 10 levels = WIN. Each level has tighter spawn, more obstacles, higher target.

## Controls

- Arrow keys / WASD: roll the donut
- Mobile: tilt or drag-joystick

(1 input affordance — movement.)

## Non-timer pressure

**Score target + geometry-fill**: dirt and obstacles regenerate; you're racing not just the clock but the rate at which the rink dirties up. Combo multiplier on consecutive clean sweeps.

## Tunables

- `BASE_TIME_SEC = 60`
- `TARGET_PCT_LV1 = 0.55` (rises +0.04 per level)
- `MAX_LEVEL = 10`
- `COMBO_DECAY_SEC = 1.5`
- `DONUT_SPEED = 280`

## State machine

`MENU → PLAYING → (LEVELEND → PLAYING) → (WIN | GAMEOVER)`

## 30-second hook

Roll over your first 5 crumbs in a row, watch the combo counter pop, feel the donut speed up.

## Why come back tomorrow

**Personal best chase (iter#1).** Best score persists across sessions via
`localStorage['clean_sweep_best']`. The HUD shows `BEST: N` next to the live
score so the target is always visible; on game-over a yellow `NEW BEST!`
banner pops with sparkles when the player beats their high-water mark.
Every run is a measurable swing at one number.

## Iteration log

- **iter#1 (2026-05-07)** — persistent best score: live HUD readout, gameover NEW BEST banner, localStorage key `clean_sweep_best` with one-time migration from legacy `cs_best`.
