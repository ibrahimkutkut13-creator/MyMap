import * as THREE from 'three';
import {
  PATH_HALF_WIDTH,
  TERRAIN_HALF_SIZE,
  WATER_LEVEL,
  WORLD_SEED,
  createSeededRandom,
  getBridgeAnchor,
  getFordCrossing,
  getOverlookCenter,
  getPathDistance,
  getRiverSignedDistance,
  getRuinsCenter,
  getSpawnPosition,
  getTerrainBiomeAt,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainSlope,
} from './terrain';
import {
  DEFAULT_OUTLINE_COLOR,
  computeSmoothNormalsAttribute,
  createAnimeToonMaterial,
  createInkOutlineMaterial,
} from './toonMaterials';
import type { FoamObstacle, WaterController } from './water';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export type RockKind = 'boulder' | 'slab' | 'accent' | 'outcrop';

export interface RockCollider {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  kind: RockKind;
}

export interface RockPlacement {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  tintHex: string;
  kind: RockKind;
  colliderRadius: number;
  colliderHeight: number;
  registerWaterFoam: boolean;
}

export interface CreateRocksOptions {
  water?: Pick<WaterController, 'registerFoamObstacle'>;
  seed?: number;
}

export interface RocksController {
  readonly group: THREE.Group;
  readonly colliders: readonly RockCollider[];
  readonly placements: readonly RockPlacement[];
  readonly riverObstacles: readonly FoamObstacle[];
  dispose: () => void;
}

const NOOP_RAYCAST: THREE.Object3D['raycast'] = () => {};

const ROCK_TINTS: Record<RockKind, readonly string[]> = {
  boulder: ['#eef2ff', '#e4eaff', '#f2f0eb'],
  slab: ['#e9eeff', '#f3f1ea', '#dfe7fa'],
  accent: ['#f2f4ff', '#ece9e4', '#e3ebfb'],
  outcrop: ['#e8edff', '#dce3fb', '#eef0fa'],
};

// ---------------------------------------------------------------------------
// Sculpted Low-Poly Chiseled Rock Archetype Geometries
// ---------------------------------------------------------------------------

interface RockSculptConfig {
  baseRadius: number;
  detail: number;
  seed: number;
  squashY: number;
  stretchX: number;
  stretchZ: number;
  flatTopY: number | null;
  flatBottomY: number;
  facetPlanes: number;
  baseColorHex: string;
  undersideColorHex: string;
  mossColorHex: string;
  mossStrength: number;
}

/**
 * Sculpts a beveled low-poly rock BufferGeometry by applying deterministic planar
 * bevel cuts, chiseled facet flattening, and optional mossy cap vertex colors.
 * Pivoted cleanly near bottom-center so sinking into slopes leaves zero floating gaps.
 */
export function buildSculptedRockGeometry(
  config: RockSculptConfig,
): THREE.BufferGeometry {
  const rand = createSeededRandom(config.seed);
  const rawGeo = new THREE.IcosahedronGeometry(config.baseRadius, config.detail);
  const posAttr = rawGeo.getAttribute('position');

  // Generate deterministic chiseled cutting planes for Valorant/Fortnite angular facets
  const planes: Array<{ nx: number; ny: number; nz: number; dist: number }> = [];
  for (let p = 0; p < config.facetPlanes; p += 1) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const nx = Math.sin(phi) * Math.cos(theta);
    const ny = Math.cos(phi) * 0.75;
    const nz = Math.sin(phi) * Math.sin(theta);
    const inv = 1 / Math.hypot(nx, ny, nz);
    planes.push({
      nx: nx * inv,
      ny: ny * inv,
      nz: nz * inv,
      dist: config.baseRadius * (0.68 + rand() * 0.24),
    });
  }

  // Deterministic per-axis low-frequency directional warp
  const phaseX = rand() * Math.PI * 2;
  const phaseZ = rand() * Math.PI * 2;
  const v = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i += 1) {
    v.fromBufferAttribute(posAttr, i);

    // Subtle organic asymmetry before planar bevel cuts
    const angle = Math.atan2(v.z, v.x);
    const radialWarp =
      1.0 +
      0.12 * Math.sin(angle * 3.0 + phaseX) +
      0.08 * Math.cos(angle * 2.0 + phaseZ);
    v.x *= radialWarp * config.stretchX;
    v.z *= radialWarp * config.stretchZ;
    v.y *= config.squashY;

    // Gently round and shape vertices against soft boulder planes (no razor-sharp edges)
    for (let p = 0; p < planes.length; p += 1) {
      const pl = planes[p];
      const d = v.x * pl.nx + v.y * pl.ny + v.z * pl.nz;
      if (d > pl.dist) {
        const excess = d - pl.dist;
        // Soft rounded shoulder compression so edges stay clean and river-worn
        const push = excess * 0.48 * (1 - Math.exp(-excess * 2.2));
        v.x -= pl.nx * push;
        v.y -= pl.ny * push;
        v.z -= pl.nz * push;
      }
    }

    // Optional gently rounded terrace cap (for cliff outcrops & flat stepping boulders)
    if (config.flatTopY !== null && v.y > config.flatTopY) {
      v.y = config.flatTopY + (v.y - config.flatTopY) * 0.34;
    }

    // Softly flatten underside so rocks seat solidly into slopes
    if (v.y < config.flatBottomY) {
      v.y = config.flatBottomY + (v.y - config.flatBottomY) * 0.35;
    }

    posAttr.setXYZ(i, v.x, v.y, v.z);
  }

  // Shift pivot near bottom-center (bottom sits at y = -0.18 * height)
  rawGeo.computeBoundingBox();
  if (rawGeo.boundingBox) {
    const minY = rawGeo.boundingBox.min.y;
    const height = Math.max(0.01, rawGeo.boundingBox.max.y - minY);
    rawGeo.translate(0, -minY - height * 0.16, 0);
  }

  // Keep smooth vertex normals for clean, rounded stylized rocks (no sharp faceted triangles)
  const geo = rawGeo;
  geo.computeVertexNormals();
  computeSmoothNormalsAttribute(geo);
  // Copy watertight smoothed normals onto the primary normal attribute for seamless rounded shading
  const smoothAttr = geo.getAttribute('aSmoothNormal') as THREE.BufferAttribute;
  const normAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
  if (smoothAttr && normAttr && smoothAttr.count === normAttr.count) {
    (normAttr.array as Float32Array).set(smoothAttr.array as Float32Array);
    normAttr.needsUpdate = true;
  }

  // Paint stylized cool slate/limestone + subtle moss-cap vertex colors
  const gPos = geo.getAttribute('position');
  const gNorm = geo.getAttribute('normal');
  geo.computeBoundingBox();
  const minY = geo.boundingBox ? geo.boundingBox.min.y : 0;
  const maxY = geo.boundingBox ? geo.boundingBox.max.y : 1;
  const spanY = Math.max(0.01, maxY - minY);

  const baseCol = new THREE.Color(config.baseColorHex);
  const underCol = new THREE.Color(config.undersideColorHex);
  const mossCol = new THREE.Color(config.mossColorHex);
  const tempCol = new THREE.Color();
  const colors = new Float32Array(gPos.count * 3);

  for (let i = 0; i < gPos.count; i += 1) {
    const ny = gNorm.getY(i);
    const yNorm = THREE.MathUtils.clamp((gPos.getY(i) - minY) / spanY, 0, 1);

    tempCol.copy(baseCol);
    // Subtle darker underside grounding shadow
    const underT = THREE.MathUtils.smoothstep(0.35 - yNorm, 0, 0.35);
    tempCol.lerp(underCol, underT * 0.45);

    // Crisp mossy cap tint on flat top-facing facets
    if (config.mossStrength > 0) {
      const topMask =
        THREE.MathUtils.smoothstep(ny, 0.66, 0.86) *
        THREE.MathUtils.smoothstep(yNorm, 0.48, 0.72);
      tempCol.lerp(mossCol, topMask * config.mossStrength);
    }

    colors[i * 3] = tempCol.r;
    colors[i * 3 + 1] = tempCol.g;
    colors[i * 3 + 2] = tempCol.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Deterministic Seeded Rock Scattering Layout
// ---------------------------------------------------------------------------

/**
 * Generates deterministic rock placements across riverbanks, footpath edges,
 * and terraced cliff walls, enforcing clear footpaths, bridge approaches, and spawn zone.
 */
export function generateRockPlacements(seed = WORLD_SEED + 109): RockPlacement[] {
  const rand = createSeededRandom(seed);
  const placements: RockPlacement[] = [];

  const bridge = getBridgeAnchor();
  const ford = getFordCrossing();
  const spawn = getSpawnPosition();
  const ruins = getRuinsCenter();
  const overlook = getOverlookCenter();

  const isTooCloseToExisting = (x: number, z: number, minGap: number): boolean => {
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < minGap + p.colliderRadius * 0.65) {
        return true;
      }
    }
    return false;
  };

  const isInProtectedZone = (x: number, z: number, extraMargin = 0): boolean => {
    if (Math.hypot(x - bridge.position.x, z - bridge.position.z) < 11.5 + extraMargin) {
      return true;
    }
    if (Math.hypot(x - ford.center.x, z - ford.center.z) < 8.0 + extraMargin) {
      return true;
    }
    if (Math.hypot(x - spawn.x, z - spawn.z) < 8.5 + extraMargin) {
      return true;
    }
    if (Math.hypot(x - ruins.x, z - ruins.z) < 13.5 + extraMargin) {
      return true;
    }
    if (Math.hypot(x - overlook.x, z - overlook.z) < 10.5 + extraMargin) {
      return true;
    }
    return false;
  };

  const pickTint = (kind: RockKind): string => {
    const palette = ROCK_TINTS[kind];
    return palette[Math.floor(rand() * palette.length)];
  };

  // 1. Riverbank & Pond Edge Boulders (clusters framing river curves + foam rings)
  let riverAttempts = 0;
  let riverCount = 0;
  while (riverCount < 34 && riverAttempts < 1200) {
    riverAttempts += 1;
    const z = (rand() - 0.5) * 195;
    const x = (rand() - 0.5) * 105;
    const riverSdf = getRiverSignedDistance(x, z);
    if (riverSdf < -0.65 || riverSdf > 2.8) continue;

    const pathDist = getPathDistance(x, z);
    if (pathDist < PATH_HALF_WIDTH + 1.45) continue;
    if (isInProtectedZone(x, z)) continue;

    const kind: RockKind = rand() < 0.58 ? 'boulder' : 'slab';
    const baseScale = kind === 'boulder' ? 0.95 + rand() * 1.15 : 1.1 + rand() * 1.1;
    const sx = baseScale * (0.85 + rand() * 0.35);
    const sy = baseScale * (kind === 'slab' ? 0.65 + rand() * 0.28 : 0.78 + rand() * 0.35);
    const sz = baseScale * (0.85 + rand() * 0.35);
    const radius = Math.max(sx, sz) * 0.92;

    if (isTooCloseToExisting(x, z, radius * 1.15)) continue;

    const groundY = getTerrainHeight(x, z);
    const slope = getTerrainSlope(x, z);
    const sink = 0.28 + slope * 0.5 + radius * 0.14;
    const nearWater = groundY < WATER_LEVEL + 0.55 || riverSdf < 1.25;

    placements.push({
      x,
      y: groundY - sink,
      z,
      scaleX: sx,
      scaleY: sy,
      scaleZ: sz,
      rotX: (rand() - 0.5) * 0.18,
      rotY: rand() * Math.PI * 2,
      rotZ: (rand() - 0.5) * 0.18,
      tintHex: pickTint(kind),
      kind,
      colliderRadius: radius,
      colliderHeight: sy * 1.3,
      registerWaterFoam: nearWater,
    });
    riverCount += 1;

    // Occasionally add a cozy companion stone beside a hero riverbank boulder
    if (rand() < 0.45 && riverCount < 34) {
      const ang = rand() * Math.PI * 2;
      const dist = radius + 0.75 + rand() * 0.65;
      const cx = x + Math.cos(ang) * dist;
      const cz = z + Math.sin(ang) * dist;
      const cPath = getPathDistance(cx, cz);
      const cRiver = getRiverSignedDistance(cx, cz);
      if (
        cPath > PATH_HALF_WIDTH + 1.3 &&
        cRiver > -0.55 &&
        cRiver < 3.4 &&
        !isInProtectedZone(cx, cz)
      ) {
        const cs = 0.55 + rand() * 0.45;
        const cGround = getTerrainHeight(cx, cz);
        placements.push({
          x: cx,
          y: cGround - 0.25,
          z: cz,
          scaleX: cs * (0.9 + rand() * 0.25),
          scaleY: cs * (0.7 + rand() * 0.25),
          scaleZ: cs * (0.9 + rand() * 0.25),
          rotX: (rand() - 0.5) * 0.2,
          rotY: rand() * Math.PI * 2,
          rotZ: (rand() - 0.5) * 0.2,
          tintHex: pickTint('accent'),
          kind: 'accent',
          colliderRadius: cs * 0.85,
          colliderHeight: cs * 1.1,
          registerWaterFoam: cGround < WATER_LEVEL + 0.5 || cRiver < 1.1,
        });
        riverCount += 1;
      }
    }
  }

  // 2. Footpath-Edge Accent Stones (framing dirt trails without obstructing walkability)
  let pathAttempts = 0;
  let pathCount = 0;
  while (pathCount < 28 && pathAttempts < 1400) {
    pathAttempts += 1;
    const x = (rand() - 0.5) * 140;
    const z = (rand() - 0.5) * 140;
    const pathDist = getPathDistance(x, z);
    if (pathDist < PATH_HALF_WIDTH + 1.05 || pathDist > PATH_HALF_WIDTH + 3.6) {
      continue;
    }

    const biome = getTerrainBiomeAt(x, z);
    if (biome !== 'meadow') continue;
    if (isInProtectedZone(x, z, -1.5)) continue;

    const scale = 0.55 + rand() * 0.65;
    const sx = scale * (0.85 + rand() * 0.35);
    const sy = scale * (0.62 + rand() * 0.32);
    const sz = scale * (0.85 + rand() * 0.35);
    const radius = Math.max(sx, sz) * 0.88;

    if (isTooCloseToExisting(x, z, radius * 1.6 + 1.2)) continue;

    const groundY = getTerrainHeight(x, z);
    const slope = getTerrainSlope(x, z);

    placements.push({
      x,
      y: groundY - (0.25 + slope * 0.45),
      z,
      scaleX: sx,
      scaleY: sy,
      scaleZ: sz,
      rotX: (rand() - 0.5) * 0.16,
      rotY: rand() * Math.PI * 2,
      rotZ: (rand() - 0.5) * 0.16,
      tintHex: pickTint('accent'),
      kind: 'accent',
      colliderRadius: radius,
      colliderHeight: sy * 1.15,
      registerWaterFoam: false,
    });
    pathCount += 1;
  }

  // 3. Flat-Topped Cliff Outcrops protruding from terraced #7b8cde cliff faces
  const tempNormal = new THREE.Vector3();
  let cliffAttempts = 0;
  let cliffCount = 0;
  while (cliffCount < 26 && cliffAttempts < 2400) {
    cliffAttempts += 1;
    const x = (rand() - 0.5) * (TERRAIN_HALF_SIZE * 1.75);
    const z = (rand() - 0.5) * (TERRAIN_HALF_SIZE * 1.75);

    const groundY = getTerrainHeight(x, z);
    if (groundY < 3.4 || groundY > 17.5) continue;

    const slope = getTerrainSlope(x, z);
    if (slope < 0.38) continue;

    const pathDist = getPathDistance(x, z);
    if (pathDist < PATH_HALF_WIDTH + 3.2) continue;
    if (isInProtectedZone(x, z, 2.0)) continue;

    const baseScale = 2.0 + rand() * 1.7;
    const sx = baseScale * (1.05 + rand() * 0.35);
    const sy = baseScale * (0.68 + rand() * 0.32);
    const sz = baseScale * (0.88 + rand() * 0.32);
    const radius = Math.max(sx, sz) * 0.9;

    if (isTooCloseToExisting(x, z, radius * 1.45)) continue;

    getTerrainNormal(x, z, tempNormal);
    const facingYaw = Math.atan2(tempNormal.x, tempNormal.z) + (rand() - 0.5) * 0.45;
    // Deep embed so flat-topped cliff shelves jut solidly out of terraced hillsides without perching
    const sink = 1.1 + slope * 1.4 + sy * 0.42;

    placements.push({
      x,
      y: groundY - sink,
      z,
      scaleX: sx,
      scaleY: sy,
      scaleZ: sz,
      rotX: (rand() - 0.5) * 0.08,
      rotY: facingYaw,
      rotZ: (rand() - 0.5) * 0.08,
      tintHex: pickTint('outcrop'),
      kind: 'outcrop',
      colliderRadius: radius,
      colliderHeight: sy * 1.45,
      registerWaterFoam: false,
    });
    cliffCount += 1;
  }

  return placements;
}

// ---------------------------------------------------------------------------
// Rocks System Factory (Instanced 2-Tone Cel Shading + Watertight Outlines)
// ---------------------------------------------------------------------------

/**
 * Builds and scatters beveled low-poly boulders, path accent stones, and flat-topped
 * cliff outcrops with 2-tone cel shading, plum-ink outlines, and water foam registration.
 */
export function createRocks(
  scene?: THREE.Scene,
  options: CreateRocksOptions = {},
): RocksController {
  const placements = generateRockPlacements(options.seed ?? WORLD_SEED + 109);
  const group = new THREE.Group();
  group.name = 'stylizedRocksAndCliffs';

  const geometries: Record<RockKind, THREE.BufferGeometry> = {
    boulder: buildSculptedRockGeometry({
      baseRadius: 1.0,
      detail: 2,
      seed: 9101,
      squashY: 0.84,
      stretchX: 1.08,
      stretchZ: 0.96,
      flatTopY: 0.58,
      flatBottomY: -0.52,
      facetPlanes: 5,
      baseColorHex: '#8493c9',
      undersideColorHex: '#6371a8',
      mossColorHex: '#6ccb5f',
      mossStrength: 0.65,
    }),
    slab: buildSculptedRockGeometry({
      baseRadius: 1.0,
      detail: 2,
      seed: 9202,
      squashY: 0.62,
      stretchX: 1.25,
      stretchZ: 1.02,
      flatTopY: 0.42,
      flatBottomY: -0.45,
      facetPlanes: 6,
      baseColorHex: '#95a3d6',
      undersideColorHex: '#6d7ab2',
      mossColorHex: '#6ccb5f',
      mossStrength: 0.52,
    }),
    accent: buildSculptedRockGeometry({
      baseRadius: 0.9,
      detail: 2,
      seed: 9303,
      squashY: 0.72,
      stretchX: 1.12,
      stretchZ: 0.9,
      flatTopY: 0.48,
      flatBottomY: -0.44,
      facetPlanes: 5,
      baseColorHex: '#a9b2c9',
      undersideColorHex: '#7682a8',
      mossColorHex: '#6ccb5f',
      mossStrength: 0.38,
    }),
    outcrop: buildSculptedRockGeometry({
      baseRadius: 1.1,
      detail: 2,
      seed: 9404,
      squashY: 0.88,
      stretchX: 1.32,
      stretchZ: 1.05,
      flatTopY: 0.56,
      flatBottomY: -0.78,
      facetPlanes: 6,
      baseColorHex: '#7f8fd4',
      undersideColorHex: '#5a68ad',
      mossColorHex: '#6ccb5f',
      mossStrength: 0.78,
    }),
  };

  // Clean smooth-shaded 3-tone stylized rock material (no harsh sharp facets)
  const bodyMaterial = createAnimeToonMaterial('#ffffff', {
    steps: 3,
    vertexColors: true,
    flatShading: false,
    shadowTint: '#7a6894',
    shadowTintStrength: 0.28,
    rimColor: '#edf5ff',
    rimPower: 3.4,
    rimIntensity: 0.18,
    rimSmoothness: 0.18,
  });

  const outlineMaterials: Record<RockKind, THREE.ShaderMaterial> = {
    boulder: createInkOutlineMaterial(0.032, DEFAULT_OUTLINE_COLOR),
    slab: createInkOutlineMaterial(0.03, DEFAULT_OUTLINE_COLOR),
    accent: createInkOutlineMaterial(0.028, DEFAULT_OUTLINE_COLOR),
    outcrop: createInkOutlineMaterial(0.024, DEFAULT_OUTLINE_COLOR),
  };

  const buckets: Record<RockKind, RockPlacement[]> = {
    boulder: [],
    slab: [],
    accent: [],
    outcrop: [],
  };

  const colliders: RockCollider[] = [];
  const riverObstacles: FoamObstacle[] = [];

  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    buckets[p.kind].push(p);

    colliders.push({
      x: p.x,
      y: p.y,
      z: p.z,
      radius: p.colliderRadius,
      height: p.colliderHeight,
      kind: p.kind,
    });

    if (p.registerWaterFoam) {
      const obs: FoamObstacle = {
        x: p.x,
        z: p.z,
        radius: p.colliderRadius * 0.96,
      };
      riverObstacles.push(obs);
      options.water?.registerFoamObstacle(obs.x, obs.z, obs.radius);
    }
  }

  const dummy = new THREE.Object3D();
  const tintColor = new THREE.Color();
  const kinds: RockKind[] = ['boulder', 'slab', 'accent', 'outcrop'];
  const createdMeshes: THREE.InstancedMesh[] = [];

  for (const kind of kinds) {
    const list = buckets[kind];
    if (list.length === 0) continue;

    const geo = geometries[kind];
    const bodyMesh = new THREE.InstancedMesh(geo, bodyMaterial, list.length);
    bodyMesh.name = `rocks_${kind}_body`;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.frustumCulled = false;

    const outlineMesh = new THREE.InstancedMesh(
      geo,
      outlineMaterials[kind],
      list.length,
    );
    outlineMesh.name = `rocks_${kind}_outline`;
    outlineMesh.castShadow = false;
    outlineMesh.receiveShadow = false;
    outlineMesh.frustumCulled = false;
    outlineMesh.raycast = NOOP_RAYCAST;
    outlineMesh.userData.isInkOutline = true;

    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rotX, p.rotY, p.rotZ);
      dummy.scale.set(p.scaleX, p.scaleY, p.scaleZ);
      dummy.updateMatrix();

      bodyMesh.setMatrixAt(i, dummy.matrix);
      outlineMesh.setMatrixAt(i, dummy.matrix);

      tintColor.set(p.tintHex);
      bodyMesh.setColorAt(i, tintColor);
    }

    bodyMesh.instanceMatrix.needsUpdate = true;
    outlineMesh.instanceMatrix.needsUpdate = true;
    if (bodyMesh.instanceColor) {
      bodyMesh.instanceColor.needsUpdate = true;
    }

    group.add(bodyMesh);
    group.add(outlineMesh);
    createdMeshes.push(bodyMesh, outlineMesh);
  }

  if (scene) {
    scene.add(group);
  }

  const dispose = (): void => {
    if (group.parent) {
      group.parent.remove(group);
    }
    for (const mesh of createdMeshes) {
      mesh.dispose();
    }
    for (const kind of kinds) {
      geometries[kind].dispose();
      outlineMaterials[kind].dispose();
    }
    bodyMaterial.dispose();
  };

  return {
    group,
    colliders,
    placements,
    riverObstacles,
    dispose,
  };
}
