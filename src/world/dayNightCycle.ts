import * as THREE from 'three';
import type { AtmosphereConfig } from './atmosphere';
import type { GladeWeatherId, GladeWeatherPreset } from './gladeWeather';

// ---------------------------------------------------------------------------
// Real-Time 24-Hour Day / Night Cycle for Autumn Glade
// ---------------------------------------------------------------------------

/** Default startup time (11:15 AM) preserves the bright, calm Clear Day look on load. */
export const DEFAULT_DAY_TIME_HOURS = 11.25;

/** Default cycle speed in in-game hours per real second (~140s per full 24h cycle). */
export const DEFAULT_CYCLE_HOURS_PER_SEC = 0.17;

export type DayNightPresetId = 'dawn' | 'day' | 'sunset' | 'night';

export const DAY_NIGHT_PRESET_HOURS: Readonly<Record<DayNightPresetId, number>> = {
  dawn: 6.25,
  day: 11.25,
  sunset: 18.2,
  night: 22.8,
};

interface TimeKeyframe {
  readonly hour: number;
  readonly zenithColor: string;
  readonly midSkyColor: string;
  readonly horizonColor: string;
  readonly groundColor: string;
  readonly fogColor: string;
  readonly fogDensityScale: number;
  readonly sunColor: string;
  readonly sunIntensity: number;
  readonly sunGlowColor: string;
  readonly sunGlowIntensity: number;
  readonly hemiSkyColor: string;
  readonly hemiGroundColor: string;
  readonly hemiIntensity: number;
  readonly starIntensity: number;
  readonly moonIntensity: number;
  readonly exposure: number;
  readonly cloudLitColor: string;
  readonly cloudShadeColor: string;
  readonly sunbeamScale: number;
  readonly lanternGlow: number;
  readonly waterShallow: string;
  readonly waterBase: string;
  readonly waterDeep: string;
  readonly waterSparkle: string;
}

const TIME_KEYFRAMES: readonly TimeKeyframe[] = [
  {
    // 00:00 — Deep Starlit Midnight
    hour: 0.0,
    zenithColor: '#09152e',
    midSkyColor: '#13274d',
    horizonColor: '#23406e',
    groundColor: '#14243d',
    fogColor: '#1d365c',
    fogDensityScale: 1.12,
    sunColor: '#9cc4ff',
    sunIntensity: 0.72,
    sunGlowColor: '#b5d6ff',
    sunGlowIntensity: 0.12,
    hemiSkyColor: '#486fa8',
    hemiGroundColor: '#1e3242',
    hemiIntensity: 0.66,
    starIntensity: 1.0,
    moonIntensity: 1.0,
    exposure: 0.88,
    cloudLitColor: '#56749e',
    cloudShadeColor: '#213352',
    sunbeamScale: 0.0,
    lanternGlow: 2.65,
    waterShallow: '#2f6d99',
    waterBase: '#1b4775',
    waterDeep: '#0d2547',
    waterSparkle: '#d4e8ff',
  },
  {
    // 04:45 — Pre-Dawn Indigo Glow
    hour: 4.75,
    zenithColor: '#14274f',
    midSkyColor: '#2e4a78',
    horizonColor: '#696e94',
    groundColor: '#36435e',
    fogColor: '#4c5c7d',
    fogDensityScale: 1.18,
    sunColor: '#c4b8e6',
    sunIntensity: 0.78,
    sunGlowColor: '#e8b5b8',
    sunGlowIntensity: 0.25,
    hemiSkyColor: '#6b86b8',
    hemiGroundColor: '#2f454f',
    hemiIntensity: 0.7,
    starIntensity: 0.55,
    moonIntensity: 0.55,
    exposure: 0.9,
    cloudLitColor: '#9aa4c9',
    cloudShadeColor: '#3a4b70',
    sunbeamScale: 0.12,
    lanternGlow: 2.15,
    waterShallow: '#4888ab',
    waterBase: '#285d87',
    waterDeep: '#153459',
    waterSparkle: '#e8d9f0',
  },
  {
    // 06:20 — Pastel Rose & Peach Dawn
    hour: 6.33,
    zenithColor: '#3a74ba',
    midSkyColor: '#8eb2de',
    horizonColor: '#fbd0b8',
    groundColor: '#d9c0b2',
    fogColor: '#edd0c4',
    fogDensityScale: 1.1,
    sunColor: '#ffcca1',
    sunIntensity: 1.48,
    sunGlowColor: '#ffd6b0',
    sunGlowIntensity: 0.62,
    hemiSkyColor: '#c7d4f2',
    hemiGroundColor: '#6b8c5e',
    hemiIntensity: 0.82,
    starIntensity: 0.05,
    moonIntensity: 0.08,
    exposure: 0.97,
    cloudLitColor: '#ffe3cf',
    cloudShadeColor: '#99a3c7',
    sunbeamScale: 1.15,
    lanternGlow: 1.4,
    waterShallow: '#86d6d6',
    waterBase: '#4598c4',
    waterDeep: '#22598a',
    waterSparkle: '#ffe0c2',
  },
  {
    // 09:00 — Fresh Morning Sun
    hour: 9.0,
    zenithColor: '#298be0',
    midSkyColor: '#68c5f2',
    horizonColor: '#ddf3fc',
    groundColor: '#bae3f0',
    fogColor: '#ccebf7',
    fogDensityScale: 1.0,
    sunColor: '#fff0cf',
    sunIntensity: 1.86,
    sunGlowColor: '#fff4d6',
    sunGlowIntensity: 0.56,
    hemiSkyColor: '#a8e0fa',
    hemiGroundColor: '#7ec850',
    hemiIntensity: 0.87,
    starIntensity: 0.0,
    moonIntensity: 0.0,
    exposure: 1.0,
    cloudLitColor: '#fbfdff',
    cloudShadeColor: '#bddcf5',
    sunbeamScale: 1.0,
    lanternGlow: 0.98,
    waterShallow: '#78ebe6',
    waterBase: '#3ab3de',
    waterDeep: '#1d76a8',
    waterSparkle: '#fff7de',
  },
  {
    // 12:00 — Bright Clear Midday (exact match to Clear Day palette)
    hour: 12.0,
    zenithColor: '#2587e0',
    midSkyColor: '#62c2f2',
    horizonColor: '#d9f2fc',
    groundColor: '#b5e2f0',
    fogColor: '#c8eaf7',
    fogDensityScale: 1.0,
    sunColor: '#fff0cc',
    sunIntensity: 1.92,
    sunGlowColor: '#fff4d4',
    sunGlowIntensity: 0.56,
    hemiSkyColor: '#a6dffa',
    hemiGroundColor: '#7ec850',
    hemiIntensity: 0.88,
    starIntensity: 0.0,
    moonIntensity: 0.0,
    exposure: 1.0,
    cloudLitColor: '#fbfdff',
    cloudShadeColor: '#bddcf5',
    sunbeamScale: 1.0,
    lanternGlow: 0.95,
    waterShallow: '#78ebe6',
    waterBase: '#3ab3de',
    waterDeep: '#1d76a8',
    waterSparkle: '#fff7de',
  },
  {
    // 16:00 — Warm Late Afternoon
    hour: 16.0,
    zenithColor: '#2b7fd4',
    midSkyColor: '#6ebae8',
    horizonColor: '#f2e8d5',
    groundColor: '#d6d4be',
    fogColor: '#e3e4d8',
    fogDensityScale: 1.02,
    sunColor: '#ffe0a8',
    sunIntensity: 1.86,
    sunGlowColor: '#ffe6b5',
    sunGlowIntensity: 0.62,
    hemiSkyColor: '#b5daf5',
    hemiGroundColor: '#7db553',
    hemiIntensity: 0.86,
    starIntensity: 0.0,
    moonIntensity: 0.0,
    exposure: 1.0,
    cloudLitColor: '#fff8eb',
    cloudShadeColor: '#b8cbe3',
    sunbeamScale: 1.15,
    lanternGlow: 1.1,
    waterShallow: '#85e3dc',
    waterBase: '#3fa9d4',
    waterDeep: '#1f6c9c',
    waterSparkle: '#ffe9b8',
  },
  {
    // 18:15 — Golden Amber Sunset
    hour: 18.25,
    zenithColor: '#364d94',
    midSkyColor: '#c96f7a',
    horizonColor: '#f5b57d',
    groundColor: '#cc906e',
    fogColor: '#ebb18a',
    fogDensityScale: 1.15,
    sunColor: '#ffa861',
    sunIntensity: 1.76,
    sunGlowColor: '#ffc478',
    sunGlowIntensity: 0.72,
    hemiSkyColor: '#f2a18f',
    hemiGroundColor: '#694e52',
    hemiIntensity: 0.8,
    starIntensity: 0.28,
    moonIntensity: 0.2,
    exposure: 0.98,
    cloudLitColor: '#ffcf9e',
    cloudShadeColor: '#8a628c',
    sunbeamScale: 1.35,
    lanternGlow: 2.05,
    waterShallow: '#d99e82',
    waterBase: '#4d7aa6',
    waterDeep: '#273c69',
    waterSparkle: '#ffc978',
  },
  {
    // 19:45 — Violet Twilight Dusk
    hour: 19.75,
    zenithColor: '#172859',
    midSkyColor: '#434a85',
    horizonColor: '#8f6987',
    groundColor: '#453e59',
    fogColor: '#565278',
    fogDensityScale: 1.18,
    sunColor: '#a8b7e8',
    sunIntensity: 0.86,
    sunGlowColor: '#d49aa8',
    sunGlowIntensity: 0.3,
    hemiSkyColor: '#6f78ad',
    hemiGroundColor: '#2d3447',
    hemiIntensity: 0.72,
    starIntensity: 0.75,
    moonIntensity: 0.72,
    exposure: 0.91,
    cloudLitColor: '#8f89b0',
    cloudShadeColor: '#363b63',
    sunbeamScale: 0.15,
    lanternGlow: 2.45,
    waterShallow: '#48769c',
    waterBase: '#274d7a',
    waterDeep: '#152b52',
    waterSparkle: '#d9d4f2',
  },
  {
    // 21:30 — Clear Moonlit Night
    hour: 21.5,
    zenithColor: '#0b1833',
    midSkyColor: '#162c54',
    horizonColor: '#264575',
    groundColor: '#162742',
    fogColor: '#203a61',
    fogDensityScale: 1.12,
    sunColor: '#9ec6ff',
    sunIntensity: 0.74,
    sunGlowColor: '#b5d6ff',
    sunGlowIntensity: 0.14,
    hemiSkyColor: '#4b73ad',
    hemiGroundColor: '#1f3445',
    hemiIntensity: 0.68,
    starIntensity: 0.98,
    moonIntensity: 0.98,
    exposure: 0.89,
    cloudLitColor: '#5a7aa6',
    cloudShadeColor: '#233657',
    sunbeamScale: 0.0,
    lanternGlow: 2.65,
    waterShallow: '#31709c',
    waterBase: '#1d4a78',
    waterDeep: '#0e284a',
    waterSparkle: '#d4e8ff',
  },
];

export interface DayNightSample {
  readonly hours: number;
  readonly isNight: boolean;
  readonly phaseLabel: 'Night' | 'Dawn' | 'Morning' | 'Day' | 'Afternoon' | 'Sunset' | 'Twilight';
  readonly sunPosition: [number, number, number];
  readonly moonDirection: [number, number, number];
  readonly lightPosition: [number, number, number];
  readonly atmosphere: Required<AtmosphereConfig>;
  readonly moonIntensity: number;
  readonly exposure: number;
  readonly cloudLitColor: THREE.Color;
  readonly cloudShadeColor: THREE.Color;
  readonly sunbeamScale: number;
  readonly lanternGlow: number;
  readonly waterShallow: THREE.Color;
  readonly waterBase: THREE.Color;
  readonly waterDeep: THREE.Color;
  readonly waterSparkle: THREE.Color;
}

export function normalizeDayHours(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_DAY_TIME_HOURS;
  const wrapped = hours % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

export function formatDayClock(hours: number): string {
  const hNorm = normalizeDayHours(hours);
  const totalMinutes = Math.floor(hNorm * 60) % (24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function getDayPhaseLabel(
  hours: number,
): DayNightSample['phaseLabel'] {
  const h = normalizeDayHours(hours);
  if (h < 5.0 || h >= 20.5) return 'Night';
  if (h < 7.25) return 'Dawn';
  if (h < 10.5) return 'Morning';
  if (h < 15.0) return 'Day';
  if (h < 17.3) return 'Afternoon';
  if (h < 19.1) return 'Sunset';
  return 'Twilight';
}

/**
 * Computes stylized sun & opposite moon sky vectors for a given hour [0, 24).
 * At ~11:15 AM, sun sits near the signature Clear Day northeast-high angle [86, 76, -130].
 */
export function computeCelestialVectors(hours: number): {
  sunPos: [number, number, number];
  moonDir: [number, number, number];
  lightPos: [number, number, number];
  sunElevation: number;
} {
  const h = normalizeDayHours(hours);
  // 6:00 sunrise (angle 0), 12:00 zenith (PI/2), 18:00 sunset (PI), 24:00 nadir (3PI/2)
  const theta = ((h - 6.0) / 24.0) * Math.PI * 2;
  const orbitR = 175;
  const sunX = Math.cos(theta) * orbitR * 0.92 + 34;
  const sunY = Math.sin(theta) * orbitR * 0.68;
  const sunZ = -126 + Math.cos(theta) * 28;

  const sunLen = Math.hypot(sunX, sunY, sunZ) || 1;
  const sunElevation = sunY / sunLen;

  // Moon rises smoothly opposite the sun across a scenic 18-28 deg northern arc above the peaks
  const moonX = -sunX * 0.58 - 18;
  const moonY = -sunY * 0.4 + 8;
  const moonZ = -142 - Math.cos(theta) * 18;
  const moonLen = Math.hypot(moonX, moonY, moonZ) || 1;
  const moonDir: [number, number, number] = [moonX / moonLen, moonY / moonLen, moonZ / moonLen];

  // Directional shadow caster follows the Sun in daytime and seamlessly switches to the Moon at night
  const useMoon = sunY < 10;
  const lightPos: [number, number, number] = useMoon
    ? [moonDir[0] * 165, Math.max(42, moonDir[1] * 165), moonDir[2] * 165]
    : [sunX, Math.max(24, sunY), sunZ];

  return {
    sunPos: [sunX, sunY, sunZ],
    moonDir,
    lightPos,
    sunElevation,
  };
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(hexA: string, hexB: string, t: number, out = new THREE.Color()): THREE.Color {
  const a = new THREE.Color(hexA);
  const b = new THREE.Color(hexB);
  return out.copy(a).lerp(b, t);
}

/**
 * Evaluates the full Day/Night cycle mood at `hours` [0, 24) and blends it harmoniously
 * with the active weather preset (so Clear Day, Sakura Breeze, Rain, and Mist all work 24/7).
 */
export function evaluateDayNightSample(
  hours: number,
  weatherPreset: GladeWeatherPreset,
  weatherId: GladeWeatherId,
): DayNightSample {
  const h = normalizeDayHours(hours);

  // Locate surrounding keyframes (wrapping 21.5 -> 24.0/0.0)
  let k0 = TIME_KEYFRAMES[TIME_KEYFRAMES.length - 1];
  let k1 = TIME_KEYFRAMES[0];
  let span = 24 - k0.hour + k1.hour;
  let elapsed = h >= k0.hour ? h - k0.hour : 24 - k0.hour + h;

  for (let i = 0; i < TIME_KEYFRAMES.length - 1; i += 1) {
    const a = TIME_KEYFRAMES[i];
    const b = TIME_KEYFRAMES[i + 1];
    if (h >= a.hour && h <= b.hour) {
      k0 = a;
      k1 = b;
      span = Math.max(0.0001, b.hour - a.hour);
      elapsed = h - a.hour;
      break;
    }
  }

  const rawT = Math.max(0, Math.min(1, elapsed / span));
  const t = rawT * rawT * (3 - 2 * rawT);

  const celestial = computeCelestialVectors(h);
  const zenith = lerpHex(k0.zenithColor, k1.zenithColor, t);
  const midSky = lerpHex(k0.midSkyColor, k1.midSkyColor, t);
  const horizon = lerpHex(k0.horizonColor, k1.horizonColor, t);
  const ground = lerpHex(k0.groundColor, k1.groundColor, t);
  const fog = lerpHex(k0.fogColor, k1.fogColor, t);
  const sunCol = lerpHex(k0.sunColor, k1.sunColor, t);
  const sunGlow = lerpHex(k0.sunGlowColor, k1.sunGlowColor, t);
  const hemiSky = lerpHex(k0.hemiSkyColor, k1.hemiSkyColor, t);
  const hemiGround = lerpHex(k0.hemiGroundColor, k1.hemiGroundColor, t);

  const cloudLit = lerpHex(k0.cloudLitColor, k1.cloudLitColor, t);
  const cloudShade = lerpHex(k0.cloudShadeColor, k1.cloudShadeColor, t);
  const waterShallow = lerpHex(k0.waterShallow, k1.waterShallow, t);
  const waterBase = lerpHex(k0.waterBase, k1.waterBase, t);
  const waterDeep = lerpHex(k0.waterDeep, k1.waterDeep, t);
  const waterSparkle = lerpHex(k0.waterSparkle, k1.waterSparkle, t);

  let sunIntensity = lerpNum(k0.sunIntensity, k1.sunIntensity, t);
  let sunGlowIntensity = lerpNum(k0.sunGlowIntensity, k1.sunGlowIntensity, t);
  let hemiIntensity = lerpNum(k0.hemiIntensity, k1.hemiIntensity, t);
  let starIntensity = lerpNum(k0.starIntensity, k1.starIntensity, t);
  let moonIntensity = lerpNum(k0.moonIntensity, k1.moonIntensity, t);
  let exposure = lerpNum(k0.exposure, k1.exposure, t);
  const fogDensityScale = lerpNum(k0.fogDensityScale, k1.fogDensityScale, t);
  const sunbeamScale = lerpNum(k0.sunbeamScale, k1.sunbeamScale, t);
  let lanternGlow = lerpNum(k0.lanternGlow, k1.lanternGlow, t);

  // Harmoniously tint with active weather overlay without breaking day/night darkness
  const wa = weatherPreset.atmosphere;
  if (weatherId === 'rain') {
    const rainTint = new THREE.Color(wa.fogColor);
    const nightDarken = 1 - starIntensity * 0.65;
    zenith.lerp(new THREE.Color(wa.zenithColor).multiplyScalar(nightDarken), 0.58);
    midSky.lerp(new THREE.Color(wa.midSkyColor).multiplyScalar(nightDarken), 0.58);
    horizon.lerp(rainTint.clone().multiplyScalar(nightDarken), 0.62);
    fog.lerp(rainTint.clone().multiplyScalar(nightDarken), 0.65);
    sunIntensity *= 0.62;
    sunGlowIntensity *= 0.35;
    starIntensity *= 0.2;
    moonIntensity *= 0.25;
    cloudLit.lerp(new THREE.Color(weatherPreset.cloudLitColor).multiplyScalar(nightDarken), 0.65);
    cloudShade.lerp(new THREE.Color(weatherPreset.cloudShadeColor).multiplyScalar(nightDarken), 0.65);
    lanternGlow = Math.max(lanternGlow, 1.9);
  } else if (weatherId === 'mist') {
    const mistFactor = 1 - starIntensity * 0.55;
    horizon.lerp(new THREE.Color(wa.horizonColor).multiplyScalar(mistFactor), 0.45);
    fog.lerp(new THREE.Color(wa.fogColor).multiplyScalar(mistFactor), 0.52);
    sunIntensity *= 0.85;
    starIntensity *= 0.45;
    lanternGlow = Math.max(lanternGlow, 1.5);
  } else if (weatherId === 'sakura-breeze') {
    const blushFactor = 1 - starIntensity * 0.7;
    horizon.lerp(new THREE.Color(wa.horizonColor), 0.28 * blushFactor);
    cloudLit.lerp(new THREE.Color(weatherPreset.cloudLitColor), 0.3 * blushFactor);
  }

  const fogDensity = wa.fogDensity * fogDensityScale;
  const isNight = h < 5.4 || h >= 20.0;

  return {
    hours: h,
    isNight,
    phaseLabel: getDayPhaseLabel(h),
    sunPosition: celestial.sunPos,
    moonDirection: celestial.moonDir,
    lightPosition: celestial.lightPos,
    atmosphere: {
      zenithColor: zenith,
      midSkyColor: midSky,
      horizonColor: horizon,
      groundColor: ground,
      fogColor: fog,
      fogDensity,
      sunPosition: celestial.lightPos,
      sunColor: sunCol,
      sunIntensity,
      sunGlowColor: sunGlow,
      sunGlowIntensity,
      hemiSkyColor: hemiSky,
      hemiGroundColor: hemiGround,
      hemiIntensity,
      starIntensity,
    },
    moonIntensity,
    exposure,
    cloudLitColor: cloudLit,
    cloudShadeColor: cloudShade,
    sunbeamScale,
    lanternGlow,
    waterShallow,
    waterBase,
    waterDeep,
    waterSparkle,
  };
}
