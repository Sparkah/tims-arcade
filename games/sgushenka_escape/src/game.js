import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";

const canvas = document.querySelector("#game-canvas");
const shell = document.querySelector("#game-shell");
const depthDistance = document.querySelector("#depth-distance");
const movementHint = document.querySelector("#movement-hint");
const resetButton = document.querySelector("#reset-button");
const muteButton = document.querySelector("#mute-button");
const swimControl = document.querySelector("#swim-control");
const swimKnob = document.querySelector("#swim-knob");
const ascendButton = document.querySelector("#ascend-button");
const descendButton = document.querySelector("#descend-button");
const liveStatus = document.querySelector("#game-status");
const objectiveMarker = document.querySelector(".air-marker");
const objectiveLabel = document.querySelector("#objective-label");
const objectiveIcon = document.querySelector("#objective-icon");
const chapterCard = document.querySelector("#chapter-card");
const chapterKicker = document.querySelector("#chapter-kicker");
const chapterTitle = document.querySelector("#chapter-title");
const chapterSubtitle = document.querySelector("#chapter-subtitle");
const replayButton = document.querySelector("#replay-button");
const nutrientFlash = document.querySelector("#nutrient-flash");

const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.05;
const CAN_RADIUS = 7.15;
const CAN_BOTTOM = -10.2;
const SURFACE_Y = 9.6;
const PLAYER_CLEARANCE = 0.34;
const SURFACE_CLEARANCE = 0.72;
const START_Y = -4.5;
const LOOK_SENSITIVITY = 0.00215;
const TOUCH_LOOK_MULTIPLIER = 1.5;
const MAX_PITCH = THREE.MathUtils.degToRad(86);
const START_PITCH = THREE.MathUtils.degToRad(60);
const JOYSTICK_RADIUS = 58;
const BASE_FOV_LANDSCAPE = 70;
const BASE_FOV_PORTRAIT = 76;
const TAU = Math.PI * 2;
const CAVE_SCALE_XZ = 7.45;
const CAVE_MID_Y = (SURFACE_Y + CAN_BOTTOM) * 0.5;
const CAVE_HALF_HEIGHT = (SURFACE_Y - CAN_BOTTOM) * 0.5;
const YIELD_LOAD_THRESHOLD = 0.62;
const YIELD_STRAIN_RATE = 1.82;
const YIELD_BREAK_DURATION = 0.145;
const YIELD_REGRIP_DURATION = 0.34;
const NUTRIENTS_REQUIRED = 3;
const MILK_EXIT_TRIGGER_RADIUS = 1.48;
const DUNG_EXIT_TRIGGER_RADIUS = 1.08;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointer = window.matchMedia("(pointer: coarse)");

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const LOCAL_Z = new THREE.Vector3(0, 0, 1);
const tempA = new THREE.Vector3();
const tempB = new THREE.Vector3();
const tempC = new THREE.Vector3();
const tempD = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, -1);
const right = new THREE.Vector3(1, 0, 0);
const acceleration = new THREE.Vector3();
const visualPosition = new THREE.Vector3();
const passageCenter = new THREE.Vector3();
const radialNormal = new THREE.Vector3();
const segmentDirection = new THREE.Vector3();
const segmentMidpoint = new THREE.Vector3();
const segmentQuaternion = new THREE.Quaternion();
const upAxis = new THREE.Vector3(0, 1, 0);
const ringQuaternion = new THREE.Quaternion();

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(2490722);
let runtimeRandom = mulberry32(24907220);

function smoothPulse(value, center, width) {
  const distance = (value - center) / width;
  return Math.exp(-distance * distance);
}

function pathCenterAt(y, target) {
  const t = THREE.MathUtils.clamp((y - CAN_BOTTOM) / (SURFACE_Y - CAN_BOTTOM), 0, 1);
  return target.set(
    Math.sin(t * Math.PI * 1.72 - 0.72) * 0.72 + Math.sin(t * 6.1) * 0.18,
    y,
    Math.cos(t * Math.PI * 1.36 + 0.38) * 0.62 + Math.sin(t * 7.4) * 0.15,
  );
}

function pathRadiusAt(y) {
  const t = THREE.MathUtils.clamp((y - CAN_BOTTOM) / (SURFACE_Y - CAN_BOTTOM), 0, 1);
  const chamberOne = smoothPulse(y, -1.75, 1.65) * 0.9;
  const chamberTwo = smoothPulse(y, 4.35, 1.35) * 0.58;
  const throat = smoothPulse(y, 7.45, 0.85) * 0.32;
  return 1.62 + Math.sin(t * Math.PI * 5.2 + 0.6) * 0.18 + chamberOne + chamberTwo - throat;
}

const START_POSITION = pathCenterAt(START_Y, new THREE.Vector3()).add(new THREE.Vector3(0.12, 0, 0.18));
const EXIT_POSITION = pathCenterAt(SURFACE_Y, new THREE.Vector3()).add(new THREE.Vector3(-0.08, 0.06, 0.06));
const DUNG_START_POSITION = new THREE.Vector3(0, -0.55, 1.2);
const DUNG_EXIT_POSITION = new THREE.Vector3(0, 5.23, 0.22);
const DUNG_VOLUMES = [
  {
    id: "hub",
    a: new THREE.Vector3(0, 0, 0),
    b: new THREE.Vector3(0, 0, 0),
    radius: 2.35,
    color: 0x32150d,
  },
  {
    id: "corn-chapel",
    a: new THREE.Vector3(-1.05, 0.12, 0.26),
    b: new THREE.Vector3(-4.35, 0.35, 1.42),
    radius: 1.25,
    color: 0x5e2a12,
  },
  {
    id: "beet-artery",
    a: new THREE.Vector3(0.12, 0.98, -0.48),
    b: new THREE.Vector3(0.58, 4.02, -3.02),
    radius: 1.22,
    color: 0x45101f,
  },
  {
    id: "seed-comb",
    a: new THREE.Vector3(1.05, -0.55, 0.34),
    b: new THREE.Vector3(4.42, -2.22, 2.02),
    radius: 1.25,
    color: 0x31300f,
  },
  {
    id: "exit-chimney",
    a: new THREE.Vector3(0, 1.05, 0.02),
    b: new THREE.Vector3(0, 4.05, 0.2),
    radius: 1.18,
    color: 0x25151d,
  },
];

function setSegment(mesh, start, end) {
  segmentDirection.copy(end).sub(start);
  const length = segmentDirection.length();
  if (length < 0.0001) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  segmentMidpoint.copy(start).add(end).multiplyScalar(0.5);
  segmentQuaternion.setFromUnitVectors(upAxis, segmentDirection.multiplyScalar(1 / length));
  mesh.position.copy(segmentMidpoint);
  mesh.quaternion.copy(segmentQuaternion);
  mesh.scale.set(1, length, 1);
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: "high-performance",
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer.matches ? 1.1 : 1.45));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.83;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x160804);
scene.fog = new THREE.FogExp2(0x4a1d08, 0.052);

const camera = new THREE.PerspectiveCamera(BASE_FOV_LANDSCAPE, 1, 0.055, 42);
camera.rotation.order = "YXZ";

const viewScene = new THREE.Scene();
const viewCamera = new THREE.PerspectiveCamera(BASE_FOV_LANDSCAPE, 1, 0.04, 5);
viewCamera.rotation.order = "YXZ";

function makeNoiseTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    const value = Math.floor(random() * 256);
    data[index * 4] = value;
    data[index * 4 + 1] = Math.floor(random() * 256);
    data[index * 4 + 2] = Math.floor(random() * 256);
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const noiseTexture = makeNoiseTexture();

class MilkMediumPass extends Pass {
  constructor(activeCamera) {
    super();
    this.needsSwap = true;
    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      tNoise: { value: noiseTexture },
      uTime: { value: 0 },
      uNear: { value: activeCamera.near },
      uFar: { value: activeCamera.far },
      uSpeed: { value: 0 },
      uStrain: { value: 0 },
      uKick: { value: 0 },
      uWall: { value: 0 },
      uBiome: { value: 0 },
      uReducedMotion: { value: reduceMotion.matches ? 1 : 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    this.material = new THREE.ShaderMaterial({
      name: "MilkMedium",
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform sampler2D tNoise;
        uniform float uTime;
        uniform float uNear;
        uniform float uFar;
        uniform float uSpeed;
        uniform float uStrain;
        uniform float uKick;
        uniform float uWall;
        uniform float uBiome;
        uniform float uReducedMotion;
        uniform vec2 uResolution;
        varying vec2 vUv;

        float viewDistanceAt(vec2 uv) {
          float depth = texture2D(tDepth, uv).x;
          float viewZ = perspectiveDepthToViewZ(depth, uNear, uFar);
          return min(-viewZ, uFar);
        }

        void main() {
          vec2 centered = vUv - 0.5;
          float edge = smoothstep(0.18, 0.74, length(centered * vec2(1.0, uResolution.y / max(1.0, uResolution.x))));
          vec2 flowA = vUv * vec2(2.1, 3.4) + vec2(uTime * 0.014, -uTime * 0.025);
          vec2 flowB = vUv.yx * vec2(6.3, 4.8) + vec2(-uTime * 0.031, uTime * 0.018);
          vec2 nA = texture2D(tNoise, flowA).rg - 0.5;
          vec2 nB = texture2D(tNoise, flowB).gb - 0.5;
          vec2 noiseFlow = nA * 0.68 + nB * 0.32;
          float motion = (0.00055 + uSpeed * 0.00046 + uStrain * 0.0012 + uKick * 0.0046) * (1.0 - uReducedMotion * 0.82);
          vec2 warpedUv = clamp(vUv + noiseFlow * motion * (0.5 + edge), vec2(0.002), vec2(0.998));
          float baseDepth = viewDistanceAt(vUv);
          float warpedDepth = viewDistanceAt(warpedUv);
          if (abs(baseDepth - warpedDepth) > 1.2) warpedUv = mix(vUv, warpedUv, 0.12);

          vec2 chroma = normalize(centered + vec2(0.0001)) * uKick * 0.0018 * (1.0 - uReducedMotion);
          vec3 source;
          source.r = texture2D(tDiffuse, clamp(warpedUv + chroma, 0.0, 1.0)).r;
          source.g = texture2D(tDiffuse, warpedUv).g;
          source.b = texture2D(tDiffuse, clamp(warpedUv - chroma, 0.0, 1.0)).b;

          float densityNoise = texture2D(tNoise, flowA * 0.72 + nB * 0.08).r;
          float density = mix(0.022, 0.044, densityNoise) + edge * mix(0.014, 0.024, uBiome);
          float transmittance = exp(-density * min(baseDepth, 22.0));
          vec3 milkDepth = mix(vec3(0.045, 0.016, 0.004), vec3(0.31, 0.12, 0.025), densityNoise);
          vec3 dungDepth = mix(vec3(0.018, 0.007, 0.006), vec3(0.17, 0.055, 0.025), densityNoise);
          vec3 deepMedium = mix(milkDepth, dungDepth, uBiome);
          vec3 color = mix(deepMedium, source, mix(0.26, 0.34, uBiome) + transmittance * mix(0.74, 0.66, uBiome));

          float nearSurface = 1.0 - smoothstep(0.18, 2.15, baseDepth);
          float marbleA = sin(vUv.x * 31.0 + vUv.y * 17.0 + densityNoise * 5.0 + uTime * 0.16);
          float marbleB = sin(vUv.y * 43.0 - vUv.x * 11.0 - uTime * 0.11);
          float marbling = 0.5 + 0.5 * marbleA * marbleB;
          color *= 0.76 + marbling * 0.34 * nearSurface;
          float contactRadius = length(centered * vec2(1.0, uResolution.y / max(1.0, uResolution.x)));
          float stickyFold = sin(vUv.x * 23.0 + densityNoise * 8.0 + uTime * 0.22)
            * sin(vUv.y * 17.0 - densityNoise * 5.0 - uTime * 0.16);
          stickyFold *= exp(-contactRadius * 3.6);
          color += mix(vec3(0.42, 0.22, 0.055), vec3(0.22, 0.12, 0.018), uBiome)
            * pow(max(0.0, marbling), 7.0) * nearSurface * 0.36;
          color += mix(vec3(0.28, 0.13, 0.025), vec3(0.08, 0.16, 0.018), uBiome)
            * stickyFold * uWall * nearSurface * 0.44;

          float bacteria = pow(max(0.0, sin(vUv.x * 41.0 + densityNoise * 9.0)
            * sin(vUv.y * 29.0 - uTime * 0.23)), 6.0) * uBiome;
          color += vec3(0.18, 0.34, 0.045) * bacteria * (0.08 + nearSurface * 0.3);

          float coldShaft = pow(max(0.0, 1.0 - length((vUv - vec2(0.52, 0.035)) * vec2(1.8, 1.0))), 4.0);
          color += mix(vec3(0.28, 0.56, 0.72), vec3(0.22, 0.72, 0.86), uBiome)
            * coldShaft * (0.08 + transmittance * 0.24);
          color *= 1.0 - edge * (0.21 + densityNoise * 0.08);
          float grain = texture2D(tNoise, vUv * uResolution / 78.0 + uTime * 0.001).r - 0.5;
          color += grain * 0.007;
          gl_FragColor = vec4(max(color, 0.0), 1.0);
        }
      `,
    });
    this.fullscreenQuad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    this.uniforms.uResolution.value.set(width, height);
  }

  render(activeRenderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    activeRenderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) activeRenderer.clear();
    this.fullscreenQuad.render(activeRenderer);
  }
}

const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
  type: coarsePointer.matches ? THREE.UnsignedByteType : THREE.HalfFloatType,
  depthBuffer: true,
});
renderTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
const composer = new EffectComposer(renderer, renderTarget);
const renderPass = new RenderPass(scene, camera);
const milkPass = new MilkMediumPass(camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.52, 1.08);
bloomPass.enabled = !coarsePointer.matches && !reduceMotion.matches;
composer.addPass(renderPass);
composer.addPass(milkPass);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const state = {
  mode: "swimming",
  time: 0,
  position: START_POSITION.clone(),
  previousPosition: START_POSITION.clone(),
  velocity: new THREE.Vector3(),
  inputWorld: new THREE.Vector3(),
  inputStrength: 0,
  strafeAxis: 0,
  forwardAxis: 0,
  verticalAxis: 0,
  yaw: 0,
  pitch: START_PITCH,
  targetYaw: 0,
  targetPitch: START_PITCH,
  distanceTravelled: 0,
  touchingWall: false,
  touchingBottom: false,
  touchingSurface: false,
  wallPressure: 0,
  passageRadius: pathRadiusAt(START_Y) - PLAYER_CLEARANCE,
  passageRegion: "milk-chimney",
  usedInput: false,
  pointerLocked: false,
  paused: false,
  manualUntil: 0,
  baseFov: BASE_FOV_LANDSCAPE,
  yieldPhase: "idle",
  yieldStrain: 0,
  yieldDirection: new THREE.Vector3(0, 0, -1),
  yieldPhaseTime: 0,
  yieldCount: 0,
  compressionVisual: 0,
  cameraKick: 0,
  wakePower: 0,
  tunnelSegments: 0,
  lastYieldSpeed: 0,
  muted: false,
};

const campaign = {
  levelIndex: 0,
  flow: "playing",
  transitionTime: 0,
  chapterTime: 0,
  levelElapsed: 0,
  runElapsed: 0,
  completionTimes: [null, null],
  collectedIds: [],
  nutrientsCollected: 0,
  exitUnlocked: false,
  exitDamage: 0,
  lastExitAttempt: "none",
  lockedAttemptCount: 0,
  activeTargetId: null,
  nearNutrientId: null,
  nutrientPulse: 0,
  resetCount: 0,
  gasPushCount: 0,
  lastGasId: null,
  lastGasImpulse: new THREE.Vector3(),
  gasRecovery: 0,
  lastCollectionYield: -1,
};

const keyboard = new Set();
const touchMove = {
  id: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  x: 0,
  y: 0,
};
const touchLook = { id: null, lastX: 0, lastY: 0 };
const mouseDrag = { id: null, lastX: 0, lastY: 0 };
const ascendPointers = new Set();
const descendPointers = new Set();

let lastFrameTime = performance.now();
let accumulator = 0;
let trailClock = 0;
let audioContext = null;
let masterGain = null;
let strainOscillator = null;
let strainGain = null;

function addLights() {
  scene.add(new THREE.HemisphereLight(0xffd796, 0x120402, 0.42));

  const exitLight = new THREE.SpotLight(0xd7f5ff, 24, 34, 0.27, 0.66, 1.35);
  exitLight.position.copy(EXIT_POSITION).add(new THREE.Vector3(0, 1.7, 0));
  exitLight.target.position.copy(pathCenterAt(-4.5, new THREE.Vector3()));
  scene.add(exitLight, exitLight.target);

  const warmBounce = new THREE.PointLight(0xff9f36, 3.8, 8, 1.85);
  warmBounce.position.copy(pathCenterAt(-1.7, new THREE.Vector3())).add(new THREE.Vector3(0.8, 0, 0.4));
  scene.add(warmBounce);

  const deepGlow = new THREE.PointLight(0xd75116, 2.8, 7, 1.9);
  deepGlow.position.copy(pathCenterAt(-7.8, new THREE.Vector3()));
  scene.add(deepGlow);
  return { exitLight, warmBounce, deepGlow };
}

const worldLights = addLights();

function createCanInterior() {
  const group = new THREE.Group();
  const height = SURFACE_Y - CAN_BOTTOM + 1.3;
  const wallMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },
      uCold: { value: new THREE.Color(0x7c8a89) },
      uWarm: { value: new THREE.Color(0x34231b) },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uCold;
      uniform vec3 uWarm;
      varying vec3 vPosition;
      varying vec3 vNormal;
      void main() {
        float angle = atan(vPosition.z, vPosition.x) / 6.2831853 + 0.5;
        float panel = smoothstep(0.025, 0.0, abs(fract(angle * 7.0) - 0.5) - 0.475);
        float band = smoothstep(0.07, 0.0, abs(fract((vPosition.y + 10.0) / 4.85) - 0.5) - 0.43);
        float scratch = pow(max(0.0, sin(angle * 820.0 + sin(vPosition.y * 4.0) * 2.0)), 34.0);
        float causticA = sin(vPosition.y * 2.2 + angle * 38.0 + uTime * 0.46);
        float causticB = sin(vPosition.y * 3.7 - angle * 51.0 - uTime * 0.31);
        float caustic = pow(max(0.0, causticA * causticB), 3.0);
        float heightLight = smoothstep(-10.0, 9.8, vPosition.y);
        vec3 color = mix(uWarm, uCold, 0.14 + heightLight * 0.43);
        color *= 0.56 + panel * 0.14 + band * 0.1;
        color += vec3(0.72, 0.42, 0.16) * caustic * (0.16 + heightLight * 0.48);
        color += scratch * vec3(0.2, 0.17, 0.13);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(CAN_RADIUS, CAN_RADIUS, height, 80, 1, true),
    wallMaterial,
  );
  wall.position.y = CAVE_MID_Y;
  group.add(wall);

  const bottomMaterial = new THREE.MeshStandardMaterial({
    color: 0x21100a,
    roughness: 0.7,
    metalness: 0.58,
    side: THREE.DoubleSide,
  });
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(CAN_RADIUS, 80), bottomMaterial);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = CAN_BOTTOM;
  group.add(bottom);

  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0x6d7470,
    roughness: 0.3,
    metalness: 0.88,
  });
  const upperRim = new THREE.Mesh(new THREE.TorusGeometry(CAN_RADIUS - 0.06, 0.14, 10, 96), rimMaterial);
  upperRim.rotation.x = Math.PI / 2;
  upperRim.position.y = SURFACE_Y + 0.18;
  group.add(upperRim);

  const bottomDimple = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 8, 64), rimMaterial);
  bottomDimple.rotation.x = Math.PI / 2;
  bottomDimple.position.y = CAN_BOTTOM + 0.035;
  group.add(bottomDimple);

  const causticMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPosition;
      void main() {
        float angle = atan(vPosition.z, vPosition.x);
        float a = sin(angle * 13.0 + vPosition.y * 2.1 + uTime * 0.42);
        float b = sin(angle * 21.0 - vPosition.y * 3.4 - uTime * 0.29);
        float ridge = pow(max(0.0, a * b), 5.0);
        float surfaceBias = smoothstep(-5.0, 9.4, vPosition.y);
        gl_FragColor = vec4(0.56, 0.76, 0.72, ridge * surfaceBias * 0.16);
      }
    `,
  });
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(CAN_RADIUS - 0.08, CAN_RADIUS - 0.08, height - 0.3, 64, 1, true),
    causticMaterial,
  );
  sleeve.position.y = CAVE_MID_Y;
  sleeve.renderOrder = 2;
  group.add(sleeve);

  scene.add(group);
  return { group, wallMaterial, causticMaterial };
}

const can = createCanInterior();

function createMilkCave() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xd0903e,
    emissive: 0x2b0b02,
    emissiveIntensity: 0.08,
    roughness: 0.27,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    sheen: 0.66,
    sheenColor: new THREE.Color(0xffd789),
    sheenRoughness: 0.56,
    side: THREE.DoubleSide,
  });
  const cave = new MarchingCubes(46, material, false, false, 78000);
  cave.isolation = 80;

  const ringCount = 20;
  const ballsPerRing = 10;
  const ballStrength = 0.16;
  const subtract = 12;
  const estimatedSurfaceRadius = 0.78;
  for (let ring = 0; ring < ringCount; ring += 1) {
    const y = CAN_BOTTOM + 0.35 + (ring / (ringCount - 1)) * (SURFACE_Y - CAN_BOTTOM - 0.45);
    const center = pathCenterAt(y, tempA);
    const innerRadius = pathRadiusAt(y) + 0.12;
    const ringRadius = innerRadius + estimatedSurfaceRadius;
    const yNorm = (y - CAVE_MID_Y) / (CAVE_HALF_HEIGHT * 2) + 0.5;
    const phase = ring * 0.37;
    for (let index = 0; index < ballsPerRing; index += 1) {
      const angle = (index / ballsPerRing) * TAU + phase;
      const wobble = Math.sin(index * 2.7 + ring * 1.4) * 0.17;
      const worldX = center.x + Math.cos(angle) * (ringRadius + wobble);
      const worldZ = center.z + Math.sin(angle) * (ringRadius - wobble * 0.5);
      cave.addBall(
        0.5 + worldX / (CAVE_SCALE_XZ * 2),
        yNorm,
        0.5 + worldZ / (CAVE_SCALE_XZ * 2),
        ballStrength * (0.9 + random() * 0.2),
        subtract,
      );
    }
  }
  cave.update();
  cave.scale.set(CAVE_SCALE_XZ, CAVE_HALF_HEIGHT, CAVE_SCALE_XZ);
  cave.position.y = CAVE_MID_Y;
  cave.geometry.computeBoundingSphere();
  scene.add(cave);
  return cave;
}

const milkCave = createMilkCave();

function createFluidCurtains() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffc566) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float wave = sin(p.y * 2.7 + p.x * 1.3 + uTime * 0.52) * 0.5 + 0.5;
        p.z += (wave - 0.5) * 0.16 + sin(p.x * 4.1 - uTime * 0.3) * 0.05;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        edge *= smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
        float veins = pow(0.5 + 0.5 * sin(vUv.y * 31.0 + vUv.x * 9.0), 5.0);
        float alpha = edge * (0.055 + vWave * 0.1 + veins * 0.045);
        gl_FragColor = vec4(uColor * (0.78 + vWave * 0.36), alpha);
      }
    `,
  });
  const geometry = new THREE.PlaneGeometry(2.6, 3.9, 18, 22);
  const curtains = [];
  const placements = [
    [-3.2, 0.42, 0.4, -0.32],
    [-0.25, -0.5, 0.78, 0.58],
    [2.65, 0.55, -0.62, -0.72],
    [5.45, -0.62, 0.35, 0.46],
    [7.35, 0.48, 0.3, -0.22],
  ];
  for (const [y, xOffset, zOffset, rotation] of placements) {
    const center = pathCenterAt(y, new THREE.Vector3());
    const curtain = new THREE.Mesh(geometry, material);
    curtain.position.set(center.x + xOffset, y, center.z + zOffset);
    curtain.rotation.y = rotation;
    curtain.rotation.z = rotation * 0.2;
    curtain.renderOrder = 4;
    curtains.push(curtain);
    scene.add(curtain);
  }
  return { curtains, material };
}

const fluidCurtains = createFluidCurtains();

function createSurfaceAndExit() {
  const group = new THREE.Group();
  group.position.set(EXIT_POSITION.x, SURFACE_Y, EXIT_POSITION.z);

  const membraneMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPush: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uPush;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        vec2 centered = uv - 0.5;
        float radial = length(centered);
        float wave = sin(radial * 35.0 - uTime * 1.2) * 0.035;
        wave += sin(p.x * 1.8 + p.y * 1.4 + uTime * 0.38) * 0.045;
        p.z += wave - exp(-radial * radial * 42.0) * uPush * 0.24;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vec2 centered = vUv - 0.5;
        float radial = length(centered);
        float irregular = sin(atan(centered.y, centered.x) * 7.0 + uTime * 0.18) * 0.018;
        float hole = radial + irregular;
        if (hole < 0.135) discard;
        float rim = 1.0 - smoothstep(0.135, 0.205, hole);
        float outer = smoothstep(0.5, 0.42, radial);
        float bands = 0.5 + 0.5 * sin(radial * 48.0 - uTime * 0.9);
        vec3 color = mix(vec3(0.72, 0.31, 0.055), vec3(1.0, 0.79, 0.35), bands * 0.42 + rim * 0.46);
        float alpha = outer * (0.38 + bands * 0.15 + rim * 0.38 + abs(vWave) * 2.0);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const membrane = new THREE.Mesh(new THREE.CircleGeometry(2.75, 96), membraneMaterial);
  membrane.rotation.x = Math.PI / 2;
  membrane.renderOrder = 6;
  group.add(membrane);

  const apertureMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.25, 0.45, 0.55),
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  const aperture = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), apertureMaterial);
  aperture.rotation.x = Math.PI / 2;
  aperture.position.y = 0.08;
  group.add(aperture);

  const glowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float radial = length(vUv - 0.5) * 2.0;
        float halo = pow(max(0.0, 1.0 - radial), 2.4);
        gl_FragColor = vec4(0.4, 0.72, 0.88, halo * 0.28);
      }
    `,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.92, 64), glowMaterial);
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 0.055;
  glow.renderOrder = 5;
  group.add(glow);

  const shaftMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPosition;
      void main() {
        float heightFade = smoothstep(-9.0, 7.5, vPosition.y) * smoothstep(9.0, 5.5, vPosition.y);
        float radialFade = smoothstep(2.7, 0.15, length(vPosition.xz));
        float pulse = 0.82 + sin(vPosition.y * 0.7 + uTime * 0.7) * 0.12;
        gl_FragColor = vec4(0.44, 0.82, 1.0, heightFade * radialFade * pulse * 0.1);
      }
    `,
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 3.1, 18.4, 32, 1, true), shaftMaterial);
  shaft.position.y = -8.8;
  group.add(shaft);

  const lidMaterial = new THREE.MeshStandardMaterial({
    color: 0xa9b0aa,
    emissive: 0x101817,
    emissiveIntensity: 0.12,
    metalness: 0.86,
    roughness: 0.23,
    side: THREE.DoubleSide,
  });
  const lidCrescent = new THREE.Mesh(
    new THREE.RingGeometry(0.74, 2.42, 72, 1, -0.18, Math.PI * 1.56),
    lidMaterial,
  );
  lidCrescent.rotation.x = Math.PI / 2;
  lidCrescent.rotation.z = -0.34;
  lidCrescent.position.y = 0.125;
  group.add(lidCrescent);

  const flap = new THREE.Mesh(
    new THREE.CircleGeometry(1.28, 56, 0.1, Math.PI * 1.36),
    lidMaterial,
  );
  flap.rotation.x = Math.PI / 2 - 0.42;
  flap.rotation.z = -0.54;
  flap.position.set(-1.15, 0.62, 0.42);
  group.add(flap);

  const rimSegments = 32;
  const rimPositions = [];
  const rimIndices = [];
  for (let index = 0; index <= rimSegments; index += 1) {
    const angle = (index / rimSegments) * TAU;
    const innerRadius = 0.55 + Math.sin(angle * 5.0 + 0.8) * 0.055 + Math.sin(angle * 11.0) * 0.018;
    const outerRadius = 0.79 + Math.sin(angle * 7.0 - 0.4) * 0.028;
    rimPositions.push(
      Math.cos(angle) * innerRadius, 0.112, Math.sin(angle) * innerRadius,
      Math.cos(angle) * outerRadius, 0.112, Math.sin(angle) * outerRadius,
    );
    if (index < rimSegments) {
      const offset = index * 2;
      rimIndices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    }
  }
  const tornRimGeometry = new THREE.BufferGeometry();
  tornRimGeometry.setAttribute("position", new THREE.Float32BufferAttribute(rimPositions, 3));
  tornRimGeometry.setIndex(rimIndices);
  tornRimGeometry.computeVertexNormals();
  const tornRim = new THREE.Mesh(tornRimGeometry, lidMaterial);
  group.add(tornRim);

  const scoreLineMaterial = new THREE.MeshBasicMaterial({
    color: 0x303a38,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });
  const scoreLine = new THREE.Mesh(
    new THREE.TorusGeometry(1.73, 0.026, 6, 72, Math.PI * 1.6),
    scoreLineMaterial,
  );
  scoreLine.rotation.x = Math.PI / 2;
  scoreLine.rotation.z = -0.48;
  scoreLine.position.y = 0.142;
  group.add(scoreLine);

  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.075, 8, 36), lidMaterial);
  tab.rotation.x = Math.PI / 2;
  tab.rotation.z = -0.2;
  tab.scale.y = 1.38;
  tab.position.set(0.96, 0.17, 0.32);
  group.add(tab);

  const tabTongue = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), lidMaterial);
  tabTongue.rotation.x = Math.PI / 2;
  tabTongue.position.set(0.96, 0.176, 0.13);
  group.add(tabTongue);

  scene.add(group);
  return { group, membraneMaterial, apertureMaterial, shaftMaterial };
}

const surface = createSurfaceAndExit();

function createSugarGrave() {
  const group = new THREE.Group();
  const y = -1.55;
  const center = pathCenterAt(y, new THREE.Vector3());
  group.position.set(center.x + 1.55, y + 0.25, center.z - 0.42);
  group.scale.setScalar(0.56);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffd98d,
    emissive: 0x8b3b0c,
    emissiveIntensity: 0.16,
    roughness: 0.12,
    metalness: 0,
    transmission: 0.08,
    thickness: 0.5,
    ior: 1.34,
    transparent: true,
    opacity: 0.9,
  });
  const geometry = new THREE.OctahedronGeometry(0.34, 0);
  for (let index = 0; index < 9; index += 1) {
    const crystal = new THREE.Mesh(geometry, material);
    const angle = (index / 9) * TAU;
    crystal.position.set(Math.cos(angle) * (0.18 + random() * 0.42), random() * 0.38, Math.sin(angle) * (0.18 + random() * 0.42));
    crystal.scale.set(0.48 + random() * 0.45, 1.2 + random() * 2.4, 0.48 + random() * 0.45);
    crystal.rotation.set((random() - 0.5) * 0.6, random() * TAU, (random() - 0.5) * 0.42);
    group.add(crystal);
  }
  scene.add(group);
  return group;
}

const sugarGrave = createSugarGrave();

const milkLevelObjects = [
  can.group,
  milkCave,
  ...fluidCurtains.curtains,
  surface.group,
  sugarGrave,
];

function closestPointOnVolumeAxis(point, volume, target) {
  tempD.copy(volume.b).sub(volume.a);
  const lengthSq = tempD.lengthSq();
  if (lengthSq < 0.0001) return target.copy(volume.a);
  const amount = THREE.MathUtils.clamp(tempA.copy(point).sub(volume.a).dot(tempD) / lengthSq, 0, 1);
  return target.copy(volume.a).addScaledVector(tempD, amount);
}

function pointInsideDungVolume(point, volume, inset = 0) {
  const axis = new THREE.Vector3();
  const direction = new THREE.Vector3().copy(volume.b).sub(volume.a);
  const lengthSq = direction.lengthSq();
  if (lengthSq < 0.0001) axis.copy(volume.a);
  else {
    const amount = THREE.MathUtils.clamp(new THREE.Vector3().copy(point).sub(volume.a).dot(direction) / lengthSq, 0, 1);
    axis.copy(volume.a).addScaledVector(direction, amount);
  }
  return axis.distanceTo(point) < volume.radius - inset;
}

function createFilteredDungGeometry(volume, volumeIndex) {
  const direction = new THREE.Vector3().copy(volume.b).sub(volume.a);
  const length = direction.length();
  const source = length < 0.01
    ? new THREE.SphereGeometry(volume.radius, 36, 24)
    : new THREE.CapsuleGeometry(volume.radius, length, 10, 28, 2);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  if (length >= 0.01) rotation.setFromUnitVectors(WORLD_UP, direction.clone().normalize());
  matrix.compose(
    new THREE.Vector3().copy(volume.a).add(volume.b).multiplyScalar(0.5),
    rotation,
    new THREE.Vector3(1, 1, 1),
  );
  source.applyMatrix4(matrix);
  const nonIndexed = source.toNonIndexed();
  source.dispose();
  const sourcePositions = nonIndexed.getAttribute("position");
  const positions = [];
  const centroid = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const axisPoint = new THREE.Vector3();
  const radial = new THREE.Vector3();
  for (let index = 0; index < sourcePositions.count; index += 3) {
    centroid.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner += 1) {
      centroid.x += sourcePositions.getX(index + corner);
      centroid.y += sourcePositions.getY(index + corner);
      centroid.z += sourcePositions.getZ(index + corner);
    }
    centroid.multiplyScalar(1 / 3);
    let buried = false;
    for (let otherIndex = 0; otherIndex < DUNG_VOLUMES.length; otherIndex += 1) {
      if (otherIndex === volumeIndex) continue;
      if (pointInsideDungVolume(centroid, DUNG_VOLUMES[otherIndex], 0.035)) {
        buried = true;
        break;
      }
    }
    if (buried) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      vertex.fromBufferAttribute(sourcePositions, index + corner);
      const localDirection = new THREE.Vector3().copy(volume.b).sub(volume.a);
      const localLengthSq = localDirection.lengthSq();
      if (localLengthSq < 0.0001) axisPoint.copy(volume.a);
      else {
        const amount = THREE.MathUtils.clamp(vertex.clone().sub(volume.a).dot(localDirection) / localLengthSq, 0, 1);
        axisPoint.copy(volume.a).addScaledVector(localDirection, amount);
      }
      radial.copy(vertex).sub(axisPoint).normalize();
      const wrinkle = Math.sin(vertex.x * 5.3 + vertex.y * 3.7)
        * Math.sin(vertex.z * 4.1 - vertex.y * 2.2) * 0.045;
      vertex.addScaledVector(radial, wrinkle);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  }
  nonIndexed.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createDungWorld() {
  const group = new THREE.Group();
  group.visible = false;
  const shellMaterials = [];
  DUNG_VOLUMES.forEach((volume, index) => {
    const material = new THREE.MeshPhysicalMaterial({
      color: volume.color,
      emissive: index === 2 ? 0x240009 : index === 3 ? 0x101600 : 0x180603,
      emissiveIntensity: 0.16,
      roughness: index === 4 ? 0.72 : 0.48,
      metalness: 0,
      clearcoat: index === 4 ? 0.08 : 0.24,
      clearcoatRoughness: 0.5,
      sheen: 0.28,
      sheenColor: new THREE.Color(index === 3 ? 0x89a329 : 0xc46c32),
      sheenRoughness: 0.7,
      side: THREE.BackSide,
    });
    shellMaterials.push(material);
    const shellMesh = new THREE.Mesh(createFilteredDungGeometry(volume, index), material);
    group.add(shellMesh);
  });

  const obstacles = [];
  const cornMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf6c84a,
    emissive: 0x8a2b00,
    emissiveIntensity: 0.24,
    roughness: 0.28,
    clearcoat: 0.38,
  });
  const kernelGeometry = new THREE.SphereGeometry(0.32, 16, 10);
  for (let index = 0; index < 7; index += 1) {
    const kernel = new THREE.Mesh(kernelGeometry, cornMaterial);
    const angle = (index / 7) * TAU + 0.22;
    kernel.position.set(
      -4.1 + Math.cos(angle) * 0.78,
      0.34 + Math.sin(angle) * 0.7,
      1.36 + Math.sin(angle * 2.0) * 0.35,
    );
    kernel.scale.set(0.82, 1.5, 0.68);
    kernel.rotation.set(angle * 0.14, angle, -angle * 0.19);
    obstacles.push({ id: `corn-rib-${index}`, position: kernel.position, radius: 0.3 });
    group.add(kernel);
  }

  const beetMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xad174c,
    emissive: 0x5f001e,
    emissiveIntensity: 0.42,
    roughness: 0.22,
    clearcoat: 0.64,
    transparent: true,
    opacity: 0.9,
  });
  const arteryCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.35, 0.85, -0.88),
    new THREE.Vector3(0.82, 1.85, -1.1),
    new THREE.Vector3(-0.22, 3.02, -2.2),
    new THREE.Vector3(0.72, 4.28, -3.25),
  ]);
  const artery = new THREE.Mesh(new THREE.TubeGeometry(arteryCurve, 54, 0.1, 8, false), beetMaterial);
  group.add(artery);
  for (let index = 0; index < 7; index += 1) {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.12 + index % 2 * 0.05, 12, 8), beetMaterial);
    bead.position.copy(arteryCurve.getPoint(index / 6)).add(new THREE.Vector3(index % 2 ? 0.19 : -0.16, 0, 0.12));
    group.add(bead);
  }

  const seedMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd8c49b,
    emissive: 0x253000,
    emissiveIntensity: 0.18,
    roughness: 0.5,
    clearcoat: 0.18,
  });
  const mucusMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xa6cc36,
    emissive: 0x274a04,
    emissiveIntensity: 0.42,
    roughness: 0.3,
    clearcoat: 0.58,
  });
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * TAU;
    const hull = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 8), seedMaterial);
    hull.position.set(
      4.12 + Math.cos(angle) * 0.82,
      -2.07 + Math.sin(angle) * 0.62,
      1.95 + Math.sin(angle * 2.0) * 0.42,
    );
    hull.scale.set(1.45, 0.38, 0.68);
    hull.rotation.set(angle * 0.22, -angle * 0.4, angle);
    obstacles.push({ id: `seed-hull-${index}`, position: hull.position, radius: 0.27 });
    group.add(hull);
  }
  for (let index = 0; index < 4; index += 1) {
    const fiberCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.2, -0.55 + index * 0.11, 0.2),
      new THREE.Vector3(2.35, -0.72 - index * 0.2, 0.85 + index * 0.13),
      new THREE.Vector3(3.5, -1.55 + index * 0.1, 1.38),
      new THREE.Vector3(4.68, -2.2 + index * 0.08, 2.12),
    ]);
    const fiber = new THREE.Mesh(new THREE.TubeGeometry(fiberCurve, 38, 0.045 + index * 0.008, 7, false), mucusMaterial);
    group.add(fiber);
  }

  const crustMaterial = new THREE.MeshStandardMaterial({
    color: 0x170f15,
    emissive: 0x071118,
    emissiveIntensity: 0.22,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
  const porcelainMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xddf6ff,
    emissive: 0x63d8ff,
    emissiveIntensity: 0.5,
    roughness: 0.08,
    clearcoat: 0.85,
    side: THREE.DoubleSide,
  });
  const exitMembraneMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x263415,
    emissive: 0x071e0c,
    emissiveIntensity: 0.2,
    roughness: 0.36,
    clearcoat: 0.65,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  const exitGroup = new THREE.Group();
  exitGroup.position.copy(DUNG_EXIT_POSITION);
  const porcelainMoon = new THREE.Mesh(new THREE.CircleGeometry(0.73, 48), porcelainMaterial);
  porcelainMoon.rotation.x = Math.PI / 2;
  porcelainMoon.position.y = 0.055;
  exitGroup.add(porcelainMoon);
  const exitMembrane = new THREE.Mesh(new THREE.CircleGeometry(0.83, 48), exitMembraneMaterial);
  exitMembrane.rotation.x = Math.PI / 2;
  exitGroup.add(exitMembrane);
  const crust = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.14, 7, 42), crustMaterial);
  crust.rotation.x = Math.PI / 2;
  exitGroup.add(crust);
  for (let index = 0; index < 9; index += 1) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.22 + index % 3 * 0.045), crustMaterial);
    const angle = (index / 9) * TAU;
    shard.position.set(Math.cos(angle) * 0.94, 0.02, Math.sin(angle) * 0.94);
    shard.rotation.set(angle, angle * 0.5, -angle);
    shard.scale.set(0.65, 1.5, 0.55);
    exitGroup.add(shard);
  }
  group.add(exitGroup);

  const gasMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x99c93b,
    emissive: 0x38560a,
    emissiveIntensity: 0.46,
    roughness: 0.12,
    transmission: 0.18,
    thickness: 0.8,
    transparent: true,
    opacity: 0.58,
  });
  const gasDefs = [
    { id: "gas-lung", position: new THREE.Vector3(0.34, 2.52, -1.78), radius: 0.58 },
    { id: "hub-blister", position: new THREE.Vector3(-1.18, -0.86, -0.68), radius: 0.48 },
    { id: "seed-gas", position: new THREE.Vector3(2.75, -1.38, 1.28), radius: 0.44 },
  ];
  const gasBladders = gasDefs.map((definition, index) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(definition.radius, 18, 12), gasMaterial.clone());
    mesh.position.copy(definition.position);
    const light = new THREE.PointLight(index === 0 ? 0xb5ff5b : 0xe7b93b, 1.4, 3.2, 2);
    light.position.copy(definition.position);
    group.add(mesh, light);
    return { ...definition, mesh, light, cooldown: 0, burst: 0 };
  });

  const lights = [
    new THREE.PointLight(0xff8c1f, 4.2, 8, 1.8),
    new THREE.PointLight(0xff4d78, 4.4, 8, 1.8),
    new THREE.PointLight(0xa6cc36, 4.1, 8, 1.8),
    new THREE.PointLight(0x63d8ff, 4.8, 8, 1.6),
  ];
  lights[0].position.set(-3.9, 0.45, 1.25);
  lights[1].position.set(0.45, 3.55, -2.75);
  lights[2].position.set(3.7, -1.8, 1.75);
  lights[3].position.copy(DUNG_EXIT_POSITION).add(new THREE.Vector3(0, -0.35, 0));
  group.add(...lights);
  scene.add(group);
  return {
    group,
    shellMaterials,
    obstacles,
    gasBladders,
    exitGroup,
    exitMembrane,
    exitMembraneMaterial,
    porcelainMaterial,
    lights,
  };
}

const dungWorld = createDungWorld();

function milkNutrientPosition(y, xOffset, zOffset) {
  return pathCenterAt(y, new THREE.Vector3()).add(new THREE.Vector3(xOffset, 0, zOffset));
}

const LEVEL_DEFINITIONS = [
  {
    id: "sgushenka",
    title: "SWEET TRAP",
    subtitle: "FEED · BREAK OUT",
    startPosition: START_POSITION,
    startYaw: 0,
    startPitch: START_PITCH,
    exitPosition: EXIT_POSITION,
    exitHits: 2,
    nutrientDefs: [
      { id: "sugar-heart", name: "SUGAR HEART", type: "milk", color: 0xffc75a, position: milkNutrientPosition(-1.45, 1.05, -0.28) },
      { id: "whey-pearl", name: "WHEY PEARL", type: "milk", color: 0xc9f3ff, position: milkNutrientPosition(3.75, -1.18, 0.54) },
      { id: "fat-globule", name: "FAT GLOBULE", type: "milk", color: 0xff8f2c, position: milkNutrientPosition(6.55, 0.72, 0.66) },
    ],
  },
  {
    id: "last-meal",
    title: "THE LAST MEAL",
    subtitle: "THREE ORGANS · ONE WAY OUT",
    startPosition: DUNG_START_POSITION,
    startYaw: 0,
    startPitch: THREE.MathUtils.degToRad(17),
    exitPosition: DUNG_EXIT_POSITION,
    exitHits: 1,
    nutrientDefs: [
      { id: "corn-yolk", name: "CORN YOLK", type: "corn", color: 0xf6c84a, position: new THREE.Vector3(-4.47, 0.38, 1.48) },
      { id: "beet-clot", name: "BEET CLOT", type: "beet", color: 0xff376d, position: new THREE.Vector3(0.6, 4.12, -3.08) },
      { id: "seed-embryo", name: "SEED EMBRYO", type: "seed", color: 0xa6cc36, position: new THREE.Vector3(4.5, -2.27, 2.06) },
    ],
  },
];

function createNutrient(definition, levelIndex) {
  const root = new THREE.Group();
  root.position.copy(definition.position);
  root.visible = levelIndex === 0;
  const color = new THREE.Color(definition.color);
  const membraneMaterial = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.2),
    emissiveIntensity: 0.45,
    roughness: 0.12,
    clearcoat: 0.72,
    transmission: 0.15,
    thickness: 0.55,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const coreMaterial = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.38),
    emissiveIntensity: 0.62,
    roughness: 0.16,
    clearcoat: 0.62,
  });
  const membrane = new THREE.Mesh(new THREE.SphereGeometry(0.41, 20, 14), membraneMaterial);
  membrane.scale.set(1, 0.92, 1.08);
  root.add(membrane);

  let coreGeometry = new THREE.IcosahedronGeometry(0.22, 1);
  if (definition.type === "beet") coreGeometry = new THREE.TorusKnotGeometry(0.16, 0.055, 42, 7, 2, 3);
  if (definition.type === "seed") coreGeometry = new THREE.TorusGeometry(0.17, 0.065, 8, 24);
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  if (definition.type === "corn") core.scale.set(0.88, 1.34, 0.82);
  if (definition.type === "seed") core.rotation.x = Math.PI / 2;
  root.add(core);

  const tetherMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * TAU;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(angle) * 0.16, Math.sin(angle) * 0.13, 0),
      new THREE.Vector3(Math.cos(angle + 0.6) * 0.36, Math.sin(angle - 0.4) * 0.32, 0.12),
      new THREE.Vector3(Math.cos(angle) * 0.52, Math.sin(angle) * 0.48, -0.08),
    ]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 5, false), tetherMaterial));
  }
  const haloMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.012, 6, 32), haloMaterial);
  halo.rotation.x = Math.PI / 2;
  root.add(halo);
  const light = new THREE.PointLight(color, 0.9, 3, 1.8);
  root.add(light);
  scene.add(root);
  return {
    ...definition,
    levelIndex,
    root,
    core,
    membrane,
    membraneMaterial,
    coreMaterial,
    halo,
    haloMaterial,
    light,
    collected: false,
    collectedTime: -1,
    collectedByYield: null,
  };
}

const levelNutrients = LEVEL_DEFINITIONS.map((level, levelIndex) => (
  level.nutrientDefs.map((definition) => createNutrient(definition, levelIndex))
));

const scentPositions = new Float32Array(18 * 3);
const scentGeometry = new THREE.BufferGeometry();
scentGeometry.setAttribute("position", new THREE.BufferAttribute(scentPositions, 3).setUsage(THREE.DynamicDrawUsage));
const scentMaterial = new THREE.PointsMaterial({
  color: 0xffd275,
  size: 0.055,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.52,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const scentTrail = new THREE.Points(scentGeometry, scentMaterial);
scentTrail.frustumCulled = false;
scene.add(scentTrail);

function randomPointInPassage(target, y = null) {
  const worldY = y ?? (CAN_BOTTOM + 0.55 + runtimeRandom() * (SURFACE_Y - CAN_BOTTOM - 1.0));
  const center = pathCenterAt(worldY, tempA);
  const radius = Math.sqrt(runtimeRandom()) * Math.max(0.25, pathRadiusAt(worldY) - 0.35);
  const angle = runtimeRandom() * TAU;
  return target.set(center.x + Math.cos(angle) * radius, worldY, center.z + Math.sin(angle) * radius);
}

function randomPointInDung(target) {
  const volume = DUNG_VOLUMES[Math.floor(runtimeRandom() * DUNG_VOLUMES.length)];
  const amount = runtimeRandom();
  target.copy(volume.a).lerp(volume.b, amount);
  const z = runtimeRandom() * 2 - 1;
  const angle = runtimeRandom() * TAU;
  const radial = Math.cbrt(runtimeRandom()) * Math.max(0.25, volume.radius - 0.28);
  const horizontal = Math.sqrt(Math.max(0, 1 - z * z));
  target.add(new THREE.Vector3(
    Math.cos(angle) * horizontal * radial,
    z * radial,
    Math.sin(angle) * horizontal * radial,
  ));
  return target;
}

function randomPointInActiveLevel(target, y = null) {
  return campaign.levelIndex === 0 ? randomPointInPassage(target, y) : randomPointInDung(target);
}

function createParticleField(count, bubbles = false) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    randomPointInActiveLevel(tempA);
    positions[index * 3] = tempA.x;
    positions[index * 3 + 1] = tempA.y;
    positions[index * 3 + 2] = tempA.z;
    sizes[index] = bubbles ? 0.65 + runtimeRandom() * 2.4 : 0.35 + runtimeRandom() * 1.2;
    speeds[index] = bubbles ? 0.035 + runtimeRandom() * 0.11 : 0.008 + runtimeRandom() * 0.026;
    phases[index] = runtimeRandom() * TAU;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: bubbles ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(bubbles ? 0xcbefff : 0xffc66c) },
      uBubble: { value: bubbles ? 1 : 0 },
      uStretch: { value: 0 },
    },
    vertexShader: `
      attribute float aSize;
      uniform float uStretch;
      varying float vSize;
      void main() {
        vSize = aSize;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * (18.0 + uStretch * 8.0) / max(0.5, -viewPosition.z), 1.1, 18.0);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uBubble;
      varying float vSize;
      void main() {
        float radius = length(gl_PointCoord - 0.5);
        if (radius > 0.49) discard;
        float soft = 1.0 - smoothstep(0.32, 0.49, radius);
        float ring = smoothstep(0.42, 0.32, abs(radius - 0.36));
        float alpha = mix(soft * 0.55, ring * 0.58 + soft * 0.08, uBubble);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return { points, positions, sizes, speeds, phases, geometry, material, count, bubbles };
}

const motes = createParticleField(260, false);
const bubbles = createParticleField(72, true);

function createTunnelRings() {
  const rings = [];
  const geometry = new THREE.TorusGeometry(0.44, 0.022, 7, 42);
  for (let index = 0; index < 18; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: index % 2 ? 0xd78927 : 0xf0b34b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.visible = false;
    ring.userData.life = 0;
    ring.userData.maxLife = 1;
    ring.userData.baseScale = 1;
    rings.push(ring);
    scene.add(ring);
  }
  return rings;
}

const tunnelRings = createTunnelRings();
let tunnelRingCursor = 0;

function createCrumbPool() {
  const crumbs = [];
  const geometry = new THREE.TetrahedronGeometry(0.045, 0);
  const colors = [0x6b3421, 0xc9783d, 0x4f4517, 0x24100b];
  for (let index = 0; index < 32; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: colors[index % colors.length],
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.userData.life = 0;
    mesh.userData.velocity = new THREE.Vector3();
    crumbs.push(mesh);
    scene.add(mesh);
  }
  return crumbs;
}

const crumbPool = createCrumbPool();
let crumbCursor = 0;

function spawnDungCrumbs() {
  for (let index = 0; index < 12; index += 1) {
    const crumb = crumbPool[crumbCursor];
    crumbCursor = (crumbCursor + 1) % crumbPool.length;
    crumb.visible = true;
    crumb.userData.life = 0.55 + runtimeRandom() * 0.45;
    crumb.position.copy(state.position).addScaledVector(state.yieldDirection, 0.3 + runtimeRandom() * 0.4);
    crumb.position.x += (runtimeRandom() - 0.5) * 0.35;
    crumb.position.y += (runtimeRandom() - 0.5) * 0.35;
    crumb.position.z += (runtimeRandom() - 0.5) * 0.35;
    crumb.userData.velocity.copy(state.yieldDirection).multiplyScalar(0.25 + runtimeRandom() * 0.8);
    crumb.userData.velocity.x += (runtimeRandom() - 0.5) * 1.2;
    crumb.userData.velocity.y += (runtimeRandom() - 0.5) * 1.2;
    crumb.userData.velocity.z += (runtimeRandom() - 0.5) * 1.2;
    crumb.rotation.set(runtimeRandom() * TAU, runtimeRandom() * TAU, runtimeRandom() * TAU);
    crumb.scale.setScalar(0.55 + runtimeRandom() * 1.3);
    crumb.material.opacity = 0.9;
  }
}

function updateDungCrumbs(dt) {
  for (const crumb of crumbPool) {
    if (!crumb.visible) continue;
    crumb.userData.life -= dt;
    if (crumb.userData.life <= 0) {
      crumb.visible = false;
      crumb.material.opacity = 0;
      continue;
    }
    crumb.position.addScaledVector(crumb.userData.velocity, dt);
    crumb.userData.velocity.multiplyScalar(Math.exp(-dt * 3.1));
    crumb.rotation.x += dt * 3.2;
    crumb.rotation.y += dt * 2.3;
    crumb.material.opacity = Math.min(0.9, crumb.userData.life * 1.5);
  }
}

function createCompressionPocket() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uStrain: { value: 0 },
      uKick: { value: 0 },
      uBiome: { value: 0 },
    },
    vertexShader: `
      uniform float uStrain;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float radial = length(uv - 0.5);
        p.x *= 1.0 - uStrain * 0.2;
        p.y *= 1.0 + uStrain * 0.11;
        p.z -= exp(-radial * radial * 25.0) * uStrain * 0.22;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uStrain;
      uniform float uKick;
      uniform float uBiome;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float radius = length(p);
        float angle = atan(p.y, p.x);
        float irregular = radius * (1.0 + sin(angle * 3.0 + uTime * 0.2) * 0.075)
          + sin(angle * 5.0 + uTime * 0.32) * 0.034
          + sin(angle * 11.0 - uTime * 0.21) * 0.014 * uStrain;
        float body = 1.0 - smoothstep(0.43, 0.5, irregular);
        float rim = 1.0 - smoothstep(0.018, 0.062, abs(irregular - 0.455));
        float folds = 0.5 + 0.5 * sin(radius * 31.0 - uTime * 1.7 + sin(angle * 4.0) * 2.3);
        float veins = pow(max(0.0, sin(p.y * 29.0 + sin(p.x * 17.0 + uTime) * 1.8)), 7.0);
        float slitCenter = sin(p.y * 20.0 + uTime * 4.0) * 0.018 * uKick;
        float slitWidth = uKick * 0.15 * (1.0 - smoothstep(0.08, 0.46, radius));
        float rupture = smoothstep(0.06, 0.28, uKick);
        float slit = (1.0 - smoothstep(slitWidth, slitWidth + 0.022, abs(p.x - slitCenter))) * rupture;
        float slitEdge = 1.0 - smoothstep(0.014, 0.04, abs(abs(p.x - slitCenter) - slitWidth));
        slitEdge *= body * uKick * rupture;
        vec3 caramel = mix(vec3(0.75, 0.30, 0.045), vec3(0.16, 0.07, 0.025), uBiome);
        vec3 stretchedMilk = mix(vec3(1.0, 0.79, 0.37), vec3(0.54, 0.67, 0.12), uBiome);
        vec3 color = mix(caramel, stretchedMilk, 0.32 + uStrain * 0.58);
        color += folds * vec3(0.17, 0.07, 0.01) * uStrain;
        color += slitEdge * vec3(0.42, 0.66, 0.7);
        float alpha = body * (0.055 + uStrain * 0.28 + veins * uStrain * 0.08);
        alpha += rim * (0.035 + uStrain * 0.11);
        alpha *= 1.0 - slit * 0.96;
        alpha *= 1.0 - uKick * 0.46;
        alpha += slitEdge * 0.34;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const pocket = new THREE.Mesh(new THREE.CircleGeometry(0.46, 64, 0, TAU), material);
  pocket.visible = false;
  pocket.renderOrder = 8;
  scene.add(pocket);
  return { pocket, material };
}

const compressionPocket = createCompressionPocket();

function createWakeRibbon() {
  const sections = 30;
  const positions = new Float32Array(sections * 2 * 3);
  const alphas = new Float32Array(sections * 2);
  const indices = [];
  for (let index = 0; index < sections - 1; index += 1) {
    const a = index * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uPower: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uPower;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        float flicker = 0.78 + 0.22 * sin(vAlpha * 31.0 - uTime * 2.1);
        gl_FragColor = vec4(1.0, 0.56, 0.17, vAlpha * uPower * flicker * 0.32);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const points = Array.from({ length: sections }, () => START_POSITION.clone());
  return { sections, positions, alphas, geometry, material, mesh, points };
}

const wakeRibbon = createWakeRibbon();

function makeViewMaterial(color, emissive, roughness = 0.31) {
  return new THREE.MeshPhysicalMaterial({
    color,
    emissive,
    emissiveIntensity: 0.22,
    roughness,
    metalness: 0.08,
    clearcoat: 0.68,
    clearcoatRoughness: 0.22,
    depthTest: false,
    depthWrite: false,
  });
}

function createViewModel() {
  const root = new THREE.Group();
  const shellMaterial = makeViewMaterial(0x281109, 0x5a1907, 0.28);
  const jointMaterial = makeViewMaterial(0x481c0b, 0x7a2608, 0.35);
  const strandMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc76b,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const upperGeometry = new THREE.CylinderGeometry(0.052, 0.09, 1, 9, 1, false);
  const lowerGeometry = new THREE.CylinderGeometry(0.033, 0.058, 1, 9, 1, false);
  const hookGeometry = new THREE.CylinderGeometry(0.012, 0.042, 1, 9, 1, false);
  const jointGeometry = new THREE.SphereGeometry(0.073, 12, 8);
  const tipJointGeometry = new THREE.SphereGeometry(0.057, 10, 7);
  const shoulderGeometry = new THREE.SphereGeometry(0.135, 14, 9);
  const strandGeometry = new THREE.CylinderGeometry(0.007, 0.016, 1, 6, 1, true);
  const claws = [];

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(shoulderGeometry, shellMaterial);
    const upper = new THREE.Mesh(upperGeometry, shellMaterial);
    const joint = new THREE.Mesh(jointGeometry, jointMaterial);
    const lower = new THREE.Mesh(lowerGeometry, shellMaterial);
    const tipJoint = new THREE.Mesh(tipJointGeometry, jointMaterial);
    const hook = new THREE.Mesh(hookGeometry, jointMaterial);
    const strands = [];
    for (let index = 0; index < 2; index += 1) {
      const strand = new THREE.Mesh(strandGeometry, strandMaterial.clone());
      strands.push(strand);
      root.add(strand);
    }
    root.add(shoulder, upper, joint, lower, tipJoint, hook);
    claws.push({
      side,
      shoulder,
      upper,
      joint,
      lower,
      tipJoint,
      hook,
      strands,
      base: new THREE.Vector3(),
      elbow: new THREE.Vector3(),
      tip: new THREE.Vector3(),
      hookEnd: new THREE.Vector3(),
      strandEnd: new THREE.Vector3(),
    });
  }

  const metabolismNodes = [];
  for (let index = 0; index < NUTRIENTS_REQUIRED; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 7), material);
    node.visible = false;
    metabolismNodes.push(node);
    root.add(node);
  }

  const fill = new THREE.HemisphereLight(0xffcf85, 0x160503, 2.1);
  const rim = new THREE.DirectionalLight(0xcdefff, 3.2);
  rim.position.set(0, 2, -2);
  viewScene.add(fill, rim, root);
  return { root, claws, metabolismNodes, fill, rim };
}

const viewModel = createViewModel();

function updateBasis() {
  const cosinePitch = Math.cos(state.pitch);
  forward.set(
    -Math.sin(state.yaw) * cosinePitch,
    Math.sin(state.pitch),
    -Math.cos(state.yaw) * cosinePitch,
  ).normalize();
  right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw)).normalize();
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function addLookDelta(deltaX, deltaY, multiplier = 1) {
  state.targetYaw = wrapAngle(state.targetYaw - deltaX * LOOK_SENSITIVITY * multiplier);
  state.targetPitch = THREE.MathUtils.clamp(
    state.targetPitch - deltaY * LOOK_SENSITIVITY * multiplier,
    -MAX_PITCH,
    MAX_PITCH,
  );
  if (Math.abs(deltaX) + Math.abs(deltaY) > 0.5) markInputUsed();
}

function keyDown(...codes) {
  return codes.some((code) => keyboard.has(code));
}

function updateInputVector() {
  let strafe = 0;
  let swimForward = 0;
  let vertical = 0;
  if (keyDown("KeyA", "ArrowLeft")) strafe -= 1;
  if (keyDown("KeyD", "ArrowRight")) strafe += 1;
  if (keyDown("KeyW", "ArrowUp")) swimForward += 1;
  if (keyDown("KeyS", "ArrowDown")) swimForward -= 1;
  if (keyDown("Space", "KeyE")) vertical += 1;
  if (keyDown("KeyC", "ControlLeft", "ControlRight", "KeyQ")) vertical -= 1;
  strafe += touchMove.x;
  swimForward += touchMove.y;
  if (ascendPointers.size > 0) vertical += 1;
  if (descendPointers.size > 0) vertical -= 1;

  state.strafeAxis = THREE.MathUtils.clamp(strafe, -1, 1);
  state.forwardAxis = THREE.MathUtils.clamp(swimForward, -1, 1);
  state.verticalAxis = THREE.MathUtils.clamp(vertical, -1, 1);

  state.inputWorld.set(0, 0, 0);
  state.inputWorld.addScaledVector(right, state.strafeAxis);
  state.inputWorld.addScaledVector(forward, state.forwardAxis);
  state.inputWorld.y += state.verticalAxis;
  state.inputStrength = Math.min(1, state.inputWorld.length());
  if (state.inputStrength > 0.0001) state.inputWorld.normalize();
}

function setYieldPhase(nextPhase) {
  if (state.yieldPhase === nextPhase) return;
  state.yieldPhase = nextPhase;
  state.yieldPhaseTime = 0;
  document.body.classList.toggle("is-loading", nextPhase === "loading");
  document.body.classList.toggle("is-breaking", nextPhase === "breaking");
}

function steerDirectionToward(target, radiansPerSecond, dt) {
  const dot = THREE.MathUtils.clamp(state.yieldDirection.dot(target), -1, 1);
  const angle = Math.acos(dot);
  if (angle < 0.0001) return;
  const amount = Math.min(1, (radiansPerSecond * dt) / angle);
  state.yieldDirection.lerp(target, amount).normalize();
}

function showChapterCard(kicker, title, subtitle, duration = 1.7, final = false) {
  chapterKicker.textContent = kicker;
  chapterTitle.textContent = title;
  chapterSubtitle.textContent = subtitle;
  chapterCard.classList.toggle("is-final", final);
  chapterCard.classList.add("is-visible");
  chapterCard.setAttribute("aria-hidden", "false");
  campaign.chapterTime = final ? Number.POSITIVE_INFINITY : duration;
}

function hideChapterCard() {
  if (chapterCard.classList.contains("is-final")) return;
  chapterCard.classList.remove("is-visible");
  chapterCard.setAttribute("aria-hidden", "true");
}

function activeNutrients() {
  return levelNutrients[campaign.levelIndex];
}

function currentLevelDefinition() {
  return LEVEL_DEFINITIONS[campaign.levelIndex];
}

function collectNutrient(nutrient) {
  if (nutrient.collected || campaign.flow !== "playing") return false;
  if (campaign.lastCollectionYield === state.yieldCount) return false;
  nutrient.collected = true;
  nutrient.collectedTime = 0;
  nutrient.collectedByYield = state.yieldCount;
  campaign.lastCollectionYield = state.yieldCount;
  campaign.collectedIds.push(nutrient.id);
  campaign.nutrientsCollected = campaign.collectedIds.length;
  campaign.nutrientPulse = 1;
  campaign.exitUnlocked = campaign.nutrientsCollected >= NUTRIENTS_REQUIRED;
  liveStatus.textContent = campaign.exitUnlocked
    ? "Fed. The exit membrane is vulnerable to a Yield Stroke."
    : `${nutrient.name} absorbed. ${NUTRIENTS_REQUIRED - campaign.nutrientsCollected} nutrients remain.`;
  playNutrientSound(nutrient.color, campaign.nutrientsCollected);
  if (campaign.exitUnlocked) {
    showChapterCard("METABOLISM FULL", "BREAK OUT", campaign.levelIndex === 0 ? "HOLD PRESSURE UP · TWO BREAKS" : "THE PORCELAIN MOON IS THIN", 1.25);
  }
  return true;
}

function tryPunctureNearbyNutrient() {
  if (campaign.flow !== "playing" || campaign.lastCollectionYield === state.yieldCount) return false;
  let candidate = null;
  let bestDistance = Infinity;
  for (const nutrient of activeNutrients()) {
    if (nutrient.collected) continue;
    const distance = nutrient.position.distanceTo(state.position);
    if (distance > 1.02 || distance >= bestDistance) continue;
    tempA.copy(nutrient.position).sub(state.position).normalize();
    if (state.yieldDirection.dot(tempA) < 0.42) continue;
    candidate = nutrient;
    bestDistance = distance;
  }
  return candidate ? collectNutrient(candidate) : false;
}

function completeCurrentLevel() {
  if (campaign.flow !== "playing") return;
  campaign.completionTimes[campaign.levelIndex] = campaign.levelElapsed;
  campaign.transitionTime = 0;
  state.velocity.set(0, 0, 0);
  clearTransientInput();
  if (campaign.levelIndex === 0) {
    campaign.flow = "transition";
    showChapterCard("LEVEL 1 CLEAR", "MILK BREACHED", "FALLING TOWARD SOMETHING WORSE", 1.7);
    liveStatus.textContent = "The lid tore open. Falling toward the second level.";
  } else {
    campaign.flow = "complete";
    showChapterCard(
      "TWO BAD MEALS",
      "OUTSIDE",
      `${Math.round(campaign.completionTimes[0])}s MILK · ${Math.round(campaign.completionTimes[1])}s SHIT`,
      Number.POSITIVE_INFINITY,
      true,
    );
    liveStatus.textContent = "Both levels complete. Play Again restarts the campaign.";
  }
}

function tryPunctureExit() {
  const level = currentLevelDefinition();
  const distance = state.position.distanceTo(level.exitPosition);
  if (distance > (campaign.levelIndex === 0 ? MILK_EXIT_TRIGGER_RADIUS : DUNG_EXIT_TRIGGER_RADIUS)) return false;
  tempA.copy(level.exitPosition).sub(state.position).normalize();
  if (state.yieldDirection.dot(tempA) < (campaign.levelIndex === 0 ? 0.26 : 0.48)) return false;
  if (!campaign.exitUnlocked) {
    campaign.lastExitAttempt = "locked";
    campaign.lockedAttemptCount += 1;
    state.cameraKick = Math.max(state.cameraKick, 0.38);
    liveStatus.textContent = `${NUTRIENTS_REQUIRED - campaign.nutrientsCollected} nutrients still needed. The exit rejects the stroke.`;
    return true;
  }
  campaign.exitDamage += 1;
  campaign.lastExitAttempt = campaign.exitDamage >= level.exitHits ? "completed" : "damaged";
  if (campaign.exitDamage >= level.exitHits) completeCurrentLevel();
  else {
    showChapterCard("LID SPLIT", "ONE MORE HIT", "KEEP PUSHING UP", 0.85);
    liveStatus.textContent = "The lid split. One more upward Yield Stroke will tear it open.";
  }
  return true;
}

function spawnTunnel() {
  state.lastYieldSpeed = state.velocity.length();
  if (campaign.levelIndex === 0) {
    for (let index = 0; index < 6; index += 1) {
      const ring = tunnelRings[tunnelRingCursor];
      tunnelRingCursor = (tunnelRingCursor + 1) % tunnelRings.length;
      ring.visible = true;
      ring.userData.life = 0.82 + index * 0.055;
      ring.userData.maxLife = ring.userData.life;
      ring.userData.baseScale = 0.62 + index * 0.13;
      ring.position.copy(state.position).addScaledVector(state.yieldDirection, -index * 0.24 + 0.28);
      ringQuaternion.setFromUnitVectors(LOCAL_Z, state.yieldDirection);
      ring.quaternion.copy(ringQuaternion);
      ring.scale.setScalar(ring.userData.baseScale);
      ring.material.opacity = 0.28;
    }
  }
  state.wakePower = 1;
  state.cameraKick = 1;
  if (campaign.levelIndex === 1) spawnDungCrumbs();
  tryPunctureNearbyNutrient();
  tryPunctureExit();
  playYieldSound(state.yieldStrain);
}

function updateYield(dt) {
  const coherentEffort = state.inputStrength >= YIELD_LOAD_THRESHOLD;
  const strainRate = (campaign.levelIndex === 1 ? 2.12 : YIELD_STRAIN_RATE)
    * (1 + campaign.nutrientsCollected * 0.045);
  const breakDuration = campaign.levelIndex === 1 ? 0.118 : YIELD_BREAK_DURATION;
  const regripDuration = campaign.levelIndex === 1 ? 0.3 : YIELD_REGRIP_DURATION;

  if (state.yieldPhase === "idle") {
    state.yieldStrain = Math.max(0, state.yieldStrain - dt * 7);
    if (coherentEffort) {
      state.yieldDirection.copy(state.inputWorld);
      setYieldPhase("loading");
    }
  } else if (state.yieldPhase === "loading") {
    state.yieldPhaseTime += dt;
    if (!coherentEffort) {
      state.yieldStrain = Math.max(0, state.yieldStrain - dt * 7);
      if (state.yieldStrain <= 0.001) setYieldPhase("idle");
    } else {
      const coherence = state.yieldDirection.dot(state.inputWorld);
      if (coherence < 0.75) {
        state.yieldStrain = Math.max(0, state.yieldStrain - dt * 7);
        if (state.yieldStrain <= 0.001) state.yieldDirection.copy(state.inputWorld);
      } else {
        steerDirectionToward(state.inputWorld, THREE.MathUtils.degToRad(100), dt);
        state.yieldStrain = Math.min(1, state.yieldStrain + dt * strainRate * state.inputStrength);
      }
      if (state.yieldStrain >= 0.95) {
        state.yieldCount += 1;
        state.yieldStrain = 1;
        setYieldPhase("breaking");
        spawnTunnel();
      }
    }
  } else if (state.yieldPhase === "breaking") {
    state.yieldPhaseTime += dt;
    if (coherentEffort) steerDirectionToward(state.inputWorld, THREE.MathUtils.degToRad(25), dt);
    if (state.yieldPhaseTime >= breakDuration) {
      state.yieldStrain = 0.18;
      setYieldPhase("regrip");
    }
  } else if (state.yieldPhase === "regrip") {
    state.yieldPhaseTime += dt;
    state.yieldStrain = Math.max(0, state.yieldStrain - dt * 0.52);
    if (state.yieldPhaseTime >= regripDuration) {
      if (coherentEffort) {
        state.yieldDirection.copy(state.inputWorld);
        state.yieldStrain = 0.03;
        setYieldPhase("loading");
      } else {
        setYieldPhase("idle");
      }
    }
  }

  const compressionTarget = state.yieldPhase === "loading" ? state.yieldStrain : 0;
  state.compressionVisual += (compressionTarget - state.compressionVisual) * (1 - Math.exp(-dt * 12));
  state.cameraKick = Math.max(0, state.cameraKick - dt * 6.8);
  state.wakePower = Math.max(0, state.wakePower - dt * 0.78);
}

const dungBoundarySample = {
  axisPoint: new THREE.Vector3(),
  normal: new THREE.Vector3(1, 0, 0),
  clearance: -Infinity,
  distance: 0,
  volume: DUNG_VOLUMES[0],
};
const dungAxisCandidate = new THREE.Vector3();
const dungAxisDirection = new THREE.Vector3();
const dungOffset = new THREE.Vector3();

function sampleDungBoundary(position, result = dungBoundarySample) {
  result.clearance = -Infinity;
  for (const volume of DUNG_VOLUMES) {
    dungAxisDirection.copy(volume.b).sub(volume.a);
    const lengthSq = dungAxisDirection.lengthSq();
    if (lengthSq < 0.0001) dungAxisCandidate.copy(volume.a);
    else {
      const amount = THREE.MathUtils.clamp(
        dungOffset.copy(position).sub(volume.a).dot(dungAxisDirection) / lengthSq,
        0,
        1,
      );
      dungAxisCandidate.copy(volume.a).addScaledVector(dungAxisDirection, amount);
    }
    dungOffset.copy(position).sub(dungAxisCandidate);
    const distance = dungOffset.length();
    const clearance = volume.radius - PLAYER_CLEARANCE - distance;
    if (clearance <= result.clearance) continue;
    result.clearance = clearance;
    result.distance = distance;
    result.volume = volume;
    result.axisPoint.copy(dungAxisCandidate);
    if (distance > 0.0001) result.normal.copy(dungOffset).multiplyScalar(1 / distance);
    else result.normal.set(1, 0, 0);
  }
  return result;
}

function applyDungBoundaries() {
  const sample = sampleDungBoundary(state.position);
  state.passageRadius = sample.volume.radius - PLAYER_CLEARANCE;
  state.passageRegion = sample.volume.id;
  state.touchingWall = sample.clearance < 0.34;
  state.touchingBottom = false;
  state.touchingSurface = state.position.distanceTo(DUNG_EXIT_POSITION) < 0.98;
  if (state.touchingWall) {
    const penetration = 0.34 - sample.clearance;
    const outwardSpeed = Math.max(0, state.velocity.dot(sample.normal));
    acceleration.addScaledVector(sample.normal, -(penetration * 38 + outwardSpeed * 12));
  }
  for (const obstacle of dungWorld.obstacles) {
    dungOffset.copy(state.position).sub(obstacle.position);
    const distance = dungOffset.length();
    const softRadius = obstacle.radius + 0.28;
    if (distance >= softRadius || distance < 0.0001) continue;
    dungOffset.multiplyScalar(1 / distance);
    acceleration.addScaledVector(dungOffset, (softRadius - distance) * 34);
  }
  if (sample.volume.id === "seed-comb") {
    acceleration.x += Math.sin(state.time * 2.8) * 0.42;
    acceleration.y += Math.cos(state.time * 2.1) * 0.26;
  }
  state.wallPressure += ((state.touchingWall ? 1 : 0) - state.wallPressure) * 0.17;
}

function applyPassageBoundaries() {
  if (campaign.levelIndex === 1) {
    applyDungBoundaries();
    return;
  }
  pathCenterAt(state.position.y, passageCenter);
  const dx = state.position.x - passageCenter.x;
  const dz = state.position.z - passageCenter.z;
  const radialDistance = Math.hypot(dx, dz);
  const legalRadius = Math.max(0.9, pathRadiusAt(state.position.y) - PLAYER_CLEARANCE);
  state.passageRadius = legalRadius;
  const softStart = legalRadius - 0.34;
  state.touchingWall = radialDistance > softStart;
  if (state.touchingWall && radialDistance > 0.0001) {
    radialNormal.set(dx / radialDistance, 0, dz / radialDistance);
    const penetration = radialDistance - softStart;
    const outwardSpeed = Math.max(0, state.velocity.dot(radialNormal));
    acceleration.addScaledVector(radialNormal, -(penetration * 38 + outwardSpeed * 12));
  }
  state.wallPressure += ((state.touchingWall ? 1 : 0) - state.wallPressure) * 0.17;

  const bottomSoftStart = CAN_BOTTOM + PLAYER_CLEARANCE + 0.5;
  state.touchingBottom = state.position.y < bottomSoftStart;
  if (state.touchingBottom) {
    const penetration = bottomSoftStart - state.position.y;
    acceleration.y += penetration * 38 + Math.max(0, -state.velocity.y) * 11;
  }

  const surfaceSoftStart = SURFACE_Y - SURFACE_CLEARANCE - 0.72;
  state.touchingSurface = state.position.y > surfaceSoftStart;
  if (state.touchingSurface) {
    const penetration = state.position.y - surfaceSoftStart;
    acceleration.y -= penetration * 18 + Math.max(0, state.velocity.y) * 8;
  }
  state.passageRegion = "milk-chimney";
}

function projectInsideDungWorld() {
  let sample = sampleDungBoundary(state.position);
  if (sample.clearance < 0) {
    state.position.addScaledVector(sample.normal, sample.clearance - 0.002);
    const outwardSpeed = state.velocity.dot(sample.normal);
    if (outwardSpeed > 0) state.velocity.addScaledVector(sample.normal, -outwardSpeed * 0.97);
    state.touchingWall = true;
  }
  for (const obstacle of dungWorld.obstacles) {
    dungOffset.copy(state.position).sub(obstacle.position);
    const distance = dungOffset.length();
    const legalDistance = obstacle.radius + 0.19;
    if (distance >= legalDistance) continue;
    if (distance < 0.0001) dungOffset.set(1, 0, 0);
    else dungOffset.multiplyScalar(1 / distance);
    state.position.copy(obstacle.position).addScaledVector(dungOffset, legalDistance);
    const inwardSpeed = state.velocity.dot(dungOffset);
    if (inwardSpeed < 0) state.velocity.addScaledVector(dungOffset, -inwardSpeed * 0.94);
  }
  sample = sampleDungBoundary(state.position);
  state.passageRadius = sample.volume.radius - PLAYER_CLEARANCE;
  state.passageRegion = sample.volume.id;
  state.touchingSurface = state.position.distanceTo(DUNG_EXIT_POSITION) < 0.98;
  state.mode = state.touchingSurface ? "at-membrane" : "swimming";
}

function projectInsidePassage() {
  if (campaign.levelIndex === 1) {
    projectInsideDungWorld();
    return;
  }
  pathCenterAt(state.position.y, passageCenter);
  const dx = state.position.x - passageCenter.x;
  const dz = state.position.z - passageCenter.z;
  const radialDistance = Math.hypot(dx, dz);
  const legalRadius = Math.max(0.9, pathRadiusAt(state.position.y) - PLAYER_CLEARANCE);
  if (radialDistance > legalRadius) {
    radialNormal.set(dx / radialDistance, 0, dz / radialDistance);
    state.position.x = passageCenter.x + radialNormal.x * legalRadius;
    state.position.z = passageCenter.z + radialNormal.z * legalRadius;
    const outwardSpeed = state.velocity.dot(radialNormal);
    if (outwardSpeed > 0) state.velocity.addScaledVector(radialNormal, -outwardSpeed * 0.97);
    state.touchingWall = true;
  }

  const bottomLimit = CAN_BOTTOM + PLAYER_CLEARANCE;
  if (state.position.y < bottomLimit) {
    state.position.y = bottomLimit;
    if (state.velocity.y < 0) state.velocity.y *= 0.04;
    state.touchingBottom = true;
  }
  const surfaceLimit = SURFACE_Y - SURFACE_CLEARANCE;
  if (state.position.y > surfaceLimit) {
    state.position.y = surfaceLimit;
    if (state.velocity.y > 0) state.velocity.y *= 0.035;
    state.touchingSurface = true;
  }
  state.mode = state.touchingSurface && SURFACE_Y - state.position.y < SURFACE_CLEARANCE + 0.04
    ? "at-membrane"
    : "swimming";
}

function updateNutrientInteractions() {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const nutrient of activeNutrients()) {
    if (nutrient.collected) continue;
    dungOffset.copy(state.position).sub(nutrient.position);
    let distance = dungOffset.length();
    if (distance < nearestDistance) {
      nearest = nutrient;
      nearestDistance = distance;
    }
    if (
      state.yieldPhase === "breaking"
      && campaign.lastCollectionYield !== state.yieldCount
      && distance < 0.98
    ) {
      tempA.copy(nutrient.position).sub(state.position).normalize();
      if (state.yieldDirection.dot(tempA) > 0.32 && collectNutrient(nutrient)) continue;
    }
    if (distance >= 0.62) continue;
    if (distance < 0.0001) dungOffset.copy(state.yieldDirection).multiplyScalar(-1);
    else dungOffset.multiplyScalar(1 / distance);
    state.position.copy(nutrient.position).addScaledVector(dungOffset, 0.62);
    const inwardSpeed = state.velocity.dot(dungOffset);
    if (inwardSpeed < 0) state.velocity.addScaledVector(dungOffset, -inwardSpeed * 0.92);
    distance = 0.62;
  }
  campaign.nearNutrientId = nearestDistance < 1.2 ? nearest?.id ?? null : null;
}

function updateNutrientVisuals(dt) {
  const active = activeNutrients();
  for (const nutrients of levelNutrients) {
    for (const nutrient of nutrients) {
      if (nutrient.levelIndex !== campaign.levelIndex) {
        nutrient.root.visible = false;
        continue;
      }
      if (nutrient.collected) {
        nutrient.collectedTime += dt;
        const shrink = Math.max(0, 1 - nutrient.collectedTime / 0.28);
        nutrient.root.scale.setScalar(shrink * shrink);
        nutrient.membraneMaterial.opacity = Math.max(0, 0.2 * shrink);
        nutrient.haloMaterial.opacity = Math.max(0, 0.3 * shrink);
        nutrient.light.intensity = 0.9 * shrink;
        nutrient.root.visible = shrink > 0.015;
        continue;
      }
      nutrient.root.visible = true;
      const pulse = 1 + Math.sin(state.time * 3.1 + nutrient.position.x * 0.7) * 0.055;
      nutrient.root.scale.setScalar(pulse);
      nutrient.core.rotation.x += dt * 0.72;
      nutrient.core.rotation.y += dt * 1.04;
      nutrient.halo.rotation.z += dt * 0.45;
      nutrient.membraneMaterial.opacity = 0.18 + Math.sin(state.time * 2.4) * 0.035;
      nutrient.haloMaterial.opacity = 0.24 + Math.sin(state.time * 3.2) * 0.06;
      nutrient.light.intensity = 0.75 + Math.sin(state.time * 2.7) * 0.18;
    }
  }
  campaign.nutrientPulse = Math.max(0, campaign.nutrientPulse - dt * 2.4);
  nutrientFlash.style.opacity = (campaign.nutrientPulse * 0.38).toFixed(3);

  let target = null;
  let targetDistance = Infinity;
  for (const nutrient of active) {
    if (nutrient.collected) continue;
    const distance = nutrient.position.distanceTo(state.position);
    if (distance < targetDistance) {
      target = nutrient;
      targetDistance = distance;
    }
  }
  if (!target) {
    campaign.activeTargetId = "exit";
    target = { position: currentLevelDefinition().exitPosition, color: 0x8ae9ff };
    targetDistance = target.position.distanceTo(state.position);
  } else campaign.activeTargetId = target.id;
  scentMaterial.color.setHex(target.color);
  const end = target.position;
  for (let index = 0; index < 18; index += 1) {
    const amount = (index + 1) / 19;
    const offset = index * 3;
    scentPositions[offset] = THREE.MathUtils.lerp(state.position.x, end.x, amount)
      + Math.sin(state.time * 1.7 + index * 0.8) * Math.sin(amount * Math.PI) * 0.11;
    scentPositions[offset + 1] = THREE.MathUtils.lerp(state.position.y, end.y, amount)
      + Math.cos(state.time * 1.3 + index * 0.6) * Math.sin(amount * Math.PI) * 0.08;
    scentPositions[offset + 2] = THREE.MathUtils.lerp(state.position.z, end.z, amount)
      + Math.sin(state.time * 1.1 + index * 0.54) * Math.sin(amount * Math.PI) * 0.1;
  }
  scentGeometry.attributes.position.needsUpdate = true;
  scentTrail.visible = campaign.flow === "playing";
  scentMaterial.opacity = targetDistance > 1.2 ? 0.46 : 0.2;
}

function updateGasBladders(dt) {
  campaign.gasRecovery = Math.max(0, campaign.gasRecovery - dt);
  for (const gas of dungWorld.gasBladders) {
    gas.cooldown = Math.max(0, gas.cooldown - dt);
    gas.burst = Math.max(0, gas.burst - dt * 1.5);
    const idlePulse = 1 + Math.sin(state.time * 2.2 + gas.position.y) * 0.08;
    gas.mesh.scale.setScalar(idlePulse + gas.burst * 0.88);
    gas.mesh.material.opacity = 0.58 * (1 - gas.burst * 0.72);
    gas.light.intensity = 1.2 + idlePulse * 0.3 + gas.burst * 2.8;
    if (campaign.levelIndex !== 1 || campaign.flow !== "playing" || gas.cooldown > 0) continue;
    dungOffset.copy(state.position).sub(gas.position);
    const distance = dungOffset.length();
    if (distance > gas.radius + 0.34) continue;
    if (distance < 0.0001) dungOffset.set(1, 0, 0);
    else dungOffset.multiplyScalar(1 / distance);
    campaign.gasPushCount += 1;
    campaign.lastGasId = gas.id;
    campaign.lastGasImpulse.copy(dungOffset).multiplyScalar(3.1);
    campaign.gasRecovery = 0.78;
    state.velocity.add(campaign.lastGasImpulse);
    state.cameraKick = Math.max(state.cameraKick, 0.72);
    gas.cooldown = 3.2;
    gas.burst = 1;
    playGasSound();
    liveStatus.textContent = "A gas bladder burst. Recover and keep swimming.";
  }
}

function resetParticleField(field) {
  for (let index = 0; index < field.count; index += 1) {
    randomPointInActiveLevel(tempA);
    field.positions[index * 3] = tempA.x;
    field.positions[index * 3 + 1] = tempA.y;
    field.positions[index * 3 + 2] = tempA.z;
  }
  field.geometry.attributes.position.needsUpdate = true;
}

function updateParticleField(field, dt) {
  for (let index = 0; index < field.count; index += 1) {
    const offset = index * 3;
    field.positions[offset + 1] += field.speeds[index] * dt;
    field.positions[offset] += Math.sin(state.time * 0.37 + field.phases[index]) * dt * 0.008;
    field.positions[offset + 2] += Math.cos(state.time * 0.31 + field.phases[index]) * dt * 0.008;
    const outsideMilk = campaign.levelIndex === 0 && field.positions[offset + 1] > SURFACE_Y - 0.12;
    let outsideDung = false;
    if (campaign.levelIndex === 1) {
      tempA.set(field.positions[offset], field.positions[offset + 1], field.positions[offset + 2]);
      outsideDung = sampleDungBoundary(tempA).clearance < -0.12;
    }
    if (outsideMilk || outsideDung) {
      if (campaign.levelIndex === 0) {
        randomPointInPassage(tempA, CAN_BOTTOM + 0.48 + runtimeRandom() * 0.5);
      } else randomPointInDung(tempA);
      field.positions[offset] = tempA.x;
      field.positions[offset + 1] = tempA.y;
      field.positions[offset + 2] = tempA.z;
    }
  }
  field.geometry.attributes.position.needsUpdate = true;
}

function updateTunnelRings(dt) {
  let active = 0;
  for (const ring of tunnelRings) {
    if (!ring.visible) continue;
    ring.userData.life -= dt;
    if (ring.userData.life <= 0) {
      ring.visible = false;
      ring.material.opacity = 0;
      continue;
    }
    active += 1;
    const ratio = ring.userData.life / ring.userData.maxLife;
    const closure = 0.28 + ratio * 0.72;
    ring.scale.setScalar(ring.userData.baseScale * closure);
    ring.material.opacity = Math.sin(ratio * Math.PI) * 0.24;
    ring.position.addScaledVector(state.yieldDirection, -dt * 0.18);
  }
  state.tunnelSegments = active;
}

function updateTrailPoint() {
  for (let index = wakeRibbon.sections - 1; index > 0; index -= 1) {
    wakeRibbon.points[index].copy(wakeRibbon.points[index - 1]);
  }
  wakeRibbon.points[0].copy(state.position).addScaledVector(forward, -0.16);
}

function simulate(dt) {
  state.previousPosition.copy(state.position);
  state.time += dt;

  if (Number.isFinite(campaign.chapterTime) && campaign.chapterTime > 0) {
    campaign.chapterTime = Math.max(0, campaign.chapterTime - dt);
    if (campaign.chapterTime === 0) hideChapterCard();
  }

  if (campaign.flow === "transition") {
    campaign.transitionTime += dt;
    updateNutrientVisuals(dt);
    updateDungCrumbs(dt);
    if (campaign.transitionTime >= 1.7) startLevel(1, { preserveRun: true });
    return;
  }
  if (campaign.flow === "complete") {
    updateNutrientVisuals(dt);
    updateDungCrumbs(dt);
    return;
  }

  campaign.levelElapsed += dt;
  campaign.runElapsed += dt;

  const yawDelta = Math.atan2(Math.sin(state.targetYaw - state.yaw), Math.cos(state.targetYaw - state.yaw));
  const lookDamping = 1 - Math.exp(-dt * 29);
  state.yaw = wrapAngle(state.yaw + yawDelta * lookDamping);
  state.pitch = THREE.MathUtils.lerp(state.pitch, state.targetPitch, lookDamping);
  updateBasis();
  updateInputVector();
  updateYield(dt);

  acceleration.copy(state.inputWorld);
  let baseAcceleration = 4.8;
  let drag = 3.0;
  let maxSpeed = 2.25;
  if (state.yieldPhase === "loading") {
    baseAcceleration = 4.6;
    drag = 3.5;
    maxSpeed = 1.75;
  } else if (state.yieldPhase === "breaking") {
    const breakDuration = campaign.levelIndex === 1 ? 0.118 : YIELD_BREAK_DURATION;
    const phase = THREE.MathUtils.clamp(state.yieldPhaseTime / breakDuration, 0, 1);
    baseAcceleration = 2.2;
    acceleration.addScaledVector(
      state.yieldDirection,
      (campaign.levelIndex === 1 ? 34 : 32) * Math.sin(Math.PI * phase) / baseAcceleration,
    );
    drag = 0.85;
    maxSpeed = 4.7;
  } else if (state.yieldPhase === "regrip") {
    baseAcceleration = 3.0;
    drag = 4.15;
    maxSpeed = 2.6;
  } else if (state.inputStrength < 0.02) {
    baseAcceleration = 0;
    drag = 5.2;
    maxSpeed = 4.7;
  }
  acceleration.multiplyScalar(baseAcceleration);
  if (state.inputStrength < 0.02) acceleration.y -= 0.022;
  applyPassageBoundaries();

  state.velocity.addScaledVector(acceleration, dt);
  state.velocity.multiplyScalar(Math.exp(-(drag + state.velocity.length() * 0.08) * dt));
  if (state.velocity.lengthSq() > maxSpeed * maxSpeed) state.velocity.setLength(maxSpeed);
  state.position.addScaledVector(state.velocity, dt);
  projectInsidePassage();
  updateNutrientInteractions();
  updateGasBladders(dt);
  state.distanceTravelled += state.position.distanceTo(state.previousPosition);

  trailClock += dt;
  if (trailClock >= 0.038) {
    trailClock %= 0.038;
    updateTrailPoint();
  }

  updateParticleField(motes, dt);
  updateParticleField(bubbles, dt);
  updateTunnelRings(dt);
  updateDungCrumbs(dt);
  updateNutrientVisuals(dt);
  updateAudio();
}

function updateCompressionPocket() {
  compressionPocket.pocket.visible = state.compressionVisual > 0.025 || state.cameraKick > 0.02;
  if (!compressionPocket.pocket.visible) return;
  const direction = state.yieldPhase === "idle" ? forward : state.yieldDirection;
  compressionPocket.pocket.position.copy(state.position).addScaledVector(direction, 1.24 + state.compressionVisual * 0.12);
  ringQuaternion.setFromUnitVectors(LOCAL_Z, direction);
  compressionPocket.pocket.quaternion.copy(ringQuaternion);
  const scale = 0.88 + state.compressionVisual * 0.22 + state.cameraKick * 0.3;
  compressionPocket.pocket.scale.setScalar(scale);
  compressionPocket.material.uniforms.uTime.value = state.time;
  compressionPocket.material.uniforms.uStrain.value = state.compressionVisual;
  compressionPocket.material.uniforms.uKick.value = state.cameraKick;
  compressionPocket.material.uniforms.uBiome.value = campaign.levelIndex;
}

function updateWakeRibbon() {
  const toCamera = tempD.copy(camera.position);
  const power = Math.min(1, state.wakePower + state.velocity.length() * 0.12);
  for (let index = 0; index < wakeRibbon.sections; index += 1) {
    const point = wakeRibbon.points[index];
    const previous = wakeRibbon.points[Math.max(0, index - 1)];
    const next = wakeRibbon.points[Math.min(wakeRibbon.sections - 1, index + 1)];
    const tangent = tempA.copy(previous).sub(next);
    const cameraDirection = tempB.copy(toCamera).sub(point);
    const side = tempC.crossVectors(tangent, cameraDirection);
    if (side.lengthSq() < 0.0001) side.copy(right);
    else side.normalize();
    const t = index / (wakeRibbon.sections - 1);
    const width = (1 - t) * (0.025 + power * 0.085) * (0.76 + Math.sin(index * 1.7) * 0.18);
    const leftOffset = index * 6;
    wakeRibbon.positions[leftOffset] = point.x + side.x * width;
    wakeRibbon.positions[leftOffset + 1] = point.y + side.y * width;
    wakeRibbon.positions[leftOffset + 2] = point.z + side.z * width;
    wakeRibbon.positions[leftOffset + 3] = point.x - side.x * width;
    wakeRibbon.positions[leftOffset + 4] = point.y - side.y * width;
    wakeRibbon.positions[leftOffset + 5] = point.z - side.z * width;
    const alpha = Math.sin(t * Math.PI) * (1 - t);
    wakeRibbon.alphas[index * 2] = alpha;
    wakeRibbon.alphas[index * 2 + 1] = alpha;
  }
  wakeRibbon.geometry.attributes.position.needsUpdate = true;
  wakeRibbon.geometry.attributes.aAlpha.needsUpdate = true;
  wakeRibbon.material.uniforms.uPower.value = power;
  wakeRibbon.material.uniforms.uTime.value = state.time;
}

function updateViewModel(frameDt) {
  const strain = state.compressionVisual;
  const kick = state.cameraKick;
  const portrait = camera.aspect < 0.72;
  const reduced = reduceMotion.matches ? 0.25 : 1;
  const speed = state.velocity.length();
  const breathe = Math.sin(state.time * 1.7) * 0.018 * reduced;
  const wallSide = Math.sign(radialNormal.dot(right)) || 1;
  viewModel.root.position.x = THREE.MathUtils.lerp(viewModel.root.position.x, -state.velocity.dot(right) * 0.012, 1 - Math.exp(-frameDt * 8));
  viewModel.root.position.y = breathe - kick * 0.035;
  viewModel.root.rotation.z = THREE.MathUtils.lerp(
    viewModel.root.rotation.z,
    -state.strafeAxis * 0.025 - state.velocity.dot(right) * 0.008,
    1 - Math.exp(-frameDt * 7),
  );

  for (const claw of viewModel.claws) {
    const side = claw.side;
    const brace = state.wallPressure * (side === wallSide ? 0.17 : 0.035) * (portrait ? 0.4 : 1);
    const asymmetry = side < 0 ? Math.sin(state.time * 2.1) * 0.018 : Math.cos(state.time * 1.9) * 0.016;
    const baseWidth = portrait ? 0.33 : 0.72;
    const elbowWidth = portrait ? 0.29 : 0.62;
    const tipWidth = portrait ? 0.21 : 0.4;
    const hookWidth = portrait ? 0.095 : 0.17;
    const base = claw.base.set(side * (baseWidth + brace), -0.72, -1.16);
    const elbow = claw.elbow.set(
      side * (elbowWidth - strain * (portrait ? 0.055 : 0.11) + brace),
      -0.46 + strain * 0.12 + asymmetry,
      -1.37 - strain * 0.08,
    );
    const tip = claw.tip.set(
      side * (tipWidth - strain * (portrait ? 0.09 : 0.18) + kick * (portrait ? 0.055 : 0.1)),
      -0.18 + strain * 0.17 - kick * 0.16,
      -1.62 - strain * 0.22 + kick * 0.09,
    );
    const hookEnd = claw.hookEnd.set(
      side * (hookWidth - strain * (portrait ? 0.02 : 0.045)),
      -0.025 + strain * 0.08 - kick * 0.09,
      -1.83 - strain * 0.12 + kick * 0.05,
    );
    claw.shoulder.position.copy(base);
    claw.shoulder.scale.set(1.16, 0.76, 1.05);
    setSegment(claw.upper, base, elbow);
    claw.joint.position.copy(elbow);
    setSegment(claw.lower, elbow, tip);
    claw.tipJoint.position.copy(tip);
    setSegment(claw.hook, tip, hookEnd);

    for (let index = 0; index < claw.strands.length; index += 1) {
      const strand = claw.strands[index];
      strand.material.opacity = Math.max(0, strain - 0.06) * (0.38 + index * 0.12);
      const jitter = Math.sin(state.time * (4.2 + index) + side * 1.4) * 0.03 * strain;
      claw.strandEnd.set(
        side * ((portrait ? 0.035 : 0.06) + index * (portrait ? 0.026 : 0.04)) + jitter,
        0.025 + index * 0.042,
        -1.96 - strain * 0.06,
      );
      setSegment(strand, tip, claw.strandEnd);
    }
  }

  const nodePositions = [
    viewModel.claws[0].elbow,
    viewModel.claws[1].elbow,
    viewModel.claws[0].tip,
  ];
  for (let index = 0; index < viewModel.metabolismNodes.length; index += 1) {
    const node = viewModel.metabolismNodes[index];
    node.visible = index < campaign.collectedIds.length;
    if (!node.visible) continue;
    const nutrient = levelNutrients[campaign.levelIndex].find((item) => item.id === campaign.collectedIds[index]);
    if (nutrient) node.material.color.setHex(nutrient.color);
    node.position.copy(nodePositions[index]);
    const pulse = 1 + Math.sin(state.time * 5.2 + index * 1.7) * 0.17;
    node.scale.setScalar(pulse);
  }

  const targetFov = state.baseFov - strain * 2.5 + kick * 5.5 + Math.min(1.2, speed * 0.23);
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-frameDt * 12));
  camera.updateProjectionMatrix();
  viewCamera.fov = camera.fov;
  viewCamera.aspect = camera.aspect;
  viewCamera.updateProjectionMatrix();
}

function updateWorldVisuals() {
  if (campaign.levelIndex === 0) {
    const depthToAir = Math.max(0, SURFACE_Y - state.position.y);
    const exitLightFade = THREE.MathUtils.smoothstep(depthToAir, 1.0, 6.5);
    worldLights.exitLight.intensity = THREE.MathUtils.lerp(7.2, 24, exitLightFade);
    worldLights.warmBounce.intensity = THREE.MathUtils.lerp(2.2, 3.8, exitLightFade);
    worldLights.deepGlow.intensity = 2.8;
    can.wallMaterial.uniforms.uTime.value = state.time;
    can.causticMaterial.uniforms.uTime.value = state.time;
    fluidCurtains.material.uniforms.uTime.value = state.time;
    surface.membraneMaterial.uniforms.uTime.value = state.time;
    surface.membraneMaterial.uniforms.uPush.value = state.touchingSurface
      ? state.wallPressure * 0.35 + 0.45 + campaign.exitDamage * 0.16
      : campaign.exitUnlocked ? 0.08 : 0;
    surface.apertureMaterial.color.setRGB(
      campaign.exitUnlocked ? 0.62 : 0.25,
      campaign.exitUnlocked ? 0.9 : 0.45,
      campaign.exitUnlocked ? 1.0 : 0.55,
    );
    surface.shaftMaterial.uniforms.uTime.value = state.time;
  } else {
    worldLights.exitLight.intensity = 0;
    worldLights.warmBounce.intensity = 0;
    worldLights.deepGlow.intensity = 0;
    const unlockedPulse = 0.5 + Math.sin(state.time * 4.2) * 0.5;
    dungWorld.exitMembraneMaterial.color.setHex(campaign.exitUnlocked ? 0x86d5b3 : 0x263415);
    dungWorld.exitMembraneMaterial.emissive.setHex(campaign.exitUnlocked ? 0x24778c : 0x071e0c);
    dungWorld.exitMembraneMaterial.emissiveIntensity = campaign.exitUnlocked ? 0.65 + unlockedPulse * 0.65 : 0.2;
    dungWorld.exitMembraneMaterial.opacity = campaign.exitUnlocked ? 0.42 : 0.86;
    dungWorld.exitMembrane.scale.setScalar(1 + campaign.exitDamage * 0.3 + unlockedPulse * (campaign.exitUnlocked ? 0.035 : 0));
  }
  motes.material.uniforms.uStretch.value = Math.min(1, state.velocity.length() * 0.18 + state.cameraKick);
  bubbles.material.uniforms.uStretch.value = Math.min(0.7, state.velocity.length() * 0.11);
  milkPass.uniforms.uTime.value = state.time;
  milkPass.uniforms.uSpeed.value = state.velocity.length();
  milkPass.uniforms.uStrain.value = state.compressionVisual;
  milkPass.uniforms.uKick.value = state.cameraKick;
  milkPass.uniforms.uWall.value = state.wallPressure;
  milkPass.uniforms.uBiome.value = campaign.levelIndex;
  milkPass.uniforms.uReducedMotion.value = reduceMotion.matches ? 1 : 0;
}

function render(alpha = 1, frameDt = FIXED_DT) {
  visualPosition.copy(state.previousPosition).lerp(state.position, alpha);
  updateBasis();
  const speed = state.velocity.length();
  const bob = reduceMotion.matches ? 0 : Math.min(0.018, speed * 0.0045);
  const roll = reduceMotion.matches ? 0 : -state.velocity.dot(right) * 0.008 + Math.sin(state.time * 2.2) * bob * 0.15;
  camera.position.copy(visualPosition);
  camera.position.addScaledVector(right, Math.sin(state.time * 2.35) * bob * 0.42);
  camera.position.y += Math.sin(state.time * 2.8) * bob;
  camera.position.addScaledVector(forward, -state.compressionVisual * 0.03 + state.cameraKick * 0.018);
  camera.rotation.set(state.pitch, state.yaw, roll, "YXZ");
  updateCompressionPocket();
  updateWakeRibbon();
  updateViewModel(frameDt);
  updateWorldVisuals();

  let objectivePosition = currentLevelDefinition().exitPosition;
  if (campaign.activeTargetId && campaign.activeTargetId !== "exit") {
    const targetNutrient = activeNutrients().find((nutrient) => nutrient.id === campaign.activeTargetId);
    if (targetNutrient) objectivePosition = targetNutrient.position;
  } else if (!campaign.exitUnlocked) {
    const fallback = activeNutrients().find((nutrient) => !nutrient.collected);
    if (fallback) objectivePosition = fallback.position;
  }
  const objectiveDistance = state.position.distanceTo(objectivePosition);
  if (campaign.nearNutrientId) {
    objectiveLabel.textContent = "HOLD TO PUNCTURE";
    objectiveIcon.textContent = "✦";
  } else if (!campaign.exitUnlocked) {
    objectiveLabel.textContent = `FEED ${campaign.nutrientsCollected} / ${NUTRIENTS_REQUIRED}`;
    objectiveIcon.textContent = "◇";
  } else {
    const hitsLeft = currentLevelDefinition().exitHits - campaign.exitDamage;
    objectiveLabel.textContent = hitsLeft > 1 ? `BREAK OUT · ${hitsLeft} HITS` : "BREAK OUT";
    objectiveIcon.textContent = campaign.levelIndex === 0 ? "↑" : "△";
  }
  depthDistance.textContent = state.mode === "at-membrane" ? "MEMBRANE" : `${objectiveDistance.toFixed(1)} m`;
  objectiveMarker.style.opacity = campaign.flow === "complete" ? "0" : "";

  composer.render(frameDt);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(viewScene, viewCamera);
  renderer.autoClear = true;
}

function frame(now) {
  const elapsed = Math.min(MAX_FRAME_DT, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  if (!state.paused && now >= state.manualUntil) {
    accumulator = Math.min(accumulator + elapsed, FIXED_DT * 8);
    while (accumulator >= FIXED_DT) {
      simulate(FIXED_DT);
      accumulator -= FIXED_DT;
    }
  }
  render(accumulator / FIXED_DT, elapsed || FIXED_DT);
  requestAnimationFrame(frame);
}

function initAudio() {
  if (audioContext) {
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain();
  masterGain.gain.value = state.muted ? 0 : 0.065;
  masterGain.connect(audioContext.destination);

  const ambient = audioContext.createOscillator();
  const ambientGain = audioContext.createGain();
  const ambientFilter = audioContext.createBiquadFilter();
  ambient.type = "sine";
  ambient.frequency.value = 48;
  ambientGain.gain.value = 0.12;
  ambientFilter.type = "lowpass";
  ambientFilter.frequency.value = 180;
  ambient.connect(ambientFilter).connect(ambientGain).connect(masterGain);
  ambient.start();

  strainOscillator = audioContext.createOscillator();
  strainGain = audioContext.createGain();
  const strainFilter = audioContext.createBiquadFilter();
  strainOscillator.type = "triangle";
  strainOscillator.frequency.value = 62;
  strainGain.gain.value = 0;
  strainFilter.type = "lowpass";
  strainFilter.frequency.value = 260;
  strainOscillator.connect(strainFilter).connect(strainGain).connect(masterGain);
  strainOscillator.start();
}

function updateAudio() {
  if (!audioContext || !strainOscillator || !strainGain) return;
  const now = audioContext.currentTime;
  strainOscillator.frequency.setTargetAtTime(62 + state.compressionVisual * 78, now, 0.035);
  strainGain.gain.setTargetAtTime(state.compressionVisual * 0.21, now, 0.045);
}

function playYieldSound(strength) {
  if (!audioContext || !masterGain || state.muted) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(118 + strength * 26, now);
  oscillator.frequency.exponentialRampToValueAtTime(46, now + 0.24);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(620, now);
  filter.frequency.exponentialRampToValueAtTime(95, now + 0.26);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.72, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.29);
  oscillator.connect(filter).connect(gain).connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + 0.31);
}

function playNutrientSound(color, collectedCount) {
  if (!audioContext || !masterGain || state.muted) return;
  const now = audioContext.currentTime;
  const base = 190 + collectedCount * 58 + ((color >>> 8) & 31);
  for (let index = 0; index < 2; index += 1) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = index === 0 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(base * (index === 0 ? 1 : 1.5), now + index * 0.045);
    oscillator.frequency.exponentialRampToValueAtTime(base * (index === 0 ? 1.8 : 2.2), now + 0.24);
    gain.gain.setValueAtTime(0.001, now + index * 0.045);
    gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.32 : 0.18, now + 0.065 + index * 0.045);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.31);
    oscillator.connect(gain).connect(masterGain);
    oscillator.start(now + index * 0.045);
    oscillator.stop(now + 0.33);
  }
}

function playGasSound() {
  if (!audioContext || !masterGain || state.muted) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(92, now);
  oscillator.frequency.exponentialRampToValueAtTime(28, now + 0.36);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(260, now);
  filter.frequency.exponentialRampToValueAtTime(70, now + 0.34);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.44, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  oscillator.connect(filter).connect(gain).connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + 0.42);
}

function markInputUsed() {
  initAudio();
  if (state.usedInput) return;
  state.usedInput = true;
  movementHint.classList.add("is-used");
  document.body.classList.add("has-started");
}

function updateSwimControl() {
  if (touchMove.id === null) {
    swimControl.classList.remove("is-active");
    swimKnob.style.transform = "translate(0, 0)";
    return;
  }
  const dx = touchMove.currentX - touchMove.startX;
  const dy = touchMove.currentY - touchMove.startY;
  const distance = Math.hypot(dx, dy);
  const scale = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1;
  const clampedX = dx * scale;
  const clampedY = dy * scale;
  touchMove.x = clampedX / JOYSTICK_RADIUS;
  touchMove.y = -clampedY / JOYSTICK_RADIUS;
  swimControl.style.left = `${touchMove.startX}px`;
  swimControl.style.top = `${touchMove.startY}px`;
  swimKnob.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
  swimControl.classList.add("is-active");
}

function requestMouseLook() {
  if (!canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  try {
    const request = canvas.requestPointerLock();
    if (request && typeof request.catch === "function") {
      request.catch(() => {
        liveStatus.textContent = "Mouse capture unavailable. Hold and drag to look instead.";
      });
    }
  } catch {
    liveStatus.textContent = "Mouse capture unavailable. Hold and drag to look instead.";
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  initAudio();
  if (event.pointerType === "touch") {
    if (event.clientX < shell.clientWidth * 0.48 && touchMove.id === null) {
      touchMove.id = event.pointerId;
      touchMove.startX = event.clientX;
      touchMove.startY = event.clientY;
      touchMove.currentX = event.clientX;
      touchMove.currentY = event.clientY;
      updateSwimControl();
    } else if (touchLook.id === null) {
      touchLook.id = event.pointerId;
      touchLook.lastX = event.clientX;
      touchLook.lastY = event.clientY;
    }
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  mouseDrag.id = event.pointerId;
  mouseDrag.lastX = event.clientX;
  mouseDrag.lastY = event.clientY;
  requestMouseLook();
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId === touchMove.id) {
    event.preventDefault();
    touchMove.currentX = event.clientX;
    touchMove.currentY = event.clientY;
    updateSwimControl();
    if (Math.hypot(touchMove.x, touchMove.y) > 0.08) markInputUsed();
    return;
  }
  if (event.pointerId === touchLook.id) {
    event.preventDefault();
    addLookDelta(event.clientX - touchLook.lastX, event.clientY - touchLook.lastY, TOUCH_LOOK_MULTIPLIER);
    touchLook.lastX = event.clientX;
    touchLook.lastY = event.clientY;
    return;
  }
  if (event.pointerId === mouseDrag.id && document.pointerLockElement !== canvas) {
    addLookDelta(event.clientX - mouseDrag.lastX, event.clientY - mouseDrag.lastY);
    mouseDrag.lastX = event.clientX;
    mouseDrag.lastY = event.clientY;
  }
});

window.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === canvas) addLookDelta(event.movementX, event.movementY);
});

function releasePointer(event) {
  if (event.pointerId === touchMove.id) {
    touchMove.id = null;
    touchMove.x = 0;
    touchMove.y = 0;
    updateSwimControl();
  }
  if (event.pointerId === touchLook.id) touchLook.id = null;
  if (event.pointerId === mouseDrag.id) mouseDrag.id = null;
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener("lostpointercapture", releasePointer);
window.addEventListener("pointerup", releasePointer);
window.addEventListener("pointercancel", releasePointer);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

document.addEventListener("pointerlockchange", () => {
  state.pointerLocked = document.pointerLockElement === canvas;
  document.body.classList.toggle("is-locked", state.pointerLocked);
  liveStatus.textContent = state.pointerLocked
    ? "Mouse look captured. Keep swimming to load a Yield Stroke. Escape releases the mouse."
    : "Mouse look released. Click the view to capture it again.";
});

function bindDepthButton(button, pointerSet) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    pointerSet.add(event.pointerId);
    button.classList.add("is-held");
    button.setPointerCapture(event.pointerId);
    markInputUsed();
  });
  const release = (event) => {
    if (!pointerSet.has(event.pointerId)) return;
    pointerSet.delete(event.pointerId);
    button.classList.toggle("is-held", pointerSet.size > 0);
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
}

bindDepthButton(ascendButton, ascendPointers);
bindDepthButton(descendButton, descendPointers);

window.addEventListener("keydown", (event) => {
  const controlledCodes = [
    "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Space", "KeyE", "KeyC", "KeyQ", "ControlLeft", "ControlRight",
  ];
  if (controlledCodes.includes(event.code)) {
    event.preventDefault();
    markInputUsed();
  }
  if (event.code === "KeyF" && !event.repeat) {
    event.preventDefault();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else shell.requestFullscreen().catch(() => {});
  }
  if (event.code === "KeyR" && !event.repeat) reset();
  keyboard.add(event.code);
});

window.addEventListener("keyup", (event) => keyboard.delete(event.code));

function clearTransientInput() {
  keyboard.clear();
  touchMove.id = null;
  touchMove.x = 0;
  touchMove.y = 0;
  touchLook.id = null;
  mouseDrag.id = null;
  ascendPointers.clear();
  descendPointers.clear();
  ascendButton.classList.remove("is-held");
  descendButton.classList.remove("is-held");
  updateSwimControl();
}

window.addEventListener("blur", clearTransientInput);

function resetMovement(startDefinition) {
  clearTransientInput();
  state.mode = "swimming";
  state.time = 0;
  state.position.copy(startDefinition.startPosition);
  state.previousPosition.copy(startDefinition.startPosition);
  state.velocity.set(0, 0, 0);
  state.inputWorld.set(0, 0, 0);
  state.inputStrength = 0;
  state.strafeAxis = 0;
  state.forwardAxis = 0;
  state.verticalAxis = 0;
  state.yaw = startDefinition.startYaw;
  state.pitch = startDefinition.startPitch;
  state.targetYaw = startDefinition.startYaw;
  state.targetPitch = startDefinition.startPitch;
  state.distanceTravelled = 0;
  state.touchingWall = false;
  state.touchingBottom = false;
  state.touchingSurface = false;
  state.wallPressure = 0;
  state.passageRadius = campaign.levelIndex === 0
    ? pathRadiusAt(START_Y) - PLAYER_CLEARANCE
    : sampleDungBoundary(state.position).volume.radius - PLAYER_CLEARANCE;
  state.passageRegion = campaign.levelIndex === 0 ? "milk-chimney" : sampleDungBoundary(state.position).volume.id;
  state.usedInput = false;
  state.yieldPhase = "idle";
  state.yieldStrain = 0;
  state.yieldDirection.copy(forward);
  state.yieldPhaseTime = 0;
  state.yieldCount = 0;
  state.compressionVisual = 0;
  state.cameraKick = 0;
  state.wakePower = 0;
  state.tunnelSegments = 0;
  state.lastYieldSpeed = 0;
  state.manualUntil = 0;
  updateBasis();
  state.yieldDirection.copy(forward);
  movementHint.classList.remove("is-used");
  document.body.classList.remove("has-started", "is-loading", "is-breaking");
  for (const ring of tunnelRings) {
    ring.visible = false;
    ring.userData.life = 0;
    ring.material.opacity = 0;
  }
  for (const crumb of crumbPool) {
    crumb.visible = false;
    crumb.userData.life = 0;
    crumb.material.opacity = 0;
  }
  for (const point of wakeRibbon.points) point.copy(startDefinition.startPosition);
  wakeRibbon.material.uniforms.uPower.value = 0;
  compressionPocket.pocket.visible = false;
  trailClock = 0;
  tunnelRingCursor = 0;
  crumbCursor = 0;
  accumulator = 0;
}

function resetActiveObjectives() {
  campaign.transitionTime = 0;
  campaign.levelElapsed = 0;
  campaign.collectedIds = [];
  campaign.nutrientsCollected = 0;
  campaign.exitUnlocked = false;
  campaign.exitDamage = 0;
  campaign.lastExitAttempt = "none";
  campaign.lockedAttemptCount = 0;
  campaign.activeTargetId = activeNutrients()[0]?.id ?? "exit";
  campaign.nearNutrientId = null;
  campaign.nutrientPulse = 0;
  campaign.lastCollectionYield = -1;
  campaign.gasPushCount = 0;
  campaign.lastGasId = null;
  campaign.lastGasImpulse.set(0, 0, 0);
  campaign.gasRecovery = 0;
  nutrientFlash.style.opacity = "0";
  for (const nutrients of levelNutrients) {
    for (const nutrient of nutrients) {
      nutrient.collected = false;
      nutrient.collectedTime = -1;
      nutrient.collectedByYield = null;
      nutrient.root.scale.setScalar(1);
      nutrient.root.visible = nutrient.levelIndex === campaign.levelIndex;
      nutrient.membraneMaterial.opacity = 0.2;
      nutrient.haloMaterial.opacity = 0.3;
      nutrient.light.intensity = 0.9;
    }
  }
  for (const gas of dungWorld.gasBladders) {
    gas.cooldown = 0;
    gas.burst = 0;
    gas.mesh.scale.setScalar(1);
    gas.mesh.material.opacity = 0.58;
  }
}

function configureLevelPresentation(levelIndex) {
  const isDung = levelIndex === 1;
  for (const object of milkLevelObjects) object.visible = !isDung;
  dungWorld.group.visible = isDung;
  document.body.classList.toggle("level-dung", isDung);
  scene.background.setHex(isDung ? 0x0b0706 : 0x160804);
  scene.fog.color.setHex(isDung ? 0x28100c : 0x4a1d08);
  scene.fog.density = isDung ? 0.066 : 0.052;
  renderer.toneMappingExposure = isDung ? 0.9 : 0.83;
  motes.material.uniforms.uColor.value.setHex(isDung ? 0xa7c940 : 0xffc66c);
  bubbles.material.uniforms.uColor.value.setHex(isDung ? 0x9ac75a : 0xcbefff);
  viewModel.fill.color.setHex(isDung ? 0xe6a34c : 0xffcf85);
  viewModel.rim.color.setHex(isDung ? 0x9fe9ff : 0xcdefff);
  movementHint.querySelector("strong").textContent = coarsePointer.matches
    ? "LEFT SIDE SWIM · RIGHT SIDE LOOK"
    : "WASD + MOUSE — SWIM";
  movementHint.querySelector("span").textContent = coarsePointer.matches
    ? "ARROWS — RISE / SINK"
    : "SPACE / C — RISE / SINK";
  movementHint.querySelector("em").textContent = isDung
    ? "PUNCTURE THREE FOOD ORGANS. FIND THE PORCELAIN MOON."
    : "PUNCTURE THREE NUTRIENTS. THEN TEAR THE LID.";
}

function startLevel(levelIndex, { preserveRun = false } = {}) {
  campaign.levelIndex = THREE.MathUtils.clamp(levelIndex, 0, LEVEL_DEFINITIONS.length - 1);
  campaign.flow = "playing";
  runtimeRandom = mulberry32(24907220 + campaign.levelIndex * 101);
  configureLevelPresentation(campaign.levelIndex);
  resetActiveObjectives();
  resetMovement(currentLevelDefinition());
  resetParticleField(motes);
  resetParticleField(bubbles);
  if (!preserveRun && campaign.levelIndex === 0) {
    campaign.runElapsed = 0;
    campaign.completionTimes = [null, null];
  }
  const level = currentLevelDefinition();
  showChapterCard(`LEVEL ${campaign.levelIndex + 1}`, level.title, level.subtitle, campaign.levelIndex === 0 ? 1.8 : 2.05);
  liveStatus.textContent = campaign.levelIndex === 0
    ? "Level one. Puncture three nutrients with Yield Strokes, then tear the can lid."
    : "Level two. Explore the Corn Chapel, Beet Artery and Seed Comb, then rupture the porcelain-lit crust.";
  canvas.focus({ preventScroll: true });
  render(1, FIXED_DT);
}

function resetLevel() {
  campaign.resetCount += 1;
  startLevel(campaign.levelIndex, { preserveRun: true });
}

function restartRun() {
  campaign.resetCount = 0;
  campaign.runElapsed = 0;
  campaign.completionTimes = [null, null];
  startLevel(0, { preserveRun: false });
}

function reset() {
  resetLevel();
}

resetButton.addEventListener("click", resetLevel);
replayButton.addEventListener("click", restartRun);
muteButton.addEventListener("click", () => {
  initAudio();
  state.muted = !state.muted;
  muteButton.textContent = state.muted ? "MUTED" : "SOUND";
  muteButton.setAttribute("aria-pressed", String(state.muted));
  muteButton.setAttribute("aria-label", state.muted ? "Unmute sound" : "Mute sound");
  if (masterGain && audioContext) {
    masterGain.gain.setTargetAtTime(state.muted ? 0 : 0.065, audioContext.currentTime, 0.03);
  }
});

function updateTouchInstructions() {
  if (!coarsePointer.matches) return;
  movementHint.querySelector("strong").textContent = "LEFT SIDE SWIM · RIGHT SIDE LOOK";
  movementHint.querySelector("span").textContent = "ARROWS — RISE / SINK";
}

updateTouchInstructions();
coarsePointer.addEventListener?.("change", updateTouchInstructions);

const resizeObserver = new ResizeObserver(([entry]) => {
  const width = Math.max(1, entry.contentRect.width);
  const height = Math.max(1, entry.contentRect.height);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, coarsePointer.matches ? 1.1 : 1.45);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  camera.aspect = width / height;
  state.baseFov = width < height ? BASE_FOV_PORTRAIT : BASE_FOV_LANDSCAPE;
  camera.fov = state.baseFov;
  camera.updateProjectionMatrix();
  viewCamera.aspect = camera.aspect;
  viewCamera.fov = camera.fov;
  viewCamera.updateProjectionMatrix();
  bloomPass.enabled = !coarsePointer.matches && !reduceMotion.matches && width >= 680;
  milkPass.setSize(width * pixelRatio, height * pixelRatio);
  render(1, FIXED_DT);
});
resizeObserver.observe(shell);

document.addEventListener("visibilitychange", () => {
  state.paused = document.hidden;
  if (document.hidden) clearTransientInput();
  lastFrameTime = performance.now();
  accumulator = 0;
});

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  state.paused = true;
  liveStatus.textContent = "The 3D view paused while the graphics context recovers.";
});

canvas.addEventListener("webglcontextrestored", () => {
  state.paused = false;
  lastFrameTime = performance.now();
  liveStatus.textContent = "The 3D view recovered. The drowning chimney is ready.";
});

function round(value) {
  return Number(value.toFixed(3));
}

function statePayload() {
  updateBasis();
  let radialDistance;
  if (campaign.levelIndex === 0) {
    pathCenterAt(state.position.y, passageCenter);
    radialDistance = Math.hypot(state.position.x - passageCenter.x, state.position.z - passageCenter.z);
  } else {
    const sample = sampleDungBoundary(state.position);
    passageCenter.copy(sample.axisPoint);
    radialDistance = sample.distance;
  }
  const currentNutrients = activeNutrients();
  let activeTarget = currentLevelDefinition().exitPosition;
  if (campaign.activeTargetId && campaign.activeTargetId !== "exit") {
    activeTarget = currentNutrients.find((nutrient) => nutrient.id === campaign.activeTargetId)?.position ?? activeTarget;
  }
  tempA.copy(activeTarget).sub(state.position);
  const activeTargetDistance = tempA.length();
  const desiredYaw = activeTargetDistance > 0.0001 ? Math.atan2(-tempA.x, -tempA.z) : state.yaw;
  const desiredPitch = activeTargetDistance > 0.0001 ? Math.asin(THREE.MathUtils.clamp(tempA.y / activeTargetDistance, -1, 1)) : state.pitch;
  const exitDistance = state.position.distanceTo(currentLevelDefinition().exitPosition);
  const exitState = campaign.lastExitAttempt === "completed" || campaign.flow !== "playing"
    ? "completed"
    : campaign.exitUnlocked ? campaign.exitDamage > 0 ? "damaged" : "open" : "locked";
  return {
    mode: state.mode,
    cameraMode: "first-person-free-look",
    coordinateSystem: "right-handed metres; +y is up; movement occupies physical x/y/z inside a curved vertical passage",
    player: {
      x: round(state.position.x),
      y: round(state.position.y),
      z: round(state.position.z),
      velocityX: round(state.velocity.x),
      velocityY: round(state.velocity.y),
      velocityZ: round(state.velocity.z),
      speed: round(state.velocity.length()),
    },
    view: {
      yawRadians: round(state.yaw),
      pitchRadians: round(state.pitch),
      yawDegrees: round(THREE.MathUtils.radToDeg(state.yaw)),
      pitchDegrees: round(THREE.MathUtils.radToDeg(state.pitch)),
      forwardX: round(forward.x),
      forwardY: round(forward.y),
      forwardZ: round(forward.z),
      pointerLocked: state.pointerLocked,
      fov: round(camera.fov),
    },
    movement: {
      strafe: round(state.strafeAxis),
      forward: round(state.forwardAxis),
      vertical: round(state.verticalAxis),
      inputStrength: round(state.inputStrength),
      distanceTravelled: round(state.distanceTravelled),
    },
    yieldStroke: {
      phase: state.yieldPhase,
      strain: round(state.yieldStrain),
      directionX: round(state.yieldDirection.x),
      directionY: round(state.yieldDirection.y),
      directionZ: round(state.yieldDirection.z),
      count: state.yieldCount,
      compression: round(state.compressionVisual),
      cameraKick: round(state.cameraKick),
      activeTunnelSegments: state.tunnelSegments,
      speedBeforeLastBreak: round(state.lastYieldSpeed),
      levelCount: state.yieldCount,
    },
    campaign: {
      levelIndex: campaign.levelIndex + 1,
      levelId: currentLevelDefinition().id,
      levelTitle: currentLevelDefinition().title,
      phase: campaign.flow,
      levelElapsedMs: Math.round(campaign.levelElapsed * 1000),
      runElapsedMs: Math.round(campaign.runElapsed * 1000),
      completionTimesMs: campaign.completionTimes.map((value) => value === null ? null : Math.round(value * 1000)),
      resetCount: campaign.resetCount,
      campaignComplete: campaign.flow === "complete",
    },
    objective: {
      nutrientsCollected: campaign.nutrientsCollected,
      nutrientsRequired: NUTRIENTS_REQUIRED,
      collectedIds: [...campaign.collectedIds],
      activeTargetId: campaign.activeTargetId,
      activeTargetDistance: round(activeTargetDistance),
      activeTargetYawError: round(wrapAngle(desiredYaw - state.yaw)),
      activeTargetPitchError: round(desiredPitch - state.pitch),
      exitUnlocked: campaign.exitUnlocked,
      exitDamage: campaign.exitDamage,
      exitHitsRequired: currentLevelDefinition().exitHits,
      exitState,
      exitDistance: round(exitDistance),
      exitInRange: exitDistance <= (campaign.levelIndex === 0 ? MILK_EXIT_TRIGGER_RADIUS : DUNG_EXIT_TRIGGER_RADIUS),
      lastExitAttempt: campaign.lastExitAttempt,
      lockedAttemptCount: campaign.lockedAttemptCount,
    },
    exit: {
      x: round(currentLevelDefinition().exitPosition.x),
      y: round(currentLevelDefinition().exitPosition.y),
      z: round(currentLevelDefinition().exitPosition.z),
      active: campaign.exitUnlocked,
      state: exitState,
      hitsRemaining: Math.max(0, currentLevelDefinition().exitHits - campaign.exitDamage),
    },
    nutrients: currentNutrients.map((nutrient) => ({
      id: nutrient.id,
      name: nutrient.name,
      status: nutrient.collected ? "collected" : "intact",
      x: round(nutrient.position.x),
      y: round(nutrient.position.y),
      z: round(nutrient.position.z),
      distance: round(nutrient.position.distanceTo(state.position)),
      inRange: nutrient.position.distanceTo(state.position) <= 1.02,
      collectedByYield: nutrient.collectedByYield,
    })),
    hazards: {
      gasPushCount: campaign.gasPushCount,
      lastGasId: campaign.lastGasId,
      recovering: campaign.gasRecovery > 0,
      recoveryRemainingMs: Math.round(campaign.gasRecovery * 1000),
      lastImpulseX: round(campaign.lastGasImpulse.x),
      lastImpulseY: round(campaign.lastGasImpulse.y),
      lastImpulseZ: round(campaign.lastGasImpulse.z),
      lethal: false,
      bladders: dungWorld.gasBladders.map((gas) => ({
        id: gas.id,
        x: round(gas.position.x),
        y: round(gas.position.y),
        z: round(gas.position.z),
        radius: gas.radius,
        cooldownMs: Math.round(gas.cooldown * 1000),
      })),
    },
    ui: {
      overlay: chapterCard.classList.contains("is-final")
        ? "campaign-complete"
        : chapterCard.classList.contains("is-visible") ? "chapter" : "none",
      replayVisible: chapterCard.classList.contains("is-final"),
    },
    passage: {
      centerX: round(passageCenter.x),
      centerY: round(passageCenter.y),
      centerZ: round(passageCenter.z),
      regionId: state.passageRegion,
      legalRadius: round(state.passageRadius),
      radialDistance: round(radialDistance),
      bottomY: campaign.levelIndex === 0 ? CAN_BOTTOM : null,
      surfaceY: campaign.levelIndex === 0 ? SURFACE_Y : null,
      depthToAir: campaign.levelIndex === 0
        ? round(Math.max(0, SURFACE_Y - state.position.y))
        : round(exitDistance),
      touchingWall: state.touchingWall,
      touchingBottom: state.touchingBottom,
      touchingSurface: state.touchingSurface,
    },
    controls: {
      desktop: "click for mouse-look; WASD swims; Space/E rises; C/Q/Ctrl sinks; sustained coherent movement triggers Yield Strokes; R resets; F fullscreen",
      touch: "left-side drag swims; right-side drag looks; arrow buttons rise and sink; sustained movement triggers Yield Strokes",
    },
  };
}

window.render_game_to_text = () => JSON.stringify(statePayload());
window.advanceTime = (milliseconds) => {
  const steps = Math.max(1, Math.round(milliseconds / (FIXED_DT * 1000)));
  for (let index = 0; index < steps; index += 1) simulate(FIXED_DT);
  state.manualUntil = performance.now() + 5000;
  accumulator = 0;
  render(1, FIXED_DT);
};
window.__game = {
  ready: true,
  reset,
  getState: statePayload,
  addLookDelta,
  startLevel(index) {
    startLevel(index, { preserveRun: true });
  },
  restartLevel: resetLevel,
  restartRun,
  setView(yawRadians, pitchRadians) {
    state.targetYaw = wrapAngle(yawRadians);
    state.targetPitch = THREE.MathUtils.clamp(pitchRadians, -MAX_PITCH, MAX_PITCH);
    state.yaw = state.targetYaw;
    state.pitch = state.targetPitch;
    render(1, FIXED_DT);
  },
  setPosition(x, y, z) {
    state.position.set(x, y, z);
    state.previousPosition.copy(state.position);
    state.velocity.set(0, 0, 0);
    projectInsidePassage();
    for (const point of wakeRibbon.points) point.copy(state.position);
    render(1, FIXED_DT);
  },
};

restartRun();
requestAnimationFrame(frame);
