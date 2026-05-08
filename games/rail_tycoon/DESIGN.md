# DESIGN — Rail Tycoon

> Backfilled 2026-05-06. Tim flagged "rules unclear" in an earlier session — fixed via tutorial overlay + dotted hint lines + target-station pulse.

## Lose condition

`gs = 'GAMEOVER'` when `strikes >= MAX_STRIKES` (5) — too many cargos delivered to the wrong station.

## Win / progression

Level-based. Hit the level's `PROFIT_TARGET` before strikes max out → advance. 10 levels = WIN.

## Controls

- Drag from station A to station B: draw a rail line. Cargo of A's color flows along it.
- Tap station: cycle through queued cargo.

## Non-timer pressure

**Strikes (lives)**: 5 wrong deliveries = game over. Plus the queue keeps growing — if you don't move cargo fast enough, stations clog up and trigger missed-delivery strikes.

## Tunables

- `MAX_STRIKES = 5`
- `MAX_LEVEL = 10`
- `PROFIT_TARGET_LV1 = 12` (×1.5 each level)
- `CARGO_COLORS = 5` (red, blue, green, yellow, purple — added gradually per level)
- `RAIL_DRAW_SPEED = 320`

## State machine

`MENU → TUTORIAL → PLAYING → (LEVELEND → PLAYING) → (WIN | GAMEOVER)`

## 30-second hook

Draw your first rail between two same-color stations, watch cargo flow along it, profit ticks up — and you realise you can chain stations with multi-color hubs.
