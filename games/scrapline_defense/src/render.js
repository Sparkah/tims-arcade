const BOT_COLORS = [
  "#f1c85b",
  "#8fd06f",
  "#62c1d8",
  "#c18cff",
  "#f28b6b",
  "#58dfb1",
  "#f6f0a6",
  "#ff6f9f"
];
const ENEMY_COLORS = {
  skitter: "#d7c958",
  hauler: "#82b05d",
  drone: "#6bb8df",
  crusher: "#df6d4f"
};

export function renderGame(ctx, game, width, height) {
  const state = game.state;
  const i18n = game.i18n;
  ctx.clearRect(0, 0, width, height);
  drawScrapyard(ctx, state, width, height);
  drawBeam(ctx, game, width, height);
  drawLanes(ctx, width, height);
  drawPads(ctx, game, width, height);
  drawEnemies(ctx, state, width, height, i18n);
  drawProjectiles(ctx, state, width, height);
  drawBench(ctx, game, width, height);
  drawHud(ctx, game, width, height);
  drawButtons(ctx, game, width, height);
  drawDrag(ctx, game, width, height);
}

export function renderLoading(ctx, width, height, i18n, key = "loading") {
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#202423");
  gradient.addColorStop(0.55, "#2a2d28");
  gradient.addColorStop(1, "#1b2024");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f5ead7";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(i18n.t(key), width / 2, height / 2);
}

function drawScrapyard(ctx, state, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#242826");
  gradient.addColorStop(0.48, "#363329");
  gradient.addColorStop(1, "#1d2428");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#c59043";
  for (let i = 0; i < 24; i++) {
    const x = ((i * 0.173 + state.time * 0.01) % 1) * width;
    const y = (0.17 + ((i * 37) % 66) / 100) * height;
    const w = (18 + (i % 5) * 9) * Math.max(0.8, Math.min(1.15, height / 720));
    ctx.fillRect(x, y, w, 3);
  }
  ctx.restore();

  drawScrapPile(ctx, width * 0.055, height * 0.78, width, height, "#7b6d57");
  drawScrapPile(ctx, width * 0.93, height * 0.21, width, height, "#675e70");
}

function drawScrapPile(ctx, x, y, width, height, color) {
  const scale = Math.max(0.75, Math.min(1.2, height / 720));
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#171a19";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const px = (i % 4) * 16 * scale;
    const py = Math.floor(i / 4) * 12 * scale;
    ctx.beginPath();
    ctx.rect(px, py, (24 + (i % 3) * 7) * scale, 9 * scale);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawLanes(ctx, width, height) {
  for (const yNorm of [0.38, 0.66]) {
    const y = yNorm * height;
    const laneHeight = Math.max(52, height * 0.085);
    const railGradient = ctx.createLinearGradient(0, y - laneHeight / 2, 0, y + laneHeight / 2);
    railGradient.addColorStop(0, "#1b2224");
    railGradient.addColorStop(0.5, "#4a4234");
    railGradient.addColorStop(1, "#1b2224");
    ctx.fillStyle = railGradient;
    roundRect(ctx, width * 0.035, y - laneHeight / 2, width * 0.93, laneHeight, 8);
    ctx.fill();

    ctx.strokeStyle = "#96815b";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.moveTo(width * 0.075, y);
    ctx.lineTo(width * 0.94, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "#2ed1b4";
  roundRect(ctx, width * 0.026, height * 0.28, width * 0.07, height * 0.43, 10);
  ctx.fill();
  ctx.strokeStyle = "#11352f";
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawBeam(ctx, game, width, height) {
  const { state, balance } = game;
  const beam = state.beam;
  if (!beam.active) return;
  const x = beam.baseX * width;
  const y = beam.baseY * height;
  const targetX = beam.targetX * width;
  const targetY = beam.targetY * height;
  const angle = Math.atan2(targetY - y, targetX - x);
  const arc = (balance.beam.arcDegrees * Math.PI) / 180;
  const radius = balance.beam.range * Math.min(width, height);

  ctx.save();
  ctx.globalAlpha = 0.22 + 0.12 * Math.sin(state.time * 9);
  ctx.fillStyle = "#63e8d3";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, radius, angle - arc / 2, angle + arc / 2);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = "#bff7ea";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(targetX, targetY);
  ctx.stroke();
  ctx.restore();
}

function drawPads(ctx, game, width, height) {
  const state = game.state;
  for (const pad of state.pads) {
    const x = pad.x * width;
    const y = pad.y * height;
    const radius = Math.max(21, Math.min(width, height) * 0.035);
    const selected = isSelected(state.selected, "pad", pad.id);
    const covered = state.beam.coveredPads.includes(pad.id);

    ctx.save();
    ctx.fillStyle = pad.unlocked ? "#322f2a" : "#202322";
    ctx.strokeStyle = selected ? "#ffffff" : covered ? "#63e8d3" : pad.unlocked ? "#a98f5e" : "#59605c";
    ctx.lineWidth = covered || selected ? 4 : 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pad.unlocked ? "#54493a" : "#252928";
    ctx.fillRect(x - radius * 0.8, y - 4, radius * 1.6, 8);

    if (!pad.unlocked) {
      ctx.fillStyle = "#d2c1a0";
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fitText(ctx, game.i18n.t("labelLocked"), x, y - 4, radius * 1.65, 11, 8);
      fitText(ctx, game.i18n.t("labelCost", { value: game.getPadUnlockCost() }), x, y + 10, radius * 1.65, 10, 8);
    }

    if (pad.bot) {
      drawBot(ctx, game, pad.bot.tier, x, y, radius * 0.86, covered);
    }
    ctx.restore();
  }
}

function drawBench(ctx, game, width, height) {
  const slots = game.getBenchSlots();
  const state = game.state;
  const i18n = game.i18n;

  ctx.save();
  ctx.fillStyle = "rgba(20, 24, 23, 0.74)";
  roundRect(ctx, width * 0.35, height * 0.79, width * 0.42, height * 0.16, 8);
  ctx.fill();
  ctx.strokeStyle = "#74634c";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#f5ead7";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(i18n.t("labelBench"), width * 0.37, height * 0.805);

  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    const x = slot.x * width;
    const y = slot.y * height;
    const w = slot.w * width;
    const h = slot.h * height;
    const selected = isSelected(state.selected, "bench", index);
    ctx.fillStyle = "#262a29";
    ctx.strokeStyle = selected ? "#ffffff" : "#85745a";
    ctx.lineWidth = selected ? 3 : 2;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 7);
    ctx.fill();
    ctx.stroke();
    if (state.bench[index]) {
      drawBot(ctx, game, state.bench[index].tier, x, y, Math.min(w, h) * 0.36, false);
    }
  }
  ctx.restore();
}

function drawBot(ctx, game, tier, x, y, radius, boosted) {
  const color = BOT_COLORS[(tier - 1) % BOT_COLORS.length];
  ctx.save();
  ctx.translate(x, y);
  if (boosted) {
    ctx.strokeStyle = "#bff7ea";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.18, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "#181b1b";
  ctx.strokeStyle = "#101313";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.94, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  roundRect(ctx, -radius * 0.58, -radius * 0.42, radius * 1.16, radius * 0.84, radius * 0.16);
  ctx.fill();
  ctx.strokeStyle = "#332e26";
  ctx.stroke();

  ctx.fillStyle = "#142020";
  ctx.fillRect(-radius * 0.34, -radius * 0.12, radius * 0.68, radius * 0.24);
  ctx.fillStyle = "#dff9f2";
  ctx.fillRect(-radius * 0.21, -radius * 0.07, radius * 0.13, radius * 0.14);
  ctx.fillRect(radius * 0.08, -radius * 0.07, radius * 0.13, radius * 0.14);

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.68, radius * 0.16);
  ctx.lineTo(-radius * 0.98, radius * 0.38);
  ctx.moveTo(radius * 0.68, radius * 0.16);
  ctx.lineTo(radius * 0.98, radius * 0.38);
  ctx.stroke();

  ctx.fillStyle = "#111514";
  ctx.font = "800 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitText(ctx, game.i18n.t("labelTier", { tier }), 0, radius * 0.62, radius * 1.5, 11, 8);
  ctx.restore();
}

function drawEnemies(ctx, state, width, height, i18n) {
  for (const enemy of state.enemies) {
    const x = enemy.x * width;
    const y = enemy.y * height + Math.sin(enemy.wobble * 8) * 2;
    const scale = enemy.boss ? 1.55 : 1;
    const size = Math.max(18, Math.min(width, height) * 0.029) * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = ENEMY_COLORS[enemy.family] || "#d7c958";
    ctx.strokeStyle = "#181817";
    ctx.lineWidth = 2;

    if (enemy.family === "hauler") {
      roundRect(ctx, -size * 0.78, -size * 0.48, size * 1.56, size * 0.96, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#25251f";
      ctx.fillRect(-size * 0.48, -size * 0.62, size * 0.7, size * 0.18);
    } else if (enemy.family === "drone") {
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.75);
      ctx.lineTo(size * 0.72, 0);
      ctx.lineTo(0, size * 0.75);
      ctx.lineTo(-size * 0.72, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e6f5fa";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.17, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.family === "crusher") {
      roundRect(ctx, -size, -size * 0.58, size * 2, size * 1.16, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#3c2521";
      ctx.fillRect(-size * 0.72, -size * 0.82, size * 1.44, size * 0.28);
      ctx.fillStyle = "#f5ead7";
      ctx.font = "800 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fitText(ctx, i18n.t("labelBoss"), 0, 0, size * 1.5, 10, 8);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.64, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#201d16";
      for (let i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(-size * 0.22, i * size * 0.2);
        ctx.lineTo(-size * 0.78, i * size * 0.46);
        ctx.moveTo(size * 0.22, i * size * 0.2);
        ctx.lineTo(size * 0.78, i * size * 0.46);
        ctx.stroke();
      }
    }

    drawHealthBar(ctx, -size, -size * 1.08, size * 2, 5, enemy.hp / enemy.maxHp);
    ctx.restore();
  }
}

function drawProjectiles(ctx, state, width, height) {
  for (const projectile of state.projectiles) {
    const t = 1 - projectile.ttl / projectile.maxTtl;
    const x = (projectile.fromX + (projectile.toX - projectile.fromX) * t) * width;
    const y = (projectile.fromY + (projectile.toY - projectile.fromY) * t) * height;
    ctx.fillStyle = BOT_COLORS[(projectile.tier - 1) % BOT_COLORS.length];
    ctx.beginPath();
    ctx.arc(x, y, 4 + projectile.tier * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const particle of state.particles) {
    ctx.globalAlpha = Math.max(0, particle.ttl / 0.7);
    ctx.fillStyle = "#f1c85b";
    ctx.fillText(particle.text, particle.x * width, particle.y * height);
  }
  ctx.restore();
}

function drawHud(ctx, game, width, height) {
  const state = game.state;
  const i18n = game.i18n;
  const narrow = width < 640;
  const hudHeight = narrow ? 124 : Math.max(68, height * 0.095);
  ctx.save();
  ctx.fillStyle = "rgba(17, 20, 20, 0.82)";
  ctx.fillRect(0, 0, width, hudHeight);
  ctx.strokeStyle = "#6f6048";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, hudHeight);
  ctx.lineTo(width, hudHeight);
  ctx.stroke();

  ctx.fillStyle = "#f5ead7";
  ctx.font = narrow ? "800 16px system-ui, sans-serif" : "800 22px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  fitText(ctx, i18n.t("title"), narrow ? 10 : width * 0.025, narrow ? 10 : 12, narrow ? width - 72 : width * 0.28, narrow ? 16 : 22, narrow ? 12 : 15);

  const stats = [
    i18n.t("hudWave", { value: state.wave }),
    i18n.t("hudCredits", { value: Math.floor(state.credits) }),
    i18n.t("hudScrap", { value: Math.floor(state.scrap) }),
    i18n.t("hudCrates", { value: state.crates }),
    i18n.t("hudCore", { value: Math.max(0, Math.ceil(state.coreHp)) }),
    i18n.t("hudBeam", { value: Math.round((state.beam.energy / game.balance.beam.energySeconds) * 100) })
  ];
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  if (narrow) {
    const gap = 6;
    const cols = 3;
    const pillWidth = (width - 20 - gap * (cols - 1)) / cols;
    for (let index = 0; index < stats.length; index++) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = 10 + col * (pillWidth + gap);
      const y = 42 + row * 28;
      roundRect(ctx, x, y, pillWidth, 24, 6);
      ctx.fillStyle = "rgba(50, 55, 49, 0.86)";
      ctx.fill();
      ctx.strokeStyle = "#75684f";
      ctx.stroke();
      ctx.fillStyle = "#f5ead7";
      fitText(ctx, stats[index], x + pillWidth / 2, y + 12, pillWidth - 8, 11, 8);
    }
  } else {
    let x = width * 0.31;
    for (const stat of stats) {
      const pillWidth = Math.max(88, Math.min(145, ctx.measureText(stat).width + 20));
      roundRect(ctx, x, 16, pillWidth, 30, 7);
      ctx.fillStyle = "rgba(50, 55, 49, 0.86)";
      ctx.fill();
      ctx.strokeStyle = "#75684f";
      ctx.stroke();
      ctx.fillStyle = "#f5ead7";
      fitText(ctx, stat, x + pillWidth / 2, 31, pillWidth - 12, 13, 10);
      x += pillWidth + 8;
    }
  }

  const statusKey = state.status.ttl > 0 ? state.status.key : "statusReady";
  const statusParams = state.status.ttl > 0 ? state.status.params : {};
  ctx.fillStyle = "#d8c49b";
  ctx.font = narrow ? "700 11px system-ui, sans-serif" : "700 13px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  fitText(
    ctx,
    i18n.t(statusKey, statusParams),
    narrow ? 10 : width * 0.025,
    narrow ? 102 : 47,
    narrow ? width - 20 : width * 0.88,
    narrow ? 11 : 13,
    8
  );
  ctx.restore();
}

function drawButtons(ctx, game, width, height) {
  for (const button of game.state.buttons) {
    const x = button.x * width;
    const y = button.y * height;
    const w = button.w * width;
    const h = button.h * height;
    ctx.save();
    ctx.fillStyle = button.enabled ? "#d9a947" : "#444640";
    ctx.strokeStyle = button.enabled ? "#f5d37c" : "#70736b";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = button.enabled ? "#151818" : "#c0b8a7";
    ctx.font = "800 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(ctx, game.i18n.t(button.labelKey), x + w / 2, y + h / 2, w - 12, 14, 9);

    if (button.id === "buy") {
      ctx.fillStyle = "#151818";
      ctx.font = "700 10px system-ui, sans-serif";
      fitText(ctx, game.i18n.t("labelCost", { value: game.getCrateCost() }), x + w / 2, y + h - 10, w - 12, 10, 8);
    }
    if (button.id === "adChest") {
      const remaining = Math.ceil(game.state.rewards.rewardedChestRemaining);
      if (remaining > 0) {
        ctx.fillStyle = "#151818";
        ctx.font = "700 10px system-ui, sans-serif";
        fitText(ctx, `${remaining}s`, x + w / 2, y + h - 10, w - 12, 10, 8);
      }
    }
    ctx.restore();
  }
}

function drawDrag(ctx, game, width, height) {
  const drag = game.state.drag;
  if (!drag || !drag.moved) return;
  ctx.save();
  ctx.globalAlpha = 0.82;
  drawBot(ctx, game, drag.tier, drag.x * width, drag.y * height, Math.max(23, Math.min(width, height) * 0.032), false);
  ctx.restore();
}

function drawHealthBar(ctx, x, y, width, height, ratio) {
  ctx.fillStyle = "#211f1c";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = ratio > 0.45 ? "#8fd06f" : "#df6d4f";
  ctx.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * width, height);
}

function isSelected(selected, type, index) {
  return selected && selected.type === type && selected.index === index;
}

function fitText(ctx, text, x, y, maxWidth, maxSize, minSize) {
  const family = "system-ui, sans-serif";
  const current = ctx.font;
  const weight = current.includes("800") ? "800" : current.includes("700") ? "700" : "600";
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  ctx.fillText(text, x, y);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
