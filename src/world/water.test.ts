import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WATER_LEVEL, getPondCenter, getRiverCenterX } from './terrain';
import {
  DEFAULT_WATER_COLORS,
  computeMinObstacleDistance,
  createWater,
} from './water';

test('createWater builds pruned water geometry with required shader attributes', () => {
  const scene = new THREE.Scene();
  const water = createWater(scene);

  assert.equal(water.mesh.parent, scene);
  assert.equal(water.material.transparent, true);
  assert.equal(water.material.depthWrite, false);
  assert.equal(water.material.fog, true);

  const pos = water.geometry.getAttribute('position');
  const depth = water.geometry.getAttribute('aDepth');
  const obs = water.geometry.getAttribute('aObstacleDist');
  const flow = water.geometry.getAttribute('aFlowDir');

  assert.ok(pos && pos.count > 500, 'Water geometry should retain river/pond vertices');
  assert.ok(pos.count < 97 * 211, 'Buried dry-land triangles should be pruned');
  assert.equal(depth.count, pos.count);
  assert.equal(obs.count, pos.count);
  assert.equal(flow.count, pos.count);

  // Every water vertex should sit at WATER_LEVEL
  for (let i = 0; i < pos.count; i += 97) {
    assert.ok(Math.abs(pos.getY(i) - WATER_LEVEL) < 1e-5);
  }

  // Verify positive depths exist in the pond/river
  let maxDepth = -Infinity;
  for (let i = 0; i < depth.count; i += 1) {
    const d = depth.getX(i);
    if (d > maxDepth) maxDepth = d;
  }
  assert.ok(maxDepth > 1.4, `Expected deep water depth > 1.4, got ${maxDepth}`);

  water.dispose();
  assert.equal(water.mesh.parent, null);
});

test('registerFoamObstacle updates aObstacleDist attribute around river rocks and stones', () => {
  const pond = getPondCenter();
  const water = createWater();

  water.registerFoamObstacle(pond.x, pond.z, 1.5);
  assert.equal(water.getObstacles().length, 1);

  water.update(0.016, 1.25);
  assert.equal(water.material.uniforms.uTime.value, 1.25);

  const pos = water.geometry.getAttribute('position');
  const obs = water.geometry.getAttribute('aObstacleDist');

  // Find vertex closest to the registered obstacle and verify distance <= 0.6
  let nearestObsVal = Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    const d = Math.hypot(pos.getX(i) - pond.x, pos.getZ(i) - pond.z);
    if (d < 1.5) {
      nearestObsVal = Math.min(nearestObsVal, obs.getX(i));
    }
  }
  assert.ok(
    nearestObsVal < 0.2,
    `Expected near-zero/negative obstacle distance inside foam obstacle, got ${nearestObsVal}`,
  );

  // Direct pure helper check
  const directDist = computeMinObstacleDistance(getRiverCenterX(6), 6, [
    { x: getRiverCenterX(6) + 3, z: 6, radius: 1.0 },
  ]);
  assert.ok(Math.abs(directDist - 2.0) < 1e-5);

  water.dispose();
});

test('setSunDirection and setMoodTint update shader uniforms cleanly', () => {
  const water = createWater();
  water.setSunDirection(new THREE.Vector3(10, 20, 30));
  const sun = water.material.uniforms.uSunDirection.value as THREE.Vector3;
  assert.ok(Math.abs(sun.length() - 1) < 1e-5);

  water.setMoodTint('#ff9966', '#443366', '#ffe49e');
  const base = water.material.uniforms.uBaseColor.value as THREE.Color;
  const expectedBase = new THREE.Color('#ff9966');
  assert.ok(Math.abs(base.r - expectedBase.r) < 1e-4);
  assert.ok(Math.abs(base.g - expectedBase.g) < 1e-4);

  // Confirm default turquoise constant matches Task 08 palette
  assert.equal(DEFAULT_WATER_COLORS.base, '#38b6ff');
  water.dispose();
});
