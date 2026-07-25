import * as THREE from './vendor/three.module.js';

const canvas = document.getElementById('lab-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x070807, 1);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 2200);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const orbitTarget = new THREE.Vector3(0, -0.55, 0);

scene.add(new THREE.AmbientLight(0x805f42, 1.6));
const hemi = new THREE.HemisphereLight(0xd8ecff, 0x1a0d05, 1.6);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffddb0, 3.2);
key.position.set(-4.5, 6.5, 4);
scene.add(key);
const fill = new THREE.PointLight(0xffa85f, 5.5, 11);
fill.position.set(2.5, 2.4, 2.5);
scene.add(fill);

const dom = {
  taps: document.getElementById('metric-taps'),
  center: document.getElementById('metric-center'),
  max: document.getElementById('metric-max'),
  volume: document.getElementById('metric-volume'),
  estimate: document.getElementById('metric-estimate'),
  last: document.getElementById('read-last'),
  sim: document.getElementById('read-sim'),
  camera: document.getElementById('read-camera'),
  width: document.getElementById('read-width'),
  json: document.getElementById('preset-json'),
  tapCenter: document.getElementById('tap-center'),
  tapTen: document.getElementById('tap-ten'),
  presetFeel: document.getElementById('preset-feel'),
  presetMain: document.getElementById('preset-main'),
  cameraMode: document.getElementById('camera-mode'),
  reset: document.getElementById('reset-scene'),
  copy: document.getElementById('copy-preset'),
};

const inputIds = ['power', 'bite', 'radius', 'spread', 'gouges', 'thickness', 'camera-climb', 'target-taps'];
const inputs = Object.fromEntries(inputIds.map((id) => [id, document.getElementById(id)]));
const outputs = Object.fromEntries(inputIds.map((id) => [id, document.getElementById(`${id}-out`)]));

const SEGMENTS = 104;
const SIZE = 6.2;
const HALF = SIZE / 2;
const VERTS = (SEGMENTS + 1) * (SEGMENTS + 1);
const CELL = SIZE / SEGMENTS;
const CELL_AREA = CELL * CELL;
const SOIL_BANDS = 8;
const OPEN_DEPTH = 0.985;
const BASE_METERS_PER_DIG = 0.12;
const MAX_THICKNESS_METERS = 800;
const ESTIMATE_SAMPLE_TAPS = 120;

const xs = new Float32Array(VERTS);
const zs = new Float32Array(VERTS);
const depths = new Float32Array(VERTS);
const positions = new Float32Array(VERTS * 3);
const colors = new Float32Array(VERTS * 3);
const uvs = new Float32Array(VERTS * 2);
const indices = [];

const state = {
  taps: 0,
  totalVolume: 0,
  lastGain: 0,
  lastPoint: { x: 0, z: 0 },
  copiedAt: 0,
  orbit: { yaw: -0.72, pitch: 0.66, dist: 8.8 },
  cameraMode: 'orbit',
  drag: null,
  keys: new Set(),
  ball: {
    x: 0,
    y: 0.16,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    radius: 0.16,
    grounded: true,
  },
  lastFrame: performance.now(),
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep01(v) {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
}

function metersForTarget(target) {
  return clamp(Math.round(target * BASE_METERS_PER_DIG * 10) / 10, 0.5, MAX_THICKNESS_METERS);
}

function settings() {
  const targetTaps = Math.round(clamp(Number(inputs['target-taps'].value) || 10, 2, 5000));
  return {
    power: Number(inputs.power.value),
    bite: Number(inputs.bite.value),
    radius: Number(inputs.radius.value),
    spread: Number(inputs.spread.value),
    gouges: Number(inputs.gouges.value),
    thickness: clamp(Number(inputs.thickness.value) || metersForTarget(targetTaps), 0.5, MAX_THICKNESS_METERS),
    cameraClimb: Number(inputs['camera-climb'].value),
    targetTaps,
  };
}

function fmtPct(v) {
  return `${Math.round(clamp(v, 0, 1) * 100)}%`;
}

function pct1(v) {
  return `${(clamp(v, 0, 1) * 100).toFixed(1)}%`;
}

function bitePercentText(v) {
  const pct = v * 100;
  if (pct < 0.01) return `${pct.toFixed(3)}%`;
  if (pct < 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(1)}%`;
}

function updateOutputs() {
  const s = settings();
  outputs.power.textContent = `${s.power.toFixed(2)}x`;
  outputs.bite.textContent = bitePercentText(s.bite);
  outputs.radius.textContent = `${s.radius.toFixed(2)}m`;
  outputs.spread.textContent = `${s.spread.toFixed(2)}m`;
  outputs.gouges.textContent = String(s.gouges);
  outputs.thickness.textContent = `${s.thickness >= 100 ? s.thickness.toFixed(0) : s.thickness.toFixed(2)}m`;
  outputs['camera-climb'].textContent = `${s.cameraClimb.toFixed(2)}m`;
  outputs['target-taps'].textContent = String(s.targetTaps);
}

function makeSoilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const bandH = c.height / SOIL_BANDS;
  for (let band = 0; band < SOIL_BANDS; band++) {
    const depthT = 1 - band / Math.max(1, SOIL_BANDS - 1);
    const r = 30 + depthT * 76;
    const g = 20 + depthT * 56;
    const b = 13 + depthT * 34;
    const y0 = band * bandH;
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(0, y0, c.width, bandH + 1);
    for (let i = 0; i < 260; i++) {
      const n = (Math.random() - 0.5) * 38;
      ctx.fillStyle = `rgba(${(r + n) | 0},${(g + n * 0.78) | 0},${(b + n * 0.55) | 0},0.48)`;
      const size = 1 + Math.random() * 3.2;
      ctx.fillRect(Math.random() * c.width, y0 + Math.random() * bandH, size, size);
    }
    if (band > 0) {
      ctx.fillStyle = 'rgba(7,4,2,0.72)';
      ctx.fillRect(0, y0 - 2, c.width, 5);
    }
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = THREE.RepeatWrapping;
  tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(2.2, 2.2);
  return tx;
}

function soilColor(depth, x, z) {
  const d = clamp(depth, 0, 1);
  const bandFloat = d * (SOIL_BANDS - 0.001);
  const band = Math.floor(bandFloat);
  const t = band / Math.max(1, SOIL_BANDS - 1);
  const shallow = new THREE.Color(0x7b4b24);
  const deep = new THREE.Color(0x211107);
  const c = shallow.lerp(deep, Math.pow(t, 0.82));
  const seam = Math.abs(bandFloat - Math.round(bandFloat)) < 0.035 ? 0.55 : 1;
  const grain = 0.94 + Math.sin(x * 8.7 + z * 5.1) * 0.06 + Math.sin(x * 22.3 - z * 14.9) * 0.04;
  c.multiplyScalar(clamp(seam * grain, 0.43, 1.12));
  if (d > 0.97) c.lerp(new THREE.Color(0x080604), 0.3);
  return c;
}

function initGrid() {
  let i = 0;
  for (let iz = 0; iz <= SEGMENTS; iz++) {
    const z = -HALF + (iz / SEGMENTS) * SIZE;
    for (let ix = 0; ix <= SEGMENTS; ix++) {
      const x = -HALF + (ix / SEGMENTS) * SIZE;
      xs[i] = x;
      zs[i] = z;
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = z;
      uvs[i * 2] = (ix / SEGMENTS) * 2.2;
      uvs[i * 2 + 1] = (iz / SEGMENTS) * 2.2;
      const c = soilColor(0, x, z);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      i++;
    }
  }
  const row = SEGMENTS + 1;
  for (let iz = 0; iz < SEGMENTS; iz++) {
    for (let ix = 0; ix < SEGMENTS; ix++) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
}

initGrid();

const surfaceGeo = new THREE.BufferGeometry();
surfaceGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
surfaceGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
surfaceGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
surfaceGeo.setIndex(indices);
surfaceGeo.computeVertexNormals();

const surfaceMat = new THREE.MeshStandardMaterial({
  map: makeSoilTexture(),
  vertexColors: true,
  roughness: 0.98,
  metalness: 0,
  side: THREE.DoubleSide,
  emissive: 0x100703,
  emissiveIntensity: 0.17,
});
const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
surfaceMesh.receiveShadow = true;
scene.add(surfaceMesh);

const wallMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  metalness: 0,
  side: THREE.DoubleSide,
});
const wallMesh = new THREE.Mesh(new THREE.BufferGeometry(), wallMat);
scene.add(wallMesh);

const rim = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE, 0.03, SIZE)),
  new THREE.LineBasicMaterial({ color: 0xf0b45a, transparent: true, opacity: 0.52 }),
);
rim.position.y = 0.02;
scene.add(rim);

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(state.ball.radius, 24, 18),
  new THREE.MeshStandardMaterial({
    color: 0xffa43a,
    roughness: 0.62,
    metalness: 0,
    emissive: 0x341204,
    emissiveIntensity: 0.18,
  }),
);
scene.add(ballMesh);

const ballShadow = new THREE.Mesh(
  new THREE.CircleGeometry(state.ball.radius * 1.25, 28),
  new THREE.MeshBasicMaterial({
    color: 0x050302,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  }),
);
ballShadow.rotation.x = -Math.PI / 2;
scene.add(ballShadow);

function updateMesh() {
  const s = settings();
  let max = 0;
  for (let i = 0; i < VERTS; i++) {
    const d = depths[i];
    max = Math.max(max, d);
    positions[i * 3 + 1] = -d * s.thickness;
    const c = soilColor(d, xs[i], zs[i]);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  surfaceGeo.attributes.position.needsUpdate = true;
  surfaceGeo.attributes.color.needsUpdate = true;
  rebuildSurfaceIndex();
  surfaceGeo.computeVertexNormals();
  surfaceGeo.computeBoundingSphere();
  rebuildWalls(s.thickness);
  return max;
}

function rebuildSurfaceIndex() {
  const next = [];
  const row = SEGMENTS + 1;
  for (let iz = 0; iz < SEGMENTS; iz++) {
    for (let ix = 0; ix < SEGMENTS; ix++) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      const avg = (depths[a] + depths[b] + depths[c] + depths[d]) * 0.25;
      if (avg >= OPEN_DEPTH) continue;
      next.push(a, c, b, b, c, d);
    }
  }
  surfaceGeo.setIndex(next);
}

function rebuildWalls(thickness) {
  const verts = [];
  const cols = [];
  const row = SEGMENTS + 1;
  function push(x, y, z, d) {
    const c = soilColor(d, x, z);
    verts.push(x, y, z);
    cols.push(c.r, c.g, c.b);
  }
  function quad(i0, i1) {
    const x0 = xs[i0], z0 = zs[i0], d0 = depths[i0], y0 = -d0 * thickness;
    const x1 = xs[i1], z1 = zs[i1], d1 = depths[i1], y1 = -d1 * thickness;
    push(x0, y0, z0, d0);
    push(x1, y1, z1, d1);
    push(x1, -thickness, z1, 1);
    push(x0, y0, z0, d0);
    push(x1, -thickness, z1, 1);
    push(x0, -thickness, z0, 1);
  }
  for (let i = 0; i < SEGMENTS; i++) {
    quad(i, i + 1);
    quad(SEGMENTS * row + i, SEGMENTS * row + i + 1);
    quad(i * row, (i + 1) * row);
    quad(i * row + SEGMENTS, (i + 1) * row + SEGMENTS);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  wallMesh.geometry.dispose();
  wallMesh.geometry = geo;
}

function sampleNearest(buffer, x, z) {
  const ix = clamp(Math.round(((x + HALF) / SIZE) * SEGMENTS), 0, SEGMENTS);
  const iz = clamp(Math.round(((z + HALF) / SIZE) * SEGMENTS), 0, SEGMENTS);
  return buffer[iz * (SEGMENTS + 1) + ix];
}

function sampleBilinear(buffer, x, z) {
  const gx = clamp(((x + HALF) / SIZE) * SEGMENTS, 0, SEGMENTS);
  const gz = clamp(((z + HALF) / SIZE) * SEGMENTS, 0, SEGMENTS);
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(SEGMENTS, x0 + 1);
  const z1 = Math.min(SEGMENTS, z0 + 1);
  const tx = gx - x0;
  const tz = gz - z0;
  const row = SEGMENTS + 1;
  const a = buffer[z0 * row + x0];
  const b = buffer[z0 * row + x1];
  const c = buffer[z1 * row + x0];
  const d = buffer[z1 * row + x1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

function terrainHeightAt(x, z, cfg = settings()) {
  return -sampleBilinear(depths, x, z) * cfg.thickness;
}

function voidFloorY(cfg = settings()) {
  return -cfg.thickness - 20;
}

function terrainOpenAt(x, z) {
  return sampleBilinear(depths, x, z) >= OPEN_DEPTH;
}

function maxDepth(buffer = depths) {
  let m = 0;
  for (let i = 0; i < buffer.length; i++) m = Math.max(m, buffer[i]);
  return m;
}

function volumeFor(buffer = depths, thickness = settings().thickness) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i];
  return sum * CELL_AREA * thickness;
}

function patchWidth(buffer = depths) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] < 0.055) continue;
    minX = Math.min(minX, xs[i]);
    maxX = Math.max(maxX, xs[i]);
    minZ = Math.min(minZ, zs[i]);
    maxZ = Math.max(maxZ, zs[i]);
  }
  if (!Number.isFinite(minX)) return 0;
  return Math.max(maxX - minX, maxZ - minZ);
}

function digStamps(cx, zc, tapIndex, cfg = settings()) {
  const stamps = [];
  const count = Math.max(1, Math.round(cfg.gouges));
  const lanes = Math.max(1, count - 1);
  for (let i = 0; i < count; i++) {
    const side = (i - (count - 1) / 2) / lanes;
    const row = (i % 2 === 0 ? -0.5 : 0.5) * cfg.radius * 0.45;
    const wobble = Math.sin((tapIndex + 1) * 1.91 + i * 2.37) * cfg.radius * 0.08;
    stamps.push({
      x: cx + side * cfg.spread + wobble,
      z: zc + row + Math.cos((tapIndex + 1) * 1.37 + i) * cfg.radius * 0.06,
      r: cfg.radius * (0.72 + (i % 3) * 0.08),
      gain: cfg.bite * cfg.power,
    });
  }
  return stamps;
}

function centerInfluencePerTap(cfg = settings(), samples = ESTIMATE_SAMPLE_TAPS) {
  let total = 0;
  const sampleCount = Math.max(1, Math.round(samples));
  for (let tap = 0; tap < sampleCount; tap++) {
    const stamps = digStamps(0, 0, tap, { ...cfg, bite: 1, power: 1 });
    for (const stamp of stamps) {
      const dist = Math.hypot(stamp.x, stamp.z);
      if (dist >= stamp.r) continue;
      total += smoothstep01(1 - dist / stamp.r);
    }
  }
  return total / sampleCount;
}

function targetBiteForDigs(target, cfg = settings()) {
  const influence = centerInfluencePerTap(cfg);
  const denom = Math.max(0.000001, target * influence * Math.max(0.000001, cfg.power));
  return (OPEN_DEPTH * 1.0002) / denom;
}

function applyStamp(buffer, stamp) {
  let delta = 0;
  for (let i = 0; i < buffer.length; i++) {
    const dist = Math.hypot(xs[i] - stamp.x, zs[i] - stamp.z);
    if (dist >= stamp.r) continue;
    const before = buffer[i];
    const falloff = smoothstep01(1 - dist / stamp.r);
    const after = clamp(before + stamp.gain * falloff, 0, 1);
    buffer[i] = after;
    delta += after - before;
  }
  return delta;
}

function applyDig(buffer, x, z, tapIndex, cfg = settings()) {
  let delta = 0;
  const stamps = digStamps(x, z, tapIndex, cfg);
  for (const stamp of stamps) delta += applyStamp(buffer, stamp);
  return { delta, stamps };
}

function digAt(x = 0, z = 0) {
  const cfg = settings();
  const before = sampleNearest(depths, x, z);
  applyDig(depths, x, z, state.taps, cfg);
  const after = sampleNearest(depths, x, z);
  state.taps += 1;
  state.lastGain = Math.max(0, after - before);
  state.lastPoint = { x, z };
  state.totalVolume = volumeFor(depths, cfg.thickness);
  updateMesh();
  updateMetrics();
}

function resetBall() {
  const b = state.ball;
  b.x = 0;
  b.z = 0;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.y = terrainHeightAt(b.x, b.z) + b.radius;
  b.grounded = true;
  syncBallMesh();
}

function resetScene() {
  depths.fill(0);
  state.taps = 0;
  state.totalVolume = 0;
  state.lastGain = 0;
  state.lastPoint = { x: 0, z: 0 };
  updateMesh();
  resetBall();
  updateMetrics();
}

function projectedDepth(taps, cfg = settings()) {
  if (taps > ESTIMATE_SAMPLE_TAPS) {
    const influence = centerInfluencePerTap(cfg);
    return clamp(taps * influence * cfg.bite * cfg.power, 0, 1);
  }
  const temp = new Float32Array(VERTS);
  for (let i = 0; i < taps; i++) applyDig(temp, 0, 0, i, cfg);
  return sampleNearest(temp, 0, 0);
}

function estimatedTaps(cfg = settings()) {
  const influence = centerInfluencePerTap(cfg);
  const rate = influence * cfg.bite * cfg.power;
  if (rate > 0 && OPEN_DEPTH / rate > ESTIMATE_SAMPLE_TAPS) {
    const approx = Math.ceil(OPEN_DEPTH / rate);
    return Math.abs(approx - cfg.targetTaps) <= 1 ? cfg.targetTaps : approx;
  }
  const temp = new Float32Array(VERTS);
  for (let i = 1; i <= ESTIMATE_SAMPLE_TAPS; i++) {
    applyDig(temp, 0, 0, i - 1, cfg);
    if (sampleNearest(temp, 0, 0) >= OPEN_DEPTH) return i;
  }
  return ESTIMATE_SAMPLE_TAPS;
}

function tuneBiteForTarget() {
  const target = Number(inputs['target-taps'].value);
  const min = Number(inputs.bite.min);
  const max = Number(inputs.bite.max);
  const tuned = targetBiteForDigs(target, settings());
  inputs.bite.value = clamp(tuned, min, max).toFixed(10);
  updateOutputs();
}

function buildPreset() {
  const s = settings();
  const est = estimatedTaps(s);
  const d2 = projectedDepth(2, s);
  const d5 = projectedDepth(5, s);
  const d10 = projectedDepth(10, s);
  const dTarget = projectedDepth(s.targetTaps, s);
  const centerDepth = sampleNearest(depths, state.lastPoint.x, state.lastPoint.z);
  return {
    version: 1,
    scene: 'dig-tuning-lab',
    meaning: 'One game touch applies gougesPerTap radial depth stamps to the soil surface.',
    dig: {
      power: +s.power.toFixed(3),
      bitePerGouge: +s.bite.toFixed(10),
      metersPerDig: BASE_METERS_PER_DIG,
      brushRadiusMeters: +s.radius.toFixed(3),
      fingerSpreadMeters: +s.spread.toFixed(3),
      gougesPerTap: s.gouges,
      groundThicknessMeters: +s.thickness.toFixed(3),
      cameraAdvanceMeters: +s.cameraClimb.toFixed(3),
      targetStraightTaps: s.targetTaps,
      estimatedStraightTaps: est,
      openThreshold: OPEN_DEPTH,
    },
    projectedCenterDepth: {
      after2Taps: +d2.toFixed(3),
      after5Taps: +d5.toFixed(3),
      after10Taps: +d10.toFixed(3),
      afterTargetTaps: +dTarget.toFixed(3),
    },
    currentRun: {
      taps: state.taps,
      centerDepth: +centerDepth.toFixed(3),
      centerOpen: centerDepth >= OPEN_DEPTH,
      maxDepth: +maxDepth().toFixed(3),
      removedVolumeM3: +volumeFor().toFixed(3),
      patchWidthMeters: +patchWidth().toFixed(3),
      ball: {
        x: +state.ball.x.toFixed(3),
        y: +state.ball.y.toFixed(3),
        z: +state.ball.z.toFixed(3),
        vx: +state.ball.vx.toFixed(3),
        vy: +state.ball.vy.toFixed(3),
        vz: +state.ball.vz.toFixed(3),
        grounded: state.ball.grounded,
        dropMeters: +Math.max(0, -state.ball.y + state.ball.radius).toFixed(3),
        overOpenHole: terrainOpenAt(state.ball.x, state.ball.z),
      },
    },
  };
}

function updateMetrics() {
  const s = settings();
  const centerDepth = sampleNearest(depths, state.lastPoint.x, state.lastPoint.z);
  const maxD = maxDepth();
  const volume = volumeFor(depths, s.thickness);
  const est = estimatedTaps(s);
  const d2 = projectedDepth(2, s);
  const d5 = projectedDepth(5, s);
  const d10 = projectedDepth(10, s);
  dom.taps.textContent = String(state.taps);
  dom.center.textContent = fmtPct(centerDepth);
  dom.max.textContent = fmtPct(maxD);
  dom.volume.textContent = `${volume.toFixed(2)}m3`;
  dom.estimate.textContent = `${est} taps`;
  dom.last.textContent = pct1(state.lastGain);
  dom.sim.textContent = `${fmtPct(d2)} / ${fmtPct(d5)} / ${fmtPct(d10)}`;
  updateBallReadout();
  dom.width.textContent = `${patchWidth(depths).toFixed(2)}m`;
  dom.json.value = JSON.stringify(buildPreset(), null, 2);
  const mismatch = Math.abs(est - s.targetTaps) > 2;
  dom.estimate.style.color = mismatch ? '#efb35a' : '#95e68b';
}

function updateBallReadout() {
  dom.camera.textContent = `${Math.max(0, -state.ball.y + state.ball.radius).toFixed(2)}m`;
}

function syncBallMesh() {
  const b = state.ball;
  const groundY = terrainHeightAt(b.x, b.z);
  ballMesh.position.set(b.x, b.y, b.z);
  const open = terrainOpenAt(b.x, b.z);
  ballShadow.visible = !open;
  ballShadow.position.set(b.x, groundY + 0.006, b.z);
  const air = Math.max(0, b.y - (groundY + b.radius));
  ballShadow.material.opacity = clamp(0.42 - air * 0.28, 0.12, 0.42);
  const scale = clamp(1 + air * 0.5, 1, 1.75);
  ballShadow.scale.setScalar(scale);
}

function settleBallAfterTerrainChange() {
  const b = state.ball;
  if (b.grounded) {
    b.y = terrainHeightAt(b.x, b.z) + b.radius;
    b.vy = 0;
  }
  syncBallMesh();
  updateBallReadout();
}

function controlVector() {
  let sx = 0;
  let sz = 0;
  if (state.keys.has('KeyW')) sz += 1;
  if (state.keys.has('KeyS')) sz -= 1;
  if (state.keys.has('KeyD')) sx += 1;
  if (state.keys.has('KeyA')) sx -= 1;
  if (!sx && !sz) return null;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const move = right.multiplyScalar(sx).add(forward.multiplyScalar(sz));
  if (move.lengthSq() > 1) move.normalize();
  return move;
}

function updateBall(dt) {
  const b = state.ball;
  const cfg = settings();
  const move = controlVector();
  const speed = 1.95;
  const steer = 10;
  if (move) {
    const tx = move.x * speed;
    const tz = move.z * speed;
    const k = 1 - Math.exp(-steer * dt);
    b.vx += (tx - b.vx) * k;
    b.vz += (tz - b.vz) * k;
  } else {
    const k = Math.exp(-5.8 * dt);
    b.vx *= k;
    b.vz *= k;
  }

  b.vy -= 5.6 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  const edge = HALF - b.radius;
  if (b.x < -edge || b.x > edge) {
    b.x = clamp(b.x, -edge, edge);
    b.vx = 0;
  }
  if (b.z < -edge || b.z > edge) {
    b.z = clamp(b.z, -edge, edge);
    b.vz = 0;
  }

  const open = terrainOpenAt(b.x, b.z);
  const groundY = open ? voidFloorY(cfg) : terrainHeightAt(b.x, b.z, cfg);
  const floorY = groundY + b.radius;
  const shallowStep = Math.abs(b.y - floorY) < 0.08;
  if (b.y <= floorY || (b.grounded && shallowStep)) {
    b.y = floorY;
    if (b.vy < 0) b.vy = 0;
    b.grounded = true;
  } else {
    b.grounded = false;
  }
  syncBallMesh();
}

function updateWorld(dt) {
  updateBall(Math.min(0.05, Math.max(0, dt)));
  if (state.cameraMode === 'top') updateCamera();
  updateBallReadout();
}

function setPreset(preset) {
  if (preset === 'main') {
    inputs.power.value = '1';
    inputs.bite.value = '0.039';
    inputs.radius.value = String(((14 + 1 * 1.55) / 256 * 3.4).toFixed(3));
    inputs.spread.value = '0.21';
    inputs.gouges.value = '8';
    inputs.thickness.value = '1';
    inputs['camera-climb'].value = '1.42';
    inputs['target-taps'].value = '10';
  } else {
    inputs.power.value = '1';
    inputs.bite.value = '0.03';
    inputs.radius.value = '0.44';
    inputs.spread.value = '0.24';
    inputs.gouges.value = '5';
    inputs.thickness.value = '1.2';
    inputs['camera-climb'].value = '1.4';
    inputs['target-taps'].value = '10';
  }
  updateOutputs();
  updateMesh();
  settleBallAfterTerrainChange();
  updateMetrics();
}

function setTargetDigs(value) {
  const target = Math.round(clamp(Number(value) || 10, 2, 5000));
  inputs['target-taps'].value = String(target);
  inputs.thickness.value = String(metersForTarget(target));
  tuneBiteForTarget();
}

function refreshAfterControl(id) {
  if (id === 'target-taps') {
    setTargetDigs(inputs['target-taps'].value);
  } else if (['power', 'radius', 'spread', 'gouges'].includes(id)) {
    tuneBiteForTarget();
  } else {
    updateOutputs();
  }
  updateMesh();
  settleBallAfterTerrainChange();
  updateMetrics();
}

function updateCamera() {
  if (state.cameraMode === 'top') {
    const b = state.ball;
    const cfg = settings();
    const followHeight = clamp(6 + cfg.thickness * 0.055, 7, 90);
    camera.up.set(0, 0, -1);
    camera.position.set(b.x, b.y + followHeight, b.z);
    camera.lookAt(b.x, b.y, b.z);
    orbitTarget.set(b.x, b.y, b.z);
    return;
  }
  camera.up.set(0, 1, 0);
  const { yaw, pitch, dist } = state.orbit;
  const cp = Math.cos(pitch);
  camera.position.set(
    orbitTarget.x + Math.sin(yaw) * cp * dist,
    orbitTarget.y + Math.sin(pitch) * dist,
    orbitTarget.z + Math.cos(yaw) * cp * dist,
  );
  camera.lookAt(orbitTarget);
}

function pointerNdc(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
}

function digFromPointer(e) {
  pointerNdc(e);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(surfaceMesh, false)[0];
  if (!hit) return;
  digAt(clamp(hit.point.x, -HALF, HALF), clamp(hit.point.z, -HALF, HALF));
}

function onPointerDown(e) {
  e.preventDefault();
  state.drag = {
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    x: e.clientX,
    y: e.clientY,
    moved: false,
  };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
}

function onPointerMove(e) {
  if (!state.drag || state.drag.id !== e.pointerId) return;
  if (state.cameraMode === 'top') return;
  const dx = e.clientX - state.drag.x;
  const dy = e.clientY - state.drag.y;
  const total = Math.hypot(e.clientX - state.drag.startX, e.clientY - state.drag.startY);
  if (total > 4) state.drag.moved = true;
  if (state.drag.moved) {
    state.orbit.yaw -= dx * 0.008;
    state.orbit.pitch = clamp(state.orbit.pitch + dy * 0.0065, -0.16, 1.38);
    updateCamera();
  }
  state.drag.x = e.clientX;
  state.drag.y = e.clientY;
}

function onPointerUp(e) {
  if (!state.drag || state.drag.id !== e.pointerId) return;
  const wasDrag = state.drag.moved;
  state.drag = null;
  if (!wasDrag) digFromPointer(e);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  updateCamera();
}

function tick(now = performance.now()) {
  const dt = (now - state.lastFrame) / 1000;
  state.lastFrame = now;
  updateWorld(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

for (const input of Object.values(inputs)) {
  input.addEventListener('input', () => refreshAfterControl(input.id));
}

for (const btn of document.querySelectorAll('[data-target-digs]')) {
  btn.addEventListener('click', () => {
    setTargetDigs(btn.dataset.targetDigs);
    updateMesh();
    settleBallAfterTerrainChange();
    updateMetrics();
  });
}

dom.tapCenter.addEventListener('click', () => digAt(0, 0));
dom.tapTen.addEventListener('click', () => {
  for (let i = 0; i < 10; i++) digAt(0, 0);
});
dom.presetFeel.addEventListener('click', () => setPreset('feel'));
dom.presetMain.addEventListener('click', () => setPreset('main'));
dom.cameraMode.addEventListener('click', () => {
  if (state.cameraMode === 'top') {
    state.cameraMode = 'orbit';
    dom.cameraMode.textContent = 'Top Follow';
    orbitTarget.set(0, -0.55, 0);
  } else {
    state.cameraMode = 'top';
    dom.cameraMode.textContent = 'Orbit View';
  }
  updateCamera();
});
dom.reset.addEventListener('click', resetScene);
dom.copy.addEventListener('click', async () => {
  const text = JSON.stringify(buildPreset(), null, 2);
  dom.json.value = text;
  try { await navigator.clipboard.writeText(text); } catch (_) {}
  state.copiedAt = performance.now();
});

canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
canvas.addEventListener('pointermove', onPointerMove, { passive: false });
window.addEventListener('pointerup', onPointerUp, { passive: false });
window.addEventListener('pointercancel', () => { state.drag = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  state.orbit.dist = clamp(state.orbit.dist + e.deltaY * 0.008, 3.4, 16);
  updateCamera();
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    e.preventDefault();
    state.keys.add(e.code);
  }
});
window.addEventListener('keyup', (e) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    e.preventDefault();
    state.keys.delete(e.code);
  }
});
window.addEventListener('resize', resize);
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.render_game_to_text = () => JSON.stringify({
  scene: 'dig-tuning-lab',
  purpose: '3D rotateable simulator for Buried Again touch-to-dig strength and removed soil volume.',
  controls: {
    rotate: 'drag the scene',
    dig: 'tap soil mesh or Tap Center button',
    zoom: 'wheel or trackpad scroll',
    ballMove: 'WASD',
    gravity: 'downward, ball falls onto the current dug terrain height',
  },
  settings: buildPreset().dig,
  metrics: buildPreset().currentRun,
  projectedCenterDepth: buildPreset().projectedCenterDepth,
  camera: {
    mode: state.cameraMode,
    yaw: +state.orbit.yaw.toFixed(3),
    pitch: +state.orbit.pitch.toFixed(3),
    dist: +state.orbit.dist.toFixed(2),
    x: +camera.position.x.toFixed(2),
    y: +camera.position.y.toFixed(2),
    z: +camera.position.z.toFixed(2),
    aboveBallMeters: +(camera.position.y - state.ball.y).toFixed(2),
  },
});
window.advanceTime = async (ms) => {
  const steps = Math.max(1, Math.ceil(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) updateWorld(1 / 60);
  renderer.render(scene, camera);
};
window.__digTuningLab = { state, depths, settings, digAt, resetScene, setPreset, buildPreset };

setPreset('feel');
resetBall();
resize();
requestAnimationFrame(tick);
