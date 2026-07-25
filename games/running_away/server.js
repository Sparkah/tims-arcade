const http = require('http');
const { WebSocketServer } = require('ws');

// ── Seeded PRNG (identical to client) ─────────────────────────
function mulberry32(seed) {
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Constants (must match client) ─────────────────────────────
const TILE = 26;
const MAP_COLS = 72;
const MAP_ROWS = 52;
const PLAYER_R = 8;
const CREATURE_R = 11;
const CATCH_DIST = 20;
const CREATURE_SPAWN_DELAY = 8000;
const GAME_DURATION = 60000;
const KILL_TIME_BONUS = 30000;
const SPRINT_MULT = 1.55;
const SPRINT_MAX = 180;
const SPRINT_REGEN = 0.4;
const TORCH_HUMAN = 140;
const CREATURE_TORCH = 110;
// v4 (2026-05-20): Tim flagged MP felt too slow after the v3 deploy.
// Multiply server speeds by 1.5 — matches the new SP pace post-slowdown
// (client divides by 1.5 in SP, server multiplies by 1.5 in MP, so the
// felt difference between SP and MP is ~2.25x → MP visibly snappier).
const SPEEDS = { player: 0.73 * 1.5, ai: 0.63 * 1.5, creature: 0.83 * 1.5 };
const MAX_PLAYERS = 6;
const LOBBY_COUNTDOWN = 15;
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
// Speed constants were tuned for 60fps per-frame application.
// Server runs at 20Hz, so scale movement to match: 50ms / 16.67ms ≈ 3
const SPEED_SCALE = TICK_MS * 60 / 1000;
const HUMAN_NAMES = ['Alex','Sam','Jo','Riley','Morgan','Quinn','Blake','Sage','Drew','Kai'];
const COLORS_HUMANS = ['#5e5','#ee5','#e95','#f5a','#5ee','#a7f','#fa5','#5f9','#f77','#9ef'];

const PORT = process.env.PORT || 3000;

// ── Map Generation (mirrors client exactly) ───────────────────
function generateMap(seed) {
  const rng = mulberry32(seed);
  const rnd = (min, max) => rng() * (max - min) + min;
  const rndInt = (min, max) => Math.floor(rnd(min, max + 1));

  const grid = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < MAP_COLS; c++) grid[r][c] = '#';
  }

  const rooms = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    const rw = rndInt(5, 12);
    const rh = rndInt(5, 10);
    const rx = rndInt(2, MAP_COLS - rw - 2);
    const ry = rndInt(2, MAP_ROWS - rh - 2);

    let overlap = false;
    for (const room of rooms) {
      if (rx - 2 < room.x + room.w && rx + rw + 2 > room.x &&
          ry - 2 < room.y + room.h && ry + rh + 2 > room.y) {
        overlap = true; break;
      }
    }
    if (overlap) continue;

    const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
    rooms.push(room);
    for (let r = ry; r < ry + rh; r++) {
      for (let c = rx; c < rx + rw; c++) grid[r][c] = '.';
    }
    if (rooms.length >= 18) break;
  }

  rooms.sort((a, b) => (a.cx + a.cy * 0.7) - (b.cx + b.cy * 0.7));

  function connectRooms(a, b) {
    let x = a.cx, y = a.cy;
    const wide = rndInt(1, 2);
    while (x !== b.cx) {
      for (let w = 0; w < wide; w++) {
        const ry2 = y + w;
        if (ry2 > 0 && ry2 < MAP_ROWS - 1 && x > 0 && x < MAP_COLS - 1) {
          if (grid[ry2][x] === '#') grid[ry2][x] = '.';
        }
      }
      x += x < b.cx ? 1 : -1;
    }
    while (y !== b.cy) {
      for (let w = 0; w < wide; w++) {
        const rx2 = x + w;
        if (rx2 > 0 && rx2 < MAP_COLS - 1 && y > 0 && y < MAP_ROWS - 1) {
          if (grid[y][rx2] === '#') grid[y][rx2] = '.';
        }
      }
      y += y < b.cy ? 1 : -1;
    }
  }

  for (let i = 1; i < rooms.length; i++) connectRooms(rooms[i - 1], rooms[i]);
  for (let i = 0; i < 6; i++) {
    const a = rooms[rndInt(0, rooms.length - 1)];
    const b = rooms[rndInt(0, rooms.length - 1)];
    if (a !== b) connectRooms(a, b);
  }

  // Obstacles
  for (const room of rooms) {
    if (room.w >= 6 && room.h >= 6) {
      const count = rndInt(2, 5);
      for (let i = 0; i < count; i++) {
        const ox = rndInt(room.x + 2, room.x + room.w - 3);
        const oy = rndInt(room.y + 2, room.y + room.h - 3);
        grid[oy][ox] = 'O';
        if (rng() < 0.4 && ox + 1 < room.x + room.w - 1) grid[oy][ox + 1] = 'O';
        if (rng() < 0.3 && oy + 1 < room.y + room.h - 1) grid[oy + 1][ox] = 'O';
      }
    }
  }

  for (let r = 2; r < MAP_ROWS - 2; r++) {
    for (let c = 2; c < MAP_COLS - 2; c++) {
      if (grid[r][c] === '.' && rng() < 0.008) {
        let adjFloor = 0;
        if (grid[r-1][c] === '.') adjFloor++;
        if (grid[r+1][c] === '.') adjFloor++;
        if (grid[r][c-1] === '.') adjFloor++;
        if (grid[r][c+1] === '.') adjFloor++;
        if (adjFloor >= 3) grid[r][c] = 'O';
      }
    }
  }

  // Barrels
  for (const room of rooms) {
    if (room.w >= 5 && room.h >= 5) {
      const barrelCount = rndInt(1, 2);
      for (let b = 0; b < barrelCount; b++) {
        for (let attempt = 0; attempt < 20; attempt++) {
          const bc = rndInt(room.x + 1, room.x + room.w - 2);
          const br = rndInt(room.y + 1, room.y + room.h - 2);
          if (grid[br][bc] !== '.') continue;
          const nearWall =
            (bc === room.x + 1 || bc === room.x + room.w - 2 ||
             br === room.y + 1 || br === room.y + room.h - 2);
          if (nearWall) {
            grid[br][bc] = 'B';
            break;
          }
        }
      }
    }
  }

  // Doors
  const doors = [];
  let doorCount = 0;
  const maxDoors = 12;
  for (let r = 2; r < MAP_ROWS - 2 && doorCount < maxDoors; r++) {
    for (let c = 2; c < MAP_COLS - 2 && doorCount < maxDoors; c++) {
      if (grid[r][c] !== '.') continue;
      const wallAbove = grid[r-1][c] === '#';
      const wallBelow = grid[r+1][c] === '#';
      const floorLeft = grid[r][c-1] === '.' || grid[r][c-1] === 'B';
      const floorRight = grid[r][c+1] === '.' || grid[r][c+1] === 'B';
      const wallLeft = grid[r][c-1] === '#';
      const wallRight = grid[r][c+1] === '#';
      const floorAbove = grid[r-1][c] === '.' || grid[r-1][c] === 'B';
      const floorBelow = grid[r+1][c] === '.' || grid[r+1][c] === 'B';

      let isDoorSpot = false;
      let orientation = 'h';
      if (wallAbove && wallBelow && floorLeft && floorRight) {
        isDoorSpot = true;
        orientation = 'v';
      } else if (wallLeft && wallRight && floorAbove && floorBelow) {
        isDoorSpot = true;
        orientation = 'h';
      }

      if (isDoorSpot && rng() < 0.35) {
        let tooClose = false;
        for (const d of doors) {
          if (Math.abs(d.col - c) + Math.abs(d.row - r) < 4) { tooClose = true; break; }
        }
        if (!tooClose) {
          grid[r][c] = 'D';
          doors.push({ col: c, row: r, closed: false, breakTimer: 0, orientation });
          doorCount++;
        }
      }
    }
  }

  return { grid, rooms, doors };
}

// ── Server Helpers ────────────────────────────────────────────
function isBlocking(grid, col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return true;
  const t = grid[row][col];
  return t === '#' || t === 'O' || t === 'X';
}

function pixelBlocked(grid, px, py) {
  return isBlocking(grid, Math.floor(px / TILE), Math.floor(py / TILE));
}

function tryMove(grid, ent, dx, dy) {
  const r = ent.radius - 1;
  const nx = ent.x + dx, ny = ent.y + dy;
  if (!pixelBlocked(grid, nx - r, ny - r) && !pixelBlocked(grid, nx + r, ny - r) &&
      !pixelBlocked(grid, nx - r, ny + r) && !pixelBlocked(grid, nx + r, ny + r)) {
    ent.x = nx; ent.y = ny; return true;
  }
  if (dx !== 0) {
    const sx = ent.x + dx;
    if (!pixelBlocked(grid, sx - r, ent.y - r) && !pixelBlocked(grid, sx + r, ent.y - r) &&
        !pixelBlocked(grid, sx - r, ent.y + r) && !pixelBlocked(grid, sx + r, ent.y + r)) {
      ent.x = sx; return true;
    }
  }
  if (dy !== 0) {
    const sy = ent.y + dy;
    if (!pixelBlocked(grid, ent.x - r, sy - r) && !pixelBlocked(grid, ent.x + r, sy - r) &&
        !pixelBlocked(grid, ent.x - r, sy + r) && !pixelBlocked(grid, ent.x + r, sy + r)) {
      ent.y = sy; return true;
    }
  }
  return false;
}

function findOpenSpot(grid, nearCol, nearRow, spread) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const c = nearCol + Math.floor(Math.random() * (spread * 2 + 1)) - spread;
    const r = nearRow + Math.floor(Math.random() * (spread * 2 + 1)) - spread;
    if (c > 0 && c < MAP_COLS - 1 && r > 0 && r < MAP_ROWS - 1 && !isBlocking(grid, c, r)) {
      return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
    }
  }
  return { x: nearCol * TILE + TILE / 2, y: nearRow * TILE + TILE / 2 };
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// BFS pathfinding (server-side)
function bfsPath(grid, fromX, fromY, toX, toY, ignoreDoors) {
  const blocks = ignoreDoors
    ? (c, r) => { if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return true; const t = grid[r][c]; return t === '#' || t === 'O'; }
    : (c, r) => isBlocking(grid, c, r);

  const sc = Math.floor(fromX / TILE), sr = Math.floor(fromY / TILE);
  let ec = Math.floor(toX / TILE), er = Math.floor(toY / TILE);
  if (sc === ec && sr === er) return null;
  if (blocks(ec, er)) {
    const dirs4 = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
    let found = false;
    for (const [dc, dr] of dirs4) {
      if (!blocks(ec + dc, er + dr)) { ec += dc; er += dr; found = true; break; }
    }
    if (!found) return null;
    if (sc === ec && sr === er) return null;
  }
  const key = (c, r) => r * MAP_COLS + c;
  const visited = new Uint8Array(MAP_COLS * MAP_ROWS);
  const parent = new Int32Array(MAP_COLS * MAP_ROWS).fill(-1);
  const queue = [key(sc, sr)];
  let qHead = 0;
  visited[key(sc, sr)] = 1;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  while (qHead < queue.length) {
    const cur = queue[qHead++];
    const cc = cur % MAP_COLS, cr = Math.floor(cur / MAP_COLS);
    if (cc === ec && cr === er) {
      const path = [];
      let k = key(ec, er);
      while (k !== key(sc, sr)) {
        const pc = k % MAP_COLS, pr = Math.floor(k / MAP_COLS);
        path.push({ x: pc * TILE + TILE / 2, y: pr * TILE + TILE / 2 });
        k = parent[k];
      }
      path.reverse();
      return path;
    }
    for (const [dc, dr] of dirs) {
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS) continue;
      const nk = key(nc, nr);
      if (visited[nk] || blocks(nc, nr)) continue;
      if (dc !== 0 && dr !== 0) {
        if (blocks(cc + dc, cr) || blocks(cc, cr + dr)) continue;
      }
      visited[nk] = 1;
      parent[nk] = cur;
      queue.push(nk);
    }
  }
  return null;
}

// ── Room class ────────────────────────────────────────────────
let roomIdCounter = 0;

class Room {
  constructor() {
    this.id = ++roomIdCounter;
    this.players = new Map(); // ws → { id, name, role, entity }
    this.state = 'lobby'; // lobby | playing | ended
    this.seed = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
    this.grid = null;
    this.rooms = null;
    this.doors = null;
    this.entities = []; // all game entities { id, type, name, color, x, y, radius, speed, alive, hiding, sprinting, facingAngle, role, isBot, sprintStamina }
    this.caught = [];
    this.gameTime = 0;
    this.creatureSpawned = false;
    this.creatureSpawnTimer = 0;
    this.creatureEvo = 0;
    this.huntTimeLimit = GAME_DURATION;
    this.distractions = [];
    this.flyingRocks = [];
    this.tickInterval = null;
    this.lobbyCountdown = LOBBY_COUNTDOWN;
    this.lobbyInterval = null;
    this.events = []; // queued events to broadcast
    this._actionLog = []; // v7: ring buffer of last 50 action outcomes per room
    this._doorsDirty = true; // send full door state on first tick
    this._caughtDirty = true;
  }

  addPlayer(ws, name) {
    const id = 'p' + Math.random().toString(36).slice(2, 8);
    this.players.set(ws, { id, name, role: null, entity: null, input: {}, actionQueue: [] });
    this.broadcastLobby();

    if (this.players.size >= 2 && !this.lobbyInterval) {
      this.startLobbyCountdown();
    }
    return id;
  }

  removePlayer(ws) {
    const p = this.players.get(ws);
    if (!p) return;

    if (this.state === 'playing' && p.entity) {
      // Player quit — kill their entity
      if (p.entity.type !== 'creature') {
        p.entity.alive = false;
        p.entity.hiding = false;
        this._caughtDirty = true;
      } else {
        // If creature quits, convert to bot so game continues
        p.entity.isBot = true;
        p.entity.botState = 'wander';
        p.entity.wanderTimer = 0;
        p.entity.targetX = p.entity.x;
        p.entity.targetY = p.entity.y;
      }
    }

    this.players.delete(ws);

    if (this.state === 'lobby') {
      this.broadcastLobby();
      if (this.players.size < 2 && this.lobbyInterval) {
        clearInterval(this.lobbyInterval);
        this.lobbyInterval = null;
        this.lobbyCountdown = LOBBY_COUNTDOWN;
        this.broadcastLobby();
      }
    }

    if (this.players.size === 0) {
      this.shutdown();
    }
  }

  startLobbyCountdown() {
    this.lobbyCountdown = LOBBY_COUNTDOWN;
    this.lobbyInterval = setInterval(() => {
      this.lobbyCountdown--;
      this.broadcastLobby();
      if (this.lobbyCountdown <= 0) {
        clearInterval(this.lobbyInterval);
        this.lobbyInterval = null;
        this.startGame();
      }
    }, 1000);
  }

  startGame() {
    this.state = 'playing';
    const { grid, rooms, doors } = generateMap(this.seed);
    this.grid = grid;
    this.mapRooms = rooms;
    this.doors = doors;
    this.entities = [];
    this.caught = [];
    this.gameTime = 0;
    this.creatureSpawned = false;
    this.creatureSpawnTimer = 0;
    this.creatureEvo = 0;
    this.huntTimeLimit = GAME_DURATION;
    this.distractions = [];
    this.flyingRocks = [];

    // Find spawn rooms
    const centerCol = MAP_COLS / 2, centerRow = MAP_ROWS / 2;
    const sortedRooms = [...rooms].sort((a, b) =>
      Math.hypot(a.cx - centerCol, a.cy - centerRow) - Math.hypot(b.cx - centerCol, b.cy - centerRow)
    );
    const startRoom = sortedRooms[0];
    const creatureRoom = sortedRooms[sortedRooms.length - 1];

    // Assign roles: 1 creature, rest humans
    const playerArr = [...this.players.entries()];
    const creatureIdx = Math.floor(Math.random() * playerArr.length);

    const totalHumans = 10;
    let humanIdx = 0;

    for (let i = 0; i < playerArr.length; i++) {
      const [ws, pData] = playerArr[i];
      if (i === creatureIdx) {
        pData.role = 'creature';
        const spot = findOpenSpot(grid, creatureRoom.cx, creatureRoom.cy, 3);
        const ent = {
          id: pData.id, type: 'creature', name: pData.name, color: '#f22',
          x: spot.x, y: spot.y, radius: CREATURE_R, speed: SPEEDS.creature,
          alive: true, hiding: false, sprinting: false, facingAngle: 0,
          isBot: false, sprintStamina: SPRINT_MAX,
          path: [], pathTimer: 0, stuckCounter: 0
        };
        pData.entity = ent;
        this.entities.push(ent);
      } else {
        pData.role = 'human';
        const spot = findOpenSpot(grid, startRoom.cx + Math.floor(Math.random() * 6) - 3, startRoom.cy + Math.floor(Math.random() * 6) - 3, 4);
        const ent = {
          id: pData.id, type: 'human', name: pData.name,
          color: COLORS_HUMANS[humanIdx % COLORS_HUMANS.length],
          x: spot.x, y: spot.y, radius: PLAYER_R, speed: SPEEDS.ai,
          alive: true, hiding: false, sprinting: false, facingAngle: 0,
          isBot: false, sprintStamina: SPRINT_MAX,
          panicLevel: 0, state: 'wander', wanderTimer: 0,
          targetX: spot.x, targetY: spot.y,
          path: [], pathTimer: 0, stuckCounter: 0,
          rocksLeft: 3
        };
        pData.entity = ent;
        this.entities.push(ent);
        humanIdx++;
      }
    }

    // Fill remaining human slots with bots
    while (humanIdx < totalHumans) {
      const spot = findOpenSpot(grid, startRoom.cx + Math.floor(Math.random() * 6) - 3, startRoom.cy + Math.floor(Math.random() * 6) - 3, 4);
      const botName = HUMAN_NAMES[humanIdx % HUMAN_NAMES.length];
      const ent = {
        id: 'bot' + humanIdx, type: 'human', name: botName,
        color: COLORS_HUMANS[humanIdx % COLORS_HUMANS.length],
        x: spot.x, y: spot.y, radius: PLAYER_R, speed: SPEEDS.ai,
        alive: true, hiding: false, sprinting: false, facingAngle: 0,
        isBot: true, sprintStamina: SPRINT_MAX,
        panicLevel: 0, state: 'wander', wanderTimer: 0,
        targetX: spot.x, targetY: spot.y,
        path: [], pathTimer: 0, stuckCounter: 0,
        personality: 0.3 + Math.random() * 0.7,
        rocksLeft: 3
      };
      this.entities.push(ent);
      humanIdx++;
    }

    // If creature is a bot (shouldn't happen normally, but handle it)
    const hasCreaturePlayer = playerArr.some(([, p]) => p.role === 'creature');
    if (!hasCreaturePlayer) {
      const spot = findOpenSpot(grid, creatureRoom.cx, creatureRoom.cy, 3);
      this.entities.push({
        id: 'bot_creature', type: 'creature', name: 'The Creature', color: '#f22',
        x: spot.x, y: spot.y, radius: CREATURE_R, speed: SPEEDS.creature,
        alive: true, hiding: false, sprinting: false, facingAngle: 0,
        isBot: true, sprintStamina: SPRINT_MAX,
        path: [], pathTimer: 0, stuckCounter: 0,
        huntTarget: null, lastSenseTime: 0, lastSenseX: 0, lastSenseY: 0,
        sensedTarget: null, patrolTarget: null
      });
    }

    // Notify all players of start
    for (const [ws, pData] of this.players) {
      this.send(ws, {
        type: 'start',
        role: pData.role,
        playerId: pData.id,
        seed: this.seed,
        entities: this.entities.map(e => this._serializeEntity(e))
      });
    }

    // Start tick loop
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    if (this.state !== 'playing') return;
    const dt = TICK_MS;
    this.gameTime += dt;
    // v7.1 CRITICAL FIX: do NOT clear events here. ws message handler
    // pushes events to this.events between ticks (creature_break,
    // hide_enter, hide_exit, door, etc). Clearing at tick START wiped
    // them BEFORE the broadcast at the end of this same tick. Client
    // never received barrel_broken / door_break / hide_exit events →
    // local mapGrid never updated → player still saw the barrel/door →
    // looked like "have to press 5 times" because every press succeeded
    // server-side but the client never knew.
    // Clear AFTER broadcast (end of tick) instead.

    // Creature spawn
    if (!this.creatureSpawned) {
      this.creatureSpawnTimer += dt;
      if (this.creatureSpawnTimer >= CREATURE_SPAWN_DELAY) {
        this.creatureSpawned = true;
        this.events.push({ kind: 'creature_awaken' });
      }
    }

    // Hunt countdown — ends game when time expires
    if (this.creatureSpawned && (this.gameTime - CREATURE_SPAWN_DELAY) >= this.huntTimeLimit) {
      this._endGame('humans');
      return;
    }

    // Apply player inputs
    for (const [ws, pData] of this.players) {
      if (!pData.entity || !pData.entity.alive) continue;
      const input = pData.input || {};

      // Process exit-hide even while hidden. The old flow skipped hidden
      // entities before reaching _handleAction, so survivors could enter a
      // barrel but never leave it in multiplayer.
      if (pData.entity.hiding) {
        this._drainActionQueue(pData);
        continue;
      }

      // Stun check
      if (pData.entity._stunnedUntil && this.gameTime < pData.entity._stunnedUntil) continue;
      pData.entity._stunnedUntil = null;

      if (pData.role === 'creature' && !this.creatureSpawned) continue;

      let mx = 0, my = 0;
      if (input.up) my = -1;
      if (input.down) my = 1;
      if (input.left) mx = -1;
      if (input.right) mx = 1;

      let sp;
      if (pData.role === 'creature') {
        // v6.1: MP per-catch + per-evo bonuses are 1.5× the SP versions
        // (matching the 1.5× scaling of SPEEDS itself), so the late-game
        // creature:human ratio ≈ 2× in MP just like SP. 9 catches+evo:
        //   sp = 1.245 + 9*0.06 + 9*0.045 = 2.19 → ratio 2.0× vs player 1.095.
        sp = SPEEDS.creature + this.creatureEvo * 0.06 + this.caught.length * 0.045;
      } else {
        sp = SPEEDS.player;
        const sprinting = input.sprint;
        if (sprinting && pData.entity.sprintStamina > 0 && (mx !== 0 || my !== 0)) {
          sp *= SPRINT_MULT;
          pData.entity.sprintStamina = Math.max(0, pData.entity.sprintStamina - SPEED_SCALE);
          pData.entity.sprinting = true;
        } else {
          pData.entity.sprintStamina = Math.min(SPRINT_MAX, pData.entity.sprintStamina + SPRINT_REGEN * SPEED_SCALE);
          pData.entity.sprinting = false;
        }
      }

      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        const ox = pData.entity.x, oy = pData.entity.y;
        tryMove(this.grid, pData.entity, (mx / len) * sp * SPEED_SCALE, (my / len) * sp * SPEED_SCALE);
        pData.entity.facingAngle = Math.atan2(my, mx);

        // Creature smashes through doors on contact
        if (pData.role === 'creature' && Math.hypot(pData.entity.x - ox, pData.entity.y - oy) < 0.05) {
          const fc = Math.floor((pData.entity.x + Math.cos(pData.entity.facingAngle) * 15) / TILE);
          const fr = Math.floor((pData.entity.y + Math.sin(pData.entity.facingAngle) * 15) / TILE);
          if (fc >= 0 && fc < MAP_COLS && fr >= 0 && fr < MAP_ROWS && this.grid[fr][fc] === 'X') {
            const door = this.doors.find(d => d.col === fc && d.row === fr);
            if (door) {
              this.grid[fr][fc] = '.';
              const idx = this.doors.indexOf(door);
              if (idx !== -1) this.doors.splice(idx, 1);
              this._doorsDirty = true;
              this.events.push({ kind: 'door_break', data: { col: fc, row: fr } });
              pData.entity._stunnedUntil = this.gameTime + 1500 + Math.random() * 500;
            }
          }
        }
      }

      // Creature catch check
      if (pData.role === 'creature' && this.creatureSpawned) {
        for (const ent of this.entities) {
          if (ent.type === 'human' && ent.alive && !ent.hiding && dist(pData.entity, ent) < CATCH_DIST) {
            this._catchEntity(ent);
          }
        }
      }

      this._drainActionQueue(pData);
    }

    // Update bot AI
    for (const ent of this.entities) {
      if (!ent.isBot || !ent.alive) continue;
      if (ent.type === 'human') {
        this._updateHumanBot(ent, dt);
      } else if (ent.type === 'creature' && this.creatureSpawned) {
        this._updateCreatureBot(ent, dt);
      }
    }

    // Update distractions
    for (let i = this.flyingRocks.length - 1; i >= 0; i--) {
      const r = this.flyingRocks[i];
      r.progress++;
      if (r.progress >= r.duration) {
        this.distractions.push({ x: r.tx, y: r.ty, time: this.gameTime });
        this.events.push({ kind: 'rock_land', data: { x: r.tx, y: r.ty } });
        this.flyingRocks.splice(i, 1);
      }
    }
    for (let i = this.distractions.length - 1; i >= 0; i--) {
      if (this.gameTime - this.distractions[i].time > 3000) {
        this.distractions.splice(i, 1);
      }
    }

    // Broadcast state (only include doors/caught when changed)
    const stateMsg = {
      type: 'state',
      tick: Math.floor(this.gameTime / TICK_MS),
      gameTime: this.gameTime,
      creatureSpawned: this.creatureSpawned,
      huntTimeLimit: this.huntTimeLimit,
      entities: this.entities.map(e => this._serializeEntity(e)),
    };
    if (this._doorsDirty) {
      stateMsg.doors = this.doors.map(d => ({ col: d.col, row: d.row, closed: d.closed }));
      this._doorsDirty = false;
    }
    if (this._caughtDirty) {
      stateMsg.caught = this.caught;
      this._caughtDirty = false;
    }
    if (this.events.length > 0) stateMsg.events = this.events;

    const stateMsgStr = JSON.stringify(stateMsg);
    for (const [ws] of this.players) {
      try { ws.send(stateMsgStr); } catch(_) {}
    }
    // v7.1: clear events AFTER broadcast (was at start of tick — wiped
    // events that arrived between ticks via ws message handler).
    this.events = [];

    // Check game end
    const humansAlive = this.entities.filter(e => e.type === 'human' && e.alive).length;
    if (humansAlive === 0 && this.creatureSpawned) {
      this._endGame('creature');
    }
  }

  _serializeEntity(e) {
    const o = {
      id: e.id, type: e.type, name: e.name, color: e.color,
      x: Math.round(e.x), y: Math.round(e.y),
      alive: e.alive,
    };
    // Only include non-default fields to shrink payload
    if (e.hiding) o.hiding = true;
    if (e.sprinting) o.sprinting = true;
    if (e.facingAngle) o.facingAngle = Math.round(e.facingAngle * 100) / 100;
    if (e.type === 'human' && e.sprintStamina !== undefined) o.sprintStamina = Math.round(e.sprintStamina);
    return o;
  }

  _handleAction(pData, action) {
    const ent = pData.entity;
    if (!ent || !ent.alive) return;

    // v7 (2026-05-20): every action is logged with structured outcome so
    // Tim (and future-me) can curl /debug/actions when something doesn't
    // feel right and see exactly why the server didn't act.
    const dbg = { t: Date.now(), id: ent.id, name: pData.name, role: pData.role,
                  action, hiding: !!ent.hiding, x: Math.round(ent.x), y: Math.round(ent.y),
                  outcome: null, nearest: null };
    const finish = (outcome, nearest) => {
      dbg.outcome = outcome;
      if (nearest != null) dbg.nearest = Math.round(nearest);
      this._actionLog.push(dbg);
      if (this._actionLog.length > 50) this._actionLog.shift();
      console.log(`[action] ${pData.name}/${pData.role} action=${action} hiding=${dbg.hiding} → ${outcome}${nearest != null ? ` (nearest ${Math.round(nearest)}px)` : ''}`);
    };

    // v7: explicit hide_exit / hide_enter actions (no toggle). Also keeps
    // legacy 'hide' as a toggle fallback for clients that haven't been
    // re-uploaded with v7 wiring. If the entity is hiding, ANY E-action
    // unhides first — this is the broadest possible safety net so the
    // hidden survivor cannot get stuck regardless of which action arrived.
    if (ent.hiding && action !== 'hide_enter') {
      ent.hiding = false;
      this.events.push({ kind: 'hide_exit', data: { id: ent.id, x: ent.x, y: ent.y } });
      return finish('hide_exit_ok');
    }
    if (action === 'hide_exit') return finish('hide_exit_noop_not_hiding');

    if (action === 'hide' || action === 'hide_enter') {
      if (pData.role === 'creature') return finish('hide_blocked_creature_role');
      // Find nearby barrel — v7: radius 30 → 64 (2 tiles) so the server's
      // view always catches up to whatever the client prompt showed.
      const pc = Math.floor(ent.x / TILE);
      const pr = Math.floor(ent.y / TILE);
      let nearestBarrel = Infinity;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const c = pc + dc, r = pr + dr;
          if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) continue;
          if (this.grid[r][c] === 'B') {
            const bx = c * TILE + TILE / 2;
            const by = r * TILE + TILE / 2;
            const d = Math.hypot(bx - ent.x, by - ent.y);
            if (d < nearestBarrel) nearestBarrel = d;
            if (d < 64) {
              ent.hiding = true;
              ent.x = bx;
              ent.y = by;
              this.events.push({ kind: 'hide', data: { id: ent.id, x: bx, y: by } });
              return finish('hide_enter_ok', d);
            }
          }
        }
      }
      // Try door
      const toggled = this._toggleDoorNear(ent);
      return finish(toggled ? 'hide_fallback_door_toggle_ok' : 'hide_no_target', nearestBarrel === Infinity ? null : nearestBarrel);
    } else if (action === 'door') {
      const toggled = this._toggleDoorNear(ent);
      return finish(toggled ? 'door_toggle_ok' : 'door_no_target');
    } else if (action === 'creature_break' || action === 'break_barrel') {
      // v7: radius 48 → 64. Even at worst-case tick lag + sprint + diagonal
      // approach the server's view of creature pos is < 10px off the
      // rendered position, so 64 (full 2 tiles) guarantees prompt-visible =
      // action-fires.
      if (pData.role !== 'creature') return finish('break_blocked_not_creature_role');
      const pc = Math.floor(ent.x / TILE);
      const pr = Math.floor(ent.y / TILE);

      // Pass 1 — barrel
      let broke = null;
      let nearestBarrel = Infinity;
      for (let dr = -2; dr <= 2 && !broke; dr++) {
        for (let dc = -2; dc <= 2 && !broke; dc++) {
          const c = pc + dc, r = pr + dr;
          if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) continue;
          if (this.grid[r][c] !== 'B') continue;
          const bx = c * TILE + TILE / 2;
          const by = r * TILE + TILE / 2;
          const d = Math.hypot(bx - ent.x, by - ent.y);
          if (d < nearestBarrel) nearestBarrel = d;
          if (d < 64) {
            this.grid[r][c] = '.';
            this._gridDirty = true;
            broke = { col: c, row: r, x: bx, y: by, d };
          }
        }
      }
      if (broke) {
        for (const [, p] of this.players) {
          if (p.entity && p.entity.hiding &&
              Math.abs(p.entity.x - broke.x) < 4 && Math.abs(p.entity.y - broke.y) < 4) {
            p.entity.hiding = false;
          }
        }
        this.events.push({ kind: 'barrel_broken', data: broke });
        return finish('barrel_broken_ok', broke.d);
      }

      // Pass 2 — door
      let nearestDoor = Infinity;
      for (const d of this.doors) {
        const dx = (d.col * TILE + TILE / 2) - ent.x;
        const dy = (d.row * TILE + TILE / 2) - ent.y;
        const dist = Math.hypot(dx, dy);
        if (dist < nearestDoor) nearestDoor = dist;
        if (dist < 64) {
          this.grid[d.row][d.col] = '.';
          const idx = this.doors.indexOf(d);
          if (idx !== -1) this.doors.splice(idx, 1);
          this._doorsDirty = true;
          this.events.push({ kind: 'door_break', data: { col: d.col, row: d.row } });
          return finish('door_broken_ok', dist);
        }
      }
      return finish('break_no_target_in_range', Math.min(nearestBarrel, nearestDoor));
    } else if (action === 'throw') {
      if (pData.role === 'creature' || !ent.rocksLeft || ent.rocksLeft <= 0) return finish('throw_blocked');
      ent.rocksLeft--;
      const a = ent.facingAngle;
      let lx = ent.x, ly = ent.y;
      for (let step = 0; step < 200; step += TILE / 2) {
        const nx = ent.x + Math.cos(a) * step;
        const ny = ent.y + Math.sin(a) * step;
        if (pixelBlocked(this.grid, nx, ny)) break;
        lx = nx; ly = ny;
      }
      this.flyingRocks.push({
        x: ent.x, y: ent.y, tx: lx, ty: ly, progress: 0, duration: 25
      });
      this.events.push({ kind: 'rock_throw', data: { id: ent.id, x: ent.x, y: ent.y, tx: lx, ty: ly } });
      return finish('throw_ok');
    }
    finish('unknown_action');
  }

  _drainActionQueue(pData) {
    if (!pData.actionQueue || pData.actionQueue.length === 0) return;
    // One discrete action per tick keeps "one press = one action" and
    // prevents repeats from entering+exiting or breaking multiple targets
    // in the same 50ms server frame.
    const action = pData.actionQueue.shift();
    this._handleAction(pData, action);
  }

  _toggleDoorNear(ent) {
    let nearest = Infinity, hit = null;
    for (const d of this.doors) {
      const dx = (d.col * TILE + TILE / 2) - ent.x;
      const dy = (d.row * TILE + TILE / 2) - ent.y;
      const dist = Math.hypot(dx, dy);
      if (dist < nearest) { nearest = dist; hit = d; }
    }
    // v7: 48 → 64 (full 2 tiles). Prompt visible = toggle fires.
    if (!hit || nearest >= 64) return false;
    hit.closed = !hit.closed;
    this.grid[hit.row][hit.col] = hit.closed ? 'X' : 'D';
    this._doorsDirty = true;
    this.events.push({ kind: 'door', data: { col: hit.col, row: hit.row, closed: hit.closed } });
    if (hit.closed) this._pushOutOfDoor(hit.col, hit.row);
    return true;
  }

  _pushOutOfDoor(doorCol, doorRow) {
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const ents = this.entities.slice();
    for (const [, p] of this.players) { if (p.entity && !ents.includes(p.entity)) ents.push(p.entity); }
    for (const e of ents) {
      if (!e.alive || e.hiding) continue;
      const ec = Math.floor(e.x / TILE);
      const er = Math.floor(e.y / TILE);
      if (ec !== doorCol || er !== doorRow) continue;
      for (const [dc, dr] of dirs) {
        const nc = doorCol + dc, nr = doorRow + dr;
        if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS) continue;
        if (isBlocking(this.grid, nc, nr)) continue;
        e.x = nc * TILE + TILE / 2;
        e.y = nr * TILE + TILE / 2;
        break;
      }
    }
  }

  _catchEntity(ent) {
    if (!ent.alive) return;
    ent.alive = false;
    this.caught.push({ name: ent.name, time: this.gameTime, color: ent.color, id: ent.id });
    this._caughtDirty = true;
    this.events.push({ kind: 'catch', data: { id: ent.id, name: ent.name, x: ent.x, y: ent.y, color: ent.color } });

    if (this.creatureEvo < 10) {
      this.creatureEvo++;
      const creature = this.entities.find(e => e.type === 'creature');
      // Apply per-catch bonus alongside per-evo so server-cached ent.speed
      // stays in sync with the input-time computation above.
      if (creature) creature.speed = SPEEDS.creature + this.creatureEvo * 0.06 + this.caught.length * 0.045;
    }

    // Extend hunt timer
    this.huntTimeLimit += KILL_TIME_BONUS;
  }

  _updateHumanBot(h, dt) {
    if (!h.alive || h.hiding) return;
    const creature = this.entities.find(e => e.type === 'creature' && e.alive);
    const creatureNear = creature && this.creatureSpawned;
    const creatureDist = creatureNear ? dist(h, creature) : Infinity;
    const canSeeCreature = creatureDist < TORCH_HUMAN + 30;

    if (canSeeCreature) {
      h.panicLevel = Math.min(1, (h.panicLevel || 0) + Math.max(0, (250 - creatureDist) / 250) * 0.04 * (h.personality || 0.5));
    } else {
      h.panicLevel = Math.max(0, (h.panicLevel || 0) - 0.003);
    }

    if (canSeeCreature && creatureDist < 200) {
      h.state = 'flee';
    } else if (canSeeCreature && h.panicLevel > 0.4) {
      h.state = 'hide';
    } else {
      if (h.state === 'flee' || h.state === 'hide') {
        if (!canSeeCreature && h.panicLevel < 0.2) { h.state = 'wander'; h.wanderTimer = 0; }
      }
      if (h.state !== 'flee' && h.state !== 'hide') {
        h.state = 'wander';
        h.wanderTimer -= dt;
        if (h.wanderTimer <= 0) {
          const spot = findOpenSpot(this.grid, Math.floor(h.x / TILE), Math.floor(h.y / TILE), 10);
          h.targetX = spot.x;
          h.targetY = spot.y;
          h.wanderTimer = 2000 + Math.random() * 4000;
        }
      }
    }

    let moveX = 0, moveY = 0;
    let sp = h.speed;
    h.sprinting = false;

    if (h.state === 'flee' && creature) {
      const a = Math.atan2(h.y - creature.y, h.x - creature.x);
      moveX = Math.cos(a);
      moveY = Math.sin(a);
      sp *= 1.3;
      h.sprinting = true;
    } else {
      const dx = (h.targetX || h.x) - h.x, dy = (h.targetY || h.y) - h.y;
      const d = Math.hypot(dx, dy);
      if (d > 5) { moveX = dx / d; moveY = dy / d; }
    }

    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY);
      tryMove(this.grid, h, (moveX / len) * sp * SPEED_SCALE, (moveY / len) * sp * SPEED_SCALE);
      h.facingAngle = Math.atan2(moveY, moveX);
    }
  }

  _updateCreatureBot(c, dt) {
    if (!c.alive || !this.creatureSpawned) return;

    // Stun check
    if (c._stunnedUntil && this.gameTime < c._stunnedUntil) return;
    c._stunnedUntil = null;

    const allTargets = this.entities.filter(e => e.type === 'human' && e.alive && !e.hiding);
    const cTorch = CREATURE_TORCH + this.creatureEvo * 8;
    const cSense = cTorch * 3;

    let sensedTargets = [];
    for (const t of allTargets) {
      const d = dist(c, t);
      if (d < cTorch) {
        sensedTargets.push({ ent: t, dist: d });
      } else if (d < cSense) {
        sensedTargets.push({ ent: t, dist: d });
      }
    }

    // Check distractions
    for (const dis of this.distractions) {
      if (this.gameTime - dis.time < 3000) {
        const d = dist(c, dis);
        if (d > CATCH_DIST) {
          sensedTargets.push({ ent: { x: dis.x, y: dis.y, name: 'noise' }, dist: d });
        }
      }
    }

    sensedTargets.sort((a, b) => a.dist - b.dist);

    let sp = c.speed + this.caught.length * 0.02;
    let goalX, goalY;
    let recomputePath = false;

    if (sensedTargets.length > 0) {
      const target = sensedTargets[0].ent;
      sp *= 1.15;
      if (sensedTargets[0].dist < CATCH_DIST && target.name !== 'noise') {
        this._catchEntity(target);
        return;
      }
      c.state = 'hunt';
      goalX = target.x; goalY = target.y;
      c.pathTimer = (c.pathTimer || 0) - dt;
      if (!c.path || c.path.length === 0 || c.pathTimer <= 0) recomputePath = true;
    } else {
      c.state = 'patrol';
      if (!c.patrolTarget) {
        const randRoom = this.mapRooms[Math.floor(Math.random() * this.mapRooms.length)];
        c.patrolTarget = findOpenSpot(this.grid, randRoom.cx, randRoom.cy, 5);
        recomputePath = true;
      }
      goalX = c.patrolTarget.x; goalY = c.patrolTarget.y;
      if (Math.hypot(goalX - c.x, goalY - c.y) < 30) {
        c.patrolTarget = null;
        return;
      }
      c.pathTimer = (c.pathTimer || 0) - dt;
      if (!c.path || c.path.length === 0 || c.pathTimer <= 0) recomputePath = true;
    }

    if (recomputePath && goalX !== undefined) {
      const newPath = bfsPath(this.grid, c.x, c.y, goalX, goalY, true);
      if (newPath && newPath.length > 0) {
        c.path = newPath;
        c.pathTimer = c.state === 'hunt' ? 300 : 600;
      } else {
        c.path = [];
        c.pathTimer = 200;
      }
    }

    let moveX = 0, moveY = 0;
    if (c.path && c.path.length > 0) {
      const wp = c.path[0];
      const dx = wp.x - c.x, dy = wp.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 8) {
        c.path.shift();
        if (c.path.length > 0) {
          const nwp = c.path[0];
          moveX = nwp.x - c.x; moveY = nwp.y - c.y;
        }
      } else {
        moveX = dx; moveY = dy;
      }
    } else if (goalX !== undefined) {
      moveX = goalX - c.x; moveY = goalY - c.y;
    }

    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY);
      const nx = (moveX / len) * sp * SPEED_SCALE;
      const ny = (moveY / len) * sp * SPEED_SCALE;
      const ox = c.x, oy = c.y;
      tryMove(this.grid, c, nx, ny);
      c.facingAngle = Math.atan2(moveY, moveX);

      if (Math.hypot(c.x - ox, c.y - oy) < 0.05) {
        c.stuckCounter = (c.stuckCounter || 0) + 1;

        // Check if stuck at a closed door — smash through instantly
        const facingCol = Math.floor((c.x + Math.cos(c.facingAngle) * 15) / TILE);
        const facingRow = Math.floor((c.y + Math.sin(c.facingAngle) * 15) / TILE);
        if (facingCol >= 0 && facingCol < MAP_COLS && facingRow >= 0 && facingRow < MAP_ROWS && this.grid[facingRow][facingCol] === 'X') {
          const door = this.doors.find(d => d.col === facingCol && d.row === facingRow);
          if (door) {
            this.grid[door.row][door.col] = '.';
            const idx = this.doors.indexOf(door);
            if (idx !== -1) this.doors.splice(idx, 1);
            this._doorsDirty = true;
            this.events.push({ kind: 'door_break', data: { col: facingCol, row: facingRow } });
            c.stuckCounter = 0;
            c._stunnedUntil = this.gameTime + 1500 + Math.random() * 500;
            return;
          }
        }

        // Wall-sliding: try each axis separately
        if (c.stuckCounter > 3) {
          const slideX = Math.abs(nx) > Math.abs(ny);
          if (slideX) {
            tryMove(this.grid, c, nx, 0) || tryMove(this.grid, c, 0, ny);
          } else {
            tryMove(this.grid, c, 0, ny) || tryMove(this.grid, c, nx, 0);
          }
        }

        // Perpendicular push to break free of corners
        if (c.stuckCounter > 8) {
          const perp = c.facingAngle + (c.stuckCounter % 2 === 0 ? Math.PI / 2 : -Math.PI / 2);
          tryMove(this.grid, c, Math.cos(perp) * sp * SPEED_SCALE * 2, Math.sin(perp) * sp * SPEED_SCALE * 2);
        }

        // Skip waypoint if stuck too long
        if (c.stuckCounter > 12 && c.path && c.path.length > 1) {
          c.path.shift();
        }

        // Force full path recompute
        if (c.stuckCounter > 18) {
          c.path = [];
          c.pathTimer = 0;
          c.stuckCounter = 0;
          c.patrolTarget = null;
        }
      } else {
        c.stuckCounter = 0;
      }
    }
  }

  _endGame(winner) {
    this.state = 'ended';
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    for (const [ws] of this.players) {
      this.send(ws, {
        type: 'end',
        winner,
        stats: { caught: this.caught.length, time: this.gameTime }
      });
    }
    // CrazyGames friends flow: keep the same players together after a
    // round. Show the result screen briefly, then return the same socket
    // group to this room's lobby so the next round can start without going
    // back through platform matchmaking.
    setTimeout(() => this._returnGroupToLobby(), 5000);
  }

  _returnGroupToLobby() {
    if (this.players.size === 0) {
      this.shutdown();
      return;
    }

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.lobbyInterval) {
      clearInterval(this.lobbyInterval);
      this.lobbyInterval = null;
    }

    this.state = 'lobby';
    this.seed = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
    this.grid = null;
    this.mapRooms = null;
    this.doors = null;
    this.entities = [];
    this.caught = [];
    this.gameTime = 0;
    this.creatureSpawned = false;
    this.creatureSpawnTimer = 0;
    this.creatureEvo = 0;
    this.huntTimeLimit = GAME_DURATION;
    this.distractions = [];
    this.flyingRocks = [];
    this.events = [];
    this._doorsDirty = true;
    this._caughtDirty = true;
    this.lobbyCountdown = LOBBY_COUNTDOWN;

    for (const p of this.players.values()) {
      p.role = null;
      p.entity = null;
      p.input = {};
      p.actionQueue = [];
    }

    this.broadcastLobby();
    if (this.players.size >= 2) {
      this.startLobbyCountdown();
    }
  }

  shutdown() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.lobbyInterval) clearInterval(this.lobbyInterval);
    this.tickInterval = null;
    this.lobbyInterval = null;
    activeRooms.delete(this.id);
  }

  broadcastLobby() {
    const players = [...this.players.values()].map(p => ({ id: p.id, name: p.name }));
    for (const [ws] of this.players) {
      this.send(ws, {
        type: 'lobby',
        players,
        countdown: this.lobbyCountdown,
        seed: this.seed,
        roomId: this.id
      });
    }
  }

  send(ws, msg) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }
}

// ── Server Setup ──────────────────────────────────────────────
const activeRooms = new Map();

function createRoom() {
  const room = new Room();
  activeRooms.set(room.id, room);
  return room;
}

function findOrCreateRoom(preferredRoomId, forceNewRoom) {
  // CrazyGames "Play with Friends" flow: when a player clicks an invite
  // link, the client receives a roomId via the SDK and forwards it here.
  // If that specific room is still open in lobby state, drop the player
  // in. If it's gone (full / started / cleaned up), fall through to
  // normal matchmaking so the invitee still gets a game.
  if (forceNewRoom) {
    return createRoom();
  }
  if (preferredRoomId != null) {
    const numericId = Number(preferredRoomId);
    if (Number.isFinite(numericId)) {
      const target = activeRooms.get(numericId);
      if (target && target.state === 'lobby' && target.players.size < MAX_PLAYERS) {
        return target;
      }
    }
  }
  for (const [, room] of activeRooms) {
    if (room.state === 'lobby' && room.players.size < MAX_PLAYERS) {
      return room;
    }
  }
  return createRoom();
}

const SERVER_VERSION = 'v9-2026-05-20';

// HTTP server for health checks + WebSocket upgrade + debug endpoint
const server = http.createServer((req, res) => {
  // CORS headers for wake-up ping from game clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: SERVER_VERSION,
                            rooms: activeRooms.size, uptime: process.uptime() }));
  } else if (req.url === '/debug/actions') {
    // v7: returns the last 50 actions across all active rooms — Tim can
    // `curl https://running-away.onrender.com/debug/actions` after a
    // failing E-press to see exactly why the server didn't act.
    const all = [];
    for (const [rid, r] of activeRooms) {
      for (const a of r._actionLog) all.push({ room: rid, ...a });
    }
    all.sort((a, b) => b.t - a.t);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: SERVER_VERSION, actions: all.slice(0, 50) }, null, 2));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Creature Hunt server ' + SERVER_VERSION);
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let room = null;
  let playerId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      room = findOrCreateRoom(msg.roomId, !!msg.instantMultiplayer);
      playerId = room.addPlayer(ws, msg.name || 'Player');
    } else if (msg.type === 'input' && room) {
      const pData = room.players.get(ws);
      if (pData) {
        pData.input = msg.keys || {};
        if (msg.action) {
          if (!pData.actionQueue) pData.actionQueue = [];
          const lastQueued = pData.actionQueue[pData.actionQueue.length - 1];
          if (pData.actionQueue.length < 3 && lastQueued !== msg.action) {
            pData.actionQueue.push(msg.action);
          }
        }
      }
    } else if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t: msg.t, serverTime: Date.now() }));
    }
  });

  ws.on('close', () => {
    if (room) room.removePlayer(ws);
  });

  ws.on('error', () => {
    if (room) room.removePlayer(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Creature Hunt server listening on port ${PORT}`);
});
