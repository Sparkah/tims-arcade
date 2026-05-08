# DESIGN — Daily Dodge

> Backfilled 2026-05-06. Daily-seed shared-arena dodger; finish position is your daily rank.

## Lose condition

`gs = 'GAMEOVER'` when player collides with an obstacle (hitbox overlap on collision frame).

## Win / progression

**Endless / daily-rank**. Score = duration survived in the daily seeded stream of obstacles. End of run posts to the global leaderboard. Daily rank = your finish position vs. all other players that day.

## Controls

- Arrow keys / WASD: dodge
- Mobile: tilt or drag-joystick

(1 input affordance — direction.)

## Non-timer pressure

**Daily seed + position**: the obstacle stream is identical for everyone that day. Pressure is *social* (rank vs. others) and *positional* (you literally have nowhere to retreat — obstacles auto-scroll). The daily reset adds anticipation. **Live rank pill (iter#1, 2026-05-07)** shows your projected daily rank in the HUD during play, turning the social pressure into a moment-to-moment readout — passing players visibly bumps you up the board mid-run.

## Tunables

- `BASE_OBSTACLE_RATE = 1.0` (rises with elapsed time)
- `MAX_PLAYER_SPEED = 320`
- `LEADERBOARD_TOP_N = 10`
- `SHARE_CARD_DIM = 1080×1080` (Instagram-friendly)

## State machine

`MENU → PLAYING → GAMEOVER → LEADERBOARD`

## 30-second hook

First obstacle skims past your shoulder. The arena flashes. Then you realise: tomorrow, every other player will dodge the *same* obstacle — and you can show off your time.

## Why come back tomorrow

A new daily seed at midnight wipes the board — yesterday's #1 is gone. Your top-position chase resets every 24h, so the leaderboard is always reachable for newcomers and the daily pattern is a fresh puzzle. Live-rank pill (added iter#1) makes "I just passed someone" visible mid-run, reinforcing the daily-cycle return.
