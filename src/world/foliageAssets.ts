import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RockCollider } from './rocks';
import {
  PATH_HALF_WIDTH,
  SeededSimplex2D,
  TERRAIN_HALF_SIZE,
  WORLD_SEED,
  createSeededRandom,
  getBridgeAnchor,
  getFordCrossing,
  getOverlookCenter,
  getPathDistance,
  getPondCenter,
  getRiverSignedDistance,
  getRuinsCenter,
  getSpawnPosition,
  getTerrainBiomeAt,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainSlope,
} from './terrain';
import { createStylizedAAFoliageMaterial, isStylizedAACutoutMaterial } from './stylizedAAShader';
import { convertMaterialToAnimeToon } from './toonMaterials';

// ---------------------------------------------------------------------------
// Asset Catalog & Loader Configuration
// ---------------------------------------------------------------------------

export const STYLIZED_ASSET_BASE_URL =
  'https://raw.githubusercontent.com/ibrahimkutkut13-creator/stylizedassets/main/';

export const DRACO_DECODER_PATH =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export type FoliageCategory = 'tree' | 'bush' | 'grass' | 'flower';

export interface FoliageModelSpec {
  readonly id: string;
  readonly filename: string;
  readonly url: string;
  readonly category: FoliageCategory;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly targetHeight: number;
  readonly sinkDepth: number;
  readonly shadowTint: string;
  readonly rimIntensity: number;
}

export const TREE_MODEL_FILES = [
  'BirchTree_1.glb',
  'BirchTree_2.glb',
  'BirchTree_3.glb',
  'MapleTree_1.glb',
  'MapleTree_2.glb',
  'MapleTree_3.glb',
] as const;

export const BUSH_MODEL_FILES = [
  'Bush.glb',
  'Bush_Flowers.glb',
  'Bush_Large.glb',
  'Bush_Large_Flowers.glb',
  'Bush_Small.glb',
  'Bush_Small_Flowers.glb',
] as const;

export const GRASS_MODEL_FILES = ['Grass_Large.glb', 'Grass_Small.glb'] as const;

export const FLOWER_MODEL_FILES = [
  'Flower_1_Clump.glb',
  'Flower_2_Clump.glb',
  'Flower_3_Clump.glb',
] as const;

function makeSpec(
  filename: string,
  category: FoliageCategory,
  targetHeight: number,
  sinkDepth: number,
  shadowTint: string,
  rimIntensity: number,
): FoliageModelSpec {
  const shadowsEnabled = category === 'tree' || category === 'bush';
  return {
    id: filename.replace(/\.glb$/i, ''),
    filename,
    url: `${STYLIZED_ASSET_BASE_URL}${filename}`,
    category,
    castShadow: shadowsEnabled,
    receiveShadow: shadowsEnabled,
    targetHeight,
    sinkDepth,
    shadowTint,
    rimIntensity,
  };
}

export const FOLIAGE_MODEL_CATALOG: readonly FoliageModelSpec[] = [
  // Trees (6) — cast & receive shadows
  makeSpec('BirchTree_1.glb', 'tree', 9.4, 0.22, '#7da362', 0.16),
  makeSpec('BirchTree_2.glb', 'tree', 8.8, 0.22, '#7da362', 0.16),
  makeSpec('BirchTree_3.glb', 'tree', 10.0, 0.24, '#7da362', 0.16),
  makeSpec('MapleTree_1.glb', 'tree', 9.0, 0.22, '#b96d54', 0.15),
  makeSpec('MapleTree_2.glb', 'tree', 8.4, 0.22, '#b96d54', 0.15),
  makeSpec('MapleTree_3.glb', 'tree', 9.7, 0.24, '#b96d54', 0.15),

  // Bushes & Foliage (6) — cast & receive shadows
  makeSpec('Bush.glb', 'bush', 1.65, 0.14, '#789d5e', 0.16),
  makeSpec('Bush_Flowers.glb', 'bush', 1.68, 0.14, '#82a266', 0.17),
  makeSpec('Bush_Large.glb', 'bush', 2.25, 0.18, '#759a5c', 0.16),
  makeSpec('Bush_Large_Flowers.glb', 'bush', 2.28, 0.18, '#80a165', 0.17),
  makeSpec('Bush_Small.glb', 'bush', 1.18, 0.1, '#7da162', 0.16),
  makeSpec('Bush_Small_Flowers.glb', 'bush', 1.2, 0.1, '#85a66a', 0.17),

  // Grass & Flowers (5) — castShadow & receiveShadow explicitly disabled
  makeSpec('Grass_Large.glb', 'grass', 0.92, 0.06, '#7fa460', 0.14),
  makeSpec('Grass_Small.glb', 'grass', 0.62, 0.05, '#84a864', 0.14),
  makeSpec('Flower_1_Clump.glb', 'flower', 0.64, 0.04, '#8ca46a', 0.18),
  makeSpec('Flower_2_Clump.glb', 'flower', 0.66, 0.04, '#8ca46a', 0.18),
  makeSpec('Flower_3_Clump.glb', 'flower', 0.62, 0.04, '#8ca46a', 0.18),
];

export const FOLIAGE_MODEL_BY_ID: Readonly<Record<string, FoliageModelSpec>> =
  Object.fromEntries(FOLIAGE_MODEL_CATALOG.map((spec) => [spec.id, spec]));

// ---------------------------------------------------------------------------
// Placement & Collider Types
// ---------------------------------------------------------------------------

export interface FoliagePlacement {
  readonly modelId: string;
  readonly category: FoliageCategory;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly tiltX: number;
  readonly tiltZ: number;
  readonly scale: number;
}

export interface TreeCollider {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
  readonly modelId: string;
}

export interface FoliagePlacementPlan {
  readonly placementsByModel: Readonly<Record<string, readonly FoliagePlacement[]>>;
  readonly treePlacements: readonly FoliagePlacement[];
  readonly bushPlacements: readonly FoliagePlacement[];
  readonly grassPlacements: readonly FoliagePlacement[];
  readonly flowerPlacements: readonly FoliagePlacement[];
  readonly treeColliders: readonly TreeCollider[];
  readonly totalInstances: number;
}

export interface FoliageLoadStats {
  readonly totalModels: number;
  readonly loadedModels: number;
  readonly failedModels: readonly string[];
  readonly instancedMeshCount: number;
  readonly totalInstances: number;
  readonly categoryInstances: Readonly<Record<FoliageCategory, number>>;
}

export interface CreateEnvironmentFoliageOptions {
  readonly rockColliders?: readonly RockCollider[];
  readonly seed?: number;
  readonly onLoaded?: (stats: FoliageLoadStats) => void;
}

export interface EnvironmentFoliageController {
  readonly group: THREE.Group;
  readonly plan: FoliagePlacementPlan;
  readonly treeColliders: readonly TreeCollider[];
  readonly readyPromise: Promise<FoliageLoadStats>;
  getStats: () => FoliageLoadStats;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Pure Geometry & Scale Helpers
// ---------------------------------------------------------------------------

/**
 * Computes a uniform scale multiplier to normalize a loaded GLB's raw height
 * into Azure Vale's world scale while guarding against degenerate/tiny bounds.
 */
export function computeNormalizedModelScale(
  rawHeight: number,
  targetHeight: number,
): number {
  if (!Number.isFinite(rawHeight) || rawHeight <= 1e-4) {
    return 1;
  }
  return targetHeight / rawHeight;
}

function pointToSegmentDistSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 1e-6) {
    return (px - ax) ** 2 + (pz - az) ** 2;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return (px - cx) ** 2 + (pz - cz) ** 2;
}

function isNearRock(
  x: number,
  z: number,
  rocks: readonly RockCollider[],
  extraMargin: number,
): boolean {
  for (let i = 0; i < rocks.length; i += 1) {
    const r = rocks[i];
    const minDist = r.radius + extraMargin;
    const dx = x - r.x;
    const dz = z - r.z;
    if (dx * dx + dz * dz < minDist * minDist) {
      return true;
    }
  }
  return false;
}

function computeTerrainTilt(
  x: number,
  z: number,
  strength: number,
  normalScratch: THREE.Vector3,
): { tiltX: number; tiltZ: number } {
  getTerrainNormal(x, z, normalScratch);
  const tiltX = THREE.MathUtils.clamp(normalScratch.z * strength, -0.26, 0.26);
  const tiltZ = THREE.MathUtils.clamp(-normalScratch.x * strength, -0.26, 0.26);
  return { tiltX, tiltZ };
}

// ---------------------------------------------------------------------------
// Deterministic Valley Foliage Placement (Pure — Unit-Testable Without WebGL)
// ---------------------------------------------------------------------------

/**
 * Generates deterministic, biome-aware placements across the 300x300 Azure Vale
 * valley for all 17 stylized `.glb` foliage models while keeping footpaths,
 * river/pond, bridge approaches, ford crossing, landmarks, and hero camera
 * sightlines cleanly unobstructed.
 */
export function generateFoliagePlacements(
  rockColliders: readonly RockCollider[] = [],
  seed: number = WORLD_SEED + 733,
): FoliagePlacementPlan {
  const rand = createSeededRandom(seed);
  const groveNoise = new SeededSimplex2D(seed + 17);
  const grassNoise = new SeededSimplex2D(seed + 53);
  const flowerNoise = new SeededSimplex2D(seed + 109);
  const normalScratch = new THREE.Vector3();

  const bridge = getBridgeAnchor();
  const ford = getFordCrossing();
  const pond = getPondCenter();
  const ruins = getRuinsCenter();
  const overlook = getOverlookCenter();
  const spawn = getSpawnPosition();

  // Hero establishing camera & sightline segment to bridge so foreground trees frame rather than block
  const heroCamX = spawn.x - 6.5;
  const heroCamZ = spawn.z + 10.5;

  const placementsByModel: Record<string, FoliagePlacement[]> = {};
  for (const spec of FOLIAGE_MODEL_CATALOG) {
    placementsByModel[spec.id] = [];
  }

  const treePlacements: FoliagePlacement[] = [];
  const bushPlacements: FoliagePlacement[] = [];
  const grassPlacements: FoliagePlacement[] = [];
  const flowerPlacements: FoliagePlacement[] = [];
  const treeColliders: TreeCollider[] = [];

  const treeIds = TREE_MODEL_FILES.map((f) => f.replace(/\.glb$/i, ''));
  const birchIds = treeIds.slice(0, 3);
  const mapleIds = treeIds.slice(3, 6);
  const bushIds = BUSH_MODEL_FILES.map((f) => f.replace(/\.glb$/i, ''));
  const flowerBushIds = ['Bush_Flowers', 'Bush_Large_Flowers', 'Bush_Small_Flowers'];
  const leafyBushIds = ['Bush', 'Bush_Large', 'Bush_Small'];
  const flowerIds = FLOWER_MODEL_FILES.map((f) => f.replace(/\.glb$/i, ''));

  const isInsideClearPlaza = (x: number, z: number, pad: number): boolean => {
    // Spawn clearing
    if (Math.hypot(x - spawn.x, z - spawn.y) < 7.5 + pad) return true;
    // Bridge center and both approach ramps
    if (Math.hypot(x - bridge.position.x, z - bridge.position.z) < 9.5 + pad) return true;
    if (Math.hypot(x - bridge.westEnd.x, z - bridge.westEnd.z) < 5.5 + pad) return true;
    if (Math.hypot(x - bridge.eastEnd.x, z - bridge.eastEnd.z) < 5.5 + pad) return true;
    // Stepping-stone ford
    if (Math.hypot(x - ford.center.x, z - ford.center.z) < 7.5 + pad) return true;
    // Ruins plateau plaza
    if (Math.hypot(x - ruins.x, z - ruins.z) < 12.5 + pad) return true;
    // Overlook hilltop pad
    if (Math.hypot(x - overlook.x, z - overlook.z) < 6.5 + pad) return true;
    return false;
  };

  // -------------------------------------------------------------------------
  // 1. Trees (~114 Birch & Maple trees framing the valley, meadows, and hills)
  // -------------------------------------------------------------------------
  const treeBound = TERRAIN_HALF_SIZE - 26;
  const targetTreeCount = 114;

  // Curated hero framing groves so both the establishing shot and bridge shot have rich silhouettes
  const curatedTreeSeeds: ReadonlyArray<{ x: number; z: number; preferMaple?: boolean }> = [
    // Left & right foreground meadow framing (clear of lens and sightline)
    { x: -35, z: 16, preferMaple: false },
    { x: -39, z: 4, preferMaple: true },
    { x: -31, z: -5, preferMaple: false },
    { x: -3, z: 26, preferMaple: false },
    // East bank behind the wooden bridge & framing the pond
    { x: 18, z: 14, preferMaple: false },
    { x: 25, z: 4, preferMaple: true },
    { x: 16, z: -12, preferMaple: false },
    { x: 29, z: -18, preferMaple: true },
    { x: 9, z: -28, preferMaple: false },
    // Midground hills flanking the pond and ruins trail
    { x: -14, z: -26, preferMaple: true },
    { x: -24, z: -16, preferMaple: false },
    { x: 28, z: -38, preferMaple: false },
    { x: 16, z: -46, preferMaple: true },
    { x: -42, z: -28, preferMaple: false },
    { x: 42, z: -12, preferMaple: true },
  ];

  const tryAddTree = (x: number, z: number, forceMaple?: boolean): boolean => {
    if (Math.abs(x) > treeBound || Math.abs(z) > treeBound) return false;
    if (getTerrainBiomeAt(x, z) !== 'meadow') return false;
    if (getTerrainSlope(x, z) > 0.33) return false;
    if (getPathDistance(x, z) < PATH_HALF_WIDTH + 2.7) return false;
    if (getRiverSignedDistance(x, z) < 3.2) return false;
    if (isInsideClearPlaza(x, z, 2.2)) return false;

    // Keep establishing camera & direct sightline toward bridge clear of trunks/canopies
    if (Math.hypot(x - heroCamX, z - heroCamZ) < 15.5) return false;
    if (
      pointToSegmentDistSq(
        x,
        z,
        heroCamX,
        heroCamZ,
        bridge.position.x + 1.5,
        bridge.position.z - 2.0,
      ) <
      6.4 * 6.4
    ) {
      return false;
    }

    if (isNearRock(x, z, rockColliders, 2.4)) return false;

    // Minimum tree-to-tree spacing
    for (let i = 0; i < treePlacements.length; i += 1) {
      const other = treePlacements[i];
      const dx = x - other.x;
      const dz = z - other.z;
      if (dx * dx + dz * dz < 6.4 * 6.4) return false;
    }

    const mapleBias = groveNoise.noise2D(x * 0.024, z * 0.024);
    const useMaple = forceMaple !== undefined ? forceMaple : mapleBias > 0.08;
    const pool = useMaple ? mapleIds : birchIds;
    const modelId = pool[Math.floor(rand() * pool.length)];
    const spec = FOLIAGE_MODEL_BY_ID[modelId];

    const scale = 0.84 + rand() * 0.36;
    const y = getTerrainHeight(x, z) - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTerrainTilt(x, z, 0.14, normalScratch);

    const placement: FoliagePlacement = {
      modelId,
      category: 'tree',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
    };

    treePlacements.push(placement);
    placementsByModel[modelId].push(placement);
    treeColliders.push({
      x,
      y: getTerrainHeight(x, z),
      z,
      radius: 0.72 * scale,
      height: spec.targetHeight * scale,
      modelId,
    });
    return true;
  };

  for (const seedTree of curatedTreeSeeds) {
    tryAddTree(seedTree.x, seedTree.z, seedTree.preferMaple);
  }

  let attempts = 0;
  while (treePlacements.length < targetTreeCount && attempts < 3600) {
    attempts += 1;
    // Bias 55% into scenic mid-valley (-78..78) and 45% into outer rolling hills
    const radiusScale = rand() < 0.58 ? 82 : treeBound;
    const x = (rand() * 2 - 1) * radiusScale;
    const z = (rand() * 2 - 1) * radiusScale;

    // Organic grove clustering using Simplex noise
    const groveVal = groveNoise.noise2D(x * 0.032 + 11.4, z * 0.032 - 7.1);
    if (groveVal < -0.22 && rand() < 0.72) continue;

    tryAddTree(x, z);
  }

  // Ensure every single tree model variant gets at least a few instances
  for (let i = 0; i < treeIds.length; i += 1) {
    const id = treeIds[i];
    if (placementsByModel[id].length === 0 && treePlacements.length > i) {
      const donor = treePlacements[i];
      const donorList = placementsByModel[donor.modelId];
      const idx = donorList.indexOf(donor);
      if (idx !== -1) donorList.splice(idx, 1);
      const reassigned: FoliagePlacement = { ...donor, modelId: id };
      treePlacements[i] = reassigned;
      placementsByModel[id].push(reassigned);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Bushes & Foliage (~176 across all 6 Bush variants)
  // -------------------------------------------------------------------------
  const targetBushCount = 176;
  const bushBound = TERRAIN_HALF_SIZE - 22;

  const tryAddBush = (x: number, z: number, preferFlowers: boolean): boolean => {
    if (Math.abs(x) > bushBound || Math.abs(z) > bushBound) return false;
    if (getTerrainBiomeAt(x, z) !== 'meadow') return false;
    if (getTerrainSlope(x, z) > 0.36) return false;
    if (getPathDistance(x, z) < PATH_HALF_WIDTH + 1.05) return false;
    if (getRiverSignedDistance(x, z) < 1.55) return false;
    if (isInsideClearPlaza(x, z, 0.5)) return false;
    if (Math.hypot(x - heroCamX, z - heroCamZ) < 6.5) return false;
    if (isNearRock(x, z, rockColliders, 0.75)) return false;

    for (let i = 0; i < treeColliders.length; i += 1) {
      const tc = treeColliders[i];
      const dx = x - tc.x;
      const dz = z - tc.z;
      if (dx * dx + dz * dz < (tc.radius + 1.15) ** 2) return false;
    }

    for (let i = 0; i < bushPlacements.length; i += 1) {
      const other = bushPlacements[i];
      const dx = x - other.x;
      const dz = z - other.z;
      if (dx * dx + dz * dz < 2.15 * 2.15) return false;
    }

    const pool = preferFlowers ? flowerBushIds : rand() < 0.45 ? flowerBushIds : leafyBushIds;
    const modelId = pool[Math.floor(rand() * pool.length)];
    const spec = FOLIAGE_MODEL_BY_ID[modelId];
    const scale = 0.82 + rand() * 0.36;
    const y = getTerrainHeight(x, z) - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTerrainTilt(x, z, 0.25, normalScratch);

    const placement: FoliagePlacement = {
      modelId,
      category: 'bush',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
    };

    bushPlacements.push(placement);
    placementsByModel[modelId].push(placement);
    return true;
  };

  // Nestle first wave of bushes near tree groves and boulders
  for (let i = 0; i < treePlacements.length && bushPlacements.length < 52; i += 1) {
    const t = treePlacements[i];
    const angle = rand() * Math.PI * 2;
    const dist = 2.4 + rand() * 2.8;
    tryAddBush(t.x + Math.cos(angle) * dist, t.z + Math.sin(angle) * dist, rand() < 0.42);
  }

  for (let i = 0; i < rockColliders.length && bushPlacements.length < 84; i += 1) {
    const rc = rockColliders[i];
    if (rc.kind === 'outcrop') continue;
    const angle = rand() * Math.PI * 2;
    const dist = rc.radius + 1.15 + rand() * 1.4;
    tryAddBush(rc.x + Math.cos(angle) * dist, rc.z + Math.sin(angle) * dist, rand() < 0.55);
  }

  attempts = 0;
  while (bushPlacements.length < targetBushCount && attempts < 3400) {
    attempts += 1;
    const radiusScale = rand() < 0.65 ? 80 : bushBound;
    const x = (rand() * 2 - 1) * radiusScale;
    const z = (rand() * 2 - 1) * radiusScale;
    const nearPathOrPond =
      getPathDistance(x, z) < PATH_HALF_WIDTH + 4.8 ||
      Math.hypot(x - pond.x, z - pond.z) < 26;
    tryAddBush(x, z, nearPathOrPond);
  }

  // Guarantee all 6 bush models are represented
  for (let i = 0; i < bushIds.length; i += 1) {
    const id = bushIds[i];
    if (placementsByModel[id].length === 0 && bushPlacements.length > i) {
      const donor = bushPlacements[i];
      const donorList = placementsByModel[donor.modelId];
      const idx = donorList.indexOf(donor);
      if (idx !== -1) donorList.splice(idx, 1);
      const reassigned: FoliagePlacement = { ...donor, modelId: id };
      bushPlacements[i] = reassigned;
      placementsByModel[id].push(reassigned);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Grass Clumps (~1,320 instanced Grass_Large & Grass_Small across meadows)
  // -------------------------------------------------------------------------
  const targetGrassCount = 1320;
  const grassBound = TERRAIN_HALF_SIZE - 20;

  attempts = 0;
  while (grassPlacements.length < targetGrassCount && attempts < 18000) {
    attempts += 1;
    // Concentrate 72% inside the main scenic valley (-78..78) so close/mid views feel rich
    const radiusScale = rand() < 0.72 ? 78 : grassBound;
    const x = (rand() * 2 - 1) * radiusScale;
    const z = (rand() * 2 - 1) * radiusScale;

    if (getTerrainBiomeAt(x, z) !== 'meadow') continue;
    if (getTerrainSlope(x, z) > 0.38) continue;

    const pathDist = getPathDistance(x, z);
    if (pathDist < PATH_HALF_WIDTH + 0.55) continue;
    if (getRiverSignedDistance(x, z) < 0.95) continue;
    if (Math.hypot(x - bridge.position.x, z - bridge.position.z) < 7.2) continue;
    if (Math.hypot(x - ford.center.x, z - ford.center.z) < 6.0) continue;
    if (Math.hypot(x - ruins.x, z - ruins.z) < 11.5) continue;
    if (isNearRock(x, z, rockColliders, 0.35)) continue;

    // Organic grass tuft patches via Simplex noise
    const density = grassNoise.noise2D(x * 0.055, z * 0.055);
    if (density < -0.18 && rand() < 0.78) continue;

    const useLarge = density > 0.14 && pathDist > PATH_HALF_WIDTH + 1.8 && rand() < 0.55;
    const modelId = useLarge ? 'Grass_Large' : 'Grass_Small';
    const spec = FOLIAGE_MODEL_BY_ID[modelId];

    const scale = 0.78 + rand() * 0.52;
    const y = getTerrainHeight(x, z) - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTerrainTilt(x, z, 0.42, normalScratch);

    const placement: FoliagePlacement = {
      modelId,
      category: 'grass',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
    };

    grassPlacements.push(placement);
    placementsByModel[modelId].push(placement);
  }

  // -------------------------------------------------------------------------
  // 4. Wildflower Clumps (~540 across Flower_1_Clump, Flower_2_Clump, Flower_3_Clump)
  // -------------------------------------------------------------------------
  const targetFlowerCount = 540;
  const flowerBound = TERRAIN_HALF_SIZE - 24;

  // Seed cohesive wildflower patch centers so blooms cluster like sunlit alpine meadows
  const patchCenters: Array<{ x: number; z: number; modelId: string; radius: number }> = [
    { x: spawn.x + 6, z: spawn.y - 5, modelId: 'Flower_1_Clump', radius: 7.5 },
    { x: spawn.x - 8, z: spawn.y + 3, modelId: 'Flower_2_Clump', radius: 6.5 },
    { x: bridge.westEnd.x - 6, z: bridge.westEnd.z + 6, modelId: 'Flower_3_Clump', radius: 6.5 },
    { x: bridge.eastEnd.x + 8, z: bridge.eastEnd.z - 5, modelId: 'Flower_1_Clump', radius: 7.5 },
    { x: pond.x - 16, z: pond.z + 10, modelId: 'Flower_2_Clump', radius: 8.0 },
    { x: pond.x + 15, z: pond.z + 12, modelId: 'Flower_3_Clump', radius: 7.5 },
    { x: -12, z: -12, modelId: 'Flower_1_Clump', radius: 8.5 },
    { x: 18, z: -26, modelId: 'Flower_2_Clump', radius: 8.0 },
    { x: overlook.x + 10, z: overlook.z + 8, modelId: 'Flower_3_Clump', radius: 7.5 },
  ];

  // Add additional procedural meadow flower patch centers
  for (let p = 0; p < 24; p += 1) {
    const px = (rand() * 2 - 1) * 86;
    const pz = (rand() * 2 - 1) * 86;
    if (getTerrainBiomeAt(px, pz) === 'meadow' && getRiverSignedDistance(px, pz) > 2.5) {
      patchCenters.push({
        x: px,
        z: pz,
        modelId: flowerIds[p % flowerIds.length],
        radius: 5.5 + rand() * 5.0,
      });
    }
  }

  attempts = 0;
  while (flowerPlacements.length < targetFlowerCount && attempts < 7500) {
    attempts += 1;
    let x: number;
    let z: number;
    let modelId: string;

    if (rand() < 0.76 && patchCenters.length > 0) {
      const patch = patchCenters[Math.floor(rand() * patchCenters.length)];
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * patch.radius;
      x = patch.x + Math.cos(angle) * dist;
      z = patch.z + Math.sin(angle) * dist;
      // 80% patch's primary flower, 20% companion species for natural meadow variety
      modelId = rand() < 0.8 ? patch.modelId : flowerIds[Math.floor(rand() * flowerIds.length)];
    } else {
      x = (rand() * 2 - 1) * flowerBound;
      z = (rand() * 2 - 1) * flowerBound;
      const noisePick = flowerNoise.noise2D(x * 0.04, z * 0.04);
      modelId =
        noisePick < -0.15
          ? 'Flower_1_Clump'
          : noisePick < 0.2
            ? 'Flower_2_Clump'
            : 'Flower_3_Clump';
    }

    if (Math.abs(x) > flowerBound || Math.abs(z) > flowerBound) continue;
    if (getTerrainBiomeAt(x, z) !== 'meadow') continue;
    if (getTerrainSlope(x, z) > 0.34) continue;
    if (getPathDistance(x, z) < PATH_HALF_WIDTH + 0.65) continue;
    if (getRiverSignedDistance(x, z) < 1.1) continue;
    if (Math.hypot(x - bridge.position.x, z - bridge.position.z) < 7.0) continue;
    if (Math.hypot(x - ford.center.x, z - ford.center.z) < 5.8) continue;
    if (Math.hypot(x - ruins.x, z - ruins.z) < 11.5) continue;
    if (isNearRock(x, z, rockColliders, 0.35)) continue;

    const spec = FOLIAGE_MODEL_BY_ID[modelId];
    const scale = 0.8 + rand() * 0.45;
    const y = getTerrainHeight(x, z) - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTerrainTilt(x, z, 0.38, normalScratch);

    const placement: FoliagePlacement = {
      modelId,
      category: 'flower',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
    };

    flowerPlacements.push(placement);
    placementsByModel[modelId].push(placement);
  }

  const totalInstances =
    treePlacements.length +
    bushPlacements.length +
    grassPlacements.length +
    flowerPlacements.length;

  return {
    placementsByModel,
    treePlacements,
    bushPlacements,
    grassPlacements,
    flowerPlacements,
    treeColliders,
    totalInstances,
  };
}

// ---------------------------------------------------------------------------
// GLTF + Draco Material Conversion & InstancedMesh Builder
// ---------------------------------------------------------------------------

interface ExtractedMeshPart {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshToonMaterial | THREE.MeshToonMaterial[];
  readonly name: string;
}

/**
 * Converts quantized (`KHR_mesh_quantization` Int16/Uint16/Int8/Uint8 normalized)
 * or interleaved vertex attributes into standard Float32 `BufferAttribute`s so
 * `geometry.applyMatrix4(...)` never clamps or truncates coordinates outside [-1, 1].
 */
export function dequantizeBufferGeometry(
  source: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const geo = source.clone();

  for (const attrName of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(attrName);
    if (!attr) continue;

    const needsFloat32 =
      attr.normalized ||
      !(attr instanceof THREE.BufferAttribute) ||
      !(attr.array instanceof Float32Array);

    if (!needsFloat32) continue;

    const itemSize = attr.itemSize;
    const count = attr.count;
    const floatArray = new Float32Array(count * itemSize);

    for (let i = 0; i < count; i += 1) {
      const base = i * itemSize;
      if (itemSize >= 1) floatArray[base] = attr.getX(i);
      if (itemSize >= 2) floatArray[base + 1] = attr.getY(i);
      if (itemSize >= 3) floatArray[base + 2] = attr.getZ(i);
      if (itemSize >= 4) floatArray[base + 3] = attr.getW(i);
    }

    geo.setAttribute(attrName, new THREE.BufferAttribute(floatArray, itemSize, false));
  }

  return geo;
}

/**
 * Extracts all child meshes from a loaded GLB, grounds their combined bounding
 * box at (0, 0, 0), normalizes height to Azure Vale scale, and converts every
 * material to our 3-step Genshin anime toon shader while preserving diffuse maps
 * and applying `alphaTest: 0.5` to leaves, flowers, and grass.
 */
function extractGroundedToonParts(
  gltf: GLTF,
  spec: FoliageModelSpec,
  trackedTextures: Set<THREE.Texture>,
): ExtractedMeshPart[] {
  gltf.scene.updateMatrixWorld(true);

  const sourceMeshes: THREE.Mesh[] = [];
  gltf.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      sourceMeshes.push(obj);
    }
  });

  if (sourceMeshes.length === 0) {
    return [];
  }

  // Dequantize upfront so bounding box computation and matrix baking use full Float32 precision
  const dequantizedGeos = sourceMeshes.map((mesh) =>
    dequantizeBufferGeometry(mesh.geometry),
  );

  // Compute combined world-space bounds across all parts of this GLB
  const rootBox = new THREE.Box3();
  const partBox = new THREE.Box3();
  for (let i = 0; i < sourceMeshes.length; i += 1) {
    const geo = dequantizedGeos[i];
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      partBox.copy(geo.boundingBox).applyMatrix4(sourceMeshes[i].matrixWorld);
      rootBox.union(partBox);
    }
  }

  const rawSize = new THREE.Vector3();
  const rootCenter = new THREE.Vector3();
  rootBox.getSize(rawSize);
  rootBox.getCenter(rootCenter);

  const scaleFactor = computeNormalizedModelScale(rawSize.y, spec.targetHeight);
  let centerX = Number.isFinite(rootCenter.x) ? rootCenter.x : 0;
  let centerZ = Number.isFinite(rootCenter.z) ? rootCenter.z : 0;
  const minY = Number.isFinite(rootBox.min.y) ? rootBox.min.y : 0;

  // Pivot trees at their trunk base centroid rather than canopy bounding-box center
  if (spec.category === 'tree' && rawSize.y > 1e-4) {
    const baseBandY = minY + rawSize.y * 0.15;
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    const vTmp = new THREE.Vector3();
    for (let i = 0; i < sourceMeshes.length; i += 1) {
      const posAttr = dequantizedGeos[i].getAttribute('position');
      if (!posAttr) continue;
      const matW = sourceMeshes[i].matrixWorld;
      for (let v = 0; v < posAttr.count; v += 1) {
        vTmp.fromBufferAttribute(posAttr, v).applyMatrix4(matW);
        if (vTmp.y <= baseBandY) {
          sumX += vTmp.x;
          sumZ += vTmp.z;
          count += 1;
        }
      }
    }
    if (count > 0) {
      centerX = sumX / count;
      centerZ = sumZ / count;
    }
  }

  // Bake: world transform -> ground trunk-base at origin -> uniform world scale
  const groundAndScale = new THREE.Matrix4().compose(
    new THREE.Vector3(-centerX * scaleFactor, -minY * scaleFactor, -centerZ * scaleFactor),
    new THREE.Quaternion(),
    new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor),
  );
  const bakedMatrix = new THREE.Matrix4();

  const parts: ExtractedMeshPart[] = [];

  for (let i = 0; i < sourceMeshes.length; i += 1) {
    const mesh = sourceMeshes[i];
    const clonedGeo = dequantizedGeos[i];
    bakedMatrix.multiplyMatrices(groundAndScale, mesh.matrixWorld);
    clonedGeo.applyMatrix4(bakedMatrix);
    if (!clonedGeo.getAttribute('normal')) {
      clonedGeo.computeVertexNormals();
    }
    clonedGeo.computeBoundingBox();
    clonedGeo.computeBoundingSphere();

    const convertOne = (origMat: THREE.Material): THREE.MeshToonMaterial => {
      // Use calm, luminous Ghibli canopy shading for Azure Vale trees (both Maple & Birch)
      const isMapleCanopy =
        spec.id.startsWith('MapleTree') && isStylizedAACutoutMaterial(origMat, 'maple', mesh.name);
      const isBirchCanopy =
        spec.id.startsWith('BirchTree') && isStylizedAACutoutMaterial(origMat, 'birch', mesh.name);
      const toonMat =
        isMapleCanopy || isBirchCanopy
          ? createStylizedAAFoliageMaterial(origMat, {
              category: isMapleCanopy ? 'maple' : 'birch',
              meshName: mesh.name,
              targetHeight: spec.targetHeight,
            })
          : convertMaterialToAnimeToon(origMat, {
              category: spec.category,
              meshName: mesh.name,
              alphaTest: 0.5,
              shadowTint: spec.shadowTint,
              rimIntensity: spec.rimIntensity,
            });

      if (toonMat.map) trackedTextures.add(toonMat.map);
      if (toonMat.alphaMap) trackedTextures.add(toonMat.alphaMap);

      // Dispose original PBR material only (textures are preserved on toonMat)
      origMat.dispose();
      return toonMat;
    };

    const material = Array.isArray(mesh.material)
      ? mesh.material.map(convertOne)
      : convertOne(mesh.material);

    // Dispose source geometry now that baked clone is ready
    mesh.geometry.dispose();

    parts.push({
      geometry: clonedGeo,
      material,
      name: mesh.name || `${spec.id}_part_${i}`,
    });
  }

  return parts;
}

/**
 * Builds a `THREE.InstancedMesh` for a single extracted GLB mesh part across all
 * deterministic terrain placements for that model.
 */
function buildInstancedPart(
  part: ExtractedMeshPart,
  placements: readonly FoliagePlacement[],
  spec: FoliageModelSpec,
): THREE.InstancedMesh {
  const instanced = new THREE.InstancedMesh(
    part.geometry,
    part.material,
    placements.length,
  );
  instanced.name = `${spec.id}_${part.name}_instanced`;

  // Trees & bushes cast/receive shadows; grass & flowers have shadows disabled
  instanced.castShadow = spec.castShadow;
  instanced.receiveShadow = spec.receiveShadow;

  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.tiltX, p.rotY, p.tiltZ);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }
  instanced.instanceMatrix.needsUpdate = true;
  instanced.computeBoundingSphere();
  instanced.frustumCulled = true;

  return instanced;
}

interface CachedFoliageModel {
  readonly parts: readonly ExtractedMeshPart[];
  readonly textures: readonly THREE.Texture[];
}

interface FoliageCacheEntry {
  readonly models: Map<string, CachedFoliageModel>;
  readonly failedModels: readonly string[];
}

let sharedFoliageCachePromise: Promise<FoliageCacheEntry> | null = null;
let resolvedFoliageCache: FoliageCacheEntry | null = null;

function disposeCachedEntry(entry: FoliageCacheEntry): void {
  entry.models.forEach((cached) => {
    for (const part of cached.parts) {
      part.geometry.dispose();
      const mats = Array.isArray(part.material) ? part.material : [part.material];
      for (const m of mats) {
        m.dispose();
      }
    }
    for (const tex of cached.textures) {
      tex.dispose();
    }
  });
  entry.models.clear();
}

/**
 * Loads, decodes (DRACO + Meshopt), dequantizes, grounds, and toon-converts
 * all 17 `.glb` foliage models once per session so switching between levels is
 * instant with zero redundant network requests.
 */
export function loadFoliageModelCache(): Promise<FoliageCacheEntry> {
  if (sharedFoliageCachePromise) {
    return sharedFoliageCachePromise;
  }

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  dracoLoader.preload();

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  gltfLoader.setCrossOrigin('anonymous');

  const models = new Map<string, CachedFoliageModel>();
  const failedModels: string[] = [];

  sharedFoliageCachePromise = Promise.all(
    FOLIAGE_MODEL_CATALOG.map(async (spec) => {
      try {
        const gltf = await gltfLoader.loadAsync(spec.url);
        const localTextures = new Set<THREE.Texture>();
        const parts = extractGroundedToonParts(gltf, spec, localTextures);
        models.set(spec.id, {
          parts,
          textures: Array.from(localTextures),
        });
      } catch (err) {
        failedModels.push(spec.filename);
        console.warn(`[foliageAssets] Failed to load ${spec.url}:`, err);
      }
    }),
  ).then(() => {
    dracoLoader.dispose();
    const entry: FoliageCacheEntry = { models, failedModels };
    resolvedFoliageCache = entry;
    return entry;
  });

  return sharedFoliageCachePromise;
}

/**
 * Disposes all shared cached GLB geometries, toon materials, and textures.
 * Call only during full WebGL engine teardown (not when switching levels).
 */
export function disposeFoliageAssetCache(): void {
  const toDispose = resolvedFoliageCache;
  resolvedFoliageCache = null;
  sharedFoliageCachePromise = null;
  if (toDispose) {
    disposeCachedEntry(toDispose);
  }
}

export interface CreateInstancedFoliageFromPlanOptions {
  readonly groupName?: string;
  readonly onLoaded?: (stats: FoliageLoadStats) => void;
}

/**
 * Populates a parent Object3D/Scene with `THREE.InstancedMesh` batches for a
 * given `FoliagePlacementPlan` using the shared cached 17 `.glb` toon assets.
 */
export function createInstancedFoliageFromPlan(
  parent: THREE.Object3D,
  plan: FoliagePlacementPlan,
  options: CreateInstancedFoliageFromPlanOptions = {},
): EnvironmentFoliageController {
  const group = new THREE.Group();
  group.name = options.groupName ?? 'instancedFoliage';
  parent.add(group);

  const trackedInstancedMeshes: THREE.InstancedMesh[] = [];
  let disposed = false;
  let loadedModels = 0;
  let instancedMeshCount = 0;
  let failedModels: readonly string[] = [];

  const buildStats = (): FoliageLoadStats => ({
    totalModels: FOLIAGE_MODEL_CATALOG.length,
    loadedModels,
    failedModels: [...failedModels],
    instancedMeshCount,
    totalInstances: plan.totalInstances,
    categoryInstances: {
      tree: plan.treePlacements.length,
      bush: plan.bushPlacements.length,
      grass: plan.grassPlacements.length,
      flower: plan.flowerPlacements.length,
    },
  });

  const readyPromise = loadFoliageModelCache().then((cache) => {
    if (disposed) {
      return buildStats();
    }

    failedModels = cache.failedModels;

    for (const spec of FOLIAGE_MODEL_CATALOG) {
      const placements = plan.placementsByModel[spec.id] ?? [];
      const cached = cache.models.get(spec.id);
      if (!cached) continue;

      if (placements.length > 0) {
        for (const part of cached.parts) {
          const instanced = buildInstancedPart(part, placements, spec);
          group.add(instanced);
          trackedInstancedMeshes.push(instanced);
          instancedMeshCount += 1;
        }
      }
      loadedModels += 1;
    }

    const stats = buildStats();
    if (!disposed) {
      options.onLoaded?.(stats);
    }
    return stats;
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;

    parent.remove(group);
    group.clear();

    for (const instanced of trackedInstancedMeshes) {
      instanced.dispose();
    }
    trackedInstancedMeshes.length = 0;
  };

  return {
    group,
    plan,
    treeColliders: plan.treeColliders,
    readyPromise,
    getStats: buildStats,
    dispose,
  };
}

/**
 * Loads all 17 compressed `.glb` environment models (Birch & Maple trees,
 * bushes, grass clumps, and flower clumps) via `GLTFLoader` + `DRACOLoader`,
 * converts their materials to our 3-step Genshin anime toon shader preserving
 * diffuse textures and `alphaTest: 0.5` on leaves/flowers, and renders them
 * across Azure Vale using `THREE.InstancedMesh`.
 */
export function createEnvironmentFoliage(
  parent: THREE.Object3D,
  options: CreateEnvironmentFoliageOptions = {},
): EnvironmentFoliageController {
  const plan = generateFoliagePlacements(
    options.rockColliders ?? [],
    options.seed ?? WORLD_SEED + 733,
  );

  return createInstancedFoliageFromPlan(parent, plan, {
    groupName: 'azureVale_instancedFoliage',
    onLoaded: options.onLoaded,
  });
}
