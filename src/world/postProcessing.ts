import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { RenderPipeline } from './WorldEngine';

export type AntiAliasingMode = 'smaa' | 'fxaa' | 'none';

export interface BloomSettings {
  /** Luminance threshold above which bright emissives/sky highlights bloom (default: 0.92). */
  threshold: number;
  /** Subtle bloom intensity (default: 0.28). */
  strength: number;
  /** Bloom blur spread radius in [0, 1] (default: 0.45). */
  radius: number;
}

export interface ColorGradeSettings {
  enabled: boolean;
  /** Overall chroma saturation multiplier (1.0 = neutral, ~1.16 = lush anime). */
  saturation: number;
  /** Smart vibrance boost protecting already-saturated hues (~0.18). */
  vibrance: number;
  /** Cool blue-teal shadow lift tint. */
  shadowTint: THREE.ColorRepresentation;
  /** Strength of shadow split-tone tinting [0, 0.4]. */
  shadowTintStrength: number;
  /** Warm golden highlight lift tint. */
  highlightTint: THREE.ColorRepresentation;
  /** Strength of highlight tinting [0, 0.35]. */
  highlightTintStrength: number;
}

export interface PostProcessingOptions {
  bloom?: Partial<BloomSettings>;
  colorGrade?: Partial<ColorGradeSettings>;
  aaMode?: AntiAliasingMode;
  isSoftwareGl?: boolean;
  /**
   * When true, `render()` falls back to `renderer.render(scene, camera)` to avoid
   * multi-pass CPU bottlenecks on software WebGL (SwiftShader), while keeping
   * the composer and bloom parameters configured identically for hardware GPUs.
   */
  bypassComposer?: boolean;
  /** MSAA sample count on the internal HDR render target (default: 4 on WebGL2 GPUs). */
  samples?: number;
}

export interface PostProcessingController extends RenderPipeline {
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly bloomPass: UnrealBloomPass;
  readonly colorGradePass: ShaderPass;
  readonly outputPass: OutputPass;
  readonly aaMode: AntiAliasingMode;
  readonly renderTarget: THREE.WebGLRenderTarget;
  isBypassingComposer: () => boolean;
  setBypassComposer: (bypass: boolean) => void;
  getBloomSettings: () => BloomSettings;
  setBloomSettings: (updates: Partial<BloomSettings>) => void;
  setColorGrade: (updates: Partial<ColorGradeSettings>) => void;
  render: () => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export const DEFAULT_BLOOM_SETTINGS: Readonly<BloomSettings> = {
  threshold: 0.92,
  strength: 0.28,
  radius: 0.45,
};

export const GLADE_BLOOM_SETTINGS: Readonly<BloomSettings> = {
  threshold: 1.04,
  strength: 0.16,
  radius: 0.44,
};

export const DEFAULT_COLOR_GRADE_SETTINGS: Readonly<ColorGradeSettings> = {
  enabled: false,
  saturation: 1.0,
  vibrance: 0.0,
  shadowTint: '#3e84a8',
  shadowTintStrength: 0.0,
  highlightTint: '#fff5d6',
  highlightTintStrength: 0.0,
};

export const GLADE_COLOR_GRADE_SETTINGS: Readonly<ColorGradeSettings> = {
  enabled: true,
  saturation: 1.14,
  vibrance: 0.18,
  shadowTint: '#4f97bd',
  shadowTintStrength: 0.12,
  highlightTint: '#fff7d9',
  highlightTintStrength: 0.1,
};

const ANIME_COLOR_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1.0 },
    uVibrance: { value: 0.0 },
    uShadowTint: { value: new THREE.Color('#3b82a8') },
    uShadowTintStrength: { value: 0.0 },
    uHighlightTint: { value: new THREE.Color('#fff4d6') },
    uHighlightTintStrength: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uVibrance;
    uniform vec3 uShadowTint;
    uniform float uShadowTintStrength;
    uniform vec3 uHighlightTint;
    uniform float uHighlightTintStrength;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D( tDiffuse, vUv );
      vec3 col = tex.rgb;

      float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      float maxC = max( col.r, max( col.g, col.b ) );
      float minC = min( col.r, min( col.g, col.b ) );
      float sat = maxC - minC;

      // Smart vibrance + saturation boost for vibrant anime color richness
      float vibBoost = 1.0 + uVibrance * ( 1.0 - clamp( sat * 1.4, 0.0, 1.0 ) );
      col = mix( vec3( luma ), col, uSaturation * vibBoost );

      // Split-tone cool blue-teal shadows & warm sunlit highlights
      float shadowWeight = smoothstep( 0.52, 0.04, luma );
      float highlightWeight = smoothstep( 0.48, 0.96, luma );
      col = mix( col, col * mix( vec3( 1.0 ), uShadowTint * 1.38, 0.75 ) + uShadowTint * 0.04, shadowWeight * uShadowTintStrength );
      col = mix( col, col * uHighlightTint, highlightWeight * uHighlightTintStrength );

      gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), tex.a );
    }
  `,
};

export function clampBloomSettings(
  input: Partial<BloomSettings> = {},
  base: BloomSettings = DEFAULT_BLOOM_SETTINGS,
): BloomSettings {
  const threshold = THREE.MathUtils.clamp(
    input.threshold ?? base.threshold,
    0.0,
    4.0,
  );
  const strength = THREE.MathUtils.clamp(
    input.strength ?? base.strength,
    0.0,
    2.5,
  );
  const radius = THREE.MathUtils.clamp(input.radius ?? base.radius, 0.0, 1.0);

  return { threshold, strength, radius };
}

export function resolveAntiAliasingMode(
  requested?: AntiAliasingMode,
): AntiAliasingMode {
  if (requested === 'none' || requested === 'fxaa') {
    return requested;
  }
  // SMAAPass constructs HTMLImageElement lookup textures internally; fall back to FXAA if unavailable.
  if (typeof Image === 'undefined') {
    return 'fxaa';
  }
  return 'smaa';
}

export function computeFxaaInverseResolution(
  width: number,
  height: number,
  pixelRatio: number,
): { x: number; y: number } {
  const safeRatio = Math.max(0.5, pixelRatio || 1);
  const safeW = Math.max(1, width * safeRatio);
  const safeH = Math.max(1, height * safeRatio);
  return { x: 1 / safeW, y: 1 / safeH };
}

/**
 * Builds the stylized post-processing pipeline:
 * - Linear HDR HalfFloat WebGLRenderTarget (4x MSAA on WebGL2 hardware GPUs)
 * - RenderPass
 * - Selective UnrealBloomPass (glowing sky light & sunlit foliage edges)
 * - Crisp SMAA / FXAA + OutputPass (ACESFilmicToneMapping + SRGBColorSpace)
 * - Optional Genshin/Anime vibrancy & cool-shadow split-tone ColorGradePass
 */
export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: PostProcessingOptions = {},
): PostProcessingController {
  const isSoftwareGl = options.isSoftwareGl ?? false;
  let bypassComposer = options.bypassComposer ?? isSoftwareGl;

  const size = new THREE.Vector2();
  renderer.getSize(size);
  const initialWidth = Math.max(1, Math.round(size.x) || window.innerWidth || 1);
  const initialHeight = Math.max(1, Math.round(size.y) || window.innerHeight || 1);
  const pixelRatio = renderer.getPixelRatio() || 1;

  const isWebGL2 = Boolean(renderer.capabilities?.isWebGL2);
  const aaMode = resolveAntiAliasingMode(options.aaMode);
  const targetSamples =
    options.samples !== undefined
      ? options.samples
      : !isSoftwareGl && isWebGL2 && aaMode === 'none'
        ? 2
        : 0;

  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.round(initialWidth * pixelRatio)),
    Math.max(1, Math.round(initialHeight * pixelRatio)),
    {
      type: THREE.HalfFloatType,
      samples: targetSamples,
    },
  );
  renderTarget.texture.name = 'WorldPostProcessing.hdrTarget';

  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(initialWidth, initialHeight);

  // 1. Base scene render pass (linear HDR)
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. Selective anime bloom pass (linear HDR, half-res mip blur for 60 FPS)
  const bloomState = clampBloomSettings(options.bloom);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(
      Math.max(1, Math.round(initialWidth * 0.5)),
      Math.max(1, Math.round(initialHeight * 0.5)),
    ),
    bloomState.strength,
    bloomState.radius,
    bloomState.threshold,
  );
  bloomPass.enabled = bloomState.strength > 0.005;
  composer.addPass(bloomPass);

  // 3. Anti-aliasing + OutputPass (exact Three.js color-space order)
  const outputPass = new OutputPass();
  let smaaPass: SMAAPass | null = null;
  let fxaaPass: ShaderPass | null = null;

  if (aaMode === 'smaa') {
    smaaPass = new SMAAPass();
    composer.addPass(smaaPass);
    composer.addPass(outputPass);
  } else if (aaMode === 'fxaa') {
    composer.addPass(outputPass);
    fxaaPass = new ShaderPass(FXAAShader);
    const inv = computeFxaaInverseResolution(
      initialWidth,
      initialHeight,
      pixelRatio,
    );
    fxaaPass.material.uniforms.resolution.value.set(inv.x, inv.y);
    composer.addPass(fxaaPass);
  } else {
    composer.addPass(outputPass);
  }

  // 4. Optional sRGB anime vibrancy & cool-shadow split-tone pass (disabled by default for Level 1)
  const colorGradePass = new ShaderPass(ANIME_COLOR_GRADE_SHADER);
  const applyColorGrade = (updates: Partial<ColorGradeSettings>) => {
    const merged: ColorGradeSettings = {
      ...DEFAULT_COLOR_GRADE_SETTINGS,
      ...updates,
    };
    colorGradePass.enabled = merged.enabled;
    colorGradePass.uniforms.uSaturation.value = THREE.MathUtils.clamp(merged.saturation, 0.5, 1.8);
    colorGradePass.uniforms.uVibrance.value = THREE.MathUtils.clamp(merged.vibrance, -0.5, 0.8);
    colorGradePass.uniforms.uShadowTint.value.set(merged.shadowTint);
    colorGradePass.uniforms.uShadowTintStrength.value = THREE.MathUtils.clamp(
      merged.shadowTintStrength,
      0,
      0.45,
    );
    colorGradePass.uniforms.uHighlightTint.value.set(merged.highlightTint);
    colorGradePass.uniforms.uHighlightTintStrength.value = THREE.MathUtils.clamp(
      merged.highlightTintStrength,
      0,
      0.35,
    );
  };
  applyColorGrade(options.colorGrade ?? DEFAULT_COLOR_GRADE_SETTINGS);
  composer.addPass(colorGradePass);

  const resize = (width: number, height: number): void => {
    const safeW = Math.max(1, Math.round(width));
    const safeH = Math.max(1, Math.round(height));
    const ratio = renderer.getPixelRatio() || 1;

    composer.setPixelRatio(ratio);
    composer.setSize(safeW, safeH);
    bloomPass.resolution.set(safeW, safeH);

    if (fxaaPass) {
      const inv = computeFxaaInverseResolution(safeW, safeH, ratio);
      fxaaPass.material.uniforms.resolution.value.set(inv.x, inv.y);
    }
  };

  const setBloomSettings = (updates: Partial<BloomSettings>): void => {
    const next = clampBloomSettings(updates, {
      threshold: bloomPass.threshold,
      strength: bloomPass.strength,
      radius: bloomPass.radius,
    });
    bloomPass.threshold = next.threshold;
    bloomPass.strength = next.strength;
    bloomPass.radius = next.radius;
    bloomPass.enabled = next.strength > 0.005;
  };

  const getBloomSettings = (): BloomSettings => ({
    threshold: bloomPass.threshold,
    strength: bloomPass.strength,
    radius: bloomPass.radius,
  });

  const render = (): void => {
    if (bypassComposer) {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
  };

  const dispose = (): void => {
    bloomPass.dispose();
    smaaPass?.dispose();
    fxaaPass?.dispose();
    outputPass.dispose();
    colorGradePass.dispose();
    renderTarget.dispose();
    composer.dispose();
  };

  return {
    composer,
    renderPass,
    bloomPass,
    colorGradePass,
    outputPass,
    aaMode,
    renderTarget,
    isBypassingComposer: () => bypassComposer,
    setBypassComposer: (bypass: boolean) => {
      bypassComposer = bypass;
    },
    getBloomSettings,
    setBloomSettings,
    setColorGrade: applyColorGrade,
    render,
    resize,
    dispose,
  };
}
