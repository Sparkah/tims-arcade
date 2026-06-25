// Level-up mutation cards + the BloodForge upgrade tracks. Pure constant tables.
export var upgradeNames = [
  'HEAVY CALIBER', 'BOILER PRESSURE', 'TREAD TEETH', 'THIRST', 'RELOAD GLAND',
  'VEIN NETWORK', 'ARMOR PLATING', 'OVERGROWTH', 'VEIN LASH'
];
export var upgradeDesc = [
  '+35% cannon damage',
  '+14% move speed',
  '+30% crush, wider bite',
  'Heal on every kill',
  '+25% fire rate',
  '+45% blood pickup range',
  '+25 max HP, patch up',
  '+1 cannon barrel',
  'Tendrils flay nearby foes'
];

export var MAXTIER = 6;
export var TIER_COST = [60, 200, 600, 1600, 4000, 9000];
export var TRACKS = [
  { id: 'armor', name: 'ARMOR PLATING', desc: 'Max HP and hull mass' },
  { id: 'core', name: 'BLOOD CORE', desc: 'Regen and pickup reach' },
  { id: 'cannon', name: 'MAW CANNON', desc: 'Damage, fire rate, barrels' },
  { id: 'treads', name: 'TREAD TEETH', desc: 'Speed and crush pressure' },
  { id: 'thirst', name: 'THIRST', desc: 'Heal from ranged kills' },
  { id: 'frenzy', name: 'BLOODLETTING', desc: 'Leech tendrils and rage' }
];
