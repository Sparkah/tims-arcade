# DESIGN — Gunsmith Draft

> Written BEFORE any game code. Every line below is a commitment the
> implementation must honor. The post-build-tester gate verifies these
> promises actually exist in the runtime.

## Lose condition

`gs = 'GAMEOVER'` when `deckRemaining === 0 && unfilledContracts > 0` (i.e. the
30-card deck is exhausted and at least one of the active contracts has at
least one empty craft slot). The pressure is the finite deck size — every
play (place card) and every discard-redraw decrements `deckRemaining`, so
within 30 turns the run is forced to a terminal state. Reachable from random
play in ~45–90s.

## Win / progression

Round-based, single run. `gs = 'WIN'` when `contractsFulfilled >= 3` AND no
new contract slot remains unfulfilled before the deck empties (i.e. you've
shipped 3 weapons before running dry). Score = sum of `(rarity * contract
multiplier)` for shipped weapons MINUS `FAILED_CONTRACT_PENALTY * unfilled`.
Best score persisted in `localStorage['gunsmith_draft_best']`.

## Controls

Maximum 2 affordances:
- **Drag-and-drop** (mouse / touch): drag a card from the hand onto a craft
  slot of matching part type.
- **Tap discard pile / DISCARD button**: discards 1 selected card and draws 1
  fresh from the deck. Counts as a turn.

Mobile-first; both affordances work via touch.

## Non-timer pressure (REQUIRED)

**Resource scarcity** — the 30-card deck is finite. NO countdown timer. Every
card placed or discarded reduces `deckRemaining`. Players must budget plays
versus the 3 active contracts; jokers cut rarity in half so they're risk
mitigation, not free wins. Pressure axes:
- finite deck (resource scarcity, primary)
- limited hand size (5 cards)
- failed-contract penalty (lives-like score loss)

## Tunables

```
DECK_SIZE                = 30
HAND_SIZE                = 5
CRAFT_SLOTS              = 4
JOKER_RATIO              = 0.10
ACTIVE_CONTRACTS         = 3
CONTRACT_VALUE_BASE      = 50
JOKER_RARITY_PENALTY     = 0.5
FAILED_CONTRACT_PENALTY  = 10
PART_TYPES               = 5
```

(Part types: barrel, stock, scope, magazine, grip. Rarity range 1–5.)

## State machine

`MENU → PLAYING → (GAMEOVER | WIN)`.
- MENU → PLAYING when player taps PLAY (deck shuffled, hand drawn, 3 contracts dealt).
- PLAYING → GAMEOVER when deck reaches 0 with unfilled contracts.
- PLAYING → WIN when 3 contracts fulfilled and player taps continue OR deck empties cleanly.
- GAMEOVER / WIN → PLAYING via RETRY button.

## 30-second hook

*"Order book demands 3 specific weapons. Your 30-card deck has the parts —
match them before you run dry. Jokers are insurance, not free wins."*

## Why come back tomorrow

`TBD - filled by iteration ladder pass #1+`

This section starts as a placeholder for v0.1 builds. The first iteration
pass (after the game earns engagement signal) replaces it with the actual
"reason to return" — persistent best score, leaderboard, unlocks, daily
seed competition, meta-progression, etc.

## Notes

- Implementation may add detail (sub-states, UI flourishes) but cannot
  contradict the commitments above.
- Joker cards substitute any part type but apply `JOKER_RARITY_PENALTY` (0.5x)
  to the contributed rarity.
- Contracts request specific weapon classes:
  - Rifle: barrel + stock + magazine + scope (4 parts)
  - Pistol: barrel + grip + magazine (3 parts → fills 3 of 4 slots)
  - Shotgun: barrel + stock + grip (3 parts → fills 3 of 4 slots)
  - SMG: barrel + magazine + grip + stock (4 parts)
- For uniformity, the implementation treats every contract as 4-slot — short
  weapon classes have one "wildcard slot" that accepts ANY remaining part type
  (still scored). Keeps the UI consistent with CRAFT_SLOTS=4.
