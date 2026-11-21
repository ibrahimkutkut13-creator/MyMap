import * as THREE from 'three';
import { createAnimeToonMaterial } from './toonMaterials';

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

export const WORLD_SEED = 4219;
export const TERRAIN_SIZE = 300;
export const TERRAIN_HALF_SIZE = TERRAIN_SIZE * 0.5;
export const TERRAIN_SEGMENTS = 220;
export const WATER_LEVEL = -0.35;
export const PATH_HALF_WIDTH = 2.45;

export type TerrainBiome = 'meadow' | 'path' | 'cliff' | 'shore' | 'water';

export interface BridgeAnchor {
  position: THREE.Vector3;
  rotationY: number;
  span: number;
  width: number;
  bankHeight: number;
  archHeight: number;
  westEnd: THREE.Vector3;
  eastEnd: THREE.Vector3;
}

export interface FordCrossing {
  center: THREE.Vector3;
  westBank: THREE.Vector3;
  eastBank: THREE.Vector3;
  direction: THREE.Vector2;
  span: number;
}

export interface TerrainController {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  readonly geometry: THREE.PlaneGeometry;
  readonly material: THREE.MeshToonMaterial;
  readonly size: number;
  readonly segments: number;
  readonly waterLevel: number;
  getHeight: (x: number, z: number) => number;
  getNormal: (x: number, z: number, target?: THREE.Vector3) => THREE.Vector3;
  getSlope: (x: number, z: number) => number;
  getBiomeAt: (x: number, z: number) => TerrainBiome;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Deterministic Seeded PRNG & 2D Simplex Noise
// ---------------------------------------------------------------------------

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0, 1],
  [0, -1],
];

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

export class SeededSimplex2D {
  private readonly perm = new Uint8Array(512);
  private readonly permMod12 = new Uint8Array(512);

  constructor(seed: number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) {
      p[i] = i;
    }
    const rand = createSeededRandom(seed);
    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i += 1) {
      const v = p[i & 255];
      this.perm[i] = v;
      this.permMod12[i] = v % 12;
    }
  }

  public noise2D(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = this.permMod12[ii + this.perm[jj]];
      t0 *= t0;
      n0 = t0 * t0 * (GRAD2[gi0][0] * x0 + GRAD2[gi0][1] * y0);
    }

    let n1 = 0;
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
      t1 *= t1;
      n1 = t1 * t1 * (GRAD2[gi1][0] * x1 + GRAD2[gi1][1] * y1);
    }

    let n2 = 0;
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
      t2 *= t2;
      n2 = t2 * t2 * (GRAD2[gi2][0] * x2 + GRAD2[gi2][1] * y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }

  public fbm(
    x: number,
    y: number,
    octaves = 4,
    lacunarity = 2.05,
    gain = 0.48,
  ): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      sum += this.noise2D(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }
}

const primaryNoise = new SeededSimplex2D(WORLD_SEED);
const detailNoise = new SeededSimplex2D(WORLD_SEED + 7919);

// ---------------------------------------------------------------------------
// Math & Shaping Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Stylized terrace-shaping function producing clean stepped plateaus
 * and readable flat ledges (inspired by Genshin / Valorant cliffs).
 */
export function terrace(
  h: number,
  stepHeight = 3.8,
  sharpness = 5.2,
): number {
  const scaled = h / stepHeight;
  const base = Math.floor(scaled);
  const frac = scaled - base;
  const halfBand = 0.5 / Math.max(1.2, sharpness);
  const stepCurve = smoothstep(0.5 - halfBand, 0.5 + halfBand, frac);
  // Keep 16% gentle natural slope + 84% crisp stepped shelf
  return (base + frac * 0.16 + stepCurve * 0.84) * stepHeight;
}

// ---------------------------------------------------------------------------
// Valley Landmarks, River Channel & Path Topology
// ---------------------------------------------------------------------------

const SPAWN_POS = new THREE.Vector2(-20, 20);
const RUINS_POS = new THREE.Vector3(46, 11.0, -34);
const OVERLOOK_POS = new THREE.Vector3(-54, 16.0, -26);

const BRIDGE_Z = 6.0;
const BRIDGE_SPAN = 15.8;
const BRIDGE_WIDTH = 3.9;
const BRIDGE_BANK_HEIGHT = 0.92;
const BRIDGE_ARCH_HEIGHT = 1.48;

const POND_CENTER_Z = -20.0;
const FORD_CENTER_Z = 27.5;

/**
 * Sinuous river centerline X as a smooth deterministic function of Z.
 */
export function getRiverCenterX(z: number): number {
  return (
    16.0 * Math.sin(z * 0.024 + 0.35) +
    6.5 * Math.sin(z * 0.058 - 0.9) -
    2.0
  );
}

/**
 * Derivative d(riverCenterX)/dz used for perpendicular river distance & bridge alignment.
 */
export function getRiverSlopeX(z: number): number {
  return (
    16.0 * 0.024 * Math.cos(z * 0.024 + 0.35) +
    6.5 * 0.058 * Math.cos(z * 0.058 - 0.9)
  );
}

/**
 * River channel half-width at coordinate Z, widening into a tranquil pond in mid-valley.
 */
export function getRiverHalfWidth(z: number): number {
  const natural = 5.6 + 0.85 * Math.sin(z * 0.047 + 1.1);
  const pondBulge = 9.4 * Math.exp(-Math.pow((z - POND_CENTER_Z) / 15.5, 2));
  const bridgePinch = -0.85 * Math.exp(-Math.pow((z - BRIDGE_Z) / 8.5, 2));
  const fordWidth = 0.45 * Math.exp(-Math.pow((z - FORD_CENTER_Z) / 7.5, 2));
  return Math.max(4.4, natural + pondBulge + bridgePinch + fordWidth);
}

const POND_CENTER_X = getRiverCenterX(POND_CENTER_Z) - 1.5;

/**
 * Signed distance from (x, z) to the river/pond waterline.
 * Negative values are inside the water channel; positive values are on land.
 */
export function getRiverSignedDistance(x: number, z: number): number {
  const cx = getRiverCenterX(z);
  const slope = getRiverSlopeX(z);
  const perpDist = Math.abs(x - cx) / Math.hypot(1, slope);
  const riverSdf = perpDist - getRiverHalfWidth(z);

  // Smoothly blend a tranquil circular-elliptical pond basin around mid-valley
  const pdx = (x - POND_CENTER_X) / 15.8;
  const pdz = (z - POND_CENTER_Z) / 17.5;
  const pondSdf = (Math.hypot(pdx, pdz) - 1.0) * 16.0;

  // Polynomial smooth minimum for an organic riverbank-to-pond shoreline
  const k = 4.5;
  const h = clamp01(0.5 + (0.5 * (pondSdf - riverSdf)) / k);
  return lerp(pondSdf, riverSdf, h) - k * h * (1.0 - h);
}

// Compute canonical Bridge Anchor perpendicular to river at BRIDGE_Z
const BRIDGE_CENTER_X = getRiverCenterX(BRIDGE_Z);
const BRIDGE_RIVER_SLOPE = getRiverSlopeX(BRIDGE_Z);
const BRIDGE_INV_LEN = 1 / Math.hypot(1, BRIDGE_RIVER_SLOPE);
// Unit vector pointing across river from West bank to East bank
const BRIDGE_DIR_X = BRIDGE_INV_LEN;
const BRIDGE_DIR_Z = -BRIDGE_RIVER_SLOPE * BRIDGE_INV_LEN;
const BRIDGE_ROTATION_Y = Math.atan2(-BRIDGE_DIR_Z, BRIDGE_DIR_X);

const BRIDGE_WEST_END = new THREE.Vector2(
  BRIDGE_CENTER_X - BRIDGE_DIR_X * (BRIDGE_SPAN * 0.5),
  BRIDGE_Z - BRIDGE_DIR_Z * (BRIDGE_SPAN * 0.5),
);
const BRIDGE_EAST_END = new THREE.Vector2(
  BRIDGE_CENTER_X + BRIDGE_DIR_X * (BRIDGE_SPAN * 0.5),
  BRIDGE_Z + BRIDGE_DIR_Z * (BRIDGE_SPAN * 0.5),
);

// Compute canonical shallow Stepping-Stone Ford crossing south of the bridge
const FORD_CENTER_X = getRiverCenterX(FORD_CENTER_Z);
const FORD_SLOPE = getRiverSlopeX(FORD_CENTER_Z);
const FORD_INV_LEN = 1 / Math.hypot(1, FORD_SLOPE);
const FORD_DIR_X = FORD_INV_LEN;
const FORD_DIR_Z = -FORD_SLOPE * FORD_INV_LEN;
const FORD_HALF_SPAN = getRiverHalfWidth(FORD_CENTER_Z) + 1.1;

const FORD_WEST_BANK = new THREE.Vector2(
  FORD_CENTER_X - FORD_DIR_X * FORD_HALF_SPAN,
  FORD_CENTER_Z - FORD_DIR_Z * FORD_HALF_SPAN,
);
const FORD_EAST_BANK = new THREE.Vector2(
  FORD_CENTER_X + FORD_DIR_X * FORD_HALF_SPAN,
  FORD_CENTER_Z + FORD_DIR_Z * FORD_HALF_SPAN,
);

// ---------------------------------------------------------------------------
// Precomputed Winding Footpath Polylines
// ---------------------------------------------------------------------------

interface PathSegment2D {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  abx: number;
  abz: number;
  lenSq: number;
}

function sampleSplineToSegments(
  controlPoints: ReadonlyArray<readonly [number, number]>,
  divisions: number,
): PathSegment2D[] {
  const curve = new THREE.CatmullRomCurve3(
    controlPoints.map(([px, pz]) => new THREE.Vector3(px, 0, pz)),
    false,
    'centripetal',
    0.5,
  );
  const pts = curve.getPoints(divisions);
  const segs: PathSegment2D[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    if (lenSq > 1e-6) {
      segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, abx, abz, lenSq });
    }
  }
  return segs;
}

// 1. Main Valley Trail: South-West Meadow -> Spawn -> West Bank -> Bridge -> East Bank -> Ruins Plaza
const MAIN_TRAIL_SEGMENTS = sampleSplineToSegments(
  [
    [-30, 32],
    [SPAWN_POS.x, SPAWN_POS.y],
    [-11.5, 14.8],
    [BRIDGE_WEST_END.x - BRIDGE_DIR_X * 1.4, BRIDGE_WEST_END.y - BRIDGE_DIR_Z * 1.4],
    [BRIDGE_WEST_END.x, BRIDGE_WEST_END.y],
    [BRIDGE_CENTER_X, BRIDGE_Z],
    [BRIDGE_EAST_END.x, BRIDGE_EAST_END.y],
    [BRIDGE_EAST_END.x + BRIDGE_DIR_X * 2.2, BRIDGE_EAST_END.y + BRIDGE_DIR_Z * 2.2],
    [18.5, -4.5],
    [27.5, -12.5],
    [35.5, -21.5],
    [41.5, -29.0],
  ],
  72,
);

// 2. Scenic Overlook Spur: Spawn Meadow -> NW Winding Ascent -> Overlook Crest
const OVERLOOK_TRAIL_SEGMENTS = sampleSplineToSegments(
  [
    [SPAWN_POS.x, SPAWN_POS.y],
    [-27.5, 13.5],
    [-34.5, 4.5],
    [-40.5, -6.5],
    [-46.5, -16.5],
    [-51.5, -23.5],
  ],
  44,
);

// 3. Stepping-Stone Ford Loop: Spawn Meadow -> Southern Ford -> East Meadow -> Joins Main Trail
const FORD_TRAIL_SEGMENTS = sampleSplineToSegments(
  [
    [SPAWN_POS.x, SPAWN_POS.y],
    [-9.5, 24.5],
    [2.5, 27.8],
    [FORD_WEST_BANK.x, FORD_WEST_BANK.y],
    [FORD_CENTER_X, FORD_CENTER_Z],
    [FORD_EAST_BANK.x, FORD_EAST_BANK.y],
    [30.5, 22.0],
    [32.5, 9.5],
    [24.5, -2.5],
    [18.5, -4.5],
  ],
  56,
);

const ALL_PATH_SEGMENTS: readonly PathSegment2D[] = [
  ...MAIN_TRAIL_SEGMENTS,
  ...OVERLOOK_TRAIL_SEGMENTS,
  ...FORD_TRAIL_SEGMENTS,
];

function distanceToSegments(
  x: number,
  z: number,
  segments: readonly PathSegment2D[],
): number {
  let minDistSq = Infinity;
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    const apx = x - s.ax;
    const apz = z - s.az;
    const t = clamp01((apx * s.abx + apz * s.abz) / s.lenSq);
    const dx = apx - s.abx * t;
    const dz = apz - s.abz * t;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
    }
  }
  return Math.sqrt(minDistSq);
}

/**
 * Returns the shortest 2D distance from (x, z) to any valley footpath centerline.
 */
export function getPathDistance(x: number, z: number): number {
  return distanceToSegments(x, z, ALL_PATH_SEGMENTS);
}

// ---------------------------------------------------------------------------
// Master Terrain Elevation Function
// ---------------------------------------------------------------------------

/**
 * Deterministic elevation query shared across terrain mesh generation,
 * water depth baking, rock grounding, bridges, foliage, and character movement.
 */
export function getTerrainHeight(x: number, z: number): number {
  const radialDist = Math.hypot(x, z);

  // 1. Gentle rolling meadow base across the playable valley
  const macroNoise = primaryNoise.fbm(x * 0.0095, z * 0.0095, 3, 2.0, 0.5);
  const midNoise = primaryNoise.fbm(x * 0.023 + 11.4, z * 0.023 - 7.2, 3, 2.05, 0.45);
  const fineNoise = detailNoise.noise2D(x * 0.055, z * 0.055);

  let h = 1.55 + macroNoise * 2.1 + midNoise * 0.85 + fineNoise * 0.18;

  // 2. Natural valley rim & bold terraced focal ridges rising cleanly around the perimeter
  const rimFactor = smoothstep(56, 134, radialDist);
  const ridgeMod =
    0.6 +
    0.4 *
      (primaryNoise.fbm(x * 0.013 - 4.1, z * 0.013 + 3.7, 3) * 0.5 + 0.5);
  const northRidgeBias = smoothstep(20, -110, z) * 5.2;
  const rawRimHeight = rimFactor * (18.0 * ridgeMod + northRidgeBias);

  // Use bold 5.4-unit terrace shelves with 2.4-sharpness risers spanning 2.5+ grid cells
  // so diagonal cliff bands stay razor-clean with zero triangulation sawtooth.
  const rawCombined = h + rawRimHeight;
  const terraceBlend = smoothstep(4.2, 8.6, rawCombined);
  const terracedHeight = terrace(rawCombined, 5.4, 2.5);
  h = lerp(rawCombined, terracedHeight, terraceBlend * 0.86);

  // 3. Dedicated Landmark Plateaus (flat walkable crowns + organic terraced mesa shoulders)
  const mesaWarp = primaryNoise.noise2D(x * 0.045 + 6.3, z * 0.045 - 3.9) * 3.8;

  // 3a. Ancient Ruins Hilltop Plaza (NE focal landmark, y = 11.0)
  const ruinsRawDist = Math.hypot(x - RUINS_POS.x, z - RUINS_POS.z);
  const ruinsDist = ruinsRawDist + mesaWarp * smoothstep(10.5, 19.0, ruinsRawDist);
  if (ruinsRawDist < 38) {
    const ruinsPlateau = 1.0 - smoothstep(11.5, 32.0, ruinsDist);
    const shoulderRaw = lerp(h, RUINS_POS.y, ruinsPlateau);
    // Subtle organic mesa step on the flank, smoothly flattened on the summit crown
    const shoulderTerraced = lerp(
      shoulderRaw,
      terrace(shoulderRaw, 4.4, 2.3),
      smoothstep(3.0, 6.0, shoulderRaw) * 0.45,
    );
    const flatCrown = 1.0 - smoothstep(10.5, 14.5, ruinsRawDist);
    h = lerp(shoulderTerraced, RUINS_POS.y, flatCrown);
  }

  // 3b. Scenic Overlook Hill Crest (NW highest ridge, y = 16.0)
  const overlookRawDist = Math.hypot(x - OVERLOOK_POS.x, z - OVERLOOK_POS.z);
  const overlookDist =
    overlookRawDist + mesaWarp * smoothstep(8.0, 18.0, overlookRawDist);
  if (overlookRawDist < 38) {
    const overlookBlend = 1.0 - smoothstep(8.2, 31.5, overlookDist);
    const shoulderRaw = lerp(h, OVERLOOK_POS.y, overlookBlend);
    const shoulderTerraced = lerp(
      shoulderRaw,
      terrace(shoulderRaw, 5.0, 2.4),
      smoothstep(4.0, 8.0, shoulderRaw) * 0.5,
    );
    const flatCrown = 1.0 - smoothstep(7.2, 10.8, overlookRawDist);
    h = lerp(shoulderTerraced, OVERLOOK_POS.y, flatCrown);
  }

  // 3c. Spawn Meadow Clearing (open, gentle flat lawn around (-20, 20))
  const spawnDist = Math.hypot(x - SPAWN_POS.x, z - SPAWN_POS.y);
  if (spawnDist < 18) {
    const spawnFlat = 1.0 - smoothstep(6.5, 17.5, spawnDist);
    h = lerp(h, 1.45, spawnFlat * 0.82);
  }

  // 4. Gently smooth/grade footpath corridors so trails climb smoothly without jagged steps
  const pathDist = getPathDistance(x, z);
  if (pathDist < 8.5) {
    const pathBlend = 1.0 - smoothstep(PATH_HALF_WIDTH + 0.6, 8.5, pathDist);
    let smoothTarget = 1.45 + macroNoise * 1.4 + midNoise * 0.45;
    if (ruinsRawDist < 38) {
      smoothTarget = lerp(
        smoothTarget,
        RUINS_POS.y,
        1.0 - smoothstep(10.5, 36.0, ruinsRawDist),
      );
    }
    if (overlookRawDist < 42) {
      smoothTarget = lerp(
        smoothTarget,
        OVERLOOK_POS.y,
        1.0 - smoothstep(7.5, 40.0, overlookRawDist),
      );
    }
    h = lerp(h, smoothTarget, pathBlend * 0.62);
  }

  // 5. Carve sinuous river channel & tranquil mid-valley pond below WATER_LEVEL
  const riverSdf = getRiverSignedDistance(x, z);
  if (riverSdf < 11.5) {
    // Bank ramp from dry meadow (riverSdf = +11.5) down to waterline (riverSdf = 0) and riverbed (riverSdf < 0)
    const valleyCarve = 1.0 - smoothstep(-1.2, 11.5, riverSdf);
    const bankElevation = 0.88 + fineNoise * 0.12;
    h = lerp(h, Math.min(h, bankElevation), valleyCarve * 0.85);

    if (riverSdf < 2.2) {
      // Pond depth reaches ~-2.45; typical river bed reaches ~-1.85; ford shallows to ~-0.98
      const pondFactor = Math.exp(-Math.pow((z - POND_CENTER_Z) / 16.0, 2));
      const fordFactor = Math.exp(-Math.pow((z - FORD_CENTER_Z) / 6.2, 2));
      const targetBed = lerp(-1.82, -2.48, pondFactor) + fordFactor * 0.84;

      const channelT = 1.0 - smoothstep(-3.6, 1.9, riverSdf);
      const bedElevation = lerp(WATER_LEVEL + 0.48, targetBed, channelT);
      h = Math.min(h, bedElevation);
    }
  }

  // 6. Grade both bridge landing approaches flush with BRIDGE_BANK_HEIGHT
  const westBankDist = Math.hypot(x - BRIDGE_WEST_END.x, z - BRIDGE_WEST_END.y);
  if (westBankDist < 6.8) {
    const t = 1.0 - smoothstep(2.0, 6.8, westBankDist);
    // Never fill in the river channel itself (riverSdf < -0.4)
    const dryMask = smoothstep(-0.6, 0.8, riverSdf);
    h = lerp(h, BRIDGE_BANK_HEIGHT, t * dryMask);
  }

  const eastBankDist = Math.hypot(x - BRIDGE_EAST_END.x, z - BRIDGE_EAST_END.y);
  if (eastBankDist < 6.8) {
    const t = 1.0 - smoothstep(2.0, 6.8, eastBankDist);
    const dryMask = smoothstep(-0.6, 0.8, riverSdf);
    h = lerp(h, BRIDGE_BANK_HEIGHT, t * dryMask);
  }

  return h;
}

// ---------------------------------------------------------------------------
// Pure Terrain & Landmark Query API
// ---------------------------------------------------------------------------

/**
 * Computes the unit surface normal at (x, z) via central finite differences.
 */
export function getTerrainNormal(
  x: number,
  z: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const eps = 0.65;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);

  target.set(hL - hR, 2 * eps, hD - hU);
  return target.normalize();
}

const _slopeNormal = new THREE.Vector3();

/**
 * Returns terrain slope in [0, 1] where 0 is completely flat and 1 is vertical
 * (computed as sin(angle) = sqrt(1 - normal.y^2) so steep terraced risers > 25 deg exceed 0.42).
 */
export function getTerrainSlope(x: number, z: number): number {
  getTerrainNormal(x, z, _slopeNormal);
  return Math.sqrt(Math.max(0, 1.0 - _slopeNormal.y * _slopeNormal.y));
}

export function getSpawnPosition(): THREE.Vector3 {
  return new THREE.Vector3(
    SPAWN_POS.x,
    getTerrainHeight(SPAWN_POS.x, SPAWN_POS.y),
    SPAWN_POS.y,
  );
}

export function getRuinsCenter(): THREE.Vector3 {
  return new THREE.Vector3(
    RUINS_POS.x,
    getTerrainHeight(RUINS_POS.x, RUINS_POS.z),
    RUINS_POS.z,
  );
}

export function getOverlookCenter(): THREE.Vector3 {
  return new THREE.Vector3(
    OVERLOOK_POS.x,
    getTerrainHeight(OVERLOOK_POS.x, OVERLOOK_POS.z),
    OVERLOOK_POS.z,
  );
}

export function getPondCenter(): THREE.Vector3 {
  return new THREE.Vector3(POND_CENTER_X, WATER_LEVEL, POND_CENTER_Z);
}

export function getBridgeAnchor(): BridgeAnchor {
  return {
    position: new THREE.Vector3(BRIDGE_CENTER_X, BRIDGE_BANK_HEIGHT, BRIDGE_Z),
    rotationY: BRIDGE_ROTATION_Y,
    span: BRIDGE_SPAN,
    width: BRIDGE_WIDTH,
    bankHeight: BRIDGE_BANK_HEIGHT,
    archHeight: BRIDGE_ARCH_HEIGHT,
    westEnd: new THREE.Vector3(
      BRIDGE_WEST_END.x,
      BRIDGE_BANK_HEIGHT,
      BRIDGE_WEST_END.y,
    ),
    eastEnd: new THREE.Vector3(
      BRIDGE_EAST_END.x,
      BRIDGE_BANK_HEIGHT,
      BRIDGE_EAST_END.y,
    ),
  };
}

export function getFordCrossing(): FordCrossing {
  return {
    center: new THREE.Vector3(FORD_CENTER_X, WATER_LEVEL, FORD_CENTER_Z),
    westBank: new THREE.Vector3(
      FORD_WEST_BANK.x,
      getTerrainHeight(FORD_WEST_BANK.x, FORD_WEST_BANK.y),
      FORD_WEST_BANK.y,
    ),
    eastBank: new THREE.Vector3(
      FORD_EAST_BANK.x,
      getTerrainHeight(FORD_EAST_BANK.x, FORD_EAST_BANK.y),
      FORD_EAST_BANK.y,
    ),
    direction: new THREE.Vector2(FORD_DIR_X, FORD_DIR_Z),
    span: FORD_HALF_SPAN * 2,
  };
}

// ---------------------------------------------------------------------------
// Task 07: Stylized Biome Vertex Colors & Surface Classifier
// ---------------------------------------------------------------------------

export const BIOME_COLORS = {
  meadowBase: '#6ccb5f',
  meadowSunlit: '#84dc68',
  meadowHollow: '#52b150',
  pathDirt: '#e6c29f',
  shoreSand: '#ebd0ad',
  riverbedTeal: '#4e7d8a',
  cliffSlate: '#7b8cde',
  cliffCrevice: '#6170bf',
} as const;

const COL_MEADOW_BASE = new THREE.Color(BIOME_COLORS.meadowBase);
const COL_MEADOW_SUNLIT = new THREE.Color(BIOME_COLORS.meadowSunlit);
const COL_MEADOW_HOLLOW = new THREE.Color(BIOME_COLORS.meadowHollow);
const COL_PATH_DIRT = new THREE.Color(BIOME_COLORS.pathDirt);
const COL_SHORE_SAND = new THREE.Color(BIOME_COLORS.shoreSand);
const COL_RIVERBED_TEAL = new THREE.Color(BIOME_COLORS.riverbedTeal);
const COL_CLIFF_SLATE = new THREE.Color(BIOME_COLORS.cliffSlate);
const COL_CLIFF_CREVICE = new THREE.Color(BIOME_COLORS.cliffCrevice);

/**
 * Classifies the primary stylized biome at world coordinate (x, z)
 * so foliage, wildflowers, trees, and rocks align strictly with painted surfaces.
 */
export function getTerrainBiomeAt(x: number, z: number): TerrainBiome {
  const height = getTerrainHeight(x, z);
  const riverSdf = getRiverSignedDistance(x, z);

  if (height < WATER_LEVEL - 0.08 || riverSdf < -0.25) {
    return 'water';
  }

  const slope = getTerrainSlope(x, z);
  if (slope > 0.42 && height > 2.2) {
    return 'cliff';
  }

  if (height < WATER_LEVEL + 0.62 && riverSdf < 2.6) {
    return 'shore';
  }

  const pathDist = getPathDistance(x, z);
  if (pathDist < PATH_HALF_WIDTH) {
    return 'path';
  }

  return 'meadow';
}

/**
 * Computes the stylized anime linear-space vertex color at (x, z) using tight
 * painterly smoothstep transitions across meadow, path, riverbank shore, and cliff.
 */
export function evaluateBiomeColorAt(
  x: number,
  z: number,
  height: number,
  slope: number,
  target = new THREE.Color(),
): THREE.Color {
  // 1. Vibrant meadow green with painterly low-frequency patch modulation
  const patchNoise = primaryNoise.noise2D(x * 0.028 + 3.1, z * 0.028 - 2.4);
  const elevSunlit = smoothstep(3.0, 12.0, height) * 0.45;
  const sunlitWeight = smoothstep(0.12, 0.58, patchNoise * 0.6 + elevSunlit);
  const hollowWeight =
    smoothstep(-0.18, -0.62, patchNoise) * (1.0 - smoothstep(2.0, 6.0, height));

  target.copy(COL_MEADOW_BASE);
  target.lerp(COL_MEADOW_SUNLIT, sunlitWeight * 0.65);
  target.lerp(COL_MEADOW_HOLLOW, hollowWeight * 0.55);

  // 2. Winding sandy dirt footpath (tight crisp brushstroke transition)
  const pathEdgeJitter = detailNoise.noise2D(x * 0.14, z * 0.14) * 0.24;
  const pathDist = getPathDistance(x, z) + pathEdgeJitter;
  const pathMask =
    1.0 - smoothstep(PATH_HALF_WIDTH - 0.34, PATH_HALF_WIDTH + 0.32, pathDist);
  if (pathMask > 0.001) {
    target.lerp(COL_PATH_DIRT, pathMask);
  }

  // 3. Riverbanks, sandy shore & underwater pebble-teal riverbed
  const riverSdf = getRiverSignedDistance(x, z);
  const nearWaterMask = 1.0 - smoothstep(1.2, 4.2, riverSdf);
  const shoreElevMask =
    1.0 - smoothstep(WATER_LEVEL + 0.32, WATER_LEVEL + 0.85, height);
  const shoreMask = clamp01(nearWaterMask * shoreElevMask);
  if (shoreMask > 0.001) {
    target.lerp(COL_SHORE_SAND, shoreMask);
  }

  const underwaterMask =
    1.0 - smoothstep(WATER_LEVEL - 0.95, WATER_LEVEL - 0.12, height);
  if (underwaterMask > 0.001) {
    target.lerp(COL_RIVERBED_TEAL, underwaterMask);
  }

  // 4. Cool slate terraced cliff faces & indigo crevice shading on elevated steep walls (slope > 0.42)
  // Gated above low riverbanks (height > 2.0) so sandy banks stay warm and clean without slate wedges.
  const cliffElevMask = smoothstep(1.85, 3.2, height);
  const cliffMask = smoothstep(0.36, 0.49, slope) * cliffElevMask;
  if (cliffMask > 0.001) {
    const creviceMask = smoothstep(0.58, 0.80, slope);
    const cliffR = lerp(COL_CLIFF_SLATE.r, COL_CLIFF_CREVICE.r, creviceMask * 0.72);
    const cliffG = lerp(COL_CLIFF_SLATE.g, COL_CLIFF_CREVICE.g, creviceMask * 0.72);
    const cliffB = lerp(COL_CLIFF_SLATE.b, COL_CLIFF_CREVICE.b, creviceMask * 0.72);
    target.r = lerp(target.r, cliffR, cliffMask);
    target.g = lerp(target.g, cliffG, cliffMask);
    target.b = lerp(target.b, cliffB, cliffMask);
  }

  return target;
}

/**
 * Paints stylized anime biome vertex colors onto a displaced terrain PlaneGeometry.
 */
export function applyBiomeVertexColors(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const posAttr = geometry.getAttribute('position');
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  const tempColor = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    // Use analytical finite-difference slope (diagonal-bias free) so terrace rims never sawtooth
    const slope = getTerrainSlope(vx, vz);

    evaluateBiomeColorAt(vx, vz, vy, slope, tempColor);
    colors[i * 3] = tempColor.r;
    colors[i * 3 + 1] = tempColor.g;
    colors[i * 3 + 2] = tempColor.b;
  }

  const colorAttr = new THREE.BufferAttribute(colors, 3);
  geometry.setAttribute('color', colorAttr);
  return colorAttr;
}

// ---------------------------------------------------------------------------
// Terrain Mesh Factory
// ---------------------------------------------------------------------------

/**
 * Generates the 300x300 stylized valley mesh with rolling meadows, terraced cliffs,
 * carved river basin, flat landmark plateaus, and sharp anime biome vertex colors.
 */
export function createTerrain(scene?: THREE.Scene): TerrainController {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  );
  geometry.rotateX(-Math.PI / 2);

  const posAttr = geometry.getAttribute('position');
  for (let i = 0; i < posAttr.count; i += 1) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, getTerrainHeight(x, z));
  }
  posAttr.needsUpdate = true;

  geometry.computeVertexNormals();
  applyBiomeVertexColors(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = createAnimeToonMaterial('#ffffff', {
    steps: 3,
    vertexColors: true,
    shadowTint: '#9c86a8',
    shadowTintStrength: 0.36,
    rimColor: '#fff6db',
    rimPower: 3.4,
    rimIntensity: 0.08,
    rimSmoothness: 0.16,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'stylizedValleyTerrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  if (scene) {
    scene.add(mesh);
  }

  return {
    mesh,
    geometry,
    material,
    size: TERRAIN_SIZE,
    segments: TERRAIN_SEGMENTS,
    waterLevel: WATER_LEVEL,
    getHeight: getTerrainHeight,
    getNormal: getTerrainNormal,
    getSlope: getTerrainSlope,
    getBiomeAt: getTerrainBiomeAt,
    dispose: () => {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
      geometry.dispose();
      material.dispose();
    },
  };
}
