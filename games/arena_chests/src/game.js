(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 1;
  var H = 1;
  var DPR = 1;
  var S = 1;
  var compact = false;
  var buttons = [];
  var DATA = null;
  var fatal = '';
  var lastFrame = 0;
  var running = false;
  var audioCtx = null;

  var SAVE_KEY = 'lucky_brainrot_chests_save_v2';
  var LANG = ((navigator.language || 'en').toLowerCase().indexOf('ru') === 0) ? 'ru' : 'en';

  var UI = {
    en: {
      loading: 'LOADING BRAINROTS',
      title: 'Lucky Brainrot Chests',
      subtitle: 'Open boxes, steal drops, mutate dupes into louder brainrots.',
      opening: 'LUCKY BOX',
      open: 'OPEN BOX',
      freeOpen: 'FREE BOX',
      notEnough: 'NEED COINS',
      collection: 'BRAINDEX',
      craft: 'MUTATE',
      road: 'BRAINROT ROAD',
      daily: 'STEAL CONTRACT',
      claim: 'CLAIM',
      claimed: 'CLAIMED',
      close: 'CLOSE',
      next: 'NEXT',
      prev: 'PREV',
      newItem: 'NEW BRAINROT',
      duplicate: 'DUPED',
      shards: 'DNA',
      coins: 'COINS',
      value: 'CLOUT',
      opens: 'OPENS',
      profile: 'BRAINDEX',
      shelf: 'TOP BRAINROTS',
      level: 'LEVEL',
      progress: 'PROGRESS',
      unlocksAt: 'Unlocks at',
      locked: 'LOCKED',
      ready: 'READY',
      free: 'FREE',
      craftInfo: 'Spend DNA to force a mutation. Missing brainrots are favored.',
      roadInfo: 'Milestones reward coins, DNA, and free louder boxes.',
      collectionInfo: 'Grey cards are missing. Dupes add DNA and a little clout.',
      contractOpen: 'Open boxes',
      contractReward: 'Reward',
      completed: 'complete',
      tapChest: 'Open boxes. New brainrots raise clout; dupes turn into DNA.',
      noData: 'Could not load balance data.',
      guaranteed: 'Rare pity',
      pity: 'pity',
      steal: 'STEAL',
      stealReady: 'STEAL READY',
      stealWait: 'STEAL IN',
      stolen: 'STOLEN'
    },
    ru: {
      loading: 'ЗАГРУЗКА БРЕЙНРОТА',
      title: 'Сундуки Брейнрота',
      subtitle: 'Открывай боксы, воруй дроп, мутируй повторы в ДНК.',
      opening: 'ЛАКИ БОКС',
      open: 'ОТКРЫТЬ',
      freeOpen: 'БЕСПЛАТНО',
      notEnough: 'НУЖНЫ МОНЕТЫ',
      collection: 'БРЕЙНДЕКС',
      craft: 'МУТАЦИЯ',
      road: 'БРЕЙНРОТ ПУТЬ',
      daily: 'КОНТРАКТ',
      claim: 'ЗАБРАТЬ',
      claimed: 'ЗАБРАНО',
      close: 'ЗАКРЫТЬ',
      next: 'ДАЛЬШЕ',
      prev: 'НАЗАД',
      newItem: 'НОВЫЙ БРЕЙНРОТ',
      duplicate: 'ПОВТОР',
      shards: 'ДНК',
      coins: 'МОНЕТЫ',
      value: 'КЛАУТ',
      opens: 'ОТКРЫТИЙ',
      profile: 'БРЕЙНДЕКС',
      shelf: 'ТОП БРЕЙНРОТ',
      level: 'УРОВЕНЬ',
      progress: 'ПРОГРЕСС',
      unlocksAt: 'Откроется при',
      locked: 'ЗАКРЫТО',
      ready: 'ГОТОВО',
      free: 'БЕСПЛАТНО',
      craftInfo: 'Трать ДНК на гарантированную мутацию. Сначала падают недостающие.',
      roadInfo: 'Вехи дают монеты, ДНК и бесплатные громкие боксы.',
      collectionInfo: 'Серые карты еще не найдены. Повторы дают ДНК.',
      contractOpen: 'Открой боксы',
      contractReward: 'Награда',
      completed: 'готово',
      tapChest: 'Открывай боксы. Новые растят клаут, повторы дают ДНК.',
      noData: 'Не удалось загрузить баланс.',
      guaranteed: 'Пити редкого',
      pity: 'счетчик',
      steal: 'СТЫРИТЬ',
      stealReady: 'МОЖНО СТЫРИТЬ',
      stealWait: 'ЖДАТЬ',
      stolen: 'СТЫРИЛИ'
    }
  };

  var KIND = {
    goober:  { en: 'Goober', ru: 'Губер' },
    snack:   { en: 'Snack', ru: 'Снэк' },
    machine: { en: 'Machine', ru: 'Машина' },
    mutant:  { en: 'Mutant', ru: 'Мутант' },
    boss:    { en: 'Boss', ru: 'Босс' }
  };

  var ART_PATHS = {
    btnBlue: 'assets/ui/buttonLong_blue.png',
    btnBrown: 'assets/ui/buttonLong_brown.png',
    btnGrey: 'assets/ui/buttonLong_grey.png',
    'box_trash-box': 'assets/boxes/trash-box.png',
    'box_toilet-crate': 'assets/boxes/toilet-crate.png',
    'box_drip-vault': 'assets/boxes/drip-vault.png',
    'box_cursed-safe': 'assets/boxes/cursed-safe.png'
  };

  var ART = {};
  Object.keys(ART_PATHS).forEach(function (key) {
    var img = new Image();
    img.onload = function () { draw(); };
    img.src = ART_PATHS[key];
    ART[key] = img;
  });

  var state = null;
  var overlay = null;
  var collectionPage = 0;
  var selectedCraft = null;
  var spin = null;
  var reveal = null;
  var toast = null;
  var particles = [];

  function t(key) {
    return (UI[LANG] && UI[LANG][key]) || UI.en[key] || key;
  }

  function loc(obj) {
    return obj ? (obj[LANG] || obj.en || '') : '';
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function mix(a, b, p) {
    return Math.round(a + (b - a) * p);
  }

  function hexToRgb(hex) {
    var s = String(hex || '#ffffff').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return {
      r: parseInt(s.slice(0, 2), 16) || 255,
      g: parseInt(s.slice(2, 4), 16) || 255,
      b: parseInt(s.slice(4, 6), 16) || 255
    };
  }

  function lighten(hex, p) {
    var c = hexToRgb(hex);
    return 'rgb(' + mix(c.r, 255, p) + ',' + mix(c.g, 255, p) + ',' + mix(c.b, 255, p) + ')';
  }

  function darken(hex, p) {
    var c = hexToRgb(hex);
    return 'rgb(' + mix(c.r, 0, p) + ',' + mix(c.g, 0, p) + ',' + mix(c.b, 0, p) + ')';
  }

  function format(n) {
    n = Math.floor(Number(n) || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 10000) return Math.floor(n / 1000) + 'K';
    return String(n);
  }

  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }

  function fillRound(c, x, y, w, h, r, fill, stroke) {
    rr(c, x, y, w, h, r);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = Math.max(1, S);
      c.stroke();
    }
  }

  function textFit(c, text, x, y, maxW, size, weight, color, align) {
    var fs = size;
    c.textAlign = align || 'left';
    c.textBaseline = 'middle';
    c.fillStyle = color || '#ffffff';
    do {
      c.font = (weight ? weight + ' ' : '') + fs + 'px system-ui, -apple-system, Segoe UI, sans-serif';
      if (c.measureText(text).width <= maxW || fs <= 9) break;
      fs -= 1;
    } while (true);
    c.fillText(text, x, y);
  }

  function textBlock(c, text, x, y, maxW, size, color, weight) {
    var words = String(text).split(/\s+/);
    var line = '';
    var yy = y;
    var lh = size * 1.25;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = color || '#ffffff';
    c.font = (weight ? weight + ' ' : '') + size + 'px system-ui, -apple-system, Segoe UI, sans-serif';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (c.measureText(test).width > maxW && line) {
        c.fillText(line, x, yy);
        line = words[i];
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) c.fillText(line, x, yy);
    return yy + lh - y;
  }

  function addButton(id, x, y, w, h, label, fn, style) {
    var b = { id: id, x: x, y: y, w: w, h: h, label: label, fn: fn, style: style || {} };
    buttons.push(b);
    drawButton(ctx, b);
    return b;
  }

  function drawButton(c, b) {
    var st = b.style || {};
    var disabled = !!st.disabled;
    var fill = disabled ? '#2c3442' : (st.fill || '#f2b84b');
    var stroke = disabled ? '#465063' : (st.stroke || lighten(fill, 0.22));
    var txt = disabled ? '#a7afbd' : (st.text || '#10131d');
    var r = Math.min(12 * S, b.h / 2);
    var btnKey = disabled ? 'btnGrey' : (fill === '#303b52' || fill === '#2c3a55' || fill === '#2d405f' ? 'btnBlue' : 'btnBrown');
    if (imageReady(ART[btnKey])) {
      c.save();
      c.globalAlpha = disabled ? 0.72 : 1;
      c.drawImage(ART[btnKey], b.x, b.y, b.w, b.h);
      c.restore();
    } else {
      var grad = c.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      grad.addColorStop(0, disabled ? '#384253' : lighten(fill, 0.18));
      grad.addColorStop(1, disabled ? '#242b38' : darken(fill, 0.16));
      fillRound(c, b.x, b.y, b.w, b.h, r, grad, stroke);
      c.globalAlpha = disabled ? 0.45 : 0.9;
      c.fillStyle = '#ffffff';
      c.fillRect(b.x + 8 * S, b.y + 4 * S, Math.max(0, b.w - 16 * S), Math.max(1, 1.2 * S));
      c.globalAlpha = 1;
    }
    if (disabled) {
      fillRound(c, b.x, b.y, b.w, b.h, r, 'rgba(9,13,22,0.28)', stroke);
    }
    textFit(c, b.label, b.x + b.w / 2, b.y + b.h / 2, b.w - 16 * S, clamp(15 * S, 11, 18), '800', txt, 'center');
  }

  function imageReady(img) {
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  function viewportW() {
    return Math.max(1, Math.round((window.visualViewport && window.visualViewport.width) || window.innerWidth));
  }

  function viewportH() {
    return Math.max(1, Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight));
  }

  function resize() {
    W = viewportW();
    H = viewportH();
    DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    S = clamp(Math.min(W / 900, H / 640), 0.64, 1.28);
    compact = W < 760 || H < 560;
    draw();
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
    window.visualViewport.addEventListener('scroll', resize);
  }
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function defaultState() {
    return {
      version: DATA.version || 1,
      coins: DATA.starting.coins,
      shards: DATA.starting.shards,
      opens: 0,
      owned: {},
      roadClaimed: {},
      freeChests: Object.assign({}, DATA.starting.freeChests || {}),
      pity: {},
      selectedChest: 0,
      daily: { date: todayKey(), opens: 0, claimed: false },
      seenIntro: false,
      lastSteal: 0,
      lastSeen: Date.now(),
      history: []
    };
  }

  function normalizeState(s) {
    var base = defaultState();
    if (!s || typeof s !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      if (s[k] === undefined) s[k] = base[k];
    });
    if (!s.owned || typeof s.owned !== 'object') s.owned = {};
    if (!s.roadClaimed || typeof s.roadClaimed !== 'object') s.roadClaimed = {};
    if (!s.freeChests || typeof s.freeChests !== 'object') s.freeChests = {};
    if (!s.pity || typeof s.pity !== 'object') s.pity = {};
    if (!Number.isFinite(s.lastSteal)) s.lastSteal = 0;
    if (!s.daily || s.daily.date !== todayKey()) {
      s.daily = { date: todayKey(), opens: 0, claimed: false };
    }
    s.selectedChest = clamp(s.selectedChest || 0, 0, DATA.chests.length - 1);
    return s;
  }

  function save() {
    if (!state) return;
    state.lastSeen = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function load() {
    var loaded = null;
    try {
      loaded = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch (_) {}
    state = normalizeState(loaded);
    var awayMs = Math.max(0, Date.now() - (state.lastSeen || Date.now()));
    var awayMin = Math.min(240, Math.floor(awayMs / 60000));
    if (awayMin >= 10) {
      var grant = Math.floor(awayMin * Math.max(1, collectionValue() / 900 + 1));
      if (grant > 0) {
        state.coins += grant;
        toast = { text: '+' + grant + ' ' + t('coins'), life: 4, color: '#f2c66d' };
      }
    }
    save();
  }

  function rarity(id) {
    for (var i = 0; i < DATA.rarities.length; i++) {
      if (DATA.rarities[i].id === id) return DATA.rarities[i];
    }
    return DATA.rarities[0];
  }

  function rarityIndex(id) {
    for (var i = 0; i < DATA.rarities.length; i++) {
      if (DATA.rarities[i].id === id) return i;
    }
    return 0;
  }

  function itemById(id) {
    for (var i = 0; i < DATA.items.length; i++) {
      if (DATA.items[i].id === id) return DATA.items[i];
    }
    return null;
  }

  function chestById(id) {
    for (var i = 0; i < DATA.chests.length; i++) {
      if (DATA.chests[i].id === id) return DATA.chests[i];
    }
    return DATA.chests[0];
  }

  function currentChest() {
    return DATA.chests[state.selectedChest] || DATA.chests[0];
  }

  function collectionValue() {
    if (!DATA || !state) return 0;
    var total = 0;
    DATA.items.forEach(function (it) {
      var count = state.owned[it.id] || 0;
      if (!count) return;
      var r = rarity(it.rarity);
      total += r.value + Math.max(0, count - 1) * Math.floor(r.value * 0.12);
    });
    return total;
  }

  function uniqueOwned() {
    var n = 0;
    Object.keys(state.owned).forEach(function (id) {
      if (state.owned[id] > 0) n++;
    });
    return n;
  }

  function profileLevel() {
    return 1 + Math.floor(Math.sqrt(collectionValue() / 180));
  }

  function chestUnlocked(chest) {
    return collectionValue() >= (chest.unlockValue || 0);
  }

  function freeCount(chest) {
    return state.freeChests[chest.id] || 0;
  }

  function canOpen(chest) {
    return !spin && !reveal && chestUnlocked(chest) && (freeCount(chest) > 0 || state.coins >= chest.cost);
  }

  function adjustedRarity(chest) {
    var weights = [];
    var total = 0;
    for (var i = 0; i < DATA.rarities.length; i++) {
      var base = DATA.rarities[i].weight;
      var bonus = 1 + (chest.boost || 0) * i;
      var commonPenalty = i === 0 ? (1 - (chest.boost || 0) * 0.42) : 1;
      var w = Math.max(0.08, base * bonus * commonPenalty);
      weights.push(w);
      total += w;
    }
    var pity = state.pity[chest.id] || 0;
    if (pity + 1 >= chest.guaranteeRareEvery) {
      for (var j = 0; j < weights.length; j++) {
        if (j < 2) weights[j] = 0;
      }
      total = weights.reduce(function (a, b) { return a + b; }, 0);
    }
    var r = Math.random() * total;
    for (var k = 0; k < weights.length; k++) {
      r -= weights[k];
      if (r <= 0) return DATA.rarities[k].id;
    }
    return DATA.rarities[0].id;
  }

  function itemsForChestAndRarity(chest, rarityId) {
    var chestIndex = DATA.chests.indexOf(chest);
    var allowed = DATA.chests.slice(0, chestIndex + 1).map(function (c) { return c.id; });
    var exact = DATA.items.filter(function (it) {
      return allowed.indexOf(it.chest) >= 0 && it.rarity === rarityId;
    });
    if (exact.length) return exact;
    var target = rarityIndex(rarityId);
    for (var d = 1; d < DATA.rarities.length; d++) {
      var low = DATA.rarities[Math.max(0, target - d)].id;
      exact = DATA.items.filter(function (it) { return allowed.indexOf(it.chest) >= 0 && it.rarity === low; });
      if (exact.length) return exact;
      var high = DATA.rarities[Math.min(DATA.rarities.length - 1, target + d)].id;
      exact = DATA.items.filter(function (it) { return allowed.indexOf(it.chest) >= 0 && it.rarity === high; });
      if (exact.length) return exact;
    }
    return DATA.items.slice(0);
  }

  function rollItem(chest) {
    var rid = adjustedRarity(chest);
    var pool = itemsForChestAndRarity(chest, rid);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function awardItem(item, source) {
    var wasNew = !state.owned[item.id];
    var r = rarity(item.rarity);
    state.owned[item.id] = (state.owned[item.id] || 0) + 1;
    var shardGain = wasNew ? Math.max(1, Math.floor(r.shards * 0.35)) : r.shards;
    state.shards += shardGain;
    state.history.unshift({ id: item.id, source: source || 'open', time: Date.now(), wasNew: wasNew });
    state.history = state.history.slice(0, 12);
    return { wasNew: wasNew, shards: shardGain };
  }

  function openChest(chestId) {
    var chest = chestId ? chestById(chestId) : currentChest();
    if (!canOpen(chest)) return false;
    ensureAudio();
    if (freeCount(chest) > 0) {
      state.freeChests[chest.id] -= 1;
    } else {
      state.coins -= chest.cost;
    }
    state.opens += 1;
    state.daily.opens += 1;
    var winner = rollItem(chest);
    var ri = rarityIndex(winner.rarity);
    if (ri >= 2) state.pity[chest.id] = 0;
    else state.pity[chest.id] = (state.pity[chest.id] || 0) + 1;
    var reelItems = [];
    for (var i = 0; i < 28; i++) reelItems.push(rollItem(chest));
    var winnerIndex = 22;
    reelItems[winnerIndex] = winner;
    spin = {
      t: 0,
      dur: 2.85,
      chest: chest,
      items: reelItems,
      winner: winner,
      winnerIndex: winnerIndex,
      bonus: rollOpenBonus(chest),
      settled: false
    };
    reveal = null;
    spawnChestBurst(chest.color, 18);
    playTone(180, 0.07, 'sawtooth', 0.06);
    save();
    return true;
  }

  function finishSpin() {
    if (!spin || spin.settled) return;
    spin.settled = true;
    var result = awardItem(spin.winner, 'open');
    if (spin.bonus) {
      state.coins += spin.bonus.coins || 0;
      state.shards += spin.bonus.shards || 0;
    }
    reveal = {
      item: spin.winner,
      wasNew: result.wasNew,
      shards: result.shards,
      bonusCoins: spin.bonus ? spin.bonus.coins : 0,
      bonusShards: spin.bonus ? spin.bonus.shards : 0,
      t: 0,
      source: 'open'
    };
    var r = rarity(spin.winner.rarity);
    spawnCardBurst(r.glow, 34 + rarityIndex(r.id) * 10);
    playTone(420 + rarityIndex(r.id) * 80, 0.13, 'triangle', 0.08);
    spin = null;
    save();
  }

  function rollOpenBonus(chest) {
    var minCoins = Number(chest.coinDropMin || 0);
    var maxCoins = Number(chest.coinDropMax || minCoins);
    var coins = maxCoins > minCoins ? minCoins + Math.floor(Math.random() * (maxCoins - minCoins + 1)) : minCoins;
    var shards = 0;
    if (Math.random() < Number(chest.shardDropChance || 0)) {
      var minShards = Number(chest.shardDropMin || 0);
      var maxShards = Number(chest.shardDropMax || minShards);
      shards = maxShards > minShards ? minShards + Math.floor(Math.random() * (maxShards - minShards + 1)) : minShards;
    }
    return { coins: coins, shards: shards };
  }

  function craft(rarityId) {
    var cfg = DATA.crafting.filter(function (c) { return c.rarity === rarityId; })[0];
    if (!cfg || state.shards < cfg.cost || spin) return false;
    ensureAudio();
    state.shards -= cfg.cost;
    var pool = DATA.items.filter(function (it) { return it.rarity === rarityId && !state.owned[it.id]; });
    if (!pool.length) pool = DATA.items.filter(function (it) { return it.rarity === rarityId; });
    var item = pool[Math.floor(Math.random() * pool.length)];
    var result = awardItem(item, 'craft');
    overlay = null;
    reveal = {
      item: item,
      wasNew: result.wasNew,
      shards: result.shards,
      t: 0,
      source: 'craft'
    };
    spawnCardBurst(rarity(item.rarity).glow, 42);
    playTone(520 + rarityIndex(item.rarity) * 80, 0.16, 'triangle', 0.08);
    save();
    return true;
  }

  function roadProgress(m) {
    return m.type === 'value' ? collectionValue() : state.opens;
  }

  function roadReady(m) {
    return !state.roadClaimed[m.id] && roadProgress(m) >= m.target;
  }

  function anyRoadReady() {
    return DATA.road.some(roadReady);
  }

  function rewardText(reward) {
    if (reward.kind === 'coins') return '+' + format(reward.amount) + ' ' + t('coins');
    if (reward.kind === 'shards') return '+' + format(reward.amount) + ' ' + t('shards');
    if (reward.kind === 'freeChest') return '+' + reward.amount + ' ' + loc(chestById(reward.chest));
    return '';
  }

  function grantReward(reward) {
    if (reward.kind === 'coins') state.coins += reward.amount;
    if (reward.kind === 'shards') state.shards += reward.amount;
    if (reward.kind === 'freeChest') {
      state.freeChests[reward.chest] = (state.freeChests[reward.chest] || 0) + reward.amount;
    }
  }

  function claimRoad(id) {
    var m = DATA.road.filter(function (x) { return x.id === id; })[0];
    if (!m || !roadReady(m)) return;
    ensureAudio();
    state.roadClaimed[id] = true;
    grantReward(m.reward);
    toast = { text: rewardText(m.reward), life: 2.4, color: '#f2c66d' };
    spawnCardBurst('#f2c66d', 24);
    playTone(680, 0.12, 'triangle', 0.07);
    save();
  }

  function dailyReady() {
    return state.daily.opens >= DATA.daily.targetOpens && !state.daily.claimed;
  }

  function claimDaily() {
    if (!dailyReady()) return;
    ensureAudio();
    state.daily.claimed = true;
    state.coins += DATA.daily.rewardCoins;
    state.shards += DATA.daily.rewardShards;
    if (DATA.daily.rewardFreeChest) grantReward({
      kind: 'freeChest',
      chest: DATA.daily.rewardFreeChest.chest,
      amount: DATA.daily.rewardFreeChest.amount
    });
    toast = { text: dailyRewardText(), life: 2.8, color: '#8df6dc' };
    spawnCardBurst('#8df6dc', 28);
    playTone(760, 0.12, 'triangle', 0.08);
    save();
  }

  function dailyRewardText() {
    var parts = [];
    if (DATA.daily.rewardCoins) parts.push('+' + DATA.daily.rewardCoins + ' ' + t('coins'));
    if (DATA.daily.rewardShards) parts.push('+' + DATA.daily.rewardShards + ' ' + t('shards'));
    if (DATA.daily.rewardFreeChest) {
      parts.push('+' + DATA.daily.rewardFreeChest.amount + ' ' + loc(chestById(DATA.daily.rewardFreeChest.chest)));
    }
    return parts.join(', ');
  }

  function stealCooldownMs() {
    return 20000;
  }

  function stealRemainingMs() {
    return Math.max(0, stealCooldownMs() - (Date.now() - (state.lastSteal || 0)));
  }

  function stealReady() {
    return !spin && !reveal && stealRemainingMs() <= 0;
  }

  function stealDrop() {
    if (!stealReady()) return false;
    ensureAudio();
    state.lastSteal = Date.now();
    var roll = Math.random();
    var text = '';
    if (roll < 0.45) {
      var coins = 70 + Math.floor(Math.random() * (110 + profileLevel() * 10));
      state.coins += coins;
      text = t('stolen') + ': +' + coins + ' ' + t('coins');
    } else if (roll < 0.72) {
      var dna = 14 + Math.floor(Math.random() * (26 + profileLevel() * 2));
      state.shards += dna;
      text = t('stolen') + ': +' + dna + ' ' + t('shards');
    } else {
      var unlocked = DATA.chests.filter(chestUnlocked);
      var chest = unlocked[Math.min(unlocked.length - 1, Math.floor(Math.pow(Math.random(), 1.7) * unlocked.length))] || currentChest();
      state.freeChests[chest.id] = (state.freeChests[chest.id] || 0) + 1;
      text = t('stolen') + ': +' + loc(chest);
    }
    toast = { text: text, life: 2.4, color: '#ff62d2' };
    spawnCardBurst('#ff62d2', 26);
    playTone(320, 0.07, 'square', 0.05);
    playTone(620, 0.11, 'triangle', 0.06);
    save();
    return true;
  }

  function nextChest(dir) {
    var start = state.selectedChest;
    for (var i = 0; i < DATA.chests.length; i++) {
      state.selectedChest = (state.selectedChest + dir + DATA.chests.length) % DATA.chests.length;
      if (chestUnlocked(currentChest()) || i === DATA.chests.length - 1) break;
    }
    if (state.selectedChest !== start) save();
  }

  function ensureAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {}
  }

  function playTone(freq, dur, type, gain) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var osc = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      g.gain.value = gain || 0.05;
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (_) {}
  }

  function spawnChestBurst(color, n) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: W * 0.5 + (Math.random() - 0.5) * 90 * S,
        y: H * 0.47 + (Math.random() - 0.5) * 70 * S,
        vx: (Math.random() - 0.5) * 180 * S,
        vy: (Math.random() - 0.8) * 190 * S,
        life: 0.7 + Math.random() * 0.6,
        color: color,
        r: 2 + Math.random() * 4 * S
      });
    }
  }

  function spawnCardBurst(color, n) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: W * 0.5,
        y: H * 0.48,
        vx: (Math.random() - 0.5) * 260 * S,
        vy: (Math.random() - 0.65) * 240 * S,
        life: 0.9 + Math.random() * 0.9,
        color: color,
        r: 2 + Math.random() * 5 * S
      });
    }
  }

  function update(dt) {
    if (!DATA || !state) return;
    if (spin) {
      spin.t += dt;
      if (spin.t >= spin.dur) finishSpin();
    }
    if (reveal) reveal.t += dt;
    if (toast) {
      toast.life -= dt;
      if (toast.life <= 0) toast = null;
    }
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 280 * S * dt;
      p.vx *= Math.pow(0.94, dt * 60);
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function clear() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buttons = [];
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#16101f');
    g.addColorStop(0.42, '#241439');
    g.addColorStop(1, '#101b2c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawArenaBackground() {
    var c = ctx;
    c.save();
    var colors = ['#ff62d2', '#57e7ff', '#a8f05a', '#ffd447'];
    for (var i = 0; i < 12; i++) {
      var x = ((i * 197) % Math.max(1, W + 180 * S)) - 90 * S;
      var y = 50 * S + ((i * 113) % Math.max(1, H + 120 * S)) - 70 * S;
      var rad = (90 + (i % 4) * 28) * S;
      c.globalAlpha = 0.14 + (i % 3) * 0.035;
      c.fillStyle = colors[i % colors.length];
      c.beginPath();
      c.ellipse(x, y, rad * 1.35, rad, (i % 2 ? -0.35 : 0.22), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 0.12;
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(1, 2 * S);
    for (var gx = -W; gx < W * 2; gx += 62 * S) {
      c.beginPath();
      c.moveTo(gx, 0);
      c.lineTo(gx + W * 0.42, H);
      c.stroke();
    }
    c.globalAlpha = 0.16;
    for (var j = 0; j < 18; j++) {
      var sx = ((j * 151) % Math.max(1, W));
      var sy = ((j * 89) % Math.max(1, H));
      var r = (4 + (j % 4) * 2.2) * S;
      c.fillStyle = colors[(j + 1) % colors.length];
      c.beginPath();
      c.moveTo(sx, sy - r * 2.1);
      c.lineTo(sx + r * 0.55, sy - r * 0.55);
      c.lineTo(sx + r * 2.1, sy);
      c.lineTo(sx + r * 0.55, sy + r * 0.55);
      c.lineTo(sx, sy + r * 2.1);
      c.lineTo(sx - r * 0.55, sy + r * 0.55);
      c.lineTo(sx - r * 2.1, sy);
      c.lineTo(sx - r * 0.55, sy - r * 0.55);
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;
    c.restore();
  }

  function drawTopBar() {
    var c = ctx;
    var h = compact ? 84 * S : 70 * S;
    var grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(18,24,37,0.96)');
    grad.addColorStop(1, 'rgba(20,28,45,0.84)');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, h);
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.beginPath();
    c.moveTo(0, h);
    c.lineTo(W, h);
    c.stroke();

    var pad = 14 * S;
    var titleW = compact ? W * 0.42 : 230 * S;
    textFit(c, t('title'), pad, compact ? 20 * S : 24 * S, titleW, clamp(22 * S, 15, 28), '900', '#f5f1e7', 'left');
    textFit(c, t('level') + ' ' + profileLevel(), pad, compact ? 52 * S : 50 * S, titleW, clamp(12 * S, 10, 14), '800', '#9fb2cc', 'left');

    var pillY = compact ? 12 * S : 15 * S;
    var pillH = compact ? 28 * S : 38 * S;
    var right = W - pad;
    var pills = [
      [t('coins'), format(state.coins), '#f2c66d'],
      [t('shards'), format(state.shards), '#8df6dc'],
      [t('value'), format(collectionValue()), '#a9d9ff'],
      [t('opens'), format(state.opens), '#d9c2ff']
    ];
    if (compact) pills = pills.slice(0, 3);
    var pw = compact ? Math.min(92 * S, (W - titleW - pad * 2) / pills.length - 3 * S) : 112 * S;
    for (var i = pills.length - 1; i >= 0; i--) {
      right -= pw;
      drawPill(c, right, pillY, pw, pillH, pills[i][0], pills[i][1], pills[i][2]);
      right -= 8 * S;
    }
  }

  function drawPill(c, x, y, w, h, label, val, color) {
    fillRound(c, x, y, w, h, h / 2, 'rgba(10,14,24,0.68)', 'rgba(255,255,255,0.12)');
    c.fillStyle = color;
    c.beginPath();
    c.arc(x + h * 0.5, y + h * 0.5, h * 0.22, 0, Math.PI * 2);
    c.fill();
    textFit(c, val, x + h * 0.85, y + h * 0.38, w - h, clamp(14 * S, 10, 17), '900', '#ffffff', 'left');
    textFit(c, label, x + h * 0.85, y + h * 0.72, w - h, clamp(9.5 * S, 8, 11), '800', '#8e9cb2', 'left');
  }

  function drawPanel(x, y, w, h, title) {
    var c = ctx;
    var g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(29,39,59,0.92)');
    g.addColorStop(1, 'rgba(16,21,34,0.92)');
    fillRound(c, x, y, w, h, 14 * S, g, 'rgba(255,255,255,0.13)');
    c.fillStyle = 'rgba(255,255,255,0.035)';
    c.fillRect(x + 1, y + 1, w - 2, Math.max(1, h * 0.34));
    if (title) {
      textFit(c, title, x + 14 * S, y + 22 * S, w - 28 * S, clamp(14 * S, 11, 18), '900', '#f7efe2', 'left');
    }
  }

  function mainLayout() {
    var top = compact ? 94 * S : 82 * S;
    var pad = 14 * S;
    var bottom = 14 * S;
    if (compact) {
      var chestH = 104 * S;
      var centerY = top + chestH + 12 * S;
      var centerH = Math.min(410 * S, Math.max(260 * S, H - centerY - 214 * S));
      var sideY = centerY + centerH + 12 * S;
      var sideAvail = H - sideY - bottom;
      var sideH = Math.max(150 * S, Math.min(230 * S, sideAvail));
      if (sideY + sideH + bottom > H) sideH = Math.max(118 * S, sideAvail);
      return {
        pad: pad,
        chest: { x: pad, y: top, w: W - pad * 2, h: chestH },
        center: { x: pad, y: centerY, w: W - pad * 2, h: centerH },
        side: { x: pad, y: sideY, w: W - pad * 2, h: sideH }
      };
    }
    var leftW = clamp(230 * S, 205, 280);
    var rightW = clamp(245 * S, 220, 310);
    return {
      pad: pad,
      chest: { x: pad, y: top, w: leftW, h: H - top - bottom },
      center: { x: pad + leftW + pad, y: top, w: W - leftW - rightW - pad * 4, h: H - top - bottom },
      side: { x: W - rightW - pad, y: top, w: rightW, h: H - top - bottom }
    };
  }

  function drawMain() {
    drawArenaBackground();
    if (!DATA || !state) {
      textFit(ctx, fatal || t('loading'), W / 2, H / 2, W - 40, 24 * S, '900', '#ffffff', 'center');
      return;
    }
    drawTopBar();
    var L = mainLayout();
    drawChestPanel(L.chest);
    drawOpeningPanel(L.center);
    drawProfilePanel(L.side);
    drawParticles();
    drawToast();
    if (reveal) drawReveal();
    if (overlay) drawOverlay();
  }

  function drawChestPanel(r) {
    var c = ctx;
    drawPanel(r.x, r.y, r.w, r.h, loc(currentChest()));
    var chest = currentChest();
    var free = freeCount(chest);
    var y = r.y + (compact ? 24 * S : 52 * S);
    if (!compact) {
      DATA.chests.forEach(function (ch, i) {
        var locked = !chestUnlocked(ch);
        var h = 56 * S;
        var fill = i === state.selectedChest ? ch.color : 'rgba(16,22,34,0.82)';
        addButton('chest-' + i, r.x + 12 * S, y, r.w - 24 * S, h, loc(ch), function () {
          if (chestUnlocked(ch)) {
            state.selectedChest = i;
            save();
          }
        }, { fill: fill, text: '#ffffff', disabled: locked });
        if (locked) {
          textFit(c, t('unlocksAt') + ' ' + format(ch.unlockValue), r.x + r.w / 2, y + h + 12 * S, r.w - 30 * S, 10 * S, '700', '#92a1b8', 'center');
        }
        y += h + 18 * S;
      });
    } else {
      addButton('prevChest', r.x + 12 * S, r.y + 46 * S, 52 * S, 42 * S, '<', function () { nextChest(-1); }, { fill: '#2c3a55', text: '#ffffff' });
      addButton('nextChest', r.x + r.w - 64 * S, r.y + 46 * S, 52 * S, 42 * S, '>', function () { nextChest(1); }, { fill: '#2c3a55', text: '#ffffff' });
      textFit(c, loc(chest), r.x + r.w / 2, r.y + 60 * S, r.w - 150 * S, 17 * S, '900', '#ffffff', 'center');
      textFit(c, free ? t('free') + ': ' + free : t('coins') + ': ' + chest.cost, r.x + r.w / 2, r.y + 84 * S, r.w - 150 * S, 12 * S, '800', chest.accent, 'center');
    }

    if (!compact) {
      var infoY = r.y + r.h - 176 * S;
      drawMiniChest(r.x + r.w / 2, infoY + 40 * S, 126 * S, chest, false);
      textFit(c, free ? t('free') + ': ' + free : t('coins') + ': ' + chest.cost, r.x + r.w / 2, infoY + 96 * S, r.w - 30 * S, 14 * S, '900', chest.accent, 'center');
      textFit(c, t('guaranteed') + ': ' + Math.max(0, chest.guaranteeRareEvery - (state.pity[chest.id] || 0)), r.x + r.w / 2, infoY + 120 * S, r.w - 30 * S, 11 * S, '800', '#9fb2cc', 'center');
      textBlock(c, t('tapChest'), r.x + 16 * S, infoY + 138 * S, r.w - 32 * S, clamp(10.5 * S, 9, 13), '#b9c7dc', '700');
    }
  }

  function drawOpeningPanel(r) {
    var c = ctx;
    var chest = currentChest();
    drawPanel(r.x, r.y, r.w, r.h, t('opening'));
    var chestY = r.y + (compact ? 72 * S : 122 * S);
    drawMiniChest(r.x + r.w / 2, chestY, compact ? 172 * S : 226 * S, chest, !!spin);
    drawReel(r);
    var btnY = r.y + r.h - (compact ? 58 * S : 72 * S);
    var can = canOpen(chest);
    var label = freeCount(chest) > 0 ? t('freeOpen') : (can ? t('open') : t('notEnough'));
    addButton('open', r.x + r.w * 0.16, btnY, r.w * 0.68, compact ? 46 * S : 54 * S, label, function () { openChest(); }, {
      fill: chest.color,
      stroke: chest.accent,
      text: '#ffffff',
      disabled: !can
    });
    if (!compact) {
      addButton('collection', r.x + 18 * S, r.y + r.h - 136 * S, (r.w - 54 * S) / 3, 42 * S, t('collection'), function () { overlay = 'collection'; }, { fill: '#2d405f', text: '#ffffff' });
      addButton('craft', r.x + 27 * S + (r.w - 54 * S) / 3, r.y + r.h - 136 * S, (r.w - 54 * S) / 3, 42 * S, t('craft'), function () { overlay = 'craft'; }, { fill: '#36514f', text: '#ffffff' });
      addButton('road', r.x + 36 * S + 2 * (r.w - 54 * S) / 3, r.y + r.h - 136 * S, (r.w - 54 * S) / 3, 42 * S, anyRoadReady() ? t('claim') : t('road'), function () { overlay = 'road'; }, { fill: anyRoadReady() ? '#d19b36' : '#4a345f', text: '#ffffff' });
    }
  }

  function drawReel(r) {
    var c = ctx;
    var areaY = r.y + (compact ? 168 * S : 238 * S);
    var areaH = compact ? Math.min(112 * S, r.h * 0.34) : 136 * S;
    var x = r.x + 20 * S;
    var w = r.w - 40 * S;
    fillRound(c, x, areaY, w, areaH, 12 * S, 'rgba(8,12,22,0.78)', 'rgba(255,255,255,0.13)');
    c.save();
    rr(c, x, areaY, w, areaH, 12 * S);
    c.clip();
    var cardW = compact ? 72 * S : 86 * S;
    var gap = 10 * S;
    var center = x + w / 2;
    if (spin) {
      var p = clamp(spin.t / spin.dur, 0, 1);
      var ease = 1 - Math.pow(1 - p, 4);
      var target = spin.winnerIndex * (cardW + gap);
      var offset = target * ease;
      for (var i = 0; i < spin.items.length; i++) {
        var xx = center - offset + i * (cardW + gap) - cardW / 2;
        if (xx > x - cardW && xx < x + w + cardW) {
          drawItemCard(spin.items[i], xx, areaY + 12 * S, cardW, areaH - 24 * S, state.owned[spin.items[i].id] > 0, true);
        }
      }
    } else {
      var shelf = bestItems(8);
      if (!shelf.length) shelf = DATA.items.slice(0, 8);
      for (var j = 0; j < shelf.length; j++) {
        var xx2 = center + (j - (shelf.length - 1) / 2) * (cardW + gap) - cardW / 2;
        drawItemCard(shelf[j], xx2, areaY + 12 * S, cardW, areaH - 24 * S, state.owned[shelf[j].id] > 0, true);
      }
    }
    var glow = c.createLinearGradient(x, 0, x + w, 0);
    glow.addColorStop(0, 'rgba(8,12,22,0.92)');
    glow.addColorStop(0.18, 'rgba(8,12,22,0)');
    glow.addColorStop(0.82, 'rgba(8,12,22,0)');
    glow.addColorStop(1, 'rgba(8,12,22,0.92)');
    c.fillStyle = glow;
    c.fillRect(x, areaY, w, areaH);
    c.restore();
    c.strokeStyle = '#ffffff';
    c.globalAlpha = 0.82;
    c.lineWidth = Math.max(2, 2.5 * S);
    c.beginPath();
    c.moveTo(center, areaY + 7 * S);
    c.lineTo(center, areaY + areaH - 7 * S);
    c.stroke();
    c.globalAlpha = 1;
  }

  function drawProfilePanel(r) {
    var c = ctx;
    drawPanel(r.x, r.y, r.w, r.h, compact ? t('daily') : t('profile'));
    if (compact) {
      var bw = (r.w - 42 * S) / 3;
      addButton('collection-m', r.x + 12 * S, r.y + 14 * S, bw, 42 * S, t('collection'), function () { overlay = 'collection'; }, { fill: '#2d405f', text: '#ffffff' });
      addButton('craft-m', r.x + 21 * S + bw, r.y + 14 * S, bw, 42 * S, t('craft'), function () { overlay = 'craft'; }, { fill: '#36514f', text: '#ffffff' });
      addButton('road-m', r.x + 30 * S + 2 * bw, r.y + 14 * S, bw, 42 * S, anyRoadReady() ? t('claim') : t('road'), function () { overlay = 'road'; }, { fill: anyRoadReady() ? '#d19b36' : '#4a345f', text: '#ffffff' });
      drawDaily(r.x + 12 * S, r.y + 70 * S, r.w - 24 * S, r.h - 82 * S);
      return;
    }
    var value = collectionValue();
    var total = DATA.items.length;
    textFit(c, t('level') + ' ' + profileLevel(), r.x + 16 * S, r.y + 56 * S, r.w - 32 * S, 24 * S, '900', '#f7efe2', 'left');
    textFit(c, uniqueOwned() + '/' + total + ' - ' + t('value') + ' ' + format(value), r.x + 16 * S, r.y + 84 * S, r.w - 32 * S, 13 * S, '800', '#a8b8cf', 'left');
    drawShelf(r.x + 14 * S, r.y + 106 * S, r.w - 28 * S, 104 * S);
    drawDaily(r.x + 14 * S, r.y + 226 * S, r.w - 28 * S, 136 * S);
    drawRoadPreview(r.x + 14 * S, r.y + 378 * S, r.w - 28 * S, r.h - 392 * S);
  }

  function drawShelf(x, y, w, h) {
    var c = ctx;
    fillRound(c, x, y, w, h, 12 * S, 'rgba(7,11,19,0.55)', 'rgba(255,255,255,0.10)');
    textFit(c, t('shelf'), x + 10 * S, y + 16 * S, w - 20 * S, 12 * S, '900', '#b9c7dc', 'left');
    var items = bestItems(4);
    var cw = (w - 20 * S - 3 * 8 * S) / 4;
    for (var i = 0; i < 4; i++) {
      if (items[i]) drawItemCard(items[i], x + 10 * S + i * (cw + 8 * S), y + 34 * S, cw, h - 44 * S, true, true);
      else drawEmptySlot(x + 10 * S + i * (cw + 8 * S), y + 34 * S, cw, h - 44 * S);
    }
  }

  function drawDaily(x, y, w, h) {
    var c = ctx;
    fillRound(c, x, y, w, h, 12 * S, 'rgba(11,18,28,0.72)', dailyReady() ? '#8df6dc' : 'rgba(255,255,255,0.11)');
    var stealMs = stealRemainingMs();
    var stealLabel = stealMs <= 0 ? t('steal') : Math.ceil(stealMs / 1000) + 's';
    textFit(c, t('daily'), x + 12 * S, y + 18 * S, w - 128 * S, 13 * S, '900', '#f7efe2', 'left');
    addButton('steal', x + w - 106 * S, y + 9 * S, 94 * S, 30 * S, stealLabel, stealDrop, {
      fill: stealMs <= 0 ? '#ff62d2' : '#303b52',
      text: '#ffffff',
      disabled: stealMs > 0 || !!spin || !!reveal
    });
    var prog = clamp(state.daily.opens / DATA.daily.targetOpens, 0, 1);
    textFit(c, t('contractOpen') + ' ' + state.daily.opens + '/' + DATA.daily.targetOpens, x + 12 * S, y + 43 * S, w - 24 * S, 12 * S, '800', '#aabbd2', 'left');
    fillRound(c, x + 12 * S, y + 62 * S, w - 24 * S, 10 * S, 5 * S, 'rgba(255,255,255,0.10)');
    fillRound(c, x + 12 * S, y + 62 * S, (w - 24 * S) * prog, 10 * S, 5 * S, '#8df6dc');
    if (h > 112 * S) {
      textFit(c, t('contractReward') + ': ' + dailyRewardText(), x + 12 * S, y + 88 * S, w - 24 * S, 11 * S, '800', '#d8e5f3', 'left');
    }
    addButton('dailyClaim', x + w - 108 * S, y + h - 42 * S, 96 * S, 32 * S, state.daily.claimed ? t('claimed') : t('claim'), claimDaily, { fill: '#36b69b', text: '#07121b', disabled: !dailyReady() });
  }

  function drawRoadPreview(x, y, w, h) {
    var c = ctx;
    if (h < 80 * S) return;
    fillRound(c, x, y, w, h, 12 * S, 'rgba(11,18,28,0.72)', anyRoadReady() ? '#f2c66d' : 'rgba(255,255,255,0.11)');
    textFit(c, t('road'), x + 12 * S, y + 18 * S, w - 24 * S, 13 * S, '900', '#f7efe2', 'left');
    var next = DATA.road.filter(function (m) { return !state.roadClaimed[m.id]; })[0] || DATA.road[DATA.road.length - 1];
    var prog = clamp(roadProgress(next) / next.target, 0, 1);
    textFit(c, (next.type === 'value' ? t('value') : t('opens')) + ' ' + format(roadProgress(next)) + '/' + format(next.target), x + 12 * S, y + 44 * S, w - 24 * S, 12 * S, '800', '#aabbd2', 'left');
    fillRound(c, x + 12 * S, y + 64 * S, w - 24 * S, 10 * S, 5 * S, 'rgba(255,255,255,0.10)');
    fillRound(c, x + 12 * S, y + 64 * S, (w - 24 * S) * prog, 10 * S, 5 * S, '#f2c66d');
    textFit(c, rewardText(next.reward), x + 12 * S, y + 92 * S, w - 24 * S, 12 * S, '900', '#ffe7a2', 'left');
    addButton('roadOpen', x + w - 108 * S, y + h - 42 * S, 96 * S, 32 * S, anyRoadReady() ? t('claim') : t('road'), function () { overlay = 'road'; }, { fill: anyRoadReady() ? '#d19b36' : '#4a345f', text: '#ffffff' });
  }

  function bestItems(n) {
    var arr = DATA.items.filter(function (it) { return state.owned[it.id] > 0; });
    arr.sort(function (a, b) {
      return rarity(b.rarity).value - rarity(a.rarity).value;
    });
    return arr.slice(0, n);
  }

  function hashText(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function artKeyForItem(item) {
    return 'brainrot_' + item.id;
  }

  function brainrotImage(item) {
    var key = artKeyForItem(item);
    if (!ART[key]) {
      var img = new Image();
      img.onload = function () { draw(); };
      img.src = 'assets/brainrots/' + item.id + '.png';
      ART[key] = img;
    }
    return ART[key];
  }

  function drawArtIcon(c, item, x, y, size) {
    var img = brainrotImage(item);
    if (!imageReady(img)) return false;
    c.save();
    c.shadowColor = rarity(item.rarity).glow;
    c.shadowBlur = Math.max(8, 16 * S);
    c.drawImage(img, x - size / 2, y - size / 2, size, size);
    c.restore();
    return true;
  }

  function drawItemCard(item, x, y, w, h, owned, small) {
    var c = ctx;
    var r = rarity(item.rarity);
    var bg = c.createRadialGradient(x + w * 0.62, y + h * 0.18, 2, x + w * 0.5, y + h * 0.56, Math.max(w, h));
    bg.addColorStop(0, owned ? lighten(r.color, 0.34) : '#515c6d');
    bg.addColorStop(0.42, owned ? darken(r.color, 0.18) : '#343d4b');
    bg.addColorStop(1, owned ? '#111722' : '#1b222d');
    fillRound(c, x, y, w, h, 10 * S, bg, owned ? r.glow : 'rgba(255,255,255,0.14)');
    c.save();
    rr(c, x, y, w, h, 10 * S);
    c.clip();
    c.globalAlpha = owned ? 0.26 : 0.10;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x + w * 0.78, y + h * 0.18, w * 0.34, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    if (!drawArtIcon(c, item, x + w * 0.5, y + h * 0.42, Math.min(w, h) * (small ? 1.06 : 0.96))) {
      drawKindIcon(c, item.kind, x + w * 0.5, y + h * 0.43, Math.min(w, h) * 0.44, owned ? '#ffffff' : '#9ca7b6', r.color);
    }
    c.restore();
    if (!small) {
      textFit(c, loc(item), x + w / 2, y + h - 28 * S, w - 12 * S, 11 * S, '900', owned ? '#ffffff' : '#aab2bf', 'center');
      textFit(c, loc(r), x + w / 2, y + h - 12 * S, w - 12 * S, 9.5 * S, '800', owned ? '#f2f6ff' : '#7d8798', 'center');
    } else if (h > 62 * S) {
      textFit(c, loc(r), x + w / 2, y + h - 12 * S, w - 8 * S, 9 * S, '900', owned ? '#ffffff' : '#8d96a5', 'center');
    }
  }

  function drawEmptySlot(x, y, w, h) {
    fillRound(ctx, x, y, w, h, 10 * S, 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.10)');
    ctx.globalAlpha = 0.3;
    drawKindIcon(ctx, 'goober', x + w / 2, y + h / 2, Math.min(w, h) * 0.36, '#ffffff', '#6d7c92');
    ctx.globalAlpha = 1;
  }

  function drawKindIcon(c, kind, x, y, size, color, accent) {
    c.save();
    c.translate(x, y);
    c.fillStyle = color;
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, size * 0.08);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    var s = size;
    if (kind === 'goober') {
      c.beginPath();
      c.ellipse(0, 0, s * 0.42, s * 0.5, 0.12, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = accent;
      c.beginPath();
      c.arc(-s * 0.34, s * 0.18, s * 0.16, 0, Math.PI * 2);
      c.arc(s * 0.34, s * 0.18, s * 0.16, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#10131d';
      c.beginPath();
      c.arc(-s * 0.14, -s * 0.08, s * 0.06, 0, Math.PI * 2);
      c.arc(s * 0.14, -s * 0.08, s * 0.06, 0, Math.PI * 2);
      c.fill();
    } else if (kind === 'snack') {
      c.beginPath();
      c.roundRect(-s * 0.43, -s * 0.34, s * 0.86, s * 0.62, s * 0.16);
      c.fill();
      c.fillStyle = accent;
      c.beginPath();
      c.arc(-s * 0.18, -s * 0.08, s * 0.08, 0, Math.PI * 2);
      c.arc(s * 0.2, s * 0.08, s * 0.08, 0, Math.PI * 2);
      c.fill();
    } else if (kind === 'machine') {
      c.beginPath();
      c.roundRect(-s * 0.44, -s * 0.32, s * 0.88, s * 0.64, s * 0.11);
      c.fill();
      c.fillStyle = accent;
      c.beginPath();
      c.roundRect(-s * 0.3, -s * 0.12, s * 0.6, s * 0.24, s * 0.06);
      c.fill();
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(0, -s * 0.32);
      c.lineTo(0, -s * 0.54);
      c.stroke();
      c.fillStyle = accent;
      c.beginPath();
      c.arc(0, -s * 0.58, s * 0.08, 0, Math.PI * 2);
      c.fill();
    } else if (kind === 'mutant') {
      c.beginPath();
      c.ellipse(0, -s * 0.02, s * 0.36, s * 0.46, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = accent;
      c.beginPath();
      c.moveTo(-s * 0.2, s * 0.22);
      c.quadraticCurveTo(-s * 0.55, s * 0.38, -s * 0.42, s * 0.56);
      c.moveTo(s * 0.2, s * 0.22);
      c.quadraticCurveTo(s * 0.55, s * 0.38, s * 0.42, s * 0.56);
      c.stroke();
      c.fillStyle = accent;
      c.beginPath();
      c.arc(0, -s * 0.2, s * 0.09, 0, Math.PI * 2);
      c.fill();
    } else if (kind === 'boss') {
      c.beginPath();
      c.moveTo(-s * 0.42, -s * 0.2);
      c.lineTo(-s * 0.56, -s * 0.58);
      c.lineTo(-s * 0.16, -s * 0.34);
      c.lineTo(0, -s * 0.54);
      c.lineTo(s * 0.16, -s * 0.34);
      c.lineTo(s * 0.56, -s * 0.58);
      c.lineTo(s * 0.42, -s * 0.2);
      c.closePath();
      c.fill();
      c.beginPath();
      c.ellipse(0, s * 0.08, s * 0.42, s * 0.36, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = accent;
      c.beginPath();
      c.arc(0, s * 0.04, s * 0.12, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 3;
        var rr2 = i % 2 ? s * 0.28 : s * 0.48;
        var px = Math.cos(a) * rr2;
        var py = Math.sin(a) * rr2;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
      c.fillStyle = accent;
      c.beginPath();
      c.arc(0, 0, s * 0.13, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawMiniChest(x, y, size, chest, opening) {
    var c = ctx;
    c.save();
    c.translate(x, y);
    var pulse = spin ? Math.sin(spin.t * 9) * 0.04 + 1 : 1;
    c.scale(pulse, pulse);
    var boxImg = ART['box_' + chest.id];
    if (imageReady(boxImg)) {
      c.shadowColor = chest.accent;
      c.shadowBlur = opening ? 42 * S : 18 * S;
      c.rotate(opening && spin ? Math.sin(spin.t * 16) * 0.04 : 0);
      c.drawImage(boxImg, -size / 2, -size / 2, size, size);
      c.shadowBlur = 0;
      if (opening) {
        c.globalAlpha = 0.52;
        c.fillStyle = chest.accent;
        c.beginPath();
        c.ellipse(0, -size * 0.08, size * 0.35, size * 0.14, 0, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
      }
      c.restore();
      return;
    }
    var w = size;
    var h = size * 0.68;
    c.shadowColor = chest.accent;
    c.shadowBlur = opening ? 34 * S : 12 * S;
    var g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, lighten(chest.color, 0.18));
    g.addColorStop(1, darken(chest.color, 0.36));
    fillRound(c, -w / 2, -h * 0.1, w, h * 0.58, 12 * S, g, chest.accent);
    c.shadowBlur = 0;
    c.fillStyle = '#171b27';
    c.fillRect(-w * 0.44, h * 0.02, w * 0.88, h * 0.12);
    c.fillStyle = chest.accent;
    fillRound(c, -w * 0.13, h * 0.04, w * 0.26, h * 0.22, 5 * S, chest.accent, lighten(chest.accent, 0.22));
    c.save();
    c.translate(0, -h * 0.16);
    c.rotate(opening ? -0.18 : 0);
    var lid = c.createLinearGradient(-w / 2, -h * 0.34, w / 2, 0);
    lid.addColorStop(0, lighten(chest.color, 0.25));
    lid.addColorStop(1, darken(chest.color, 0.1));
    fillRound(c, -w * 0.48, -h * 0.33, w * 0.96, h * 0.34, 13 * S, lid, chest.accent);
    c.restore();
    if (opening) {
      c.globalAlpha = 0.55;
      c.fillStyle = chest.accent;
      c.beginPath();
      c.ellipse(0, -h * 0.12, w * 0.38, h * 0.18, 0, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    c.restore();
  }

  function drawParticles() {
    var c = ctx;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      c.globalAlpha = clamp(p.life, 0, 1);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function drawToast() {
    if (!toast) return;
    var c = ctx;
    var w = Math.min(W - 40 * S, 360 * S);
    var h = 44 * S;
    var x = W / 2 - w / 2;
    var y = 92 * S;
    c.globalAlpha = clamp(toast.life, 0, 1);
    fillRound(c, x, y, w, h, 14 * S, 'rgba(7,10,17,0.86)', toast.color);
    textFit(c, toast.text, W / 2, y + h / 2, w - 24 * S, 16 * S, '900', toast.color, 'center');
    c.globalAlpha = 1;
  }

  function drawReveal() {
    var c = ctx;
    var item = reveal.item;
    var r = rarity(item.rarity);
    c.save();
    c.globalAlpha = 0.72;
    c.fillStyle = '#05070d';
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;
    var boxW = compact ? W - 36 * S : Math.min(470 * S, W - 60 * S);
    var boxH = compact ? 420 * S : 460 * S;
    var x = W / 2 - boxW / 2;
    var y = H / 2 - boxH / 2;
    var bg = c.createLinearGradient(x, y, x + boxW, y + boxH);
    bg.addColorStop(0, 'rgba(32,40,61,0.98)');
    bg.addColorStop(1, 'rgba(12,17,28,0.98)');
    fillRound(c, x, y, boxW, boxH, 18 * S, bg, r.glow);
    textFit(c, reveal.wasNew ? t('newItem') : t('duplicate'), W / 2, y + 34 * S, boxW - 28 * S, 20 * S, '900', reveal.wasNew ? '#f7efe2' : '#cbd7e8', 'center');
    drawItemCard(item, W / 2 - 88 * S, y + 64 * S, 176 * S, 204 * S, true, false);
    textFit(c, loc(item), W / 2, y + 294 * S, boxW - 36 * S, 20 * S, '900', '#ffffff', 'center');
    var rewardLine = loc(r) + ' - ' + loc(KIND[item.kind]) + ' - +' + reveal.shards + ' ' + t('shards');
    if (reveal.bonusCoins) rewardLine += '  +' + reveal.bonusCoins + ' ' + t('coins');
    if (reveal.bonusShards) rewardLine += '  +' + reveal.bonusShards + ' ' + t('shards');
    textFit(c, rewardLine, W / 2, y + 322 * S, boxW - 36 * S, 13 * S, '800', r.glow, 'center');
    addButton('revealOpen', x + 26 * S, y + boxH - 70 * S, (boxW - 68 * S) / 2, 48 * S, canOpen(currentChest()) ? t('open') : t('collection'), function () {
      reveal = null;
      if (canOpen(currentChest())) openChest();
      else overlay = 'collection';
    }, { fill: currentChest().color, text: '#ffffff' });
    addButton('revealClose', x + 42 * S + (boxW - 68 * S) / 2, y + boxH - 70 * S, (boxW - 68 * S) / 2, 48 * S, t('close'), function () {
      reveal = null;
    }, { fill: '#303b52', text: '#ffffff' });
    c.restore();
  }

  function drawOverlay() {
    var c = ctx;
    c.save();
    c.globalAlpha = 0.76;
    c.fillStyle = '#05070d';
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;
    var pad = 18 * S;
    var w = Math.min(W - pad * 2, compact ? 660 * S : 780 * S);
    var h = Math.min(H - pad * 2, compact ? 720 * S : 660 * S);
    var x = W / 2 - w / 2;
    var y = H / 2 - h / 2;
    drawPanel(x, y, w, h, overlayTitle());
    addButton('closeOverlay', x + w - 104 * S, y + 14 * S, 86 * S, 34 * S, t('close'), function () { overlay = null; }, { fill: '#303b52', text: '#ffffff' });
    if (overlay === 'collection') drawCollectionOverlay(x, y, w, h);
    if (overlay === 'craft') drawCraftOverlay(x, y, w, h);
    if (overlay === 'road') drawRoadOverlay(x, y, w, h);
    c.restore();
  }

  function overlayTitle() {
    if (overlay === 'collection') return t('collection');
    if (overlay === 'craft') return t('craft');
    if (overlay === 'road') return t('road');
    return '';
  }

  function drawCollectionOverlay(x, y, w, h) {
    var c = ctx;
    var top = y + 58 * S;
    textFit(c, uniqueOwned() + '/' + DATA.items.length + ' - ' + t('value') + ' ' + format(collectionValue()), x + 18 * S, top, w - 36 * S, 13 * S, '900', '#dce7f7', 'left');
    textFit(c, t('collectionInfo'), x + 18 * S, top + 24 * S, w - 36 * S, 11 * S, '700', '#9daec6', 'left');
    var cols = compact ? 3 : 6;
    var rows = compact ? 3 : 3;
    var per = cols * rows;
    var pageMax = Math.max(0, Math.ceil(DATA.items.length / per) - 1);
    collectionPage = clamp(collectionPage, 0, pageMax);
    var gridY = top + 52 * S;
    var gap = 10 * S;
    var cardW = (w - 36 * S - gap * (cols - 1)) / cols;
    var cardH = compact ? 116 * S : 124 * S;
    var start = collectionPage * per;
    for (var i = 0; i < per; i++) {
      var item = DATA.items[start + i];
      if (!item) break;
      var cx = x + 18 * S + (i % cols) * (cardW + gap);
      var cy = gridY + Math.floor(i / cols) * (cardH + gap);
      drawItemCard(item, cx, cy, cardW, cardH, state.owned[item.id] > 0, false);
      if (state.owned[item.id] > 1) {
        fillRound(c, cx + cardW - 34 * S, cy + 8 * S, 26 * S, 20 * S, 8 * S, 'rgba(0,0,0,0.55)', '#ffffff');
        textFit(c, 'x' + state.owned[item.id], cx + cardW - 21 * S, cy + 18 * S, 24 * S, 10 * S, '900', '#ffffff', 'center');
      }
    }
    var by = y + h - 52 * S;
    addButton('prevPage', x + 18 * S, by, 96 * S, 36 * S, t('prev'), function () { collectionPage = Math.max(0, collectionPage - 1); }, { fill: '#303b52', text: '#ffffff', disabled: collectionPage <= 0 });
    textFit(c, (collectionPage + 1) + '/' + (pageMax + 1), W / 2, by + 18 * S, 120 * S, 13 * S, '900', '#dce7f7', 'center');
    addButton('nextPage', x + w - 114 * S, by, 96 * S, 36 * S, t('next'), function () { collectionPage = Math.min(pageMax, collectionPage + 1); }, { fill: '#303b52', text: '#ffffff', disabled: collectionPage >= pageMax });
  }

  function drawCraftOverlay(x, y, w, h) {
    var c = ctx;
    var top = y + 64 * S;
    textFit(c, t('shards') + ': ' + format(state.shards), x + 18 * S, top, w - 36 * S, 18 * S, '900', '#8df6dc', 'left');
    textFit(c, t('craftInfo'), x + 18 * S, top + 28 * S, w - 36 * S, 12 * S, '700', '#aabbd2', 'left');
    var rows = DATA.crafting;
    var rowH = compact ? 82 * S : 88 * S;
    for (var i = 0; i < rows.length; i++) {
      var cfg = rows[i];
      var r = rarity(cfg.rarity);
      var yy = top + 60 * S + i * (rowH + 10 * S);
      fillRound(c, x + 18 * S, yy, w - 36 * S, rowH, 12 * S, 'rgba(7,11,19,0.58)', state.shards >= cfg.cost ? r.glow : 'rgba(255,255,255,0.11)');
      drawKindIcon(c, 'mutant', x + 52 * S, yy + rowH / 2, 42 * S, r.glow, r.color);
      textFit(c, loc(r), x + 86 * S, yy + rowH * 0.36, w - 260 * S, 18 * S, '900', '#ffffff', 'left');
      var missing = DATA.items.filter(function (it) { return it.rarity === cfg.rarity && !state.owned[it.id]; }).length;
      textFit(c, missing + ' missing - ' + cfg.cost + ' ' + t('shards'), x + 86 * S, yy + rowH * 0.66, w - 260 * S, 12 * S, '800', '#aabbd2', 'left');
      addButton('craft-' + cfg.rarity, x + w - 150 * S, yy + rowH / 2 - 20 * S, 112 * S, 40 * S, t('craft'), function (rid) {
        return function () { craft(rid); };
      }(cfg.rarity), { fill: r.color, text: '#ffffff', disabled: state.shards < cfg.cost });
    }
  }

  function drawRoadOverlay(x, y, w, h) {
    var c = ctx;
    var top = y + 62 * S;
    textFit(c, t('roadInfo'), x + 18 * S, top, w - 36 * S, 12 * S, '700', '#aabbd2', 'left');
    var rowH = compact ? 39 * S : 35 * S;
    var rowGap = 4 * S;
    var startY = top + 30 * S;
    for (var i = 0; i < DATA.road.length; i++) {
      var m = DATA.road[i];
      var yy = startY + i * (rowH + rowGap);
      var ready = roadReady(m);
      var done = state.roadClaimed[m.id];
      var p = clamp(roadProgress(m) / m.target, 0, 1);
      fillRound(c, x + 18 * S, yy, w - 36 * S, rowH, 10 * S, done ? 'rgba(48,74,57,0.54)' : 'rgba(7,11,19,0.58)', ready ? '#f2c66d' : 'rgba(255,255,255,0.10)');
      textFit(c, String(i + 1), x + 38 * S, yy + rowH / 2, 28 * S, 13 * S, '900', done ? '#89e391' : '#ffffff', 'center');
      var metric = m.type === 'value' ? t('value') : t('opens');
      textFit(c, metric + ' ' + format(roadProgress(m)) + '/' + format(m.target), x + 62 * S, yy + rowH / 2, w * 0.33, 12 * S, '800', '#dce7f7', 'left');
      fillRound(c, x + w * 0.43, yy + rowH / 2 - 4 * S, w * 0.2, 8 * S, 4 * S, 'rgba(255,255,255,0.10)');
      fillRound(c, x + w * 0.43, yy + rowH / 2 - 4 * S, w * 0.2 * p, 8 * S, 4 * S, '#f2c66d');
      textFit(c, rewardText(m.reward), x + w * 0.66, yy + rowH / 2, w * 0.17, 11 * S, '900', '#ffe7a2', 'left');
      addButton('road-' + m.id, x + w - 112 * S, yy + rowH / 2 - 15 * S, 74 * S, 30 * S, done ? t('claimed') : t('claim'), function (id) {
        return function () { claimRoad(id); };
      }(m.id), { fill: ready ? '#d19b36' : '#303b52', text: '#ffffff', disabled: !ready });
    }
  }

  function handleClick(x, y) {
    ensureAudio();
    for (var i = buttons.length - 1; i >= 0; i--) {
      var b = buttons[i];
      if (b.style && b.style.disabled) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        b.fn();
        draw();
        return;
      }
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    handleClick(e.clientX, e.clientY);
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (!DATA || !state) return;
    if (e.code === 'Space') {
      e.preventDefault();
      openChest();
    }
    if (e.code === 'KeyC') overlay = overlay === 'collection' ? null : 'collection';
    if (e.code === 'KeyR') overlay = overlay === 'road' ? null : 'road';
    if (e.code === 'KeyF') toggleFullscreen();
    draw();
  });

  function toggleFullscreen() {
    var el = document.fullscreenElement;
    if (el && document.exitFullscreen) document.exitFullscreen();
    else if (!el && canvas.requestFullscreen) canvas.requestFullscreen();
  }

  function loop(ts) {
    if (!running) return;
    var dt = lastFrame ? Math.min(0.05, (ts - lastFrame) / 1000) : 1 / 60;
    lastFrame = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function draw() {
    clear();
    drawMain();
  }

  function renderState() {
    var chest = DATA && state ? currentChest() : null;
    var payload = {
      note: '2D canvas coordinates in CSS pixels, origin top-left, x right, y down',
      mode: spin ? 'spinning' : (reveal ? 'reveal' : 'main'),
      overlay: overlay,
      coins: state ? state.coins : 0,
      shards: state ? state.shards : 0,
      opens: state ? state.opens : 0,
      collectionValue: state ? collectionValue() : 0,
      uniqueOwned: state ? uniqueOwned() : 0,
      selectedChest: chest ? { id: chest.id, name: loc(chest), cost: chest.cost, free: freeCount(chest), canOpen: canOpen(chest) } : null,
      daily: state ? { opens: state.daily.opens, target: DATA.daily.targetOpens, ready: dailyReady(), claimed: state.daily.claimed } : null,
      steal: state ? { ready: stealReady(), remainingMs: stealRemainingMs() } : null,
      roadReady: state ? anyRoadReady() : false,
      reveal: reveal ? { item: reveal.item.id, name: loc(reveal.item), rarity: reveal.item.rarity, wasNew: reveal.wasNew, shards: reveal.shards } : null,
      buttons: buttons.map(function (b) { return { id: b.id, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), disabled: !!(b.style && b.style.disabled) }; }).slice(-20)
    };
    return JSON.stringify(payload);
  }

  window.render_game_to_text = renderState;
  window.advanceTime = function (ms) {
    var steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (var i = 0; i < steps; i++) update(1 / 60);
    draw();
  };
  window.__arenaChests = {
    open: function () { return openChest(); },
    steal: function () { return stealDrop(); },
    finishSpin: function () {
      if (!spin) return false;
      spin.t = spin.dur;
      update(1 / 60);
      draw();
      return true;
    },
    claimReadyRoad: function () {
      var m = DATA.road.filter(roadReady)[0];
      if (!m) return false;
      claimRoad(m.id);
      draw();
      return true;
    },
    state: function () { return JSON.parse(renderState()); },
    reset: function () {
      try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
      state = defaultState();
      overlay = null;
      spin = null;
      reveal = null;
      save();
      draw();
    },
    grant: function (coins, shards) {
      state.coins += coins || 0;
      state.shards += shards || 0;
      save();
      draw();
    }
  };
  window.__luckyBrainrotChests = window.__arenaChests;

  function init(data) {
    DATA = data;
    load();
    resize();
    running = true;
    requestAnimationFrame(loop);
  }

  resize();
  fetch('./data/balance.json', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('data');
      return r.json();
    })
    .then(init)
    .catch(function () {
      fatal = t('noData');
      draw();
    });
})();
