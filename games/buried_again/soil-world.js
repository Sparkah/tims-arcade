import { MarchingCubes } from './vendor/MarchingCubes.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const COFFIN_TRAVEL_DEPTH = 0.42;
export const BODY_RADIUS_METERS = 0.25;
export const MAX_BLOCKER_RATIO = 0.06;
// The wide camera already exposes almost 50 degrees to each side. Another
// 28 degrees of physical head turn reveals the full passage edge while keeping
// every screen ray in front of the player instead of looking back behind them.
export const LOOK_YAW_LIMIT = Math.PI * 28 / 180;
const LOOK_PITCH_LIMIT = Math.PI * 64 / 180;

export function evaluateDiscClearance({
  centerX,
  centerY,
  radius,
  columns,
  rows,
  cellWidth,
  cellHeight,
  originX,
  originY,
  edgeTolerance = 0,
  isBlocked,
  isConnected = () => true,
  requireBounds = true,
}) {
  const minX = Math.floor((centerX - radius - originX) / cellWidth);
  const maxX = Math.floor((centerX + radius - originX) / cellWidth);
  const minY = Math.floor((centerY - radius - originY) / cellHeight);
  const maxY = Math.floor((centerY + radius - originY) / cellHeight);
  if (requireBounds && (minX < 0 || maxX >= columns || minY < 0 || maxY >= rows)) {
    return { checked: 0, blockers: 0, blockerLimit: 0, connected: false, openRatio: 0, passable: false };
  }

  let checked = 0;
  let blockers = 0;
  let connected = false;
  for (let iy = Math.max(0, minY); iy <= Math.min(rows - 1, maxY); iy++) {
    for (let ix = Math.max(0, minX); ix <= Math.min(columns - 1, maxX); ix++) {
      const x = originX + (ix + 0.5) * cellWidth;
      const y = originY + (iy + 0.5) * cellHeight;
      if (Math.hypot(x - centerX, y - centerY) > radius + edgeTolerance) continue;
      checked++;
      if (isBlocked(ix, iy)) blockers++;
      if (isConnected(ix, iy)) connected = true;
    }
  }
  const blockerLimit = Math.max(1, Math.floor(checked * MAX_BLOCKER_RATIO));
  return {
    checked,
    blockers,
    blockerLimit,
    connected,
    openRatio: checked ? 1 - blockers / checked : 0,
    passable: checked > 0 && connected && blockers <= blockerLimit,
  };
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function hash3(x, y, z, salt = 0) {
  let n = Math.imul(x + salt * 17, 374761393);
  n = (n + Math.imul(y + salt * 31, 668265263)) | 0;
  n = (n + Math.imul(z + salt * 47, 2147483647)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export class SoilWorld {
  constructor({ THREE, scene, skyTexture = null }) {
    this.THREE = THREE;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'physical-soil-volume';

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      emissive: 0x351609,
      emissiveIntensity: 0.65,
      side: THREE.DoubleSide,
    });
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSoilWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSoilWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vSoilWorld;
float soilHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float soilNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = soilHash(cell);
  float n100 = soilHash(cell + vec3(1.0, 0.0, 0.0));
  float n010 = soilHash(cell + vec3(0.0, 1.0, 0.0));
  float n110 = soilHash(cell + vec3(1.0, 1.0, 0.0));
  float n001 = soilHash(cell + vec3(0.0, 0.0, 1.0));
  float n101 = soilHash(cell + vec3(1.0, 0.0, 1.0));
  float n011 = soilHash(cell + vec3(0.0, 1.0, 1.0));
  float n111 = soilHash(cell + vec3(1.0, 1.0, 1.0));
  float low = mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y);
  float high = mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y);
  return mix(low, high, f.z);
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
float soilCoarse = soilNoise(vSoilWorld * 15.0);
float soilFine = soilNoise(vSoilWorld * 52.0 + vec3(7.0, 19.0, 3.0));
float soilSpeck = smoothstep(0.7, 0.9, soilFine);
float soilGrain = (0.68 + soilCoarse * 0.3) * (1.0 - soilSpeck * 0.28);
float soilBand = fract(max(0.0, -vSoilWorld.z) * 1.65 + 0.13);
float soilBandDistance = min(soilBand, 1.0 - soilBand);
float soilSeam = mix(0.58, 1.0, smoothstep(0.018, 0.085, soilBandDistance));
float soilStrataTone = 0.92 + sin(max(0.0, -vSoilWorld.z) * 7.4) * 0.08;
diffuseColor.rgb *= soilGrain * soilSeam * soilStrataTone;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.22, 0.16), soilSpeck * 0.16);`);
    };
    this.material.customProgramCacheKey = () => 'physical-soil-grain-v3';
    this.mesh = new MarchingCubes(52, this.material, false, true, 180000);
    this.mesh.isolation = 0.5;
    this.mesh.name = 'excavated-soil-boundary';
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    // The editable voxel field only needs to cover the playable passage. A
    // larger non-editable earth collar closes its outer edges so broad
    // first-person side looks always meet visible ground rather than the scene
    // clear colour.
    this.boundaryGroup = new THREE.Group();
    this.boundaryGroup.name = 'visible-earth-beyond-playable-soil';
    const makeBoundarySlab = (name) => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const position = geometry.getAttribute('position');
      const colors = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const grain = 0.86 + hash3(i, i * 3, i * 7, 21) * 0.18;
        colors[i * 3] = 0.39 * grain;
        colors[i * 3 + 1] = 0.14 * grain;
        colors[i * 3 + 2] = 0.038 * grain;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const slab = new THREE.Mesh(geometry, this.material);
      slab.name = name;
      slab.frustumCulled = false;
      this.boundaryGroup.add(slab);
      return slab;
    };
    this.boundarySlabs = {
      left: makeBoundarySlab('left-perimeter-earth'),
      right: makeBoundarySlab('right-perimeter-earth'),
      top: makeBoundarySlab('top-perimeter-earth'),
      bottom: makeBoundarySlab('bottom-perimeter-earth'),
    };
    this.group.add(this.boundaryGroup);

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      vertexShader: `
        varying vec3 vSkyDirection;
        void main() {
          vSkyDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vSkyDirection;
        float skyHash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }
        float skyNoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = mix(skyHash(i), skyHash(i + vec3(1.0, 0.0, 0.0)), f.x);
          float b = mix(skyHash(i + vec3(0.0, 1.0, 0.0)), skyHash(i + vec3(1.0, 1.0, 0.0)), f.x);
          float c = mix(skyHash(i + vec3(0.0, 0.0, 1.0)), skyHash(i + vec3(1.0, 0.0, 1.0)), f.x);
          float d = mix(skyHash(i + vec3(0.0, 1.0, 1.0)), skyHash(i + vec3(1.0, 1.0, 1.0)), f.x);
          return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
        }
        void main() {
          vec3 direction = normalize(vSkyDirection);
          float altitude = clamp(-direction.z, 0.0, 1.0);
          vec3 horizon = vec3(0.58, 0.79, 0.92);
          vec3 zenith = vec3(0.08, 0.32, 0.62);
          vec3 color = mix(horizon, zenith, pow(altitude, 0.58));
          float cloudBand = smoothstep(0.04, 0.28, altitude) * (1.0 - smoothstep(0.7, 0.95, altitude));
          float cloudNoise = skyNoise(direction * 19.0 + vec3(2.0, 9.0, 4.0)) * 0.68 +
            skyNoise(direction * 43.0 + vec3(7.0, 3.0, 11.0)) * 0.32;
          float clouds = smoothstep(0.71, 0.83, cloudNoise) * cloudBand;
          color = mix(color, vec3(0.94, 0.97, 0.99), clouds * 0.2);
          vec3 sunDirection = normalize(vec3(0.18, -0.08, -1.0));
          float sun = pow(max(dot(direction, sunDirection), 0.0), 720.0);
          float halo = pow(max(dot(direction, sunDirection), 0.0), 48.0);
          color += vec3(1.0, 0.82, 0.42) * halo * 0.24 + vec3(1.0, 0.94, 0.72) * sun;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), skyMat);
    this.sky.name = 'surface-sky-dome';
    this.sky.visible = false;
    this.sky.renderOrder = -100;
    this.group.add(this.sky);

    const groundGeometry = new THREE.RingGeometry(0.34, 12, 96, 12);
    const groundPositions = groundGeometry.attributes.position;
    const groundColors = new Float32Array(groundPositions.count * 3);
    const groundColor = new THREE.Color();
    for (let index = 0; index < groundPositions.count; index++) {
      const x = groundPositions.getX(index);
      const y = groundPositions.getY(index);
      const radius = Math.hypot(x, y);
      const grain = hash3(Math.round(x * 17), Math.round(y * 17), 0, 23);
      if (radius < 0.62) groundColor.setRGB(0.19 + grain * 0.07, 0.105 + grain * 0.035, 0.035);
      else groundColor.setRGB(0.105 + grain * 0.035, 0.22 + grain * 0.08, 0.055 + grain * 0.025);
      groundColors[index * 3] = groundColor.r;
      groundColors[index * 3 + 1] = groundColor.g;
      groundColors[index * 3 + 2] = groundColor.b;
    }
    groundGeometry.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));
    const groundMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      emissive: 0x071205,
      emissiveIntensity: 0.32,
      side: THREE.DoubleSide,
    });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.name = 'physical-ground-around-exit';
    this.ground.visible = false;
    this.group.add(this.ground);

    this.rimDetails = new THREE.Group();
    this.rimDetails.name = 'surface-rim-grass-and-stones';
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x3f6d25, roughness: 0.95, side: THREE.DoubleSide });
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x667064, roughness: 1 });
    for (let index = 0; index < 24; index++) {
      const angle = index / 24 * Math.PI * 2 + hash3(index, 0, 0, 6) * 0.18;
      const radius = 0.37 + hash3(index, 0, 0, 7) * 0.1;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.11 + hash3(index, 0, 0, 8) * 0.09, 3), grassMaterial);
      blade.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -0.055);
      blade.rotation.x = Math.PI / 2 + (hash3(index, 0, 0, 9) - 0.5) * 0.35;
      blade.rotation.z = angle;
      this.rimDetails.add(blade);
      if (index % 4 === 0) {
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.028 + hash3(index, 1, 0, 5) * 0.025, 0), stoneMaterial);
        stone.position.set(Math.cos(angle + 0.16) * (radius + 0.06), Math.sin(angle + 0.16) * (radius + 0.06), -0.035);
        stone.scale.z = 0.55;
        this.rimDetails.add(stone);
      }
    }
    this.rimDetails.visible = false;
    this.group.add(this.rimDetails);

    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, depthTest: false }),
    );
    this.marker.renderOrder = 90;
    this.marker.visible = false;
    this.group.add(this.marker);

    // Collision remains physical, but guidance comes from the visible tunnel
    // shape and lighting rather than a red target floating over the soil.
    this.blockerGuide = new THREE.Object3D();
    this.blockerGuide.name = 'disabled-forward-width-marker';
    this.blockerGuide.visible = false;
    this.group.add(this.blockerGuide);

    this.group.visible = false;
    scene.add(this.group);
    this.reset({ depthMeters: 1.83, workSteps: 27, grave: 1 });
  }

  reset({ depthMeters, workSteps, grave, snapshot = null }) {
    // The soil mass extends beyond the long coffin ends so looking sideways
    // reveals more earth rather than black scene edges. Collision resolution
    // stays at roughly five-centimetre cells around the playable centreline.
    this.width = 2.05;
    this.height = 1.55;
    this.depthMeters = Math.max(0.9, depthMeters);
    this.nx = 42;
    this.ny = 32;
    // Keep collision slices no finer than the render field so every blocking
    // section has a visible Marching Cubes sample, including later graves.
    this.nz = clamp(Math.round(workSteps), 18, 44);
    this.dx = this.width / this.nx;
    this.dy = this.height / this.ny;
    this.dz = this.depthMeters / this.nz;
    this.grave = grave;
    this.updateBoundaryShell();
    this.coffinDepth = COFFIN_TRAVEL_DEPTH;
    this.bodyRadius = BODY_RADIUS_METERS;
    this.armReach = Math.max(0.62, this.bodyRadius * 2.25);
    this.bodyHalfDepth = Math.max(0.08, this.dz * 0.72);
    this.solid = new Uint8Array(this.nx * this.ny * this.nz);
    this.solid.fill(1);
    this.connected = new Uint8Array(this.solid.length);
    this.widthBlockers = new Uint8Array(this.solid.length);
    this.widthBlockerIndices = [];
    this.widthBlockerCount = 0;
    this.widthBlockerSlice = -1;
    this.primaryWidthBlocker = -1;
    this.blockerGuidePulse = 0;
    this.blockerGuide.visible = false;
    this.playerX = 0;
    this.playerY = 0;
    this.bodyDepth = -this.coffinDepth;
    this.bodyTargetDepth = -this.coffinDepth;
    this.movementCommandActive = false;
    this.autoFollow = false;
    this.routeFollowing = true;
    this.frontierDepth = 0;
    this.bodyClearDepth = 0;
    this.routeCoverageDepth = 0;
    this.surfaceBreached = false;
    this.surfaceExit = null;
    this.removedCells = 0;
    this.lastHit = null;
    this.lastCarveResult = null;
    this.needsWidth = false;
    this.yaw = 0;
    this.pitch = 0;

    if (snapshot && (snapshot.version === 1 || snapshot.version === 2) && Array.isArray(snapshot.removed)) {
      const source = snapshot.version === 2 && snapshot.grid
        ? snapshot.grid
        : { nx: 32, ny: 32, nz: this.nz, width: 1.55, height: 1.55 };
      const sameGrid = source.nx === this.nx && source.ny === this.ny && source.nz === this.nz &&
        source.width === this.width && source.height === this.height;
      for (const sourceIndex of snapshot.removed) {
        if (!Number.isInteger(sourceIndex) || sourceIndex < 0) continue;
        let targetIndex = sourceIndex;
        if (!sameGrid) {
          const sourcePlane = source.nx * source.ny;
          const sourceZ = Math.floor(sourceIndex / sourcePlane);
          const sourceRemainder = sourceIndex - sourceZ * sourcePlane;
          const sourceY = Math.floor(sourceRemainder / source.nx);
          const sourceX = sourceRemainder - sourceY * source.nx;
          if (sourceX < 0 || sourceX >= source.nx || sourceY < 0 || sourceY >= source.ny ||
              sourceZ < 0 || sourceZ >= source.nz) continue;
          const worldX = -source.width / 2 + (sourceX + 0.5) * source.width / source.nx;
          const worldY = -source.height / 2 + (sourceY + 0.5) * source.height / source.ny;
          const targetX = clamp(Math.floor((worldX + this.width / 2) / this.dx), 0, this.nx - 1);
          const targetY = clamp(Math.floor((worldY + this.height / 2) / this.dy), 0, this.ny - 1);
          const targetZ = clamp(Math.floor((sourceZ + 0.5) / source.nz * this.nz), 0, this.nz - 1);
          targetIndex = this.index(targetX, targetY, targetZ);
        }
        if (targetIndex >= 0 && targetIndex < this.solid.length && this.solid[targetIndex]) {
          this.solid[targetIndex] = 0;
          this.removedCells++;
        }
      }
      this.playerX = clamp(Number(snapshot.playerX) || 0, -this.width * 0.4, this.width * 0.4);
      this.playerY = clamp(Number(snapshot.playerY) || 0, -this.height * 0.4, this.height * 0.4);
      this.yaw = clamp(Number(snapshot.yaw) || 0, -LOOK_YAW_LIMIT, LOOK_YAW_LIMIT);
      this.pitch = clamp(Number(snapshot.pitch) || 0, -LOOK_PITCH_LIMIT, LOOK_PITCH_LIMIT);
      this.bodyDepth = clamp(Number(snapshot.bodyDepth) || 0, -this.coffinDepth, this.depthMeters);
      // A saved target may come from legacy auto-follow or an interrupted input.
      // Resuming always rests at the saved body pose until a new button press.
      this.bodyTargetDepth = this.bodyDepth;
      this.movementCommandActive = false;
      this.autoFollow = false;
      this.routeFollowing = true;
    }

    this.updateSurfaceExit();
    const marchingExtent = (this.mesh.size / 2 - 2.5) / (this.mesh.size / 2);
    this.mesh.scale.set(
      this.width / (2 * marchingExtent),
      this.height / (2 * marchingExtent),
      this.depthMeters / (2 * marchingExtent),
    );
    this.mesh.position.set(0, 0, -this.depthMeters / 2);
    this.recomputeConnectivity();
    this.rebuild();

    this.bodyDepth = clamp(this.bodyDepth, -this.coffinDepth, this.bodyClearDepth);
    this.bodyTargetDepth = clamp(this.bodyTargetDepth, -this.coffinDepth, this.bodyClearDepth);
    const restoredRoutePosition = this.routePositionAt(this.bodyDepth);
    this.playerX = this.bodyDepth > 0 && restoredRoutePosition ? restoredRoutePosition.x : 0;
    this.playerY = this.bodyDepth > 0 && restoredRoutePosition ? restoredRoutePosition.y : 0;
    this.updateMarker();
  }

  dispose() {
    this.mesh.geometry.dispose();
    Object.values(this.boundarySlabs).forEach((slab) => slab.geometry.dispose());
    this.material.dispose();
  }

  updateBoundaryShell() {
    if (!this.boundarySlabs) return;
    const outerHalf = 6;
    const innerX = this.width / 2 + 0.015;
    const innerY = this.height / 2 + 0.015;
    const collarBack = 0.62;
    const outerFront = -this.depthMeters - 0.18;
    const shellDepth = collarBack - outerFront;
    const shellZ = (collarBack + outerFront) / 2;
    const sideWidth = outerHalf - innerX;
    const endHeight = outerHalf - innerY;

    this.boundarySlabs.left.position.set(-(innerX + sideWidth / 2), 0, shellZ);
    this.boundarySlabs.left.scale.set(sideWidth, outerHalf * 2, shellDepth);
    this.boundarySlabs.right.position.set(innerX + sideWidth / 2, 0, shellZ);
    this.boundarySlabs.right.scale.set(sideWidth, outerHalf * 2, shellDepth);
    this.boundarySlabs.top.position.set(0, innerY + endHeight / 2, shellZ);
    this.boundarySlabs.top.scale.set(innerX * 2, endHeight, shellDepth);
    this.boundarySlabs.bottom.position.set(0, -(innerY + endHeight / 2), shellZ);
    this.boundarySlabs.bottom.scale.set(innerX * 2, endHeight, shellDepth);
  }

  setVisible(visible) {
    this.group.visible = visible;
    this.sky.visible = visible && this.surfaceBreached;
    this.ground.visible = visible && this.surfaceBreached;
    this.rimDetails.visible = visible && this.surfaceBreached;
  }

  setInspecting(inspecting) {
    this.marker.visible = inspecting;
    this.updateMarker();
  }

  updateMarker() {
    this.marker.position.set(this.playerX, this.playerY, -this.bodyDepth);
  }

  index(ix, iy, iz) {
    return ix + this.nx * (iy + this.ny * iz);
  }

  inside(ix, iy, iz) {
    return ix >= 0 && ix < this.nx && iy >= 0 && iy < this.ny && iz >= 0 && iz < this.nz;
  }

  isSolid(ix, iy, iz) {
    if (!this.inside(ix, iy, iz)) return true;
    return this.solid[this.index(ix, iy, iz)] === 1;
  }

  worldToCell(x, y, z) {
    return {
      ix: Math.floor((x + this.width / 2) / this.dx),
      iy: Math.floor((y + this.height / 2) / this.dy),
      iz: Math.floor((-z) / this.dz),
    };
  }

  cellCenter(ix, iy, iz) {
    return {
      x: -this.width / 2 + (ix + 0.5) * this.dx,
      y: -this.height / 2 + (iy + 0.5) * this.dy,
      z: -(iz + 0.5) * this.dz,
    };
  }

  colorAt(gx, gy, gz) {
    const depthT = clamp(gz / this.nz, 0, 1);
    const bands = Math.max(5, Math.round(this.depthMeters / 0.55));
    const bandFloat = depthT * bands;
    const bandIndex = Math.floor(bandFloat);
    const seam = Math.abs(bandFloat - Math.round(bandFloat)) < 0.055 ? 0.58 : 1;
    const grain = 0.9 + hash3(gx, gy, gz, 9) * 0.16;
    const palettes = [
      [0.12, 0.038, 0.012],
      [0.32, 0.13, 0.032],
      [0.115, 0.094, 0.072],
      [0.275, 0.078, 0.018],
      [0.18, 0.145, 0.064],
    ];
    const base = palettes[bandIndex % palettes.length];
    const shallow = smoothstep(depthT) * 0.035;
    return {
      r: (base[0] + shallow) * seam * grain,
      g: (base[1] + shallow * 0.55) * seam * grain,
      b: (base[2] + shallow * 0.22) * seam * grain,
    };
  }

  vertexPosition(gx, gy, gz) {
    const minCell = Math.min(this.dx, this.dy, this.dz);
    const amp = minCell * 0.14;
    const edgeX = gx === 0 || gx === this.nx;
    const edgeY = gy === 0 || gy === this.ny;
    const xNoise = edgeX ? 0 : (hash3(gx, gy, gz, 1) - 0.5) * amp;
    const yNoise = edgeY ? 0 : (hash3(gx, gy, gz, 2) - 0.5) * amp;
    const zNoise = (gz === 0 || gz === this.nz) ? 0 : (hash3(gx, gy, gz, 3) - 0.5) * amp;
    return [
      -this.width / 2 + gx * this.dx + xNoise,
      -this.height / 2 + gy * this.dy + yNoise,
      -gz * this.dz + zNoise,
    ];
  }

  rebuild() {
    this.mesh.reset();
    const resolution = this.mesh.size;
    const inner = resolution - 5;
    const field = this.mesh.field;
    const palette = this.mesh.palette;

    const sampleSolid = (gx, gy, gz) => {
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const z0 = Math.floor(gz);
      const tx = gx - x0;
      const ty = gy - y0;
      const tz = gz - z0;
      let value = 0;
      for (let oz = 0; oz <= 1; oz++) {
        const wz = oz ? tz : 1 - tz;
        for (let oy = 0; oy <= 1; oy++) {
          const wy = oy ? ty : 1 - ty;
          for (let ox = 0; ox <= 1; ox++) {
            const wx = ox ? tx : 1 - tx;
            const ix = x0 + ox;
            const iy = y0 + oy;
            const iz = z0 + oz;
            if (this.inside(ix, iy, iz) && this.solid[this.index(ix, iy, iz)]) value += wx * wy * wz;
          }
        }
      }
      return value;
    };

    for (let fz = 2; fz < resolution - 2; fz++) {
      const depthT = 1 - (fz - 2) / inner;
      const gz = depthT * this.nz - 0.5;
      const iz = clamp(Math.round(gz), 0, this.nz - 1);
      for (let fy = 2; fy < resolution - 2; fy++) {
        const gy = ((fy - 2) / inner) * this.ny - 0.5;
        const iy = clamp(Math.round(gy), 0, this.ny - 1);
        for (let fx = 2; fx < resolution - 2; fx++) {
          const gx = ((fx - 2) / inner) * this.nx - 0.5;
          const ix = clamp(Math.round(gx), 0, this.nx - 1);
          const fieldIndex = fx + resolution * (fy + resolution * fz);
          field[fieldIndex] = sampleSolid(gx, gy, gz);
          const color = this.colorAt(ix, iy, iz);
          palette[fieldIndex * 3] = color.r;
          palette[fieldIndex * 3 + 1] = color.g;
          palette[fieldIndex * 3 + 2] = color.b;
        }
      }
    }

    this.mesh.update();
  }

  recomputeConnectivity() {
    this.connected.fill(0);
    const queue = new Int32Array(this.solid.length);
    let head = 0;
    let tail = 0;

    for (let iy = 0; iy < this.ny; iy++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const index = this.index(ix, iy, 0);
        if (!this.solid[index]) {
          this.connected[index] = 1;
          queue[tail++] = index;
        }
      }
    }

    let deepestCell = -1;
    let breached = false;
    const plane = this.nx * this.ny;
    const neighbors = [1, -1, this.nx, -this.nx, plane, -plane];

    while (head < tail) {
      const index = queue[head++];
      const iz = Math.floor(index / plane);
      const rem = index - iz * plane;
      const iy = Math.floor(rem / this.nx);
      const ix = rem - iy * this.nx;
      deepestCell = Math.max(deepestCell, iz);
      if (iz === this.nz - 1) breached = true;

      for (let n = 0; n < neighbors.length; n++) {
        const nx = ix + (n === 0 ? 1 : n === 1 ? -1 : 0);
        const ny = iy + (n === 2 ? 1 : n === 3 ? -1 : 0);
        const nz = iz + (n === 4 ? 1 : n === 5 ? -1 : 0);
        if (!this.inside(nx, ny, nz)) continue;
        const next = this.index(nx, ny, nz);
        if (this.solid[next] || this.connected[next]) continue;
        this.connected[next] = 1;
        queue[tail++] = next;
      }
    }

    this.frontierDepth = deepestCell < 0 ? 0 : Math.min(this.depthMeters, (deepestCell + 1) * this.dz);
    this.surfaceBreached = breached;
    this.surfaceExit = breached ? this.findSurfaceExit() : null;
    this.sky.visible = this.group.visible && this.surfaceBreached;
    this.bodyRoute = this.planBodyRoute();
    this.routeCoverageDepth = Math.min(this.depthMeters, this.bodyRoute.length * this.dz);
    this.bodyClearDepth = this.computeRouteClearDepth();
    this.autoFollow = false;
    this.needsWidth = this.frontierDepth > this.routeCoverageDepth + this.dz * 0.35;
    this.computeWidthBlockers();
    this.constrainLook();
    this.updateSurfaceExit();
  }

  computeWidthBlockers() {
    this.widthBlockers.fill(0);
    this.widthBlockerIndices.length = 0;
    this.widthBlockerCount = 0;
    this.widthBlockerSlice = -1;
    this.primaryWidthBlocker = -1;
    this.blockerGuide.visible = false;
    if (!this.needsWidth) return;

    const iz = clamp(this.bodyRoute?.length || 0, 0, this.nz - 1);
    const routeEnd = this.bodyRoute?.length
      ? this.bodyRoute[this.bodyRoute.length - 1]
      : { x: this.playerX, y: this.playerY };
    const openingRadius = this.bodyRadius * 0.9;
    let openingX = 0;
    let openingY = 0;
    let openingCells = 0;

    for (let iy = 0; iy < this.ny; iy++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const index = this.index(ix, iy, iz);
        if (this.solid[index] || !this.connected[index]) continue;
        const center = this.cellCenter(ix, iy, iz);
        if (Math.hypot(center.x - routeEnd.x, center.y - routeEnd.y) > openingRadius) continue;
        openingX += center.x;
        openingY += center.y;
        openingCells++;
      }
    }

    const centerX = openingCells ? openingX / openingCells : routeEnd.x;
    const centerY = openingCells ? openingY / openingCells : routeEnd.y;
    const targetRadius = this.bodyRadius + Math.max(this.dx, this.dy) * 0.35;
    const candidates = [];
    const boundaryCandidates = [];
    const neighbors = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

    for (let iy = 0; iy < this.ny; iy++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const index = this.index(ix, iy, iz);
        if (!this.solid[index]) continue;
        const center = this.cellCenter(ix, iy, iz);
        if (Math.hypot(center.x - centerX, center.y - centerY) > targetRadius) continue;
        candidates.push(index);
        const bordersOpening = neighbors.some(([ox, oy, oz]) => {
          const nx = ix + ox;
          const ny = iy + oy;
          const nz = iz + oz;
          if (!this.inside(nx, ny, nz)) return false;
          const neighbor = this.index(nx, ny, nz);
          return !this.solid[neighbor] && this.connected[neighbor];
        });
        if (bordersOpening) boundaryCandidates.push(index);
      }
    }

    const blockers = boundaryCandidates.length ? boundaryCandidates : candidates;
    const bodyPoint = new this.THREE.Vector3(this.playerX, this.playerY, -this.bodyDepth);
    let bestPrimaryScore = Infinity;
    for (const index of blockers) {
      this.widthBlockers[index] = 1;
      this.widthBlockerIndices.push(index);
      this.widthBlockerCount++;
      const plane = this.nx * this.ny;
      const pointIz = Math.floor(index / plane);
      const remainder = index - pointIz * plane;
      const pointIy = Math.floor(remainder / this.nx);
      const pointIx = remainder - pointIy * this.nx;
      const point = this.cellCenter(pointIx, pointIy, pointIz);
      const distance = bodyPoint.distanceTo(new this.THREE.Vector3(point.x, point.y, point.z));
      const reachablePenalty = distance <= this.armReach + this.dz * 0.55 ? 0 : 100;
      const routeCenterDistance = Math.hypot(point.x - centerX, point.y - centerY);
      const score = reachablePenalty + routeCenterDistance * 4 + distance;
      if (score < bestPrimaryScore) {
        bestPrimaryScore = score;
        this.primaryWidthBlocker = index;
      }
    }
    if (this.widthBlockerCount) this.widthBlockerSlice = iz;
    this.updateBlockerGuide();
  }

  primaryWidthTarget(target = new this.THREE.Vector3()) {
    const index = this.primaryWidthBlocker;
    if (index < 0 || !this.widthBlockers[index] || !this.solid[index]) return null;
    const plane = this.nx * this.ny;
    const iz = Math.floor(index / plane);
    const remainder = index - iz * plane;
    const iy = Math.floor(remainder / this.nx);
    const ix = remainder - iy * this.nx;
    const center = this.cellCenter(ix, iy, iz);
    return target.set(center.x, center.y, center.z);
  }

  updateBlockerGuide() {
    this.blockerGuide.visible = false;
  }

  widthTargetPoints(limit = 8, bodyPoint = null, armReach = Infinity) {
    if (!this.widthBlockerCount) return [];
    const points = [];
    const plane = this.nx * this.ny;
    const armReachSq = armReach * armReach;
    const appendTarget = (index) => {
      if (!this.widthBlockers[index] || !this.solid[index]) return;
      const iz = Math.floor(index / plane);
      const remainder = index - iz * plane;
      const iy = Math.floor(remainder / this.nx);
      const ix = remainder - iy * this.nx;
      const center = this.cellCenter(ix, iy, iz);
      if (bodyPoint && (
        (center.x - bodyPoint.x) ** 2 +
        (center.y - bodyPoint.y) ** 2 +
        (center.z - bodyPoint.z) ** 2
      ) > armReachSq) return;
      points.push(center);
    };
    if (this.primaryWidthBlocker >= 0) appendTarget(this.primaryWidthBlocker);
    for (const index of this.widthBlockerIndices) {
      if (points.length >= limit) break;
      if (index !== this.primaryWidthBlocker) appendTarget(index);
    }
    return points;
  }

  findAimedWidthTarget(ray, bodyPoint, armReach) {
    const targets = this.widthTargetPoints(this.widthBlockerCount, bodyPoint, armReach);
    const targetRadius = Math.max(this.dx, this.dy, this.dz) * 1.65;
    let best = null;
    let bestScore = Infinity;
    for (const target of targets) {
      const point = new this.THREE.Vector3(target.x, target.y, target.z);
      const alongRay = point.clone().sub(ray.origin).dot(ray.direction);
      if (alongRay <= 0) continue;
      const distanceSq = ray.distanceSqToPoint(point);
      if (distanceSq > targetRadius * targetRadius) continue;
      const score = distanceSq + alongRay * 0.0001;
      if (score < bestScore) {
        best = point;
        bestScore = score;
      }
    }
    return best;
  }

  findSurfaceExit() {
    const visited = new Uint8Array(this.nx * this.ny);
    const queue = new Int32Array(this.nx * this.ny);
    let best = null;

    for (let startY = 0; startY < this.ny; startY++) {
      for (let startX = 0; startX < this.nx; startX++) {
        const start = startX + this.nx * startY;
        if (visited[start] || !this.connected[this.index(startX, startY, this.nz - 1)]) continue;
        let head = 0;
        let tail = 0;
        let sumX = 0;
        let sumY = 0;
        visited[start] = 1;
        queue[tail++] = start;

        while (head < tail) {
          const current = queue[head++];
          const iy = Math.floor(current / this.nx);
          const ix = current - iy * this.nx;
          const center = this.cellCenter(ix, iy, this.nz - 1);
          sumX += center.x;
          sumY += center.y;
          const neighbors = [[ix + 1, iy], [ix - 1, iy], [ix, iy + 1], [ix, iy - 1]];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || nx >= this.nx || ny < 0 || ny >= this.ny) continue;
            const flat = nx + this.nx * ny;
            if (visited[flat] || !this.connected[this.index(nx, ny, this.nz - 1)]) continue;
            visited[flat] = 1;
            queue[tail++] = flat;
          }
        }

        if (!best || tail > best.cells) best = { x: sumX / tail, y: sumY / tail, cells: tail };
      }
    }
    return best;
  }

  updateSurfaceExit() {
    const routeEnd = this.bodyRoute?.length ? this.bodyRoute[this.bodyRoute.length - 1] : { x: 0, y: 0 };
    const exit = this.bodyRoute?.length === this.nz ? routeEnd : (this.surfaceExit || routeEnd);
    const surfaceZ = -this.depthMeters - 0.035;
    if (this.sky) this.sky.position.set(exit.x, exit.y, -this.depthMeters);
    if (this.ground) this.ground.position.set(exit.x, exit.y, surfaceZ);
    if (this.rimDetails) this.rimDetails.position.set(exit.x, exit.y, surfaceZ);
    const visible = this.group.visible && this.surfaceBreached;
    if (this.sky) this.sky.visible = visible;
    if (this.ground) this.ground.visible = visible;
    if (this.rimDetails) this.rimDetails.visible = visible;
  }

  computeBodyClearDepth(x, y) {
    let clearDepth = 0;
    for (let iz = 0; iz < this.nz; iz++) {
      if (!this.isSliceClear(x, y, iz)) break;
      clearDepth = Math.min(this.depthMeters, (iz + 1) * this.dz);
    }
    return clearDepth;
  }

  buildBodyClearanceMask() {
    const mask = new Uint8Array(this.solid.length);
    const radius = this.bodyRadius + Math.max(this.dx, this.dy) * 0.18;
    const comfortRadius = this.bodyRadius + 0.09;
    const minOffsetX = Math.floor(0.5 - this.bodyRadius / this.dx);
    const maxOffsetX = Math.floor(0.5 + this.bodyRadius / this.dx);
    const minOffsetY = Math.floor(0.5 - this.bodyRadius / this.dy);
    const maxOffsetY = Math.floor(0.5 + this.bodyRadius / this.dy);
    const offsets = [];
    const comfortOffsets = [];

    for (let oy = minOffsetY; oy <= maxOffsetY; oy++) {
      for (let ox = minOffsetX; ox <= maxOffsetX; ox++) {
        if (Math.hypot(ox * this.dx, oy * this.dy) <= radius) offsets.push([ox, oy]);
      }
    }
    const comfortRangeX = Math.ceil(comfortRadius / this.dx);
    const comfortRangeY = Math.ceil(comfortRadius / this.dy);
    for (let oy = -comfortRangeY; oy <= comfortRangeY; oy++) {
      for (let ox = -comfortRangeX; ox <= comfortRangeX; ox++) {
        if (Math.hypot(ox * this.dx, oy * this.dy) <= comfortRadius) comfortOffsets.push([ox, oy]);
      }
    }

    const blockerLimit = Math.max(1, Math.floor(offsets.length * 0.06));
    const minIx = -minOffsetX;
    const maxIx = this.nx - 1 - maxOffsetX;
    const minIy = -minOffsetY;
    const maxIy = this.ny - 1 - maxOffsetY;
    const wallProximity = new Uint16Array(this.solid.length);

    for (let iz = 0; iz < this.nz; iz++) {
      for (let iy = minIy; iy <= maxIy; iy++) {
        for (let ix = minIx; ix <= maxIx; ix++) {
          const centerIndex = this.index(ix, iy, iz);
          if (this.solid[centerIndex] || !this.connected[centerIndex]) continue;
          let blockers = 0;
          for (const [ox, oy] of offsets) {
            if (this.solid[this.index(ix + ox, iy + oy, iz)] && ++blockers > blockerLimit) break;
          }
          if (blockers > blockerLimit) continue;
          mask[centerIndex] = 1;
          let nearbyWall = 0;
          for (const [ox, oy] of comfortOffsets) {
            if (!this.inside(ix + ox, iy + oy, iz) || this.solid[this.index(ix + ox, iy + oy, iz)]) nearbyWall++;
          }
          wallProximity[centerIndex] = nearbyWall;
        }
      }
    }
    this.bodyWallProximity = wallProximity;
    return mask;
  }

  planBodyRoute() {
    const plane = this.nx * this.ny;
    const clearance = this.buildBodyClearanceMask();
    this.bodyClearanceMask = clearance;
    // A body can follow a bend, but it cannot make a sideways jump inside one
    // thin depth slice. Keeping edges local also makes the chosen route smooth.
    const maxLateralStep = Math.max(0.1, this.dz * 0.75);
    const currentSlice = clamp(Math.floor(Math.max(0, this.bodyDepth - 0.001) / this.dz), 0, this.nz - 1);
    const neighborOffsets = [];
    const maxOx = Math.ceil(maxLateralStep / this.dx);
    const maxOy = Math.ceil(maxLateralStep / this.dy);

    for (let oy = -maxOy; oy <= maxOy; oy++) {
      for (let ox = -maxOx; ox <= maxOx; ox++) {
        const distance = Math.hypot(ox * this.dx, oy * this.dy);
        if (distance > maxLateralStep) continue;
        const steps = Math.max(1, Math.abs(ox), Math.abs(oy));
        const line = [];
        for (let step = 0; step <= steps; step++) {
          line.push([
            Math.round(ox * step / steps),
            Math.round(oy * step / steps),
          ]);
        }
        neighborOffsets.push({ ox, oy, distance, line });
      }
    }

    let previousCosts = new Float64Array(plane);
    previousCosts.fill(Infinity);
    const parentLayers = [];
    let deepestCosts = null;
    let deepestSlice = -1;

    for (let iz = 0; iz < this.nz; iz++) {
      const costs = new Float64Array(plane);
      costs.fill(Infinity);
      const parents = new Int32Array(plane);
      parents.fill(-1);
      let reachableCount = 0;

      for (let iy = 0; iy < this.ny; iy++) {
        for (let ix = 0; ix < this.nx; ix++) {
          const localIndex = ix + this.nx * iy;
          const index = localIndex + plane * iz;
          if (!clearance[index]) continue;
          const center = this.cellCenter(ix, iy, iz);
          if (this.bodyDepth > this.dz * 0.5 && iz === currentSlice &&
              Math.hypot(center.x - this.playerX, center.y - this.playerY) > maxLateralStep * 1.25) continue;

          if (iz === 0) {
            costs[localIndex] = Math.hypot(center.x, center.y) * 0.12 +
              this.bodyWallProximity[index] * 0.0015;
            parents[localIndex] = -2;
            reachableCount++;
            continue;
          }

          let bestCost = Infinity;
          let bestParent = -1;
          for (const edge of neighborOffsets) {
            const px = ix + edge.ox;
            const py = iy + edge.oy;
            if (px < 0 || px >= this.nx || py < 0 || py >= this.ny) continue;
            const parentIndex = px + this.nx * py;
            const parentCost = previousCosts[parentIndex];
            if (!Number.isFinite(parentCost)) continue;

            let edgeClear = true;
            for (const [lineOx, lineOy] of edge.line) {
              const lineX = ix + lineOx;
              const lineY = iy + lineOy;
              const lineIndex = lineX + this.nx * lineY;
              if (!clearance[lineIndex + plane * (iz - 1)] || !clearance[lineIndex + plane * iz]) {
                edgeClear = false;
                break;
              }
            }
            if (!edgeClear) continue;

            const cost = parentCost + edge.distance * edge.distance / maxLateralStep +
              edge.distance * 0.02 + this.bodyWallProximity[index] * 0.0015;
            if (cost < bestCost) {
              bestCost = cost;
              bestParent = parentIndex;
            }
          }
          if (bestParent >= 0) {
            costs[localIndex] = bestCost;
            parents[localIndex] = bestParent;
            reachableCount++;
          }
        }
      }

      if (!reachableCount) break;
      parentLayers.push(parents);
      previousCosts = costs;
      deepestCosts = costs;
      deepestSlice = iz;
    }

    if (deepestSlice < 0) return [];
    let endIndex = -1;
    let endCost = Infinity;
    for (let index = 0; index < plane; index++) {
      if (deepestCosts[index] < endCost) {
        endCost = deepestCosts[index];
        endIndex = index;
      }
    }

    const route = new Array(deepestSlice + 1);
    for (let iz = deepestSlice; iz >= 0; iz--) {
      const iy = Math.floor(endIndex / this.nx);
      const ix = endIndex - iy * this.nx;
      const center = this.cellCenter(ix, iy, iz);
      route[iz] = { x: center.x, y: center.y };
      endIndex = parentLayers[iz][endIndex];
    }
    return route;
  }

  routePositionAt(depth) {
    if (!this.bodyRoute || !this.bodyRoute.length) return null;
    const scaled = clamp(depth / this.dz - 0.5, 0, this.bodyRoute.length - 1);
    const index = Math.floor(scaled);
    const next = Math.min(this.bodyRoute.length - 1, index + 1);
    const t = scaled - index;
    return {
      x: this.bodyRoute[index].x + (this.bodyRoute[next].x - this.bodyRoute[index].x) * t,
      y: this.bodyRoute[index].y + (this.bodyRoute[next].y - this.bodyRoute[index].y) * t,
    };
  }

  routeCanOccupy(depth, offsetX = 0, offsetY = 0) {
    if (depth <= 0) return true;
    if (!this.bodyRoute || !this.bodyRoute.length) return false;
    const start = depth - this.bodyHalfDepth;
    const end = depth + this.bodyHalfDepth;
    if (end >= this.depthMeters && !this.surfaceBreached) return false;
    const sampleStep = Math.min(this.dz * 0.42, this.bodyHalfDepth * 0.45);
    const samples = Math.max(2, Math.ceil((end - start) / sampleStep));

    for (let sample = 0; sample <= samples; sample++) {
      const sampleDepth = start + (end - start) * sample / samples;
      if (sampleDepth < 0) continue;
      if (sampleDepth >= this.depthMeters) {
        if (this.surfaceBreached) continue;
        return false;
      }
      const position = this.routePositionAt(sampleDepth);
      if (!position) return false;
      const iz = clamp(Math.floor(sampleDepth / this.dz), 0, this.nz - 1);
      if (!this.isSliceClear(position.x + offsetX, position.y + offsetY, iz)) return false;
    }
    return true;
  }

  computeRouteClearDepth() {
    if (!this.bodyRoute || !this.bodyRoute.length) return 0;
    const maxDepth = this.surfaceBreached && this.bodyRoute.length === this.nz
      ? this.depthMeters
      : this.routeCoverageDepth;
    const step = Math.min(0.015, this.dz * 0.22);
    let safe = 0;
    let blocked = maxDepth;
    let encounteredBlock = false;

    for (let depth = step; depth <= maxDepth + 0.000001; depth += step) {
      const candidate = Math.min(depth, maxDepth);
      if (!this.routeCanOccupy(candidate)) {
        blocked = candidate;
        encounteredBlock = true;
        break;
      }
      safe = candidate;
    }
    if (!encounteredBlock && safe < maxDepth && this.routeCanOccupy(maxDepth)) safe = maxDepth;
    if (safe >= maxDepth) return maxDepth;

    for (let iteration = 0; iteration < 8; iteration++) {
      const mid = (safe + blocked) * 0.5;
      if (this.routeCanOccupy(mid)) safe = mid;
      else blocked = mid;
    }
    return safe;
  }

  isSliceClear(x, y, iz) {
    return evaluateDiscClearance({
      centerX: x,
      centerY: y,
      radius: this.bodyRadius,
      columns: this.nx,
      rows: this.ny,
      cellWidth: this.dx,
      cellHeight: this.dy,
      originX: -this.width / 2,
      originY: -this.height / 2,
      edgeTolerance: Math.max(this.dx, this.dy) * 0.18,
      isBlocked: (ix, iy) => this.solid[this.index(ix, iy, iz)] === 1,
      isConnected: (ix, iy) => this.connected[this.index(ix, iy, iz)] === 1,
    }).passable;
  }

  canOccupy(x, y, depth) {
    if (depth <= 0) return true;
    if (Math.abs(x) > this.width / 2 - this.bodyRadius || Math.abs(y) > this.height / 2 - this.bodyRadius) return false;
    const start = depth - this.bodyHalfDepth;
    const end = depth + this.bodyHalfDepth;
    if (end >= this.depthMeters && !this.surfaceBreached) return false;
    const firstSlice = clamp(Math.floor(Math.max(0, start) / this.dz), 0, this.nz - 1);
    const lastSlice = clamp(Math.floor(Math.min(this.depthMeters - 0.000001, end) / this.dz), 0, this.nz - 1);
    for (let iz = firstSlice; iz <= lastSlice; iz++) {
      if (!this.isSliceClear(x, y, iz)) return false;
    }
    return true;
  }

  traverse(deltaMeters) {
    if (!Number.isFinite(deltaMeters) || deltaMeters === 0) return false;
    let next;
    if (deltaMeters > 0) {
      // Stay at the coffin viewing position until a body-width entry exists;
      // otherwise the camera reaches the soil before a usable opening exists.
      if (this.bodyDepth < 0 && this.bodyClearDepth <= 0.000001) return false;
      // A route replan can conservatively lower bodyClearDepth below the
      // current pose. Forward must never turn that lower cap into a retreat.
      if (this.bodyDepth >= this.bodyClearDepth - 0.000001) return false;
      next = Math.min(this.bodyDepth + deltaMeters, this.bodyClearDepth);
    } else {
      next = Math.max(this.bodyDepth + deltaMeters, -this.coffinDepth);
    }
    if (Math.abs(next - this.bodyDepth) < 0.001) return false;
    // Forward from the coffin deliberately enters the planned body-width
    // centerline. This alignment happens only because the player moved.
    this.routeFollowing = true;
    this.bodyTargetDepth = next;
    this.movementCommandActive = true;
    this.autoFollow = false;
    return true;
  }

  rotateLook(dx, dy) {
    this.yaw -= dx * 0.0065;
    this.pitch += dy * 0.0065;
    this.constrainLook();
  }

  lookLimits() {
    return {
      yaw: LOOK_YAW_LIMIT,
      pitch: LOOK_PITCH_LIMIT,
      blockerFraming: false,
    };
  }

  constrainLook() {
    const limits = this.lookLimits();
    this.yaw = clamp(this.yaw, -limits.yaw, limits.yaw);
    this.pitch = clamp(this.pitch, -limits.pitch, limits.pitch);
  }

  focusForwardBlocker(maxTurn = Math.PI * 12 / 180) {
    const target = this.primaryWidthTarget();
    if (!target) return false;
    const bodyPoint = new this.THREE.Vector3(this.playerX, this.playerY, -this.bodyDepth);
    const toward = target.sub(bodyPoint).normalize();
    const { forward, right, up } = this.routeBasis(this.bodyDepth);
    const forwardAmount = Math.max(0.0001, toward.dot(forward));
    const rightAmount = toward.dot(right);
    const upAmount = toward.dot(up);
    const desiredYaw = Math.atan2(rightAmount, forwardAmount);
    const desiredPitch = Math.atan2(upAmount, Math.hypot(forwardAmount, rightAmount));
    this.yaw += clamp(desiredYaw - this.yaw, -maxTurn, maxTurn);
    this.pitch += clamp(desiredPitch - this.pitch, -maxTurn, maxTurn);
    this.blockerGuidePulse = 1;
    this.constrainLook();
    this.updateBlockerGuide();
    return true;
  }

  routeBasis(depth = this.bodyDepth) {
    // Aim down the passage, not merely along the nearest voxel-to-voxel bend.
    // The longer forward sample keeps the next body-width blockers framed while
    // preserving yaw/pitch as the player's independent look offset.
    const behindSpan = Math.max(this.dz * 0.65, 0.04);
    const aheadSpan = Math.max(this.dz * 5.5, 0.34);
    const beforeDepth = Math.max(0, depth - behindSpan);
    const afterDepth = Math.min(this.routeCoverageDepth, depth + aheadSpan);
    const before = this.routePositionAt(beforeDepth);
    const after = this.routePositionAt(afterDepth);
    const forward = new this.THREE.Vector3(0, 0, -1);
    if (before && after && afterDepth > beforeDepth + 0.0001) {
      forward.set(after.x - before.x, after.y - before.y, -(afterDepth - beforeDepth)).normalize();
    }
    const worldUp = new this.THREE.Vector3(0, 1, 0);
    const right = new this.THREE.Vector3().crossVectors(forward, worldUp).normalize();
    const up = new this.THREE.Vector3().crossVectors(right, forward).normalize();
    return { forward, right, up };
  }

  lookDirection(target = new this.THREE.Vector3(), depth = this.bodyDepth) {
    const { forward, right, up } = this.routeBasis(depth);
    const yawCos = Math.cos(this.yaw);
    const yawSin = Math.sin(this.yaw);
    const pitchCos = Math.cos(this.pitch);
    const pitchSin = Math.sin(this.pitch);
    target.copy(forward).multiplyScalar(yawCos)
      .addScaledVector(right, yawSin)
      .multiplyScalar(pitchCos)
      .addScaledVector(up, pitchSin);
    return target.normalize();
  }

  update(dt) {
    this.blockerGuidePulse = Math.max(0, this.blockerGuidePulse - dt * 0.72);
    const speed = Math.max(0.35, this.depthMeters * 0.72);
    const delta = this.bodyTargetDepth - this.bodyDepth;
    if (Math.abs(delta) <= 0.000001) {
      this.bodyTargetDepth = this.bodyDepth;
      this.movementCommandActive = false;
      return;
    }
    // Only traverse() can authorize axial body movement. Digging and route
    // replanning are never allowed to turn a changed target into motion.
    if (!this.movementCommandActive) {
      this.bodyTargetDepth = this.bodyDepth;
      return;
    }
    const step = Math.sign(delta) * Math.min(Math.abs(delta), speed * dt);
    const nextDepth = this.bodyDepth + step;
    if (Math.abs(step) > 0.000001 && !this.routeCanOccupy(nextDepth)) {
      this.bodyTargetDepth = this.bodyDepth;
      this.movementCommandActive = false;
      return;
    }
    this.bodyDepth = nextDepth;
    const routePosition = this.routePositionAt(this.bodyDepth);
    if (routePosition && Math.abs(step) > 0.000001) {
      this.playerX = routePosition.x;
      this.playerY = routePosition.y;
    }
    if (Math.abs(this.bodyTargetDepth - this.bodyDepth) <= 0.000001) {
      this.bodyTargetDepth = this.bodyDepth;
      this.movementCommandActive = false;
    }
    this.updateMarker();
  }

  excavateAt(centerPoint, radius, reach, maxCells = Infinity) {
    const minX = clamp(Math.floor((centerPoint.x - radius + this.width / 2) / this.dx), 0, this.nx - 1);
    const maxX = clamp(Math.floor((centerPoint.x + radius + this.width / 2) / this.dx), 0, this.nx - 1);
    const minY = clamp(Math.floor((centerPoint.y - radius + this.height / 2) / this.dy), 0, this.ny - 1);
    const maxY = clamp(Math.floor((centerPoint.y + radius + this.height / 2) / this.dy), 0, this.ny - 1);
    const minZ = clamp(Math.floor((-centerPoint.z - reach) / this.dz), 0, this.nz - 1);
    const maxZ = clamp(Math.floor((-centerPoint.z + reach) / this.dz), 0, this.nz - 1);
    const candidates = [];

    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let iy = minY; iy <= maxY; iy++) {
        for (let ix = minX; ix <= maxX; ix++) {
          const center = this.cellCenter(ix, iy, iz);
          const lateral = Math.hypot(center.x - centerPoint.x, center.y - centerPoint.y) / radius;
          const axial = Math.abs(center.z - centerPoint.z) / reach;
          const distance = lateral * lateral + axial * axial;
          if (distance > 1) continue;
          const index = this.index(ix, iy, iz);
          if (!this.solid[index]) continue;
          candidates.push({ index, distance });
        }
      }
    }

    // A hand takes the nearest crumbs first; stronger tools receive a larger
    // deterministic cell budget. Sorting avoids a loop-order bias that made
    // tiny bites look lopsided.
    candidates.sort((a, b) => a.distance - b.distance || a.index - b.index);
    const removed = Math.min(candidates.length, Math.max(1, Math.floor(maxCells)));
    for (let i = 0; i < removed; i++) {
      this.solid[candidates[i].index] = 0;
      this.removedCells++;
    }
    return removed;
  }

  finishCarve(removed, hitPoint, extra = {}) {
    if (!removed) return (this.lastCarveResult = { removed: 0, reason: 'already-empty', hit: hitPoint, ...extra });
    this.lastHit = { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z };
    this.recomputeConnectivity();
    this.rebuild();
    return (this.lastCarveResult = {
      removed,
      hit: hitPoint,
      removedVolume: removed * this.dx * this.dy * this.dz,
      frontierDepth: this.frontierDepth,
      bodyClearDepth: this.bodyClearDepth,
      needsWidth: this.needsWidth,
      breached: this.surfaceBreached,
      ...extra,
    });
  }

  carve(raycaster, power = 1) {
    const armReach = this.armReach;
    const bodyPoint = new this.THREE.Vector3(this.playerX, this.playerY, -this.bodyDepth);
    const safePower = Math.min(36, Math.max(1, power));
    const toolSpan = Math.pow(safePower, 0.6);
    const entryProgress = smoothstep(Math.max(0, this.bodyDepth) / this.coffinDepth);
    const radius = (0.085 + toolSpan * 0.035) * (0.72 + entryProgress * 0.28);
    const reach = Math.max(this.dz * 0.82, 0.07) * (0.9 + toolSpan * 0.19) *
      (0.74 + entryProgress * 0.26);
    const maxCells = Math.round(4 + 4 * safePower);
    const bite = {
      toolPower: +safePower.toFixed(3),
      radius: +radius.toFixed(4),
      reach: +reach.toFixed(4),
      maxCells,
    };
    const aimedWidthTarget = this.findAimedWidthTarget(raycaster.ray, bodyPoint, armReach + this.dz * 0.55);
    if (aimedWidthTarget) {
      return this.finishCarve(
        this.excavateAt(aimedWidthTarget, radius, reach, maxCells),
        aimedWidthTarget,
        { guidedWidthCut: true, bite },
      );
    }

    const hit = raycaster.intersectObject(this.mesh, false)[0];

    if (!hit) {
      return (this.lastCarveResult = {
        removed: 0,
        reason: this.needsWidth ? 'tight-passage' : 'no-soil',
        needsWidth: this.needsWidth,
        bite,
      });
    }

    const reachDistance = hit.point.distanceTo(bodyPoint);
    if (reachDistance > armReach) {
      return (this.lastCarveResult = {
        removed: 0,
        reason: 'out-of-reach',
        hit: hit.point,
        hitDepth: Math.max(0, -hit.point.z),
        reachDistance,
        armReach,
        needsWidth: this.needsWidth,
      });
    }

    const direction = raycaster.ray.direction;
    const centerPoint = hit.point.clone().addScaledVector(direction, reach * 0.34);
    const cell = this.worldToCell(centerPoint.x, centerPoint.y, centerPoint.z);
    if (!this.inside(cell.ix, cell.iy, cell.iz)) {
      return (this.lastCarveResult = { removed: 0, reason: 'outside', cell, point: centerPoint.toArray() });
    }
    return this.finishCarve(
      this.excavateAt(centerPoint, radius, reach, maxCells),
      hit.point,
      { cell, bite },
    );
  }

  serialize() {
    const removed = [];
    for (let i = 0; i < this.solid.length; i++) if (!this.solid[i]) removed.push(i);
    return {
      version: 2,
      grid: {
        nx: this.nx,
        ny: this.ny,
        nz: this.nz,
        width: this.width,
        height: this.height,
      },
      removed,
      playerX: +this.playerX.toFixed(4),
      playerY: +this.playerY.toFixed(4),
      bodyDepth: +this.bodyDepth.toFixed(4),
      bodyTargetDepth: +this.bodyTargetDepth.toFixed(4),
      autoFollow: this.autoFollow,
      movementCommandActive: this.movementCommandActive,
      routeFollowing: this.routeFollowing,
      yaw: +this.yaw.toFixed(4),
      pitch: +this.pitch.toFixed(4),
    };
  }

  state() {
    const totalVolume = this.width * this.height * this.depthMeters;
    const removedVolume = this.removedCells * this.dx * this.dy * this.dz;
    const primaryWidthTarget = this.primaryWidthTarget();
    return {
      model: 'persistent-voxel-volume',
      dimensions: { nx: this.nx, ny: this.ny, nz: this.nz },
      coffinDepth: this.coffinDepth,
      insideCoffin: this.bodyDepth < 0,
      depthMeters: +this.depthMeters.toFixed(2),
      frontierDepth: +this.frontierDepth.toFixed(2),
      bodyClearDepth: +this.bodyClearDepth.toFixed(2),
      routeCoverageDepth: +this.routeCoverageDepth.toFixed(2),
      bodyDepth: +this.bodyDepth.toFixed(2),
      bodyTargetDepth: +this.bodyTargetDepth.toFixed(2),
      playerX: +this.playerX.toFixed(2),
      playerY: +this.playerY.toFixed(2),
      removedCells: this.removedCells,
      removedVolume: +removedVolume.toFixed(3),
      removedRatio: +(removedVolume / totalVolume).toFixed(4),
      exposedTriangles: this.mesh.geometry.drawRange.count / 3,
      needsWidth: this.needsWidth,
      widthBlockerCount: this.widthBlockerCount,
      widthBlockerSlice: this.widthBlockerSlice,
      primaryWidthBlocker: this.primaryWidthBlocker,
      primaryWidthTarget: primaryWidthTarget ? {
        x: +primaryWidthTarget.x.toFixed(3),
        y: +primaryWidthTarget.y.toFixed(3),
        z: +primaryWidthTarget.z.toFixed(3),
      } : null,
      widthTargets: this.widthTargetPoints(8).map((point) => ({
        x: +point.x.toFixed(3),
        y: +point.y.toFixed(3),
        z: +point.z.toFixed(3),
      })),
      surfaceBreached: this.surfaceBreached,
      surfaceExit: this.surfaceExit ? {
        x: +this.surfaceExit.x.toFixed(2),
        y: +this.surfaceExit.y.toFixed(2),
        cells: this.surfaceExit.cells,
      } : null,
      canEscape: this.surfaceBreached && this.bodyRoute?.length === this.nz &&
        this.bodyDepth >= this.depthMeters - this.bodyHalfDepth * 0.9,
      collisionSafe: this.routeCanOccupy(this.bodyDepth),
      autoFollow: this.autoFollow,
      movementCommandActive: this.movementCommandActive,
      routeFollowing: this.routeFollowing,
      routePoints: this.bodyRoute?.length || 0,
      routeEnd: this.bodyRoute?.length ? this.bodyRoute[this.bodyRoute.length - 1] : null,
      yaw: +this.yaw.toFixed(2),
      pitch: +this.pitch.toFixed(2),
      lookLimits: (() => {
        const limits = this.lookLimits();
        return {
          yawDegrees: +(limits.yaw * 180 / Math.PI).toFixed(1),
          pitchDegrees: +(limits.pitch * 180 / Math.PI).toFixed(1),
          blockerFraming: limits.blockerFraming,
        };
      })(),
      blockerGuideVisible: this.blockerGuide.visible,
      blockerGuidePulse: +this.blockerGuidePulse.toFixed(2),
      guidanceMode: 'visible-soil-geometry',
      lastCarve: this.lastCarveResult ? {
        removedCells: this.lastCarveResult.removed || 0,
        removedVolume: +(this.lastCarveResult.removedVolume || 0).toFixed(4),
        reason: this.lastCarveResult.reason || null,
        toolPower: this.lastCarveResult.bite?.toolPower || null,
        radius: this.lastCarveResult.bite?.radius || null,
        reach: this.lastCarveResult.bite?.reach || null,
        maxCells: this.lastCarveResult.bite?.maxCells || null,
      } : null,
    };
  }
}
