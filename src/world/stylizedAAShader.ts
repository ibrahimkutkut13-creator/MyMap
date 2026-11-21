import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Studio Ghibli Hand-Painted Stylized Lit Toon Shader Suite (Autumn Glade)
// ---------------------------------------------------------------------------

export type StylizedAAAssetCategory =
  | 'birch'
  | 'maple'
  | 'sakura'
  | 'commonTree'
  | 'pine'
  | 'twistedTree'
  | 'deadTree'
  | 'bush'
  | 'plant'
  | 'grass'
  | 'flower'
  | 'petal'
  | 'mushroom'
  | 'rock'
  | 'pathStone';

export interface StylizedAAFoliageUniforms {
  uTime: { value: number };
  uSunDirection: { value: THREE.Vector3 };
  uShadowColor: { value: THREE.Color };
  uShadowTintStrength: { value: number };
  uSunTint: { value: THREE.Color };
  uTranslucencyColor: { value: THREE.Color };
  uTranslucencyStrength: { value: number };
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uBottomTint: { value: THREE.Color };
  uTopTint: { value: THREE.Color };
  uGradientHeight: { value: number };
  uGradientStrength: { value: number };
  uWindStrength: { value: number };
  uWindSpeed: { value: number };
  uWindScale: { value: number };
  uWindMultiplier: { value: number };
  uUpNormalBlend: { value: number };
  uSphereNormalBlend: { value: number };
  uCanopyCenter: { value: THREE.Vector3 };
  uCanopyRadius: { value: THREE.Vector3 };
  uSaturationBoost: { value: number };
  uAlbedoShift: { value: THREE.Color };
  uIsCanopy: { value: number };
  uGrassRemap: { value: number };
  uSakuraRemap: { value: number };
  uMapleRemap: { value: number };
  uHeroAutumnEnabled: { value: number };
  uHeroCrimsonColor: { value: THREE.Color };
  uHeroTangerineColor: { value: THREE.Color };
}

export interface CreateStylizedAAFoliageOptions {
  readonly category: StylizedAAAssetCategory;
  readonly meshName?: string;
  readonly targetHeight?: number;
  readonly sunDirection?: THREE.Vector3;
  readonly alphaTest?: number;
  readonly canopyCenter?: THREE.Vector3;
  readonly canopyRadius?: THREE.Vector3;
  readonly alphaToCoverage?: boolean;
  /** Enables dedicated soft Ghibli crimson-to-tangerine autumn gradient + per-leaf variation for foreground overhanging maple. */
  readonly heroAutumnGradient?: boolean;
}

const BARK_NAME_RE = /\b(bark|trunk|wood|stem|stalk|log|branch|twig)\b|bark|trunk|wood/i;
const OPAQUE_PROP_RE = /rock|stone|pebble|mushroom|pathrock/i;
const CUTOUT_NAME_RE =
  /leaf|leaves|foliage|canopy|crown|blossom|flower|petal|grass|bush|fern|shrub|frond|clover|weed|plant|pine|needle/i;

// ---------------------------------------------------------------------------
// Cached Soft 3-Step Studio Ghibli Gradient Ramp (MeshToonMaterial)
// ---------------------------------------------------------------------------

let cachedGhibliGradientMap: THREE.DataTexture | null = null;

/**
 * Returns a cached 16x1 `LinearFilter` gradient texture implementing a soft
 * 3-step Studio Ghibli toon ramp:
 * - Step 1 (soft shaded underside): ~0.34–0.42
 * - Step 2 (lush hand-painted midtone): ~0.68–0.76
 * - Step 3 (warm sunlit canopy top): ~0.96–1.00
 * Smooth 2-texel feathered transitions keep foliage velvety and 3D rather than
 * harsh comic bands or flat unlit stickers.
 */
export function getSoftGhibliGradientMap(): THREE.DataTexture {
  if (cachedGhibliGradientMap) {
    return cachedGhibliGradientMap;
  }

  // 16-step airy, calm 3-band Ghibli ramp sampled by Three.js MeshToonMaterial at dotNL * 0.5 + 0.5
  // High shadow floor (~0.56) preserves clean 3D form without heavy muddy dark undersides
  const ramp = new Uint8Array([
    142, 146, 152, 162,
    178, 194, 206, 214,
    222, 228, 238, 246,
    252, 255, 255, 255,
  ]);

  const tex = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cachedGhibliGradientMap = tex;
  return tex;
}

export function disposeGhibliGradientMap(): void {
  if (cachedGhibliGradientMap) {
    cachedGhibliGradientMap.dispose();
    cachedGhibliGradientMap = null;
  }
}

/**
 * Determines whether a GLB material is alpha-cutout foliage/petals/grass.
 */
export function isStylizedAACutoutMaterial(
  original: THREE.Material,
  category: StylizedAAAssetCategory,
  meshName = '',
): boolean {
  if (
    category === 'deadTree' ||
    category === 'mushroom' ||
    category === 'rock' ||
    category === 'pathStone'
  ) {
    return false;
  }
  if (
    category === 'grass' ||
    category === 'flower' ||
    category === 'petal' ||
    category === 'plant'
  ) {
    return true;
  }

  const combined = `${meshName} ${original.name ?? ''}`.trim();
  const src = original as THREE.Material & { alphaMap?: THREE.Texture | null };

  if (OPAQUE_PROP_RE.test(combined)) {
    return false;
  }
  // Explicitly detect bark even when GLB marks Bark_NormalTree as alphaMode=MASK
  if (BARK_NAME_RE.test(combined) && !CUTOUT_NAME_RE.test(combined)) {
    return false;
  }
  if (category === 'bush') {
    return true;
  }
  if (CUTOUT_NAME_RE.test(combined)) return true;
  if (src.transparent || src.alphaTest > 0 || Boolean(src.alphaMap)) return true;

  return false;
}

interface CategoryShaderPreset {
  readonly shadowColor: string;
  readonly shadowTintStrength: number;
  readonly sunTint: string;
  readonly translucencyColor: string;
  readonly translucencyStrength: number;
  readonly rimColor: string;
  readonly rimStrength: number;
  /** Underside / inner-crown ambient occlusion tint (darker warm-green / warm-amber) */
  readonly bottomTint: string;
  /** Subtle sunlit crown top tint */
  readonly topTint: string;
  readonly gradientStrength: number;
  readonly windStrength: number;
  readonly windSpeed: number;
  readonly windScale: number;
  readonly upNormalBlend: number;
  readonly sphereNormalBlend: number;
  readonly canopyCenterRatio: number;
  readonly saturationBoost: number;
  /** Natural pigment calibration (toned down from neon pastels) */
  readonly albedoShift: string;
  readonly defaultAlphaTest: number;
  readonly isGrassRemap: boolean;
}

// Serene, airy, vibrant Studio Ghibli 3D-lit foliage presets:
// - Luminous, calm high-key sunlit crowns (no heavy muddy dark red, black-green, or burnt-brown)
// - Clean cool-shifted / warm-lifted shaded undersides for gentle volumetric 3D depth
const CUTOUT_PRESETS: Record<StylizedAAAssetCategory, CategoryShaderPreset> = {
  birch: {
    // Calm luminous sunlit honey-butter gold -> soft warm golden-apricot shaded undersides
    shadowColor: '#d49d4e',
    shadowTintStrength: 0.2,
    sunTint: '#fffbe0',
    translucencyColor: '#ffe57a',
    translucencyStrength: 0.16,
    rimColor: '#fffad4',
    rimStrength: 0.12,
    bottomTint: '#e6b85c',
    topTint: '#fff19c',
    gradientStrength: 0.36,
    windStrength: 0.036,
    windSpeed: 0.98,
    windScale: 0.14,
    upNormalBlend: 0.14,
    sphereNormalBlend: 0.88,
    canopyCenterRatio: 0.64,
    saturationBoost: 1.06,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  maple: {
    // Calm vibrant autumn apricot-peach -> sunlit golden coral-honey (zero heavy dark red)
    shadowColor: '#d47c5d',
    shadowTintStrength: 0.2,
    sunTint: '#fff7de',
    translucencyColor: '#ffc278',
    translucencyStrength: 0.15,
    rimColor: '#fff0cc',
    rimStrength: 0.12,
    bottomTint: '#eb9662',
    topTint: '#ffd28a',
    gradientStrength: 0.36,
    windStrength: 0.034,
    windSpeed: 0.94,
    windScale: 0.14,
    upNormalBlend: 0.12,
    sphereNormalBlend: 0.88,
    canopyCenterRatio: 0.64,
    saturationBoost: 1.06,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  sakura: {
    // Dreamy serene cherry blossom pastel pink -> soft airy rose-blush shaded undersides
    shadowColor: '#cf7ba8',
    shadowTintStrength: 0.2,
    sunTint: '#fff7fb',
    translucencyColor: '#ffb3d6',
    translucencyStrength: 0.16,
    rimColor: '#fff2f8',
    rimStrength: 0.12,
    bottomTint: '#eb99bf',
    topTint: '#ffe3f2',
    gradientStrength: 0.42,
    windStrength: 0.04,
    windSpeed: 1.04,
    windScale: 0.14,
    upNormalBlend: 0.14,
    sphereNormalBlend: 0.88,
    canopyCenterRatio: 0.64,
    saturationBoost: 1.06,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  commonTree: {
    // Calm vibrant spring jade-emerald -> sunlit fresh mint-meadow green (never heavy dark forest green)
    shadowColor: '#4da683',
    shadowTintStrength: 0.22,
    sunTint: '#f2ffd6',
    translucencyColor: '#9cf089',
    translucencyStrength: 0.16,
    rimColor: '#e3ffcf',
    rimStrength: 0.12,
    bottomTint: '#5ec484',
    topTint: '#b4f08e',
    gradientStrength: 0.38,
    windStrength: 0.035,
    windSpeed: 0.96,
    windScale: 0.14,
    upNormalBlend: 0.14,
    sphereNormalBlend: 0.88,
    canopyCenterRatio: 0.64,
    saturationBoost: 1.05,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  pine: {
    // Serene alpine seafoam-spruce -> sunlit cool teal-mint (airy, never heavy black-green)
    shadowColor: '#3f8f88',
    shadowTintStrength: 0.22,
    sunTint: '#e3fff0',
    translucencyColor: '#7ae0b8',
    translucencyStrength: 0.14,
    rimColor: '#d4fff0',
    rimStrength: 0.11,
    bottomTint: '#4da88e',
    topTint: '#9be0bc',
    gradientStrength: 0.38,
    windStrength: 0.024,
    windSpeed: 0.86,
    windScale: 0.12,
    upNormalBlend: 0.12,
    sphereNormalBlend: 0.84,
    canopyCenterRatio: 0.56,
    saturationBoost: 1.05,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  twistedTree: {
    // Calm sunlit celadon-spring green -> fresh airy mint-jade undersides
    shadowColor: '#4fa882',
    shadowTintStrength: 0.22,
    sunTint: '#f2ffd9',
    translucencyColor: '#a2f089',
    translucencyStrength: 0.16,
    rimColor: '#e6ffd4',
    rimStrength: 0.12,
    bottomTint: '#64c786',
    topTint: '#baf294',
    gradientStrength: 0.38,
    windStrength: 0.034,
    windSpeed: 0.94,
    windScale: 0.14,
    upNormalBlend: 0.14,
    sphereNormalBlend: 0.88,
    canopyCenterRatio: 0.62,
    saturationBoost: 1.05,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  deadTree: {
    shadowColor: '#6f8aa3',
    shadowTintStrength: 0.2,
    sunTint: '#fff5e0',
    translucencyColor: '#dcd0b6',
    translucencyStrength: 0.0,
    rimColor: '#e0f0ff',
    rimStrength: 0.08,
    bottomTint: '#9e958a',
    topTint: '#f0ebe0',
    gradientStrength: 0.22,
    windStrength: 0.008,
    windSpeed: 0.8,
    windScale: 0.1,
    upNormalBlend: 0.1,
    sphereNormalBlend: 0.0,
    canopyCenterRatio: 0.5,
    saturationBoost: 1.0,
    albedoShift: '#f0efed',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  bush: {
    // Calm vibrant meadow-jade shrubs -> sunlit spring-green tops
    shadowColor: '#52ab80',
    shadowTintStrength: 0.2,
    sunTint: '#f2ffd9',
    translucencyColor: '#a2f089',
    translucencyStrength: 0.15,
    rimColor: '#e6ffd1',
    rimStrength: 0.1,
    bottomTint: '#65c782',
    topTint: '#bbf28f',
    gradientStrength: 0.36,
    windStrength: 0.022,
    windSpeed: 1.12,
    windScale: 0.2,
    upNormalBlend: 0.22,
    sphereNormalBlend: 0.86,
    canopyCenterRatio: 0.48,
    saturationBoost: 1.05,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  plant: {
    shadowColor: '#48825e',
    shadowTintStrength: 0.24,
    sunTint: '#edf7b2',
    translucencyColor: '#9de060',
    translucencyStrength: 0.14,
    rimColor: '#e0f5aa',
    rimStrength: 0.08,
    bottomTint: '#6cb54a',
    topTint: '#a6e66c',
    gradientStrength: 0.34,
    windStrength: 0.028,
    windSpeed: 1.25,
    windScale: 0.2,
    upNormalBlend: 0.9,
    sphereNormalBlend: 0.0,
    canopyCenterRatio: 0.4,
    saturationBoost: 1.04,
    albedoShift: '#bde089',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  grass: {
    // Remaps dark GLB grass onto bright sunlit terrain lime/spring-green (#7ec850 -> #9be564)
    shadowColor: '#4f8f7c',
    shadowTintStrength: 0.24,
    sunTint: '#f7ffd4',
    translucencyColor: '#b3eb6c',
    translucencyStrength: 0.14,
    rimColor: '#e8f7b2',
    rimStrength: 0.06,
    bottomTint: '#7ec850', // matches sunlit meadow base cleanly
    topTint: '#a3eb68', // bright sunlit spring-green tips
    gradientStrength: 1.0,
    windStrength: 0.044,
    windSpeed: 1.4,
    windScale: 0.2,
    upNormalBlend: 0.96,
    sphereNormalBlend: 0.0,
    canopyCenterRatio: 0.35,
    saturationBoost: 1.04,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: true,
  },
  flower: {
    shadowColor: '#5c8aa3',
    shadowTintStrength: 0.2,
    sunTint: '#fff9de',
    translucencyColor: '#ffe39c',
    translucencyStrength: 0.16,
    rimColor: '#fffbe6',
    rimStrength: 0.08,
    bottomTint: '#7ec850',
    topTint: '#ffffff',
    gradientStrength: 0.18,
    windStrength: 0.036,
    windSpeed: 1.32,
    windScale: 0.2,
    upNormalBlend: 0.92,
    sphereNormalBlend: 0.0,
    canopyCenterRatio: 0.45,
    saturationBoost: 1.06,
    albedoShift: '#f7f5ed',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  petal: {
    shadowColor: '#6691a8',
    shadowTintStrength: 0.16,
    sunTint: '#fffbe8',
    translucencyColor: '#ffe2a6',
    translucencyStrength: 0.12,
    rimColor: '#ffffff',
    rimStrength: 0.06,
    bottomTint: '#e8edd8',
    topTint: '#ffffff',
    gradientStrength: 0.08,
    windStrength: 0.01,
    windSpeed: 1.05,
    windScale: 0.18,
    upNormalBlend: 0.96,
    sphereNormalBlend: 0.0,
    canopyCenterRatio: 0.2,
    saturationBoost: 1.04,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  mushroom: {
    shadowColor: '#6586a0',
    shadowTintStrength: 0.22,
    sunTint: '#fff6e0',
    translucencyColor: '#ffe3b3',
    translucencyStrength: 0.08,
    rimColor: '#fff7e0',
    rimStrength: 0.08,
    bottomTint: '#ada598',
    topTint: '#ffffff',
    gradientStrength: 0.18,
    windStrength: 0.0,
    windSpeed: 1.0,
    windScale: 0.1,
    upNormalBlend: 0.2,
    sphereNormalBlend: 0.0,
    canopyCenterRatio: 0.4,
    saturationBoost: 1.04,
    albedoShift: '#f7f5f0',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  rock: {
    // Warm sunlit Ghibli limestone with soft slate-blue shadow sides (never crushed black)
    shadowColor: '#7ca2ba',
    shadowTintStrength: 0.28,
    sunTint: '#fff6e0',
    translucencyColor: '#e3f2ff',
    translucencyStrength: 0.0,
    rimColor: '#e6f5ff',
    rimStrength: 0.12,
    bottomTint: '#b4c4c9',
    topTint: '#f7f7f0',
    gradientStrength: 0.22,
    windStrength: 0.0,
    windSpeed: 1.0,
    windScale: 0.1,
    upNormalBlend: 0.12,
    sphereNormalBlend: 0.0,
    canopyCenterRatio: 0.5,
    saturationBoost: 0.96,
    albedoShift: '#ffffff',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
  pathStone: {
    shadowColor: '#84a5ba',
    shadowTintStrength: 0.22,
    sunTint: '#fff8e6',
    translucencyColor: '#ebf5ff',
    translucencyStrength: 0.0,
    rimColor: '#f0f8ff',
    rimStrength: 0.06,
    bottomTint: '#d1cbbd',
    topTint: '#faf6ec',
    gradientStrength: 0.14,
    windStrength: 0.0,
    windSpeed: 1.0,
    windScale: 0.1,
    upNormalBlend: 0.42,
    sphereNormalBlend: 0.0,
    canopyCenterRatio: 0.2,
    saturationBoost: 0.94,
    albedoShift: '#faf2e1',
    defaultAlphaTest: 0.5,
    isGrassRemap: false,
  },
};

const BARK_PRESET: CategoryShaderPreset = {
  shadowColor: '#8ba4ba',
  shadowTintStrength: 0.22,
  sunTint: '#fff5e0',
  translucencyColor: '#f0e2c6',
  translucencyStrength: 0.0,
  rimColor: '#e6f4ff',
  rimStrength: 0.1,
  bottomTint: '#baa997',
  topTint: '#faf5eb',
  gradientStrength: 0.18,
  windStrength: 0.01,
  windSpeed: 0.92,
  windScale: 0.12,
  upNormalBlend: 0.1,
  sphereNormalBlend: 0.0,
  canopyCenterRatio: 0.5,
  saturationBoost: 1.0,
  albedoShift: '#fffaf2',
  defaultAlphaTest: 0.5,
  isGrassRemap: false,
};

const AA_VERTEX_PARS = /* glsl */ `
uniform float uTime;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform float uWindScale;
uniform float uWindMultiplier;
uniform float uGradientHeight;
uniform float uUpNormalBlend;
uniform float uSphereNormalBlend;
uniform vec3 uCanopyCenter;
uniform vec3 uCanopyRadius;
uniform vec3 uSunDirection;

varying float vAALocalY;
varying vec3 vAALocalPos;
varying float vAACrownHeightT;
varying float vAACrownRadial;
varying vec3 vAAWorldPos;
varying vec3 vAASmoothViewNormal;
varying float vAAWorldSunDot;
`;

const AA_BEGIN_NORMAL_VERTEX = /* glsl */ `
#include <beginnormal_vertex>
{
  vec3 aaPureSphereN = objectNormal;
  if ( uSphereNormalBlend > 0.001 ) {
    vec3 aaFromCrown = ( position - uCanopyCenter ) / max( uCanopyRadius, vec3( 0.25 ) );
    float aaCrownLen = length( aaFromCrown );
    // Spherical outward canopy normal with gentle upward bias so 3D directional lighting
    // catches the top/sunlit half of each crown and shades the underside smoothly
    aaPureSphereN = aaCrownLen > 0.001
      ? normalize( aaFromCrown / aaCrownLen + vec3( 0.0, 0.26, 0.0 ) )
      : vec3( 0.0, 1.0, 0.0 );
    objectNormal = normalize( mix( objectNormal, aaPureSphereN, uSphereNormalBlend ) );
  }
  if ( uUpNormalBlend > 0.001 ) {
    objectNormal = normalize( mix( objectNormal, vec3( 0.0, 1.0, 0.0 ), uUpNormalBlend ) );
  }
  vec3 aaCrownObjN = aaPureSphereN;
  #ifdef USE_INSTANCING
    aaCrownObjN = mat3( instanceMatrix ) * aaCrownObjN;
  #endif
  vAASmoothViewNormal = normalize( normalMatrix * aaCrownObjN );
  vec3 aaWorldSunN = normalize( mat3( modelMatrix ) * aaCrownObjN );
  vAAWorldSunDot = dot( aaWorldSunN, normalize( uSunDirection ) );
}
`;

// Smooth, cohesive Studio Ghibli breeze with ZERO high-frequency card shearing / Z-fighting
const AA_BEGIN_VERTEX = /* glsl */ `
#include <begin_vertex>
vAALocalY = position.y;
vAALocalPos = position;
{
  vec3 aaNormOffset = ( position - uCanopyCenter ) / max( uCanopyRadius, vec3( 0.25 ) );
  vAACrownHeightT = clamp( aaNormOffset.y * 0.5 + 0.5, 0.0, 1.0 );
  vAACrownRadial = clamp( length( aaNormOffset ), 0.0, 1.35 );
}
if ( uWindStrength > 0.0005 ) {
  vec3 aaInstanceOrigin = vec3( 0.0 );
  #ifdef USE_INSTANCING
    aaInstanceOrigin = instanceMatrix[ 3 ].xyz;
  #endif
  float aaHeightRatio = clamp( position.y / max( uGradientHeight, 0.25 ), 0.0, 1.0 );
  float aaBendWeight = aaHeightRatio * aaHeightRatio;
  float aaEffectiveWind = uWindStrength * uWindMultiplier;
  float aaPhase = ( aaInstanceOrigin.x * 0.52 + aaInstanceOrigin.z * 0.44 ) * uWindScale + uTime * uWindSpeed * ( 0.72 + 0.28 * uWindMultiplier );
  float aaBreeze = sin( aaPhase ) * 0.72 + sin( aaPhase * 0.53 + 1.4 ) * 0.28;
  transformed.x += aaBreeze * aaEffectiveWind * aaBendWeight;
  transformed.z += aaBreeze * 0.58 * aaEffectiveWind * aaBendWeight;
}
`;

const AA_WORLD_POS_CHUNK = /* glsl */ `
#include <worldpos_vertex>
{
  vec4 aaWp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    aaWp = instanceMatrix * aaWp;
  #endif
  aaWp = modelMatrix * aaWp;
  vAAWorldPos = aaWp.xyz;
}
`;

const AA_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uShadowColor;
uniform float uShadowTintStrength;
uniform vec3 uSunTint;
uniform vec3 uTranslucencyColor;
uniform float uTranslucencyStrength;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform vec3 uBottomTint;
uniform vec3 uTopTint;
uniform float uGradientHeight;
uniform float uGradientStrength;
uniform float uSaturationBoost;
uniform vec3 uAlbedoShift;
uniform float uIsCanopy;
uniform float uGrassRemap;
uniform float uSakuraRemap;
uniform float uMapleRemap;
uniform float uHeroAutumnEnabled;
uniform vec3 uHeroCrimsonColor;
uniform vec3 uHeroTangerineColor;

varying float vAALocalY;
varying vec3 vAALocalPos;
varying float vAACrownHeightT;
varying float vAACrownRadial;
varying vec3 vAAWorldPos;
varying vec3 vAASmoothViewNormal;
varying float vAAWorldSunDot;
`;

// Pre-lighting albedo calibration & canopy ambient occlusion (runs BEFORE real 3D toon lighting!)
const AA_COLOR_FRAGMENT = /* glsl */ `
#include <color_fragment>
{
  if ( uGrassRemap > 0.5 ) {
    // Remap dark GLB grass texture cleanly onto bright sunlit Ghibli terrain green (#7ec850 -> #9be564)
    // while preserving subtle per-blade texture detail & per-instance tinting
    float aaTexLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    float aaBladeDetail = mix( 0.88, 1.10, smoothstep( 0.05, 0.52, aaTexLuma ) );
    float aaGrassH = clamp( vAALocalY / max( uGradientHeight, 0.25 ), 0.0, 1.0 );
    vec3 aaSpringGreen = mix( uBottomTint, uTopTint, smoothstep( 0.0, 0.9, aaGrassH ) );
    #ifdef USE_INSTANCING_COLOR
      diffuseColor.rgb = aaSpringGreen * aaBladeDetail * vColor.rgb;
    #else
      diffuseColor.rgb = aaSpringGreen * aaBladeDetail;
    #endif
  } else if ( uSakuraRemap > 0.5 ) {
    // Remap leaf cluster texture cleanly into luminous Studio Ghibli cherry-blossom pinks
    // (soft rose-pink inner underside -> vibrant blossom pink -> sunlit ivory-blush petal crown)
    float aaTexLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    float aaPetalDetail = mix( 0.84, 1.14, smoothstep( 0.05, 0.54, aaTexLuma ) );
    float aaCrownBlend = clamp( vAACrownHeightT * 0.72 + smoothstep( 0.18, 0.96, vAACrownRadial ) * 0.28, 0.0, 1.0 );
    vec3 aaSakuraCol = mix( uBottomTint, uTopTint, smoothstep( 0.06, 0.92, aaCrownBlend ) );
    #ifdef USE_INSTANCING_COLOR
      diffuseColor.rgb = aaSakuraCol * aaPetalDetail * vColor.rgb;
    #else
      diffuseColor.rgb = aaSakuraCol * aaPetalDetail;
    #endif
  } else if ( uMapleRemap > 0.5 ) {
    // Remap dark blood-red GLB maple leaf texture cleanly into bright sunlit autumn golden-amber & apricot
    float aaTexLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    float aaLeafDetail = mix( 0.88, 1.12, smoothstep( 0.04, 0.44, aaTexLuma ) );
    float aaCrownBlend = clamp( vAACrownHeightT * 0.72 + smoothstep( 0.18, 0.95, vAACrownRadial ) * 0.28, 0.0, 1.0 );
    vec3 aaMapleCol = mix( uBottomTint, uTopTint, smoothstep( 0.08, 0.90, aaCrownBlend ) );
    #ifdef USE_INSTANCING_COLOR
      diffuseColor.rgb = aaMapleCol * aaLeafDetail * vColor.rgb;
    #else
      diffuseColor.rgb = aaMapleCol * aaLeafDetail;
    #endif
  } else if ( uHeroAutumnEnabled > 0.5 ) {
    // Soft, natural Ghibli autumn gradient for the foreground overhanging right red maple:
    // mostly warm crimson-red on upper/outer leaves transitioning gently (~25-30%) to warm
    // tangerine-orange toward lower/inner tips, with subtle per-leaf & radial shading variation
    // so overlapping leaf silhouettes remain crisp and readable rather than a flat red blob.
    float aaTexLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    float aaTexDetail = mix( 0.85, 1.13, smoothstep( 0.05, 0.46, aaTexLuma ) );

    float aaLowerMask = 1.0 - smoothstep( 0.08, 0.68, vAACrownHeightT );
    float aaInnerMask = 1.0 - smoothstep( 0.30, 0.94, vAACrownRadial );
    float aaTipFactor = clamp( aaLowerMask * 0.72 + aaInnerMask * 0.38, 0.0, 1.0 );
    // Balanced ~25-30% gentle warm tangerine-orange transition on lower/inner tips
    float aaOrangeWeight = smoothstep( 0.10, 0.88, aaTipFactor ) * 0.36;
    vec3 aaAutumnBase = mix( uHeroCrimsonColor, uHeroTangerineColor, aaOrangeWeight );

    // Subtle per-leaf-card spatial variation & radial crown depth to separate overlapping maple leaves
    vec3 aaLeafCoord = vAALocalPos * 2.95;
    float aaLeafWaveA = sin( aaLeafCoord.x * 1.73 + cos( aaLeafCoord.y * 2.15 - aaLeafCoord.z * 1.47 ) ) * 0.5 + 0.5;
    float aaLeafWaveB = sin( aaLeafCoord.y * 3.11 + aaLeafCoord.z * 2.43 - aaLeafCoord.x * 1.89 ) * 0.5 + 0.5;
    float aaLeafVar = aaLeafWaveA * 0.6 + aaLeafWaveB * 0.4;

    float aaLeafValueVar = mix( 0.87, 1.11, aaLeafVar );
    float aaRadialDepth = mix( 0.88, 1.06, smoothstep( 0.22, 0.96, vAACrownRadial ) );
    // Subtle warm per-leaf hue shift between deeper crimson leaves and slightly warmer amber-red tips
    vec3 aaLeafHueNuance = mix( vec3( 0.96, 0.88, 0.88 ), vec3( 1.06, 1.08, 0.94 ), aaLeafVar );

    // Gentle warm terracotta underside depth that preserves the soft tangerine transition rather than muddying it
    float aaBottomAO = 1.0 - smoothstep( 0.02, 0.48, vAACrownHeightT );
    vec3 aaUndersideMod = mix( vec3( 1.0 ), uBottomTint, aaBottomAO * 0.18 );

    diffuseColor.rgb = aaAutumnBase * aaTexDetail * aaLeafValueVar * aaRadialDepth * aaLeafHueNuance * aaUndersideMod;
  } else {
    diffuseColor.rgb *= uAlbedoShift;

    if ( uIsCanopy > 0.5 ) {
      // Calm, airy Studio Ghibli canopy palette calibration:
      // lifts heavy dark GLB leaf textures onto our serene luminous bottomTint -> topTint canopy gradient
      // while preserving crisp hand-painted leaf texture micro-detail & per-instance tint variety
      float aaTexLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
      float aaLeafDetail = mix( 0.88, 1.11, smoothstep( 0.04, 0.48, aaTexLuma ) );
      float aaCrownBlend = clamp( vAACrownHeightT * 0.72 + smoothstep( 0.16, 0.94, vAACrownRadial ) * 0.28, 0.0, 1.0 );
      vec3 aaCalmCanopy = mix( uBottomTint, uTopTint, smoothstep( 0.08, 0.90, aaCrownBlend ) ) * aaLeafDetail;
      #ifdef USE_INSTANCING_COLOR
        aaCalmCanopy *= vColor.rgb;
      #endif
      // Blend 76% toward the calm luminous palette so heavy dark greens/yellows become serene & vibrant
      // while flower-bush blossoms (high chroma non-green petals) retain their natural accent hues
      float aaPetalPreserve = smoothstep( 0.14, 0.42, max( diffuseColor.r - diffuseColor.g, diffuseColor.b - diffuseColor.g ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, aaCalmCanopy, mix( 0.82, 0.22, aaPetalPreserve ) );
    } else {
      float aaHeightT = smoothstep( 0.0, max( uGradientHeight, 0.25 ), vAALocalY );
      vec3 aaGradMod = mix( uBottomTint, uTopTint, aaHeightT );
      diffuseColor.rgb *= mix( vec3( 1.0 ), aaGradMod, uGradientStrength );
    }
  }
}
`;

// Prevent Three.js DOUBLE_SIDED `normal *= faceDirection` from flipping normals 180 deg on
// back-facing leaf cards! Both sides of each card keep the exact same smooth 3D canopy normal,
// so real directional + hemisphere toon lighting renders fluffy, flicker-free volume.
const AA_UNFLIPPED_NORMAL_FRAGMENT = /* glsl */ `
#include <normal_fragment_begin>
#ifdef DOUBLE_SIDED
  normal = normalize( vNormal );
  nonPerturbedNormal = normal;
#endif
`;

// Clean alphaTest: 0.5 cutout with 1-pixel rim de-fringing so leaf borders stay smooth
// without white WebP padding halos or z-fighting flicker
const AA_DEFRINGED_ALPHATEST_FRAGMENT = /* glsl */ `
#ifdef USE_ALPHATEST
  float aaRawAlpha = diffuseColor.a;
  if ( aaRawAlpha < alphaTest ) discard;
  float aaRimDefringe = smoothstep( 0.92, alphaTest, aaRawAlpha );
  if ( aaRimDefringe > 0.001 ) {
    vec3 aaDeepened = pow( max( diffuseColor.rgb, vec3( 0.0 ) ), vec3( 1.28 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, aaDeepened, aaRimDefringe * 0.52 );
  }
#endif
`;

// Post-lighting Studio Ghibli polish that PRESERVES real 3D MeshToonMaterial lighting
// (`reflectedLight.directDiffuse + reflectedLight.indirectDiffuse`) — NEVER overwrites with flat unlit color!
const AA_FRAGMENT_EFFECT = /* glsl */ `
{
  float aaSunMask = uIsCanopy > 0.5
    ? smoothstep( -0.22, 0.44, vAAWorldSunDot )
    : smoothstep( -0.18, 0.48, vAAWorldSunDot );

  vec3 aaViewDir = normalize( vViewPosition );
  vec3 aaRimN = uIsCanopy > 0.5
    ? ( uHeroAutumnEnabled > 0.5
        ? normalize( mix( normalize( vAASmoothViewNormal ), normalize( normal ), 0.36 ) )
        : normalize( vAASmoothViewNormal ) )
    : normalize( normal );
  float aaNdotV = clamp( abs( dot( aaRimN, aaViewDir ) ), 0.0, 1.0 );
  float aaEdgeFactor = smoothstep( 0.24, 0.88, 1.0 - aaNdotV );

  // Rich, hue-matched darker shadows at the shaded side & outer edges of tree canopies
  // (e.g. green trees turn a rich darker green at shaded edges rather than washed-out pastel/gray)
  float aaShadowMaxC = max( uShadowColor.r, max( uShadowColor.g, uShadowColor.b ) );
  vec3 aaShadowHue = uShadowColor / max( aaShadowMaxC, 0.01 );

  vec3 aaShadowTinted;
  if ( uIsCanopy > 0.5 ) {
    float aaEdgeShadowMix = clamp(
      ( 1.0 - aaSunMask ) * 0.72 + aaEdgeFactor * ( 1.0 - aaSunMask * 0.68 ) * 0.65,
      0.0,
      1.0
    );
    float aaEdgeDarken = uHeroAutumnEnabled > 0.5
      ? mix( 1.0, 0.92, aaEdgeShadowMix )
      : mix( 1.0, 0.90, aaEdgeShadowMix );
    vec3 aaHueMult = mix( vec3( 1.0 ), aaShadowHue, uShadowTintStrength * ( 0.40 + 0.60 * aaEdgeShadowMix ) );
    aaShadowTinted = outgoingLight * aaHueMult * aaEdgeDarken;
  } else {
    aaShadowTinted = outgoingLight * mix( vec3( 1.0 ), uShadowColor * 1.38, uShadowTintStrength );
    // Gentle sky-bounce ambient lift on shaded opaque trunks & limestone rocks so dark textures never crush to black
    if ( uGrassRemap < 0.5 ) {
      aaShadowTinted = max( aaShadowTinted, diffuseColor.rgb * uShadowColor * 0.54 + vec3( 0.06, 0.075, 0.085 ) );
    }
  }

  vec3 aaSunWarmed = outgoingLight * mix( vec3( 1.0 ), uSunTint, uIsCanopy > 0.5 ? 0.14 : 0.12 );
  outgoingLight = mix( aaShadowTinted, aaSunWarmed, aaSunMask );

  // Subtle shaded-edge darkening along outer canopy fringes facing away from direct sunlight
  if ( uIsCanopy > 0.5 && uHeroAutumnEnabled < 0.5 ) {
    float aaOuterShade = aaEdgeFactor * ( 1.0 - aaSunMask * 0.82 );
    outgoingLight *= mix( vec3( 1.0 ), aaShadowHue * 0.90, aaOuterShade * 0.08 );
  }

  // Soft backlit leaf translucency (capped to prevent sun-facing canopy glare blowout)
  if ( uTranslucencyStrength > 0.001 ) {
    vec3 aaWorldViewDir = normalize( cameraPosition - vAAWorldPos );
    float aaBacklit = pow( clamp( dot( aaWorldViewDir, -uSunDirection ), 0.0, 1.0 ), 3.2 );
    float aaEdgeMask = smoothstep( 0.28, 1.0, vAACrownHeightT ) * ( 0.35 + 0.65 * aaSunMask );
    outgoingLight += diffuseColor.rgb * uTranslucencyColor * ( aaBacklit * aaEdgeMask * uTranslucencyStrength * 0.34 );
  }

  // Crisp sunlit rim highlight ONLY on sun-facing outer edges so shaded tree edges stay darker and grounded
  if ( uRimStrength > 0.001 ) {
    float aaRim = uHeroAutumnEnabled > 0.5
      ? smoothstep( 0.46, 0.92, pow( 1.0 - aaNdotV, 2.55 ) )
      : smoothstep( 0.52, 0.94, pow( 1.0 - aaNdotV, 2.8 ) );
    vec3 aaHueSafeRim = mix( diffuseColor.rgb * 1.12, uRimColor, 0.38 );
    float aaSunRimGate = uHeroAutumnEnabled > 0.5
      ? mix( 0.24, 0.90, aaSunMask )
      : smoothstep( 0.36, 0.92, aaSunMask ) * 0.86;
    outgoingLight += aaHueSafeRim * ( aaRim * uRimStrength * aaSunRimGate );
  }

  // Vibrant HASTE chroma boost on canopies while keeping bark/rocks natural
  float aaOutLuma = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
  outgoingLight = max( mix( vec3( aaOutLuma ), outgoingLight, uSaturationBoost ), vec3( 0.0 ) );

  // Hue-preserving HDR soft shoulder on canopies so ultra-bright reds/greens NEVER channel-clip into orange/yellow under ACESFilmicToneMapping
  if ( uIsCanopy > 0.5 ) {
    float aaMaxC = max( outgoingLight.r, max( outgoingLight.g, outgoingLight.b ) );
    if ( aaMaxC > 0.95 ) {
      float aaExcess = aaMaxC - 0.95;
      float aaCompressed = 0.95 + aaExcess / ( 1.0 + aaExcess * 1.85 );
      outgoingLight *= aaCompressed / aaMaxC;
    }
  }
}
#include <opaque_fragment>
`;

/**
 * Creates a real 3D-lit Studio Ghibli foliage, bark, grass, or prop material built on
 * `THREE.MeshToonMaterial` with a soft 3-step `LinearFilter` gradient ramp:
 * - Real 3D directional sun + hemisphere lighting catches warm sunlit canopy tops
 *   while giving shaded undersides genuine volumetric depth (never flat neon stickers!)
 * - Subtle darker warm-green / warm-amber canopy underside & inner-core AO
 * - `alphaTest: 0.5`, `transparent: false`, `depthWrite: true` + unflipped spherical
 *   canopy normals eliminate flickering, z-fighting, and self-shadow speckles
 * - Bright `#7ec850`–`#9be564` terrain-matched grass colorization that receives soft shadows
 */
export function createStylizedAAFoliageMaterial(
  original: THREE.Material,
  options: CreateStylizedAAFoliageOptions,
): THREE.MeshToonMaterial {
  const src = original as THREE.Material & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
  };

  const diffuseMap = src.map ?? null;
  if (diffuseMap) {
    diffuseMap.colorSpace = THREE.SRGBColorSpace;
    diffuseMap.anisotropy = Math.min(Math.max(diffuseMap.anisotropy || 1, 4), 4);
    diffuseMap.minFilter = THREE.LinearMipmapLinearFilter;
    diffuseMap.magFilter = THREE.LinearFilter;
  }

  const baseColor = src.color ? src.color.clone() : new THREE.Color('#ffffff');
  const isCutout = isStylizedAACutoutMaterial(
    original,
    options.category,
    options.meshName,
  );
  const preset =
    isCutout ||
    options.category === 'deadTree' ||
    options.category === 'mushroom' ||
    options.category === 'rock' ||
    options.category === 'pathStone'
      ? CUTOUT_PRESETS[options.category]
      : BARK_PRESET;

  const alphaTest = isCutout ? (options.alphaTest ?? preset.defaultAlphaTest) : 0;

  const material = new THREE.MeshToonMaterial({
    color: baseColor,
    map: diffuseMap,
    alphaMap: src.alphaMap ?? null,
    gradientMap: getSoftGhibliGradientMap(),
    vertexColors: Boolean(original.vertexColors),
    alphaTest,
    transparent: false,
    depthWrite: true,
    side: isCutout ? THREE.DoubleSide : original.side,
    fog: true,
  });

  const sunDir = options.sunDirection
    ? options.sunDirection.clone().normalize()
    : new THREE.Vector3(52, 44, -84).normalize();
  const targetHeight = Math.max(options.targetHeight ?? 2.0, 0.3);

  const canopyCenter = options.canopyCenter
    ? options.canopyCenter.clone()
    : new THREE.Vector3(0, targetHeight * preset.canopyCenterRatio, 0);
  const canopyRadius = options.canopyRadius
    ? options.canopyRadius.clone()
    : new THREE.Vector3(
        Math.max(targetHeight * 0.32, 0.4),
        Math.max(targetHeight * 0.32, 0.4),
        Math.max(targetHeight * 0.32, 0.4),
      );

  const isCanopyCrown =
    isCutout &&
    (options.category === 'birch' ||
      options.category === 'maple' ||
      options.category === 'sakura' ||
      options.category === 'commonTree' ||
      options.category === 'pine' ||
      options.category === 'twistedTree' ||
      options.category === 'bush');

  const isHeroAutumnMaple = Boolean(options.heroAutumnGradient) && isCanopyCrown;
  const isSakuraCanopy = options.category === 'sakura' && isCanopyCrown;
  const isRemappedMapleCanopy = options.category === 'maple' && isCanopyCrown && !isHeroAutumnMaple;

  const uniforms: StylizedAAFoliageUniforms = {
    uTime: { value: 0 },
    uSunDirection: { value: sunDir },
    uShadowColor: {
      value: new THREE.Color(isHeroAutumnMaple ? '#cf7c5b' : preset.shadowColor),
    },
    uShadowTintStrength: {
      value: isHeroAutumnMaple ? 0.2 : preset.shadowTintStrength,
    },
    uSunTint: {
      value: new THREE.Color(isHeroAutumnMaple ? '#fff8de' : preset.sunTint),
    },
    uTranslucencyColor: {
      value: new THREE.Color(isHeroAutumnMaple ? '#ffc478' : preset.translucencyColor),
    },
    uTranslucencyStrength: {
      value: isHeroAutumnMaple ? 0.16 : preset.translucencyStrength,
    },
    uRimColor: {
      value: new THREE.Color(isHeroAutumnMaple ? '#ffebc2' : preset.rimColor),
    },
    uRimStrength: {
      value: isHeroAutumnMaple ? 0.13 : preset.rimStrength,
    },
    uBottomTint: {
      value: new THREE.Color(isHeroAutumnMaple ? '#e69b6c' : preset.bottomTint),
    },
    uTopTint: {
      value: new THREE.Color(isHeroAutumnMaple ? '#fff0c9' : preset.topTint),
    },
    uGradientHeight: { value: targetHeight },
    uGradientStrength: {
      value: isHeroAutumnMaple ? 0.26 : preset.gradientStrength,
    },
    uWindStrength: { value: preset.windStrength },
    uWindSpeed: { value: preset.windSpeed },
    uWindScale: { value: preset.windScale },
    uWindMultiplier: { value: 1.0 },
    uUpNormalBlend: { value: preset.upNormalBlend },
    uSphereNormalBlend: {
      value: isHeroAutumnMaple ? 0.72 : preset.sphereNormalBlend,
    },
    uCanopyCenter: { value: canopyCenter },
    uCanopyRadius: { value: canopyRadius },
    uSaturationBoost: {
      value: isHeroAutumnMaple ? 1.02 : preset.saturationBoost,
    },
    uAlbedoShift: {
      value: new THREE.Color(isHeroAutumnMaple ? '#ffffff' : preset.albedoShift),
    },
    uIsCanopy: { value: isCanopyCrown ? 1.0 : 0.0 },
    uGrassRemap: { value: preset.isGrassRemap ? 1.0 : 0.0 },
    uSakuraRemap: { value: isSakuraCanopy ? 1.0 : 0.0 },
    uMapleRemap: { value: isRemappedMapleCanopy ? 1.0 : 0.0 },
    uHeroAutumnEnabled: { value: isHeroAutumnMaple ? 1.0 : 0.0 },
    uHeroCrimsonColor: { value: new THREE.Color('#ed8f5c') },
    uHeroTangerineColor: { value: new THREE.Color('#ffd682') },
  };

  material.name = original.name
    ? `${original.name}_${isHeroAutumnMaple ? 'heroAutumnMaple' : isSakuraCanopy ? 'sakuraBlossom' : 'stylizedAA'}`
    : isHeroAutumnMaple
      ? 'glb_heroAutumnMaple'
      : isSakuraCanopy
        ? 'glb_sakuraBlossom'
        : 'glb_stylizedAA';
  material.userData.stylizedAAUniforms = uniforms;
  material.userData.stylizedAACategory = options.category;
  material.userData.isStylizedAACutout = isCutout;
  material.userData.isStylizedAACanopyCrown = isCanopyCrown;
  material.userData.isHeroAutumnMaple = isHeroAutumnMaple;
  material.userData.isSakuraCanopy = isSakuraCanopy;

  material.customProgramCacheKey = () =>
    isHeroAutumnMaple
      ? 'stylized-ghibli-toon-hero-maple-v8'
      : isSakuraCanopy
        ? 'stylized-ghibli-toon-sakura-v8'
        : isCutout
          ? 'stylized-ghibli-toon-cutout-v8'
          : 'stylized-ghibli-toon-opaque-v8';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${AA_VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', AA_BEGIN_NORMAL_VERTEX)
      .replace('#include <begin_vertex>', AA_BEGIN_VERTEX)
      .replace('#include <worldpos_vertex>', AA_WORLD_POS_CHUNK);

    let frag = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${AA_FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', AA_COLOR_FRAGMENT)
      .replace('#include <opaque_fragment>', AA_FRAGMENT_EFFECT);

    if (isCutout) {
      frag = frag
        .replace('#include <normal_fragment_begin>', AA_UNFLIPPED_NORMAL_FRAGMENT)
        .replace('#include <alphatest_fragment>', AA_DEFRINGED_ALPHATEST_FRAGMENT);
    }

    shader.fragmentShader = frag;
    material.userData.shader = shader;
  };

  return material;
}

// ---------------------------------------------------------------------------
// Studio Ghibli Hand-Painted Meadow Ground Material
// ---------------------------------------------------------------------------

export interface StylizedAAGroundUniforms {
  uTime: { value: number };
  uShadowColor: { value: THREE.Color };
  uSunTint: { value: THREE.Color };
}

const GROUND_VERTEX_PARS = /* glsl */ `
varying vec3 vGroundWorldPos;
`;

const GROUND_WORLD_POS = /* glsl */ `
#include <worldpos_vertex>
vGroundWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`;

const GROUND_FRAGMENT_PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uShadowColor;
uniform vec3 uSunTint;
varying vec3 vGroundWorldPos;

float aaHash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

float aaValueNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = aaHash21( i );
  float b = aaHash21( i + vec2( 1.0, 0.0 ) );
  float c = aaHash21( i + vec2( 0.0, 1.0 ) );
  float d = aaHash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float aaFbm( vec2 p ) {
  float v = 0.0;
  float amp = 0.56;
  for ( int i = 0; i < 3; i++ ) {
    v += amp * aaValueNoise( p );
    p = p * 2.02 + vec2( 17.3, -11.9 );
    amp *= 0.46;
  }
  return v;
}
`;

// Soft, clean Studio Ghibli hand-painted gouache meadow & creamy winding footpath
const GROUND_COLOR_MOD = /* glsl */ `
#include <color_fragment>
{
  vec2 wp = vGroundWorldPos.xz;
  float washMacro = aaFbm( wp * 0.042 );
  float brushMed = aaFbm( vec2( wp.x * 0.16 + wp.y * 0.08, wp.y * 0.22 - wp.x * 0.07 ) );
  float softStroke = aaValueNoise( vec2( wp.x * 0.72, wp.y * 0.48 ) );

  // Detect warm creamy trail vs hand-painted Ghibli meadow
  float isTrail = smoothstep( 0.015, 0.14, diffuseColor.r - diffuseColor.g );

  // Broad, serene Studio Ghibli watercolor meadow washes matched to #7ec850 - #9be564 grass
  vec3 meadowWarm = vec3( 1.06, 1.04, 0.88 );
  vec3 meadowCool = vec3( 0.90, 1.01, 0.92 );
  float meadowBrush = smoothstep( 0.22, 0.78, washMacro * 0.65 + brushMed * 0.35 );
  vec3 meadowTint = mix( meadowCool, meadowWarm, meadowBrush )
    * mix( 0.95, 1.05, brushMed * 0.68 + softStroke * 0.32 );

  // Clean, smooth, sun-warmed painted earth path with subtle brush texture
  vec3 trailTint = mix( vec3( 0.96, 0.93, 0.88 ), vec3( 1.05, 1.02, 0.96 ), brushMed * 0.6 + softStroke * 0.4 );

  diffuseColor.rgb *= mix( meadowTint, trailTint, isTrail );
}
`;

const GROUND_OPAQUE_MOD = /* glsl */ `
{
  // Gentle drifting Ghibli cloud shadows gliding softly over the hillside
  vec2 cloudUv = vGroundWorldPos.xz * 0.016 + vec2( uTime * 0.012, uTime * 0.008 );
  float cloudDapple = smoothstep( 0.34, 0.74, aaFbm( cloudUv ) );
  float dappleLight = mix( 0.92, 1.04, cloudDapple );

  float aaBaseLuma = max( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
  float aaDirectLuma = dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) );
  float aaLit = clamp( ( aaDirectLuma * PI ) / aaBaseLuma, 0.0, 1.0 );
  float aaSoftLit = smoothstep( 0.06, 0.76, aaLit );

  // Soft pastel blue-teal cast shadows from trees harmonized with the painted meadow
  vec3 aaCoolShade = max( outgoingLight, diffuseColor.rgb * uShadowColor * 0.76 )
    * mix( vec3( 1.0 ), uShadowColor * 1.28, 0.42 )
    + diffuseColor.rgb * uShadowColor * 0.10;
  outgoingLight = mix( aaCoolShade, outgoingLight * mix( vec3( 1.0 ), uSunTint, 0.14 ), mix( 0.56, 1.0, aaSoftLit ) );
  outgoingLight *= mix( 1.0, dappleLight, aaSoftLit );

  // Gentle balanced watercolor richness (never harsh neon)
  float gLuma = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
  outgoingLight = max( mix( vec3( gLuma ), outgoingLight, 1.04 ), vec3( 0.0 ) );
}
#include <opaque_fragment>
`;

/**
 * Creates the Studio Ghibli hand-painted meadow ground material for Autumn Glade
 * with soft watercolor grass washes, clean sandy footpath, gentle drifting cloud
 * dapples, and soft grounded blue-teal tree shadows.
 */
export function createStylizedAAGroundMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color('#ffffff'),
    gradientMap: getSoftGhibliGradientMap(),
    vertexColors: true,
    fog: true,
  });

  const uniforms: StylizedAAGroundUniforms = {
    uTime: { value: 0 },
    uShadowColor: { value: new THREE.Color('#4c889e') },
    uSunTint: { value: new THREE.Color('#fff7de') },
  };

  material.name = 'autumnGlade_stylizedAAGround';
  material.userData.stylizedAAGroundUniforms = uniforms;
  material.customProgramCacheKey = () => 'stylized-ghibli-ground-v5';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GROUND_VERTEX_PARS}`)
      .replace('#include <worldpos_vertex>', GROUND_WORLD_POS);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GROUND_FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', GROUND_COLOR_MOD)
      .replace('#include <opaque_fragment>', GROUND_OPAQUE_MOD);

    material.userData.shader = shader;
  };

  return material;
}

// ---------------------------------------------------------------------------
// Studio Ghibli Hand-Painted Stone / Distant Mountain Material
// ---------------------------------------------------------------------------

export function createStylizedAAStoneMaterial(options: {
  color?: THREE.ColorRepresentation;
  vertexColors?: boolean;
  shadowColor?: THREE.ColorRepresentation;
  rimColor?: THREE.ColorRepresentation;
  rimStrength?: number;
  flatShading?: boolean;
  name?: string;
} = {}): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(options.color ?? '#ffffff'),
    gradientMap: getSoftGhibliGradientMap(),
    vertexColors: options.vertexColors ?? true,
    fog: true,
  });

  const uniforms = {
    uShadowColor: { value: new THREE.Color(options.shadowColor ?? '#5c8aa8') },
    uSunTint: { value: new THREE.Color('#fff7e3') },
    uRimColor: { value: new THREE.Color(options.rimColor ?? '#dff6ff') },
    uRimStrength: { value: options.rimStrength ?? 0.16 },
  };

  material.name = options.name ?? 'autumnGlade_stylizedAAStone';
  material.userData.stylizedAAStoneUniforms = uniforms;
  material.customProgramCacheKey = () => 'stylized-ghibli-stone-v3';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uShadowColor;
uniform vec3 uSunTint;
uniform vec3 uRimColor;
uniform float uRimStrength;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  float stBaseLuma = max( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
  float stDirectLuma = dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) );
  float stLit = clamp( ( stDirectLuma * PI ) / stBaseLuma, 0.0, 1.0 );
  float stCel = smoothstep( 0.12, 0.58, stLit );

  vec3 stShade = outgoingLight * mix( vec3( 1.0 ), uShadowColor * 1.32, 0.34 );
  outgoingLight = mix( stShade, outgoingLight * mix( vec3( 1.0 ), uSunTint, 0.16 ), stCel );

  vec3 stViewDir = normalize( vViewPosition );
  float stNdotV = clamp( abs( dot( normalize( normal ), stViewDir ) ), 0.0, 1.0 );
  float stRim = smoothstep( 0.46, 0.94, pow( 1.0 - stNdotV, 2.6 ) );
  outgoingLight += uRimColor * ( stRim * uRimStrength * mix( 0.25, 0.85, stCel ) );
}
#include <opaque_fragment>`,
      );
    material.userData.shader = shader;
  };

  return material;
}

/**
 * Updates live `uTime` uniform across Stylized AA foliage & ground materials
 * with zero per-frame allocations.
 */
export function updateStylizedAAShaderTime(
  materials: readonly THREE.Material[],
  elapsed: number,
  windMultiplier = 1.0,
): void {
  for (let i = 0; i < materials.length; i += 1) {
    const mat = materials[i];
    const foliageUniforms = mat.userData.stylizedAAUniforms as
      | StylizedAAFoliageUniforms
      | undefined;
    if (foliageUniforms) {
      foliageUniforms.uTime.value = elapsed;
      foliageUniforms.uWindMultiplier.value = windMultiplier;
    }
    const groundUniforms = mat.userData.stylizedAAGroundUniforms as
      | StylizedAAGroundUniforms
      | undefined;
    if (groundUniforms) {
      groundUniforms.uTime.value = elapsed;
    }
  }
}
