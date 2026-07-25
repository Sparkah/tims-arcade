import * as THREE from './vendor/three.module.js';

const canvas = document.getElementById('hole-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x1a0f08, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0f08);

const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 120);
camera.up.set(0, 0, 1);
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

scene.add(new THREE.AmbientLight(0x7c5131, 1.15));
scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x2b1608, 1.55));
const sun = new THREE.DirectionalLight(0xffe2a8, 2.8);
sun.position.set(-4, 8, 5);
scene.add(sun);
const fill = new THREE.PointLight(0xffa14a, 2.4, 15);
fill.position.set(2, 2, 2);
scene.add(fill);

const GRID = 11;
const HALF = Math.floor(GRID / 2);
const CELL = 1.18;
const FIRST_LEVEL_DIGS = 20;
const SCOOP = 0.35;
const MAX_DEPTH = SCOOP * FIRST_LEVEL_DIGS;
const MAX_CLIMB = 1.05;
const TOP_DOWN_HEIGHT = 6.1;
const MIN_TOP_DOWN_HEIGHT = 2.65;
const CAMERA_ZOOM_PER_DEEP_DIG = (TOP_DOWN_HEIGHT - MIN_TOP_DOWN_HEIGHT) / FIRST_LEVEL_DIGS;
const HERO_TO_CEILING = 1.05;
const TERRAIN_SEGMENTS = 92;
const TERRAIN_SIZE = GRID * CELL;
const DIG_INFLUENCE = CELL * 0.92;
const SAME_HOLE_RADIUS = CELL * 0.105;
const SOIL_STRATA_BANDS = 7;
const depths = Array.from({ length: GRID }, () => Array(GRID).fill(0));
const digSpots = [];

const state = {
  player: { x: HALF, z: HALF },
  volume: 0,
  digs: 0,
  deepestRecordStep: 0,
  cameraAdvanceEvents: 0,
  lastDepthRecord: null,
  lastDigT: 0,
  goal: false,
};

function paintBuriedSoilStrata(ctx, size) {
  const bandH = size / SOIL_STRATA_BANDS;
  for (let band = 0; band < SOIL_STRATA_BANDS; band++) {
    const depthT = 1 - band / Math.max(1, SOIL_STRATA_BANDS - 1);
    const r = 30 + depthT * 74;
    const g = 20 + depthT * 54;
    const b = 13 + depthT * 32;
    const y0 = band * bandH;
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(0, y0, size, bandH + 1);
    const stamps = Math.max(140, Math.round(bandH * 2.5));
    for (let i = 0; i < stamps; i++) {
      const v = (Math.random() - 0.5) * 34;
      ctx.fillStyle = `rgba(${(r + v) | 0},${(g + v * 0.8) | 0},${(b + v * 0.6) | 0},0.52)`;
      const s = 1 + Math.random() * 3;
      ctx.fillRect(Math.random() * size, y0 + Math.random() * bandH, s, s);
    }
    if (band <= Math.floor(SOIL_STRATA_BANDS * 0.25)) {
      ctx.strokeStyle = 'rgba(58,40,20,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        let rx = Math.random() * size;
        let ry = y0 + Math.random() * bandH;
        ctx.moveTo(rx, ry);
        for (let k = 0; k < 4; k++) {
          rx += (Math.random() - 0.5) * 36;
          ry += (Math.random() - 0.5) * 22;
          ctx.lineTo(rx, ry);
        }
        ctx.stroke();
      }
    } else if (band >= Math.floor(SOIL_STRATA_BANDS * 0.62)) {
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = `rgba(${30 + Math.random() * 26 | 0},${28 + Math.random() * 22 | 0},${26 + Math.random() * 18 | 0},0.85)`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * size, y0 + Math.random() * bandH, 3 + Math.random() * 8, 2 + Math.random() * 5, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (band > 0) {
      ctx.fillStyle = 'rgba(6,3,1,0.82)';
      ctx.fillRect(0, y0 - 2, size, 5);
    }
  }
}

function makeSoilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  paintBuriedSoilStrata(c.getContext('2d'), 512);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = THREE.RepeatWrapping;
  tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(2.3, 2.3);
  return tx;
}

const terrainMat = new THREE.MeshStandardMaterial({
  map: makeSoilTexture(),
  vertexColors: true,
  roughness: 0.98,
  metalness: 0,
  side: THREE.DoubleSide,
  flatShading: false,
  emissive: 0x120a04,
  emissiveIntensity: 0.22,
});
let terrainMesh = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);

const edgeMat = new THREE.LineBasicMaterial({ color: 0x19100a, transparent: true, opacity: 0.5 });
let edgeLines = new THREE.LineSegments(new THREE.BufferGeometry(), edgeMat);
scene.add(edgeLines);
edgeLines.visible = false;

const moundGroup = new THREE.Group();
scene.add(moundGroup);
const moundGeo = new THREE.DodecahedronGeometry(0.09, 0);
const moundMat = new THREE.MeshStandardMaterial({ color: 0x6c3f1d, roughness: 1 });

const player = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0b85d, roughness: 0.6 });
const shirtMat = new THREE.MeshStandardMaterial({ color: 0x27415d, roughness: 0.75 });
const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), bodyMat);
head.position.y = 0.74;
const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffdf7a, emissive: 0xff9b1f, emissiveIntensity: 1.4, roughness: 0.35 }));
helmet.position.set(0, 0.86, 0.035);
const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.42, 14), shirtMat);
torso.position.y = 0.45;
const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.34, 10), new THREE.MeshStandardMaterial({ color: 0x201714, roughness: 0.9 }));
legs.position.y = 0.18;
const shovel = new THREE.Group();
const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0x6b4222, roughness: 0.7 }));
handle.rotation.z = -0.55;
handle.position.set(0.22, 0.42, 0);
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.035), new THREE.MeshStandardMaterial({ color: 0xaeb6bd, roughness: 0.45, metalness: 0.45 }));
blade.rotation.z = -0.55;
blade.position.set(0.38, 0.18, 0);
shovel.add(handle, blade);
player.add(legs, torso, head, helmet, shovel);
const helmetLamp = new THREE.PointLight(0xffd36b, 4.8, 6.5);
helmetLamp.position.set(0, 0.95, 0.05);
player.add(helmetLamp);
player.scale.setScalar(1.25);
scene.add(player);

const dust = [];
const dustGeo = new THREE.SphereGeometry(0.035, 7, 5);
const dustMat = new THREE.MeshBasicMaterial({ color: 0xd59a55, transparent: true, opacity: 0.8 });

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function inside(x, z) { return x >= 0 && x < GRID && z >= 0 && z < GRID; }
function depthAt(x, z) { return inside(x, z) ? depths[z][x] : 0; }
function worldX(x) { return (x - HALF) * CELL; }
function worldZ(z) { return (z - HALF) * CELL; }
function currentDepth() { return depthAt(state.player.x, state.player.z); }
function depthStepFor(depth) {
  return clamp(Math.round(depth / SCOOP), 0, FIRST_LEVEL_DIGS);
}

function soilColor(depth, wall = false) {
  const t = clamp(depth / MAX_DEPTH, 0, 1);
  const bandFloat = t * SOIL_STRATA_BANDS;
  const band = clamp(Math.floor(bandFloat), 0, SOIL_STRATA_BANDS - 1);
  const layerT = band / Math.max(1, SOIL_STRATA_BANDS - 1);
  const seam = Math.abs(bandFloat - Math.round(bandFloat)) < 0.045 ? 0.52 : 1;
  const r = 0.72 + layerT * 0.2;
  const g = 0.64 + layerT * 0.17;
  const b = 0.54 + layerT * 0.12;
  const wallShade = wall ? 0.9 : 1;
  return new THREE.Color(r * seam * wallShade, g * seam * wallShade, b * seam * wallShade);
}
function topColor(depth) {
  if (depth < 0.04) return new THREE.Color(0x2a1b0f);
  return soilColor(depth + 0.2, false);
}

function smoothstep01(v) {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
}
function sampleDugDepth(wx, wz) {
  let h = 0;
  for (const spot of digSpots) {
    const dx = wx - spot.x;
    const dz = wz - spot.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= DIG_INFLUENCE) continue;
    const falloff = smoothstep01(1 - dist / DIG_INFLUENCE);
    h = Math.max(h, spot.depth * falloff);
  }
  return h;
}
function terrainVertexColor(depth, wx, wz) {
  const c = soilColor(depth, depth > 0.05);
  const grain = 0.9 + 0.1 * Math.sin(wx * 9.7 + wz * 4.1) + 0.06 * Math.sin(wx * 23.1 - wz * 15.3);
  c.multiplyScalar(clamp(grain, 0.72, 1.12));
  return c;
}

function pushVertex(vertices, colors, x, y, z, color) {
  vertices.push(x, y, z);
  colors.push(color.r, color.g, color.b);
}
function addTri(vertices, colors, a, b, c, color) {
  pushVertex(vertices, colors, a[0], a[1], a[2], color);
  pushVertex(vertices, colors, b[0], b[1], b[2], color);
  pushVertex(vertices, colors, c[0], c[1], c[2], color);
}
function addQuad(vertices, colors, a, b, c, d, color) {
  addTri(vertices, colors, a, b, c, color);
  addTri(vertices, colors, a, c, d, color);
}
function addWall(vertices, colors, aTop, bTop, aBot, bBot, fromDepth, toDepth) {
  const steps = Math.max(1, Math.ceil((toDepth - fromDepth) / SCOOP));
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const y0 = aTop[1] + (aBot[1] - aTop[1]) * t0;
    const y1 = aTop[1] + (aBot[1] - aTop[1]) * t1;
    const c = soilColor(fromDepth + (toDepth - fromDepth) * (t0 + t1) * 0.5, true);
    addQuad(vertices, colors, [aTop[0], y0, aTop[2]], [bTop[0], y0, bTop[2]], [bBot[0], y1, bBot[2]], [aBot[0], y1, aBot[2]], c);
  }
}

function rebuildTerrain() {
  const vertices = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const halfSize = TERRAIN_SIZE / 2;
  for (let iz = 0; iz <= TERRAIN_SEGMENTS; iz++) {
    const vz = iz / TERRAIN_SEGMENTS;
    const wz = -halfSize + vz * TERRAIN_SIZE;
    for (let ix = 0; ix <= TERRAIN_SEGMENTS; ix++) {
      const vx = ix / TERRAIN_SEGMENTS;
      const wx = -halfSize + vx * TERRAIN_SIZE;
      const y = sampleDugDepth(wx, wz);
      const c = terrainVertexColor(y, wx, wz);
      vertices.push(wx, y, wz);
      colors.push(c.r, c.g, c.b);
      uvs.push(vx * 2.3, vz * 2.3);
    }
  }
  const row = TERRAIN_SEGMENTS + 1;
  for (let iz = 0; iz < TERRAIN_SEGMENTS; iz++) {
    for (let ix = 0; ix < TERRAIN_SEGMENTS; ix++) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  terrainMesh.geometry.dispose();
  terrainMesh.geometry = geo;

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  edgeLines.geometry.dispose();
  edgeLines.geometry = lineGeo;
}

function addMound(p = playerWorld()) {
  const angle = Math.random() * Math.PI * 2;
  const r = 2.0 + Math.random() * 2.8;
  const m = new THREE.Mesh(moundGeo, moundMat);
  m.position.set(p.x + Math.cos(angle) * r, p.y - 0.35 + Math.random() * 0.08, p.z + Math.sin(angle) * r);
  const s = 0.7 + Math.random() * 1.8;
  m.scale.set(s * 1.3, s * 0.55, s);
  m.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
  moundGroup.add(m);
  if (moundGroup.children.length > 180) {
    const old = moundGroup.children[0];
    moundGroup.remove(old);
  }
}

function spawnDust(p = playerWorld()) {
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(dustGeo, dustMat.clone());
    m.position.set(p.x + (Math.random() - 0.5) * 0.5, p.y + HERO_TO_CEILING * 0.92, p.z + (Math.random() - 0.5) * 0.5);
    m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.7, -0.8 - Math.random() * 1.2, (Math.random() - 0.5) * 1.7);
    m.userData.life = 0.5 + Math.random() * 0.45;
    dust.push(m);
    scene.add(m);
  }
}

function playerWorld() {
  return worldForCell(state.player.x, state.player.z);
}
function worldForCell(x, z) {
  const cellDepth = depthAt(x, z);
  return { x: worldX(x), y: cellDepth - HERO_TO_CEILING, z: worldZ(z), depth: cellDepth };
}
function worldForSpot(spot) {
  return { x: spot.x, y: spot.depth - HERO_TO_CEILING, z: spot.z, depth: spot.depth };
}
function updatePlayerPose() {
  const p = playerWorld();
  player.position.set(p.x, p.y, p.z);
  player.rotation.y += ((state.lastMoveYaw ?? player.rotation.y) - player.rotation.y) * 0.2;
}
function move(dx, dz) {
  const nx = state.player.x + dx;
  const nz = state.player.z + dz;
  if (!inside(nx, nz)) return false;
  const here = currentDepth();
  const there = depthAt(nx, nz);
  if (there - here > MAX_CLIMB) return false;
  state.player.x = nx;
  state.player.z = nz;
  if (dx || dz) state.lastMoveYaw = Math.atan2(dx, dz);
  updatePlayerPose();
  updateHud();
  return true;
}
function cellFromWorld(wx, wz) {
  return {
    x: clamp(Math.round(wx / CELL + HALF), 0, GRID - 1),
    z: clamp(Math.round(wz / CELL + HALF), 0, GRID - 1),
  };
}
function digAtCell(x, z) {
  return digAtWorld(worldX(x), worldZ(z));
}
function digAtOffset(x, z) {
  return digAtCell(clamp(HALF + x, 0, GRID - 1), clamp(HALF + z, 0, GRID - 1));
}
function findDigSpot(wx, wz) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const spot of digSpots) {
    const dist = Math.hypot(wx - spot.x, wz - spot.z);
    if (dist < nearestDist) {
      nearest = spot;
      nearestDist = dist;
    }
  }
  return nearest && nearestDist <= SAME_HOLE_RADIUS ? nearest : null;
}
function syncCellDepthForSpot(spot) {
  const cell = cellFromWorld(spot.x, spot.z);
  depths[cell.z][cell.x] = Math.max(depths[cell.z][cell.x], spot.depth);
}
function screenForWorld(wx, wz) {
  const depth = sampleDugDepth(wx, wz);
  const v = new THREE.Vector3(wx, depth, wz).project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + ((v.x + 1) * 0.5) * rect.width,
    y: rect.top + ((1 - v.y) * 0.5) * rect.height,
  };
}
function digAtWorld(wx, wz) {
  const clampedX = clamp(wx, -TERRAIN_SIZE / 2, TERRAIN_SIZE / 2);
  const clampedZ = clamp(wz, -TERRAIN_SIZE / 2, TERRAIN_SIZE / 2);
  let spot = findDigSpot(clampedX, clampedZ);
  if (!spot) {
    spot = { x: clampedX, z: clampedZ, depth: 0, taps: 0 };
    digSpots.push(spot);
  }
  const before = spot.depth;
  if (before >= MAX_DEPTH - 0.001) return false;
  const after = Math.min(MAX_DEPTH, before + SCOOP);
  spot.depth = after;
  spot.taps += 1;
  syncCellDepthForSpot(spot);
  const afterStep = depthStepFor(after);
  if (afterStep > state.deepestRecordStep) {
    const gained = afterStep - state.deepestRecordStep;
    state.deepestRecordStep = afterStep;
    state.cameraAdvanceEvents += gained;
    state.lastDepthRecord = {
      x: +(spot.x / CELL).toFixed(2),
      z: +(spot.z / CELL).toFixed(2),
      step: afterStep,
    };
  }
  state.volume += after - before;
  state.digs += 1;
  state.lastDigT = performance.now();
  state.goal = maxDugDepth() >= 4 && dugBounds().width >= 3 && dugBounds().height >= 3;
  addMound(worldForSpot(spot));
  spawnDust(worldForSpot(spot));
  rebuildTerrain();
  updatePlayerPose();
  updateHud();
  return true;
}
function digFromPointer(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(terrainMesh, false)[0];
  if (!hit) return dig();
  return digAtWorld(hit.point.x, hit.point.z);
}
function dig() {
  return digCell(state.player.x, state.player.z);
}
function digCell(x, z) {
  return digAtCell(x, z);
}
function reset() {
  for (let z = 0; z < GRID; z++) depths[z].fill(0);
  digSpots.length = 0;
  state.player.x = HALF;
  state.player.z = HALF;
  state.volume = 0;
  state.digs = 0;
  state.deepestRecordStep = 0;
  state.cameraAdvanceEvents = 0;
  state.lastDepthRecord = null;
  state.goal = false;
  while (moundGroup.children.length) {
    const m = moundGroup.children[0];
    moundGroup.remove(m);
  }
  rebuildTerrain();
  updatePlayerPose();
  updateHud();
}

function maxDugDepth() {
  let max = 0;
  for (const spot of digSpots) max = Math.max(max, spot.depth);
  return max;
}
function furthestDigStep() {
  return state.deepestRecordStep;
}
function cameraZoomDistance() {
  return clamp(TOP_DOWN_HEIGHT - furthestDigStep() * CAMERA_ZOOM_PER_DEEP_DIG, MIN_TOP_DOWN_HEIGHT, TOP_DOWN_HEIGHT);
}
function cameraTrackY() {
  return state.deepestRecordStep * SCOOP - HERO_TO_CEILING;
}
function dugBounds() {
  let minX = GRID, maxX = -1, minZ = GRID, maxZ = -1, count = 0;
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    if (depths[z][x] > 0.05) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); count++;
    }
  }
  return { width: count ? maxX - minX + 1 : 0, height: count ? maxZ - minZ + 1 : 0, count };
}
function updateHud() {
  const b = dugBounds();
  document.getElementById('depth-read').textContent = `${currentDepth().toFixed(1)}m`;
  document.getElementById('width-read').textContent = `${Math.max(1, b.width)} x ${Math.max(1, b.height)}`;
  document.getElementById('dirt-read').textContent = String(Math.round(state.volume * 10));
}

function updateDust(dt) {
  for (let i = dust.length - 1; i >= 0; i--) {
    const m = dust[i];
    const v = m.userData.v;
    m.userData.life -= dt;
    v.y -= dt * 2.7;
    m.position.addScaledVector(v, dt);
    m.material.opacity = Math.max(0, m.userData.life);
    if (m.userData.life <= 0) {
      scene.remove(m);
      m.material.dispose();
      dust.splice(i, 1);
    }
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space') dig();
  else if (e.code === 'KeyR') reset();
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') move(0, -1);
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') move(0, 1);
  else if (e.code === 'ArrowLeft' || e.code === 'KeyA') move(-1, 0);
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') move(1, 0);
});

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  digFromPointer(e);
}, { passive: false });
document.getElementById('dig-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  dig();
}, { passive: false });
for (const btn of document.querySelectorAll('[data-move]')) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const [dx, dz] = btn.dataset.move.split(',').map(Number);
    move(dx, dz);
  }, { passive: false });
}

let last = performance.now();
function tick(now = performance.now()) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateDust(dt);
  updatePlayerPose();

  const p = playerWorld();
  const bob = Math.sin(now * 0.006) * 0.025;
  const cameraDistance = cameraZoomDistance();
  const cameraY = cameraTrackY();
  camTarget.set(p.x, cameraY + HERO_TO_CEILING * 0.75 + bob, p.z);
  camPos.set(p.x, cameraY - cameraDistance, p.z);
  camera.position.copy(camPos);
  camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
  fill.position.set(p.x + 1.6, p.y - 1.2, p.z + 1.6);

  const digKick = Math.max(0, 1 - (now - state.lastDigT) / 220);
  shovel.rotation.z = -digKick * 0.55;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

window.render_game_to_text = () => {
  const b = dugBounds();
  return JSON.stringify({
    prototype: 'hole-digger-3d',
    coordinateSystem: 'grid x/z, y is vertical, camera is below; taps carve a continuous Buried Again soil ceiling upward',
    terrain: 'continuous sampled soil mesh with persistent strata, no visible square block tops',
    visibleStrataBands: SOIL_STRATA_BANDS,
    playerCell: { x: state.player.x - HALF, z: state.player.z - HALF },
    playerWorld: {
      x: +playerWorld().x.toFixed(2),
      y: +playerWorld().y.toFixed(2),
      z: +playerWorld().z.toFixed(2),
    },
    currentDepth: +currentDepth().toFixed(2),
    maxDepth: +maxDugDepth().toFixed(2),
    maxDepthStep: depthStepFor(maxDugDepth()),
    firstLevelDigs: FIRST_LEVEL_DIGS,
    furthestDigStep: furthestDigStep(),
    cameraAdvanceEvents: state.cameraAdvanceEvents,
    lastDepthRecord: state.lastDepthRecord,
    digSpots: digSpots.length,
    deepestSpotTaps: digSpots.reduce((m, spot) => Math.max(m, spot.taps), 0),
    dugCells: b.count,
    holeWidth: b.width,
    holeHeight: b.height,
    camera: {
      x: +camera.position.x.toFixed(2),
      y: +camera.position.y.toFixed(2),
      z: +camera.position.z.toFixed(2),
      belowHero: +(playerWorld().y - camera.position.y).toFixed(2),
      targetBelowHero: +cameraZoomDistance().toFixed(2),
      depthTrackY: +cameraTrackY().toFixed(2),
      movementMode: 'snap-only-on-depth-record',
    },
    volumeRemoved: +state.volume.toFixed(2),
    digs: state.digs,
    goal: state.goal,
  });
};
window.__holeDig = { state, depths, digSpots, dig, digAtCell, digAtOffset, digAtWorld, screenForWorld, move, reset, rebuildTerrain };
window.advanceTime = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

resize();
rebuildTerrain();
updatePlayerPose();
updateHud();
requestAnimationFrame(tick);
