# DESIGN — Creature Hunt

> Backfilled 2026-05-06 for an existing shipped multiplayer game. This one differs from typical factory games — it's server-authoritative WebSocket multiplayer.

## Lose condition

`gs = 'CAUGHT'` when the hunter player tags you (collision check on server). One round = one life.

## Win / progression

**Round-based PvP**: survive the round = WIN that round. No cumulative win — each round is independent. Server matchmakes 2-4 players, randomly picks one as hunter.

## Controls

- WASD / arrow keys: move
- Mobile: virtual joystick (drag thumb on left half of screen)

(1 input affordance — direction.)

## Non-timer pressure

**Position / geometry**: maze layout creates choke points. Hunter has speed advantage. Time pressure is also present (2-min round cap) but the *real* pressure is positional — you're constantly weighing risk of being cornered.

## Tunables

- `ROUND_DURATION_SEC = 120`
- `HUNTER_SPEED_MULT = 1.15`
- `TICK_RATE_HZ = 20` (server)
- `SPEED_SCALE = TICK_MS * 60 / 1000` (client compensation for 20Hz tick)
- `MAZE_W = 32, MAZE_H = 24`

## State machine

`MENU → LOBBY → ROUND → (WIN | CAUGHT) → LOBBY`

## 30-second hook

Spawn into a maze, hear the hunter footstep sound *behind* you, sprint for the nearest corner with no time to think.

## Why come back tomorrow

**Personal best chase** (iter#1, 2026-05-07): Each player has a localStorage record (`creature_hunt_best`) tracking best survival time as human, most humans caught as creature, and total rounds played. HUD shows your current target ("BEST: 1:24"); game-over screen pops "NEW BEST!" when beaten and shows lifetime totals on the menu. Reason to load it again: beat your own number — independent of matchmaking outcomes.

## Notes

- Multiplayer architecture documented separately in `~/.claude/skills/multiplayer-gamedev/SKILL.md`
- WebSocket server hosted on Render: `wss://running-away.onrender.com`
- Fully server-authoritative — no client-side prediction (intentional, see Knowledge note)
