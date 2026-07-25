import * as THREE from "../node_modules/three/build/three.module.js";
import { GLTFLoader } from "../node_modules/three/examples/jsm/loaders/GLTFLoader.js";

const canvas = document.querySelector("#game-canvas");
const shell = document.querySelector("#game-shell");
const hud = document.querySelector("#hud");
const heatNumber = document.querySelector("#heat-number");
const heatMeter = document.querySelector("#heat-meter");
const heatFill = document.querySelector("#heat-fill");
const depthLabel = document.querySelector("#depth-label");
const depthNumber = document.querySelector("#depth-number");
const guidance = document.querySelector("#guidance");
const heatVignette = document.querySelector("#heat-vignette");
const overlay = document.querySelector("#game-overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayCopy = document.querySelector("#overlay-copy");
const eyebrow = document.querySelector(".eyebrow");
const controlsCopy = document.querySelector(".controls-copy");
const startButton = document.querySelector("#start-btn");
const animalPicker = document.querySelector("#animal-picker");
const animalPrevButton = document.querySelector("#animal-prev");
const animalNextButton = document.querySelector("#animal-next");
const animalCount = document.querySelector("#animal-count");
const animalName = document.querySelector("#animal-name");
const animalAffinity = document.querySelector("#animal-affinity");
const restartButton = document.querySelector("#restart-btn");
const muteButton = document.querySelector("#mute-btn");
const fullscreenButton = document.querySelector("#fullscreen-btn");
const touchControls = document.querySelector("#touch-controls");
const upButton = document.querySelector("#up-btn");
const leftButton = document.querySelector("#left-btn");
const digButton = document.querySelector("#dig-btn");
const rightButton = document.querySelector("#right-btn");
const downButton = document.querySelector("#down-btn");
const liveStatus = document.querySelector("#game-status");

const GOAL_DEPTH = 4.5;
const START_HEAT = 32;
const EXPLORE_HEAT_RATE = 2;
const TERRAIN_SIZE = 20;
const TERRAIN_SEGMENTS = 112;
const WORLD_WALK_RADIUS = 8.15;
const DIG_SITE_RADIUS = 6.45;
const WALK_SPEED = 2.8;
const START_POSITION = { x: -3.2, z: -4.8 };
const DIG_RADIUS = 0.82;
const DIG_STEP = 0.135;
const DIG_INTERVAL = 0.18;
const POINTER_HOLD_INTERVAL = 0.22;
const SCRATCH_SPACING = 0.18;
const MAX_AIM_DISTANCE = 1.45;
const SHAFT_CENTER = { x: -0.14, z: 0 };
const SHAFT_BAND_HEIGHT = 0.56;
const SHAFT_TOP_RADIUS = 1.62;
const SHAFT_OPEN_ANGLE = 1.22;
const SHAFT_VIEW_ANGLE = 0.46;
const SHAFT_CUTAWAY_REACH = 3.1;
const ROCK = {
  offsetX: 0.85,
  offsetZ: -0.25,
  x: 0.85,
  z: -0.25,
  radius: 0.92,
  visualRadius: 0.56,
  topDepth: 1.5,
};

const SOIL_TYPES = [
  {
    id: "loose-sand",
    name: "LOOSE SAND",
    shortName: "SAND",
    center: { x: -5, z: -2.6 },
    surfaceColor: 0xe2a24e,
    accentColor: 0xffd16f,
    baseStrength: 1.04,
  },
  {
    id: "root-loam",
    name: "ROOT LOAM",
    shortName: "LOAM",
    center: { x: 0, z: 5.2 },
    surfaceColor: 0x8f5835,
    accentColor: 0xbad67b,
    baseStrength: 1,
  },
  {
    id: "packed-clay",
    name: "PACKED CLAY",
    shortName: "CLAY",
    center: { x: 5, z: -2.6 },
    surfaceColor: 0xb85a36,
    accentColor: 0xf08a5c,
    baseStrength: 0.94,
  },
];

const ANIMAL_ROSTER = [
  {
    id: "fox",
    name: "FOX",
    file: "Fox.gltf",
    targetHeight: 1.18,
    digClips: ["Attack", "Walk"],
    preferredSoil: "loose-sand",
  },
  {
    id: "wolf",
    name: "WOLF",
    file: "Wolf.gltf",
    targetHeight: 1.2,
    digClips: ["Attack", "Walk"],
    preferredSoil: "loose-sand",
  },
  {
    id: "husky",
    name: "HUSKY",
    file: "Husky.gltf",
    targetHeight: 1.18,
    digClips: ["Attack", "Walk"],
    preferredSoil: "loose-sand",
  },
  {
    id: "shiba-inu",
    name: "SHIBA INU",
    file: "ShibaInu.gltf",
    targetHeight: 1.16,
    digClips: ["Attack", "Walk"],
    preferredSoil: "loose-sand",
  },
  {
    id: "deer",
    name: "DEER",
    file: "Deer.gltf",
    targetHeight: 1.26,
    digClips: ["Attack_Headbutt", "Attack_Kick", "Walk"],
    preferredSoil: "root-loam",
  },
  {
    id: "stag",
    name: "STAG",
    file: "Stag.gltf",
    targetHeight: 1.3,
    digClips: ["Attack_Headbutt", "Attack_Kick", "Walk"],
    preferredSoil: "root-loam",
  },
  {
    id: "alpaca",
    name: "ALPACA",
    file: "Alpaca.gltf",
    targetHeight: 1.26,
    digClips: ["Attack_Headbutt", "Attack_Kick", "Walk"],
    preferredSoil: "root-loam",
  },
  {
    id: "donkey",
    name: "DONKEY",
    file: "Donkey.gltf",
    targetHeight: 1.22,
    digClips: ["Attack_Kick", "Attack_Headbutt", "Walk"],
    preferredSoil: "packed-clay",
  },
  {
    id: "cow",
    name: "COW",
    file: "Cow.gltf",
    targetHeight: 1.2,
    digClips: ["Attack_Headbutt", "Attack_Kick", "Walk"],
    preferredSoil: "root-loam",
  },
  {
    id: "bull",
    name: "BULL",
    file: "Bull.gltf",
    targetHeight: 1.2,
    digClips: ["Attack_Headbutt", "Attack_Kick", "Walk"],
    preferredSoil: "packed-clay",
  },
  {
    id: "horse",
    name: "HORSE",
    file: "Horse.gltf",
    targetHeight: 1.26,
    digClips: ["Attack_Kick", "Attack_Headbutt", "Walk"],
    preferredSoil: "packed-clay",
  },
  {
    id: "white-horse",
    name: "WHITE HORSE",
    file: "Horse_White.gltf",
    targetHeight: 1.26,
    digClips: ["Attack_Kick", "Attack_Headbutt", "Walk"],
    preferredSoil: "packed-clay",
  },
];

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointer = window.matchMedia("(pointer: coarse)");

const state = {
  mode: "ready",
  phase: "preview",
  heat: START_HEAT,
  heatRate: 4.8,
  depth: 0,
  deepestDepth: 0,
  digCount: 0,
  scratchCount: 0,
  blockedHits: 0,
  message: "DIG DOWN",
  playerX: START_POSITION.x,
  playerZ: START_POSITION.z,
  playerY: 0,
  targetX: START_POSITION.x,
  targetZ: START_POSITION.z,
  aimX: START_POSITION.x,
  aimZ: START_POSITION.z,
  playerHeading: 0.48,
  playerMoving: false,
  movementX: 0,
  movementZ: 0,
  distanceWalked: 0,
  boundaryContacts: 0,
  currentSoilId: "loose-sand",
  visitedSoilIds: ["loose-sand"],
  digSiteX: null,
  digSiteZ: null,
  digSurfaceY: null,
  digSoilId: null,
  digStrengthMultiplier: 1,
  cameraDesiredX: 3.4,
  cameraDesiredY: 5.2,
  cameraDesiredZ: 5.8,
  cameraFollowTargetX: START_POSITION.x,
  cameraFollowTargetZ: START_POSITION.z,
  cameraFollowError: 0,
  pointerHeld: false,
  pointerId: null,
  lastScratchX: 0,
  lastScratchZ: 0,
  keyboardDigHeld: false,
  digCooldown: 0,
  digPulse: 0,
  rockPulse: 0,
  cameraKick: 0,
  muted: false,
  pausedByHost: false,
  selectedAnimalId: ANIMAL_ROSTER[0].id,
  animalModelStatus: "loading",
  animalAnimation: "idle",
  simulatedMs: 0,
  lastFrame: performance.now(),
};

let manualClock = false;
let audioContext = null;
let terrainBaseHeights;
let terrainColors;
let aimScreenCache = { x: 0, y: 0, visible: false };
const movementKeys = new Set();
const touchMovement = { x: 0, z: 0 };

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdd7938);
scene.fog = new THREE.Fog(0x9b5535, 13, 34);

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
const cameraTarget = new THREE.Vector3();
const cameraPositionTarget = new THREE.Vector3(3.4, 5.2, 5.8);
const lookTarget = new THREE.Vector3(0, -0.25, 0);

const hemisphere = new THREE.HemisphereLight(0xffd7a1, 0x183f4a, 2.7);
scene.add(hemisphere);

const sunLight = new THREE.DirectionalLight(0xffc272, 5.5);
sunLight.position.set(-4.5, 8, 3.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -8;
sunLight.shadow.camera.right = 8;
sunLight.shadow.camera.top = 8;
sunLight.shadow.camera.bottom = -8;
scene.add(sunLight);
scene.add(sunLight.target);

const coolLight = new THREE.PointLight(0x69e7dc, 0, 7, 1.5);
coolLight.position.set(-0.8, -4.2, 1.1);
scene.add(coolLight);

const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(0.48, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xffe16a }),
);
sunDisc.position.set(-3.5, 4.1, -1.8);
scene.add(sunDisc);

function seededNoise(x, z) {
  return (
    Math.sin(x * 12.9898 + z * 78.233) * 0.018 +
    Math.sin(x * 3.7 - z * 5.1) * 0.022
  );
}

function soilDefinition(id) {
  return SOIL_TYPES.find((soil) => soil.id === id) || SOIL_TYPES[0];
}

function soilAtPosition(x, z) {
  let closest = SOIL_TYPES[0];
  let closestScore = Infinity;
  for (let index = 0; index < SOIL_TYPES.length; index += 1) {
    const soil = SOIL_TYPES[index];
    const boundaryNoise =
      Math.sin(x * 0.82 + z * 0.43 + index * 2.1) * 0.42 +
      Math.sin(x * 0.28 - z * 0.74 + index) * 0.3;
    const score =
      Math.hypot(x - soil.center.x, z - soil.center.z) + boundaryNoise;
    if (score < closestScore) {
      closest = soil;
      closestScore = score;
    }
  }
  return closest;
}

const terrainGeometry = new THREE.PlaneGeometry(
  TERRAIN_SIZE,
  TERRAIN_SIZE,
  TERRAIN_SEGMENTS,
  TERRAIN_SEGMENTS,
);
terrainGeometry.rotateX(-Math.PI / 2);
const terrainPositions = terrainGeometry.attributes.position;
terrainBaseHeights = new Float32Array(terrainPositions.count);
terrainColors = new Float32Array(terrainPositions.count * 3);

for (let index = 0; index < terrainPositions.count; index += 1) {
  const x = terrainPositions.getX(index);
  const z = terrainPositions.getZ(index);
  const height = seededNoise(x, z);
  terrainPositions.setY(index, height);
  terrainBaseHeights[index] = height;
}

terrainGeometry.setAttribute(
  "color",
  new THREE.BufferAttribute(terrainColors, 3),
);

const terrainMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  emissive: 0x0b2f35,
  emissiveIntensity: 0,
  roughness: 0.94,
  metalness: 0,
  side: THREE.DoubleSide,
  flatShading: false,
});
const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
terrain.receiveShadow = true;
terrain.name = "fresh-deformable-desert";
scene.add(terrain);

const packedSoil = new THREE.Color(0x9a5637);
const deepSoil = new THREE.Color(0x624335);
const coolSoil = new THREE.Color(0x355762);
const refugeSoil = new THREE.Color(0x234655);
const basinEdgeSoil = new THREE.Color(0x8e412a);
const colorWork = new THREE.Color();

function updateTerrainColors() {
  for (let index = 0; index < terrainPositions.count; index += 1) {
    const depth = Math.max(0, -terrainPositions.getY(index));
    const x = terrainPositions.getX(index);
    const z = terrainPositions.getZ(index);
    const surfaceSoil = soilAtPosition(x, z);
    if (depth < 1.35) {
      colorWork
        .setHex(surfaceSoil.surfaceColor)
        .lerp(packedSoil, depth / 1.35);
    } else if (depth < 2.65) {
      colorWork.copy(packedSoil).lerp(deepSoil, (depth - 1.35) / 1.3);
    } else if (depth < 3.65) {
      colorWork.copy(deepSoil).lerp(coolSoil, depth - 2.65);
    } else {
      colorWork
        .copy(coolSoil)
        .lerp(refugeSoil, Math.min(1, (depth - 3.65) / 1.1));
    }

    const band = 0.91 + Math.sin(depth * 8.4 + x * 0.7 - z * 0.5) * 0.055;
    colorWork.multiplyScalar(band);
    const edgeMix = smoothstep01(
      (Math.hypot(x, z) - WORLD_WALK_RADIUS) / 1.35,
    );
    colorWork.lerp(basinEdgeSoil, edgeMix);
    terrainColors[index * 3] = colorWork.r;
    terrainColors[index * 3 + 1] = colorWork.g;
    terrainColors[index * 3 + 2] = colorWork.b;
  }
  terrainGeometry.attributes.color.needsUpdate = true;
}

updateTerrainColors();
terrainGeometry.computeVertexNormals();

const skirtMaterial = new THREE.MeshStandardMaterial({
  color: 0x6b422c,
  roughness: 1,
});
const terrainHalf = TERRAIN_SIZE / 2;
for (const [x, z, width, depth] of [
  [0, -(terrainHalf + 0.1), TERRAIN_SIZE + 0.4, 0.3],
  [0, terrainHalf + 0.1, TERRAIN_SIZE + 0.4, 0.3],
  [-(terrainHalf + 0.1), 0, 0.3, TERRAIN_SIZE + 0.4],
  [terrainHalf + 0.1, 0, 0.3, TERRAIN_SIZE + 0.4],
]) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.45, depth),
    skirtMaterial,
  );
  wall.position.set(x, -0.2, z);
  wall.receiveShadow = true;
  scene.add(wall);
}

const outerDesert = new THREE.Mesh(
  new THREE.RingGeometry(terrainHalf - 0.55, 34, 96),
  new THREE.MeshStandardMaterial({
    color: 0x8e412a,
    roughness: 1,
  }),
);
outerDesert.rotation.x = -Math.PI / 2;
outerDesert.position.y = -0.12;
outerDesert.receiveShadow = true;
scene.add(outerDesert);

const rimMaterial = new THREE.MeshStandardMaterial({
  color: 0x75442f,
  roughness: 1,
});
for (let index = 0; index < 44; index += 1) {
  const angle = (index / 44) * Math.PI * 2;
  const radius = WORLD_WALK_RADIUS + 0.72 + Math.sin(index * 1.71) * 0.22;
  const rimStone = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.34 + (index % 4) * 0.055, 0),
    rimMaterial,
  );
  rimStone.position.set(
    Math.cos(angle) * radius,
    0.08 + (index % 3) * 0.035,
    Math.sin(angle) * radius,
  );
  rimStone.scale.set(1.35, 0.58, 0.9);
  rimStone.rotation.set(index * 0.13, angle, index * 0.07);
  rimStone.castShadow = true;
  rimStone.receiveShadow = true;
  scene.add(rimStone);
}

const soilMarkers = [];
for (const soil of SOIL_TYPES) {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(1.55, 1.7, 48),
    new THREE.MeshBasicMaterial({
      color: soil.accentColor,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(
    soil.center.x,
    terrainHeightAt(soil.center.x, soil.center.z) + 0.045,
    soil.center.z,
  );
  marker.name = `${soil.id}-discovery-ring`;
  marker.userData.soilId = soil.id;
  soilMarkers.push(marker);
  scene.add(marker);
}

const refuge = new THREE.Mesh(
  new THREE.CircleGeometry(1.25, 48),
  new THREE.MeshStandardMaterial({
    color: 0x2e8790,
    emissive: 0x1f666d,
    emissiveIntensity: 1.4,
    roughness: 0.72,
    side: THREE.BackSide,
  }),
);
refuge.rotation.x = -Math.PI / 2;
refuge.position.set(-0.85, -4.62, 0);
refuge.receiveShadow = true;
scene.add(refuge);

const shaftBandColors = [
  0xb86f42,
  0xa05d3d,
  0x874b39,
  0x6c413a,
  0x514044,
  0x394953,
  0x28515c,
  0x1d5962,
  0x17646a,
];
const shaftBandMeshes = [];
const shaftContourMeshes = [];
const shaftGroup = new THREE.Group();
shaftGroup.name = "persistent-cutaway-shaft";
scene.add(shaftGroup);

function shaftRadiusAtDepth(depth) {
  return Math.max(1.16, SHAFT_TOP_RADIUS - depth * 0.095);
}

function createShaftArc(radius, y, tubeRadius, material) {
  const points = [];
  const arcStart = SHAFT_VIEW_ANGLE + SHAFT_OPEN_ANGLE;
  const arcLength = Math.PI * 2 - SHAFT_OPEN_ANGLE * 2;
  for (let index = 0; index <= 40; index += 1) {
    const theta = arcStart + (index / 40) * arcLength;
    points.push(
      new THREE.Vector3(
        SHAFT_CENTER.x + Math.sin(theta) * radius,
        y,
        SHAFT_CENTER.z + Math.cos(theta) * radius,
      ),
    );
  }
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 56, tubeRadius, 7, false),
    material,
  );
}

const shaftRimMaterial = new THREE.MeshStandardMaterial({
  color: 0x5b3027,
  roughness: 0.98,
  emissive: 0x2a1714,
  emissiveIntensity: 0.2,
});
const shaftContourMaterial = new THREE.MeshStandardMaterial({
  color: 0xe0a064,
  roughness: 0.95,
  emissive: 0x57352e,
  emissiveIntensity: 0.25,
});
const shaftCutMaterial = new THREE.MeshStandardMaterial({
  color: 0x3b2c2d,
  roughness: 1,
  emissive: 0x241d21,
  emissiveIntensity: 0.35,
});

const shaftRim = createShaftArc(
  SHAFT_TOP_RADIUS,
  0.055,
  0.085,
  shaftRimMaterial,
);
shaftRim.castShadow = true;
shaftRim.receiveShadow = true;
shaftGroup.add(shaftRim);

const shaftBandCount = Math.ceil((GOAL_DEPTH + 0.5) / SHAFT_BAND_HEIGHT);
for (let index = 0; index < shaftBandCount; index += 1) {
  const topDepth = index * SHAFT_BAND_HEIGHT;
  const bottomDepth = topDepth + SHAFT_BAND_HEIGHT;
  const geometry = new THREE.CylinderGeometry(
    shaftRadiusAtDepth(topDepth),
    shaftRadiusAtDepth(bottomDepth),
    SHAFT_BAND_HEIGHT,
    44,
    1,
    true,
    SHAFT_VIEW_ANGLE + SHAFT_OPEN_ANGLE,
    Math.PI * 2 - SHAFT_OPEN_ANGLE * 2,
  );
  const material = new THREE.MeshStandardMaterial({
    color: shaftBandColors[Math.min(index, shaftBandColors.length - 1)],
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    emissive: index >= 5 ? 0x173f49 : 0x321d1a,
    emissiveIntensity: index >= 5 ? 0.48 : 0.13,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const band = new THREE.Mesh(geometry, material);
  band.position.set(SHAFT_CENTER.x, -topDepth, SHAFT_CENTER.z);
  band.visible = false;
  band.receiveShadow = true;
  band.name = `shaft-wall-band-${index + 1}`;
  band.userData.topDepth = topDepth;
  shaftBandMeshes.push(band);
  shaftGroup.add(band);

  if (index > 0) {
    const contour = createShaftArc(
      shaftRadiusAtDepth(topDepth) + 0.012,
      -topDepth,
      0.025,
      shaftContourMaterial,
    );
    contour.visible = false;
    contour.name = `shaft-depth-stratum-${index}`;
    contour.userData.depth = topDepth;
    shaftContourMeshes.push(contour);
    shaftGroup.add(contour);
  }
}

const shaftCutEdges = [];
for (const theta of [
  SHAFT_VIEW_ANGLE + SHAFT_OPEN_ANGLE,
  SHAFT_VIEW_ANGLE - SHAFT_OPEN_ANGLE,
]) {
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, GOAL_DEPTH + 0.5, 0.1),
    shaftCutMaterial,
  );
  edge.position.set(
    SHAFT_CENTER.x + Math.sin(theta) * SHAFT_TOP_RADIUS,
    0,
    SHAFT_CENTER.z + Math.cos(theta) * SHAFT_TOP_RADIUS,
  );
  edge.visible = false;
  edge.castShadow = true;
  edge.name = "shaft-cut-edge";
  edge.userData.theta = theta;
  shaftCutEdges.push(edge);
  shaftGroup.add(edge);
}

const shaftBottom = new THREE.Mesh(
  new THREE.CircleGeometry(1, 48),
  new THREE.MeshStandardMaterial({
    color: 0x23353b,
    roughness: 1,
    emissive: 0x173b44,
    emissiveIntensity: 0.55,
    side: THREE.DoubleSide,
  }),
);
shaftBottom.rotation.x = -Math.PI / 2;
shaftBottom.visible = false;
shaftBottom.receiveShadow = true;
shaftBottom.name = "dark-shaft-floor";
shaftGroup.add(shaftBottom);

const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x4e5553,
  roughness: 0.96,
  emissive: 0x342f2a,
  emissiveIntensity: 0.08,
});
const rockGeometry = new THREE.DodecahedronGeometry(ROCK.visualRadius, 1);
const buriedRock = new THREE.Mesh(rockGeometry, rockMaterial);
buriedRock.position.set(ROCK.x, -1.55, ROCK.z);
buriedRock.rotation.set(0.28, 0.4, -0.16);
buriedRock.scale.set(1.15, 0.72, 0.9);
buriedRock.castShadow = true;
buriedRock.receiveShadow = true;
buriedRock.name = "buried-stone";
buriedRock.add(
  new THREE.LineSegments(
    new THREE.EdgesGeometry(rockGeometry, 18),
    new THREE.LineBasicMaterial({ color: 0x9da9a4 }),
  ),
);
scene.add(buriedRock);

const groundDetailMaterials = [
  new THREE.MeshStandardMaterial({
    color: 0xd4a33d,
    roughness: 1,
    side: THREE.DoubleSide,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x718742,
    roughness: 1,
    side: THREE.DoubleSide,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x7c3f2f,
    roughness: 1,
    side: THREE.DoubleSide,
  }),
];
const groundDetails = [];
for (let index = 0; index < 72; index += 1) {
  const angle = index * 2.399;
  const radius = 2.2 + ((index * 37) % 47) * 0.13;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const detailSoil = soilAtPosition(x, z);
  const materialIndex = SOIL_TYPES.findIndex(
    (soil) => soil.id === detailSoil.id,
  );
  const blade = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.3 + (index % 4) * 0.04, 3),
    groundDetailMaterials[Math.max(0, materialIndex)],
  );
  blade.position.set(
    x,
    terrainHeightAt(x, z) + 0.13,
    z,
  );
  blade.rotation.z = Math.sin(index * 1.7) * 0.22;
  groundDetails.push(blade);
  scene.add(blade);
}

function createFennec() {
  const group = new THREE.Group();
  group.name = "fennec-player";

  const fur = new THREE.MeshStandardMaterial({
    color: 0xe6a65b,
    roughness: 0.82,
  });
  const lightFur = new THREE.MeshStandardMaterial({
    color: 0xffd99a,
    roughness: 0.88,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x2a211e,
    roughness: 0.9,
  });
  const innerEar = new THREE.MeshStandardMaterial({
    color: 0xd97972,
    roughness: 0.78,
    emissive: 0x5b1f18,
    emissiveIntensity: 0.08,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 14), fur);
  body.scale.set(1.28, 0.68, 0.82);
  body.position.set(0, 0.34, -0.08);
  group.add(body);

  const chest = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 18, 12),
    lightFur,
  );
  chest.scale.set(0.9, 1.1, 0.6);
  chest.position.set(0, 0.35, 0.36);
  group.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), fur);
  head.scale.set(0.95, 0.88, 1.02);
  head.position.set(0, 0.58, 0.48);
  group.add(head);

  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 10),
    lightFur,
  );
  muzzle.scale.set(0.88, 0.62, 1.1);
  muzzle.position.set(0, 0.48, 0.72);
  group.add(muzzle);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), dark);
  nose.position.set(0, 0.5, 0.87);
  group.add(nose);

  const eyeGeometry = new THREE.SphereGeometry(0.04, 10, 8);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, dark);
    eye.position.set(side * 0.12, 0.62, 0.75);
    group.add(eye);

    const ear = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.62, 3),
      fur,
    );
    ear.position.set(side * 0.22, 0.98, 0.42);
    ear.rotation.z = side * -0.12;
    group.add(ear);

    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(0.115, 0.42, 3),
      innerEar,
    );
    inner.position.set(side * 0.22, 0.98, 0.54);
    inner.rotation.z = side * -0.12;
    group.add(inner);
  }

  const pawGeometry = new THREE.SphereGeometry(0.12, 14, 9);
  const frontPaws = [];
  for (const side of [-1, 1]) {
    const paw = new THREE.Mesh(pawGeometry, dark);
    paw.scale.set(0.78, 0.55, 1.4);
    paw.position.set(side * 0.22, 0.12, 0.57);
    group.add(paw);
    frontPaws.push(paw);

    const hindPaw = new THREE.Mesh(pawGeometry, dark);
    hindPaw.scale.set(0.9, 0.58, 1.25);
    hindPaw.position.set(side * 0.28, 0.11, -0.32);
    group.add(hindPaw);
  }

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.05, 0.4, -0.38),
    new THREE.Vector3(0.5, 0.34, -0.75),
    new THREE.Vector3(0.68, 0.48, -1.08),
    new THREE.Vector3(0.5, 0.65, -1.28),
  ]);
  const tail = new THREE.Mesh(
    new THREE.TubeGeometry(tailCurve, 22, 0.13, 8, false),
    fur,
  );
  group.add(tail);

  const tailTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 10),
    lightFur,
  );
  tailTip.scale.set(0.9, 0.8, 1.3);
  tailTip.position.set(0.5, 0.65, -1.28);
  group.add(tailTip);

  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  group.userData = {
    body,
    head,
    frontPaws,
    innerEar,
  };
  return group;
}

const fennec = createFennec();
scene.add(fennec);

const animalLoader = new GLTFLoader();
const animalStage = new THREE.Group();
animalStage.name = "selected-animated-animal";
scene.add(animalStage);

const animalCache = new Map();
const animalLoads = new Map();
let selectedAnimalIndex = 0;
let activeAnimal = null;

function currentAnimalDefinition() {
  return ANIMAL_ROSTER[selectedAnimalIndex];
}

function preferredSoilDefinition() {
  return soilDefinition(currentAnimalDefinition().preferredSoil);
}

function currentSoilDefinition() {
  return soilDefinition(state.currentSoilId);
}

function soilMatchesAnimal(soilId) {
  return currentAnimalDefinition().preferredSoil === soilId;
}

function animationClipName(animations, candidates) {
  for (const candidate of candidates) {
    const exact = animations.find((clip) => clip.name === candidate);
    if (exact) {
      return exact.name;
    }
  }
  const normalizedCandidates = candidates.map((name) => name.toLowerCase());
  return animations.find((clip) =>
    normalizedCandidates.includes(clip.name.toLowerCase()),
  )?.name;
}

function prepareAnimal(gltf, definition) {
  const root = gltf.scene;
  root.name = `${definition.id}-animated-model`;
  root.updateMatrixWorld(true);

  const initialBounds = new THREE.Box3().setFromObject(root);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const scale =
    initialSize.y > 0.001 ? definition.targetHeight / initialSize.y : 1;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  const normalizedBounds = new THREE.Box3().setFromObject(root);
  const normalizedCenter = normalizedBounds.getCenter(new THREE.Vector3());
  root.position.set(
    -normalizedCenter.x,
    -normalizedBounds.min.y,
    -normalizedCenter.z,
  );
  root.updateMatrixWorld(true);

  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
    }
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map(
    gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]),
  );
  return {
    definition,
    root,
    animations: gltf.animations,
    mixer,
    actions,
    currentAction: null,
    currentMode: null,
  };
}

function getAnimalAsset(definition) {
  if (animalCache.has(definition.id)) {
    return Promise.resolve(animalCache.get(definition.id));
  }
  if (animalLoads.has(definition.id)) {
    return animalLoads.get(definition.id);
  }

  const load = new Promise((resolve, reject) => {
    animalLoader.load(
      `./assets/3d/animals/${definition.file}`,
      (gltf) => {
        const prepared = prepareAnimal(gltf, definition);
        animalCache.set(definition.id, prepared);
        animalLoads.delete(definition.id);
        resolve(prepared);
      },
      undefined,
      (error) => {
        animalLoads.delete(definition.id);
        reject(error);
      },
    );
  });
  animalLoads.set(definition.id, load);
  return load;
}

function updateAnimalPicker() {
  const definition = currentAnimalDefinition();
  animalName.textContent = definition.name;
  const status =
    state.animalModelStatus === "loading"
      ? " · LOADING"
      : state.animalModelStatus === "fallback"
        ? " · FALLBACK"
        : "";
  animalCount.textContent =
    `${selectedAnimalIndex + 1} OF ${ANIMAL_ROSTER.length}${status}`;
  animalAffinity.textContent =
    `PREFERS · ${preferredSoilDefinition().name}`;
  startButton.textContent = `START · ${definition.name}`;
  startButton.setAttribute("aria-label", `Explore as ${definition.name}`);
}

function setAnimalAnimation(mode, force = false) {
  if (!activeAnimal) {
    state.animalAnimation = "procedural-fallback";
    return;
  }
  if (!force && activeAnimal.currentMode === mode) {
    return;
  }

  const definition = activeAnimal.definition;
  const candidates = {
    idle: ["Idle", "Idle_2"],
    walk: ["Walk"],
    dig: definition.digClips,
    blocked: ["Idle_HitReact1", "Idle_HitReact2", "Attack"],
    win: ["Idle_2", "Gallop_Jump", "Jump_toIdle", "Jump_ToIdle", "Idle"],
    fail: ["Death", "Idle_HitReact2", "Idle"],
  }[mode] || ["Idle"];
  const clipName =
    animationClipName(activeAnimal.animations, candidates) ||
    activeAnimal.animations[0]?.name;
  const nextAction = clipName ? activeAnimal.actions.get(clipName) : null;
  if (!nextAction) {
    state.animalAnimation = "static";
    return;
  }

  if (activeAnimal.currentAction && activeAnimal.currentAction !== nextAction) {
    activeAnimal.currentAction.fadeOut(reduceMotion.matches ? 0 : 0.1);
  }
  nextAction.reset();
  nextAction.enabled = true;
  nextAction.clampWhenFinished = mode === "fail";
  nextAction.setLoop(
    mode === "fail" ? THREE.LoopOnce : THREE.LoopRepeat,
    mode === "fail" ? 1 : Infinity,
  );
  nextAction.fadeIn(reduceMotion.matches ? 0 : 0.1).play();
  activeAnimal.currentAction = nextAction;
  activeAnimal.currentMode = mode;
  state.animalAnimation = `${mode}:${clipName}`;
}

function activateAnimal(prepared) {
  if (activeAnimal && activeAnimal !== prepared) {
    activeAnimal.currentAction?.stop();
    animalStage.remove(activeAnimal.root);
  }
  activeAnimal = prepared;
  if (prepared.root.parent !== animalStage) {
    animalStage.add(prepared.root);
  }
  animalStage.visible = true;
  fennec.visible = false;
  state.animalModelStatus = "ready";
  setAnimalAnimation("idle", true);
  updateAnimalPicker();
}

async function loadSelectedAnimal() {
  const definition = currentAnimalDefinition();
  const requestedId = definition.id;
  state.selectedAnimalId = requestedId;
  state.animalModelStatus = "loading";
  animalStage.visible = false;
  fennec.visible = true;
  updateAnimalPicker();

  try {
    const prepared = await getAnimalAsset(definition);
    if (state.selectedAnimalId === requestedId) {
      activateAnimal(prepared);
    }
  } catch (error) {
    if (state.selectedAnimalId === requestedId) {
      state.animalModelStatus = "fallback";
      state.animalAnimation = "procedural-fallback";
      animalStage.visible = false;
      fennec.visible = true;
      updateAnimalPicker();
      liveStatus.textContent =
        `${definition.name} could not load. The fallback animal is ready to dig.`;
    }
    void error;
  }
}

function selectAnimal(stepOrId) {
  if (state.mode === "playing") {
    return;
  }
  if (typeof stepOrId === "string") {
    const requestedIndex = ANIMAL_ROSTER.findIndex(
      (animal) => animal.id === stepOrId,
    );
    if (requestedIndex < 0) {
      return;
    }
    selectedAnimalIndex = requestedIndex;
  } else {
    selectedAnimalIndex =
      (selectedAnimalIndex + stepOrId + ANIMAL_ROSTER.length) %
      ANIMAL_ROSTER.length;
  }
  loadSelectedAnimal();
}

const aimMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.2, 0.28, 32),
  new THREE.MeshBasicMaterial({
    color: 0x8effdf,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    side: THREE.DoubleSide,
  }),
);
aimMarker.rotation.x = -Math.PI / 2;
aimMarker.renderOrder = 20;
scene.add(aimMarker);

const particleGeometry = new THREE.DodecahedronGeometry(0.055, 0);
const particleMaterials = [
  new THREE.MeshStandardMaterial({ color: 0xd49349, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0x9b5b38, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0x6a4936, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0x41636a, roughness: 1 }),
];
const dirtParticles = Array.from({ length: 72 }, (_, index) => {
  const mesh = new THREE.Mesh(
    particleGeometry,
    particleMaterials[index % particleMaterials.length],
  );
  mesh.visible = false;
  mesh.userData.life = 0;
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
});

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function terrainIndex(ix, iz) {
  return iz * (TERRAIN_SEGMENTS + 1) + ix;
}

function terrainHeightAt(x, z) {
  const normalizedX = clamp((x + TERRAIN_SIZE / 2) / TERRAIN_SIZE, 0, 1);
  const normalizedZ = clamp((z + TERRAIN_SIZE / 2) / TERRAIN_SIZE, 0, 1);
  const gridX = normalizedX * TERRAIN_SEGMENTS;
  const gridZ = normalizedZ * TERRAIN_SEGMENTS;
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const x1 = Math.min(TERRAIN_SEGMENTS, x0 + 1);
  const z1 = Math.min(TERRAIN_SEGMENTS, z0 + 1);
  const tx = gridX - x0;
  const tz = gridZ - z0;

  const h00 = terrainPositions.getY(terrainIndex(x0, z0));
  const h10 = terrainPositions.getY(terrainIndex(x1, z0));
  const h01 = terrainPositions.getY(terrainIndex(x0, z1));
  const h11 = terrainPositions.getY(terrainIndex(x1, z1));
  const top = THREE.MathUtils.lerp(h00, h10, tx);
  const bottom = THREE.MathUtils.lerp(h01, h11, tx);
  return THREE.MathUtils.lerp(top, bottom, tz);
}

function clampToRadius(x, z, radius) {
  const distance = Math.hypot(x, z);
  if (distance <= radius) {
    return { x, z, clamped: false };
  }
  const scale = radius / Math.max(0.001, distance);
  return { x: x * scale, z: z * scale, clamped: true };
}

function shaftWorldCenter() {
  return {
    x: state.digSiteX ?? 0,
    z: state.digSiteZ ?? 0,
  };
}

function clampDigPoint(x, z) {
  const center = shaftWorldCenter();
  return {
    x: clamp(x, center.x - 2.1, center.x + 2.1),
    z: clamp(z, center.z - 1.35, center.z + 1.35),
  };
}

function terrainDepthAt(x, z) {
  const surfaceY = state.digSurfaceY ?? 0;
  return Math.max(0, surfaceY - terrainHeightAt(x, z));
}

function canDigAt(x, z) {
  return Math.hypot(x, z) <= DIG_SITE_RADIUS;
}

function rockBlocks(x, z, depth) {
  const dx = x - ROCK.x;
  const dz = z - ROCK.z;
  return (
    dx * dx + dz * dz < ROCK.radius * ROCK.radius &&
    depth >= ROCK.topDepth
  );
}

function applyGouge(x, z, strength = 1) {
  const centerDepth = terrainDepthAt(x, z);
  const effectiveRadius = clamp(
    DIG_RADIUS + centerDepth * 0.34,
    DIG_RADIUS,
    2.15,
  );
  let changed = false;
  for (let index = 0; index < terrainPositions.count; index += 1) {
    const vx = terrainPositions.getX(index);
    const vz = terrainPositions.getZ(index);
    const dx = vx - x;
    const dz = vz - z;
    const distance = Math.hypot(dx, dz);
    if (distance >= effectiveRadius) {
      continue;
    }

    const currentY = terrainPositions.getY(index);
    const falloff = smoothstep01(1 - distance / effectiveRadius);
    const rockDistance = Math.hypot(vx - ROCK.x, vz - ROCK.z);
    const floorY =
      (state.digSurfaceY ?? 0) -
      (rockDistance < ROCK.radius * 0.92
        ? ROCK.topDepth
        : GOAL_DEPTH + 0.45);
    const nextY = Math.max(
      floorY,
      currentY -
        DIG_STEP * strength * (0.82 + falloff * 0.42) * falloff,
    );
    if (nextY < currentY - 0.0001) {
      terrainPositions.setY(index, nextY);
      changed = true;
    }
  }

  if (changed) {
    terrainPositions.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    terrainGeometry.attributes.normal.needsUpdate = true;
    updateTerrainColors();
  }
  return changed;
}

function revealCutaway(depth) {
  if (depth <= 0.08) {
    return;
  }
  const shaftCenter = shaftWorldCenter();
  const cutoutFront = {
    x:
      shaftCenter.x +
      Math.sin(SHAFT_VIEW_ANGLE) * SHAFT_CUTAWAY_REACH,
    z:
      shaftCenter.z +
      Math.cos(SHAFT_VIEW_ANGLE) * SHAFT_CUTAWAY_REACH,
  };
  const corridorStart = {
    x: state.targetX,
    z: state.targetZ,
  };
  const corridorDx = cutoutFront.x - corridorStart.x;
  const corridorDz = cutoutFront.z - corridorStart.z;
  const corridorLengthSquared =
    corridorDx * corridorDx + corridorDz * corridorDz;
  let changed = false;
  for (let index = 0; index < terrainPositions.count; index += 1) {
    const vx = terrainPositions.getX(index);
    const vz = terrainPositions.getZ(index);
    const dx = vx - shaftCenter.x;
    const dz = vz - shaftCenter.z;
    const radius = Math.hypot(dx, dz);
    if (radius > SHAFT_CUTAWAY_REACH) {
      continue;
    }

    const theta = Math.atan2(dx, dz);
    const wrappedAngle = Math.atan2(
      Math.sin(theta - SHAFT_VIEW_ANGLE),
      Math.cos(theta - SHAFT_VIEW_ANGLE),
    );
    const angleDistance = Math.abs(wrappedAngle);
    const angleFade =
      radius <= SHAFT_TOP_RADIUS * 1.08
        ? 1 -
          smoothstep01(
            (angleDistance - SHAFT_OPEN_ANGLE * 0.7) /
              (SHAFT_OPEN_ANGLE * 0.24),
          )
        : 0;
    const corridorProgress = clamp(
      ((vx - corridorStart.x) * corridorDx +
        (vz - corridorStart.z) * corridorDz) /
        Math.max(0.001, corridorLengthSquared),
      0,
      1,
    );
    const corridorX = corridorStart.x + corridorDx * corridorProgress;
    const corridorZ = corridorStart.z + corridorDz * corridorProgress;
    const corridorDistance = Math.hypot(vx - corridorX, vz - corridorZ);
    const corridorFade =
      1 - smoothstep01((corridorDistance - 0.34) / 0.3);

    if (angleFade <= 0 && corridorFade <= 0) {
      continue;
    }

    const radialFade = smoothstep01(
      1 - Math.abs(radius - SHAFT_TOP_RADIUS * 0.7) /
        (SHAFT_TOP_RADIUS * 0.48),
    );
    const cutStrength = Math.max(
      angleFade * (0.9 + radialFade * 0.07),
      corridorFade * 0.985,
    );
    const cutY = (state.digSurfaceY ?? 0) - depth * cutStrength;
    const currentY = terrainPositions.getY(index);
    if (cutY < currentY - 0.002) {
      terrainPositions.setY(index, cutY);
      changed = true;
    }
  }

  if (changed) {
    terrainPositions.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    terrainGeometry.attributes.normal.needsUpdate = true;
    updateTerrainColors();
  }
}

function spawnDirt(x, y, z) {
  const count = reduceMotion.matches ? 4 : 11;
  let spawned = 0;
  for (const particle of dirtParticles) {
    if (particle.visible) {
      continue;
    }
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.55 + Math.random() * 1.25;
    particle.visible = true;
    particle.position.set(
      x + (Math.random() - 0.5) * 0.25,
      y + 0.12,
      z + (Math.random() - 0.5) * 0.25,
    );
    particle.scale.setScalar(0.65 + Math.random() * 0.85);
    particle.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * speed,
      1.25 + Math.random() * 1.2,
      Math.sin(angle) * speed,
    );
    particle.userData.life = 0.48 + Math.random() * 0.38;
    spawned += 1;
    if (spawned >= count) {
      break;
    }
  }
}

function updateParticles(dt) {
  for (const particle of dirtParticles) {
    if (!particle.visible) {
      continue;
    }
    particle.userData.life -= dt;
    particle.userData.velocity.y -= 4.8 * dt;
    particle.position.addScaledVector(particle.userData.velocity, dt);
    particle.rotation.x += dt * 7;
    particle.rotation.z += dt * 5;
    if (particle.userData.life <= 0) {
      particle.visible = false;
    }
  }
}

function ensureAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  if (audioContext?.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function playTone(frequency, duration, type, volume, delay = 0) {
  if (state.muted || !audioContext || state.pausedByHost) {
    return;
  }
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(40, frequency * 0.72),
    start + duration,
  );
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playDigSound() {
  const soilPitch = {
    "loose-sand": 118,
    "root-loam": 94,
    "packed-clay": 72,
  }[state.digSoilId] || 95;
  playTone(soilPitch + Math.random() * 26, 0.08, "triangle", 0.035);
}

function playRockSound() {
  playTone(68, 0.16, "square", 0.04);
}

function playWinSound() {
  playTone(310, 0.16, "sine", 0.045);
  playTone(470, 0.18, "sine", 0.04, 0.11);
  playTone(690, 0.24, "triangle", 0.035, 0.23);
}

function playFailSound() {
  playTone(130, 0.35, "sawtooth", 0.025);
}

function setMessage(text, announce = false) {
  if (state.message === text) {
    return;
  }
  state.message = text;
  guidance.textContent = text;
  if (announce) {
    liveStatus.textContent = text;
  }
}

function heatRateForDepth(depth) {
  return clamp(4.8 - depth * 1.9, -4, 4.8);
}

function pointerToTerrain(event) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObject(terrain, false)[0];
  if (!hit) {
    return null;
  }
  if (state.phase === "digging") {
    return clampDigPoint(hit.point.x, hit.point.z);
  }
  const worldPoint = clampToRadius(
    hit.point.x,
    hit.point.z,
    WORLD_WALK_RADIUS,
  );
  return { x: worldPoint.x, z: worldPoint.z };
}

function aimWithinReach(x, z) {
  return Math.hypot(x - state.playerX, z - state.playerZ) <= MAX_AIM_DISTANCE;
}

function updateAim(x, z) {
  if (!aimWithinReach(x, z)) {
    const dx = x - state.playerX;
    const dz = z - state.playerZ;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    state.aimX = state.playerX + (dx / length) * MAX_AIM_DISTANCE;
    state.aimZ = state.playerZ + (dz / length) * MAX_AIM_DISTANCE;
  } else {
    state.aimX = x;
    state.aimZ = z;
  }
}

function attemptDig(source = "hold", force = false) {
  if (
    state.mode !== "playing" ||
    state.phase !== "digging" ||
    (!force && state.digCooldown > 0)
  ) {
    return false;
  }
  ensureAudio();

  const digPoint = clampDigPoint(state.aimX, state.aimZ);
  const x = digPoint.x;
  const z = digPoint.z;
  const currentDepth = terrainDepthAt(x, z);
  state.digCooldown =
    source === "pointer-hold" ? POINTER_HOLD_INTERVAL : DIG_INTERVAL;

  if (rockBlocks(x, z, currentDepth)) {
    state.blockedHits += 1;
    state.rockPulse = 1;
    state.cameraKick = Math.max(state.cameraKick, 0.22);
    setMessage("STONE — DIG AROUND IT", true);
    playRockSound();
    return false;
  }

  const inputStrength = source === "scratch" ? 0.62 : 1;
  if (!applyGouge(x, z, inputStrength * state.digStrengthMultiplier)) {
    setMessage("SHIFT SIDEWAYS — THIS PATCH IS CLEAR", false);
    return false;
  }

  const newDepth = terrainDepthAt(x, z);
  state.digCount += 1;
  if (source === "scratch") {
    state.scratchCount += 1;
    state.digCooldown = Math.min(state.digCooldown, 0.055);
  }
  state.targetX = x;
  state.targetZ = z;
  state.digPulse = 1;
  state.cameraKick = Math.max(state.cameraKick, 0.13);
  spawnDirt(x, -newDepth, z);
  playDigSound();

  if (newDepth > state.deepestDepth + 0.025) {
    state.deepestDepth = newDepth;
    revealCutaway(state.deepestDepth);
  }

  if (newDepth >= 2.55) {
    setMessage("COOLER — KEEP CLAWING", false);
  } else if (newDepth >= 0.45) {
    setMessage("DOWN IS SHADE", false);
  } else {
    setMessage("CLAW THE SOIL BELOW", false);
  }
  return true;
}

function moveAim(direction) {
  if (state.mode !== "playing" || state.phase !== "digging") {
    return;
  }
  const center = shaftWorldCenter();
  const nextX = clamp(
    state.aimX + direction * 0.85,
    center.x - 1.9,
    center.x + 1.9,
  );
  updateAim(nextX, state.aimZ);
  setMessage(direction < 0 ? "AIM LEFT" : "AIM RIGHT", false);
}

function updatePointerAim(event) {
  const point = pointerToTerrain(event);
  if (point) {
    updateAim(point.x, point.z);
    return point;
  }
  return null;
}

function onPointerDown(event) {
  if (state.mode !== "playing") {
    return;
  }
  if (state.phase !== "digging") {
    setMessage("WALK WITH WASD, ARROWS, OR THE MOVE PAD", false);
    canvas.focus({ preventScroll: true });
    event.preventDefault();
    return;
  }
  const point = updatePointerAim(event);
  state.pointerHeld = true;
  state.pointerId = event.pointerId;
  state.lastScratchX = point?.x ?? state.aimX;
  state.lastScratchZ = point?.z ?? state.aimZ;
  canvas.setPointerCapture(event.pointerId);
  state.digCooldown = 0;
  attemptDig("pointer-hold");
  event.preventDefault();
}

function onPointerMove(event) {
  if (state.mode !== "playing" || state.phase !== "digging") {
    return;
  }
  const point = updatePointerAim(event);
  if (state.pointerHeld && event.pointerId === state.pointerId && point) {
    const dx = point.x - state.lastScratchX;
    const dz = point.z - state.lastScratchZ;
    const distance = Math.hypot(dx, dz);
    if (distance >= SCRATCH_SPACING) {
      const steps = Math.min(4, Math.floor(distance / SCRATCH_SPACING));
      for (let index = 1; index <= steps; index += 1) {
        const progress = index / steps;
        updateAim(
          state.lastScratchX + dx * progress,
          state.lastScratchZ + dz * progress,
        );
        attemptDig("scratch", true);
      }
      state.lastScratchX = point.x;
      state.lastScratchZ = point.z;
      updateAim(point.x, point.z);
      setMessage("SCRATCH — PULL THE DIRT BACK", false);
    }
  }
  event.preventDefault();
}

function endPointer(event) {
  if (event.pointerId !== state.pointerId) {
    return;
  }
  state.pointerHeld = false;
  state.pointerId = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  event.preventDefault();
}

function holdDigControl(active) {
  if (state.mode !== "playing" || state.phase !== "digging") {
    return;
  }
  state.keyboardDigHeld = active;
  if (active) {
    state.digCooldown = 0;
    attemptDig();
  }
}

function soilStrengthFor(soilId) {
  const soil = soilDefinition(soilId);
  return soilMatchesAnimal(soilId) ? 1.18 : soil.baseStrength;
}

function setExplorationMessage(soil, announce = false) {
  const match = soilMatchesAnimal(soil.id);
  setMessage(
    match
      ? `${soil.name} · GOOD MATCH — DIG HERE`
      : `${soil.name} · WORKABLE — PREFERS ${preferredSoilDefinition().shortName}`,
    announce,
  );
}

function updateExplorationSoil(announce = false) {
  const soil = soilAtPosition(state.playerX, state.playerZ);
  const changed = soil.id !== state.currentSoilId;
  state.currentSoilId = soil.id;
  if (!state.visitedSoilIds.includes(soil.id)) {
    state.visitedSoilIds.push(soil.id);
  }
  if (changed || announce) {
    setExplorationMessage(soil, announce);
  }
}

function updateControlPresentation() {
  const exploring = state.mode === "playing" && state.phase === "exploring";
  touchControls.classList.toggle("is-exploring", exploring);
  upButton.hidden = !exploring;
  downButton.hidden = !exploring;
  leftButton.textContent = exploring ? "←" : "LEFT";
  rightButton.textContent = exploring ? "→" : "RIGHT";
  digButton.textContent = exploring ? "DIG HERE" : "DIG";
  leftButton.setAttribute("aria-label", exploring ? "Walk west" : "Aim left");
  rightButton.setAttribute("aria-label", exploring ? "Walk east" : "Aim right");
  touchControls.setAttribute(
    "aria-label",
    exploring ? "Walking and dig-site controls" : "Dig controls",
  );
}

function beginDigging() {
  if (state.mode !== "playing" || state.phase !== "exploring") {
    return false;
  }
  if (!canDigAt(state.playerX, state.playerZ)) {
    state.boundaryContacts += 1;
    setMessage("TOO CLOSE TO THE RIM — STEP TOWARD THE BASIN", true);
    return false;
  }

  movementKeys.clear();
  touchMovement.x = 0;
  touchMovement.z = 0;
  state.phase = "digging";
  state.playerMoving = false;
  state.movementX = 0;
  state.movementZ = 0;
  state.targetX = state.playerX;
  state.targetZ = state.playerZ;
  state.aimX = state.playerX;
  state.aimZ = state.playerZ;
  state.digSiteX = state.playerX;
  state.digSiteZ = state.playerZ;
  state.digSurfaceY = terrainHeightAt(state.playerX, state.playerZ);
  state.digSoilId = state.currentSoilId;
  state.digStrengthMultiplier = soilStrengthFor(state.digSoilId);

  ROCK.x = state.digSiteX + ROCK.offsetX;
  ROCK.z = state.digSiteZ + ROCK.offsetZ;
  shaftGroup.position.set(
    state.digSiteX - SHAFT_CENTER.x,
    state.digSurfaceY,
    state.digSiteZ - SHAFT_CENTER.z,
  );
  refuge.position.set(
    state.digSiteX - 0.7,
    state.digSurfaceY - 4.62,
    state.digSiteZ,
  );
  refuge.visible = true;
  buriedRock.position.set(
    ROCK.x,
    state.digSurfaceY - 1.55,
    ROCK.z,
  );
  buriedRock.visible = true;
  coolLight.position.set(
    state.digSiteX - 0.8,
    state.digSurfaceY - 4.2,
    state.digSiteZ + 1.1,
  );
  for (const detail of groundDetails) {
    detail.visible =
      Math.hypot(
        detail.position.x - state.digSiteX,
        detail.position.z - state.digSiteZ,
      ) > 2.2;
  }

  const soil = soilDefinition(state.digSoilId);
  const match = soilMatchesAnimal(soil.id);
  setMessage(
    match
      ? `${soil.name} AFFINITY — FAST CLAWS`
      : `${soil.name} — STEADY CLAWS`,
    true,
  );
  liveStatus.textContent =
    `${currentAnimalDefinition().name} begins a burrow in ${soil.name.toLowerCase()}. ` +
    `${match ? "This ground matches the animal." : "This ground is workable."} ` +
    "Aim around the animal and dig down.";
  updateControlPresentation();
  updateAimMarker();
  updateShaft();
  return true;
}

function movementVector() {
  let x = touchMovement.x;
  let z = touchMovement.z;
  if (movementKeys.has("KeyA") || movementKeys.has("ArrowLeft")) {
    x -= 1;
  }
  if (movementKeys.has("KeyD") || movementKeys.has("ArrowRight")) {
    x += 1;
  }
  if (movementKeys.has("KeyW") || movementKeys.has("ArrowUp")) {
    z += 1;
  }
  if (movementKeys.has("KeyS") || movementKeys.has("ArrowDown")) {
    z -= 1;
  }
  const length = Math.hypot(x, z);
  return length > 0.001
    ? { x: x / length, z: z / length }
    : { x: 0, z: 0 };
}

function updateExplorationMovement(dt) {
  if (
    state.mode !== "playing" ||
    state.phase !== "exploring" ||
    state.pausedByHost
  ) {
    state.playerMoving = false;
    return;
  }
  const movement = movementVector();
  state.movementX = movement.x;
  state.movementZ = movement.z;
  state.playerMoving = Math.hypot(movement.x, movement.z) > 0.001;
  if (!state.playerMoving) {
    state.targetX = state.playerX;
    state.targetZ = state.playerZ;
    return;
  }

  const attemptedX = state.targetX + movement.x * WALK_SPEED * dt;
  const attemptedZ = state.targetZ + movement.z * WALK_SPEED * dt;
  const bounded = clampToRadius(
    attemptedX,
    attemptedZ,
    WORLD_WALK_RADIUS,
  );
  if (bounded.clamped) {
    state.boundaryContacts += 1;
  }
  state.targetX = bounded.x;
  state.targetZ = bounded.z;
  state.playerHeading = Math.atan2(movement.x, movement.z);
}

function onKeyDown(event) {
  if (event.code === "KeyM") {
    toggleMute();
    return;
  }
  if (event.code === "KeyF") {
    toggleFullscreen();
    return;
  }
  if (event.code === "KeyR") {
    resetGame();
    return;
  }
  if (
    state.mode !== "playing" &&
    (event.code === "ArrowLeft" || event.code === "ArrowRight") &&
    !event.repeat
  ) {
    selectAnimal(event.code === "ArrowLeft" ? -1 : 1);
    event.preventDefault();
    return;
  }
  if (state.mode !== "playing") {
    return;
  }

  if (state.phase === "exploring") {
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowLeft",
        "ArrowDown",
        "ArrowRight",
      ].includes(event.code)
    ) {
      movementKeys.add(event.code);
      event.preventDefault();
    } else if (event.code === "Space" && !event.repeat) {
      beginDigging();
      event.preventDefault();
    }
    return;
  }

  if (
    (event.code === "ArrowLeft" || event.code === "KeyA") &&
    !event.repeat
  ) {
    moveAim(-1);
    event.preventDefault();
  } else if (
    (event.code === "ArrowRight" || event.code === "KeyD") &&
    !event.repeat
  ) {
    moveAim(1);
    event.preventDefault();
  } else if (event.code === "Space" || event.code === "ArrowDown") {
    if (!state.keyboardDigHeld) {
      holdDigControl(true);
    }
    event.preventDefault();
  }
}

function onKeyUp(event) {
  if (
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowLeft",
      "ArrowDown",
      "ArrowRight",
    ].includes(event.code)
  ) {
    movementKeys.delete(event.code);
    event.preventDefault();
  }
  if (event.code === "Space" || event.code === "ArrowDown") {
    holdDigControl(false);
    event.preventDefault();
  }
}

function resetTerrain() {
  for (let index = 0; index < terrainPositions.count; index += 1) {
    terrainPositions.setY(index, terrainBaseHeights[index]);
  }
  terrainPositions.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  terrainGeometry.attributes.normal.needsUpdate = true;
  updateTerrainColors();
}

function resetGame() {
  ensureAudio();
  resetTerrain();
  movementKeys.clear();
  touchMovement.x = 0;
  touchMovement.z = 0;
  const startSoil = soilAtPosition(START_POSITION.x, START_POSITION.z);
  Object.assign(state, {
    mode: "playing",
    phase: "exploring",
    heat: START_HEAT,
    heatRate: EXPLORE_HEAT_RATE,
    depth: 0,
    deepestDepth: 0,
    digCount: 0,
    scratchCount: 0,
    blockedHits: 0,
    message: "WALK TO TEST THE GROUND",
    playerX: START_POSITION.x,
    playerZ: START_POSITION.z,
    playerY: terrainHeightAt(START_POSITION.x, START_POSITION.z),
    targetX: START_POSITION.x,
    targetZ: START_POSITION.z,
    aimX: START_POSITION.x,
    aimZ: START_POSITION.z,
    playerHeading: 0.48,
    playerMoving: false,
    movementX: 0,
    movementZ: 0,
    distanceWalked: 0,
    boundaryContacts: 0,
    currentSoilId: startSoil.id,
    visitedSoilIds: [startSoil.id],
    digSiteX: null,
    digSiteZ: null,
    digSurfaceY: null,
    digSoilId: null,
    digStrengthMultiplier: 1,
    cameraDesiredX: START_POSITION.x + (camera.aspect < 0.78 ? 3.8 : 4.6),
    cameraDesiredY: camera.aspect < 0.78 ? 7.4 : 5.8,
    cameraDesiredZ: START_POSITION.z + (camera.aspect < 0.78 ? 8.8 : 7.2),
    cameraFollowTargetX: START_POSITION.x,
    cameraFollowTargetZ: START_POSITION.z,
    cameraFollowError: 0,
    pointerHeld: false,
    pointerId: null,
    lastScratchX: 0,
    lastScratchZ: 0,
    keyboardDigHeld: false,
    digCooldown: 0,
    digPulse: 0,
    rockPulse: 0,
    cameraKick: 0,
    simulatedMs: 0,
    lastFrame: performance.now(),
  });

  for (const particle of dirtParticles) {
    particle.visible = false;
  }
  for (const detail of groundDetails) {
    detail.visible = true;
  }

  const portrait = camera.aspect < 0.78;
  camera.position.set(
    START_POSITION.x + (portrait ? 3.8 : 4.6),
    portrait ? 7.4 : 5.8,
    START_POSITION.z + (portrait ? 8.8 : 7.2),
  );
  cameraPositionTarget.copy(camera.position);
  lookTarget.set(
    START_POSITION.x,
    terrainHeightAt(START_POSITION.x, START_POSITION.z) + 0.35,
    START_POSITION.z,
  );
  shaftGroup.visible = false;
  shaftGroup.position.set(0, 0, 0);
  refuge.visible = false;
  buriedRock.visible = false;
  setAnimalAnimation("idle", true);
  updateExplorationSoil(true);
  overlay.hidden = true;
  shell.classList.remove("is-overlay-open");
  hud.hidden = false;
  touchControls.hidden = !coarsePointer.matches;
  updateControlPresentation();
  controlsCopy.hidden = false;
  liveStatus.textContent =
    `The run has started with ${currentAnimalDefinition().name}. Walk across the basin with WASD, arrow keys, or the movement pad. Press Space or DIG HERE to choose a burrow.`;
  canvas.focus({ preventScroll: true });
  updatePlayerAnimal(1);
  updateAimMarker();
  updateShaft();
  updateWorldMood(1);
  updateHud();
  render();
}

function endGame(result) {
  if (state.mode !== "playing") {
    return;
  }
  state.mode = result;
  state.pointerHeld = false;
  state.keyboardDigHeld = false;
  overlay.hidden = false;
  shell.classList.add("is-overlay-open");
  hud.hidden = true;
  touchControls.hidden = true;
  controlsCopy.hidden = true;
  animalPicker.hidden = false;
  eyebrow.textContent = result === "win" ? "4.5 METRES BELOW THE SUN" : "THE SUN WON";
  overlayTitle.innerHTML = result === "win" ? "SAFE" : "TOO<br>HOT";
  const resultSoil = soilDefinition(state.digSoilId || state.currentSoilId);
  overlayCopy.textContent =
    result === "win"
      ? `${currentAnimalDefinition().name} found cool earth beneath ${resultSoil.name.toLowerCase()}.`
      : state.phase === "exploring"
        ? `${currentAnimalDefinition().name} stayed in the sun too long. Choose ground and dig sooner.`
        : `Too hot beneath ${resultSoil.name.toLowerCase()}. Every soil can work, but ${currentAnimalDefinition().name} prefers ${preferredSoilDefinition().name.toLowerCase()}.`;
  updateAnimalPicker();
  if (result === "win") {
    playWinSound();
    liveStatus.textContent = "Cool at last. You reached the safe earth.";
  } else {
    playFailSound();
    liveStatus.textContent = "Too hot. The run ended before reaching cool earth.";
  }
  startButton.focus({ preventScroll: true });
}

function updateHud() {
  const heatRounded = Math.round(state.heat);
  heatNumber.textContent = `${heatRounded}%`;
  heatMeter.setAttribute("aria-valuenow", String(heatRounded));
  heatFill.style.setProperty("--heat", `${state.heat}%`);
  if (state.phase !== "digging") {
    const soil = currentSoilDefinition();
    depthLabel.textContent = "GROUND";
    depthNumber.textContent =
      `${soil.shortName} · ${soilMatchesAnimal(soil.id) ? "GOOD" : "WORKABLE"}`;
  } else {
    depthLabel.textContent = "COOL EARTH";
    depthNumber.textContent =
      `${state.depth.toFixed(1)} / ${GOAL_DEPTH.toFixed(1)} M`;
  }
  guidance.textContent = state.message;
  heatVignette.style.setProperty(
    "--heat-opacity",
    String(
      (0.06 + Math.pow(state.heat / 100, 2) * 0.7) *
        (state.heatRate < 0 ? 0.42 : 1),
    ),
  );
  shell.classList.toggle("is-cooling", state.heatRate < 0);
}

function updatePlayerAnimal(dt) {
  const follow = 1 - Math.exp(-dt * 8);
  const previousX = state.playerX;
  const previousZ = state.playerZ;
  state.playerX = THREE.MathUtils.lerp(state.playerX, state.targetX, follow);
  state.playerZ = THREE.MathUtils.lerp(state.playerZ, state.targetZ, follow);
  if (state.phase === "exploring") {
    state.distanceWalked += Math.hypot(
      state.playerX - previousX,
      state.playerZ - previousZ,
    );
    updateExplorationSoil(false);
  }
  const groundY = terrainHeightAt(state.playerX, state.playerZ);
  state.playerY = THREE.MathUtils.lerp(state.playerY, groundY, follow);
  state.depth =
    state.phase === "digging"
      ? Math.max(0, (state.digSurfaceY ?? 0) - state.playerY)
      : 0;

  const pulse = state.digPulse;
  const pawSwing = Math.sin((1 - pulse) * Math.PI * 2) * pulse;
  fennec.userData.frontPaws[0].rotation.x = -pawSwing * 1.15;
  fennec.userData.frontPaws[1].rotation.x = pawSwing * 1.15;
  fennec.userData.body.rotation.x = pulse * 0.12;
  fennec.userData.head.rotation.x = pulse * -0.1;

  const pant = state.mode === "playing" ? state.heat / 100 : 0;
  const portrait = camera.aspect < 0.78;
  const previewScale =
    state.mode === "ready" ? (portrait ? 1.55 : 1.25) : 1;
  const breathe = Math.sin(state.simulatedMs * 0.009) * 0.015 * pant;
  const playerScale = 1.16 * previewScale;
  fennec.scale.set(
    playerScale,
    playerScale * (1 + breathe),
    playerScale,
  );
  fennec.position.set(
    state.playerX,
    state.playerY + 0.12,
    state.playerZ,
  );

  if (state.mode === "win") {
    fennec.rotation.z = THREE.MathUtils.lerp(
      fennec.rotation.z,
      -0.85,
      1 - Math.exp(-dt * 3),
    );
  } else {
    fennec.rotation.z = THREE.MathUtils.lerp(
      fennec.rotation.z,
      0,
      1 - Math.exp(-dt * 8),
    );
  }
  const faceCameraYaw =
    state.phase === "exploring"
      ? state.playerHeading
      : portrait
        ? 0.34
        : 0.48;
  fennec.rotation.y = THREE.MathUtils.lerp(
    fennec.rotation.y,
    faceCameraYaw,
    follow,
  );

  fennec.userData.innerEar.emissiveIntensity =
    0.08 + Math.pow(state.heat / 100, 2) * 0.9;

  animalStage.position.set(
    state.playerX,
    state.playerY + 0.075,
    state.playerZ,
  );
  animalStage.rotation.y = THREE.MathUtils.lerp(
    animalStage.rotation.y,
    faceCameraYaw,
    follow,
  );
  animalStage.rotation.z = THREE.MathUtils.lerp(
    animalStage.rotation.z,
    0,
    1 - Math.exp(-dt * 8),
  );
  animalStage.scale.set(
    previewScale,
    previewScale * (1 + breathe * 0.45),
    previewScale,
  );

  const animationMode =
    state.mode === "fail"
      ? "fail"
      : state.mode === "win"
        ? "win"
        : state.rockPulse > 0.42
          ? "blocked"
          : state.digPulse > 0.08
            ? "dig"
            : state.phase === "exploring" && state.playerMoving
              ? "walk"
            : "idle";
  setAnimalAnimation(animationMode);
  activeAnimal?.mixer.update(dt);

  const animatedModelReady =
    state.animalModelStatus === "ready" && Boolean(activeAnimal);
  animalStage.visible = animatedModelReady;
  fennec.visible = !animatedModelReady;
}

function updateAimMarker() {
  aimMarker.visible =
    state.mode === "playing" && state.phase === "digging";
  if (!aimMarker.visible) {
    return;
  }
  const closeToPaws =
    Math.hypot(state.aimX - state.playerX, state.aimZ - state.playerZ) < 0.42;
  const markerYaw = camera.aspect < 0.78 ? 0.34 : 0.48;
  const markerOffset = closeToPaws ? 0.48 : 0;
  const markerX = state.aimX + Math.sin(markerYaw) * markerOffset;
  const markerZ = state.aimZ + Math.cos(markerYaw) * markerOffset;
  const markerHeight = terrainHeightAt(markerX, markerZ);
  aimMarker.position.set(
    markerX,
    markerHeight + 0.045,
    markerZ,
  );
  aimMarker.material.color.set(
    rockBlocks(state.aimX, state.aimZ, terrainDepthAt(state.aimX, state.aimZ))
      ? 0xff6b4b
      : 0x8effdf,
  );
  aimMarker.scale.setScalar(1 + state.digPulse * 0.22);
}

function updateShaft() {
  const visibleDepth = clamp(state.deepestDepth, 0, GOAL_DEPTH + 0.5);
  const isVisible = visibleDepth > 0.045;
  shaftGroup.visible = isVisible;
  if (!isVisible) {
    return;
  }

  shaftRim.visible = true;
  for (const band of shaftBandMeshes) {
    const topDepth = band.userData.topDepth;
    const revealed = clamp(
      visibleDepth - topDepth,
      0,
      SHAFT_BAND_HEIGHT,
    );
    band.visible = revealed > 0.015;
    if (!band.visible) {
      continue;
    }
    band.scale.y = Math.max(0.001, revealed / SHAFT_BAND_HEIGHT);
    band.position.y = -topDepth - revealed / 2;
  }

  for (const contour of shaftContourMeshes) {
    contour.visible = visibleDepth >= contour.userData.depth - 0.02;
  }

  for (const edge of shaftCutEdges) {
    const theta = edge.userData.theta;
    const radius = shaftRadiusAtDepth(visibleDepth * 0.5);
    edge.visible = true;
    edge.scale.y = visibleDepth / (GOAL_DEPTH + 0.5);
    edge.position.set(
      SHAFT_CENTER.x + Math.sin(theta) * radius,
      -visibleDepth / 2,
      SHAFT_CENTER.z + Math.cos(theta) * radius,
    );
  }

  const floorRadius = shaftRadiusAtDepth(visibleDepth) * 0.94;
  shaftBottom.visible = true;
  shaftBottom.position.set(
    SHAFT_CENTER.x,
    -visibleDepth - 0.055,
    SHAFT_CENTER.z,
  );
  shaftBottom.scale.setScalar(floorRadius);
}

function updateCamera(dt) {
  const depthFollow = Math.min(GOAL_DEPTH, state.deepestDepth);
  const portrait = camera.aspect < 0.78;
  let focusX = state.playerX;
  let focusY = state.playerY + 0.3;
  let focusZ = state.playerZ;

  if (state.mode === "ready") {
    cameraPositionTarget.set(
      state.playerX + (portrait ? 3 : 3.4),
      state.playerY + (portrait ? 6.8 : 5.2),
      state.playerZ + (portrait ? 8.8 : 5.8),
    );
  } else if (state.phase === "exploring") {
    cameraPositionTarget.set(
      state.playerX + (portrait ? 3.8 : 4.6),
      state.playerY + (portrait ? 7.4 : 5.8),
      state.playerZ + (portrait ? 8.8 : 7.2),
    );
  } else {
    const center = shaftWorldCenter();
    focusX = center.x + (state.playerX - center.x) * 0.28;
    focusY =
      (state.digSurfaceY ?? 0) -
      0.1 -
      depthFollow * (portrait ? 0.48 : 0.5);
    focusZ = center.z + (state.playerZ - center.z) * 0.18;
    cameraPositionTarget.set(
      center.x + (portrait ? 3 : 3.4),
      (state.digSurfaceY ?? 0) + (portrait ? 6.8 : 5.2),
      center.z + (portrait ? 8.8 : 5.8),
    );
  }
  cameraTarget.copy(cameraPositionTarget);

  const kick = reduceMotion.matches ? 0 : state.cameraKick;
  if (kick > 0.001) {
    cameraTarget.x += Math.sin(state.simulatedMs * 0.031) * kick * 0.46;
    cameraTarget.y += Math.cos(state.simulatedMs * 0.027) * kick * 0.3;
  }

  const cameraFollow = 1 - Math.exp(-dt * 4.3);
  camera.position.lerp(cameraTarget, cameraFollow);
  lookTarget.x = THREE.MathUtils.lerp(lookTarget.x, focusX, cameraFollow);
  lookTarget.y = THREE.MathUtils.lerp(lookTarget.y, focusY, cameraFollow);
  lookTarget.z = THREE.MathUtils.lerp(lookTarget.z, focusZ, cameraFollow);
  camera.lookAt(lookTarget);

  state.cameraDesiredX = cameraPositionTarget.x;
  state.cameraDesiredY = cameraPositionTarget.y;
  state.cameraDesiredZ = cameraPositionTarget.z;
  state.cameraFollowTargetX = focusX;
  state.cameraFollowTargetZ = focusZ;
  state.cameraFollowError = camera.position.distanceTo(cameraPositionTarget);

  const lightSurfaceY =
    state.phase === "digging" ? state.digSurfaceY ?? 0 : state.playerY;
  sunLight.position.set(focusX - 4.5, lightSurfaceY + 8, focusZ + 3.5);
  sunLight.target.position.set(focusX, lightSurfaceY, focusZ);
  sunLight.target.updateMatrixWorld();
  sunDisc.position.set(
    focusX - 7.5,
    lightSurfaceY + 7.2,
    focusZ - 9.5,
  );

  state.cameraKick = Math.max(0, state.cameraKick - dt * 1.8);
}

function updateWorldMood(dt) {
  const coolMix = smoothstep01((state.depth - 2.2) / 2.3);
  scene.background
    .copy(new THREE.Color(0xdd7938))
    .lerp(new THREE.Color(0x2d5663), coolMix);
  scene.fog.color
    .copy(new THREE.Color(0x9b5535))
    .lerp(new THREE.Color(0x243f49), coolMix);
  coolLight.intensity = coolMix * 7.5;
  sunLight.intensity = 5.5 - coolMix * 3.2;
  hemisphere.intensity = 2.7 + coolMix * 0.8;
  terrainMaterial.emissiveIntensity = coolMix * 0.56;
  rockMaterial.emissiveIntensity = 0.08 + state.rockPulse * 0.65;
  const rockSurfaceY = terrainHeightAt(ROCK.x, ROCK.z);
  const rockTargetY =
    state.blockedHits > 0
      ? rockSurfaceY + 0.03
      : (state.digSurfaceY ?? 0) - 1.55;
  buriedRock.position.y = THREE.MathUtils.lerp(
    buriedRock.position.y,
    rockTargetY,
    1 - Math.exp(-dt * 9),
  );
  buriedRock.scale.set(
    1.15 + state.rockPulse * 0.06,
    0.72 + state.rockPulse * 0.04,
    0.9 + state.rockPulse * 0.06,
  );
}

function update(dt) {
  const safeDt = clamp(dt, 0, 0.1);
  state.simulatedMs += safeDt * 1000;
  state.digCooldown = Math.max(0, state.digCooldown - safeDt);
  state.digPulse = Math.max(0, state.digPulse - safeDt * 3.8);
  state.rockPulse = Math.max(0, state.rockPulse - safeDt * 3);

  updateExplorationMovement(safeDt);

  if (state.mode === "playing" && !state.pausedByHost) {
    if (
      state.phase === "digging" &&
      (state.pointerHeld || state.keyboardDigHeld) &&
      state.digCooldown <= 0
    ) {
      attemptDig(state.pointerHeld ? "pointer-hold" : "keyboard");
    }

    state.heatRate =
      state.phase === "exploring"
        ? EXPLORE_HEAT_RATE
        : heatRateForDepth(state.depth);
    state.heat = clamp(state.heat + state.heatRate * safeDt, 0, 100);

    if (state.heat >= 100) {
      endGame("fail");
    } else if (state.phase === "digging" && state.depth >= GOAL_DEPTH) {
      state.heat = Math.min(state.heat, 58);
      endGame("win");
    }
  }

  updatePlayerAnimal(safeDt);
  updateAimMarker();
  updateShaft();
  updateParticles(safeDt);
  updateCamera(safeDt);
  updateWorldMood(safeDt);
  updateHud();
}

function projectWorldPoint(x, y, z) {
  const point = new THREE.Vector3(x, y, z).project(camera);
  return {
    x: ((point.x + 1) / 2) * canvas.clientWidth,
    y: ((1 - point.y) / 2) * canvas.clientHeight,
    visible: point.z >= -1 && point.z <= 1,
  };
}

function render() {
  renderer.render(scene, camera);
  const aimHeight = terrainHeightAt(state.aimX, state.aimZ);
  aimScreenCache = projectWorldPoint(state.aimX, aimHeight, state.aimZ);
}

function frame(timestamp) {
  const dt = Math.min(0.1, (timestamp - state.lastFrame) / 1000 || 0);
  state.lastFrame = timestamp;
  if (!manualClock) {
    update(dt);
  }
  render();
  requestAnimationFrame(frame);
}

function resize() {
  const rect = shell.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(320, rect.height);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = camera.aspect < 0.78 ? 50 : 46;
  camera.updateProjectionMatrix();
  render();
}

function toggleMute() {
  state.muted = !state.muted;
  muteButton.textContent = state.muted ? "SOUND OFF" : "SOUND ON";
  muteButton.setAttribute("aria-pressed", String(state.muted));
  if (!state.muted) {
    ensureAudio();
    playTone(430, 0.09, "sine", 0.025);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    shell.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function renderGameToText() {
  render();
  const currentSoil = currentSoilDefinition();
  const preferredSoil = preferredSoilDefinition();
  const digSoil = state.digSoilId
    ? soilDefinition(state.digSoilId)
    : null;
  const cameraMode =
    state.mode === "ready"
      ? "selection-preview"
      : state.phase === "exploring"
        ? "third-person-follow"
        : "external-third-person-cutaway";
  const payload = {
    coordinateSystem:
      "Three.js world units. X runs west/east, Z runs south/north, and Y is up. Burrow depth is measured below the locked dig-site surface. Canvas coordinates use origin top-left.",
    mode: state.pausedByHost ? "paused" : state.mode,
    phase: state.phase,
    simulatedMs: Math.round(state.simulatedMs),
    viewport: {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    },
    objective: {
      text:
        state.phase === "exploring"
          ? "Explore the basin, read the soil, and choose a burrow before body heat reaches 100%."
          : "Dig down to cool earth before body heat reaches 100%.",
      goalDepthMetres: GOAL_DEPTH,
    },
    heat: Number(state.heat.toFixed(2)),
    heatRatePerSecond: Number(state.heatRate.toFixed(2)),
    cooling: state.heatRate < 0,
    depthMetres: Number(state.depth.toFixed(3)),
    deepestDepthMetres: Number(state.deepestDepth.toFixed(3)),
    message: state.message,
    player: {
      animal: state.selectedAnimalId,
      animalName: currentAnimalDefinition().name,
      modelStatus: state.animalModelStatus,
      animation: state.animalAnimation,
      x: Number(state.playerX.toFixed(3)),
      y: Number(state.playerY.toFixed(3)),
      z: Number(state.playerZ.toFixed(3)),
      headingRadians: Number(state.playerHeading.toFixed(3)),
      moving: state.playerMoving,
      speed: state.playerMoving ? WALK_SPEED : 0,
    },
    animalRoster: {
      count: ANIMAL_ROSTER.length,
      selectedIndex: selectedAnimalIndex,
      ids: ANIMAL_ROSTER.map((animal) => animal.id),
      loadedIds: Array.from(animalCache.keys()),
      selectionAvailable: state.mode !== "playing",
    },
    world: {
      terrainSize: TERRAIN_SIZE,
      walkRadius: WORLD_WALK_RADIUS,
      safeDigRadius: DIG_SITE_RADIUS,
      playerInsideBounds:
        Math.hypot(state.playerX, state.playerZ) <=
        WORLD_WALK_RADIUS + 0.001,
      canDigHere: canDigAt(state.playerX, state.playerZ),
      boundaryContacts: state.boundaryContacts,
    },
    exploration: {
      distanceWalked: Number(state.distanceWalked.toFixed(3)),
      movementX: Number(state.movementX.toFixed(3)),
      movementZ: Number(state.movementZ.toFixed(3)),
      visitedSoilIds: [...state.visitedSoilIds],
      visitedSoilCount: state.visitedSoilIds.length,
    },
    soil: {
      currentId: currentSoil.id,
      currentName: currentSoil.name,
      preferredId: preferredSoil.id,
      preferredName: preferredSoil.name,
      affinity:
        soilMatchesAnimal(currentSoil.id) ? "good-match" : "workable",
      currentBaseStrength: currentSoil.baseStrength,
      effectiveDigStrength:
        state.phase === "digging"
          ? state.digStrengthMultiplier
          : soilStrengthFor(currentSoil.id),
    },
    digSite: {
      locked: state.phase === "digging",
      x:
        state.digSiteX === null
          ? null
          : Number(state.digSiteX.toFixed(3)),
      surfaceY:
        state.digSurfaceY === null
          ? null
          : Number(state.digSurfaceY.toFixed(3)),
      z:
        state.digSiteZ === null
          ? null
          : Number(state.digSiteZ.toFixed(3)),
      soilId: digSoil?.id || null,
      soilName: digSoil?.name || null,
      strengthMultiplier: Number(state.digStrengthMultiplier.toFixed(2)),
    },
    camera: {
      mode: cameraMode,
      x: Number(camera.position.x.toFixed(3)),
      y: Number(camera.position.y.toFixed(3)),
      z: Number(camera.position.z.toFixed(3)),
      desiredX: Number(state.cameraDesiredX.toFixed(3)),
      desiredY: Number(state.cameraDesiredY.toFixed(3)),
      desiredZ: Number(state.cameraDesiredZ.toFixed(3)),
      followTargetX: Number(state.cameraFollowTargetX.toFixed(3)),
      followTargetZ: Number(state.cameraFollowTargetZ.toFixed(3)),
      followError: Number(state.cameraFollowError.toFixed(3)),
      worldAnimalVisible: animalStage.visible || fennec.visible,
    },
    aim: {
      x: Number(state.aimX.toFixed(3)),
      z: Number(state.aimZ.toFixed(3)),
      surfaceDepth: Number(terrainDepthAt(state.aimX, state.aimZ).toFixed(3)),
      blockedByRock: rockBlocks(
        state.aimX,
        state.aimZ,
        terrainDepthAt(state.aimX, state.aimZ),
      ),
      screenX: Number(aimScreenCache.x.toFixed(1)),
      screenY: Number(aimScreenCache.y.toFixed(1)),
    },
    buriedRock: {
      x: ROCK.x,
      z: ROCK.z,
      topDepthMetres: ROCK.topDepth,
      radius: ROCK.radius,
      hitCount: state.blockedHits,
    },
    terrain: {
      representation:
        "large three-soil basin with one locally deformable burrow heightfield",
      soilRegions: SOIL_TYPES.map((soil) => ({
        id: soil.id,
        name: soil.name,
        center: soil.center,
      })),
      successfulClawStrokes: state.digCount,
      dragScratchStrokes: state.scratchCount,
      shaftVisible: shaftGroup.visible,
      shaftPresentation: "open-front layered third-person cutaway",
      shaftWorldX:
        state.digSiteX === null
          ? null
          : Number(state.digSiteX.toFixed(3)),
      shaftWorldZ:
        state.digSiteZ === null
          ? null
          : Number(state.digSiteZ.toFixed(3)),
      shaftWallDepthMetres: Number(
        Math.min(state.deepestDepth, GOAL_DEPTH + 0.5).toFixed(3),
      ),
      surfaceRimFixedAtY:
        state.digSurfaceY === null
          ? null
          : Number(state.digSurfaceY.toFixed(3)),
    },
    input: {
      pointerHeld: state.pointerHeld,
      keyboardDigHeld: state.keyboardDigHeld,
      keyboard:
        state.phase === "exploring"
          ? "WASD or arrows walk; Space chooses the current dig site; R retries; M mutes; F fullscreen."
          : "A/D or Left/Right aim; Space or Down digs; R retries; M mutes; F fullscreen.",
      pointer:
        state.phase === "exploring"
          ? "Use the native movement pad on touch devices; the canvas does not trigger accidental digging."
          : "Drag short scratches through visible soil; press-and-hold remains an accessibility fallback.",
      selection: "Before a run, use the animal arrow buttons or keyboard Left/Right.",
    },
  };
  return JSON.stringify(payload, null, 2);
}

function advanceTime(ms) {
  manualClock = true;
  const steps = Math.max(1, Math.ceil(ms / (1000 / 60)));
  const stepSeconds = ms / 1000 / steps;
  for (let index = 0; index < steps; index += 1) {
    update(stepSeconds);
  }
  state.lastFrame = performance.now();
  render();
  return Promise.resolve();
}

function onVisibilityChange() {
  state.pausedByHost = document.hidden;
  if (document.hidden) {
    audioContext?.suspend().catch(() => {});
  } else if (!state.muted) {
    audioContext?.resume().catch(() => {});
  }
  state.lastFrame = performance.now();
}

startButton.addEventListener("click", resetGame);
animalPrevButton.addEventListener("click", () => selectAnimal(-1));
animalNextButton.addEventListener("click", () => selectAnimal(1));
restartButton.addEventListener("click", resetGame);
muteButton.addEventListener("click", toggleMute);
fullscreenButton.addEventListener("click", toggleFullscreen);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
document.addEventListener("fullscreenchange", resize);
document.addEventListener("visibilitychange", onVisibilityChange);

function bindDirectionButton(button, x, z) {
  button.addEventListener("pointerdown", (event) => {
    if (state.mode !== "playing") {
      return;
    }
    if (state.phase === "exploring") {
      touchMovement.x = x;
      touchMovement.z = z;
      button.setPointerCapture(event.pointerId);
    } else if (x !== 0) {
      moveAim(x);
    }
    event.preventDefault();
  });
  const release = (event) => {
    if (state.phase === "exploring") {
      touchMovement.x = 0;
      touchMovement.z = 0;
    }
    if (
      event?.pointerId !== undefined &&
      button.hasPointerCapture(event.pointerId)
    ) {
      button.releasePointerCapture(event.pointerId);
    }
    event?.preventDefault();
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
}

bindDirectionButton(upButton, 0, 1);
bindDirectionButton(leftButton, -1, 0);
bindDirectionButton(rightButton, 1, 0);
bindDirectionButton(downButton, 0, -1);

digButton.addEventListener("pointerdown", (event) => {
  if (state.phase === "exploring") {
    beginDigging();
  } else {
    holdDigControl(true);
  }
  digButton.setPointerCapture(event.pointerId);
  event.preventDefault();
});
digButton.addEventListener("pointerup", (event) => {
  holdDigControl(false);
  if (digButton.hasPointerCapture(event.pointerId)) {
    digButton.releasePointerCapture(event.pointerId);
  }
  event.preventDefault();
});
digButton.addEventListener("pointercancel", () => holdDigControl(false));

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(shell);

window.render_game_to_text = renderGameToText;
window.advanceTime = advanceTime;
window.__deepShade = {
  selectAnimal: (id) => selectAnimal(id),
  getAnimalRoster: () => ({
    selected: state.selectedAnimalId,
    status: state.animalModelStatus,
    loaded: Array.from(animalCache.keys()),
    animals: ANIMAL_ROSTER.map((animal) => ({
      id: animal.id,
      name: animal.name,
      preferredSoil: animal.preferredSoil,
    })),
  }),
  getAimScreen: () => ({ ...aimScreenCache }),
  getScreenForWorld: (x, z = 0) => {
    const requestedX = Number(x) || 0;
    const requestedZ = Number(z) || 0;
    const point =
      state.phase === "digging"
        ? clampDigPoint(requestedX, requestedZ)
        : clampToRadius(requestedX, requestedZ, WORLD_WALK_RADIUS);
    return projectWorldPoint(
      point.x,
      terrainHeightAt(point.x, point.z),
      point.z,
    );
  },
  getPlayerScreen: () =>
    projectWorldPoint(
      state.playerX,
      state.playerY + 0.5,
      state.playerZ,
    ),
  getWalkBounds: () => ({
    radius: WORLD_WALK_RADIUS,
    safeDigRadius: DIG_SITE_RADIUS,
  }),
  getSoilRegions: () =>
    SOIL_TYPES.map((soil) => ({
      id: soil.id,
      name: soil.name,
      center: { ...soil.center },
    })),
  getDigSite: () => ({
    locked: state.phase === "digging",
    x: state.digSiteX,
    y: state.digSurfaceY,
    z: state.digSiteZ,
    soilId: state.digSoilId,
  }),
  getLayout: () => ({
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    aim: { ...aimScreenCache },
  }),
  sampleDepth: (x, z = 0) => {
    const requestedX = Number(x);
    const requestedZ = Number(z);
    const point = clampDigPoint(
      Number.isFinite(requestedX) ? requestedX : state.playerX,
      Number.isFinite(requestedZ) ? requestedZ : state.playerZ,
    );
    return terrainDepthAt(point.x, point.z);
  },
};

state.currentSoilId = soilAtPosition(
  START_POSITION.x,
  START_POSITION.z,
).id;
state.visitedSoilIds = [state.currentSoilId];
state.playerY = terrainHeightAt(START_POSITION.x, START_POSITION.z);
fennec.position.y = state.playerY;
updateAnimalPicker();
loadSelectedAnimal();
updateHud();
resize();
requestAnimationFrame(frame);
