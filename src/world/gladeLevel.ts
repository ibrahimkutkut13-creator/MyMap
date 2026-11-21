import * as THREE from 'three';
import type { AtmosphereConfig, AtmosphereController } from './atmosphere';
import {
  DAY_NIGHT_PRESET_HOURS,
  DEFAULT_CYCLE_HOURS_PER_SEC,
  DEFAULT_DAY_TIME_HOURS,
  evaluateDayNightSample,
  normalizeDayHours,
} from './dayNightCycle';
import type { FoliageLoadStats } from './foliageAssets';
import {
  GLADE_ASSET_BY_ID,
  GLADE_ASSET_CATALOG,
  GLADE_BIRCH_FILES,
  GLADE_BUSH_FILES,
  GLADE_COMMON_TREE_FILES,
  GLADE_DEAD_TREE_FILES,
  GLADE_FLOWER_FILES,
  GLADE_GRASS_FILES,
  GLADE_MAPLE_FILES,
  GLADE_MUSHROOM_FILES,
  GLADE_PATH_STONE_FILES,
  GLADE_PETAL_FILES,
  GLADE_PINE_FILES,
  GLADE_ROCK_FILES,
  GLADE_TWISTED_TREE_FILES,
  createGladeInstancedAssets,
  type GladeAssetPlan,
  type GladeAssetPlacement,
  type GladeInstancedAssetsController,
} from './gladeAssets';
import {
  GLADE_ARCHWAY_Z,
  GLADE_BIOME_META,
  GLADE_HALF_SIZE,
  GLADE_LAKES,
  GLADE_SEED,
  GLADE_SEGMENTS,
  GLADE_SIZE,
  GLADE_TRAIL_HALF_WIDTH,
  GLADE_WATER_LEVEL,
  evaluateGladeWaterCarve,
  getDominantGladeBiome,
  getEmeraldBranchX,
  getGladeArchwayAnchor,
  getGladeBiomeWeights,
  getGladeGroundHeight,
  getGladeGroundNormal,
  getGladeLandmarkAnchors,
  getGladeLandmarkById,
  getGladeRiverCenterX,
  getGladeTrailCenterX,
  getGladeTrailDistance,
  getGladeWaterFlowDir,
  getGoldenBranchZ,
  getSakuraBranchZ,
  isPointInGladeWater,
  type GladeBiomeId,
  type GladeLandmarkAnchor,
} from './gladeBiomes';
import { createGladeLandmarks, type GladeLandmarksController } from './gladeLandmarks';
import {
  GLADE_WEATHER_PRESETS,
  applyWeatherToScene,
  createExpandedBlossomPetals,
  createLayeredAnimeClouds,
  createWeatherRainSystem,
  createWeatherRuntimeState,
  stepWeatherRuntimeState,
  type GladeWeatherId,
  type GladeWeatherRuntimeState,
} from './gladeWeather';
import type { PostProcessingController } from './postProcessing';
import {
  createStylizedAAGroundMaterial,
  createStylizedAAStoneMaterial,
  updateStylizedAAShaderTime,
} from './stylizedAAShader';
import { SeededSimplex2D, createSeededRandom } from './terrain';
import { createWater, type WaterController } from './water';

// Re-export core geography helpers for external consumers and unit tests
export {
  GLADE_ARCHWAY_Z,
  GLADE_BIOME_META,
  GLADE_HALF_SIZE,
  GLADE_LAKES,
  GLADE_SEED,
  GLADE_SEGMENTS,
  GLADE_SIZE,
  GLADE_TRAIL_HALF_WIDTH,
  GLADE_WATER_LEVEL,
  getDominantGladeBiome,
  getGladeArchwayAnchor,
  getGladeBiomeWeights,
  getGladeGroundHeight,
  getGladeGroundNormal,
  getGladeLandmarkAnchors,
  getGladeLandmarkById,
  getGladeTrailCenterX,
  getGladeTrailDistance,
  isPointInGladeWater,
  type GladeBiomeId,
  type GladeLandmarkAnchor,
};

export const GLADE_ATMOSPHERE_CONFIG: Partial<AtmosphereConfig> =
  GLADE_WEATHER_PRESETS.sunny.atmosphere;

export type GladeViewPresetId =
  | 'crimson-trail'
  | 'sakura-sanctuary'
  | 'golden-meadow'
  | 'pine-highlands'
  | 'emerald-lake'
  | 'sky-observatory'
  | 'bell-tower'
  | 'cloudcrest-beacon'
  | 'overview'
  | 'closeup';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const groundColorNoise = new SeededSimplex2D(GLADE_SEED + 37);

/**
 * Curated camera viewpoints showcasing the hero Crimson Trail vista, every
 * distinct biome, lakes/river, Sakura Sanctuary, Windmill hill, and Pine Ruins.
 */
export function getGladeCameraFraming(viewPreset: string | null): {
  position: THREE.Vector3;
  target: THREE.Vector3;
} {
  const sakuraLake = GLADE_LAKES[0];
  const emeraldLake = GLADE_LAKES[1];
  const windmill = getGladeLandmarkById('windmill');
  const ruins = getGladeLandmarkById('moonstone-ruins');
  const pier = getGladeLandmarkById('emerald-pier');
  const observatory = getGladeLandmarkById('sky-observatory');
  const bellTower = getGladeLandmarkById('sunset-bell-tower');
  const beacon = getGladeLandmarkById('cloudcrest-beacon');

  switch (viewPreset) {
    case 'overview':
      return {
        position: new THREE.Vector3(-340, 232, 510),
        target: new THREE.Vector3(10, 14.0, -15),
      };
    case 'sakura-sanctuary': {
      // Unobstructed southeast overlook framing Mirror Blossom Lake, Vermilion Moon Bridge,
      // recolored existing GLB Sakura centerpiece on the island, and Lakeside Pagoda Pavilion
      const camX = sakuraLake.x + 64;
      const camZ = sakuraLake.z + 44;
      const camY = Math.max(getGladeGroundHeight(camX, camZ) + 15.0, 16.5);
      return {
        position: new THREE.Vector3(camX, camY, camZ),
        target: new THREE.Vector3(sakuraLake.x - 4, GLADE_WATER_LEVEL + 5.2, sakuraLake.z - 4),
      };
    }
    case 'golden-meadow': {
      const camX = windmill.x - 42;
      const camZ = windmill.z + 34;
      const camY = Math.max(getGladeGroundHeight(camX, camZ) + 9.2, 18.0);
      return {
        position: new THREE.Vector3(camX, camY, camZ),
        target: new THREE.Vector3(windmill.x, windmill.y + 6.8, windmill.z),
      };
    }
    case 'pine-highlands': {
      const camX = ruins.x - 18;
      const camZ = ruins.z + 34;
      const camY = Math.max(getGladeGroundHeight(camX, camZ) + 8.5, 29.0);
      return {
        position: new THREE.Vector3(camX, camY, camZ),
        target: new THREE.Vector3(ruins.x, ruins.y + 5.0, ruins.z),
      };
    }
    case 'emerald-lake': {
      const camX = pier.x - 30;
      const camZ = pier.z - 26;
      const camY = Math.max(getGladeGroundHeight(camX, camZ) + 11.5, 13.0);
      return {
        position: new THREE.Vector3(camX, camY, camZ),
        target: new THREE.Vector3(emeraldLake.x - 10, GLADE_WATER_LEVEL + 2.0, emeraldLake.z - 8),
      };
    }
    case 'sky-observatory': {
      const camX = observatory.x - 38;
      const camZ = observatory.z + 36;
      const camY = Math.max(getGladeGroundHeight(camX, camZ) + 12.0, observatory.y + 10.5);
      return {
        position: new THREE.Vector3(camX, camY, camZ),
        target: new THREE.Vector3(observatory.x, observatory.y + 7.5, observatory.z),
      };
    }
    case 'bell-tower': {
      const camX = bellTower.x + 36;
      const camZ = bellTower.z + 32;
      const camY = Math.max(getGladeGroundHeight(camX, camZ) + 10.0, bellTower.y + 8.5);
      return {
        position: new THREE.Vector3(camX, camY, camZ),
        target: new THREE.Vector3(bellTower.x, bellTower.y + 7.5, bellTower.z),
      };
    }
    case 'cloudcrest-beacon': {
      const camX = beacon.x + 42;
      const camZ = beacon.z + 44;
      const camY = Math.max(getGladeGroundHeight(camX, camZ) + 14.0, beacon.y + 13.5);
      return {
        position: new THREE.Vector3(camX, camY, camZ),
        target: new THREE.Vector3(beacon.x, beacon.y + 13.0, beacon.z),
      };
    }
    case 'closeup': {
      const cx = getGladeTrailCenterX(44) - 1.4;
      const cz = 44;
      const cy = getGladeGroundHeight(cx, cz) + 2.35;
      const tx = getGladeTrailCenterX(6) + 0.6;
      const tz = 6;
      return {
        position: new THREE.Vector3(cx, cy, cz),
        target: new THREE.Vector3(tx, getGladeGroundHeight(tx, tz) + 3.6, tz),
      };
    }
    case 'crimson-trail':
    default: {
      const camZ = 66;
      const camX = getGladeTrailCenterX(camZ) - 0.9;
      const camY = getGladeGroundHeight(camX, camZ) + 2.6;
      const targetZ = -18;
      const targetX = getGladeTrailCenterX(targetZ) + 0.5;
      const targetY = Math.max(getGladeGroundHeight(targetX, targetZ) + 5.8, camY + 1.8);
      return {
        position: new THREE.Vector3(camX, camY, camZ),
        target: new THREE.Vector3(targetX, targetY, targetZ),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic Multi-Biome Placement of Trees (incl. Sakura!), Rocks & Flora
// ---------------------------------------------------------------------------

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
  if (lenSq <= 1e-6) return (px - ax) ** 2 + (pz - az) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return (px - cx) ** 2 + (pz - cz) ** 2;
}

function stripExt(filename: string): string {
  return filename.replace(/\.glb$/i, '');
}

/**
 * Generates deterministic, biome-structured placements across the 520x520
 * Autumn Glade world using all 99 stylized `.glb` assets plus dedicated
 * pink Sakura cherry blossom canopy variants.
 */
export function generateGladePlacements(
  seed: number = GLADE_SEED + 41,
): GladeAssetPlan {
  const rand = createSeededRandom(seed);
  const groveNoise = new SeededSimplex2D(seed + 19);
  const grassNoise = new SeededSimplex2D(seed + 59);
  const flowerNoise = new SeededSimplex2D(seed + 101);
  const normalScratch = new THREE.Vector3();

  const heroFraming = getGladeCameraFraming(null);
  const heroCamX = heroFraming.position.x;
  const heroCamZ = heroFraming.position.z;
  const archway = getGladeArchwayAnchor();
  const landmarks = getGladeLandmarkAnchors();

  const placementsByModel: Record<string, GladeAssetPlacement[]> = {};
  for (const spec of GLADE_ASSET_CATALOG) {
    placementsByModel[spec.id] = [];
  }

  const liveTreePlacements: GladeAssetPlacement[] = [];
  const deadTreePlacements: GladeAssetPlacement[] = [];
  const bushPlacements: GladeAssetPlacement[] = [];
  const plantPlacements: GladeAssetPlacement[] = [];
  const grassPlacements: GladeAssetPlacement[] = [];
  const flowerPlacements: GladeAssetPlacement[] = [];
  const petalPlacements: GladeAssetPlacement[] = [];
  const mushroomPlacements: GladeAssetPlacement[] = [];
  const rockPlacements: GladeAssetPlacement[] = [];
  const pathStonePlacements: GladeAssetPlacement[] = [];
  const allTreeAnchors: Array<{ x: number; z: number; radius: number; isSakura?: boolean }> = [];

  const birchIds = GLADE_BIRCH_FILES.map(stripExt);
  const mapleIds = GLADE_MAPLE_FILES.map(stripExt);
  const commonTreeIds = GLADE_COMMON_TREE_FILES.map(stripExt);
  const pineIds = GLADE_PINE_FILES.map(stripExt);
  // Recolor balanced upright GLB tree models into luminous Sakura blossoms (avoiding crooked TwistedTree trunks)
  const sakuraHostIds = ['CommonTree_1', 'CommonTree_2', 'CommonTree_4', 'BirchTree_1', 'BirchTree_3', 'MapleTree_2', 'MapleTree_4'];
  const fullCommonTreeIds = ['CommonTree_1', 'CommonTree_2', 'CommonTree_4'];
  const deadTreeIds = GLADE_DEAD_TREE_FILES.map(stripExt);
  const bushIds = GLADE_BUSH_FILES.map(stripExt);
  const flowerBushIds = [
    'Bush_Flowers',
    'Bush_Common_Flowers',
    'Bush_Large_Flowers',
    'Bush_Small_Flowers',
  ];
  const leafyBushIds = ['Bush', 'Bush_Common', 'Bush_Large', 'Bush_Small'];
  const cloverIds = ['Clover_1', 'Clover_2'];
  const fernPlantIds = ['Fern_1', 'Plant_1', 'Plant_7'];
  const flowerIds = GLADE_FLOWER_FILES.map(stripExt);
  const clumpFlowerIds = [
    'Flower_1_Clump',
    'Flower_2_Clump',
    'Flower_3_Clump',
    'Flower_3_Group',
    'Flower_4_Clump',
    'Flower_4_Group',
    'Flower_5_Clump',
  ];
  const singleFlowerIds = ['Flower_1', 'Flower_2', 'Flower_3_Single', 'Flower_4_Single'];
  const petalIds = GLADE_PETAL_FILES.map(stripExt);
  const mushroomIds = GLADE_MUSHROOM_FILES.map(stripExt);
  const rockIds = GLADE_ROCK_FILES.map(stripExt);
  const pathStoneIds = GLADE_PATH_STONE_FILES.map(stripExt);
  const pebbleIds = pathStoneIds.filter((id) => id.startsWith('Pebble_'));

  const computeTilt = (x: number, z: number, strength: number) => {
    getGladeGroundNormal(x, z, normalScratch);
    return {
      tiltX: THREE.MathUtils.clamp(normalScratch.z * strength, -0.24, 0.24),
      tiltZ: THREE.MathUtils.clamp(-normalScratch.x * strength, -0.24, 0.24),
    };
  };

  const isNearLandmark = (x: number, z: number, extraPad = 0): boolean => {
    for (let i = 0; i < landmarks.length; i += 1) {
      const lm = landmarks[i];
      const r = lm.clearRadius + extraPad;
      if ((x - lm.x) ** 2 + (z - lm.z) ** 2 < r * r) return true;
    }
    return false;
  };

  const curatedSightlines = (
    [
      'sakura-sanctuary',
      'golden-meadow',
      'pine-highlands',
      'emerald-lake',
      'sky-observatory',
      'bell-tower',
      'cloudcrest-beacon',
    ] as const
  ).map((preset) => {
    const f = getGladeCameraFraming(preset);
    return {
      ax: f.position.x,
      az: f.position.z,
      bx: f.target.x,
      bz: f.target.z,
    };
  });

  const isBlockingCuratedSightline = (x: number, z: number): boolean => {
    for (let i = 0; i < curatedSightlines.length; i += 1) {
      const s = curatedSightlines[i];
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 1e-4) continue;
      const t = THREE.MathUtils.clamp(((x - s.ax) * dx + (z - s.az) * dz) / lenSq, 0, 1);
      const px = s.ax + dx * t;
      const pz = s.az + dz * t;
      const dist = Math.hypot(x - px, z - pz);
      // Keep a clean sightline corridor from camera to landmark target
      const corridorRadius = t < 0.72 ? 9.5 : 6.0;
      if (dist < corridorRadius) return true;
    }
    return false;
  };

  const emeraldFraming = getGladeCameraFraming('emerald-lake');
  const treeBound = GLADE_HALF_SIZE - 46;

  const canPlaceTree = (
    x: number,
    z: number,
    minSpacing: number,
    allowForegroundFrame = false,
    allowSakuraIsland = false,
  ): boolean => {
    if (Math.abs(x) > treeBound || Math.abs(z) > treeBound) return false;
    // Never place trees in water or soggy shoreline beds
    if (isPointInGladeWater(x, z, 0.72)) return false;

    // Reject steep cliffs & sudden embankment drop-offs so trees never perch awkwardly or float
    if (!allowSakuraIsland) {
      getGladeGroundNormal(x, z, normalScratch);
      if (normalScratch.y < 0.87) return false;
      const centerH = getGladeGroundHeight(x, z);
      const r = 1.8;
      const h1 = getGladeGroundHeight(x + r, z);
      const h2 = getGladeGroundHeight(x - r, z);
      const h3 = getGladeGroundHeight(x, z + r);
      const h4 = getGladeGroundHeight(x, z - r);
      const minNbrH = Math.min(h1, h2, h3, h4);
      if (minNbrH < GLADE_WATER_LEVEL + 0.35 || centerH - minNbrH > 0.96) return false;
    }

    // Keep random scatter off Mirror Blossom Lake island so the curated recolored sakura stands cleanly
    const sakuraLake = GLADE_LAKES[0];
    if (!allowSakuraIsland && Math.hypot(x - sakuraLake.x, z - sakuraLake.z) < 22.0) return false;

    if (isNearLandmark(x, z, 0.5)) return false;
    if (!allowSakuraIsland && isBlockingCuratedSightline(x, z)) return false;
    if (getGladeTrailDistance(x, z) < GLADE_TRAIL_HALF_WIDTH + 3.4) return false;

    const camMinDist = allowForegroundFrame ? 7.8 : 13.5;
    if (Math.hypot(x - heroCamX, z - heroCamZ) < camMinDist) return false;
    // Keep Emerald Pier camera vantage unobstructed
    if (Math.hypot(x - emeraldFraming.position.x, z - emeraldFraming.position.z) < 16.0) return false;

    const sightlineHalf = allowForegroundFrame ? 4.8 : 6.4;
    if (
      pointToSegmentDistSq(x, z, heroCamX, heroCamZ, archway.x, archway.z) <
      sightlineHalf * sightlineHalf
    ) {
      return false;
    }

    for (let i = 0; i < allTreeAnchors.length; i += 1) {
      const other = allTreeAnchors[i];
      const dx = x - other.x;
      const dz = z - other.z;
      if (dx * dx + dz * dz < minSpacing * minSpacing) return false;
    }
    return true;
  };

  const computeGroundedTreeY = (x: number, z: number, sinkDepth: number, scale: number): number => {
    const centerH = getGladeGroundHeight(x, z);
    const r = 1.35;
    const minNbrH = Math.min(
      centerH,
      getGladeGroundHeight(x + r, z),
      getGladeGroundHeight(x - r, z),
      getGladeGroundHeight(x, z + r),
      getGladeGroundHeight(x, z - r),
    );
    const slopeDrop = Math.min(0.45, Math.max(0, centerH - minNbrH));
    return Math.max(centerH - 0.96, centerH - slopeDrop - sinkDepth * scale);
  };

  const addLiveTree = (
    x: number,
    z: number,
    opts?: {
      forceModelId?: string;
      minSpacing?: number;
      allowForegroundFrame?: boolean;
      allowSakuraIsland?: boolean;
      scaleOverride?: number;
      isForegroundHeroMaple?: boolean;
      isSakura?: boolean;
    },
  ): boolean => {
    if (
      !canPlaceTree(
        x,
        z,
        opts?.minSpacing ?? 7.8,
        opts?.allowForegroundFrame ?? false,
        opts?.allowSakuraIsland ?? false,
      )
    ) {
      return false;
    }

    let modelId = opts?.forceModelId;
    let isSakura = Boolean(opts?.isSakura);

    if (!modelId) {
      const biome = getDominantGladeBiome(x, z);
      const n = groveNoise.noise2D(x * 0.025, z * 0.025);
      const roll = rand();

      // NOTE: Non-sakura TwistedTree_* models have very dark maroon textures, so only bright
      // emerald CommonTree, golden Birch, alpine Pine, cheerful coral Maple, and luminous pink
      // Sakura trees are placed in the open world.
      if (biome === 'sakura-sanctuary') {
        if (roll < 0.8) {
          isSakura = true;
          modelId = sakuraHostIds[Math.floor(rand() * sakuraHostIds.length)];
        } else if (roll < 0.92) {
          modelId = birchIds[Math.floor(rand() * birchIds.length)];
        } else {
          modelId = commonTreeIds[Math.floor(rand() * commonTreeIds.length)];
        }
      } else if (biome === 'pine-highlands') {
        if (roll < 0.72) {
          modelId = pineIds[Math.floor(rand() * pineIds.length)];
        } else if (roll < 0.88) {
          modelId = commonTreeIds[Math.floor(rand() * commonTreeIds.length)];
        } else {
          modelId = birchIds[Math.floor(rand() * birchIds.length)];
        }
      } else if (biome === 'golden-meadow') {
        if (roll < 0.58) {
          modelId = birchIds[Math.floor(rand() * birchIds.length)];
        } else if (roll < 0.88) {
          modelId = commonTreeIds[Math.floor(rand() * commonTreeIds.length)];
        } else {
          isSakura = true;
          modelId = sakuraHostIds[Math.floor(rand() * sakuraHostIds.length)];
        }
      } else if (biome === 'riverlands') {
        if (roll < 0.5) {
          modelId = fullCommonTreeIds[Math.floor(rand() * fullCommonTreeIds.length)];
        } else if (roll < 0.76) {
          isSakura = true;
          modelId = sakuraHostIds[Math.floor(rand() * sakuraHostIds.length)];
        } else {
          modelId = birchIds[Math.floor(rand() * birchIds.length)];
        }
      } else {
        // Crimson Maple Trail heartland: golden birch, sunlit emerald trees, bright golden-amber maples & sakura
        if (n > 0.36 || roll < 0.2) {
          modelId = mapleIds[Math.floor(rand() * mapleIds.length)];
        } else if (roll < 0.56) {
          modelId = birchIds[Math.floor(rand() * birchIds.length)];
        } else if (roll < 0.82) {
          modelId = fullCommonTreeIds[Math.floor(rand() * fullCommonTreeIds.length)];
        } else {
          isSakura = true;
          modelId = sakuraHostIds[Math.floor(rand() * sakuraHostIds.length)];
        }
      }
    }

    const spec = GLADE_ASSET_BY_ID[modelId];
    const scale = opts?.scaleOverride ?? 0.9 + rand() * 0.4;
    const y = computeGroundedTreeY(x, z, spec.sinkDepth, scale);
    // Trees grow naturally upright (gravitropism) with only a tiny subtle organic lean (~1-2 deg)
    const tiltX = (rand() - 0.5) * 0.035;
    const tiltZ = (rand() - 0.5) * 0.035;

    const placement: GladeAssetPlacement = {
      modelId,
      category: isSakura ? 'sakura' : spec.category,
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
      ...(opts?.isForegroundHeroMaple ? { isForegroundHeroMaple: true } : {}),
      ...(isSakura ? { isSakura: true } : {}),
    };

    liveTreePlacements.push(placement);
    placementsByModel[modelId].push(placement);
    allTreeAnchors.push({ x, z, radius: 0.82 * scale, isSakura });
    return true;
  };

  const addDeadTree = (x: number, z: number, modelId: string, minSpacing = 8.5): boolean => {
    if (!canPlaceTree(x, z, minSpacing, false)) return false;
    const spec = GLADE_ASSET_BY_ID[modelId];
    const scale = 0.86 + rand() * 0.36;
    const y = computeGroundedTreeY(x, z, spec.sinkDepth, scale);
    const tiltX = (rand() - 0.5) * 0.05;
    const tiltZ = (rand() - 0.5) * 0.05;

    const placement: GladeAssetPlacement = {
      modelId,
      category: 'deadTree',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
    };

    deadTreePlacements.push(placement);
    placementsByModel[modelId].push(placement);
    allTreeAnchors.push({ x, z, radius: 0.74 * scale });
    return true;
  };

  // -------------------------------------------------------------------------
  // 1. Curated Scenic Framing Trees (Foreground Hero Maple + Recolored GLB Sakura!)
  // -------------------------------------------------------------------------
  const trailAt54 = getGladeTrailCenterX(54);
  const trailAt42 = getGladeTrailCenterX(42);
  const trailAt28 = getGladeTrailCenterX(28);
  const trailAtNeg18 = getGladeTrailCenterX(-18);
  const torii = getGladeLandmarkById('torii-gate');
  const sakuraLake = GLADE_LAKES[0];
  const pavilion = getGladeLandmarkById('sakura-pavilion');

  const curatedTrees: ReadonlyArray<{
    x: number;
    z: number;
    modelId: string;
    scale?: number;
    fg?: boolean;
    island?: boolean;
    heroRightMaple?: boolean;
    sakura?: boolean;
  }> = [
    // Centerpiece Mirror Blossom Lake island: graceful upright GLB CommonTree recolored sakura pink!
    {
      x: sakuraLake.x,
      z: sakuraLake.z,
      modelId: 'CommonTree_1',
      scale: 1.56,
      island: true,
      sakura: true,
    },
    {
      x: sakuraLake.x - 8.2,
      z: sakuraLake.z - 5.4,
      modelId: 'CommonTree_4',
      scale: 1.12,
      island: true,
      sakura: true,
    },
    {
      x: sakuraLake.x + 7.5,
      z: sakuraLake.z - 6.8,
      modelId: 'CommonTree_2',
      scale: 1.06,
      island: true,
      sakura: true,
    },

    // Iconic hero foreground framing along Crimson Trail (golden-amber maple + golden birch + recolored sakura)
    { x: trailAt54 - 9.2, z: 54.0, modelId: 'CommonTree_2', scale: 1.22, fg: true, sakura: true },
    { x: trailAt54 + 9.4, z: 53.0, modelId: 'MapleTree_5', scale: 1.2, fg: true },
    { x: trailAt42 - 10.2, z: 42.0, modelId: 'BirchTree_3', scale: 1.16, fg: true },
    {
      x: trailAt42 + 9.4,
      z: 41.0,
      modelId: 'MapleTree_1',
      scale: 1.2,
      fg: true,
      heroRightMaple: true,
    },
    { x: trailAt28 - 11.4, z: 28.0, modelId: 'CommonTree_1', scale: 1.18, fg: true, sakura: true },
    { x: trailAt28 + 11.6, z: 29.0, modelId: 'BirchTree_5', scale: 1.12, fg: true },

    // Midground river bridge & archway framing
    { x: trailAtNeg18 - 12.0, z: -18.0, modelId: 'MapleTree_4', scale: 1.16 },
    { x: trailAtNeg18 + 12.2, z: -17.0, modelId: 'CommonTree_2', scale: 1.18, sakura: true },
    { x: archway.x - 13.5, z: archway.z - 2.0, modelId: 'MapleTree_2', scale: 1.16 },
    { x: archway.x + 13.2, z: archway.z - 1.5, modelId: 'BirchTree_4', scale: 1.14 },
    { x: archway.x - 22.0, z: archway.z - 18.0, modelId: 'Pine_3', scale: 1.26 },
    { x: archway.x + 22.5, z: archway.z - 18.5, modelId: 'Pine_1', scale: 1.24 },

    // Ceremonial Sakura Sanctuary framing around Torii Gate & Mirror Blossom Lake!
    { x: torii.x - 2.5, z: torii.z - 11.0, modelId: 'CommonTree_1', scale: 1.24, sakura: true },
    { x: torii.x - 3.0, z: torii.z + 11.0, modelId: 'CommonTree_2', scale: 1.2, sakura: true },
    { x: torii.x - 17.5, z: torii.z - 12.0, modelId: 'CommonTree_4', scale: 1.24, sakura: true },
    { x: torii.x - 18.0, z: torii.z + 12.5, modelId: 'BirchTree_3', scale: 1.22, sakura: true },
    { x: sakuraLake.x - 56, z: sakuraLake.z - 12, modelId: 'CommonTree_1', scale: 1.26, sakura: true },
    { x: sakuraLake.x - 54, z: sakuraLake.z + 22, modelId: 'CommonTree_2', scale: 1.24, sakura: true },
    { x: sakuraLake.x - 18, z: sakuraLake.z - 52, modelId: 'CommonTree_4', scale: 1.26, sakura: true },
    { x: sakuraLake.x + 20, z: sakuraLake.z - 50, modelId: 'BirchTree_1', scale: 1.24, sakura: true },
    { x: pavilion.x - 16, z: pavilion.z + 5, modelId: 'CommonTree_2', scale: 1.24, sakura: true },
    { x: pavilion.x + 16, z: pavilion.z + 6, modelId: 'CommonTree_1', scale: 1.2, sakura: true },
  ];

  for (const c of curatedTrees) {
    addLiveTree(c.x, c.z, {
      forceModelId: c.modelId,
      minSpacing: 5.5,
      allowForegroundFrame: c.fg,
      allowSakuraIsland: c.island,
      scaleOverride: c.scale,
      isForegroundHeroMaple: c.heroRightMaple,
      isSakura: c.sakura,
    });
  }

  // Dedicated lush Sakura Blossom Groves ringing Mirror Blossom Lake, Torii avenue & southwestern hills (~290 recolored GLB sakura trees)
  let attempts = 0;
  while (
    liveTreePlacements.filter((t) => t.isSakura).length < 290 &&
    attempts < 14000
  ) {
    attempts += 1;
    const angle = rand() * Math.PI * 2;
    const useBellHills = rand() < 0.3;
    const radius = useBellHills ? 32 + Math.sqrt(rand()) * 210 : 52 + Math.sqrt(rand()) * 235;
    const cx = useBellHills ? -510 : sakuraLake.x;
    const cz = useBellHills ? 390 : sakuraLake.z;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;
    const groveNoise = groundColorNoise.fbm(x * 0.011 + 4.2, z * 0.011 - 7.1, 2);
    if (groveNoise < -0.22 && rand() < 0.72) continue;
    addLiveTree(x, z, {
      forceModelId: sakuraHostIds[Math.floor(rand() * sakuraHostIds.length)],
      minSpacing: groveNoise > 0.15 ? 8.2 : 10.6,
      isSakura: true,
    });
  }

  // Dedicated Alpine Pine Forest belts framing Moonstone Ruins, Cloudcrest Beacon & northern ridges (~285 pines)
  const pineStartCount = liveTreePlacements.length;
  attempts = 0;
  while (liveTreePlacements.length - pineStartCount < 285 && attempts < 14000) {
    attempts += 1;
    const x = (rand() - 0.5) * (GLADE_SIZE - 140);
    const z = -115 - rand() * 720;
    const biome = getDominantGladeBiome(x, z);
    if (biome !== 'pine-highlands' && rand() < 0.72) continue;
    const groveNoise = groundColorNoise.fbm(x * 0.012 - 9.3, z * 0.012 + 5.7, 2);
    if (groveNoise < -0.24 && rand() < 0.7) continue;
    addLiveTree(x, z, {
      forceModelId: pineIds[Math.floor(rand() * pineIds.length)],
      minSpacing: groveNoise > 0.1 ? 8.4 : 11.2,
    });
  }

  // Sculptural Ancient Dead Trees (~60 strictly in northern Misty Pine Highlands ridges)
  attempts = 0;
  while (deadTreePlacements.length < 60 && attempts < 6800) {
    attempts += 1;
    const x = (rand() - 0.5) * (GLADE_SIZE - 140);
    const z = -125 - rand() * 720;
    const biome = getDominantGladeBiome(x, z);
    if (biome !== 'pine-highlands') continue;
    const modelId = deadTreeIds[deadTreePlacements.length % deadTreeIds.length];
    addDeadTree(x, z, modelId, 13.5);
  }

  // Biome-structured clustered woodland distribution across the 1920x1920 rolling hills (~1,520 live trees for smooth 60 FPS)
  const windmillAnchor = getGladeLandmarkById('windmill');
  attempts = 0;
  while (liveTreePlacements.length < 1520 && attempts < 56000) {
    attempts += 1;
    const x = (rand() - 0.5) * (GLADE_SIZE - 120);
    const z = (rand() - 0.5) * (GLADE_SIZE - 120);
    if (Math.hypot(x - windmillAnchor.x, z - windmillAnchor.z) < 46 && rand() < 0.78) continue;
    const groveNoise = groundColorNoise.fbm(x * 0.0085 + 17.3, z * 0.0085 - 11.4, 2);
    if (groveNoise < -0.18 && rand() < 0.72) continue;
    addLiveTree(x, z, { minSpacing: groveNoise > 0.16 ? 8.4 : 11.2 });
  }

  // Guarantee every bright live tree & dead tree species is placed (skipping dark-leaved non-sakura TwistedTree)
  const allLiveTreeIds = [
    ...birchIds,
    ...mapleIds,
    ...commonTreeIds,
    ...pineIds,
  ];
  let liveReplaceCursor = liveTreePlacements.length - 1;
  for (const id of allLiveTreeIds) {
    if (placementsByModel[id].length === 0 && liveReplaceCursor >= 0) {
      while (
        liveReplaceCursor >= 0 &&
        (liveTreePlacements[liveReplaceCursor].isForegroundHeroMaple ||
          liveTreePlacements[liveReplaceCursor].isSakura)
      ) {
        liveReplaceCursor -= 1;
      }
      if (liveReplaceCursor < 0) break;
      const donor = liveTreePlacements[liveReplaceCursor];
      liveReplaceCursor -= 1;
      const donorList = placementsByModel[donor.modelId];
      const dIdx = donorList.indexOf(donor);
      if (dIdx !== -1) donorList.splice(dIdx, 1);
      const reassigned: GladeAssetPlacement = {
        ...donor,
        modelId: id,
        category: GLADE_ASSET_BY_ID[id].category,
      };
      liveTreePlacements[liveReplaceCursor + 1] = reassigned;
      placementsByModel[id].push(reassigned);
    }
  }
  for (let i = 0; i < deadTreeIds.length; i += 1) {
    const id = deadTreeIds[i];
    if (placementsByModel[id].length === 0 && deadTreePlacements.length > i) {
      const donor = deadTreePlacements[i];
      const donorList = placementsByModel[donor.modelId];
      const dIdx = donorList.indexOf(donor);
      if (dIdx !== -1) donorList.splice(dIdx, 1);
      const reassigned: GladeAssetPlacement = { ...donor, modelId: id };
      deadTreePlacements[i] = reassigned;
      placementsByModel[id].push(reassigned);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Sculpted Limestone & Riverbank Boulders (~58 well-placed scenic rocks)
  // -------------------------------------------------------------------------
  const tryAddRock = (
    x: number,
    z: number,
    opts?: {
      scaleOverride?: number;
      modelId?: string;
      minSpacing?: number;
      allowShoreShallow?: boolean;
    },
  ): boolean => {
    const bound = GLADE_HALF_SIZE - 26;
    if (Math.abs(x) > bound || Math.abs(z) > bound) return false;
    if (Math.hypot(x - heroCamX, z - heroCamZ) < 11.5) return false;
    if (isNearLandmark(x, z, -0.8)) return false;
    if (getGladeTrailDistance(x, z) < GLADE_TRAIL_HALF_WIDTH + 3.0) return false;

    const h = getGladeGroundHeight(x, z);
    if (opts?.allowShoreShallow) {
      if (h < GLADE_WATER_LEVEL - 0.85 || h > GLADE_WATER_LEVEL + 1.45) return false;
    } else if (h < GLADE_WATER_LEVEL + 0.45) {
      return false;
    }

    const minSp = opts?.minSpacing ?? 10.5;
    for (let i = 0; i < rockPlacements.length; i += 1) {
      const other = rockPlacements[i];
      if ((x - other.x) ** 2 + (z - other.z) ** 2 < minSp * minSp) return false;
    }

    const modelId = opts?.modelId ?? rockIds[Math.floor(rand() * rockIds.length)];
    const spec = GLADE_ASSET_BY_ID[modelId];
    const scale = opts?.scaleOverride ?? 0.82 + rand() * 0.65;
    const y = h - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTilt(x, z, 0.3);

    const placement: GladeAssetPlacement = {
      modelId,
      category: 'rock',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
    };
    rockPlacements.push(placement);
    placementsByModel[modelId].push(placement);
    return true;
  };

  // Curated river/shore boulders along the extended river (they also register animated foam rings in water!)
  for (let i = 0; i < 48; i += 1) {
    const z = -420 + i * 24 + (rand() - 0.5) * 8;
    const rcx = getGladeRiverCenterX(z);
    const side = i % 2 === 0 ? -1 : 1;
    tryAddRock(rcx + side * (8.0 + rand() * 4.5), z, {
      scaleOverride: 0.92 + rand() * 0.58,
      minSpacing: 11.0,
      allowShoreShallow: true,
    });
  }
  // Lakeshore accent rocks around all 3 lakes
  for (const lake of GLADE_LAKES) {
    for (let k = 0; k < 8; k += 1) {
      const ang = (k / 8) * Math.PI * 2 + rand() * 0.35;
      const rx = lake.x + Math.cos(ang) * (lake.radiusX * (0.94 + rand() * 0.14));
      const rz = lake.z + Math.sin(ang) * (lake.radiusZ * (0.94 + rand() * 0.14));
      tryAddRock(rx, rz, {
        scaleOverride: 0.9 + rand() * 0.55,
        minSpacing: 9.5,
        allowShoreShallow: true,
      });
    }
  }
  // Highland & trailside smooth boulders (~110 total across the 1920x1920 hills)
  attempts = 0;
  while (rockPlacements.length < 110 && attempts < 4200) {
    attempts += 1;
    const x = (rand() - 0.5) * (GLADE_SIZE - 140);
    const z = (rand() - 0.5) * (GLADE_SIZE - 140);
    const biome = getDominantGladeBiome(x, z);
    if (biome !== 'pine-highlands' && rand() < 0.5) continue;
    tryAddRock(x, z, { minSpacing: 16.0 });
  }

  // -------------------------------------------------------------------------
  // 3. Airy Rounded & Flowering Bushes (~450 across all biomes)
  // -------------------------------------------------------------------------
  const targetBushCount = 450;
  const bushBound = GLADE_HALF_SIZE - 42;

  const tryAddBush = (
    x: number,
    z: number,
    opts?: {
      preferFlowers?: boolean;
      forceModelId?: string;
      allowCloseToCam?: boolean;
      scaleOverride?: number;
      minSpacing?: number;
    },
  ): boolean => {
    if (Math.abs(x) > bushBound || Math.abs(z) > bushBound) return false;
    if (isPointInGladeWater(x, z, 0.45)) return false;
    if (isNearLandmark(x, z, -0.5)) return false;
    if (getGladeTrailDistance(x, z) < GLADE_TRAIL_HALF_WIDTH + 1.8) return false;

    const camMin = opts?.allowCloseToCam ? 5.2 : 8.4;
    if (Math.hypot(x - heroCamX, z - heroCamZ) < camMin) return false;

    for (let i = 0; i < allTreeAnchors.length; i += 1) {
      const tc = allTreeAnchors[i];
      if ((x - tc.x) ** 2 + (z - tc.z) ** 2 < (tc.radius + 1.15) ** 2) return false;
    }
    const minSp = opts?.minSpacing ?? 4.2;
    for (let i = 0; i < bushPlacements.length; i += 1) {
      const other = bushPlacements[i];
      if ((x - other.x) ** 2 + (z - other.z) ** 2 < minSp * minSp) return false;
    }

    const biome = getDominantGladeBiome(x, z);
    const flowerBias =
      opts?.preferFlowers !== undefined
        ? opts.preferFlowers
        : biome === 'sakura-sanctuary' || biome === 'golden-meadow'
          ? rand() < 0.72
          : rand() < 0.52;
    const pool = flowerBias ? flowerBushIds : leafyBushIds;
    const modelId = opts?.forceModelId ?? pool[Math.floor(rand() * pool.length)];
    const spec = GLADE_ASSET_BY_ID[modelId];
    const scale = opts?.scaleOverride ?? 0.86 + rand() * 0.42;
    const y = getGladeGroundHeight(x, z) - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTilt(x, z, 0.22);

    const placement: GladeAssetPlacement = {
      modelId,
      category: 'bush',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
    };
    bushPlacements.push(placement);
    placementsByModel[modelId].push(placement);
    return true;
  };

  // Softly frame foreground trail bends
  const fgBushes: ReadonlyArray<{ x: number; z: number; modelId: string; scale: number }> = [
    { x: getGladeTrailCenterX(54.5) - 7.0, z: 54.5, modelId: 'Bush_Large_Flowers', scale: 0.98 },
    { x: getGladeTrailCenterX(53.5) + 7.2, z: 53.5, modelId: 'Bush_Common_Flowers', scale: 1.0 },
    { x: getGladeTrailCenterX(44.0) - 7.4, z: 44.0, modelId: 'Bush_Flowers', scale: 0.96 },
    { x: getGladeTrailCenterX(42.5) + 7.6, z: 42.5, modelId: 'Bush_Small_Flowers', scale: 0.96 },
  ];
  for (const b of fgBushes) {
    tryAddBush(b.x, b.z, {
      forceModelId: b.modelId,
      allowCloseToCam: true,
      scaleOverride: b.scale,
      minSpacing: 2.8,
    });
  }

  // Tuck bushes beside live trees across all biomes
  for (const t of liveTreePlacements) {
    if (bushPlacements.length >= 260) break;
    if (rand() > 0.36) continue;
    const angle = rand() * Math.PI * 2;
    const dist = 2.8 + rand() * 3.4;
    tryAddBush(t.x + Math.cos(angle) * dist, t.z + Math.sin(angle) * dist);
  }

  attempts = 0;
  while (bushPlacements.length < targetBushCount && attempts < 6200) {
    attempts += 1;
    const x = (rand() - 0.5) * (GLADE_SIZE - 96);
    const z = (rand() - 0.5) * (GLADE_SIZE - 96);
    tryAddBush(x, z);
  }

  for (let i = 0; i < bushIds.length; i += 1) {
    const id = bushIds[i];
    if (placementsByModel[id].length === 0 && bushPlacements.length > i) {
      const donor = bushPlacements[i];
      const donorList = placementsByModel[donor.modelId];
      const dIdx = donorList.indexOf(donor);
      if (dIdx !== -1) donorList.splice(dIdx, 1);
      const reassigned: GladeAssetPlacement = { ...donor, modelId: id };
      bushPlacements[i] = reassigned;
      placementsByModel[id].push(reassigned);
    }
  }

  // -------------------------------------------------------------------------
  // 4. Sunlit Stylized 3D Grass Tufts (~1,650 along paths, riverbanks & groves)
  // -------------------------------------------------------------------------
  const grassIds = GLADE_GRASS_FILES.map(stripExt);
  const softBorderGrassIds = [
    'Grass_Common_Short',
    'Grass_Small',
    'Grass_Wispy_Short',
    'Grass_Common_Tall',
    'Grass_Wispy_Tall',
  ];
  const grassBound = GLADE_HALF_SIZE - 26;

  const tryAddGrass = (
    x: number,
    z: number,
    opts?: { pool?: readonly string[]; minScale?: number; maxScale?: number },
  ): boolean => {
    if (Math.abs(x) > grassBound || Math.abs(z) > grassBound) return false;
    if (isPointInGladeWater(x, z, 0.22)) return false;
    if (Math.hypot(x - heroCamX, z - heroCamZ) < 2.2) return false;
    if (isNearLandmark(x, z, -2.5)) return false;
    if (getGladeTrailDistance(x, z) < GLADE_TRAIL_HALF_WIDTH + 0.45) return false;

    const pool = opts?.pool ?? grassIds;
    const modelId = pool[Math.floor(rand() * pool.length)];
    const spec = GLADE_ASSET_BY_ID[modelId];
    const minS = opts?.minScale ?? 0.68;
    const maxS = opts?.maxScale ?? 1.08;
    const scale = minS + rand() * (maxS - minS);
    const y = getGladeGroundHeight(x, z) - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTilt(x, z, 0.42);

    const placement: GladeAssetPlacement = {
      modelId,
      category: 'grass',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
    };
    grassPlacements.push(placement);
    placementsByModel[modelId].push(placement);
    return true;
  };

  // 4a. Sunlit grass ribbons bordering all 4 roads (~980)
  let grassAttempts = 0;
  while (grassPlacements.length < 620 && grassAttempts < 3800) {
    grassAttempts += 1;
    const z = -255 + rand() * 440;
    const cx = getGladeTrailCenterX(z);
    const side = rand() < 0.5 ? -1 : 1;
    const offset = GLADE_TRAIL_HALF_WIDTH + 0.65 + Math.pow(rand(), 1.35) * 4.8;
    tryAddGrass(cx + side * offset, z, {
      pool: rand() < 0.72 ? softBorderGrassIds : grassIds,
    });
  }
  // West Sakura, East Golden & Emerald Pier road borders (~360)
  grassAttempts = 0;
  while (grassPlacements.length < 980 && grassAttempts < 2800) {
    grassAttempts += 1;
    const branchRoll = rand();
    if (branchRoll < 0.38) {
      const x = -194 + rand() * 198;
      const bz = getSakuraBranchZ(x);
      const side = rand() < 0.5 ? -1 : 1;
      tryAddGrass(x, bz + side * (GLADE_TRAIL_HALF_WIDTH + 0.65 + rand() * 4.2));
    } else if (branchRoll < 0.74) {
      const x = 6 + rand() * 234;
      const bz = getGoldenBranchZ(x);
      const side = rand() < 0.5 ? -1 : 1;
      tryAddGrass(x, bz + side * (GLADE_TRAIL_HALF_WIDTH + 0.65 + rand() * 4.2));
    } else {
      const z = -42 + rand() * 172;
      const bx = getEmeraldBranchX(z);
      const side = rand() < 0.5 ? -1 : 1;
      tryAddGrass(bx + side * (GLADE_TRAIL_HALF_WIDTH + 0.65 + rand() * 4.2), z);
    }
  }

  // 4b. Lakeside & river shore grass fringes (~460)
  grassAttempts = 0;
  while (grassPlacements.length < 1440 && grassAttempts < 3600) {
    grassAttempts += 1;
    const lake = GLADE_LAKES[Math.floor(rand() * GLADE_LAKES.length)];
    const ang = rand() * Math.PI * 2;
    const rScale = 1.02 + rand() * 0.25;
    const x = lake.x + Math.cos(ang) * lake.radiusX * rScale;
    const z = lake.z + Math.sin(ang) * lake.radiusZ * rScale;
    tryAddGrass(x, z, { minScale: 0.78, maxScale: 1.2 });
  }

  // 4c. Grounding grass tufts nestled around live tree trunks (~420)
  const treeGrassTarget = Math.min(1820, grassPlacements.length + 420);
  for (let i = 0; i < liveTreePlacements.length && grassPlacements.length < treeGrassTarget; i += 1) {
    const t = liveTreePlacements[i];
    const tufts = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < tufts && grassPlacements.length < treeGrassTarget; k += 1) {
      const ang = rand() * Math.PI * 2;
      const dist = 1.2 + rand() * 3.1;
      tryAddGrass(t.x + Math.cos(ang) * dist, t.z + Math.sin(ang) * dist, {
        minScale: 0.76,
        maxScale: 1.18,
      });
    }
  }

  // 4d. Open meadow tufts across rolling hills (~2,450 total for smooth 60 FPS)
  grassAttempts = 0;
  while (grassPlacements.length < 2450 && grassAttempts < 6200) {
    grassAttempts += 1;
    const x = (rand() - 0.5) * (GLADE_SIZE - 140);
    const z = (rand() - 0.5) * (GLADE_SIZE - 140);
    if (grassNoise.noise2D(x * 0.04, z * 0.04) < -0.15) continue;
    tryAddGrass(x, z);
  }

  for (let i = 0; i < grassIds.length; i += 1) {
    const id = grassIds[i];
    if (placementsByModel[id].length === 0 && grassPlacements.length > i) {
      const donor = grassPlacements[i];
      const donorList = placementsByModel[donor.modelId];
      const dIdx = donorList.indexOf(donor);
      if (dIdx !== -1) donorList.splice(dIdx, 1);
      const reassigned: GladeAssetPlacement = { ...donor, modelId: id };
      grassPlacements[i] = reassigned;
      placementsByModel[id].push(reassigned);
    }
  }

  // -------------------------------------------------------------------------
  // 5. Clovers & Riverside Ferns (~200 delicate ground foliage accents)
  // -------------------------------------------------------------------------
  const targetPlantCount = 200;
  attempts = 0;
  while (plantPlacements.length < targetPlantCount && attempts < 3600) {
    attempts += 1;
    const x = (rand() - 0.5) * (GLADE_SIZE - 110);
    const z = (rand() - 0.5) * (GLADE_SIZE - 110);
    if (isPointInGladeWater(x, z, 0.28)) continue;
    if (isNearLandmark(x, z, -1.5)) continue;
    if (getGladeTrailDistance(x, z) < GLADE_TRAIL_HALF_WIDTH + 0.9) continue;

    const biome = getDominantGladeBiome(x, z);
    const pool = biome === 'riverlands' || biome === 'pine-highlands' ? fernPlantIds : cloverIds;
    const modelId = pool[plantPlacements.length % pool.length];
    const spec = GLADE_ASSET_BY_ID[modelId];
    const scale = 0.78 + rand() * 0.42;
    const y = getGladeGroundHeight(x, z) - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTilt(x, z, 0.35);

    const placement: GladeAssetPlacement = {
      modelId,
      category: 'plant',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
    };
    plantPlacements.push(placement);
    placementsByModel[modelId].push(placement);
  }

  // -------------------------------------------------------------------------
  // 6. Sweeping Biome Wildflower Meadows (~1,020 airy floral clusters)
  // -------------------------------------------------------------------------
  const targetFlowerCount = 1020;
  const flowerBound = GLADE_HALF_SIZE - 44;
  const windmill = getGladeLandmarkById('windmill');

  const flowerPatches: Array<{ x: number; z: number; modelId: string; radius: number }> = [];
  // Along Crimson Spine road
  for (let z = -76; z <= 74; z += 14.0) {
    const cx = getGladeTrailCenterX(z);
    flowerPatches.push({
      x: cx - 6.8,
      z,
      modelId: clumpFlowerIds[Math.abs(Math.round(z)) % clumpFlowerIds.length],
      radius: 4.5,
    });
    flowerPatches.push({
      x: cx + 7.0,
      z: z + 5.0,
      modelId: clumpFlowerIds[(Math.abs(Math.round(z)) + 3) % clumpFlowerIds.length],
      radius: 4.5,
    });
  }
  // Golden Birch Highlands expansive wildflower meadow drifts around Windmill hill!
  for (let p = 0; p < 22; p += 1) {
    const ang = (p / 22) * Math.PI * 2 + rand() * 0.25;
    const r = 20 + rand() * 72;
    flowerPatches.push({
      x: windmill.x + Math.cos(ang) * r,
      z: windmill.z + Math.sin(ang) * r,
      modelId: clumpFlowerIds[p % clumpFlowerIds.length],
      radius: 6.5 + rand() * 5.5,
    });
  }
  // Sakura Sanctuary blossom lakeside wildflower beds
  for (let p = 0; p < 16; p += 1) {
    const ang = (p / 16) * Math.PI * 2 + rand() * 0.3;
    const r = 52 + rand() * 44;
    flowerPatches.push({
      x: sakuraLake.x + Math.cos(ang) * r,
      z: sakuraLake.z + Math.sin(ang) * r,
      modelId: clumpFlowerIds[(p + 2) % clumpFlowerIds.length],
      radius: 5.5 + rand() * 4.0,
    });
  }

  attempts = 0;
  while (flowerPlacements.length < targetFlowerCount && attempts < 16000) {
    attempts += 1;
    let x: number;
    let z: number;
    let modelId: string;

    if (rand() < 0.86) {
      const patch = flowerPatches[Math.floor(rand() * flowerPatches.length)];
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * patch.radius;
      x = patch.x + Math.cos(angle) * dist;
      z = patch.z + Math.sin(angle) * dist;
      const roll = rand();
      modelId =
        roll < 0.6
          ? patch.modelId
          : roll < 0.84
            ? singleFlowerIds[Math.floor(rand() * singleFlowerIds.length)]
            : clumpFlowerIds[Math.floor(rand() * clumpFlowerIds.length)];
    } else {
      x = (rand() - 0.5) * (GLADE_SIZE - 80);
      z = (rand() - 0.5) * (GLADE_SIZE - 80);
      const pick = flowerNoise.noise2D(x * 0.04, z * 0.04);
      const idx = Math.min(
        flowerIds.length - 1,
        Math.max(0, Math.floor((pick + 1) * 0.5 * flowerIds.length)),
      );
      modelId = flowerIds[idx];
    }

    if (Math.abs(x) > flowerBound || Math.abs(z) > flowerBound) continue;
    if (isPointInGladeWater(x, z, 0.28)) continue;
    if (isNearLandmark(x, z, -1.8)) continue;
    if (getGladeTrailDistance(x, z) < GLADE_TRAIL_HALF_WIDTH + 1.05) continue;

    const spec = GLADE_ASSET_BY_ID[modelId];
    const scale = 0.74 + rand() * 0.4;
    const y = getGladeGroundHeight(x, z) - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTilt(x, z, 0.32);

    const placement: GladeAssetPlacement = {
      modelId,
      category: 'flower',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
    };
    flowerPlacements.push(placement);
    placementsByModel[modelId].push(placement);
  }

  for (let i = 0; i < flowerIds.length; i += 1) {
    const id = flowerIds[i];
    if (placementsByModel[id].length === 0 && flowerPlacements.length > i) {
      const donor = flowerPlacements[i];
      const donorList = placementsByModel[donor.modelId];
      const dIdx = donorList.indexOf(donor);
      if (dIdx !== -1) donorList.splice(dIdx, 1);
      const reassigned: GladeAssetPlacement = { ...donor, modelId: id };
      flowerPlacements[i] = reassigned;
      placementsByModel[id].push(reassigned);
    }
  }

  // -------------------------------------------------------------------------
  // 7. Fallen Sakura & Autumn Petals (~300 carpeted beneath trees & roads)
  // -------------------------------------------------------------------------
  const sakuraTreeAnchors = allTreeAnchors.filter((t) => t.isSakura);
  for (let i = 0; i < 300; i += 1) {
    let x: number;
    let z: number;
    if (i < 190 && sakuraTreeAnchors.length > 0) {
      const anchor = sakuraTreeAnchors[i % sakuraTreeAnchors.length];
      const ang = rand() * Math.PI * 2;
      const d = 1.2 + Math.sqrt(rand()) * 7.2;
      x = anchor.x + Math.cos(ang) * d;
      z = anchor.z + Math.sin(ang) * d;
    } else {
      z = -75 + rand() * 145;
      x = getGladeTrailCenterX(z) + (rand() - 0.5) * 20.0;
    }
    if (isPointInGladeWater(x, z, 0.16)) continue;

    const modelId = petalIds[i % petalIds.length];
    const spec = GLADE_ASSET_BY_ID[modelId];
    const scale = 0.88 + rand() * 0.55;
    const y = getGladeGroundHeight(x, z) + 0.025;
    const { tiltX, tiltZ } = computeTilt(x, z, 0.6);

    const placement: GladeAssetPlacement = {
      modelId,
      category: 'petal',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
    };
    petalPlacements.push(placement);
    placementsByModel[modelId].push(placement);
  }

  // -------------------------------------------------------------------------
  // 8. Quiet Woodland Mushrooms (~80 tucked softly near tree roots)
  // -------------------------------------------------------------------------
  for (let i = 0; i < allTreeAnchors.length && mushroomPlacements.length < 80; i += 5) {
    const anchor = allTreeAnchors[i];
    const angle = rand() * Math.PI * 2;
    const dist = 1.25 + rand() * 1.5;
    const x = anchor.x + Math.cos(angle) * dist;
    const z = anchor.z + Math.sin(angle) * dist;
    if (isPointInGladeWater(x, z, 0.3)) continue;
    if (getGladeTrailDistance(x, z) < GLADE_TRAIL_HALF_WIDTH + 1.0) continue;

    const modelId = mushroomIds[mushroomPlacements.length % mushroomIds.length];
    const spec = GLADE_ASSET_BY_ID[modelId];
    const scale = 0.72 + rand() * 0.38;
    const y = getGladeGroundHeight(x, z) - spec.sinkDepth * scale;
    const { tiltX, tiltZ } = computeTilt(x, z, 0.25);

    const placement: GladeAssetPlacement = {
      modelId,
      category: 'mushroom',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
    };
    mushroomPlacements.push(placement);
    placementsByModel[modelId].push(placement);
  }

  // -------------------------------------------------------------------------
  // 9. Warm Trail-Edge Pebbles (~36 subtle accents along all 4 roads)
  // -------------------------------------------------------------------------
  for (let i = 0; i < 36; i += 1) {
    let x: number;
    let z: number;
    const side = i % 2 === 0 ? -1 : 1;
    const offset = GLADE_TRAIL_HALF_WIDTH * (1.06 + rand() * 0.34);

    if (i < 16) {
      z = -220 + i * 24 + (rand() - 0.5) * 5;
      x = getGladeTrailCenterX(z) + side * offset;
    } else if (i < 26) {
      x = -185 + (i - 16) * 18;
      z = getSakuraBranchZ(x) + side * offset;
    } else {
      z = -35 + (i - 26) * 16;
      x = getEmeraldBranchX(z) + side * offset;
    }
    if (isPointInGladeWater(x, z, 0.25)) continue;

    const modelId = pebbleIds[i % pebbleIds.length];
    const spec = GLADE_ASSET_BY_ID[modelId];
    const scale = 0.66 + rand() * 0.32;
    const y = getGladeGroundHeight(x, z) - spec.sinkDepth * scale + 0.012;
    const { tiltX, tiltZ } = computeTilt(x, z, 0.55);

    const placement: GladeAssetPlacement = {
      modelId,
      category: 'pathStone',
      x,
      y,
      z,
      rotY: rand() * Math.PI * 2,
      tiltX,
      tiltZ,
      scale,
      tintIndex: Math.floor(rand() * spec.instanceTints.length),
    };
    pathStonePlacements.push(placement);
    placementsByModel[modelId].push(placement);
  }

  const totalInstances =
    liveTreePlacements.length +
    deadTreePlacements.length +
    bushPlacements.length +
    plantPlacements.length +
    grassPlacements.length +
    flowerPlacements.length +
    petalPlacements.length +
    mushroomPlacements.length +
    rockPlacements.length +
    pathStonePlacements.length;

  return {
    placementsByModel,
    liveTreePlacements,
    deadTreePlacements,
    bushPlacements,
    plantPlacements,
    grassPlacements,
    flowerPlacements,
    petalPlacements,
    mushroomPlacements,
    rockPlacements,
    pathStonePlacements,
    totalInstances,
  };
}

// ---------------------------------------------------------------------------
// Multi-Biome Hand-Painted Stylized Meadow Ground Mesh (520 x 520)
// ---------------------------------------------------------------------------

function createGladeGroundMesh(): {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  geometry: THREE.PlaneGeometry;
  material: THREE.MeshToonMaterial;
} {
  const geometry = new THREE.PlaneGeometry(
    GLADE_SIZE,
    GLADE_SIZE,
    GLADE_SEGMENTS,
    GLADE_SEGMENTS,
  );
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  // Distinct biome ground hues that harmonize naturally across the world
  const crimsonMeadowA = new THREE.Color('#9be564');
  const crimsonMeadowB = new THREE.Color('#7ec850');
  const sakuraGrass = new THREE.Color('#97e088');
  const sakuraPetalBlush = new THREE.Color('#e8b8cb');
  const goldenMeadowA = new THREE.Color('#c8e35c');
  const goldenMeadowB = new THREE.Color('#dbb84f');
  const riverGrass = new THREE.Color('#66bf6b');
  const pineHighlandMoss = new THREE.Color('#5ca664');
  const pineSlateRock = new THREE.Color('#849eb0');

  const sandShore = new THREE.Color('#ebd8a8');
  const wetRiverbed = new THREE.Color('#47a2a8');
  const trailSunlit = new THREE.Color('#eedbb3');
  const trailBorder = new THREE.Color('#dac99c');

  const tmpColor = new THREE.Color();
  const cTmp = new THREE.Color();

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = getGladeGroundHeight(x, z);
    pos.setY(i, y);

    const patch = groundColorNoise.noise2D(x * 0.032, z * 0.032) * 0.5 + 0.5;
    const weights = getGladeBiomeWeights(x, z);

    let accR = 0;
    let accG = 0;
    let accB = 0;

    // 1. Crimson Trail sunlit lime-emerald meadow
    cTmp.copy(crimsonMeadowA).lerp(crimsonMeadowB, patch * 0.55);
    accR += cTmp.r * weights.crimsonTrail;
    accG += cTmp.g * weights.crimsonTrail;
    accB += cTmp.b * weights.crimsonTrail;

    // 2. Sakura Sanctuary blossom-dusted soft mint meadow
    cTmp.copy(sakuraGrass).lerp(sakuraPetalBlush, smoothstep(0.54, 0.92, patch) * 0.38);
    accR += cTmp.r * weights.sakuraSanctuary;
    accG += cTmp.g * weights.sakuraSanctuary;
    accB += cTmp.b * weights.sakuraSanctuary;

    // 3. Golden Birch Highlands sunlit amber-chartreuse hills
    cTmp.copy(goldenMeadowA).lerp(goldenMeadowB, patch * 0.62);
    accR += cTmp.r * weights.goldenMeadow;
    accG += cTmp.g * weights.goldenMeadow;
    accB += cTmp.b * weights.goldenMeadow;

    // 4. Riverlands rich jade grass
    cTmp.copy(riverGrass).lerp(crimsonMeadowB, patch * 0.35);
    accR += cTmp.r * weights.riverlands;
    accG += cTmp.g * weights.riverlands;
    accB += cTmp.b * weights.riverlands;

    // 5. Misty Pine Highlands mossy alpine jade + exposed granite rock on tall alpine heights
    const alpineRockMask = smoothstep(24, 44, y);
    cTmp.copy(pineHighlandMoss).lerp(pineSlateRock, alpineRockMask * 0.62);
    accR += cTmp.r * weights.pineHighlands;
    accG += cTmp.g * weights.pineHighlands;
    accB += cTmp.b * weights.pineHighlands;

    tmpColor.setRGB(accR, accG, accB);

    // Smooth winding sandy dirt trail network (dry land only)
    const waterMargin = y - GLADE_WATER_LEVEL;
    if (waterMargin > 0.32) {
      const trailDist = getGladeTrailDistance(x, z);
      const outerTrailMask =
        1 - smoothstep(GLADE_TRAIL_HALF_WIDTH * 0.78, GLADE_TRAIL_HALF_WIDTH + 1.9, trailDist);
      const innerTrailMask =
        1 - smoothstep(GLADE_TRAIL_HALF_WIDTH * 0.42, GLADE_TRAIL_HALF_WIDTH + 0.35, trailDist);

      if (outerTrailMask > 0.001) {
        tmpColor.lerp(trailBorder, outerTrailMask * 0.66);
        tmpColor.lerp(trailSunlit, innerTrailMask * 0.86);
      }
    }

    // Warm sandy lake/river shorelines & turquoise underwater riverbed
    const waterInfo = evaluateGladeWaterCarve(x, z);
    if (waterInfo.shoreBlend > 0.01 || waterMargin < 1.15) {
      const shoreMask = 1 - smoothstep(-0.15, 0.95, waterMargin);
      tmpColor.lerp(sandShore, shoreMask * 0.78);
      if (waterMargin < 0.05) {
        const bedMask = smoothstep(0.05, -1.5, waterMargin);
        tmpColor.lerp(wetRiverbed, bedMask * 0.82);
      }
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = createStylizedAAGroundMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'autumnGlade_ground';
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  return { mesh, geometry, material };
}

// ---------------------------------------------------------------------------
// Stylized Angular Rock Outcrops & Encircling Distant Alpine Mountain Ring
// ---------------------------------------------------------------------------

function createSculptedFacetGeometry(
  radius: number,
  height: number,
  seed: number,
  colorBottom: THREE.Color,
  colorMid: THREE.Color,
  colorTop: THREE.Color,
): THREE.BufferGeometry {
  // Smooth subdivided rounded boulder geometry (no sharp jagged faceted edges)
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const invR = 1 / Math.max(radius, 0.01);
    const dx = vx * invR;
    const dy = vy * invR;
    const dz = vz * invR;
    const ang = Math.atan2(dz, dx);

    // Smooth continuous low-frequency weathered boulder contour (grounded horizontal profile, zero sharp spikes)
    const broadWave =
      1.0 +
      Math.sin(ang * 2.0 + seed * 0.7) * 0.14 +
      Math.cos(ang * 3.0 - seed * 0.5) * 0.08 +
      Math.sin(dy * 2.2 + seed) * 0.05;
    const ny = THREE.MathUtils.clamp((dy + 1.0) * 0.5, 0, 1);
    const taper = 1.08 - ny * ny * 0.34;
    const domeY = Math.pow(ny, 0.94) * height * 0.62;

    pos.setXYZ(i, vx * broadWave * taper, domeY, vz * broadWave * taper);

    if (ny < 0.48) {
      tmp.copy(colorBottom).lerp(colorMid, ny / 0.48);
    } else {
      tmp.copy(colorMid).lerp(colorTop, (ny - 0.48) / 0.52);
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function createAlpineMountainPeakGeometry(
  baseRadius: number,
  height: number,
  seed: number,
): THREE.BufferGeometry {
  const rand = createSeededRandom(seed);
  const raw = new THREE.ConeGeometry(baseRadius, height, 9, 4, true);
  raw.translate(0, height * 0.5, 0);
  const geo = raw.index ? raw.toNonIndexed() : raw.clone();
  raw.dispose();

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cBase = new THREE.Color('#5a9ec7');
  const cRidge = new THREE.Color('#7eb9dc');
  const cSnow = new THREE.Color('#e6f7ff');
  const tmp = new THREE.Color();

  const bucket = new Map<string, [number, number]>();
  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const ny = THREE.MathUtils.clamp(vy / Math.max(height, 0.01), 0, 1);
    const key = `${Math.round(vx * 20)},${Math.round(vy * 20)},${Math.round(vz * 20)}`;
    let j = bucket.get(key);
    if (!j) {
      const ang = Math.atan2(vz, vx);
      const ridgeCrest =
        1.0 + Math.sin(ang * 3 + seed) * 0.24 + Math.cos(ang * 5 - seed * 0.5) * 0.14;
      const radJitter = ridgeCrest * (0.9 + rand() * 0.22);
      const yJitter = ny > 0.05 && ny < 0.96 ? (rand() - 0.5) * height * 0.09 : 0;
      j = [radJitter, yJitter];
      bucket.set(key, j);
    }

    const flare = 1.0 + (1.0 - ny) * (1.0 - ny) * 0.42;
    pos.setXYZ(i, vx * j[0] * flare, Math.max(0, vy + j[1]), vz * j[0] * flare);

    if (ny < 0.55) {
      tmp.copy(cBase).lerp(cRidge, ny / 0.55);
    } else {
      tmp.copy(cRidge).lerp(cSnow, Math.pow((ny - 0.55) / 0.45, 1.3));
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function createStylizedAngularRockFormations(): {
  group: THREE.Group;
  dispose: () => void;
} {
  const group = new THREE.Group();
  group.name = 'autumnGlade_angularRocks';

  const rockMat = createStylizedAAStoneMaterial({
    shadowColor: '#487ea3',
    rimColor: '#dbf6ff',
    rimStrength: 0.16,
    flatShading: false,
    name: 'autumnGlade_angularRockMat',
  });

  const cBase = new THREE.Color('#8da7b8');
  const cMid = new THREE.Color('#c2d1d6');
  const cTop = new THREE.Color('#9bd474');

  const geoA = createSculptedFacetGeometry(3.4, 5.8, GLADE_SEED + 701, cBase, cMid, cTop);
  const geoB = createSculptedFacetGeometry(2.6, 4.2, GLADE_SEED + 709, cBase, cMid, cTop);

  const outcrops: ReadonlyArray<{
    x: number;
    z: number;
    sx: number;
    sy: number;
    sz: number;
    rotY: number;
    variant: 0 | 1;
  }> = [
    // Mossy hill outcrops across both inner valley and expanded outer rolling hills
    { x: -64, z: -158, sx: 2.3, sy: 2.0, sz: 1.85, rotY: 0.9, variant: 0 },
    { x: 74, z: -182, sx: 2.4, sy: 2.1, sz: 1.9, rotY: 2.3, variant: 0 },
    { x: -162, z: -175, sx: 2.6, sy: 2.2, sz: 2.0, rotY: 1.4, variant: 0 },
    { x: -78, z: -295, sx: 2.7, sy: 2.4, sz: 2.1, rotY: 3.1, variant: 0 },
    { x: 86, z: -288, sx: 2.5, sy: 2.2, sz: 2.0, rotY: 0.5, variant: 1 },
    { x: -265, z: -255, sx: 2.4, sy: 2.0, sz: 1.8, rotY: 2.6, variant: 0 },
    { x: -315, z: 120, sx: 2.2, sy: 1.8, sz: 1.7, rotY: 2.0, variant: 1 },
    { x: 315, z: 45, sx: 2.3, sy: 1.9, sz: 1.8, rotY: 4.1, variant: 0 },
    { x: 295, z: 225, sx: 2.1, sy: 1.75, sz: 1.7, rotY: 1.1, variant: 1 },
    { x: -58, z: -64, sx: 1.5, sy: 1.35, sz: 1.3, rotY: 1.7, variant: 1 },
    { x: 52, z: -84, sx: 1.65, sy: 1.45, sz: 1.35, rotY: 3.9, variant: 0 },
    { x: 132, z: 72, sx: 1.8, sy: 1.5, sz: 1.4, rotY: 0.4, variant: 1 },
    // Outer 2x rolling hills outcrops
    { x: 425, z: -360, sx: 2.8, sy: 2.3, sz: 2.2, rotY: 1.2, variant: 0 },
    { x: 630, z: -245, sx: 2.9, sy: 2.4, sz: 2.2, rotY: 2.7, variant: 1 },
    { x: -420, z: -365, sx: 3.0, sy: 2.6, sz: 2.3, rotY: 0.8, variant: 0 },
    { x: -640, z: -180, sx: 2.6, sy: 2.1, sz: 2.0, rotY: 3.5, variant: 1 },
    { x: -610, z: 280, sx: 2.7, sy: 2.2, sz: 2.1, rotY: 1.9, variant: 0 },
    { x: -310, z: 490, sx: 2.5, sy: 2.0, sz: 1.9, rotY: 4.4, variant: 1 },
    { x: 365, z: 540, sx: 2.6, sy: 2.1, sz: 2.0, rotY: 0.3, variant: 0 },
    { x: 645, z: 310, sx: 2.8, sy: 2.3, sz: 2.1, rotY: 2.1, variant: 1 },
    { x: 95, z: -560, sx: 3.1, sy: 2.6, sz: 2.4, rotY: 5.0, variant: 0 },
    { x: -175, z: 615, sx: 2.6, sy: 2.1, sz: 2.0, rotY: 1.5, variant: 1 },
  ];

  for (const o of outcrops) {
    const mesh = new THREE.Mesh(o.variant === 0 ? geoA : geoB, rockMat);
    const groundY = getGladeGroundHeight(o.x, o.z);
    mesh.position.set(o.x, groundY - 0.9, o.z);
    mesh.scale.set(o.sx, o.sy, o.sz);
    mesh.rotation.y = o.rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return {
    group,
    dispose: () => {
      geoA.dispose();
      geoB.dispose();
      rockMat.dispose();
    },
  };
}

function createDistantAnimeMountains(): {
  group: THREE.Group;
  dispose: () => void;
} {
  const group = new THREE.Group();
  group.name = 'autumnGlade_distantMountains';

  const mountainMat = createStylizedAAStoneMaterial({
    shadowColor: '#3f84bd',
    rimColor: '#dff7ff',
    rimStrength: 0.28,
    flatShading: true,
    name: 'autumnGlade_mountainMat',
  });

  const peakGeos = [
    createAlpineMountainPeakGeometry(132, 148, GLADE_SEED + 801),
    createAlpineMountainPeakGeometry(114, 118, GLADE_SEED + 811),
    createAlpineMountainPeakGeometry(156, 185, GLADE_SEED + 821),
  ];

  // Full 360-degree encircling alpine mountain ring framing the 1920x1920 kingdom (strictly outside terrain perimeter)
  const ringCount = 26;
  const rand = createSeededRandom(GLADE_SEED + 888);
  for (let i = 0; i < ringCount; i += 1) {
    const ang = (i / ringCount) * Math.PI * 2 + (rand() - 0.5) * 0.1;
    const isNorthern = Math.sin(ang) < 0;
    const radius = 1480 + rand() * 190;
    const x = Math.cos(ang) * radius;
    const z = Math.sin(ang) * radius;
    const geoIdx = i % peakGeos.length;
    const mesh = new THREE.Mesh(peakGeos[geoIdx], mountainMat);
    mesh.position.set(x, -22, z);
    const heightScale = isNorthern ? 2.05 + rand() * 0.58 : 1.48 + rand() * 0.45;
    mesh.scale.set(2.15 + rand() * 0.52, heightScale, 2.0 + rand() * 0.48);
    mesh.rotation.y = rand() * Math.PI * 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  return {
    group,
    dispose: () => {
      for (const g of peakGeos) g.dispose();
      mountainMat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Volumetric Sunbeams / God-Rays Filtering Through the Forest Canopies
// ---------------------------------------------------------------------------

const GODRAY_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewPos;

void main() {
  vUv = uv;
  vNormalView = normalize( normalMatrix * normal );
  vec4 mvPos = modelViewMatrix * vec4( position, 1.0 );
  vViewPos = -mvPos.xyz;
  gl_Position = projectionMatrix * mvPos;
}
`;

const GODRAY_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform vec3 uRayColor;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewPos;

void main() {
  if ( uOpacity < 0.002 ) discard;
  vec3 viewDir = normalize( vViewPos );
  float facing = abs( dot( normalize( vNormalView ), viewDir ) );
  float edgeFade = pow( smoothstep( 0.08, 0.82, facing ), 1.45 );
  float vFade = smoothstep( 0.0, 0.24, vUv.y ) * smoothstep( 1.0, 0.45, vUv.y );
  float streak = 0.72 + 0.28 * sin( vUv.x * 18.85 + uTime * 0.45 ) * cos( vUv.y * 6.0 - uTime * 0.35 );
  float alpha = edgeFade * vFade * streak * uOpacity;
  gl_FragColor = vec4( uRayColor, alpha );
}
`;

function createVolumetricSunbeams(sunDirection: THREE.Vector3): {
  group: THREE.Group;
  update: (elapsed: number, opacity: number, sunDir?: THREE.Vector3) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  group.name = 'autumnGlade_volumetricSunbeams';

  const rayGeo = new THREE.CylinderGeometry(1.1, 3.4, 34, 12, 1, true);
  const rayMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRayColor: { value: new THREE.Color('#fff2be') },
      uOpacity: { value: 0.068 },
    },
    vertexShader: GODRAY_VERTEX_SHADER,
    fragmentShader: GODRAY_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });

  const up = new THREE.Vector3(0, 1, 0);
  const rayQuat = new THREE.Quaternion().setFromUnitVectors(
    up,
    sunDirection.clone().normalize(),
  );

  const shafts: ReadonlyArray<{ x: number; z: number; scaleX: number; scaleY: number }> = [
    { x: getGladeTrailCenterX(44) - 4.0, z: 44, scaleX: 1.05, scaleY: 1.08 },
    { x: getGladeTrailCenterX(6) + 4.8, z: 6, scaleX: 1.2, scaleY: 1.14 },
    { x: getGladeTrailCenterX(-66) - 3.5, z: -66, scaleX: 1.3, scaleY: 1.2 },
    { x: -235, z: 44, scaleX: 1.45, scaleY: 1.28 }, // Mirror Blossom Lake
    { x: -120, z: 60, scaleX: 1.25, scaleY: 1.15 }, // Sakura Torii grove
    { x: 242, z: -68, scaleX: 1.4, scaleY: 1.25 }, // Golden Birch Windmill hill
    { x: -10, z: -264, scaleX: 1.5, scaleY: 1.32 }, // Moonstone Ruins
    { x: 196, z: 170, scaleX: 1.45, scaleY: 1.25 }, // Emerald Lake
    { x: 520, z: -440, scaleX: 1.55, scaleY: 1.35 }, // Starlight Observatory
    { x: -510, z: 390, scaleX: 1.45, scaleY: 1.28 }, // Horizon Bell Pavilion
    { x: 515, z: 455, scaleX: 1.55, scaleY: 1.32 }, // Solstice Standing Stones
    { x: -535, z: -455, scaleX: 1.55, scaleY: 1.38 }, // Cloudcrest Beacon
  ];

  const meshes: THREE.Mesh[] = [];
  for (const s of shafts) {
    const mesh = new THREE.Mesh(rayGeo, rayMat);
    const groundY = Math.max(getGladeGroundHeight(s.x, s.z), GLADE_WATER_LEVEL);
    mesh.position.set(s.x, groundY + 13.5, s.z);
    mesh.quaternion.copy(rayQuat);
    mesh.scale.set(s.scaleX, s.scaleY, s.scaleX);
    mesh.renderOrder = 5;
    group.add(mesh);
    meshes.push(mesh);
  }

  const normScratch = new THREE.Vector3();

  return {
    group,
    update: (elapsed, opacity, nextSunDir) => {
      group.visible = opacity > 0.003;
      rayMat.uniforms.uTime.value = elapsed;
      rayMat.uniforms.uOpacity.value = opacity;
      if (nextSunDir) {
        normScratch.copy(nextSunDir).normalize();
        rayQuat.setFromUnitVectors(up, normScratch);
        for (let i = 0; i < meshes.length; i += 1) {
          meshes[i].quaternion.copy(rayQuat);
        }
      }
    },
    dispose: () => {
      rayGeo.dispose();
      rayMat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Expanded Autumn Glade Level Controller
// ---------------------------------------------------------------------------

export interface CreateGladeLevelOptions {
  readonly seed?: number;
  readonly sunDirection?: THREE.Vector3;
  readonly alphaToCoverage?: boolean;
  readonly initialWeather?: GladeWeatherId;
  readonly initialTimeOfDay?: number;
  readonly cyclePaused?: boolean;
  readonly onLoaded?: (stats: FoliageLoadStats) => void;
}

export interface GladeLevelController {
  readonly group: THREE.Group;
  readonly assets: GladeInstancedAssetsController;
  readonly water: WaterController;
  readonly landmarks: GladeLandmarksController;
  readonly plan: GladeAssetPlan;
  readonly readyPromise: Promise<FoliageLoadStats>;
  setWeather: (weatherId: GladeWeatherId, immediate?: boolean) => void;
  getWeather: () => GladeWeatherId;
  setTimeOfDay: (hours: number) => void;
  getTimeOfDay: () => number;
  setCyclePaused: (paused: boolean) => void;
  isCyclePaused: () => boolean;
  update: (
    dt: number,
    elapsed: number,
    context?: {
      cameraPosition?: THREE.Vector3;
      atmosphere?: AtmosphereController;
      renderer?: THREE.WebGLRenderer;
      postProcessing?: PostProcessingController;
    },
  ) => void;
  dispose: () => void;
}

const _camPosFallback = new THREE.Vector3(0, 6, 30);

/**
 * Builds the expanded 520x520 multi-biome Autumn Glade world featuring:
 * - 5 seamless biomes (Crimson Trail, Sakura Sanctuary, Riverlands, Golden Birch Hills, Misty Pine Highlands)
 * - Stylized turquoise river, sakura tributary stream & 3 lakes with foam rings
 * - Luminous Sakura cherry blossom groves + all 99 stylized `.glb` environment assets
 * - 9 composite multi-part landmarks (Archway, River & Moon Bridges, Torii Gate, Lakeside Pavilion,
 *   Spinning Windmill, Moonstone Ruins Sanctuary, Giant Weeping Sakura, Emerald Lake Pier & Boat)
 * - Multi-bank volumetric drifting anime clouds & 5 real-time dynamic weather presets
 */
export function createGladeLevel(
  parent: THREE.Object3D,
  options: CreateGladeLevelOptions = {},
): GladeLevelController {
  const group = new THREE.Group();
  group.name = 'level_autumnGlade';
  parent.add(group);

  const initialWeather: GladeWeatherId = options.initialWeather ?? 'sunny';
  const weatherState: GladeWeatherRuntimeState = createWeatherRuntimeState(initialWeather);

  const sunDir =
    options.sunDirection?.clone().normalize() ??
    weatherState.sunPos.clone().normalize();

  const ground = createGladeGroundMesh();
  group.add(ground.mesh);

  // Stylized turquoise river, streams & 5 lakes across the 1920x1920 kingdom
  const water = createWater(undefined, {
    waterLevel: GLADE_WATER_LEVEL,
    width: GLADE_SIZE - 50,
    length: GLADE_SIZE - 50,
    segmentsX: 230,
    segmentsZ: 230,
    sunDirection: sunDir,
    getHeight: getGladeGroundHeight,
    getFlowDir: getGladeWaterFlowDir,
    obstaclePriorityCenter: [-85, 38],
  });
  water.mesh.name = 'autumnGlade_riverAndLakes';
  group.add(water.mesh);

  // Composite landmarks (bridges & pier register their pilings as water foam obstacles)
  const landmarks = createGladeLandmarks({ water });
  group.add(landmarks.group);

  const angularRocks = createStylizedAngularRockFormations();
  group.add(angularRocks.group);

  const mountains = createDistantAnimeMountains();
  group.add(mountains.group);

  const skyClouds = createLayeredAnimeClouds();
  group.add(skyClouds.mesh);

  const sunbeams = createVolumetricSunbeams(sunDir);
  group.add(sunbeams.group);

  const petals = createExpandedBlossomPetals(240);
  group.add(petals.points);

  const rain = createWeatherRainSystem(520);
  group.add(rain.lines);

  const plan = generateGladePlacements(options.seed ?? GLADE_SEED + 41);

  // Register shoreline boulders as water foam obstacles so white foam swirls around them
  for (const r of plan.rockPlacements) {
    const h = getGladeGroundHeight(r.x, r.z);
    if (h < GLADE_WATER_LEVEL + 0.55) {
      water.registerFoamObstacle(r.x, r.z, 1.15 * r.scale);
    }
  }
  water.syncObstacles();

  const assets = createGladeInstancedAssets(group, plan, {
    sunDirection: sunDir,
    alphaToCoverage: options.alphaToCoverage,
    onLoaded: options.onLoaded,
  });

  const groundMaterials = [ground.material];
  let weatherDirtyImmediate = true;
  let weatherNeedsApply = true;

  let dayTimeHours = normalizeDayHours(options.initialTimeOfDay ?? DEFAULT_DAY_TIME_HOURS);
  let cyclePaused = Boolean(options.cyclePaused);
  let dayNightDirty = true;
  let lastAppliedHours = -100;
  let cachedLanternGlow = 0.95;
  let cachedSunbeamScale = 1.0;
  const cachedLightDir = sunDir.clone();

  const setWeather = (weatherId: GladeWeatherId, immediate = false): void => {
    weatherState.targetWeather = weatherId;
    weatherNeedsApply = true;
    dayNightDirty = true;
    if (weatherId === 'golden-sunset') {
      dayTimeHours = DAY_NIGHT_PRESET_HOURS.sunset;
    }
    if (immediate) {
      stepWeatherRuntimeState(weatherState, 0.016, true);
      weatherDirtyImmediate = true;
    }
  };

  const setTimeOfDay = (hours: number): void => {
    dayTimeHours = normalizeDayHours(hours);
    dayNightDirty = true;
  };

  const setCyclePaused = (paused: boolean): void => {
    cyclePaused = paused;
  };

  const update: GladeLevelController['update'] = (dt, elapsed, context) => {
    const stepped = stepWeatherRuntimeState(weatherState, dt, weatherDirtyImmediate);
    weatherDirtyImmediate = false;

    if (!cyclePaused && dt > 0) {
      dayTimeHours = normalizeDayHours(dayTimeHours + dt * DEFAULT_CYCLE_HOURS_PER_SEC);
    }

    const rawDelta = Math.abs(dayTimeHours - lastAppliedHours);
    const hourDelta = Math.min(rawDelta, 24 - rawDelta);
    const shouldApplyDayNight = dayNightDirty || stepped || weatherNeedsApply || hourDelta >= 0.008;

    if (shouldApplyDayNight && context?.atmosphere && context?.renderer && context?.postProcessing) {
      if (stepped || weatherNeedsApply) {
        applyWeatherToScene(weatherState, {
          atmosphere: context.atmosphere,
          renderer: context.renderer,
          postProcessing: context.postProcessing,
          clouds: skyClouds,
          water,
        });
        weatherNeedsApply = false;
      }

      const activePreset = GLADE_WEATHER_PRESETS[weatherState.targetWeather];
      const sample = evaluateDayNightSample(dayTimeHours, activePreset, weatherState.targetWeather);
      context.atmosphere.applyMood(sample.atmosphere);
      context.atmosphere.setCelestialBody(
        sample.sunPosition,
        sample.moonDirection,
        sample.moonIntensity,
      );
      context.renderer.toneMappingExposure = sample.exposure;

      cachedLightDir
        .set(sample.lightPosition[0], sample.lightPosition[1], sample.lightPosition[2])
        .normalize();

      skyClouds.setPalette(sample.cloudLitColor, sample.cloudShadeColor, weatherState.cloudOpacity);
      skyClouds.setSunDirection(cachedLightDir);

      water.setSunDirection(cachedLightDir);
      water.setMoodTint(
        sample.waterBase,
        sample.waterDeep,
        sample.waterSparkle,
        sample.waterShallow,
      );

      cachedLanternGlow = sample.lanternGlow;
      cachedSunbeamScale = sample.sunbeamScale;
      lastAppliedHours = dayTimeHours;
      dayNightDirty = false;
    }

    const camPos = context?.cameraPosition ?? _camPosFallback;
    assets.updateWind(elapsed, weatherState.windMultiplier);
    updateStylizedAAShaderTime(groundMaterials, elapsed, weatherState.windMultiplier);
    water.update(dt, elapsed);
    landmarks.update(dt, elapsed, cachedLanternGlow);
    skyClouds.update(dt, weatherState.cloudSpeed);
    sunbeams.update(elapsed, weatherState.sunbeamOpacity * cachedSunbeamScale, cachedLightDir);
    petals.update(
      elapsed,
      camPos,
      weatherState.windMultiplier,
      weatherState.petalIntensity,
      weatherState.sakuraPetalRatio,
    );
    rain.update(elapsed, camPos, weatherState.rainOpacity, weatherState.windMultiplier);
  };

  const dispose = (): void => {
    assets.dispose();
    group.remove(rain.lines);
    rain.dispose();
    group.remove(petals.points);
    petals.dispose();
    group.remove(sunbeams.group);
    sunbeams.dispose();
    group.remove(skyClouds.mesh);
    skyClouds.dispose();
    group.remove(mountains.group);
    mountains.dispose();
    group.remove(angularRocks.group);
    angularRocks.dispose();
    group.remove(landmarks.group);
    landmarks.dispose();
    group.remove(water.mesh);
    water.dispose();
    group.remove(ground.mesh);
    ground.geometry.dispose();
    ground.material.dispose();
    parent.remove(group);
    group.clear();
  };

  return {
    group,
    assets,
    water,
    landmarks,
    plan,
    readyPromise: assets.readyPromise,
    setWeather,
    getWeather: () => weatherState.targetWeather,
    setTimeOfDay,
    getTimeOfDay: () => dayTimeHours,
    setCyclePaused,
    isCyclePaused: () => cyclePaused,
    update,
    dispose,
  };
}
