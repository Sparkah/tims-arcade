// Per-frame sim orchestrator: the flat, ordered fan-out of every updateX() step (a LITERAL call list,
// NOT a forEach - order is load-bearing). Runs only while PLAYING + unpaused; advances tick/time, spawns
// to the target count, then steps enemies/colliders/leeches/bullets/motes/particles/gore/fx/fire, and
// trips GAMEOVER on death (banks the run + logs the analytics loss).
import { state, player, enemies, ebullets, view, tankDebris, WIN_SECONDS } from './state.js';
import { GOD } from './flags.js';
import { playSfx, playSfxOneOf, playTone } from './audio.js';
import { spawnRateAt } from './balance.js';
import { SHAKE_DECAY } from './config.js';
import { rnd } from './lib/rng.js';
import { perf } from './core/time.js';
import { updateUnleash, updateBullets, updateEnemyBullets, autoFire } from './systems/combat.js';
import { updatePlayer, destroyTank } from './systems/player.js';
import { updateEnemies, spawnEnemy } from './systems/enemies.js';
import { resolveEnemyColliders } from './spatial/grid.js';
import { updateLeeches } from './systems/leech.js';
import { updateMotes } from './systems/pickups.js';
import { updateParticles, spawnParticle, spawnMote } from './fx/particles.js';
import { updateGore, spawnSplat, spawnGoreSpray } from './fx/gore.js';
import { updateWorldFx, updateCorpses, updateVeinTrails, spawnBoom } from './fx/world.js';
import { T_PAY } from './data/enemies.js';
import { updateHealFloats } from './fx/heal.js';
import { addTrauma } from './render/camera.js';
import { desiredEnemies } from './systems/shared.js';
import { bankRun } from './systems/progress.js';
import { trackAnalyticsLoss, trackAnalyticsWin, trackAnalyticsMilestones } from './analytics.js';

  // Death entry: the instant HP hits 0, freeze into the dying state (the wreck plays ~1.35s) instead of
  // cutting straight to GAMEOVER. Idempotent (the !player.dead guard makes repeat calls harmless), so it is
  // called both at the top of update() (held-state / last-frame damage) and right after the in-frame damage
  // paths (contact + enemy bolts) so a killing blow can't slip through to updateMotes->LEVELUP. bankRun runs
  // HERE on entry (not on exit) so reset/menu/close-tab/LEVELUP during the dying window can't lose the blood;
  // the runBanked guard makes the later exit-time bankRun a no-op.
  function enterDeath() {
    if (player.dead || GOD) return;
    player.hp = 0; player.dead = true; state.deathT = DEATH_WINDOW;
    state.revivePhase = 'none'; state.reviveT = 0; state.assembleT = 0;   // a fresh death starts clean (reviveAvailable persists across the session)
    trackAnalyticsLoss('hp_zero');
    bankRun();
    destroyTank();
  }

  // Win entry: survived to WIN_SECONDS (20:00). Cleanly stops the run (like gameover, NOT the dying wreck) and
  // flips to the VICTORY screen. Idempotent (the mode guard makes repeat calls harmless). Banks the run ON ENTRY
  // (same reasoning as enterDeath - a close/menu during the transition can't lose the blood) and fires the
  // analytics Win/Complete once. Only valid from a LIVE PLAYING run (a dead tank can't win).
  function enterWin() {
    if (state.mode !== 'PLAYING' || player.dead) return;
    trackAnalyticsWin();
    bankRun();
    state.mode = 'WIN';
    state.banner = '';
    state.bannerT = 0;
  }

  export function update(dt) {
    if (state.paused || state.mode !== 'PLAYING') return;
    if (player.hp <= 0) enterDeath();   // held state / damage that landed last frame
    state.tick++;
    state.t += dt;
    // HEART-BEAT clock for the tank vein-flow + pulse (Feature C) + the exposed-heart on death (R3). While alive
    // the beat RATE = lerp(2.4, 7.5, 1-hpf) (faster as HP drops, webgl idiom). On DEATH the rate EASES toward 0
    // over ~0.5s so the exposed heart visibly SLOWS then STOPS beating (not a jarring mid-throb freeze). tankBeat
    // still integrates the (decaying) rate, so the pulse comes to rest smoothly. Advances every frame.
    if (player.dead) {
      state.tankBeatRate = Math.max(0, state.tankBeatRate - dt * 6.0);   // ease the beat to a standstill in ~0.4-0.5s
    } else {
      var hpf = player.maxHp > 0 ? player.hp / player.maxHp : 1;
      if (hpf < 0) hpf = 0; else if (hpf > 1) hpf = 1;
      state.tankBeatRate = 2.4 + (7.5 - 2.4) * (1 - hpf);                // ~2.4 rad/s at full HP -> ~7.5 rad/s near death
    }
    state.tankBeat += dt * state.tankBeatRate;
    if (!player.dead) {
      trackAnalyticsMilestones();             // one-shot minute-milestone funnel events (1/3/5/10/15/20)
      if (state.t >= WIN_SECONDS) {           // survived 20:00 -> VICTORY (clean stop, like gameover)
        enterWin();
        return;                               // mode is now WIN; skip the rest of the live sim this frame
      }
    }
    perf.envContacts = 0;
    perf.envEnemyContacts = 0;
    if (state.bannerT > 0) state.bannerT -= dt;
    updateUnleash(dt);
    if (view.shake > 0) view.shake = Math.max(0, view.shake - dt * SHAKE_DECAY);   // bleed off camera-shake trauma (runs alive AND dying so a killing-blow shake still settles during the wreck)

    if (!player.dead) {
      // -- LIVE sim (skipped entirely once dying: a destroyed tank can't move/heal/spawn/collide/fire) --
      if (player.regen > 0 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
      updatePlayer(dt);
      state.spawnCredit += dt * spawnRateAt(state.t / 60);   // refill rate (enemies/sec) = spawnRateBase + minute*spawnRatePerMinute (balance.js); opens populated + refills fast late
      var target = desiredEnemies();
      while (enemies.count < target && state.spawnCredit >= 1) {
        spawnEnemy();
        state.spawnCredit -= 1;
      }
      var nearest = updateEnemies(dt);   // applies player contact damage
      resolveEnemyColliders(dt);
      updateLeeches(dt);
      updateBullets(dt);
      updateEnemyBullets(dt);            // applies enemy-bolt damage to the tank
      if (player.hp <= 0) enterDeath();  // catch a killing blow from contact/bolts BEFORE motes->XP->LEVELUP
      if (!player.dead) {
        updateMotes(dt);                 // mote pickup -> gainXp -> can enter LEVELUP; gated off once dying
        if (GOD && player.hp < player.maxHp) player.hp = player.maxHp;
        autoFire(dt, nearest);
      }
    }

    // -- visual decay (runs alive AND dying so the world + wreck keep animating) --
    updateParticles(dt);
    updateGore(dt);
    updateWorldFx(dt);
    updateCorpses(dt);
    updateVeinTrails(dt);
    updateHealFloats(dt);

    if (player.dead) {
      // The dying tank: the ~3.5s bleed-out plays (revivePhase 'none'), THEN either a RESURRECT prompt window
      // (if a revive is still available this session) or straight to GAMEOVER; taking the prompt runs the
      // reverse-assembly ('assembling') then resumes the run. The live sim stays frozen the whole time.
      if (state.revivePhase === 'assembling') {
        advanceResurrect(dt);   // reverse-assembly: turret flies back + reattaches, heart restarts, then the run resumes
      } else if (state.revivePhase === 'prompt') {
        // death anim done; the RESURRECT - WATCH AD button is showing. Count the window down; GAMEOVER if untaken.
        advanceTankDebris(dt);   // keep the landed turret settling/smoking under the prompt
        state.reviveT -= dt;
        if (state.reviveT <= 0) toGameOver();
      } else {
        // revivePhase 'none': the bleed-out death animation
        var prevT = state.deathT;
        state.deathT -= dt;
        runDeathSequence(prevT, state.deathT, dt);
        advanceTankDebris(dt);   // the torn-off turret arcs away, drops + explodes on landing
        if (state.deathT <= 0) {
          if (state.reviveAvailable) {
            state.revivePhase = 'prompt';   // offer the once-per-session resurrect before ending the run
            state.reviveT = state.reviveMax;
          } else {
            toGameOver();
          }
        }
      }
    }
  }

  // End the run for real (after the death anim + any untaken resurrect prompt).
  function toGameOver() {
    bankRun();   // no-op if already banked on entry; harmless safety net
    state.revivePhase = 'none';
    state.mode = 'GAMEOVER';
    state.gameOverT = 0;
    state.banner = 'ENGINE STALLS - 0 RESTART';
    state.bannerT = 4;
  }

  // DEATH WINDOW length (s). Extended 1.35 -> 3.5 (Tim 2026-06-24) so the body bleed-out + heart-stop has room to
  // play out before the RESURRECT prompt. deathT counts from this down to 0; the staged booms below are spread
  // across the FIRST ~1.5s of it, then the wreck smoulders for the remainder before the prompt window opens.
  var DEATH_WINDOW = 3.5;
  // The BODY bleed-out that plays across the death pause (deathT: DEATH_WINDOW -> 0). Tim 2026-06-24: the body
  // does NOT fireball - it BLEEDS OUT. NO kind-2 fireballs here (that fire belongs ONLY to the turret's separate
  // landing detonation). The staged bursts run across the first ~1.5s (deathT 3.5 -> 2.0), then the wreck just
  // smoulders (smoke/ooze) until the prompt. Two bands:
  //   SHEDDING (~3.5 -> 2.7): BLOOD spills (boom kind 3) + METAL SCRAPS shear off (boom kind 4) at rotating hull
  //     offsets, each with a small camera-trauma ping - the hull keeps breaking + bleeding.
  //   SETTLE (~2.7 -> 2.0): drifting grey-brown SMOKE (boom kind 1 = ash frames, no fire) + a last metal tink + a
  //     final blood weep, leaving a bled-out smoking wreck with the exposed heart (drawn in render/world.js).
  // Each staged boom fires EXACTLY ONCE via a threshold cross (prevT >= time > nowT) - deterministic, no
  // per-frame RNG flood (well under the MAX_BOOMS=34 ring). The exposed heart (render/world.js) stops beating.
  function fired(prevT, nowT, time) { return prevT >= time && nowT < time; }
  function runDeathSequence(prevT, nowT, dt) {
    var x = player.x, y = player.y;
    // -- SHEDDING: blood spill + metal-scrap bursts breaking off the hull (NO fireball) --
    if (fired(prevT, nowT, 3.30)) { spawnBoom(x + 24, y - 16, 34, 3); spawnBoom(x - 18, y + 12, 28, 4); addTrauma(0.4); }
    if (fired(prevT, nowT, 3.05)) { spawnBoom(x - 26, y - 10, 30, 4); spawnBoom(x + 14, y + 18, 32, 3); addTrauma(0.34); }
    if (fired(prevT, nowT, 2.80)) { spawnBoom(x + 6, y - 22, 30, 4); spawnBoom(x + 20, y + 6, 30, 3); addTrauma(0.42); }
    // -- SETTLE: drifting smoke (kind 1 dust = grey-brown ash, no fire) + a last metal tink + a final blood weep --
    if (fired(prevT, nowT, 2.55)) { spawnBoom(x - 10, y - 18, 30, 1); spawnBoom(x + 16, y - 12, 24, 4); }
    if (fired(prevT, nowT, 2.30)) { spawnBoom(x + 8, y - 24, 32, 1); spawnBoom(x - 12, y + 10, 26, 3); }
    if (fired(prevT, nowT, 2.05)) { spawnBoom(x - 14, y - 22, 28, 1); }
    // continuous rising grey SMOKE off the wreck (rises, lingers) + a slow dark blood drip/ooze - NO fire embers.
    // Smoke keeps wisping the whole window so the wreck reads as smouldering under the resurrect prompt too.
    if (rnd() < dt * 5) {   // slow grey smoke drifting up off the bled-out wreck
      spawnParticle(x + (rnd() - 0.5) * 28, y + (rnd() - 0.5) * 14, (rnd() - 0.5) * 26, -32 - rnd() * 42, 3.2 + rnd() * 4.5, 0.7 + rnd() * 0.5, 0);
    }
    if (rnd() < dt * 3) {   // a few dark grit/blood-drip bits oozing down off the hull (low, slow - not kicked up)
      spawnParticle(x + (rnd() - 0.5) * 34, y + (rnd() - 0.5) * 16, (rnd() - 0.5) * 30, 10 + rnd() * 40, 1.6 + rnd() * 2.4, 0.4 + rnd() * 0.35, 0);
    }
  }

  // The torn-off TURRET in flight (Tim: "tower tiering off the tank and flying away, dropping and exploding").
  // Integrates the gun as a single ballistic piece: world-plane travel (vx/vy with light air drag) + a visual
  // HEIGHT arc (z rises on vz, GRAVITY pulls it down) + a hard tumble (spin). The instant it lands (z<=0) it
  // DETONATES once (latched by `exploded`): a fireball (boom kind 2) + metal shrapnel (kind 4) at the landing
  // point + a camera-trauma ping + a hot spark/smoke puff, then it goes dormant (still rendered as wreckage on
  // the ground until the death window ends). A faint smoke trail streams off it while airborne. Deterministic
  // scalar math, no per-frame alloc. Spawned in systems/player.js destroyTank; rendered in render/world.js.
  // gravity tuned so the turret's full up+down arc (vz 430-560 in destroyTank) lands in ~0.9-1.0s - well inside
  // the 3.5s death window so the LANDING DETONATION is always seen, with the wreck (incl the landed gun) then
  // smouldering through the rest of the window + the resurrect prompt.
  var DEBRIS_GRAVITY = 1050;   // visual-height px/s^2 pulling the airborne turret back to the ground
  function advanceTankDebris(dt) {
    var d = tankDebris;
    if (!d.active) return;
    d.t += dt;
    if (!d.exploded) {
      // airborne: integrate world travel (with light drag), height arc, and tumble
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      var drag = Math.pow(0.45, dt);   // air drag so it decelerates as it flies, settling near the landing point
      d.vx *= drag;
      d.vy *= drag;
      d.vz -= DEBRIS_GRAVITY * dt;
      d.z += d.vz * dt;
      d.spin += d.spinV * dt;
      // a thin smoke/ember trail off the tumbling gun while it's in the air
      if (rnd() < dt * 22) spawnParticle(d.x + (rnd() - 0.5) * 10, d.y + (rnd() - 0.5) * 10, (rnd() - 0.5) * 40, (rnd() - 0.5) * 40, 1.2 + rnd() * 2.0, 0.22 + rnd() * 0.22, 0);
      if (d.z <= 0 || d.t > 1.05) {   // landed (or a hard airtime cap so the detonation is always seen inside the 1.35s death window)
        // LANDING DETONATION (one-shot): the gun hits the ground and cooks off
        d.z = 0;
        d.exploded = true;
        spawnBoom(d.x, d.y, 38, 2);                 // fireball at the landing point
        spawnBoom(d.x, d.y, 34, 4);                 // metal shrapnel kicked off the impact
        spawnBoom(d.x - 12, d.y + 8, 22, 2);        // a small secondary lick of fire
        addTrauma(0.5);                              // the landing blast punches the camera
        for (var k = 0; k < 14; k++) {
          var ka = rnd() * 6.2832, ks = 80 + rnd() * 240;
          spawnParticle(d.x, d.y, Math.cos(ka) * ks, Math.sin(ka) * ks, 1.6 + rnd() * 3.0, 0.28 + rnd() * 0.3, 0);
        }
      }
    } else {
      // landed wreckage: settle the tumble + emit a little dying smoke so it reads as a smoking gun on the ground
      d.spinV *= Math.pow(0.05, dt);
      d.spin += d.spinV * dt;
      if (rnd() < dt * 5) spawnParticle(d.x + (rnd() - 0.5) * 14, d.y + (rnd() - 0.5) * 8, (rnd() - 0.5) * 22, -28 - rnd() * 36, 2.6 + rnd() * 3.4, 0.6 + rnd() * 0.45, 0);
    }
  }

  // RESURRECT (once-per-session rewarded-ad revive). Called from input.js when the rewarded ad grants its reward
  // (the click handler is gated on revivePhase==='prompt'). Consumes the session flag (so the prompt can never
  // show again this page-load), then kicks off the reverse-assembly ('assembling'); advanceResurrect plays it out
  // and resumes the run. Idempotent-ish: only fires from the 'prompt' phase.
  var _revStartX = 0, _revStartY = 0, _revStartZ = 0;   // the landed turret's pos when assembly begins (to lerp back from)
  export function beginResurrect() {
    if (state.revivePhase !== 'prompt' || !player.dead) return false;
    state.reviveAvailable = false;        // ONCE PER SESSION - consumed here, never reset by resetGame
    state.revivePhase = 'assembling';
    state.assembleT = state.assembleMax;
    playSfxOneOf(['rep_explosion1', 'rep_explosion2', 'rep_explosion3'], 0.4, 0, 1.1);   // a reverse-suck whump (rate 1.1 = higher) as the parts rush back; randomised explosion (Tim's kept picks)
    playTone(72, 0.5, 0.05);
    addTrauma(0.35);
    // snapshot where the turret debris is now, so it flies BACK to the tank from there
    _revStartX = tankDebris.active ? tankDebris.x : player.x;
    _revStartY = tankDebris.active ? tankDebris.y : player.y;
    _revStartZ = tankDebris.active ? tankDebris.z : 0;
    tankDebris.exploded = false;          // it's whole again, flying home (no longer a landed wreck)
    // pull a ring of blood/grit particles INWARD toward the tank (reverse of the bleed-out spray)
    for (var i = 0; i < 26; i++) {
      var a = (i / 26) * 6.2832, rad = 60 + rnd() * 70;
      var sx = player.x + Math.cos(a) * rad, sy = player.y + Math.sin(a) * rad;
      spawnParticle(sx, sy, (player.x - sx) * 2.2, (player.y - sy) * 2.2, 1.6 + rnd() * 2.6, 0.45 + rnd() * 0.3, 0);   // velocity points back at the tank
    }
    return true;
  }

  // The REVERSE-ASSEMBLY + screen-clear + continue (revivePhase==='assembling'). Over assembleMax seconds: the
  // torn-off turret flies BACK and reattaches, the heart RESTARTS (tankBeatRate ramps up from 0), blood/grit keep
  // sucking inward. On completion: ALL enemies die (screen clear), HP is restored, level/upgrades/run progress are
  // KEPT, and the run RESUMES (player.dead=false, mode stays PLAYING, sim un-freezes next frame).
  function advanceResurrect(dt) {
    state.assembleT -= dt;
    var k = 1 - Math.max(0, state.assembleT) / state.assembleMax;   // 0 -> 1 assembly progress
    var ease = k * k * (3 - 2 * k);                                  // smoothstep
    // turret flies home: lerp its world pos + height back to the tank centre, easing in
    if (tankDebris.active) {
      tankDebris.x = _revStartX + (player.x - _revStartX) * ease;
      tankDebris.y = _revStartY + (player.y - _revStartY) * ease;
      tankDebris.z = _revStartZ + (0 - _revStartZ) * ease + Math.sin(k * Math.PI) * 38;   // a little hop on the way back
      tankDebris.spin += dt * 18 * (1 - k);                          // spin slows as it seats
      if (rnd() < dt * 18) spawnParticle(tankDebris.x, tankDebris.y, (rnd() - 0.5) * 30, (rnd() - 0.5) * 30, 1.2 + rnd() * 1.8, 0.18 + rnd() * 0.18, 0);
    }
    // heart RESTARTS: ramp the beat rate back up from 0 so the pulse visibly comes back to life
    state.tankBeatRate = Math.min(2.4, state.tankBeatRate + dt * 5.0);
    state.tankBeat += dt * state.tankBeatRate;
    // a few inward grit sucks continuing
    if (rnd() < dt * 24) {
      var ia = rnd() * 6.2832, ir = 50 + rnd() * 60;
      var ix = player.x + Math.cos(ia) * ir, iy = player.y + Math.sin(ia) * ir;
      spawnParticle(ix, iy, (player.x - ix) * 2.6, (player.y - iy) * 2.6, 1.4 + rnd() * 2.0, 0.3 + rnd() * 0.22, 0);
    }
    if (state.assembleT <= 0) finishResurrect();
  }

  // Land the resurrect: clear the field, restore the tank, resume the run (keeping level/upgrades/blood/time).
  function finishResurrect() {
    // turret fully reseated onto the tank
    tankDebris.active = false; tankDebris.exploded = false; tankDebris.z = 0;
    // SCREEN-CLEAR: kill every enemy. Perf-safe at a full horde - a CAPPED ring of blood booms across the field
    // (the boom pool is a fixed 34-ring so it can't overflow) then zero the pool in one shot (no per-enemy FX loop).
    var clear = Math.min(enemies.count, 18);
    for (var i = 0; i < clear; i++) {
      var idx = (i * 0.6180339 * enemies.count) | 0;   // spread the sample across the pool
      if (idx >= enemies.count) idx = enemies.count - 1;
      spawnBoom(enemies.x[idx], enemies.y[idx], 30, 3);   // blood-splash where some enemies were
    }
    // PERSISTENT BLOOD (Tim 2026-06-24): the transient kind-3 booms above flash + vanish in <1s, leaving NO
    // lasting mark. Lay down LONG-LIFE red ground stains where the wiped horde fell so the revived run plays over
    // the carnage. spawnSplat kind 0 = a vivid red stain (rolls variant 0/2/3 = all blood); splats decay at
    // dt*0.055, so life ~22-30 => the stain lingers ~22-30s. Sample a wider spread than the 18 booms across the
    // SAME golden-ratio index so the stains scatter across the field, not in one clump. BEFORE enemies.count=0.
    var stainN = Math.min(enemies.count, 80);
    for (var s = 0; s < stainN; s++) {
      var si = (s * 0.6180339 * enemies.count) | 0;   // golden-ratio spread, same idiom as the boom loop
      if (si >= enemies.count) si = enemies.count - 1;
      // BIG, overlapping red pools so the wiped horde reads as a clear BLOODBATH - Tim wants to SEE the floor blood,
      // not a subtle dark-on-dark tint. radius ~36-58 (bigger than a normal death splat) x80 stains = the floor turns
      // red where the swarm fell; life ~22-30s so it lingers well into the revived run.
      spawnSplat(enemies.x[si], enemies.y[si], 36 + rnd() * 22, 0, 22 + rnd() * 8);
    }
    // HUGE BLOOD WAVE (Tim 2026-06-24): the tank ROARS back in a burst of BLOOD, not metal shrapnel. A big central
    // blood-splash + an expanding RING of blood-splash booms (the wave front) + a heavy radial blood spray + lasting
    // pools. kind 3 = gore_blood splash (16f); spawnGoreSpray flings vivid-red blood particles. Booms (18 clear + 1
    // core + 9 ring = 28) stay inside the fixed 34-ring pool. enemies.count is still full here (zeroed below), so
    // goreLoadScale is full and the spray comes out thick.
    spawnBoom(player.x, player.y, 150, 3);                                // the core blood-splash erupting off the tank
    for (var w = 0; w < 9; w++) {
      var wa = (w / 9) * 6.2832 + rnd() * 0.34;
      var wr = 52 + rnd() * 20;
      var wx = player.x + Math.cos(wa) * wr, wy = player.y + Math.sin(wa) * wr;
      spawnBoom(wx, wy, 50 + rnd() * 24, 3);                              // blood-splash RING = the expanding wave front
      spawnSplat(wx, wy, 38 + rnd() * 22, 0, 22 + rnd() * 8);             // a lasting pool under the wave
    }
    spawnGoreSpray(player.x, player.y, 120, null, 0, 380, 0);            // heavy radial BLOOD spray flung out fast
    spawnGoreSpray(player.x, player.y, 80, null, 0, 235, 0);             // a slower second sheet of blood = a thicker wave
    spawnSplat(player.x, player.y, 96, 0, 26);                            // a big central pool the revived tank sits in
    // BLOOD TO HARVEST (Tim 2026-06-25 "the dying enemies should drop blood to pick up to upgrade the tank"): every
    // wiped enemy DROPS a collectable blood mote where it fell, so the revived tank drives the carnage to pick them up
    // = XP -> level-ups/upgrades (the near ones magnet in; motes persist, so the field can be harvested). One per enemy
    // worth its kill value (min 6, the same as a normal drop); the 720-entry mote pool caps even a full horde.
    for (var bm = 0; bm < enemies.count; bm++) spawnMote(enemies.x[bm], enemies.y[bm], Math.min(6, T_PAY[enemies.type[bm]]));
    state.kills += enemies.count;           // the clear counts as kills (run progress kept + grows)
    enemies.count = 0;                      // clear the field in one shot (perf-safe; no 1000x killEnemy)
    ebullets.count = 0; ebullets.cursor = 0;   // also clear in-flight enemy bolts so the revived tank isn't instantly hit
    addTrauma(0.7);
    playSfxOneOf(['rep_explosion1', 'rep_explosion2', 'rep_explosion3'], 0.6, 0, 0.7);   // rate 0.7 = lower roar as the tank reseats; randomised explosion (Tim's kept picks)
    // RESTORE the tank + RESUME the run (KEEP level/upgrades/blood/time - this is a revive, not a restart)
    player.hp = player.maxHp;
    player.dead = false;
    player.vx = 0; player.vy = 0;
    player.hurt = 0; player.recoil = 0;
    state.tankBeatRate = 2.4;               // heart back to a steady live beat
    state.revivePhase = 'none';
    state.deathT = 0;
    // mode is already 'PLAYING' (it never left during the dying freeze); the live sim un-freezes next frame.
  }
