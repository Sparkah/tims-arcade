// Image/texture asset loading: HUD/menu images (hero cover + upgrade icons) into hudImages, and the
// old-sprite atlas (creatures/tank/weapons/ground/decals/rocks) into the sprites singleton. Each sprite
// sheet is a horizontal strip of 160px frames; on decode it uploads a NEAREST-filtered GL texture.
import { hudImages, sprites } from './state.js?v=bm10';
import { DEBUG } from './flags.js?v=bm10';
import { uploadSpriteTexture } from './render/context.js?v=bm10';
import { resetPerfTiming } from './core/time.js?v=bm10';

function addHudImage(key, src) {
  var img = new Image();
  hudImages[key] = img;
  img.src = src;
}

export function loadHudImages() {
  addHudImage('hero', 'art_refs/bloodmech_hero.png');
  addHudImage('heart', 'art_refs/heartcore_pulse.png');
  addHudImage('bloom', 'art_refs/bloodletting_bloom.png');
  addHudImage('goreblood', 'assets/gore_blood.png');   // 4x4 of 512px = 16-frame blood-splatter sheet, drawn on the HUD for the level-up BLOOD WIPE
  addHudImage('u0', 'art_refs/icon_caliber.png');
  addHudImage('u1', 'art_refs/icon_boiler.png');
  addHudImage('u2', 'art_refs/icon_teeth.png');
  addHudImage('u3', 'art_refs/icon_thirst.png');
  addHudImage('u4', 'art_refs/icon_rapid.png');
  addHudImage('u5', 'art_refs/icon_veins.png');
  addHudImage('u6', 'art_refs/icon_plate.png');
  addHudImage('u7', 'art_refs/icon_growth.png');
  addHudImage('u8', 'art_refs/icon_lash.png');
  // GORE CACHE bespoke art (Gemini gemini-3-pro-image): relic icons, skin previews, cache crate, rarity frames.
  var _relics = ['ironheart', 'oilveins', 'sharptread', 'heavybore', 'wildblood', 'gluttony', 'twinmaw', 'berserker', 'leechlord'];
  for (var _ri = 0; _ri < _relics.length; _ri++) addHudImage('relic_' + _relics[_ri], 'art_refs/ui/relic_' + _relics[_ri] + '.png');
  var _skins = ['default', 'rust', 'venom', 'cobalt', 'ember', 'bone', 'void'];
  for (var _si = 0; _si < _skins.length; _si++) addHudImage('skin_' + _skins[_si], 'art_refs/ui/skin_' + _skins[_si] + '.png');
  addHudImage('cache', 'art_refs/ui/cache.png');
  var _gear = ['hull', 'cannon', 'treads', 'core', 'nerves'];   // GEAR part icons (local SDXL, biomech) - drawGearPiece blits these, rarity glow/ring per tier
  for (var _gi = 0; _gi < _gear.length; _gi++) addHudImage('gear_' + _gear[_gi], 'art_refs/ui/gear_' + _gear[_gi] + '.png');
  var _frames = ['scrap', 'vein', 'core', 'relic'];
  for (var _fi = 0; _fi < _frames.length; _fi++) addHudImage('frame_' + _frames[_fi], 'art_refs/ui/frame_' + _frames[_fi] + '.png');
  // Animated menu/vault background: grab the off-screen <video> + start it (muted autoplay). drawMenu/vaultBackdrop
  // sample its current frame each render; falls back to the static hero image until it's decoding.
  if (typeof document !== 'undefined') {
    var _mv = document.getElementById('bt_menu_vid');
    if (_mv) { hudImages.menuvid = _mv; try { var _pr = _mv.play(); if (_pr && _pr.catch) _pr.catch(function () {}); } catch (e) {} }
  }
}

export function loadOldSpriteAssets() {
  var bases = ['husk_rot', 'brute_char'];   // husk (type 0) + brute (type 2; also Hive/Shellback) are engine-animated single-sheet (registered below); only husk_rot + brute_char stay old-directional
  for (var i = 0; i < bases.length; i++) {
    addSpriteAsset(bases[i] + '_idle', 'assets/' + bases[i] + '_idle.png');
    addSpriteAsset(bases[i] + '_attack', 'assets/' + bases[i] + '_attack.png');
    addSpriteAsset(bases[i] + '_death', 'assets/' + bases[i] + '_death.png');
    for (var d = 0; d < 8; d++) {
      addSpriteAsset(bases[i] + '_walk_d' + d, 'assets/' + bases[i] + '_walk_d' + d + '.png');
    }
  }
  addSpriteAsset('husk_base', 'sprites/husk.png');
  addSpriteAsset('brute_base', 'sprites/brute.png');
  // WHITE crawler (Wraith type 12 + Palecrawler type 13, Tim 2026-06-24 "restore the white creatures, both
  // sizes"): the pale directional spider sheets (copied into sprites/ from the still-present assets/husk_*.png
  // white set). DIRECTIONAL like husk_rot/brute_char (8 _walk_d + idle/attack/death) - NOT in the single-sheet
  // mirror gate, so it faces correctly via spriteDir. Both white types point SPRITE_BASE at 'husk_white'.
  for (var wd = 0; wd < 8; wd++) addSpriteAsset('husk_white_walk_d' + wd, 'sprites/husk_white_walk_d' + wd + '.png');
  addSpriteAsset('husk_white_idle', 'sprites/husk_white_idle.png');
  addSpriteAsset('husk_white_attack', 'sprites/husk_white_attack.png');
  addSpriteAsset('husk_white_death', 'sprites/husk_white_death.png');
  // Husk (type 0) - ANIMATED via our own engine (single-sheet biped, like the Spitter; replaces the old assets/ directional husk sprites):
  for (var hd = 0; hd < 8; hd++) addSpriteAsset('husk_walk_d' + hd, 'sprites/husk_walk.png'); // 10f biped march (single facing, all dirs)
  addSpriteAsset('husk_attack', 'sprites/husk_attack.png'); // 12f melee lunge/chop (punched up)
  addSpriteAsset('husk_idle', 'sprites/husk_idle.png');     // 22f breathe/weight-shift
  addSpriteAsset('husk_death', 'sprites/husk_death.png');   // 12f forward collapse - corpse (one-shot)
  // Brute (type 2; also Hive + Shellback) - ANIMATED via our own engine (heavy biped single-sheet):
  for (var bd = 0; bd < 8; bd++) addSpriteAsset('brute_walk_d' + bd, 'sprites/brute_walk.png'); // 11f heavy trudge (single facing, all dirs)
  addSpriteAsset('brute_attack', 'sprites/brute_attack.png'); // 13f overhead smash (punched up)
  addSpriteAsset('brute_idle', 'sprites/brute_idle.png');     // 20f heavy breathe
  addSpriteAsset('brute_death', 'sprites/brute_death.png');   // 12f heavy collapse - corpse (one-shot)
  // Spitter (type 4) - ANIMATED via our own engine (Spine-CLI-baked 160px-cell frame strips):
  for (var sd = 0; sd < 8; sd++) addSpriteAsset('spitter_walk_d' + sd, 'sprites/spitter_walk.png'); // 10f walk loop (single facing v1, all dirs)
  addSpriteAsset('spitter_attack', 'sprites/spitter_attack.png'); // 12f spit - played on the aim/fire window (and on contact, and as the stationary-idle flourish)
  addSpriteAsset('spitter_idle', 'sprites/spitter_idle.png');     // 20f breathe - fallback
  addSpriteAsset('spitter_death', 'sprites/spitter_death.png');   // 10f collapse - corpse (one-shot by progress)
  // Zombie (type 14) - LPC pale shambler sliced onto our engine single-sheet path (right-facing walk/attack/death,
  // sliced from the Tim-downloaded Zombie.png universal LPC sheet: walk row 9 + slash row 13 mirrored to right,
  // die row 20). NO _idle registered: a stationary zombie falls through to the walk strip (line 184) = a shamble
  // in place, which reads correct for a zombie (and avoids fabricating an idle that would resize on switch). In
  // the SPRITE-FACING mirror gate (render/world.js) so it faces the player via the L/R mirror + the vertical lean.
  for (var zd = 0; zd < 8; zd++) addSpriteAsset('zombie_walk_d' + zd, 'sprites/zombie_walk.png'); // 9f shamble (single facing, all dirs)
  addSpriteAsset('zombie_attack', 'sprites/zombie_attack.png'); // 6f slash/lunge (played on tank contact + stationary flourish)
  addSpriteAsset('zombie_death', 'sprites/zombie_death.png');   // 6f forward collapse - corpse (one-shot)
  // Goblin (type 15) - Calciumtrice "Animated Goblins" (CC-BY 3.0, see CREDITS) variant B (armored goblin, red
  // scarf) baked onto our engine single-sheet path: 32x32 source rows upscaled to 160px cells (blocky, accepted).
  // walk=10f, attack=10f (sword-slash arc), death=10f. Front-facing (reads correct under the L/R mirror, never a
  // back). NO _idle: a stationary goblin falls through to the walk strip = a shuffle in place. In the mirror gate.
  for (var gd = 0; gd < 8; gd++) addSpriteAsset('goblin_walk_d' + gd, 'sprites/goblin_walk.png'); // 10f scurry (single facing, all dirs)
  addSpriteAsset('goblin_attack', 'sprites/goblin_attack.png'); // 10f sword-slash
  addSpriteAsset('goblin_death', 'sprites/goblin_death.png');   // 10f collapse - corpse (one-shot)
  // Demonario -> HIVE (type 5) - "FPS Monster Enemies" demonario (CC0, biomech horned demon) baked onto our engine
  // single-sheet path (new base 'demon'): walk=4f, attack=3f (orange chest-charge tell), death=5f (collapses into a
  // gore puddle). Front-facing -> in the SPRITE-FACING mirror gate. NO _idle: a stationary demon falls through to
  // walk. Death routes to demon_death (its own baked collapse) via the queueOldCorpseSprite (c) fallback (no
  // demon_gore_death sheet yet - the baked collapse is the stopgap, better than a generic husk/brute gore).
  for (var dd = 0; dd < 8; dd++) addSpriteAsset('demon_walk_d' + dd, 'sprites/demon_walk.png'); // 4f heavy stride (single facing, all dirs)
  addSpriteAsset('demon_attack', 'sprites/demon_attack.png'); // 3f charge/strike
  addSpriteAsset('demon_death', 'sprites/demon_death.png');   // 5f collapse to a gore puddle - corpse (one-shot)
  addSpriteAsset('tank_body', 'sprites/tank_body.png');
  addSpriteAsset('tank_turret', 'sprites/tank_turret.png');
  addSpriteAsset('weapon_turrets', 'sprites/weapon_turrets_noshadow.png?v=3');   // shadowless turret atlas (Tim 2026-06-23: gun shadow stripped). ?v=3 CACHE-BUSTER (Tim 2026-06-24): the atlas was re-cut twice (flesh-join, then a per-cell MARGIN so the long-barrel gun never clips at the cell edge). Browsers cache a PNG by URL, so a stale full-cell atlas drawn at the new bigger render still showed a clipped barrel; bumping the version forces a refetch of the current atlas. Bump again on any future atlas edit.
  addSpriteAsset('weapon_projectiles', 'art_refs/turrets/weapon_projectiles_arcade_bio.png');
  var layers = ['treads', 'armor', 'thirst', 'core', 'cannon', 'frenzy'];
  for (var li = 0; li < layers.length; li++) {
    addSpriteAsset('lp_' + layers[li], 'art_refs/parts/layer_' + layers[li] + '.png');
  }
  // EXPOSED HEART (tank BODY death, Tim 2026-06-24): the war-machine's biomech heart, revealed at the wreck as
  // the body bleeds out. A cropped + soft-vignette-masked copy of the existing CC0 heartcore_pulse.png (the same
  // art already loaded as the HUD heart above) so the dark square edges feather into the ground. Drawn in the
  // world pass (render/world.js queueTankHeartSprite) over the wreck; it PULSES on state.tankBeat while the body
  // is dying and visibly STOPS beating as tankBeat eases to a halt on death.
  addSpriteAsset('heart_core', 'assets/heart_core.png');
  // explosion fireball: a 1000x500 sheet = 10 cols x 5 rows = 50 frames of 100px cells (spark -> white-hot ->
  // orange -> dark smoke -> ash). NOTE the 100px grid differs from the 160px creature cells, so the render
  // (queueExplosionSprite in render/world.js) computes the cell from EXPL_COLS/EXPL_CELL itself, NOT meta.frames.
  addSpriteAsset('explosion', 'assets/explosion.png');
  // GORE DEATH sheets (Tim 2026-06-24, ported from the published 198 build to bring "the death animation feel I
  // like"): metal_gore_death (TECH/biomech enemies) + flesh_gore_death (organic) are 2560x160 = a horizontal strip
  // of 16 frames of 160px - the SAME 160px cell grid as the creature sheets, so addSpriteAsset auto-derives
  // frames=16/w=2560/h=160 (no custom cell math needed). queueOldCorpseSprite (render/world.js) plays the matching
  // sheet over the corpse lifetime INSTEAD of the per-creature <base>_death collapse (the better gore Tim wants),
  // routed by isTechType(corpses.type). CC-BY-SA/GPL (LPC-adjacent / Codex-made) - provenance flagged for CREDITS.
  addSpriteAsset('metal_gore_death', 'assets/metal_gore_death.png');
  addSpriteAsset('flesh_gore_death', 'assets/flesh_gore_death.png');
  // PER-CREATURE gore-death sheets (Tim 2026-06-24, fix "added it to the wrong one"): the husk-derived
  // metal/flesh_gore_death above only read right on the white/green husk crawler family. These six per-creature
  // sheets are being generated now; queueOldCorpseSprite (render/world.js) prefers `<base>_gore_death` when loaded,
  // else falls back to flesh_gore_death (husk family only) or the <base>_death collapse. A sheet whose PNG hasn't
  // landed yet 404s in addSpriteAsset's onerror and harmlessly leaves sprites.textures[key] empty = the routing
  // drops through to the fallback (expected until the art lands). Same 2560x160 16x160px strip as the others.
  addSpriteAsset('husk_gore_death', 'assets/husk_gore_death.png');
  addSpriteAsset('husk_rot_gore_death', 'assets/husk_rot_gore_death.png');   // green plague crawler (husk silhouette, green-tinted source + ichor ooze) so it does NOT bleed the reddish husk gore
  addSpriteAsset('husk_white_gore_death', 'assets/husk_white_gore_death.png');
  addSpriteAsset('brute_gore_death', 'assets/brute_gore_death.png');
  addSpriteAsset('spitter_gore_death', 'assets/spitter_gore_death.png');
  addSpriteAsset('zombie_gore_death', 'assets/zombie_gore_death.png');
  addSpriteAsset('goblin_gore_death', 'assets/goblin_gore_death.png');
  // CC0 painterly blood-splash gore (Tim 2026-06-23, OpenGameArt, in CREDITS.txt): both are 2048x2048 = 4x4 grid
  // of 512px cells = 16 frames. gore_blood = wet bloom -> splatter -> fading droplets (the primary organic gore);
  // gore_blood_burst = a red impact flash THEN the splatter (punchier alt). 512px grid != the 100/160 cell grids,
  // so the render (queueGoreSprite in render/world.js) computes the cell from GORE_CELL/GORE_COLS itself.
  addSpriteAsset('gore_blood', 'assets/gore_blood.png');
  addSpriteAsset('gore_blood_burst', 'assets/gore_blood_burst.png');
  // GORE GIB (Tim-downloaded LPC "Ribs.png" gore bit): a single ribcage chunk cropped + cleaned into a 96px
  // transparent cell. Flung as a textured gib on ORGANIC deaths (fx/gore.js spawnGoreBurst, gore.kind===6),
  // drawn in the sprite layer (render/world.js queueGibSprite). 96px (not a 160 strip) = a 1-frame sprite; the
  // render passes the 96 cell dims explicitly. (The other gore bits - Bloody Arm/Bleeding Eye/Bloody Mouth - are
  // 3-17px LPC face/body OVERLAYS, not standalone gibs, so they're unused.)
  addSpriteAsset('gib_ribs', 'sprites/gib_ribs.png');
  addSpriteAsset('ground', 'art_refs/ground_biomech.png');
  var decals = ['blood', 'crack', 'bush', 'bones', 'flower', 'ribs', 'scorch', 'skull'];
  for (var j = 0; j < decals.length; j++) {
    addSpriteAsset('dec_' + decals[j], 'art_refs/decals/' + decals[j] + '.png');
  }
  for (var r = 0; r < 4; r++) addSpriteAsset('rock' + r, 'art_refs/parts/rock_' + r + '.png');
}

function addSpriteAsset(key, src) {
  var img = new Image();
  sprites.pending++;
  sprites.images[key] = img;
  sprites.meta[key] = { w: 0, h: 0, frames: 1 };
  img.onload = function () {
    sprites.meta[key].w = img.width;
    sprites.meta[key].h = img.height;
    sprites.meta[key].frames = Math.max(1, Math.floor(img.width / 160));
    sprites.textures[key] = uploadSpriteTexture(img);
    sprites.loaded++;
    sprites.ready = sprites.loaded >= sprites.pending;
    if (sprites.ready) resetPerfTiming();
  };
  img.onerror = function () {
    sprites.loaded++;
    sprites.ready = sprites.loaded >= sprites.pending;
    if (DEBUG) console.warn('missing sprite asset', src);
  };
  img.src = src;
}
