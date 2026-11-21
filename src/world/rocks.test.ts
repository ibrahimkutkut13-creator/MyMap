import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  PATH_HALF_WIDTH,
  getBridgeAnchor,
  getPathDistance,
  getSpawnPosition,
  getTerrainHeight,
} from './terrain';
import {
  buildSculptedRockGeometry,
  createRocks,
  generateRockPlacements,
} from './rocks';

test('buildSculptedRockGeometry produces faceted geometry with watertight smooth normals and vertex colors', () => {
  const geo = buildSculptedRockGeometry({
    baseRadius: 1.0,
    detail: 1,
    seed: 1234,
    squashY: 0.8,
    stretchX: 1.1,
    stretchZ: 1.0,
    flatTopY: 0.55,
    flatBottomY: -0.5,
    facetPlanes: 7,
    baseColorHex: '#8493c9',
    undersideColorHex: '#6371a8',
    mossColorHex: '#6ccb5f',
    mossStrength: 0.6,
  });

  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const smooth = geo.getAttribute('aSmoothNormal');
  const col = geo.getAttribute('color');

  assert.ok(pos && pos.count > 60);
  assert.equal(norm.count, pos.count);
  assert.equal(smooth.count, pos.count);
  assert.equal(col.count, pos.count);

  // Smoothed normals must be unit-length for crack-free inverted-hull outlines
  for (let i = 0; i < smooth.count; i += 7) {
    const len = Math.hypot(smooth.getX(i), smooth.getY(i), smooth.getZ(i));
    assert.ok(Math.abs(len - 1) < 1e-3, `Smooth normal not normalized: ${len}`);
  }

  geo.dispose();
});

test('generateRockPlacements is deterministic, grounded, and never blocks footpaths or bridge', () => {
  const a = generateRockPlacements();
  const b = generateRockPlacements();
  assert.equal(a.length, b.length);
  assert.ok(a.length >= 45, `Expected rich valley rock scatter, got ${a.length}`);

  const bridge = getBridgeAnchor();
  const spawn = getSpawnPosition();

  for (let i = 0; i < a.length; i += 1) {
    const p = a[i];
    assert.equal(p.x, b[i].x);
    assert.equal(p.z, b[i].z);

    // Zero floating rocks: placement pivot must be sunk slightly below local terrain elevation
    const groundY = getTerrainHeight(p.x, p.z);
    assert.ok(
      p.y <= groundY - 0.18,
      `Rock ${i} (${p.kind}) not sunk into ground: y=${p.y}, ground=${groundY}`,
    );

    // Must never block footpaths, bridge approaches, or spawn clearing
    assert.ok(
      getPathDistance(p.x, p.z) >= PATH_HALF_WIDTH + 0.9,
      `Rock ${i} too close to path centerline`,
    );
    assert.ok(
      Math.hypot(p.x - bridge.position.x, p.z - bridge.position.z) >= 9.5,
      `Rock ${i} obstructs bridge area`,
    );
    assert.ok(
      Math.hypot(p.x - spawn.x, p.z - spawn.z) >= 6.5,
      `Rock ${i} obstructs spawn clearing`,
    );
  }
});

test('createRocks creates instanced meshes with paired outlines and registers riverbank foam obstacles', () => {
  const registered: Array<{ x: number; z: number; radius: number }> = [];
  const scene = new THREE.Scene();

  const rocks = createRocks(scene, {
    water: {
      registerFoamObstacle: (x, z, radius) => {
        registered.push({ x, z, radius });
      },
    },
  });

  assert.equal(rocks.group.parent, scene);
  assert.equal(rocks.colliders.length, rocks.placements.length);
  assert.ok(
    registered.length >= 6,
    `Expected riverbank boulders to register foam obstacles, got ${registered.length}`,
  );
  assert.equal(registered.length, rocks.riverObstacles.length);

  // Verify every body InstancedMesh has shadow casting & paired outline sibling
  const bodyMeshes = rocks.group.children.filter(
    (c): c is THREE.InstancedMesh =>
      c instanceof THREE.InstancedMesh && !c.userData.isInkOutline,
  );
  const outlineMeshes = rocks.group.children.filter(
    (c): c is THREE.InstancedMesh =>
      c instanceof THREE.InstancedMesh && c.userData.isInkOutline === true,
  );
  assert.ok(bodyMeshes.length >= 3);
  assert.equal(bodyMeshes.length, outlineMeshes.length);
  for (const bm of bodyMeshes) {
    assert.equal(bm.castShadow, true);
    assert.equal(bm.receiveShadow, true);
  }
  for (const om of outlineMeshes) {
    assert.equal(om.castShadow, false);
    assert.equal(om.receiveShadow, false);
  }

  rocks.dispose();
  assert.equal(rocks.group.parent, null);
});
