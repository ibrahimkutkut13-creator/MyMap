import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WATER_LEVEL, getBridgeAnchor, getTerrainHeight } from './terrain';
import {
  computeBridgeArchElevation,
  computeSteppingStoneSpecs,
  createStructures,
  getStructureColliders,
  getStructureWalkHeight,
} from './structures';

test('bridge parabolic arch peaks at center and meets bank height flush at both ends', () => {
  const anchor = getBridgeAnchor();
  const halfSpan = anchor.span * 0.5;

  const westY = computeBridgeArchElevation(-halfSpan, anchor);
  const centerY = computeBridgeArchElevation(0, anchor);
  const eastY = computeBridgeArchElevation(halfSpan, anchor);

  assert.ok(Math.abs(westY - anchor.bankHeight) < 1e-6);
  assert.ok(Math.abs(eastY - anchor.bankHeight) < 1e-6);
  assert.ok(Math.abs(centerY - (anchor.bankHeight + anchor.archHeight)) < 1e-6);
  assert.ok(centerY > WATER_LEVEL + 2.2, 'Bridge center should arch well above water');
});

test('getStructureWalkHeight returns accurate elevation across bridge deck and stepping stones', () => {
  const anchor = getBridgeAnchor();
  const stones = computeSteppingStoneSpecs();

  // Bridge center returns peak deck height
  const centerWalkY = getStructureWalkHeight(
    anchor.position.x,
    anchor.position.z,
    anchor,
    stones,
  );
  assert.ok(centerWalkY !== null);
  assert.ok(
    Math.abs(centerWalkY - (anchor.bankHeight + anchor.archHeight + 0.08)) < 0.02,
    `Unexpected bridge peak walk height: ${centerWalkY}`,
  );

  // Bridge bank ends return bankHeight + plank half-thickness
  const westWalkY = getStructureWalkHeight(
    anchor.westEnd.x,
    anchor.westEnd.z,
    anchor,
    stones,
  );
  const eastWalkY = getStructureWalkHeight(
    anchor.eastEnd.x,
    anchor.eastEnd.z,
    anchor,
    stones,
  );
  assert.ok(westWalkY !== null && Math.abs(westWalkY - (anchor.bankHeight + 0.08)) < 0.02);
  assert.ok(eastWalkY !== null && Math.abs(eastWalkY - (anchor.bankHeight + 0.08)) < 0.02);

  // Every stepping stone sits cleanly above WATER_LEVEL and returns its topY
  assert.ok(stones.length >= 5 && stones.length <= 7);
  for (const s of stones) {
    assert.ok(s.topY >= WATER_LEVEL + 0.11 && s.topY <= WATER_LEVEL + 0.22);
    const stoneWalkY = getStructureWalkHeight(s.x, s.z, anchor, stones);
    assert.equal(stoneWalkY, s.topY);
    // Riverbed under each stepping stone is below water
    assert.ok(getTerrainHeight(s.x, s.z) < WATER_LEVEL - 0.15);
  }

  // Far away in open meadow returns null
  assert.equal(getStructureWalkHeight(-60, 60, anchor, stones), null);
});

test('createStructures mounts bridge, stepping stones, markers, colliders, and foam obstacles', () => {
  const scene = new THREE.Scene();
  const foamObstacles: Array<{ x: number; z: number; radius: number }> = [];

  const structures = createStructures(scene, {
    water: {
      registerFoamObstacle: (x, z, radius) => {
        foamObstacles.push({ x, z, radius });
      },
    },
  });

  assert.equal(structures.group.parent, scene);
  assert.ok(structures.bridgeGroup.children.length > 40, 'Bridge should be richly multi-part');
  assert.equal(structures.steppingStonesGroup.children.length, structures.steppingStones.length);
  assert.ok(structures.markersGroup.children.length >= 6);

  // Stepping stones + mid-river bridge pilings all register foam obstacles
  assert.equal(foamObstacles.length, structures.waterObstacles.length);
  assert.ok(foamObstacles.length >= structures.steppingStones.length + 4);

  // Colliders include bridge posts, abutments, signposts, and mile markers
  assert.ok(structures.colliders.length >= 20);
  assert.equal(getStructureColliders().length, structures.colliders.length);

  structures.dispose();
  assert.equal(structures.group.parent, null);
  assert.equal(getStructureColliders().length, 0);
});
