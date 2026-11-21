import * as THREE from 'three';
import { SeededSimplex2D } from './terrain';

// ---------------------------------------------------------------------------
// Expansive 1920x1920 Autumn Glade World Geography, Biomes, Water & Road Network
// ---------------------------------------------------------------------------

export const GLADE_SEED = 9137;
export const GLADE_SIZE = 1920;
export const GLADE_HALF_SIZE = GLADE_SIZE * 0.5;
export const GLADE_SEGMENTS = 260;
export const GLADE_WATER_LEVEL = -1.75;
export const GLADE_TRAIL_HALF_WIDTH = 3.1;
export const GLADE_ARCHWAY_Z = -78;

export type GladeBiomeId =
  | 'crimson-trail'
  | 'sakura-sanctuary'
  | 'riverlands'
  | 'golden-meadow'
  | 'pine-highlands';

export interface GladeBiomeMeta {
  readonly id: GladeBiomeId;
  readonly name: string;
  readonly subtitle: string;
}

export const GLADE_BIOME_META: Readonly<Record<GladeBiomeId, GladeBiomeMeta>> = {
  'crimson-trail': {
    id: 'crimson-trail',
    name: 'Crimson Maple Trail',
    subtitle: 'Central autumn valley road, rolling hills & ancient stone archway',
  },
  'sakura-sanctuary': {
    id: 'sakura-sanctuary',
    name: 'Sakura Blossom Sanctuary',
    subtitle: 'Western cherry blossom hills, Mirror Blossom Lake & Bell Pavilion',
  },
  riverlands: {
    id: 'riverlands',
    name: 'Whispering Riverlands',
    subtitle: 'Winding turquoise river, Emerald Lake & Solstice Standing Stones',
  },
  'golden-meadow': {
    id: 'golden-meadow',
    name: 'Golden Birch Highlands',
    subtitle: 'Sunlit eastern rolling wildflower hills, Windmill & Starlight Observatory',
  },
  'pine-highlands': {
    id: 'pine-highlands',
    name: 'Misty Pine Highlands',
    subtitle: 'Northern alpine ridges, Moonstone Ruins & Cloudcrest Beacon',
  },
};

export interface GladeBiomeWeights {
  readonly crimsonTrail: number;
  readonly sakuraSanctuary: number;
  readonly riverlands: number;
  readonly goldenMeadow: number;
  readonly pineHighlands: number;
}

export interface LakeSpec {
  readonly id:
    | 'sakura-lake'
    | 'emerald-lake'
    | 'moonlit-tarn'
    | 'sunlit-lagoon'
    | 'twilight-basin';
  readonly x: number;
  readonly z: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly maxDepth: number;
  readonly islandRadius?: number;
  readonly islandHeight?: number;
}

export const GLADE_LAKES: readonly LakeSpec[] = [
  // Mirror Blossom Lake in the spacious western Sakura Sanctuary, with a dry blossom island
  {
    id: 'sakura-lake',
    x: -245,
    z: 52,
    radiusX: 48,
    radiusZ: 42,
    maxDepth: 3.1,
    islandRadius: 20,
    islandHeight: 2.55,
  },
  // Emerald Mirror Lake in the southeastern riverlands, fed by the winding river
  {
    id: 'emerald-lake',
    x: 208,
    z: 185,
    radiusX: 64,
    radiusZ: 52,
    maxDepth: 3.35,
  },
  // Secluded Moonlit Pine Tarn nestled in the northwestern alpine pine highlands
  {
    id: 'moonlit-tarn',
    x: -205,
    z: -225,
    radiusX: 46,
    radiusZ: 40,
    maxDepth: 2.85,
  },
  // Sunlit Highland Lagoon nestled in the expanded eastern rolling hills between Windmill & Observatory
  {
    id: 'sunlit-lagoon',
    x: 495,
    z: -135,
    radiusX: 68,
    radiusZ: 54,
    maxDepth: 3.2,
  },
  // Twilight Blossom Basin nestled in the expanded southwestern rolling hills with a quiet islet
  {
    id: 'twilight-basin',
    x: -325,
    z: 335,
    radiusX: 70,
    radiusZ: 56,
    maxDepth: 3.3,
    islandRadius: 16,
    islandHeight: 2.35,
  },
] as const;

export interface GladeLandmarkAnchor {
  readonly id:
    | 'archway'
    | 'river-bridge'
    | 'sakura-bridge'
    | 'torii-gate'
    | 'sakura-pavilion'
    | 'windmill'
    | 'moonstone-ruins'
    | 'emerald-pier'
    | 'sky-observatory'
    | 'sunset-bell-tower'
    | 'solstice-sanctuary'
    | 'cloudcrest-beacon'
    | 'south-overlook';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly clearRadius: number;
}

const noiseMacro = new SeededSimplex2D(GLADE_SEED + 11);
const noiseMed = new SeededSimplex2D(GLADE_SEED + 23);
const noiseDetail = new SeededSimplex2D(GLADE_SEED + 59);
const noiseBiome = new SeededSimplex2D(GLADE_SEED + 83);
const noiseHills = new SeededSimplex2D(GLADE_SEED + 137);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Winding Turquoise River, Sakura Tributary Stream & 3 Lakes
// ---------------------------------------------------------------------------

/**
 * Primary winding turquoise river originating in the far northeastern alpine valley
 * (x~185, z=-500), sweeping gently east of the central trail (x~88 near z=0),
 * widening into southeastern Emerald Lake (x=208, z=185), and winding south through the hills.
 */
export function getGladeRiverCenterX(z: number): number {
  const baseBend =
    118 +
    Math.sin(z * 0.0082 + 0.45) * 48 +
    Math.cos(z * 0.0155 - 0.5) * 18;
  // Originate cleanly in the northeast alpine valley well east of Moonstone Ruins (-12, -268)
  const northEastPull = smoothstep(-120, -340, z) * 0.62;
  // Sweep gracefully through Emerald Lake center (208, 185)
  const lakePull = Math.exp(-(((z - 185) ** 2) / 9200)) * 0.72;
  // Curve gently near x = 86 around z = 12 to receive the Sakura Tributary Stream
  const confluencePull = Math.exp(-(((z - 12) ** 2) / 5200)) * 0.45;
  // Keep southern reach gracefully away from Solstice Sanctuary (515, 455) and South Overlook (-25, 485)
  const southChannelPull = smoothstep(320, 620, z) * 0.52;
  const totalPull = Math.min(0.95, northEastPull + lakePull + confluencePull + southChannelPull);
  return (
    baseBend * (1 - totalPull) +
    176 * northEastPull +
    208 * lakePull +
    86 * confluencePull +
    235 * southChannelPull
  );
}

export function getGladeRiverHalfWidth(z: number): number {
  const breath = 10.2 + Math.sin(z * 0.022 + 1.1) * 2.1;
  return Math.max(8.0, breath);
}

export function getGladeRiverSlopeX(z: number): number {
  const eps = 0.75;
  return (getGladeRiverCenterX(z + eps) - getGladeRiverCenterX(z - eps)) / (2 * eps);
}

const SAKURA_STREAM_CONFLUENCE_X = getGladeRiverCenterX(11);

/**
 * Tranquil Sakura Tributary Stream flowing eastward from Mirror Blossom Lake's
 * northeastern basin (-212, 38), crossing beneath the central wooden bridge at
 * (x~2, z=8), and merging seamlessly into the main turquoise river at
 * (SAKURA_STREAM_CONFLUENCE_X, 11).
 */
export function getGladeStreamCenterZ(x: number): number {
  const startX = -212;
  const spanX = SAKURA_STREAM_CONFLUENCE_X - startX;
  const t = THREE.MathUtils.clamp((x - startX) / spanX, 0, 1);
  const smooth = t * t * (3 - 2 * t);
  const baseZ = THREE.MathUtils.lerp(38, 11, smooth);
  return baseZ - Math.sin(t * Math.PI) * 9.5;
}

export function getGladeStreamHalfWidth(x: number): number {
  const inRange =
    smoothstep(-220, -204, x) *
    (1 - smoothstep(SAKURA_STREAM_CONFLUENCE_X - 2, SAKURA_STREAM_CONFLUENCE_X + 12, x));
  if (inRange <= 0.001) return 0;
  const bridgePinch = Math.exp(-(((x - 2) ** 2) / 360)) * 0.9;
  return Math.max(3.6, 5.2 + Math.sin(x * 0.045) * 0.65 - bridgePinch) * inRange;
}

/**
 * Crystal Eastern Brook winding southwest from Sunlit Highland Lagoon (465, -95)
 * across the rolling meadows into the northeast cove of Emerald Lake (235, 168).
 */
export function getEastBrookCenterX(z: number): number {
  const t = THREE.MathUtils.clamp((z + 95) / (168 + 95), 0, 1);
  const smooth = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(465, 235, smooth) + Math.sin(t * Math.PI * 1.5) * 22.0;
}

/**
 * Tranquil Southwestern Valley Stream meandering southward out of Twilight Basin (-325, 375)
 * through the open southern rolling dales down toward z = +760.
 */
export function getWestValleyStreamCenterX(z: number): number {
  const t = THREE.MathUtils.clamp((z - 375) / 385, 0, 1);
  return -325 + t * 95 + Math.sin(t * Math.PI * 2.0) * 34.0;
}

/**
 * Evaluates water basin carving across the main river, tributary stream, and 3 lakes.
 */
export function evaluateGladeWaterCarve(x: number, z: number): {
  carveDepth: number;
  isLake: boolean;
  isRiver: boolean;
  lakeId: LakeSpec['id'] | null;
  islandMask: number;
  shoreBlend: number;
} {
  let maxCarve = 0;
  let isLake = false;
  let isRiver = false;
  let lakeId: LakeSpec['id'] | null = null;
  let islandMask = 0;
  let shoreBlend = 0;

  // 1. Main winding river (tapers gracefully into far northeast highland headwaters north of z=-440)
  const northSpringFade = smoothstep(-540, -430, z);
  const southFade = 1 - smoothstep(790, 910, z);
  const riverActive = northSpringFade * southFade;
  const riverCx = getGladeRiverCenterX(z);
  const riverSlope = getGladeRiverSlopeX(z);
  const riverDist = Math.abs(x - riverCx) / Math.hypot(1, riverSlope);
  const riverHW = getGladeRiverHalfWidth(z) * (0.42 + 0.58 * riverActive);
  if (riverActive > 0.01 && riverDist < riverHW + 18) {
    const t = 1 - smoothstep(riverHW * 0.42, riverHW + 4.2, riverDist);
    const carve = t * 2.65 * riverActive;
    if (carve > maxCarve) {
      maxCarve = carve;
      isRiver = true;
    }
    shoreBlend = Math.max(
      shoreBlend,
      (1 - smoothstep(riverHW - 2.0, riverHW + 14.0, riverDist)) * riverActive,
    );
  }

  // 2. Tranquil Sakura Tributary Stream (Mirror Blossom Lake -> Central Bridge -> Main River)
  if (x > -222 && x < SAKURA_STREAM_CONFLUENCE_X + 16) {
    const streamHW = getGladeStreamHalfWidth(x);
    if (streamHW > 0.25) {
      const sz = getGladeStreamCenterZ(x);
      const szNext = getGladeStreamCenterZ(x + 0.75);
      const slopeZ = (szNext - sz) / 0.75;
      const streamDist = Math.abs(z - sz) / Math.hypot(1, slopeZ);
      if (streamDist < streamHW + 13) {
        const t = 1 - smoothstep(streamHW * 0.36, streamHW + 3.0, streamDist);
        const carve = t * 2.15;
        if (carve > maxCarve) {
          maxCarve = carve;
          isRiver = true;
        }
        shoreBlend = Math.max(
          shoreBlend,
          1 - smoothstep(streamHW - 1.2, streamHW + 9.5, streamDist),
        );
      }
    }
  }

  // 2b. Crystal Eastern Brook (Sunlit Highland Lagoon -> Emerald Lake)
  if (z > -108 && z < 182) {
    const eastFade = smoothstep(-108, -82, z) * (1 - smoothstep(156, 182, z));
    const bx = getEastBrookCenterX(z);
    const bxNext = getEastBrookCenterX(z + 1.0);
    const slope = bxNext - bx;
    const bDist = Math.abs(x - bx) / Math.hypot(1, slope);
    const bHW = (6.4 + Math.sin(z * 0.03) * 1.1) * eastFade;
    if (bHW > 0.25 && bDist < bHW + 14) {
      const t = 1 - smoothstep(bHW * 0.38, bHW + 3.4, bDist);
      const carve = t * 2.25 * eastFade;
      if (carve > maxCarve) {
        maxCarve = carve;
        isRiver = true;
      }
      shoreBlend = Math.max(
        shoreBlend,
        (1 - smoothstep(bHW - 1.5, bHW + 11.0, bDist)) * eastFade,
      );
    }
  }

  // 2c. Southwestern Valley Stream flowing south from Twilight Basin
  if (z > 362 && z < 775) {
    const westFade = smoothstep(362, 392, z) * (1 - smoothstep(710, 775, z));
    const wx = getWestValleyStreamCenterX(z);
    const wxNext = getWestValleyStreamCenterX(z + 1.0);
    const slope = wxNext - wx;
    const wDist = Math.abs(x - wx) / Math.hypot(1, slope);
    const wHW = (7.0 + Math.cos(z * 0.025) * 1.3) * westFade;
    if (wHW > 0.25 && wDist < wHW + 15) {
      const t = 1 - smoothstep(wHW * 0.38, wHW + 3.6, wDist);
      const carve = t * 2.35 * westFade;
      if (carve > maxCarve) {
        maxCarve = carve;
        isRiver = true;
      }
      shoreBlend = Math.max(
        shoreBlend,
        (1 - smoothstep(wHW - 1.6, wHW + 12.0, wDist)) * westFade,
      );
    }
  }

  // 3. Five distinct scenic lakes with organic noise-warped shorelines
  for (let i = 0; i < GLADE_LAKES.length; i += 1) {
    const lake = GLADE_LAKES[i];
    const dx = x - lake.x;
    const dz = z - lake.z;
    const maxR = Math.max(lake.radiusX, lake.radiusZ) + 26;
    if (Math.abs(dx) > maxR || Math.abs(dz) > maxR) continue;

    const ang = Math.atan2(dz, dx);
    const shoreWarp =
      1.0 +
      Math.sin(ang * 3 + i * 2.1) * 0.085 +
      Math.cos(ang * 5 - i * 1.4) * 0.045;
    const normR = Math.hypot(dx / (lake.radiusX * shoreWarp), dz / (lake.radiusZ * shoreWarp));

    if (normR < 1.38) {
      let basinT = 1 - smoothstep(0.68, 1.04, normR);
      if (lake.islandRadius) {
        const islandDist = Math.hypot(dx, dz);
        const iMask = 1 - smoothstep(lake.islandRadius * 0.68, lake.islandRadius * 1.15, islandDist);
        if (iMask > 0) {
          islandMask = Math.max(islandMask, iMask);
          basinT *= 1 - iMask;
        }
      }
      const carve = basinT * lake.maxDepth;
      if (carve > maxCarve) {
        maxCarve = carve;
        isLake = true;
        lakeId = lake.id;
      }
      const shore = 1 - smoothstep(0.84, 1.34, normR);
      shoreBlend = Math.max(shoreBlend, shore);
    }
  }

  return {
    carveDepth: maxCarve,
    isLake,
    isRiver,
    lakeId,
    islandMask,
    shoreBlend,
  };
}

/**
 * Returns 2D water flow vector for the stylized toon water shader.
 */
export function getGladeWaterFlowDir(x: number, z: number): [number, number] {
  for (const lake of GLADE_LAKES) {
    const dx = x - lake.x;
    const dz = z - lake.z;
    if (Math.hypot(dx / lake.radiusX, dz / lake.radiusZ) < 1.08) {
      const len = Math.max(Math.hypot(dx, dz), 0.001);
      return [(-dz / len) * 0.34 + 0.12, (dx / len) * 0.34 + 0.12];
    }
  }

  if (x > -216 && x < SAKURA_STREAM_CONFLUENCE_X + 8) {
    const sz = getGladeStreamCenterZ(x);
    if (Math.abs(z - sz) < 11) {
      const slopeZ = (getGladeStreamCenterZ(x + 0.75) - getGladeStreamCenterZ(x - 0.75)) / 1.5;
      const inv = 1 / Math.hypot(1, slopeZ);
      return [inv, slopeZ * inv];
    }
  }

  if (z > -105 && z < 178) {
    const bx = getEastBrookCenterX(z);
    if (Math.abs(x - bx) < 15) {
      const slope = (getEastBrookCenterX(z + 1.0) - getEastBrookCenterX(z - 1.0)) * 0.5;
      const inv = 1 / Math.hypot(slope, 1);
      return [slope * inv, inv];
    }
  }

  if (z > 365 && z < 770) {
    const wx = getWestValleyStreamCenterX(z);
    if (Math.abs(x - wx) < 16) {
      const slope = (getWestValleyStreamCenterX(z + 1.0) - getWestValleyStreamCenterX(z - 1.0)) * 0.5;
      const inv = 1 / Math.hypot(slope, 1);
      return [slope * inv, inv];
    }
  }

  const slope = getGladeRiverSlopeX(z);
  const invLen = 1 / Math.hypot(slope, 1);
  return [slope * invLen, invLen];
}

// ---------------------------------------------------------------------------
// Logical Kingdom Trail Network (4 Core Roads + 4 Expanded Frontier Spurs)
// ---------------------------------------------------------------------------

/**
 * 1. Main Spine Road running north-south from South Valley Overlook (z=+470),
 * across the wooden river bridge (z=+8), through the Ancient Stone Archway (z=-78),
 * climbing steadily up into Misty Pine Highlands to Moonstone Ruins (z=-268).
 */
export function getGladeTrailCenterX(z: number): number {
  return Math.sin(z * 0.022) * 12.5 - z * 0.045;
}

/**
 * 2. West Sakura Sanctuary Road branching off the main spine around (x=8, z=56),
 * curving westward through the Vermilion Torii Gate (-115, 64) to Mirror Blossom Lake (-196, 54).
 */
export function getSakuraBranchZ(x: number): number {
  const t = THREE.MathUtils.clamp((10 - x) / 206, 0, 1);
  return 56 + Math.sin(t * Math.PI) * 11.5 - t * 2.5;
}

/**
 * 3. East Golden Highland Road branching off the main spine around (x=0, z=-28),
 * sweeping eastward across sunlit hills up to the Hilltop Windmill (248, -72).
 */
export function getGoldenBranchZ(x: number): number {
  const t = THREE.MathUtils.clamp(x / 248, 0, 1);
  return -28 - t * 44 + Math.sin(t * Math.PI * 1.25) * 18.0;
}

/**
 * 4. Southeast Emerald Pier Road branching off the East Golden Road around (142, -46)
 * curving down across the riverlands to the sheltered Emerald Lake Pier (170, 138).
 */
export function getEmeraldBranchX(z: number): number {
  const t = THREE.MathUtils.clamp((z + 46) / 184, 0, 1);
  return 142 + t * 28 + Math.sin(t * Math.PI * 1.1) * 16.0;
}

/**
 * 5. Northeast Starlight Observatory Road winding across rolling highland ridges
 * from near the Windmill (264, -84) to the Starlight Observatory (520, -440).
 */
export function getObservatoryBranchZ(x: number): number {
  const t = THREE.MathUtils.clamp((x - 264) / (520 - 264), 0, 1);
  return -84 - t * 356 + Math.sin(t * Math.PI) * 32.0;
}

/**
 * 6. Southwest Crimson Bell Ridge Road curving over sakura-autumn rolling hills
 * from west of Mirror Blossom Lake (-292, 92) to Sunset Bell Pavilion (-510, 390).
 */
export function getBellTowerBranchZ(x: number): number {
  const t = THREE.MathUtils.clamp((-292 - x) / (510 - 292), 0, 1);
  return 92 + t * 298 - Math.sin(t * Math.PI) * 28.0;
}

/**
 * 7. Southeast Solstice Road climbing from east of Emerald Lake (282, 224)
 * across sunlit rolling meadows to the Solstice Standing Stones (515, 455).
 */
export function getSolsticeBranchZ(x: number): number {
  const t = THREE.MathUtils.clamp((x - 282) / (515 - 282), 0, 1);
  return 224 + t * 231 + Math.sin(t * Math.PI) * 24.0;
}

/**
 * 8. Northwest Cloudcrest Beacon Road sweeping from Moonstone Ruins (-34, -278)
 * north of Moonlit Tarn up to the Cloudcrest Highland Beacon (-535, -455).
 */
export function getBeaconBranchZ(x: number): number {
  const t = THREE.MathUtils.clamp((-34 - x) / (535 - 34), 0, 1);
  return -278 - t * 177 - Math.sin(t * Math.PI) * 36.0;
}

/**
 * Computes minimum perpendicular distance to any active footpath across the 1920x1920 world.
 */
export function getGladeTrailDistance(x: number, z: number): number {
  let minDist = 999;

  // 1. Primary Spine Road (Moonstone Ruins z=-266 to South Valley Overlook z=+472)
  if (z >= -268 && z <= 474) {
    const cx = getGladeTrailCenterX(z);
    const slope = Math.cos(z * 0.022) * 12.5 * 0.022 - 0.045;
    const dist = Math.abs(x - cx) / Math.hypot(1, slope);
    minDist = Math.min(minDist, dist);
  }

  // 2. West Sakura Sanctuary Road (x from -198 to +10)
  if (x >= -200 && x <= 12) {
    const bz = getSakuraBranchZ(x);
    const slope = (getSakuraBranchZ(x + 0.75) - getSakuraBranchZ(x - 0.75)) / 1.5;
    const dist = Math.abs(z - bz) / Math.hypot(1, slope);
    minDist = Math.min(minDist, dist);
  }

  // 3. East Golden Highland Road (x from -2 to +246)
  if (x >= -2 && x <= 248) {
    const bz = getGoldenBranchZ(x);
    const slope = (getGoldenBranchZ(x + 0.75) - getGoldenBranchZ(x - 0.75)) / 1.5;
    const dist = Math.abs(z - bz) / Math.hypot(1, slope);
    minDist = Math.min(minDist, dist);
  }

  // 4. Southeast Emerald Pier Road (z from -48 to +138)
  if (z >= -50 && z <= 140) {
    const bx = getEmeraldBranchX(z);
    const slope = (getEmeraldBranchX(z + 0.75) - getEmeraldBranchX(z - 0.75)) / 1.5;
    const dist = Math.abs(x - bx) / Math.hypot(1, slope);
    minDist = Math.min(minDist, dist);
  }

  // 5. Northeast Starlight Observatory Road (x from 264 to 508)
  if (x >= 262 && x <= 510) {
    const bz = getObservatoryBranchZ(x);
    const slope = (getObservatoryBranchZ(x + 1.0) - getObservatoryBranchZ(x - 1.0)) / 2.0;
    const dist = Math.abs(z - bz) / Math.hypot(1, slope);
    minDist = Math.min(minDist, dist);
  }

  // 6. Southwest Crimson Bell Ridge Road (x from -498 to -292)
  if (x >= -500 && x <= -290) {
    const bz = getBellTowerBranchZ(x);
    const slope = (getBellTowerBranchZ(x + 1.0) - getBellTowerBranchZ(x - 1.0)) / 2.0;
    const dist = Math.abs(z - bz) / Math.hypot(1, slope);
    minDist = Math.min(minDist, dist);
  }

  // 7. Southeast Solstice Road (x from 282 to 502)
  if (x >= 280 && x <= 504) {
    const bz = getSolsticeBranchZ(x);
    const slope = (getSolsticeBranchZ(x + 1.0) - getSolsticeBranchZ(x - 1.0)) / 2.0;
    const dist = Math.abs(z - bz) / Math.hypot(1, slope);
    minDist = Math.min(minDist, dist);
  }

  // 8. Northwest Cloudcrest Beacon Road (x from -520 to -34)
  if (x >= -522 && x <= -32) {
    const bz = getBeaconBranchZ(x);
    const slope = (getBeaconBranchZ(x + 1.0) - getBeaconBranchZ(x - 1.0)) / 2.0;
    const dist = Math.abs(z - bz) / Math.hypot(1, slope);
    minDist = Math.min(minDist, dist);
  }

  return minDist;
}

// ---------------------------------------------------------------------------
// 5-Biome Smooth Regional Classification (Wide, Distinct Territories)
// ---------------------------------------------------------------------------

export function getGladeBiomeWeights(x: number, z: number): GladeBiomeWeights {
  const warpX = x + noiseBiome.noise2D(x * 0.0034, z * 0.0034) * 44;
  const warpZ = z + noiseBiome.noise2D(x * 0.0034 + 19.3, z * 0.0034 - 7.1) * 44;

  // 1. Sakura Blossom Sanctuary: western & southwestern rolling hills, Mirror Blossom Lake & Bell Pavilion
  const wSakura =
    smoothstep(-58, -165, warpX) * (1 - smoothstep(-105, -205, warpZ)) +
    Math.exp(-(((x + 245) ** 2 + (z - 52) ** 2) / 14500)) * 1.5 +
    Math.exp(-(((x + 510) ** 2 + (z - 390) ** 2) / 38000)) * 1.25;

  // 2. Golden Birch Highlands: expansive sunlit eastern rolling hills around Windmill & Observatory foothills
  const wGolden =
    smoothstep(82, 185, warpX) * (1 - smoothstep(90, 240, warpZ)) * (1 - smoothstep(-240, -390, warpZ)) +
    Math.exp(-(((x - 248) ** 2 + (z + 72) ** 2) / 16000)) * 1.45 +
    Math.exp(-(((x - 520) ** 2 + (z + 440) ** 2) / 42000)) * 0.85;

  // 3. Misty Pine Highlands: northern alpine ridge, Moonstone Ruins, Moonlit Pine Tarn & Cloudcrest Beacon
  const wPine =
    smoothstep(-96, -195, warpZ) * 1.35 +
    Math.exp(-(((x + 205) ** 2 + (z + 225) ** 2) / 12000)) * 1.1 +
    Math.exp(-(((x + 535) ** 2 + (z + 455) ** 2) / 46000)) * 1.2;

  // 4. Whispering Riverlands: river corridor, southeastern Emerald Lake & Solstice rolling hills
  const riverDist = Math.abs(x - getGladeRiverCenterX(z));
  const emeraldDist = Math.hypot(x - 208, z - 185);
  const wRiver =
    (1 - smoothstep(16, 68, riverDist)) * 1.15 +
    (1 - smoothstep(52, 130, emeraldDist)) * 1.35 +
    Math.exp(-(((x - 515) ** 2 + (z - 455) ** 2) / 42000)) * 0.85;

  // 5. Crimson Maple Trail: central-south autumn valley spine & southern overlook hills
  const spineDist = Math.abs(x - getGladeTrailCenterX(z));
  const wCrimson =
    (1 - smoothstep(42, 165, spineDist)) *
      (1 - smoothstep(-82, -165, z)) *
      (1 - smoothstep(460, 720, z)) *
      1.35 +
    0.16;

  const sum = wSakura + wGolden + wPine + wRiver + wCrimson + 1e-5;
  return {
    crimsonTrail: wCrimson / sum,
    sakuraSanctuary: wSakura / sum,
    riverlands: wRiver / sum,
    goldenMeadow: wGolden / sum,
    pineHighlands: wPine / sum,
  };
}

export function getDominantGladeBiome(x: number, z: number): GladeBiomeId {
  const w = getGladeBiomeWeights(x, z);
  const entries: ReadonlyArray<readonly [GladeBiomeId, number]> = [
    ['crimson-trail', w.crimsonTrail],
    ['sakura-sanctuary', w.sakuraSanctuary],
    ['riverlands', w.riverlands],
    ['golden-meadow', w.goldenMeadow],
    ['pine-highlands', w.pineHighlands],
  ];
  let bestId: GladeBiomeId = 'crimson-trail';
  let bestWeight = -1;
  for (const [id, weight] of entries) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestId = id;
    }
  }
  return bestId;
}

// ---------------------------------------------------------------------------
// Multi-Biome Sculpted 1920x1920 Terrain Heightfield with Rich Rolling Hills
// ---------------------------------------------------------------------------

export function getGladeGroundHeight(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);

  // Multi-scale undulating hills & valleys ("ups and downs") across the 2x expanded kingdom
  const broad = noiseMacro.noise2D(x * 0.0036, z * 0.0036) * 13.8;
  const medium = noiseMed.noise2D(x * 0.0108 + 7.3, z * 0.0108 - 4.1) * 5.2;
  const detail = noiseDetail.noise2D(x * 0.036 - 3.2, z * 0.036 + 9.4) * 0.42;

  // Keep central Crimson Trail spawn meadow gently undulating & inviting, then open into sweeping hills
  const centerCalm = smoothstep(28, 115, distFromCenter);
  const outerHillsFactor = smoothstep(135, 360, distFromCenter);

  // Sweeping rhythmic rolling ridges and sunken sunlit dales across the mid & outer territories
  const rollingWaves =
    Math.sin(x * 0.0105 + z * 0.0068) * Math.cos(z * 0.0096 - x * 0.0055) * 9.8 * outerHillsFactor;
  const secondaryCrests =
    Math.sin(x * 0.0175 - z * 0.014 + 1.2) * 4.4 * outerHillsFactor;
  // Sculpted rounded hill domes rising organically above rolling valleys
  const knollRaw = Math.max(0, noiseHills.noise2D(x * 0.0062 - 11.4, z * 0.0062 + 8.7));
  const sculptedKnolls = Math.pow(knollRaw, 1.45) * 19.5 * outerHillsFactor;

  let h =
    3.6 +
    (broad + medium) * (0.24 + 0.76 * centerCalm) +
    rollingWaves +
    secondaryCrests +
    sculptedKnolls +
    detail * 0.55;

  // Regional elevation shaping:
  // 1. Sakura Blossom Sanctuary gentle amphitheater hills framing Mirror Blossom Lake
  const sakuraHillRing =
    Math.exp(-(((Math.hypot(x + 245, z - 52) - 88) ** 2) / 2400)) * 7.8;
  h += sakuraHillRing;

  // 2. Golden Birch Highlands sweeping sunlit hill crest (Windmill hill)
  const windmillHill =
    Math.exp(-(((x - 248) ** 2) / 8600 + ((z + 72) ** 2) / 7200)) * 14.5;
  h += windmillHill;

  // 3. Central Stone Archway pass knoll & Misty Pine Highlands plateau (Moonstone Ruins)
  const archwayKnoll =
    Math.exp(
      -(((x - getGladeTrailCenterX(GLADE_ARCHWAY_Z)) ** 2) / 2800 + ((z - GLADE_ARCHWAY_Z) ** 2) / 1900),
    ) * 4.2;
  const ruinsPlateau =
    Math.exp(-(((x + 12) ** 2) / 5600 + ((z + 268) ** 2) / 4800)) * 15.0;
  const northRidge = smoothstep(-115, -420, z) * 19.0;
  h += archwayKnoll + ruinsPlateau + northRidge;

  // 4. Five sculpted outer landmark hills across the 2x expanded frontier:
  // 4a. Northeast Starlight Observatory highland summit (520, -440)
  const observatoryHill =
    Math.exp(-(((x - 520) ** 2) / 16500 + ((z + 440) ** 2) / 15500)) * 22.0;
  // 4b. Southwest Crimson Bell Ridge hill (-510, 390)
  const bellHill =
    Math.exp(-(((x + 510) ** 2) / 15500 + ((z - 390) ** 2) / 14500)) * 18.5;
  // 4c. Southeast Solstice Standing Stones crest (515, 455)
  const solsticeHill =
    Math.exp(-(((x - 515) ** 2) / 15500 + ((z - 455) ** 2) / 14500)) * 16.5;
  // 4d. Northwest Cloudcrest Highland Beacon alpine peak (-535, -455)
  const beaconHill =
    Math.exp(-(((x + 535) ** 2) / 17500 + ((z + 455) ** 2) / 16500)) * 23.0;
  // 4e. South Valley Overlook scenic ridge (-25, 485)
  const southOverlookHill =
    Math.exp(-(((x + 25) ** 2) / 14500 + ((z - 485) ** 2) / 12500)) * 16.5;

  h += observatoryHill + bellHill + solsticeHill + beaconHill + southOverlookHill;

  // Flatten landmark summit pads cleanly so every structure seats level with zero floating
  const ruinsFlatMask = 1 - smoothstep(14, 30, Math.hypot(x + 12, z + 268));
  if (ruinsFlatMask > 0) {
    h = THREE.MathUtils.lerp(h, 25.4, ruinsFlatMask * 0.9);
  }

  const windmillFlatMask = 1 - smoothstep(10, 24, Math.hypot(x - 248, z + 72));
  if (windmillFlatMask > 0) {
    h = THREE.MathUtils.lerp(h, 19.2, windmillFlatMask * 0.88);
  }

  const obsFlatMask = 1 - smoothstep(15, 34, Math.hypot(x - 520, z + 440));
  if (obsFlatMask > 0) {
    h = THREE.MathUtils.lerp(h, 39.5, obsFlatMask * 0.94);
  }

  const bellFlatMask = 1 - smoothstep(13, 30, Math.hypot(x + 510, z - 390));
  if (bellFlatMask > 0) {
    h = THREE.MathUtils.lerp(h, 30.0, bellFlatMask * 0.94);
  }

  const solsticeFlatMask = 1 - smoothstep(16, 36, Math.hypot(x - 515, z - 455));
  if (solsticeFlatMask > 0) {
    h = THREE.MathUtils.lerp(h, 27.5, solsticeFlatMask * 0.94);
  }

  const beaconFlatMask = 1 - smoothstep(13, 32, Math.hypot(x + 535, z + 455));
  if (beaconFlatMask > 0) {
    h = THREE.MathUtils.lerp(h, 42.0, beaconFlatMask * 0.94);
  }

  const southFlatMask = 1 - smoothstep(12, 28, Math.hypot(x + 25, z - 485));
  if (southFlatMask > 0) {
    h = THREE.MathUtils.lerp(h, 25.0, southFlatMask * 0.94);
  }

  // 5. Natural amphitheater mountain foothills around the 1920x1920 outer perimeter
  const rimFactor = smoothstep(690, 945, distFromCenter);
  h += rimFactor * rimFactor * 52.0;

  // Guarantee dry meadow valleys stay cleanly above water level outside intentional rivers/lakes
  h = Math.max(h, GLADE_WATER_LEVEL + 0.85);

  // 6. Smooth water basin carving (river, sakura tributary stream, and 3 lakes)
  const water = evaluateGladeWaterCarve(x, z);
  if (water.shoreBlend > 0.001) {
    const bankTarget = GLADE_WATER_LEVEL + 1.75;
    h = THREE.MathUtils.lerp(h, Math.min(h, bankTarget), water.shoreBlend * 0.86);
  }
  if (water.carveDepth > 0.001) {
    const bedTarget = GLADE_WATER_LEVEL - water.carveDepth;
    const carveWeight = smoothstep(0.0, 0.72, water.carveDepth);
    h = THREE.MathUtils.lerp(h, bedTarget, carveWeight);
  }
  // Raise the blossom island cleanly in the center of Mirror Blossom Lake
  if (water.islandMask > 0.001) {
    const islandTop = GLADE_WATER_LEVEL + 2.55;
    h = THREE.MathUtils.lerp(h, islandTop, water.islandMask);
  }

  // 7. Gentle footpath grading on dry land so roads remain smooth and walkable
  const trailDist = getGladeTrailDistance(x, z);
  if (trailDist < GLADE_TRAIL_HALF_WIDTH + 5.5 && h > GLADE_WATER_LEVEL + 0.35) {
    const trailBlend =
      1 - smoothstep(GLADE_TRAIL_HALF_WIDTH, GLADE_TRAIL_HALF_WIDTH + 5.5, trailDist);
    h -= detail * 0.48 * trailBlend;
  }

  return h;
}

export function getGladeGroundNormal(
  x: number,
  z: number,
  target: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const eps = 0.9;
  const hL = getGladeGroundHeight(x - eps, z);
  const hR = getGladeGroundHeight(x + eps, z);
  const hD = getGladeGroundHeight(x, z - eps);
  const hU = getGladeGroundHeight(x, z + eps);
  return target.set(hL - hR, 2 * eps, hD - hU).normalize();
}

export function isPointInGladeWater(x: number, z: number, margin = 0.0): boolean {
  return getGladeGroundHeight(x, z) < GLADE_WATER_LEVEL + margin;
}

// ---------------------------------------------------------------------------
// Landmark Anchors (13 Spacious, Geographically Logical Landmarks)
// ---------------------------------------------------------------------------

export function getGladeArchwayAnchor(): { x: number; y: number; z: number; yaw: number } {
  const z = GLADE_ARCHWAY_Z;
  const x = getGladeTrailCenterX(z);
  const y = getGladeGroundHeight(x, z);
  const dxDz = Math.cos(z * 0.022) * 12.5 * 0.022 - 0.045;
  const yaw = Math.atan2(dxDz, 1);
  return { x, y, z, yaw };
}

export function getGladeLandmarkAnchors(): readonly GladeLandmarkAnchor[] {
  const arch = getGladeArchwayAnchor();

  // Main arched wooden bridge where the central spine road crosses the Sakura Tributary Stream
  const bridgeZ = 10.5;
  const bridgeX = getGladeTrailCenterX(bridgeZ);
  const bridgeSlope = Math.cos(bridgeZ * 0.022) * 12.5 * 0.022 - 0.045;
  const bridgeYaw = Math.atan2(bridgeSlope, 1);

  // Vermilion Moon Bridge arching from Mirror Blossom Lake's eastern shore onto the blossom island
  const sakuraLake = GLADE_LAKES[0];
  const sakuraBridgeX = sakuraLake.x + 33.5;
  const sakuraBridgeZ = sakuraLake.z + 1.0;

  // Vermilion Torii Gate welcoming travelers halfway down the West Sakura Sanctuary Road
  const toriiX = -115;
  const toriiZ = getSakuraBranchZ(toriiX);
  const toriiSlopeZ = (getSakuraBranchZ(toriiX + 0.75) - getSakuraBranchZ(toriiX - 0.75)) / 1.5;
  const toriiYaw = Math.atan2(1, toriiSlopeZ);

  // Sakura Lakeside Pagoda Pavilion overlooking Mirror Blossom Lake from the scenic northwest terrace
  const pavilionX = sakuraLake.x - 30;
  const pavilionZ = sakuraLake.z - 54;

  // Golden Hilltop Windmill crowning the eastern Golden Birch Highlands
  const windmillX = 248;
  const windmillZ = -72;

  // Ancient Moonstone Ruins Sanctuary crowning the northern Misty Pine Highlands plateau
  const ruinsX = -12;
  const ruinsZ = -268;

  // Emerald Lake Wooden Pier extending from the sheltered northwestern cove of Emerald Lake
  const emeraldLake = GLADE_LAKES[1];
  const pierX = emeraldLake.x - 38;
  const pierZ = emeraldLake.z - 46;

  // 5 New Outer Frontier Landmarks across the 2x expanded rolling hills:
  const obsX = 520;
  const obsZ = -440;

  const bellX = -510;
  const bellZ = 390;

  const solsticeX = 515;
  const solsticeZ = 455;

  const beaconX = -535;
  const beaconZ = -455;

  const southX = -25;
  const southZ = 485;

  return [
    {
      id: 'archway',
      x: arch.x,
      y: arch.y,
      z: arch.z,
      yaw: arch.yaw,
      clearRadius: 10.5,
    },
    {
      id: 'river-bridge',
      x: bridgeX,
      y: GLADE_WATER_LEVEL + 0.58,
      z: bridgeZ,
      yaw: bridgeYaw,
      clearRadius: 11.0,
    },
    {
      id: 'sakura-bridge',
      x: sakuraBridgeX,
      y: GLADE_WATER_LEVEL + 0.52,
      z: sakuraBridgeZ,
      yaw: Math.PI * 0.5,
      clearRadius: 11.5,
    },
    {
      id: 'torii-gate',
      x: toriiX,
      y: getGladeGroundHeight(toriiX, toriiZ),
      z: toriiZ,
      yaw: toriiYaw,
      clearRadius: 9.0,
    },
    {
      id: 'sakura-pavilion',
      x: pavilionX,
      y: getGladeGroundHeight(pavilionX, pavilionZ),
      z: pavilionZ,
      yaw: 0.52,
      clearRadius: 14.0,
    },
    {
      id: 'windmill',
      x: windmillX,
      y: getGladeGroundHeight(windmillX, windmillZ),
      z: windmillZ,
      yaw: -0.72,
      clearRadius: 16.0,
    },
    {
      id: 'moonstone-ruins',
      x: ruinsX,
      y: getGladeGroundHeight(ruinsX, ruinsZ),
      z: ruinsZ,
      yaw: 0.14,
      clearRadius: 21.0,
    },
    {
      id: 'emerald-pier',
      x: pierX,
      y: GLADE_WATER_LEVEL + 0.6,
      z: pierZ,
      yaw: 0.62,
      clearRadius: 12.0,
    },
    {
      id: 'sky-observatory',
      x: obsX,
      y: getGladeGroundHeight(obsX, obsZ),
      z: obsZ,
      yaw: -0.78,
      clearRadius: 22.0,
    },
    {
      id: 'sunset-bell-tower',
      x: bellX,
      y: getGladeGroundHeight(bellX, bellZ),
      z: bellZ,
      yaw: 0.68,
      clearRadius: 18.0,
    },
    {
      id: 'solstice-sanctuary',
      x: solsticeX,
      y: getGladeGroundHeight(solsticeX, solsticeZ),
      z: solsticeZ,
      yaw: -2.25,
      clearRadius: 23.0,
    },
    {
      id: 'cloudcrest-beacon',
      x: beaconX,
      y: getGladeGroundHeight(beaconX, beaconZ),
      z: beaconZ,
      yaw: 0.85,
      clearRadius: 18.0,
    },
    {
      id: 'south-overlook',
      x: southX,
      y: getGladeGroundHeight(southX, southZ),
      z: southZ,
      yaw: Math.PI,
      clearRadius: 17.0,
    },
  ];
}

export function getGladeLandmarkById(
  id: GladeLandmarkAnchor['id'],
): GladeLandmarkAnchor {
  const found = getGladeLandmarkAnchors().find((a) => a.id === id);
  if (!found) {
    throw new Error(`Unknown Autumn Glade landmark id: ${id}`);
  }
  return found;
}
