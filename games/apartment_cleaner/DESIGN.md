# DESIGN — Apartment Cleaner

> Backfilled 2026-05-06.

## Lose condition

`gs = 'GAMEOVER'` when `timeLeft <= 0` AND `cleaned_pct < target_pct`.

## Win / progression

Level-based. Each level = a different apartment layout (visually distinct rooms via "fake interior" trick). Beat all 8 = WIN.

## Controls

- Arrow keys / WASD: navigate the cleaner
- Mobile: drag-joystick

## Non-timer pressure

**Score target + spatial puzzle**: each apartment's furniture creates choke points and pockets — pure speed isn't enough; you have to plan a route. Some rooms are hidden behind furniture you have to navigate around.

## Tunables

- `BASE_TIME_SEC = 60`
- `TARGET_PCT_LV1 = 0.6` (rises +0.04 per level)
- `MAX_LEVEL = 8`
- `CLEANER_SPEED = 260`
- `ROOM_COUNT_LV1 = 4` (rises by 1 every 2 levels)

## State machine

`MENU → PLAYING → (LEVELEND → PLAYING) → (WIN | GAMEOVER)`

## 30-second hook

Step into your first apartment, see 4 rooms with distinctly different furniture (kitchen tiles, living room couch, bedroom bed), realise you're cleaning a real-feeling space.
