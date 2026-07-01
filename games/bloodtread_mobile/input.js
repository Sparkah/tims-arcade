// Input + viewport: keyboard bitset + pointer/joystick handlers + UI hit routing (handleUiPointer) +
// the virtual joystick math, and resize() (canvas sizing + camera recompute). initInput() registers all
// the DOM listeners (was mid-IIFE; now an explicit boot step main calls). Mutates the input singleton;
// the player system reads it. Routes UI taps to screens/economy/level-up. -> game/session, progress, audio.
import { state, player, view, input, ui, econ, rects, COFFEE_URL, SAVE_INTEREST } from './state.js';
import { qs, DEBUG, setDebug, START_MIN, TOUCH_DEVICE, CHEATS_ENABLED, TG_MODE, STORE_TEST } from './flags.js';
import { adFree } from './tg.js?v=bm1';   // Telegram ad-free entitlement (live binding); skips the revive ad when bought
import { BASE_DPR } from './config.js';
import { clamp } from './lib/math.js';
import { glCanvas, hudCanvas } from './render/context.js';
import { updateCameraMetrics } from './render/camera.js';
import { inRect } from './render/hud.js';
import { unlockAudio, toggleMute, handleVisibility, playTone } from './audio.js';
import { startRun, continueToNextMap, skipToMinute, resetGame, cheatMoney, cheatMaxAll, cheatReset } from './game/session.js';
import { spawnEnemyWave } from './systems/enemies.js';   // DEV enemy-wave picker (CHEATS_ENABLED, cheat screen)
import { buyTrack, buyOrEquipWeapon, chooseUpgrade, cardAt, bankRun } from './systems/progress.js';
import { openCache, openPaidBox, openBountyBox, grantMythic, mergeUpSlot, dropGear, setSkin, toggleRelic, forgeRelicFromShards } from './systems/loot.js';   // GORE VAULT (gacha) + GEAR + STORE actions
import { setReveal, setMergeAnim, mergeAnimBusy } from './ui/screens.js?v=bm1';   // REVEAL overlay + GEAR merge animation
import { GEAR_MERGE } from './data/loot.js';   // gear merge size (5 -> 1)
import { beginResurrect } from './update.js';
import { trackAnalyticsVictoryButton } from './analytics.js';

  // REWARDED-AD shim for the RESURRECT button. The _refactor build is standalone (index.html loads only
  // GameAnalytics + main.js - NO gf-lib, NO Yandex/CrazyGames ad SDK), so there is NO rewarded-ad helper
  // reachable here. We probe for a real SDK at call-time and use it if a future build wires one in; otherwise
  // we STUB the reward as immediately granted (this is an experiment - a stub revive is fine; the real SDK
  // wires in at ship-time). onReward fires exactly once on a granted reward; onCancel (optional) on dismiss/no-fill.
  function requestRewardedAd(onReward, onCancel) {
    // Ad-free entitlement (Telegram 'Remove Ads' / Bloodgod): grant the revive instantly, no ad.
    if (adFree) { onReward(); return; }
    // Telegram Mini App: handled ENTIRELY here, OUTSIDE the standalone try/catch below, so a synchronous throw in
    // __tg.showAd can NEVER fall through to the free stub (Codex 2026-06-25 #6). The tg-bloodtread wrapper injects
    // window.__tg.showAd('rewarded', cb) -> AdsGram/Monetag; cb(ok, result), result.rewarded = confirmed reward.
    if (TG_MODE) {
      try {
        if (window.__tg && typeof window.__tg.showAd === 'function') {
          window.__tg.showAd('rewarded', function (ok, result) {
            if (result && result.rewarded) onReward();
            else if (onCancel) onCancel();
          });
          return;
        }
      } catch (e) { /* fall to the cancel below - NEVER the free stub */ }
      if (onCancel) onCancel();   // TG mode but adapter missing or threw -> no revive, no free grant
      return;
    }
    try {
      // Yandex: ysdk.adv.showRewardedVideo({ callbacks: { onRewarded, onClose } })
      if (window.ysdk && window.ysdk.adv && typeof window.ysdk.adv.showRewardedVideo === 'function') {
        var granted = false;
        window.ysdk.adv.showRewardedVideo({ callbacks: {
          onRewarded: function () { granted = true; onReward(); },
          onClose: function () { if (!granted && onCancel) onCancel(); },
          onError: function () { if (!granted && onCancel) onCancel(); }
        } });
        return;
      }
      // CrazyGames: CrazyGames.SDK.ad.requestAd('rewarded', { adFinished, adError })
      if (window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.ad && typeof window.CrazyGames.SDK.ad.requestAd === 'function') {
        window.CrazyGames.SDK.ad.requestAd('rewarded', {
          adFinished: function () { onReward(); },
          adError: function () { if (onCancel) onCancel(); }
        });
        return;
      }
    } catch (e) { /* fall through to the stub */ }
    // STUB (no SDK in this build): grant immediately.
    onReward();
  }

  export function resize() {
    view.cssW = Math.max(1, window.innerWidth || 1);
    view.cssH = Math.max(1, window.innerHeight || 1);
    updateCameraMetrics();
    view.dpr = Math.min(window.devicePixelRatio || 1, BASE_DPR);
    view.viewW = Math.max(1, Math.floor(view.cssW * view.dpr));
    view.viewH = Math.max(1, Math.floor(view.cssH * view.dpr));
    glCanvas.width = view.viewW;
    glCanvas.height = view.viewH;
    hudCanvas.width = view.viewW;
    hudCanvas.height = view.viewH;
  }

  export function handleUiPointer(x, y) {
    // RESURRECT prompt (once-per-session): a modal-like prompt during the dying window (mode still PLAYING).
    // Catch it FIRST. A tap on the button -> rewarded ad -> beginResurrect on the reward; a tap elsewhere is
    // consumed (returns true) so a misclick can't start the joystick on the dead tank. While 'assembling' the
    // reverse-assembly is playing - swallow taps too (no button).
    if (state.revivePhase === 'prompt') {
      if (inRect(x, y, rects.revive)) {
        requestRewardedAd(function () { beginResurrect(); });   // stub grants immediately; real SDK wires in at ship-time
      }
      return true;
    }
    if (state.revivePhase === 'assembling') return true;
    if (state.mode === 'MENU') {
      if (inRect(x, y, rects.play)) startRun(0);
      else if (inRect(x, y, rects.forge)) state.mode = 'SHOP';
      else if (inRect(x, y, rects.vault)) state.mode = 'VAULT';
      else if (CHEATS_ENABLED && inRect(x, y, rects.cheat)) state.mode = 'CHEAT';
      else return false;
      return true;
    }
    if (state.mode === 'SHOP') {
      for (var wi = 0; wi < rects.weapons.length; wi++) {
        if (inRect(x, y, rects.weapons[wi])) {
          buyOrEquipWeapon(rects.weapons[wi].id);
          return true;
        }
      }
      for (var si = 0; si < rects.shop.length; si++) {
        var row = rects.shop[si];
        if (inRect(x, y, { x: row.bx, y: row.by, w: row.bw, h: row.bh })) {
          buyTrack(row.id);
          return true;
        }
        if (inRect(x, y, row)) {
          econ.selectedTrack = row.id;
          return true;
        }
      }
      if (inRect(x, y, rects.shopBack)) {
        state.mode = 'MENU';
        return true;
      }
      return true;
    }
    if (state.mode === 'CHEAT') {
      if (inRect(x, y, rects.cheatMoney)) cheatMoney();
      else if (inRect(x, y, rects.cheatMax)) cheatMaxAll();
      else if (inRect(x, y, rects.cheatMin9)) startRun(9);
      else if (inRect(x, y, rects.cheatMin15)) skipToMinute(15);   // advance the LIVE run to min 15 (keeps upgrades; not a restart) - reach the late game
      else if (inRect(x, y, rects.cheatMin25)) skipToMinute(25);   // advance the LIVE run to min 25
      else if (inRect(x, y, rects.cheatReset)) cheatReset();
      else if (inRect(x, y, rects.cheatBack)) state.mode = 'MENU';
      else if (rects.waveNormal && inRect(x, y, rects.waveNormal)) spawnEnemyWave(-1);   // back to the normal mixed spawn (leaves current enemies)
      else if (rects.waveCells) {
        for (var wc = 0; wc < rects.waveCells.length; wc++) {
          var cell = rects.waveCells[wc];
          if (inRect(x, y, cell)) { spawnEnemyWave(cell.type); state.mode = 'PLAYING'; state.paused = false; break; }   // spawn a single-type wave + drop straight into play to review it
        }
      }
      return true;
    }
    if (state.mode === 'GAMEOVER') {
      if (inRect(x, y, rects.retry)) startRun(0);
      else if (inRect(x, y, rects.forge)) state.mode = 'SHOP';
      else if (inRect(x, y, rects.menu)) state.mode = 'MENU';
      return true;
    }
    if (state.mode === 'WIN') {
      if (inRect(x, y, rects.win_continue)) {
        trackAnalyticsVictoryButton('continue');
        // CONTINUE advances to the next map: a fresh 20:00 run, harder + a shifted ground palette, same tank.
        // (continueToNextMap bumps state.map then re-arms the proven loop via resetGame - game/session.js.)
        continueToNextMap();
      } else if (inRect(x, y, rects.win_interest)) {
        // Local-only interest signal: NO email form, NO network call - an analytics event + a localStorage flag
        // (the screen reads it to render the persistent "THANKS - NOTED" state on a return visit). NO-OP on
        // repeat taps once the flag is set, so re-tapping the flipped "THANKS - NOTED" button can't re-fire.
        var already = false;
        try { already = !!localStorage.getItem(SAVE_INTEREST); } catch (err) {}
        if (!already) {
          trackAnalyticsVictoryButton('register_interest');
          try { localStorage.setItem(SAVE_INTEREST, '1'); } catch (err) {}
        }
      } else if (inRect(x, y, rects.win_coffee)) {
        trackAnalyticsVictoryButton('buy_coffee');
        try { window.open(COFFEE_URL, '_blank', 'noopener'); } catch (err) {}
      }
      return true;
    }
    if (state.mode === 'VAULT') {
      if (mergeAnimBusy()) return true;   // swallow taps while a gear merge animates
      if (inRect(x, y, rects.vaultOpen)) {
        if (econ.caches > 0) {
          var card = openCache();   // ATOMIC: consumes + grants + saves BEFORE the reveal (no reroll-by-reload)
          if (card) { setReveal(card); state.mode = 'REVEAL'; playTone(card.rarity >= 2 ? 660 : 430, 0.13, 0.05); }
        }
        return true;
      }
      if (rects.vaultShard && inRect(x, y, rects.vaultShard)) {
        if (rects.vaultShard.afford) { if (forgeRelicFromShards()) playTone(560, 0.1, 0.045); }
        return true;
      }
      if (rects.vaultStore && inRect(x, y, rects.vaultStore)) { state.mode = 'STORE'; playTone(440, 0.06, 0.035); return true; }
      if (inRect(x, y, rects.vaultBack)) { state.mode = 'MENU'; return true; }
      for (var vsi = 0; vsi < rects.vaultSkins.length; vsi++) {
        if (inRect(x, y, rects.vaultSkins[vsi])) {
          if (rects.vaultSkins[vsi].owned) { setSkin(rects.vaultSkins[vsi].id); playTone(320, 0.05, 0.03); }
          return true;
        }
      }
      for (var gri = 0; gri < rects.vaultGear.length; gri++) {
        var gr = rects.vaultGear[gri];
        if (inRect(x, y, gr.merge)) {
          var garr = econ.gear[gr.slot]; var gfrom = -1;
          for (var gft = 0; gft < garr.length - 1; gft++) { if (garr[gft] >= GEAR_MERGE) { gfrom = gft; break; } }
          if (gfrom >= 0) { setMergeAnim(gr.slot, gfrom, gfrom + 1); mergeUpSlot(gr.slot); playTone(560, 0.09, 0.045); }   // animate 5 -> blood burst -> the new tier
          return true;
        }
        if (inRect(x, y, gr)) { if (STORE_TEST) { dropGear(gr.slot, 5); playTone(360, 0.05, 0.03); } return true; }   // ?storetest: tap a row to drop +5 commons (preview the loop)
      }
      return true;   // swallow taps on the vault backdrop
    }
    if (state.mode === 'STORE') {
      if (rects.storeBack && inRect(x, y, rects.storeBack)) { state.mode = 'VAULT'; return true; }
      for (var sti = 0; sti < rects.store.length; sti++) {
        if (!inRect(x, y, rects.store[sti])) continue;
        if (rects.store[sti].owned) { playTone(160, 0.05, 0.03); return true; }   // one-time item already owned
        var sit = rects.store[sti].item;
        var stg = (typeof window !== 'undefined') ? window.__tg : null;
        var stCanBuy = stg && typeof stg.buy === 'function';
        if (STORE_TEST) {
          // ?storetest ONLY (never the bare web build): grant immediately so the box/mythic result is see-able
          if (sit.once) econ.boughtOnce[sit.id] = 1;   // mark BEFORE the grant so the grant's saveMeta persists it
          var stCard = sit.kind === 'mythic' ? grantMythic(sit.mythic) : (sit.kind === 'bounty' ? openBountyBox() : openPaidBox(sit.floor || 0));
          if (stCard) { setReveal(stCard); state.mode = 'REVEAL'; playTone((stCard.rarity || 0) >= 3 ? 720 : 600, 0.14, 0.06); }
        } else if (stCanBuy) {
          // production: the Telegram wrapper buys through the backend (Stars or TON), then applies the grant.
          if (sit.kind === 'daily') { if (typeof stg.showAd === 'function') stg.showAd('rewarded', function (ok) { if (ok) { var dc = openPaidBox(0); if (dc) { setReveal(dc); state.mode = 'REVEAL'; } } }); }
          else if (rects.store[sti].ton && inRect(x, y, rects.store[sti].ton)) { stg.buy(sit.id, 'TON', function () {}); playTone(520, 0.05, 0.03); }   // tapped the TON pill
          else { stg.buy(sit.id, 'XTR', function () {}); playTone(520, 0.05, 0.03); }   // Stars pill or row body -> Stars
        }
        // else (no __tg + no storetest, e.g. the web gallery build): browse-only, no grant
        return true;
      }
      return true;   // swallow taps on the store backdrop
    }
    if (state.mode === 'REVEAL') {
      if (inRect(x, y, rects.vaultClaim)) state.mode = 'VAULT';
      return true;
    }
    if (state.paused) {
      // PAUSE: RESUME (unpause) or MAIN MENU (bank the run first, then leave to the menu - resetGame(false,0)
      // sets state.mode='MENU'). The old BANK BLOOD + FORGE pause option was removed (Tim 2026-06-24).
      if (inRect(x, y, rects.resume)) state.paused = false;
      else if (inRect(x, y, rects.quit)) {
        bankRun();
        resetGame(false, 0);   // banks (no-op if already banked) + full reset -> state.mode = 'MENU'
      }
      return true;
    }
    if (state.mode === 'PLAYING') {
      if (inRect(x, y, rects.hudPause)) {
        state.paused = true;
        return true;
      }
      // in-game MENU button removed (Tim 2026-06-24) - exit-to-menu now lives on the pause screen (MAIN MENU).
    }
    return false;
  }

  export function updateJoystick(e) {
    var dx = e.clientX - input.joyBaseX;
    var dy = e.clientY - input.joyBaseY;
    var d = Math.sqrt(dx * dx + dy * dy);
    var lim = input.joyRadius;
    if (d > lim && d > 0.001) {
      dx *= lim / d;
      dy *= lim / d;
      d = lim;
    }
    input.joyKnobX = input.joyBaseX + dx;
    input.joyKnobY = input.joyBaseY + dy;
    var dead = lim * 0.14;
    if (d < dead) {
      input.joyDX = 0;
      input.joyDY = 0;
    } else {
      input.joyDX = dx / lim;
      input.joyDY = dy / lim;
    }
  }

  export function beginJoystick(e) {
    var edge = input.joyRadius + Math.max(8, input.joyRadius * 0.16);
    input.joyActive = true;
    input.joyId = e.pointerId;
    input.joyBaseX = clamp(e.clientX, edge, view.cssW - edge);
    input.joyBaseY = clamp(e.clientY, edge, view.cssH - edge);
    input.joyKnobX = input.joyBaseX;
    input.joyKnobY = input.joyBaseY;
    input.joyDX = 0;
    input.joyDY = 0;
    updateJoystick(e);
    try { glCanvas.setPointerCapture(input.joyId); } catch (err) {}
  }

  export function endJoystick() {
    input.joyActive = false;
    input.joyId = -1;
    input.joyDX = 0;
    input.joyDY = 0;
  }

  export function wantsJoystickPointer(e) {
    if (!input.useJoystick || state.mode !== 'PLAYING') return false;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return true;
    if ((e.pointerType || '') === '' && TOUCH_DEVICE) return true;
    return (TOUCH_DEVICE || view.cssW < 760 || qs.has('joystick') || qs.has('joy'))
      && e.clientX < view.cssW * 0.62
      && e.clientY > view.cssH * 0.34;
  }

  export function endPointer(e) {
    if (input.joyActive && e.pointerId === input.joyId) {
      endJoystick();
      e.preventDefault();
      return;
    }
    if (e.pointerId !== input.pointerId) return;
    input.pointerDown = false;
    input.pointerId = -1;
  }
  export function initInput() {
    window.addEventListener('resize', resize);
  
    window.addEventListener('keydown', function (e) {
      unlockAudio();
      var c = e.keyCode || e.which;
      if (c < 256) input.keys[c] = 1;
      if (e.key === '9' && CHEATS_ENABLED) {   // skip-to-minute is a cheat -> dev/?cheats only
        if (state.mode === 'PLAYING') skipToMinute(9);
        else startRun(9);
      }
      else if (e.key === '0') resetGame(true, START_MIN);
      else if (e.key === 'r' || e.key === 'R') {
        if (state.mode === 'MENU' || state.mode === 'SHOP' || state.mode === 'CHEAT') resetGame(false, 0);
        else resetGame(true, START_MIN);
      }
      else if ((e.key === 'Enter' || e.key === ' ') && state.mode === 'MENU') startRun(0);
      else if ((e.key === 'f' || e.key === 'F') && state.mode === 'MENU') state.mode = 'SHOP';
      else if (CHEATS_ENABLED && (e.key === 'h' || e.key === 'H') && state.mode !== 'PLAYING') state.mode = state.mode === 'CHEAT' ? 'MENU' : 'CHEAT';
      else if ((e.key === 'm' || e.key === 'M') && state.mode !== 'MENU') {
        if (state.mode === 'PLAYING') bankRun();
        resetGame(false, 0);
      }
      else if (e.key === 'n' || e.key === 'N') toggleMute();
      else if ((e.key === 'c' || e.key === 'C') && CHEATS_ENABLED) cheatMoney();
      else if ((e.key === 'x' || e.key === 'X') && CHEATS_ENABLED) cheatMaxAll();
      else if (e.key === 'p' || e.key === 'P') {
        if (state.mode === 'PLAYING') state.paused = !state.paused;
      }
      else if (e.key === 'F2' || ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey))) setDebug(!DEBUG);
      else if (e.key === '1') chooseUpgrade(0);
      else if (e.key === '2') chooseUpgrade(1);
      else if (e.key === '3') chooseUpgrade(2);
    });
    window.addEventListener('keyup', function (e) {
      var c = e.keyCode || e.which;
      if (c < 256) input.keys[c] = 0;
    });
    document.addEventListener('visibilitychange', handleVisibility);

    glCanvas.addEventListener('pointerdown', function (e) {
      unlockAudio();
      if (handleUiPointer(e.clientX, e.clientY)) {
        input.pointerDown = false;
        input.pointerId = -1;
        endJoystick();
        e.preventDefault();
        return;
      }
      if (state.mode === 'LEVELUP') {
        input.pointerDown = false;
        input.pointerId = -1;
        if (chooseUpgrade(cardAt(e.clientX, e.clientY))) e.preventDefault();
        return;
      }
      if (wantsJoystickPointer(e)) {
        input.pointerDown = false;
        input.pointerId = -1;
        beginJoystick(e);
        e.preventDefault();
        return;
      }
      input.pointerDown = true;
      input.pointerId = e.pointerId;
      input.pointerX = e.clientX;
      input.pointerY = e.clientY;
      glCanvas.setPointerCapture(input.pointerId);
    });
    glCanvas.addEventListener('pointermove', function (e) {
      if (input.joyActive && e.pointerId === input.joyId) {
        updateJoystick(e);
        e.preventDefault();
        return;
      }
      if (state.mode === 'LEVELUP') {
        ui.upgradeHover = cardAt(e.clientX, e.clientY);
        return;
      }
      if (!input.pointerDown || e.pointerId !== input.pointerId) return;
      input.pointerX = e.clientX;
      input.pointerY = e.clientY;
    });
    glCanvas.addEventListener('pointerup', endPointer);
    glCanvas.addEventListener('pointercancel', endPointer);
  }
