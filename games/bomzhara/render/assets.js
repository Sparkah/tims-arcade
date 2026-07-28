import { uploadSpriteTexture } from './context.js?v=20260704a';
import { sprites } from '../state.js?v=20260704a';

var SPRITE_BASE = '../assets/generated/';
var SPRITE_FILES = {
  enemy_beer_imp: 'v2_painterly/final/enemy_beer_imp.png',
  enemy_wine_wretch: 'v2_painterly/final/enemy_wine_wretch.png',
  enemy_champagne_shard: 'v2_painterly/final/enemy_champagne_shard.png',
  enemy_cognac_brute: 'v2_painterly/final/enemy_cognac_brute.png',
  proj_vodka_bottle: 'v2_painterly/final/proj_vodka_bottle.png',
  proj_fire_bottle: 'v2_painterly/final/proj_fire_bottle.png',
  vfx_fire_puddle: 'v2_painterly/final/vfx_fire_puddle.png',
  pickup_zakuska_pickle: 'v2_painterly/final/pickup_zakuska_pickle.png',
  horror_blackout_tendril: 'v2_painterly/final/horror_blackout_tendril.png',
  horror_possessed_key: 'v2_painterly/final/horror_possessed_key.png',
  horror_open_window: 'v2_painterly/final/horror_open_window.png',
  horror_monster_hole_marker: 'v8_hole_markers/final/monster_hole_marker.png',
  horror_pale_hallucination: 'v2_painterly/final/horror_pale_hallucination.png',
  map_building: 'v4_surroundings_direction/final/abandoned_building_map_direction.png',
  room_floor: 'v3_room/final/room_floor.png',
  decor_crate: 'v3_room/final/decor_crate.png',
  decor_rug: 'v3_room/final/decor_rug.png',
  decor_bottles: 'v3_room/final/decor_bottles.png',
  decor_table: 'v3_room/final/decor_table.png',
  player_idle: 'v7_player_idle_attack/final/bomzhara_idle_8frame_alpha_strip.png',
  player_walk: 'v6_player_walk_anim/final/bomzhara_walk_8frame_alpha_strip.png',
  player_attack: 'v7_player_idle_attack/final/bomzhara_attack_8frame_alpha_strip.png',
  tapok_old_sneaker: 'v15_tapok_black_slide/final/tapok_black_rubber_slide.png',
  tapok_zone_circle: 'v12_tapok_zone/final/tapok_zone_salt_circle.png',
  shield_mattress: 'v16_shield_mattress/final/shield_piss_mattress.png',
  belochka_squirrel: 'v17_belochka_horror/final/belochka_demon_squirrel.png',
  player_death_vomit: 'v18_player_death/final/player_death_vomit.png',
  player_death_down: 'v18_player_death/final/player_death_down.png',
};

export var gameSpriteArtStatus = {
  requested: false,
  pending: 0,
  loaded: 0,
  error: 0,
  ready: false,
};

export function loadGameSprites() {
  if (gameSpriteArtStatus.requested || typeof Image === 'undefined') return;
  gameSpriteArtStatus.requested = true;
  var keys = Object.keys(SPRITE_FILES);
  gameSpriteArtStatus.pending = keys.length;
  sprites.ready = false;
  sprites.pending += keys.length;
  for (var i = 0; i < keys.length; i++) loadOne(keys[i], SPRITE_FILES[keys[i]]);
}

function settle() {
  gameSpriteArtStatus.pending = Math.max(0, gameSpriteArtStatus.pending - 1);
  sprites.pending = Math.max(0, sprites.pending - 1);
  gameSpriteArtStatus.ready = gameSpriteArtStatus.pending === 0 && gameSpriteArtStatus.loaded > 0;
  sprites.ready = sprites.pending === 0;
}

function loadOne(key, file) {
  var img = new Image();
  img.decoding = 'async';
  img.onload = function () {
    sprites.images[key] = img;
    sprites.textures[key] = uploadSpriteTexture(img);
    sprites.meta[key] = { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
    gameSpriteArtStatus.loaded++;
    settle();
  };
  img.onerror = function () {
    gameSpriteArtStatus.error++;
    settle();
  };
  img.src = new URL(SPRITE_BASE + file, import.meta.url).href + '?v=20260704a';
}
