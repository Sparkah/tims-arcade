# DESIGN — Ice Sweeper

> Backfilled 2026-05-06.

## Lose condition

`gs = 'GAMEOVER'` when `timeLeft <= 0` AND `cleaned_pct < target_pct` — same shape as Clean Sweep.

## Win / progression

Level-based. Break dirty ice into chunks, vacuum them, expose clean tiles underneath. Beat all 8 levels = WIN.

## Controls

- Arrow keys / WASD: drive the cleaner
- Mobile: drag-joystick

## Non-timer pressure

**Score target + procedural ice destruction**: the ice doesn't just exist — your vehicle CRACKS it on contact, creating chunks that can be vacuumed. The destruction physics is a satisfaction loop independent of the clock.

## Tunables

- `BASE_TIME_SEC = 60`
- `TARGET_PCT_LV1 = 0.55` (rises +0.05 per level)
- `MAX_LEVEL = 8`
- `ICE_CHUNK_SIZE = 24`
- `VEHICLE_SPEED = 240`

## State machine

`MENU → PLAYING → (LEVELEND → PLAYING) → (WIN | GAMEOVER)`

## 30-second hook

Plough into a sheet of dirty ice, watch it crack into 6-8 chunks, vacuum them up in one sweep.
