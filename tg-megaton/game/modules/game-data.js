export const BAL = {
  TW: 34, TH: 17, BH: 13,
  BASE_CELLS: 2.4, CELLS_PER_LVL: 0.6,
  YIELD_MIN: 0.85, YIELD_MAX: 1.18, FALLOFF_INNER: 0.72,
  WIPE_PCT: 0.9, B_VALUE: 0.42, UP_COST_BASE: 55, UP_COST_K: 1.33, CHUNK_CAP: 360,
};

export const PALETTE = ['#1f9a5c', '#177a48', '#28b06e', '#145e39', '#2a8f5e', '#1c8050', '#23a866'];
export const FARPAL = ['#2c7d6a', '#1f6b5a', '#357f6e', '#246e5e', '#2a8a74'];

export const THEMES = {
  station: { pal: ['#3a4a5a', '#2c3946', '#46586a', '#243140', '#3f5163', '#324252', '#4a5e72'], far: ['#2b6a72', '#22585f', '#316f77', '#275f66'], accent: '#7fd4ff', deck: ['#0a1a22', '#08141b'] },
  airport: { pal: ['#5a6a52', '#48563f', '#66745c', '#3e4a36', '#5e6e54', '#52614a', '#6a7860'], far: ['#4a5a4a', '#3e4c3e', '#54644f', '#445443'], accent: '#ffc234', deck: ['#1a1d18', '#16190f'] },
  ghetto: { pal: ['#3f5e3a', '#365232', '#48683f', '#2e4a2c', '#42603c', '#395636', '#4c6e44'], far: ['#34503a', '#2c4632', '#3a5a40', '#304a36'], accent: '#7dff8a', deck: ['#0a140a', '#08110a'] },
  chinatown: { pal: ['#2f7a4e', '#266a44', '#34885a', '#1f5e3c', '#2c8052', '#247448', '#36905e'], far: ['#2a6a52', '#226046', '#306e54', '#265a48'], accent: '#ffd24a', deck: ['#06160d', '#04120b'] },
  mall: { pal: ['#2c6a6e', '#235a5e', '#327a7e', '#1e5054', '#2d7276', '#266468', '#388488'], far: ['#2a6266', '#225458', '#306a6e', '#265c60'], accent: '#5afff6', deck: ['#06181a', '#041214'] },
  quarantine: { pal: ['#5a6a2e', '#4a5a26', '#66743a', '#3e4a1e', '#5e6e30', '#525e28', '#6a7840'], far: ['#4a5a2a', '#3e4c22', '#54642e', '#445426'], accent: '#caff5a', deck: ['#12160a', '#0e1208'] },
  mountain: { pal: ['#5a6068', '#4a4f56', '#666c74', '#3e4248', '#5e646c', '#52575e', '#6a7078'], far: ['#4a5056', '#3e4348', '#545a60', '#444a50'], accent: '#9fd0ff', deck: ['#0e1114', '#0a0d10'] },
  refinery: { pal: ['#5e5a36', '#4e4a2c', '#6a6640', '#423e22', '#62603a', '#56522e', '#726e44'], far: ['#544f30', '#46422a', '#5e5836', '#4a462c'], accent: '#ff8a3b', deck: ['#16140c', '#100e08'] },
  skyscraper: { pal: ['#36506e', '#2c4258', '#3f5e80', '#243648', '#3a5676', '#304a64', '#456888'], far: ['#2e4a5e', '#264052', '#345268', '#2a4458'], accent: '#8fe0ff', deck: ['#0a141c', '#070f16'] },
  powerplant: { pal: ['#4a5e54', '#3e5046', '#56685e', '#324840', '#4e6258', '#42564c', '#5a6c62'], far: ['#42564c', '#384a42', '#4a5e54', '#384c42'], accent: '#d8ff4a', deck: ['#0c1410', '#08100c'] },
  port: { pal: ['#2c5a5e', '#234a4e', '#346a6e', '#1e4044', '#2d6266', '#265456', '#387476'], far: ['#2a5256', '#224648', '#306063', '#264e50'], accent: '#ffb43a', deck: ['#08161a', '#051014'] },
  park: { pal: ['#2f7a64', '#266a56', '#34886e', '#1f5e4c', '#2c8068', '#247460', '#369072'], far: ['#2a6a5a', '#22604f', '#306e5c', '#265a4c'], accent: '#ff6ad0', deck: ['#06160f', '#04120c'] },
  cathedral: { pal: ['#5a5848', '#4c4a3c', '#666452', '#403e32', '#605e4c', '#545242', '#6e6c58'], far: ['#524f42', '#46432a', '#5c5848', '#4a4738'], accent: '#ffe08a', deck: ['#14130c', '#0e0d08'] },
};

export const PB = { hi: '#f1e5bf', mid: '#c6b27b', lo: '#9b8657', dim: '#3b321f', bg: '#201c12', glow: '#d8c27a', warn: '#b3422d', red: '#8f2d22', panel: '#332b1a', panel2: '#4a3d23', panel3: '#66512a', rule: '#9a8354', paper: '#d8c59a', ink: '#15120a', brass: '#c69b44', success: '#54ff96' };

export const DISTRICT_KEYS = ['down', 'station', 'airport', 'ghetto', 'chinatown', 'mall', 'quarantine', 'mountain', 'refinery', 'skyscraper', 'powerplant', 'port', 'park', 'cathedral'];

export const NUKES = [
  { id: 'std', nm: 'Standard', nmRu: 'Обычная', mult: 1.0, spread: 1.0, single: false, tier: 0, baseCost: 0, col: '#54ff96', desc: 'Your upgraded warhead - unlimited' },
  { id: 'wide', nm: 'Wide Yield', nmRu: 'Широкая', mult: 1.5, spread: 1.9, single: true, tier: 3, baseCost: 300, col: '#5fd8ff', desc: 'x1.5 blast, 3 uses' },
  { id: 'tsar', nm: 'Tsar Bomba', nmRu: 'Царь-бомба', mult: 2.3, spread: 1.3, single: true, tier: 5, baseCost: 240, col: '#ffd24a', desc: 'x2.3 blast, 3 uses' },
];

export const EXPLOSION_ASSET_SPECS = [
  { type: 'fire', file: 'kenney_explosion_00.png' },
  { type: 'fire', file: 'kenney_explosion_01.png' },
  { type: 'fire', file: 'kenney_explosion_02.png' },
  { type: 'fire', file: 'kenney_explosion_03.png' },
  { type: 'fire', file: 'kenney_explosion_04.png' },
  { type: 'fire', file: 'kenney_explosion_05.png' },
  { type: 'flash', file: 'kenney_flash_00.png' },
  { type: 'flash', file: 'kenney_flash_01.png' },
  { type: 'smoke', file: 'kenney_smoke_00.png' },
  { type: 'smoke', file: 'kenney_smoke_01.png' },
];

export const MUSHROOM_SOURCE_SPECS = [
  { file: 'freesvg_atomic_bomb_cloud.png', weight: 4 },
  { file: 'freesvg_mushroomcloud2.png', weight: 3 },
  { file: 'freesvg_color_mushroom_cloud.png', weight: 3 },
  { file: 'freesvg_mushroom_cloud_boom.png', weight: 2 },
  { file: 'freesvg_mushroom_cloud_vector.png', weight: 2 },
];

export function districtPalette(district) {
  return district === 'down' ? PALETTE : (THEMES[district] ? THEMES[district].pal : PALETTE);
}

export function districtFarPalette(district) {
  return THEMES[district] ? THEMES[district].far : FARPAL;
}

export function districtColor(district, i, j) {
  const palette = districtPalette(district);
  return palette[(i * 3 + j) % palette.length];
}

export function districtAccent(district) {
  return (THEMES[district] && THEMES[district].accent) || '#b3422d';
}
