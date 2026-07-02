// Procedural environment query layer: deterministic per-cell decals + breakable rocks, with a small
// open-addressed hash storing per-rock HP/broken state (obKeys..) and a set of "crushed" decals (decKeys).
// decalAtCell/obstacleAtCell return TRUE + populate the EXPORTED scratch objects obS (rock) / decS (decal)
// for the caller to read (render/world + systems/collision). resetEnvironmentState clears both tables.
import { state } from '../state.js?v=bm9';
import { OLD_ENV, BREAK_ENV } from '../flags.js?v=bm9';
import { ROCK_DENSITY, DECAL_DENSITY } from '../config.js?v=bm9';

var OB_EMPTY = -2147483648;
var OB_STATE_CAP = 1024;
var OB_MASK = OB_STATE_CAP - 1;
var obKeys = new Int32Array(OB_STATE_CAP);
export var obHp = new Float32Array(OB_STATE_CAP);
export var obHitT = new Float32Array(OB_STATE_CAP);
export var obBroken = new Uint8Array(OB_STATE_CAP);
var obCx = new Int16Array(OB_STATE_CAP);
var obCy = new Int16Array(OB_STATE_CAP);
var obCursor = 0;
for (var oi0 = 0; oi0 < OB_STATE_CAP; oi0++) { obKeys[oi0] = OB_EMPTY; obHitT[oi0] = -99; }

var DEC_STATE_CAP = 1024;
var DEC_MASK = DEC_STATE_CAP - 1;
var decKeys = new Int32Array(DEC_STATE_CAP);
var decCursor = 0;
for (var di0 = 0; di0 < DEC_STATE_CAP; di0++) decKeys[di0] = OB_EMPTY;

// scratch objects populated by obstacleAtCell/decalAtCell, read by callers (render/world, collision).
export var obS = { x: 0, y: 0, r: 0, maxHp: 0, hp: 0, hit: -99, key: 0, cx: 0, cy: 0, v: 0, size: 0, slot: -1 };
export var decS = { x: 0, y: 0, kind: 0, rot: 0, size: 0, key: 0 };

  export function hashCell(cx, cy) {
    var h = (Math.imul(cx, 341873128) + Math.imul(cy, 132897987)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1597334677);
    return (h ^ (h >>> 16)) >>> 0;
  }

  export function hashObstacle(cx, cy) {
    var h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  export function cellKey(cx, cy) {
    var k = (((cx & 65535) << 16) ^ (cy & 65535)) | 0;
    return k === OB_EMPTY ? OB_EMPTY + 1 : k;
  }

  export function stateIndexFor(key, create, cx, cy, hp) {
    var idx = (Math.imul(key, -1640531527) >>> 0) & OB_MASK;
    for (var p = 0; p < OB_STATE_CAP; p++) {
      var k = obKeys[idx];
      if (k === key) return idx;
      if (k === OB_EMPTY) {
        if (!create) return -1;
        obKeys[idx] = key;
        obHp[idx] = hp;
        obHitT[idx] = -99;
        obBroken[idx] = 0;
        obCx[idx] = cx;
        obCy[idx] = cy;
        return idx;
      }
      idx = (idx + 1) & OB_MASK;
    }
    if (!create) return -1;
    idx = obCursor;
    obCursor = (obCursor + 1) & OB_MASK;
    obKeys[idx] = key;
    obHp[idx] = hp;
    obHitT[idx] = -99;
    obBroken[idx] = 0;
    obCx[idx] = cx;
    obCy[idx] = cy;
    return idx;
  }

  export function decStateIndexFor(key, create) {
    var idx = (Math.imul(key, -1640531527) >>> 0) & DEC_MASK;
    for (var p = 0; p < DEC_STATE_CAP; p++) {
      var k = decKeys[idx];
      if (k === key) return idx;
      if (k === OB_EMPTY) {
        if (!create) return -1;
        decKeys[idx] = key;
        return idx;
      }
      idx = (idx + 1) & DEC_MASK;
    }
    if (!create) return -1;
    idx = decCursor;
    decCursor = (decCursor + 1) & DEC_MASK;
    decKeys[idx] = key;
    return idx;
  }

  export function resetEnvironmentState() {
    for (var i = 0; i < OB_STATE_CAP; i++) {
      obKeys[i] = OB_EMPTY;
      obBroken[i] = 0;
      obHitT[i] = -99;
    }
    for (var d = 0; d < DEC_STATE_CAP; d++) decKeys[d] = OB_EMPTY;
    obCursor = 0;
    decCursor = 0;
  }

  export function decalAtCell(cx, cy) {
    if (!OLD_ENV || DECAL_DENSITY <= 0) return false;
    var h = hashCell(cx, cy);
    if ((h % 100) >= DECAL_DENSITY) return false;
    var key = cellKey(cx, cy);
    if (decStateIndexFor(key, false) >= 0) return false;
    var cell = 132;
    var wx = cx * cell + 12 + ((h >>> 5) % (cell - 24));
    var wy = cy * cell + 12 + ((h >>> 13) % (cell - 24));
    if (wx * wx + wy * wy < 80 * 80) return false;
    var wv = h % 20;
    decS.kind = wv < 5 ? 0 : wv < 9 ? 1 : wv < 12 ? 2 : wv < 14 ? 3 : wv < 16 ? 4 : wv < 18 ? 5 : wv < 19 ? 6 : 7;
    decS.x = wx;
    decS.y = wy;
    decS.rot = (h >>> 3) & 3;
    decS.size = 40 + ((h >>> 9) % 7) * 4;
    decS.key = key;
    return true;
  }

  export function obstacleAtCell(cx, cy) {
    if (!BREAK_ENV || ROCK_DENSITY <= 0) return false;
    var h = hashObstacle(cx, cy);
    if ((h % 100) >= ROCK_DENSITY) return false;
    var key = cellKey(cx, cy);
    var slot = stateIndexFor(key, false, cx, cy, 0);
    if (slot >= 0 && obBroken[slot]) return false;
    var cell = 250;
    var wx = cx * cell + 22 + ((h >>> 6) % (cell - 44));
    var wy = cy * cell + 22 + ((h >>> 14) % (cell - 44));
    if (wx * wx + wy * wy < 210 * 210) return false;
    var sizeBits = (h >>> 3) % 24;
    var maxHp = 26 + sizeBits * 2;
    obS.x = wx;
    obS.y = wy;
    obS.r = 32 + sizeBits;
    obS.maxHp = maxHp;
    obS.hp = slot >= 0 ? obHp[slot] : maxHp;
    obS.hit = slot >= 0 ? obHitT[slot] : -99;
    obS.key = key;
    obS.cx = cx;
    obS.cy = cy;
    obS.v = h & 3;
    obS.size = sizeBits;
    obS.slot = slot;
    return true;
  }
