import * as THREE from 'three';

export interface AtmosphereConfig {
  zenithColor: THREE.ColorRepresentation;
  midSkyColor: THREE.ColorRepresentation;
  horizonColor: THREE.ColorRepresentation;
  groundColor: THREE.ColorRepresentation;
  fogColor: THREE.ColorRepresentation;
  fogDensity: number;
  sunPosition: readonly [number, number, number];
  sunColor: THREE.ColorRepresentation;
  sunIntensity: number;
  sunGlowColor: THREE.ColorRepresentation;
  sunGlowIntensity: number;
  hemiSkyColor: THREE.ColorRepresentation;
  hemiGroundColor: THREE.ColorRepresentation;
  hemiIntensity: number;
  starIntensity: number;
}

export interface CreateAtmosphereOptions {
  isSoftwareGl?: boolean;
  castShadow?: boolean;
  config?: Partial<AtmosphereConfig>;
}

export interface SkyDomeUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uZenithColor: THREE.IUniform<THREE.Color>;
  uMidSkyColor: THREE.IUniform<THREE.Color>;
  uHorizonColor: THREE.IUniform<THREE.Color>;
  uGroundColor: THREE.IUniform<THREE.Color>;
  uSunDirection: THREE.IUniform<THREE.Vector3>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uSunGlowIntensity: THREE.IUniform<number>;
  uStarIntensity: THREE.IUniform<number>;
  uMoonDirection: THREE.IUniform<THREE.Vector3>;
  uMoonIntensity: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
}

export interface AtmosphereController {
  readonly skyMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly skyMaterial: THREE.ShaderMaterial;
  readonly skyUniforms: SkyDomeUniforms;
  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  getSunDirection: (target?: THREE.Vector3) => THREE.Vector3;
  applyMood: (partial: Partial<AtmosphereConfig>) => void;
  setCelestialBody: (
    skySunPosition: readonly [number, number, number],
    moonDirection: readonly [number, number, number],
    moonIntensity: number,
  ) => void;
  setShadowCenter: (x: number, z: number, halfSize?: number) => void;
  update: (dt: number, elapsed: number, cameraPosition?: THREE.Vector3) => void;
  dispose: () => void;
}

export const SKY_DOME_RADIUS = 3200;
export const SHADOW_MAP_SIZE = 2048;
export const DEFAULT_SHADOW_HALF_EXTENT = 18;

export const DEFAULT_ATMOSPHERE_CONFIG: AtmosphereConfig = {
  zenithColor: '#4ea8de',
  midSkyColor: '#76c5f0',
  horizonColor: '#e0fbfc',
  groundColor: '#bfe6ec',
  fogColor: '#d4f3f7',
  fogDensity: 0.0042,
  sunPosition: [95, 108, 65],
  sunColor: '#fff2d6',
  sunIntensity: 1.95,
  sunGlowColor: '#fff3c4',
  sunGlowIntensity: 0.72,
  hemiSkyColor: '#9be2ff',
  hemiGroundColor: '#7aa86a',
  hemiIntensity: 0.72,
  starIntensity: 0.0,
};

const SKY_DOME_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDir;

void main() {
  vWorldDir = normalize( position );
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SKY_DOME_FRAGMENT_SHADER = /* glsl */ `
#include <common>

uniform vec3 uZenithColor;
uniform vec3 uMidSkyColor;
uniform vec3 uHorizonColor;
uniform vec3 uGroundColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunGlowIntensity;
uniform float uStarIntensity;
uniform vec3 uMoonDirection;
uniform float uMoonIntensity;
uniform float uTime;

varying vec3 vWorldDir;

float hash31( vec3 p ) {
  p = fract( p * vec3( 443.897, 441.423, 437.195 ) );
  p += dot( p, p.yzx + 19.19 );
  return fract( ( p.x + p.y ) * p.z );
}

void main() {
  vec3 dir = normalize( vWorldDir );
  float h = dir.y;

  // Painterly anime sky dome: warm creamy horizon (#e0fbfc) -> luminous mid-sky -> vibrant Genshin azure (#4ea8de).
  // Curves are tuned for eye-level landscape vistas (h in [0.0, 0.45]) as well as upward sky gazes.
  vec3 skyColor;
  if ( h >= 0.0 ) {
    float lowBand = smoothstep( 0.0, 0.16, h );
    float highBand = smoothstep( 0.11, 0.44, h );
    float deepZenithBand = smoothstep( 0.44, 0.92, h );
    skyColor = mix( uHorizonColor, uMidSkyColor, lowBand );
    skyColor = mix( skyColor, uZenithColor, highBand );
    skyColor = mix( skyColor, uZenithColor * 0.86, deepZenithBand );

    // Warm creamy horizon bloom right along the skyline
    float horizonGlow = pow( 1.0 - clamp( h, 0.0, 1.0 ), 8.5 );
    skyColor = mix( skyColor, uHorizonColor, horizonGlow * 0.52 );
  } else {
    float belowBand = smoothstep( 0.0, -0.35, h );
    skyColor = mix( uHorizonColor, uGroundColor, belowBand );
  }

  // Soft, balanced golden sun scatter + gentle anime solar disc (comfortable even when looking directly toward the sun)
  vec3 sunDir = normalize( uSunDirection );
  float sunCos = max( dot( dir, sunDir ), 0.0 );
  float broadHalo = pow( sunCos, 10.0 ) * 0.13;
  float tightHalo = pow( sunCos, 64.0 ) * 0.22;
  float sunDisc = smoothstep( 0.9984, 0.9995, sunCos ) * 0.62;
  float aboveHorizonMask = smoothstep( -0.06, 0.06, h );
  skyColor += uSunColor * ( broadHalo + tightHalo + sunDisc ) * uSunGlowIntensity * aboveHorizonMask;
  // Soft HDR roll-off prevents blinding white blowout when looking into the sun
  float skyMax = max( skyColor.r, max( skyColor.g, skyColor.b ) );
  if ( skyMax > 0.94 ) {
    float excess = skyMax - 0.94;
    float rolled = 0.94 + excess / ( 1.0 + excess * 2.8 );
    skyColor *= rolled / skyMax;
  }

  // Crisp procedural twinkling starfield (inactive in daytime, smoothly revealed in Starlight Ruins).
  if ( uStarIntensity > 0.005 && h > 0.03 ) {
    vec3 starCell = floor( dir * 210.0 );
    float starRand = hash31( starCell );
    if ( starRand > 0.992 ) {
      vec3 cellCenter = normalize( starCell + 0.5 );
      float distToStar = length( dir - cellCenter ) * 210.0;
      float starCore = smoothstep( 0.36, 0.04, distToStar );
      float twinkle = 0.65 + 0.35 * sin( uTime * ( 1.8 + fract( starRand * 97.0 ) * 2.4 ) + starRand * 62.8 );
      float elevationMask = smoothstep( 0.03, 0.32, h );
      vec3 starTint = mix( vec3( 0.86, 0.93, 1.0 ), vec3( 1.0, 0.94, 0.82 ), fract( starRand * 31.7 ) );
      skyColor += starTint * ( starCore * twinkle * elevationMask * uStarIntensity * 1.6 );
    }
  }

  // Luminous pale silver-gold Moon disc & soft lunar halo during twilight & night
  if ( uMoonIntensity > 0.005 ) {
    vec3 moonDir = normalize( uMoonDirection );
    float moonCos = max( dot( dir, moonDir ), 0.0 );
    float moonHalo = pow( moonCos, 28.0 ) * 0.24 + pow( moonCos, 160.0 ) * 0.32;
    float moonDisc = smoothstep( 0.9985, 0.9992, moonCos ) * 1.15;
    float moonAbove = smoothstep( -0.04, 0.06, h );
    skyColor += vec3( 0.86, 0.92, 1.0 ) * ( moonHalo + moonDisc ) * uMoonIntensity * moonAbove;
  }

  gl_FragColor = vec4( skyColor, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function resolveAtmosphereConfig(
  overrides?: Partial<AtmosphereConfig>,
): AtmosphereConfig {
  return {
    ...DEFAULT_ATMOSPHERE_CONFIG,
    ...overrides,
    sunPosition: overrides?.sunPosition ?? DEFAULT_ATMOSPHERE_CONFIG.sunPosition,
  };
}

export function computeSunDirection(
  sunPosition: readonly [number, number, number],
  target = new THREE.Vector3(),
): THREE.Vector3 {
  target.set(sunPosition[0], sunPosition[1], sunPosition[2]);
  if (target.lengthSq() < 1e-8) {
    target.set(0.5, 0.7, 0.5);
  }
  return target.normalize();
}

/**
 * Creates the stylized anime sky dome, exponential distance fog,
 * warm golden directional sun with 2048x2048 soft shadows, and sky-to-ground HemisphereLight.
 */
export function createAtmosphere(
  scene: THREE.Scene,
  options: CreateAtmosphereOptions = {},
): AtmosphereController {
  const cfg = resolveAtmosphereConfig(options.config);
  const isSoftwareGl = options.isSoftwareGl ?? false;

  const sunOffset = new THREE.Vector3(
    cfg.sunPosition[0],
    cfg.sunPosition[1],
    cfg.sunPosition[2],
  );
  const sunDir = computeSunDirection(cfg.sunPosition);

  // 1. Custom GLSL gradient sky dome
  const skyUniforms: SkyDomeUniforms = {
    uZenithColor: { value: new THREE.Color(cfg.zenithColor) },
    uMidSkyColor: { value: new THREE.Color(cfg.midSkyColor) },
    uHorizonColor: { value: new THREE.Color(cfg.horizonColor) },
    uGroundColor: { value: new THREE.Color(cfg.groundColor) },
    uSunDirection: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color(cfg.sunGlowColor) },
    uSunGlowIntensity: { value: cfg.sunGlowIntensity },
    uStarIntensity: { value: cfg.starIntensity },
    uMoonDirection: { value: new THREE.Vector3(-0.4, 0.65, -0.64).normalize() },
    uMoonIntensity: { value: 0.0 },
    uTime: { value: 0 },
  };

  const skyGeometry = new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 24);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_DOME_VERTEX_SHADER,
    fragmentShader: SKY_DOME_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
  skyMesh.name = 'animeSkyDome';
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;
  skyMesh.castShadow = false;
  skyMesh.receiveShadow = false;
  scene.add(skyMesh);

  // Clear solid scene background so the GLSL sky dome always renders unobstructed
  scene.background = null;

  // 2. Soft exponential distance fog matched to creamy-azure horizon
  const fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
  scene.fog = fog;

  // 3. Warm golden directional sun light with crisp 2048x2048 60fps shadows
  const sunLight = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
  sunLight.name = 'goldenSunLight';
  sunLight.position.copy(sunOffset);
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = options.castShadow ?? !isSoftwareGl;
  sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sunLight.shadow.camera.left = -DEFAULT_SHADOW_HALF_EXTENT;
  sunLight.shadow.camera.right = DEFAULT_SHADOW_HALF_EXTENT;
  sunLight.shadow.camera.top = DEFAULT_SHADOW_HALF_EXTENT;
  sunLight.shadow.camera.bottom = -DEFAULT_SHADOW_HALF_EXTENT;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 360;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.06;
  sunLight.shadow.radius = 2.2;
  sunLight.shadow.blurSamples = 4;
  sunLight.shadow.camera.updateProjectionMatrix();

  scene.add(sunLight);
  scene.add(sunLight.target);

  // 4. Sky-to-ground HemisphereLight for vibrant sunlit shadow bounce
  const hemiLight = new THREE.HemisphereLight(
    cfg.hemiSkyColor,
    cfg.hemiGroundColor,
    cfg.hemiIntensity,
  );
  hemiLight.name = 'valleyHemisphereLight';
  hemiLight.position.set(0, 120, 0);
  scene.add(hemiLight);

  let shadowCenterX = 0;
  let shadowCenterZ = 0;

  const applyMood = (partial: Partial<AtmosphereConfig>): void => {
    if (partial.zenithColor !== undefined) {
      skyUniforms.uZenithColor.value.set(partial.zenithColor);
    }
    if (partial.midSkyColor !== undefined) {
      skyUniforms.uMidSkyColor.value.set(partial.midSkyColor);
    }
    if (partial.horizonColor !== undefined) {
      skyUniforms.uHorizonColor.value.set(partial.horizonColor);
    }
    if (partial.groundColor !== undefined) {
      skyUniforms.uGroundColor.value.set(partial.groundColor);
    }
    if (partial.fogColor !== undefined) {
      fog.color.set(partial.fogColor);
    }
    if (partial.fogDensity !== undefined) {
      fog.density = partial.fogDensity;
    }
    if (partial.sunPosition !== undefined) {
      sunOffset.set(
        partial.sunPosition[0],
        partial.sunPosition[1],
        partial.sunPosition[2],
      );
      computeSunDirection(partial.sunPosition, skyUniforms.uSunDirection.value);
      sunLight.position.set(
        shadowCenterX + sunOffset.x,
        sunOffset.y,
        shadowCenterZ + sunOffset.z,
      );
    }
    if (partial.sunColor !== undefined) {
      sunLight.color.set(partial.sunColor);
    }
    if (partial.sunIntensity !== undefined) {
      sunLight.intensity = partial.sunIntensity;
    }
    if (partial.sunGlowColor !== undefined) {
      skyUniforms.uSunColor.value.set(partial.sunGlowColor);
    }
    if (partial.sunGlowIntensity !== undefined) {
      skyUniforms.uSunGlowIntensity.value = partial.sunGlowIntensity;
    }
    if (partial.hemiSkyColor !== undefined) {
      hemiLight.color.set(partial.hemiSkyColor);
    }
    if (partial.hemiGroundColor !== undefined) {
      hemiLight.groundColor.set(partial.hemiGroundColor);
    }
    if (partial.hemiIntensity !== undefined) {
      hemiLight.intensity = partial.hemiIntensity;
    }
    if (partial.starIntensity !== undefined) {
      skyUniforms.uStarIntensity.value = partial.starIntensity;
    }
  };

  const setShadowCenter = (
    x: number,
    z: number,
    halfSize = DEFAULT_SHADOW_HALF_EXTENT,
  ): void => {
    const cam = sunLight.shadow.camera;
    const worldUnitsPerTexel = (halfSize * 2) / SHADOW_MAP_SIZE;
    shadowCenterX = Math.round(x / worldUnitsPerTexel) * worldUnitsPerTexel;
    shadowCenterZ = Math.round(z / worldUnitsPerTexel) * worldUnitsPerTexel;

    if (cam.right !== halfSize) {
      cam.left = -halfSize;
      cam.right = halfSize;
      cam.top = halfSize;
      cam.bottom = -halfSize;
      cam.updateProjectionMatrix();
    }

    sunLight.target.position.set(shadowCenterX, 0, shadowCenterZ);
    sunLight.position.set(
      shadowCenterX + sunOffset.x,
      sunOffset.y,
      shadowCenterZ + sunOffset.z,
    );
    sunLight.target.updateMatrixWorld();
  };

  const update = (
    _dt: number,
    elapsed: number,
    cameraPosition?: THREE.Vector3,
  ): void => {
    skyUniforms.uTime.value = elapsed;
    if (cameraPosition) {
      skyMesh.position.set(cameraPosition.x, 0, cameraPosition.z);
    }
  };

  const dispose = (): void => {
    scene.remove(skyMesh);
    scene.remove(sunLight);
    scene.remove(sunLight.target);
    scene.remove(hemiLight);
    if (scene.fog === fog) {
      scene.fog = null;
    }
    skyGeometry.dispose();
    skyMaterial.dispose();
  };

  const setCelestialBody = (
    skySunPosition: readonly [number, number, number],
    moonDirection: readonly [number, number, number],
    moonIntensity: number,
  ): void => {
    computeSunDirection(skySunPosition, skyUniforms.uSunDirection.value);
    skyUniforms.uMoonDirection.value.set(moonDirection[0], moonDirection[1], moonDirection[2]).normalize();
    skyUniforms.uMoonIntensity.value = moonIntensity;
  };

  return {
    skyMesh,
    skyMaterial,
    skyUniforms,
    sunLight,
    hemiLight,
    fog,
    getSunDirection: (target = new THREE.Vector3()) =>
      target.copy(skyUniforms.uSunDirection.value),
    applyMood,
    setCelestialBody,
    setShadowCenter,
    update,
    dispose,
  };
}
