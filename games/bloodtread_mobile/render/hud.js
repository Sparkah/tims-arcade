// The 2D HUD overlay: in-run bars/meter/timer/banner + the debug overlay, plus the shared draw helpers
// (panel/button/rounded-rect/hit-test) and the virtual JOYSTICK + tank-preview used by the screens.
// renderHud is the per-frame 2D pass dispatcher: it routes to the ui/screens drawers for MENU/SHOP/CHEAT/
// GAMEOVER/PAUSE/LEVELUP and otherwise paints the live HUD. The BT_* palette lives here (shared with screens).
import { hud } from './context.js';
import {
  player, state, view, sprites, econ, hudImages,
  upgradePick, upgradeRect, ui, rects, input,
  enemies, bullets, motes, particles, decals, corpses, tracks, floats
} from '../state.js';
import { clamp, clampInt, fmtTime, TWO_PI } from '../lib/math.js';
import {
  NO_HUD, DEBUG, DIAG, COLLIDERS, OLD_SPRITES, GORE_FX, BREAK_ENV
} from '../flags.js';
import { upgradeNames, upgradeDesc } from '../data/upgrades.js';
import { WEAPON_TURRET_CELL } from '../data/weapons.js';
import { perf, ring, ringState } from '../core/time.js';
import { weaponAtlasTier, weaponRow } from '../game/meta.js';
import { desiredEnemies, currentLeechLevel } from '../systems/shared.js';
import { layoutUpgradeCards } from '../systems/progress.js';
import { drawMenu, drawShop, drawCheat, drawGameOver, drawPause, drawWin } from '../ui/screens.js';

// colour palette - mirrors the original Bloodtread COL object (shared with ui/screens.js)
export var BT_CRIM    = '#c41228';
export var BT_CRIM_HI = '#ff334a';
export var BT_BLOOD   = '#d8182e';   // bright ARTERIAL red (was dark maroon #6e0a16) so gore/blood reads vividly against the mechanical parts
export var BT_BLOOD_DK = '#8c0e1d';  // a darker arterial shade (was #3a060d near-black) - still clearly red, used as a gradient floor
export var BT_BONE    = '#d8cbb0';
export var BT_BONE_DIM = '#9b8f78';
export var BT_IRON    = '#3b342d';
export var BT_IRON_LO = '#241f1a';

  export function inRect(x, y, r) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  export function hudRR(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    hud.beginPath();
    hud.moveTo(x + r, y);
    hud.lineTo(x + w - r, y);
    hud.arcTo(x + w, y, x + w, y + r, r);
    hud.lineTo(x + w, y + h - r);
    hud.arcTo(x + w, y + h, x + w - r, y + h, r);
    hud.lineTo(x + r, y + h);
    hud.arcTo(x, y + h, x, y + h - r, r);
    hud.lineTo(x, y + r);
    hud.arcTo(x, y, x + r, y, r);
    hud.closePath();
  }

  export function drawPanel(alpha) {
    hud.fillStyle = 'rgba(8,5,4,' + alpha + ')';
    hud.fillRect(0, 0, view.cssW, view.cssH);
    var gd = hud.createLinearGradient(0, 0, 0, view.cssH);
    gd.addColorStop(0, 'rgba(8,3,3,0.55)');
    gd.addColorStop(0.4, 'rgba(8,3,3,0.0)');
    gd.addColorStop(1, 'rgba(8,3,3,0.88)');
    hud.fillStyle = gd;
    hud.fillRect(0, 0, view.cssW, view.cssH);
    // blood-mechanical corner ticks
    var tk = 20, mg = 4;
    hud.strokeStyle = 'rgba(196,18,40,0.34)';
    hud.lineWidth = 1.5;
    hud.beginPath();
    hud.moveTo(mg + tk, mg); hud.lineTo(mg, mg); hud.lineTo(mg, mg + tk);
    hud.moveTo(view.cssW - mg - tk, mg); hud.lineTo(view.cssW - mg, mg); hud.lineTo(view.cssW - mg, mg + tk);
    hud.moveTo(mg + tk, view.cssH - mg); hud.lineTo(mg, view.cssH - mg); hud.lineTo(mg, view.cssH - mg - tk);
    hud.moveTo(view.cssW - mg - tk, view.cssH - mg); hud.lineTo(view.cssW - mg, view.cssH - mg); hud.lineTo(view.cssW - mg, view.cssH - mg - tk);
    hud.stroke();
  }

  export function drawButton(x, y, w, h, label, primary) {
    var r = h * 0.5;
    var gr = hud.createLinearGradient(x, y, x, y + h);
    if (primary) {
      gr.addColorStop(0, BT_CRIM);
      gr.addColorStop(1, BT_BLOOD_DK);
    } else {
      gr.addColorStop(0, '#332a24');
      gr.addColorStop(1, '#1d1714');
    }
    hud.fillStyle = gr;
    hudRR(x, y, w, h, r);
    hud.fill();
    hud.strokeStyle = primary ? BT_CRIM_HI : BT_BONE_DIM;
    hud.lineWidth = primary ? 2 : 1.5;
    hudRR(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(1, r - 0.5));
    hud.stroke();
    hud.fillStyle = '#fff';
    hud.font = '700 ' + Math.max(13, Math.min(21, h * 0.40)) + 'px sans-serif';
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.fillText(label, x + w * 0.5, y + h * 0.5);
    return { x: x, y: y, w: w, h: h };
  }

  export function drawHudButton(x, y, w, h, label) {
    var r = h * 0.5;
    hud.fillStyle = 'rgba(10,5,4,0.80)';
    hudRR(x, y, w, h, r);
    hud.fill();
    hud.strokeStyle = 'rgba(196,18,40,0.50)';
    hud.lineWidth = 1.2;
    hudRR(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(1, r - 0.5));
    hud.stroke();
    hud.fillStyle = BT_BONE;
    hud.font = '700 ' + Math.max(10, Math.min(12, h * 0.38)) + 'px sans-serif';
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    hud.fillText(label, x + w * 0.5, y + h * 0.5);
    return { x: x, y: y, w: w, h: h };
  }

  export function drawJoystick() {
    if (!input.useJoystick || state.mode !== 'PLAYING' || state.paused) return;
    var bx = input.joyActive ? input.joyBaseX : Math.max(66, view.cssW * 0.16);
    var by = input.joyActive ? input.joyBaseY : Math.max(88, view.cssH - 88);
    var kx = input.joyActive ? input.joyKnobX : bx;
    var ky = input.joyActive ? input.joyKnobY : by;
    hud.save();
    // outer ring - subtle when idle, visible when active
    hud.globalAlpha = input.joyActive ? 0.68 : 0.19;
    hud.lineWidth = input.joyActive ? 2 : 1;
    hud.strokeStyle = input.joyActive ? BT_CRIM_HI : BT_BONE_DIM;
    hud.fillStyle = input.joyActive ? 'rgba(18,6,5,0.34)' : 'rgba(8,4,3,0.16)';
    hud.beginPath();
    hud.arc(bx, by, input.joyRadius, 0, TWO_PI);
    hud.fill();
    hud.stroke();
    // cross-hair tick lines on idle ring
    if (!input.joyActive) {
      hud.lineWidth = 0.7;
      var t = input.joyRadius * 0.32;
      hud.beginPath();
      hud.moveTo(bx - t, by); hud.lineTo(bx + t, by);
      hud.moveTo(bx, by - t); hud.lineTo(bx, by + t);
      hud.stroke();
    }
    // knob
    var knobR = Math.max(14, input.joyRadius * 0.28);
    hud.globalAlpha = input.joyActive ? 0.92 : 0.38;
    if (input.joyActive) {
      var kg = hud.createRadialGradient(kx - knobR * 0.25, ky - knobR * 0.25, 0, kx, ky, knobR);
      kg.addColorStop(0, BT_CRIM_HI);
      kg.addColorStop(1, BT_BLOOD);
      hud.fillStyle = kg;
    } else {
      hud.fillStyle = BT_BLOOD;
    }
    hud.strokeStyle = input.joyActive ? 'rgba(255,180,160,0.70)' : 'rgba(150,60,50,0.36)';
    hud.lineWidth = 1;
    hud.beginPath();
    hud.arc(kx, ky, knobR, 0, TWO_PI);
    hud.fill();
    hud.stroke();
    hud.restore();
  }

  export function drawHudTankPreview(cx, cy, size) {
    var layers = [
      ['lp_treads', econ.tankTreads],
      ['lp_armor', econ.tankArmor],
      ['lp_thirst', econ.tankThirst],
      ['lp_core', econ.tankCore]
    ];
    var drawn = false;
    hud.save();
    hud.imageSmoothingEnabled = false;
    for (var i = 0; i < layers.length; i++) {
      var img = sprites.images[layers[i][0]];
      if (!img || !img.complete || !img.naturalWidth) continue;
      var tier = clampInt(layers[i][1], 0, 6);
      var cell = Math.max(1, Math.floor(img.naturalHeight || 64));
      hud.drawImage(img, tier * cell, 0, cell, cell, Math.round(cx - size * 0.5), Math.round(cy - size * 0.5), Math.round(size), Math.round(size));
      drawn = true;
    }
    var weaponImg = sprites.images.weapon_turrets;
    if (weaponImg && weaponImg.complete && weaponImg.naturalWidth) {
      var wtSize = Math.round(size * (1.05 - weaponAtlasTier(econ.equipWeapon) * 0.04));   // Tim 2026-06-24 r3: the atlas cell content is now scaled to 0.80 (a MARGIN so the long-barrel gun is never CROPPED at the cell edge). Cell render bumped 1.25x to restore the drawn size: tier0 1.05*size -> tier5 0.85*size (counter-scaled vs the art's growth). Net drawn gun ~0.84*size (tier0) down to ~0.68*size (tier5) - fully visible, no edge crop, fits the box.
      hud.drawImage(weaponImg, weaponAtlasTier(econ.equipWeapon) * WEAPON_TURRET_CELL, weaponRow(econ.equipWeapon) * WEAPON_TURRET_CELL, WEAPON_TURRET_CELL, WEAPON_TURRET_CELL, Math.round(cx - wtSize * 0.5), Math.round(cy - wtSize * 0.5), wtSize, wtSize);
      drawn = true;
    } else {
      var cannonImg = sprites.images.lp_cannon;
      if (cannonImg && cannonImg.complete && cannonImg.naturalWidth) {
        var cannonCell = Math.max(1, Math.floor(cannonImg.naturalHeight || 64));
        hud.drawImage(cannonImg, econ.tankCannon * cannonCell, 0, cannonCell, cannonCell, Math.round(cx - size * 0.5), Math.round(cy - size * 0.5), Math.round(size), Math.round(size));
        drawn = true;
      }
    }
    hud.restore();
    if (drawn) return;
    hud.fillStyle = '#120907';
    hud.fillRect(cx - size * 0.38, cy - size * 0.26, size * 0.76, size * 0.52);
    hud.fillStyle = '#6d4c39';
    hud.fillRect(cx - size * 0.42, cy - size * 0.16, size * 0.84, size * 0.1);
    hud.fillRect(cx - size * 0.42, cy + size * 0.08, size * 0.84, size * 0.1);
    hud.fillStyle = '#9b2d25';
    hud.fillRect(cx - size * 0.12, cy - size * 0.08, size * 0.24, size * 0.16);
    hud.fillStyle = '#d9b17a';
    hud.fillRect(cx + size * 0.02, cy - size * 0.035, size * 0.44, size * 0.07);
  }

  // Blood vignette: the original's "alive/gory" atmosphere - a cached radial blood-vignette + an HP-driven
  // red darkening that swells as HP drops + a hurt edge flash + a madness red tint that pulses with the swarm.
  // One cached-gradient fillRect per frame on the HUD canvas - negligible, no per-entity cost. Ported from
  // the sibling _art build. Called every live-HUD frame (drives "the original death feel" as you take damage).
  var _vigGrad = null, _vigKey = '';
  export function bloodVignette() {
    var key = (view.cssW | 0) + 'x' + (view.cssH | 0);
    if (_vigKey !== key || !_vigGrad) {
      var g = hud.createRadialGradient(view.cssW * 0.5, view.cssH * 0.52, Math.min(view.cssW, view.cssH) * 0.26,
                                       view.cssW * 0.5, view.cssH * 0.52, Math.max(view.cssW, view.cssH) * 0.72);
      g.addColorStop(0, 'rgba(45,3,3,0)');
      g.addColorStop(0.6, 'rgba(28,2,2,0.30)');
      g.addColorStop(1, 'rgba(6,0,0,0.86)');
      _vigGrad = g; _vigKey = key;
    }
    hud.globalAlpha = 1; hud.fillStyle = _vigGrad; hud.fillRect(0, 0, view.cssW, view.cssH);
    // HP-driven darkening (rgba(40-130,0,8,0.16-0.66) as HP drops). This is a STEADY (non-blinking) red
    // danger swell, kept always-on: it IS the "low hp" red signal and it does not pulse, so it isn't the
    // distracting red BLINK Tim asked to gate (Tim: "only add red blinking colors when bloodrush or low hp").
    var hpf = player.maxHp > 0 ? clamp(player.hp / player.maxHp, 0, 1) : 1, dmg = 1 - hpf;
    if (dmg > 0.02) {
      var rr = (40 + 90 * dmg) | 0, da = 0.16 + 0.5 * dmg;
      var hg = hud.createRadialGradient(view.cssW * 0.5, view.cssH * 0.5, Math.min(view.cssW, view.cssH) * 0.3, view.cssW * 0.5, view.cssH * 0.5, Math.max(view.cssW, view.cssH) * 0.62);
      hg.addColorStop(0, 'rgba(' + rr + ',0,8,0)'); hg.addColorStop(1, 'rgba(' + rr + ',0,8,' + da.toFixed(2) + ')');
      hud.fillStyle = hg; hud.fillRect(0, 0, view.cssW, view.cssH);
    }
    // TRANSIENT RED BLINKS REMOVED (Tim 2026-06-25 "only the low-hp red border should appear, nothing else"):
    // the on-hit hurt EDGE FLASH and the swarm "madness" PULSE (a sin-driven full-screen tint) were the
    // intermittent screen blinks Tim disliked. The steady HP-driven red darkening above is the ONLY low-hp
    // signal now - non-blinking (alpha tracks HP, no time pulse), exactly the "low hp red border" he wants kept.
  }

  // DEATH WRECK overlay (drawn on the HUD over the stopped chassis during the ~1.35s death sequence): blood
  // pool, broken hull plates rotated to the last heading, tread stubs, the RUPTURED jagged heart with its weak
  // dying glow. Ported 1:1 from the sibling _art build (OLD drawWreck). cx/cy = screen centre (camera follows).
  export function drawWreck(g, cx, cy) {
    var U = 1.85, hb = state.t * 4.0;
    g.globalAlpha = 0.5; g.fillStyle = BT_BLOOD;   // wreck blood pool: bright arterial red via BT_BLOOD (was dark maroon #36060c)
    g.beginPath(); g.ellipse(cx, cy + 4 * U, 52 * U, 36 * U, 0, 0, TWO_PI); g.fill(); g.globalAlpha = 1;
    g.save(); g.translate(cx, cy); g.rotate(player.hull + Math.PI / 2);
    g.fillStyle = '#201a22';
    g.beginPath(); g.moveTo(-26 * U, -10 * U); g.lineTo(-12 * U, -22 * U); g.lineTo(-8 * U, -2 * U); g.lineTo(-22 * U, 10 * U); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(24 * U, -8 * U); g.lineTo(12 * U, -20 * U); g.lineTo(9 * U, 4 * U); g.lineTo(22 * U, 12 * U); g.closePath(); g.fill();
    g.fillStyle = '#2c2630'; g.fillRect(-8 * U, 14 * U, 16 * U, 9 * U);
    g.fillStyle = '#181318'; g.fillRect(-30 * U, -16 * U, 7 * U, 30 * U); g.fillRect(23 * U, -16 * U, 7 * U, 30 * U);
    g.restore();
    var beat = 1 + Math.sin(hb * 1.3) * 0.05, hr = 13 * U * beat;
    g.fillStyle = '#2a0408'; g.beginPath(); g.arc(cx, cy, hr * 1.4, 0, TWO_PI); g.fill();
    g.fillStyle = '#6a0c14'; g.beginPath();
    for (var j = 0; j < 9; j++) { var ja = j / 9 * TWO_PI, jr = hr * (0.7 + (j % 2 ? 0.5 : 0.15)); var jx = cx + Math.cos(ja) * jr, jy = cy + Math.sin(ja) * jr; if (j === 0) g.moveTo(jx, jy); else g.lineTo(jx, jy); }
    g.closePath(); g.fill();
    g.fillStyle = '#9a1020'; g.beginPath(); g.arc(cx - hr * 0.2, cy - hr * 0.2, hr * 0.5, 0, TWO_PI); g.fill();
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.22 + 0.18 * Math.sin(hb * 1.3);
    var gd = g.createRadialGradient(cx, cy, 0, cx, cy, hr * 2.2);
    gd.addColorStop(0, '#ff2a40'); gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gd; g.beginPath(); g.arc(cx, cy, hr * 2.2, 0, TWO_PI); g.fill();
    g.restore(); g.globalAlpha = 1;
  }

  // RESURRECT prompt (once-per-session rewarded-ad revive): shown over the wreck while state.revivePhase ===
  // 'prompt' (after the ~3.5s bleed-out, before GAMEOVER). A "RESURRECT - WATCH AD" primary button + a draining
  // countdown bar (state.reviveT / reviveMax) that runs to GAMEOVER if untaken. Anchored BELOW the wreck (screen
  // centre) so the exposed-heart/wreck stays visible above it. The hit-rect is stored on rects.revive; the click
  // is routed in input.js handleUiPointer (revivePhase==='prompt' branch -> requestRewardedAd -> beginResurrect).
  function drawResurrectPrompt() {
    var cx = view.cssW * 0.5;
    var w = Math.min(360, view.cssW - 48);
    var x = (view.cssW - w) * 0.5;
    var btnH = Math.max(46, Math.min(58, view.cssH * 0.075));
    // sit the button well below the wreck (which is at screen centre)
    var by = Math.min(view.cssH - btnH - 64, view.cssH * 0.5 + 96);
    // headline above the button
    hud.textAlign = 'center'; hud.textBaseline = 'middle';
    hud.shadowColor = BT_CRIM; hud.shadowBlur = 16;
    hud.fillStyle = BT_CRIM_HI;
    hud.font = '900 ' + Math.max(20, Math.min(32, view.cssH * 0.044)) + 'px sans-serif';
    hud.fillText('LAST BLOOD', cx, by - 46);
    hud.shadowBlur = 0;
    hud.fillStyle = BT_BONE_DIM;
    hud.font = Math.max(11, Math.min(14, view.cssH * 0.019)) + 'px sans-serif';
    hud.fillText('one revive this run', cx, by - 22);
    // the button (primary crim) - reuse the shared helper so it matches every other button
    rects.revive = drawButton(x, by, w, btnH, 'RESURRECT  -  WATCH AD', true);
    // draining countdown bar under the button (reviveT / reviveMax)
    var frac = state.reviveMax > 0 ? Math.max(0, state.reviveT / state.reviveMax) : 0;
    var cbY = by + btnH + 10, cbH = 6;
    hud.fillStyle = 'rgba(0,0,0,0.5)';
    hudRR(x, cbY, w, cbH, cbH * 0.5); hud.fill();
    hud.fillStyle = BT_CRIM;
    hudRR(x, cbY, Math.max(0, w * frac), cbH, cbH * 0.5); hud.fill();
    hud.textAlign = 'start';
  }

  export function renderHud() {
    if (NO_HUD) return;
    var t0 = performance.now();
    hud.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    hud.clearRect(0, 0, view.cssW, view.cssH);
    hud.globalAlpha = 1;
    rects.hudPause = null;
    rects.hudMenu = null;
    rects.pauseForge = null;
    if (state.mode === 'MENU') {
      drawMenu();
      perf.hudMs = performance.now() - t0;
      return;
    }
    if (state.mode === 'SHOP') {
      drawShop();
      perf.hudMs = performance.now() - t0;
      return;
    }
    if (state.mode === 'CHEAT') {
      drawCheat();
      perf.hudMs = performance.now() - t0;
      return;
    }
    if (state.mode === 'GAMEOVER') {
      drawGameOver();
      perf.hudMs = performance.now() - t0;
      return;
    }
    if (state.mode === 'WIN') {
      drawWin();
      perf.hudMs = performance.now() - t0;
      return;
    }
    if (state.paused) {
      drawPause();
      perf.hudMs = performance.now() - t0;
      return;
    }
    bloodVignette();   // gory blood atmosphere over the WebGL world; reddens as HP drops ("the original death feel")
    // FULL-SCREEN FLUSHES REMOVED (Tim 2026-06-25 "screen blinking time to time that I don't like - only the
    // low-hp red border should appear, nothing else"): the BLOODLETTING red wash (player.unleashFlash) AND the
    // HEAL green wash (player.healGlow) used to paint the WHOLE screen on each unleash / healing kill - those
    // were the intermittent screen blinks. The unleash still reads via the banner + camera punch + the local
    // tank rings (render/world.js addTankFeelInstances); the heal still shows the "+N" float + green core glow.
    // The ONLY full-screen tint now is the low-hp red vignette in bloodVignette() above.
    // DEATH WRECK: replaced 2026-06-24 (Tim) by the world-space BLEED-OUT (render/world.js queueTankHeartSprite + systems/player.js destroyTank): an exposed heart IMAGE that STOPS beating + blood spill + metal scraps + smoke. The old HUD drawWreck() is no longer called - its procedural heart kept BEATING (contradicts the heart-stop) and, on the HUD layer, painted OVER the world heart. bloodVignette() above still supplies the red death atmosphere. (drawWreck retained above as currently-dead code.)
    // top-right buttons are reserved first so bars never run underneath them.
    var hbtnW = Math.max(54, Math.min(74, view.cssW * 0.14));
    var hbtnH = Math.max(28, Math.min(34, view.cssH * 0.044));
    var hbtnX = view.cssW - hbtnW - 10;
    var hbtnY = 10;

    // pill HP bar
    var hpad = 14, hbH = Math.max(10, Math.min(14, view.cssH * 0.017));
    var hbW = Math.max(150, hbtnX - hpad - 12);
    hud.fillStyle = 'rgba(0,0,0,0.55)';
    hudRR(hpad, hpad, hbW, hbH, hbH * 0.5); hud.fill();
    var hpf = clamp(player.hp / player.maxHp, 0, 1);
    var hpCrit = player.hp < player.maxHp * 0.28;
    var hpG = hud.createLinearGradient(hpad, 0, hpad + hbW, 0);
    if (hpCrit) { hpG.addColorStop(0, '#a03a00'); hpG.addColorStop(1, '#ffd050'); }
    else        { hpG.addColorStop(0, BT_BLOOD);  hpG.addColorStop(1, BT_CRIM_HI); }
    hud.fillStyle = hpG;
    hudRR(hpad, hpad, Math.max(0, hbW * hpf), hbH, hbH * 0.5); hud.fill();
    // HP text centred in bar
    hud.fillStyle = '#fff';
    hud.font = '700 ' + Math.max(8, Math.min(10, hbH * 0.75)) + 'px sans-serif';
    hud.textAlign = 'center'; hud.textBaseline = 'middle';
    hud.fillText(Math.ceil(player.hp) + ' / ' + Math.round(player.maxHp), hpad + hbW * 0.5, hpad + hbH * 0.5);
    // XP (blood) bar below
    var xbY = hpad + hbH + 4, xbH = Math.max(5, Math.min(8, view.cssH * 0.010));
    hud.fillStyle = 'rgba(0,0,0,0.5)';
    hudRR(hpad, xbY, hbW, xbH, xbH * 0.5); hud.fill();
    var xf = clamp(player.xp / player.xpNext, 0, 1);
    hud.fillStyle = BT_BLOOD;
    hudRR(hpad, xbY, Math.max(0, hbW * xf), xbH, xbH * 0.5); hud.fill();
    // level / timer / kills row
    var txtY = xbY + xbH + 14;
    hud.font = 'bold ' + Math.max(11, Math.min(14, view.cssH * 0.018)) + 'px sans-serif';
    hud.textBaseline = 'top';
    hud.fillStyle = BT_BONE; hud.textAlign = 'left';
    hud.fillText('LV ' + player.level + '  K' + state.kills, hpad, txtY);
    hud.fillStyle = '#fff'; hud.textAlign = 'center';
    hud.fillText(fmtTime(state.t), view.cssW * 0.5, txtY);
    hud.textBaseline = 'middle';

    // HUD buttons (top-right corner)
    rects.hudPause = drawHudButton(hbtnX, hbtnY, hbtnW, hbtnH, 'PAUSE');
    // in-game MENU button REMOVED (Tim 2026-06-24): the pause screen's MAIN MENU now covers exit-to-menu, so the in-run HUD only needs PAUSE. rects.hudMenu stays null (inited in renderHud), so the input handler can't fire.

    // blast meter ring (bottom-centre, above joystick dead-zone)
    var bmR = Math.max(18, Math.min(24, view.cssH * 0.032));
    var bmX = view.cssW * 0.5, bmY = view.cssH - bmR - 16;
    hud.lineWidth = Math.max(3, bmR * 0.22);
    hud.lineCap = 'round';
    hud.strokeStyle = 'rgba(255,255,255,0.10)';
    hud.beginPath(); hud.arc(bmX, bmY, bmR, 0, TWO_PI); hud.stroke();
    var meter = clamp((player.meter || 0) / 100, 0, 1);
    if (meter > 0.01) {
      hud.strokeStyle = player.unleash > 0 ? BT_CRIM_HI : BT_BLOOD;
      hud.beginPath(); hud.arc(bmX, bmY, bmR, -Math.PI * 0.5, -Math.PI * 0.5 + TWO_PI * meter); hud.stroke();
    }
    hud.lineCap = 'butt'; hud.lineWidth = 1;

    drawJoystick();

    // floating green "+N" heal numbers, rising above the tank at screen centre (OLD green heal float)
    if (floats.count > 0) {
      hud.textAlign = 'center'; hud.textBaseline = 'middle';
      hud.font = '700 ' + Math.max(13, Math.min(22, view.cssH * 0.026)) + 'px sans-serif';
      var fcx = view.cssW * 0.5, fcy = view.cssH * 0.5 - 38;
      for (var fi = 0; fi < floats.count; fi++) {
        var fa = clamp(floats.life[fi], 0, 1);
        hud.globalAlpha = fa;
        hud.fillStyle = '#79f59a';   // bright heal green (the glow/veins use #39d06a)
        hud.fillText('+' + floats.amt[fi], fcx, fcy - floats.y[fi]);
      }
      hud.globalAlpha = 1;
      hud.textAlign = 'start'; hud.textBaseline = 'middle';
    }

    if (state.bannerT > 0 && state.banner) {
      var ba = clamp(state.bannerT, 0, 1);
      hud.globalAlpha = ba;
      hud.shadowColor = BT_CRIM;
      hud.shadowBlur = 12;
      hud.font = '700 ' + Math.max(18, Math.min(26, view.cssH * 0.034)) + 'px sans-serif';
      hud.textAlign = 'center'; hud.textBaseline = 'middle';
      hud.fillStyle = BT_CRIM_HI;
      hud.fillText(state.banner, view.cssW * 0.5, Math.max(80, view.cssH * 0.18));
      hud.shadowBlur = 0;
      hud.textAlign = 'start';
      hud.globalAlpha = 1;
    }

    if (state.mode === 'LEVELUP') drawUpgradeDraft();

    if (state.revivePhase === 'prompt') drawResurrectPrompt();   // once-per-session RESURRECT - WATCH AD button over the wreck

    if (DEBUG) {
      var x = 14, y = view.cssH - 268;
      hud.fillStyle = 'rgba(0,0,0,0.46)';
      hud.fillRect(x, y, 590, 254);
      hud.fillStyle = '#bfe7d2';
      hud.font = '11px ui-monospace, monospace';
      var lines = [
        'fps ' + perf.fps.toFixed(1) + ' frame ' + perf.frameMs.toFixed(2) + ' raf ' + perf.rafGap.toFixed(1) + ' worst ' + perf.worstMs.toFixed(1),
        'update ' + perf.updateAvg.toFixed(2) + ' / ' + perf.updateWorst.toFixed(1) + ' render ' + perf.renderAvg.toFixed(2) + ' / ' + perf.renderWorst.toFixed(1) + ' hud ' + perf.hudMs.toFixed(2),
        'inst ' + perf.instances + ' detail ' + perf.creatureDetails + ' E ' + enemies.count + ' B ' + bullets.count + ' M ' + motes.count + '/' + perf.moteInst + ' merge ' + perf.moteMerges + ' P ' + particles.count + ' D ' + decals.count,
        'sprites ' + (OLD_SPRITES ? (sprites.ready ? 'old' : 'loading ' + sprites.loaded + '/' + sprites.pending) : 'off') + ' draws ' + perf.spriteDraws + ' anim ' + perf.spriteAnimated + ' static ' + perf.spriteStatic + ' culled ' + perf.spriteCulled,
        'old env ' + perf.envSprites + ' corpses ' + corpses.count + '/' + perf.corpseSprites + ' tank ' + perf.tankSprites + ' tracks ' + tracks.count,
        'colliders ' + (COLLIDERS ? 'on' : 'off') + ' ms ' + perf.colliderMs.toFixed(2) + ' pairs ' + perf.colliderPairs + ' contact ' + perf.colliderContacts + ' push ' + perf.colliderPush.toFixed(1),
        'veins ' + perf.veins + '/' + perf.veinInst + ' leeches ' + perf.leeches + '/' + perf.leechInst + ' tankfx ' + perf.tankFeelInst + ' ms ' + perf.leechMs.toFixed(2) + ' lvl ' + currentLeechLevel(),
        'gore ' + (GORE_FX ? 'on' : 'off') + ' pieces ' + perf.gorePieces + '/' + perf.goreInst + ' splats ' + perf.splats + '/' + perf.splatInst + ' ms ' + perf.goreMs.toFixed(2),
        'fx booms ' + perf.booms + '/' + perf.boomInst + ' bubbles ' + perf.bubbles + '/' + perf.bubbleInst + ' rocks ' + (BREAK_ENV ? 'on' : 'off') + ' vis ' + perf.envRocks + ' hit ' + perf.envContacts + ' enemy ' + perf.envEnemyContacts + ' broken ' + perf.envBroken,
        'econ dmg ' + player.dmg.toFixed(1) + ' fire ' + player.fireRate.toFixed(1) + ' barrels ' + player.barrels + ' thirst ' + player.thirst + ' lash ' + player.lashLvl,
        'target ' + desiredEnemies() + ' hp ' + Math.round(player.hp) + '/' + Math.round(player.maxHp),
        'LoAF ' + perf.loafs + ' worst ' + perf.loafWorst.toFixed(1) + ' ' + perf.scripts,
        'diag ' + (DIAG || 'normal') + '  9=min9  0=reset  P=pause'
      ];
      for (var i = 0; i < lines.length; i++) hud.fillText(lines[i], x + 10, y + 18 + i * 16);
      hud.strokeStyle = '#5b372e';
      hud.beginPath();
      for (var r = 0; r < ring.length; r++) {
        var idx = (ringState.i + r) % ring.length;
        var v = Math.min(70, ring[idx]);
        var px0 = x + 10 + r * 2.8;
        var py0 = y + 246 - v * 0.72;
        if (r === 0) hud.moveTo(px0, py0); else hud.lineTo(px0, py0);
      }
      hud.stroke();
    }
    perf.hudMs = performance.now() - t0;
  }

  export function drawUpgradeDraft() {
    layoutUpgradeCards();
    hud.globalAlpha = 1;
    hud.fillStyle = 'rgba(8,5,4,0.74)';
    hud.fillRect(0, 0, view.cssW, view.cssH);
    hud.textAlign = 'center';
    hud.textBaseline = 'middle';
    // title with crim glow
    hud.shadowColor = BT_CRIM;
    hud.shadowBlur = 14;
    hud.fillStyle = BT_CRIM_HI;
    hud.font = '700 ' + Math.max(18, Math.min(26, view.cssH * 0.036)) + 'px sans-serif';
    hud.fillText('BLOOD MUTATION', view.cssW * 0.5, Math.max(52, upgradeRect[1] - 38));
    hud.shadowBlur = 0;
    hud.font = Math.max(10, Math.min(13, view.cssH * 0.018)) + 'px sans-serif';
    hud.fillStyle = BT_BONE_DIM;
    hud.fillText('Choose 1 / 2 / 3', view.cssW * 0.5, Math.max(70, upgradeRect[1] - 18));

    for (var i = 0; i < 3; i++) {
      var k = i * 4;
      var cx = upgradeRect[k], cy = upgradeRect[k + 1], cw = upgradeRect[k + 2], ch = upgradeRect[k + 3];
      var u = upgradePick[i];
      var hot = i === ui.upgradeHover;
      // card background: gradient
      var cg = hud.createLinearGradient(cx, cy, cx, cy + ch);
      cg.addColorStop(0, hot ? '#2a211c' : '#1e1510');
      cg.addColorStop(1, hot ? '#17110e' : '#120c09');
      hud.fillStyle = cg;
      hudRR(cx, cy, cw, ch, 12);
      hud.fill();
      // crim stroke (stronger when hot)
      hud.strokeStyle = hot ? BT_CRIM_HI : BT_CRIM;
      hud.lineWidth = hot ? 2.2 : 1.5;
      hudRR(cx + 0.5, cy + 0.5, cw - 1, ch - 1, 11.5);
      hud.stroke();
      // icon medallion
      var mr = Math.max(16, Math.min(22, ch * 0.28));
      var mx = cx + mr + 14, my = cy + ch * 0.5;
      hud.fillStyle = '#0d0807';
      hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.fill();
      var icon = hudImages['u' + u];
      if (icon && icon.complete && icon.naturalWidth) {
        hud.save();
        hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.clip();
        hud.drawImage(icon, mx - mr, my - mr, mr * 2, mr * 2);
        hud.restore();
      } else {
        hud.fillStyle = BT_CRIM_HI;
        hud.shadowColor = BT_CRIM; hud.shadowBlur = 8;
        hud.beginPath(); hud.arc(mx, my, mr * 0.52, 0, TWO_PI); hud.fill();
        hud.shadowBlur = 0;
      }
      hud.strokeStyle = BT_CRIM; hud.lineWidth = 1.4;
      hud.beginPath(); hud.arc(mx, my, mr, 0, TWO_PI); hud.stroke();
      // key number badge
      hud.fillStyle = '#fff';
      hud.font = '700 ' + Math.max(8, Math.min(10, mr * 0.5)) + 'px sans-serif';
      hud.textAlign = 'center'; hud.textBaseline = 'top';
      hud.fillText(String(i + 1), mx, cy + 6);
      // card text
      hud.textAlign = 'left'; hud.textBaseline = 'middle';
      var tx = cx + mr * 2 + 22;
      hud.fillStyle = '#fff';
      hud.font = '700 ' + Math.max(13, Math.min(18, ch * 0.23)) + 'px sans-serif';
      hud.fillText(upgradeNames[u], tx, cy + ch * 0.36);
      hud.fillStyle = BT_BONE_DIM;
      hud.font = Math.max(10, Math.min(12, ch * 0.16)) + 'px sans-serif';
      hud.fillText(upgradeDesc[u], tx, cy + ch * 0.62);
      hud.fillStyle = BT_IRON;
      hud.font = Math.max(9, Math.min(11, ch * 0.14)) + 'px sans-serif';
      hud.fillText('LV ' + player.level + ' -> ' + (player.level + 1), tx, cy + ch - 14);
      hud.textAlign = 'center'; hud.textBaseline = 'middle';
    }
    hud.textAlign = 'start';
    hud.lineWidth = 1;
  }
