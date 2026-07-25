const SAVE_VERSION = 1;
const CORE_HP_MAX = 20;
const BENCH_SIZE = 5;
const LANE_Y = [0.38, 0.66];
const PAD_COLUMNS = [0.22, 0.32, 0.42, 0.53, 0.64, 0.75, 0.86];
const PAD_UNLOCK_ORDER = [2, 9, 3, 10, 1, 8, 4, 11, 0, 7, 5, 12, 6, 13];
const BUTTONS = {
  start: { id: "start", labelKey: "buttonStart", x: 0.025, y: 0.735, w: 0.26, h: 0.07 },
  buy: { id: "buy", labelKey: "buttonBuy", x: 0.025, y: 0.825, w: 0.14, h: 0.075 },
  open: { id: "open", labelKey: "buttonOpen", x: 0.18, y: 0.825, w: 0.14, h: 0.075 },
  claim: { id: "claim", labelKey: "buttonClaim", x: 0.785, y: 0.825, w: 0.18, h: 0.075 },
  adChest: { id: "adChest", labelKey: "buttonAdChest", x: 0.785, y: 0.735, w: 0.18, h: 0.075 },
  lang: { id: "lang", labelKey: "buttonLang", x: 0.875, y: 0.014, w: 0.095, h: 0.046 }
};
const ENEMY_PROFILES = {
  skitter: { key: "enemySkitter", speed: 1.22, hp: 0.82, reward: 0.92, damage: 1 },
  hauler: { key: "enemyHauler", speed: 0.82, hp: 1.45, reward: 1.22, damage: 2 },
  drone: { key: "enemyDrone", speed: 1.08, hp: 0.96, reward: 1.05, damage: 1 },
  crusher: { key: "enemyCrusher", speed: 0.62, hp: 1, reward: 1, damage: 5 }
};

export function createGame(options) {
  return new ScraplineGame(options);
}

class ScraplineGame {
  constructor({ balance, save, platform, audio, i18n }) {
    this.balance = balance;
    this.platform = platform;
    this.audio = audio;
    this.i18n = i18n;
    this.nextId = 1;
    this.saveDirty = true;
    this.state = this.createInitialState(save);
    this.syncButtons();
  }

  createInitialState(save) {
    const saved = save && save.version === SAVE_VERSION ? save : null;
    const state = {
      mode: "build",
      time: 0,
      wave: Math.max(1, Number(saved?.wave) || 1),
      credits: Math.max(0, Number(saved?.credits) || this.balance.economy.startCredits),
      scrap: Math.max(0, Number(saved?.scrap) || 0),
      coreHp: Math.max(1, Math.min(CORE_HP_MAX, Number(saved?.coreHp) || CORE_HP_MAX)),
      crates: Math.max(0, Number(saved?.crates) || 0),
      cratesBought: Math.max(0, Number(saved?.cratesBought) || 0),
      seed: Number(saved?.seed) || 0x5eed195,
      bench: this.createBench(saved?.bench),
      pads: this.createPads(saved?.pads),
      enemies: [],
      projectiles: [],
      particles: [],
      waveRun: null,
      selected: null,
      drag: null,
      pointer: { x: 0.72, y: 0.46, down: false },
      beam: {
        baseX: 0.08,
        baseY: 0.52,
        targetX: 0.72,
        targetY: 0.46,
        energy: this.balance.beam.energySeconds,
        active: false,
        coveredPads: []
      },
      rewards: {
        freeChestRemaining: Math.max(0, Number(saved?.freeChestRemaining) || this.balance.rewards.firstFreeChestSeconds),
        rewardedChestRemaining: Math.max(0, Number(saved?.rewardedChestRemaining) || 0)
      },
      upgrades: saved?.upgrades || {},
      status: { key: "statusReady", params: {}, ttl: 0 },
      buttons: []
    };

    if (saved?.language) {
      this.i18n.setLanguage(saved.language);
    }

    this.applyOfflineReturn(state, saved);
    return state;
  }

  createBench(savedBench) {
    const source = Array.isArray(savedBench) ? savedBench : [];
    return Array.from({ length: BENCH_SIZE }, (_, index) => {
      const item = source[index];
      return item && item.tier ? this.makeBot(item.tier) : null;
    });
  }

  createPads(savedPads) {
    const initialUnlocked = this.balance.board.initialUnlockedPads;
    const unlockRanks = new Map(PAD_UNLOCK_ORDER.map((id, rank) => [id, rank]));
    return Array.from({ length: this.balance.board.padCount }, (_, id) => {
      const lane = id >= 7 ? 1 : 0;
      const col = id % 7;
      const savedPad = Array.isArray(savedPads) ? savedPads[id] : null;
      const defaultUnlocked = unlockRanks.get(id) < initialUnlocked;
      return {
        id,
        lane,
        x: PAD_COLUMNS[col],
        y: LANE_Y[lane],
        unlockRank: unlockRanks.get(id),
        unlocked: Boolean(savedPad?.unlocked ?? defaultUnlocked),
        bot: savedPad?.tier ? this.makeBot(savedPad.tier) : null
      };
    });
  }

  makeBot(tier) {
    return {
      id: this.nextId++,
      tier: Math.max(1, Math.min(this.balance.bots.tierCount, Number(tier) || 1)),
      cooldown: 0
    };
  }

  applyOfflineReturn(state, saved) {
    if (!saved?.lastSeenAt) return;
    const elapsedSeconds = Math.max(0, (Date.now() - Number(saved.lastSeenAt)) / 1000);
    const cappedSeconds = Math.min(elapsedSeconds, this.balance.meta.offlineCapSeconds);
    if (cappedSeconds < 60) return;
    const credits = Math.floor(
      cappedSeconds * this.balance.meta.offlineCreditRatePerWave * Math.max(1, state.wave)
    );
    if (credits > 0) {
      state.credits += credits;
      state.rewards.freeChestRemaining = Math.max(0, state.rewards.freeChestRemaining - cappedSeconds);
      state.status = { key: "statusOfflineReward", params: { credits }, ttl: 5 };
      this.markDirty();
    }
  }

  markDirty() {
    this.saveDirty = true;
  }

  consumeSaveDirty() {
    const dirty = this.saveDirty;
    this.saveDirty = false;
    return dirty;
  }

  exportSave() {
    return {
      version: SAVE_VERSION,
      language: this.i18n.getLanguage(),
      credits: Math.floor(this.state.credits),
      scrap: Math.floor(this.state.scrap),
      wave: this.state.wave,
      coreHp: this.state.coreHp,
      crates: this.state.crates,
      cratesBought: this.state.cratesBought,
      seed: this.state.seed,
      bench: this.state.bench.map((bot) => (bot ? { tier: bot.tier } : null)),
      pads: this.state.pads.map((pad) => ({
        unlocked: pad.unlocked,
        tier: pad.bot ? pad.bot.tier : 0
      })),
      upgrades: this.state.upgrades,
      freeChestRemaining: this.state.rewards.freeChestRemaining,
      rewardedChestRemaining: this.state.rewards.rewardedChestRemaining,
      lastSeenAt: Date.now()
    };
  }

  advanceTime(ms) {
    const total = Math.max(0, Math.min(120000, Number(ms) || 0));
    const step = 1 / 60;
    let remaining = total / 1000;
    while (remaining > 0) {
      const dt = Math.min(step, remaining);
      this.update(dt);
      remaining -= dt;
    }
  }

  update(dt) {
    const clamped = Math.max(0, Math.min(0.1, dt));
    this.state.time += clamped;
    this.state.rewards.freeChestRemaining = Math.max(0, this.state.rewards.freeChestRemaining - clamped);
    this.state.rewards.rewardedChestRemaining = Math.max(0, this.state.rewards.rewardedChestRemaining - clamped);

    if (this.state.status.ttl > 0) {
      this.state.status.ttl = Math.max(0, this.state.status.ttl - clamped);
    }

    if (this.state.mode === "wave") {
      this.updateBeam(clamped);
      this.updateWave(clamped);
    } else {
      this.state.beam.active = false;
      this.state.beam.energy = Math.min(
        this.balance.beam.energySeconds,
        this.state.beam.energy + clamped * (this.balance.beam.energySeconds / this.balance.beam.rechargeSeconds)
      );
      this.state.beam.coveredPads = [];
    }

    this.updateProjectiles(clamped);
    this.syncButtons();
  }

  updateBeam(dt) {
    const beam = this.state.beam;
    beam.active = beam.energy > 0;
    if (beam.active) {
      beam.energy = Math.max(0, beam.energy - dt);
    }
    beam.coveredPads = this.state.pads
      .filter((pad) => pad.unlocked && pad.bot && this.isPadCoveredByBeam(pad))
      .map((pad) => pad.id);
  }

  updateWave(dt) {
    const run = this.state.waveRun;
    if (!run) return;

    run.elapsed += dt;
    while (run.queue.length && run.queue[0].time <= run.elapsed) {
      this.spawnEnemy(run.queue.shift());
    }

    for (const enemy of this.state.enemies) {
      enemy.x -= enemy.speed * dt;
      enemy.wobble += dt;
      if (enemy.x <= 0.055) {
        enemy.dead = true;
        this.state.coreHp -= enemy.damage;
        this.setStatus("statusCoreHit", {}, 1.2);
        this.audio?.hit();
      }
    }

    this.state.enemies = this.state.enemies.filter((enemy) => !enemy.dead);

    for (const pad of this.state.pads) {
      if (!pad.unlocked || !pad.bot) continue;
      this.updateBot(pad, dt);
    }

    this.state.enemies = this.state.enemies.filter((enemy) => !enemy.dead);

    if (this.state.coreHp <= 0) {
      this.failWave();
      return;
    }

    if (!run.queue.length && this.state.enemies.length === 0) {
      this.clearWave();
    }
  }

  updateBot(pad, dt) {
    const bot = pad.bot;
    const boosted = this.state.beam.coveredPads.includes(pad.id);
    const rateBoost = boosted ? this.balance.beam.fireRateMultiplier : 1;
    bot.cooldown -= dt * rateBoost;
    if (bot.cooldown > 0) return;

    const target = this.findTarget(pad);
    if (!target) {
      bot.cooldown = Math.min(bot.cooldown, 0.08);
      return;
    }

    const damageBoost = boosted ? this.balance.beam.damageMultiplier : 1;
    const damage = this.getBotDamage(bot.tier) * damageBoost;
    const trait = this.getBotTrait(bot.tier);
    this.damageEnemy(target, damage, trait, pad);
    this.state.projectiles.push({
      id: this.nextId++,
      fromX: pad.x,
      fromY: pad.y,
      toX: target.x,
      toY: target.y,
      tier: bot.tier,
      ttl: 0.16,
      maxTtl: 0.16
    });
    bot.cooldown += 1 / Math.max(0.1, this.balance.bots.baseFireRate * rateBoost);
  }

  updateProjectiles(dt) {
    for (const projectile of this.state.projectiles) {
      projectile.ttl -= dt;
    }
    this.state.projectiles = this.state.projectiles.filter((projectile) => projectile.ttl > 0);
    for (const particle of this.state.particles) {
      particle.ttl -= dt;
      particle.y -= dt * 0.04;
    }
    this.state.particles = this.state.particles.filter((particle) => particle.ttl > 0);
  }

  getBotDamage(tier) {
    return this.balance.bots.baseDamage * this.balance.bots.damageMultiplier ** (tier - 1);
  }

  getBotTrait(tier) {
    const traits = this.balance.bots.traits;
    return traits[(tier - 1) % traits.length] || "steady";
  }

  findTarget(pad) {
    const range = this.balance.bots.range;
    let best = null;
    let bestScore = -Infinity;
    for (const enemy of this.state.enemies) {
      const dx = enemy.x - pad.x;
      const dy = enemy.y - pad.y;
      const distance = Math.hypot(dx, dy);
      if (distance > range) continue;
      const score = (1 - enemy.x) * 2 + (enemy.boss ? 0.2 : 0) - distance;
      if (score > bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  damageEnemy(enemy, amount, trait, pad) {
    let finalDamage = amount;
    if (trait === "pierce") finalDamage *= 1.12;
    enemy.hp -= finalDamage;

    if (trait === "splash") {
      for (const other of this.state.enemies) {
        if (other === enemy || other.dead) continue;
        if (Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 0.085) {
          other.hp -= finalDamage * 0.36;
          if (other.hp <= 0) this.killEnemy(other);
        }
      }
    }

    if (trait === "fast") {
      pad.bot.cooldown -= 0.04;
    }

    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    const credits = Math.max(1, Math.round(enemy.reward));
    this.state.credits += credits;
    this.state.particles.push({
      id: this.nextId++,
      x: enemy.x,
      y: enemy.y,
      text: `+${credits}`,
      ttl: 0.7
    });
    if (enemy.boss) {
      const scrap = this.balance.economy.scrapPerBossBase + Math.floor(this.state.wave / 5);
      this.state.scrap += scrap;
      this.setStatus("statusBossDown", { scrap }, 2);
    }
    this.markDirty();
  }

  clearWave() {
    const clearedWave = this.state.wave;
    const boss = this.isBossWave(clearedWave);
    const credits = Math.round(
      this.balance.economy.waveClearBaseReward +
        clearedWave * 2.2 +
        (boss ? this.balance.economy.waveClearBaseReward * 2 : 0)
    );
    this.state.credits += credits;
    this.state.wave += 1;
    this.state.mode = "build";
    this.state.waveRun = null;
    this.state.beam.active = false;
    this.state.beam.energy = Math.min(this.balance.beam.energySeconds, this.state.beam.energy + 1.5);
    this.platform?.gameplayStop?.();
    if (this.balance.waves.mapGateWaves.includes(clearedWave)) {
      this.setStatus("statusSectorGate", {}, 4);
    } else {
      this.setStatus("statusWaveClear", { credits }, 4);
    }
    this.audio?.reward();
    this.markDirty();
  }

  failWave() {
    this.state.mode = "build";
    this.state.waveRun = null;
    this.state.enemies = [];
    this.state.projectiles = [];
    this.state.coreHp = CORE_HP_MAX;
    this.state.beam.active = false;
    this.setStatus("statusWaveFailed", {}, 4);
    this.platform?.gameplayStop?.();
    this.markDirty();
  }

  spawnEnemy(spec) {
    const profile = ENEMY_PROFILES[spec.family] || ENEMY_PROFILES.skitter;
    this.state.enemies.push({
      id: this.nextId++,
      family: spec.family,
      labelKey: profile.key,
      lane: spec.lane,
      x: 0.965,
      y: LANE_Y[spec.lane],
      hp: spec.hp,
      maxHp: spec.hp,
      speed: spec.speed,
      reward: spec.reward,
      damage: spec.damage,
      boss: Boolean(spec.boss),
      dead: false,
      wobble: 0
    });
  }

  generateWave(wave) {
    const boss = this.isBossWave(wave);
    const count = this.getEnemyCount(wave);
    const baseHealth = this.getEnemyHealth(wave);
    const baseSpeed = this.balance.waves.enemySpeedStart * this.balance.waves.enemySpeedGrowth ** (wave - 1);
    const queue = [];
    const normalCount = boss ? Math.max(4, Math.floor(count * 0.62)) : count;
    const spacing = Math.max(0.48, 1.05 - wave * 0.012);
    const families = ["skitter", "hauler", "drone"];

    for (let i = 0; i < normalCount; i++) {
      const family = families[(i + Math.floor(wave / 2)) % families.length];
      const profile = ENEMY_PROFILES[family];
      queue.push({
        time: i * spacing,
        family,
        lane: (i + wave) % this.balance.board.lanes,
        hp: baseHealth * profile.hp,
        speed: baseSpeed * profile.speed,
        reward: this.balance.economy.killRewardBase * profile.reward * (1 + wave * 0.045),
        damage: profile.damage,
        boss: false
      });
    }

    if (boss) {
      const profile = ENEMY_PROFILES.crusher;
      queue.push({
        time: normalCount * spacing + 1.1,
        family: "crusher",
        lane: wave % this.balance.board.lanes,
        hp: baseHealth * this.balance.waves.bossHealthMultiplier * (1 + wave * 0.03),
        speed: baseSpeed * profile.speed,
        reward:
          this.balance.economy.killRewardBase *
          this.balance.economy.bossRewardMultiplier *
          (1 + wave * 0.08),
        damage: profile.damage,
        boss: true
      });
    }

    return queue;
  }

  getEnemyCount(wave) {
    const early = this.balance.waves.enemyCountEarlyTarget;
    const late = this.balance.waves.enemyCountLateTarget;
    if (wave <= 10) {
      return Math.round(
        this.lerp(this.balance.waves.enemyCountStart, early, Math.max(0, (wave - 1) / 9))
      );
    }
    return Math.round(this.lerp(early, late, Math.min(1, (wave - 10) / 30)));
  }

  getEnemyHealth(wave) {
    if (wave <= 8) {
      return this.balance.waves.enemyHealthStart * this.balance.waves.enemyHealthEarlyGrowth ** (wave - 1);
    }
    const earlyHealth = this.balance.waves.enemyHealthStart * this.balance.waves.enemyHealthEarlyGrowth ** 7;
    return earlyHealth * this.balance.waves.enemyHealthLateGrowth ** (wave - 8);
  }

  isBossWave(wave) {
    return wave % this.balance.waves.bossEvery === 0;
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  handlePointerDown(point) {
    this.audio?.unlock();
    this.state.pointer = { ...point, down: true };
    this.state.beam.targetX = point.x;
    this.state.beam.targetY = point.y;

    if (this.state.mode === "wave") return;

    const button = this.hitButton(point);
    if (button) {
      this.handleButton(button.id);
      return;
    }

    const padIndex = this.hitPad(point);
    if (padIndex !== -1) {
      const pad = this.state.pads[padIndex];
      if (!pad.unlocked) {
        this.buyPad(pad);
        return;
      }
      if (pad.bot) {
        const target = { type: "pad", index: padIndex };
        if (this.state.selected && !this.sameSource(this.state.selected, target)) {
          this.transferBot(this.state.selected, target);
          return;
        }
        this.startDrag({ type: "pad", index: padIndex }, point);
        return;
      }
      if (this.state.selected) {
        this.transferBot(this.state.selected, { type: "pad", index: padIndex });
        return;
      }
    }

    const benchIndex = this.hitBench(point);
    if (benchIndex !== -1) {
      if (this.state.bench[benchIndex]) {
        const target = { type: "bench", index: benchIndex };
        if (this.state.selected && !this.sameSource(this.state.selected, target)) {
          this.transferBot(this.state.selected, target);
          return;
        }
        this.startDrag({ type: "bench", index: benchIndex }, point);
        return;
      }
      if (this.state.selected) {
        this.transferBot(this.state.selected, { type: "bench", index: benchIndex });
        return;
      }
    }

    this.state.selected = null;
  }

  handlePointerMove(point) {
    this.state.pointer = { ...point, down: this.state.pointer.down };
    this.state.beam.targetX = point.x;
    this.state.beam.targetY = point.y;

    if (this.state.drag) {
      const dx = point.x - this.state.drag.startX;
      const dy = point.y - this.state.drag.startY;
      this.state.drag.x = point.x;
      this.state.drag.y = point.y;
      if (Math.hypot(dx, dy) > 0.018) {
        this.state.drag.moved = true;
      }
    }
  }

  handlePointerUp(point) {
    this.state.pointer = { ...point, down: false };
    this.state.beam.targetX = point.x;
    this.state.beam.targetY = point.y;

    const drag = this.state.drag;
    if (drag && drag.moved) {
      const target = this.targetFromPoint(point);
      if (target) {
        this.transferBot(drag.source, target);
      }
    }
    this.state.drag = null;
  }

  handleKeyDown(event) {
    if (event.key === " " || event.key === "Enter") {
      if (this.state.mode === "build") {
        event.preventDefault();
        this.startWave();
      }
    }
  }

  startDrag(source, point) {
    const bot = this.getBot(source);
    if (!bot) return;
    this.state.selected = { ...source };
    this.state.drag = {
      source: { ...source },
      tier: bot.tier,
      x: point.x,
      y: point.y,
      startX: point.x,
      startY: point.y,
      moved: false
    };
  }

  targetFromPoint(point) {
    const padIndex = this.hitPad(point);
    if (padIndex !== -1 && this.state.pads[padIndex].unlocked) {
      return { type: "pad", index: padIndex };
    }
    const benchIndex = this.hitBench(point);
    if (benchIndex !== -1) return { type: "bench", index: benchIndex };
    return null;
  }

  transferBot(source, target) {
    if (!source || !target || this.sameSource(source, target)) return false;
    const sourceBot = this.getBot(source);
    if (!sourceBot) {
      this.state.selected = null;
      return false;
    }
    const targetBot = this.getBot(target);
    if (!targetBot) {
      this.setBot(target, sourceBot);
      this.clearBot(source);
      this.state.selected = { ...target };
      this.markDirty();
      this.audio?.click();
      return true;
    }
    if (targetBot.tier === sourceBot.tier && targetBot.tier < this.balance.bots.tierCount) {
      targetBot.tier += 1;
      targetBot.cooldown = 0;
      this.clearBot(source);
      this.state.selected = { ...target };
      this.setStatus("statusMerged", {
        name: this.i18n.botName(targetBot.tier, this.balance.bots.names)
      }, 2.5);
      this.markDirty();
      this.audio?.merge();
      return true;
    }
    this.setBot(source, targetBot);
    this.setBot(target, sourceBot);
    this.state.selected = { ...target };
    this.markDirty();
    this.audio?.click();
    return true;
  }

  sameSource(a, b) {
    return a.type === b.type && a.index === b.index;
  }

  getBot(source) {
    if (source.type === "pad") return this.state.pads[source.index]?.bot || null;
    if (source.type === "bench") return this.state.bench[source.index] || null;
    return null;
  }

  setBot(source, bot) {
    if (source.type === "pad") this.state.pads[source.index].bot = bot;
    if (source.type === "bench") this.state.bench[source.index] = bot;
  }

  clearBot(source) {
    this.setBot(source, null);
  }

  handleButton(id) {
    if (id === "buy") this.buyCrate();
    if (id === "open") this.openCrate();
    if (id === "start") this.startWave();
    if (id === "claim") this.claimChest();
    if (id === "adChest") this.claimRewardedChest();
    if (id === "lang") {
      this.i18n.toggleLanguage();
      this.markDirty();
    }
  }

  buyCrate() {
    const cost = this.getCrateCost();
    if (this.state.credits < cost) {
      this.setStatus("statusNoCredits", {}, 1.8);
      return;
    }
    this.state.credits -= cost;
    this.state.crates += 1;
    this.state.cratesBought += 1;
    this.setStatus("statusCrateBought", {}, 1.8);
    this.audio?.click();
    this.markDirty();
  }

  openCrate() {
    if (this.state.crates <= 0) {
      this.setStatus("statusNoCrates", {}, 1.8);
      return;
    }
    const slot = this.state.bench.findIndex((bot) => !bot);
    if (slot === -1) {
      this.setStatus("statusBenchFull", {}, 1.8);
      return;
    }
    this.state.crates -= 1;
    const tier = this.rollBotTier();
    this.state.bench[slot] = this.makeBot(tier);
    this.setStatus("statusCrateOpened", {
      name: this.i18n.botName(tier, this.balance.bots.names)
    }, 2.2);
    this.audio?.reward();
    this.markDirty();
  }

  rollBotTier() {
    const roll = this.random();
    const waveBonus = Math.max(0, this.state.wave - 3) * 0.006;
    const upgradeBonus = (this.state.upgrades.starter_crates || 0) * 0.01;
    if (roll > 0.985 - waveBonus - upgradeBonus && this.state.wave >= 8) return 3;
    if (roll > 0.91 - waveBonus - upgradeBonus && this.state.wave >= 3) return 2;
    return 1;
  }

  startWave() {
    if (this.state.mode !== "build") return;
    if (!this.state.pads.some((pad) => pad.unlocked && pad.bot)) {
      this.setStatus("statusNeedBot", {}, 2);
      return;
    }
    const wave = this.state.wave;
    this.state.mode = "wave";
    this.state.waveRun = {
      wave,
      elapsed: 0,
      queue: this.generateWave(wave)
    };
    this.state.selected = null;
    this.state.drag = null;
    this.state.coreHp = Math.max(1, this.state.coreHp);
    this.platform?.gameplayStart?.();
    this.setStatus(this.isBossWave(wave) ? "statusBossStart" : "statusWaveStart", { wave }, 3);
    this.audio?.startWave();
    this.markDirty();
  }

  buyPad(pad) {
    const cost = this.getPadUnlockCost();
    if (this.state.credits < cost) {
      this.setStatus("statusNoCredits", {}, 1.8);
      return;
    }
    pad.unlocked = true;
    this.state.credits -= cost;
    this.setStatus("statusPadUnlocked", {}, 2);
    this.audio?.click();
    this.markDirty();
  }

  claimChest() {
    if (this.state.rewards.freeChestRemaining > 0) return;
    const credits = Math.round(8 + this.state.wave * 4 + this.getCrateCost() * 0.35);
    this.state.credits += credits;
    this.state.crates += 1;
    this.state.rewards.freeChestRemaining = this.balance.rewards.freeChestSeconds;
    this.setStatus("statusChestClaimed", { credits }, 3);
    this.audio?.reward();
    this.markDirty();
  }

  claimRewardedChest() {
    if (this.state.mode !== "build" || this.state.rewards.rewardedChestRemaining > 0) return;
    this.setStatus("statusAdOpening", {}, 2);
    this.platform?.showRewardedAd?.(
      () => {
        const credits = Math.round(this.getCrateCost() * this.balance.rewards.rewardedCreditsMultiplier);
        this.state.credits += credits;
        this.state.crates += 1;
        this.state.rewards.rewardedChestRemaining = this.balance.rewards.rewardedChestSeconds;
        this.setStatus("statusAdChestClaimed", { credits }, 3);
        this.audio?.reward();
        this.markDirty();
      },
      (success) => {
        if (!success) this.setStatus("statusAdUnavailable", {}, 2.5);
      }
    );
  }

  getCrateCost() {
    return Math.round(
      this.balance.economy.crateBaseCost *
        this.balance.economy.crateCostMultiplier ** this.state.cratesBought
    );
  }

  getPadUnlockCost() {
    const unlocked = this.state.pads.filter((pad) => pad.unlocked).length;
    const paidUnlocks = Math.max(0, unlocked - this.balance.board.initialUnlockedPads);
    return Math.round(
      this.balance.economy.padUnlockBaseCost * this.balance.economy.padUnlockMultiplier ** paidUnlocks
    );
  }

  syncButtons() {
    const build = this.state.mode === "build";
    const hasBot = this.state.pads.some((pad) => pad.unlocked && pad.bot);
    this.state.buttons = [
      { ...BUTTONS.start, enabled: build && hasBot },
      { ...BUTTONS.buy, enabled: build && this.state.credits >= this.getCrateCost() },
      { ...BUTTONS.open, enabled: build && this.state.crates > 0 && this.state.bench.some((bot) => !bot) },
      { ...BUTTONS.adChest, enabled: build && this.state.rewards.rewardedChestRemaining <= 0 },
      { ...BUTTONS.lang, enabled: true }
    ];
    if (build && this.state.rewards.freeChestRemaining <= 0) {
      this.state.buttons.push({ ...BUTTONS.claim, enabled: true });
    }
  }

  hitButton(point) {
    return this.state.buttons.find(
      (button) =>
        point.x >= button.x &&
        point.x <= button.x + button.w &&
        point.y >= button.y &&
        point.y <= button.y + button.h
    );
  }

  hitPad(point) {
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < this.state.pads.length; i++) {
      const pad = this.state.pads[i];
      const distance = Math.hypot((point.x - pad.x) * 1.25, point.y - pad.y);
      if (distance < 0.052 && distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  }

  hitBench(point) {
    const slots = this.getBenchSlots();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (
        point.x >= slot.x - slot.w / 2 &&
        point.x <= slot.x + slot.w / 2 &&
        point.y >= slot.y - slot.h / 2 &&
        point.y <= slot.y + slot.h / 2
      ) {
        return i;
      }
    }
    return -1;
  }

  getBenchSlots() {
    return Array.from({ length: BENCH_SIZE }, (_, index) => ({
      x: 0.41 + index * 0.075,
      y: 0.865,
      w: 0.06,
      h: 0.09
    }));
  }

  isPadCoveredByBeam(pad) {
    const beam = this.state.beam;
    if (!beam.active) return false;
    const dx = pad.x - beam.baseX;
    const dy = pad.y - beam.baseY;
    const dist = Math.hypot(dx, dy);
    if (dist > this.balance.beam.range) return false;
    const targetAngle = Math.atan2(beam.targetY - beam.baseY, beam.targetX - beam.baseX);
    const padAngle = Math.atan2(dy, dx);
    const delta = Math.abs(this.angleDelta(targetAngle, padAngle));
    return delta <= (this.balance.beam.arcDegrees * Math.PI) / 360;
  }

  angleDelta(a, b) {
    let diff = a - b;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  setStatus(key, params = {}, ttl = 2) {
    this.state.status = { key, params, ttl };
  }

  random() {
    this.state.seed = (this.state.seed * 1664525 + 1013904223) >>> 0;
    return this.state.seed / 4294967296;
  }

  toText() {
    const payload = {
      coordinate: "normalized canvas, origin top-left, x right, y down",
      mode: this.state.mode,
      wave: this.state.wave,
      currentWave: this.state.waveRun ? this.state.waveRun.wave : null,
      credits: Math.floor(this.state.credits),
      scrap: Math.floor(this.state.scrap),
      crates: this.state.crates,
      rewardedChestRemaining: Number(this.state.rewards.rewardedChestRemaining.toFixed(1)),
      coreHp: Math.max(0, Math.round(this.state.coreHp * 10) / 10),
      pads: this.state.pads.map((pad) => ({
        id: pad.id,
        lane: pad.lane,
        x: Number(pad.x.toFixed(3)),
        y: Number(pad.y.toFixed(3)),
        unlocked: pad.unlocked,
        tier: pad.bot ? pad.bot.tier : 0,
        covered: this.state.beam.coveredPads.includes(pad.id)
      })),
      bench: this.state.bench.map((bot, index) => ({
        index,
        tier: bot ? bot.tier : 0
      })),
      enemies: this.state.enemies.slice(0, 12).map((enemy) => ({
        id: enemy.id,
        family: enemy.family,
        lane: enemy.lane,
        boss: enemy.boss,
        x: Number(enemy.x.toFixed(3)),
        y: Number(enemy.y.toFixed(3)),
        hp: Math.max(0, Math.round(enemy.hp)),
        maxHp: Math.round(enemy.maxHp)
      })),
      beam: {
        active: this.state.beam.active,
        energy: Number(this.state.beam.energy.toFixed(2)),
        target: {
          x: Number(this.state.beam.targetX.toFixed(3)),
          y: Number(this.state.beam.targetY.toFixed(3))
        },
        coveredPads: [...this.state.beam.coveredPads]
      },
      selected: this.state.selected ? { ...this.state.selected } : null,
      drag: this.state.drag
        ? {
            active: true,
            source: { ...this.state.drag.source },
            tier: this.state.drag.tier,
            x: Number(this.state.drag.x.toFixed(3)),
            y: Number(this.state.drag.y.toFixed(3)),
            moved: this.state.drag.moved
          }
        : { active: false }
    };
    return JSON.stringify(payload);
  }
}
