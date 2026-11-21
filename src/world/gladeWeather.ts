import * as THREE from 'three';
import type { AtmosphereConfig, AtmosphereController } from './atmosphere';
import type { BloomSettings, ColorGradeSettings, PostProcessingController } from './postProcessing';
import { createSeededRandom } from './terrain';
import type { WaterController } from './water';
import { GLADE_SEED } from './gladeBiomes';

// ---------------------------------------------------------------------------
// Dynamic Weather & Sky/Cloud Mood Presets for Autumn Glade
// ---------------------------------------------------------------------------

export type GladeWeatherId =
  | 'sunny'
  | 'sakura-breeze'
  | 'golden-sunset'
  | 'rain'
  | 'mist';

export interface GladeWeatherPreset {
  readonly id: GladeWeatherId;
  readonly label: string;
  readonly description: string;
  readonly atmosphere: Required<AtmosphereConfig>;
  readonly exposure: number;
  readonly bloom: BloomSettings;
  readonly colorGrade: ColorGradeSettings;
  readonly cloudLitColor: string;
  readonly cloudShadeColor: string;
  readonly cloudOpacity: number;
  readonly cloudSpeed: number;
  readonly sunbeamOpacity: number;
  readonly windMultiplier: number;
  readonly rainOpacity: number;
  readonly petalIntensity: number;
  readonly sakuraPetalRatio: number;
  readonly lanternGlow: number;
  readonly waterShallow: string;
  readonly waterBase: string;
  readonly waterDeep: string;
  readonly waterSparkle: string;
}

export const GLADE_WEATHER_PRESETS: Readonly<Record<GladeWeatherId, GladeWeatherPreset>> = {
  sunny: {
    id: 'sunny',
    label: 'Clear Day',
    description: 'Vibrant azure sky & sunlit clouds',
    atmosphere: {
      zenithColor: '#2587e0',
      midSkyColor: '#62c2f2',
      horizonColor: '#d9f2fc',
      groundColor: '#b5e2f0',
      fogColor: '#c8eaf7',
      fogDensity: 0.00062,
      sunPosition: [86, 76, -130],
      sunColor: '#fff0cc',
      sunIntensity: 1.92,
      sunGlowColor: '#fff4d4',
      sunGlowIntensity: 0.56,
      hemiSkyColor: '#a6dffa',
      hemiGroundColor: '#7ec850',
      hemiIntensity: 0.88,
      starIntensity: 0.0,
    },
    exposure: 1.0,
    bloom: { threshold: 1.05, strength: 0.16, radius: 0.44 },
    colorGrade: {
      enabled: true,
      saturation: 1.12,
      vibrance: 0.15,
      shadowTint: '#4f97bd',
      shadowTintStrength: 0.1,
      highlightTint: '#fff5d9',
      highlightTintStrength: 0.06,
    },
    cloudLitColor: '#fbfdff',
    cloudShadeColor: '#bddcf5',
    cloudOpacity: 0.9,
    cloudSpeed: 1.0,
    sunbeamOpacity: 0.032,
    windMultiplier: 1.0,
    rainOpacity: 0.0,
    petalIntensity: 0.85,
    sakuraPetalRatio: 0.5,
    lanternGlow: 0.95,
    waterShallow: '#78ebe6',
    waterBase: '#3ab3de',
    waterDeep: '#1d76a8',
    waterSparkle: '#fff7de',
  },
  'sakura-breeze': {
    id: 'sakura-breeze',
    label: 'Sakura Breeze',
    description: 'Swirling cherry blossom petals in spring wind',
    atmosphere: {
      zenithColor: '#4596e8',
      midSkyColor: '#84cdf5',
      horizonColor: '#fae8f0',
      groundColor: '#d4e8f2',
      fogColor: '#e0ebf7',
      fogDensity: 0.00068,
      sunPosition: [74, 72, -118],
      sunColor: '#ffede3',
      sunIntensity: 1.88,
      sunGlowColor: '#ffe6ec',
      sunGlowIntensity: 0.6,
      hemiSkyColor: '#c4e2fa',
      hemiGroundColor: '#8ec972',
      hemiIntensity: 0.9,
      starIntensity: 0.0,
    },
    exposure: 1.02,
    bloom: { threshold: 1.02, strength: 0.18, radius: 0.46 },
    colorGrade: {
      enabled: true,
      saturation: 1.14,
      vibrance: 0.18,
      shadowTint: '#6b94c7',
      shadowTintStrength: 0.11,
      highlightTint: '#ffedf2',
      highlightTintStrength: 0.08,
    },
    cloudLitColor: '#fff9fc',
    cloudShadeColor: '#d2dff5',
    cloudOpacity: 0.88,
    cloudSpeed: 1.85,
    sunbeamOpacity: 0.03,
    windMultiplier: 1.85,
    rainOpacity: 0.0,
    petalIntensity: 1.65,
    sakuraPetalRatio: 0.86,
    lanternGlow: 1.05,
    waterShallow: '#82ebe8',
    waterBase: '#45b5de',
    waterDeep: '#247aa8',
    waterSparkle: '#ffeff5',
  },
  'golden-sunset': {
    id: 'golden-sunset',
    label: 'Golden Sunset',
    description: 'Amber dusk, glowing lanterns & crimson skies',
    atmosphere: {
      zenithColor: '#364d94',
      midSkyColor: '#c96f7a',
      horizonColor: '#f5b57d',
      groundColor: '#cc906e',
      fogColor: '#ebb18a',
      fogDensity: 0.00082,
      sunPosition: [-128, 34, -96],
      sunColor: '#ffa861',
      sunIntensity: 1.82,
      sunGlowColor: '#ffc478',
      sunGlowIntensity: 0.78,
      hemiSkyColor: '#f2a18f',
      hemiGroundColor: '#694e52',
      hemiIntensity: 0.8,
      starIntensity: 0.35,
    },
    exposure: 0.98,
    bloom: { threshold: 0.96, strength: 0.24, radius: 0.5 },
    colorGrade: {
      enabled: true,
      saturation: 1.16,
      vibrance: 0.2,
      shadowTint: '#594885',
      shadowTintStrength: 0.16,
      highlightTint: '#ffd699',
      highlightTintStrength: 0.12,
    },
    cloudLitColor: '#ffcf9e',
    cloudShadeColor: '#8a628c',
    cloudOpacity: 0.9,
    cloudSpeed: 0.9,
    sunbeamOpacity: 0.044,
    windMultiplier: 1.1,
    rainOpacity: 0.0,
    petalIntensity: 1.05,
    sakuraPetalRatio: 0.45,
    lanternGlow: 2.05,
    waterShallow: '#e0a284',
    waterBase: '#4f7ca8',
    waterDeep: '#283d6b',
    waterSparkle: '#ffc978',
  },
  rain: {
    id: 'rain',
    label: 'Autumn Rain',
    description: 'Cool passing shower & silver clouds',
    atmosphere: {
      zenithColor: '#48607a',
      midSkyColor: '#6d87a1',
      horizonColor: '#a8bcc9',
      groundColor: '#7b919c',
      fogColor: '#98aebc',
      fogDensity: 0.00135,
      sunPosition: [44, 62, -92],
      sunColor: '#cfe0eb',
      sunIntensity: 1.15,
      sunGlowColor: '#d2e2ed',
      sunGlowIntensity: 0.22,
      hemiSkyColor: '#9cb7c9',
      hemiGroundColor: '#4a6b54',
      hemiIntensity: 1.02,
      starIntensity: 0.0,
    },
    exposure: 0.98,
    bloom: { threshold: 1.02, strength: 0.14, radius: 0.42 },
    colorGrade: {
      enabled: true,
      saturation: 0.98,
      vibrance: 0.08,
      shadowTint: '#486c8a',
      shadowTintStrength: 0.18,
      highlightTint: '#d9ecf7',
      highlightTintStrength: 0.05,
    },
    cloudLitColor: '#c4d2db',
    cloudShadeColor: '#5c7287',
    cloudOpacity: 0.95,
    cloudSpeed: 2.25,
    sunbeamOpacity: 0.0,
    windMultiplier: 2.1,
    rainOpacity: 0.72,
    petalIntensity: 0.28,
    sakuraPetalRatio: 0.5,
    lanternGlow: 1.85,
    waterShallow: '#549eb3',
    waterBase: '#2d6e8c',
    waterDeep: '#1a4563',
    waterSparkle: '#b0cfde',
  },
  mist: {
    id: 'mist',
    label: 'Morning Mist',
    description: 'Serene pearl fog drifting over valleys & lakes',
    atmosphere: {
      zenithColor: '#6aa4c9',
      midSkyColor: '#a2cde0',
      horizonColor: '#dcf0ee',
      groundColor: '#c0dbd7',
      fogColor: '#d0e6e3',
      fogDensity: 0.00165,
      sunPosition: [95, 50, -110],
      sunColor: '#fff2db',
      sunIntensity: 1.55,
      sunGlowColor: '#fff5e0',
      sunGlowIntensity: 0.52,
      hemiSkyColor: '#c7e3e8',
      hemiGroundColor: '#7db37b',
      hemiIntensity: 0.96,
      starIntensity: 0.0,
    },
    exposure: 1.0,
    bloom: { threshold: 1.0, strength: 0.18, radius: 0.48 },
    colorGrade: {
      enabled: true,
      saturation: 1.04,
      vibrance: 0.12,
      shadowTint: '#6299a6',
      shadowTintStrength: 0.14,
      highlightTint: '#edf7f4',
      highlightTintStrength: 0.08,
    },
    cloudLitColor: '#eef7f6',
    cloudShadeColor: '#a6c5cd',
    cloudOpacity: 0.92,
    cloudSpeed: 0.65,
    sunbeamOpacity: 0.038,
    windMultiplier: 0.68,
    rainOpacity: 0.0,
    petalIntensity: 0.65,
    sakuraPetalRatio: 0.6,
    lanternGlow: 1.45,
    waterShallow: '#73cfd1',
    waterBase: '#4298ab',
    waterDeep: '#266987',
    waterSparkle: '#e3f5f3',
  },
};

export const GLADE_WEATHER_ORDER: readonly GladeWeatherId[] = [
  'sunny',
  'sakura-breeze',
  'golden-sunset',
  'rain',
  'mist',
] as const;

export function getGladeWeatherPreset(id: GladeWeatherId): GladeWeatherPreset {
  return GLADE_WEATHER_PRESETS[id] ?? GLADE_WEATHER_PRESETS.sunny;
}

export function lerpWeatherScalar(current: number, target: number, alpha: number): number {
  const t = Math.max(0, Math.min(1, alpha));
  return current + (target - current) * t;
}

// ---------------------------------------------------------------------------
// Multi-Bank Volumetric Stylized Anime Cumulus Clouds
// ---------------------------------------------------------------------------

export interface LayeredCloudsController {
  readonly mesh: THREE.InstancedMesh;
  setPalette: (lit: THREE.Color, shade: THREE.Color, opacity: number) => void;
  setSunDirection: (dir: THREE.Vector3) => void;
  update: (dt: number, speedMultiplier: number) => void;
  dispose: () => void;
}

export function createLayeredAnimeClouds(): LayeredCloudsController {
  const geo = new THREE.IcosahedronGeometry(1.0, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(86, 72, -130).normalize() },
      uLitColor: { value: new THREE.Color('#fbfdff') },
      uShadeColor: { value: new THREE.Color('#98ccf0') },
      uOpacity: { value: 0.88 },
      uDriftOffset: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aCloudSpeed;
      uniform float uDriftOffset;
      varying vec3 vWorldNormal;
      varying float vLocalY;
      void main() {
        vLocalY = position.y;
        mat3 nMat = mat3( modelMatrix );
        #ifdef USE_INSTANCING
          nMat = mat3( modelMatrix * instanceMatrix );
        #endif
        vWorldNormal = normalize( nMat * normal );
        vec4 mvPos = vec4( position, 1.0 );
        #ifdef USE_INSTANCING
          mvPos = instanceMatrix * mvPos;
          float baseX = instanceMatrix[3][0];
          float wrappedX = mod( baseX + uDriftOffset * aCloudSpeed + 1200.0, 2400.0 ) - 1200.0;
          mvPos.x += wrappedX - baseX;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDirection;
      uniform vec3 uLitColor;
      uniform vec3 uShadeColor;
      uniform float uOpacity;
      varying vec3 vWorldNormal;
      varying float vLocalY;
      void main() {
        vec3 n = normalize( vWorldNormal );
        float sunLit = clamp( dot( n, normalize( uSunDirection ) ) * 0.5 + 0.5, 0.0, 1.0 );
        float topGrad = smoothstep( -0.62, 0.65, vLocalY );
        float shadeStep = smoothstep( 0.18, 0.82, sunLit * 0.52 + topGrad * 0.48 );
        vec3 col = mix( uShadeColor, uLitColor, shadeStep );
        gl_FragColor = vec4( col, uOpacity );
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const rand = createSeededRandom(GLADE_SEED + 911);

  // 22 billowing cumulus cloud banks arranged high across the expanded 1920x1920 sky ring
  // Positioned cleanly above the overview camera (y=235) so they frame the horizon without blocking terrain
  const clusters: Array<{ cx: number; cy: number; cz: number; size: number; speed: number }> = [
    { cx: -520, cy: 292, cz: -960, size: 3.1, speed: 1.0 },
    { cx: 410, cy: 304, cz: -985, size: 3.25, speed: 0.9 },
    { cx: 880, cy: 288, cz: -580, size: 2.95, speed: 1.1 },
    { cx: -900, cy: 290, cz: -540, size: 3.0, speed: 0.95 },
    { cx: 960, cy: 284, cz: 125, size: 2.85, speed: 1.05 },
    { cx: -950, cy: 286, cz: 185, size: 2.95, speed: 0.85 },
    { cx: 685, cy: 296, cz: 825, size: 3.05, speed: 1.0 },
    { cx: -660, cy: 294, cz: 855, size: 3.0, speed: 1.15 },
    { cx: -68, cy: 314, cz: -1040, size: 2.95, speed: 0.8 },
    { cx: 88, cy: 308, cz: 965, size: 2.95, speed: 0.92 },
    { cx: -440, cy: 332, cz: -460, size: 2.45, speed: 1.25 },
    { cx: 465, cy: 336, cz: -240, size: 2.55, speed: 1.2 },
    { cx: -390, cy: 338, cz: 485, size: 2.4, speed: 1.15 },
    { cx: 425, cy: 330, cz: 465, size: 2.5, speed: 1.05 },
    { cx: 65, cy: 344, cz: -265, size: 2.3, speed: 1.1 },
    { cx: -715, cy: 315, cz: 65, size: 2.65, speed: 0.96 },
    { cx: 715, cy: 318, cz: -155, size: 2.7, speed: 1.08 },
    { cx: 55, cy: 324, cz: -695, size: 2.6, speed: 0.88 },
    { cx: -260, cy: 318, cz: 720, size: 2.5, speed: 0.94 },
    { cx: 320, cy: 312, cz: -680, size: 2.55, speed: 1.02 },
    { cx: -780, cy: 302, cz: 580, size: 2.75, speed: 1.12 },
    { cx: 790, cy: 300, cz: 540, size: 2.7, speed: 0.9 },
  ];

  const puffsPerCluster = 7;
  const totalPuffs = clusters.length * puffsPerCluster;
  const speeds = new Float32Array(totalPuffs);
  const instanced = new THREE.InstancedMesh(geo, mat, totalPuffs);
  instanced.name = 'autumnGlade_layeredClouds';
  instanced.frustumCulled = false;

  const dummy = new THREE.Object3D();
  let idx = 0;
  for (const c of clusters) {
    for (let p = 0; p < puffsPerCluster; p += 1) {
      const t = (p / (puffsPerCluster - 1) - 0.5) * 2.0;
      const x = c.cx + t * 24 * c.size + (rand() - 0.5) * 6;
      const y = c.cy + (1 - t * t) * 5.2 * c.size + (rand() - 0.5) * 2.5;
      const z = c.cz + (rand() - 0.5) * 11;
      const sx = (8.8 + (1 - Math.abs(t) * 0.42) * 6.8) * c.size;
      const sy = (3.1 + (1 - Math.abs(t) * 0.52) * 3.4) * c.size;
      const sz = (6.4 + rand() * 3.6) * c.size;
      const rotY = rand() * 0.6;
      speeds[idx] = c.speed;

      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      instanced.setMatrixAt(idx, dummy.matrix);
      idx += 1;
    }
  }
  geo.setAttribute('aCloudSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
  instanced.instanceMatrix.needsUpdate = true;

  let driftOffset = 0;

  return {
    mesh: instanced,
    setPalette: (lit, shade, opacity) => {
      mat.uniforms.uLitColor.value.copy(lit);
      mat.uniforms.uShadeColor.value.copy(shade);
      mat.uniforms.uOpacity.value = opacity;
    },
    setSunDirection: (dir) => {
      mat.uniforms.uSunDirection.value.copy(dir).normalize();
    },
    update: (dt: number, speedMultiplier: number) => {
      driftOffset += dt * 2.8 * speedMultiplier;
      mat.uniforms.uDriftOffset.value = driftOffset;
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
      instanced.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Falling Weather Rain Streaks (Camera-Anchored GPU Box Wrap)
// ---------------------------------------------------------------------------

const RAIN_VERTEX_SHADER = /* glsl */ `
attribute float aPhase;
attribute float aEnd;

uniform float uTime;
uniform vec3 uOrigin;
uniform float uWindTilt;

varying float vAlpha;

void main() {
  vec3 local = position;
  float spanY = 44.0;
  float speed = 26.0 + aPhase * 8.0;

  float yDrop = mod( local.y - uTime * speed, spanY );
  local.y = yDrop - 6.0;
  local.x += sin( uTime * 0.8 + aPhase * 6.28 ) * 0.35 + aEnd * uWindTilt;
  local.y -= aEnd * 1.15;

  vec3 worldPos = local + uOrigin;
  vAlpha = mix( 0.85, 0.15, aEnd ) * smoothstep( 0.0, 4.0, yDrop ) * smoothstep( spanY, spanY - 5.0, yDrop );

  gl_Position = projectionMatrix * viewMatrix * vec4( worldPos, 1.0 );
}
`;

const RAIN_FRAGMENT_SHADER = /* glsl */ `
uniform float uOpacity;
varying float vAlpha;

void main() {
  float a = vAlpha * uOpacity;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( 0.84, 0.93, 1.0, a );
}
`;

export function createWeatherRainSystem(dropCount = 680): {
  lines: THREE.LineSegments;
  update: (elapsed: number, cameraPos: THREE.Vector3, opacity: number, windMul: number) => void;
  dispose: () => void;
} {
  const rand = createSeededRandom(GLADE_SEED + 1777);
  const positions = new Float32Array(dropCount * 2 * 3);
  const phases = new Float32Array(dropCount * 2);
  const ends = new Float32Array(dropCount * 2);

  for (let i = 0; i < dropCount; i += 1) {
    const x = (rand() - 0.5) * 96;
    const y = rand() * 44;
    const z = (rand() - 0.5) * 96;
    const phase = rand();

    const base = i * 2;
    positions[base * 3] = x;
    positions[base * 3 + 1] = y;
    positions[base * 3 + 2] = z;
    phases[base] = phase;
    ends[base] = 0;

    positions[(base + 1) * 3] = x;
    positions[(base + 1) * 3 + 1] = y;
    positions[(base + 1) * 3 + 2] = z;
    phases[base + 1] = phase;
    ends[base + 1] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector3() },
      uOpacity: { value: 0 },
      uWindTilt: { value: 0.28 },
    },
    vertexShader: RAIN_VERTEX_SHADER,
    fragmentShader: RAIN_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'autumnGlade_weatherRain';
  lines.frustumCulled = false;
  lines.visible = false;

  return {
    lines,
    update: (elapsed, cameraPos, opacity, windMul) => {
      lines.visible = opacity > 0.015;
      if (!lines.visible) return;
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uOrigin.value.set(cameraPos.x, Math.max(0, cameraPos.y - 6), cameraPos.z);
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uWindTilt.value = 0.18 * windMul;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Drifting Sakura Blossoms & Autumn Leaves (Camera-Aware Expansive Field)
// ---------------------------------------------------------------------------

const PETAL_FIELD_VERTEX = /* glsl */ `
attribute float aPhase;
attribute float aSpeed;
attribute float aSize;
attribute float aIsSakura;
attribute vec3 aColor;

uniform float uTime;
uniform vec3 uOrigin;
uniform float uWindMul;
uniform float uIntensity;
uniform float uSakuraRatio;

varying vec3 vColor;
varying float vSpin;
varying float vAlpha;

void main() {
  vec3 pos = position;
  float t = uTime * aSpeed * ( 0.72 + 0.35 * uWindMul ) + aPhase;

  float spanY = 22.0;
  float fallCycle = fract( ( pos.y - uTime * ( 0.45 + aSpeed * 0.36 ) ) / spanY );
  pos.y = 0.6 + fallCycle * spanY;
  pos.x += sin( t * 0.85 ) * ( 2.2 * uWindMul ) + cos( t * 0.42 ) * 1.1;
  pos.z += cos( t * 0.72 + aPhase ) * ( 1.9 * uWindMul );

  vec3 worldPos = pos + vec3( uOrigin.x, max( uOrigin.y - 8.0, 0.0 ), uOrigin.z );
  vColor = aColor;
  vSpin = t * 2.4;

  // Bias visibility toward sakura petals during Sakura Breeze weather
  float typeBoost = mix( 1.0 - uSakuraRatio * 0.45, 0.55 + uSakuraRatio * 0.65, aIsSakura );
  vAlpha = clamp( uIntensity * typeBoost, 0.0, 1.0 ) * smoothstep( 0.0, 0.12, fallCycle ) * smoothstep( 1.0, 0.85, fallCycle );

  vec4 mvPos = viewMatrix * vec4( worldPos, 1.0 );
  gl_Position = projectionMatrix * mvPos;
  gl_PointSize = clamp( ( aSize * 210.0 ) / max( -mvPos.z, 1.0 ), 2.2, 10.5 );
}
`;

const PETAL_FIELD_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vSpin;
varying float vAlpha;

void main() {
  if ( vAlpha < 0.02 ) discard;
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos( vSpin );
  float s = sin( vSpin );
  vec2 rot = vec2( uv.x * c - uv.y * s, uv.x * s + uv.y * c );

  float shape = length( vec2( rot.x * 1.85, rot.y * 0.92 ) );
  if ( shape > 0.48 ) discard;

  float alpha = smoothstep( 0.48, 0.16, shape ) * 0.88 * vAlpha;
  gl_FragColor = vec4( vColor, alpha );
}
`;

export function createExpandedBlossomPetals(count = 320): {
  points: THREE.Points;
  update: (
    elapsed: number,
    cameraPos: THREE.Vector3,
    windMul: number,
    intensity: number,
    sakuraRatio: number,
  ) => void;
  dispose: () => void;
} {
  const rand = createSeededRandom(GLADE_SEED + 503);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const isSakura = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const sakuraPalette = [
    new THREE.Color('#ffbfd9'),
    new THREE.Color('#ff9cc4'),
    new THREE.Color('#ffe3ef'),
    new THREE.Color('#ffadd0'),
  ];
  const autumnPalette = [
    new THREE.Color('#ffe075'),
    new THREE.Color('#ff9854'),
    new THREE.Color('#fff9d6'),
    new THREE.Color('#ff6e54'),
  ];

  for (let i = 0; i < count; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = 3 + Math.sqrt(rand()) * 68;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = rand() * 22.0;
    positions[i * 3 + 2] = Math.sin(angle) * radius;

    phases[i] = rand() * Math.PI * 2;
    speeds[i] = 0.45 + rand() * 0.65;
    sizes[i] = 0.72 + rand() * 0.85;

    const sakura = i % 5 < 3; // 60% sakura cherry petals, 40% autumn leaves & sun motes
    isSakura[i] = sakura ? 1.0 : 0.0;
    const pal = sakura ? sakuraPalette : autumnPalette;
    const c = pal[Math.floor(rand() * pal.length)];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aIsSakura', new THREE.BufferAttribute(isSakura, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector3() },
      uWindMul: { value: 1.0 },
      uIntensity: { value: 0.85 },
      uSakuraRatio: { value: 0.5 },
    },
    vertexShader: PETAL_FIELD_VERTEX,
    fragmentShader: PETAL_FIELD_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'autumnGlade_blossomPetals';
  points.frustumCulled = false;

  return {
    points,
    update: (elapsed, cameraPos, windMul, intensity, sakuraRatio) => {
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uOrigin.value.copy(cameraPos);
      material.uniforms.uWindMul.value = windMul;
      material.uniforms.uIntensity.value = intensity;
      material.uniforms.uSakuraRatio.value = sakuraRatio;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Live Weather Transition Rig (Damped Atmosphere, Clouds, Water, Rain, Wind)
// ---------------------------------------------------------------------------

export interface GladeWeatherRuntimeState {
  targetWeather: GladeWeatherId;
  windMultiplier: number;
  rainOpacity: number;
  petalIntensity: number;
  sakuraPetalRatio: number;
  sunbeamOpacity: number;
  cloudSpeed: number;
  lanternGlow: number;
  exposure: number;
  readonly zenith: THREE.Color;
  readonly midSky: THREE.Color;
  readonly horizon: THREE.Color;
  readonly ground: THREE.Color;
  readonly fog: THREE.Color;
  fogDensity: number;
  readonly sunPos: THREE.Vector3;
  readonly sunColor: THREE.Color;
  sunIntensity: number;
  readonly sunGlowColor: THREE.Color;
  sunGlowIntensity: number;
  readonly hemiSky: THREE.Color;
  readonly hemiGround: THREE.Color;
  hemiIntensity: number;
  starIntensity: number;
  readonly cloudLit: THREE.Color;
  readonly cloudShade: THREE.Color;
  cloudOpacity: number;
  readonly waterShallow: THREE.Color;
  readonly waterBase: THREE.Color;
  readonly waterDeep: THREE.Color;
  readonly waterSparkle: THREE.Color;
}

export function createWeatherRuntimeState(initial: GladeWeatherId = 'sunny'): GladeWeatherRuntimeState {
  const p = getGladeWeatherPreset(initial);
  const a = p.atmosphere;
  return {
    targetWeather: initial,
    windMultiplier: p.windMultiplier,
    rainOpacity: p.rainOpacity,
    petalIntensity: p.petalIntensity,
    sakuraPetalRatio: p.sakuraPetalRatio,
    sunbeamOpacity: p.sunbeamOpacity,
    cloudSpeed: p.cloudSpeed,
    lanternGlow: p.lanternGlow,
    exposure: p.exposure,
    zenith: new THREE.Color(a.zenithColor),
    midSky: new THREE.Color(a.midSkyColor),
    horizon: new THREE.Color(a.horizonColor),
    ground: new THREE.Color(a.groundColor),
    fog: new THREE.Color(a.fogColor),
    fogDensity: a.fogDensity,
    sunPos: new THREE.Vector3(a.sunPosition[0], a.sunPosition[1], a.sunPosition[2]),
    sunColor: new THREE.Color(a.sunColor),
    sunIntensity: a.sunIntensity,
    sunGlowColor: new THREE.Color(a.sunGlowColor),
    sunGlowIntensity: a.sunGlowIntensity,
    hemiSky: new THREE.Color(a.hemiSkyColor),
    hemiGround: new THREE.Color(a.hemiGroundColor),
    hemiIntensity: a.hemiIntensity,
    starIntensity: a.starIntensity,
    cloudLit: new THREE.Color(p.cloudLitColor),
    cloudShade: new THREE.Color(p.cloudShadeColor),
    cloudOpacity: p.cloudOpacity,
    waterShallow: new THREE.Color(p.waterShallow),
    waterBase: new THREE.Color(p.waterBase),
    waterDeep: new THREE.Color(p.waterDeep),
    waterSparkle: new THREE.Color(p.waterSparkle),
  };
}

// Reusable scratch colors/vectors to guarantee zero per-frame allocations
const _tmpColor = new THREE.Color();
const _tmpVec = new THREE.Vector3();
const _sunDirScratch = new THREE.Vector3();

export function stepWeatherRuntimeState(
  state: GladeWeatherRuntimeState,
  dt: number,
  immediate = false,
): boolean {
  const target = getGladeWeatherPreset(state.targetWeather);
  const a = target.atmosphere;

  if (!immediate) {
    // Skip redundant lerps & scene uniform writes once weather has fully settled
    _tmpVec.set(a.sunPosition[0], a.sunPosition[1], a.sunPosition[2]);
    const settled =
      Math.abs(state.exposure - target.exposure) < 1e-4 &&
      Math.abs(state.sunIntensity - a.sunIntensity) < 1e-4 &&
      Math.abs(state.fogDensity - a.fogDensity) < 1e-6 &&
      Math.abs(state.rainOpacity - target.rainOpacity) < 1e-4 &&
      Math.abs(state.windMultiplier - target.windMultiplier) < 1e-4 &&
      state.sunPos.distanceToSquared(_tmpVec) < 1e-4;
    if (settled) {
      return false;
    }
  }

  const alpha = immediate ? 1.0 : 1 - Math.exp(-Math.min(dt, 0.1) * 2.6);

  state.windMultiplier = lerpWeatherScalar(state.windMultiplier, target.windMultiplier, alpha);
  state.rainOpacity = lerpWeatherScalar(state.rainOpacity, target.rainOpacity, alpha);
  state.petalIntensity = lerpWeatherScalar(state.petalIntensity, target.petalIntensity, alpha);
  state.sakuraPetalRatio = lerpWeatherScalar(state.sakuraPetalRatio, target.sakuraPetalRatio, alpha);
  state.sunbeamOpacity = lerpWeatherScalar(state.sunbeamOpacity, target.sunbeamOpacity, alpha);
  state.cloudSpeed = lerpWeatherScalar(state.cloudSpeed, target.cloudSpeed, alpha);
  state.lanternGlow = lerpWeatherScalar(state.lanternGlow, target.lanternGlow, alpha);
  state.exposure = lerpWeatherScalar(state.exposure, target.exposure, alpha);

  state.zenith.lerp(_tmpColor.set(a.zenithColor), alpha);
  state.midSky.lerp(_tmpColor.set(a.midSkyColor), alpha);
  state.horizon.lerp(_tmpColor.set(a.horizonColor), alpha);
  state.ground.lerp(_tmpColor.set(a.groundColor), alpha);
  state.fog.lerp(_tmpColor.set(a.fogColor), alpha);
  state.fogDensity = lerpWeatherScalar(state.fogDensity, a.fogDensity, alpha);

  _tmpVec.set(a.sunPosition[0], a.sunPosition[1], a.sunPosition[2]);
  state.sunPos.lerp(_tmpVec, alpha);
  state.sunColor.lerp(_tmpColor.set(a.sunColor), alpha);
  state.sunIntensity = lerpWeatherScalar(state.sunIntensity, a.sunIntensity, alpha);
  state.sunGlowColor.lerp(_tmpColor.set(a.sunGlowColor), alpha);
  state.sunGlowIntensity = lerpWeatherScalar(state.sunGlowIntensity, a.sunGlowIntensity, alpha);

  state.hemiSky.lerp(_tmpColor.set(a.hemiSkyColor), alpha);
  state.hemiGround.lerp(_tmpColor.set(a.hemiGroundColor), alpha);
  state.hemiIntensity = lerpWeatherScalar(state.hemiIntensity, a.hemiIntensity, alpha);
  state.starIntensity = lerpWeatherScalar(state.starIntensity, a.starIntensity, alpha);

  state.cloudLit.lerp(_tmpColor.set(target.cloudLitColor), alpha);
  state.cloudShade.lerp(_tmpColor.set(target.cloudShadeColor), alpha);
  state.cloudOpacity = lerpWeatherScalar(state.cloudOpacity, target.cloudOpacity, alpha);

  state.waterShallow.lerp(_tmpColor.set(target.waterShallow), alpha);
  state.waterBase.lerp(_tmpColor.set(target.waterBase), alpha);
  state.waterDeep.lerp(_tmpColor.set(target.waterDeep), alpha);
  state.waterSparkle.lerp(_tmpColor.set(target.waterSparkle), alpha);

  return true;
}

export function applyWeatherToScene(
  state: GladeWeatherRuntimeState,
  targets: {
    atmosphere: AtmosphereController;
    renderer: THREE.WebGLRenderer;
    postProcessing: PostProcessingController;
    clouds: LayeredCloudsController;
    water: WaterController;
  },
): void {
  const preset = getGladeWeatherPreset(state.targetWeather);
  targets.atmosphere.applyMood({
    zenithColor: state.zenith,
    midSkyColor: state.midSky,
    horizonColor: state.horizon,
    groundColor: state.ground,
    fogColor: state.fog,
    fogDensity: state.fogDensity,
    sunPosition: [state.sunPos.x, state.sunPos.y, state.sunPos.z],
    sunColor: state.sunColor,
    sunIntensity: state.sunIntensity,
    sunGlowColor: state.sunGlowColor,
    sunGlowIntensity: state.sunGlowIntensity,
    hemiSkyColor: state.hemiSky,
    hemiGroundColor: state.hemiGround,
    hemiIntensity: state.hemiIntensity,
    starIntensity: state.starIntensity,
  });

  targets.renderer.toneMappingExposure = state.exposure;
  targets.postProcessing.setBloomSettings(preset.bloom);
  targets.postProcessing.setColorGrade(preset.colorGrade);

  targets.atmosphere.getSunDirection(_sunDirScratch);
  targets.clouds.setSunDirection(_sunDirScratch);
  targets.clouds.setPalette(state.cloudLit, state.cloudShade, state.cloudOpacity);

  targets.water.setSunDirection(_sunDirScratch);
  targets.water.setMoodTint(
    state.waterBase,
    state.waterDeep,
    state.waterSparkle,
    state.waterShallow,
  );
}
