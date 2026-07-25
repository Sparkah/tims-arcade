/*
 * Ravenshollow town scene
 *
 * A separate Three.js scene/camera used by the cemetery and Risen views.
 * The digging scene remains authoritative and untouched.
 */

export function createTownWorld({ THREE, canvas, graves }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e17);
  scene.fog = new THREE.FogExp2(0x171b25, 0.022);

  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 90);
  const root = new THREE.Group();
  root.name = 'ravenshollow-town';
  scene.add(root);

  const graveEntries = new Map();
  const residentEntries = new Map();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const gravePickables = [];
  const residentPickables = [];
  const cameraTarget = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const projected = new THREE.Vector3();

  const statusColors = {
    available: 0xd6a458,
    resume: 0xe37a45,
    rescued: 0x86b979,
    locked: 0x4a4743,
  };

  const view = {
    visible: false,
    name: 'cemetery',
    hoverId: null,
    activeId: graves[0]?.id || null,
    yawOffset: 0,
    pitchOffset: 0,
    zoomOffset: 0,
    aspect: 1,
    firstFrame: true,
    statuses: {},
  };

  function material(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.92,
      metalness: options.metalness ?? 0,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      flatShading: options.flatShading ?? true,
      depthWrite: options.depthWrite ?? true,
      side: options.side,
    });
  }

  const mats = {
    grass: material(0x1b251c),
    grassDark: material(0x101810),
    soil: material(0x3b2b20),
    soilDark: material(0x15100d),
    path: material(0x4a4034),
    pathEdge: material(0x2b2822),
    stone: material(0x66645c),
    stoneLight: material(0x898579),
    stoneDark: material(0x383936),
    wood: material(0x563923),
    woodDark: material(0x332219),
    iron: material(0x343b3e, { roughness: 0.56, metalness: 0.5 }),
    rust: material(0x774531, { roughness: 0.68, metalness: 0.38 }),
    chapel: material(0x302c29),
    plaster: material(0x46413a),
    roof: material(0x241d1c),
    window: material(0xd5a95e, { emissive: 0xd5a95e, emissiveIntensity: 1.8 }),
    moon: material(0xc9d8df, { emissive: 0xc9d8df, emissiveIntensity: 1.6 }),
  };

  function add(parent, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(...position);
    object.rotation.set(...rotation);
    parent.add(object);
    return object;
  }

  function addBox(parent, size, mat, position, rotation) {
    return add(parent, new THREE.BoxGeometry(...size), mat, position, rotation);
  }

  function addCylinder(parent, radii, height, sides, mat, position, rotation) {
    return add(
      parent,
      new THREE.CylinderGeometry(radii[0], radii[1], height, sides),
      mat,
      position,
      rotation,
    );
  }

  function addCone(parent, radius, height, sides, mat, position, rotation) {
    return add(parent, new THREE.ConeGeometry(radius, height, sides), mat, position, rotation);
  }

  function addRoof(parent, width, depth, height, mat, y) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(0, height);
    shape.lineTo(width / 2, 0);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      steps: 1,
    });
    geometry.translate(0, 0, -depth / 2);
    return add(parent, geometry, mat, [0, y, 0]);
  }

  function buildHouse({
    x,
    z,
    width,
    depth,
    height,
    wall = mats.plaster,
    roof = mats.roof,
    yaw = 0,
    windows = 2,
  }) {
    const house = new THREE.Group();
    house.position.set(x, 0, z);
    house.rotation.y = yaw;
    root.add(house);
    addBox(house, [width, height, depth], wall, [0, height / 2, 0]);
    addRoof(house, width + 0.45, depth + 0.42, Math.max(0.65, width * 0.28), roof, height);
    addBox(house, [0.62, 1.4, 0.12], mats.woodDark, [0, 0.7, depth / 2 + 0.065]);
    for (let i = 0; i < windows; i += 1) {
      const wx = windows === 1 ? 0 : -width * 0.26 + i * (width * 0.52 / (windows - 1));
      addBox(house, [0.48, 0.58, 0.08], mats.window, [wx, height * 0.58, depth / 2 + 0.07]);
    }
    addBox(house, [0.38, 1.45, 0.42], mats.stoneDark, [width * 0.27, height + 0.68, -depth * 0.16]);
    return house;
  }

  function buildChapel() {
    const chapel = new THREE.Group();
    chapel.position.set(-5.3, 0, -6.35);
    chapel.rotation.y = 0.035;
    root.add(chapel);
    addBox(chapel, [3.6, 4.1, 4.25], mats.chapel, [0, 2.05, 0]);
    addRoof(chapel, 4.1, 4.7, 1.6, mats.roof, 4.1);
    addBox(chapel, [1.15, 2.0, 1.2], mats.plaster, [0, 5.6, 0.35]);
    addCone(chapel, 0.88, 2.1, 4, mats.roof, [0, 7.55, 0.35], [0, Math.PI / 4, 0]);
    addBox(chapel, [1.05, 2.0, 0.13], mats.woodDark, [0, 1.0, 2.19]);
    addBox(chapel, [0.6, 1.0, 0.09], mats.window, [-1.05, 2.45, 2.2]);
    addBox(chapel, [0.6, 1.0, 0.09], mats.window, [1.05, 2.45, 2.2]);
    addCylinder(chapel, [0.12, 0.12], 0.9, 8, mats.iron, [0, 6.3, 1.02]);
    addBox(chapel, [0.66, 0.12, 0.12], mats.iron, [0, 6.3, 1.02]);
    const glow = new THREE.PointLight(0xd5a95e, 4.2, 8, 2);
    glow.position.set(0, 2.1, 2.55);
    chapel.add(glow);
  }

  function buildPump() {
    const pump = new THREE.Group();
    pump.position.set(4.35, 0, -3.05);
    pump.rotation.y = -0.18;
    root.add(pump);
    addCylinder(pump, [0.25, 0.32], 1.5, 8, mats.rust, [0, 0.75, 0]);
    addCylinder(pump, [0.32, 0.32], 0.16, 8, mats.iron, [0, 1.5, 0]);
    addBox(pump, [0.75, 0.14, 0.15], mats.rust, [0.32, 1.25, 0]);
    addCylinder(pump, [0.07, 0.07], 1.2, 6, mats.iron, [0, 1.85, 0], [0, 0, -0.68]);
    addBox(pump, [0.55, 0.12, 0.12], mats.wood, [-0.38, 2.24, 0], [0, 0, -0.08]);
    addBox(pump, [1.55, 0.18, 1.5], mats.stoneDark, [0, 0.09, 0]);
  }

  function buildTree(x, z, scale = 1, yaw = 0) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.rotation.y = yaw;
    tree.scale.setScalar(scale);
    root.add(tree);
    addCylinder(tree, [0.18, 0.32], 3.2, 6, mats.woodDark, [0, 1.6, 0]);
    [
      [-0.55, 2.8, 0.05, 0.72],
      [0.48, 2.45, -0.12, -0.62],
      [-0.25, 3.35, 0.1, 0.4],
    ].forEach(([x1, y1, z1, rz]) => {
      addCylinder(tree, [0.07, 0.13], 1.85, 5, mats.woodDark, [x1, y1, z1], [0.15, 0, rz]);
    });
  }

  function buildFence() {
    const fence = new THREE.Group();
    root.add(fence);
    const post = (x, z, h = 1.25) => {
      addCylinder(fence, [0.09, 0.12], h, 6, mats.iron, [x, h / 2, z]);
      addCone(fence, 0.14, 0.22, 4, mats.iron, [x, h + 0.09, z], [0, Math.PI / 4, 0]);
    };
    const rail = (x, z, length, yaw = 0) => addBox(fence, [length, 0.07, 0.07], mats.iron, [x, 0.58, z], [0, yaw, 0]);
    for (let x = -8; x <= -2.1; x += 1.4) post(x, 7.55);
    for (let x = 2.1; x <= 8; x += 1.4) post(x, 7.55);
    rail(-5.05, 7.55, 5.9);
    rail(5.05, 7.55, 5.9);
    for (let z = -5.5; z <= 6.8; z += 1.55) {
      post(-8.1, z);
      if (z < 1.6 || z > 3.4) post(8.1, z);
    }
    rail(-8.1, 0.55, 12.2, Math.PI / 2);
    rail(8.1, -1.9, 7.4, Math.PI / 2);
    rail(8.1, 5.2, 3.2, Math.PI / 2);

    const gate = new THREE.Group();
    gate.position.set(0, 0, 7.48);
    root.add(gate);
    addBox(gate, [0.38, 2.5, 0.38], mats.stone, [-1.75, 1.25, 0]);
    addBox(gate, [0.38, 2.5, 0.38], mats.stone, [1.75, 1.25, 0]);
    addBox(gate, [3.8, 0.25, 0.25], mats.iron, [0, 2.42, 0]);
    addBox(gate, [1.5, 1.35, 0.08], mats.iron, [-0.92, 0.83, 0], [0, -0.36, 0]);
    addBox(gate, [1.5, 1.35, 0.08], mats.iron, [0.92, 0.83, 0], [0, 0.36, 0]);
    addBox(gate, [2.55, 0.48, 0.14], mats.woodDark, [0, 2.7, 0.02]);
  }

  function headstoneGeometry(type) {
    const shape = new THREE.Shape();
    if (type === 0) {
      shape.moveTo(-0.48, 0);
      shape.lineTo(-0.48, 0.75);
      shape.lineTo(0, 1.22);
      shape.lineTo(0.48, 0.75);
      shape.lineTo(0.48, 0);
    } else if (type === 1) {
      shape.moveTo(-0.54, 0);
      shape.lineTo(-0.54, 0.74);
      shape.quadraticCurveTo(-0.5, 1.2, 0, 1.25);
      shape.quadraticCurveTo(0.5, 1.2, 0.54, 0.74);
      shape.lineTo(0.54, 0);
    } else if (type === 2) {
      shape.moveTo(-0.55, 0);
      shape.lineTo(-0.55, 0.82);
      shape.quadraticCurveTo(-0.5, 1.42, 0, 1.46);
      shape.quadraticCurveTo(0.5, 1.42, 0.55, 0.82);
      shape.lineTo(0.55, 0);
    } else {
      shape.moveTo(-0.58, 0);
      shape.lineTo(-0.58, 0.9);
      shape.lineTo(-0.28, 1.18);
      shape.lineTo(0.42, 1.08);
      shape.lineTo(0.58, 0.72);
      shape.lineTo(0.58, 0);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: type === 2 ? 0.32 : 0.25,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.035,
      bevelSegments: 1,
    });
  }

  function buildLantern(parent, x, z) {
    const lantern = new THREE.Group();
    lantern.position.set(x, 0, z);
    parent.add(lantern);
    addBox(lantern, [0.34, 0.42, 0.3], mats.iron, [0, 0.27, 0]);
    addBox(lantern, [0.21, 0.25, 0.18], mats.window, [0, 0.29, 0.16]);
    addCylinder(lantern, [0.11, 0.11], 0.08, 8, mats.iron, [0, 0.53, 0]);
    return lantern;
  }

  function addDistinctGraveProp(parent, index) {
    if (index === 0) {
      addBox(parent, [0.13, 1.15, 0.13], mats.wood, [-0.72, 0.65, -0.53], [0, 0, -0.06]);
      addBox(parent, [0.72, 0.12, 0.12], mats.wood, [-0.72, 0.82, -0.53], [0, 0, -0.06]);
    } else if (index === 1) {
      addCylinder(parent, [0.045, 0.055], 1.55, 6, mats.wood, [0.72, 0.72, 0.18], [0.1, 0, -0.24]);
      addBox(parent, [0.36, 0.42, 0.07], mats.iron, [0.9, 0.14, 0.2], [0.1, 0, -0.24]);
      for (let i = 0; i < 3; i += 1) {
        addCone(parent, 0.12, 0.48 + i * 0.08, 5, mats.grass, [-0.75 + i * 0.26, 0.24, 0.72]);
      }
    } else if (index === 2) {
      addBox(parent, [1.92, 0.14, 0.13], mats.iron, [0, 0.22, 0.45], [0.1, 0, 0]);
      addBox(parent, [1.92, 0.14, 0.13], mats.iron, [0, 0.22, 1.18], [-0.08, 0, 0]);
    } else {
      addBox(parent, [1.35, 0.12, 1.55], mats.rust, [0, 0.25, 0.6]);
      addBox(parent, [0.68, 0.12, 0.9], mats.iron, [0.15, 0.34, 0.62]);
      addCylinder(parent, [0.08, 0.08], 1.2, 6, mats.rust, [-0.72, 0.62, 0.55], [0, 0, 0.08]);
      addCylinder(parent, [0.08, 0.08], 1.05, 6, mats.rust, [0.72, 0.55, 0.28], [0, 0, -0.18]);
    }
  }

  function buildZombie(grave, index) {
    const zombie = new THREE.Group();
    zombie.name = `risen-${grave.id}`;
    const accent = new THREE.Color(grave.accent || '#9b8b72');
    const clothes = material(accent.clone().multiplyScalar(0.56));
    const clothesDark = material(accent.clone().multiplyScalar(0.3));
    const skin = material(index === 3 ? 0x71858a : 0x7f9670);
    const hair = material(index === 1 ? 0x43372c : 0x28251f);
    const eye = material(0xb8e68e, { emissive: 0x8bc56e, emissiveIntensity: 2.2 });

    addCylinder(zombie, [0.42, 0.34], 0.8, 6, clothes, [0, 1.2, 0]);
    addBox(zombie, [0.64, 0.28, 0.36], clothesDark, [0, 0.76, 0]);
    const leftLeg = addCylinder(zombie, [0.13, 0.16], 0.72, 6, clothesDark, [-0.19, 0.42, 0], [0.06, 0, 0.08]);
    const rightLeg = addCylinder(zombie, [0.13, 0.16], 0.72, 6, clothesDark, [0.19, 0.42, 0], [-0.08, 0, -0.06]);
    addBox(zombie, [0.28, 0.16, 0.46], mats.woodDark, [-0.22, 0.08, 0.08], [0, 0.1, 0]);
    addBox(zombie, [0.28, 0.16, 0.46], mats.woodDark, [0.22, 0.08, 0.12], [0, -0.08, 0]);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.86, 0);
    zombie.add(headPivot);
    addBox(headPivot, [0.55, 0.58, 0.5], skin, [0, 0, 0]);
    addBox(headPivot, [0.57, 0.16, 0.51], hair, [0, 0.28, -0.01]);
    addBox(headPivot, [0.09, 0.075, 0.035], eye, [-0.13, 0.05, 0.27]);
    addBox(headPivot, [0.09, 0.075, 0.035], eye, [0.13, 0.05, 0.27]);

    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    leftArm.position.set(-0.46, 1.48, 0);
    rightArm.position.set(0.46, 1.48, 0);
    zombie.add(leftArm, rightArm);
    addCylinder(leftArm, [0.1, 0.13], 0.76, 6, skin, [0, -0.34, 0]);
    addCylinder(rightArm, [0.1, 0.13], 0.76, 6, skin, [0, -0.34, 0]);
    addBox(leftArm, [0.22, 0.22, 0.2], skin, [0, -0.76, 0]);
    addBox(rightArm, [0.22, 0.22, 0.2], skin, [0, -0.76, 0]);

    leftArm.rotation.z = 0.28 + index * 0.08;
    rightArm.rotation.z = -0.35;
    if (index === 1) {
      rightArm.rotation.z = -1.08;
      addCylinder(rightArm, [0.035, 0.045], 1.25, 6, mats.wood, [0.08, -0.75, 0], [0, 0, -0.08]);
      addBox(rightArm, [0.32, 0.35, 0.06], mats.iron, [0.1, -1.33, 0]);
    } else if (index === 2) {
      leftArm.rotation.z = 1.12;
      const lantern = buildLantern(leftArm, 0, -0.02);
      lantern.position.set(-0.08, -1.12, 0.02);
      lantern.scale.setScalar(0.7);
      addCylinder(headPivot, [0.37, 0.4], 0.18, 12, hair, [0, 0.38, 0]);
      addCylinder(headPivot, [0.28, 0.31], 0.36, 10, hair, [0, 0.56, 0]);
    } else if (index === 3) {
      leftArm.rotation.z = 0.92;
      addCylinder(headPivot, [0.12, 0.12], 0.08, 10, mats.iron, [-0.14, 0.08, 0.3], [Math.PI / 2, 0, 0]);
      addCylinder(headPivot, [0.12, 0.12], 0.08, 10, mats.iron, [0.14, 0.08, 0.3], [Math.PI / 2, 0, 0]);
      addBox(headPivot, [0.18, 0.04, 0.04], mats.rust, [0, 0.08, 0.33]);
      zombie.rotation.x = 0.06;
    } else {
      headPivot.rotation.z = -0.05;
      leftLeg.rotation.z += 0.04;
      rightLeg.rotation.z -= 0.04;
    }

    zombie.userData = {
      headPivot,
      leftArm,
      rightArm,
      baseLeftArmZ: leftArm.rotation.z,
      baseRightArmZ: rightArm.rotation.z,
      index,
    };
    return zombie;
  }

  const graveLayouts = [
    { x: -2.4, z: 3.1, yaw: -0.085 },
    { x: 2.65, z: 1.55, yaw: 0.12 },
    { x: -3.05, z: -1.45, yaw: -0.14 },
    { x: 2.15, z: -3.55, yaw: 0.09 },
  ];
  const residentAtGrave = [
    [-1.15, 0, 2.75],
    [3.75, 0, 1.1],
    [-1.75, 0, -1.95],
    [3.35, 0, -3.55],
  ];
  const residentInCollection = [
    [-3.15, 0, 1.7],
    [-1.05, 0, 2.15],
    [1.05, 0, 2.15],
    [3.15, 0, 1.7],
  ];

  function buildGrave(grave, index) {
    const layout = graveLayouts[index] || { x: (index - 1.5) * 2.5, z: 0, yaw: 0 };
    const group = new THREE.Group();
    group.name = `grave-${grave.id}`;
    group.position.set(layout.x, 0, layout.z);
    group.rotation.y = layout.yaw;
    root.add(group);

    addBox(group, [2.05, 0.09, 3.5], mats.pathEdge, [0, 0.045, 0.65]);
    const mound = add(
      group,
      new THREE.SphereGeometry(1, 12, 7),
      index === 1 ? mats.grassDark : mats.soil,
      [0, 0.2, 0.65],
    );
    mound.scale.set(index === 3 ? 0.92 : 0.86, 0.28, index >= 2 ? 1.58 : 1.46);

    const stoneMat = index === 0 ? mats.wood : index === 3 ? mats.stoneDark : mats.stone;
    const headstone = add(group, headstoneGeometry(index), stoneMat, [0, 0.08, -0.78]);
    headstone.castShadow = true;
    headstone.receiveShadow = true;
    addDistinctGraveProp(group, index);

    const openPit = addBox(group, [1.32, 0.12, 2.22], mats.soilDark, [0, 0.31, 0.7]);
    openPit.visible = false;
    const lockedBars = new THREE.Group();
    group.add(lockedBars);
    addBox(lockedBars, [1.78, 0.14, 0.14], mats.rust, [0, 0.52, 0.7], [0, 0.18, 0.7]);
    addBox(lockedBars, [1.78, 0.14, 0.14], mats.rust, [0, 0.52, 0.7], [0, -0.18, -0.7]);
    addBox(lockedBars, [0.35, 0.4, 0.16], mats.rust, [0, 0.53, 0.78]);
    lockedBars.visible = false;

    const ringMaterial = material(statusColors.available, {
      roughness: 0.55,
      metalness: 0.24,
      emissive: statusColors.available,
      emissiveIntensity: 0.45,
    });
    const ring = add(
      group,
      new THREE.TorusGeometry(1.08, 0.035, 5, 28),
      ringMaterial,
      [0, 0.36, 0.65],
      [Math.PI / 2, 0, 0],
    );

    const lantern = buildLantern(group, index % 2 ? -0.82 : 0.82, index >= 2 ? 1.38 : 1.1);
    const point = new THREE.PointLight(statusColors.available, 2.3, 5.5, 2);
    point.position.set(index % 2 ? -0.82 : 0.82, 0.8, index >= 2 ? 1.38 : 1.1);
    group.add(point);

    const hit = addBox(
      group,
      [2.5, 1.9, 4.0],
      material(0xffffff, { transparent: true, opacity: 0.001, depthWrite: false }),
      [0, 0.9, 0.55],
    );
    hit.userData.graveId = grave.id;
    gravePickables.push(hit);

    const resident = buildZombie(grave, index);
    const residentHit = addBox(
      resident,
      [1.35, 3.15, 1.05],
      material(0xffffff, { transparent: true, opacity: 0.001, depthWrite: false }),
      [0, 1.45, 0],
    );
    residentHit.userData.graveId = grave.id;
    residentPickables.push(residentHit);
    resident.position.set(...residentAtGrave[index]);
    resident.visible = false;
    root.add(resident);
    residentEntries.set(grave.id, {
      group: resident,
      gravePosition: new THREE.Vector3(...residentAtGrave[index]),
      collectionPosition: new THREE.Vector3(...residentInCollection[index]),
      index,
    });

    graveEntries.set(grave.id, {
      id: grave.id,
      grave,
      group,
      mound,
      headstone,
      ring,
      ringMaterial,
      lantern,
      point,
      openPit,
      lockedBars,
      hit,
      anchor: new THREE.Vector3(layout.x, 1.25, layout.z + 0.12),
      status: 'available',
      index,
    });
  }

  function buildWorld() {
    addBox(root, [18, 0.18, 24], mats.grass, [0, -0.09, -1.5]);
    addBox(root, [3.0, 0.035, 14.5], mats.path, [0.1, 0.025, 1.0], [0, -0.03, 0]);
    addBox(root, [7.2, 0.035, 1.4], mats.path, [-1.4, 0.03, 1.4], [0, 0.17, 0]);
    addBox(root, [6.4, 0.035, 1.25], mats.path, [1.35, 0.032, -2.25], [0, -0.18, 0]);

    buildFence();
    buildChapel();
    buildHouse({ x: 5.95, z: 1.2, width: 2.45, depth: 2.6, height: 2.35, wall: mats.woodDark, windows: 1, yaw: -0.08 });
    buildHouse({ x: -1.0, z: -10.2, width: 3.0, depth: 2.6, height: 2.5, wall: mats.stoneDark, windows: 2, yaw: 0.03 });
    buildHouse({ x: 3.1, z: -10.5, width: 2.4, depth: 2.2, height: 3.1, wall: mats.chapel, windows: 1, yaw: -0.04 });
    buildHouse({ x: 6.8, z: -9.75, width: 3.4, depth: 2.7, height: 2.1, wall: mats.woodDark, windows: 2, yaw: 0.12 });
    buildHouse({ x: -8.3, z: -9.4, width: 2.8, depth: 2.4, height: 2.8, wall: mats.chapel, windows: 1, yaw: -0.16 });
    buildPump();
    buildTree(-7.0, -0.2, 1.05, 0.2);
    buildTree(6.8, -6.0, 1.25, -0.35);
    buildTree(7.25, 4.65, 0.88, 0.5);

    add(root, new THREE.SphereGeometry(1.55, 16, 12), mats.moon, [-7.4, 10.5, -16]);

    graves.forEach(buildGrave);

    const hemi = new THREE.HemisphereLight(0x9ab2c8, 0x1a120e, 1.75);
    scene.add(hemi);
    const moonLight = new THREE.DirectionalLight(0xa9c4dd, 2.75);
    moonLight.position.set(-7, 12, 8);
    moonLight.target.position.set(0, 0, -1.5);
    scene.add(moonLight, moonLight.target);
    const pathLight = new THREE.PointLight(0xd5a95e, 4.6, 12, 2);
    pathLight.position.set(0, 3.4, 6.3);
    scene.add(pathLight);
  }

  function sync({ activeId, statuses }) {
    view.activeId = activeId || view.activeId;
    view.statuses = { ...statuses };
    graveEntries.forEach((entry, id) => {
      const status = statuses[id] || 'available';
      entry.status = status;
      const color = statusColors[status] ?? statusColors.available;
      entry.ringMaterial.color.setHex(color);
      entry.ringMaterial.emissive.setHex(color);
      entry.ringMaterial.emissiveIntensity = status === 'locked' ? 0.08 : status === 'rescued' ? 0.62 : 0.45;
      entry.lockedBars.visible = status === 'locked';
      entry.openPit.visible = status === 'resume' || status === 'rescued';
      entry.lantern.visible = status !== 'locked';
      entry.point.color.setHex(color);
      entry.point.intensity = status === 'locked' ? 0 : status === 'rescued' ? 2.8 : 2.25;
      const resident = residentEntries.get(id);
      if (resident) resident.group.visible = status === 'rescued';
    });
  }

  function setView(name) {
    if (view.name !== name) {
      view.name = name;
      view.yawOffset = 0;
      view.pitchOffset = 0;
      view.zoomOffset = 0;
      view.firstFrame = true;
    }
  }

  function setVisible(visible, name = view.name) {
    view.visible = visible;
    setView(name);
  }

  function setHover(id) {
    view.hoverId = id || null;
  }

  function orbit(dx, dy) {
    view.yawOffset = THREE.MathUtils.clamp(view.yawOffset - dx * 0.0037, -0.3, 0.3);
    view.pitchOffset = THREE.MathUtils.clamp(view.pitchOffset + dy * 0.0028, -0.12, 0.16);
  }

  function zoom(delta) {
    view.zoomOffset = THREE.MathUtils.clamp(view.zoomOffset + Math.sign(delta) * 0.7, -1.4, 2.2);
  }

  function framing() {
    const portrait = view.aspect < 0.78;
    const shortLandscape = view.aspect > 1.35 && window.innerHeight < 660;
    if (view.name === 'collection') {
      return portrait
        ? { target: [0, 1.05, 1.6], yaw: 0.2, pitch: 0.43, distance: 20.4, fov: 46 }
        : { target: [0, 1.0, 1.45], yaw: 0.36, pitch: 0.32, distance: 13.8, fov: 42 };
    }
    if (portrait) return { target: [0, 0.75, -0.35], yaw: 0.25, pitch: 0.44, distance: 25.5, fov: 46 };
    if (shortLandscape) return { target: [0, 0.55, -0.75], yaw: 0.55, pitch: 0.34, distance: 19.2, fov: 48 };
    return { target: [0, 0.75, -0.75], yaw: 0.58, pitch: 0.37, distance: 18.1, fov: 42 };
  }

  function update(dt, now) {
    if (!view.visible) return;
    const frame = framing();
    const focusId = view.hoverId || view.activeId;
    const focus = graveEntries.get(focusId);
    desiredTarget.set(...frame.target);
    if (view.name === 'cemetery' && focus) {
      desiredTarget.lerp(focus.anchor, view.hoverId ? 0.24 : 0.08);
    }

    const yaw = frame.yaw + view.yawOffset;
    const pitch = frame.pitch + view.pitchOffset;
    const distance = frame.distance + view.zoomOffset;
    const flat = Math.cos(pitch) * distance;
    desiredPosition.set(
      desiredTarget.x + Math.sin(yaw) * flat,
      desiredTarget.y + Math.sin(pitch) * distance,
      desiredTarget.z + Math.cos(yaw) * flat,
    );

    const blend = view.firstFrame ? 1 : 1 - Math.exp(-dt * 5.8);
    cameraTarget.lerp(desiredTarget, blend);
    camera.position.lerp(desiredPosition, blend);
    camera.up.set(0, 1, 0);
    camera.lookAt(cameraTarget);
    camera.fov += (frame.fov - camera.fov) * blend;
    camera.updateProjectionMatrix();
    view.firstFrame = false;

    graveEntries.forEach((entry, id) => {
      const highlighted = id === view.hoverId || (!view.hoverId && id === view.activeId);
      const targetScale = highlighted ? 1.025 : 1;
      const scaleBlend = 1 - Math.exp(-dt * 10);
      const nextScale = THREE.MathUtils.lerp(entry.group.scale.x, targetScale, scaleBlend);
      entry.group.scale.setScalar(nextScale);
      const status = entry.status;
      const lightBase = status === 'locked' ? 0 : status === 'rescued' ? 2.8 : 2.25;
      entry.point.intensity = lightBase * (highlighted ? 1.28 : 1);
      entry.ring.rotation.z = Math.sin(now * 0.00035 + entry.index) * 0.025;
    });

    residentEntries.forEach((resident, id) => {
      if (!resident.group.visible) return;
      const target = view.name === 'collection' ? resident.collectionPosition : resident.gravePosition;
      resident.group.position.lerp(target, 1 - Math.exp(-dt * 5.2));
      const phase = now * 0.0015 + resident.index * 1.3;
      resident.group.rotation.z = Math.sin(phase) * 0.022;
      resident.group.rotation.y = view.name === 'collection'
        ? THREE.MathUtils.lerp(resident.group.rotation.y, 0.08 * (resident.index - 1.5), 1 - Math.exp(-dt * 4))
        : Math.sin(phase * 0.45) * 0.08;
      resident.group.userData.headPivot.rotation.y = Math.sin(phase * 0.65) * 0.12;
      resident.group.userData.leftArm.rotation.z =
        resident.group.userData.baseLeftArmZ + Math.sin(phase * 0.8) * 0.035;
    });
  }

  function resize(width, height) {
    view.aspect = width / Math.max(1, height);
    camera.aspect = view.aspect;
    camera.updateProjectionMatrix();
    view.firstFrame = true;
  }

  function pointerNdc(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    return pointer;
  }

  function pick(clientX, clientY) {
    if (!view.visible) return null;
    raycaster.setFromCamera(pointerNdc(clientX, clientY), camera);
    const pool = view.name === 'collection'
      ? residentPickables.filter((object) => object.parent?.visible)
      : gravePickables;
    const hit = raycaster.intersectObjects(pool, false)[0];
    return hit?.object?.userData?.graveId || null;
  }

  function projectWorld(worldPoint) {
    projected.copy(worldPoint).project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (projected.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-projected.y * 0.5 + 0.5) * rect.height + rect.top,
      visible: projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.16 && Math.abs(projected.y) < 1.16,
      depth: projected.z,
    };
  }

  function projectGrave(id) {
    const entry = graveEntries.get(id);
    return entry ? projectWorld(entry.anchor) : null;
  }

  function projectResident(id) {
    const resident = residentEntries.get(id);
    if (!resident || !resident.group.visible) return null;
    const point = resident.group.position.clone();
    point.y += 2.72;
    return projectWorld(point);
  }

  function render(renderer) {
    renderer.render(scene, camera);
  }

  function state() {
    return {
      visible: view.visible,
      view: view.name,
      hoverId: view.hoverId,
      activeId: view.activeId,
      camera: {
        x: +camera.position.x.toFixed(2),
        y: +camera.position.y.toFixed(2),
        z: +camera.position.z.toFixed(2),
        fov: +camera.fov.toFixed(1),
      },
      coordinateSystem: {
        origin: 'Ravenshollow cemetery centre',
        x: 'right',
        y: 'up',
        z: 'toward the front gate',
      },
      graveCount: graveEntries.size,
      graves: [...graveEntries.values()].map((entry) => ({
        id: entry.id,
        status: entry.status,
        x: +entry.group.position.x.toFixed(2),
        z: +entry.group.position.z.toFixed(2),
      })),
      visibleResidents: [...residentEntries.entries()]
        .filter(([, resident]) => resident.group.visible)
        .map(([id]) => id),
    };
  }

  buildWorld();
  resize(window.innerWidth, window.innerHeight);

  return {
    scene,
    camera,
    sync,
    setView,
    setVisible,
    setHover,
    orbit,
    zoom,
    update,
    resize,
    pick,
    projectGrave,
    projectResident,
    render,
    state,
  };
}
