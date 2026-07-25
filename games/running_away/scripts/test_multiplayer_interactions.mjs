import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
let source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

source = source.replace(
  /server\.listen\(PORT, \(\) => \{\n\s*console\.log\(`Creature Hunt server listening on port \$\{PORT\}`\);\n\}\);\s*$/,
  'globalThis.__serverExports = { Room, TILE, MAP_ROWS, MAP_COLS, PLAYER_R, CREATURE_R, findOrCreateRoom, activeRooms };'
);

const context = vm.createContext({
  console,
  require,
  process,
  setInterval,
  clearInterval,
  setTimeout,
  Math,
  Date,
  JSON,
  Uint8Array,
  Int32Array,
});
vm.runInContext(source, context, { filename: 'server.js' });

const { Room, TILE, MAP_ROWS, MAP_COLS, PLAYER_R, CREATURE_R, findOrCreateRoom, activeRooms } = context.__serverExports;

function blankGrid() {
  return Array.from({ length: MAP_ROWS }, () => Array.from({ length: MAP_COLS }, () => '.'));
}

function makeRoom() {
  const room = new Room();
  room.state = 'playing';
  room.grid = blankGrid();
  room.rooms = [];
  room.doors = [];
  room.creatureSpawned = true;
  room.creatureSpawnTimer = 99999;
  room.players = new Map();
  return room;
}

function wsStub() {
  return { readyState: 0, send() {} };
}

function addPlayer(room, overrides = {}) {
  const entity = {
    id: overrides.id || 'p1',
    type: overrides.type || 'human',
    name: overrides.name || 'Tester',
    color: '#fff',
    x: overrides.x ?? TILE * 5 + TILE / 2,
    y: overrides.y ?? TILE * 5 + TILE / 2,
    radius: overrides.radius || PLAYER_R,
    speed: 1,
    alive: true,
    hiding: !!overrides.hiding,
    sprinting: false,
    facingAngle: 0,
    sprintStamina: 180,
  };
  const pData = {
    id: entity.id,
    name: entity.name,
    role: overrides.role || 'human',
    entity,
    input: overrides.input || {},
    actionQueue: overrides.actionQueue || [],
  };
  room.entities.push(entity);
  room.players.set(wsStub(), pData);
  return { entity, pData };
}

{
  const room = makeRoom();
  const { entity, pData } = addPlayer(room, { hiding: true, actionQueue: ['hide_exit'] });
  room.tick();
  assert.equal(entity.hiding, false, 'hidden survivor exits on queued E action');
  assert.equal(pData.actionQueue.length, 0, 'hide_exit action drained');
}

{
  const room = makeRoom();
  room.grid[5][5] = 'B';
  const { pData } = addPlayer(room, {
    type: 'creature',
    role: 'creature',
    radius: CREATURE_R,
    x: TILE * 5 + TILE / 2,
    y: TILE * 5 + TILE / 2,
    actionQueue: ['creature_break'],
  });
  room.tick();
  assert.equal(room.grid[5][5], '.', 'creature breaks nearby barrel with one queued action');
  assert.equal(pData.actionQueue.length, 0, 'creature_break action drained');
}

{
  const room = makeRoom();
  room.grid[5][5] = 'X';
  room.doors.push({ col: 5, row: 5, closed: true, orientation: 'h' });
  addPlayer(room, {
    type: 'creature',
    role: 'creature',
    radius: CREATURE_R,
    x: TILE * 5 + TILE / 2,
    y: TILE * 5 + TILE / 2,
    actionQueue: ['creature_break'],
  });
  room.tick();
  assert.equal(room.grid[5][5], '.', 'creature breaks nearby door with one queued action');
  assert.equal(room.doors.length, 0, 'broken door removed from server door list');
}

{
  const room = makeRoom();
  room.grid[5][5] = 'D';
  room.doors.push({ col: 5, row: 5, closed: false, orientation: 'h' });
  const { entity } = addPlayer(room, {
    x: TILE * 5 + TILE / 2,
    y: TILE * 5 + TILE / 2,
    actionQueue: ['door'],
  });
  room.tick();
  assert.equal(room.grid[5][5], 'X', 'human closes nearby door with one queued action');
  assert.notDeepEqual(
    [Math.floor(entity.x / TILE), Math.floor(entity.y / TILE)],
    [5, 5],
    'player pushed out of closed door tile'
  );
}

{
  activeRooms.clear();
  const first = findOrCreateRoom(null, true);
  const second = findOrCreateRoom(null, true);
  assert.notEqual(first.id, second.id, 'instant multiplayer party leaders get fresh private rooms');
}

{
  const room = makeRoom();
  addPlayer(room, { id: 'p1', role: 'human' });
  addPlayer(room, { id: 'p2', role: 'creature', type: 'creature', radius: CREATURE_R });
  room._returnGroupToLobby();
  assert.equal(room.state, 'lobby', 'finished multiplayer group returns to lobby');
  assert.equal(room.players.size, 2, 'players remain in the same room after round end');
  for (const p of room.players.values()) {
    assert.equal(p.role, null, 'roles reset before next round');
    assert.equal(p.entity, null, 'entities reset before next round');
  }
  if (room.lobbyInterval) clearInterval(room.lobbyInterval);
}

console.log('multiplayer interaction regression tests passed');
