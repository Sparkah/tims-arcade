// Full-screen overlays: MENU (hero cover + title + BloodForge entry), SHOP (BloodForge: weapons + tracks),
// CHEAT, GAMEOVER, PAUSE. Each rebuilds its hit-rects on the shared `rects` object every draw. Shares the
// panel/button/rounded-rect/tank-preview helpers + the BT_* palette with render/hud.js (function-only cycle).
import { state, player, econ, META, view, hudImages, SAVE_INTEREST } from '../state.js?v=bm9';
import { fmtTime } from '../lib/math.js?v=bm9';
import { TWO_PI } from '../lib/math.js?v=bm9';
import { WEAPONS } from '../data/weapons.js?v=bm9';
import { T_NAME, SPRITE_T_R, SPRITE_T_G, SPRITE_T_B } from '../data/enemies.js?v=bm9';   // for the DEV enemy-wave grid (name + per-type tint swatch)
import { MAXTIER, TRACKS } from '../data/upgrades.js?v=bm9';
import { weaponName, trackCost, trackEffect } from '../game/meta.js?v=bm9';
import { RARITY, R_MYTHIC, PITY_HARD, RELIC_SLOTS, SKINS, RELICS, STORE, GEAR_SLOTS, GEAR_TIERS, GEAR_MERGE } from '../data/loot.js?v=bm9';
import { SHARD_RELIC_COST } from '../systems/loot.js?v=bm9';
import { rects } from '../state.js?v=bm9';
import {
  BT_CRIM, BT_CRIM_HI, BT_BLOOD, BT_BLOOD_DK, BT_BONE, BT_BONE_DIM, BT_IRON, BT_IRON_LO,
  drawPanel, drawButton, drawHudTankPreview, hudRR, drawTintedTankPreview, drawRelicIcon, blitSheetCell
} from '../render/hud.js?v=bm9';
import { SKIN_BY_ID, RELIC_BY_ID, DEFAULT_TINT } from '../data/loot.js?v=bm9';
import { hud } from '../render/context.js?v=bm9';
import { drawMenuGuide } from '../tutorial.js?v=bm9';   // one-time post-death menu guide (no-op until first death / once seen)
import { CHEATS_ENABLED } from '../flags.js?v=bm9';
import { playTone } from '../audio.js?v=bm9';   // gacha roll ticks + payoff

  export function drawMenu() {
    var bg = menuBgSource();
    hud.fillStyle = '#050302';
    hud.fillRect(0, 0, view.cssW, view.cssH);
    if (bg) {
      var sc = Math.max(view.cssW / bg.w, view.cssH / bg.h);
      var dw = bg.w * sc, dh = bg.h * sc;
      hud.globalAlpha = bg.vid ? 0.66 : 0.48;
      hud.drawImage(bg.img, (view.cssW - dw) * 0.5, (view.cssH - dh) * 0.5, dw, dh);
      hud.globalAlpha = 1;
      var gd = hud.createLinearGradient(0, 0, 0, view.cssH);
      gd.addColorStop(0, 'rgba(8,5,4,0.55)');
      gd.addColorStop(0.4, 'rgba(8,5,4,0.08)');
      gd.addColorStop(1, 'rgba(8,5,4,0.92)');
      hud.fillStyle = gd;
      hud.fillRect(0, 0, view.cssW, view.cssH);
    } else {
      drawPanel(0.90);
    }
    rects.shop.length = 0;
    rects.weapons.length = 0;
    var w = Math.min(440, view.cssW - 32);
    var x = (view.cssW - w) * 0.5;
    var titleY = view.cssH * 0.44;
    // large glowing title
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = Math.max(16, Math.min(28, view.cssW * 0.05));
    hud.fillStyle = '#fff';
    hud.font = '900 ' + Math.max(30, Math.min(62, view.cssW * 0.115)) + 'px sans-serif';
    hud.fillText('BLOODTREAD', view.cssW * 0.5, titleY);
    hud.shadowBlur = 0;
    // tagline
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(11, Math.min(17, view.cssW * 0.032)) + 'px sans-serif';
    hud.fillText('CRUSH. BLEED. EVOLVE.', view.cssW * 0.5, titleY + Math.max(20, view.cssH * 0.038));
    // buttons below title (START RUN / BLOODFORGE / GORE VAULT [/ DISCOVER GAMES only in the TG wrapper])
    var bgap = 10;
    var btnH = Math.max(42, Math.min(52, view.cssH * 0.068));
    // DISCOVER GAMES shows ONLY inside the Telegram wrapper (where __tg.openTelegramLink is injected). It opens the
    // Game Factory bot for cross-game discovery + a one-time gore-cache reward, and the /start it fires enrolls the
    // player for launch broadcasts. Standalone / CrazyGames / Yandex builds keep the original 3-button layout.
    var showDiscover = !!(typeof window !== 'undefined' && window.__tg && window.__tg.openTelegramLink);
    var nBtn = showDiscover ? 4 : 3;
    var by = Math.min(view.cssH - (btnH * nBtn + bgap * (nBtn - 1) + 64), titleY + view.cssH * 0.13);
    rects.play  = drawButton(x, by, w, btnH, 'START RUN', true);
    rects.forge = drawButton(x, by + btnH + bgap, w, btnH, 'BLOODFORGE   ' + Math.floor(econ.totalBank), false);
    rects.vault = drawVaultButton(x, by + (btnH + bgap) * 2, w, btnH);   // GORE VAULT entry; count badge when caches are waiting
    if (showDiscover) {
      var discClaimed = !!(econ.boughtOnce && econ.boughtOnce['discover_games']);
      rects.discover = drawButton(x, by + (btnH + bgap) * 3, w, btnH, discClaimed ? 'DISCOVER GAMES' : 'DISCOVER GAMES   +CACHE', false);
    } else { rects.discover = null; }
    // weapon + track info
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(10, Math.min(13, view.cssH * 0.018)) + 'px sans-serif';
    var infoY = by + (btnH + bgap) * nBtn + 14;
    hud.fillText('weapon: ' + weaponName(econ.equipWeapon) + '   tracks: ' + META.armor + '-' + META.core + '-' + META.cannon + '-' + META.treads + '-' + META.thirst + '-' + META.frenzy, view.cssW * 0.5, infoY);
    if (econ.bestTime > 0) {
      hud.fillText('BEST ' + fmtTime(econ.bestTime), view.cssW * 0.5, infoY + 18);
    }
    // DEV CHEATS button - DEBUG/?cheats ONLY (CHEATS_ENABLED = ?debug || ?cheats). The SHIPPED game shows NO
    // cheat entry at all (Tim's standing rule); with the flag, a clear full-width button opens the cheat menu
    // (state.mode='CHEAT', routed in input.js MENU branch via rects.cheat). Replaced the old cramped top-left
    // corner pill with this proper button so it's obvious + tappable in dev/test. (2026-06-24)
    if (CHEATS_ENABLED) {
      var dcH = Math.max(36, Math.min(44, view.cssH * 0.056));
      var dcY = Math.min(view.cssH - dcH - 12, infoY + (econ.bestTime > 0 ? 36 : 22));
      rects.cheat = drawButton(x, dcY, w, dcH, 'DEV CHEATS', false);
    } else {
      rects.cheat = null;
    }
    hud.textAlign = 'start';
    drawMenuGuide();   // TUTORIAL: after the first death, a one-time overlay explaining the base (tutorial.js)
  }

  export function drawShop() {
    drawPanel(0.96);
    var w = Math.min(520, view.cssW - 28);
    var x = (view.cssW - w) * 0.5;
    var y = Math.max(16, view.cssH * 0.032);
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    // BLOODFORGE title with crim glow
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = 14;
    hud.fillStyle = BT_CRIM_HI;
    hud.font = '900 ' + Math.max(18, Math.min(26, view.cssH * 0.038)) + 'px sans-serif';
    hud.fillText('BLOODFORGE', view.cssW * 0.5, y + 14);
    hud.shadowBlur = 0;
    hud.fillStyle = BT_BONE;
    hud.font = 'bold ' + Math.max(11, Math.min(14, view.cssH * 0.02)) + 'px sans-serif';
    hud.fillText('BLOOD: ' + Math.floor(econ.totalBank), view.cssW * 0.5, y + 36);
    drawHudTankPreview(view.cssW * 0.5, y + 100, Math.min(104, view.cssH * 0.15));

    rects.weapons.length = 0;
    var wy = y + 158;
    var gap = 6;
    var ww = (w - gap * 3) / 4;
    var wsH = Math.max(36, Math.min(44, view.cssH * 0.058));
    for (var wi = 0; wi < WEAPONS.length; wi++) {
      var W = WEAPONS[wi];
      var rx = x + wi * (ww + gap);
      var owned = !!econ.ownedWeapons[W.id];
      var eq = econ.equipWeapon === W.id;
      hud.fillStyle = eq ? '#2a1714' : '#140e0c';
      hud.strokeStyle = eq ? BT_CRIM_HI : (owned ? '#6a3a32' : '#3a2622');
      hud.lineWidth = eq ? 2.2 : 1.2;
      hudRR(rx, wy, ww, wsH, 7);
      hud.fill(); hud.stroke();
      // weapon colour dot
      var wdot = 'rgb(' + Math.round(W.r * 255) + ',' + Math.round(W.g * 255) + ',' + Math.round(W.b * 255) + ')';
      hud.fillStyle = wdot;
      hud.beginPath(); hud.arc(rx + 9, wy + wsH * 0.32, 3, 0, TWO_PI); hud.fill();
      hud.fillStyle = owned ? '#fff' : BT_BONE_DIM;
      hud.font = 'bold ' + Math.max(8, Math.min(10, wsH * 0.25)) + 'px sans-serif';
      hud.fillText(W.name, rx + ww * 0.5 + 4, wy + wsH * 0.34);
      hud.fillStyle = eq ? wdot : (owned ? BT_BONE_DIM : (econ.totalBank >= W.cost ? '#fff' : '#7a5a54'));
      hud.font = 'bold ' + Math.max(7, Math.min(9, wsH * 0.22)) + 'px sans-serif';
      hud.fillText(eq ? 'EQUIPPED' : (owned ? 'EQUIP' : String(W.cost)), rx + ww * 0.5, wy + wsH * 0.74);
      rects.weapons.push({ x: rx, y: wy, w: ww, h: wsH, id: W.id });
    }

    rects.shop.length = 0;
    var rowH = Math.max(40, Math.min(58, (view.cssH - wy - wsH - 96) / TRACKS.length - 4));
    var top = wy + wsH + 14;
    for (var i = 0; i < TRACKS.length; i++) {
      var tr = TRACKS[i];
      var ry = top + i * (rowH + 4);
      var tier = META[tr.id];
      var cost = trackCost(tr.id);
      var sel = econ.selectedTrack === tr.id;
      hud.fillStyle = sel ? '#241a14' : '#16100d';
      hud.strokeStyle = sel ? BT_CRIM_HI : '#5a2a26';
      hud.lineWidth = sel ? 2.2 : 1.2;
      hudRR(x, ry, w, rowH, 9);
      hud.fill(); hud.stroke();
      // icon medallion
      var mx = x + 22, my = ry + rowH * 0.5, mr = Math.max(11, rowH * 0.32);
      hud.fillStyle = '#0d0807';
      hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.fill();
      hud.strokeStyle = BT_CRIM; hud.lineWidth = 1.2;
      hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.stroke();
      hud.textAlign = 'left';
      hud.fillStyle = '#fff';
      var tx = mx + mr + 8;
      hud.font = 'bold ' + Math.max(11, Math.min(16, rowH * 0.34)) + 'px sans-serif';
      hud.fillText(tr.name, tx, ry + rowH * 0.32);
      hud.fillStyle = BT_BONE_DIM;
      hud.font = Math.max(9, Math.min(11, rowH * 0.27)) + 'px sans-serif';
      hud.fillText(trackEffect(tr.id), tx, ry + rowH * 0.61);
      // tier dots
      for (var t = 0; t < MAXTIER; t++) {
        hud.fillStyle = t < tier ? BT_CRIM_HI : '#3a2a26';
        hud.beginPath(); hud.arc(tx + t * 11, ry + rowH * 0.82, 3.2, 0, TWO_PI); hud.fill();
      }
      var bw = 66, bx0 = x + w - bw - 8, by0 = ry + rowH * 0.19, bh = rowH * 0.62;
      var afford = cost != null && econ.totalBank >= cost;
      hud.fillStyle = cost == null ? '#2a2a2a' : (afford ? BT_CRIM : '#33231f');
      hudRR(bx0, by0, bw, bh, bh * 0.5);
      hud.fill();
      hud.textAlign = 'center';
      hud.fillStyle = cost == null ? BT_BONE_DIM : (afford ? '#fff' : '#7a6a64');
      hud.font = 'bold ' + Math.max(10, Math.min(13, bh * 0.50)) + 'px sans-serif';
      hud.fillText(cost == null ? 'MAX' : String(cost), bx0 + bw * 0.5, by0 + bh * 0.5);
      rects.shop.push({ x: x, y: ry, w: w, h: rowH, id: tr.id, bx: bx0, by: by0, bw: bw, bh: bh });
    }
    rects.shopBack = drawButton(x, Math.min(view.cssH - 52, top + TRACKS.length * (rowH + 4) + 8), w, 42, 'BACK', false);
    hud.textAlign = 'start';
  }

  // ---- GORE VAULT (gacha) screens -----------------------------------------------------------------
  function rgbStr(c, m) { return 'rgb(' + Math.min(255, Math.round(c[0] * m)) + ',' + Math.min(255, Math.round(c[1] * m)) + ',' + Math.min(255, Math.round(c[2] * m)) + ')'; }
  // Truncate `text` (in the CURRENT hud.font) to fit maxW, adding an ellipsis. Used to stop STORE title/sub from
  // rendering under the price pills (the 4999 STARS + 40 TON row was overlapping its description).
  function fitLabel(text, maxW) {
    if (maxW <= 0 || !text) return '';
    if (hud.measureText(text).width <= maxW) return text;
    var t = String(text);
    while (t.length > 1 && hud.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function perfNow() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0; }
  // The menu/vault background source: the animated <video> once it's decoding frames, else the static hero image.
  function menuBgSource() {
    var v = hudImages.menuvid;
    if (v && v.readyState >= 2 && v.videoWidth) return { img: v, w: v.videoWidth, h: v.videoHeight, vid: true };
    var h = hudImages.hero;
    if (h && h.complete && h.naturalWidth) return { img: h, w: h.naturalWidth, h: h.naturalHeight, vid: false };
    return null;
  }
  // Blit a whole loaded HUD image (the bespoke Gemini art), aspect-fit + centered. false if not loaded yet.
  function blitFit(key, cx, cy, size) {
    var img = hudImages[key];
    if (!img || !img.complete || !img.naturalWidth) return false;
    var s = size / Math.max(img.naturalWidth, img.naturalHeight);
    var w = img.naturalWidth * s, h = img.naturalHeight * s;
    hud.imageSmoothingEnabled = true;
    hud.drawImage(img, Math.round(cx - w * 0.5), Math.round(cy - h * 0.5), Math.round(w), Math.round(h));
    return true;
  }

  // The hero-cover backdrop (same art as the menu) dimmed under a blood gradient + corner ticks, so the vault
  // reads as part of the game world, not a flat panel.
  function vaultBackdrop() {
    var bg = menuBgSource();
    hud.fillStyle = '#050302'; hud.fillRect(0, 0, view.cssW, view.cssH);
    if (bg) {
      var sc = Math.max(view.cssW / bg.w, view.cssH / bg.h);
      var dw = bg.w * sc, dh = bg.h * sc;
      hud.globalAlpha = bg.vid ? 0.4 : 0.28; hud.drawImage(bg.img, (view.cssW - dw) * 0.5, (view.cssH - dh) * 0.5, dw, dh); hud.globalAlpha = 1;
    }
    var gd = hud.createLinearGradient(0, 0, 0, view.cssH);
    gd.addColorStop(0, 'rgba(8,3,3,0.86)'); gd.addColorStop(0.45, 'rgba(8,3,3,0.6)'); gd.addColorStop(1, 'rgba(8,3,3,0.93)');
    hud.fillStyle = gd; hud.fillRect(0, 0, view.cssW, view.cssH);
    var tk = 20, mg = 4; hud.strokeStyle = 'rgba(196,18,40,0.34)'; hud.lineWidth = 1.5;
    hud.beginPath();
    hud.moveTo(mg + tk, mg); hud.lineTo(mg, mg); hud.lineTo(mg, mg + tk);
    hud.moveTo(view.cssW - mg - tk, mg); hud.lineTo(view.cssW - mg, mg); hud.lineTo(view.cssW - mg, mg + tk);
    hud.moveTo(mg + tk, view.cssH - mg); hud.lineTo(mg, view.cssH - mg); hud.lineTo(mg, view.cssH - mg - tk);
    hud.moveTo(view.cssW - mg - tk, view.cssH - mg); hud.lineTo(view.cssW - mg, view.cssH - mg); hud.lineTo(view.cssW - mg, view.cssH - mg - tk);
    hud.stroke();
  }

  function sectionLabel(text, x, y) {
    hud.textAlign = 'left'; hud.textBaseline = 'middle';
    hud.fillStyle = BT_BONE; hud.font = 'bold ' + Math.max(10, Math.min(12, view.cssH * 0.0165)) + 'px sans-serif';
    hud.fillText(text, x + 2, y + 8);
  }

  // A riveted blood-metal cache crate glyph (procedural) - the OPEN button's emblem.
  function cacheGlyph(cx, cy, r, hot) {
    hud.save(); hud.translate(cx, cy);
    hud.fillStyle = hot ? '#3a2420' : '#241a16';
    hudRR(-r, -r * 0.78, r * 2, r * 1.56, r * 0.22); hud.fill();
    hud.strokeStyle = hot ? BT_CRIM_HI : '#5a3a32'; hud.lineWidth = 2;
    hudRR(-r, -r * 0.78, r * 2, r * 1.56, r * 0.22); hud.stroke();
    hud.strokeStyle = BT_BLOOD; hud.lineWidth = Math.max(2, r * 0.16);
    hud.beginPath(); hud.moveTo(-r, -r * 0.05); hud.lineTo(r, -r * 0.05); hud.stroke();
    hud.fillStyle = '#7a5a4e'; var rp = r * 0.62;
    hud.beginPath();
    hud.arc(-rp, -rp * 0.7, r * 0.1, 0, TWO_PI); hud.arc(rp, -rp * 0.7, r * 0.1, 0, TWO_PI);
    hud.arc(-rp, rp * 0.7, r * 0.1, 0, TWO_PI); hud.arc(rp, rp * 0.7, r * 0.1, 0, TWO_PI); hud.fill();
    hud.restore();
  }

  // The OPEN CACHE hero panel: a biomech metal slab + the cache glyph + a crim pulse-glow when caches wait.
  function drawOpenPanel(x, y, w, h, canOpen) {
    var gr = hud.createLinearGradient(x, y, x, y + h);
    if (canOpen) { gr.addColorStop(0, '#3a1414'); gr.addColorStop(1, '#190a0a'); } else { gr.addColorStop(0, '#241c18'); gr.addColorStop(1, '#130e0c'); }
    hud.fillStyle = gr; hudRR(x, y, w, h, 12); hud.fill();
    if (canOpen) {
      hud.save(); hud.globalCompositeOperation = 'lighter';
      hud.globalAlpha = 0.22 * (0.6 + 0.4 * Math.sin(perfNow() * 0.005));
      var hg = hud.createRadialGradient(x + h * 0.6, y + h * 0.5, 0, x + h * 0.6, y + h * 0.5, h * 0.85);
      hg.addColorStop(0, BT_CRIM_HI); hg.addColorStop(1, 'rgba(0,0,0,0)'); hud.fillStyle = hg; hud.fillRect(x, y, h * 1.4, h);
      hud.restore();
    }
    hud.lineWidth = 2.2; hud.strokeStyle = canOpen ? BT_CRIM_HI : '#4a3a32';
    hudRR(x + 0.5, y + 0.5, w - 1, h - 1, 11.5); hud.stroke();
    if (!blitFit('cache', x + h * 0.58, y + h * 0.5, h * 0.92)) cacheGlyph(x + h * 0.58, y + h * 0.5, h * 0.3, canOpen);
    hud.textAlign = 'left'; hud.textBaseline = 'middle';
    hud.fillStyle = canOpen ? '#fff' : BT_BONE_DIM;
    hud.font = '900 ' + Math.max(16, Math.min(24, h * 0.33)) + 'px sans-serif';
    hud.fillText(canOpen ? 'OPEN CACHE' : 'NO CACHES', x + h * 1.08, y + h * 0.39);
    hud.fillStyle = canOpen ? BT_CRIM_HI : '#6a564e';
    hud.font = 'bold ' + Math.max(9, Math.min(13, h * 0.19)) + 'px sans-serif';
    hud.fillText(canOpen ? (econ.caches + ' waiting  -  tap to crack open') : 'earn from elite kills + the daily', x + h * 1.08, y + h * 0.68);
    hud.textAlign = 'center';
  }

  // The real item art for a reveal: a tinted tank for skins, the relic's sprite for relics, a mapped sprite for
  // blood / voucher / consumable. false if sprites aren't loaded (caller draws a rarity orb fallback).
  function revealArt(c, cx, cy, size) {
    if (c.id && c.kind === 'skin' && blitFit('skin_' + c.id, cx, cy, size * 1.5)) return true;     // bespoke skin art
    if (c.id && c.kind === 'relic' && blitFit('relic_' + c.id, cx, cy, size * 1.4)) return true;   // bespoke relic art
    if (c.kind === 'skin' && c.tint && drawTintedTankPreview(cx, cy, size * 1.15, c.tint)) return true;
    var ic = c.kind === 'relic' ? c.icon : c.kind === 'blood' ? 'heart' : c.kind === 'voucher' ? 'tread' : c.kind === 'consumable' ? 'core' : 'gun0';
    return drawRelicIcon(ic || 'heart', cx, cy, size);
  }

  // The menu's GORE VAULT entry: a normal secondary button + a bright count pill when caches are waiting
  // (draws attention without a second red button competing with START RUN). Returns the button hit-rect.
  function drawVaultButton(x, y, w, h) {
    var r = drawButton(x, y, w, h, 'GORE VAULT', false);
    if (econ.caches > 0) {
      var pr = h * 0.32, px = x + w - pr - 16, py = y + h * 0.5;
      hud.fillStyle = BT_CRIM_HI;
      hud.beginPath(); hud.arc(px, py, pr, 0, TWO_PI); hud.fill();
      hud.fillStyle = '#fff';
      hud.font = '800 ' + Math.max(11, pr * 1.05) + 'px sans-serif';
      hud.textAlign = 'center'; hud.textBaseline = 'middle';
      hud.fillText(String(econ.caches), px, py + 0.5);
      hud.textAlign = 'start';
    }
    return r;
  }

  export function drawVault() {
    vaultBackdrop();
    var w = Math.min(540, view.cssW - 22);
    var x = (view.cssW - w) * 0.5;
    var cy = Math.max(10, view.cssH * 0.02);
    hud.textAlign = 'center'; hud.textBaseline = 'middle';

    hud.shadowColor = BT_CRIM; hud.shadowBlur = 16;
    hud.fillStyle = '#fff';
    hud.font = '900 ' + Math.max(20, Math.min(34, view.cssW * 0.07)) + 'px sans-serif';
    hud.fillText('GORE VAULT', view.cssW * 0.5, cy + 16);
    hud.shadowBlur = 0;

    cy += 36;
    hud.fillStyle = BT_BONE_DIM;
    hud.font = 'bold ' + Math.max(10, Math.min(13, view.cssH * 0.018)) + 'px sans-serif';
    hud.fillText('CACHES ' + econ.caches + '      SHARDS ' + econ.shards + '      PITY ' + Math.min(econ.pity, PITY_HARD) + ' / ' + PITY_HARD, view.cssW * 0.5, cy);

    cy += 16;
    var obH = Math.max(54, Math.min(72, view.cssH * 0.09));
    var canOpen = econ.caches > 0;
    drawOpenPanel(x, cy, w, obH, canOpen);
    rects.vaultOpen = { x: x, y: cy, w: w, h: obH };
    cy += obH + 6;

    hud.textAlign = 'center'; hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(9, Math.min(11, view.cssH * 0.0145)) + 'px sans-serif';
    hud.fillText('SCRAP ' + RARITY[0].weight + '    VEIN ' + RARITY[1].weight + '    CORE ' + RARITY[2].weight + '    RELIC ' + RARITY[3].weight + '%       CORE+ BY ' + PITY_HARD, view.cssW * 0.5, cy + 7);
    cy += 20;

    // HULL SKINS - each cell renders the REAL tank in that livery (tinted preview); equipped is ringed.
    sectionLabel('HULL SKINS', x, cy);
    cy += 16;
    rects.vaultSkins.length = 0;
    var ng = SKINS.length, sgap = Math.max(5, w * 0.012);
    var scw = (w - sgap * (ng - 1)) / ng;
    var sch = Math.max(42, Math.min(66, scw));
    for (var si = 0; si < ng; si++) {
      var sk = SKINS[si];
      var sx = x + si * (scw + sgap);
      var owned = !!econ.ownedSkins[sk.id];
      var seq = econ.equipSkin === sk.id;
      var src = RARITY[sk.rarity].col;
      hud.fillStyle = seq ? '#241410' : '#0d0908';
      hudRR(sx, cy, scw, sch, 7); hud.fill();
      if (owned) {
        if (!blitFit('skin_' + sk.id, sx + scw * 0.5, cy + sch * 0.46, Math.max(scw, sch) * 1.02) &&
            !drawTintedTankPreview(sx + scw * 0.5, cy + sch * 0.44, Math.min(scw, sch) * 0.96, sk.tint)) {
          hud.fillStyle = rgbStr(sk.tint, 150); hud.beginPath(); hud.arc(sx + scw * 0.5, cy + sch * 0.44, Math.min(scw, sch) * 0.3, 0, TWO_PI); hud.fill();
        }
      } else {
        hud.fillStyle = '#5a4a44'; hud.textAlign = 'center'; hud.textBaseline = 'middle'; hud.font = 'bold ' + Math.max(14, sch * 0.4) + 'px sans-serif';
        hud.fillText('?', sx + scw * 0.5, cy + sch * 0.44);
      }
      hud.lineWidth = seq ? 2.8 : 1.3;
      hud.strokeStyle = seq ? BT_CRIM_HI : (owned ? rgbStr(src, 200) : '#34261f');
      hudRR(sx, cy, scw, sch, 7); hud.stroke();
      if (seq) { hud.fillStyle = BT_CRIM_HI; hud.textAlign = 'center'; hud.textBaseline = 'middle'; hud.font = '800 ' + Math.max(7, sch * 0.15) + 'px sans-serif'; hud.fillText('EQUIPPED', sx + scw * 0.5, cy + sch - 7); }
      rects.vaultSkins.push({ x: sx, y: cy, w: scw, h: sch, id: sk.id, owned: owned });
    }
    cy += sch + 12;

    // GEAR - 5 slots (one per tank part), each a MERGE ladder. Equipped = your BEST tier. Tap MERGE to fuse 5->1.
    sectionLabel('GEAR  -  MERGE ' + GEAR_MERGE + ' TO RANK UP', x, cy);
    cy += 16;
    rects.vaultGear.length = 0;
    var slotH = Math.max(38, Math.min(52, view.cssH * 0.066));
    var pipN = GEAR_TIERS.length;
    for (var gi = 0; gi < GEAR_SLOTS.length; gi++) {
      var gslot = GEAR_SLOTS[gi];
      var garr = econ.gear[gslot.id] || [];
      var gry = cy + gi * (slotH + 5);
      var gbt = -1; for (var gb = garr.length - 1; gb >= 0; gb--) { if (garr[gb] > 0) { gbt = gb; break; } }
      var gcol = gbt >= 0 ? GEAR_TIERS[gbt].col : [0.3, 0.3, 0.3];
      hud.fillStyle = '#120c0a'; hudRR(x, gry, w, slotH, 8); hud.fill();
      hud.lineWidth = 1.3; hud.strokeStyle = rgbStr(gcol, 190); hudRR(x, gry, w, slotH, 8); hud.stroke();
      // equipped piece visual (shows the CURRENT rarity, how it looks)
      var picx = x + slotH * 0.62, picy = gry + slotH * 0.5, pir = slotH * 0.34;
      if (gbt >= 0) drawGearPiece(gslot.id, gbt, picx, picy, pir, 1);
      else { hud.fillStyle = '#1a1310'; hud.beginPath(); hud.arc(picx, picy, pir, 0, TWO_PI); hud.fill(); hud.lineWidth = 1.2; hud.strokeStyle = '#34261f'; hud.stroke(); }
      var gtx = x + slotH * 1.2;
      hud.textAlign = 'left'; hud.textBaseline = 'middle';
      hud.fillStyle = '#fff'; hud.font = '800 ' + Math.max(11, slotH * 0.3) + 'px sans-serif';
      hud.fillText(gslot.name, gtx, gry + slotH * 0.33);
      hud.fillStyle = gbt >= 0 ? rgbStr(gcol, 235) : '#5a4a44'; hud.font = '700 ' + Math.max(8, slotH * 0.2) + 'px sans-serif';
      hud.fillText(gbt >= 0 ? GEAR_TIERS[gbt].name : 'EMPTY', gtx, gry + slotH * 0.72);
      var pipW = Math.min(24, (w * 0.42) / pipN), pipX0 = x + w * 0.32;
      hud.textAlign = 'center'; hud.font = Math.max(8, slotH * 0.2) + 'px sans-serif';
      for (var pt = 0; pt < pipN; pt++) {
        var gcnt = garr[pt] || 0;
        hud.fillStyle = gcnt > 0 ? rgbStr(GEAR_TIERS[pt].col, 225) : '#2a201b';
        hud.fillText(gcnt > 0 ? String(gcnt) : '.', pipX0 + pt * pipW + pipW * 0.5, gry + slotH * 0.5);
      }
      var gCanMerge = false; for (var cmt = 0; cmt < garr.length - 1; cmt++) { if (garr[cmt] >= GEAR_MERGE) { gCanMerge = true; break; } }
      var mbw = Math.max(52, w * 0.15), mbx = x + w - mbw - 7, mby = gry + (slotH - 22) * 0.5;
      hud.fillStyle = gCanMerge ? rgbStr([1, 0.40, 0.34], 235) : '#221813';
      hudRR(mbx, mby, mbw, 22, 11); hud.fill();
      hud.fillStyle = gCanMerge ? '#160a08' : '#5a4a44'; hud.textAlign = 'center'; hud.textBaseline = 'middle'; hud.font = '800 ' + Math.max(9, slotH * 0.2) + 'px sans-serif';
      hud.fillText('MERGE', mbx + mbw * 0.5, mby + 11);
      rects.vaultGear.push({ x: x, y: gry, w: w, h: slotH, slot: gslot.id, merge: { x: mbx, y: mby, w: mbw, h: 22 }, canMerge: gCanMerge });
    }
    cy += GEAR_SLOTS.length * (slotH + 5) + 6;

    // shard forge (only when there's an unowned relic to forge) + BACK
    var hasUnowned = false;
    for (var u = 0; u < RELICS.length; u++) { if (!econ.ownedRelics[RELICS[u].id]) { hasUnowned = true; break; } }
    var bbH = Math.max(38, Math.min(46, view.cssH * 0.056));
    if (hasUnowned) {
      var afford = econ.shards >= SHARD_RELIC_COST;
      rects.vaultShard = drawButton(x, cy, w, bbH, 'FORGE RANDOM RELIC  ( ' + SHARD_RELIC_COST + ' SHARDS )', false);
      if (!afford) { hud.globalAlpha = 0.5; hud.fillStyle = '#0a0605'; hudRR(x, cy, w, bbH, bbH * 0.5); hud.fill(); hud.globalAlpha = 1; rects.vaultShard.afford = false; }
      else { rects.vaultShard.afford = true; }
      cy += bbH + 8;
    } else { rects.vaultShard = null; }
    rects.vaultStore = drawButton(x, cy, w, bbH, 'BLOOD MARKET   -   BOXES + MYTHIC', false);
    cy += bbH + 8;
    rects.vaultBack = drawButton(x, Math.min(view.cssH - bbH - 10, cy), w, bbH, 'BACK', false);
    drawMergeAnim();   // GEAR merge animation overlay (5 pieces -> blood burst -> the new tier)
    hud.textAlign = 'start';
  }

  // BLOOD MARKET (store) - the free daily ad box, paid boxes (guaranteed floors + pity), mythic direct-buy.
  // Buys route through input.js: window.__tg.buy in production, or a local grant under ?storetest for preview.
  export function drawStore() {
    vaultBackdrop();
    var w = Math.min(540, view.cssW - 22);
    var x = (view.cssW - w) * 0.5;
    var cy = Math.max(10, view.cssH * 0.02);
    hud.textAlign = 'center'; hud.textBaseline = 'middle';
    hud.shadowColor = BT_CRIM; hud.shadowBlur = 16; hud.fillStyle = '#fff';
    hud.font = '900 ' + Math.max(19, Math.min(32, view.cssW * 0.066)) + 'px sans-serif';
    hud.fillText('BLOOD MARKET', view.cssW * 0.5, cy + 16);
    hud.shadowBlur = 0;
    cy += 34;
    hud.fillStyle = BT_BONE_DIM; hud.font = Math.max(9, Math.min(11, view.cssH * 0.0145)) + 'px sans-serif';
    hud.fillText('Free daily box - paid boxes have guaranteed floors + pity - mythics bought outright', view.cssW * 0.5, cy);
    cy += 16;
    rects.store.length = 0;
    // The Blood Market has enough products to overflow a phone, so the LIST SCROLLS (drag) at a fixed, readable row
    // height. BACK is pinned at the bottom; rows are clipped to the viewport between the header and BACK. The drag
    // offset state.storeScroll is set in input.js and clamped here; edge fades + a thin thumb hint there is more.
    var bbH = Math.max(38, Math.min(46, view.cssH * 0.056));
    var backY = view.cssH - bbH - 10;
    var vpTop = cy, vpBot = backY - 8, vpH = Math.max(60, vpBot - vpTop);
    var rowH = Math.max(46, Math.min(58, view.cssH * 0.072));
    var rowStep = rowH + 7;
    var contentH = STORE.length * rowStep;
    var maxScroll = Math.max(0, contentH - vpH);
    if (state.storeScroll == null) state.storeScroll = 0;
    state.storeScroll = Math.max(0, Math.min(state.storeScroll, maxScroll));
    var sc = state.storeScroll;
    var isAdFree = false; try { isAdFree = localStorage.getItem('bloodtread_rebuild_adfree') === '1'; } catch (e) {}   // Remove Ads / Blood God show OWNED once the ad-free entitlement is held
    hud.save();
    hud.beginPath(); hud.rect(x - 5, vpTop, w + 10, vpH); hud.clip();
    for (var i = 0; i < STORE.length; i++) {
      var it = STORE[i];
      var owned = !!(it.once && econ.boughtOnce && econ.boughtOnce[it.id]) || ((it.id === 'ad_free' || it.id === 'bloodgod') && isAdFree);   // one-time purchase already bought; ad_free/bloodgod = the ad-free entitlement
      var ry = vpTop + i * rowStep - sc;
      var srow = { x: x, y: ry, w: w, h: rowH, item: it, owned: owned, ton: null };
      if (ry + rowH < vpTop - 2 || ry > vpBot + 2) { rects.store.push(srow); continue; }   // off-screen: keep index alignment, skip the draw
      var accent = owned ? [0.4, 0.4, 0.4]
                 : (it.kind === 'mythic' ? RARITY[R_MYTHIC].col
                 : (it.kind === 'daily' ? [0.5, 0.85, 0.55]
                 : (it.floor != null ? RARITY[it.floor].col : [1.0, 0.66, 0.2])));   // bounty has no floor -> gold
      hud.fillStyle = '#140d0b'; hudRR(x, ry, w, rowH, 9); hud.fill();
      hud.lineWidth = it.kind === 'mythic' ? 2.0 : 1.4; hud.strokeStyle = rgbStr(accent, 210); hudRR(x, ry, w, rowH, 9); hud.stroke();
      // -- PRICE PILLS: measure + place FIRST (right-aligned, TON rightmost) so the title/sub can be clipped to
      //    their left edge and never render UNDER a pill (fixes the wide 4999-STARS / 40.00-TON row overlap).
      var pillFont = '800 ' + Math.max(11, Math.min(14, rowH * 0.28)) + 'px sans-serif';
      hud.font = pillFont;
      var ph = Math.min(26, rowH * 0.5), ppy = ry + (rowH - ph) * 0.5, pxR = x + w - 12;
      var pills = [];
      if (owned || it.kind === 'daily') {
        pills.push({ label: owned ? 'OWNED' : 'WATCH AD', fill: rgbStr(accent, 235), ink: '#160a08' });
      } else {
        if (it.ton != null)   pills.push({ label: it.ton + ' TON',     fill: 'rgba(74,150,255,0.95)', ink: '#04121f', ton: true });
        if (it.stars != null) pills.push({ label: it.stars + ' STARS', fill: rgbStr(accent, 235),     ink: '#160a08' });
      }
      for (var pi = 0; pi < pills.length; pi++) {                 // lay out right-to-left
        var pp = pills[pi];
        pp.w = hud.measureText(pp.label).width + 20; pp.x = pxR - pp.w; pxR = pp.x - 8;
        if (pp.ton) srow.ton = { x: pp.x, y: ppy, w: pp.w, h: ph };
      }
      var textR = (pills.length ? pills[pills.length - 1].x : x + w) - 10;   // text must end before the leftmost pill
      // -- TITLE + SUB, truncated to fit the space left of the pills --
      hud.textAlign = 'left'; hud.textBaseline = 'middle';
      hud.fillStyle = '#fff'; hud.font = '800 ' + Math.max(12, Math.min(16, rowH * 0.32)) + 'px sans-serif';
      hud.fillText(fitLabel(it.title, textR - (x + 14)), x + 14, ry + rowH * 0.36);
      hud.fillStyle = BT_BONE_DIM; hud.font = Math.max(8, Math.min(11, rowH * 0.21)) + 'px sans-serif';
      hud.fillText(fitLabel(it.sub, textR - (x + 14)), x + 14, ry + rowH * 0.72);
      // -- draw the pills ON TOP (re-set the pill font; the text draws above changed it) --
      hud.font = pillFont; hud.textAlign = 'center';
      for (var pj = 0; pj < pills.length; pj++) {
        var q = pills[pj];
        hud.fillStyle = q.fill; hudRR(q.x, ppy, q.w, ph, ph * 0.5); hud.fill();
        hud.fillStyle = q.ink; hud.fillText(q.label, q.x + q.w * 0.5, ppy + ph * 0.5);
      }
      rects.store.push(srow);
    }
    hud.restore();
    if (maxScroll > 0) {   // scroll affordances: top/bottom fades + a thin thumb in the right padding
      if (sc > 2) { var g1 = hud.createLinearGradient(0, vpTop, 0, vpTop + 20); g1.addColorStop(0, 'rgba(6,4,3,0.8)'); g1.addColorStop(1, 'rgba(6,4,3,0)'); hud.fillStyle = g1; hud.fillRect(x - 5, vpTop, w + 10, 20); }
      if (sc < maxScroll - 2) { var g2 = hud.createLinearGradient(0, vpBot - 20, 0, vpBot); g2.addColorStop(0, 'rgba(6,4,3,0)'); g2.addColorStop(1, 'rgba(6,4,3,0.8)'); hud.fillStyle = g2; hud.fillRect(x - 5, vpBot - 20, w + 10, 20); }
      var thumbH = Math.max(28, vpH * (vpH / contentH)), thumbY = vpTop + (vpH - thumbH) * (sc / maxScroll);
      hud.fillStyle = 'rgba(224,64,44,0.55)'; hudRR(x + w - 3, thumbY, 3, thumbH, 1.5); hud.fill();
    }
    rects.storeBack = drawButton(x, backY, w, bbH, 'BACK', false);
    hud.textAlign = 'start';
  }

  // The cache-open REVEAL: a mechanical crack-open burst (NOT a casino spin) + the item card animating in.
  // revealCard is set by setReveal() (called from input.js after openCache()); the animation is time-driven
  // off revealStart so it needs no sim tick. CLAIM (rects.vaultClaim) returns to the vault.
  var revealCard = null;
  var revealStart = 0;
  export function setReveal(card) {
    revealCard = card;
    revealStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    if (card && card.kind === 'gear') buildGearRoll(card);   // box opens roll like a gacha case
  }

  // ---- GACHA CASE-OPENING roll (gear box opens) -----------------------------------------------
  var _rollLastTick = -1, _rollPaid = false;
  function gearSlotDef(id) { for (var q = 0; q < GEAR_SLOTS.length; q++) if (GEAR_SLOTS[q].id === id) return GEAR_SLOTS[q]; return null; }
  function buildGearRoll(card) {
    var maxT = (card.tier != null ? card.tier : 3);   // skin cards carry no tier -> default the decoy range
    var LAND = 28, strip = [];
    for (var i = 0; i < LAND + 7; i++) {
      if (i === LAND && card.slot != null && card.tier != null) { strip.push({ slot: card.slot, tier: card.tier }); continue; }
      var t = (Math.random() * (maxT + 2)) | 0; if (t > 6) t = 6;
      strip.push({ slot: GEAR_SLOTS[(Math.random() * GEAR_SLOTS.length) | 0].id, tier: t });
    }
    card.strip = strip; card.land = LAND; _rollLastTick = -1; _rollPaid = false;
  }
  function drawGearRoll() {
    var c = revealCard;
    vaultBackdrop();
    hud.fillStyle = 'rgba(6,2,2,0.66)'; hud.fillRect(0, 0, view.cssW, view.cssH);
    var el = (perfNow() - revealStart) / 1000, T = 2.7;
    var cx = view.cssW * 0.5, cy = view.cssH * 0.45;
    var itemW = Math.min(110, view.cssW * 0.24), pr = itemW * 0.34, bandH = itemW * 1.25;
    var ease = 1 - Math.pow(1 - clamp01(el / T), 5);
    var offset = c.land * itemW * ease;
    hud.fillStyle = '#0a0605'; hud.fillRect(0, cy - bandH * 0.5, view.cssW, bandH);
    // blood flowing down the band
    hud.save(); hud.globalAlpha = 0.5;
    for (var d = 0; d < 7; d++) {
      var dx = (d * 97 + 30) % view.cssW;
      var dl = (el * (40 + d * 12)) % (bandH + 40);
      var dg = hud.createLinearGradient(0, cy - bandH * 0.5, 0, cy - bandH * 0.5 + dl);
      dg.addColorStop(0, 'rgba(120,8,8,0)'); dg.addColorStop(1, 'rgba(150,10,10,0.5)');
      hud.fillStyle = dg; hud.fillRect(dx, cy - bandH * 0.5, 3 + (d % 3), dl);
    }
    hud.restore();
    for (var i = 0; i < c.strip.length; i++) {
      var ix = cx + i * itemW - offset;
      if (ix < -itemW || ix > view.cssW + itemW) continue;
      drawGearPiece(c.strip[i].slot, c.strip[i].tier, ix, cy, pr, 1);
    }
    hud.strokeStyle = rgbStr([0.6, 0.1, 0.1], 220); hud.lineWidth = 2;
    hud.beginPath(); hud.moveTo(0, cy - bandH * 0.5); hud.lineTo(view.cssW, cy - bandH * 0.5); hud.moveTo(0, cy + bandH * 0.5); hud.lineTo(view.cssW, cy + bandH * 0.5); hud.stroke();
    hud.strokeStyle = '#ff3a2a'; hud.lineWidth = 3;
    hud.beginPath(); hud.moveTo(cx, cy - bandH * 0.62); hud.lineTo(cx, cy + bandH * 0.62); hud.stroke();
    if (el < T) {
      var ui = Math.round(offset / itemW);
      if (ui !== _rollLastTick) { _rollLastTick = ui; playTone(760 + (ui % 5) * 30, 0.022, 0.045); }
      hud.fillStyle = '#fff'; hud.textAlign = 'center'; hud.textBaseline = 'middle';
      hud.font = '800 ' + Math.max(13, view.cssW * 0.03) + 'px sans-serif';
      hud.fillText('OPENING...', cx, cy - bandH * 0.5 - 22);
    } else {
      if (!_rollPaid) { _rollPaid = true; playTone(180, 0.5, 0.06); playTone(523, 0.2, 0.05); }
      var pb = clamp01((el - T) / 0.45);
      if (el - T < 0.55) {
        var bf = Math.min(15, (pb * 16) | 0);
        hud.save(); hud.globalAlpha = (1 - pb) * 0.85;
        blitSheetCell('gore_blood', (bf % 4) * 512, ((bf / 4) | 0) * 512, 512, 512, cx, cy, itemW * 3.5);
        hud.restore();
      }
      var pls = 1.12 + 0.06 * Math.sin(el * 8);
      if (c.skinId) {   // won a SKIN -> show the tank in that livery
        if (!blitFit('skin_' + c.skinId, cx, cy, pr * 2.7 * pls)) drawTintedTankPreview(cx, cy, pr * 2.2 * pls, c.tint || [1, 1, 1]);
      } else {
        drawGearPiece(c.slot, c.tier, cx, cy, pr * pls, 1);
      }
      var rtf = Math.max(14, Math.min(26, view.cssW * 0.038));   // cap the title so it doesn't sit on the subtext
      var rty = cy + bandH * 0.5 + 20 + rtf * 0.5;
      hud.fillStyle = rgbStr(c.col || [1, 1, 1], 255); hud.textAlign = 'center'; hud.textBaseline = 'middle';
      hud.font = '900 ' + rtf + 'px sans-serif';
      var label = c.skinId ? c.title : ((GEAR_TIERS[c.tier] ? GEAR_TIERS[c.tier].name : '') + ' ' + (gearSlotDef(c.slot) ? gearSlotDef(c.slot).name : 'GEAR'));
      hud.fillText(label, cx, rty);
      if (c.sub) { hud.fillStyle = '#c9bb99'; hud.font = Math.max(10, Math.min(13, view.cssW * 0.02)) + 'px sans-serif'; hud.fillText(c.sub, cx, rty + rtf * 0.7 + 12); }
      var clW = Math.min(300, view.cssW - 64);
      rects.vaultClaim = drawButton((view.cssW - clW) * 0.5, view.cssH * 0.78, clW, 52, 'CLAIM', true);
    }
    hud.textAlign = 'start';
  }

  // ---- GEAR piece visual + merge animation ----------------------------------------------------
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function eOut(t) { return 1 - Math.pow(1 - t, 3); }

  // A collectible gear piece: a faceted biomech CORE SHARD coloured + ornamented by its tier (dull grey COMMON
  // up to a blazing blood-red PRIMORDIAL), stamped with the slot glyph. Drawable at any size (rows + merge anim).
  export function drawGearPiece(slotId, tier, cx, cy, r, alpha) {
    alpha = (alpha == null) ? 1 : alpha;
    var col = GEAR_TIERS[tier] ? GEAR_TIERS[tier].col : [0.5, 0.5, 0.5];
    hud.save(); hud.globalAlpha = alpha;
    // rarity glow behind the part
    hud.save(); hud.globalCompositeOperation = 'lighter'; hud.globalAlpha = (0.22 + tier * 0.1) * alpha;
    var hg = hud.createRadialGradient(cx, cy, 0, cx, cy, r * 1.7);
    hg.addColorStop(0, rgbStr(col, 255)); hg.addColorStop(1, 'rgba(0,0,0,0)');
    hud.fillStyle = hg; hud.beginPath(); hud.arc(cx, cy, r * 1.7, 0, TWO_PI); hud.fill(); hud.restore();
    // the ACTUAL part drawing (generated biomech icon); fall back to a procedural shard until the art loads
    if (!blitFit('gear_' + slotId, cx, cy, r * 2.15)) {
      var pts = 4 + Math.min(tier, 4);
      var grad = hud.createRadialGradient(cx, cy - r * 0.25, r * 0.12, cx, cy, r);
      grad.addColorStop(0, rgbStr(col, 255)); grad.addColorStop(0.62, rgbStr(col, 150)); grad.addColorStop(1, '#0a0606');
      hud.beginPath();
      for (var i = 0; i < pts * 2; i++) {
        var a = (i / (pts * 2)) * TWO_PI - Math.PI / 2;
        var rr = (i % 2 === 0) ? r : r * 0.6;
        var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (i === 0) hud.moveTo(px, py); else hud.lineTo(px, py);
      }
      hud.closePath(); hud.fillStyle = grad; hud.fill();
      hud.lineWidth = 1.4 + tier * 0.35; hud.strokeStyle = rgbStr(col, 245); hud.stroke();
    }
    // rarity ring + high-tier accent studs (the tier read, no letters)
    hud.lineWidth = 1.4 + tier * 0.4; hud.strokeStyle = rgbStr(col, 235);
    hud.beginPath(); hud.arc(cx, cy, r * 1.14, 0, TWO_PI); hud.stroke();
    if (tier >= 4) {
      for (var k = 0; k < tier + 2; k++) {
        var aa = (k / (tier + 2)) * TWO_PI;
        hud.fillStyle = rgbStr(col, 255);
        hud.beginPath(); hud.arc(cx + Math.cos(aa) * r * 1.14, cy + Math.sin(aa) * r * 1.14, 1.5 + tier * 0.25, 0, TWO_PI); hud.fill();
      }
    }
    hud.restore();
  }

  var mergeAnim = null;
  export function setMergeAnim(slot, from, to) { mergeAnim = { slot: slot, from: from, to: to, start: perfNow() }; }
  export function mergeAnimBusy() { return !!(mergeAnim && (perfNow() - mergeAnim.start) < 1050); }
  function drawMergeAnim() {
    if (!mergeAnim) return;
    var el = (perfNow() - mergeAnim.start) / 1000;
    if (el > 1.05) { mergeAnim = null; return; }
    var cx = view.cssW * 0.5, cy = view.cssH * 0.5;
    var R = Math.min(view.cssW, view.cssH) * 0.12;
    var sa = el < 0.1 ? el / 0.1 : (el > 0.88 ? clamp01((1.05 - el) / 0.17) : 1);
    hud.globalAlpha = 1; hud.fillStyle = 'rgba(6,2,2,' + (0.72 * sa).toFixed(2) + ')'; hud.fillRect(0, 0, view.cssW, view.cssH);
    if (el < 0.52) {   // 5 'from' pieces spiral inward
      var conv = clamp01(el / 0.45);
      for (var i = 0; i < 5; i++) {
        var a = (i / 5) * TWO_PI - Math.PI / 2 + conv * 1.8;
        var rad = R * 2.4 * (1 - eOut(conv));
        drawGearPiece(mergeAnim.slot, mergeAnim.from, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, R * (1 - conv * 0.45), 1 - clamp01((el - 0.42) / 0.1));
      }
    }
    if (el > 0.34 && el < 0.84) {   // blood burst (gore_blood splatter)
      var bk = clamp01((el - 0.34) / 0.44); var bf = Math.min(15, (bk * 16) | 0);
      hud.save(); hud.globalAlpha = (bk < 0.18 ? bk / 0.18 : clamp01((1 - bk) / 0.82)) * 0.95;
      blitSheetCell('gore_blood', (bf % 4) * 512, ((bf / 4) | 0) * 512, 512, 512, cx, cy, R * 6.2);
      hud.restore();
    }
    if (el > 0.5) {   // the new higher-tier piece blooms in
      var pp = clamp01((el - 0.5) / 0.32);
      var sc = pp < 0.65 ? (pp / 0.65) * 1.28 : 1.28 - (pp - 0.65) / 0.35 * 0.28;
      drawGearPiece(mergeAnim.slot, mergeAnim.to, cx, cy, R * 1.5 * sc, clamp01(pp * 2));
      hud.globalAlpha = clamp01((el - 0.6) / 0.2);
      hud.fillStyle = rgbStr(GEAR_TIERS[mergeAnim.to] ? GEAR_TIERS[mergeAnim.to].col : [1, 1, 1], 255);
      hud.textAlign = 'center'; hud.textBaseline = 'middle'; hud.font = '900 ' + Math.max(15, R * 0.45) + 'px sans-serif';
      hud.fillText(GEAR_TIERS[mergeAnim.to] ? GEAR_TIERS[mergeAnim.to].name : '', cx, cy + R * 2.0);
      hud.globalAlpha = 1;
    }
  }

  // BOUNTY BOX reveal: the whole haul pops into a grid (gear pieces + the skin), then CLAIM.
  function drawBountyReveal() {
    var c = revealCard;
    vaultBackdrop();
    hud.fillStyle = 'rgba(6,2,2,0.72)'; hud.fillRect(0, 0, view.cssW, view.cssH);
    var el = (perfNow() - revealStart) / 1000, cx = view.cssW * 0.5;
    hud.textAlign = 'center'; hud.textBaseline = 'middle';
    hud.shadowColor = BT_CRIM; hud.shadowBlur = 16; hud.fillStyle = '#fff';
    hud.font = '900 ' + Math.max(22, view.cssW * 0.06) + 'px sans-serif';
    hud.fillText('BOUNTY HAUL', cx, view.cssH * 0.15); hud.shadowBlur = 0;
    var items = c.haul || [], n = items.length + (c.skin ? 1 : 0);
    var cols = Math.min(6, Math.max(1, n)), rows = Math.ceil(n / cols);
    var cell = Math.min(96, (view.cssW - 40) / cols);
    var gx0 = cx - (cols * cell) / 2 + cell / 2, gy0 = view.cssH * 0.34;
    for (var i = 0; i < items.length; i++) {
      var pop = clamp01((el - i * 0.07) / 0.3); if (pop <= 0) continue;
      drawGearPiece(items[i].slot, items[i].tier, gx0 + (i % cols) * cell, gy0 + ((i / cols) | 0) * cell, cell * 0.34 * (0.6 + 0.4 * pop), pop);
    }
    if (c.skin) {
      var si = items.length, spop = clamp01((el - si * 0.07) / 0.3);
      if (spop > 0) {
        var sx = gx0 + (si % cols) * cell, sy = gy0 + ((si / cols) | 0) * cell;
        hud.save(); hud.globalAlpha = spop;
        if (!blitFit('skin_' + c.skin, sx, sy, cell * 0.92)) { var sd = SKIN_BY_ID[c.skin]; drawTintedTankPreview(sx, sy, cell * 0.7, sd ? sd.tint : [1, 1, 1]); }
        hud.restore();
      }
    }
    var clW = Math.min(300, view.cssW - 64);
    rects.vaultClaim = drawButton((view.cssW - clW) * 0.5, Math.min(view.cssH - 68, gy0 + rows * cell + 24), clW, 52, 'CLAIM', true);
    hud.textAlign = 'start';
  }

  export function drawReveal() {
    if (revealCard && revealCard.kind === 'gear' && revealCard.strip) { drawGearRoll(); return; }   // box opens -> gacha case roll
    if (revealCard && revealCard.kind === 'bounty') { drawBountyReveal(); return; }                 // bounty box -> haul grid
    vaultBackdrop();
    hud.fillStyle = 'rgba(6,2,2,0.5)'; hud.fillRect(0, 0, view.cssW, view.cssH);
    var c = revealCard;
    var cx = view.cssW * 0.5;
    var clW = Math.min(300, view.cssW - 64), clH = 52;
    if (!c) { rects.vaultClaim = drawButton((view.cssW - clW) * 0.5, view.cssH * 0.62, clW, clH, 'CLAIM', true); return; }
    var el = Math.max(0, (perfNow() - revealStart) / 1000);
    var grow = el < 0.45 ? (el / 0.45) : 1;
    var ease = 1 - Math.pow(1 - Math.min(1, el / 0.34), 3);
    var rs = rgbStr(c.col, 255);

    var cw = Math.min(330, view.cssW - 46);
    var chh = Math.min(view.cssH * 0.62, cw * 1.12);
    var byc = view.cssH * 0.46 - chh * 0.5;
    var artY = byc + chh * 0.36, artSize = chh * 0.4;

    // REAL gore_blood splash burst behind the item (expands as the cache cracks)
    hud.save(); hud.globalAlpha = (1 - grow * 0.55) * 0.85;
    var gf = Math.min(15, Math.floor(grow * 15));
    blitSheetCell('gore_blood', (gf % 4) * 512, ((gf / 4) | 0) * 512, 512, 512, cx, artY, artSize * (1.7 + grow * 1.4));
    hud.restore();

    // mechanical crack shards (NOT a casino spin)
    hud.save(); hud.strokeStyle = rs; hud.lineWidth = 2 + (1 - grow) * 4;
    for (var i = 0; i < 14; i++) {
      var a = (i / 14) * TWO_PI + grow * 0.25;
      var r0 = 18 + grow * 26, r1 = (42 + grow * Math.min(view.cssW, view.cssH) * 0.3) * (0.7 + (i % 3) * 0.12);
      hud.globalAlpha = (1 - grow) * 0.75;
      hud.beginPath(); hud.moveTo(cx + Math.cos(a) * r0, artY + Math.sin(a) * r0); hud.lineTo(cx + Math.cos(a) * r1, artY + Math.sin(a) * r1); hud.stroke();
    }
    hud.restore();

    // the card frame
    hud.save(); hud.globalAlpha = ease;
    var cg = hud.createLinearGradient(cx, byc, cx, byc + chh);
    cg.addColorStop(0, '#1b0f0c'); cg.addColorStop(1, '#0c0706');
    hud.fillStyle = cg; hudRR(cx - cw * 0.5, byc, cw, chh, 14); hud.fill();
    hud.lineWidth = 3; hud.strokeStyle = rs; hudRR(cx - cw * 0.5, byc, cw, chh, 14); hud.stroke();
    hud.textAlign = 'center'; hud.textBaseline = 'middle';
    hud.fillStyle = rs; hud.font = '800 ' + Math.max(13, cw * 0.068) + 'px sans-serif';
    hud.fillText(c.rname, cx, byc + chh * 0.1);
    hud.restore();

    // rarity halo + the REAL item art (tinted tank for a skin, the relic sprite for a relic, etc.)
    hud.save(); hud.globalCompositeOperation = 'lighter'; hud.globalAlpha = 0.35 * ease;
    var halo = hud.createRadialGradient(cx, artY, 0, cx, artY, artSize);
    halo.addColorStop(0, rs); halo.addColorStop(1, 'rgba(0,0,0,0)');
    hud.fillStyle = halo; hud.beginPath(); hud.arc(cx, artY, artSize, 0, TWO_PI); hud.fill();
    hud.restore();
    hud.save(); hud.globalAlpha = ease;
    if (!revealArt(c, cx, artY, artSize)) { hud.fillStyle = rs; hud.beginPath(); hud.arc(cx, artY, artSize * 0.4, 0, TWO_PI); hud.fill(); }
    hud.restore();
    // ornate rarity frame around the item (hollow centre, the art shows through)
    hud.save(); hud.globalAlpha = ease; blitFit('frame_' + (RARITY[c.rarity] ? RARITY[c.rarity].id : 'scrap'), cx, artY, artSize * 2.45); hud.restore();

    // title + sub
    hud.save(); hud.globalAlpha = ease; hud.textAlign = 'center'; hud.textBaseline = 'middle';
    hud.fillStyle = '#fff'; hud.shadowColor = rs; hud.shadowBlur = 10;
    hud.font = '900 ' + Math.max(17, cw * 0.088) + 'px sans-serif';
    hud.fillText(c.title, cx, byc + chh * 0.72);
    hud.shadowBlur = 0;
    hud.fillStyle = c.dupe ? '#ffcf6a' : BT_BONE_DIM; hud.font = Math.max(10, cw * 0.044) + 'px sans-serif';
    hud.fillText(c.sub, cx, byc + chh * 0.86);
    hud.restore();

    var label = econ.caches > 0 ? ('CLAIM   -   ' + econ.caches + ' LEFT') : 'CLAIM';
    rects.vaultClaim = drawButton((view.cssW - clW) * 0.5, Math.min(view.cssH - clH - 14, byc + chh + 14), clW, clH, label, true);
    hud.textAlign = 'start';
  }

  export function drawCheat() {
    drawPanel(0.97);
    var w = Math.min(520, view.cssW - 32);
    var x = (view.cssW - w) * 0.5;
    var y = Math.max(28, view.cssH * 0.07);
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = 14;
    hud.fillStyle = BT_CRIM_HI;
    hud.font = '900 ' + Math.max(20, Math.min(28, view.cssH * 0.04)) + 'px sans-serif';
    hud.fillText('CHEATS', view.cssW * 0.5, y);
    hud.shadowBlur = 0;
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(10, Math.min(13, view.cssH * 0.018)) + 'px sans-serif';
    var lines = [
      '9: jump to minute 9 extreme horde',
      '0/R: restart   P: pause   M: menu   N: mute',
      'F2 or Ctrl+D: debug overlay   1/2/3: mutation card'
    ];
    for (var i = 0; i < lines.length; i++) hud.fillText(lines[i], view.cssW * 0.5, y + 36 + i * 20);
    var btnH = Math.max(40, Math.min(48, view.cssH * 0.065));
    var by = y + 106;
    rects.cheatMoney = drawButton(x, by, w, btnH, 'ADD 50000 BLOOD', true);
    rects.cheatMax   = drawButton(x, by + btnH + 10, w, btnH, 'MAX ALL TRACKS + WEAPONS', false);
    rects.cheatMin9  = drawButton(x, by + (btnH + 10) * 2, w, btnH, 'START MINUTE 9 HORDE', false);
    // LATE-GAME skip (Tim 2026-06-24 "test the LATER game"): jump the LIVE run clock to min 15 / 25 keeping the
    // current upgrades (skipToMinute, routed in input.js) - NOT a restart. Lets the cheat menu reach the late horde
    // the min-9 button can't. CHEATS_ENABLED-gated like the rest of this screen.
    rects.cheatMin15 = drawButton(x, by + (btnH + 10) * 3, w, btnH, 'SKIP TO MINUTE 15', false);
    rects.cheatMin25 = drawButton(x, by + (btnH + 10) * 4, w, btnH, 'SKIP TO MINUTE 25', false);
    rects.cheatReset = drawButton(x, by + (btnH + 10) * 5, w, btnH, 'WIPE REBUILD SAVE', false);
    rects.cheatBack  = drawButton(x, by + (btnH + 10) * 6, w, btnH, 'BACK', false);

    // ENEMY WAVES (dev): a grid of all 16 types - tap one to spawn a wave of ONLY that type (review it in
    // isolation). Each cell = the type's tint swatch (SPRITE_T_*) + its name; plus a NORMAL MIX button to go back
    // to the mixed spawn. Hit-rects -> rects.waveCells / rects.waveNormal (routed in input.js CHEAT branch).
    // 2 rows x 9 cols = 18 cells (>= the 17 enemy types incl Ravener) keeps it short enough for a phone.
    // NOTE: cols*rows MUST stay >= T_NAME.length or the highest-index types get no cell (the loop bound below).
    var gy0 = by + (btnH + 10) * 7 + 6;
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.fillStyle = BT_BONE_DIM;
    hud.font = '700 ' + Math.max(10, Math.min(13, view.cssH * 0.018)) + 'px sans-serif';
    hud.fillText('ENEMY WAVES (dev) - spawn a single-type wave', view.cssW * 0.5, gy0);
    var cols = 9, rows = 2;
    var gap = 5;
    var cellW = (w - gap * (cols - 1)) / cols;
    var cellH = Math.max(26, Math.min(38, view.cssH * 0.05));
    var gridTop = gy0 + 16;
    rects.waveCells = [];
    for (var t = 0; t < T_NAME.length && t < cols * rows; t++) {
      var cc = t % cols, rr = (t / cols) | 0;
      var cxw = x + cc * (cellW + gap);
      var cyw = gridTop + rr * (cellH + gap);
      // swatch fill = the type's tint (clamped to a visible range), dark border
      var sr = Math.max(0.10, Math.min(1, SPRITE_T_R[t] * 0.55 + 0.12));
      var sg = Math.max(0.05, Math.min(1, SPRITE_T_G[t] * 0.40 + 0.06));
      var sb = Math.max(0.05, Math.min(1, SPRITE_T_B[t] * 0.40 + 0.06));
      hud.fillStyle = 'rgb(' + ((sr * 255) | 0) + ',' + ((sg * 255) | 0) + ',' + ((sb * 255) | 0) + ')';
      hudRR(cxw, cyw, cellW, cellH, 5);
      hud.fill();
      hud.strokeStyle = '#5a3a32';
      hud.lineWidth = 1;
      hudRR(cxw, cyw, cellW, cellH, 5);
      hud.stroke();
      // name (truncated to fit the narrow cell)
      hud.fillStyle = '#fff';
      hud.font = '700 ' + Math.max(8, Math.min(11, cellH * 0.34)) + 'px sans-serif';
      var nm = T_NAME[t];
      if (nm.length > 9) nm = nm.slice(0, 8) + '…';
      hud.fillText(nm, cxw + cellW * 0.5, cyw + cellH * 0.5);
      rects.waveCells.push({ x: cxw, y: cyw, w: cellW, h: cellH, type: t });
    }
    var nmY = gridTop + rows * (cellH + gap) + 4;
    rects.waveNormal = drawButton(x, nmY, w, btnH, 'NORMAL MIX', false);
  }

  export function drawGameOver() {
    drawPanel(0.92);
    var w = Math.min(440, view.cssW - 36);
    var x = (view.cssW - w) * 0.5;
    var y = Math.max(52, view.cssH * 0.20);
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = 20;
    hud.fillStyle = BT_CRIM_HI;
    hud.font = '900 ' + Math.max(22, Math.min(38, view.cssH * 0.054)) + 'px sans-serif';
    hud.fillText('ENGINE STALLS', view.cssW * 0.5, y);
    hud.shadowBlur = 0;
    var timeSize = Math.max(30, Math.min(50, view.cssH * 0.07));
    hud.fillStyle = '#fff';
    hud.font = '700 ' + timeSize + 'px sans-serif';
    hud.fillText(fmtTime(state.t), view.cssW * 0.5, y + timeSize + 16);
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(11, Math.min(14, view.cssH * 0.018)) + 'px sans-serif';
    hud.fillText('SURVIVED', view.cssW * 0.5, y + timeSize + 36);
    hud.fillStyle = BT_BONE;
    hud.font = Math.max(11, Math.min(14, view.cssH * 0.018)) + 'px sans-serif';
    hud.fillText('LV ' + player.level + '   BLOOD +' + Math.floor(state.blood) + '   KILLS ' + state.kills, view.cssW * 0.5, y + timeSize + 56);
    if (econ.bestTime > 0) hud.fillText('BEST ' + fmtTime(econ.bestTime), view.cssW * 0.5, y + timeSize + 74);
    var btnH = Math.max(42, Math.min(50, view.cssH * 0.068));
    var gob = btnH + 10;
    var by0 = Math.min(view.cssH - gob * 3 - 20, y + timeSize + 106);
    rects.retry = drawButton(x, by0, w, btnH, 'RUN AGAIN', true);
    rects.forge = drawButton(x, by0 + gob, w, btnH - 2, 'BLOODFORGE', false);
    rects.menu  = drawButton(x, by0 + gob * 2, w, btnH - 4, 'MENU', false);
  }

  export function drawWin() {
    // Victory overlay: shown when the run survives 20:00 (state.mode === 'WIN'). Styled like drawGameOver
    // (crim-glow headline + run summary + a stack of full-width buttons) but celebratory. Lays out for the
    // tightest target (393x852) first - three buttons + a footer note must fit, so it anchors high and clamps
    // the button stack to the bottom like drawGameOver does.
    drawPanel(0.92);
    var w = Math.min(440, view.cssW - 36);
    var x = (view.cssW - w) * 0.5;
    var y = Math.max(48, view.cssH * 0.17);
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    // VICTORY headline (gold-tinted bone over the crim glow so it reads as a win, not a stall)
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = 22;
    hud.fillStyle = '#ffe6a6';
    hud.font = '900 ' + Math.max(26, Math.min(46, view.cssH * 0.062)) + 'px sans-serif';
    hud.fillText('VICTORY', view.cssW * 0.5, y);
    hud.shadowBlur = 0;
    // "MAP N CLEARED - 20:00 SURVIVED" subhead (state.map = the map just beaten)
    var subSize = Math.max(15, Math.min(26, view.cssH * 0.034));
    hud.fillStyle = '#fff';
    hud.font = '700 ' + subSize + 'px sans-serif';
    hud.fillText('MAP ' + state.map + ' CLEARED - 20:00', view.cssW * 0.5, y + subSize + 16);
    // run summary line
    hud.fillStyle = BT_BONE;
    hud.font = Math.max(11, Math.min(14, view.cssH * 0.018)) + 'px sans-serif';
    hud.fillText('LV ' + player.level + '   BLOOD +' + Math.floor(state.blood) + '   KILLS ' + state.kills, view.cssW * 0.5, y + subSize + 40);
    if (econ.bestTime > 0) {
      hud.fillStyle = BT_BONE_DIM;
      hud.fillText('BEST ' + fmtTime(econ.bestTime), view.cssW * 0.5, y + subSize + 60);
    }
    // three buttons, bottom-clamped (CONTINUE primary, then REGISTER INTEREST, then BUY ME A COFFEE)
    var btnH = Math.max(42, Math.min(50, view.cssH * 0.068));
    var gob = btnH + 10;
    var note = 14;   // footer note height reserved below the last button
    var by0 = Math.min(view.cssH - gob * 3 - note - 18, y + subSize + 90);
    rects.win_continue = drawButton(x, by0, w, btnH, 'CONTINUE', true);
    // REGISTER INTEREST flips to a confirmed "THANKS - NOTED" state once the localStorage flag is set.
    var interested = false;
    try { interested = !!localStorage.getItem(SAVE_INTEREST); } catch (err) {}
    rects.win_interest = drawButton(x, by0 + gob, w, btnH - 2, interested ? 'THANKS - NOTED' : 'REGISTER INTEREST', false);
    rects.win_coffee = drawButton(x, by0 + gob * 2, w, btnH - 4, 'MORE GAMES', false);   // -> COFFEE_URL (now the arcade; was a buymeacoffee placeholder)
    // footer note: CONTINUE advances to the next (harder, reskinned) map
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(9, Math.min(12, view.cssH * 0.016)) + 'px sans-serif';
    hud.fillText('CONTINUE -> Map ' + (state.map + 1) + ' (harder)', view.cssW * 0.5, by0 + gob * 3 + note * 0.5 - 2);
    hud.textAlign = 'start';
  }

  export function drawPause() {
    // PAUSE (Tim 2026-06-24): two clear choices only - RESUME or EXIT TO MAIN MENU. The old 3-button stack (incl
    // "BANK BLOOD + FORGE") was confusing; dropped. MAIN MENU banks the run first (input.js rects.quit handler)
    // so blood/meta progress is never lost on exit. Both buttons are large + centred for easy mobile tapping.
    drawPanel(0.78);
    var w = Math.min(400, view.cssW - 36);
    var x = (view.cssW - w) * 0.5;
    var y = view.cssH * 0.34;
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.fillStyle = '#fff';
    hud.font = '900 ' + Math.max(24, Math.min(36, view.cssH * 0.05)) + 'px sans-serif';
    hud.fillText('PAUSED', view.cssW * 0.5, y);
    var btnH = Math.max(46, Math.min(56, view.cssH * 0.075));
    var gob = btnH + 14;
    rects.resume = drawButton(x, y + 52, w, btnH, 'RESUME', true);
    rects.quit   = drawButton(x, y + 52 + gob, w, btnH, 'MAIN MENU', false);
    rects.pauseForge = null;   // removed from the pause screen (was BANK BLOOD + FORGE)
  }
