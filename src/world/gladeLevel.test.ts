import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { STYLIZED_ASSET_BASE_URL } from './foliageAssets';
import {
  GLADE_ASSET_CATALOG,
  GLADE_BIRCH_FILES,
  GLADE_BUSH_FILES,
  GLADE_COMMON_TREE_FILES,
  GLADE_DEAD_TREE_FILES,
  GLADE_FLOWER_FILES,
  GLADE_GRASS_FILES,
  GLADE_MAPLE_FILES,
  GLADE_MUSHROOM_FILES,
  GLADE_PATH_STONE_FILES,
  GLADE_PETAL_FILES,
  GLADE_PINE_FILES,
  GLADE_PLANT_FILES,
  GLADE_ROCK_FILES,
  GLADE_TWISTED_TREE_FILES,
} from './gladeAssets';
import { GLADE_LAKES } from './gladeBiomes';
import { createGladeLandmarks } from './gladeLandmarks';
import {
  GLADE_SIZE,
  GLADE_TRAIL_HALF_WIDTH,
  GLADE_WATER_LEVEL,
  generateGladePlacements,
  getGladeArchwayAnchor,
  getGladeCameraFraming,
  getGladeGroundHeight,
  getGladeLandmarkAnchors,
  getGladeTrailDistance,
  isPointInGladeWater,
} from './gladeLevel';
import {
  createStylizedAAFoliageMaterial,
  createStylizedAAGroundMaterial,
  createStylizedAAStoneMaterial,
  disposeGhibliGradientMap,
  getSoftGhibliGradientMap,
  updateStylizedAAShaderTime,
} from './stylizedAAShader';

test('Autumn Glade catalog contains all 99 repository GLB assets with proper shadow flags', () => {
  const allExpected = [
    ...GLADE_BIRCH_FILES,
    ...GLADE_MAPLE_FILES,
    ...GLADE_COMMON_TREE_FILES,
    ...GLADE_PINE_FILES,
    ...GLADE_TWISTED_TREE_FILES,
    ...GLADE_DEAD_TREE_FILES,
    ...GLADE_BUSH_FILES,
    ...GLADE_PLANT_FILES,
    ...GLADE_GRASS_FILES,
    ...GLADE_FLOWER_FILES,
    ...GLADE_PETAL_FILES,
    ...GLADE_MUSHROOM_FILES,
    ...GLADE_ROCK_FILES,
    ...GLADE_PATH_STONE_FILES,
  ];
  assert.equal(allExpected.length, 99);
  assert.equal(GLADE_ASSET_CATALOG.length, 99);

  const noShadowCategories = new Set([
    'flower',
    'petal',
    'plant',
    'mushroom',
    'pathStone',
  ]);

  for (const filename of allExpected) {
    const spec = GLADE_ASSET_CATALOG.find((item) => item.filename === filename);
    assert.ok(spec, `Missing 99-asset catalog entry for ${filename}`);
    assert.equal(spec.url, `${STYLIZED_ASSET_BASE_URL}${filename}`);

    if (spec.category === 'grass') {
      assert.equal(spec.castShadow, false, `${filename} grass must disable castShadow`);
      assert.equal(spec.receiveShadow, true, `${filename} grass must enable receiveShadow`);
    } else if (noShadowCategories.has(spec.category)) {
      assert.equal(spec.castShadow, false, `${filename} must disable castShadow`);
      assert.equal(spec.receiveShadow, false, `${filename} must disable receiveShadow`);
    } else {
      assert.equal(spec.castShadow, true, `${filename} should castShadow`);
      assert.equal(spec.receiveShadow, true, `${filename} should receiveShadow`);
    }
  }
});

test('Stylized Ghibli 3D-lit MeshToonMaterial handles Sakura blossom remap, wind multiplier, bark MASK override, and bright grass', () => {
  const leafTex = new THREE.DataTexture(new Uint8Array([210, 120, 60, 255]), 1, 1);
  const barkTex = new THREE.DataTexture(new Uint8Array([110, 95, 80, 255]), 1, 1);

  const gradientMap = getSoftGhibliGradientMap();
  assert.equal(gradientMap.minFilter, THREE.LinearFilter);
  assert.equal(gradientMap.magFilter, THREE.LinearFilter);

  const mapleLeafOrig = new THREE.MeshStandardMaterial({
    name: 'MapleTree_Leaves',
    map: leafTex,
    transparent: true,
  });
  const mapleLeafAA = createStylizedAAFoliageMaterial(mapleLeafOrig, {
    category: 'maple',
    meshName: 'MapleTree_5',
    targetHeight: 10.8,
  });

  assert.ok(mapleLeafAA instanceof THREE.MeshToonMaterial);
  assert.equal(mapleLeafAA.gradientMap, gradientMap);
  assert.equal(mapleLeafAA.alphaTest, 0.5);
  assert.equal(mapleLeafAA.transparent, false);
  assert.equal(mapleLeafAA.depthWrite, true);
  assert.equal(mapleLeafAA.side, THREE.DoubleSide);
  assert.equal(mapleLeafAA.userData.isStylizedAACutout, true);
  assert.equal(mapleLeafAA.userData.isStylizedAACanopyCrown, true);
  assert.equal(mapleLeafAA.userData.stylizedAAUniforms.uSakuraRemap.value, 0.0);

  // Sakura canopy shader remap
  const sakuraLeafAA = createStylizedAAFoliageMaterial(mapleLeafOrig, {
    category: 'sakura',
    meshName: 'CommonTree_2',
    targetHeight: 11.2,
  });
  assert.ok(sakuraLeafAA instanceof THREE.MeshToonMaterial);
  assert.equal(sakuraLeafAA.alphaTest, 0.5);
  assert.equal(sakuraLeafAA.userData.isStylizedAACanopyCrown, true);
  assert.equal(sakuraLeafAA.userData.stylizedAAUniforms.uSakuraRemap.value, 1.0);
  assert.notEqual(sakuraLeafAA.customProgramCacheKey(), mapleLeafAA.customProgramCacheKey());

  // CommonTree Bark_NormalTree uses alphaMode=MASK in GLB, must stay opaque bark
  const commonBarkOrig = new THREE.MeshStandardMaterial({
    name: 'Bark_NormalTree',
    map: barkTex,
    alphaTest: 0.5,
  });
  const commonBarkAA = createStylizedAAFoliageMaterial(commonBarkOrig, {
    category: 'commonTree',
    meshName: 'CommonTree_1',
    targetHeight: 9.8,
  });
  assert.ok(commonBarkAA instanceof THREE.MeshToonMaterial);
  assert.equal(commonBarkAA.alphaTest, 0);
  assert.equal(commonBarkAA.userData.isStylizedAACutout, false);

  const grassOrig = new THREE.MeshStandardMaterial({
    name: 'Grass',
    map: leafTex,
  });
  const grassAA = createStylizedAAFoliageMaterial(grassOrig, {
    category: 'grass',
    meshName: 'Grass_Large_Extruded',
    targetHeight: 1.0,
  });
  assert.equal(grassAA.userData.stylizedAAUniforms.uGrassRemap.value, 1.0);

  const groundAA = createStylizedAAGroundMaterial();
  const stoneAA = createStylizedAAStoneMaterial();

  updateStylizedAAShaderTime([mapleLeafAA, sakuraLeafAA, commonBarkAA, grassAA, groundAA], 14.25, 1.75);
  assert.equal(sakuraLeafAA.userData.stylizedAAUniforms.uTime.value, 14.25);
  assert.equal(sakuraLeafAA.userData.stylizedAAUniforms.uWindMultiplier.value, 1.75);
  assert.equal(groundAA.userData.stylizedAAGroundUniforms.uTime.value, 14.25);

  mapleLeafOrig.dispose();
  commonBarkOrig.dispose();
  grassOrig.dispose();
  mapleLeafAA.dispose();
  sakuraLeafAA.dispose();
  commonBarkAA.dispose();
  grassAA.dispose();
  groundAA.dispose();
  stoneAA.dispose();
  leafTex.dispose();
  barkTex.dispose();
  disposeGhibliGradientMap();
});

test('Expanded 1920x1920 Autumn Glade distributes recolored GLB Sakura trees, biome foliage, rocks, and flowers without clipping water, trails, or landmarks', () => {
  assert.equal(GLADE_SIZE, 1920);
  const planA = generateGladePlacements();
  const planB = generateGladePlacements();

  assert.equal(planA.totalInstances, planB.totalInstances);
  assert.equal(planA.liveTreePlacements.length, planB.liveTreePlacements.length);

  assert.ok(
    planA.liveTreePlacements.length >= 1200,
    `Expected >=1200 live trees on 1920x1920 map, got ${planA.liveTreePlacements.length}`,
  );
  const sakuraTrees = planA.liveTreePlacements.filter((p) => p.isSakura);
  assert.ok(
    sakuraTrees.length >= 240,
    `Expected >=240 recolored GLB Sakura cherry blossom trees, got ${sakuraTrees.length}`,
  );

  // Mirror Blossom Lake island must be crowned by recolored existing GLB sakura trees
  const sakuraLake = GLADE_LAKES[0];
  const islandSakuraTrees = sakuraTrees.filter(
    (p) => Math.hypot(p.x - sakuraLake.x, p.z - sakuraLake.z) <= 14,
  );
  assert.ok(
    islandSakuraTrees.length >= 1,
    `Expected recolored GLB sakura tree(s) on Mirror Blossom Lake island, got ${islandSakuraTrees.length}`,
  );
  for (const t of islandSakuraTrees) {
    assert.ok(
      GLADE_ASSET_CATALOG.some((spec) => spec.id === t.modelId),
      `Island sakura tree ${t.modelId} must come from existing GLB asset catalog`,
    );
  }

  // Landmarks must NOT contain any custom procedural sakura tree
  const landmarkCtrl = createGladeLandmarks();
  assert.equal(
    landmarkCtrl.group.getObjectByName('landmark_giantWeepingSakura'),
    undefined,
    'Custom procedural sakura tree must be removed',
  );
  assert.equal(
    landmarkCtrl.landmarkNames.includes('Giant Ancient Weeping Sakura'),
    false,
    'Landmark list must not include custom procedural sakura tree',
  );
  landmarkCtrl.dispose();

  assert.ok(planA.deadTreePlacements.length >= 50);
  assert.ok(planA.bushPlacements.length >= 400);
  assert.ok(planA.grassPlacements.length >= 2200);
  assert.ok(planA.flowerPlacements.length >= 900);
  assert.ok(planA.rockPlacements.length >= 70 && planA.rockPlacements.length <= 145);

  // Hero eye-level camera looks slightly upward along the Crimson Trail
  const cam = getGladeCameraFraming(null);
  const camGroundY = getGladeGroundHeight(cam.position.x, cam.position.z);
  const eyeHeight = cam.position.y - camGroundY;
  assert.ok(eyeHeight >= 1.8 && eyeHeight <= 3.2, `Expected eye-level camera height, got ${eyeHeight}`);
  assert.ok(cam.target.y > cam.position.y, 'Hero camera should look upward along rising path');

  // Every curated viewpoint preset returns valid finite coordinates
  for (const preset of [
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
  ]) {
    const f = getGladeCameraFraming(preset);
    assert.ok(Number.isFinite(f.position.x) && Number.isFinite(f.position.y) && Number.isFinite(f.position.z));
    assert.ok(Number.isFinite(f.target.x) && Number.isFinite(f.target.y) && Number.isFinite(f.target.z));
  }

  const archway = getGladeArchwayAnchor();
  const landmarks = getGladeLandmarkAnchors();

  for (const tree of [...planA.liveTreePlacements, ...planA.deadTreePlacements]) {
    assert.equal(
      isPointInGladeWater(tree.x, tree.z, 0.0),
      false,
      `Tree ${tree.modelId} at (${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}) must not stand in water`,
    );
    assert.ok(
      Math.hypot(tree.x - archway.x, tree.z - archway.z) >= 8.0,
      `Tree ${tree.modelId} encroaches on horizon archway`,
    );
    assert.ok(
      Math.hypot(tree.x - cam.position.x, tree.z - cam.position.z) >= 6.8,
      `Tree ${tree.modelId} clips into hero camera`,
    );
    assert.ok(
      getGladeTrailDistance(tree.x, tree.z) >= GLADE_TRAIL_HALF_WIDTH + 2.5,
      `Tree ${tree.modelId} blocks footpath network`,
    );
    for (const lm of landmarks) {
      assert.ok(
        Math.hypot(tree.x - lm.x, tree.z - lm.z) >= lm.clearRadius - 0.5,
        `Tree ${tree.modelId} encroaches on landmark ${lm.id}`,
      );
    }
  }

  for (const g of planA.grassPlacements) {
    assert.equal(isPointInGladeWater(g.x, g.z, 0.0), false, 'Grass tuft must not spawn underwater');
    assert.ok(
      getGladeTrailDistance(g.x, g.z) >= GLADE_TRAIL_HALF_WIDTH + 0.35,
      `Grass ${g.modelId} encroaches into dirt footpath`,
    );
  }

  for (const f of planA.flowerPlacements) {
    assert.equal(isPointInGladeWater(f.x, f.z, 0.0), false, 'Wildflower must not spawn underwater');
  }

  // Every placed asset is cleanly grounded to the terrain heightfield
  for (const p of [
    ...planA.liveTreePlacements,
    ...planA.deadTreePlacements,
    ...planA.bushPlacements,
    ...planA.grassPlacements,
    ...planA.flowerPlacements,
    ...planA.rockPlacements,
  ]) {
    const groundY = getGladeGroundHeight(p.x, p.z);
    assert.ok(
      p.y <= groundY + 0.06 && p.y >= groundY - 1.1,
      `${p.modelId} not grounded properly (y=${p.y.toFixed(2)}, ground=${groundY.toFixed(2)})`,
    );
  }

  // At least several shoreline boulders sit near water level to generate foam rings
  const shorelineRocks = planA.rockPlacements.filter(
    (r) => getGladeGroundHeight(r.x, r.z) < GLADE_WATER_LEVEL + 0.55,
  );
  assert.ok(shorelineRocks.length >= 4, `Expected shoreline boulders near water, got ${shorelineRocks.length}`);
});

test('Foreground overhanging right maple uses dedicated Ghibli autumn gradient while background maples stay untouched', () => {
  const plan = generateGladePlacements();
  const heroMaples = plan.liveTreePlacements.filter((p) => p.isForegroundHeroMaple);
  assert.equal(heroMaples.length, 1, 'Only the foreground overhanging right maple should be tagged');
  assert.equal(heroMaples[0].modelId, 'MapleTree_1');
  assert.ok(heroMaples[0].x > 0 && heroMaples[0].z > 5, 'Hero maple should sit on foreground right');

  const standardMaples = plan.liveTreePlacements.filter(
    (p) => p.category === 'maple' && !p.isForegroundHeroMaple,
  );
  assert.ok(standardMaples.length >= 20, 'Background maples must remain abundant');

  const leafTex = new THREE.DataTexture(new Uint8Array([220, 40, 30, 255]), 1, 1);
  const origLeaf = new THREE.MeshStandardMaterial({
    name: 'MapleTree_Leaves',
    map: leafTex,
    transparent: true,
  });

  const standardMat = createStylizedAAFoliageMaterial(origLeaf, {
    category: 'maple',
    meshName: 'MapleTree_1',
    targetHeight: 9.5,
  });
  const heroMat = createStylizedAAFoliageMaterial(origLeaf, {
    category: 'maple',
    meshName: 'MapleTree_1',
    targetHeight: 9.5,
    heroAutumnGradient: true,
  });

  assert.equal(standardMat.userData.stylizedAAUniforms.uHeroAutumnEnabled.value, 0.0);
  assert.equal(heroMat.userData.stylizedAAUniforms.uHeroAutumnEnabled.value, 1.0);
  assert.equal(heroMat.userData.isHeroAutumnMaple, true);
  assert.equal(heroMat.alphaTest, 0.5);
  assert.equal(heroMat.transparent, false);
  assert.equal(heroMat.depthWrite, true);
  assert.ok(
    heroMat.userData.stylizedAAUniforms.uSaturationBoost.value <
      standardMat.userData.stylizedAAUniforms.uSaturationBoost.value,
  );
  assert.notEqual(heroMat.customProgramCacheKey(), standardMat.customProgramCacheKey());

  origLeaf.dispose();
  standardMat.dispose();
  heroMat.dispose();
  leafTex.dispose();
  disposeGhibliGradientMap();
});
