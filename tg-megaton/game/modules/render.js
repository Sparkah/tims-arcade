// The renderer owns canvas composition only. Simulation state is sampled once
// per frame; mutations remain in main.js except the shared layout rectangle map.
export function createRenderer(deps) {
const {
  ALLOW_TEST_HOOKS, BH, GF, PB, T, TH, THEMES, TW,
  atkCost, atkList, atkLvl, atkMax, clampStatsScroll,
  collectibleFrame, collectiblePalette, dacc, dailyClaimable, dailyReward,
  darken, drawExplosionAsset, drawMushroomSourceLayer, drawMushroomSourcePuffs,
  dur, extraIncomeBonus, fmt, fxChaos, fxRand, hexColor, isWaterCell,
  isoX, isoY, mixHex, mobileFx, mobileView, mushroomSourceAsset,
  nextStreak, nukeCost, nukeDef, nukeList, nukeUsable, powerCells,
  rgba, skinBoostLabel, strokeBrokenEllipse, tutTarget, tutorialActive,
  uiFont, uiOctPath, uiPanel, weakpointTargets, wipePct,
} = deps;

var BUILTIN, DISTMAP, DKEYS, GRID, R, _press, activeNuke, aim, bgT, buildings;
var chainLvl, chunks, citiesRazed, cityReinforced, cityTheme, cityTier, cityView;
var clusterLvl, craters, dailyOpen, dailyStreak, destroyedW, devOpen, dispMoney;
var dropEarned, dust, empLvl, eyeLvl, faults, fireballs, fires, firestormLvl;
var fireworkBursts, fireworksLvl, fit, flareLvl, flashWhite, glassLvl, godPower;
var gs, hasWater, helpOpen, impactPulses, infernoLvl, infoOpen, interceptors;
var lastCritBonus, lastFarRazed, lastFarTotal, lastPayout, lastShipsSunk;
var lastShipsTotal, levelName, luckLvl, meltZones, meltdownLvl, mirvLvl, money;
var mushrooms, nukeAmmo, offerChipOn, orbitalLvl, orbitals, penLvl, pendingDbl, planes;
var powerLvl, resultPct, resultWin, seismicLvl, settingsOpen, ships, shockLvl;
var smoke, statsOpen, statsScroll, statsScrollMax, tidalLvl, toppleLvl;
var totalEarned, totalW, tutStep, tutorialGiftChestImg, tutorialGiftOpen;
var vehicles, warhead, waves, welcomeCaps, welcomeMs, welcomeOpen;
var zombies;

function syncState() {
  ({
    BUILTIN, DISTMAP, DKEYS, GRID, R, _press, activeNuke, aim, bgT, buildings,
    chainLvl, chunks, citiesRazed, cityReinforced, cityTheme, cityTier, cityView,
    clusterLvl, craters, dailyOpen, dailyStreak, destroyedW, devOpen, dispMoney,
    dropEarned, dust, empLvl, eyeLvl, faults, fireballs, fires, firestormLvl,
    fireworkBursts, fireworksLvl, fit, flareLvl, flashWhite, glassLvl, godPower,
    gs, hasWater, helpOpen, impactPulses, infernoLvl, infoOpen, interceptors,
    lastCritBonus, lastFarRazed, lastFarTotal, lastPayout, lastShipsSunk,
    lastShipsTotal, levelName, luckLvl, meltZones, meltdownLvl, mirvLvl, money,
    mushrooms, nukeAmmo, offerChipOn, orbitalLvl, orbitals, penLvl, pendingDbl, planes,
    powerLvl, resultPct, resultWin, seismicLvl, settingsOpen, ships, shockLvl,
    smoke, statsOpen, statsScroll, statsScrollMax, tidalLvl, toppleLvl,
    totalEarned, totalW, tutStep, tutorialGiftChestImg, tutorialGiftOpen,
    vehicles, warhead, waves, welcomeCaps, welcomeMs, welcomeOpen,
    zombies,
  } = deps.getState());
}

// ── DRAW ─────────────────────────────────────────────────────────────────────
function drawWeakpointMarkers(c) {
  if (gs !== 'AIM' || tutorialActive() || window._silent || cityView) return;
  var marks = weakpointTargets(mobileFx() ? 14 : 24), S = GF.S;
  for (var i = 0; i < marks.length; i++) {
    var m = marks[i];
    var x = m.x, y = m.y, pulse = 0.68 + 0.32 * Math.sin(bgT * 5.4 + m.ci * 0.9 + m.cj * 1.1), r = GF.clamp(8.0 * S * fit, 6, 12) * (1 + pulse * 0.18);
    var col = m.color || (m.dist && m.dist !== 'down' ? dacc(m.dist) : PB.warn);
    c.save(); c.translate(x, y); c.globalAlpha = 0.88 + pulse * 0.10; c.shadowColor = col; c.shadowBlur = mobileFx() ? 0 : (14 * S); c.strokeStyle = col; c.lineWidth = Math.max(1.7, 2.2 * S);
    c.rotate(Math.PI / 4); c.strokeRect(-r, -r, r * 2, r * 2); c.rotate(-Math.PI / 4);
    c.beginPath(); c.arc(0, 0, r * 0.96, 0, Math.PI * 2); c.stroke();
    c.fillStyle = rgba(col, 0.92); c.beginPath(); c.arc(0, 0, Math.max(2.2, r * 0.32), 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff7b0'; c.shadowColor = '#fff7b0'; c.globalAlpha = 0.74; c.lineWidth = Math.max(1.2, 1.3 * S); c.beginPath(); c.moveTo(-r * 1.5, 0); c.lineTo(-r * 0.48, 0); c.moveTo(r * 0.48, 0); c.lineTo(r * 1.5, 0); c.moveTo(0, -r * 1.5); c.lineTo(0, -r * 0.48); c.moveTo(0, r * 0.48); c.lineTo(0, r * 1.5); c.stroke();
    c.restore();
  }
}
function drawFrame(c) {
  var W = GF.W, H = GF.H;
  drawSky(c);
  c.save(); c.translate(GF.juice.offsetX, GF.juice.offsetY);
  drawGround(c);
  drawWaves(c);
  drawImpactPulses(c);
  drawCityObjects(c);
  drawZombies(c);
  drawWaveFronts(c);
  drawChunks(c); drawFires(c); drawDust(c); drawSmoke(c);
  drawFireballs(c);
  drawOrbitals(c); drawFaults(c); drawMeltZones(c); drawFireworkBursts(c);
  for (var m = 0; m < mushrooms.length; m++) drawMushroom(c, mushrooms[m]);
  drawInterceptors(c); drawWarhead(c); GF.juice.particles.draw(c);
  c.restore();
  drawPlanes(c);
  if (gs !== 'RESULT') GF.juice.texts.draw(c);
  drawHUD(c);
  var S = GF.S;
  if (gs === 'AIM') {
    if (cityView && !tutorialActive() && !window._silent) { R.perk = []; R.info = []; R.detonate = null; }
    else { drawWeakpointMarkers(c); drawRadial(c); drawBlastPreview(c); if (!tutorialActive() && !window._silent) drawNukeBar(c); if (!tutorialActive() && !window._silent && (!R.nuke || R.nuke.length <= 1)) drawCoach(c); }
  }
  if (!devOpen && !helpOpen) {
    if (ALLOW_TEST_HOOKS) {
    var db = R.devbtn; cornerBtn(c, db); c.fillStyle = PB.warn; c.font = 'bold ' + GF.clamp(10 * S, 8, 13) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T('dev'), db.x + db.w / 2, db.y + db.h / 2);
    }
  }
  if (gs === 'RESULT') drawResult(c);
  if (devOpen) drawDev(c);
  if (helpOpen) drawHelp(c);
  if (infoOpen) drawInfo(c);
  if (statsOpen) drawStats(c);
  if (settingsOpen) drawSettings(c);
  if (dailyOpen) drawDaily(c);
  if (tutorialGiftOpen) drawTutorialGift(c);
  if (welcomeOpen) drawWelcome(c);
  if (flashWhite > 0) { c.globalAlpha = Math.min(0.38, flashWhite * flashWhite * 0.5); c.fillStyle = '#ffd9a0'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }   // warm, capped flash that blends with the fireball (was a full-white blink)
  drawCRT(c);
  var tutDailyModal = dailyOpen && tutStep === 4;
  if (tutorialActive() && !window._silent && gs !== 'BLAST' && !helpOpen && !devOpen && !welcomeOpen && (!dailyOpen || tutDailyModal) && !statsOpen && !settingsOpen && !infoOpen) drawTutorial(c);   // guided spotlight drawn last so HUD/modal targets stay above the dark tutorial scrim
  GF.juice.drawFlash(c);
}
function drawCityObjects(c) {
  var items = [];
  for (var i = 0; i < buildings.length; i++) items.push({ depth: (buildings[i].i + buildings[i].j) * 10, type: 0, building: buildings[i] });
  for (var v = 0; v < vehicles.length; v++) if (vehicles[v].state !== 'gone') items.push({ depth: (vehicles[v].ci + vehicles[v].cj) * 10 + 1, type: 1, vehicle: vehicles[v] });
  for (var s = 0; s < ships.length; s++) if (ships[s].state !== 'gone') items.push({ depth: (ships[s].ci + ships[s].cj + 0.55) * 10 + 1, type: 2, ship: ships[s] });
  items.sort(function (a, b) { return (a.depth - b.depth) || (a.type - b.type); });
  for (var k = 0; k < items.length; k++) {
    if (items[k].building) drawBuilding(c, items[k].building);
    else if (items[k].vehicle) drawVehicle(c, items[k].vehicle);
    else drawShip(c, items[k].ship);
  }
}
var _skyGrad = null, _skyGradKey = '';
function skyGradient(c, H, key, stops) {
  var k = key + ':' + H;
  if (!_skyGrad || _skyGradKey !== k) {
    _skyGrad = c.createLinearGradient(0, 0, 0, H);
    for (var i = 0; i < stops.length; i++) _skyGrad.addColorStop(stops[i][0], stops[i][1]);
    _skyGradKey = k;
  }
  return _skyGrad;
}
function drawSky(c) {
  var W = GF.W, H = GF.H;
  if (cityTheme === 'station') { drawStarfield(c); return; }   // SPACE STATION floats in a starfield void
  c.fillStyle = skyGradient(c, H, 'day', [[0, '#6c5f3f'], [0.55, '#403723'], [1, '#211d13']]);
  c.fillRect(0, 0, W, H);
  c.save();
  c.globalAlpha = 0.12; c.strokeStyle = PB.rule; c.lineWidth = 1;
  for (var y = 42; y < H; y += 36) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y + ((y / 36) % 2 ? 12 : -10)); c.stroke(); }
  for (var x = 28; x < W; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + ((x / 48) % 2 ? 10 : -8), H); c.stroke(); }
  c.restore();
}
function drawStarfield(c) {   // deep-space backdrop: dark void + a curved planet limb + parallax stars (deterministic so it doesn't shimmer)
  var W = GF.W, H = GF.H, S = GF.S;
  c.fillStyle = skyGradient(c, H, 'space', [[0, '#020611'], [0.55, '#04030e'], [1, '#01030a']]); c.fillRect(0, 0, W, H);
  for (var s = 0; s < 90; s++) { var sx = ((s * 73 + 17) % 100) / 100 * W, sy = ((s * 149 + 31) % 100) / 100 * H, tw = 0.4 + 0.6 * Math.sin(bgT * 1.4 + s * 1.7), r = (s % 7 === 0 ? 1.5 : 0.8) * S; c.globalAlpha = (0.25 + 0.55 * tw) * (s % 11 === 0 ? 1 : 0.7); c.fillStyle = s % 13 === 0 ? '#bfe6ff' : '#e8f2ff'; c.fillRect(sx, sy, r, r); }
  c.globalAlpha = 1;
  var px = W * 0.78, py = H * 0.14, pr = H * 0.3;   // a planet limb glowing in the corner (blue, NOT orange/red so it never reads as an explosion)
  var pg = c.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr); pg.addColorStop(0, 'rgba(90,150,210,0.55)'); pg.addColorStop(0.6, 'rgba(40,80,140,0.4)'); pg.addColorStop(1, 'rgba(20,40,90,0)');
  c.fillStyle = pg; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
  c.save(); c.globalAlpha = 0.3; c.strokeStyle = '#7fb6e8'; c.lineWidth = 2 * S; c.beginPath(); c.arc(px, py, pr * 0.78, Math.PI * 0.55, Math.PI * 1.15); c.stroke(); c.restore();   // thin atmosphere arc
}
function drawGround(c) {
  for (var i = 0; i < GRID; i++) for (var j = 0; j < GRID; j++) {
    var x = isoX(i, j), y = isoY(i, j);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + TW() / 2, y + TH() / 2); c.lineTo(x, y + TH()); c.lineTo(x - TW() / 2, y + TH() / 2); c.closePath();
    if (isWaterCell(i, j)) { c.fillStyle = ((i + j) % 2) ? '#063826' : '#04281b'; c.fill(); c.save(); c.globalAlpha = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(bgT * 0.9 + (i + j) * 0.5)); c.fillStyle = PB.hi; c.fill(); c.restore(); continue; }   // gentle animated ocean
    var gd = DISTMAP ? DKEYS[DISTMAP[j * GRID + i]] : (cityTheme || 'down');   // this cell's district -> its own ground style (a cumulative map mixes deck/tarmac/alley/paving/earth)
    if (gd === 'station') {   // metallic hull deck: brushed plates, faint cyan seams, a few lit panels
      var st2 = (i % 5 === 4) || (j % 5 === 4); c.fillStyle = st2 ? '#060f16' : (((i + j) % 2) ? '#0c1822' : '#0a141d'); c.fill();
      c.strokeStyle = 'rgba(70,150,200,0.10)'; c.lineWidth = 1; c.stroke();
      if (((i * 5 + j * 3) % 9) === 0) { c.save(); c.globalAlpha = 0.10 + 0.06 * Math.sin(bgT * 2 + i + j); c.fillStyle = THEMES.station.accent; c.fill(); c.restore(); }
      continue;
    }
    if (gd === 'airport') {   // dark tarmac apron + amber centerline pips
      var isRun = (i % 6 === 2) || (j % 6 === 2) || (((i + j) % 7) === 0);
      c.fillStyle = isRun ? '#1f2118' : (((i + j) % 2) ? '#16190f' : '#13160d'); c.fill();
      if (isRun && ((i + j) % 2 === 0)) { c.save(); c.globalAlpha = 0.5; c.fillStyle = THEMES.airport.accent; var mx = isoX(i, j), my = isoY(i, j) + TH() / 2; c.fillRect(mx - TW() * 0.06, my - TH() * 0.06, TW() * 0.12, TH() * 0.12); c.restore(); }
      continue;
    }
    if (gd === 'ghetto') {   // grimy cracked-asphalt alleys, tight grid
      var alley = (i % 3 === 2) || (j % 3 === 2); c.fillStyle = alley ? '#0a120a' : (((i + j) % 2) ? '#0e1a0e' : '#0c160c'); c.fill();
      c.strokeStyle = 'rgba(20,40,20,0.16)'; c.lineWidth = 1; c.stroke();
      continue;
    }
    if (gd === 'chinatown') {   // dark market paving + amber lantern light pooling (paving stays green phosphor)
      var mkt = (i % 4 === 2) || (j % 4 === 2); c.fillStyle = mkt ? '#0a1c10' : (((i + j) % 2) ? '#08180e' : '#06140b'); c.fill();
      if (mkt && ((i * 3 + j) % 5 === 0)) { c.save(); c.globalAlpha = 0.12 + 0.08 * Math.sin(bgT * 2.5 + i + j); c.fillStyle = THEMES.chinatown.accent; c.fill(); c.restore(); }
      continue;
    }
    if (gd === 'mall') {   // big flat retail lot: pale teal asphalt + neon-cyan parking lines
      var lot = (i % 2 === 0); c.fillStyle = lot ? '#08191b' : '#0a1d20'; c.fill();
      if ((j % 3 === 1)) { c.save(); c.globalAlpha = 0.10; c.strokeStyle = THEMES.mall.accent; c.lineWidth = 1; var mx2 = isoX(i, j), my2 = isoY(i, j) + TH() / 2; c.beginPath(); c.moveTo(mx2 - TW() * 0.1, my2); c.lineTo(mx2 + TW() * 0.1, my2); c.stroke(); c.restore(); }
      continue;
    }
    if (gd === 'quarantine') {   // contaminated lot: murky yellow-green + the odd biohazard-lit cell
      var qc = (i % 3 === 2) || (j % 3 === 2); c.fillStyle = qc ? '#10160a' : (((i + j) % 2) ? '#121808' : '#0e1406'); c.fill();
      if (((i * 5 + j * 3) % 11) === 0) { c.save(); c.globalAlpha = 0.10 + 0.07 * Math.sin(bgT * 1.6 + i + j); c.fillStyle = THEMES.quarantine.accent; c.fill(); c.restore(); }
      continue;
    }
    if (gd === 'mountain') {   // bare grey rock, lighter ridgelines
      var rk = ((i * 7 + j * 5) % 4) === 0; c.fillStyle = rk ? '#141821' : (((i + j) % 2) ? '#10141b' : '#0d1118'); c.fill();
      c.strokeStyle = 'rgba(150,170,200,0.06)'; c.lineWidth = 1; c.stroke();
      continue;
    }
    if (gd === 'refinery') {   // oily concrete pad + faint pipeline seams
      var pd = (i % 4 === 2) || (j % 4 === 2); c.fillStyle = pd ? '#15140c' : (((i + j) % 2) ? '#121009' : '#0f0e07'); c.fill();
      if (pd) { c.save(); c.globalAlpha = 0.08; c.strokeStyle = THEMES.refinery.accent; c.lineWidth = 1; c.stroke(); c.restore(); }
      continue;
    }
    var st = (i % 5 === 4) || (j % 5 === 4); c.fillStyle = st ? '#03100a' : (((i + j) % 2) ? '#06180e' : '#04140b'); c.fill();   // downtown green earth
  }
  for (var k = 0; k < craters.length; k++) {
    var cr = craters[k], x2 = isoX(cr.ci, cr.cj) + 0, y2 = isoY(cr.ci, cr.cj) + TH() / 2, rr = cr.r * cr.reveal; if (rr < 0.3) continue;
    var rx = rr * TW() / 2, ry = rr * TH() / 2;
    if (mobileFx()) {   // low tier: flat crater scorch instead of a per-crater radial gradient
      c.fillStyle = 'rgba(14,10,9,0.78)'; c.beginPath(); c.ellipse(x2, y2, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2); c.fill();
    } else {
      var g = c.createRadialGradient(x2, y2, 2, x2, y2, rx);
      g.addColorStop(0, 'rgba(8,6,6,0.92)'); g.addColorStop(0.7, 'rgba(22,15,12,0.7)'); g.addColorStop(1, 'rgba(22,15,12,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x2, y2, rx, ry, 0, 0, Math.PI * 2); c.fill();
    }
    c.save(); c.globalAlpha = 0.16 + 0.08 * fxRand(k * 37.9 + cr.ci * 11 + cr.cj * 19); c.strokeStyle = 'rgba(255,110,40,0.35)'; c.lineWidth = 2.2 * GF.S; strokeBrokenEllipse(c, x2, y2, rx * 0.42, ry * 0.42, 0, k * 101.7 + cr.ci * 13 + cr.cj * 23, mobileFx() ? 3 : 5, 0.55); c.restore();
  }
}
function drawVehicle(c, v) {
  var S = GF.S;
  var x = isoX(v.ci, v.cj), y = isoY(v.ci, v.cj) + TH() * 0.2;
  var wreck = v.state !== 'intact', isFuel = v.type === 'fuel', isBus = v.type === 'bus';
  c.save();
  c.translate(x, y);
  c.rotate((v.dir || 1) * 0.42);
  c.scale(isBus ? 1.18 : 1, 1);
  c.fillStyle = wreck ? '#1b1711' : (isFuel ? '#b74724' : isBus ? '#b79b44' : (v.seed % 2 ? '#496f86' : '#7c3c32'));
  c.strokeStyle = wreck ? '#0b0906' : 'rgba(255,235,180,0.45)';
  c.lineWidth = Math.max(1, 1.1 * S);
  GF.rr(c, -7 * S, -3 * S, 14 * S, 6 * S, 2 * S); c.fill(); c.stroke();
  if (isFuel && !wreck) { c.fillStyle = '#e8c46a'; c.fillRect(-2.5 * S, -2.2 * S, 5 * S, 4.4 * S); }
  c.fillStyle = wreck ? '#0d0b08' : '#d8e7e5';
  c.fillRect(-4.8 * S, -3.8 * S, 4 * S, 2 * S);
  c.fillRect(1.2 * S, -3.8 * S, 4 * S, 2 * S);
  c.fillStyle = '#070604';
  c.beginPath(); c.arc(-4.8 * S, 3 * S, 1.6 * S, 0, Math.PI * 2); c.arc(4.8 * S, 3 * S, 1.6 * S, 0, Math.PI * 2); c.fill();
  if (wreck) { c.strokeStyle = '#b04a28'; c.lineWidth = 1.4 * S; c.beginPath(); c.moveTo(-5 * S, -4 * S); c.lineTo(5 * S, 4 * S); c.moveTo(5 * S, -3 * S); c.lineTo(-4 * S, 3 * S); c.stroke(); }
  c.restore();
}
function drawVehicles(c) {
  for (var i = 0; i < vehicles.length; i++) drawVehicle(c, vehicles[i]);
}
// visible expanding shockwave ring sweeping out across the ground from ground zero
function drawWaves(c) {
  for (var wi = 0; wi < waves.length; wi++) {
    var wv = waves[wi]; if (wv.t > 1.25) continue;
    var gx = isoX(wv.ci, wv.cj), gy = isoY(wv.ci, wv.cj) + TH() / 2, rx = wv.r * TW() / 2 * (wv.sx || 1), ry = wv.r * TH() / 2 * (wv.sy || 1), wr = wv.rot || 0;
    if (wv.emp) { var ea = Math.max(0, 1 - wv.t / 0.7); c.save(); c.shadowColor = '#7fd4ff'; c.shadowBlur = mobileFx() ? 0 : (18 * GF.S); c.globalAlpha = ea; c.strokeStyle = '#cfeeff'; c.lineWidth = (3 + (1 - ea) * 6) * GF.S; c.beginPath(); c.ellipse(gx, gy, rx, ry, 0, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0; c.globalAlpha = ea * 0.5; c.strokeStyle = '#5aa6e0'; c.lineWidth = 2 * GF.S; c.beginPath(); c.ellipse(gx, gy, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2); c.stroke(); c.restore(); continue; }   // EMP = cyan pulse (never orange)
    if (wv.glass) { var ga2 = Math.max(0, 1 - wv.t / 0.8); c.save(); c.shadowColor = THEMES.mall.accent; c.shadowBlur = mobileFx() ? 0 : (12 * GF.S); c.globalAlpha = ga2; c.strokeStyle = '#cffaff'; c.lineWidth = (2.5 + (1 - ga2) * 5) * GF.S; c.beginPath(); c.ellipse(gx, gy, rx, ry, 0, 0, Math.PI * 2); c.stroke(); c.restore(); continue; }   // GLASS STORM = pale-cyan shrapnel ring
    var a = Math.max(0, 1 - wv.t / 0.55);
    var waveCol = wv.color || '#ffa040', waveGlow = wv.glow || '#ffce9a';
    c.save();
    c.shadowColor = waveGlow; c.shadowBlur = mobileFx() ? 0 : (10 * GF.S);
    c.globalAlpha = a * 0.5; c.strokeStyle = '#fff'; c.lineWidth = (3 + (1 - a) * 6) * GF.S; strokeBrokenEllipse(c, gx, gy, rx, ry, wr, (wv.seed || 1) + 401, mobileFx() ? 4 : 7, 0.45);
    c.shadowBlur = 0; c.globalAlpha = a * 0.42; c.strokeStyle = waveCol; c.lineWidth = 2.1 * GF.S; strokeBrokenEllipse(c, gx, gy, rx * 0.85, ry * 0.85, wr * -0.7, (wv.seed || 1) + 503, mobileFx() ? 3 : 6, 0.55);
    c.restore();
  }
}
function drawWaveFronts(c) {
  var active = 0;
  for (var aw = 0; aw < waves.length; aw++) if (!waves[aw].emp && !waves[aw].glass && waves[aw].t <= 0.6) active++;
  for (var wi = 0; wi < waves.length; wi++) {
    var wv = waves[wi]; if (wv.emp || wv.glass || wv.t > 0.6) continue;
    var S = GF.S, gx = isoX(wv.ci, wv.cj), gy = isoY(wv.ci, wv.cj) + TH() / 2, rx = wv.r * TW() / 2 * (wv.sx || 1), ry = wv.r * TH() / 2 * (wv.sy || 1), rot = wv.rot || 0;
    var a = Math.max(0, 1 - wv.t / 0.6), density = active > 1 ? Math.max(0.42, 1 / Math.sqrt(active)) : 1, lineN = Math.max(mobileFx() ? 5 : 8, Math.round((wv.lines || (mobileFx() ? 10 : 20)) * density)), seed = wv.seed || 1;
    if (rx < 8 * S || ry < 4 * S) continue;
    c.save();
    c.globalAlpha = a * 0.32;
    c.strokeStyle = 'rgba(210,190,150,0.42)';
    c.lineWidth = (mobileFx() ? 7 : 11) * S;
    strokeBrokenEllipse(c, gx, gy, rx * 1.02, ry * 1.05, rot, seed + 701, mobileFx() ? 4 : 7, 0.5);   // dust curtain riding the pressure front
    c.globalCompositeOperation = 'lighter';
    c.shadowColor = wv.glow || wv.color || '#ffad55'; c.shadowBlur = mobileFx() ? 0 : (11 * S);
    for (var q = 0; q < lineN; q++) {
      var n1 = fxRand(seed + q * 31.1), n2 = fxRand(seed + q * 47.7), n3 = fxRand(seed + q * 63.3);
      var aa = q / lineN * Math.PI * 2 + n1 * 0.45 + (wv.t * 0.9), seg = 0.055 + n2 * 0.11, rr = 0.92 + n3 * 0.18;
      c.globalAlpha = a * (0.25 + n2 * 0.42);
      c.strokeStyle = n1 > 0.68 ? '#fff4d8' : rgba(wv.color || '#ff9340', 0.95);
      c.lineWidth = (1.2 + n3 * 3.2) * S;
      c.beginPath(); c.ellipse(gx, gy, rx * rr, ry * (0.95 + n2 * 0.14), rot + (n1 - 0.5) * 0.08, aa, aa + seg); c.stroke();
    }
    c.restore();
  }
}
function drawImpactPulses(c) {
  for (var i = 0; i < impactPulses.length; i++) {
    var p = impactPulses[i], k = Math.min(1, p.t / p.life), a = Math.max(0, 1 - k), S = GF.S;
    var rx = p.r * TW() * (0.36 + k * 0.5) * (p.sx || 1), ry = p.r * TH() * (0.28 + k * 0.42) * (p.sy || 1), rot = p.rot || 0;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = a * (p.main ? 0.42 : 0.26);
    if (mobileFx()) {   // low tier: flat additive glow instead of a per-fire radial gradient
      c.fillStyle = rgba(p.color, 0.3);
    } else {
      var g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, Math.max(rx, 20 * S));
      g.addColorStop(0, rgba(p.accent, 0.68));
      g.addColorStop(0.34, rgba(p.color, 0.28));
      g.addColorStop(1, rgba(p.color, 0));
      c.fillStyle = g;
    }
    c.beginPath(); c.ellipse(p.x, p.y + TH() * 0.12, rx, ry, rot, 0, Math.PI * 2); c.fill();
    c.globalAlpha = a * 0.42;
    c.strokeStyle = rgba(p.accent, 0.75); c.lineWidth = 1.1 * S;
    for (var ln = 0; ln < (p.lines || 1); ln++) { var scale = 0.48 + ln * 0.18 + k * 0.3; strokeBrokenEllipse(c, p.x, p.y + TH() * 0.12, rx * scale, ry * scale, rot + ln * 0.18, (p.x + p.y) * 0.07 + ln * 103.3 + k * 17, mobileFx() ? 2 : 3, 0.55); }
    c.strokeStyle = rgba(p.accent, 0.95); c.lineWidth = (p.main ? 3 : 2) * S;
    c.globalAlpha = a * 0.48;
    strokeBrokenEllipse(c, p.x, p.y + TH() * 0.35, rx * 0.72, ry * 0.46, 0, (p.x + p.y) * 0.11 + 733, mobileFx() ? 3 : 5, 0.42);
    for (var r = 0, rays = mobileFx() ? 5 : 8; r < rays; r++) {
      var seedR = (p.x + p.y) * 0.13 + r * 89.1, ang = fxRand(seedR + Math.floor(k * 5) * 31.3) * Math.PI * 2, r1 = rx * (0.16 + fxRand(seedR + 7) * 0.16), r2 = rx * (0.48 + fxRand(seedR + 13) * (0.34 + 0.22 * k));
      c.beginPath();
      c.moveTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * ry * 0.12);
      c.lineTo(p.x + Math.cos(ang) * r2, p.y + Math.sin(ang) * ry * 0.32);
      c.stroke();
    }
    c.restore();
  }
}
function drawBuilding(c, b) {
  if (b.state === 'rubble') { isoBox(c, b, Math.max(3 * GF.S, b.h * BH() * 0.12), '#3a3026', null, 0, 0); return; }
  var Hh = b.h * BH() * (b.state === 'falling' ? b.collapse : 1);
  var lx = 0, ly = 0, col = b.col, lit = b.lit;
  if (b.state === 'falling') { lx = b.tdx * b.lean * b.h * BH() * 0.7 + (b.jit || 0); ly = b.tdy * b.lean * b.h * BH() * 0.4; col = darken(b.col, -0.42 * b.lean); lit = -1; }   // pancakes down (slight lean + tremor) + chars
  isoBox(c, b, Hh, col, lit, lx, ly);
  if (b.wall) { var ax = isoX(b.i + 0.5, b.j + 0.5), topY = isoY(b.i + 0.5, b.j + 0.5) - Hh; c.fillStyle = '#1c6b44'; for (var mn = -1; mn <= 1; mn++) c.fillRect(ax + mn * TW() * 0.26 - 2 * GF.S, topY - 4 * GF.S, 4.5 * GF.S, 5 * GF.S); }   // battlement crenellations
  if (b.battery && b.state === 'intact') { var bax = isoX(b.i + 0.5, b.j + 0.5), btopY = isoY(b.i + 0.5, b.j + 0.5) - Hh; c.strokeStyle = PB.mid; c.lineWidth = 2.2 * GF.S; c.beginPath(); c.moveTo(bax, btopY); c.lineTo(bax + 7 * GF.S, btopY - 9 * GF.S); c.stroke(); c.fillStyle = PB.hi; c.beginPath(); c.arc(bax - 3 * GF.S, btopY - 1 * GF.S, 2.4 * GF.S, 0, Math.PI * 2); c.fill(); }   // interceptor launcher + radar dish
  if (b.tank && b.state === 'intact') { var tcx = isoX(b.i + 0.5, b.j + 0.5), tcy = isoY(b.i + 0.5, b.j + 0.5) - Hh, tr = TW() * 0.15; c.fillStyle = darken(b.col, 0.12); c.beginPath(); c.ellipse(tcx, tcy - tr * 0.4, tr, tr * 0.55, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = darken(b.col, -0.28); c.fillRect(tcx - tr, tcy - tr * 0.4, tr * 2, tr * 0.85); }   // far-shore storage tank (industrial district)
  if (b.airport && b.state === 'intact') { var ax2 = isoX(b.i + 0.5, b.j + 0.5), ay2 = isoY(b.i + 0.5, b.j + 0.5) - Hh; c.save(); c.strokeStyle = PB.lo; c.lineWidth = 1.4 * GF.S; c.setLineDash([3 * GF.S, 3 * GF.S]); c.beginPath(); c.moveTo(ax2 - TW() * 0.32, ay2 + TH() * 0.08); c.lineTo(ax2 + TW() * 0.32, ay2 - TH() * 0.08); c.stroke(); c.setLineDash([]); c.restore(); }   // airport runway markings
  if (b.state !== 'rubble') drawThemeProp(c, b, Hh, lx, ly);   // station/airport/etc decorations on top of the cuboid
  if (b.shielded > 0) { c.save(); c.globalAlpha = b.shielded * 0.5; isoBox(c, b, Hh, PB.hi, -1, lx, ly); c.restore(); }   // took partial blast
}
// themed props drawn on top of a building's cuboid (only when the city has that theme)
function drawThemeProp(c, b, Hh, lx, ly) {
  var S = GF.S, falling = b.state === 'falling';
  var cxp = isoX(b.i + 0.5, b.j + 0.5) + lx, topY = isoY(b.i + 0.5, b.j + 0.5) - Hh + ly;
  if (b.solar) {   // solar-panel wing: a tilted blue grid panel lying low across the cell
    var pw = TW() * 0.42, pd = TH() * 0.42, ox = b.dir ? 1 : -1;
    var a = [cxp - pw, topY], bb = [cxp + ox * 6 * S, topY - 6 * S], cc = [cxp + pw, topY], dd = [cxp - ox * 6 * S, topY + 6 * S];
    c.fillStyle = falling ? '#1a2630' : '#16314a'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(bb[0], bb[1]); c.lineTo(cc[0], cc[1]); c.lineTo(dd[0], dd[1]); c.closePath(); c.fill();
    c.strokeStyle = falling ? 'rgba(80,130,170,0.4)' : '#3f7fb8'; c.lineWidth = 1; for (var g = 1; g < 4; g++) { var t = g / 4; c.beginPath(); c.moveTo(GF.lerp(a[0], bb[0], t), GF.lerp(a[1], bb[1], t)); c.lineTo(GF.lerp(dd[0], cc[0], t), GF.lerp(dd[1], cc[1], t)); c.stroke(); c.beginPath(); c.moveTo(GF.lerp(a[0], dd[0], t), GF.lerp(a[1], dd[1], t)); c.lineTo(GF.lerp(bb[0], cc[0], t), GF.lerp(bb[1], cc[1], t)); c.stroke(); }
    if (!falling) { c.save(); c.globalAlpha = 0.18 + 0.16 * Math.sin(bgT * 3 + b.i + b.j); c.fillStyle = THEMES.station.accent; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(bb[0], bb[1]); c.lineTo(cc[0], cc[1]); c.lineTo(dd[0], dd[1]); c.closePath(); c.fill(); c.restore(); }   // sun glint
    return;
  }
  if (b.hub && b.state === 'intact') {   // comms hub: a tall mast + a parabolic dish that slowly tracks
    c.strokeStyle = '#9fb6c8'; c.lineWidth = 1.8 * S; c.beginPath(); c.moveTo(cxp, topY); c.lineTo(cxp, topY - 16 * S); c.stroke();
    var dcx = cxp, dcy = topY - 16 * S, da = Math.sin(bgT * 0.6) * 0.5;
    c.save(); c.translate(dcx, dcy); c.rotate(da); c.fillStyle = '#cfe2f0'; c.beginPath(); c.ellipse(0, 0, 8 * S, 5 * S, 0, Math.PI * 0.15, Math.PI * 1.85); c.fill(); c.strokeStyle = THEMES.station.accent; c.lineWidth = 1.4 * S; c.stroke(); c.fillStyle = THEMES.station.accent; c.beginPath(); c.arc(2 * S, 0, 1.6 * S, 0, Math.PI * 2); c.fill(); c.restore();
    return;
  }
  if (b.reactor && b.state === 'intact') {   // reactor core: glowing cyan vent rings up the tower + a hot top node
    var topMid = topY; c.save(); c.globalAlpha = 0.5 + 0.3 * Math.sin(bgT * 4); c.fillStyle = THEMES.station.accent; c.beginPath(); c.arc(cxp, topMid - 4 * S, 4 * S, 0, Math.PI * 2); c.fill(); c.restore();
    c.save(); c.strokeStyle = 'rgba(127,212,255,0.5)'; c.lineWidth = 2 * S; for (var v = 1; v <= 3; v++) { var vy = isoY(b.i + 0.5, b.j + 0.5) - Hh * (v / 4) + ly; c.beginPath(); c.moveTo(cxp - TW() * 0.16, vy); c.lineTo(cxp + TW() * 0.16, vy); c.stroke(); } c.restore();
    return;
  }
  if (b.module && b.state !== 'rubble') {   // metallic module: a cyan running-light strip + a docking ring on the side
    c.save(); c.globalAlpha = 0.55 + 0.25 * Math.sin(bgT * 2.5 + b.i); c.fillStyle = THEMES.station.accent; var ly0 = isoY(b.i + 0.5, b.j + 0.5) - Hh * 0.55 + ly; c.fillRect(cxp - TW() * 0.18, ly0, TW() * 0.36, 1.6 * S); c.restore();
    if (!falling && b.h > 1.8) { c.strokeStyle = 'rgba(159,182,200,0.5)'; c.lineWidth = 1.3 * S; c.beginPath(); c.arc(cxp + TW() * 0.22, isoY(b.i + 0.5, b.j + 0.5) - Hh * 0.4 + ly, 3 * S, 0, Math.PI * 2); c.stroke(); }
    return;
  }
  var AC = dacc(b.dist || cityTheme);   // this building's own district accent (cyan station / amber airport+chinatown / green-ish ghetto)
  if (b.tower && b.state === 'intact') {   // control tower: a glass cab ringed in amber + a sweeping rotating beacon
    var cabY = topY; c.fillStyle = '#10141a'; c.strokeStyle = AC; c.lineWidth = 1.6 * S; c.beginPath(); c.ellipse(cxp, cabY - 4 * S, TW() * 0.2, TH() * 0.42, 0, 0, Math.PI * 2); c.fill(); c.stroke();   // glass cab
    c.save(); c.globalAlpha = 0.7; c.fillStyle = AC; var ba = bgT * 3; c.beginPath(); c.moveTo(cxp, cabY - 4 * S); c.lineTo(cxp + Math.cos(ba) * 18 * S, cabY - 4 * S - Math.abs(Math.sin(ba)) * 8 * S); c.lineTo(cxp + Math.cos(ba) * 18 * S, cabY - 4 * S); c.closePath(); c.fill(); c.restore();   // rotating beacon sweep
    c.fillStyle = (Math.sin(bgT * 5) > 0) ? '#ff5050' : '#7a2020'; c.beginPath(); c.arc(cxp, cabY - 12 * S, 1.8 * S, 0, Math.PI * 2); c.fill();   // red obstruction light
    return;
  }
  if (b.terminal && b.state !== 'rubble') {   // terminal concourse: a long amber gate stripe + jet-bridge nubs
    c.save(); c.strokeStyle = AC; c.globalAlpha = 0.7; c.lineWidth = 2 * S; c.setLineDash([5 * S, 4 * S]); c.beginPath(); c.moveTo(cxp - TW() * 0.34, topY + TH() * 0.06); c.lineTo(cxp + TW() * 0.34, topY - TH() * 0.06); c.stroke(); c.setLineDash([]); c.restore();
    if (!falling) { c.fillStyle = darken(AC, -0.2); for (var jb = -1; jb <= 1; jb++) c.fillRect(cxp + jb * TW() * 0.22 - 1.5 * S, topY - 3 * S, 3 * S, 5 * S); }
    return;
  }
  if (b.parked && b.state !== 'rubble') {   // a parked airliner silhouette sitting on the apron
    c.save(); c.translate(cxp, topY + TH() * 0.05); c.scale(b.dir || 1, 1); c.fillStyle = falling ? '#3a4030' : '#cfd6c4';
    c.beginPath(); c.moveTo(-12 * S, 0); c.lineTo(9 * S, -1 * S); c.lineTo(8 * S, 1.5 * S); c.lineTo(-11 * S, 2 * S); c.closePath(); c.fill();   // fuselage
    c.beginPath(); c.moveTo(-2 * S, 0); c.lineTo(2 * S, 7 * S); c.lineTo(4 * S, 7 * S); c.lineTo(2 * S, 0); c.closePath(); c.fill();   // wing
    c.beginPath(); c.moveTo(-2 * S, 0.5 * S); c.lineTo(2 * S, -6 * S); c.lineTo(4 * S, -6 * S); c.lineTo(2 * S, 0.5 * S); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-12 * S, 0); c.lineTo(-14 * S, -3 * S); c.lineTo(-9 * S, 0.5 * S); c.closePath(); c.fill();   // tail
    c.fillStyle = AC; c.fillRect(-9 * S, -0.5 * S, 12 * S, 0.8 * S);   // cheatline
    c.restore();
    return;
  }
  if (b.tenement && b.state !== 'rubble') {   // GHETTO: a zigzag fire escape down the front face + a small graffiti tag
    var fx = isoX(b.i + 1, b.j + 0.5) + lx, fy0 = isoY(b.i + 1, b.j + 0.5) + ly, fyTop = fy0 - Hh;
    c.save(); c.strokeStyle = 'rgba(20,32,20,0.85)'; c.lineWidth = 1.2 * S; var steps = Math.max(2, Math.round(b.h));
    for (var fs2 = 0; fs2 < steps; fs2++) { var t0 = fs2 / steps, t1 = (fs2 + 1) / steps; c.beginPath(); c.moveTo(fx + (fs2 % 2 ? 3 : -3) * S, GF.lerp(fy0, fyTop, t0)); c.lineTo(fx + (fs2 % 2 ? -3 : 3) * S, GF.lerp(fy0, fyTop, t1)); c.stroke(); }   // zigzag escape
    c.restore();
    if (!falling && b.graf > 0) { c.save(); c.globalAlpha = 0.85; c.fillStyle = AC; var gxx = cxp - TW() * 0.12, gyy = isoY(b.i + 0.5, b.j + 0.5) - Hh * 0.4 + ly; c.font = 'bold ' + (5 * S) + 'px ui-monospace,monospace'; c.fillText(['X', '//', 'Z', '++'][b.graf % 4], gxx, gyy); c.restore(); }   // graffiti tag
    return;
  }
  if (b.pagoda && b.state === 'intact') {   // CHINATOWN: a tiered pitched roof crowning the block + two hanging lanterns
    var ax = isoX(b.i, b.j) + lx, bx2 = isoX(b.i + 1, b.j) + lx, cx2 = isoX(b.i + 1, b.j + 1) + lx, dx2 = isoX(b.i, b.j + 1) + lx;
    var ayT = isoY(b.i, b.j) - Hh + ly, byT = isoY(b.i + 1, b.j) - Hh + ly, cyT = isoY(b.i + 1, b.j + 1) - Hh + ly, dyT = isoY(b.i, b.j + 1) - Hh + ly;
    var ridge = (Math.min(ayT, byT, cyT, dyT)) - 9 * S, mxp = cxp;
    c.fillStyle = darken(b.col, 0.18); c.beginPath(); c.moveTo(ax - 3 * S, ayT); c.lineTo(bx2 + 3 * S, byT); c.lineTo(mxp, ridge); c.closePath(); c.fill();   // upturned eaves -> ridge (back)
    c.fillStyle = darken(b.col, 0.05); c.beginPath(); c.moveTo(dx2 - 3 * S, dyT); c.lineTo(cx2 + 3 * S, cyT); c.lineTo(mxp, ridge); c.closePath(); c.fill();   // front pitch
    c.strokeStyle = AC; c.lineWidth = 1.4 * S; c.beginPath(); c.moveTo(ax - 3 * S, ayT); c.lineTo(mxp, ridge); c.lineTo(cx2 + 3 * S, cyT); c.stroke();   // amber ridge trim
    c.fillStyle = AC; c.save(); c.globalAlpha = 0.6 + 0.4 * Math.sin(bgT * 3 + b.i); c.beginPath(); c.arc(cxp - TW() * 0.26, isoY(b.i + 0.5, b.j + 0.5) - Hh * 0.5 + ly, 2.4 * S, 0, Math.PI * 2); c.arc(cxp + TW() * 0.26, isoY(b.i + 0.5, b.j + 0.5) - Hh * 0.5 + ly, 2.4 * S, 0, Math.PI * 2); c.fill(); c.restore();   // paper lanterns
    return;
  }
  if (b.gate && b.state === 'intact') {   // CHINATOWN paifang: a wide arch with two posts + an upturned crossbeam
    var gy0 = isoY(b.i + 0.5, b.j + 0.5) + ly, gTop = gy0 - Hh; c.strokeStyle = darken(b.col, 0.2); c.lineWidth = 3 * S;
    c.beginPath(); c.moveTo(cxp - TW() * 0.3, gy0); c.lineTo(cxp - TW() * 0.3, gTop); c.moveTo(cxp + TW() * 0.3, gy0); c.lineTo(cxp + TW() * 0.3, gTop); c.stroke();   // posts
    c.fillStyle = AC; c.beginPath(); c.moveTo(cxp - TW() * 0.4, gTop); c.lineTo(cxp + TW() * 0.4, gTop); c.lineTo(cxp + TW() * 0.3, gTop - 5 * S); c.lineTo(cxp - TW() * 0.3, gTop - 5 * S); c.closePath(); c.fill();   // upturned crossbeam
    c.fillStyle = darken(b.col, 0.1); c.fillRect(cxp - TW() * 0.18, gTop - 3 * S, TW() * 0.36, 2 * S);
    return;
  }
  if (b.shop && b.state !== 'rubble') {   // CHINATOWN shophouse: a vertical hanging sign + a string of lanterns
    var sy0 = isoY(b.i + 0.5, b.j + 0.5) - Hh + ly; c.fillStyle = AC; c.save(); c.globalAlpha = 0.85;
    c.fillRect(cxp + TW() * 0.18, sy0 - 2 * S, 2.4 * S, 11 * S);   // vertical sign board
    for (var ln = 0; ln < 3; ln++) { c.globalAlpha = 0.5 + 0.4 * Math.sin(bgT * 3 + ln + b.i); c.beginPath(); c.arc(cxp - TW() * 0.2 + ln * 5 * S, sy0 + 2 * S, 1.8 * S, 0, Math.PI * 2); c.fill(); }   // lantern string
    c.restore();
    return;
  }
  var topYp = isoY(b.i + 0.5, b.j + 0.5) - Hh + ly;
  // ---- SHOPPING / MALLS ----
  if (b.bigbox && b.state !== 'rubble') { c.save(); c.globalAlpha = 0.55 + 0.3 * Math.sin(bgT * 2 + b.i); c.fillStyle = AC; c.fillRect(cxp - TW() * 0.22, topYp - 1.5 * S, TW() * 0.44, 2 * S); c.restore(); if (!falling) { c.fillStyle = AC; c.globalAlpha = 0.8; c.fillRect(cxp - TW() * 0.05, topYp - 6 * S, 2 * S, 5 * S); c.globalAlpha = 1; } return; }   // neon storefront band + a sign pole
  if (b.atrium && b.state === 'intact') { c.save(); c.fillStyle = 'rgba(120,230,235,0.22)'; c.beginPath(); c.moveTo(cxp - TW() * 0.2, topYp + 2 * S); c.lineTo(cxp, topYp - 7 * S); c.lineTo(cxp + TW() * 0.2, topYp + 2 * S); c.closePath(); c.fill(); c.strokeStyle = AC; c.lineWidth = 1.4 * S; c.stroke(); c.beginPath(); c.moveTo(cxp, topYp - 7 * S); c.lineTo(cxp, topYp + 2 * S); c.stroke(); c.restore(); return; }   // glass barrel-vault atrium
  if (b.parking && b.state !== 'rubble') { c.save(); c.strokeStyle = 'rgba(120,230,235,0.25)'; c.lineWidth = 1; for (var pk = -1; pk <= 1; pk++) { c.beginPath(); c.moveTo(cxp + pk * TW() * 0.18, topYp + TH() * 0.1); c.lineTo(cxp + pk * TW() * 0.18 + TW() * 0.06, topYp - TH() * 0.06); c.stroke(); } c.restore(); return; }   // parking bay stripes
  // ---- QUARANTINE ZONE ----
  if (b.infected && b.state !== 'rubble') { c.save(); c.fillStyle = AC; c.globalAlpha = 0.7; c.translate(cxp, topYp - 3 * S); for (var bz = 0; bz < 3; bz++) { c.save(); c.rotate(bz * 2.094); c.beginPath(); c.arc(0, -3 * S, 2.4 * S, 0, Math.PI * 2); c.fill(); c.restore(); } c.beginPath(); c.arc(0, 0, 1.6 * S, 0, Math.PI * 2); c.fillStyle = PB.bg; c.fill(); c.restore(); return; }   // biohazard trefoil on the roof
  if (b.tent && b.state !== 'rubble') { c.save(); c.fillStyle = darken(b.col, 0.15); c.beginPath(); c.moveTo(cxp - TW() * 0.22, topYp + 3 * S); c.lineTo(cxp, topYp - 4 * S); c.lineTo(cxp + TW() * 0.22, topYp + 3 * S); c.closePath(); c.fill(); c.fillStyle = AC; c.globalAlpha = 0.8; c.beginPath(); c.arc(cxp, topYp - 0.5 * S, 1.6 * S, 0, Math.PI * 2); c.fill(); c.restore(); return; }   // biohazard tent (peaked) + a marker dot
  if (b.fence && b.state === 'intact') { c.save(); c.strokeStyle = darken(AC, -0.3); c.globalAlpha = 0.7; c.lineWidth = 1; var fy0 = isoY(b.i + 0.5, b.j + 0.5) + ly; for (var fz = -2; fz <= 2; fz++) { c.beginPath(); c.moveTo(cxp + fz * 3 * S, fy0); c.lineTo(cxp + fz * 3 * S, topYp); c.stroke(); } c.beginPath(); c.moveTo(cxp - TW() * 0.2, topYp + 3 * S); c.lineTo(cxp + TW() * 0.2, topYp - 1 * S); c.stroke(); c.restore(); return; }   // chain-link fence
  if (b.wreck && b.state !== 'rubble') { c.save(); c.translate(cxp, topYp + TH() * 0.06); c.rotate((b.dir || 1) * 0.5); c.fillStyle = darken(b.col, -0.1); c.fillRect(-6 * S, -2 * S, 12 * S, 4 * S); c.fillStyle = darken(b.col, -0.35); c.fillRect(-3 * S, -4 * S, 6 * S, 3 * S); c.restore(); return; }   // overturned car
  // ---- MOUNTAIN BASE ----
  if (b.peak && b.state !== 'rubble') { c.save(); c.fillStyle = '#dfe8f2'; c.globalAlpha = 0.5; c.beginPath(); var aa = isoX(b.i, b.j) + lx, bb2 = isoX(b.i + 1, b.j + 1) + lx; c.moveTo(cxp - TW() * 0.12, topYp + 2 * S); c.lineTo(cxp, topYp - 4 * S); c.lineTo(cxp + TW() * 0.12, topYp + 2 * S); c.closePath(); c.fill(); c.restore(); return; }   // snow-capped peak
  if (b.silo && b.state === 'intact') { c.save(); c.strokeStyle = darken(AC, -0.2); c.lineWidth = 1.6 * S; c.beginPath(); c.arc(cxp, topYp + 1 * S, TW() * 0.16, 0, Math.PI * 2); c.stroke(); c.fillStyle = AC; c.globalAlpha = 0.6; c.beginPath(); c.arc(cxp, topYp + 1 * S, TW() * 0.07, 0, Math.PI * 2); c.fill(); c.restore(); return; }   // missile silo hatch (ring)
  if (b.radar && b.state === 'intact') { c.save(); c.strokeStyle = '#cfe2f0'; c.lineWidth = 1.4 * S; c.beginPath(); c.arc(cxp, topYp - 2 * S, 6 * S, Math.PI, Math.PI * 2); c.stroke(); var ra = bgT * 1.2; c.strokeStyle = AC; c.beginPath(); c.moveTo(cxp, topYp - 2 * S); c.lineTo(cxp + Math.cos(ra) * 6 * S, topYp - 2 * S - Math.abs(Math.sin(ra)) * 3 * S); c.stroke(); c.restore(); return; }   // radar dome + sweep
  // ---- OIL REFINERY ----
  if (b.fueltank && b.state !== 'rubble') { c.save(); var tr = TW() * 0.2; c.fillStyle = darken(b.col, 0.14); c.beginPath(); c.ellipse(cxp, topYp - tr * 0.3, tr, tr * 0.5, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = darken(b.col, -0.3); c.lineWidth = 1; c.beginPath(); c.ellipse(cxp, topYp - tr * 0.3, tr, tr * 0.5, 0, 0, Math.PI); c.stroke(); c.restore(); return; }   // cylindrical tank top
  if (b.distill && b.state === 'intact') { c.save(); c.strokeStyle = darken(b.col, -0.25); c.lineWidth = 1; for (var dz = 1; dz <= 3; dz++) { var dy2 = isoY(b.i + 0.5, b.j + 0.5) - Hh * (dz / 4) + ly; c.beginPath(); c.moveTo(cxp - TW() * 0.13, dy2); c.lineTo(cxp + TW() * 0.13, dy2); c.stroke(); } c.restore(); return; }   // distillation tower banding
  if (b.flarestack && b.state === 'intact') { c.save(); c.strokeStyle = '#9aa0a6'; c.lineWidth = 1.6 * S; var fy1 = isoY(b.i + 0.5, b.j + 0.5) + ly; c.beginPath(); c.moveTo(cxp, fy1); c.lineTo(cxp, topYp); c.stroke(); var fl = 0.6 + 0.4 * Math.sin(bgT * 12 + b.i); if (mobileFx()) { c.fillStyle = 'rgba(255,170,80,0.8)'; c.beginPath(); c.arc(cxp, topYp - 4 * S, 3.5 * S * fl, 0, Math.PI * 2); c.fill(); } else { var fg = c.createRadialGradient(cxp, topYp - 3 * S, 1, cxp, topYp - 3 * S, 7 * S * fl); fg.addColorStop(0, 'rgba(255,240,150,0.9)'); fg.addColorStop(0.5, 'rgba(255,138,59,0.7)'); fg.addColorStop(1, 'rgba(255,80,20,0)'); c.fillStyle = fg; c.beginPath(); c.arc(cxp, topYp - 4 * S, 6 * S * fl, 0, Math.PI * 2); c.fill(); } c.restore(); return; }   // flare stack with a live flame (orange OK = real fire)
  if (b.pipeline && b.state !== 'rubble') { c.save(); c.strokeStyle = darken(b.col, 0.1); c.lineWidth = 2 * S; c.beginPath(); c.moveTo(cxp - TW() * 0.22, topYp + TH() * 0.06); c.lineTo(cxp + TW() * 0.22, topYp - TH() * 0.06); c.stroke(); c.restore(); return; }   // pipeline run
  // ---- SKYSCRAPERS ----
  if (b.skytower && b.state === 'intact') { c.save(); c.globalAlpha = 0.5 + 0.4 * Math.sin(bgT * 3 + b.i); c.fillStyle = (Math.sin(bgT * 5) > 0) ? '#ff5050' : '#7a2020'; c.beginPath(); c.arc(cxp, topYp - 2 * S, 2 * S, 0, Math.PI * 2); c.fill(); c.restore(); if (!falling) { c.save(); c.globalAlpha = 0.3; c.fillStyle = AC; for (var gl = 1; gl <= 3; gl++) { var gy = isoY(b.i + 0.5, b.j + 0.5) - Hh * (gl / 4) + ly; c.fillRect(cxp - TW() * 0.14, gy, TW() * 0.28, 1.4 * S); } c.restore(); } return; }   // roof beacon + glass-band glints
  if (b.glass && b.office && b.state !== 'rubble') { c.save(); c.globalAlpha = 0.25; c.fillStyle = AC; c.fillRect(cxp - TW() * 0.16, isoY(b.i + 0.5, b.j + 0.5) - Hh * 0.5 + ly, TW() * 0.32, 1.6 * S); c.restore(); return; }
  // ---- POWER PLANT ----
  if (b.cooling && b.state === 'intact') { var cy0 = isoY(b.i + 0.5, b.j + 0.5) + ly, cTop = cy0 - Hh; c.save(); c.strokeStyle = darken(b.col, -0.2); c.lineWidth = 1.4 * S;
    c.beginPath(); c.moveTo(cxp - TW() * 0.26, cy0); c.lineTo(cxp - TW() * 0.13, cTop); c.lineTo(cxp + TW() * 0.13, cTop); c.lineTo(cxp + TW() * 0.26, cy0); c.stroke();
    c.globalAlpha = 0.18 + 0.12 * Math.sin(bgT * 1.5 + b.i); c.fillStyle = '#cfe0d0'; c.beginPath(); c.ellipse(cxp, cTop - 4 * S, TW() * 0.13, 3 * S, 0, 0, Math.PI * 2); c.fill(); c.restore(); return; }   // steam plume
  if (b.dome && b.state === 'intact') { c.save(); c.fillStyle = darken(b.col, 0.1); c.beginPath(); c.arc(cxp, topYp + 1 * S, TW() * 0.22, Math.PI, 0); c.fill(); c.strokeStyle = THEMES.powerplant.accent; c.lineWidth = 1.4 * S; c.globalAlpha = 0.6 + 0.3 * Math.sin(bgT * 4); c.stroke(); c.restore(); return; }   // reactor dome + hazard glow
  // ---- PORT / SHIPYARD ----
  if (b.crane && b.state === 'intact') { var qy = isoY(b.i + 0.5, b.j + 0.5) + ly, qTop = qy - Hh; c.save(); c.strokeStyle = THEMES.port.accent; c.lineWidth = 1.8 * S;
    c.beginPath(); c.moveTo(cxp - TW() * 0.18, qy); c.lineTo(cxp, qTop); c.lineTo(cxp + TW() * 0.18, qy); c.moveTo(cxp, qTop); c.lineTo(cxp + TW() * 0.34, qTop + 4 * S); c.stroke();
    c.fillStyle = THEMES.port.accent; c.beginPath(); c.arc(cxp + TW() * 0.34, qTop + 4 * S, 1.6 * S, 0, Math.PI * 2); c.fill(); c.restore(); return; }
  if (b.container && b.state !== 'rubble') { c.save(); var cc = ['#c44', '#4a8', '#48c', '#ca5'][(b.i + b.j) % 4]; c.globalAlpha = 0.55; c.fillStyle = cc; c.fillRect(cxp - TW() * 0.18, topYp - 2 * S, TW() * 0.36, 2.4 * S); c.restore(); return; }   // colourful stacked containers
  // ---- AMUSEMENT PARK ----
  if (b.ferris && b.state === 'intact') { var fcx = cxp, fcy = topYp - TW() * 0.22, fr = TW() * 0.3; c.save(); c.strokeStyle = THEMES.park.accent; c.lineWidth = 1.6 * S; c.beginPath(); c.arc(fcx, fcy, fr, 0, Math.PI * 2); c.stroke();
    var fa = bgT * 0.8; for (var sp = 0; sp < 8; sp++) { var ang = fa + sp * Math.PI / 4; c.beginPath(); c.moveTo(fcx, fcy); c.lineTo(fcx + Math.cos(ang) * fr, fcy + Math.sin(ang) * fr * 0.6); c.stroke(); c.fillStyle = (sp % 2 ? THEMES.park.accent : '#8fe0ff'); c.beginPath(); c.arc(fcx + Math.cos(ang) * fr, fcy + Math.sin(ang) * fr * 0.6, 1.8 * S, 0, Math.PI * 2); c.fill(); } c.restore(); return; }
  if (b.coaster && b.state === 'intact') { c.save(); c.strokeStyle = THEMES.park.accent; c.lineWidth = 1.6 * S; c.beginPath(); c.moveTo(cxp - TW() * 0.24, topYp + 2 * S); c.quadraticCurveTo(cxp, topYp - 10 * S, cxp + TW() * 0.24, topYp + 2 * S); c.stroke(); c.restore(); return; }   // coaster loop
  if (b.bigtop && b.state !== 'rubble') { c.save(); c.fillStyle = THEMES.park.accent; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(cxp - TW() * 0.22, topYp + 3 * S); c.lineTo(cxp, topYp - 6 * S); c.lineTo(cxp + TW() * 0.22, topYp + 3 * S); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.globalAlpha = 0.5; for (var st = -1; st <= 1; st++) { c.beginPath(); c.moveTo(cxp + st * TW() * 0.1, topYp + 2 * S); c.lineTo(cxp, topYp - 6 * S); c.lineTo(cxp + (st + 0.5) * TW() * 0.1, topYp + 2 * S); c.closePath(); c.fill(); } c.restore(); return; }   // striped big-top
  // ---- CATHEDRAL / OLD TOWN ----
  if (b.spire && b.state === 'intact') { c.save(); c.fillStyle = darken(b.col, 0.12); c.beginPath(); c.moveTo(cxp - TW() * 0.12, topYp + 2 * S); c.lineTo(cxp, topYp - 12 * S); c.lineTo(cxp + TW() * 0.12, topYp + 2 * S); c.closePath(); c.fill(); c.fillStyle = THEMES.cathedral.accent; c.fillRect(cxp - 0.8 * S, topYp - 16 * S, 1.6 * S, 4 * S); c.fillRect(cxp - 2.4 * S, topYp - 14 * S, 4.8 * S, 1.4 * S); c.restore(); return; }   // pointed spire + a gold cross
  if (b.clock && b.state === 'intact') { c.save(); c.fillStyle = THEMES.cathedral.accent; c.globalAlpha = 0.9; c.beginPath(); c.arc(cxp, topYp - 2 * S, TW() * 0.1, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#3a2e10'; c.lineWidth = 1 * S; var ha = bgT * 0.5; c.beginPath(); c.moveTo(cxp, topYp - 2 * S); c.lineTo(cxp + Math.cos(ha) * TW() * 0.06, topYp - 2 * S + Math.sin(ha) * TW() * 0.06); c.stroke(); c.restore(); return; }   // clock face + hand
  if (b.oldhouse && b.state !== 'rubble') { c.save(); c.fillStyle = darken(b.col, 0.1); c.beginPath(); c.moveTo(cxp - TW() * 0.2, topYp + 2 * S); c.lineTo(cxp, topYp - 4 * S); c.lineTo(cxp + TW() * 0.2, topYp + 2 * S); c.closePath(); c.fill(); c.restore(); return; }   // pitched stone roof
}
// full iso cuboid over footprint (b.i,b.j,b.fw,b.fd); H=height px; lean shifts the TOP
function isoBox(c, b, Hh, col, lit, lx, ly) {
  var i = b.i, j = b.j, fw = b.fw, fd = b.fd;
  var A = [isoX(i, j), isoY(i, j)], B = [isoX(i + fw, j), isoY(i + fw, j)], C = [isoX(i + fw, j + fd), isoY(i + fw, j + fd)], D = [isoX(i, j + fd), isoY(i, j + fd)];
  var At = [A[0] + lx, A[1] - Hh + ly], Bt = [B[0] + lx, B[1] - Hh + ly], Ct = [C[0] + lx, C[1] - Hh + ly], Dt = [D[0] + lx, D[1] - Hh + ly];
  var colL = darken(col, -0.42), colR = darken(col, -0.22);
  c.fillStyle = colL; c.beginPath(); c.moveTo(D[0], D[1]); c.lineTo(C[0], C[1]); c.lineTo(Ct[0], Ct[1]); c.lineTo(Dt[0], Dt[1]); c.closePath(); c.fill();   // left face (D-C)
  c.fillStyle = colR; c.beginPath(); c.moveTo(B[0], B[1]); c.lineTo(C[0], C[1]); c.lineTo(Ct[0], Ct[1]); c.lineTo(Bt[0], Bt[1]); c.closePath(); c.fill();   // right face (B-C)
  if (Hh > BH() * 0.9 && lit != null && lit >= 0) {
    var floors = Math.round(Hh / BH());
    c.strokeStyle = 'rgba(0,0,0,0.20)'; c.lineWidth = 1;
    for (var f = 1; f < floors; f++) { var t = f / floors; c.beginPath(); c.moveTo(GF.lerp(D[0], Dt[0], t), GF.lerp(D[1], Dt[1], t)); c.lineTo(GF.lerp(C[0], Ct[0], t), GF.lerp(C[1], Ct[1], t)); c.lineTo(GF.lerp(B[0], Bt[0], t), GF.lerp(B[1], Bt[1], t)); c.stroke(); }
    for (var f2 = 0; f2 < floors; f2++) if (((f2 * 7 + (lit * 60 | 0)) % 3) < 1) { var tt = (f2 + 0.5) / floors; var wx = GF.lerp(C[0], Ct[0], tt), wy = GF.lerp(C[1], Ct[1], tt); c.fillStyle = 'rgba(255,224,150,0.75)'; c.fillRect(wx - TW() * 0.16, wy - 1.5 * GF.S - TH() * 0.18, TW() * 0.12, 2.2 * GF.S); c.fillRect(wx + TW() * 0.05, wy - 1.5 * GF.S + TH() * 0.18, TW() * 0.12, 2.2 * GF.S); }
  }
  c.fillStyle = col; c.beginPath(); c.moveTo(At[0], At[1]); c.lineTo(Bt[0], Bt[1]); c.lineTo(Ct[0], Ct[1]); c.lineTo(Dt[0], Dt[1]); c.closePath(); c.fill();   // top
  c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1; c.stroke();
  // rooftop detail
  if (lit != null && Hh > BH() * 1.4) {
    var mx = (At[0] + Ct[0]) / 2, my = (At[1] + Ct[1]) / 2;
    c.fillStyle = darken(col, -0.15); c.beginPath(); c.moveTo(GF.lerp(At[0], mx, 0.35), GF.lerp(At[1], my, 0.35)); c.lineTo(GF.lerp(Bt[0], mx, 0.35), GF.lerp(Bt[1], my, 0.35)); c.lineTo(GF.lerp(Ct[0], mx, 0.35), GF.lerp(Ct[1], my, 0.35)); c.lineTo(GF.lerp(Dt[0], mx, 0.35), GF.lerp(Dt[1], my, 0.35)); c.closePath(); c.fill();   // parapet inset
    if (b.roof >= 1) { c.fillStyle = darken(col, -0.3); var ru = 4 * GF.S; c.fillRect(mx - ru, my - ru * 1.6, ru * 2, ru * 1.6); }   // rooftop unit
    if (b.antenna) { c.strokeStyle = '#aab'; c.lineWidth = 1.4 * GF.S; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx, my - 14 * GF.S); c.stroke(); c.fillStyle = (Math.sin(bgT * 4) > 0) ? '#ff4d4d' : '#7a2020'; c.beginPath(); c.arc(mx, my - 14 * GF.S, 2 * GF.S, 0, Math.PI * 2); c.fill(); }
  }
}
function drawChunks(c) { for (var i = 0; i < chunks.length; i++) { var k = chunks[i], a = Math.min(1, k.life), sz = k.s * (0.7 + 0.3 * Math.sin(k.rot)); c.globalAlpha = a; c.fillStyle = k.col; c.fillRect(k.x - sz / 2, k.y - sz / 2, sz, sz); c.fillStyle = darken(k.col, -0.3); c.fillRect(k.x - sz / 2, k.y, sz, sz / 2); } c.globalAlpha = 1; }
function drawDust(c) {
  var grains = mobileFx() ? (dust.length > 45 ? 2 : 3) : 5;
  for (var i = 0; i < dust.length; i++) {
    var d = dust[i], k = d.t / d.life, r = d.r0 * (0.45 + k * 0.9), a = Math.max(0, 0.22 * (1 - k)), dx = (d.dx || 0) * k, rise = d.rise || (22 * GF.S);
    for (var p = 0; p < grains; p++) {
      var seed = (d.x * 0.13 + d.y * 0.19 + i * 47.3 + p * 97.1), nx = fxRand(seed) - 0.5, ny = fxRand(seed + 11.7) - 0.5;
      var px = d.x + dx + nx * r * 1.35, py = d.y - k * rise + ny * r * 0.48 - p * 2.2 * GF.S;
      var sz = Math.max(1.2 * GF.S, (1.8 + fxRand(seed + 23.9) * 3.2) * GF.S * (1 - k * 0.35));
      c.globalAlpha = a * (0.45 + fxRand(seed + 31.5) * 0.45);
      c.fillStyle = d.color || '#8c8578';
      c.fillRect(px - sz * 0.5, py - sz * 0.32, sz * (0.9 + fxRand(seed + 41.2) * 1.8), Math.max(1, sz * 0.42));
    }
  }
  c.globalAlpha = 1;
}
function drawFires(c) { var tongues = mobileFx() ? (fires.length > 10 ? 1 : 2) : 4; for (var i = 0; i < fires.length; i++) { var f = fires[i], k = f.t / f.life, a = Math.max(0, 1 - k); for (var p = 0; p < tongues; p++) { var fl = 0.6 + 0.4 * Math.sin(bgT * 12 + p * 2 + i), fx = f.x + (p - (tongues - 1) / 2) * f.r * 0.4, fy = f.y - p * 2 * GF.S; var fg = c.createRadialGradient(fx, fy, 1, fx, fy, f.r * fl * 0.6); fg.addColorStop(0, 'rgba(255,240,150,' + (0.7 * a) + ')'); fg.addColorStop(0.5, 'rgba(255,130,40,' + (0.5 * a) + ')'); fg.addColorStop(1, 'rgba(120,30,10,0)'); c.fillStyle = fg; c.beginPath(); c.ellipse(fx, fy, f.r * 0.4 * fl, f.r * 0.7 * fl, 0, 0, Math.PI * 2); c.fill(); } } }
function drawSmoke(c) { var blobs = mobileFx() ? (smoke.length > 4 ? 1 : 2) : 3; for (var i = 0; i < smoke.length; i++) { var s = smoke[i]; if (s.t < 0) continue; var life = s.life || 6, rise = s.t * (s.rise || (26 * GF.S)), alpha = Math.max(0, 0.45 - s.t / life * 0.45), drift = (s.dx || 0) * Math.min(1, s.t / life), ss = s.seed || (s.x * 0.17 + s.y * 0.31 + i * 19.7); for (var p = 0; p < blobs; p++) { var jx = fxChaos(ss + p * 53.1, s.t * (0.65 + p * 0.19)) * s.r * TW() * 0.24, jy = fxChaos(ss + p * 71.9 + 11, s.t * (0.52 + p * 0.17)) * s.r * TH() * 0.06; c.globalAlpha = alpha * (1 - p * 0.25); c.fillStyle = s.color || '#2a2622'; c.beginPath(); c.arc(s.x + drift + jx, s.y - rise - p * 16 * GF.S + jy, (12 + s.t * 10 + p * 6) * GF.S, 0, Math.PI * 2); c.fill(); } } c.globalAlpha = 1; }
function drawFireballs(c) {
  var density = fireballs.length > 1 ? Math.max(0.45, 1 / Math.sqrt(fireballs.length * 0.45)) : 1;
  var cheap = mobileFx() || fireballs.length > 5;
  for (var i = 0; i < fireballs.length; i++) { var fb = fireballs[i]; if (fb.t < 0) continue;
    var life = fb.life || 1.1, k = Math.min(0.999, fb.t / life), grow = Math.sin(k * Math.PI * 0.92), fade = Math.max(0, 1 - k), sz = fb.r * TW() * (0.55 + grow * 1.28) * (fb.sc || 1);
    var seed = fb.seed || ((fb.img || 0) * 919 + i * 137 + 17), heat = hexColor(fb.tint, '#ff7a35'), accent = hexColor(fb.accent, '#ffd24a'), core = mixHex(accent, '#ffffff', 0.44);
    function br(n, salt) { return fxRand(seed + n * 29.7 + (salt || 0) * 73.3); }
    c.save();
    c.translate(fb.x, fb.y - sz * (0.08 + k * 0.12));
    if (fb.rot) c.rotate(fb.rot * (1 + k * 0.4));
    c.scale(fb.flip || 1, 0.78 + k * 0.34);
    c.globalCompositeOperation = 'lighter';
    drawExplosionAsset(c, 'fire', fb.assetFire || fb.img || 0, 0, 0, sz * 0.72, sz * 0.6, br(23, 1) * Math.PI * 2, (cheap ? 0.16 : 0.24) * fade, 'lighter');
    if (!cheap || i < 3) drawExplosionAsset(c, 'flash', fb.assetFlash || 0, 0, 0, sz * 0.42, sz * 0.34, br(24, 1) * Math.PI * 2, 0.15 * fade, 'lighter');
    var shell = c.createRadialGradient(0, 0, 2, 0, 0, sz * 0.48);
    shell.addColorStop(0, rgba(core, 0.78 * fade));
    shell.addColorStop(0.28, rgba(accent, 0.68 * fade));
    shell.addColorStop(0.62, rgba(heat, 0.48 * fade));
    shell.addColorStop(1, 'rgba(70,24,10,0)');
    c.fillStyle = shell; c.beginPath(); c.ellipse(0, 0, sz * 0.45, sz * 0.38, 0, 0, Math.PI * 2); c.fill();
    for (var l = 0, lobes = Math.max(cheap ? 2 : 5, Math.round((cheap ? 4 : 9) * density)); l < lobes; l++) {
      var a = l / lobes * Math.PI * 2 + br(l, 1) * 0.9 + k * (0.5 + br(l, 2) * 0.8), dist = sz * (0.06 + br(l, 3) * 0.24) * (0.7 + k * 0.55);
      var lx = Math.cos(a) * dist, ly = Math.sin(a) * dist * 0.72, rr = sz * (0.13 + br(l, 4) * 0.16) * (1 - k * 0.18);
      c.globalAlpha = (cheap ? 0.2 : 0.75 + br(l, 5) * 0.25) * fade;
      if (cheap) c.fillStyle = l % 3 ? rgba(accent, 0.72) : rgba(heat, 0.62);
      else {
        var g = c.createRadialGradient(lx - rr * 0.15, ly - rr * 0.18, 1, lx, ly, rr);
        g.addColorStop(0, rgba(core, 0.72 * fade));
        g.addColorStop(0.42, rgba(l % 3 ? accent : heat, 0.5 * fade));
        g.addColorStop(1, rgba(heat, 0));
        c.fillStyle = g;
      }
      c.beginPath(); c.ellipse(lx, ly, rr * (0.9 + br(l, 6) * 0.55), rr * (0.62 + br(l, 7) * 0.5), a * 0.3, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 0.22 * fade;
    c.fillStyle = fb.smoke || 'rgba(40,34,29,1)';
    drawExplosionAsset(c, 'smoke', fb.assetSmoke || 0, 0, 0, sz * 0.52, sz * 0.36, br(25, 1) * Math.PI * 2, 0.09 * fade, null);
    for (var s = 0, sm = Math.max(cheap ? 1 : 2, Math.round((cheap ? 2 : 5) * density)); s < sm; s++) {
      var sa = s / sm * Math.PI * 2 + br(s, 8), sd = sz * (0.18 + br(s, 9) * 0.24);
      c.beginPath(); c.ellipse(Math.cos(sa) * sd, Math.sin(sa) * sd * 0.62, sz * (0.12 + br(s, 10) * 0.12), sz * (0.07 + br(s, 11) * 0.08), sa, 0, Math.PI * 2); c.fill();
    }
    c.restore();   // seeded canvas-only fireball: no sprite decode or fixed sheet frame
  }
}
function drawOrbitals(c) {   // ORBITAL STRIKE: a kinetic rod beam slamming down from above onto ground zero, then a cyan impact disc
  for (var i = 0; i < orbitals.length; i++) { var o = orbitals[i], S = GF.S, k = Math.min(1, o.t / 0.35);
    var topY = -10 * S, impY = o.y, fall = GF.lerp(topY, impY, k * k);   // rod accelerates down
    if (k < 1) { var lg = c.createLinearGradient(o.x, fall - 80 * S, o.x, fall); lg.addColorStop(0, 'rgba(127,212,255,0)'); lg.addColorStop(1, 'rgba(207,238,255,0.95)'); c.strokeStyle = lg; c.lineWidth = 5 * S; c.beginPath(); c.moveTo(o.x, fall - 80 * S); c.lineTo(o.x, fall); c.stroke();
      c.fillStyle = '#eaf6ff'; c.beginPath(); c.arc(o.x, fall, 4 * S, 0, Math.PI * 2); c.fill(); }
    if (k >= 1) { var ik = (o.t - 0.35) / 0.55, ia = Math.max(0, 1 - ik), rr = o.r * TW() / 2 * (0.4 + ik * 1.1), ry = o.r * TH() / 2 * (0.4 + ik * 1.1);   // expanding cyan impact disc on the deck
      c.save(); c.globalAlpha = ia; c.shadowColor = '#7fd4ff'; c.shadowBlur = mobileFx() ? 0 : (16 * S); c.strokeStyle = '#cfeeff'; c.lineWidth = 4 * S; c.beginPath(); c.ellipse(o.x, o.y + TH() / 2, rr, ry, 0, 0, Math.PI * 2); c.stroke(); c.restore();
      c.save(); c.globalAlpha = ia * 0.8; var cg = c.createLinearGradient(o.x, o.y - 120 * S, o.x, o.y); cg.addColorStop(0, 'rgba(127,212,255,0)'); cg.addColorStop(1, 'rgba(127,212,255,' + (0.5 * ia) + ')'); c.fillStyle = cg; c.fillRect(o.x - 9 * S, o.y - 120 * S, 18 * S, 120 * S); c.restore(); }   // lingering plasma column
  }
}
function drawMeltZones(c) {   // MELTDOWN: a glowing radioactive disc on the ground that creeps outward (cyan-green, hot rim)
  for (var i = 0; i < meltZones.length; i++) { var Z = meltZones[i], S = GF.S, gx = isoX(Z.ci, Z.cj), gy = isoY(Z.ci, Z.cj) + TH() / 2, rx = Z.r * TW() / 2, ry = Z.r * TH() / 2;
    var a = Z.t > 3.5 ? Math.max(0, 1 - (Z.t - 3.5) / 1.0) : 1;
    c.save(); var g = c.createRadialGradient(gx, gy, 2, gx, gy, rx); g.addColorStop(0, 'rgba(180,255,90,' + (0.10 * a) + ')'); g.addColorStop(0.7, 'rgba(120,220,80,' + (0.16 * a) + ')'); g.addColorStop(1, 'rgba(120,220,80,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(gx, gy, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = (0.4 + 0.3 * Math.sin(bgT * 4)) * a; c.strokeStyle = THEMES.powerplant.accent; c.lineWidth = 2.5 * S; c.beginPath(); c.ellipse(gx, gy, rx, ry, 0, 0, Math.PI * 2); c.stroke();   // hot creeping rim
    c.restore();
  }
}
function drawFireworkBursts(c) {   // FIREWORKS: coloured aerial shell-bursts popping above the park
  for (var i = 0; i < fireworkBursts.length; i++) { var f = fireworkBursts[i]; if (f.t < 0) continue; var S = GF.S, k = Math.min(1, f.t / 0.9), a = Math.max(0, 1 - k), rr = (6 + k * 26) * S;
    c.save(); c.globalAlpha = a; for (var p = 0; p < 12; p++) { var ang = p * Math.PI / 6; c.strokeStyle = f.col; c.lineWidth = 1.6 * S; c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + Math.cos(ang) * rr, f.y + Math.sin(ang) * rr); c.stroke(); c.fillStyle = f.col; c.beginPath(); c.arc(f.x + Math.cos(ang) * rr, f.y + Math.sin(ang) * rr, 1.6 * S, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
}
function drawFaults(c) {   // SEISMIC: a jagged glowing crack tears across the ground along the fault line, widening then fading
  for (var i = 0; i < faults.length; i++) { var f = faults[i], S = GF.S, k = Math.min(1, f.t / 0.4), a = Math.max(0, 1 - (f.t - 0.4) / 0.7);
    var dx = Math.cos(f.ang), dy = Math.sin(f.ang), half = f.len * 0.5 * k;
    c.save(); c.globalAlpha = a; c.strokeStyle = '#c98a3a'; c.shadowColor = '#ff8a3b'; c.shadowBlur = mobileFx() ? 0 : (10 * S); c.lineWidth = (2 + f.w) * S;
    c.beginPath(); var steps = 16;
    for (var s = 0; s <= steps; s++) { var tt = (s / steps - 0.5) * 2, along = tt * half, jit = (s % 2 ? 1 : -1) * (0.18 + Math.random() * 0.12);
      var pci = f.ci + dx * along - dy * jit, pcj = f.cj + dy * along + dx * jit, px = isoX(pci, pcj), py = isoY(pci, pcj) + TH() / 2;
      c[s ? 'lineTo' : 'moveTo'](px, py); }
    c.stroke();
    c.shadowBlur = 0; c.globalAlpha = a * 0.6; c.strokeStyle = '#ffcf8a'; c.lineWidth = 1 * S; c.stroke();
    c.restore();
  }
}
function drawMushroom(c, m) {
  var cheap = mobileFx(), S = GF.S, x = m.x, y = m.y, t = m.t, pf = m.prof || {}, cloudT = t < 0.7 ? t : 0.7 + (t - 0.7) * 2.5, rise = Math.min(1, cloudT / ((cheap ? 1.55 : 2.2) * (pf.lift || 1))), sc = m.scale, alpha = Math.max(0, 1 - (cloudT - (cheap ? 1.55 : 3.0)) / (cheap ? 1.0 : 1.7));
  var blast = hexColor(m.tint, '#ff8a3b'), accent = hexColor(m.accent, '#ffd24a'), secondary = hexColor(m.secondary, '#fff4b8'), impact = m.impact || 'hot_bloom';
  var smokeCol = hexColor(pf.smoke, '#2c2926'), seed = pf.seed || 7;
  function rnd(i, salt) { return fxRand(seed + i * 37.17 + (salt || 0) * 101.3); }
  function blob(px, py, rx, ry, rot, inner, mid, outer, a, op) {
    if (a <= 0 || rx <= 0 || ry <= 0) return;
    c.save();
    c.globalAlpha = a;
    if (op) c.globalCompositeOperation = op;
    var g = c.createRadialGradient(px - rx * 0.16, py - ry * 0.22, 2, px, py, Math.max(rx, ry));
    g.addColorStop(0, rgba(inner, 0.96));
    g.addColorStop(0.42, rgba(mid, 0.6));
    g.addColorStop(1, rgba(outer, 0));
    c.fillStyle = g; c.beginPath(); c.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  c.save();
  c.globalAlpha = alpha;
  if (t < 0.7) { var fk = 1 - t / 0.7, fr = (50 + 80 * (1 - fk)) * S * sc; var fg = c.createRadialGradient(x, y, 2, x, y, fr);   // white-hot core -> collectible-coloured fireball
    fg.addColorStop(0, rgba(secondary, fk)); fg.addColorStop(0.32, rgba(accent, fk * 0.92)); fg.addColorStop(0.68, rgba(blast, fk * 0.65)); fg.addColorStop(1, rgba(blast, 0));
    c.fillStyle = fg; c.beginPath(); c.arc(x, y, fr, 0, Math.PI * 2); c.fill(); }
  var plumeK = 0.9 + 0.12 * rise, liftK = 0.88 + 0.14 * rise;
  var lean = pf.lean || 0, topX = x + lean * (122 + 18 * rise) * S * sc, topY = y - (248 * liftK * (0.94 + (pf.lift || 1) * 0.06)) * S * sc, stemW = (30 + 5 * rise) * S * sc * (pf.stem || 1);                                                // tall glowing column
  var capR = (146 * plumeK) * S * sc * (pf.cap || 1), capSX = pf.capSquash || 1, capSY = 1.05 + (1 - capSX) * 0.35, billows = pf.billows || (cheap ? 13 : 24), cloudA = alpha * GF.clamp((cloudT - 0.16) / 0.54, 0, 1);
  var freeT = GF.clamp((cloudT - 0.18) / (cheap ? 1.0 : 1.35), 0, 1.25), freeU = Math.min(1, freeT), freeE = freeU * freeU * (3 - 2 * freeU);
  var sg = c.createLinearGradient(x, topY, x, y); sg.addColorStop(0, rgba(secondary, 0.22 * cloudA)); sg.addColorStop(0.5, rgba(blast, 0.2 * cloudA)); sg.addColorStop(1, 'rgba(62,56,52,' + (0.1 * cloudA) + ')');
  c.fillStyle = sg; c.beginPath(); c.moveTo(x - stemW * 0.24, y); c.lineTo(topX - stemW * 0.42, topY); c.lineTo(topX + stemW * 0.42, topY); c.lineTo(x + stemW * 0.24, y); c.closePath(); c.fill();
  var sourceProgress = GF.clamp((cloudT - 0.08) / (cheap ? 1.18 : 1.58), 0, 1);
  var sourceAsset2 = mushroomSourceAsset(pf.mushroomMask2 || 0);
  if (sourceAsset2) {
    var capMaskW = capR * (1.26 + rnd(72, 1) * 0.36) * capSX, capMaskH = capR * (0.92 + rnd(73, 1) * 0.24) * capSY, capMaskX = topX + lean * capR * 0.18, capMaskY = topY - capR * 0.12;
    drawMushroomSourcePuffs(c, sourceAsset2, capMaskX, capMaskY, capMaskW, capMaskH, sourceProgress, seed + 1300, cloudA * (cheap ? 0.24 : 0.32), { smoke: smokeCol, heat: blast, core: secondary }, { cropA: 0, cropB: 0.68, hot: false, lean: lean * 0.35, warp: (pf.maskWarp || 0.04) * 0.22, rot: (pf.maskRot || 0) * -0.7, count: cheap ? 14 : 46, reveal: 1, chaos: 0, chaosT: sourceProgress, steady: true });
    if (!cheap) drawMushroomSourceLayer(c, sourceAsset2, capMaskX, capMaskY, capMaskW, capMaskH, sourceProgress, seed + 1350, cloudA * 0.008, { smoke: smokeCol, heat: blast, core: secondary }, { cropA: 0, cropB: 0.68, hot: false, lean: lean * 0.35, warp: (pf.maskWarp || 0.04) * 0.18, flip: pf.maskFlip || 1, rot: (pf.maskRot || 0) * -0.7, reveal: 1, chaos: 0, chaosT: sourceProgress });
  }
  blob(topX, topY - capR * 0.18, capR * capSX * 1.08, capR * capSY * 0.43, lean * 0.16, mixHex(smokeCol, blast, 0.18), smokeCol, '#171412', cloudA * 0.43, null);
  for (var looseCap = 0, looseCapN = cheap ? 3 : 7; looseCap < looseCapN; looseCap++) {
    var lc1 = rnd(looseCap, 81), lc2 = rnd(looseCap, 82), lc3 = rnd(looseCap, 83), lc4 = rnd(looseCap, 84);
    var looseMove = freeE * (0.35 + lc2 * 0.9);
    var lx0 = (lc1 - 0.5) * capR * capSX * (1.35 + lc2 * 0.4), ly0 = -capR * (0.08 + lc3 * 0.52) + (lc4 - 0.5) * capR * capSY * 0.42;
    var lx = topX + lx0 * (1 + looseMove * (0.05 + lc3 * 0.08));
    var ly = topY + ly0 * (1 + looseMove * (0.035 + lc2 * 0.06)) - capR * (0.045 + lc4 * 0.035) * looseMove;
    var lr = capR * (0.13 + lc4 * 0.18);
    blob(lx, ly, lr * (1.15 + lc2 * 0.9) * capSX, lr * (0.62 + lc3 * 0.72) * capSY, lean * 0.14 + (lc1 - 0.5) * 1.1, mixHex(smokeCol, blast, 0.1), smokeCol, '#11100f', cloudA * (0.13 + lc3 * 0.13) * (0.45 + freeE * 0.55), null);
  }
  var capJx = (rnd(0, 91) - 0.5) * capR * capSX * 0.08 * freeE, capJy = ((rnd(0, 92) - 0.5) * capR * 0.04 - capR * 0.018) * freeE;
  drawExplosionAsset(c, 'smoke', pf.assetSmoke || 0, topX + capJx, topY - capR * 0.19 + capJy, capR * capSX * 0.74, capR * capSY * 0.34, lean * 0.2 + (pf.twist || 0) * 0.08 + freeE * 0.08, cloudA * 0.12, null);
  drawExplosionAsset(c, 'fire', pf.assetFire || 0, topX - capJx * 0.55, topY - capR * 0.12 - capJy * 0.35, capR * capSX * 0.44, capR * capSY * 0.23, lean * 0.18 - freeE * 0.07, cloudA * 0.055, 'lighter');
  for (var sf = 0, smokeF = Math.min(pf.smokeFlecks || (cheap ? 7 : 14), cheap ? 10 : 20); sf < smokeF; sf++) {
    var sr1 = rnd(sf, 41), sr2 = rnd(sf, 42), sr3 = rnd(sf, 43), smokeLoose = freeE * (0.25 + sr1 * 0.75);
    var sx10 = (sr2 - 0.5) * capR * capSX * (1.15 + sr1 * 0.45), sy10 = -capR * (0.08 + sr3 * 0.5) + (sr1 - 0.5) * capR * capSY * 0.38;
    var sx1 = topX + sx10 * (1 + smokeLoose * (0.045 + sr3 * 0.06)), sy1 = topY + sy10 * (1 + smokeLoose * (0.035 + sr2 * 0.055)) - capR * 0.035 * smokeLoose;
    var sw1 = capR * (0.035 + sr1 * 0.075), sh1 = sw1 * (0.45 + sr2 * 0.75);
    c.save(); c.globalAlpha = cloudA * (0.09 + sr3 * 0.09); c.fillStyle = sr2 > 0.48 ? mixHex(smokeCol, '#0e0d0c', 0.42) : mixHex(smokeCol, blast, 0.12); c.beginPath(); c.ellipse(sx1, sy1, sw1, sh1, lean * 0.18 + (sr1 - 0.5) * 1.1, 0, Math.PI * 2); c.fill(); c.restore();
  }
  for (var p = 0; p < billows; p++) {
    var n1 = rnd(p, 1), n2 = rnd(p, 2), n3 = rnd(p, 3), n4 = rnd(p, 4), billowLoose = freeE * (0.22 + n1 * 0.78);
    var px0 = (n1 - 0.5) * capR * capSX * (1.55 + n2 * 0.5), py0 = -capR * (0.12 + n3 * 0.48) + (n4 - 0.5) * capR * capSY * 0.5, pr = capR * (0.16 + n4 * 0.28) * (0.95 + ((pf.plumeSc || 1) - 1) * 0.35);
    var px = topX + px0 * (1 + billowLoose * (0.06 + n4 * 0.08)), py = topY + py0 * (1 + billowLoose * (0.04 + n2 * 0.055)) - capR * (0.05 + n3 * 0.04) * billowLoose;
    blob(px, py, pr * (0.9 + n2 * 0.75) * capSX, pr * (0.72 + n3 * 0.52) * capSY, lean * 0.18 + (n1 - 0.5) * 0.5, mixHex(smokeCol, blast, 0.16), smokeCol, '#151210', cloudA * (0.28 + n2 * 0.25), null);
  }
  if (impact === 'cool_ring' || impact === 'glass_comet' || impact === 'blackbox_rod') {
    c.globalAlpha = alpha * 0.72; c.strokeStyle = rgba(accent, 0.9); c.shadowColor = accent; c.shadowBlur = mobileFx() ? 0 : ((cheap ? 6 : 12) * S); c.lineWidth = 3 * S;
    c.beginPath(); c.ellipse(topX, topY + capR * 0.02, capR * 0.78 * capSX, capR * 0.24 * capSY, lean * 0.12, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0;
  }
  if (impact === 'firework' || impact === 'cap_pop' || impact === 'solar_crown') {
    c.globalAlpha = alpha * 0.82; c.strokeStyle = rgba(accent, 0.95); c.lineWidth = 2.2 * S;
    for (var r = 0, rays = cheap ? 8 : 12; r < rays; r++) { var ra = r / rays * Math.PI * 2 + cloudT * 0.5 + (pf.twist || 0), r1 = capR * 0.54, r2 = capR * (0.82 + (r % 3) * 0.08); c.beginPath(); c.moveTo(topX + Math.cos(ra) * r1, topY + Math.sin(ra) * r1 * 0.42); c.lineTo(topX + Math.cos(ra) * r2, topY + Math.sin(ra) * r2 * 0.42); c.stroke(); }
  }
  if (impact === 'candy_fission') {
    for (var b = 0, bits = cheap ? 4 : 7; b < bits; b++) { var ba = b / bits * Math.PI * 2 + cloudT + (pf.twist || 0), br = capR * (0.36 + (b % 3) * 0.14); c.globalAlpha = alpha * 0.7; c.fillStyle = b % 2 ? rgba(accent, 0.72) : rgba(blast, 0.72); c.beginPath(); c.arc(topX + Math.cos(ba) * br, topY + Math.sin(ba) * br * 0.42, (5 + b % 3 * 2) * S * sc, 0, Math.PI * 2); c.fill(); }
  }
  if (impact === 'slime_splat') {
    c.globalAlpha = alpha * 0.5; c.fillStyle = rgba(accent, 0.72);
    for (var sl = 0, splats = cheap ? 3 : 5; sl < splats; sl++) { var sa = sl / splats * Math.PI * 2 + (pf.twist || 0); c.beginPath(); c.ellipse(x + Math.cos(sa) * capR * 0.45 * capSX, y + TH() * 0.25 + Math.sin(sa) * capR * 0.09, capR * 0.18, capR * 0.07, sa, 0, Math.PI * 2); c.fill(); }
  }
  if (impact === 'grin_cloud') {
    c.globalAlpha = alpha * 0.72; c.fillStyle = 'rgba(3,3,3,0.72)';
    c.beginPath(); c.ellipse(topX - capR * 0.15 * capSX, topY - capR * 0.04, 4 * S * sc, 6 * S * sc, lean * 0.1, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(topX + capR * 0.15 * capSX, topY - capR * 0.04, 4 * S * sc, 6 * S * sc, lean * 0.1, 0, Math.PI * 2); c.fill();
    c.lineWidth = 3 * S * sc; c.strokeStyle = 'rgba(3,3,3,0.64)'; c.beginPath(); c.arc(topX, topY + capR * 0.08, capR * 0.18, 0.1, Math.PI - 0.1); c.stroke();
  }
  if (impact === 'last_button') {
    c.globalAlpha = alpha * 0.65; c.strokeStyle = rgba(blast, 0.9); c.shadowColor = blast; c.shadowBlur = mobileFx() ? 0 : ((cheap ? 8 : 16) * S); c.lineWidth = 3 * S;
    for (var hr = 0, rings = cheap ? 2 : 3; hr < rings; hr++) { c.beginPath(); c.ellipse(x + lean * capR * 0.18, y + TH() * 0.34, capR * (0.36 + hr * 0.22 + cloudT * 0.04) * capSX, capR * (0.11 + hr * 0.06), lean * 0.12, 0, Math.PI * 2); c.stroke(); }
  }
  c.restore();
}
function drawInterceptors(c) {
  for (var i = 0; i < interceptors.length; i++) { var it = interceptors[i];
    c.strokeStyle = 'rgba(40,200,115,0.72)'; c.lineWidth = 2.4 * GF.S; c.beginPath();
    for (var t2 = 0; t2 < it.trail.length; t2++) c[t2 ? 'lineTo' : 'moveTo'](it.trail[t2].x, it.trail[t2].y); c.stroke();
    c.save(); c.shadowColor = PB.glow; c.shadowBlur = mobileFx() ? 0 : (8 * GF.S); c.fillStyle = PB.hi; c.beginPath(); c.arc(it.x, it.y, 3.2 * GF.S, 0, Math.PI * 2); c.fill(); c.restore();
  }
}
function drawShip(c, sp) {
  if (sp.state === 'gone') return;
  var bobY = Math.sin(bgT * 1.6 + sp.bob) * 2.2 * GF.S * fit;
  var x = isoX(sp.ci + 0.5, sp.cj + 0.5) + sp.ox, y = isoY(sp.ci + 0.5, sp.cj + 0.5) + sp.oy + bobY + sp.sink * 24 * GF.S;
  var L = (sp.big ? 21 : 13) * GF.S * fit, hh = (sp.big ? 8 : 5.5) * GF.S * fit, a = Math.max(0, 1 - sp.sink);
  c.save(); c.translate(x, y); c.rotate(sp.tilt); c.globalAlpha = a;
  c.fillStyle = 'rgba(30,200,115,0.16)'; c.beginPath(); c.ellipse(0, hh * 0.7, L * 0.7, hh * 0.5, 0, 0, Math.PI * 2); c.fill();   // wake
  c.fillStyle = sp.state === 'afloat' ? PB.mid : PB.lo; c.beginPath(); c.moveTo(-L, -hh * 0.2); c.lineTo(L, -hh * 0.2); c.lineTo(L * 0.68, hh * 0.7); c.lineTo(-L * 0.68, hh * 0.7); c.closePath(); c.fill();   // hull
  c.lineWidth = 1.3 * GF.S; c.strokeStyle = PB.hi; c.stroke();
  c.fillStyle = PB.hi; c.fillRect(-L * 0.32, -hh * 1.1, L * 0.5, hh * 0.9);   // deckhouse
  if (sp.big) c.fillRect(L * 0.28, -hh * 1.7, hh * 0.5, hh * 1.5);   // funnel
  c.restore();
}
function drawShips(c) {
  for (var s = 0; s < ships.length; s++) drawShip(c, ships[s]);
}
function drawPlanes(c) {
  for (var i = 0; i < planes.length; i++) { var pn = planes[i], S = GF.S; c.save(); c.translate(pn.x, pn.y); if (pn.state !== 'fly') c.rotate(pn.rot); else if (pn.dir < 0) c.scale(-1, 1);
    c.fillStyle = pn.state === 'fly' ? PB.mid : PB.lo;
    c.beginPath(); c.moveTo(-11 * S, 0); c.lineTo(9 * S, -0.5 * S); c.lineTo(7 * S, 2 * S); c.lineTo(-10 * S, 2.5 * S); c.closePath(); c.fill();   // fuselage
    c.beginPath(); c.moveTo(-1 * S, 0); c.lineTo(2 * S, 9 * S); c.lineTo(5 * S, 9 * S); c.lineTo(3 * S, 0); c.closePath(); c.fill();              // wing down
    c.beginPath(); c.moveTo(-1 * S, 1 * S); c.lineTo(2 * S, -8 * S); c.lineTo(5 * S, -8 * S); c.lineTo(3 * S, 1 * S); c.closePath(); c.fill();      // wing up
    c.beginPath(); c.moveTo(-11 * S, 0); c.lineTo(-13 * S, -4 * S); c.lineTo(-8 * S, 0.5 * S); c.closePath(); c.fill();                            // tail
    if (pn.state === 'fly' && Math.sin((bgT + pn.blink) * 6) > 0.55) { c.fillStyle = PB.hi; c.beginPath(); c.arc(9 * S, 0.5 * S, 1.7 * S, 0, Math.PI * 2); c.fill(); }   // nav light
    c.restore();
  }
}
function drawZombies(c) {
  for (var i = 0; i < zombies.length; i++) { var z = zombies[i], S = GF.S;
    var x = isoX(z.ci, z.cj), y = isoY(z.ci, z.cj), sway = Math.sin(z.t * 6 + z.ci) * 1.5 * S * fit, hh = (z.big ? 11 : 9) * S * fit;
    c.save(); c.translate(x + sway, y);
    if (z.state === 'dead') { c.globalAlpha = Math.max(0, 1 - z.fall / 0.8); c.rotate(z.fall * 1.8 * (z.big ? 1 : -1)); }   // crumple on death
    c.fillStyle = z.state === 'dead' ? PB.lo : THEMES.quarantine.accent; c.globalAlpha = (c.globalAlpha || 1) * 0.9;
    c.fillRect(-1.6 * S, -hh, 3.2 * S, hh * 0.6);   // torso
    c.beginPath(); c.arc(0, -hh - 1 * S, 2.1 * S, 0, Math.PI * 2); c.fill();   // head
    c.strokeStyle = c.fillStyle; c.lineWidth = 1.4 * S;   // shambling outstretched arms + legs
    c.beginPath(); c.moveTo(-1.6 * S, -hh * 0.7); c.lineTo(-5 * S, -hh * 0.55 + Math.sin(z.t * 6) * 1.5 * S); c.moveTo(1.6 * S, -hh * 0.7); c.lineTo(5 * S, -hh * 0.55 - Math.sin(z.t * 6) * 1.5 * S); c.stroke();
    c.beginPath(); c.moveTo(-0.8 * S, -hh * 0.4); c.lineTo(-2.4 * S + Math.sin(z.t * 6) * 1.5 * S, 0); c.moveTo(0.8 * S, -hh * 0.4); c.lineTo(2.4 * S - Math.sin(z.t * 6) * 1.5 * S, 0); c.stroke();
    c.restore();
  }
}
function drawWarhead(c) {
  if (!warhead) return;
  var S = GF.S, x = warhead.sx, y = warhead.y, pal = collectiblePalette(), body = pal.body;
  function roundRect(x0, y0, w, h, r) { if (c.roundRect) c.roundRect(x0, y0, w, h, r); else c.rect(x0, y0, w, h); }
  c.save();
  c.translate(x, y);
  var wobble = Math.sin(bgT * 11 + y * 0.01) * 0.045;
  c.rotate(wobble);
  c.save();
  if (pal.trail === 'white_beam' || body === 'rod') {
    c.strokeStyle = rgba(pal.accent, 0.72); c.shadowColor = pal.accent; c.shadowBlur = mobileFx() ? 0 : (13 * S); c.lineWidth = 3 * S;
    c.beginPath(); c.moveTo(0, -42 * S); c.lineTo(0, -13 * S); c.stroke();
  } else {
    var tg = c.createLinearGradient(0, -39 * S, 0, -6 * S);
    tg.addColorStop(0, rgba(pal.blast, 0)); tg.addColorStop(0.45, rgba(pal.blast, 0.28)); tg.addColorStop(1, rgba(pal.accent, 0.72));
    c.fillStyle = tg; c.shadowColor = pal.blast; c.shadowBlur = mobileFx() ? 0 : (12 * S); c.beginPath(); c.ellipse(0, -23 * S, 6.5 * S, 18 * S, 0, 0, Math.PI * 2); c.fill();
    if (pal.trail === 'triple' || pal.trail === 'rotor_sparks') { c.fillStyle = rgba(pal.secondary, 0.36); c.beginPath(); c.ellipse(-6 * S, -20 * S, 2.5 * S, 12 * S, 0, 0, Math.PI * 2); c.ellipse(6 * S, -20 * S, 2.5 * S, 12 * S, 0, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
  var icon = collectibleFrame(pal.animId, pal.assetId);
  if (icon && icon.complete && icon.naturalWidth) {
    var sz = GF.clamp(50 * S, 36, 72);
    c.rotate(-wobble);
    c.save();
    c.shadowColor = pal.accent; c.shadowBlur = mobileFx() ? 0 : (10 * S);
    c.drawImage(icon, -sz / 2, -sz / 2, sz, sz);
    c.restore();
    c.restore();
    return;
  }
  c.shadowColor = pal.primary; c.shadowBlur = mobileFx() ? 0 : (8 * S); c.lineWidth = 1.4 * S; c.strokeStyle = '#061008'; c.fillStyle = pal.primary;
  if (body === 'drone') {
    c.beginPath(); roundRect(-13 * S, -7 * S, 26 * S, 17 * S, 5 * S); c.fill(); c.stroke();
    c.fillStyle = pal.accent; c.beginPath(); c.arc(-15 * S, -10 * S, 5 * S, 0, Math.PI * 2); c.arc(15 * S, -10 * S, 5 * S, 0, Math.PI * 2); c.fill();
    c.strokeStyle = pal.secondary; c.lineWidth = 1.2 * S; c.beginPath(); c.moveTo(-20 * S, -10 * S); c.lineTo(-10 * S, -10 * S); c.moveTo(10 * S, -10 * S); c.lineTo(20 * S, -10 * S); c.stroke();
  } else if (body === 'barrel') {
    c.beginPath(); roundRect(-7 * S, -16 * S, 14 * S, 30 * S, 3 * S); c.fill(); c.stroke();
    c.fillStyle = pal.secondary; c.fillRect(-6 * S, -9 * S, 12 * S, 3 * S); c.fillRect(-6 * S, 5 * S, 12 * S, 3 * S);
  } else if (body === 'crate') {
    c.rotate(-0.08); c.beginPath(); roundRect(-10 * S, -12 * S, 20 * S, 24 * S, 3 * S); c.fill(); c.stroke();
    c.strokeStyle = pal.secondary; c.lineWidth = 1.5 * S; c.beginPath(); c.moveTo(-8 * S, -8 * S); c.lineTo(8 * S, 8 * S); c.moveTo(8 * S, -8 * S); c.lineTo(-8 * S, 8 * S); c.stroke();
  } else if (body === 'crystal') {
    c.beginPath(); c.moveTo(0, 16 * S); c.lineTo(8 * S, 3 * S); c.lineTo(5 * S, -13 * S); c.lineTo(0, -19 * S); c.lineTo(-5 * S, -13 * S); c.lineTo(-8 * S, 3 * S); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = rgba(pal.secondary, 0.68); c.beginPath(); c.moveTo(0, -15 * S); c.lineTo(3 * S, 2 * S); c.lineTo(0, 12 * S); c.lineTo(-2 * S, 1 * S); c.closePath(); c.fill();
  } else if (body === 'rod') {
    c.beginPath(); roundRect(-3.5 * S, -22 * S, 7 * S, 39 * S, 3 * S); c.fill(); c.stroke();
    c.fillStyle = pal.accent; c.fillRect(-5 * S, -2 * S, 10 * S, 3 * S);
  } else if (body === 'skull') {
    c.beginPath(); c.ellipse(0, -3 * S, 11 * S, 13 * S, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillRect(-7 * S, 6 * S, 14 * S, 8 * S);
    c.fillStyle = '#050505'; c.beginPath(); c.ellipse(-4 * S, -4 * S, 2.4 * S, 3.4 * S, 0, 0, Math.PI * 2); c.ellipse(4 * S, -4 * S, 2.4 * S, 3.4 * S, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = pal.accent; c.fillRect(-4 * S, 8 * S, 8 * S, 2 * S);
  } else if (body === 'button') {
    c.beginPath(); c.ellipse(0, -2 * S, 13 * S, 10 * S, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = pal.accent; c.beginPath(); c.ellipse(0, -6 * S, 8 * S, 4 * S, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = pal.secondary; c.fillRect(-2 * S, -15 * S, 4 * S, 8 * S);
  } else {
    c.beginPath();
    if (body === 'pod') { c.moveTo(0, 15 * S); c.lineTo(9 * S, 1 * S); c.lineTo(7 * S, -12 * S); c.quadraticCurveTo(0, -19 * S, -7 * S, -12 * S); c.lineTo(-9 * S, 1 * S); }
    else if (body === 'capsule') { roundRect(-7 * S, -17 * S, 14 * S, 31 * S, 7 * S); }
    else { c.moveTo(0, 15 * S); c.lineTo(5 * S, 2 * S); c.lineTo(4 * S, -12 * S); c.lineTo(0, -18 * S); c.lineTo(-4 * S, -12 * S); c.lineTo(-5 * S, 2 * S); }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = pal.secondary; c.fillRect(-8 * S, -14 * S, 3 * S, 6 * S); c.fillRect(5 * S, -14 * S, 3 * S, 6 * S);
  }
  c.shadowBlur = 0;
  if (pal.style === 'hazard') { c.strokeStyle = '#17110a'; c.lineWidth = 2 * S; c.beginPath(); c.moveTo(-8 * S, -2 * S); c.lineTo(8 * S, 7 * S); c.moveTo(-7 * S, -10 * S); c.lineTo(7 * S, -2 * S); c.stroke(); }
  if (pal.style === 'candy') { c.fillStyle = rgba(pal.secondary, 0.9); c.beginPath(); c.arc(-3 * S, -5 * S, 1.8 * S, 0, Math.PI * 2); c.arc(4 * S, 2 * S, 1.5 * S, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = pal.accent; c.shadowColor = pal.accent; c.shadowBlur = mobileFx() ? 0 : (8 * S); c.beginPath(); c.arc(0, body === 'button' ? -6 * S : -2 * S, 2.6 * S, 0, Math.PI * 2); c.fill();
  c.restore();
}
function drawBlastPreview(c) {
  var ci = aim.ci, cj = aim.cj, x = isoX(ci, cj), y = isoY(ci, cj) + TH() / 2;
  c.save();
  // Keep the target readable without laying large guide lines over the upgrade grid.
  c.globalAlpha = 0.92; c.strokeStyle = PB.warn; c.lineWidth = 1.7 * GF.S; var rs = 13 * GF.S;
  c.beginPath(); c.moveTo(x - rs, y); c.lineTo(x - rs * 0.4, y); c.moveTo(x + rs * 0.4, y); c.lineTo(x + rs, y); c.moveTo(x, y - rs); c.lineTo(x, y - rs * 0.4); c.moveTo(x, y + rs * 0.4); c.lineTo(x, y + rs); c.stroke();
  c.strokeStyle = PB.paper; c.globalAlpha = 0.72;
  c.beginPath(); c.arc(x, y, rs * 0.4, 0, Math.PI * 2); c.stroke();
  if (_press) { c.globalAlpha = 0.9; c.lineWidth = 2 * GF.S; c.beginPath(); c.arc(x, y, rs * 1.6, 0, Math.PI * 2); c.stroke(); }   // grab ring while you hold/drag the target
  c.restore();
}

function drawHUD(c) {
  var S = GF.S, W = GF.W, hudH = R.field ? R.field.y : 48 * S; c.textBaseline = 'middle';
  c.save();
  var hg = c.createLinearGradient(0, 0, 0, hudH);
  hg.addColorStop(0, 'rgba(35,31,20,0.98)');
  hg.addColorStop(1, 'rgba(20,17,10,0.96)');
  c.fillStyle = hg; c.fillRect(0, 0, W, hudH);
  c.fillStyle = 'rgba(216,197,154,0.05)'; c.fillRect(0, Math.max(0, hudH - 17 * S), W, 17 * S);
  c.strokeStyle = 'rgba(216,197,154,0.38)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, hudH - 0.5); c.lineTo(W, hudH - 0.5); c.stroke();
  c.restore();
  var chipW = GF.clamp(154 * S, 118, 210), chipH = GF.clamp(33 * S, 29, 43);
  uiPanel(c, 8 * S, 8 * S, chipW, chipH, 4 * S, 'rgba(12,23,14,0.68)', 'rgba(84,255,150,0.24)');
  c.fillStyle = PB.lo; c.font = uiFont(GF.clamp(8.7 * S, 7.5, 12), '800'); c.textAlign = 'left'; c.fillText(T('armory'), 17 * S, 17 * S);
  c.fillStyle = PB.success; c.font = uiFont(GF.clamp(15 * S, 12, 21), '900'); c.fillText(fmt(Math.round(dispMoney)) + ' ' + T('caps'), 17 * S, 32 * S);
  var name = levelName || (T('tier' + Math.min(cityTier, 5)) + (cityTier > 5 ? ' +' + (cityTier - 5) : ''));
  c.fillStyle = PB.paper; c.font = uiFont(GF.clamp(12 * S, 10, 16), '900'); c.textAlign = 'center'; c.fillText(name, W / 2, 14 * S);
  var bw = GF.clamp(W * 0.5, 120, 340), bx = W / 2 - bw / 2, byy = 27 * S, bh = 10 * S, frac = GF.clamp(destroyedW / totalW, 0, 1);
  c.lineWidth = 1; c.strokeStyle = 'rgba(216,197,154,0.48)'; c.strokeRect(bx, byy, bw, bh); c.fillStyle = '#0f0d08'; c.fillRect(bx + 1, byy + 1, bw - 2, bh - 2);
  var wp = wipePct();
  if (frac > 0) { c.fillStyle = frac >= wp ? PB.success : PB.mid; c.fillRect(bx + 1, byy + 1, (bw - 2) * frac, bh - 2); }
  c.fillStyle = PB.warn; c.fillRect(bx + bw * wp - 1 * S, byy - 2 * S, 2 * S, bh + 4 * S);
  c.fillStyle = PB.paper; c.font = uiFont(GF.clamp(9.8 * S, 8.5, 13), '800'); c.fillText(T('destroyed') + ' ' + Math.round(frac * 100) + '% / ' + Math.round(wp * 100) + '%', W / 2, byy + bh + 9 * S);
  if (hasWater && ships.length && gs === 'AIM') { var sunk = 0; for (var sj = 0; sj < ships.length; sj++) if (ships[sj].state !== 'afloat') sunk++; c.fillStyle = PB.lo; c.font = uiFont(GF.clamp(8.5 * S, 7, 11), '700'); c.fillText(T('ships_bonus') + '  (' + sunk + '/' + ships.length + ')', W / 2, byy + bh + 19 * S); }
  cornerBtn(c, R.stats); var stx = R.stats.x + R.stats.w / 2, sty = R.stats.y + R.stats.h / 2; c.fillStyle = PB.hi; for (var sb = 0; sb < 3; sb++) c.fillRect(stx - 7 * S, sty - 5 * S + sb * 5 * S, (5 + sb * 4) * S, 2.6 * S);   // stats icon (bars)
  var dailyHi = (tutStep === 4 && !dailyOpen);   // tutorial daily step: make the crate read as the active foreground target
  if (dailyHi) {
    c.save(); uiPanel(c, R.daily.x, R.daily.y, R.daily.w, R.daily.h, 4 * S, rgba(PB.paper, 0.94), PB.warn); c.restore();
  } else cornerBtn(c, R.daily);
  var dax = R.daily.x + R.daily.w / 2, dayc = R.daily.y + R.daily.h / 2, dr = R.daily.w * 0.24;   // daily ration crate
  c.strokeStyle = dailyHi ? '#3a2600' : PB.hi; c.lineWidth = (dailyHi ? 2.3 : 1.6) * S; c.strokeRect(dax - dr, dayc - dr * 0.85, dr * 2, dr * 1.7); c.beginPath(); c.moveTo(dax - dr, dayc - dr * 0.85 + dr * 0.55); c.lineTo(dax + dr, dayc - dr * 0.85 + dr * 0.55); c.moveTo(dax, dayc - dr * 0.85); c.lineTo(dax, dayc + dr * 0.85); c.stroke();
  if (dailyClaimable() && !dailyHi) { var pl = 0.5 + 0.5 * Math.sin(bgT * 5); c.save(); c.globalAlpha = 0.55 + 0.45 * pl; c.fillStyle = PB.warn; c.beginPath(); c.arc(R.daily.x + R.daily.w - 6 * S, R.daily.y + 6 * S, 3.8 * S, 0, Math.PI * 2); c.fill(); c.restore(); }   // pulsing "ration ready" dot
  cornerBtn(c, R.missions); drawMissionsIcon(c, R.missions.x + R.missions.w / 2, R.missions.y + R.missions.h / 2, R.missions.w * 0.28);
  if (R.view) { cornerBtn(c, R.view); drawEyeIcon(c, R.view.x + R.view.w / 2, R.view.y + R.view.h / 2, R.view.w * 0.30, cityView); }
  cornerBtn(c, R.mute); drawSettingsIcon(c, R.mute.x + R.mute.w / 2, R.mute.y + R.mute.h / 2, R.mute.w * 0.28);
}
function cornerBtn(c, b) { if (!b) return; uiPanel(c, b.x, b.y, b.w, b.h, 5 * GF.S, 'rgba(16,19,12,0.92)', 'rgba(216,197,154,0.36)'); }
function drawEyeIcon(c, x, y, r, active) {
  var S = GF.S;
  c.save(); c.translate(x, y); c.strokeStyle = active ? PB.warn : PB.hi; c.fillStyle = active ? PB.warn : PB.hi; c.lineWidth = Math.max(1.3, 1.8 * S); c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-r * 1.25, 0); c.quadraticCurveTo(0, -r * 0.86, r * 1.25, 0); c.quadraticCurveTo(0, r * 0.86, -r * 1.25, 0); c.stroke();
  c.beginPath(); c.arc(0, 0, r * 0.42, 0, Math.PI * 2); c.fill();
  if (active) { c.globalAlpha = 0.28; c.beginPath(); c.arc(0, 0, r * 1.34, 0, Math.PI * 2); c.fill(); }
  c.restore();
}
function drawMissionsIcon(c, x, y, r) {
  var S = GF.S;
  c.save(); c.translate(x, y); c.strokeStyle = PB.warn; c.fillStyle = PB.warn; c.lineWidth = Math.max(1.2, 1.8 * S); c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeRect(-r * 0.82, -r * 1.04, r * 1.64, r * 2.08);
  for (var i = 0; i < 3; i++) {
    var yy = -r * 0.58 + i * r * 0.58;
    c.beginPath(); c.moveTo(-r * 0.52, yy); c.lineTo(-r * 0.36, yy + r * 0.15); c.lineTo(-r * 0.12, yy - r * 0.18); c.stroke();
    c.beginPath(); c.moveTo(r * 0.08, yy); c.lineTo(r * 0.52, yy); c.stroke();
  }
  c.restore();
}
function drawSettingsIcon(c, x, y, r) {
  var S = GF.S;
  c.save(); c.translate(x, y); c.strokeStyle = PB.hi; c.fillStyle = PB.hi; c.lineWidth = Math.max(1.2, 1.7 * S);
  for (var i = 0; i < 8; i++) { c.save(); c.rotate(i * Math.PI / 4); c.fillRect(-1.2 * S, -r - 1.5 * S, 2.4 * S, 4.5 * S); c.restore(); }
  c.beginPath(); c.arc(0, 0, r * 0.72, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, r * 0.26, 0, Math.PI * 2); c.fill();
  c.restore();
}
function bigBtn(c, b, label, sub, accent, dark) {
  var S = GF.S, stroke = accent || PB.warn;
  uiPanel(c, b.x, b.y, b.w, b.h, 7 * S, dark ? PB.success : 'rgba(38,34,22,0.96)', dark ? 'rgba(84,255,150,0.76)' : stroke);
  c.save(); c.globalAlpha = dark ? 0.18 : 0.68; c.fillStyle = dark ? '#ffffff' : stroke; c.fillRect(b.x + 8 * S, b.y + 7 * S, 3 * S, b.h - 14 * S); c.restore();
  c.textAlign = 'center'; c.textBaseline = sub ? 'alphabetic' : 'middle'; c.fillStyle = dark ? '#031009' : PB.paper; c.font = uiFont(GF.clamp(15 * S, 12, 21), '900');
  c.fillText(label, b.x + b.w / 2, sub ? b.y + b.h * 0.45 : b.y + b.h / 2);
  if (sub) { c.fillStyle = dark ? 'rgba(3,16,9,0.78)' : PB.mid; c.font = uiFont(GF.clamp(12 * S, 10, 16), '800'); c.textBaseline = 'top'; c.fillText(sub, b.x + b.w / 2, b.y + b.h * 0.56); }
}
function fitMono(c, text, maxW, px, minPx, weight) {
  px = Math.round(px); minPx = Math.round(minPx || 8); weight = weight || 'bold';
  c.font = weight + ' ' + px + 'px ui-monospace,monospace';
  while (px > minPx && c.measureText(text).width > maxW) {
    px -= 1;
    c.font = weight + ' ' + px + 'px ui-monospace,monospace';
  }
  return px;
}
function modalBtn(c, b, label, fill, ink, stroke) {
  var S = GF.S;
  uiPanel(c, b.x, b.y, b.w, b.h, 4 * S, fill, stroke || PB.rule);
  c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
  fitMono(c, label, b.w - 24 * S, GF.clamp(12.5 * S, 10, 16), 8, '900');
  c.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
}
function drawCoach(c) {
  var S = GF.S, text = T('tap_to_nuke'), tw;
  c.font = uiFont(GF.clamp(12.5 * S, 10.5, 17), '900'); tw = c.measureText(text).width;
  var bw = Math.min(GF.W - 24 * S, tw + 34 * S), bx = GF.W / 2 - bw / 2, by = R.field.y + 10 * S, bh = GF.clamp(30 * S, 25, 38);
  uiPanel(c, bx, by, bw, bh, 4 * S, 'rgba(38,34,22,0.84)', PB.rule);
  c.fillStyle = PB.paper; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, GF.W / 2, by + bh / 2);
}
function drawVaultBoy(c, x, y, s) {   // cheerful Fallout-style mascot (thumbs up)
  c.save(); c.translate(x, y); c.scale(s, s); var m = PB.mid, d = PB.bg, hi = PB.hi; c.fillStyle = m; c.strokeStyle = d; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-15, 40); c.quadraticCurveTo(-21, 12, -12, 3); c.lineTo(12, 3); c.quadraticCurveTo(21, 12, 15, 40); c.closePath(); c.fill(); c.stroke();   // body
  c.beginPath(); c.moveTo(-13, 4); c.lineTo(-25, -1); c.lineTo(-28, -21); c.lineTo(-19, -21); c.lineTo(-18, -6); c.lineTo(-9, -1); c.closePath(); c.fill(); c.stroke();   // raised arm
  c.beginPath(); c.arc(-23.5, -24, 4.4, 0, Math.PI * 2); c.fill(); c.stroke();   // thumb
  c.beginPath(); c.ellipse(0, -15, 17, 19, 0, 0, Math.PI * 2); c.fill(); c.stroke();   // head
  c.beginPath(); c.arc(-17, -15, 3.6, 0, Math.PI * 2); c.arc(17, -15, 3.6, 0, Math.PI * 2); c.fill(); c.stroke();   // ears
  c.fillStyle = hi; c.beginPath(); c.moveTo(-15, -25); c.quadraticCurveTo(-7, -39, 2, -30); c.quadraticCurveTo(9, -40, 16, -27); c.quadraticCurveTo(4, -33, -13, -21); c.closePath(); c.fill();   // hair
  c.fillStyle = d; c.beginPath(); c.arc(-6, -15, 2.3, 0, Math.PI * 2); c.arc(8, -15, 2.3, 0, Math.PI * 2); c.fill();   // eyes
  c.strokeStyle = d; c.lineWidth = 2.4; c.beginPath(); c.arc(1, -10, 9, 0.12 * Math.PI, 0.88 * Math.PI); c.stroke();   // smile
  c.restore();
}
function drawUpgradeCoach(c) {   // first-purchase tutorial: Vault-Boy points you at YIELD after your first throw
  var S = GF.S, W = GF.W, H = GF.H, yp = null;
  for (var i = 0; i < (R.perk || []).length; i++) if (R.perk[i].id === 'yield') yp = R.perk[i];
  if (!yp) return;
  var ypx = yp.x + yp.w / 2, ypy = yp.y + yp.h / 2, pulse = Math.sin(bgT * 4);
  c.save(); c.strokeStyle = PB.warn; c.lineWidth = 3 * S; c.globalAlpha = 0.55 + 0.35 * pulse; c.beginPath(); c.arc(ypx, ypy, yp.w * 0.62 + 3 * S * pulse, 0, Math.PI * 2); c.stroke(); c.restore();   // pulsing ring on YIELD
  var vx = GF.clamp(W * 0.17, 52, 92), vy = H * 0.82;
  var bw = GF.clamp(W * 0.6, 195, 310), bh = GF.clamp(56 * S, 46, 74), bx = vx + 22 * S, by = vy - 66 * S;
  GF.rr(c, bx, by, bw, bh, 10 * S); c.fillStyle = 'rgba(8,30,18,0.97)'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = PB.hi; c.stroke();
  c.fillStyle = 'rgba(8,30,18,0.97)'; c.beginPath(); c.moveTo(bx + 6 * S, by + bh); c.lineTo(bx - 8 * S, by + bh + 13 * S); c.lineTo(bx + 24 * S, by + bh); c.closePath(); c.fill();   // bubble tail to the mascot
  c.fillStyle = PB.hi; c.font = 'bold ' + GF.clamp(11 * S, 9, 14) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T('upg_coach'), bx + bw / 2, by + bh * 0.36);
  c.fillStyle = PB.warn; c.font = 'bold ' + GF.clamp(10.5 * S, 9, 14) + 'px ui-monospace,monospace'; c.fillText(T('tap_upgrade'), bx + bw / 2, by + bh * 0.72);
  drawVaultBoy(c, vx, vy, GF.clamp(0.85 * S, 0.6, 1.15));
}
function tutCaptionText() {
  if (tutStep === 0 || tutStep === 3 || tutStep === 7 || tutStep === 10) return T('tut_nuke1');
  if (tutStep === 1 || tutStep === 11) return T('tut_upgrade');
  if (tutStep === 4) return T('tut_daily');
  if (tutStep === 5) return T('tut_mirv');
  if (tutStep === 8) return T('tut_gift');
  return T('tut_nuke2');
}
function drawTutCaption(c, text, targetCy) {
  var W = GF.W, H = GF.H, S = GF.S, py = targetCy > H * 0.5 ? H * 0.17 : H * 0.83;
  c.font = uiFont(GF.clamp(13 * S, 11, 18), '900');
  var tw = c.measureText(text).width, pw = Math.min(W - 24 * S, tw + 70 * S), ph = GF.clamp(48 * S, 40, 62), px = W / 2 - pw / 2;
  uiPanel(c, px, py - ph / 2, pw, ph, 4 * S, 'rgba(38,34,22,0.96)', PB.warn);
  c.save(); c.globalAlpha = 0.68; drawVaultBoy(c, px + 25 * S, py + 2 * S, GF.clamp(0.42 * S, 0.32, 0.58)); c.restore();
  fitMono(c, text, pw - 72 * S, GF.clamp(13 * S, 11, 18), 8, '900');
  c.fillStyle = PB.paper; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, px + 47 * S + Math.min(c.measureText(text).width, pw - 72 * S) / 2, py);
}
function drawTutHand(c, tx, ty) {   // animated finger TAPPING the target (replaces the old pulsing ring)
  var S = GF.S, cyc = (bgT % 1.15) / 1.15;                       // one tap per 1.15s
  var tri = cyc < 0.5 ? cyc / 0.5 : 1 - (cyc - 0.5) / 0.5;       // up -> down -> up
  var ease = tri * tri * (3 - 2 * tri), lift = (1 - ease) * 17 * S, press = ease > 0.85;
  if (press) { var rp = (ease - 0.85) / 0.15; c.save(); c.globalAlpha = (1 - rp) * 0.6; c.strokeStyle = PB.warn; c.lineWidth = 2.6 * S; c.beginPath(); c.arc(tx, ty, (5 + rp * 22) * S, 0, Math.PI * 2); c.stroke(); c.restore(); }   // tap ripple on contact
  c.save(); c.translate(tx, ty - lift); var k = press ? 0.9 : 1; c.scale(k * S, k * S); c.rotate(-0.26); c.lineJoin = 'round'; c.lineCap = 'round';
  c.shadowColor = 'rgba(0,0,0,0.32)'; c.shadowBlur = mobileFx() ? 0 : (7); c.shadowOffsetX = 2; c.shadowOffsetY = 4; c.fillStyle = '#ffd9b0'; c.strokeStyle = '#7a4e2c'; c.lineWidth = 2.4;
  GF.rr(c, -15, 23, 30, 33, 13); c.fill(); c.stroke();           // palm / fist
  c.beginPath(); c.ellipse(-15, 31, 7, 10, -0.5, 0, Math.PI * 2); c.fill(); c.stroke();   // thumb
  GF.rr(c, -6, 0, 12, 30, 6); c.fill(); c.stroke();              // pointing finger (fingertip at the target)
  c.shadowColor = 'transparent'; c.strokeStyle = 'rgba(122,78,44,0.45)'; c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(-9, 36); c.lineTo(13, 36); c.moveTo(-10, 44); c.lineTo(14, 44); c.moveTo(-9, 51); c.lineTo(12, 51); c.stroke();   // knuckle creases
  c.restore();
}
function drawTutorial(c) {   // spotlight the live control, grey + lock everything else
  var W = GF.W, H = GF.H, S = GF.S, tt = tutTarget(), pulse = 0.5 + 0.5 * Math.sin(bgT * 4);
  c.save();
  if (tt) {
	    var isDaily = tt.id === 'daily', isGift = tt.id === 'gift', topBtn = isDaily || isGift;
	    var cx = tt.x + tt.w / 2, cy = tt.y + tt.h / 2, rad = (isGift ? tt.h * 2.0 : Math.max(tt.w, tt.h) * (tt.id === 'atom' ? 1.05 : topBtn ? 1.8 : 1.25)) + 5 * S * pulse;
    var rg = c.createRadialGradient(cx, cy, rad * 0.66, cx, cy, rad);   // transparent over the target, fading to a dim scrim everywhere else
    rg.addColorStop(0, 'rgba(18,15,9,0)'); rg.addColorStop(1, 'rgba(18,15,9,0.28)');   // light dim - the city stays clearly visible
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    if (isDaily && R.daily) {   // re-draw the daily crate on top of the scrim so it never appears behind the tutorial overlay
      c.save(); GF.rr(c, R.daily.x, R.daily.y, R.daily.w, R.daily.h, 7 * S); var dgr = c.createLinearGradient(R.daily.x, R.daily.y, R.daily.x, R.daily.y + R.daily.h); dgr.addColorStop(0, '#ffe79a'); dgr.addColorStop(1, PB.warn); c.shadowColor = PB.warn; c.shadowBlur = mobileFx() ? 0 : (16 * S); c.fillStyle = dgr; c.fill(); c.restore();
      var dx = R.daily.x + R.daily.w / 2, dy = R.daily.y + R.daily.h / 2, rr = R.daily.w * 0.24;
      c.strokeStyle = '#3a2600'; c.lineWidth = 2.3 * S; c.strokeRect(dx - rr, dy - rr * 0.85, rr * 2, rr * 1.7); c.beginPath(); c.moveTo(dx - rr, dy - rr * 0.85 + rr * 0.55); c.lineTo(dx + rr, dy - rr * 0.85 + rr * 0.55); c.moveTo(dx, dy - rr * 0.85); c.lineTo(dx, dy + rr * 0.85); c.stroke();
    }
	    if (topBtn) { c.save(); c.globalAlpha = 0.5 + 0.45 * pulse; c.shadowColor = PB.warn; c.shadowBlur = mobileFx() ? 0 : (18 * S); c.strokeStyle = PB.warn; c.lineWidth = 2.8 * S; if (isGift) { GF.rr(c, tt.x - 4 * S, tt.y - 4 * S, tt.w + 8 * S, tt.h + 8 * S, 6 * S); c.stroke(); } else { c.beginPath(); c.arc(cx, cy, Math.max(tt.w, tt.h) * 0.82, 0, Math.PI * 2); c.stroke(); } c.restore(); }
	    drawTutCaption(c, tutCaptionText(), cy);
	    drawTutHand(c, cx, topBtn ? cy + tt.h * 0.95 : cy);   // top buttons: hand sits below so the target itself stays visible
  }   // no scrim / no message during the blast+result - it auto-returns to the upgrade step
  c.restore();
}
function drawResultMetric(c, x, y, w, h, label, value, accent) {
  var S = GF.S;
  uiPanel(c, x, y, w, h, 6 * S, 'rgba(14,22,14,0.78)', 'rgba(216,197,154,0.22)');
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = PB.lo; c.font = uiFont(GF.clamp(8.8 * S, 7.5, 12), '800');
  c.fillText(label, x + 12 * S, y + h * 0.32);
  c.fillStyle = accent || PB.paper; fitMono(c, value, w - 24 * S, GF.clamp(16 * S, 13, 22), 10, '900');
  c.fillText(value, x + 12 * S, y + h * 0.68);
}
function drawResult(c) {
  var W = GF.W, H = GF.H, S = GF.S;
  R.again = R.next = R.dbl = R.offerChip = null;
  c.fillStyle = 'rgba(9,7,4,0.78)'; c.fillRect(0, 0, W, H); c.textAlign = 'center';
  var topPad = GF.clamp(62 * S, 48, 90), bottomReserve = GF.clamp((mobileView() ? 128 : 96) * S, 82, 160);
  var availH = Math.max(260 * S, H - topPad - bottomReserve);
  var pw = Math.min(W - 28 * S, 450), px = (W - pw) / 2;
  var ph = Math.min(availH, GF.clamp((resultWin ? 384 : 348) * S, resultWin ? 318 : 310, resultWin ? 470 : 420));
  var py = topPad + Math.max(0, (availH - ph) * 0.3);
  uiPanel(c, px, py, pw, ph, 9 * S, 'rgba(30,26,16,0.97)', resultWin ? 'rgba(84,255,150,0.5)' : 'rgba(216,197,154,0.36)');
  c.save(); c.globalAlpha = 0.45; c.fillStyle = resultWin ? PB.success : PB.warn; c.fillRect(px + 14 * S, py + 14 * S, 4 * S, 44 * S); c.restore();
  var pct = Math.round(resultPct * 100);
  var title = resultWin ? T('leveled') : (T('destroyed') + ' ' + pct + '%');
  c.fillStyle = resultWin ? PB.success : PB.paper; c.textBaseline = 'middle'; fitMono(c, title, pw - 52 * S, GF.clamp(30 * S, 22, 42), 16, '900'); c.fillText(title, W / 2, py + 39 * S);
  c.fillStyle = PB.lo; c.font = uiFont(GF.clamp(10.5 * S, 9, 14), '800'); c.fillText(levelName || T('tier' + Math.min(cityTier, 5)), W / 2, py + 64 * S);
  var statGap = 9 * S, statY = py + GF.clamp(86 * S, 72, 102), statH = GF.clamp(58 * S, 48, 72);
  var cols = W < 360 * S ? 1 : 2, statW = cols === 1 ? pw - 32 * S : (pw - 32 * S - statGap) / 2, sx = px + 16 * S;
  drawResultMetric(c, sx, statY, statW, statH, T('destroyed'), pct + '% / ' + Math.round(wipePct() * 100) + '%', resultWin ? PB.success : PB.paper);
  drawResultMetric(c, sx + (cols === 1 ? 0 : statW + statGap), statY + (cols === 1 ? statH + statGap : 0), statW, statH, T('earned'), '+' + fmt(dropEarned) + ' ' + T('caps'), PB.success);
  var detailY = statY + (cols === 1 ? (statH + statGap) * 2 : statH) + GF.clamp(20 * S, 14, 24);
  if (resultWin && lastPayout > 0) {
    c.fillStyle = PB.brass; c.font = uiFont(GF.clamp(13 * S, 11, 18), '900'); c.fillText(T('payout') + ' +' + fmt(lastPayout), W / 2, detailY); detailY += GF.clamp(19 * S, 15, 24);
  }
  if (lastCritBonus > 0) { c.fillStyle = PB.warn; c.font = uiFont(GF.clamp(12 * S, 10, 16), '900'); c.fillText(T('crit') + ' +' + fmt(lastCritBonus), W / 2, detailY); detailY += GF.clamp(18 * S, 14, 22); }
  if (lastShipsTotal > 0) { c.fillStyle = lastShipsSunk >= lastShipsTotal ? PB.paper : PB.mid; c.font = uiFont(GF.clamp(11.5 * S, 10, 15), '800'); c.fillText(T('ships_sunk') + ' ' + lastShipsSunk + '/' + lastShipsTotal, W / 2, detailY); detailY += GF.clamp(17 * S, 13, 21); }
  if (lastFarTotal > 0) { var farDone = lastFarRazed >= lastFarTotal; c.fillStyle = farDone ? PB.paper : PB.mid; c.font = uiFont(GF.clamp(11.5 * S, 10, 15), '800'); c.fillText(T('far_razed') + ' ' + lastFarRazed + '/' + lastFarTotal + (farDone ? '  ' + T('cleared') : ''), W / 2, detailY); detailY += GF.clamp(17 * S, 13, 21); }
  var bw = pw - 42 * S, bx = W / 2 - bw / 2, bh = GF.clamp(54 * S, 46, 66), btnY = py + ph - bh - 20 * S;
  if (!resultWin) {
    var msgLh = GF.clamp(15.5 * S, 13, 20), msgBoxH = GF.clamp((cityReinforced ? 86 : 68) * S, cityReinforced ? 76 : 58, cityReinforced ? 106 : 86);
    var msgTop = Math.max(detailY + 8 * S, btnY - msgBoxH - 18 * S);
    uiPanel(c, px + 16 * S, msgTop, pw - 32 * S, msgBoxH, 6 * S, 'rgba(42,32,17,0.46)', 'rgba(198,155,68,0.34)');
    c.fillStyle = PB.brass; c.font = uiFont(GF.clamp(12.5 * S, 10, 16), '900'); c.textBaseline = 'middle';
    var lastY = wrapCentre(c, T('not_enough'), W / 2, msgTop + msgLh * 1.25, pw - 62 * S, msgLh);
    if (cityReinforced) { c.fillStyle = PB.hi; c.font = uiFont(GF.clamp(10.8 * S, 9, 14), '800'); wrapCentre(c, T('reinforces'), W / 2, lastY + msgLh * 1.18, pw - 58 * S, msgLh); }
    R.again = { x: bx, y: btnY, w: bw, h: bh }; bigBtn(c, R.again, T('launch_again'), null, PB.success, true);
  } else {
    var stackTop = btnY;
    if (pendingDbl) {
      R.dbl = { x: bx, y: btnY - GF.clamp(48 * S, 40, 58) - 10 * S, w: bw, h: GF.clamp(48 * S, 40, 58) };
      modalBtn(c, R.dbl, godPower ? T('dbl_free') : T('dbl'), 'rgba(255,210,74,0.9)', '#191106', 'rgba(255,210,74,0.68)');
      stackTop = R.dbl.y;
    }
    if (offerChipOn) {
      var chipH = GF.clamp(34 * S, 28, 42);
      var chipY = stackTop - chipH - 8 * S;
      if (chipY >= detailY + 6 * S) {   // only when the modal has measured room above the button stack
        R.offerChip = { x: bx, y: chipY, w: bw, h: chipH };
        modalBtn(c, R.offerChip, T('deal_chip'), 'rgba(7,36,20,0.92)', '#54ff96', 'rgba(84,255,150,0.55)');
      }
    }
    R.next = { x: bx, y: btnY, w: bw, h: bh }; bigBtn(c, R.next, T('next_city'), null, PB.success, true);
  }
}
function drawHelp(c) {
  var W = GF.W, H = GF.H, S = GF.S;
  c.fillStyle = 'rgba(18,15,9,0.90)'; c.fillRect(0, 0, W, H);
  var pw = Math.min(W - 28 * S, 440), ph = Math.min(H - 100 * S, 330), px = (W - pw) / 2, py = (H - ph) / 2;
  uiPanel(c, px, py, pw, ph, 5 * S, 'rgba(38,34,22,0.98)', PB.rule);
  c.fillStyle = PB.warn; c.font = uiFont(GF.clamp(18 * S, 14, 24), '900'); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(T('help'), W / 2, py + 14 * S);
  var ty = py + GF.clamp(46 * S, 38, 60), lh = GF.clamp(16 * S, 13, 20); c.textAlign = 'left'; c.font = uiFont(GF.clamp(12.5 * S, 10, 16), '800');
  var lines = ['tut_goal', 'tut_controls', 'tut_tip'], cols = [PB.paper, PB.mid, PB.warn];
  for (var i = 0; i < lines.length; i++) { c.fillStyle = cols[i]; ty = wrapText(c, T(lines[i]), px + 16 * S, ty, pw - 32 * S, lh) + lh * 0.45; }
  var bw = GF.clamp(150 * S, 120, 210), bh = GF.clamp(40 * S, 34, 52), bx = W / 2 - bw / 2, by = py + ph - bh - 14 * S;
  uiPanel(c, bx, by, bw, bh, 4 * S, PB.paper, PB.rule); c.fillStyle = PB.ink; c.font = uiFont(GF.clamp(14 * S, 11, 18), '900'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T('close'), W / 2, by + bh / 2);
}

function atkIcon(c, id, x, y, s) {
  c.save(); c.translate(x, y); c.fillStyle = PB.hi;
  if (id === 'yield') { c.beginPath(); c.arc(0, 0, s, 0, Math.PI * 2); c.fill(); c.fillStyle = PB.bg; c.beginPath(); c.arc(0, 0, s * 0.4, 0, Math.PI * 2); c.fill(); }
  else if (id === 'flares') { for (var k = 0; k < 4; k++) { c.beginPath(); c.arc(Math.cos(k * 1.7) * s * 0.7, Math.sin(k * 1.7) * s * 0.7, s * 0.32, 0, Math.PI * 2); c.fill(); } }
  else if (id === 'pen') { c.beginPath(); c.moveTo(0, s); c.lineTo(s * 0.55, -s * 0.4); c.lineTo(-s * 0.55, -s * 0.4); c.closePath(); c.fill(); c.fillStyle = PB.lo; c.fillRect(-s * 0.2, -s, s * 0.4, s * 0.5); }
  else if (id === 'mirv') { for (var w = 0; w < 3; w++) { var ox = (w - 1) * s * 0.7; c.beginPath(); c.moveTo(ox, s * 0.6); c.lineTo(ox + s * 0.32, -s * 0.5); c.lineTo(ox - s * 0.32, -s * 0.5); c.closePath(); c.fill(); } }
  else if (id === 'shock') { c.strokeStyle = PB.hi; c.lineWidth = Math.max(1.4, s * 0.2); for (var rp = 1; rp <= 3; rp++) { c.beginPath(); c.arc(0, -s * 0.5, s * rp * 0.42, Math.PI * 0.12, Math.PI * 0.88); c.stroke(); } }   // SHOCKWAVE = ripples
  else if (id === 'emp') { c.strokeStyle = PB.hi; c.lineWidth = Math.max(1.4, s * 0.2); c.beginPath(); c.arc(0, 0, s * 0.9, 0, Math.PI * 2); c.stroke(); c.fillStyle = PB.hi; c.beginPath(); c.moveTo(s * 0.18, -s * 0.8); c.lineTo(-s * 0.34, s * 0.12); c.lineTo(s * 0.02, s * 0.12); c.lineTo(-s * 0.18, s * 0.8); c.lineTo(s * 0.36, -s * 0.12); c.lineTo(-s * 0.02, -s * 0.12); c.closePath(); c.fill(); }   // EMP = lightning bolt in a pulse ring
  else if (id === 'orbital') { c.strokeStyle = PB.hi; c.lineWidth = Math.max(1.4, s * 0.18); c.beginPath(); c.ellipse(0, -s * 0.7, s * 0.7, s * 0.28, 0, 0, Math.PI * 2); c.stroke(); c.fillStyle = PB.hi; c.beginPath(); c.moveTo(-s * 0.16, -s * 0.5); c.lineTo(s * 0.16, -s * 0.5); c.lineTo(0, s * 0.9); c.closePath(); c.fill(); }   // ORBITAL = satellite ring dropping a rod
  else if (id === 'cluster') { c.fillStyle = PB.hi; var cp = [[0, -s * 0.6], [-s * 0.62, s * 0.3], [s * 0.62, s * 0.3], [0, s * 0.05]]; for (var cl = 0; cl < cp.length; cl++) { c.beginPath(); c.arc(cp[cl][0], cp[cl][1], s * 0.26, 0, Math.PI * 2); c.fill(); } }   // CLUSTER = a scatter of bomblets
  else if (id === 'firestorm') { c.fillStyle = PB.hi; c.beginPath(); c.moveTo(0, s); c.bezierCurveTo(-s * 0.8, s * 0.3, -s * 0.3, -s * 0.2, 0, -s); c.bezierCurveTo(s * 0.3, -s * 0.2, s * 0.8, s * 0.3, 0, s); c.closePath(); c.fill(); c.fillStyle = PB.bg; c.beginPath(); c.moveTo(0, s * 0.7); c.bezierCurveTo(-s * 0.4, s * 0.15, -s * 0.15, -s * 0.1, 0, -s * 0.4); c.bezierCurveTo(s * 0.15, -s * 0.1, s * 0.4, s * 0.15, 0, s * 0.7); c.closePath(); c.fill(); }   // FIRESTORM = a flame
  else if (id === 'chain') { c.strokeStyle = PB.hi; c.lineWidth = Math.max(1.4, s * 0.22); for (var ck = 0; ck < 3; ck++) { c.beginPath(); c.ellipse(-s * 0.5 + ck * s * 0.5, 0, s * 0.32, s * 0.5, ck % 2 ? Math.PI / 2 : 0, 0, Math.PI * 2); c.stroke(); } }   // CHAIN = interlocked links
  else if (id === 'glass') { c.strokeStyle = PB.hi; c.lineWidth = Math.max(1.2, s * 0.16); c.beginPath(); c.arc(0, 0, s * 0.9, 0, Math.PI * 2); c.stroke(); c.fillStyle = PB.hi; for (var gs = 0; gs < 6; gs++) { var ga = gs * Math.PI / 3; c.beginPath(); c.moveTo(Math.cos(ga) * s * 0.3, Math.sin(ga) * s * 0.3); c.lineTo(Math.cos(ga + 0.2) * s * 0.85, Math.sin(ga + 0.2) * s * 0.85); c.lineTo(Math.cos(ga - 0.2) * s * 0.85, Math.sin(ga - 0.2) * s * 0.85); c.closePath(); c.fill(); } }   // GLASS STORM = shrapnel shards in a ring
  else if (id === 'seismic') { c.strokeStyle = PB.hi; c.lineWidth = Math.max(1.6, s * 0.2); c.beginPath(); c.moveTo(-s * 0.9, -s * 0.3); c.lineTo(-s * 0.3, s * 0.1); c.lineTo(0, -s * 0.4); c.lineTo(s * 0.3, s * 0.2); c.lineTo(s * 0.9, -s * 0.2); c.stroke(); c.lineWidth = Math.max(1, s * 0.12); c.beginPath(); c.moveTo(0, -s * 0.4); c.lineTo(-s * 0.15, s * 0.8); c.moveTo(s * 0.3, s * 0.2); c.lineTo(s * 0.2, s * 0.85); c.stroke(); }   // SEISMIC = a jagged fault line with cracks
  else if (id === 'inferno') { c.fillStyle = PB.hi; c.beginPath(); c.moveTo(0, s); c.bezierCurveTo(-s, s * 0.2, -s * 0.2, -s * 0.3, 0, -s); c.bezierCurveTo(s * 0.2, -s * 0.3, s, s * 0.2, 0, s); c.closePath(); c.fill(); c.fillStyle = PB.bg; c.beginPath(); c.arc(0, s * 0.2, s * 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = PB.hi; c.beginPath(); c.arc(0, s * 0.25, s * 0.18, 0, Math.PI * 2); c.fill(); }   // INFERNO = a big roiling fireball
  else if (id === 'eye') { c.strokeStyle = PB.hi; c.lineWidth = Math.max(1.4, s * 0.18); c.beginPath(); c.ellipse(0, 0, s * 0.98, s * 0.56, 0, 0, Math.PI * 2); c.stroke(); c.fillStyle = PB.hi; c.beginPath(); c.arc(0, 0, s * 0.34, 0, Math.PI * 2); c.fill(); }   // EYE = oversee / scout
  else { c.strokeStyle = PB.hi; c.fillStyle = PB.hi; c.lineWidth = Math.max(1.2, s * 0.16); c.beginPath(); c.arc(0, 0, s * 0.9, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, s * 0.62, 0, Math.PI * 2); c.stroke(); c.font = '900 ' + Math.max(8, s * 1.1) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 0, s * 0.05); }   // EXTRA INCOME = caps token (internal id is still luck)
  c.restore();
}
// ── RADIAL PIP-BOY UPGRADE OVERLAY (always-visible perk grid + central DETONATE) ──
// lay out N perks around the atom -> [{a:angle, rad:ring-radius, r:disc-radius}]. <=9 = one ring; 10+ = two concentric rings so discs never overlap or run off-screen.
function radialLayout(n, W, atomR) {
  var cx = R.actionCx || W / 2, cy = R.actionCy || (R.field.y + R.field.h * 0.5), edge = Math.min(cx - 18 * GF.S, W - cx - 18 * GF.S, cy - R.field.y - 18 * GF.S, R.field.y + R.field.h - cy - 18 * GF.S);
  var maxRad = Math.max(atomR + GF.clamp(72 * GF.S, 56, 96), edge);   // keep the outer ring inside the field
  var out = [];
  if (n <= 9) {
    var perkR1 = GF.clamp(W * (n <= 6 ? 0.093 : 0.082), n <= 6 ? 30 : 26, 62);
    var perkD1 = Math.min(GF.clamp(W * 0.305, 92, 250), maxRad - perkR1 - 14 * GF.S);
    var diag = n === 4 ? [-2.356, -0.785, 2.356, 0.785] : null;
    for (var i = 0; i < n; i++) out.push({ a: diag ? diag[i] : (-90 + i * (360 / n)) * Math.PI / 180, rad: perkD1, r: perkR1 });
    return out;
  }
  // two rings: fewer on the inner, the rest on the outer (denser ring gets the larger radius/circumference)
  var inN = Math.max(4, Math.round(n * 0.42)), outN = n - inN;
  var perkR2 = GF.clamp(W * 0.066, 22, 40);                                   // smaller discs at high counts
  var outRad = Math.min(GF.clamp(W * 0.36, 120, 270), maxRad - perkR2 - 8 * GF.S);
  var inRad = Math.max(atomR + perkR2 + 12 * GF.S, outRad * 0.56);
  for (var k = 0; k < inN; k++) out.push({ a: (-90 + k * (360 / inN)) * Math.PI / 180, rad: inRad, r: perkR2 * 0.96, inner: true });
  for (var m = 0; m < outN; m++) out.push({ a: (-90 + (360 / outN) * 0.5 + m * (360 / outN)) * Math.PI / 180, rad: outRad, r: perkR2 });   // offset the outer ring half a step so it interleaves
  return out;
}
function drawNukeBar(c) {
  var W = GF.W, S = GF.S, list = nukeList();
  R.nuke = [];
  if (list.length <= 1) return;
  var n = list.length, cw = GF.clamp(98 * S, 70, 128), ch = GF.clamp(52 * S, 44, 64), gap = 7 * S, totW = n * cw + (n - 1) * gap;
  var x0 = (W - totW) / 2, y0 = R.field.y + 5 * S;
  for (var i = 0; i < n; i++) {
    var id = list[i], d = nukeDef(id), x = x0 + i * (cw + gap), act = activeNuke === id, usable = nukeUsable(id), cost = nukeCost(id), afford = money >= cost;
    R.nuke.push({ x: x, y: y0, w: cw, h: ch, id: id });
    uiPanel(c, x, y0, cw, ch, 4 * S, act ? 'rgba(70,57,31,0.96)' : 'rgba(38,34,22,0.88)', act ? d.col : (usable ? PB.rule : PB.lo));
    if (act) { c.save(); c.globalAlpha = 0.76; c.fillStyle = d.col; c.fillRect(x + 6 * S, y0 + 6 * S, 3 * S, ch - 12 * S); c.restore(); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = usable ? d.col : (afford ? PB.warn : PB.lo); c.font = uiFont(GF.clamp(11 * S, 9, 14), '900');
    c.fillText((GF.lang === 'ru' ? d.nmRu : d.nm).toUpperCase().slice(0, 11), x + cw / 2, y0 + ch * 0.25);
    c.fillStyle = act ? PB.paper : PB.mid; c.font = uiFont(GF.clamp(13 * S, 10, 17), '900');
    c.fillText('x' + d.mult.toFixed(1), x + cw / 2, y0 + ch * 0.53);
    var sub = d.id === 'std' ? T('nk_unlim') : godPower ? 'GOD' : usable ? ((nukeAmmo[id] || 0) + ' ' + T('nk_left')) : fmt(cost) + ' ' + T('caps');
    c.fillStyle = usable ? PB.mid : (afford ? PB.warn : PB.lo); c.font = uiFont(GF.clamp(9.5 * S, 8, 12), '700');
    c.fillText(sub, x + cw / 2, y0 + ch * 0.79);
  }
}
function drawRadial(c) {
  var S = GF.S, W = GF.W, H = GF.H;
  c.fillStyle = 'rgba(18,15,9,0.13)'; c.fillRect(0, R.field.y, W, R.field.h);   // light scrim so the city still reads while you pick perks
  c.save(); c.strokeStyle = 'rgba(120,105,71,0.22)'; c.lineWidth = 1; for (var gy = R.field.y + 18 * S; gy < R.field.y + R.field.h; gy += 24 * S) { c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke(); } c.restore();
  var cx0 = R.actionCx || W / 2, cy0 = R.actionCy || (R.field.y + R.field.h * 0.5);
  var atk = atkList(), n = atk.length;
  var atomR = GF.clamp(W * (n > 9 ? 0.115 : 0.135), n > 9 ? 32 : 38, n > 9 ? 76 : 92);   // shrink the atom a touch when the rings get busy (it stays the biggest, central element)
  var lay = radialLayout(n, W, atomR);
  R.perk = []; R.info = [];
  for (var i = 0; i < n; i++) {
    var L = lay[i], a = L.a, perkR = L.r, px = cx0 + Math.cos(a) * L.rad, py = cy0 + Math.sin(a) * L.rad;
    var id = atk[i], lvl = atkLvl(id), mx = atkMax(id), maxed = lvl >= mx, cost = atkCost(id), afford = money >= cost && !maxed;
    perkNode(c, px, py, perkR, id, lvl, mx, maxed, afford, cost);
    var lblY = py + perkR + (n > 9 ? 8 : 12) * S, lblSz = GF.clamp(W * (n > 9 ? 0.024 : 0.029), n > 9 ? 7.5 : 9, n > 9 ? 11 : 14);
    c.fillStyle = afford ? PB.paper : PB.mid; c.font = uiFont(lblSz, '800'); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(T('u_' + id).toUpperCase(), px, lblY);
    R.perk.push({ x: px - perkR, y: py - perkR, w: perkR * 2, h: perkR * 2, id: id });
    var ir = GF.clamp(W * (n > 9 ? 0.02 : 0.024), n > 9 ? 7 : 8, n > 9 ? 11 : 14), ibx = px + perkR * 0.72, iby = py - perkR * 0.72;   // "i" info badge (top-right of the disc)
    R.info.push({ x: ibx, y: iby, r: ir, id: id });
    uiOctPath(c, ibx, iby, ir); c.fillStyle = infoOpen === id ? PB.paper : 'rgba(38,34,22,0.96)'; c.fill(); c.lineWidth = 1.4 * S; c.strokeStyle = PB.rule; c.stroke();
    c.fillStyle = infoOpen === id ? PB.ink : PB.paper; c.font = 'italic ' + uiFont(GF.clamp(W * (n > 9 ? 0.026 : 0.031), n > 9 ? 8 : 9, n > 9 ? 12 : 15), '900'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('i', ibx, iby + 0.5);
  }
  R.detonate = { x: cx0 - atomR, y: cy0 - atomR, w: atomR * 2, h: atomR * 2 };
  detonateBtn(c, cx0, cy0, atomR);
}
function drawInfo(c) {
  if (!infoOpen) return;
  var id = infoOpen, W = GF.W, H = GF.H, S = GF.S;
  c.fillStyle = 'rgba(1,10,5,0.66)'; c.fillRect(0, 0, W, H);
  var pw = GF.clamp(W * 0.76, 250, 380), ph = GF.clamp(W * 0.82, 230, 380), px = (W - pw) / 2, py = (H - ph) / 2;
  GF.rr(c, px, py, pw, ph, 14 * S); var g = c.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(11,42,27,0.99)'); g.addColorStop(1, 'rgba(4,18,12,0.99)'); c.fillStyle = g; c.fill(); c.lineWidth = 1.5; c.strokeStyle = PB.mid; c.stroke();
  atkIcon(c, id, px + 26 * S, py + 26 * S, GF.clamp(11 * S, 9, 15));
  c.fillStyle = PB.hi; c.font = '900 ' + GF.clamp(17 * S, 14, 23) + 'px ui-monospace,monospace'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(T('u_' + id).toUpperCase(), px + 46 * S, py + 25 * S);
  c.fillStyle = PB.mid; c.font = GF.clamp(12 * S, 10, 16) + 'px ui-monospace,monospace'; c.fillText(T('u_' + id + '_d'), px + 16 * S, py + 50 * S);
  var dx = px + 14 * S, dy = py + 64 * S, dw = pw - 28 * S, dh = ph - 64 * S - 30 * S;
  c.save(); GF.rr(c, dx, dy, dw, dh, 8 * S); c.fillStyle = 'rgba(2,14,9,0.92)'; c.fill(); c.lineWidth = 1; c.strokeStyle = PB.lo; c.stroke(); GF.rr(c, dx, dy, dw, dh, 8 * S); c.clip(); drawDemo(c, id, dx, dy, dw, dh); c.restore();
  c.fillStyle = PB.lo; c.font = GF.clamp(10 * S, 8, 13) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T('tap_close'), W / 2, py + ph - 15 * S);
}
function drawDemo(c, id, dx, dy, dw, dh) {
  // a 6x6 iso city: the OUTCOME read is the whole point -> cells INSIDE the effect zone are solid RED (red building + red-tinted floor),
  // cells OUTSIDE stay GREEN (green building + dark-green floor). The red region's SHAPE is the weapon's effect; there's ALWAYS a green margin so the zone reads.
  var N = 6, CC = (N - 1) / 2;   // 6x6 grid, centre at (2.5,2.5); a 2-wide green border frames every zone
  var S = GF.S, tt = (bgT % 2.8) / 2.8, tw = dw * 0.092, th = tw * 0.5, bh = tw * 0.5, ox = dx + dw * 0.5, oy = dy + dh * 0.30;
  var GRN = '#23a866', RED = '#e8392b';
  function P(i, j) { return [ox + (i - j) * tw / 2, oy + (i + j) * th / 2]; }
  function gtile(i, j, red) { var a = P(i, j), b = P(i + 1, j), d = P(i + 1, j + 1), e = P(i, j + 1);
    c.fillStyle = red ? (((i + j) % 2) ? '#5a1410' : '#3a0f0b') : (((i + j) % 2) ? '#06180e' : '#04140b'); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]); c.closePath(); c.fill();
    if (red) { c.save(); c.globalAlpha = 0.20 + 0.12 * Math.sin(bgT * 6 + i + j); c.fillStyle = '#ff5a3a'; c.fill(); c.restore(); } }   // hot glow on the destroyed floor
  function box(i, j, hu, col) { var hp = Math.max(0.02, hu) * bh, a = P(i, j), b = P(i + 1, j), d = P(i + 1, j + 1), e = P(i, j + 1);
    var at = [a[0], a[1] - hp], bt = [b[0], b[1] - hp], dt = [d[0], d[1] - hp], et = [e[0], e[1] - hp];
    c.fillStyle = darken(col, -0.42); c.beginPath(); c.moveTo(e[0], e[1]); c.lineTo(d[0], d[1]); c.lineTo(dt[0], dt[1]); c.lineTo(et[0], et[1]); c.closePath(); c.fill();
    c.fillStyle = darken(col, -0.22); c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.lineTo(dt[0], dt[1]); c.lineTo(bt[0], bt[1]); c.closePath(); c.fill();
    c.fillStyle = col; c.beginPath(); c.moveTo(at[0], at[1]); c.lineTo(bt[0], bt[1]); c.lineTo(dt[0], dt[1]); c.lineTo(et[0], et[1]); c.closePath(); c.fill(); }
  function HM(i, j) { return 1 + ((i * 7 + j * 13 + i * j) % 4) * 0.6; }   // a varied-but-deterministic low skyline
  // render the whole NxN city back-to-front: floor tile (red/green) THEN building (red/green) per cell. redfn(i,j)>0 => that cell is in the zone.
  function city(redfn, hfn) { var cells = []; for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) cells.push([i, j]);
    cells.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); });
    cells.forEach(function (p) { gtile(p[0], p[1], (redfn ? redfn(p[0], p[1]) : 0) > 0); });   // pass 1: all floors (so the red footprint reads as a solid region)
    cells.forEach(function (p) { var i = p[0], j = p[1], red = (redfn ? redfn(i, j) : 0) > 0; box(i, j, hfn ? hfn(i, j) : HM(i, j), red ? RED : GRN); }); }   // pass 2: buildings
  function waterCity(redfn) { var cells = []; for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) cells.push([i, j]);
    cells.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); });
    cells.forEach(function (p) { var i = p[0], j = p[1], red = redfn(i, j) > 0, a = P(i, j), b = P(i + 1, j), d = P(i + 1, j + 1), e = P(i, j + 1);
      c.fillStyle = red ? (((i + j) % 2) ? '#5a1410' : '#3a0f0b') : (((i + j) % 2) ? '#063826' : '#04281b'); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]); c.closePath(); c.fill();
      if (red) { c.save(); c.globalAlpha = 0.18; c.fillStyle = '#ff5a3a'; c.fill(); c.restore(); } }); }
  var grow = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(tt * Math.PI * 2));   // 0->1->0 ease so the zone breathes but rests OPEN most of the loop
  c.lineWidth = 2.2 * S;

  if (id === 'yield') {   // a centred circular blast zone (clear red core, green frame around it)
    var ru = 1.4 + 1.2 * grow;
    city(function (i, j) { return Math.hypot(i - CC, j - CC) <= ru ? 1 : 0; });
  } else if (id === 'luck') {   // EXTRA INCOME: the city damage is unchanged, but red payout tags climb from each strike
    city(function () { return 0; });
    var tags = [[1.2, 1.2, '+CAPS'], [3.9, 1.1, '+CAPS'], [2.6, 2.9, '+BONUS'], [1.4, 4.4, '+CAPS'], [4.1, 4.0, '+CAPS']], lit = 1 + Math.floor(tt * tags.length);
    c.save(); c.fillStyle = RED; c.font = 'bold ' + GF.clamp(dh * 0.105, 10, 17) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (var ti = 0; ti < lit && ti < tags.length; ti++) { var tp = P(tags[ti][0], tags[ti][1]); c.fillText(tags[ti][2], tp[0], tp[1] - bh * 1.35 - (ti % 2) * 4 * S); }
    c.restore();
  } else if (id === 'mirv') {   // THREE separate red blast zones = the split warheads (a clear green gap between each), placed where they read in iso
    var mz = [[2.5, 2.5], [0.6, 4.4], [4.4, 0.6]];   // centre + two opposite flanks, well separated (a clear green gap between each warhead zone)
    city(function (i, j) { for (var t = 0; t < mz.length; t++) if (Math.hypot(i + 0.5 - mz[t][0], j + 0.5 - mz[t][1]) <= 1.2) return 1; return 0; }, function () { return 1.6; });   // uniform low height so no tall green building hides a red zone
  } else if (id === 'pen') {   // the tall WALL and the whole block BEHIND it go red -> it punches clean through
    var wi = 2, wj = 2;
    city(function (i, j) { return (i >= wi && j >= wj) ? 1 : 0; }, function (i, j) { return (i === wi && j === wj) ? 3.4 : HM(i, j); });   // wall at (2,2) + the 3x3 behind it
  } else if (id === 'flares' || id === 'emp') {   // the interceptor SYSTEMS (two corner towers) go red/dead AND the nuke reaches a centred red blast zone (it gets through)
    var sysA = [0, 5], sysB = [5, 0];
    city(function (i, j) { if ((i === sysA[0] && j === sysA[1]) || (i === sysB[0] && j === sysB[1])) return 1; if (Math.hypot(i - CC, j - CC) <= 1.7) return 1; return 0; }, function (i, j) { return ((i === sysA[0] && j === sysA[1]) || (i === sysB[0] && j === sysB[1])) ? 2.6 : HM(i, j); });
    [sysA, sysB].forEach(function (sp) { var pp = P(sp[0] + 0.5, sp[1] + 0.5), yy = pp[1] - 2.6 * bh - 4 * S; c.save(); c.strokeStyle = '#ffd0c0'; c.lineWidth = 2 * S; c.globalAlpha = 0.6 + 0.4 * Math.sin(bgT * 10); c.beginPath(); c.moveTo(pp[0] - 4 * S, yy - 4 * S); c.lineTo(pp[0] + 4 * S, yy + 4 * S); c.moveTo(pp[0] + 4 * S, yy - 4 * S); c.lineTo(pp[0] - 4 * S, yy + 4 * S); c.stroke(); c.restore(); });   // dead-X over each downed system
  } else if (id === 'orbital') {   // the hardened CORE tower + a tight red impact zone right around it (a normal blast can't crack it; this does)
    city(function (i, j) { return Math.max(Math.abs(i - CC), Math.abs(j - CC)) <= 1.1 ? 1 : 0; }, function (i, j) { return (Math.abs(i - 2) < 1 && Math.abs(j - 3) < 1) || (Math.abs(i - 3) < 1 && Math.abs(j - 2) < 1) ? 3.6 : HM(i, j); });
  } else if (id === 'firestorm') {   // a circle that SPREADS outward over the loop, swallowing block after block (rests partway so the green frontier shows)
    var fr = 0.8 + 2.0 * tt;
    city(function (i, j) { return Math.hypot(i - CC, j - CC) <= fr ? 1 : 0; });
  } else if (id === 'chain') {   // red spreads neighbour-to-neighbour from the centre (square rings outward)
    var ring = 1 + Math.floor(tt * 3.4);
    city(function (i, j) { return Math.max(Math.abs(i - CC), Math.abs(j - CC)) <= ring ? 1 : 0; });
  } else if (id === 'cluster') {   // scattered red SPOTS blanketing the field (bomblets), filling in over the loop, green gaps between
    var spots = [[2.5, 2.5], [0.5, 0.5], [4.5, 0.5], [0.5, 4.5], [4.5, 4.5], [2.5, 0.5], [0.5, 2.5], [4.5, 2.5]], lit = 1 + Math.floor(tt * 7);
    city(function (i, j) { for (var t = 0; t < lit && t < spots.length; t++) if (Math.hypot(i + 0.5 - spots[t][0], j + 0.5 - spots[t][1]) <= 1.0) return 1; return 0; });
  } else if (id === 'glass') {   // a RING goes red (shrapnel sweeps the retail); the centre core AND the far edge stay green so it reads as a ring
    var gmid = 1.7 + grow * 0.5;
    city(function (i, j) { var d = Math.hypot(i - CC, j - CC); return Math.abs(d - gmid) <= 0.6 ? 1 : 0; }, function () { return 1.3; });   // low flat retail
  } else if (id === 'seismic') {   // a straight red BAND (the fault) crosses the grid, green on both sides
    var fb = 0.5 + tt * 4.5;
    city(function (i, j) { return Math.abs(i - fb) <= 0.8 ? 1 : 0; });
    var w1 = P(fb, -0.3), w2 = P(fb, N + 0.3); c.save(); c.strokeStyle = '#ffcf8a'; c.lineWidth = 2.4 * S; c.shadowColor = '#ff8a3b'; c.shadowBlur = mobileFx() ? 0 : (8 * S); c.globalAlpha = 0.85;
    c.beginPath(); for (var sq = 0; sq <= 10; sq++) { var sty = GF.lerp(w1[1], w2[1], sq / 10) + th * 0.3, stx = GF.lerp(w1[0], w2[0], sq / 10) + (sq % 2 ? 3 : -3) * S; c[sq ? 'lineTo' : 'moveTo'](stx, sty); } c.stroke(); c.restore();   // the glowing crack down the fault
  } else if (id === 'inferno') {   // red BLOOMS at the tank cells, growing as each cooks off in turn (separate red pockets, green around)
    var tanks = [[1.5, 1.5], [3.5, 2.5], [2.5, 4.0]], lit2 = 1 + Math.floor(tt * 3);
    city(function (i, j) { for (var t = 0; t < lit2 && t < tanks.length; t++) if (Math.hypot(i + 0.5 - tanks[t][0], j + 0.5 - tanks[t][1]) <= 1.2) return 1; return 0; });
    tanks.forEach(function (tk, t) { if (t >= lit2) return; var pp = P(tk[0], tk[1]); var rr = (0.5 + (tt * 3 - t)) * tw; if (rr <= 0) return; var fg = c.createRadialGradient(pp[0], pp[1] - bh, 1, pp[0], pp[1] - bh, Math.max(2, rr)); fg.addColorStop(0, 'rgba(255,240,150,0.85)'); fg.addColorStop(0.55, 'rgba(255,120,50,0.55)'); fg.addColorStop(1, 'rgba(200,40,10,0)'); c.fillStyle = fg; c.beginPath(); c.arc(pp[0], pp[1] - bh, Math.max(2, rr), 0, Math.PI * 2); c.fill(); });   // fireball over each lit tank
  } else {   // shock: the WATER cells the tsunami reaches go red, the ships on them capsize
    var fx = tt * (N * 2 + 1) - 1;
    waterCity(function (i, j) { return (i + j) < fx ? 1 : 0; });
    [[1, 1], [3, 2], [2, 4], [4, 4]].forEach(function (sp) { var pp = P(sp[0] + 0.5, sp[1] + 0.5), hit = (sp[0] + sp[1]) < fx; c.save(); c.translate(pp[0], pp[1] - 3 * S); if (hit) c.rotate(2.4); c.fillStyle = hit ? RED : GRN; c.fillRect(-6 * S, -2.5 * S, 12 * S, 5 * S); c.fillStyle = hit ? darken(RED, -0.3) : darken(GRN, -0.3); c.fillRect(-6 * S, 0.5 * S, 12 * S, 2 * S); c.restore(); });
    var w1 = P(Math.max(0, fx), 0), w2 = P(0, Math.max(0, fx)); c.save(); c.strokeStyle = '#ff7a5a'; c.lineWidth = 3 * S; c.globalAlpha = 0.8; c.beginPath(); c.moveTo(w1[0], w1[1] - bh * 0.5); c.lineTo(w2[0], w2[1] - bh * 0.5); c.stroke(); c.restore();   // the tsunami front (diagonal)
  }
}
function perkNode(c, x, y, r, id, lvl, mx, maxed, afford, cost) {
  c.save();
  uiOctPath(c, x, y, r);
  c.fillStyle = maxed ? 'rgba(70,57,31,0.92)' : (afford ? 'rgba(50,42,24,0.94)' : 'rgba(32,29,19,0.93)'); c.fill();
  c.lineWidth = 2.1 * GF.S; c.strokeStyle = maxed ? PB.lo : (afford ? PB.brass : PB.rule); c.stroke();
  if (afford) { c.save(); c.globalAlpha = 0.65; c.strokeStyle = PB.warn; c.lineWidth = 1.2 * GF.S; uiOctPath(c, x, y, r - 4 * GF.S); c.stroke(); c.restore(); }
  atkIcon(c, id, x, y - r * 0.34, GF.clamp(r * 0.32, 8, 16));
  var np = Math.min(mx, 8), pw = r * 0.13, gap = pw * 0.55, tot = np * pw + (np - 1) * gap, sx = x - tot / 2, lshow = Math.ceil(lvl / mx * np);
  for (var p = 0; p < np; p++) { c.fillStyle = p < lshow ? PB.paper : PB.dim; c.fillRect(sx + p * (pw + gap), y + r * 0.14, pw, r * 0.12); }
  if (mx > 8) { c.fillStyle = PB.mid; c.font = uiFont(GF.clamp(r * 0.19, 7, 10), '800'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lvl + '/' + mx, x, y + r * 0.34); }
  c.fillStyle = maxed ? PB.lo : (afford ? PB.warn : PB.brass); c.font = uiFont(GF.clamp(r * 0.3, 9, 14), '800'); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(maxed ? T('maxed') : fmt(cost), x, y + r * 0.54);
  if (lvl > 0) {
    var lbr = GF.clamp(r * 0.36, 8, 15), lbx = x - r * 0.66, lby = y - r * 0.66;
    c.beginPath(); c.arc(lbx, lby, lbr, 0, Math.PI * 2); c.fillStyle = maxed ? PB.brass : 'rgba(4,24,15,0.97)'; c.fill(); c.lineWidth = 1.5 * GF.S; c.strokeStyle = maxed ? PB.warn : PB.mid; c.stroke();
    c.fillStyle = maxed ? '#06210f' : PB.paper; c.font = uiFont(GF.clamp(r * 0.34, 8, 14), 'bold'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('' + lvl, lbx, lby);
  }
  c.restore();
}
function atomGlyph(c, x, y, r) {
  c.save(); c.strokeStyle = PB.paper; c.lineWidth = Math.max(1.4, r * 0.07); c.fillStyle = PB.warn;
  for (var i = 0; i < 3; i++) { c.save(); c.translate(x, y); c.rotate(i * Math.PI / 3); c.beginPath(); c.ellipse(0, 0, r, r * 0.4, 0, 0, Math.PI * 2); c.stroke(); c.restore(); }
  c.beginPath(); c.arc(x, y, r * 0.16, 0, Math.PI * 2); c.fill(); c.restore();
}
function detonateBtn(c, x, y, r) {
  c.save();
  c.lineWidth = 2.4 * GF.S; c.strokeStyle = PB.warn; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 1.3 * GF.S; c.strokeStyle = PB.rule; c.beginPath(); c.arc(x, y, r - 6 * GF.S, 0, Math.PI * 2); c.stroke();
  c.fillStyle = 'rgba(38,34,22,0.78)'; c.beginPath(); c.arc(x, y, r - 2 * GF.S, 0, Math.PI * 2); c.fill();
  c.save(); c.globalAlpha = 0.22; c.strokeStyle = PB.paper; c.lineWidth = 1; for (var k = 0; k < 16; k++) { var a = k * Math.PI / 8; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); c.lineTo(x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93); c.stroke(); } c.restore();
  atomGlyph(c, x, y - r * 0.12, r * 0.42);
  c.fillStyle = PB.paper; c.font = uiFont(GF.clamp(r * 0.28, 11, 20), '900'); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(T('detonate'), x, y + r * 0.52);
  c.restore();
}
function drawCRT(c) {
  var W = GF.W, H = GF.H, S = GF.S;
  c.save(); c.globalAlpha = 0.025; c.fillStyle = PB.paper; for (var y = 0; y < H; y += 4 * S) c.fillRect(0, y, W, 1 * S); c.restore();
  c.save(); c.globalAlpha = 0.035; c.fillStyle = PB.ink; for (var i = 0; i < 90; i++) c.fillRect((i * 73) % W, (i * 149) % H, 1.2 * S, 1.2 * S); c.restore();
  c.save(); var v = c.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(12,10,6,0.28)'); c.fillStyle = v; c.fillRect(0, 0, W, H); c.restore();
}
function drawStats(c) {   // Fallout-style stat sheet of the player's build
  var W = GF.W, H = GF.H, S = GF.S;
  c.fillStyle = 'rgba(1,10,5,0.82)'; c.fillRect(0, 0, W, H);
  var pw = Math.min(W - 16 * S, 440), ph = Math.min(H - 34 * S, 620), px = (W - pw) / 2, py = (H - ph) / 2;
  GF.rr(c, px, py, pw, ph, 14 * S); var g = c.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(11,42,27,0.99)'); g.addColorStop(1, 'rgba(4,18,12,0.99)'); c.fillStyle = g; c.fill(); c.lineWidth = 1.5; c.strokeStyle = PB.mid; c.stroke();
  c.fillStyle = PB.hi; c.font = '900 ' + GF.clamp(18 * S, 15, 24) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T('stats_title'), W / 2, py + 26 * S);
  var allStats = [['luck', luckLvl, atkMax('luck'), T('stat_income') + ' +' + Math.round(extraIncomeBonus() * 100) + '%'], ['yield', powerLvl, atkMax('yield'), T('stat_blast') + ' x' + powerCells().toFixed(1)], ['pen', penLvl, atkMax('pen'), ''], ['flares', flareLvl, atkMax('flares'), ''], ['mirv', mirvLvl, atkMax('mirv'), ''], ['shock', shockLvl, atkMax('shock'), ''], ['emp', empLvl, atkMax('emp'), ''], ['orbital', orbitalLvl, atkMax('orbital'), ''], ['cluster', clusterLvl, atkMax('cluster'), ''], ['firestorm', firestormLvl, atkMax('firestorm'), ''], ['chain', chainLvl, atkMax('chain'), ''], ['glass', glassLvl, atkMax('glass'), ''], ['seismic', seismicLvl, atkMax('seismic'), ''], ['inferno', infernoLvl, atkMax('inferno'), ''], ['topple', toppleLvl, atkMax('topple'), ''], ['meltdown', meltdownLvl, atkMax('meltdown'), ''], ['tidal', tidalLvl, atkMax('tidal'), ''], ['fireworks', fireworksLvl, atkMax('fireworks'), ''], ['eye', eyeLvl, atkMax('eye'), '']];
  var avail = atkList();
  var stats = allStats.filter(function (s) { return s[0] === 'yield' || s[0] === 'luck' || s[1] > 0 || avail.indexOf(s[0]) >= 0; });
  var rowH = GF.clamp(44 * S, 40, 52), headerH = GF.clamp(52 * S, 48, 62), footerH = GF.clamp(66 * S, 58, 78);
  var contentTop = py + headerH, contentBot = py + ph - footerH, viewH = Math.max(40 * S, contentBot - contentTop);
  var summaryH = 54 * S + (skinBoostLabel() ? 25 * S : 0);
  statsScrollMax = Math.max(0, stats.length * rowH + summaryH - viewH);
  clampStatsScroll();

  c.save();
  c.beginPath(); c.rect(px + 10 * S, contentTop, pw - 20 * S, viewH); c.clip();
  var ry = contentTop + 4 * S - statsScroll;
  for (var i = 0; i < stats.length; i++) {
    var st = stats[i], lvl = st[1], frac = GF.clamp(lvl / st[2], 0, 1);
    if (ry + rowH > contentTop - 6 * S && ry < contentBot + 6 * S) {
      atkIcon(c, st[0], px + 26 * S, ry + rowH * 0.4, GF.clamp(9.5 * S, 8, 14));
      c.fillStyle = PB.hi; c.font = '800 ' + GF.clamp(12.8 * S, 11, 17) + 'px ui-monospace,monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';
      var name = T('u_' + st[0]).toUpperCase(), nameMax = pw - 44 * S - 92 * S;
      while (name.length > 4 && c.measureText(name).width > nameMax) name = name.slice(0, -2) + '.';
      c.fillText(name, px + 44 * S, ry + rowH * 0.34);
      c.fillStyle = PB.warn; c.font = '800 ' + GF.clamp(11.2 * S, 9.8, 15) + 'px ui-monospace,monospace'; c.textAlign = 'right'; c.fillText(T('level_short') + ' ' + lvl + '/' + st[2], px + pw - 18 * S, ry + rowH * 0.34);
      var subW = st[3] ? GF.clamp(86 * S, 68, 118) : 0, bx = px + 44 * S, by = ry + rowH * 0.72, bhh = GF.clamp(7 * S, 6, 9), bw = pw - 44 * S - 18 * S - subW;
      c.strokeStyle = PB.lo; c.lineWidth = 1; c.strokeRect(bx, by - bhh / 2, bw, bhh); c.fillStyle = PB.mid; c.fillRect(bx + 1, by - bhh / 2 + 1, Math.max(0, (bw - 2) * frac), bhh - 2);
      if (st[2] > 12) { c.fillStyle = 'rgba(255,210,74,0.34)'; for (var tk = 1; tk < 8; tk++) { var tx = bx + 1 + (bw - 2) * tk / 8; c.fillRect(tx, by - bhh / 2, Math.max(1, S), bhh); } }
      if (st[3]) { c.fillStyle = PB.mid; c.font = '700 ' + GF.clamp(9.5 * S, 8.5, 12) + 'px ui-monospace,monospace'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(st[3], px + pw - 18 * S, by); }
    }
    ry += rowH;
  }
  ry += 10 * S; c.fillStyle = PB.lo; c.fillRect(px + 16 * S, ry - 7 * S, pw - 32 * S, 1);
  c.fillStyle = PB.mid; c.font = '700 ' + GF.clamp(11 * S, 9.5, 15) + 'px ui-monospace,monospace'; c.textBaseline = 'middle';
  c.textAlign = 'left'; c.fillText(T('cities_razed') + '  ' + citiesRazed, px + 18 * S, ry + 9 * S);
  c.textAlign = 'right'; c.fillText(T('total_caps') + '  ' + fmt(totalEarned), px + pw - 18 * S, ry + 9 * S);
  var skLine = skinBoostLabel();
  if (skLine) {
    c.fillStyle = PB.warn; c.font = '800 ' + GF.clamp(10 * S, 8.8, 13) + 'px ui-monospace,monospace'; c.textAlign = 'center';
    var out = T('skin_short') + '  ' + skLine, max = pw - 34 * S;
    while (out.length > 12 && c.measureText(out).width > max) out = out.slice(0, -4) + '...';
    c.fillText(out, W / 2, ry + 34 * S);
  }
  c.restore();

  if (statsScrollMax > 2) {
    var trackH = Math.max(24 * S, viewH - 10 * S), thumbH = GF.clamp(trackH * (viewH / (viewH + statsScrollMax)), 26 * S, trackH), ty = contentTop + 5 * S + (trackH - thumbH) * (statsScroll / statsScrollMax);
    c.fillStyle = 'rgba(84,255,150,0.16)'; c.fillRect(px + pw - 8 * S, contentTop + 5 * S, 2 * S, trackH);
    c.fillStyle = PB.mid; c.fillRect(px + pw - 9 * S, ty, 4 * S, thumbH);
  }
  var cbw = GF.clamp(156 * S, 128, 224), cbh = GF.clamp(44 * S, 38, 56), cbx = W / 2 - cbw / 2, cby = py + ph - cbh - 12 * S;
  R.statsClose = { x: cbx, y: cby, w: cbw, h: cbh }; GF.rr(c, cbx, cby, cbw, cbh, cbh / 2); c.fillStyle = PB.mid; c.fill(); c.fillStyle = '#02120a'; c.font = 'bold ' + GF.clamp(14 * S, 12, 18) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T('close'), W / 2, cby + cbh / 2);
}
function drawSettings(c) {
  var W = GF.W, H = GF.H, S = GF.S;
  c.fillStyle = 'rgba(1,10,5,0.84)'; c.fillRect(0, 0, W, H);
  var pw = Math.min(W - 24 * S, 390), ph = Math.min(H - 120 * S, 330), px = (W - pw) / 2, py = (H - ph) / 2;
  GF.rr(c, px, py, pw, ph, 14 * S); var g = c.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(11,42,27,0.99)'); g.addColorStop(1, 'rgba(4,18,12,0.99)'); c.fillStyle = g; c.fill(); c.lineWidth = 1.5; c.strokeStyle = PB.mid; c.stroke();
  c.fillStyle = PB.hi; c.font = '900 ' + GF.clamp(18 * S, 14, 24) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T('settings'), W / 2, py + 28 * S);
  var bw = pw - 42 * S, bx = W / 2 - bw / 2, bh = GF.clamp(44 * S, 36, 56), gap = GF.clamp(10 * S, 8, 13);
  var labelFont = '800 ' + GF.clamp(10.5 * S, 8.5, 13) + 'px ui-monospace,monospace';
  c.fillStyle = PB.lo; c.font = labelFont; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(T('sound'), bx, py + 62 * S);
  R.settingsSound = { x: bx, y: py + 74 * S, w: bw, h: bh };
  modalBtn(c, R.settingsSound, GF.muted ? T('sound_off') : T('sound_on'), GF.muted ? 'rgba(255,106,74,0.86)' : PB.mid, '#06210f');
  c.fillStyle = PB.lo; c.font = labelFont; c.textAlign = 'left'; c.fillText(T('language'), bx, R.settingsSound.y + bh + 25 * S);
  var lw = (bw - gap) / 2, ly = R.settingsSound.y + bh + 38 * S;
  R.settingsEn = { x: bx, y: ly, w: lw, h: bh };
  R.settingsRu = { x: bx + lw + gap, y: ly, w: lw, h: bh };
  modalBtn(c, R.settingsEn, T('english'), GF.lang === 'en' ? PB.warn : 'rgba(8,28,16,0.92)', GF.lang === 'en' ? '#06210f' : PB.hi, PB.mid);
  modalBtn(c, R.settingsRu, T('russian'), GF.lang === 'ru' ? PB.warn : 'rgba(8,28,16,0.92)', GF.lang === 'ru' ? '#06210f' : PB.hi, PB.mid);
  R.settingsSupport = { x: bx, y: ly + bh + gap, w: bw, h: bh };
  modalBtn(c, R.settingsSupport, T('support'), 'rgba(8,28,16,0.92)', PB.warn, PB.mid);
  R.settingsClose = { x: bx, y: py + ph - bh - 16 * S, w: bw, h: bh };
  modalBtn(c, R.settingsClose, T('close'), PB.mid, '#06210f');
}
function wrapCentre(c, text, cx, y, maxW, lh) { var words = String(text).split(' '), line = '', yy = y; c.textAlign = 'center'; for (var i = 0; i < words.length; i++) { var p = line ? line + ' ' + words[i] : words[i]; if (c.measureText(p).width > maxW && line) { c.fillText(line, cx, yy); line = words[i]; yy += lh; } else line = p; } if (line) c.fillText(line, cx, yy); return yy; }
function drawWelcome(c) {   // returning player: the Vault-Tec reactor banked caps while you were away
  var W = GF.W, H = GF.H, S = GF.S;
  c.fillStyle = 'rgba(1,10,5,0.88)'; c.fillRect(0, 0, W, H);
  var pw = Math.min(W - 30 * S, 380), ph = Math.min(H - 44 * S, 500), px = (W - pw) / 2, py = (H - ph) / 2;
  GF.rr(c, px, py, pw, ph, 14 * S); var g = c.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(11,42,27,0.99)'); g.addColorStop(1, 'rgba(4,18,12,0.99)'); c.fillStyle = g; c.fill(); c.lineWidth = 1.6; c.strokeStyle = PB.hi; c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = PB.hi; c.font = '900 ' + GF.clamp(19 * S, 15, 26) + 'px ui-monospace,monospace'; c.save(); c.shadowColor = PB.glow; c.shadowBlur = mobileFx() ? 0 : (7); c.fillText(T('welcome_t'), W / 2, py + 28 * S); c.restore();
  c.fillStyle = PB.mid; c.font = GF.clamp(10.5 * S, 9, 14) + 'px ui-monospace,monospace'; var subEnd = wrapCentre(c, T('welcome_sub'), W / 2, py + 52 * S, pw - 44 * S, 15 * S);
  var bw = pw - 48 * S, bx = W / 2 - bw / 2, bh = GF.clamp(42 * S, 34, 54), gap = GF.clamp(9 * S, 7, 12), bottomPad = GF.clamp(14 * S, 10, 18);
  var by = py + ph - bh * 2 - gap - bottomPad, capPx = GF.clamp(28 * S, 21, 38);
  var capY = Math.min(py + ph * 0.64, by - capPx * 0.58 - GF.clamp(12 * S, 10, 18));
  var awayY = Math.min(py + ph * 0.56, capY - capPx * 0.75);
  var mascotTop = subEnd + GF.clamp(16 * S, 10, 22), mascotBottom = awayY - GF.clamp(14 * S, 10, 18);
  var mascotScale = GF.clamp(1.0 * S, 0.72, 1.3), mascotSpace = mascotBottom - mascotTop;
  if (mascotSpace < 96 * mascotScale) mascotScale = GF.clamp(mascotSpace / 96, 0.42, mascotScale);
  if (mascotSpace > 38) drawVaultBoy(c, W / 2, Math.max(mascotTop + 22 * mascotScale, Math.min(py + ph * 0.38, (mascotTop + mascotBottom) / 2)), mascotScale);
  c.textBaseline = 'middle'; c.fillStyle = PB.lo; c.font = GF.clamp(10 * S, 8, 13) + 'px ui-monospace,monospace'; c.fillText(T('away') + ' ' + dur(welcomeMs), W / 2, awayY);
  c.fillStyle = PB.warn; c.font = '900 ' + capPx + 'px ui-monospace,monospace'; c.save(); c.shadowColor = PB.glow; c.shadowBlur = mobileFx() ? 0 : (10); c.fillText('+' + fmt(welcomeCaps) + ' ' + T('caps'), W / 2, capY); c.restore();
  R.welcomeStars = null;
  R.welcomeDbl = { x: bx, y: by, w: bw, h: bh }; modalBtn(c, R.welcomeDbl, godPower ? T('collect_x2_free') : T('collect_x2'), 'rgba(255,210,74,0.86)', '#06210f');
  var by2 = by + bh + gap; R.welcomeCollect = { x: bx, y: by2, w: bw, h: bh }; modalBtn(c, R.welcomeCollect, T('collect'), 'rgba(8,28,16,0.92)', PB.hi, PB.mid);
}
function drawTutorialGift(c) {
  var W = GF.W, H = GF.H, S = GF.S;
  c.fillStyle = 'rgba(1,10,5,0.88)'; c.fillRect(0, 0, W, H);
  var pw = Math.min(W - 24 * S, 420), ph = Math.min(H - 150 * S, 350), px = (W - pw) / 2, py = (H - ph) / 2;
  GF.rr(c, px, py, pw, ph, 14 * S);
  var g = c.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(11,42,48,0.99)'); g.addColorStop(1, 'rgba(4,18,20,0.99)');
  c.fillStyle = g; c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#7fd4ff'; c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#bfe9ff'; c.font = uiFont(GF.clamp(18 * S, 14, 24), '900'); c.fillText(T('gift_t'), W / 2, py + 30 * S);
  var cx = W / 2, cy = py + ph * 0.45, box = GF.clamp(112 * S, 84, 132);
  c.save();
  c.shadowColor = '#7fd4ff'; c.shadowBlur = mobileFx() ? 0 : (18 * S);
  if (tutorialGiftChestImg.complete && tutorialGiftChestImg.naturalWidth) {
    c.drawImage(tutorialGiftChestImg, cx - box / 2, cy - box * 0.53, box, box);
  } else {
    c.fillStyle = 'rgba(95,216,255,0.18)'; c.beginPath(); c.arc(cx, cy, box * 0.34, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  c.fillStyle = PB.paper; c.font = uiFont(GF.clamp(12 * S, 10, 16), '800'); c.fillText(T('gift_sub'), W / 2, cy + box * 0.52);
  var bh = GF.clamp(48 * S, 40, 58), bw = pw - 52 * S, bx = W / 2 - bw / 2, by = py + ph - bh - GF.clamp(20 * S, 14, 24);
  R.tutGiftClaim = { x: bx, y: by, w: bw, h: bh };
  modalBtn(c, R.tutGiftClaim, T('open_gift'), PB.warn, '#06210f');
}
function drawDaily(c) {   // login-streak ration: escalating 7-day Vault-Tec crate
  var W = GF.W, H = GF.H, S = GF.S;
  c.fillStyle = 'rgba(1,10,5,0.88)'; c.fillRect(0, 0, W, H);
  var pw = Math.min(W - 24 * S, 420), ph = Math.min(H - 150 * S, 380), px = (W - pw) / 2, py = (H - ph) / 2;
  GF.rr(c, px, py, pw, ph, 14 * S); var g = c.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(11,42,27,0.99)'); g.addColorStop(1, 'rgba(4,18,12,0.99)'); c.fillStyle = g; c.fill(); c.lineWidth = 1.6; c.strokeStyle = PB.mid; c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = PB.hi; c.font = '900 ' + GF.clamp(18 * S, 14, 24) + 'px ui-monospace,monospace'; c.fillText(T('daily_t'), W / 2, py + 26 * S);
  var claim = dailyClaimable(), cur = claim ? nextStreak() : dailyStreak, shown = GF.clamp(cur, 1, 7);
  c.fillStyle = PB.mid; c.font = GF.clamp(10 * S, 8, 13) + 'px ui-monospace,monospace'; c.fillText(T('streak') + ' ' + cur, W / 2, py + 46 * S);
  var bw = pw - 48 * S, bx = W / 2 - bw / 2, bh = GF.clamp(46 * S, 38, 56), bottomPad = GF.clamp(18 * S, 12, 22), btnGap = GF.clamp(10 * S, 8, 12), by = py + ph - bh - bottomPad;
  var claimTop = claim ? by - bh - btnGap : by;
  var cols = 7, gap = 5 * S, cw = (pw - 36 * S - (cols - 1) * gap) / cols, gy = py + 64 * S, gx = px + 18 * S;
  var maxCellH = Math.max(GF.clamp(28 * S, 24, 34), claimTop - gy - GF.clamp(16 * S, 12, 18));
  var ch = Math.min(cw * 1.2, maxCellH);
  for (var i = 0; i < 7; i++) { var x = gx + i * (cw + gap), day = i + 1, isCur = (day === shown) && claim, got = claim ? (day < shown) : (day <= shown);
    GF.rr(c, x, gy, cw, ch, 6 * S); c.fillStyle = isCur ? 'rgba(20,70,44,0.98)' : (got ? 'rgba(10,40,24,0.92)' : 'rgba(5,20,13,0.92)'); c.fill(); c.lineWidth = isCur ? 2 : 1; c.strokeStyle = isCur ? PB.hi : PB.lo; c.stroke();
    c.textAlign = 'center'; c.fillStyle = isCur ? PB.hi : (got ? PB.mid : PB.lo); c.font = '700 ' + GF.clamp(8 * S, 6.5, 11) + 'px ui-monospace,monospace'; c.textBaseline = 'top'; c.fillText('D' + day, x + cw / 2, gy + 6 * S);
    if (got) { c.strokeStyle = PB.hi; c.lineWidth = 2.4 * S; c.beginPath(); c.moveTo(x + cw * 0.3, gy + ch * 0.56); c.lineTo(x + cw * 0.46, gy + ch * 0.72); c.lineTo(x + cw * 0.74, gy + ch * 0.4); c.stroke(); }   // claimed: a tick only (no number underneath)
    else { c.fillStyle = isCur ? PB.warn : PB.lo; c.font = '800 ' + GF.clamp(9 * S, 7, 12) + 'px ui-monospace,monospace'; c.textBaseline = 'middle'; c.fillText(fmt(dailyReward(day)), x + cw / 2, gy + ch * 0.62); }   // upcoming: the reward number
  }
  if (claim) {
    R.dailyDbl = { x: bx, y: by, w: bw, h: bh }; modalBtn(c, R.dailyDbl, godPower ? T('claim_x2_free') : T('claim_x2'), PB.warn, '#06210f');
    var by2 = claimTop; R.dailyClaim = { x: bx, y: by2, w: bw, h: bh }; modalBtn(c, R.dailyClaim, T('claim') + ' +' + fmt(dailyReward(cur)), PB.mid, '#06210f'); R.dailyClose = null;
  } else {
    c.fillStyle = PB.mid; c.font = GF.clamp(11 * S, 9, 15) + 'px ui-monospace,monospace'; c.fillText(T('come_back'), W / 2, by - 8 * S);
    R.dailyClaim = R.dailyDbl = null; R.dailyClose = { x: bx, y: by, w: bw, h: bh }; modalBtn(c, R.dailyClose, T('close'), PB.mid, '#06210f');
  }
}
function drawDev(c) {
  var W = GF.W, H = GF.H, S = GF.S;
  c.fillStyle = 'rgba(1,10,5,0.9)'; c.fillRect(0, 0, W, H);
  var pw = Math.min(W - 24 * S, 440), ph = Math.min(H - 120 * S, 420), px = (W - pw) / 2, py = (H - ph) / 2;
  GF.rr(c, px, py, pw, ph, 14 * S); c.fillStyle = 'rgba(4,22,13,0.99)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = PB.lo; c.stroke();
  c.fillStyle = PB.hi; c.font = 'bold ' + GF.clamp(17 * S, 14, 22) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(T('dev') + ' - ' + T('jump'), W / 2, py + 14 * S);
  var NTIER = 10, cols = 3, nrows = Math.ceil(NTIER / cols), cw = (pw - 28 * S - (cols - 1) * 8 * S) / cols, ch = GF.clamp(40 * S, 32, 52), gy = py + 44 * S; R.dev = [];
  for (var t = 0; t < NTIER; t++) { var cc = t % cols, rr2 = (t / cols) | 0, x = px + 14 * S + cc * (cw + 8 * S), y = gy + rr2 * (ch + 7 * S), cur = t === cityTier;
    R.dev.push({ x: x, y: y, w: cw, h: ch, tier: t });
    GF.rr(c, x, y, cw, ch, 8 * S); c.fillStyle = cur ? 'rgba(20,70,44,0.95)' : 'rgba(6,24,15,0.95)'; c.fill(); c.lineWidth = cur ? 2 : 1; c.strokeStyle = cur ? PB.hi : PB.lo; c.stroke();
    var devName = (BUILTIN[t] && BUILTIN[t].name) ? BUILTIN[t].name : (T('tier' + Math.min(t, 5)) + (t > 5 ? '+' + (t - 5) : ''));   // real level name (incl. themed cities) when authored
    c.fillStyle = PB.hi; c.font = 'bold ' + GF.clamp(8.5 * S, 7, 12) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(devName.length > 11 ? devName.slice(0, 10) + '.' : devName, x + cw / 2, y + ch / 2); }
  var bw = pw - 28 * S, byy = gy + nrows * (ch + 7 * S) + 10 * S;
  R.cheat = { x: px + 14 * S, y: byy, w: bw, h: GF.clamp(44 * S, 36, 56) }; GF.rr(c, R.cheat.x, R.cheat.y, bw, R.cheat.h, 8 * S); c.fillStyle = PB.warn; c.fill();
  c.fillStyle = '#02120a'; c.font = 'bold ' + GF.clamp(14 * S, 11, 18) + 'px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CHEAT  ' + T('cheat'), W / 2, R.cheat.y + R.cheat.h / 2);
  var cbh = GF.clamp(42 * S, 36, 54), cby = R.cheat.y + R.cheat.h + 10 * S;
  R.devClose = { x: px + 14 * S, y: cby, w: bw, h: cbh }; GF.rr(c, R.devClose.x, cby, bw, cbh, cbh / 2); c.fillStyle = PB.mid; c.fill();
  c.fillStyle = '#02120a'; c.font = 'bold ' + GF.clamp(14 * S, 11, 18) + 'px ui-monospace,monospace'; c.fillText(T('close'), W / 2, cby + cbh / 2);
}
function wrapText(c, text, x, y, maxW, lh) { var words = String(text).split(' '), line = '', yy = y; c.textAlign = 'left'; for (var i = 0; i < words.length; i++) { var p = line ? line + ' ' + words[i] : words[i]; if (c.measureText(p).width > maxW && line) { c.fillText(line, x, yy); line = words[i]; yy += lh; } else line = p; } if (line) { c.fillText(line, x, yy); yy += lh; } return yy; }

function draw(c) {
  syncState();
  drawFrame(c);
  deps.setStatsScrollMax(statsScrollMax);
}

return Object.freeze({ draw: draw });
}
