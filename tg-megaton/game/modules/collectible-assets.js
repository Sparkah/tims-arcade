import { cleanAssetId, hexColor, safeAssetId } from './game-utils.js';

export function createCollectibleAssets({ ImageCtor, getClock, getSkin, palette }) {
  const iconCache = Object.create(null);
  const animationCache = Object.create(null);

  function icon(id) {
    id = cleanAssetId(id);
    if (!id) return null;
    if (!iconCache[id]) {
      const image = new ImageCtor();
      image.src = 'assets/gacha/icons_alpha/' + id + '.png';
      iconCache[id] = image;
    }
    return iconCache[id];
  }

  function frame(id, fallbackId) {
    id = safeAssetId(id);
    fallbackId = cleanAssetId(fallbackId || id);
    if (!id) return icon(fallbackId);
    if (!animationCache[id]) {
      const frames = [];
      for (let i = 1; i <= 4; i++) {
        const image = new ImageCtor();
        image.src = 'assets/gacha/anim/' + id + '/' + id + '_0' + i + '.png';
        frames.push(image);
      }
      animationCache[id] = frames;
    }
    const frames = animationCache[id];
    const selected = frames[Math.floor(getClock() * 9) % frames.length];
    return selected && selected.complete && selected.naturalWidth ? selected : icon(fallbackId);
  }

  function colors() {
    const skinState = getSkin();
    const equipped = skinState.equipped;
    const visual = skinState.visual || {};
    const skinId = safeAssetId(equipped && equipped.id);
    const assetId = cleanAssetId(visual.assetId || (equipped && (equipped.assetId || equipped.id)));
    const animId = safeAssetId(visual.animId || skinId || assetId);
    const primary = hexColor(visual.primary || (equipped && equipped.color), palette.hi);
    const accent = hexColor(visual.accent || (equipped && equipped.accent), palette.warn);
    const secondary = hexColor(visual.secondary || (equipped && equipped.secondary), '#ffffff');
    const blast = hexColor(visual.blast || visual.mushroomTint, '#ff8a3b');
    const cool = visual.impact === 'cool_ring' || visual.style === 'cool' || visual.trail === 'cyan_vent';
    return {
      primary,
      accent,
      secondary,
      blast: cool ? hexColor(visual.blast, '#7fd4ff') : blast,
      wave: cool ? '#bfe9ff' : (visual.impact === 'last_button' ? '#ff365e' : accent),
      impact: visual.impact || 'hot_bloom',
      body: visual.body || (equipped && equipped.silhouette) || 'needle',
      trail: visual.trail || '',
      style: visual.style || '',
      family: (equipped && equipped.family) || '',
      animId,
      assetId,
      particles: [secondary, accent, blast, primary],
    };
  }

  return Object.freeze({ icon, frame, colors });
}
