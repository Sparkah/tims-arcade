# DESIGN — Battleships Skirmish

> Daily-seeded one-screen battleships. Place your fleet, race the same
> AI board everyone else got today, salvo bonus rewards streaks. Ship a
> shareable result card with your turn count.

## Lose condition

`gs = 'GAMEOVER'` when `playerShipsAlive == 0` AND `aiShipsAlive > 0` (player
fleet sunk first), OR when `turnsUsed >= MAX_TURNS` AND `aiShipsAlive > 0`
(turn budget exhausted before sinking AI fleet). Either trigger flips the
state machine to GAMEOVER on the same frame the condition becomes true.

## Win / progression

**Round-based, daily seed.** Player wins by sinking all AI ships before turn
budget runs out — `gs = 'WIN'` when `aiShipsAlive == 0` AND `playerShipsAlive
> 0`.

Score = `turnsUsed` (lower is better). Daily best stored in localStorage
under `battleships_skirmish_best_YYYY-MM-DD` so the same UTC day comparison
works across sessions. Daily seed = `SimpleHash("battleships_skirmish_" +
UTC_DATE)` deterministically places the AI fleet — every player faces the
same board on the same UTC day. Personal-best across days kept under
`battleships_skirmish_pb_alltime`.

## Controls

Maximum **2** input affordances, one mode per phase:

- **PLACEMENT phase**: tap/click a cell to place current ship; tap a rotate
  button (or press R / spacebar) to swap orientation horizontal vs vertical.
- **PLAYING phase**: tap/click an enemy-grid cell to fire. Same mouse and
  touch handler — no drag, no double-tap.

Mobile-first: cells are sized so a finger can reliably hit a single 8x8
square at any viewport.

## Non-timer pressure (REQUIRED)

**TURN BUDGET — no clock anywhere.** Player has at most `MAX_TURNS = 80`
shots to sink the AI's 17-cell fleet (5+4+3+3+2). Run over budget = loss.
The HUD shows `turns left: N` prominently; it does not count time.

**Salvo streak** (the relief valve): hit two enemy cells in a row earns
`SALVO_BONUS = +1` extra shot next turn. The streak resets on a miss. On
tight seeds the budget is unbeatable without milking salvos, so the
pressure is "stop missing". This is the moves-budget mechanic — no timer
is rendered or used anywhere in the loop.

## Tunables

```
GRID_SIZE              = 8
MAX_TURNS              = 80
SHIPS                  = [5, 4, 3, 3, 2]   // ship lengths, total 17 cells
SALVO_THRESHOLD        = 2                  // hits in a row to earn bonus
SALVO_BONUS            = 1                  // extra shots next turn
AI_HUNT_AGGRESSION     = 0.85               // prob of hunt-mode adjacent shot
AI_RANDOM_SHOTS_FIRST  = 10                 // pure-random AI moves on opening
DAILY_SEED_HASH_SALT   = "battleships_skirmish"
```

## State machine

`MENU -> PLACEMENT -> PLAYING -> (WIN | GAMEOVER) -> MENU`

- `MENU` -> tap PLAY -> `PLACEMENT`
- `PLACEMENT` -> all 5 ships placed -> auto-advance to `PLAYING`
- `PLAYING` -> `WIN` if AI fleet sunk; `GAMEOVER` if player fleet sunk OR
  turn budget exhausted
- `WIN` / `GAMEOVER` -> tap RETRY -> `PLACEMENT` (new attempt, same daily
  seed)

Both terminal states reachable from a 30-60 second game (small grid,
80-turn cap).

## 30-second hook

Same daily board for everyone. The seed bites or it doesn't — but salvo
streaks let smart players beat tight budgets. The first hit lights up red,
the budget pip ticks down, and the mind starts doing little adjacency
math: *"if I hit again here, that's a salvo, and salvo carries the
budget."*

## Why come back tomorrow

`TBD - filled by iteration ladder pass #1+`

The daily-seeded AI fleet is the candidate hook: tomorrow's board is a
fresh puzzle, yesterday's turn-count is a target to beat, and the
result-card shareable invites friends to race the same seed. Final shape
decided after v0.1 ships and earns engagement signal.

## Notes

- 8x8 grid keeps the whole game on one screen at any aspect ratio.
- AI placement uses the daily seed + a deterministic per-day RNG so the
  AI fleet layout matches across all players on the same UTC day.
- The AI's *shooting* logic doesn't need to be deterministic
  (player-vs-AI, not player-vs-player), but its placement does.
- Result card: at end-of-game render a shareable summary canvas
  ("Daily Battleships YYYY-MM-DD won in N turns / longest salvo X /
  game-factory.tech") via `GF.shareCard()`.
