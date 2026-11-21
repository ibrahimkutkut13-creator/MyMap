import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BIOME_COLORS,
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  WATER_LEVEL,
  WORLD_SEED,
  SeededSimplex2D,
  createTerrain,
  evaluateBiomeColorAt,
  getBridgeAnchor,
  getFordCrossing,
  getOverlookCenter,
  getPathDistance,
  getPondCenter,
  getRiverCenterX,
  getRiverSignedDistance,
  getRuinsCenter,
  getSpawnPosition,
  getTerrainBiomeAt,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainSlope,
  terrace,
} from './terrain';

test('SeededSimplex2D is deterministic for the same seed and bounded', () => {
  const a = new SeededSimplex2D(WORLD_SEED);
  const b = new SeededSimplex2D(WORLD_SEED);
  for (let i = -20; i <= 20; i += 5) {
    const va = a.noise2D(i * 0.13, -i * 0.09);
    const vb = b.noise2D(i * 0.13, -i * 0.09);
    assert.equal(va, vb);
    assert.ok(va >= -1.05 && va <= 1.05, `simplex value out of range: ${va}`);
  }
});

test('terrace function preserves monotonicity while flattening plateaus', () => {
  let prev = -Infinity;
  for (let h = 0; h <= 24; h += 0.25) {
    const t = terrace(h, 3.6, 5.4);
    assert.ok(t >= prev - 1e-6, `terrace non-monotonic at h=${h}: ${t} < ${prev}`);
    prev = t;
  }
});

test('createTerrain builds 300x300 mesh whose vertices match getTerrainHeight exactly', () => {
  const terrain = createTerrain();
  assert.equal(terrain.size, TERRAIN_SIZE);
  assert.equal(terrain.segments, TERRAIN_SEGMENTS);
  assert.equal(terrain.waterLevel, WATER_LEVEL);
  assert.equal(terrain.mesh.receiveShadow, true);
  assert.equal(terrain.material.vertexColors, true);

  const pos = terrain.geometry.getAttribute('position');
  const col = terrain.geometry.getAttribute('color');
  assert.ok(pos && pos.count === (TERRAIN_SEGMENTS + 1) * (TERRAIN_SEGMENTS + 1));
  assert.ok(col && col.count === pos.count);

  // Sample vertices across the grid and verify exact height match (< 0.001)
  for (let i = 0; i < pos.count; i += 317) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const expected = getTerrainHeight(vx, vz);
    assert.ok(
      Math.abs(vy - expected) < 1e-4,
      `Vertex (${vx}, ${vz}) height mismatch: ${vy} vs ${expected}`,
    );
  }

  terrain.dispose();
});

test('river channel and mid-valley pond are carved below WATER_LEVEL', () => {
  const pond = getPondCenter();
  const pondHeight = getTerrainHeight(pond.x, pond.z);
  assert.ok(
    pondHeight < WATER_LEVEL - 1.5,
    `Expected deep pond bed below WATER_LEVEL, got ${pondHeight}`,
  );
  assert.ok(getRiverSignedDistance(pond.x, pond.z) < -8);
  assert.equal(getTerrainBiomeAt(pond.x, pond.z), 'water');

  // River centerline across mid-valley should consistently sit below WATER_LEVEL
  for (const z of [-60, -20, 6, 27.5, 65]) {
    const cx = getRiverCenterX(z);
    const bedY = getTerrainHeight(cx, z);
    assert.ok(
      bedY < WATER_LEVEL - 0.35,
      `Riverbed at z=${z} (x=${cx.toFixed(1)}) not below water: ${bedY}`,
    );
  }
});

test('landmark plateaus (Ruins, Overlook, Spawn) and bridge ends are flat and readable', () => {
  const ruins = getRuinsCenter();
  assert.ok(ruins.y >= 10.2 && ruins.y <= 11.8, `Ruins plateau height unexpected: ${ruins.y}`);
  assert.ok(getTerrainSlope(ruins.x, ruins.z) < 0.08, 'Ruins plateau center should be flat');

  const overlook = getOverlookCenter();
  assert.ok(
    overlook.y >= 15.2 && overlook.y <= 16.8,
    `Overlook crest height unexpected: ${overlook.y}`,
  );
  assert.ok(getTerrainSlope(overlook.x, overlook.z) < 0.08, 'Overlook crest should be flat');

  const spawn = getSpawnPosition();
  assert.ok(spawn.y > WATER_LEVEL + 0.8, `Spawn should be well above water: ${spawn.y}`);
  assert.ok(getTerrainSlope(spawn.x, spawn.z) < 0.12, 'Spawn meadow should be gentle');
  assert.ok(getPathDistance(spawn.x, spawn.z) < 1.0, 'Spawn connects directly to footpath');

  const bridge = getBridgeAnchor();
  const westGround = getTerrainHeight(bridge.westEnd.x, bridge.westEnd.z);
  const eastGround = getTerrainHeight(bridge.eastEnd.x, bridge.eastEnd.z);
  assert.ok(
    Math.abs(westGround - bridge.bankHeight) < 0.22,
    `West bridge abutment mismatch: ground=${westGround}, bank=${bridge.bankHeight}`,
  );
  assert.ok(
    Math.abs(eastGround - bridge.bankHeight) < 0.22,
    `East bridge abutment mismatch: ground=${eastGround}, bank=${bridge.bankHeight}`,
  );
  // River channel underneath bridge center must be below water
  assert.ok(getTerrainHeight(bridge.position.x, bridge.position.z) < WATER_LEVEL - 0.6);

  const ford = getFordCrossing();
  assert.ok(getTerrainHeight(ford.center.x, ford.center.z) < WATER_LEVEL - 0.3);
});

test('biome classifier and vertex colors distinguish meadow, path, cliff, and water', () => {
  const spawn = getSpawnPosition();
  assert.equal(getTerrainBiomeAt(spawn.x, spawn.z), 'path');

  // Verify open meadow away from path, river, and cliffs classifies as meadow
  const meadowX = -24;
  const meadowZ = 4;
  assert.equal(getTerrainBiomeAt(meadowX, meadowZ), 'meadow');

  const meadowCol = evaluateBiomeColorAt(
    meadowX,
    meadowZ,
    getTerrainHeight(meadowX, meadowZ),
    0.05,
  );
  const expectedMeadow = new THREE.Color(BIOME_COLORS.meadowBase);
  assert.ok(
    meadowCol.g > meadowCol.r && meadowCol.g > meadowCol.b,
    'Meadow vertex color should be vibrantly green',
  );
  assert.ok(Math.abs(meadowCol.g - expectedMeadow.g) < 0.25);

  // Steep slope (> 0.42) should resolve sharply to cool slate cliff color (#7b8cde)
  const cliffCol = evaluateBiomeColorAt(80, -80, 14, 0.72);
  assert.ok(
    cliffCol.b > cliffCol.r && cliffCol.b > cliffCol.g,
    'Steep cliff vertex color should be cool slate blue-violet',
  );

  // Verify normal query returns unit vector pointing generally upward
  const n = getTerrainNormal(meadowX, meadowZ);
  assert.ok(Math.abs(n.length() - 1) < 1e-4);
  assert.ok(n.y > 0.7);
});
