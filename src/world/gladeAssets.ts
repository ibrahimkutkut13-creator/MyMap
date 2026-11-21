import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  DRACO_DECODER_PATH,
  STYLIZED_ASSET_BASE_URL,
  computeNormalizedModelScale,
  dequantizeBufferGeometry,
  type FoliageLoadStats,
} from './foliageAssets';
import {
  createStylizedAAFoliageMaterial,
  updateStylizedAAShaderTime,
  type StylizedAAAssetCategory,
} from './stylizedAAShader';

// ---------------------------------------------------------------------------
// Complete 99-Asset Stylized AA Environment Catalog (Autumn Glade)
// ---------------------------------------------------------------------------

export const GLADE_BIRCH_FILES = [
  'BirchTree_1.glb',
  'BirchTree_2.glb',
  'BirchTree_3.glb',
  'BirchTree_4.glb',
  'BirchTree_5.glb',
] as const;

export const GLADE_MAPLE_FILES = [
  'MapleTree_1.glb',
  'MapleTree_2.glb',
  'MapleTree_3.glb',
  'MapleTree_4.glb',
  'MapleTree_5.glb',
] as const;

export const GLADE_COMMON_TREE_FILES = [
  'CommonTree_1.glb',
  'CommonTree_2.glb',
  'CommonTree_3.glb',
  'CommonTree_4.glb',
  'CommonTree_5.glb',
] as const;

export const GLADE_PINE_FILES = [
  'Pine_1.glb',
  'Pine_2.glb',
  'Pine_3.glb',
  'Pine_4.glb',
  'Pine_5.glb',
] as const;

export const GLADE_TWISTED_TREE_FILES = [
  'TwistedTree_1.glb',
  'TwistedTree_2.glb',
  'TwistedTree_3.glb',
  'TwistedTree_4.glb',
  'TwistedTree_5.glb',
] as const;

export const GLADE_DEAD_TREE_FILES = [
  'DeadTree_1.glb',
  'DeadTree_2.glb',
  'DeadTree_3.glb',
  'DeadTree_4.glb',
  'DeadTree_5.glb',
  'DeadTree_6.glb',
  'DeadTree_7.glb',
  'DeadTree_8.glb',
  'DeadTree_9.glb',
  'DeadTree_10.glb',
] as const;

export const GLADE_BUSH_FILES = [
  'Bush.glb',
  'Bush_Common.glb',
  'Bush_Common_Flowers.glb',
  'Bush_Flowers.glb',
  'Bush_Large.glb',
  'Bush_Large_Flowers.glb',
  'Bush_Small.glb',
  'Bush_Small_Flowers.glb',
] as const;

export const GLADE_PLANT_FILES = [
  'Clover_1.glb',
  'Clover_2.glb',
  'Fern_1.glb',
  'Plant_1.glb',
  'Plant_1_Big.glb',
  'Plant_7.glb',
  'Plant_7_Big.glb',
] as const;

export const GLADE_GRASS_FILES = [
  'Grass_Common_Short.glb',
  'Grass_Common_Tall.glb',
  'Grass_Large.glb',
  'Grass_Large_Extruded.glb',
  'Grass_Small.glb',
  'Grass_Wispy_Short.glb',
  'Grass_Wispy_Tall.glb',
] as const;

export const GLADE_FLOWER_FILES = [
  'Flower_1.glb',
  'Flower_1_Clump.glb',
  'Flower_2.glb',
  'Flower_2_Clump.glb',
  'Flower_3_Clump.glb',
  'Flower_3_Group.glb',
  'Flower_3_Single.glb',
  'Flower_4_Clump.glb',
  'Flower_4_Group.glb',
  'Flower_4_Single.glb',
  'Flower_5_Clump.glb',
] as const;

export const GLADE_PETAL_FILES = [
  'Petal_1.glb',
  'Petal_2.glb',
  'Petal_3.glb',
  'Petal_4.glb',
  'Petal_5.glb',
] as const;

export const GLADE_MUSHROOM_FILES = [
  'Mushroom_Common.glb',
  'Mushroom_Laetiporus.glb',
] as const;

export const GLADE_ROCK_FILES = [
  'Rock_Medium_1.glb',
  'Rock_Medium_2.glb',
  'Rock_Medium_3.glb',
] as const;

export const GLADE_PATH_STONE_FILES = [
  'Pebble_Round_1.glb',
  'Pebble_Round_2.glb',
  'Pebble_Round_3.glb',
  'Pebble_Round_4.glb',
  'Pebble_Round_5.glb',
  'Pebble_Square_1.glb',
  'Pebble_Square_2.glb',
  'Pebble_Square_3.glb',
  'Pebble_Square_4.glb',
  'Pebble_Square_5.glb',
  'Pebble_Square_6.glb',
  'RockPath_Round_Small_1.glb',
  'RockPath_Round_Small_2.glb',
  'RockPath_Round_Small_3.glb',
  'RockPath_Round_Thin.glb',
  'RockPath_Round_Wide.glb',
  'RockPath_Square_Small_1.glb',
  'RockPath_Square_Small_2.glb',
  'RockPath_Square_Small_3.glb',
  'RockPath_Square_Thin.glb',
  'RockPath_Square_Wide.glb',
] as const;

export interface GladeAssetSpec {
  readonly id: string;
  readonly filename: string;
  readonly url: string;
  readonly category: StylizedAAAssetCategory;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly targetHeight: number;
  readonly sinkDepth: number;
  readonly instanceTints: readonly string[];
}

function makeGladeSpec(
  filename: string,
  category: StylizedAAAssetCategory,
  targetHeight: number,
  sinkDepth: number,
  instanceTints: readonly string[],
): GladeAssetSpec {
  // Trees, bushes, and rocks cast & receive shadows (leaf cutouts disable receiveShadow per-part).
  // Grass tufts receive soft tree shadows without casting spiky shadows (receiveShadow=true, castShadow=false).
  // Tiny flowers, petals, clovers, mushrooms, and trail-edge pebbles skip shadows for clean 60 FPS.
  const castShadow =
    category !== 'grass' &&
    category !== 'flower' &&
    category !== 'petal' &&
    category !== 'plant' &&
    category !== 'mushroom' &&
    category !== 'pathStone';
  const receiveShadow =
    category === 'grass' || castShadow;
  return {
    id: filename.replace(/\.glb$/i, ''),
    filename,
    url: `${STYLIZED_ASSET_BASE_URL}${filename}`,
    category,
    castShadow,
    receiveShadow,
    targetHeight,
    sinkDepth,
    instanceTints,
  };
}

const BIRCH_TINTS = ['#ffffff', '#fff8d4', '#fff2bf', '#f8ffe0'] as const;
const MAPLE_TINTS = ['#ffffff', '#fff2d9', '#ffe8cf', '#fff6e0'] as const;
const COMMON_TREE_TINTS = ['#ffffff', '#edffdb', '#e0ffeb', '#f2ffd9'] as const;
const SAKURA_TINTS = ['#ffffff', '#ffebf5', '#ffe0f0', '#fff5fa'] as const;
const PINE_TINTS = ['#ffffff', '#e0ffef', '#d9faf5', '#ebffe6'] as const;
const TWISTED_TREE_TINTS = ['#ffffff', '#edffd9', '#fff7d6', '#e0ffeb'] as const;
const DEAD_TREE_TINTS = ['#ffffff', '#f5f2eb', '#ebf0f5', '#f7f3eb'] as const;
const BUSH_TINTS = ['#ffffff', '#ebffd9', '#f2ffd9', '#e0ffeb'] as const;
const PLANT_TINTS = ['#ffffff', '#e6ffcf', '#f0ffd6', '#d9ffde'] as const;
const GRASS_TINTS = ['#ffffff', '#f5ffd9', '#ecffde', '#faffdb'] as const;
const FLOWER_TINTS = ['#ffffff', '#fffbe8', '#f2faff', '#fff2f8'] as const;
const PETAL_TINTS = ['#ffffff', '#fff7e0', '#ffeef5', '#f2fbff'] as const;
const MUSHROOM_TINTS = ['#ffffff', '#fff6e6', '#fff0eb'] as const;
const ROCK_TINTS = ['#ffffff', '#edf5fa', '#f5f3ed', '#e6f0f7'] as const;
const PATH_STONE_TINTS = ['#ffffff', '#f7f3e8', '#eef3f5', '#f5efe4'] as const;

export const GLADE_ASSET_CATALOG: readonly GladeAssetSpec[] = [
  // Birch Trees (5)
  makeGladeSpec('BirchTree_1.glb', 'birch', 9.6, 0.22, BIRCH_TINTS),
  makeGladeSpec('BirchTree_2.glb', 'birch', 9.0, 0.22, BIRCH_TINTS),
  makeGladeSpec('BirchTree_3.glb', 'birch', 10.6, 0.24, BIRCH_TINTS),
  makeGladeSpec('BirchTree_4.glb', 'birch', 8.6, 0.22, BIRCH_TINTS),
  makeGladeSpec('BirchTree_5.glb', 'birch', 10.0, 0.24, BIRCH_TINTS),

  // Maple Trees (5)
  makeGladeSpec('MapleTree_1.glb', 'maple', 9.5, 0.22, MAPLE_TINTS),
  makeGladeSpec('MapleTree_2.glb', 'maple', 8.8, 0.22, MAPLE_TINTS),
  makeGladeSpec('MapleTree_3.glb', 'maple', 10.2, 0.24, MAPLE_TINTS),
  makeGladeSpec('MapleTree_4.glb', 'maple', 9.0, 0.22, MAPLE_TINTS),
  makeGladeSpec('MapleTree_5.glb', 'maple', 10.8, 0.24, MAPLE_TINTS),

  // Lush Common Trees (5 — NEW)
  makeGladeSpec('CommonTree_1.glb', 'commonTree', 9.8, 0.24, COMMON_TREE_TINTS),
  makeGladeSpec('CommonTree_2.glb', 'commonTree', 9.2, 0.22, COMMON_TREE_TINTS),
  makeGladeSpec('CommonTree_3.glb', 'commonTree', 10.6, 0.25, COMMON_TREE_TINTS),
  makeGladeSpec('CommonTree_4.glb', 'commonTree', 8.8, 0.22, COMMON_TREE_TINTS),
  makeGladeSpec('CommonTree_5.glb', 'commonTree', 10.2, 0.24, COMMON_TREE_TINTS),

  // Evergreen Pines (5 — NEW)
  makeGladeSpec('Pine_1.glb', 'pine', 11.4, 0.26, PINE_TINTS),
  makeGladeSpec('Pine_2.glb', 'pine', 10.4, 0.24, PINE_TINTS),
  makeGladeSpec('Pine_3.glb', 'pine', 12.2, 0.28, PINE_TINTS),
  makeGladeSpec('Pine_4.glb', 'pine', 9.8, 0.24, PINE_TINTS),
  makeGladeSpec('Pine_5.glb', 'pine', 11.6, 0.26, PINE_TINTS),

  // Expressive Twisted Trees (5 — NEW)
  makeGladeSpec('TwistedTree_1.glb', 'twistedTree', 8.8, 0.22, TWISTED_TREE_TINTS),
  makeGladeSpec('TwistedTree_2.glb', 'twistedTree', 9.4, 0.24, TWISTED_TREE_TINTS),
  makeGladeSpec('TwistedTree_3.glb', 'twistedTree', 8.4, 0.22, TWISTED_TREE_TINTS),
  makeGladeSpec('TwistedTree_4.glb', 'twistedTree', 9.8, 0.24, TWISTED_TREE_TINTS),
  makeGladeSpec('TwistedTree_5.glb', 'twistedTree', 9.0, 0.22, TWISTED_TREE_TINTS),

  // Ancient Sculptural Dead Trees (10)
  makeGladeSpec('DeadTree_1.glb', 'deadTree', 8.4, 0.24, DEAD_TREE_TINTS),
  makeGladeSpec('DeadTree_2.glb', 'deadTree', 7.8, 0.24, DEAD_TREE_TINTS),
  makeGladeSpec('DeadTree_3.glb', 'deadTree', 9.0, 0.26, DEAD_TREE_TINTS),
  makeGladeSpec('DeadTree_4.glb', 'deadTree', 7.4, 0.24, DEAD_TREE_TINTS),
  makeGladeSpec('DeadTree_5.glb', 'deadTree', 6.8, 0.22, DEAD_TREE_TINTS),
  makeGladeSpec('DeadTree_6.glb', 'deadTree', 8.6, 0.24, DEAD_TREE_TINTS),
  makeGladeSpec('DeadTree_7.glb', 'deadTree', 8.0, 0.24, DEAD_TREE_TINTS),
  makeGladeSpec('DeadTree_8.glb', 'deadTree', 9.2, 0.26, DEAD_TREE_TINTS),
  makeGladeSpec('DeadTree_9.glb', 'deadTree', 7.0, 0.22, DEAD_TREE_TINTS),
  makeGladeSpec('DeadTree_10.glb', 'deadTree', 8.2, 0.24, DEAD_TREE_TINTS),

  // Bushes & Flowering Shrubs (8 — +2 NEW)
  makeGladeSpec('Bush.glb', 'bush', 1.7, 0.14, BUSH_TINTS),
  makeGladeSpec('Bush_Common.glb', 'bush', 1.75, 0.14, BUSH_TINTS),
  makeGladeSpec('Bush_Common_Flowers.glb', 'bush', 1.8, 0.14, BUSH_TINTS),
  makeGladeSpec('Bush_Flowers.glb', 'bush', 1.75, 0.14, BUSH_TINTS),
  makeGladeSpec('Bush_Large.glb', 'bush', 2.35, 0.18, BUSH_TINTS),
  makeGladeSpec('Bush_Large_Flowers.glb', 'bush', 2.4, 0.18, BUSH_TINTS),
  makeGladeSpec('Bush_Small.glb', 'bush', 1.2, 0.1, BUSH_TINTS),
  makeGladeSpec('Bush_Small_Flowers.glb', 'bush', 1.25, 0.1, BUSH_TINTS),

  // Clovers, Ferns & Ground Plants (7 — ALL NEW, shadows disabled)
  makeGladeSpec('Clover_1.glb', 'plant', 0.28, 0.03, PLANT_TINTS),
  makeGladeSpec('Clover_2.glb', 'plant', 0.3, 0.03, PLANT_TINTS),
  makeGladeSpec('Fern_1.glb', 'plant', 0.78, 0.05, PLANT_TINTS),
  makeGladeSpec('Plant_1.glb', 'plant', 0.44, 0.04, PLANT_TINTS),
  makeGladeSpec('Plant_1_Big.glb', 'plant', 0.62, 0.05, PLANT_TINTS),
  makeGladeSpec('Plant_7.glb', 'plant', 0.42, 0.04, PLANT_TINTS),
  makeGladeSpec('Plant_7_Big.glb', 'plant', 0.58, 0.05, PLANT_TINTS),

  // Grass Clumps (7 — +4 NEW, shadows disabled)
  makeGladeSpec('Grass_Common_Short.glb', 'grass', 0.56, 0.05, GRASS_TINTS),
  makeGladeSpec('Grass_Common_Tall.glb', 'grass', 0.92, 0.06, GRASS_TINTS),
  makeGladeSpec('Grass_Large.glb', 'grass', 0.94, 0.06, GRASS_TINTS),
  makeGladeSpec('Grass_Large_Extruded.glb', 'grass', 1.0, 0.06, GRASS_TINTS),
  makeGladeSpec('Grass_Small.glb', 'grass', 0.62, 0.05, GRASS_TINTS),
  makeGladeSpec('Grass_Wispy_Short.glb', 'grass', 0.58, 0.05, GRASS_TINTS),
  makeGladeSpec('Grass_Wispy_Tall.glb', 'grass', 0.96, 0.06, GRASS_TINTS),

  // Wildflowers (11 — +4 NEW, shadows disabled)
  makeGladeSpec('Flower_1.glb', 'flower', 0.58, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_1_Clump.glb', 'flower', 0.68, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_2.glb', 'flower', 0.58, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_2_Clump.glb', 'flower', 0.7, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_3_Clump.glb', 'flower', 0.66, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_3_Group.glb', 'flower', 0.64, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_3_Single.glb', 'flower', 0.56, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_4_Clump.glb', 'flower', 0.7, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_4_Group.glb', 'flower', 0.66, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_4_Single.glb', 'flower', 0.56, 0.04, FLOWER_TINTS),
  makeGladeSpec('Flower_5_Clump.glb', 'flower', 0.68, 0.04, FLOWER_TINTS),

  // Ground Fallen Petals (5 — ALL NEW, shadows disabled)
  makeGladeSpec('Petal_1.glb', 'petal', 0.14, 0.01, PETAL_TINTS),
  makeGladeSpec('Petal_2.glb', 'petal', 0.14, 0.01, PETAL_TINTS),
  makeGladeSpec('Petal_3.glb', 'petal', 0.14, 0.01, PETAL_TINTS),
  makeGladeSpec('Petal_4.glb', 'petal', 0.14, 0.01, PETAL_TINTS),
  makeGladeSpec('Petal_5.glb', 'petal', 0.14, 0.01, PETAL_TINTS),

  // Woodland Mushrooms (2 — ALL NEW, shadows disabled)
  makeGladeSpec('Mushroom_Common.glb', 'mushroom', 0.42, 0.03, MUSHROOM_TINTS),
  makeGladeSpec('Mushroom_Laetiporus.glb', 'mushroom', 0.48, 0.03, MUSHROOM_TINTS),

  // Angular Medium Rocks (3 — ALL NEW, cast & receive shadows)
  makeGladeSpec('Rock_Medium_1.glb', 'rock', 1.85, 0.24, ROCK_TINTS),
  makeGladeSpec('Rock_Medium_2.glb', 'rock', 1.65, 0.22, ROCK_TINTS),
  makeGladeSpec('Rock_Medium_3.glb', 'rock', 2.05, 0.26, ROCK_TINTS),

  // Pebbles & Stepping Path Stones (21 — ALL NEW, shadows disabled)
  makeGladeSpec('Pebble_Round_1.glb', 'pathStone', 0.24, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Round_2.glb', 'pathStone', 0.24, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Round_3.glb', 'pathStone', 0.26, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Round_4.glb', 'pathStone', 0.22, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Round_5.glb', 'pathStone', 0.25, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Square_1.glb', 'pathStone', 0.24, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Square_2.glb', 'pathStone', 0.25, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Square_3.glb', 'pathStone', 0.23, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Square_4.glb', 'pathStone', 0.26, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Square_5.glb', 'pathStone', 0.24, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('Pebble_Square_6.glb', 'pathStone', 0.25, 0.03, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Round_Small_1.glb', 'pathStone', 0.16, 0.04, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Round_Small_2.glb', 'pathStone', 0.16, 0.04, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Round_Small_3.glb', 'pathStone', 0.16, 0.04, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Round_Thin.glb', 'pathStone', 0.15, 0.04, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Round_Wide.glb', 'pathStone', 0.18, 0.04, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Square_Small_1.glb', 'pathStone', 0.16, 0.04, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Square_Small_2.glb', 'pathStone', 0.16, 0.04, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Square_Small_3.glb', 'pathStone', 0.16, 0.04, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Square_Thin.glb', 'pathStone', 0.15, 0.04, PATH_STONE_TINTS),
  makeGladeSpec('RockPath_Square_Wide.glb', 'pathStone', 0.18, 0.04, PATH_STONE_TINTS),
];

export const GLADE_ASSET_BY_ID: Readonly<Record<string, GladeAssetSpec>> =
  Object.fromEntries(GLADE_ASSET_CATALOG.map((spec) => [spec.id, spec]));

// ---------------------------------------------------------------------------
// Placement Types & Shared Cached GLB Loader (Stylized Anime AA Shader)
// ---------------------------------------------------------------------------

export interface GladeAssetPlacement {
  readonly modelId: string;
  readonly category: StylizedAAAssetCategory;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly tiltX: number;
  readonly tiltZ: number;
  readonly scale: number;
  readonly tintIndex: number;
  /** When true, uses the dedicated soft Ghibli crimson-to-tangerine autumn shader on canopy leaves only. */
  readonly isForegroundHeroMaple?: boolean;
  /** When true, renders the tree's leaf canopy with the luminous pink Sakura cherry blossom shader. */
  readonly isSakura?: boolean;
}

export interface GladeAssetPlan {
  readonly placementsByModel: Readonly<Record<string, readonly GladeAssetPlacement[]>>;
  readonly liveTreePlacements: readonly GladeAssetPlacement[];
  readonly deadTreePlacements: readonly GladeAssetPlacement[];
  readonly bushPlacements: readonly GladeAssetPlacement[];
  readonly plantPlacements: readonly GladeAssetPlacement[];
  readonly grassPlacements: readonly GladeAssetPlacement[];
  readonly flowerPlacements: readonly GladeAssetPlacement[];
  readonly petalPlacements: readonly GladeAssetPlacement[];
  readonly mushroomPlacements: readonly GladeAssetPlacement[];
  readonly rockPlacements: readonly GladeAssetPlacement[];
  readonly pathStonePlacements: readonly GladeAssetPlacement[];
  readonly totalInstances: number;
}

interface ExtractedGladePart {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshToonMaterial | THREE.MeshToonMaterial[];
  readonly name: string;
  /** True ONLY for tree/bush canopy leaf cutouts (castShadow=true, receiveShadow=false). */
  readonly isCanopyCutout: boolean;
  readonly canopyCenter: THREE.Vector3;
  readonly canopyRadius: THREE.Vector3;
}

interface CachedGladeModel {
  readonly parts: readonly ExtractedGladePart[];
  readonly textures: readonly THREE.Texture[];
  readonly materials: readonly THREE.MeshToonMaterial[];
}

interface GladeCacheEntry {
  readonly models: Map<string, CachedGladeModel>;
  readonly allMaterials: readonly THREE.MeshToonMaterial[];
  readonly failedModels: readonly string[];
}

let gladeCachePromise: Promise<GladeCacheEntry> | null = null;
let resolvedGladeCache: GladeCacheEntry | null = null;

/**
 * Softens sharp faceted GLB rock geometry by applying gentle position-welded
 * Laplacian rounding and computing watertight smoothed vertex normals while
 * preserving UV coordinates cleanly.
 */
function smoothRockGeometry(geometry: THREE.BufferGeometry, iterations = 2): void {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr || posAttr.count < 3) return;

  const keyFor = (x: number, y: number, z: number) =>
    `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;

  // Map vertices by spatial position so split UV/normal seams stay watertight
  const posGroups = new Map<string, number[]>();
  const vertToGroup = new Int32Array(posAttr.count);
  const groupKeys: string[] = [];

  for (let i = 0; i < posAttr.count; i += 1) {
    const k = keyFor(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    let list = posGroups.get(k);
    if (!list) {
      list = [];
      posGroups.set(k, list);
      groupKeys.push(k);
    }
    list.push(i);
  }

  const groupIndexByKey = new Map<string, number>();
  groupKeys.forEach((k, idx) => groupIndexByKey.set(k, idx));
  for (let i = 0; i < posAttr.count; i += 1) {
    const k = keyFor(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    vertToGroup[i] = groupIndexByKey.get(k) ?? 0;
  }

  const gCount = groupKeys.length;
  const neighbors: Set<number>[] = Array.from({ length: gCount }, () => new Set<number>());
  const index = geometry.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(posAttr.count / 3);
  const getIdx = (t: number) => (index ? index.getX(t) : t);

  for (let t = 0; t < triCount; t += 1) {
    const ga = vertToGroup[getIdx(t * 3)];
    const gb = vertToGroup[getIdx(t * 3 + 1)];
    const gc = vertToGroup[getIdx(t * 3 + 2)];
    if (ga !== gb) {
      neighbors[ga].add(gb);
      neighbors[gb].add(ga);
    }
    if (gb !== gc) {
      neighbors[gb].add(gc);
      neighbors[gc].add(gb);
    }
    if (gc !== ga) {
      neighbors[gc].add(ga);
      neighbors[ga].add(gc);
    }
  }

  const gx = new Float32Array(gCount);
  const gy = new Float32Array(gCount);
  const gz = new Float32Array(gCount);
  const nx = new Float32Array(gCount);
  const ny = new Float32Array(gCount);
  const nz = new Float32Array(gCount);

  for (let g = 0; g < gCount; g += 1) {
    const firstVert = posGroups.get(groupKeys[g])![0];
    gx[g] = posAttr.getX(firstVert);
    gy[g] = posAttr.getY(firstVert);
    gz[g] = posAttr.getZ(firstVert);
  }

  // Taubin-style shrink-free smoothing rounds sharp corners without collapsing boulder size
  const lambda = 0.36;
  const mu = -0.22;
  for (let iter = 0; iter < iterations; iter += 1) {
    for (const weight of [lambda, mu]) {
      for (let g = 0; g < gCount; g += 1) {
        const nbrs = neighbors[g];
        if (nbrs.size === 0) {
          nx[g] = gx[g];
          ny[g] = gy[g];
          nz[g] = gz[g];
          continue;
        }
        let ax = 0;
        let ay = 0;
        let az = 0;
        nbrs.forEach((nb) => {
          ax += gx[nb];
          ay += gy[nb];
          az += gz[nb];
        });
        const inv = 1 / nbrs.size;
        nx[g] = gx[g] + (ax * inv - gx[g]) * weight;
        ny[g] = gy[g] + (ay * inv - gy[g]) * weight;
        nz[g] = gz[g] + (az * inv - gz[g]) * weight;
      }
      gx.set(nx);
      gy.set(ny);
      gz.set(nz);
    }
  }

  // Write softened positions back
  for (let i = 0; i < posAttr.count; i += 1) {
    const g = vertToGroup[i];
    posAttr.setXYZ(i, gx[g], gy[g], gz[g]);
  }
  posAttr.needsUpdate = true;

  // Compute watertight smooth vertex normals welded across UV seams
  geometry.computeVertexNormals();
  const normAttr = geometry.getAttribute('normal');
  if (normAttr) {
    nx.fill(0);
    ny.fill(0);
    nz.fill(0);
    for (let i = 0; i < posAttr.count; i += 1) {
      const g = vertToGroup[i];
      nx[g] += normAttr.getX(i);
      ny[g] += normAttr.getY(i);
      nz[g] += normAttr.getZ(i);
    }
    for (let g = 0; g < gCount; g += 1) {
      const len = Math.hypot(nx[g], ny[g], nz[g]) || 1;
      nx[g] /= len;
      ny[g] /= len;
      nz[g] /= len;
    }
    for (let i = 0; i < posAttr.count; i += 1) {
      const g = vertToGroup[i];
      normAttr.setXYZ(i, nx[g], ny[g], nz[g]);
    }
    normAttr.needsUpdate = true;
  }
}

function extractStylizedAAParts(
  gltf: GLTF,
  spec: GladeAssetSpec,
  sunDirection: THREE.Vector3,
  alphaToCoverage: boolean,
  trackedTextures: Set<THREE.Texture>,
  trackedMaterials: THREE.MeshToonMaterial[],
): ExtractedGladePart[] {
  gltf.scene.updateMatrixWorld(true);

  const sourceMeshes: THREE.Mesh[] = [];
  gltf.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      sourceMeshes.push(obj);
    }
  });
  if (sourceMeshes.length === 0) return [];

  const dequantizedGeos = sourceMeshes.map((mesh) =>
    dequantizeBufferGeometry(mesh.geometry),
  );

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

  const isTreeCategory =
    spec.category === 'birch' ||
    spec.category === 'maple' ||
    spec.category === 'commonTree' ||
    spec.category === 'pine' ||
    spec.category === 'twistedTree' ||
    spec.category === 'deadTree';

  const rawSize = new THREE.Vector3();
  const rootCenter = new THREE.Vector3();
  rootBox.getSize(rawSize);
  rootBox.getCenter(rootCenter);

  const scaleFactor = computeNormalizedModelScale(rawSize.y, spec.targetHeight);
  const minY = Number.isFinite(rootBox.min.y) ? rootBox.min.y : 0;
  let centerX = Number.isFinite(rootCenter.x) ? rootCenter.x : 0;
  let centerZ = Number.isFinite(rootCenter.z) ? rootCenter.z : 0;

  // For trees, pivot accurately at the trunk base (lowest 14% of vertices) instead of
  // the full canopy bounding box center so asymmetric crowns never push trunks off slopes.
  if (isTreeCategory && rawSize.y > 0.01) {
    const baseThresholdY = minY + rawSize.y * 0.14;
    let sumX = 0;
    let sumZ = 0;
    let baseCount = 0;
    const vTmp = new THREE.Vector3();
    for (let i = 0; i < sourceMeshes.length; i += 1) {
      const posAttr = dequantizedGeos[i].getAttribute('position');
      if (!posAttr) continue;
      const matW = sourceMeshes[i].matrixWorld;
      for (let vi = 0; vi < posAttr.count; vi += 1) {
        vTmp.fromBufferAttribute(posAttr, vi).applyMatrix4(matW);
        if (vTmp.y <= baseThresholdY) {
          sumX += vTmp.x;
          sumZ += vTmp.z;
          baseCount += 1;
        }
      }
    }
    if (baseCount > 0) {
      centerX = sumX / baseCount;
      centerZ = sumZ / baseCount;
    }
  }

  const groundAndScale = new THREE.Matrix4().compose(
    new THREE.Vector3(-centerX * scaleFactor, -minY * scaleFactor, -centerZ * scaleFactor),
    new THREE.Quaternion(),
    new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor),
  );
  const bakedMatrix = new THREE.Matrix4();
  const parts: ExtractedGladePart[] = [];

  for (let i = 0; i < sourceMeshes.length; i += 1) {
    const mesh = sourceMeshes[i];
    const clonedGeo = dequantizedGeos[i];
    bakedMatrix.multiplyMatrices(groundAndScale, mesh.matrixWorld);
    clonedGeo.applyMatrix4(bakedMatrix);

    // Smooth GLB rocks & path stones so sharp faceted edges become clean, soft river-worn boulders
    if (spec.category === 'rock' || spec.category === 'pathStone') {
      smoothRockGeometry(clonedGeo, spec.category === 'rock' ? 2 : 1);
    } else if (!clonedGeo.getAttribute('normal')) {
      clonedGeo.computeVertexNormals();
    }
    clonedGeo.computeBoundingBox();
    clonedGeo.computeBoundingSphere();

    const partCenter = new THREE.Vector3(0, spec.targetHeight * 0.6, 0);
    const partHalfSize = new THREE.Vector3(
      Math.max(spec.targetHeight * 0.32, 0.4),
      Math.max(spec.targetHeight * 0.32, 0.4),
      Math.max(spec.targetHeight * 0.32, 0.4),
    );
    if (clonedGeo.boundingBox) {
      clonedGeo.boundingBox.getCenter(partCenter);
      clonedGeo.boundingBox.getSize(partHalfSize);
      partHalfSize.multiplyScalar(0.5);
      partHalfSize.set(
        Math.max(partHalfSize.x, 0.35),
        Math.max(partHalfSize.y, 0.35),
        Math.max(partHalfSize.z, 0.35),
      );
    }

    let partHasCanopyCutout = false;
    const convertOne = (origMat: THREE.Material): THREE.MeshToonMaterial => {
      const aaMat = createStylizedAAFoliageMaterial(origMat, {
        category: spec.category,
        meshName: mesh.name,
        targetHeight: spec.targetHeight,
        sunDirection,
        canopyCenter: partCenter,
        canopyRadius: partHalfSize,
        alphaToCoverage,
      });

      if (aaMat.userData.isStylizedAACanopyCrown) {
        partHasCanopyCutout = true;
      }
      if (aaMat.map) trackedTextures.add(aaMat.map);
      if (aaMat.alphaMap) trackedTextures.add(aaMat.alphaMap);
      trackedMaterials.push(aaMat);

      origMat.dispose();
      return aaMat;
    };

    const material = Array.isArray(mesh.material)
      ? mesh.material.map(convertOne)
      : convertOne(mesh.material);

    mesh.geometry.dispose();
    parts.push({
      geometry: clonedGeo,
      material,
      name: mesh.name || `${spec.id}_part_${i}`,
      isCanopyCutout: partHasCanopyCutout,
      canopyCenter: partCenter.clone(),
      canopyRadius: partHalfSize.clone(),
    });
  }

  return parts;
}

/**
 * Loads and caches all 99 compressed `.glb` stylized AA environment models
 * (DRACOLoader + MeshoptDecoder) with bounded concurrency so the browser loads
 * smoothly without starving connections.
 */
export function loadGladeAssetCache(
  sunDirection: THREE.Vector3 = new THREE.Vector3(52, 44, -84).normalize(),
  alphaToCoverage = true,
): Promise<GladeCacheEntry> {
  if (gladeCachePromise) {
    return gladeCachePromise;
  }

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  dracoLoader.preload();

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  gltfLoader.setCrossOrigin('anonymous');

  const models = new Map<string, CachedGladeModel>();
  const allMaterials: THREE.MeshToonMaterial[] = [];
  const failedModels: string[] = [];

  const queue = [...GLADE_ASSET_CATALOG];
  const concurrency = 12;

  const runWorker = async () => {
    while (queue.length > 0) {
      const spec = queue.shift();
      if (!spec) break;
      try {
        const gltf = await gltfLoader.loadAsync(spec.url);
        const localTextures = new Set<THREE.Texture>();
        const localMaterials: THREE.MeshToonMaterial[] = [];
        const parts = extractStylizedAAParts(
          gltf,
          spec,
          sunDirection,
          alphaToCoverage,
          localTextures,
          localMaterials,
        );
        models.set(spec.id, {
          parts,
          textures: Array.from(localTextures),
          materials: localMaterials,
        });
        allMaterials.push(...localMaterials);
      } catch (err) {
        failedModels.push(spec.filename);
        console.warn(`[gladeAssets] Failed to load ${spec.url}:`, err);
      }
    }
  };

  gladeCachePromise = Promise.all(
    Array.from({ length: concurrency }, () => runWorker()),
  ).then(() => {
    dracoLoader.dispose();
    const entry: GladeCacheEntry = { models, allMaterials, failedModels };
    resolvedGladeCache = entry;
    return entry;
  });

  return gladeCachePromise;
}

export function disposeGladeAssetCache(): void {
  const entry = resolvedGladeCache;
  resolvedGladeCache = null;
  gladeCachePromise = null;
  if (!entry) return;

  entry.models.forEach((cached) => {
    for (const part of cached.parts) {
      part.geometry.dispose();
    }
    for (const mat of cached.materials) {
      mat.dispose();
    }
    for (const tex of cached.textures) {
      tex.dispose();
    }
  });
  entry.models.clear();
}

export interface GladeInstancedAssetsController {
  readonly group: THREE.Group;
  readonly readyPromise: Promise<FoliageLoadStats>;
  updateWind: (elapsed: number, windMultiplier?: number) => void;
  dispose: () => void;
}

/**
 * Instantiates all 99 Stylized AA `.glb` models into `THREE.InstancedMesh`
 * batches with painterly per-instance tinting, GPU wind sway, and self-shadow
 * artifact suppression on alpha-cutout leaf cards.
 */
export function createGladeInstancedAssets(
  parent: THREE.Object3D,
  plan: GladeAssetPlan,
  options: {
    sunDirection?: THREE.Vector3;
    alphaToCoverage?: boolean;
    onLoaded?: (stats: FoliageLoadStats) => void;
  } = {},
): GladeInstancedAssetsController {
  const group = new THREE.Group();
  group.name = 'autumnGlade_stylizedAAAssets';
  parent.add(group);

  const trackedInstanced: THREE.InstancedMesh[] = [];
  const ownedHeroMaterials: THREE.MeshToonMaterial[] = [];
  let animatedMaterials: THREE.MeshToonMaterial[] = [];
  let disposed = false;

  const readyPromise = loadGladeAssetCache(
    options.sunDirection,
    options.alphaToCoverage ?? true,
  ).then((cache) => {
    let loadedModels = 0;
    let instancedMeshCount = 0;

    if (!disposed) {
      animatedMaterials = cache.allMaterials.filter((mat) => {
        const u = mat.userData.stylizedAAUniforms as { uWindStrength?: { value: number } } | undefined;
        return Boolean(u?.uWindStrength && u.uWindStrength.value > 0.001);
      });
      const dummy = new THREE.Object3D();
      // Apply YXZ order so terrain slope tilt (X/Z) aligns properly after random yaw (Y)
      dummy.rotation.order = 'YXZ';
      const tintColor = new THREE.Color();

      const addInstancedBatch = (
        spec: GladeAssetSpec,
        part: ExtractedGladePart,
        batchPlacements: readonly GladeAssetPlacement[],
        materialOverride: THREE.MeshToonMaterial | THREE.MeshToonMaterial[],
        suffix: string,
        neutralTint: boolean,
        tintPaletteOverride?: readonly string[],
      ): void => {
        if (batchPlacements.length === 0) return;
        const instanced = new THREE.InstancedMesh(
          part.geometry,
          materialOverride,
          batchPlacements.length,
        );
        instanced.name = `${spec.id}_${part.name}_${suffix}`;
        instanced.castShadow = spec.castShadow;
        // Disable receiveShadow ONLY on tree/bush leaf canopy meshes so trunks, ground, and grass
        // still receive soft grounded shadows while leaf cards never cast black speckles on themselves
        instanced.receiveShadow = part.isCanopyCutout ? false : spec.receiveShadow;

        const palette = tintPaletteOverride ?? spec.instanceTints;
        for (let i = 0; i < batchPlacements.length; i += 1) {
          const p = batchPlacements[i];
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(p.tiltX, p.rotY, p.tiltZ);
          dummy.scale.setScalar(p.scale);
          dummy.updateMatrix();
          instanced.setMatrixAt(i, dummy.matrix);

          if (neutralTint) {
            tintColor.set('#ffffff');
          } else {
            const tintHex = palette[p.tintIndex % palette.length];
            tintColor.set(tintHex);
          }
          instanced.setColorAt(i, tintColor);
        }

        instanced.instanceMatrix.needsUpdate = true;
        if (instanced.instanceColor) {
          instanced.instanceColor.needsUpdate = true;
        }
        // Compute tight bounding sphere over all instances so Three.js safely frustum-culls off-screen batches
        instanced.computeBoundingSphere();
        instanced.frustumCulled = true;

        group.add(instanced);
        trackedInstanced.push(instanced);
        instancedMeshCount += 1;
      };

      const buildHeroLeafMaterial = (
        spec: GladeAssetSpec,
        part: ExtractedGladePart,
      ): THREE.MeshToonMaterial | THREE.MeshToonMaterial[] => {
        const convertHeroOne = (baseMat: THREE.MeshToonMaterial): THREE.MeshToonMaterial => {
          if (!baseMat.userData.isStylizedAACanopyCrown) {
            return baseMat;
          }
          const heroMat = createStylizedAAFoliageMaterial(baseMat, {
            category: spec.category,
            meshName: part.name,
            targetHeight: spec.targetHeight,
            sunDirection: options.sunDirection,
            canopyCenter: part.canopyCenter,
            canopyRadius: part.canopyRadius,
            alphaToCoverage: options.alphaToCoverage ?? true,
            heroAutumnGradient: true,
          });
          ownedHeroMaterials.push(heroMat);
          animatedMaterials.push(heroMat);
          return heroMat;
        };

        return Array.isArray(part.material)
          ? part.material.map(convertHeroOne)
          : convertHeroOne(part.material);
      };

      const buildSakuraLeafMaterial = (
        spec: GladeAssetSpec,
        part: ExtractedGladePart,
      ): THREE.MeshToonMaterial | THREE.MeshToonMaterial[] => {
        const convertSakuraOne = (baseMat: THREE.MeshToonMaterial): THREE.MeshToonMaterial => {
          if (!baseMat.userData.isStylizedAACanopyCrown) {
            return baseMat;
          }
          const sakuraMat = createStylizedAAFoliageMaterial(baseMat, {
            category: 'sakura',
            meshName: part.name,
            targetHeight: spec.targetHeight,
            sunDirection: options.sunDirection,
            canopyCenter: part.canopyCenter,
            canopyRadius: part.canopyRadius,
            alphaToCoverage: options.alphaToCoverage ?? true,
          });
          ownedHeroMaterials.push(sakuraMat);
          animatedMaterials.push(sakuraMat);
          return sakuraMat;
        };

        return Array.isArray(part.material)
          ? part.material.map(convertSakuraOne)
          : convertSakuraOne(part.material);
      };

      for (const spec of GLADE_ASSET_CATALOG) {
        const placements = plan.placementsByModel[spec.id] ?? [];
        const cached = cache.models.get(spec.id);
        if (!cached) continue;

        if (placements.length > 0) {
          const standardPlacements = placements.filter(
            (p) => !p.isForegroundHeroMaple && !p.isSakura,
          );
          const heroMaplePlacements = placements.filter((p) => p.isForegroundHeroMaple);
          const sakuraPlacements = placements.filter((p) => p.isSakura);

          for (const part of cached.parts) {
            if ((heroMaplePlacements.length > 0 || sakuraPlacements.length > 0) && part.isCanopyCutout) {
              addInstancedBatch(spec, part, standardPlacements, part.material, 'aaInstanced', false);
              if (heroMaplePlacements.length > 0) {
                const heroMat = buildHeroLeafMaterial(spec, part);
                addInstancedBatch(spec, part, heroMaplePlacements, heroMat, 'heroMapleInstanced', true);
              }
              if (sakuraPlacements.length > 0) {
                const sakuraMat = buildSakuraLeafMaterial(spec, part);
                addInstancedBatch(
                  spec,
                  part,
                  sakuraPlacements,
                  sakuraMat,
                  'sakuraInstanced',
                  false,
                  SAKURA_TINTS,
                );
              }
            } else {
              addInstancedBatch(spec, part, placements, part.material, 'aaInstanced', false);
            }
          }
        }
        loadedModels += 1;
      }
    }

    const stats: FoliageLoadStats = {
      totalModels: GLADE_ASSET_CATALOG.length,
      loadedModels,
      failedModels: [...cache.failedModels],
      instancedMeshCount,
      totalInstances: plan.totalInstances,
      categoryInstances: {
        tree: plan.liveTreePlacements.length + plan.deadTreePlacements.length,
        bush: plan.bushPlacements.length + plan.plantPlacements.length,
        grass: plan.grassPlacements.length,
        flower: plan.flowerPlacements.length + plan.petalPlacements.length,
      },
    };

    if (!disposed) {
      options.onLoaded?.(stats);
    }
    return stats;
  });

  const updateWind = (elapsed: number, windMultiplier = 1.0): void => {
    if (disposed || animatedMaterials.length === 0) return;
    updateStylizedAAShaderTime(animatedMaterials, elapsed, windMultiplier);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    parent.remove(group);
    group.clear();
    for (const instanced of trackedInstanced) {
      instanced.dispose();
    }
    trackedInstanced.length = 0;
    for (const mat of ownedHeroMaterials) {
      mat.dispose();
    }
    ownedHeroMaterials.length = 0;
    animatedMaterials = [];
  };

  return {
    group,
    readyPromise,
    updateWind,
    dispose,
  };
}
