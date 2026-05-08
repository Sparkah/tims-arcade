# DESIGN — Pong Wars Reverse

> Self-vs-self Pong on a colour-flip tile arena. The brain-twist: HITTING the
> ball PROTECTS the wrong team. Win condition forces you to deliberately MISS
> with both paddles you control simultaneously.

## Lose condition

`gs = 'GAMEOVER'` when `bouncesLeft <= 0` AND `redTileFraction < 0.6`
(final red coverage below 60% of the 40x30 grid). The bounce budget starts
at 200 and drops by 1 each time the ball reflects off a tile or paddle.
Once it hits 0 the ball freezes and the round resolves: WIN if red coverage
at or above 60%, GAMEOVER otherwise. Reachable in ~25 to 45 seconds of
normal play.

## Win / progression

**Round-based, daily seed.** Score = percentage of grid tiles in red colour
when the bounce budget runs out. Daily seed (`pong_wars_reverse` salt plus
YYYYMMDD) drives the deterministic ball spawn position and initial
velocity, so every player faces the same starting line that day.
Persistent best is written to `localStorage` under key
`pong_wars_reverse_best_YYYY-MM-DD` once per round end (only if higher
than the previous value for that day). A fresh seed lands at midnight, so
yesterday's score is sealed and today is a new race. State machine:
`MENU -> PLAYING -> (WIN | GAMEOVER) -> MENU`.

## Controls

- **Mouse-X** drives the RED paddle (clamped to its half of the field).
- **Arrow keys** (Left / Right) or **A / D** drive the BLUE paddle on its
  half of the field.
- Touch fallback: split-screen — touch on the red side drags red, touch on
  the blue side drags blue. Both touches can be active at once.

Two input affordances total (mouse plus keys). Both paddles are always live
under the player simultaneously — that is the cognitive load that makes
the lose-to-win flip interesting.

## Non-timer pressure (REQUIRED)

**Resource scarcity — bounce budget.** The ball has exactly 200 reflections
before it freezes. Every wall, paddle, and tile-flip bounce costs one. There
is NO clock. The pressure axis is "you only have a limited number of flips
left to convert enemy tiles," so wasting bounces on your own colour wall
(which doesn't flip anything) is a real cost. The HUD shows a shrinking
"bounces left" meter. Hitting the ball with your own paddle technically
saves a bounce from a wall hit, but it also denies a tile-flip on the far
side — that trade-off is the whole game.

## Tunables

```
GRID_W = 40
GRID_H = 30
BOUNCE_BUDGET = 200
BALL_SPEED = 4.5
PADDLE_W = 80
PADDLE_H = 10
WIN_THRESHOLD = 0.6
DAILY_SEED_SALT = "pong_wars_reverse"
SPIN_FACTOR = 0.15
MIN_VERTICAL_SPEED = 2.0
```

All eleven constants are exposed via `GF.exposeState()` near the IIFE close
so the post-build-tester gate can verify them at runtime.

## State machine

`MENU -> PLAYING -> (WIN | GAMEOVER) -> MENU`

- MENU: shows hook plus PLAY button. Daily seed displayed under the title.
- PLAYING: the only interactive state. Ball auto-bounces, both paddles
  follow input, bounce budget ticks down.
- WIN: bounce budget exhausted with red coverage at or above 60%. Final
  percentage shown.
- GAMEOVER: bounce budget exhausted with red coverage below 60%. Final
  percentage shown. RETRY returns to MENU.

Each terminal state is reachable: a passive run with no input typically
resolves around 50% red coverage (close to a tie), and a player who leans
into the lose-to-win flip can push past 60%.

## 30-second hook

Both paddles are yours. Miss the ball on purpose so it converts enemy tiles. Hit it and you protect the wrong team.

## Why come back tomorrow

`TBD - filled by iteration ladder pass #1+`

The daily seed already sets up a competitive frame (today's board is the
same for everyone). The explicit best-per-day comparison UI lives in iter#1.

## Notes

- Implementation may add detail (sub-states, UI flourishes) but cannot
  contradict the commitments above.
- If the lose-to-win flip turns out to be too obscure in playtest, iteration
  pass 1 should add a one-line in-game tooltip — not change the core rule.
