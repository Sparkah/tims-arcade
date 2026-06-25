// Full-screen overlays: MENU (hero cover + title + BloodForge entry), SHOP (BloodForge: weapons + tracks),
// CHEAT, GAMEOVER, PAUSE. Each rebuilds its hit-rects on the shared `rects` object every draw. Shares the
// panel/button/rounded-rect/tank-preview helpers + the BT_* palette with render/hud.js (function-only cycle).
import { state, player, econ, META, view, hudImages, SAVE_INTEREST } from '../state.js';
import { fmtTime } from '../lib/math.js';
import { TWO_PI } from '../lib/math.js';
import { WEAPONS } from '../data/weapons.js';
import { T_NAME, SPRITE_T_R, SPRITE_T_G, SPRITE_T_B } from '../data/enemies.js';   // for the DEV enemy-wave grid (name + per-type tint swatch)
import { MAXTIER, TRACKS } from '../data/upgrades.js';
import { weaponName, trackCost, trackEffect } from '../game/meta.js';
import { rects } from '../state.js';
import {
  BT_CRIM, BT_CRIM_HI, BT_BLOOD, BT_BLOOD_DK, BT_BONE, BT_BONE_DIM, BT_IRON, BT_IRON_LO,
  drawPanel, drawButton, drawHudTankPreview, hudRR
} from '../render/hud.js';
import { hud } from '../render/context.js';
import { CHEATS_ENABLED } from '../flags.js';

  export function drawMenu() {
    var hero = hudImages.hero;
    hud.fillStyle = '#050302';
    hud.fillRect(0, 0, view.cssW, view.cssH);
    if (hero && hero.complete && hero.naturalWidth) {
      var sc = Math.max(view.cssW / hero.naturalWidth, view.cssH / hero.naturalHeight);
      var dw = hero.naturalWidth * sc;
      var dh = hero.naturalHeight * sc;
      hud.globalAlpha = 0.48;
      hud.drawImage(hero, (view.cssW - dw) * 0.5, (view.cssH - dh) * 0.5, dw, dh);
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
    // buttons below title
    var by = Math.min(view.cssH - 185, titleY + view.cssH * 0.15);
    var btnH = Math.max(44, Math.min(54, view.cssH * 0.072));
    rects.play  = drawButton(x, by, w, btnH, 'START RUN', true);
    rects.forge = drawButton(x, by + btnH + 12, w, btnH - 4, 'BLOODFORGE   ' + Math.floor(econ.totalBank), false);
    // weapon + track info
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(10, Math.min(13, view.cssH * 0.018)) + 'px sans-serif';
    var infoY = by + btnH * 2 + 22;
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
