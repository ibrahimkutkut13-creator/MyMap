import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { MAX_PIXEL_RATIO, getClampedPixelRatio } from './WorldEngine';
import {
  BUSH_MODEL_FILES,
  DRACO_DECODER_PATH,
  FLOWER_MODEL_FILES,
  FOLIAGE_MODEL_CATALOG,
  GRASS_MODEL_FILES,
  STYLIZED_ASSET_BASE_URL,
  TREE_MODEL_FILES,
  computeNormalizedModelScale,
  dequantizeBufferGeometry,
  generateFoliagePlacements,
} from './foliageAssets';
import { generateRockPlacements } from './rocks';
import {
  PATH_HALF_WIDTH,
  getBridgeAnchor,
  getPathDistance,
  getRiverSignedDistance,
  getTerrainBiomeAt,
  getTerrainHeight,
} from './terrain';
import { convertMaterialToAnimeToon, disposeToonGradientMaps } from './toonMaterials';

test('WorldEngine caps device pixel ratio at 1.5', () => {
  assert.equal(MAX_PIXEL_RATIO, 1.5);
  assert.equal(getClampedPixelRatio(1), 1);
  assert.equal(getClampedPixelRatio(1.25), 1.25);
  assert.equal(getClampedPixelRatio(2), 1.5);
  assert.equal(getClampedPixelRatio(3), 1.5);
  assert.equal(getClampedPixelRatio(0), 1);
  assert.equal(getClampedPixelRatio(Number.NaN), 1);
});

test('Foliage catalog includes all 17 requested GLB URLs, Draco decoder, and shadow settings', () => {
  assert.equal(
    STYLIZED_ASSET_BASE_URL,
    'https://raw.githubusercontent.com/ibrahimkutkut13-creator/stylizedassets/main/',
  );
  assert.equal(
    DRACO_DECODER_PATH,
    'https://www.gstatic.com/draco/versioned/decoders/1.5.7/',
  );

  const expectedFilenames = [
    ...TREE_MODEL_FILES,
    ...BUSH_MODEL_FILES,
    ...GRASS_MODEL_FILES,
    ...FLOWER_MODEL_FILES,
  ];
  assert.equal(expectedFilenames.length, 17);
  assert.equal(FOLIAGE_MODEL_CATALOG.length, 17);

  for (const filename of expectedFilenames) {
    const spec = FOLIAGE_MODEL_CATALOG.find((item) => item.filename === filename);
    assert.ok(spec, `Missing catalog entry for ${filename}`);
    assert.equal(spec.url, `${STYLIZED_ASSET_BASE_URL}${filename}`);

    if (spec.category === 'grass' || spec.category === 'flower') {
      assert.equal(spec.castShadow, false, `${filename} must disable castShadow`);
      assert.equal(spec.receiveShadow, false, `${filename} must disable receiveShadow`);
    } else {
      assert.equal(spec.castShadow, true, `${filename} should castShadow`);
      assert.equal(spec.receiveShadow, true, `${filename} should receiveShadow`);
    }
  }
});

test('convertMaterialToAnimeToon preserves diffuse map, uses 3-step toon shader, and sets alphaTest 0.5 on foliage', () => {
  const leafTex = new THREE.DataTexture(new Uint8Array([80, 180, 90, 255]), 1, 1);
  const barkTex = new THREE.DataTexture(new Uint8Array([120, 88, 60, 255]), 1, 1);

  const leafOrig = new THREE.MeshStandardMaterial({
    name: 'Birch_Leaves',
    color: new THREE.Color('#f7fff0'),
    map: leafTex,
    transparent: true,
  });
  const leafToon = convertMaterialToAnimeToon(leafOrig, {
    category: 'tree',
    meshName: 'Leaves_Mesh',
  });

  assert.ok(leafToon instanceof THREE.MeshToonMaterial);
  assert.equal(leafToon.userData.animeToonSteps, 3);
  assert.equal(leafToon.map, leafTex);
  assert.equal(leafToon.map?.colorSpace, THREE.SRGBColorSpace);
  assert.equal(leafToon.alphaTest, 0.5);
  assert.equal(leafToon.transparent, false);
  assert.equal(leafToon.side, THREE.DoubleSide);

  const barkOrig = new THREE.MeshStandardMaterial({
    name: 'Birch_Bark',
    color: new THREE.Color('#e8dfd1'),
    map: barkTex,
  });
  const barkToon = convertMaterialToAnimeToon(barkOrig, {
    category: 'tree',
    meshName: 'Trunk_Mesh',
  });

  assert.equal(barkToon.userData.animeToonSteps, 3);
  assert.equal(barkToon.map, barkTex);
  assert.equal(barkToon.alphaTest, 0);

  const flowerOrig = new THREE.MeshStandardMaterial({
    name: 'Mat_Generic',
    map: leafTex,
  });
  const flowerToon = convertMaterialToAnimeToon(flowerOrig, {
    category: 'flower',
  });
  assert.equal(flowerToon.alphaTest, 0.5);
  assert.equal(flowerToon.side, THREE.DoubleSide);
  assert.equal(flowerToon.map, leafTex);

  leafOrig.dispose();
  barkOrig.dispose();
  flowerOrig.dispose();
  leafToon.dispose();
  barkToon.dispose();
  flowerToon.dispose();
  leafTex.dispose();
  barkTex.dispose();
  disposeToonGradientMaps();
});

test('computeNormalizedModelScale safely normalizes arbitrary GLB unit heights', () => {
  assert.equal(computeNormalizedModelScale(4.6, 9.2), 2);
  assert.equal(computeNormalizedModelScale(0, 9.2), 1);
  assert.equal(computeNormalizedModelScale(Number.NaN, 9.2), 1);
});

test('dequantizeBufferGeometry promotes normalized Int16Array positions to Float32Array so applyMatrix4 never clamps', () => {
  const quantized = new THREE.BufferGeometry();
  const int16Positions = new Int16Array([0, -32767, 0, 16384, 32767, -16384]);
  quantized.setAttribute('position', new THREE.BufferAttribute(int16Positions, 3, true));

  const floatGeo = dequantizeBufferGeometry(quantized);
  const posAttr = floatGeo.getAttribute('position');
  assert.ok(posAttr instanceof THREE.BufferAttribute);
  assert.equal(posAttr.normalized, false);
  assert.ok(posAttr.array instanceof Float32Array);

  floatGeo.applyMatrix4(new THREE.Matrix4().makeScale(4.5, 4.5, 4.5));
  assert.ok(Math.abs(posAttr.getY(0) - -4.5) < 1e-3);
  assert.ok(Math.abs(posAttr.getY(1) - 4.5) < 1e-3);
  assert.ok(Math.abs(posAttr.getX(1) - 2.25) < 1e-2);

  quantized.dispose();
  floatGeo.dispose();
});

test('generateFoliagePlacements populates all 17 models cleanly on meadow terrain outside paths and water', () => {
  const rocks = generateRockPlacements();
  const rockColliders = rocks.map((r) => ({
    x: r.x,
    y: r.y,
    z: r.z,
    radius: r.colliderRadius,
    height: r.colliderHeight,
    kind: r.kind,
  }));

  const planA = generateFoliagePlacements(rockColliders);
  const planB = generateFoliagePlacements(rockColliders);

  // Deterministic across repeated runs
  assert.equal(planA.totalInstances, planB.totalInstances);
  assert.equal(planA.treePlacements.length, planB.treePlacements.length);
  assert.equal(planA.treePlacements[0]?.x, planB.treePlacements[0]?.x);

  // Rich valley population across all 4 categories
  assert.ok(planA.treePlacements.length >= 65, `Expected >=65 trees, got ${planA.treePlacements.length}`);
  assert.ok(planA.bushPlacements.length >= 100, `Expected >=100 bushes, got ${planA.bushPlacements.length}`);
  assert.ok(planA.grassPlacements.length >= 800, `Expected >=800 grass clumps, got ${planA.grassPlacements.length}`);
  assert.ok(planA.flowerPlacements.length >= 320, `Expected >=320 flower clumps, got ${planA.flowerPlacements.length}`);

  // Every single one of the 17 GLB variants receives instances
  for (const spec of FOLIAGE_MODEL_CATALOG) {
    const list = planA.placementsByModel[spec.id];
    assert.ok(list && list.length > 0, `Expected at least 1 placement for ${spec.filename}`);
  }

  // Grounding & obstacle-clearance invariants
  const bridge = getBridgeAnchor();
  for (const p of [
    ...planA.treePlacements,
    ...planA.bushPlacements,
    ...planA.grassPlacements,
    ...planA.flowerPlacements,
  ]) {
    assert.equal(
      getTerrainBiomeAt(p.x, p.z),
      'meadow',
      `${p.modelId} placed outside meadow biome`,
    );
    assert.ok(
      getPathDistance(p.x, p.z) >= PATH_HALF_WIDTH + 0.5,
      `${p.modelId} encroaches on footpath`,
    );
    assert.ok(
      getRiverSignedDistance(p.x, p.z) >= 0.9,
      `${p.modelId} placed inside river/pond`,
    );
    assert.ok(
      Math.hypot(p.x - bridge.position.x, p.z - bridge.position.z) >= 6.8,
      `${p.modelId} overlaps bridge`,
    );

    const groundY = getTerrainHeight(p.x, p.z);
    assert.ok(
      p.y <= groundY + 0.01 && p.y >= groundY - 0.5,
      `${p.modelId} floating or sunk too deep (y=${p.y}, ground=${groundY})`,
    );
  }
});
