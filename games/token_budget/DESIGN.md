# DESIGN — Token Budget

> Written BEFORE any game code. Every line below is a commitment the
> implementation must honor. The post-build-tester gate verifies these
> promises actually exist in the runtime.

## Lose condition

`gs = 'GAMEOVER'` when `tokens <= 0 && tasksRemaining > 0`.

The player's running token budget bleeds whenever a stuck task decays.
STUCK_DECAY_PER_SEC drains 1 token/sec while ANY decaying task sits on the
board. With cheap agents that can't route a complexity-5 task, decay
starts within ~5 seconds and pushes tokens below zero in well under a
minute of careless play. Easy to reach within 60s on a chaotic wave 3+.

## Win / progression

Round-based — 10 waves total. Advance when
`waveTasksCleared >= waveTaskCount` (all tasks for the wave reached the
right edge). When the player clears wave 10, `gs = 'WIN'`.

- WAVE_COUNT = 10
- Score formula at end: `tokens + wavesCleared * 50`
- Best stored in localStorage under key `token_budget_best`

## Controls

Maximum 2 input affordances:
- **Drag** an agent token from the bottom tray onto a hex cell to place it
  (mouse drag + touch drag both supported via the same pointer code path).
- **Click / tap** a placed agent on the board to remove it (refunds 50% of
  the agent's token cost). The "Next Wave" button uses the same pointer
  handler — taps that hit the button advance the wave manually.

## Non-timer pressure (REQUIRED)

Resource scarcity — the finite tokens budget is the only enemy. No
countdown timer drives the round. Pressure sources, all numeric, all
visible:
- Placing an agent costs tokens up-front (CHEAP_COST=1, EXPENSIVE_COST=5)
- Stuck/decaying tasks drain STUCK_DECAY_PER_SEC = 1 tokens per second each
- Wave clear pays WAVE_BONUS_TOKENS = 20 so good play can grow the budget
  instead of just bleeding it
- Maps to the "resource scarcity (limited ammo, energy, ink)" choice from
  the allowed list — tokens are the energy meter.

## Tunables

```
GRID_W                   = 8
GRID_H                   = 6
START_TOKENS             = 100
CHEAP_COST               = 1
CHEAP_SPEED              = 0.5
CHEAP_MAX_COMPLEXITY     = 2
EXPENSIVE_COST           = 5
EXPENSIVE_SPEED          = 1.0
EXPENSIVE_MAX_COMPLEXITY = 5
WAVE_COUNT               = 10
TASKS_PER_WAVE_BASE      = 3
WAVE_BONUS_TOKENS        = 20
STUCK_DECAY_PER_SEC      = 1
```

All exposed via `GF.exposeState()` so the post-build-tester gate can
inspect them at runtime.

## State machine

MENU → PLAYING → (GAMEOVER | WIN)

- MENU → PLAYING on PLAY tap
- PLAYING → GAMEOVER when tokens drop to 0 or below with tasks remaining
- PLAYING → WIN when wave 10 is cleared
- GAMEOVER / WIN → PLAYING on RETRY tap (resets tokens, wave, board)

## 30-second hook

Cheap agents are slow but cost almost nothing; expensive agents handle
anything but bleed your budget — route tasks through the right hex chain
or watch your token meter melt while a complexity-5 task sits stuck on a
haiku.

## Why come back tomorrow

`TBD - filled by iteration ladder pass #1+`

## Notes

- Agents are drawn as filled circles on hex tiles, labelled "h" for haiku
  (cheap) and "o" for opus (expensive), so cost class is visible.
- Tasks display their complexity number; their colour fades to red while
  decaying.
- A task that reaches the right column is "completed" and removed from
  the board; clearing the whole wave triggers WAVE_BONUS_TOKENS payout.
- Implementation may add detail (sub-states, UI flourishes) but cannot
  contradict the commitments above.
