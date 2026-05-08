# DESIGN — Vowel Hold'em

> Written BEFORE any game code. Every line below is a commitment the
> implementation must honor. The post-build-tester gate verifies these
> promises actually exist in the runtime.

## Lose condition

`gs = 'GAMEOVER'` when `chips <= 0` for 1 frame (player busted out — cannot post next blind).

Reachable from random play within ~60s: starting chip stack is 100, blind is 5, min bet 10. Aggressive play / fold-heavy play burns through 100 chips in 4-8 hands (~30-60s with bot turns).

## Win / progression

**Round-based**: advance after each settled hand; `gs = 'WIN'` when `chips >= WIN_CHIP_TARGET` (500) OR `hands_played >= MAX_HANDS` (20) with `chips > STARTING_CHIPS` (100).

Score = final chip count at endgame. Best score persists in `localStorage['vowel_holdem_best']`.

## Controls

Maximum **2** input affordances:
- **click/tap letter** — adds letter card from hand or community to spelling tray (click again to remove)
- **click/tap action button** — Bet (10/25/50), Check, Fold, Reveal, Next Hand

Mobile-first: large card hit-targets, all buttons ≥ 48px tall.

## Non-timer pressure (REQUIRED)

**Resource scarcity (chip budget)**: starting stack of 100 chips, blind 5/hand, min raise 10. Player must manage stack across up to 20 hands. NO countdown clock per turn — player can think as long as they want.

Secondary pressure: **hand budget** (MAX_HANDS=20) — even if surviving, the game ends.

## Tunables

```
STARTING_CHIPS    = 100
HAND_CONSONANTS   = 5
FLOP_VOWELS       = 3
TURN_VOWELS       = 1
RIVER_VOWELS      = 1
MIN_BET           = 10
BLIND             = 5
BOT_BLUFF_PROB    = 0.18
MAX_HANDS         = 20
WIN_CHIP_TARGET   = 500
```

Exposed via `GF.exposeState()` near IIFE close.

## State machine

```
MENU
  ↓ click Start
DEAL  (deal 5 consonants to player + bot, post blinds)
  ↓
PREFLOP_BET  (player can Check/Bet/Fold; bot responds)
  ↓
FLOP  (reveal 3 community vowels)
  ↓
TURN  (reveal 1 vowel)
  ↓
RIVER (reveal 1 vowel)
  ↓
SHOWDOWN  (player builds word, clicks Reveal; bot reveals its word; longer valid word wins pot)
  ↓
SETTLE  (chips updated, "Next Hand" button)
  ↓ if chips ≤ 0 → GAMEOVER
  ↓ if chips ≥ 500 OR hands_played ≥ 20 → WIN
  ↓ else → DEAL
```

All terminal states (GAMEOVER, WIN) reachable: bust → GAMEOVER; survive 20 hands or hit 500 → WIN.

## 30-second hook

*"Five consonants in your hand, vowels flip in the middle — bet whether you can spell a longer word than the bot before the river reveals."*

## Why come back tomorrow

`TBD - filled by iteration ladder pass #1+`

(Daily-seed mode is implemented v0.1 — same hand sequence per UTC day so leaderboard / score-share is a natural iteration target.)

## Notes

- Word validation uses an embedded ~8K English Set (top common words), checked O(1).
- Spelled word must be: ≥ 3 letters, in dictionary, use ≥ 1 card from player's hand (the "use your hole cards" poker rule).
- Bot picks the longest valid word from its hand+community via greedy combinatorial search; bluffs by raising even with weak words at `BOT_BLUFF_PROB`.
- Tie = split pot.
- Russian play not supported v1 (wordlist is EN-only). Future iteration: ru wordlist + cyrillic letter cards.
