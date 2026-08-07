export var SET_BONUS_TIERS = [
  { rarity: 'common', need: 5, kind: 'caps_mult', value: 0.02 },
  { rarity: 'rare', need: 4, kind: 'caps_mult', value: 0.03 },
  { rarity: 'epic', need: 3, kind: 'yield_mult', value: 0.03 },
  { rarity: 'legendary', need: 2, kind: 'caps_mult', value: 0.04 },
  { rarity: 'mythic', need: 1, kind: 'yield_mult', value: 0.05 }
];

export var CAPS_PITY_THRESHOLD = 10;
export var CAPS_PITY_TABLE = { epic: 0.8, legendary: 0.17, mythic: 0.03 };

// Distinct owned collectibles per rarity -> earned set bonuses. Pure so tests
// and the shop UI share one source of truth with the game-facing aggregate.
export function computeSetBonuses(ownedIds, skinsById) {
  var counts = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
  var seen = {};
  (Array.isArray(ownedIds) ? ownedIds : []).forEach(function (id) {
    if (seen[id]) return;
    seen[id] = true;
    var skin = skinsById && skinsById[id];
    if (skin && counts[skin.rarity] != null) counts[skin.rarity] += 1;
  });
  var boosts = {};
  var tiers = SET_BONUS_TIERS.map(function (tier) {
    var owned = counts[tier.rarity] || 0;
    var earned = owned >= tier.need;
    if (earned) boosts[tier.kind] = Math.round(((boosts[tier.kind] || 0) + tier.value) * 1000) / 1000;
    return {
      rarity: tier.rarity,
      need: tier.need,
      owned: Math.min(owned, tier.need),
      total: owned,
      earned: earned,
      kind: tier.kind,
      value: tier.value
    };
  });
  return { boosts: boosts, tiers: tiers };
}

// Opens since the last epic+ pull from the caps crate. At CAPS_PITY_THRESHOLD
// the next open is guaranteed epic+ via CAPS_PITY_TABLE.
export function capsPityCount(stats) {
  var n = Number(stats && stats.capsSinceEpic);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function capsPityActive(stats) {
  return capsPityCount(stats) >= CAPS_PITY_THRESHOLD - 1;
}

// First caps-crate open of each UTC day costs half. Pure: caller passes the
// doubling base price and the current day number.
export function capsCrateDealActive(stats, day) {
  return !stats || Number(stats.capsDealDay) !== day;
}

export function capsCrateDealPrice(basePrice, stats, day) {
  var price = Math.max(1, Math.round(Number(basePrice) || 1));
  return capsCrateDealActive(stats, day) ? Math.max(1, Math.round(price * 0.5)) : price;
}

export function createCollectibleCatalog(SKIN_RARITIES) {
  var BOOSTS = [
    ['caps_mult', 'Caps gain'], ['yield_mult', 'Blast yield'], ['cost_disc', 'Upgrade discount'], ['crit_bonus', 'Extra income'],
    ['offline_mult', 'Reactor gain'], ['nuke_cost_disc', 'Nuke discount'], ['daily_mult', 'Daily ration'], ['ship_bonus', 'Ship bonus']
  ];
  var BASE_COLLECTIBLES = [
    item('common_rust_dart', 'Rust Dart', 'common', 'bombshell', 'needle', '#d95b36', '#ffd24a', '#f2e6b8', '#ff8a3b', 'smoke', 'hot_bloom', 'caps_mult'),
    item('common_caution_capsule', 'Caution Capsule', 'common', 'bombshell', 'capsule', '#e6ff5a', '#ff6a4a', '#fff4b8', '#ffb02e', 'smoke_loop', 'hot_bloom', 'nuke_cost_disc', 'hazard'),
    item('common_scrap_courier', 'Scrap Courier', 'common', 'courier', 'drone', '#7c8b92', '#ff8a3b', '#dce8e8', '#ffd166', 'rotor_sparks', 'hot_bloom', 'offline_mult'),
    item('common_coolant_cell', 'Coolant Cell', 'common', 'reactor', 'capsule', '#5fd8ff', '#bfe9ff', '#eef7ff', '#7fd4ff', 'cyan_vent', 'cool_ring', 'yield_mult', 'cool'),
    item('common_smoke_loop', 'Smoke Loop', 'common', 'countermeasure', 'pod', '#d9d4c8', '#ffd24a', '#ffffff', '#b9b0a0', 'smoke_loop', 'hot_bloom', 'crit_bonus'),
    item('common_bottlecap_buddy', 'Bottlecap Buddy', 'common', 'mascot', 'capsule', '#4f9dff', '#ffd24a', '#fff4b8', '#ffd166', 'cap_sparks', 'cap_pop', 'daily_mult'),
    item('common_barrel_imp', 'Barrel Imp', 'common', 'mob', 'barrel', '#ff8a3b', '#9aff6a', '#ffe1a6', '#ff6a4a', 'scrap_flecks', 'hot_bloom', 'ship_bonus'),
    item('common_prize_crate', 'Prize Crate', 'common', 'oddity', 'crate', '#ff6a4a', '#5afff6', '#fff4b8', '#ffd24a', 'confetti', 'firework', 'caps_mult'),
    item('rare_sky_needle', 'Sky Needle', 'rare', 'bombshell', 'needle', '#5fd8ff', '#ff7a4f', '#eef7ff', '#7fd4ff', 'cyan_sparks', 'cool_ring', 'yield_mult', 'cool'),
    item('rare_triwing_courier', 'Triwing Courier', 'rare', 'courier', 'drone', '#2d7fff', '#ffd24a', '#bfe9ff', '#5fd8ff', 'laser_dots', 'cool_ring', 'offline_mult', 'cool'),
    item('rare_blue_plasma_core', 'Blue Plasma Core', 'rare', 'reactor', 'capsule', '#39a8ff', '#ffffff', '#bfe9ff', '#7fd4ff', 'plasma_vent', 'cool_ring', 'crit_bonus', 'cool'),
    item('rare_chaff_bloom', 'Chaff Bloom', 'rare', 'countermeasure', 'pod', '#f4f4ea', '#7fd4ff', '#ffffff', '#bfe9ff', 'chaff', 'cool_ring', 'nuke_cost_disc', 'cool'),
    item('rare_glow_slime', 'Glow Slime', 'rare', 'mob', 'crystal', '#9aff6a', '#ff4fd8', '#eaffb8', '#ff4fd8', 'slime', 'slime_splat', 'ship_bonus', 'candy'),
    item('rare_orbital_bolt', 'Orbital Bolt', 'rare', 'orbital', 'rod', '#bfe9ff', '#ffd24a', '#ffffff', '#7fd4ff', 'ion_line', 'cool_ring', 'yield_mult', 'cool'),
    item('rare_sparkler_payload', 'Sparkler Payload', 'rare', 'oddity', 'crate', '#ff4fd8', '#ffd24a', '#fff4b8', '#ff8a3b', 'sparkler', 'firework', 'daily_mult', 'candy'),
    item('epic_splitter_pod', 'Splitter Pod', 'epic', 'bombshell', 'pod', '#ff4fd8', '#5afff6', '#ffffff', '#ff6a4a', 'triple', 'candy_fission', 'yield_mult', 'candy'),
    item('epic_neon_guard_drone', 'Neon Guard Drone', 'epic', 'courier', 'drone', '#b76dff', '#5afff6', '#ffffff', '#7fd4ff', 'electric_arc', 'cool_ring', 'crit_bonus', 'candy'),
    item('epic_bubblegum_core', 'Bubblegum Core', 'epic', 'reactor', 'capsule', '#ff4fd8', '#5afff6', '#fff4b8', '#ff4fd8', 'bubbles', 'candy_fission', 'offline_mult', 'candy'),
    item('epic_glass_comet', 'Glass Comet', 'epic', 'orbital', 'crystal', '#7fd4ff', '#ffffff', '#dff8ff', '#5fd8ff', 'ion_shards', 'glass_comet', 'nuke_cost_disc', 'cool'),
    item('epic_hazard_mascot', 'Hazard Mascot', 'epic', 'mascot', 'button', '#e6ff5a', '#ff6a4a', '#fff4b8', '#ffd24a', 'hazard_stars', 'grin_cloud', 'caps_mult', 'hazard'),
    item('legendary_sun_crown', 'Sun Crown', 'legendary', 'bombshell', 'pod', '#ffb02e', '#ffffff', '#fff4b8', '#ff8a3b', 'ember_crown', 'solar_crown', 'yield_mult'),
    item('legendary_blackbox_rod', 'Blackbox Rod', 'legendary', 'orbital', 'rod', '#111018', '#50f6ff', '#ffffff', '#7fd4ff', 'white_beam', 'blackbox_rod', 'crit_bonus', 'cool'),
    item('legendary_prism_fission', 'Prism Fission', 'legendary', 'oddity', 'crystal', '#ffffff', '#ff4fd8', '#5afff6', '#ffd24a', 'prism', 'candy_fission', 'caps_mult', 'candy'),
    item('mythic_last_button', 'Last Button', 'mythic', 'oddity', 'button', '#ff365e', '#50f6ff', '#ffffff', '#ff365e', 'warning_halo', 'last_button', 'yield_mult')
  ];
  var RARITY_COUNTS = { common: 55, rare: 25, epic: 14, legendary: 5, mythic: 1 };
  var RARITY_VALUES = {
    common: [0.005, 0.0075, 0.01],
    rare: [0.014, 0.017, 0.02],
    epic: [0.026, 0.03, 0.034],
    legendary: [0.045, 0.05, 0.055],
    mythic: [0.07]
  };
  var RARITY_COLORS = { common: '#9ac4aa', rare: '#5fd8ff', epic: '#b76dff', legendary: '#ffd24a', mythic: '#ff6a4a' };
  var ROMAN = ['I', 'II', 'III', 'IV', 'V'];

  function item(id, name, rarity, family, body, primary, accent, secondary, blast, trail, impact, boostKind, style) {
    return {
      id: id,
      assetId: id,
      name: name,
      rarity: rarity,
      family: family,
      silhouette: body,
      color: primary,
      accent: accent,
      secondary: secondary,
      style: style || '',
      boostKind: boostKind || 'caps_mult',
      visual: {
        body: body,
        primary: primary,
        accent: accent,
        secondary: secondary,
        blast: blast,
        trail: trail,
        impact: impact,
        mushroomTint: blast,
        cameo: family === 'mob' || family === 'mascot' ? family : 'none',
        style: style || ''
      }
    };
  }
  function safeAssetKey(id) {
    return String(id || '').replace(/[^a-z0-9_]/gi, '');
  }

  function pad3(n) { return String(n).padStart(3, '0'); }
  function rarityForIndex(index) {
    var left = index;
    for (var i = 0; i < SKIN_RARITIES.length; i += 1) {
      var r = SKIN_RARITIES[i];
      if (left < RARITY_COUNTS[r]) return r;
      left -= RARITY_COUNTS[r];
    }
    return 'common';
  }
  function cloneCollectible(base, rarity, ordinal, suffix) {
    var vals = RARITY_VALUES[rarity];
    var boost = BOOSTS[(ordinal + BOOSTS.findIndex(function (b) { return b[0] === base.boostKind; })) % BOOSTS.length] || BOOSTS[0];
    var out = JSON.parse(JSON.stringify(base));
    out.rarity = rarity;
    out.id = suffix ? (base.id + '_' + suffix) : base.id;
    out.name = suffix ? (base.name + ' Mk ' + ROMAN[(ordinal - 1) % ROMAN.length]) : base.name;
    out.boost = { kind: boost[0], label: boost[1], value: vals[ordinal % vals.length] };
    return out;
  }
  function buildSkinCatalog() {
    var out = [];
    SKIN_RARITIES.forEach(function (rarity) {
      var seeds = BASE_COLLECTIBLES.filter(function (c) { return c.rarity === rarity; });
      var target = RARITY_COUNTS[rarity];
      for (var i = 0; i < target; i += 1) {
        var base = seeds[i % seeds.length] || BASE_COLLECTIBLES[0];
        out.push(cloneCollectible(base, rarity, i, i < seeds.length ? '' : pad3(i + 1)));
      }
    });
    return out;
  }
  var SKINS = buildSkinCatalog();
  var SKINS_BY_ID = SKINS.reduce(function (acc, skin) { acc[skin.id] = skin; return acc; }, {});
  function cloneSkinCatalogEntry(skin) {
    return skin ? JSON.parse(JSON.stringify(skin)) : null;
  }


  return {
    SKINS: SKINS,
    SKINS_BY_ID: SKINS_BY_ID,
    RARITY_COLORS: RARITY_COLORS,
    safeAssetKey: safeAssetKey,
    cloneSkinCatalogEntry: cloneSkinCatalogEntry
  };
}
