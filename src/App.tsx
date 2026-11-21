/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GladeHud, type WorldLevelId } from './components/GladeHud';
import { WorldEngine } from './world/WorldEngine';
import { DEFAULT_ATMOSPHERE_CONFIG, createAtmosphere } from './world/atmosphere';
import {
  DAY_NIGHT_PRESET_HOURS,
  DEFAULT_DAY_TIME_HOURS,
  formatDayClock,
  normalizeDayHours,
  type DayNightPresetId,
} from './world/dayNightCycle';
import {
  createEnvironmentFoliage,
  disposeFoliageAssetCache,
  type FoliageLoadStats,
} from './world/foliageAssets';
import { disposeGladeAssetCache } from './world/gladeAssets';
import {
  GLADE_HALF_SIZE,
  getDominantGladeBiome,
  getGladeGroundHeight,
  type GladeBiomeId,
} from './world/gladeBiomes';
import {
  GLADE_ATMOSPHERE_CONFIG,
  createGladeLevel,
  getGladeCameraFraming,
  type GladeLevelController,
  type GladeViewPresetId,
} from './world/gladeLevel';
import {
  GLADE_WEATHER_PRESETS,
  type GladeWeatherId,
} from './world/gladeWeather';
import {
  DEFAULT_BLOOM_SETTINGS,
  DEFAULT_COLOR_GRADE_SETTINGS,
  GLADE_BLOOM_SETTINGS,
  GLADE_COLOR_GRADE_SETTINGS,
  createPostProcessing,
} from './world/postProcessing';
import { createRocks } from './world/rocks';
import { createStructures } from './world/structures';
import {
  createTerrain,
  getBridgeAnchor,
  getFordCrossing,
  getOverlookCenter,
  getPondCenter,
  getRuinsCenter,
  getSpawnPosition,
  getTerrainHeight,
} from './world/terrain';
import { disposeGhibliGradientMap } from './world/stylizedAAShader';
import { disposeToonGradientMaps } from './world/toonMaterials';
import { createWater } from './world/water';

export type { WorldLevelId };

function getInitialLevelFromUrl(): WorldLevelId {
  if (typeof window === 'undefined') return 'glade';
  const param = new URLSearchParams(window.location.search).get('level');
  return param === 'valley' ? 'valley' : 'glade';
}

function getInitialWeatherFromUrl(): GladeWeatherId {
  if (typeof window === 'undefined') return 'sunny';
  const param = new URLSearchParams(window.location.search).get('weather');
  if (param && param in GLADE_WEATHER_PRESETS) {
    return param as GladeWeatherId;
  }
  return 'sunny';
}

function getInitialTimeFromUrl(): number {
  if (typeof window === 'undefined') return DEFAULT_DAY_TIME_HOURS;
  const params = new URLSearchParams(window.location.search);
  const param = params.get('time');
  if (param) {
    if (param in DAY_NIGHT_PRESET_HOURS) {
      return DAY_NIGHT_PRESET_HOURS[param as DayNightPresetId];
    }
    const parsed = Number(param);
    if (Number.isFinite(parsed)) {
      return normalizeDayHours(parsed);
    }
  }
  if (params.get('weather') === 'golden-sunset') {
    return DAY_NIGHT_PRESET_HOURS.sunset;
  }
  return DEFAULT_DAY_TIME_HOURS;
}

function getInitialCyclePausedFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const param = new URLSearchParams(window.location.search).get('cycle');
  return param === '0' || param === 'false' || param === 'paused';
}

function getInitialViewFromUrl(): GladeViewPresetId {
  if (typeof window === 'undefined') return 'crimson-trail';
  const param = new URLSearchParams(window.location.search).get('view');
  const validViews: ReadonlySet<string> = new Set([
    'crimson-trail',
    'sakura-sanctuary',
    'golden-meadow',
    'pine-highlands',
    'emerald-lake',
    'sky-observatory',
    'bell-tower',
    'cloudcrest-beacon',
    'overview',
    'closeup',
  ]);
  return param && validViews.has(param) ? (param as GladeViewPresetId) : 'crimson-trail';
}

function getValleyCameraFraming(viewPreset: string | null): {
  position: THREE.Vector3;
  target: THREE.Vector3;
} {
  const bridge = getBridgeAnchor();
  const ford = getFordCrossing();
  const pond = getPondCenter();
  const ruins = getRuinsCenter();
  const overlook = getOverlookCenter();
  const spawn = getSpawnPosition();

  switch (viewPreset) {
    case 'bridge':
      return {
        position: new THREE.Vector3(bridge.westEnd.x - 10.5, bridge.bankHeight + 6.2, bridge.westEnd.z + 9.5),
        target: new THREE.Vector3(bridge.position.x + 1.2, bridge.bankHeight + 1.4, bridge.position.z - 0.8),
      };
    case 'ford':
      return {
        position: new THREE.Vector3(ford.westBank.x - 7.5, ford.westBank.y + 5.8, ford.westBank.z + 10.5),
        target: new THREE.Vector3(ford.center.x, 0.0, ford.center.z - 1.5),
      };
    case 'pond':
      return {
        position: new THREE.Vector3(pond.x - 24, 14.5, pond.z + 24),
        target: new THREE.Vector3(pond.x + 4, 0.2, pond.z - 3),
      };
    case 'cliffs':
      return {
        position: new THREE.Vector3(14, 15.5, 4),
        target: new THREE.Vector3(ruins.x, ruins.y - 1.5, ruins.z),
      };
    case 'overview':
      return {
        position: new THREE.Vector3(-42, 46, 58),
        target: new THREE.Vector3(6, 2.5, -14),
      };
    case 'overlook':
      return {
        position: new THREE.Vector3(overlook.x + 4, overlook.y + 5.5, overlook.z + 6),
        target: new THREE.Vector3(bridge.position.x + 10, 2.2, bridge.position.z - 14),
      };
    default: {
      const camX = spawn.x - 6.5;
      const camZ = spawn.z + 10.5;
      const camY = getTerrainHeight(camX, camZ) + 9.2;
      return {
        position: new THREE.Vector3(camX, camY, camZ),
        target: new THREE.Vector3(bridge.position.x + 5.5, 2.4, bridge.position.z - 11.5),
      };
    }
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const switchLevelRef = useRef<((nextLevel: WorldLevelId) => void) | null>(null);
  const flyToViewRef = useRef<((viewId: GladeViewPresetId) => void) | null>(null);
  const setWeatherRef = useRef<((weatherId: GladeWeatherId) => void) | null>(null);
  const setTimeOfDayRef = useRef<((hours: number) => void) | null>(null);
  const setCyclePausedRef = useRef<((paused: boolean) => void) | null>(null);

  const [activeLevel, setActiveLevel] = useState<WorldLevelId>(getInitialLevelFromUrl);
  const [activeBiome, setActiveBiome] = useState<GladeBiomeId>('crimson-trail');
  const [activeView, setActiveView] = useState<GladeViewPresetId | null>(getInitialViewFromUrl);
  const [activeWeather, setActiveWeather] = useState<GladeWeatherId>(getInitialWeatherFromUrl);
  const [dayTimeHours, setDayTimeHours] = useState<number>(getInitialTimeFromUrl);
  const [cyclePaused, setCyclePaused] = useState<boolean>(getInitialCyclePausedFromUrl);
  const [controlsCollapsed, setControlsCollapsed] = useState<boolean>(false);

  const handleToggleLevel = useCallback(() => {
    setActiveLevel((prev) => {
      const next: WorldLevelId = prev === 'valley' ? 'glade' : 'valley';
      switchLevelRef.current?.(next);
      return next;
    });
  }, []);

  const handleSelectView = useCallback((viewId: GladeViewPresetId) => {
    setActiveView(viewId);
    flyToViewRef.current?.(viewId);
  }, []);

  const handleSelectWeather = useCallback((weatherId: GladeWeatherId) => {
    setActiveWeather(weatherId);
    setWeatherRef.current?.(weatherId);
    if (weatherId === 'golden-sunset') {
      setDayTimeHours(DAY_NIGHT_PRESET_HOURS.sunset);
    }
  }, []);

  const handleSelectTimePreset = useCallback((presetId: DayNightPresetId) => {
    const hours = DAY_NIGHT_PRESET_HOURS[presetId];
    setDayTimeHours(hours);
    setTimeOfDayRef.current?.(hours);
  }, []);

  const handleScrubTime = useCallback((hours: number) => {
    const normalized = normalizeDayHours(hours);
    setDayTimeHours(normalized);
    setTimeOfDayRef.current?.(normalized);
  }, []);

  const handleToggleCyclePaused = useCallback(() => {
    setCyclePaused((prev) => {
      const next = !prev;
      setCyclePausedRef.current?.(next);
      return next;
    });
  }, []);

  const handleToggleControls = useCallback(() => {
    setControlsCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const searchParams = new URLSearchParams(window.location.search);
    const forceShadows = searchParams.get('shadows') === '1';
    const forceComposer = searchParams.get('composer') === '1';
    const viewPreset = searchParams.get('view');
    const initialLevel: WorldLevelId = getInitialLevelFromUrl();
    const initialWeather: GladeWeatherId = getInitialWeatherFromUrl();
    const initialTimeOfDay: number = getInitialTimeFromUrl();
    const initialCyclePaused: boolean = getInitialCyclePausedFromUrl();

    let currentLevel: WorldLevelId = initialLevel;
    let lastReportedBiome: GladeBiomeId = 'crimson-trail';
    let lastReportedClock = formatDayClock(initialTimeOfDay);
    let biomeCheckAccum = 0;

    // Camera flight goal (smoothly damped; cancelled on manual orbit or WASD)
    let flightActive = false;
    const flightGoalPos = new THREE.Vector3();
    const flightGoalTarget = new THREE.Vector3();

    const engine = new WorldEngine({
      container,
      forceShadows: forceShadows ? true : undefined,
    });
    engineRef.current = engine;

    // Sky dome, distance fog, warm golden sun & hemisphere fill
    const atmosphere = createAtmosphere(engine.scene, {
      isSoftwareGl: engine.isSoftwareGl,
      castShadow: forceShadows ? true : undefined,
    });

    // Fast single-pass FXAA + half-res bloom post-processing for smooth 60 FPS
    const postProcessing = createPostProcessing(
      engine.renderer,
      engine.scene,
      engine.camera,
      {
        aaMode: 'fxaa',
        samples: 0,
        isSoftwareGl: engine.isSoftwareGl,
        bypassComposer: engine.isSoftwareGl && !forceComposer,
      },
    );
    engine.setRenderPipeline(postProcessing);

    const writeFoliageDataset = (levelId: WorldLevelId, stats: FoliageLoadStats) => {
      if (currentLevel !== levelId) return;
      container.dataset.foliageLoaded = 'true';
      container.dataset.foliageModelsLoaded = `${stats.loadedModels}/${stats.totalModels}`;
      container.dataset.foliageInstancedMeshes = String(stats.instancedMeshCount);
      container.dataset.foliageTotalInstances = String(stats.totalInstances);
      if (stats.failedModels.length > 0) {
        container.dataset.foliageFailed = stats.failedModels.join(',');
      } else {
        delete container.dataset.foliageFailed;
      }
    };

    // -----------------------------------------------------------------------
    // Level 1: Azure Vale (lazily created ONLY when switching to 'valley' for instant startup & 60 FPS)
    // -----------------------------------------------------------------------
    interface ValleyLevelBundle {
      group: THREE.Group;
      terrain: ReturnType<typeof createTerrain>;
      water: ReturnType<typeof createWater>;
      rocks: ReturnType<typeof createRocks>;
      structures: ReturnType<typeof createStructures>;
      foliage: ReturnType<typeof createEnvironmentFoliage>;
    }
    let valleyBundle: ValleyLevelBundle | null = null;
    let valleyFoliageStats: FoliageLoadStats | null = null;

    const ensureValleyLevel = (): ValleyLevelBundle => {
      if (valleyBundle) return valleyBundle;
      const valleyGroup = new THREE.Group();
      valleyGroup.name = 'level_azureVale';
      engine.scene.add(valleyGroup);

      const terrain = createTerrain();
      valleyGroup.add(terrain.mesh);

      const water = createWater(undefined, {
        sunDirection: atmosphere.getSunDirection(),
      });
      valleyGroup.add(water.mesh);

      const rocks = createRocks(undefined, { water });
      valleyGroup.add(rocks.group);

      const structures = createStructures(undefined, { water });
      valleyGroup.add(structures.group);

      const foliage = createEnvironmentFoliage(valleyGroup, {
        rockColliders: rocks.colliders,
        onLoaded: (stats) => {
          valleyFoliageStats = stats;
          writeFoliageDataset('valley', stats);
        },
      });

      water.syncObstacles();
      container.dataset.valleyRocks = String(rocks.placements.length);
      container.dataset.valleyWaterObstacles = String(water.getObstacles().length);

      valleyBundle = {
        group: valleyGroup,
        terrain,
        water,
        rocks,
        structures,
        foliage,
      };
      return valleyBundle;
    };

    // -----------------------------------------------------------------------
    // Level 2: Expanded Multi-Biome Autumn Glade (520x520 world)
    // -----------------------------------------------------------------------
    let gladeLevel: GladeLevelController | null = null;
    let gladeFoliageStats: FoliageLoadStats | null = null;

    const ensureGladeLevel = (): GladeLevelController => {
      if (gladeLevel) return gladeLevel;
      const gladeSun = GLADE_ATMOSPHERE_CONFIG.sunPosition ?? [86, 72, -130];
      gladeLevel = createGladeLevel(engine.scene, {
        sunDirection: new THREE.Vector3(gladeSun[0], gladeSun[1], gladeSun[2]).normalize(),
        alphaToCoverage: !engine.isSoftwareGl,
        initialWeather,
        initialTimeOfDay,
        cyclePaused: initialCyclePaused,
        onLoaded: (stats) => {
          gladeFoliageStats = stats;
          writeFoliageDataset('glade', stats);
        },
      });
      return gladeLevel;
    };

    // Smooth orbit inspection controls shared across both levels
    const controls = new OrbitControls(engine.camera, engine.renderer.domElement);
    controls.enableDamping = !engine.isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 4;
    controls.maxDistance = 980;

    // Cancel any scripted viewpoint transition the moment the user drags or scrolls
    const onControlStart = () => {
      flightActive = false;
    };
    controls.addEventListener('start', onControlStart);

    // Keyboard exploration (WASD / Arrow keys to glide + H to toggle HUD)
    const keysPressed = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const key = event.key.toLowerCase();
      if (key === 'h') {
        setControlsCollapsed((prev) => !prev);
        return;
      }
      if (
        key === 'w' ||
        key === 'a' ||
        key === 's' ||
        key === 'd' ||
        key === 'arrowup' ||
        key === 'arrowdown' ||
        key === 'arrowleft' ||
        key === 'arrowright' ||
        key === 'shift'
      ) {
        keysPressed.add(key);
        flightActive = false;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keysPressed.delete(event.key.toLowerCase());
    };
    const onWindowBlur = () => {
      keysPressed.clear();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    let lastShadowCenterX = 0;
    let lastShadowCenterZ = 0;

    const syncBiomeReadout = (force = false) => {
      if (currentLevel !== 'glade') return;
      const biome = getDominantGladeBiome(controls.target.x, controls.target.z);
      if (force || biome !== lastReportedBiome) {
        lastReportedBiome = biome;
        container.dataset.activeBiome = biome;
        setActiveBiome(biome);
      }
    };

    const activateLevel = (levelId: WorldLevelId, preset: string | null) => {
      currentLevel = levelId;
      flightActive = false;
      container.dataset.activeLevel = levelId;

      if (levelId === 'glade') {
        const glade = ensureGladeLevel();
        if (valleyBundle) {
          valleyBundle.group.visible = false;
        }
        glade.group.visible = true;

        engine.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        engine.renderer.toneMappingExposure = 1.0;
        postProcessing.setBloomSettings(GLADE_BLOOM_SETTINGS);
        postProcessing.setColorGrade(GLADE_COLOR_GRADE_SETTINGS);

        const weatherId = glade.getWeather();
        container.dataset.activeWeather = weatherId;
        atmosphere.applyMood(GLADE_WEATHER_PRESETS[weatherId].atmosphere);
        atmosphere.sunLight.shadow.radius = 2.2;

        const framing = getGladeCameraFraming(preset);
        engine.camera.position.copy(framing.position);
        controls.target.copy(framing.target);
        controls.update();

        lastShadowCenterX = framing.target.x;
        lastShadowCenterZ = framing.target.z;
        atmosphere.setShadowCenter(lastShadowCenterX, lastShadowCenterZ, 56);
        syncBiomeReadout(true);

        if (gladeFoliageStats) {
          writeFoliageDataset('glade', gladeFoliageStats);
        } else {
          container.dataset.foliageLoaded = 'false';
        }
      } else {
        const valley = ensureValleyLevel();
        valley.group.visible = true;
        if (gladeLevel) {
          gladeLevel.group.visible = false;
        }

        engine.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        engine.renderer.toneMappingExposure = 0.98;
        postProcessing.setBloomSettings(DEFAULT_BLOOM_SETTINGS);
        postProcessing.setColorGrade(DEFAULT_COLOR_GRADE_SETTINGS);

        atmosphere.applyMood(DEFAULT_ATMOSPHERE_CONFIG);
        atmosphere.sunLight.shadow.radius = 2.2;
        atmosphere.setShadowCenter(4, 2, 48);
        valley.water.setSunDirection(atmosphere.getSunDirection());

        const framing = getValleyCameraFraming(preset);
        engine.camera.position.copy(framing.position);
        controls.target.copy(framing.target);
        controls.update();

        if (valleyFoliageStats) {
          writeFoliageDataset('valley', valleyFoliageStats);
        } else {
          container.dataset.foliageLoaded = 'false';
        }
      }
    };

    switchLevelRef.current = (nextLevel: WorldLevelId) => {
      activateLevel(nextLevel, null);
    };

    flyToViewRef.current = (viewId: GladeViewPresetId) => {
      if (currentLevel !== 'glade') return;
      const framing = getGladeCameraFraming(viewId);
      if (engine.isSoftwareGl) {
        // Jump immediately on software WebGL so single-frame renders settle crisply
        flightActive = false;
        engine.camera.position.copy(framing.position);
        controls.target.copy(framing.target);
        controls.update();
        syncBiomeReadout(true);
      } else {
        flightGoalPos.copy(framing.position);
        flightGoalTarget.copy(framing.target);
        flightActive = true;
      }
    };

    setWeatherRef.current = (weatherId: GladeWeatherId) => {
      if (!gladeLevel) return;
      gladeLevel.setWeather(weatherId, engine.isSoftwareGl);
      container.dataset.activeWeather = weatherId;
      container.dataset.timeOfDay = formatDayClock(gladeLevel.getTimeOfDay());
    };

    setTimeOfDayRef.current = (hours: number) => {
      if (!gladeLevel) return;
      gladeLevel.setTimeOfDay(hours);
      const clock = formatDayClock(hours);
      lastReportedClock = clock;
      container.dataset.timeOfDay = clock;
    };

    setCyclePausedRef.current = (paused: boolean) => {
      if (!gladeLevel) return;
      gladeLevel.setCyclePaused(paused);
    };

    // Mount initial level
    activateLevel(initialLevel, viewPreset);
    if (initialLevel === 'glade') {
      const glade = ensureGladeLevel();
      glade.setWeather(initialWeather, true);
      glade.setTimeOfDay(initialTimeOfDay);
      container.dataset.activeWeather = initialWeather;
      container.dataset.timeOfDay = formatDayClock(initialTimeOfDay);
    }

    const forwardScratch = new THREE.Vector3();
    const rightScratch = new THREE.Vector3();
    const moveScratch = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);

    engine.registerSystem({
      name: 'world-levels',
      update: (dt, elapsed) => {
        // 1. Smoothly damped camera flight to selected biome/landmark viewpoint
        if (flightActive && currentLevel === 'glade') {
          const lambda = 4.2;
          engine.camera.position.set(
            THREE.MathUtils.damp(engine.camera.position.x, flightGoalPos.x, lambda, dt),
            THREE.MathUtils.damp(engine.camera.position.y, flightGoalPos.y, lambda, dt),
            THREE.MathUtils.damp(engine.camera.position.z, flightGoalPos.z, lambda, dt),
          );
          controls.target.set(
            THREE.MathUtils.damp(controls.target.x, flightGoalTarget.x, lambda, dt),
            THREE.MathUtils.damp(controls.target.y, flightGoalTarget.y, lambda, dt),
            THREE.MathUtils.damp(controls.target.z, flightGoalTarget.z, lambda, dt),
          );
          if (
            engine.camera.position.distanceToSquared(flightGoalPos) < 0.08 &&
            controls.target.distanceToSquared(flightGoalTarget) < 0.08
          ) {
            engine.camera.position.copy(flightGoalPos);
            controls.target.copy(flightGoalTarget);
            flightActive = false;
          }
        }

        // 2. WASD / Arrow-key horizontal glide across the map
        if (keysPressed.size > 0) {
          engine.camera.getWorldDirection(forwardScratch);
          forwardScratch.y = 0;
          if (forwardScratch.lengthSq() > 1e-4) {
            forwardScratch.normalize();
          } else {
            forwardScratch.set(0, 0, -1);
          }
          rightScratch.crossVectors(forwardScratch, worldUp).normalize();
          moveScratch.set(0, 0, 0);

          if (keysPressed.has('w') || keysPressed.has('arrowup')) moveScratch.add(forwardScratch);
          if (keysPressed.has('s') || keysPressed.has('arrowdown')) moveScratch.sub(forwardScratch);
          if (keysPressed.has('d') || keysPressed.has('arrowright')) moveScratch.add(rightScratch);
          if (keysPressed.has('a') || keysPressed.has('arrowleft')) moveScratch.sub(rightScratch);

          if (moveScratch.lengthSq() > 1e-4) {
            const speed = keysPressed.has('shift') ? 130 : 56;
            moveScratch.normalize().multiplyScalar(speed * dt);
            const bound = currentLevel === 'glade' ? GLADE_HALF_SIZE - 42 : 82;
            const nextTx = THREE.MathUtils.clamp(controls.target.x + moveScratch.x, -bound, bound);
            const nextTz = THREE.MathUtils.clamp(controls.target.z + moveScratch.z, -bound, bound);
            const dx = nextTx - controls.target.x;
            const dz = nextTz - controls.target.z;
            controls.target.x += dx;
            controls.target.z += dz;
            engine.camera.position.x += dx;
            engine.camera.position.z += dz;

            // Keep camera comfortably above terrain surface while gliding over hills
            const floorY =
              currentLevel === 'glade'
                ? getGladeGroundHeight(engine.camera.position.x, engine.camera.position.z) + 1.85
                : getTerrainHeight(engine.camera.position.x, engine.camera.position.z) + 1.85;
            if (engine.camera.position.y < floorY) {
              engine.camera.position.y = floorY;
            }
          }
        }

        controls.update();
        atmosphere.update(dt, elapsed, engine.camera.position);

        if (currentLevel === 'valley' && valleyBundle) {
          valleyBundle.water.update(dt, elapsed);
        } else if (gladeLevel) {
          gladeLevel.update(dt, elapsed, {
            cameraPosition: engine.camera.position,
            atmosphere,
            renderer: engine.renderer,
            postProcessing,
          });

          // Gently recenter shadow frustum as the user explores the 960x960 world
          const sd = Math.hypot(
            controls.target.x - lastShadowCenterX,
            controls.target.z - lastShadowCenterZ,
          );
          if (sd > 14) {
            lastShadowCenterX = controls.target.x;
            lastShadowCenterZ = controls.target.z;
            atmosphere.setShadowCenter(lastShadowCenterX, lastShadowCenterZ, 56);
          }

          // Throttled biome & clock readout check (~4Hz, zero per-frame React overhead)
          biomeCheckAccum += dt;
          if (biomeCheckAccum >= 0.25) {
            biomeCheckAccum = 0;
            syncBiomeReadout(false);
            const currentHours = gladeLevel.getTimeOfDay();
            const clock = formatDayClock(currentHours);
            if (clock !== lastReportedClock) {
              lastReportedClock = clock;
              container.dataset.timeOfDay = clock;
              setDayTimeHours(currentHours);
            }
          }
        }
      },
      dispose: () => {
        controls.removeEventListener('start', onControlStart);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onWindowBlur);
        controls.dispose();
        gladeLevel?.dispose();
        gladeLevel = null;
        if (valleyBundle) {
          valleyBundle.foliage.dispose();
          valleyBundle.structures.dispose();
          valleyBundle.rocks.dispose();
          valleyBundle.water.dispose();
          valleyBundle.terrain.dispose();
          valleyBundle.group.clear();
          engine.scene.remove(valleyBundle.group);
          valleyBundle = null;
        }
        atmosphere.dispose();
        disposeGladeAssetCache();
        disposeFoliageAssetCache();
        disposeGhibliGradientMap();
        disposeToonGradientMaps();
      },
    });

    engine.start();
    container.dataset.engineReady = 'true';
    container.dataset.postProcessingAa = postProcessing.aaMode;

    return () => {
      switchLevelRef.current = null;
      flyToViewRef.current = null;
      setWeatherRef.current = null;
      setTimeOfDayRef.current = null;
      setCyclePausedRef.current = null;
      delete container.dataset.engineReady;
      delete container.dataset.activeLevel;
      delete container.dataset.activeBiome;
      delete container.dataset.activeWeather;
      delete container.dataset.timeOfDay;
      delete container.dataset.postProcessingAa;
      delete container.dataset.valleyRocks;
      delete container.dataset.valleyWaterObstacles;
      delete container.dataset.foliageLoaded;
      delete container.dataset.foliageModelsLoaded;
      delete container.dataset.foliageInstancedMeshes;
      delete container.dataset.foliageTotalInstances;
      delete container.dataset.foliageFailed;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden select-none bg-[#4ea8de]">
      <div
        ref={canvasMountRef}
        data-testid="world-canvas-container"
        className="h-full w-full"
      />

      <GladeHud
        activeLevel={activeLevel}
        activeBiome={activeBiome}
        activeView={activeView}
        activeWeather={activeWeather}
        dayTimeHours={dayTimeHours}
        cyclePaused={cyclePaused}
        controlsCollapsed={controlsCollapsed}
        onSelectView={handleSelectView}
        onSelectWeather={handleSelectWeather}
        onSelectTimePreset={handleSelectTimePreset}
        onScrubTime={handleScrubTime}
        onToggleCyclePaused={handleToggleCyclePaused}
        onToggleControls={handleToggleControls}
        onToggleLevel={handleToggleLevel}
      />
    </main>
  );
}
