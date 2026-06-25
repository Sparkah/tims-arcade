// Equippable weapons + their cover colors (r,g,b 0..1) + the sprite-atlas row map and cell sizes.
// WEAPON_BY_ID is a derived constant lookup. Per-weapon TIERS live on econ.weaponMeta (state.js),
// the turret/projectile atlases index by [weaponRow][weaponAtlasTier] (see render/world.js).
export var WEAPONS = [
  { id: 'cannon', name: 'CANNON', cost: 0, r: 1.0, g: 0.46, b: 0.23 },
  { id: 'flak', name: 'FLAK', cost: 1400, r: 0.48, g: 0.90, b: 0.42 },
  { id: 'laser', name: 'LASER', cost: 1800, r: 1.0, g: 0.25, b: 0.36 },
  { id: 'missile', name: 'MISSILE', cost: 2400, r: 1.0, g: 0.66, b: 0.20 }
];

export var WEAPON_BY_ID = Object.create(null);
for (var wi0 = 0; wi0 < WEAPONS.length; wi0++) WEAPON_BY_ID[WEAPONS[wi0].id] = WEAPONS[wi0];
export var WEAPON_ROW = { cannon: 0, flak: 1, laser: 2, missile: 3 };
export var WEAPON_TURRET_CELL = 48;
export var WEAPON_PROJECTILE_CELL = 32;
