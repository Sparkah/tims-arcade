// Enemy archetype tables (index 0..11) + per-color-slot palette + sprite-sheet mapping.
// Pure constants. The per-type sprite tint (SPRITE_T_*) shades each archetype off the shared sheets.
import { ENEMY_BASE_HP } from '../balance.js?v=bm8';
// Index 12/13 = the WHITE crawlers (Tim 2026-06-24 "I like that they have green and white creatures in the
// beginning ... don't like that we removed white creatures, both sizes"). art-port-v2 opened with WHITE (husk)
// + GREEN (husk_rot) crawlers in two sizes; our build had re-arted Husk(0) to the dark-red biped + dropped the
// white. These two restore the white spider (base 'husk_white', the pale directional sheets in sprites/, copied
// from the still-present assets/husk_*.png) at a SMALL (Wraith) and a LARGE (Palecrawler) size, both unlocking
// at minute 0 so the opening shows green AND white. The green Mite(1)/Wisp(6)/Needle(8)/Leecher(10) (base
// 'husk_rot') is unchanged. NOTE: every roster array below extends to length 14 in lockstep, AND balance.js
// ENEMY_KEYS + BALANCE.enemies gain 'wraith'/'palecrawler' entries (T_HP = ENEMY_BASE_HP is sourced there).
// Index 14 = Zombie (LPC pale shambler: slow tanky melee), 15 = Goblin (LPC green: fast light melee).
// Both port the Tim-downloaded LPC sheets onto our engine single-sheet path (base 'zombie'/'goblin',
// right-facing walk/attack/death strips in sprites/, registered in assets.js + added to the SPRITE-FACING
// mirror gate in render/world.js). Stats also live in balance.js (BALANCE.enemies.zombie/.goblin + ENEMY_KEYS).
// Index 16 = Ravener (Tim 2026-06-25 anti-kite "hunter that catches you"): the FASTEST type in the roster
// (T_SPD 168 > goblin 135), a lean fast FLESH-CRAWLER pursuer that forces a kill instead of an outrun. v1 reuses
// the husk_white organic directional crawler silhouette (so it bleeds/squishes organically - NOT in isTechType,
// correct for a fleshy crawler) with a distinct BRUISE-VIOLET tint (no other type is purple); bespoke Ravener art
// is a flagged follow-up. Melee (T_CAN_FIRE_BOLT 0), Spitter-class contact rank (CONTACT_RANK[16]=4 - a pressure
// threat, not an instant-delete). Stats in balance.js (BALANCE.enemies.ravener + ENEMY_KEYS[16]).
export var T_NAME = ['Husk', 'Mite', 'Brute', 'Gorehound', 'Spitter', 'Hive', 'Wisp', 'Detonator', 'Needle', 'Shellback', 'Leecher', 'Bombard', 'Wraith', 'Palecrawler', 'Zombie', 'Goblin', 'Ravener'];
// BASE HP per type. SINGLE-SOURCED from balance.js (BALANCE.enemies.<type>.baseHP). The actual spawn HP uses
// the LINEAR per-minute model HP(min) = baseHP*(1+hpPerMinute*min) via balance.js enemyHpAt() (see
// systems/enemies.js spawnEnemy) - a grunt stays 3-5 hits-to-kill the whole run (COUNT carries difficulty, not
// sponge HP). T_HP here is the base array (a live view of the BALANCE bases; if ?tune overrides them at boot,
// recomputeEnemyTables rebuilds ENEMY_BASE_HP before the first spawn). NOTE: render/world.js currently
// normalizes its hit hot-flash by T_HP[type]*(1+t*0.014) (the OLD time model) - cosmetic only; flagged for the
// render owner to switch to enemyHpAt(type, t/60) so the flash saturation tracks the new HP curve exactly.
export var T_HP = ENEMY_BASE_HP;
// Tim playtest: "the red+white ones move a bit too fast" (amplified by the new zoom-in). The edge is
// taken off the FASTEST melee so they read as deliberate threats, not frantic: Mite 145->128,
// Gorehound(red, also charges) 118->104, Needle(also charges) 135->118 (~10-13% trims). The Brute(55)
// is already slow and is left alone; the others are unchanged.
//                                                                          Wraith(12) Palecrawler(13) Zombie(14) Goblin(15) Ravener(16)
export var T_SPD =    [88, 128, 55, 104, 74, 48, 98, 68, 118, 42, 82, 58,   120,        60,             50,        135,       168];   // Zombie SLOWER than the Brute(55); Goblin fast melee; Ravener FASTEST (the hunter - outpaces the tank under the minute speed-ramp)
export var T_R =      [13, 8, 23, 15, 18, 28, 13, 25, 12, 26, 16, 22,       11,         22,             22,        12,        12];    // Zombie big; Goblin small-mid; Ravener lean (~goblin/needle)
export var T_PAY =    [1, 1, 5, 2, 3, 8, 2, 10, 3, 9, 5, 7,                 1,          5,              6,         3,         3];
export var T_UNLOCK = [0, 0, 1, 2, 3, 5, 7, 9, 4, 6, 8, 9,                  0,          0,              1,         2,         2];    // Zombie from min 1, Goblin + Ravener from min 2
export var T_WEIGHT = [56, 44, 45, 34, 34, 24, 18, 20, 28, 20, 18, 18,      38,         20,             34,        36,        26];   // Ravener common enough to be a persistent threat, not a swarm
export var T_COL = new Uint8Array([0, 1, 2, 1, 3, 2, 4, 3, 1, 2, 4, 3,      1,          2,              2,         1,         3]);   // procedural-fallback palette slot (sprite path uses SPRITE_T_* below): Zombie pale/grey(2), Goblin green(1), Ravener(3)
// Spitter = the only ranged foe (kites + fires bolts). Gate the fire AI + the bolt/telegraph render on this
// SEMANTIC flag (not a hard-coded index) so a roster reorder can't make whatever lands at index 4 start firing.
export var TYPE_SPITTER = 4;
export var T_CAN_FIRE_BOLT = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);   // 1 = Spitter only (Zombie + Goblin + Ravener are melee)
// CONTACT-DAMAGE RANK (decouples contact dmg from the raw roster index). The contact model in balance.js is
// enemyContactDmgAt = (contactDmgBase + RANK*contactDmgTypeStep)*(1+slope*min), a proxy for "heavier types hit
// harder". For indices 0-15 RANK == the index = the EXACT pre-existing balance (unchanged). But that proxy
// breaks for a LIGHT, FAST, late-roster type: the Ravener at raw index 16 would hit HARDEST in the game (~49
// hp/s @min2, above the Brute) - so a fast hunter that catches you would DELETE you, not pressure you. The
// Ravener is ranked 4 (Spitter-class ~18 hp/s @min2): a real "kill it or it wears you down" threat, fair vs its
// weight class. (Codex 2026-06-25. The same index-coupling makes Goblin(15)/Zombie(14) hit hard too; left as-is
// since Tim hasn't flagged them - tune their rank here if they feel too punishing.)
export var CONTACT_RANK = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,   4]);   // Ravener: Spitter-class contact, NOT the index-16 max
export var C_R = new Float32Array([0.55, 0.92, 0.70, 0.95, 0.55, 0.88, 0.18]);
export var C_G = new Float32Array([0.035, 0.13, 0.18, 0.55, 0.28, 0.78, 0.04]);
export var C_B = new Float32Array([0.045, 0.10, 0.12, 0.18, 0.36, 0.42, 0.035]);
export var SPRITE_BASE = ['husk', 'husk_rot', 'brute', 'brute_char', 'spitter', 'demon', 'husk_rot', 'brute_char', 'husk_rot', 'brute', 'husk_rot', 'brute_char', 'husk_white', 'husk_white', 'zombie', 'goblin', 'husk_white'];   // 12/13/16 = white directional crawler (Ravener reuses it, tinted bruise-violet - directional base, faces via walk_d0..d7, NO mirror gate needed); 14 Zombie + 15 Goblin + 5 Hive=Demonario('demon') = engine single-sheet (front-facing, in the SPRITE-FACING mirror gate)
// Per-type VISUAL size multiplier: on-screen sprite radius ~= enemies.r[type] * SPRITE_VIS_MULT[type]
// (the drawn sprite is this multiple of the gameplay radius T_R). SINGLE SOURCE shared by the render
// size (render/world.js queueOldEnemySprite) AND the tank<->enemy body collision (systems/enemies.js),
// so a creature you make bigger here also collides bigger - they can never drift out of sync.
// SLOW BURN (Tim "green enemies and others should be bigger"): every type bumped ~+15-18% on top of the
// earlier small-type pass, so the sparse slow-burn field reads big + chunky. This is the SHARED size source
// (render draw size AND tank<->enemy collision both read it), so they collide as big as they look.
//                                                                                          Wraith Palecrawler Zombie Goblin Ravener
export var SPRITE_VIS_MULT = new Float32Array([3.2, 3.6, 3.5, 3.7, 3.2, 3.5, 3.6, 3.5, 3.6, 3.5, 3.2, 3.5,   3.3,   3.6,   3.3,   3.4,   3.2]);   // Zombie chunky humanoid; Goblin small-mid (~Needle); Ravener lean (~Wraith-sized, the small white crawler)
// PER-CREATURE COLLIDER FILL (Tim 2026-06-25 "colliders bigger than the sprite, I push from far"): the body's
// MEASURED half-width as a fraction of its sprite cell, so the tank<->enemy push (systems/enemies.js) + the
// melee-attack trigger (render/world.js) fire at the VISIBLE body edge, not a fixed cell radius. Replaces the
// single global config.VIS_FILL (0.46 = a ~92%-of-cell assumption) which over-reached EVERY creature (they fill
// 35-72% of their cells, varying a lot). Measured from each base's walk frames; husk_rot/brute_char take the
// husk/brute silhouette they fall back to. Worst offender was the demon/Hive (52% fill -> pushed ~19u past its body).
export var SPRITE_BODY_FILL = new Float32Array([0.35, 0.35, 0.36, 0.36, 0.33, 0.26, 0.35, 0.36, 0.35, 0.36, 0.35, 0.36,   0.18,   0.18,   0.25,   0.25,   0.18]);   // Ravener reuses husk_white -> SAME 0.18 measured fill as Wraith/Palecrawler (a different value here would re-introduce the over-reach bug for the same silhouette)
export var SPRITE_T_R = new Float32Array([1.00, 0.96, 1.00, 1.05, 1.00, 1.08, 0.82, 1.08, 1.05, 0.94, 0.82, 1.05,   1.06,  1.04,   1.04,  1.00,   0.95]);   // Zombie = faint sallow lift on the pale flesh; Goblin neutral; Ravener BRUISE-VIOLET (R~, G down, B up) on the pale husk_white = a cold purple hunter, unlike any other type
export var SPRITE_T_G = new Float32Array([1.00, 1.05, 1.00, 0.94, 1.00, 0.95, 1.10, 0.92, 0.98, 0.98, 1.08, 0.96,   1.05,  1.04,   1.00,  1.00,   0.74]);
export var SPRITE_T_B = new Float32Array([1.00, 0.94, 1.00, 0.90, 1.00, 0.88, 1.18, 0.86, 0.90, 0.88, 1.14, 0.88,   1.04,  1.03,   0.92,  1.00,   1.22]);
