# DESIGN — Megaton

> Nuclear destruction sim. One tap drops a warhead; a shockwave sweeps the skyline and
> buildings topple in sequence; you earn from the destruction and upgrade your yield to wipe
> bigger cities off the map. Minimalist + instantly clear: tap the city, watch it level, upgrade.
> (Theme from Tim's nuclear-war prompt; reframed to a satisfying tap-boom-upgrade loop.)

## Lose condition

**Endless incremental sim — no fail/death state** (same class as our idle game 167_cedar_hollow).
The player can always detonate again; there is nothing to "lose". Structure comes from the
per-city WIPE goal + the upgrade economy, not from a game-over. `gs` never enters GAMEOVER from
play. (The post-build-tester loop-depth / econ gates replace the lose-reachability check for idle.)

## Win / progression

- **Per-city goal:** destroy the city to the WIPE threshold (`WIPE_PCT`, 92%). Hitting it triggers
  a "CITY WIPED" payout + advance to the next, bigger CITY TIER.
- **Endless tiers:** Outpost -> Town -> City -> Metropolis -> Megacity -> ... each tier has more &
  taller buildings (and, later, reinforced ones). `cityTier` climbs forever; difficulty/value scale.
- **Score = total destruction** in megatons (`totalMT`), persisted as `best`.

## Controls

Maximum 2 input affordances, tap-only (mobile-first):
- **Tap the city** — drop a warhead at that point (ground zero = tap location).
- **Tap an UPGRADE button** — spend $ on a yield upgrade (and tap NEXT/overlay buttons).

## Non-timer pressure (REQUIRED)

No countdown timer. The drivers are all economy/spatial:
- **Per-city WIPE goal** (destroy 92% to advance) + a visible DESTROYED% bar.
- **Aim skill** — early blasts are small, so WHERE you tap (the dense cluster) decides destruction.
- **Upgrade economy** — rising upgrade costs gate how fast your yield grows (resource scarcity).
- **Escalating city size** — each tier has more mass to level, so the loop keeps demanding bigger yield.

## Reward & agency (REQUIRED — first-session quality gate)

- **Legible progress:** the DESTROYED% bar fills on every strike; the always-visible goal is
  "WIPE THIS CITY (92%)"; total $ and the next-upgrade cost are on screen.
- **Forgiving failure:** there is no failure — a weak strike just earns less; you detonate again.
  Currency + upgrades are permanent and saved.
- **Meaningful choice:** WHERE to aim each blast, and WHICH upgrade to buy next (radius vs fireball
  vs shockwave vs fallout vs MIRV) — different paths to "wipe it in one tap".
- **Every-session payoff:** $ earned + at least one permanent yield upgrade + (usually) a new city tier.

## Tunables

```
BLAST_BASE_R    = 60     // base blast radius (design px) at yield level 0
YIELD_R_PER_LVL = 22     // +radius per YIELD upgrade level
FIREBALL_R      = 0      // central vaporize radius (unlocked/grown by FIREBALL upgrade)
SHOCKWAVE_BONUS = 0      // extra topple ring beyond the blast (SHOCKWAVE upgrade)
FALLOUT_SECS    = 0      // lingering damage seconds after the blast (FALLOUT upgrade)
WARHEADS        = 1      // simultaneous warheads per tap (MIRV upgrade, max 4)
WIPE_PCT        = 0.92   // destroyed fraction to clear a city
BUILDING_VALUE  = 10     // base $ per building destroyed (x height/type multiplier)
UPGRADE_COST_K  = 1.7    // cost growth per upgrade level
CITY_GROWTH     = 1.35   // building-count/mass growth per city tier
REBUILD_SECS    = 1.2    // pause before the next city/skyline settles in
```

Hitboxes: buildings are AABBs (x,w + height); a building is destroyed when the blast/shockwave
radius reaches its base center. Blast catch = `dist(groundZero, building.cx) < radius`.

## Game objects

- **Warhead blast** (player): expanding fireball + shockwave ring from the tap point; destroys
  buildings as the front passes them (sequential topple). VFX: white flash, mushroom cloud,
  debris, screen shake, deep boom.
- **Buildings** (targets): flat skyline rectangles with windows; types: `house` (low, cheap),
  `tower` (tall, worth more), later `bunker` (reinforced — survives one wave, needs more yield).
  On destruction: topple to a rubble pile + "+$" float + smoke.
- **City** (level): a set of buildings on a ground line; has a destroyed% and a $ value; rebuilds
  bigger when wiped or for the next tier.
- **Upgrades** (meta): YIELD (radius), FIREBALL (center vaporize + bonus), SHOCKWAVE (topple ring),
  FALLOUT (lingering burn), MIRV (more warheads). Each level visibly grows the blast.

## Arms race (live build) — offense loadout vs city defenses

The escalation is two-sided: the city reinforces when you fail, and you tune the NUKE LOADOUT to
counter. Opened via the "Tune Nuke" button -> the LOADOUT menu (gradient header, 4 upgrade cards
with icon + level pips + cost, plus a 2-tap **Restart Game** and the **Deploy** button).

- **Offense (LOADOUT):** YIELD (blast radius), FLARES (decoy the interceptors — caps their blast
  reduction), PENETRATOR (cracks walls + reinforced bunkers at wider range), MIRV (splits into up to
  3 extra warheads that strike around ground zero at ~0.62x radius — spreads coverage / hits the ring).
- **Defense (tier-gated, the city's escalating move):** blast WALLS (tier 1) ring the core; REINFORCED
  BUNKERS (tier 1+, in the core) need more yield; INTERCEPTOR BATTERIES (tier 2+, +1 per fail streak,
  cap 8) shrink the incoming blast unless flared/vaporized; **SHIELD DOME** (tier 4+) covers downtown
  and is impervious until your raw yield (`powerCells >= tier*2 levels`) overloads it — then it
  shatters in a burst and the core is exposed. The dome HARD-gates the 90% wipe, forcing yield
  investment; MIRV warheads still chew the ring outside the dome while you build up.

## UI / HUD

- **Top:** total $ (left) · CITY TIER name + DESTROYED% bar (center) · mute + "?" (right).
- **Center/most of screen:** the city skyline + horizon; the blast plays here. Maximal, minimal chrome.
- **Bottom:** a clean row of UPGRADE buttons (icon + name + cost; greys when unaffordable) — the only
  controls besides tapping the city.
- **Pre-first-tap:** big pulsing "TAP THE CITY TO NUKE IT" + a crosshair hint.
- Overlays: "CITY WIPED +$N" payout banner -> NEXT CITY; a "?" help card (Goal/Controls/Tip, EN+RU).

## Asset plan

- **Sprites:** none — all vector canvas (buildings, mushroom cloud, shockwave ring, debris,
  upgrade icons). NEVER emoji in canvas.
- **Background:** procedural — gradient sky (shifts warmer/ashier as a city is leveled), horizon,
  parallax far-city silhouette, subtle stars/haze. Fills any viewport.
- **Cover art:** cover_800x470 + icon_512x512 pre-ship (cartoon mushroom cloud over a stylized
  skyline; NO realistic weapon, Yandex 8.3.6; NO title text in the prompt).
- **VFX:** GF.juice flash/shake/particles + procedural mushroom cloud + falling-debris.

## State machine

`PLAY (aim, awaiting tap) -> BLAST (shockwave resolving) -> PLAY (next strike)`; on reaching WIPE_PCT
-> `WIPED (payout banner) -> PLAY (next city tier)`. Upgrades bought inline during PLAY (bottom bar).
Boots straight into PLAY of the first city (no menu). No GAMEOVER (endless).

## How to play (REQUIRED — in-game interactive tutorial)

- **Goal:** Wipe the whole city off the map (destroy 92%), then move to a bigger one.
- **Controls:** Tap the city to drop a nuke there. Tap UPGRADE to make the blast bigger.
- **Win:** Endless — level every city and climb the city tiers; chase your biggest total.
- **Lose:** Nothing to lose — a small blast just earns less; nuke again.
- **Tip:** Aim at the densest cluster; spend on YIELD first, then FIREBALL/SHOCKWAVE for chains.

Implementation: the first city shows a pulsing "TAP THE CITY TO NUKE IT" crosshair coach
(localStorage `megaton_tut_v1`); it advances the instant the player taps (the real action). After
the first wipe, a one-line "spend $ to upgrade -> bigger blast" nudge points at the upgrade bar.
A "?" HUD button reopens a wrapped Goal/Controls/Tip panel. All text via GF.t(), en + ru.

## 30-second hook

You tap a city, the screen flashes white, a shockwave rolls out and the skyline topples building by
building into rubble as the dollars rain up — then you spend them and watch your very next blast
swallow the whole block in one flash.

## Ten-minute loop (REQUIRED — the "catch")

- **Time-to-first-fun (<15s):** boot straight onto a small skyline; the first tap detonates a
  satisfying city-leveling blast within ~5 seconds.
- **Escalation (density AND new content):** new content every ~1-2 min — new UPGRADES unlock new
  destruction layers (FIREBALL vaporize, SHOCKWAVE topple-ring, FALLOUT lingering burn, MIRV
  multi-warhead), and new CITY TIERS add taller skylines, landmarks, and reinforced `bunker`
  buildings that demand more yield. The blast visibly grows the whole session.
- **In-session progression arc:** rising $ total, a tree of permanent yield upgrades, and climbing
  city tiers; instant "one more tap" — every strike is a fresh payout, no waiting.

## Why come back tomorrow

`TBD - filled by the iteration retention ladder (D1 rung)` (idle-accrual / daily payout / yield-prestige
are natural fits; v0.1 ships the clean destruction-upgrade core only.)

## Ready criteria (definition of done for v0.1)

- Boots in headless Chrome without console errors; reaches PLAY within 3s.
- A tap detonates and destroys buildings; DESTROYED% rises; $ is earned and shown.
- Reaching 92% triggers a WIPE payout + a bigger next city.
- At least one upgrade is buyable and visibly enlarges the blast.
- Tutorial coach text present EN + RU; "?" panel wraps cleanly on 393x852.
- Yandex must-haves: GF.t() text, GF.persist() save/restore (total $ + upgrades + tier), fullscreen
  resize (lib), ads on user-click only (interstitial on a WIPE banner button; rewarded "double payout").
- Audio: GF.sfx/boom on every detonation + GF.bgMusic + mute toggle.
- Cover art present before any submission.
- Game-specific: after ~6-8 upgrades the blast wipes a starter city in ONE tap (the power-fantasy
  payoff is reachable in a few minutes); econ_sim shows no dead zone in the first 15 min.

## Notes

Stylized/abstract destruction only — buildings and rubble, no people or gore, cartoon explosion
(keeps Yandex 8.3.6 covers clean). Implementation may add flourishes but must honor the above.
