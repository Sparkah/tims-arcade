# DESIGN — Brutalist Stack

> Stack concrete blocks before sunset to maximise the SHADOW area cast across
> the ground. Wider footprints catch more golden light, but tall thin towers
> tip — squat foundations win quietly. Every placement nudges the sun one
> notch west.

## Lose condition

`gs = 'GAMEOVER'` when `cumulativeTilt > SHADOW_TILT_FAIL` (default 30
degrees) across two consecutive frames OR when any placed block's centre
drops below the ground line (`groundY`) and it was not the foundation.
Either trigger fires the collapse, freezes physics, and ends the round
forfeiting all remaining shadow potential.

This trigger is reachable inside ~30s of random play because tilt
accumulates each placement based on lateral offset from the centre-of-mass
multiplied by current stack height; greedy wide placements at altitude
punish hard.

## Win / progression

Round-based, single round of 20 placements. End-of-round WIN when all
20 blocks are placed without collapse: `gs = 'WIN'`. Score equals
`shadowPixels` — the integrated horizontal length of the shadow cast
onto the ground at the final sun angle. Best score stored in
`localStorage` under `brutalist_stack_best`. Players replay to beat
that number; the goal inversion (squat outscores tall) makes the
optimal strategy non-obvious so each run carves a different curve.

The advancement metric is `placementsRemaining` ticking from 20 to 0;
WIN at 0 with no collapse. Threshold: 20 placements survived.

## Controls

Two input affordances only:

- **Drag-place** (mouse drag or touch drag): move the held block over
  the stack; release to drop. Snaps to the nearest top edge of an
  existing block within snap range; otherwise free-place onto the
  stack top.
- **Rotate** (Right-click or `R` key): rotate the held block 90 degrees
  clockwise. Affects only L-shape and 1x2 / 2x1 orientations.

Mobile-first: drag works with a single finger; rotate is reachable via
the on-screen rotate button shown next to the held block.

## Non-timer pressure (REQUIRED)

Two non-timer pressures, NO clock:

- **Moves budget**: 20 placements per round (BLOCK_BUDGET = 20).
  Once spent, the round resolves to its current shadow score.
- **Sun-tick budget**: every placement advances the sun
  SUN_TICK_DEGREES (default 5) west, starting at INITIAL_SUN_ANGLE = 15.
  By placement 20 the sun is at ~115 degrees (deep sunset) — shadows
  are long but the angle also flattens silhouettes, rewarding wide /
  low foundations.
- **Physical pressure**: gravity plus accumulating tilt. Tall thin
  stacks tip; placement choice trades shadow gain against tip-over
  risk.

No countdown timer. The pressure is "moves remaining plus structural
risk plus encroaching shadow geometry from the moving sun".

## Tunables

```
BLOCK_BUDGET        = 20      // placements per round
SUN_TICK_DEGREES    = 5       // sun moves this much per placement
INITIAL_SUN_ANGLE   = 15      // degrees from vertical at round start
SHADOW_TILT_FAIL    = 30      // degrees of cumulative tilt -> collapse
BLOCK_SHAPES        = ['1x1','2x1','1x2','2x2','L']  // five shape names
GRAVITY             = 0.45    // tilt acceleration per frame at offset
RESTITUTION         = 0.08    // self-righting nudge when tilt is small
TILT_DECAY          = 0.92    // angular velocity damping
FOUNDATION_WIDTH    = 12      // ground-level guide span in cells
GROUND_Y_RATIO      = 0.85    // ground line as fraction of design height
```

All ten constants live as JS `var` declarations near the IIFE top and
are exposed via `GF.exposeState()` near the close.

## State machine

`MENU -> PLAYING -> (GAMEOVER | WIN)`

- MENU -> PLAYING via the PLAY button.
- PLAYING -> GAMEOVER when collapse trigger fires (tilt overflow OR
  off-ground placed block).
- PLAYING -> WIN when 20th block lands without collapse.
- GAMEOVER / WIN -> PLAYING via RETRY button (resets stack, sun, score).

All terminal states are reachable: WIN by careful squat play; GAMEOVER
by greedy tall building.

## 30-second hook

Stack 20 concrete blocks before sunset to cast the longest shadow —
tall thin towers tip, but squat foundations win quietly while the sun
marches west on every placement.

## Why come back tomorrow

`TBD - filled by iteration ladder pass #1+`

## Notes

- Shape mix is procedurally drawn rounded concrete-grey rectangles; no
  external sprite assets required.
- Shadow projection is computed as a 1D sweep onto the ground line from
  each block silhouette using the current sun angle.
- Mobile-first viewport tuned to portrait 600x900 design space.
