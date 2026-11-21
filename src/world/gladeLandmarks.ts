import * as THREE from 'three';
import {
  GLADE_LAKES,
  GLADE_WATER_LEVEL,
  getGladeGroundHeight,
  getGladeLandmarkById,
} from './gladeBiomes';
import { createStylizedAAStoneMaterial } from './stylizedAAShader';
import type { WaterController } from './water';

export interface GladeLandmarksController {
  readonly group: THREE.Group;
  readonly landmarkNames: readonly string[];
  update: (dt: number, elapsed: number, lanternGlow: number) => void;
  dispose: () => void;
}

/**
 * Builds all stylized anime landmarks across the expansive 960x960 Autumn Glade world:
 * 1. Ancient Horizon Stone Archway + flanking stone lanterns
 * 2. Arched Wooden River Bridge spanning the Sakura Tributary on the main spine
 * 3. Vermilion Moon Bridge curving onto Mirror Blossom Lake's Sakura Island
 * 4. Sakura Island Stone Lantern Terrace framing the recolored GLB cherry blossom trees
 * 5. Vermilion Torii Gate & Lantern Avenue welcoming visitors into Sakura Sanctuary
 * 6. Two-Tiered Sakura Lakeside Pavilion overlooking Mirror Blossom Lake
 * 7. Golden Hilltop Windmill with slowly spinning timber-and-linen sails
 * 8. Ancient Moonstone Ruins Sanctuary with floating glowing rune obelisk
 * 9. Emerald Lake Wooden Pier & gently bobbing moored rowboat
 */
export function createGladeLandmarks(options: {
  water?: Pick<WaterController, 'registerFoamObstacle'>;
} = {}): GladeLandmarksController {
  const group = new THREE.Group();
  group.name = 'autumnGlade_landmarks';

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    mats.push(m);
    return m;
  };

  // Shared stylized anime stone, wood, vermilion lacquer, roof tile, plaster & glowing lantern materials
  const stoneLightMat = trackMat(
    createStylizedAAStoneMaterial({
      color: '#e5ece8',
      vertexColors: false,
      shadowColor: '#4881b0',
      rimColor: '#e8fbff',
      rimStrength: 0.28,
      flatShading: true,
      name: 'gladeLandmark_stoneLight',
    }),
  );
  const stoneTrimMat = trackMat(
    createStylizedAAStoneMaterial({
      color: '#cbdbe3',
      vertexColors: false,
      shadowColor: '#3f76a6',
      rimColor: '#ffffff',
      rimStrength: 0.22,
      flatShading: true,
      name: 'gladeLandmark_stoneTrim',
    }),
  );
  const stoneDarkMat = trackMat(
    createStylizedAAStoneMaterial({
      color: '#6b7e91',
      vertexColors: false,
      shadowColor: '#344c66',
      rimColor: '#c9e2f5',
      rimStrength: 0.16,
      flatShading: true,
      name: 'gladeLandmark_stoneDark',
    }),
  );
  const woodWarmMat = trackMat(
    createStylizedAAStoneMaterial({
      color: '#b87a4b',
      vertexColors: false,
      shadowColor: '#6b4238',
      rimColor: '#fff0cc',
      rimStrength: 0.22,
      flatShading: true,
      name: 'gladeLandmark_woodWarm',
    }),
  );
  const woodDarkMat = trackMat(
    createStylizedAAStoneMaterial({
      color: '#6e452c',
      vertexColors: false,
      shadowColor: '#422829',
      rimColor: '#f2d9b8',
      rimStrength: 0.16,
      flatShading: true,
      name: 'gladeLandmark_woodDark',
    }),
  );
  const vermilionMat = trackMat(
    createStylizedAAStoneMaterial({
      color: '#d94236',
      vertexColors: false,
      shadowColor: '#7d1e2b',
      rimColor: '#ffc9ba',
      rimStrength: 0.26,
      flatShading: true,
      name: 'gladeLandmark_vermilion',
    }),
  );
  const roofTealMat = trackMat(
    createStylizedAAStoneMaterial({
      color: '#34586e',
      vertexColors: false,
      shadowColor: '#1f364d',
      rimColor: '#b5e8ff',
      rimStrength: 0.24,
      flatShading: true,
      name: 'gladeLandmark_roofTeal',
    }),
  );
  const plasterCreamMat = trackMat(
    createStylizedAAStoneMaterial({
      color: '#f5ebd6',
      vertexColors: false,
      shadowColor: '#8d9cb5',
      rimColor: '#ffffff',
      rimStrength: 0.22,
      flatShading: true,
      name: 'gladeLandmark_plasterCream',
    }),
  );
  const sailClothMat = trackMat(
    createStylizedAAStoneMaterial({
      color: '#fbf6e6',
      vertexColors: false,
      shadowColor: '#9ab0c7',
      rimColor: '#ffffff',
      rimStrength: 0.2,
      flatShading: false,
      name: 'gladeLandmark_sailCloth',
    }),
  );

  // Emissive glowing materials (updated smoothly with weather lanternGlow!)
  const lanternBaseColor = new THREE.Color('#ffd37a');
  const lanternMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: lanternBaseColor.clone().multiplyScalar(1.2),
      fog: true,
    }),
  );
  const runeBaseColor = new THREE.Color('#7cf6ff');
  const runeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: runeBaseColor.clone().multiplyScalar(1.35),
      fog: true,
    }),
  );

  // Reusable primitive geometries for lanterns
  const lanternBaseGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.44, 0.36, 6));
  const lanternPoleGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.19, 1.35, 6));
  const lanternBoxGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.46, 6));
  const lanternCapGeo = trackGeo(new THREE.ConeGeometry(0.56, 0.4, 6));

  const addStoneLantern = (parent: THREE.Object3D, x: number, y: number, z: number, scale = 1.0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(scale);

    const base = new THREE.Mesh(lanternBaseGeo, stoneTrimMat);
    base.position.y = 0.18;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const pole = new THREE.Mesh(lanternPoleGeo, stoneLightMat);
    pole.position.y = 0.96;
    pole.castShadow = true;
    pole.receiveShadow = true;
    g.add(pole);

    const glow = new THREE.Mesh(lanternBoxGeo, lanternMat);
    glow.position.y = 1.78;
    g.add(glow);

    const cap = new THREE.Mesh(lanternCapGeo, stoneDarkMat);
    cap.position.y = 2.18;
    cap.castShadow = true;
    g.add(cap);

    parent.add(g);
  };

  const addBox = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
    cast = true,
  ): THREE.Mesh => {
    const geo = trackGeo(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotX, rotY, rotZ);
    mesh.castShadow = cast;
    mesh.receiveShadow = cast;
    parent.add(mesh);
    return mesh;
  };

  // =========================================================================
  // 1. Ancient Horizon Stone Archway (Main Spine Trail Crest)
  // =========================================================================
  const archAnchor = getGladeLandmarkById('archway');
  const archwayGroup = new THREE.Group();
  archwayGroup.name = 'landmark_horizonArchway';
  archwayGroup.position.set(archAnchor.x, archAnchor.y - 0.2, archAnchor.z);
  archwayGroup.rotation.y = archAnchor.yaw;

  const spanHalf = 4.1;
  for (const side of [-1, 1]) {
    const px = side * spanHalf;
    addBox(archwayGroup, 2.3, 0.85, 2.3, px, 0.35, 0, stoneTrimMat);
    addBox(archwayGroup, 1.8, 0.6, 1.8, px, 0.98, 0, stoneLightMat);
    addBox(archwayGroup, 1.38, 6.6, 1.38, px, 4.45, 0, stoneLightMat);
    addBox(archwayGroup, 0.24, 3.8, 1.44, px, 4.45, 0, runeMat, 0, 0, 0, false);
    addBox(archwayGroup, 1.92, 0.64, 1.92, px, 7.98, 0, stoneTrimMat);
    addBox(archwayGroup, 2.24, 0.5, 2.24, px, 8.48, 0, stoneLightMat);
    addStoneLantern(archwayGroup, px + side * 1.95, 0.05, 2.4, 1.05);
  }
  addBox(archwayGroup, 11.2, 0.94, 1.76, 0, 9.12, 0, stoneLightMat);
  addBox(archwayGroup, 12.0, 0.46, 2.1, 0, 9.78, 0, stoneTrimMat);
  addBox(archwayGroup, 2.2, 0.74, 1.36, -spanHalf + 1.15, 7.92, 0, stoneTrimMat, 0, 0, 0.52);
  addBox(archwayGroup, 2.2, 0.74, 1.36, spanHalf - 1.15, 7.92, 0, stoneTrimMat, 0, 0, -0.52);
  addBox(archwayGroup, 1.5, 1.7, 1.98, 0, 10.55, 0, stoneLightMat);
  const archSigilGeo = trackGeo(new THREE.OctahedronGeometry(0.45, 0));
  const archSigil = new THREE.Mesh(archSigilGeo, runeMat);
  archSigil.position.set(0, 10.65, 0);
  archwayGroup.add(archSigil);
  group.add(archwayGroup);

  // =========================================================================
  // 2. Arched Wooden River Bridge (Spanning Sakura Tributary on Main Trail)
  // =========================================================================
  const bridgeAnchor = getGladeLandmarkById('river-bridge');
  const riverBridgeGroup = new THREE.Group();
  riverBridgeGroup.name = 'landmark_woodenRiverBridge';
  riverBridgeGroup.position.set(bridgeAnchor.x, GLADE_WATER_LEVEL + 0.55, bridgeAnchor.z);
  riverBridgeGroup.rotation.y = bridgeAnchor.yaw;

  const buildArchedBridge = (
    targetGroup: THREE.Group,
    originX: number,
    originZ: number,
    yaw: number,
    spanLength: number,
    deckWidth: number,
    archRise: number,
    railMat: THREE.Material,
    plankMat: THREE.Material,
  ) => {
    const plankCount = 20;
    const halfL = spanLength * 0.5;
    const halfW = deckWidth * 0.5;
    const plankLen = spanLength / plankCount - 0.05;
    const plankGeo = trackGeo(new THREE.BoxGeometry(deckWidth, 0.16, plankLen));
    const postGeo = trackGeo(new THREE.BoxGeometry(0.22, 1.15, 0.22));
    const postCapGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.14, 0.32));
    const pilingGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.26, 4.2, 8));

    const archY = (lz: number) => {
      const u = THREE.MathUtils.clamp(lz / halfL, -1, 1);
      return archRise * (1 - u * u);
    };

    for (let i = 0; i < plankCount; i += 1) {
      const t = (i + 0.5) / plankCount;
      const lz = -halfL + t * spanLength;
      const ly = archY(lz);
      const slope = (-2 * archRise * (lz / halfL)) / halfL;
      const plank = new THREE.Mesh(plankGeo, plankMat);
      plank.position.set(0, ly, lz);
      plank.rotation.x = -Math.atan(slope);
      plank.castShadow = true;
      plank.receiveShadow = true;
      targetGroup.add(plank);
    }

    // Side rails & curved handrail segments
    const postCount = 6;
    const railSegGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.12, spanLength / (postCount - 1) + 0.12));
    for (const side of [-1, 1]) {
      const lx = side * (halfW - 0.14);
      for (let i = 0; i < postCount; i += 1) {
        const t = i / (postCount - 1);
        const lz = -halfL + 0.35 + t * (spanLength - 0.7);
        const ly = archY(lz);
        const post = new THREE.Mesh(postGeo, railMat);
        post.position.set(lx, ly + 0.52, lz);
        post.castShadow = true;
        targetGroup.add(post);

        const cap = new THREE.Mesh(postCapGeo, stoneDarkMat);
        cap.position.set(lx, ly + 1.14, lz);
        targetGroup.add(cap);

        // Glowing corner bridge lanterns at both ends
        if (i === 0 || i === postCount - 1) {
          const orb = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.28, 0.22)), lanternMat);
          orb.position.set(lx, ly + 1.32, lz);
          targetGroup.add(orb);
        }

        if (i < postCount - 1) {
          const nextZ = -halfL + 0.35 + ((i + 1) / (postCount - 1)) * (spanLength - 0.7);
          const midZ = (lz + nextZ) * 0.5;
          const midY = (ly + archY(nextZ)) * 0.5;
          const pitch = Math.atan2(archY(nextZ) - ly, nextZ - lz);

          const topRail = new THREE.Mesh(railSegGeo, railMat);
          topRail.position.set(lx, midY + 0.94, midZ);
          topRail.rotation.x = -pitch;
          topRail.castShadow = true;
          targetGroup.add(topRail);

          const midRail = new THREE.Mesh(railSegGeo, woodDarkMat);
          midRail.position.set(lx, midY + 0.48, midZ);
          midRail.rotation.x = -pitch;
          targetGroup.add(midRail);
        }
      }
    }

    // Mid-water support pilings + register water foam obstacles
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    for (const pz of [-halfL * 0.42, halfL * 0.42]) {
      for (const side of [-1, 1]) {
        const lx = side * (halfW - 0.28);
        const ly = archY(pz);
        const piling = new THREE.Mesh(pilingGeo, woodDarkMat);
        piling.position.set(lx, ly - 2.1, pz);
        piling.castShadow = true;
        targetGroup.add(piling);

        const wx = originX + lx * cosY + pz * sinY;
        const wz = originZ - lx * sinY + pz * cosY;
        options.water?.registerFoamObstacle(wx, wz, 0.58);
      }
    }

    // Stone bank abutments
    for (const end of [-1, 1]) {
      const lz = end * (halfL + 0.15);
      addBox(targetGroup, deckWidth + 0.7, 2.2, 1.3, 0, -1.05, lz, stoneTrimMat);
    }
  };

  buildArchedBridge(
    riverBridgeGroup,
    bridgeAnchor.x,
    bridgeAnchor.z,
    bridgeAnchor.yaw,
    15.5,
    5.2,
    1.7,
    woodDarkMat,
    woodWarmMat,
  );
  group.add(riverBridgeGroup);

  // =========================================================================
  // 3. Vermilion Moon Bridge onto Mirror Blossom Lake Island
  // =========================================================================
  const sakuraBridgeAnchor = getGladeLandmarkById('sakura-bridge');
  const moonBridgeGroup = new THREE.Group();
  moonBridgeGroup.name = 'landmark_vermilionMoonBridge';
  moonBridgeGroup.position.set(
    sakuraBridgeAnchor.x,
    GLADE_WATER_LEVEL + 0.52,
    sakuraBridgeAnchor.z,
  );
  moonBridgeGroup.rotation.y = sakuraBridgeAnchor.yaw;

  buildArchedBridge(
    moonBridgeGroup,
    sakuraBridgeAnchor.x,
    sakuraBridgeAnchor.z,
    sakuraBridgeAnchor.yaw,
    27.0,
    3.8,
    2.9,
    vermilionMat,
    woodWarmMat,
  );
  group.add(moonBridgeGroup);

  // =========================================================================
  // 4. Mirror Blossom Lake Island Stone Lantern Terrace
  //    (Centerpiece tree is an existing GLB tree recolored sakura pink in gladeLevel.ts)
  // =========================================================================
  const sakuraLake = GLADE_LAKES[0];
  const islandY = getGladeGroundHeight(sakuraLake.x, sakuraLake.z);
  const islandTerraceGroup = new THREE.Group();
  islandTerraceGroup.name = 'landmark_sakuraIslandTerrace';
  islandTerraceGroup.position.set(sakuraLake.x, islandY - 0.12, sakuraLake.z);

  addStoneLantern(islandTerraceGroup, 6.4, 0.0, 4.6, 1.0);
  addStoneLantern(islandTerraceGroup, -6.0, 0.0, 4.2, 1.0);
  addStoneLantern(islandTerraceGroup, 0.6, 0.0, -7.2, 0.95);
  group.add(islandTerraceGroup);

  // =========================================================================
  // 5. Vermilion Torii Gate & Stone Lantern Approach (Sakura Sanctuary Gate)
  // =========================================================================
  const toriiAnchor = getGladeLandmarkById('torii-gate');
  const toriiGroup = new THREE.Group();
  toriiGroup.name = 'landmark_vermilionTorii';
  toriiGroup.position.set(toriiAnchor.x, toriiAnchor.y - 0.18, toriiAnchor.z);
  toriiGroup.rotation.y = toriiAnchor.yaw;

  const toriiSpan = 3.55;
  const toriiPillarGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.42, 7.6, 10));
  const toriiPedestalGeo = trackGeo(new THREE.CylinderGeometry(0.55, 0.68, 1.15, 8));
  for (const side of [-1, 1]) {
    const px = side * toriiSpan;
    const ped = new THREE.Mesh(toriiPedestalGeo, stoneDarkMat);
    ped.position.set(px, 0.55, 0);
    ped.castShadow = true;
    ped.receiveShadow = true;
    toriiGroup.add(ped);

    const pillar = new THREE.Mesh(toriiPillarGeo, vermilionMat);
    pillar.position.set(px, 4.15, 0);
    pillar.rotation.z = side * 0.035;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    toriiGroup.add(pillar);

    // Pair of welcoming stone lanterns flanking the Torii
    addStoneLantern(toriiGroup, px + side * 1.85, 0.0, 2.8, 1.0);
    addStoneLantern(toriiGroup, px + side * 1.85, 0.0, -2.8, 1.0);
  }
  // Nuki lower tie beam
  addBox(toriiGroup, 9.6, 0.48, 0.42, 0, 6.25, 0, vermilionMat);
  // Central vertical tablet (gakuzuka) with subtle gold trim
  addBox(toriiGroup, 0.92, 1.38, 0.34, 0, 7.1, 0, stoneDarkMat);
  addBox(toriiGroup, 0.62, 1.02, 0.38, 0, 7.1, 0, lanternMat, 0, 0, 0, false);
  // Main kasagi lintel + upturned dark-slate roof wings
  addBox(toriiGroup, 10.2, 0.58, 0.72, 0, 7.82, 0, vermilionMat);
  addBox(toriiGroup, 10.6, 0.38, 0.96, 0, 8.24, 0, stoneDarkMat);
  addBox(toriiGroup, 2.4, 0.38, 0.98, -5.85, 8.58, 0, stoneDarkMat, 0, 0, -0.28);
  addBox(toriiGroup, 2.4, 0.38, 0.98, 5.85, 8.58, 0, stoneDarkMat, 0, 0, 0.28);
  group.add(toriiGroup);

  // =========================================================================
  // 6. Sakura Lakeside Pagoda Pavilion (Overlooking Mirror Blossom Lake)
  // =========================================================================
  const pavAnchor = getGladeLandmarkById('sakura-pavilion');
  const pavGroup = new THREE.Group();
  pavGroup.name = 'landmark_sakuraPavilion';
  pavGroup.position.set(pavAnchor.x, pavAnchor.y - 0.35, pavAnchor.z);
  pavGroup.rotation.y = pavAnchor.yaw;

  // Stepped stone foundation platform + entry stairs
  addBox(pavGroup, 10.6, 1.4, 10.6, 0, 0.5, 0, stoneTrimMat);
  addBox(pavGroup, 9.6, 0.45, 9.6, 0, 1.4, 0, woodWarmMat);
  addBox(pavGroup, 3.2, 0.45, 1.8, 0, 0.72, 5.8, stoneLightMat);
  addBox(pavGroup, 3.2, 0.45, 1.2, 0, 0.28, 6.7, stoneLightMat);

  // 4 vermilion corner columns + wooden balustrade
  const pavColGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.32, 4.8, 8));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const col = new THREE.Mesh(pavColGeo, vermilionMat);
      col.position.set(sx * 3.8, 3.9, sz * 3.8);
      col.castShadow = true;
      pavGroup.add(col);
    }
  }
  // Low vermilion veranda railings (leaving front/back open for lake view)
  addBox(pavGroup, 0.2, 0.9, 7.6, -4.3, 2.1, 0, vermilionMat);
  addBox(pavGroup, 0.2, 0.9, 7.6, 4.3, 2.1, 0, vermilionMat);

  // Warm inner shoji-glow core
  addBox(pavGroup, 4.4, 3.5, 4.4, 0, 3.4, 0, plasterCreamMat);
  addBox(pavGroup, 3.6, 2.4, 4.5, 0, 3.5, 0, lanternMat, 0, 0, 0, false);
  addBox(pavGroup, 4.5, 2.4, 3.6, 0, 3.5, 0, lanternMat, 0, 0, 0, false);

  // Tier 1 sweeping pagoda roof
  const roofTier1 = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(8.2, 2.8, 4)), roofTealMat);
  roofTier1.position.y = 7.4;
  roofTier1.rotation.y = Math.PI * 0.25;
  roofTier1.castShadow = true;
  pavGroup.add(roofTier1);

  // Upper wooden pavilion chamber + Tier 2 crown roof + golden finial spire
  addBox(pavGroup, 4.2, 2.2, 4.2, 0, 9.2, 0, vermilionMat);
  addBox(pavGroup, 3.2, 1.4, 4.3, 0, 9.2, 0, lanternMat, 0, 0, 0, false);
  const roofTier2 = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(5.6, 2.6, 4)), roofTealMat);
  roofTier2.position.y = 11.4;
  roofTier2.rotation.y = Math.PI * 0.25;
  roofTier2.castShadow = true;
  pavGroup.add(roofTier2);

  const spire = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.18, 2.1, 6)), lanternMat);
  spire.position.y = 13.4;
  pavGroup.add(spire);

  addStoneLantern(pavGroup, -3.2, 0.4, 6.8, 0.95);
  addStoneLantern(pavGroup, 3.2, 0.4, 6.8, 0.95);
  group.add(pavGroup);

  // =========================================================================
  // 7. Golden Hilltop Windmill (Crowning Golden Birch Highlands)
  // =========================================================================
  const millAnchor = getGladeLandmarkById('windmill');
  const millGroup = new THREE.Group();
  millGroup.name = 'landmark_goldenHillWindmill';
  millGroup.position.set(millAnchor.x, millAnchor.y - 0.55, millAnchor.z);
  millGroup.rotation.y = millAnchor.yaw;

  // Tapered stone base + cream plaster tower + timber wrap-around balcony
  const millBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(3.4, 4.3, 5.2, 10)),
    stoneTrimMat,
  );
  millBase.position.y = 2.6;
  millBase.castShadow = true;
  millBase.receiveShadow = true;
  millGroup.add(millBase);

  const millUpper = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.55, 3.4, 7.2, 10)),
    plasterCreamMat,
  );
  millUpper.position.y = 8.6;
  millUpper.castShadow = true;
  millUpper.receiveShadow = true;
  millGroup.add(millUpper);

  // Timber balcony ring
  const balcony = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(4.15, 3.85, 0.42, 10)),
    woodWarmMat,
  );
  balcony.position.y = 5.25;
  balcony.castShadow = true;
  millGroup.add(balcony);

  // Conical teal-slate windmill cap
  const millRoof = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(3.35, 3.8, 10)),
    roofTealMat,
  );
  millRoof.position.y = 13.9;
  millRoof.castShadow = true;
  millGroup.add(millRoof);

  // Glowing timber-framed windows & entry door
  addBox(millGroup, 1.55, 2.55, 0.65, 0, 1.55, 4.0, woodDarkMat);
  addBox(millGroup, 0.95, 1.25, 0.45, 0, 7.6, 3.1, lanternMat, 0, 0, 0, false);
  addBox(millGroup, 0.45, 1.25, 0.95, 3.1, 7.6, 0, lanternMat, 0, 0, 0, false);
  addBox(millGroup, 0.45, 1.25, 0.95, -3.1, 7.6, 0, lanternMat, 0, 0, 0, false);

  // Animated 4-blade windmill rotor hub & linen sails
  const windmillRotor = new THREE.Group();
  windmillRotor.position.set(0, 11.2, 3.15);
  const hub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.62, 1.3, 8)), woodDarkMat);
  hub.rotation.x = Math.PI * 0.5;
  windmillRotor.add(hub);

  const sparGeo = trackGeo(new THREE.BoxGeometry(0.24, 7.6, 0.22));
  const sailGeo = trackGeo(new THREE.BoxGeometry(1.55, 5.8, 0.08));
  for (let i = 0; i < 4; i += 1) {
    const blade = new THREE.Group();
    blade.rotation.z = (i / 4) * Math.PI * 2;

    const spar = new THREE.Mesh(sparGeo, woodDarkMat);
    spar.position.set(0, 3.9, 0.35);
    spar.castShadow = true;
    blade.add(spar);

    const sail = new THREE.Mesh(sailGeo, sailClothMat);
    sail.position.set(0.84, 4.5, 0.42);
    sail.rotation.y = 0.14;
    sail.castShadow = true;
    blade.add(sail);

    windmillRotor.add(blade);
  }
  millGroup.add(windmillRotor);
  group.add(millGroup);

  // =========================================================================
  // 8. Ancient Moonstone Ruins Sanctuary (Northern Misty Pine Highlands)
  // =========================================================================
  const ruinsAnchor = getGladeLandmarkById('moonstone-ruins');
  const ruinsGroup = new THREE.Group();
  ruinsGroup.name = 'landmark_moonstoneRuins';
  ruinsGroup.position.set(ruinsAnchor.x, ruinsAnchor.y - 0.3, ruinsAnchor.z);
  ruinsGroup.rotation.y = ruinsAnchor.yaw;

  // Two-tier circular stepped stone sanctuary platform
  const daisLower = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(12.8, 13.8, 1.2, 16)),
    stoneTrimMat,
  );
  daisLower.position.y = 0.5;
  daisLower.receiveShadow = true;
  ruinsGroup.add(daisLower);

  const daisUpper = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(9.6, 10.2, 0.72, 16)),
    stoneLightMat,
  );
  daisUpper.position.y = 1.42;
  daisUpper.receiveShadow = true;
  ruinsGroup.add(daisUpper);

  // Ring of 8 monolithic weathered stone pillars (mix of intact archways & broken ruins)
  const colRadius = 8.4;
  for (let i = 0; i < 8; i += 1) {
    const ang = (i / 8) * Math.PI * 2;
    const cx = Math.cos(ang) * colRadius;
    const cz = Math.sin(ang) * colRadius;
    const isBroken = i === 2 || i === 5 || i === 7;
    const h = isBroken ? 3.2 + (i % 3) * 1.15 : 7.4;

    const colBase = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.65, 0.7, 1.65)),
      stoneTrimMat,
    );
    colBase.position.set(cx, 2.0, cz);
    colBase.rotation.y = -ang;
    colBase.castShadow = true;
    ruinsGroup.add(colBase);

    const colShaft = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.54, 0.64, h, 8)),
      stoneLightMat,
    );
    colShaft.position.set(cx, 2.0 + h * 0.5, cz);
    colShaft.castShadow = true;
    colShaft.receiveShadow = true;
    ruinsGroup.add(colShaft);

    if (!isBroken) {
      const cap = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(1.72, 0.58, 1.72)),
        stoneTrimMat,
      );
      cap.position.set(cx, 2.0 + h + 0.25, cz);
      cap.rotation.y = -ang;
      cap.castShadow = true;
      ruinsGroup.add(cap);
    }
  }

  // Surviving overhead lintel beams spanning adjacent intact pairs (0-1, 3-4)
  for (const pair of [
    [0, 1],
    [3, 4],
  ]) {
    const a0 = (pair[0] / 8) * Math.PI * 2;
    const a1 = (pair[1] / 8) * Math.PI * 2;
    const x0 = Math.cos(a0) * colRadius;
    const z0 = Math.sin(a0) * colRadius;
    const x1 = Math.cos(a1) * colRadius;
    const z1 = Math.sin(a1) * colRadius;
    const span = Math.hypot(x1 - x0, z1 - z0) + 1.4;
    const lintel = addBox(
      ruinsGroup,
      span,
      0.86,
      1.35,
      (x0 + x1) * 0.5,
      10.05,
      (z0 + z1) * 0.5,
      stoneLightMat,
      0,
      -Math.atan2(z1 - z0, x1 - x0),
      0,
    );
    lintel.castShadow = true;
  }

  // Central stone altar pedestal + hovering luminous Moonstone Obelisk crystal
  const altar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.2, 2.75, 1.3, 8)),
    stoneDarkMat,
  );
  altar.position.y = 2.4;
  altar.castShadow = true;
  ruinsGroup.add(altar);

  const floatingCrystal = new THREE.Group();
  floatingCrystal.position.set(0, 6.2, 0);
  const crystalCore = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(1.35, 0)), runeMat);
  crystalCore.scale.set(0.75, 1.85, 0.75);
  floatingCrystal.add(crystalCore);

  const haloRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(2.35, 0.1, 8, 24)),
    runeMat,
  );
  haloRing.rotation.x = Math.PI * 0.35;
  floatingCrystal.add(haloRing);
  ruinsGroup.add(floatingCrystal);

  addStoneLantern(ruinsGroup, -4.5, 0.4, 13.5, 1.1);
  addStoneLantern(ruinsGroup, 4.5, 0.4, 13.5, 1.1);
  group.add(ruinsGroup);

  // =========================================================================
  // 9. Emerald Lake Wooden Pier & Moored Bobbing Rowboat
  // =========================================================================
  const pierAnchor = getGladeLandmarkById('emerald-pier');
  const pierGroup = new THREE.Group();
  pierGroup.name = 'landmark_emeraldLakePier';
  pierGroup.position.set(pierAnchor.x, GLADE_WATER_LEVEL + 0.58, pierAnchor.z);
  pierGroup.rotation.y = pierAnchor.yaw;

  const pierLength = 15.0;
  const pierWidth = 3.8;
  const pierPlanks = 18;
  const pPlankGeo = trackGeo(new THREE.BoxGeometry(pierWidth, 0.16, pierLength / pierPlanks - 0.06));
  for (let i = 0; i < pierPlanks; i += 1) {
    const lz = (i / pierPlanks) * pierLength;
    const plank = new THREE.Mesh(pPlankGeo, i % 2 === 0 ? woodWarmMat : woodDarkMat);
    plank.position.set(0, 0, lz);
    plank.castShadow = true;
    plank.receiveShadow = true;
    pierGroup.add(plank);
  }
  // Support pilings into Emerald Lake with water foam obstacles
  const pierPilingGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.26, 4.4, 8));
  const cosP = Math.cos(pierAnchor.yaw);
  const sinP = Math.sin(pierAnchor.yaw);
  for (let p = 0; p < 5; p += 1) {
    const lz = 1.5 + p * 3.1;
    for (const side of [-1, 1]) {
      const lx = side * (pierWidth * 0.5 - 0.25);
      const piling = new THREE.Mesh(pierPilingGeo, woodDarkMat);
      piling.position.set(lx, -1.65, lz);
      piling.castShadow = true;
      pierGroup.add(piling);

      if (p >= 2) {
        const wx = pierAnchor.x + lx * cosP + lz * sinP;
        const wz = pierAnchor.z - lx * sinP + lz * cosP;
        options.water?.registerFoamObstacle(wx, wz, 0.54);
      }
    }
  }
  // Hanging pier lantern post at end of jetty
  addBox(pierGroup, 0.24, 3.6, 0.24, 1.55, 1.75, pierLength - 0.8, woodDarkMat);
  addBox(pierGroup, 1.1, 0.18, 0.18, 1.15, 3.4, pierLength - 0.8, woodDarkMat);
  const pierLamp = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.44, 0.32)), lanternMat);
  pierLamp.position.set(0.7, 3.05, pierLength - 0.8);
  pierGroup.add(pierLamp);

  // Charming wooden rowboat gently bobbing alongside the pier
  const boatGroup = new THREE.Group();
  boatGroup.position.set(-3.4, -0.42, pierLength - 2.6);
  boatGroup.rotation.y = 0.22;
  addBox(boatGroup, 1.65, 0.42, 4.2, 0, 0.08, 0, woodWarmMat);
  addBox(boatGroup, 1.85, 0.36, 0.22, 0, 0.35, -2.0, woodDarkMat);
  addBox(boatGroup, 1.85, 0.36, 0.22, 0, 0.35, 2.0, woodDarkMat);
  addBox(boatGroup, 0.18, 0.44, 4.15, -0.82, 0.34, 0, woodDarkMat);
  addBox(boatGroup, 0.18, 0.44, 4.15, 0.82, 0.34, 0, woodDarkMat);
  addBox(boatGroup, 1.56, 0.12, 0.45, 0, 0.28, 0.1, woodWarmMat);
  addBox(boatGroup, 1.48, 0.12, 0.45, 0, 0.28, -1.1, woodWarmMat);
  pierGroup.add(boatGroup);

  group.add(pierGroup);

  // =========================================================================
  // 10. Starlight Hilltop Observatory (Northeast Highland Rotunda & Armillary)
  // =========================================================================
  const obsAnchor = getGladeLandmarkById('sky-observatory');
  const obsGroup = new THREE.Group();
  obsGroup.name = 'landmark_starlightObservatory';
  obsGroup.position.set(obsAnchor.x, obsAnchor.y, obsAnchor.z);
  obsGroup.rotation.y = obsAnchor.yaw;

  // Deeply anchored two-tier circular stone terrace (zero floating on hilltop slopes)
  const obsSkirt = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(13.2, 14.8, 5.2, 16)),
    stoneDarkMat,
  );
  obsSkirt.position.y = -2.2;
  obsSkirt.receiveShadow = true;
  obsGroup.add(obsSkirt);

  const obsLowerDeck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(12.2, 12.8, 1.0, 16)),
    stoneLightMat,
  );
  obsLowerDeck.position.y = 0.7;
  obsLowerDeck.receiveShadow = true;
  obsLowerDeck.castShadow = true;
  obsGroup.add(obsLowerDeck);

  const obsUpperDeck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(8.8, 9.5, 0.85, 16)),
    stoneTrimMat,
  );
  obsUpperDeck.position.y = 1.55;
  obsUpperDeck.receiveShadow = true;
  obsUpperDeck.castShadow = true;
  obsGroup.add(obsUpperDeck);

  // 8 carved rotunda columns + circular stone ring entablature
  const obsColGeo = trackGeo(new THREE.CylinderGeometry(0.46, 0.56, 8.4, 8));
  const obsColCapGeo = trackGeo(new THREE.BoxGeometry(1.42, 0.45, 1.42));
  const obsRadius = 7.8;
  for (let i = 0; i < 8; i += 1) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const cx = Math.cos(ang) * obsRadius;
    const cz = Math.sin(ang) * obsRadius;
    const col = new THREE.Mesh(obsColGeo, stoneLightMat);
    col.position.set(cx, 6.1, cz);
    col.castShadow = true;
    col.receiveShadow = true;
    obsGroup.add(col);

    const cap = new THREE.Mesh(obsColCapGeo, stoneTrimMat);
    cap.position.set(cx, 10.45, cz);
    cap.rotation.y = -ang;
    cap.castShadow = true;
    obsGroup.add(cap);
  }

  const obsEntablature = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(obsRadius, 0.62, 8, 24)),
    stoneTrimMat,
  );
  obsEntablature.rotation.x = Math.PI * 0.5;
  obsEntablature.position.y = 10.9;
  obsEntablature.castShadow = true;
  obsGroup.add(obsEntablature);

  // Open dome ribs crowning the observatory
  const obsRibGeo = trackGeo(new THREE.TorusGeometry(obsRadius - 0.15, 0.24, 6, 20, Math.PI));
  for (let i = 0; i < 4; i += 1) {
    const rib = new THREE.Mesh(obsRibGeo, roofTealMat);
    rib.position.y = 10.95;
    rib.rotation.y = (i / 4) * Math.PI;
    rib.castShadow = true;
    obsGroup.add(rib);
  }

  // Central stone plinth + rotating celestial armillary astrolabe rings
  const obsPedestal = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.75, 2.3, 2.2, 8)),
    stoneDarkMat,
  );
  obsPedestal.position.y = 3.0;
  obsPedestal.castShadow = true;
  obsGroup.add(obsPedestal);

  const armillaryGroup = new THREE.Group();
  armillaryGroup.position.set(0, 7.6, 0);
  const armillaryOuter = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(3.45, 0.16, 8, 28)),
    stoneTrimMat,
  );
  armillaryOuter.rotation.x = Math.PI * 0.22;
  armillaryGroup.add(armillaryOuter);

  const armillaryMid = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(2.65, 0.13, 8, 24)),
    vermilionMat,
  );
  armillaryMid.rotation.y = Math.PI * 0.35;
  armillaryMid.rotation.x = Math.PI * 0.32;
  armillaryGroup.add(armillaryMid);

  const armillaryInner = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(1.85, 0.1, 8, 20)),
    runeMat,
  );
  armillaryInner.rotation.x = Math.PI * 0.5;
  armillaryGroup.add(armillaryInner);

  const armillaryStar = new THREE.Mesh(
    trackGeo(new THREE.OctahedronGeometry(0.92, 0)),
    lanternMat,
  );
  armillaryGroup.add(armillaryStar);
  obsGroup.add(armillaryGroup);

  // Approach stone steps & flanking lanterns
  for (let s = 0; s < 3; s += 1) {
    addBox(obsGroup, 4.4, 0.42, 1.0, 0, 0.25 + s * 0.36, 12.6 - s * 0.9, stoneLightMat);
  }
  addStoneLantern(obsGroup, -3.4, 0.5, 13.4, 1.15);
  addStoneLantern(obsGroup, 3.4, 0.5, 13.4, 1.15);
  group.add(obsGroup);

  // =========================================================================
  // 11. Crimson Horizon Bell Pavilion (Southwest Hilltop Temple Belfry)
  // =========================================================================
  const bellAnchor = getGladeLandmarkById('sunset-bell-tower');
  const bellGroup = new THREE.Group();
  bellGroup.name = 'landmark_sunsetBellTower';
  bellGroup.position.set(bellAnchor.x, bellAnchor.y, bellAnchor.z);
  bellGroup.rotation.y = bellAnchor.yaw;

  // Grounded stone terrace plinth + deep foundation skirt
  addBox(bellGroup, 13.6, 5.2, 13.6, 0, -2.0, 0, stoneDarkMat);
  addBox(bellGroup, 12.2, 1.3, 12.2, 0, 0.95, 0, stoneLightMat);
  addBox(bellGroup, 10.6, 0.45, 10.6, 0, 1.78, 0, stoneTrimMat);

  // Entrance steps on front (+Z)
  for (let s = 0; s < 4; s += 1) {
    addBox(bellGroup, 4.2, 0.42, 0.95, 0, 0.25 + s * 0.42, 7.6 - s * 0.72, stoneLightMat);
  }

  // 4 stately vermilion corner pillars + upper tie beams
  const bellPillarGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.48, 8.6, 10));
  for (const sx of [-3.6, 3.6]) {
    for (const sz of [-3.6, 3.6]) {
      const p = new THREE.Mesh(bellPillarGeo, vermilionMat);
      p.position.set(sx, 6.2, sz);
      p.castShadow = true;
      p.receiveShadow = true;
      bellGroup.add(p);

      // Stone pillar footing block
      addBox(bellGroup, 1.25, 0.55, 1.25, sx, 2.2, sz, stoneDarkMat);
    }
  }
  addBox(bellGroup, 8.4, 0.52, 0.52, 0, 10.1, -3.6, vermilionMat);
  addBox(bellGroup, 8.4, 0.52, 0.52, 0, 10.1, 3.6, vermilionMat);
  addBox(bellGroup, 0.52, 0.52, 8.4, -3.6, 10.1, 0, vermilionMat);
  addBox(bellGroup, 0.52, 0.52, 8.4, 3.6, 10.1, 0, vermilionMat);
  addBox(bellGroup, 7.8, 0.48, 0.65, 0, 10.4, 0, woodDarkMat);

  // Sweeping double-tiered teal pagoda hip roof + cream finial spire
  const bellRoofLower = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(8.8, 3.2, 4)),
    roofTealMat,
  );
  bellRoofLower.rotation.y = Math.PI * 0.25;
  bellRoofLower.position.y = 12.1;
  bellRoofLower.castShadow = true;
  bellRoofLower.receiveShadow = true;
  bellGroup.add(bellRoofLower);

  const bellRoofUpper = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(6.0, 2.9, 4)),
    roofTealMat,
  );
  bellRoofUpper.rotation.y = Math.PI * 0.25;
  bellRoofUpper.position.y = 14.55;
  bellRoofUpper.castShadow = true;
  bellGroup.add(bellRoofUpper);

  const bellFinial = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.12, 0.36, 2.2, 8)),
    stoneTrimMat,
  );
  bellFinial.position.y = 16.7;
  bellGroup.add(bellFinial);

  // Suspended monumental bronze temple bell gently swaying from the crossbeam
  const templeBellPivot = new THREE.Group();
  templeBellPivot.position.set(0, 10.1, 0);
  const bellRope = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 6)),
    woodDarkMat,
  );
  bellRope.position.y = -1.2;
  templeBellPivot.add(bellRope);

  const bellBody = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.15, 1.72, 3.1, 14)),
    stoneDarkMat,
  );
  bellBody.position.y = -3.7;
  bellBody.castShadow = true;
  templeBellPivot.add(bellBody);

  const bellCrown = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(1.7, 0.16, 8, 18)),
    stoneTrimMat,
  );
  bellCrown.rotation.x = Math.PI * 0.5;
  bellCrown.position.y = -5.15;
  templeBellPivot.add(bellCrown);
  bellGroup.add(templeBellPivot);

  // Flanking stone lanterns + warm eaves lamps
  addStoneLantern(bellGroup, -5.2, 0.4, 8.6, 1.15);
  addStoneLantern(bellGroup, 5.2, 0.4, 8.6, 1.15);
  for (const sx of [-3.6, 3.6]) {
    const eaveLamp = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.65, 0.45)), lanternMat);
    eaveLamp.position.set(sx, 9.2, 4.4);
    bellGroup.add(eaveLamp);
  }
  group.add(bellGroup);

  // =========================================================================
  // 12. Solstice Standing Stones & Sun Arch (Southeast Sunlit Crest)
  // =========================================================================
  const solsticeAnchor = getGladeLandmarkById('solstice-sanctuary');
  const solsticeGroup = new THREE.Group();
  solsticeGroup.name = 'landmark_solsticeSanctuary';
  solsticeGroup.position.set(solsticeAnchor.x, solsticeAnchor.y, solsticeAnchor.z);
  solsticeGroup.rotation.y = solsticeAnchor.yaw;

  // Wide sunken stone hearth circle anchored into the ridge
  const solsticeBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(14.5, 16.0, 4.8, 16)),
    stoneDarkMat,
  );
  solsticeBase.position.y = -2.1;
  solsticeBase.receiveShadow = true;
  solsticeGroup.add(solsticeBase);

  const solsticeDais = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(13.2, 13.8, 0.72, 16)),
    stoneLightMat,
  );
  solsticeDais.position.y = 0.52;
  solsticeDais.receiveShadow = true;
  solsticeGroup.add(solsticeDais);

  // 9 megalithic standing stones + 3 carved cap lintels
  const monolithRadius = 11.0;
  for (let i = 0; i < 9; i += 1) {
    const ang = (i / 9) * Math.PI * 2;
    const mx = Math.cos(ang) * monolithRadius;
    const mz = Math.sin(ang) * monolithRadius;
    const h = i % 3 === 0 ? 9.6 : i % 2 === 0 ? 8.0 : 6.6;
    const stone = addBox(
      solsticeGroup,
      1.75,
      h,
      1.25,
      mx,
      0.6 + h * 0.5,
      mz,
      i % 2 === 0 ? stoneLightMat : stoneTrimMat,
      0,
      -ang + Math.PI * 0.5,
      (i % 2 === 0 ? 1 : -1) * 0.03,
    );
    stone.castShadow = true;
    stone.receiveShadow = true;

    // Luminous carved rune band on taller monoliths
    if (i % 3 === 0) {
      addBox(solsticeGroup, 1.82, 0.36, 1.32, mx, h * 0.62, mz, runeMat, 0, -ang + Math.PI * 0.5, 0);
    }
  }

  // Twin soaring central Sun Arch monoliths + massive capstone lintel
  addBox(solsticeGroup, 1.9, 12.2, 1.65, -3.2, 6.4, 0, stoneLightMat, 0, 0, -0.04);
  addBox(solsticeGroup, 1.9, 12.2, 1.65, 3.2, 6.4, 0, stoneLightMat, 0, 0, 0.04);
  addBox(solsticeGroup, 9.6, 1.45, 2.1, 0, 12.8, 0, stoneTrimMat);

  // Hovering Solstice Solar Ring framed inside the Sun Arch
  const solsticeSolarDisc = new THREE.Group();
  solsticeSolarDisc.position.set(0, 7.2, 0);
  const solarOuter = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(1.75, 0.14, 8, 24)),
    lanternMat,
  );
  solsticeSolarDisc.add(solarOuter);
  const solarCore = new THREE.Mesh(
    trackGeo(new THREE.OctahedronGeometry(0.95, 0)),
    runeMat,
  );
  solsticeSolarDisc.add(solarCore);
  solsticeGroup.add(solsticeSolarDisc);

  addStoneLantern(solsticeGroup, -4.4, 0.5, 13.6, 1.15);
  addStoneLantern(solsticeGroup, 4.4, 0.5, 13.6, 1.15);
  group.add(solsticeGroup);

  // =========================================================================
  // 13. Cloudcrest Highland Beacon Tower (Northwest Alpine Summit Lighthouse)
  // =========================================================================
  const beaconAnchor = getGladeLandmarkById('cloudcrest-beacon');
  const beaconGroup = new THREE.Group();
  beaconGroup.name = 'landmark_cloudcrestBeacon';
  beaconGroup.position.set(beaconAnchor.x, beaconAnchor.y, beaconAnchor.z);
  beaconGroup.rotation.y = beaconAnchor.yaw;

  // Deeply anchored octagonal stone bastion base + 4 sloping buttresses
  const beaconFooting = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(7.2, 8.8, 6.0, 8)),
    stoneDarkMat,
  );
  beaconFooting.position.y = -2.2;
  beaconFooting.receiveShadow = true;
  beaconGroup.add(beaconFooting);

  const beaconBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(5.6, 6.8, 5.2, 8)),
    stoneLightMat,
  );
  beaconBase.position.y = 3.0;
  beaconBase.castShadow = true;
  beaconBase.receiveShadow = true;
  beaconGroup.add(beaconBase);

  for (let i = 0; i < 4; i += 1) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    addBox(
      beaconGroup,
      1.6,
      6.4,
      2.6,
      Math.cos(ang) * 5.6,
      2.4,
      Math.sin(ang) * 5.6,
      stoneTrimMat,
      0,
      -ang + Math.PI * 0.5,
      0,
    );
  }

  // Tall cream-plaster tower shaft rising cleanly above the alpine pines
  const beaconShaft = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(3.6, 4.9, 14.5, 10)),
    plasterCreamMat,
  );
  beaconShaft.position.y = 12.6;
  beaconShaft.castShadow = true;
  beaconShaft.receiveShadow = true;
  beaconGroup.add(beaconShaft);

  // Timber observation gallery deck + railing
  const beaconDeck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(5.1, 4.4, 0.85, 10)),
    woodDarkMat,
  );
  beaconDeck.position.y = 19.9;
  beaconDeck.castShadow = true;
  beaconGroup.add(beaconDeck);

  const beaconRail = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(4.85, 0.16, 6, 20)),
    woodWarmMat,
  );
  beaconRail.rotation.x = Math.PI * 0.5;
  beaconRail.position.y = 21.1;
  beaconGroup.add(beaconRail);

  // Open lantern house with 6 vermilion columns + glowing rotating beacon crystal + teal spire
  const beaconColGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.26, 4.2, 8));
  for (let i = 0; i < 6; i += 1) {
    const ang = (i / 6) * Math.PI * 2;
    const col = new THREE.Mesh(beaconColGeo, vermilionMat);
    col.position.set(Math.cos(ang) * 3.2, 22.3, Math.sin(ang) * 3.2);
    col.castShadow = true;
    beaconGroup.add(col);
  }

  const beaconCrystal = new THREE.Mesh(
    trackGeo(new THREE.OctahedronGeometry(1.55, 0)),
    lanternMat,
  );
  beaconCrystal.scale.set(0.85, 1.35, 0.85);
  beaconCrystal.position.y = 22.4;
  beaconGroup.add(beaconCrystal);

  const beaconRoof = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(4.9, 5.4, 10)),
    roofTealMat,
  );
  beaconRoof.position.y = 27.0;
  beaconRoof.castShadow = true;
  beaconGroup.add(beaconRoof);

  const beaconSpire = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.08, 0.24, 2.4, 6)),
    stoneTrimMat,
  );
  beaconSpire.position.y = 30.6;
  beaconGroup.add(beaconSpire);

  // Arched wooden entry door & warm flanking stone lanterns
  addBox(beaconGroup, 2.4, 3.6, 0.55, 0, 2.1, 6.2, woodDarkMat);
  addStoneLantern(beaconGroup, -3.2, 0.4, 8.4, 1.15);
  addStoneLantern(beaconGroup, 3.2, 0.4, 8.4, 1.15);
  group.add(beaconGroup);

  // =========================================================================
  // 14. Grand Valley Overlook Gazebo (Southern Rolling Hills Belvedere)
  // =========================================================================
  const southAnchor = getGladeLandmarkById('south-overlook');
  const southGroup = new THREE.Group();
  southGroup.name = 'landmark_southOverlookGazebo';
  southGroup.position.set(southAnchor.x, southAnchor.y, southAnchor.z);
  southGroup.rotation.y = southAnchor.yaw;

  // Grounded circular belvedere terrace
  const southSkirt = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(10.2, 11.6, 5.0, 12)),
    stoneDarkMat,
  );
  southSkirt.position.y = -2.1;
  southSkirt.receiveShadow = true;
  southGroup.add(southSkirt);

  const southDeck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(9.6, 10.0, 0.8, 12)),
    stoneLightMat,
  );
  southDeck.position.y = 0.6;
  southDeck.receiveShadow = true;
  southGroup.add(southDeck);

  // Hexagonal vermilion-pillar gazebo with sweeping teal canopy roof
  const gazColGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 5.8, 8));
  const gazR = 6.2;
  for (let i = 0; i < 6; i += 1) {
    const ang = (i / 6) * Math.PI * 2;
    const gx = Math.cos(ang) * gazR;
    const gz = Math.sin(ang) * gazR;
    const col = new THREE.Mesh(gazColGeo, vermilionMat);
    col.position.set(gx, 3.9, gz);
    col.castShadow = true;
    southGroup.add(col);

    // Low timber balustrade rails along back/side spans
    if (i !== 2) {
      const nextAng = ((i + 1) / 6) * Math.PI * 2;
      const nx = Math.cos(nextAng) * gazR;
      const nz = Math.sin(nextAng) * gazR;
      addBox(
        southGroup,
        Math.hypot(nx - gx, nz - gz),
        0.24,
        0.24,
        (gx + nx) * 0.5,
        2.05,
        (gz + nz) * 0.5,
        woodWarmMat,
        0,
        -Math.atan2(nz - gz, nx - gx),
        0,
      );
    }
  }

  const gazRoof = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(8.2, 3.8, 6)),
    roofTealMat,
  );
  gazRoof.position.y = 8.55;
  gazRoof.castShadow = true;
  gazRoof.receiveShadow = true;
  southGroup.add(gazRoof);

  const gazTop = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.12, 0.34, 1.6, 6)),
    stoneTrimMat,
  );
  gazTop.position.y = 11.1;
  southGroup.add(gazTop);

  // Central hanging lantern inside gazebo
  const gazLamp = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.62, 0)), lanternMat);
  gazLamp.position.y = 6.1;
  southGroup.add(gazLamp);

  addStoneLantern(southGroup, -4.6, 0.5, 10.2, 1.05);
  addStoneLantern(southGroup, 4.6, 0.5, 10.2, 1.05);
  group.add(southGroup);

  const landmarkNames = [
    'Ancient Horizon Stone Archway',
    'Arched Wooden River Bridge',
    'Vermilion Moon Bridge',
    'Vermilion Torii Gate',
    'Sakura Lakeside Pavilion',
    'Golden Hilltop Windmill',
    'Ancient Moonstone Ruins Sanctuary',
    'Emerald Lake Wooden Pier',
    'Starlight Hilltop Observatory',
    'Crimson Horizon Bell Pavilion',
    'Solstice Standing Stones',
    'Cloudcrest Highland Beacon',
    'Grand Valley Overlook Gazebo',
  ] as const;

  const update = (dt: number, elapsed: number, lanternGlow: number): void => {
    // Windmill sails spin gracefully in the breeze
    windmillRotor.rotation.z -= dt * 0.48;

    // Moonstone Ruins obelisk hovers & rotates gently
    floatingCrystal.position.y = 6.2 + Math.sin(elapsed * 1.15) * 0.42;
    floatingCrystal.rotation.y = elapsed * 0.45;
    haloRing.rotation.z = -elapsed * 0.35;

    // Archway apex sigil slow spin
    archSigil.rotation.y = elapsed * 0.65;

    // Moored rowboat bobs softly on Emerald Lake
    boatGroup.position.y = -0.44 + Math.sin(elapsed * 1.45) * 0.07;
    boatGroup.rotation.z = Math.sin(elapsed * 1.1) * 0.045;
    boatGroup.rotation.x = Math.cos(elapsed * 0.95) * 0.025;

    // Starlight Observatory celestial armillary rings turn serenely
    armillaryOuter.rotation.y = elapsed * 0.22;
    armillaryMid.rotation.z = -elapsed * 0.34;
    armillaryInner.rotation.y = elapsed * 0.52;
    armillaryStar.rotation.y = elapsed * 0.8;

    // Horizon Bell Pavilion temple bell sways very gently in highland wind
    templeBellPivot.rotation.z = Math.sin(elapsed * 0.72) * 0.045;

    // Solstice Solar Disc hovers & turns within the Sun Arch
    solsticeSolarDisc.position.y = 7.2 + Math.sin(elapsed * 1.05) * 0.35;
    solsticeSolarDisc.rotation.y = elapsed * 0.38;

    // Cloudcrest Beacon crystal turns gently
    beaconCrystal.rotation.y = elapsed * 0.55;

    // Dynamic lantern & rune glow responsive to active weather mood
    lanternMat.color.copy(lanternBaseColor).multiplyScalar(1.0 + lanternGlow * 0.42);
    runeMat.color.copy(runeBaseColor).multiplyScalar(1.05 + lanternGlow * 0.28);
  };

  const dispose = (): void => {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    group.clear();
  };

  return {
    group,
    landmarkNames,
    update,
    dispose,
  };
}
