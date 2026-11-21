import * as THREE from 'three';
import {
  TERRAIN_SIZE,
  WATER_LEVEL,
  getRiverSlopeX,
  getTerrainHeight,
} from './terrain';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export interface FoamObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface WaterOptions {
  /** World water surface height (defaults to terrain.WATER_LEVEL). */
  waterLevel?: number;
  /** Width along X covering the river meander and mid-valley pond (default: 112). */
  width?: number;
  /** Length along Z spanning the valley (default: TERRAIN_SIZE). */
  length?: number;
  /** Grid resolution along X (default: 96). */
  segmentsX?: number;
  /** Grid resolution along Z (default: 210). */
  segmentsZ?: number;
  /** Initial sun direction vector. */
  sunDirection?: THREE.Vector3;
  /** Optional custom terrain height function (defaults to getTerrainHeight). */
  getHeight?: (x: number, z: number) => number;
  /** Optional custom 2D flow direction function (defaults to valley river flow). */
  getFlowDir?: (x: number, z: number) => readonly [number, number];
  /** Optional XZ reference point for prioritizing exact per-pixel foam obstacle rings. */
  obstaclePriorityCenter?: readonly [number, number];
}

export interface WaterController {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  update: (dt: number, elapsed: number) => void;
  setSunDirection: (dir: THREE.Vector3) => void;
  setMoodTint: (
    baseHex: THREE.ColorRepresentation,
    deepHex: THREE.ColorRepresentation,
    sparkleHex: THREE.ColorRepresentation,
    shallowHex?: THREE.ColorRepresentation,
  ) => void;
  registerFoamObstacle: (x: number, z: number, radius: number) => void;
  syncObstacles: () => void;
  getObstacles: () => readonly FoamObstacle[];
  dispose: () => void;
}

export const DEFAULT_WATER_COLORS = {
  shallow: '#6be0ff',
  base: '#38b6ff',
  deep: '#1f8ad8',
  foam: '#f4fdff',
  sparkle: '#fff8de',
} as const;

// ---------------------------------------------------------------------------
// Custom GLSL Toon Water Shader
// ---------------------------------------------------------------------------

const WATER_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute float aDepth;
attribute float aObstacleDist;
attribute vec2 aFlowDir;

uniform float uTime;

varying vec3 vWorldPos;
varying float vDepth;
varying float vObstacleDist;
varying vec2 vFlowDir;

void main() {
  vec3 pos = position;

  // Gentle vertical ripple damped cleanly to zero near shorelines & rocks
  float openWaterMask = smoothstep( 0.05, 0.55, aDepth ) * smoothstep( 0.05, 0.75, aObstacleDist );
  float waveA = sin( pos.x * 0.52 + pos.z * 0.44 + uTime * 1.85 );
  float waveB = cos( pos.x * 0.85 - pos.z * 0.62 + uTime * 2.35 );
  pos.y += ( waveA * 0.018 + waveB * 0.012 ) * openWaterMask;

  vec4 worldPosition = modelMatrix * vec4( pos, 1.0 );
  vWorldPos = worldPosition.xyz;
  vDepth = aDepth;
  vObstacleDist = aObstacleDist;
  vFlowDir = aFlowDir;

  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const MAX_EXACT_FOAM_OBSTACLES = 12;

const WATER_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform float uTime;
uniform vec3 uShallowColor;
uniform vec3 uBaseColor;
uniform vec3 uDeepColor;
uniform vec3 uFoamColor;
uniform vec3 uSparkleColor;
uniform vec3 uSunDirection;
uniform vec3 uFoamObstacles[${MAX_EXACT_FOAM_OBSTACLES}];
uniform int uFoamObstacleCount;

varying vec3 vWorldPos;
varying float vDepth;
varying float vObstacleDist;
varying vec2 vFlowDir;

float hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

float valueNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float fbm2( vec2 p ) {
  float v = valueNoise( p ) * 0.64;
  v += valueNoise( p * 2.08 + vec2( 17.1, 31.7 ) ) * 0.36;
  return v;
}

void main() {
  // Trim fragments buried under dry land for crisp zero-Z-fighting shorelines
  if ( vDepth < -0.05 ) {
    discard;
  }

  vec2 flow = length( vFlowDir ) > 0.001 ? normalize( vFlowDir ) : vec2( 0.0, 1.0 );
  vec2 flowPerp = vec2( -flow.y, flow.x );
  vec2 wp = vWorldPos.xz;

  // Dual-scrolling gentle surface ripples moving downstream (reused for normal, waves & foam — zero extra noise cost)
  vec2 uvFlow1 = wp * 0.19 - flow * ( uTime * 0.30 );
  vec2 uvFlow2 = wp * 0.42 + flowPerp * ( uTime * 0.14 ) - flow * ( uTime * 0.48 ) + vec2( 9.2, -4.6 );
  float n1 = fbm2( uvFlow1 );
  float n2 = valueNoise( uvFlow2 );
  float rippleWarp = ( n1 - 0.5 ) * 0.24 + ( n2 - 0.5 ) * 0.11;

  // 1. Crystal aquamarine shallows -> serene sunlit cerulean -> tranquil deep teal-sapphire
  float depthWarped = vDepth + rippleWarp * 0.26;
  float midBand = smoothstep( 0.18, 0.88, depthWarped );
  float deepBand = smoothstep( 1.05, 2.25, depthWarped );
  vec3 waterColor = mix( uShallowColor, uBaseColor, midBand );
  waterColor = mix( waterColor, uDeepColor, deepBand );

  // 2. Analytic sunlit riverbed shimmer in crystal-clear shallows (pure world-space trig, zero radial distortion)
  float shallowMask = smoothstep( 0.02, 0.24, vDepth ) * ( 1.0 - smoothstep( 0.52, 1.32, vDepth ) );
  vec2 cUv = wp * 0.44 + vec2( n1 * 1.35, n2 * 1.15 );
  float causticWave = sin( cUv.x * 1.2 + sin( cUv.y * 1.1 + uTime * 0.85 ) ) *
                      cos( cUv.y * 1.15 - cos( cUv.x * 0.95 - uTime * 0.72 ) );
  float causticShimmer = smoothstep( 0.46, 0.90, causticWave * 0.5 + 0.5 ) * shallowMask;
  waterColor = mix( waterColor, mix( uShallowColor, uFoamColor, 0.42 ), causticShimmer * 0.24 );

  // 3. Serene hand-painted Ghibli breeze ripples & soft layered wave swells (world-space, never pinwheels on lakes)
  float breezePhaseA = wp.y * 0.42 + wp.x * 0.14 - uTime * 0.82 + n1 * 2.8;
  float breezePhaseB = wp.x * 0.28 - wp.y * 0.34 - uTime * 0.64 + n2 * 2.4;
  float swellMask = ( sin( breezePhaseA ) * 0.58 + sin( breezePhaseB ) * 0.42 ) * 0.5 + 0.5;
  float paintedCrest = smoothstep( 0.72, 0.92, swellMask ) * smoothstep( 0.36, 0.74, n1 * 0.5 + n2 * 0.5 ) * smoothstep( 0.20, 0.85, vDepth );
  vec3 crestTint = mix( uShallowColor, uFoamColor, 0.34 );
  waterColor = mix( waterColor, crestTint, paintedCrest * 0.20 );

  // Subtle organic watercolor depth variation across calm open water
  float calmDapple = smoothstep( 0.34, 0.78, n1 * 0.62 + n2 * 0.38 ) * ( 1.0 - deepBand * 0.45 );
  waterColor = mix( waterColor, uShallowColor, calmDapple * 0.14 );

  // 4. Soft double-laced translucent shoreline foam & gentle lapping ripples
  float shoreDist = vDepth + rippleWarp * 0.24;
  float shoreContact = ( 1.0 - smoothstep( 0.01, 0.20, shoreDist ) ) * smoothstep( -0.04, 0.05, vDepth );
  float shorePulse = sin( shoreDist * 11.5 - uTime * 1.95 + n1 * 2.4 ) * 0.5 + 0.5;
  float shoreBandMask = smoothstep( 0.68, 0.14, shoreDist ) * smoothstep( 0.03, 0.14, shoreDist );
  float shoreRibbon = smoothstep( 0.68, 0.90, shorePulse + ( n2 - 0.5 ) * 0.24 ) * shoreBandMask * 0.52;

  // 5. Clean circular foam rings around bridge piers, boulders & stepping stones
  float exactObsDist = vObstacleDist;
  for ( int i = 0; i < ${MAX_EXACT_FOAM_OBSTACLES}; i++ ) {
    if ( i >= uFoamObstacleCount ) break;
    vec3 obs = uFoamObstacles[ i ];
    float d = length( wp - obs.xy ) - obs.z;
    exactObsDist = min( exactObsDist, d );
  }
  float obsDist = exactObsDist + rippleWarp * 0.18;
  float obsContact = ( 1.0 - smoothstep( 0.02, 0.20, obsDist ) ) * smoothstep( -0.30, 0.0, obsDist );
  float obsWave = sin( obsDist * 10.5 - uTime * 2.2 + n1 * 1.8 ) * 0.5 + 0.5;
  float obsRingMask = smoothstep( 0.76, 0.10, obsDist ) * smoothstep( -0.06, 0.08, obsDist );
  float obsRibbon = smoothstep( 0.68, 0.90, obsWave + ( n2 - 0.5 ) * 0.20 ) * obsRingMask * 0.58;

  float foamMask = clamp( max( max( shoreContact * 0.72, shoreRibbon ), max( obsContact * 0.78, obsRibbon ) ), 0.0, 1.0 );
  waterColor = mix( waterColor, uFoamColor, foamMask );

  // 6. Analytic sky-horizon Fresnel glass sheen (adds lush depth & polish with zero cubemap/render-pass cost)
  vec3 viewDir = normalize( cameraPosition - vWorldPos );
  float waveSlopeX = ( n1 - 0.5 ) * 0.16 + cos( breezePhaseB ) * 0.025;
  float waveSlopeZ = ( n2 - 0.5 ) * 0.16 + cos( breezePhaseA ) * 0.030;
  vec3 waveNormal = normalize( vec3( waveSlopeX, 1.0, waveSlopeZ ) );
  float ndotv = clamp( dot( waveNormal, viewDir ), 0.0, 1.0 );
  float fresnel = pow( 1.0 - ndotv, 3.2 );

  // Smooth analytic reflected sky gradient (warm pale horizon fading to serene azure zenith)
  vec3 reflDir = reflect( -viewDir, waveNormal );
  float skyElev = clamp( reflDir.y, 0.0, 1.0 );
  vec3 horizonReflect = mix( uShallowColor, uFoamColor, 0.58 );
  vec3 zenithReflect = mix( uBaseColor, uShallowColor, 0.35 );
  vec3 skyReflectColor = mix( horizonReflect, zenithReflect, smoothstep( 0.02, 0.52, skyElev ) );
  waterColor = mix( waterColor, skyReflectColor, fresnel * 0.36 * ( 1.0 - foamMask * 0.85 ) );

  // 7. Delicate dancing sun glints (glassy & crisp, capped well below bloom blow-out)
  vec3 sunDir = normalize( uSunDirection );
  vec3 halfVec = normalize( sunDir + viewDir );
  float specBase = max( dot( waveNormal, halfVec ), 0.0 );
  float softSheen = pow( specBase, 84.0 ) * 0.16;
  float sparkleNoise = valueNoise( wp * 1.45 - flow * ( uTime * 0.58 ) + vec2( uTime * 0.16, -uTime * 0.12 ) );
  float glintFleck = smoothstep( 0.78, 0.93, sparkleNoise ) * smoothstep( 0.945, 0.990, specBase ) * 0.28;
  float sparkleAmount = clamp( softSheen + glintFleck, 0.0, 0.34 ) * ( 1.0 - foamMask * 0.85 );
  waterColor = mix( waterColor, uSparkleColor, sparkleAmount * 0.65 ) + uSparkleColor * ( sparkleAmount * 0.18 );

  // 8. Crystal translucent shoreline feather -> serene deep-water opacity
  float edgeFeather = smoothstep( -0.04, 0.18, vDepth );
  float depthAlpha = mix( 0.56, 0.91, smoothstep( 0.06, 1.55, vDepth ) );
  float finalAlpha = clamp( mix( depthAlpha, 0.93, max( foamMask, fresnel * 0.35 ) ), 0.0, 1.0 ) * edgeFeather;

  gl_FragColor = vec4( waterColor, finalAlpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// ---------------------------------------------------------------------------
// Pruned Water Mesh & Obstacle Baking Helpers
// ---------------------------------------------------------------------------

/**
 * Computes minimum signed distance from (x, z) to any registered circular obstacle.
 */
export function computeMinObstacleDistance(
  x: number,
  z: number,
  obstacles: readonly FoamObstacle[],
): number {
  if (obstacles.length === 0) return 99.0;
  let minD = 99.0;
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i];
    const d = Math.hypot(x - o.x, z - o.z) - o.radius;
    if (d < minD) {
      minD = d;
    }
  }
  return minD;
}

/**
 * Builds a subdivided horizontal water geometry covering the river & pond valley,
 * pruning triangles buried deep under dry hills for fast fill-rate and clean shorelines.
 */
export function buildWaterGeometry(options: {
  waterLevel: number;
  width: number;
  length: number;
  segmentsX: number;
  segmentsZ: number;
  getHeight: (x: number, z: number) => number;
  getFlowDir?: (x: number, z: number) => readonly [number, number];
}): THREE.BufferGeometry {
  const { waterLevel, width, length, segmentsX, segmentsZ, getHeight, getFlowDir } = options;
  const cols = segmentsX + 1;
  const rows = segmentsZ + 1;
  const gridCount = cols * rows;

  const gridX = new Float32Array(gridCount);
  const gridZ = new Float32Array(gridCount);
  const gridDepth = new Float32Array(gridCount);

  for (let iz = 0; iz < rows; iz += 1) {
    const vz = (iz / segmentsZ - 0.5) * length;
    for (let ix = 0; ix < cols; ix += 1) {
      const vx = (ix / segmentsX - 0.5) * width;
      const idx = iz * cols + ix;
      gridX[idx] = vx;
      gridZ[idx] = vz;
      gridDepth[idx] = waterLevel - getHeight(vx, vz);
    }
  }

  // Keep triangles that have at least one vertex within shoreline margin of the water surface
  const SHORE_KEEP_MARGIN = -0.85;
  const keptIndices: number[] = [];
  const usedVertexMap = new Int32Array(gridCount).fill(-1);
  const keptVerts: number[] = [];

  const remapVertex = (gridIdx: number): number => {
    let mapped = usedVertexMap[gridIdx];
    if (mapped === -1) {
      mapped = keptVerts.length;
      usedVertexMap[gridIdx] = mapped;
      keptVerts.push(gridIdx);
    }
    return mapped;
  };

  for (let iz = 0; iz < segmentsZ; iz += 1) {
    for (let ix = 0; ix < segmentsX; ix += 1) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = (iz + 1) * cols + ix;
      const d = c + 1;

      const maxD1 = Math.max(gridDepth[a], gridDepth[c], gridDepth[b]);
      if (maxD1 > SHORE_KEEP_MARGIN) {
        keptIndices.push(remapVertex(a), remapVertex(c), remapVertex(b));
      }

      const maxD2 = Math.max(gridDepth[b], gridDepth[c], gridDepth[d]);
      if (maxD2 > SHORE_KEEP_MARGIN) {
        keptIndices.push(remapVertex(b), remapVertex(c), remapVertex(d));
      }
    }
  }

  const vCount = keptVerts.length;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const depths = new Float32Array(vCount);
  const obstacleDists = new Float32Array(vCount);
  const flowDirs = new Float32Array(vCount * 2);

  for (let i = 0; i < vCount; i += 1) {
    const gIdx = keptVerts[i];
    const vx = gridX[gIdx];
    const vz = gridZ[gIdx];

    positions[i * 3] = vx;
    positions[i * 3 + 1] = waterLevel;
    positions[i * 3 + 2] = vz;

    normals[i * 3] = 0;
    normals[i * 3 + 1] = 1;
    normals[i * 3 + 2] = 0;

    uvs[i * 2] = vx / width + 0.5;
    uvs[i * 2 + 1] = vz / length + 0.5;

    depths[i] = gridDepth[gIdx];
    obstacleDists[i] = 99.0;

    if (getFlowDir) {
      const [fx, fz] = getFlowDir(vx, vz);
      flowDirs[i * 2] = fx;
      flowDirs[i * 2 + 1] = fz;
    } else {
      const slope = getRiverSlopeX(vz);
      const invLen = 1 / Math.hypot(slope, 1);
      flowDirs[i * 2] = slope * invLen;
      flowDirs[i * 2 + 1] = invLen;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));
  geometry.setAttribute('aObstacleDist', new THREE.BufferAttribute(obstacleDists, 1));
  geometry.setAttribute('aFlowDir', new THREE.BufferAttribute(flowDirs, 2));
  geometry.setIndex(keptIndices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

// ---------------------------------------------------------------------------
// Water Factory
// ---------------------------------------------------------------------------

/**
 * Creates the stylized turquoise anime river and mid-valley pond with animated
 * shoreline/rock foam ribbons, downstream flow streaks, and sun sparkles.
 */
export function createWater(
  scene?: THREE.Scene,
  options: WaterOptions = {},
): WaterController {
  const waterLevel = options.waterLevel ?? WATER_LEVEL;
  const width = options.width ?? 112;
  const length = options.length ?? TERRAIN_SIZE;
  const segmentsX = options.segmentsX ?? 96;
  const segmentsZ = options.segmentsZ ?? 210;
  const getHeight = options.getHeight ?? getTerrainHeight;

  const geometry = buildWaterGeometry({
    waterLevel,
    width,
    length,
    segmentsX,
    segmentsZ,
    getHeight,
    getFlowDir: options.getFlowDir,
  });

  const exactFoamUniformArray = Array.from(
    { length: MAX_EXACT_FOAM_OBSTACLES },
    () => new THREE.Vector3(9999, 9999, 0),
  );

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uShallowColor: { value: new THREE.Color(DEFAULT_WATER_COLORS.shallow) },
      uBaseColor: { value: new THREE.Color(DEFAULT_WATER_COLORS.base) },
      uDeepColor: { value: new THREE.Color(DEFAULT_WATER_COLORS.deep) },
      uFoamColor: { value: new THREE.Color(DEFAULT_WATER_COLORS.foam) },
      uSparkleColor: { value: new THREE.Color(DEFAULT_WATER_COLORS.sparkle) },
      uSunDirection: {
        value: (options.sunDirection
          ? options.sunDirection.clone()
          : new THREE.Vector3(95, 108, 65)
        ).normalize(),
      },
      uFoamObstacles: { value: exactFoamUniformArray },
      uFoamObstacleCount: { value: 0 },
    },
  ]);

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'stylizedValleyWater';
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  if (scene) {
    scene.add(mesh);
  }

  const obstacles: FoamObstacle[] = [];
  let obstaclesDirty = false;

  const syncObstacles = (): void => {
    if (!obstaclesDirty) return;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const obsAttr = geometry.getAttribute('aObstacleDist') as THREE.BufferAttribute;
    const obsArray = obsAttr.array as Float32Array;

    // Prioritize obstacles closest to the focus point for exact per-pixel rings
    const [prioX, prioZ] = options.obstaclePriorityCenter ?? [4, 8];
    const prioritized = [...obstacles].sort(
      (a, b) => Math.hypot(a.x - prioX, a.z - prioZ) - Math.hypot(b.x - prioX, b.z - prioZ),
    );
    const exactCount = Math.min(MAX_EXACT_FOAM_OBSTACLES, prioritized.length);
    const exactList = uniforms.uFoamObstacles.value as THREE.Vector3[];
    for (let i = 0; i < exactCount; i += 1) {
      const o = prioritized[i];
      exactList[i].set(o.x, o.z, o.radius);
    }
    uniforms.uFoamObstacleCount.value = exactCount;

    for (let i = 0; i < posAttr.count; i += 1) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      obsArray[i] = computeMinObstacleDistance(vx, vz, obstacles);
    }

    obsAttr.needsUpdate = true;
    obstaclesDirty = false;
  };

  const registerFoamObstacle = (x: number, z: number, radius: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || radius <= 0) return;
    obstacles.push({ x, z, radius });
    obstaclesDirty = true;
  };

  const setSunDirection = (dir: THREE.Vector3): void => {
    uniforms.uSunDirection.value.copy(dir).normalize();
  };

  const setMoodTint = (
    baseHex: THREE.ColorRepresentation,
    deepHex: THREE.ColorRepresentation,
    sparkleHex: THREE.ColorRepresentation,
    shallowHex?: THREE.ColorRepresentation,
  ): void => {
    uniforms.uBaseColor.value.set(baseHex);
    uniforms.uDeepColor.value.set(deepHex);
    uniforms.uSparkleColor.value.set(sparkleHex);
    if (shallowHex !== undefined) {
      uniforms.uShallowColor.value.set(shallowHex);
    } else {
      // Automatically derive a luminous shallow turquoise tint from the base color
      uniforms.uShallowColor.value
        .copy(uniforms.uBaseColor.value)
        .lerp(new THREE.Color('#c8f7ff'), 0.42);
    }
  };

  const update = (_dt: number, elapsed: number): void => {
    if (obstaclesDirty) {
      syncObstacles();
    }
    uniforms.uTime.value = elapsed;
  };

  const dispose = (): void => {
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    geometry.dispose();
    material.dispose();
  };

  return {
    mesh,
    geometry,
    material,
    update,
    setSunDirection,
    setMoodTint,
    registerFoamObstacle,
    syncObstacles,
    getObstacles: () => obstacles,
    dispose,
  };
}
