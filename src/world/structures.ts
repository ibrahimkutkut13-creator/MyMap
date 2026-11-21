import * as THREE from 'three';
import {
  WATER_LEVEL,
  WORLD_SEED,
  createSeededRandom,
  getBridgeAnchor,
  getFordCrossing,
  getTerrainHeight,
  type BridgeAnchor,
} from './terrain';
import {
  DEFAULT_OUTLINE_COLOR,
  addInkOutline,
  createAnimeToonMaterial,
} from './toonMaterials';
import type { FoamObstacle, WaterController } from './water';

// ---------------------------------------------------------------------------
// Types & Pure Walkable Geometry Metadata
// ---------------------------------------------------------------------------

export interface StructureCollider {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  kind: 'bridge-post' | 'bridge-abutment' | 'signpost' | 'mile-marker';
}

export interface SteppingStoneSpec {
  x: number;
  z: number;
  topY: number;
  radiusX: number;
  radiusZ: number;
  rotationY: number;
}

export interface CreateStructuresOptions {
  water?: Pick<WaterController, 'registerFoamObstacle'>;
}

export interface StructuresController {
  readonly group: THREE.Group;
  readonly bridgeGroup: THREE.Group;
  readonly steppingStonesGroup: THREE.Group;
  readonly markersGroup: THREE.Group;
  readonly bridgeAnchor: BridgeAnchor;
  readonly steppingStones: readonly SteppingStoneSpec[];
  readonly colliders: readonly StructureCollider[];
  readonly waterObstacles: readonly FoamObstacle[];
  getWalkHeight: (x: number, z: number) => number | null;
  getColliders: () => readonly StructureCollider[];
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Pure Arch & Stepping-Stone Walkable Elevation Queries
// ---------------------------------------------------------------------------

const PLANK_THICKNESS = 0.16;
const BRIDGE_DECK_WALK_HALF_WIDTH_MARGIN = 0.08;

/**
 * Computes the parabolic arch top-of-plank surface elevation at bridge-local X.
 * At |localX| = span / 2 (bank ends), equals `anchor.bankHeight` flush with the path.
 */
export function computeBridgeArchElevation(
  localX: number,
  anchor: BridgeAnchor,
): number {
  const halfSpan = anchor.span * 0.5;
  const u = THREE.MathUtils.clamp(localX / halfSpan, -1, 1);
  return anchor.bankHeight + anchor.archHeight * (1 - u * u);
}

/**
 * First derivative dY/dX of the parabolic arch for angling planks cleanly along the curve.
 */
export function computeBridgeArchSlope(
  localX: number,
  anchor: BridgeAnchor,
): number {
  const halfSpan = anchor.span * 0.5;
  const u = THREE.MathUtils.clamp(localX / halfSpan, -1, 1);
  return (-2 * anchor.archHeight * u) / halfSpan;
}

/**
 * Generates deterministic flat-topped stepping-stone specs meandering across the shallow ford.
 */
export function computeSteppingStoneSpecs(): SteppingStoneSpec[] {
  const ford = getFordCrossing();
  const rand = createSeededRandom(WORLD_SEED + 310);
  const count = 6;
  const specs: SteppingStoneSpec[] = [];

  const perpX = -ford.direction.y;
  const perpZ = ford.direction.x;

  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const along = (t - 0.5) * (ford.span - 4.2);
    // Natural meandering S-curve across the shallow ford
    const meander = Math.sin(t * Math.PI * 2.0) * 0.85 + (rand() - 0.5) * 0.3;

    const x = ford.center.x + ford.direction.x * along + perpX * meander;
    const z = ford.center.z + ford.direction.y * along + perpZ * meander;
    const topY = WATER_LEVEL + 0.13 + rand() * 0.05;
    const radiusX = 0.82 + rand() * 0.24;
    const radiusZ = 0.72 + rand() * 0.22;
    const rotationY = rand() * Math.PI * 2;

    specs.push({ x, z, topY, radiusX, radiusZ, rotationY });
  }

  return specs;
}

const CANONICAL_BRIDGE_ANCHOR = getBridgeAnchor();
const CANONICAL_STEPPING_STONES = computeSteppingStoneSpecs();

let activeColliders: StructureCollider[] = [];

/**
 * Evaluates the walkable structure elevation at world (x, z), returning:
 * - The curved bridge deck surface elevation when inside the bridge deck footprint
 * - The flat stepping-stone top elevation when standing on a river stepping-stone
 * - `null` when standing on normal terrain
 */
export function getStructureWalkHeight(
  x: number,
  z: number,
  anchor: BridgeAnchor = CANONICAL_BRIDGE_ANCHOR,
  steppingStones: readonly SteppingStoneSpec[] = CANONICAL_STEPPING_STONES,
): number | null {
  // 1. Transform (x, z) into bridge local frame (rotationY rotates local +X toward east bank)
  const dx = x - anchor.position.x;
  const dz = z - anchor.position.z;
  const cos = Math.cos(anchor.rotationY);
  const sin = Math.sin(anchor.rotationY);

  // Inverse of Three.js Y-rotation: localX = dx*cos - dz*sin, localZ = dx*sin + dz*cos
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  const halfSpan = anchor.span * 0.5;
  const halfWalkWidth = anchor.width * 0.5 - BRIDGE_DECK_WALK_HALF_WIDTH_MARGIN;

  if (Math.abs(localX) <= halfSpan + 0.35 && Math.abs(localZ) <= halfWalkWidth) {
    return computeBridgeArchElevation(localX, anchor) + PLANK_THICKNESS * 0.5;
  }

  // 2. Check flat stepping-stone tops across the river ford
  for (let i = 0; i < steppingStones.length; i += 1) {
    const s = steppingStones[i];
    const sdx = x - s.x;
    const sdz = z - s.z;
    const sc = Math.cos(-s.rotationY);
    const ss = Math.sin(-s.rotationY);
    const lx = sdx * sc - sdz * ss;
    const lz = sdx * ss + sdz * sc;
    const normDistSq =
      (lx * lx) / (s.radiusX * s.radiusX) + (lz * lz) / (s.radiusZ * s.radiusZ);
    if (normDistSq <= 1.05) {
      return s.topY;
    }
  }

  return null;
}

export function getStructureColliders(): readonly StructureCollider[] {
  return activeColliders;
}

// ---------------------------------------------------------------------------
// Chamfered Procedural Geometry Helpers
// ---------------------------------------------------------------------------

function createChamferedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevel = 0.03,
): THREE.BufferGeometry {
  const b = Math.min(bevel, width * 0.25, height * 0.25, depth * 0.25);
  const w = Math.max(0.01, width - b * 2);
  const h = Math.max(0.01, height - b * 2);
  const d = Math.max(0.01, depth - b * 2);

  const shape = new THREE.Shape();
  const hw = w * 0.5;
  const hh = h * 0.5;
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
  });
  geo.center();
  return geo;
}

function createArchedStringerGeometry(
  anchor: BridgeAnchor,
  thicknessZ: number,
  beamHeight: number,
): THREE.BufferGeometry {
  const halfSpan = anchor.span * 0.5 + 0.45;
  const samples = 24;
  const shape = new THREE.Shape();

  // Top edge follows the underside of the arched deck planks
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const lx = -halfSpan + t * halfSpan * 2;
    const yTop = computeBridgeArchElevation(lx, anchor) - anchor.bankHeight - PLANK_THICKNESS * 0.42;
    if (i === 0) shape.moveTo(lx, yTop);
    else shape.lineTo(lx, yTop);
  }

  // Bottom edge runs parallel below the top edge, slightly deeper near ends for strength
  for (let i = samples; i >= 0; i -= 1) {
    const t = i / samples;
    const lx = -halfSpan + t * halfSpan * 2;
    const u = Math.abs(lx / (anchor.span * 0.5));
    const depthExtra = u * u * 0.14;
    const yBot =
      computeBridgeArchElevation(lx, anchor) -
      anchor.bankHeight -
      PLANK_THICKNESS * 0.42 -
      beamHeight -
      depthExtra;
    shape.lineTo(lx, yBot);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessZ,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, -thicknessZ * 0.5);
  return geo;
}

function createBeveledSteppingStoneGeometry(
  radiusX: number,
  radiusZ: number,
  height: number,
  seed: number,
): THREE.BufferGeometry {
  const rand = createSeededRandom(seed);
  const sides = 7;
  const shape = new THREE.Shape();

  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const rScale = 0.84 + rand() * 0.24;
    const px = Math.cos(angle) * radiusX * rScale;
    const py = Math.sin(angle) * radiusZ * rScale;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();

  const bevel = 0.08;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.2, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
  });
  // Rotate so extruded shape lies flat in XZ with flat top at y = 0 and deep body extending downward
  geo.rotateX(Math.PI / 2);
  geo.computeBoundingBox();
  if (geo.boundingBox) {
    geo.translate(0, -geo.boundingBox.max.y, 0);
  }
  return geo;
}

function createPointedSignBoardGeometry(
  length: number,
  height: number,
  thickness: number,
): THREE.BufferGeometry {
  const hl = length * 0.5;
  const hh = height * 0.5;
  const tip = Math.min(0.24, length * 0.25);

  const shape = new THREE.Shape();
  shape.moveTo(-hl, -hh);
  shape.lineTo(hl - tip, -hh);
  shape.lineTo(hl, 0);
  shape.lineTo(hl - tip, hh);
  shape.lineTo(-hl, hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, -thickness * 0.5);
  return geo;
}

// ---------------------------------------------------------------------------
// Structures Builder (Curved Wooden Bridge, Stepping Stones, Trail Markers)
// ---------------------------------------------------------------------------

/**
 * Builds the curved wooden plank bridge with chamfered posts, stone abutments,
 * sagging catenary hemp ropes, shallow river stepping-stones, and trail signposts.
 */
export function createStructures(
  scene?: THREE.Scene,
  options: CreateStructuresOptions = {},
): StructuresController {
  const anchor = getBridgeAnchor();
  const steppingStones = computeSteppingStoneSpecs();
  const rand = createSeededRandom(WORLD_SEED + 710);

  const group = new THREE.Group();
  group.name = 'stylizedWorldStructures';

  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'curvedWoodenBridge';
  bridgeGroup.position.copy(anchor.position);
  bridgeGroup.rotation.y = anchor.rotationY;
  group.add(bridgeGroup);

  const steppingStonesGroup = new THREE.Group();
  steppingStonesGroup.name = 'riverSteppingStones';
  group.add(steppingStonesGroup);

  const markersGroup = new THREE.Group();
  markersGroup.name = 'trailSignpostsAndMarkers';
  group.add(markersGroup);

  const colliders: StructureCollider[] = [];
  const waterObstacles: FoamObstacle[] = [];
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };

  // Shared anime toon materials
  const plankWarmMat = trackMat(
    createAnimeToonMaterial('#b87b4b', {
      steps: 3,
      shadowTint: '#8a5248',
      shadowTintStrength: 0.38,
      rimColor: '#fff2cf',
      rimIntensity: 0.24,
    }),
  );
  const plankDeepMat = trackMat(
    createAnimeToonMaterial('#a46a3e', {
      steps: 3,
      shadowTint: '#7a4842',
      shadowTintStrength: 0.4,
      rimColor: '#ffefd0',
      rimIntensity: 0.22,
    }),
  );
  const stringerMat = trackMat(
    createAnimeToonMaterial('#7a4c2d', {
      steps: 3,
      shadowTint: '#5d3744',
      shadowTintStrength: 0.42,
      rimColor: '#f5dfc0',
      rimIntensity: 0.18,
    }),
  );
  const postCapMat = trackMat(
    createAnimeToonMaterial('#8f5a36', {
      steps: 3,
      shadowTint: '#653e49',
      shadowTintStrength: 0.38,
      rimColor: '#fff0cc',
      rimIntensity: 0.26,
    }),
  );
  const abutmentStoneMat = trackMat(
    createAnimeToonMaterial('#8c96b8', {
      steps: 2,
      flatShading: true,
      shadowTint: '#6b648f',
      shadowTintStrength: 0.36,
      rimColor: '#e6f2ff',
      rimIntensity: 0.22,
    }),
  );
  const steppingStoneMat = trackMat(
    createAnimeToonMaterial('#9aa4c2', {
      steps: 2,
      flatShading: true,
      shadowTint: '#706a94',
      shadowTintStrength: 0.34,
      rimColor: '#edf6ff',
      rimIntensity: 0.24,
    }),
  );
  const ropeMat = trackMat(
    createAnimeToonMaterial('#dfd0a8', {
      steps: 3,
      shadowTint: '#9b836c',
      shadowTintStrength: 0.34,
      rimColor: '#fffbe6',
      rimIntensity: 0.26,
    }),
  );

  // Helper to convert bridge-local (lx, lz) into world (wx, wz)
  const cosR = Math.cos(anchor.rotationY);
  const sinR = Math.sin(anchor.rotationY);
  const bridgeLocalToWorldXZ = (lx: number, lz: number): [number, number] => [
    anchor.position.x + lx * cosR + lz * sinR,
    anchor.position.z - lx * sinR + lz * cosR,
  ];

  // -------------------------------------------------------------------------
  // 1. Curved Wooden Plank Bridge
  // -------------------------------------------------------------------------

  const halfSpan = anchor.span * 0.5;
  const halfWidth = anchor.width * 0.5;

  // 1a. Curved Timber Stringer Beams (left, right, and central spine)
  const outerStringerGeo = trackGeo(createArchedStringerGeometry(anchor, 0.24, 0.34));
  const innerStringerGeo = trackGeo(createArchedStringerGeometry(anchor, 0.2, 0.26));

  for (const side of [-1, 1]) {
    const stringer = new THREE.Mesh(outerStringerGeo, stringerMat);
    stringer.name = side < 0 ? 'bridgeStringerNorth' : 'bridgeStringerSouth';
    stringer.position.set(0, 0, side * (halfWidth - 0.34));
    stringer.castShadow = true;
    stringer.receiveShadow = true;
    addInkOutline(stringer, 0.024, DEFAULT_OUTLINE_COLOR);
    bridgeGroup.add(stringer);
  }
  const centerStringer = new THREE.Mesh(innerStringerGeo, stringerMat);
  centerStringer.name = 'bridgeStringerCenter';
  centerStringer.castShadow = true;
  centerStringer.receiveShadow = true;
  bridgeGroup.add(centerStringer);

  // 1b. Individual Chamfered Wooden Deck Planks along the parabolic arch
  const plankCount = 26;
  const plankLengthX = (anchor.span + 0.4) / plankCount - 0.055;
  const plankGeo = trackGeo(
    createChamferedBoxGeometry(plankLengthX, PLANK_THICKNESS, anchor.width - 0.14, 0.026),
  );

  for (let i = 0; i < plankCount; i += 1) {
    const t = (i + 0.5) / plankCount;
    const lx = -halfSpan - 0.2 + t * (anchor.span + 0.4);
    const localY =
      computeBridgeArchElevation(lx, anchor) - anchor.bankHeight + (rand() - 0.5) * 0.016;
    const slope = computeBridgeArchSlope(lx, anchor);
    const pitchZ = Math.atan(slope);

    const plank = new THREE.Mesh(
      plankGeo,
      i % 2 === 0 ? plankWarmMat : plankDeepMat,
    );
    plank.name = `bridgePlank_${i}`;
    plank.position.set(lx, localY, (rand() - 0.5) * 0.04);
    plank.rotation.set(
      (rand() - 0.5) * 0.012,
      (rand() - 0.5) * 0.022,
      pitchZ,
    );
    plank.castShadow = true;
    plank.receiveShadow = true;
    addInkOutline(plank, 0.022, DEFAULT_OUTLINE_COLOR);
    bridgeGroup.add(plank);
  }

  // 1c. Heavy Beveled Stone Abutment Blocks seated deeply into both riverbanks
  const abutmentGeo = trackGeo(createChamferedBoxGeometry(1.45, 2.5, 0.92, 0.08));
  const abutmentCapGeo = trackGeo(createChamferedBoxGeometry(1.62, 0.22, 1.06, 0.05));

  for (const endSign of [-1, 1]) {
    const lx = endSign * (halfSpan - 0.35);
    const deckY = computeBridgeArchElevation(lx, anchor) - anchor.bankHeight;
    for (const side of [-1, 1]) {
      const lz = side * (halfWidth + 0.14);
      const block = new THREE.Mesh(abutmentGeo, abutmentStoneMat);
      block.name = `bridgeAbutment_${endSign}_${side}`;
      block.position.set(lx, deckY - 0.88, lz);
      block.castShadow = true;
      block.receiveShadow = true;
      addInkOutline(block, 0.028, DEFAULT_OUTLINE_COLOR);
      bridgeGroup.add(block);

      const cap = new THREE.Mesh(abutmentCapGeo, abutmentStoneMat);
      cap.position.set(lx, deckY + 0.42, lz);
      cap.castShadow = true;
      cap.receiveShadow = true;
      addInkOutline(cap, 0.024, DEFAULT_OUTLINE_COLOR);
      bridgeGroup.add(cap);

      const [wx, wz] = bridgeLocalToWorldXZ(lx, lz);
      colliders.push({
        x: wx,
        y: anchor.bankHeight,
        z: wz,
        radius: 0.78,
        height: 1.4,
        kind: 'bridge-abutment',
      });
    }
  }

  // 1d. Mid-River Timber Support Pilings with Stone Collars (with Water Foam Rings!)
  const pilingGeo = trackGeo(new THREE.CylinderGeometry(0.19, 0.24, 4.4, 8));
  const pilingCollarGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.38, 0.72, 8));
  const pilingXs = [-halfSpan * 0.46, halfSpan * 0.46];

  for (let pi = 0; pi < pilingXs.length; pi += 1) {
    const lx = pilingXs[pi];
    const deckY = computeBridgeArchElevation(lx, anchor) - anchor.bankHeight;
    for (const side of [-1, 1]) {
      const lz = side * (halfWidth - 0.34);
      const piling = new THREE.Mesh(pilingGeo, stringerMat);
      piling.name = `bridgePiling_${pi}_${side}`;
      piling.position.set(lx, deckY - 2.35, lz);
      piling.castShadow = true;
      piling.receiveShadow = true;
      addInkOutline(piling, 0.024, DEFAULT_OUTLINE_COLOR);
      bridgeGroup.add(piling);

      const collar = new THREE.Mesh(pilingCollarGeo, abutmentStoneMat);
      collar.position.set(lx, WATER_LEVEL - anchor.bankHeight + 0.06, lz);
      collar.castShadow = true;
      collar.receiveShadow = true;
      addInkOutline(collar, 0.024, DEFAULT_OUTLINE_COLOR);
      bridgeGroup.add(collar);

      const [wx, wz] = bridgeLocalToWorldXZ(lx, lz);
      const obs: FoamObstacle = { x: wx, z: wz, radius: 0.56 };
      waterObstacles.push(obs);
      options.water?.registerFoamObstacle(obs.x, obs.z, obs.radius);
    }
  }

  // 1e. Carved Timber Handrail Posts & Sagging Catenary Hemp Rope Railings
  const postCountPerSide = 7;
  const postHeight = 1.18;
  const postGeo = trackGeo(createChamferedBoxGeometry(0.22, postHeight, 0.22, 0.028));
  const postCapGeo = trackGeo(createChamferedBoxGeometry(0.3, 0.12, 0.3, 0.026));
  const ropeTieGeo = trackGeo(new THREE.TorusGeometry(0.145, 0.028, 6, 12));
  ropeTieGeo.rotateX(Math.PI / 2);

  for (const side of [-1, 1]) {
    const lz = side * (halfWidth - 0.14);
    const postTopAnchors: THREE.Vector3[] = [];
    const postMidAnchors: THREE.Vector3[] = [];

    for (let i = 0; i < postCountPerSide; i += 1) {
      const t = i / (postCountPerSide - 1);
      const lx = -halfSpan + 0.45 + t * (anchor.span - 0.9);
      const deckY = computeBridgeArchElevation(lx, anchor) - anchor.bankHeight;

      const post = new THREE.Mesh(postGeo, postCapMat);
      post.name = `bridgePost_${side}_${i}`;
      post.position.set(lx, deckY + postHeight * 0.5 - 0.1, lz);
      post.castShadow = true;
      post.receiveShadow = true;
      addInkOutline(post, 0.024, DEFAULT_OUTLINE_COLOR);
      bridgeGroup.add(post);

      const cap = new THREE.Mesh(postCapGeo, stringerMat);
      cap.position.set(lx, deckY + postHeight - 0.06, lz);
      cap.castShadow = true;
      cap.receiveShadow = true;
      addInkOutline(cap, 0.022, DEFAULT_OUTLINE_COLOR);
      bridgeGroup.add(cap);

      const tieY = deckY + postHeight - 0.24;
      const tie = new THREE.Mesh(ropeTieGeo, ropeMat);
      tie.position.set(lx, tieY, lz);
      bridgeGroup.add(tie);

      postTopAnchors.push(new THREE.Vector3(lx, tieY, lz));
      postMidAnchors.push(new THREE.Vector3(lx, deckY + postHeight * 0.46, lz));

      const [wx, wz] = bridgeLocalToWorldXZ(lx, lz);
      colliders.push({
        x: wx,
        y: anchor.bankHeight + deckY,
        z: wz,
        radius: 0.24,
        height: postHeight,
        kind: 'bridge-post',
      });
    }

    // Build graceful catenary-draped hemp ropes between each pair of consecutive posts
    for (let i = 0; i < postTopAnchors.length - 1; i += 1) {
      const aTop = postTopAnchors[i];
      const bTop = postTopAnchors[i + 1];
      const midTop = aTop.clone().lerp(bTop, 0.5);
      midTop.y -= 0.25;
      const q1Top = aTop.clone().lerp(bTop, 0.25);
      q1Top.y -= 0.18;
      const q3Top = aTop.clone().lerp(bTop, 0.75);
      q3Top.y -= 0.18;

      const upperCurve = new THREE.CatmullRomCurve3([aTop, q1Top, midTop, q3Top, bTop]);
      const upperRopeGeo = trackGeo(new THREE.TubeGeometry(upperCurve, 14, 0.046, 7, false));
      const upperRope = new THREE.Mesh(upperRopeGeo, ropeMat);
      upperRope.name = `bridgeUpperRope_${side}_${i}`;
      upperRope.castShadow = true;
      upperRope.receiveShadow = true;
      addInkOutline(upperRope, 0.015, DEFAULT_OUTLINE_COLOR);
      bridgeGroup.add(upperRope);

      // Secondary lower guide rope with lighter drape
      const aMid = postMidAnchors[i];
      const bMid = postMidAnchors[i + 1];
      const midLow = aMid.clone().lerp(bMid, 0.5);
      midLow.y -= 0.17;
      const lowerCurve = new THREE.CatmullRomCurve3([aMid, midLow, bMid]);
      const lowerRopeGeo = trackGeo(new THREE.TubeGeometry(lowerCurve, 12, 0.032, 6, false));
      const lowerRope = new THREE.Mesh(lowerRopeGeo, ropeMat);
      lowerRope.name = `bridgeLowerRope_${side}_${i}`;
      lowerRope.castShadow = true;
      addInkOutline(lowerRope, 0.012, DEFAULT_OUTLINE_COLOR);
      bridgeGroup.add(lowerRope);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Shallow River Stepping-Stones (with Animated Water Foam Registration)
  // -------------------------------------------------------------------------

  for (let i = 0; i < steppingStones.length; i += 1) {
    const spec = steppingStones[i];
    const stoneHeight = 1.45;
    const stoneGeo = trackGeo(
      createBeveledSteppingStoneGeometry(
        spec.radiusX,
        spec.radiusZ,
        stoneHeight,
        WORLD_SEED + 900 + i * 37,
      ),
    );
    const stoneMesh = new THREE.Mesh(stoneGeo, steppingStoneMat);
    stoneMesh.name = `steppingStone_${i}`;
    stoneMesh.position.set(spec.x, spec.topY, spec.z);
    stoneMesh.rotation.y = spec.rotationY;
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    addInkOutline(stoneMesh, 0.028, DEFAULT_OUTLINE_COLOR);
    steppingStonesGroup.add(stoneMesh);

    const foamRadius = Math.max(spec.radiusX, spec.radiusZ) * 1.04;
    const obs: FoamObstacle = { x: spec.x, z: spec.z, radius: foamRadius };
    waterObstacles.push(obs);
    options.water?.registerFoamObstacle(obs.x, obs.z, obs.radius);
  }

  // -------------------------------------------------------------------------
  // 3. Weathered Wooden Trail Signposts & Stone Mile-Markers
  // -------------------------------------------------------------------------

  const signpostSpecs: ReadonlyArray<{
    x: number;
    z: number;
    yawA: number;
    yawB: number;
  }> = [
    { x: -16.2, z: 16.8, yawA: -0.58, yawB: -2.42 }, // Spawn meadow junction
    { x: 11.8, z: -2.6, yawA: -0.82, yawB: 1.05 }, // East bridge trailhead
    { x: -30.5, z: 11.4, yawA: -2.18, yawB: 0.72 }, // Scenic overlook fork
  ];

  const signPostGeo = trackGeo(createChamferedBoxGeometry(0.18, 2.35, 0.18, 0.025));
  const signBaseGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.38, 0.48, 7));
  const signCapGeo = trackGeo(createChamferedBoxGeometry(0.26, 0.1, 0.26, 0.02));
  const signBoardGeo = trackGeo(createPointedSignBoardGeometry(1.12, 0.28, 0.075));

  for (let i = 0; i < signpostSpecs.length; i += 1) {
    const sp = signpostSpecs[i];
    const groundY = getTerrainHeight(sp.x, sp.z);
    const postGroup = new THREE.Group();
    postGroup.name = `trailSignpost_${i}`;
    postGroup.position.set(sp.x, groundY, sp.z);

    const baseStone = new THREE.Mesh(signBaseGeo, abutmentStoneMat);
    baseStone.position.y = 0.08;
    baseStone.castShadow = true;
    baseStone.receiveShadow = true;
    addInkOutline(baseStone, 0.024, DEFAULT_OUTLINE_COLOR);
    postGroup.add(baseStone);

    const pole = new THREE.Mesh(signPostGeo, stringerMat);
    pole.position.y = 1.02;
    pole.castShadow = true;
    pole.receiveShadow = true;
    addInkOutline(pole, 0.022, DEFAULT_OUTLINE_COLOR);
    postGroup.add(pole);

    const cap = new THREE.Mesh(signCapGeo, postCapMat);
    cap.position.y = 2.22;
    cap.castShadow = true;
    addInkOutline(cap, 0.02, DEFAULT_OUTLINE_COLOR);
    postGroup.add(cap);

    const boardA = new THREE.Mesh(signBoardGeo, plankWarmMat);
    boardA.position.set(0, 1.86, 0);
    boardA.rotation.y = sp.yawA;
    boardA.rotation.z = 0.03;
    boardA.castShadow = true;
    boardA.receiveShadow = true;
    addInkOutline(boardA, 0.02, DEFAULT_OUTLINE_COLOR);
    postGroup.add(boardA);

    const boardB = new THREE.Mesh(signBoardGeo, plankDeepMat);
    boardB.position.set(0, 1.48, 0);
    boardB.rotation.y = sp.yawB;
    boardB.rotation.z = -0.025;
    boardB.castShadow = true;
    boardB.receiveShadow = true;
    addInkOutline(boardB, 0.02, DEFAULT_OUTLINE_COLOR);
    postGroup.add(boardB);

    markersGroup.add(postGroup);

    colliders.push({
      x: sp.x,
      y: groundY,
      z: sp.z,
      radius: 0.36,
      height: 2.3,
      kind: 'signpost',
    });
  }

  // Carved Stone Mile-Markers flanking trail curves
  const mileMarkerCoords: ReadonlyArray<readonly [number, number, number]> = [
    [-7.8, 22.8, 0.45],
    [25.2, -14.2, -0.65],
    [-42.5, -10.8, 1.15],
  ];
  const markerPillarGeo = trackGeo(createChamferedBoxGeometry(0.46, 0.92, 0.34, 0.06));
  const markerPlinthGeo = trackGeo(createChamferedBoxGeometry(0.64, 0.28, 0.52, 0.05));

  for (let i = 0; i < mileMarkerCoords.length; i += 1) {
    const [mx, mz, myaw] = mileMarkerCoords[i];
    const groundY = getTerrainHeight(mx, mz);
    const marker = new THREE.Group();
    marker.name = `stoneMileMarker_${i}`;
    marker.position.set(mx, groundY - 0.08, mz);
    marker.rotation.y = myaw;

    const plinth = new THREE.Mesh(markerPlinthGeo, abutmentStoneMat);
    plinth.position.y = 0.12;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    addInkOutline(plinth, 0.024, DEFAULT_OUTLINE_COLOR);
    marker.add(plinth);

    const stele = new THREE.Mesh(markerPillarGeo, steppingStoneMat);
    stele.position.y = 0.58;
    stele.castShadow = true;
    stele.receiveShadow = true;
    addInkOutline(stele, 0.024, DEFAULT_OUTLINE_COLOR);
    marker.add(stele);

    markersGroup.add(marker);

    colliders.push({
      x: mx,
      y: groundY,
      z: mz,
      radius: 0.42,
      height: 1.05,
      kind: 'mile-marker',
    });
  }

  activeColliders = colliders;

  if (scene) {
    scene.add(group);
  }

  const dispose = (): void => {
    if (group.parent) {
      group.parent.remove(group);
    }
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.isInkOutline) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    for (const g of disposableGeos) {
      g.dispose();
    }
    for (const m of disposableMats) {
      m.dispose();
    }
    if (activeColliders === colliders) {
      activeColliders = [];
    }
  };

  return {
    group,
    bridgeGroup,
    steppingStonesGroup,
    markersGroup,
    bridgeAnchor: anchor,
    steppingStones,
    colliders,
    waterObstacles,
    getWalkHeight: (x: number, z: number) =>
      getStructureWalkHeight(x, z, anchor, steppingStones),
    getColliders: () => colliders,
    dispose,
  };
}
