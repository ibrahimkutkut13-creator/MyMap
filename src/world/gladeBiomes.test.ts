import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GLADE_BIOME_META,
  GLADE_HALF_SIZE,
  GLADE_LAKES,
  GLADE_SIZE,
  GLADE_WATER_LEVEL,
  evaluateGladeWaterCarve,
  getDominantGladeBiome,
  getEastBrookCenterX,
  getEmeraldBranchX,
  getGladeBiomeWeights,
  getGladeGroundHeight,
  getGladeLandmarkAnchors,
  getGladeLandmarkById,
  getGladeRiverCenterX,
  getGladeStreamCenterZ,
  getGladeTrailCenterX,
  getGladeTrailDistance,
  getGladeWaterFlowDir,
  getGoldenBranchZ,
  getSakuraBranchZ,
  getWestValleyStreamCenterX,
  isPointInGladeWater,
} from './gladeBiomes';

test('Expanded Autumn Glade geography covers 1920x1920 with 5 distinct dominant biomes and rolling hills', () => {
  assert.equal(GLADE_SIZE, 1920);
  assert.equal(GLADE_HALF_SIZE, 960);
  assert.equal(Object.keys(GLADE_BIOME_META).length, 5);

  // Sample heart of each biome across the spacious 960x960 world and verify dominant classification + normalized weights
  const probes: ReadonlyArray<{ x: number; z: number; expected: string }> = [
    { x: getGladeTrailCenterX(20), z: 20, expected: 'crimson-trail' },
    { x: -245, z: 52, expected: 'sakura-sanctuary' },
    { x: 248, z: -72, expected: 'golden-meadow' },
    { x: -12, z: -268, expected: 'pine-highlands' },
    { x: getGladeRiverCenterX(100), z: 100, expected: 'riverlands' },
  ];

  for (const probe of probes) {
    const weights = getGladeBiomeWeights(probe.x, probe.z);
    const sum =
      weights.crimsonTrail +
      weights.sakuraSanctuary +
      weights.riverlands +
      weights.goldenMeadow +
      weights.pineHighlands;
    assert.ok(Math.abs(sum - 1) < 1e-4, `Biome weights should sum to 1, got ${sum}`);
    assert.equal(
      getDominantGladeBiome(probe.x, probe.z),
      probe.expected,
      `Expected ${probe.expected} at (${probe.x}, ${probe.z})`,
    );
  }
});

test('Winding river, 3 streams, and all 5 lakes carve cleanly below water level while islands rise dry', () => {
  // Check river centerline at multiple latitudes along the 1920x1920 river course
  for (const z of [-200, -100, 0, 100, 200]) {
    const rx = getGladeRiverCenterX(z);
    const h = getGladeGroundHeight(rx, z);
    assert.ok(
      h < GLADE_WATER_LEVEL - 0.5,
      `River centerline at (${rx.toFixed(1)}, ${z}) should lie below water (${GLADE_WATER_LEVEL}), got ${h.toFixed(2)}`,
    );
    assert.equal(isPointInGladeWater(rx, z), true);

    const [fx, fz] = getGladeWaterFlowDir(rx, z);
    const mag = Math.hypot(fx, fz);
    assert.ok(mag >= 0.15 && mag <= 1.05, `Water flow vector magnitude should be reasonable, got ${mag}`);
  }

  // Check all 5 lakes
  assert.equal(GLADE_LAKES.length, 5);
  for (const lake of GLADE_LAKES) {
    // Check an open water ring point around each lake (avoiding island centers)
    const sampleX = lake.x + lake.radiusX * 0.65;
    const sampleZ = lake.z;
    const h = getGladeGroundHeight(sampleX, sampleZ);
    assert.ok(
      h < GLADE_WATER_LEVEL - 0.4,
      `Lake ${lake.id} basin should sit below water level, got ${h.toFixed(2)}`,
    );
    assert.equal(isPointInGladeWater(sampleX, sampleZ), true);
  }

  // Sakura Mirror Lake and Twilight Basin islands must rise dry above water level
  const sakuraLake = GLADE_LAKES[0];
  const islandH = getGladeGroundHeight(sakuraLake.x, sakuraLake.z);
  assert.ok(
    islandH > GLADE_WATER_LEVEL + 1.2,
    `Sakura island center should rise well above water, got ${islandH.toFixed(2)}`,
  );
  assert.equal(isPointInGladeWater(sakuraLake.x, sakuraLake.z), false);

  const twilightBasin = GLADE_LAKES.find((l) => l.id === 'twilight-basin');
  assert.ok(twilightBasin, 'twilight-basin lake should exist');
  assert.equal(isPointInGladeWater(twilightBasin.x, twilightBasin.z), false);

  const carve = evaluateGladeWaterCarve(sakuraLake.x + 32, sakuraLake.z);
  assert.ok(carve.carveDepth > 0.5, 'Water carve depth should be positive inside lake');
  assert.equal(carve.isLake, true);

  // Sakura Tributary Stream must connect continuously from Mirror Blossom Lake to main river confluence
  const confluenceX = getGladeRiverCenterX(11);
  for (let x = -205; x <= confluenceX; x += 15) {
    const sz = getGladeStreamCenterZ(x);
    assert.equal(
      isPointInGladeWater(x, sz),
      true,
      `Sakura Tributary Stream should stay continuous water at (${x.toFixed(1)}, ${sz.toFixed(1)})`,
    );
  }

  // Eastern Brook & Southwestern Valley Stream carve continuous water channels
  for (const z of [-40, 20, 90, 140]) {
    const ex = getEastBrookCenterX(z);
    assert.equal(
      isPointInGladeWater(ex, z),
      true,
      `Eastern Brook should stay water at (${ex.toFixed(1)}, ${z})`,
    );
  }
  for (const z of [420, 520, 620, 700]) {
    const wx = getWestValleyStreamCenterX(z);
    assert.equal(
      isPointInGladeWater(wx, z),
      true,
      `Southwestern Valley Stream should stay water at (${wx.toFixed(1)}, ${z})`,
    );
  }
});

test('Four-branch footpath network and all 8 landmark anchors are finite, logically separated, and accessible', () => {
  // Verify trail distance vanishes along every path branch
  assert.ok(getGladeTrailDistance(getGladeTrailCenterX(0), 0) < 0.05);
  assert.ok(getGladeTrailDistance(-115, getSakuraBranchZ(-115)) < 0.05);
  assert.ok(getGladeTrailDistance(140, getGoldenBranchZ(140)) < 0.05);
  assert.ok(getGladeTrailDistance(getEmeraldBranchX(50), 50) < 0.05);

  const landmarks = getGladeLandmarkAnchors();
  assert.equal(landmarks.length, 13);

  const requiredIds = [
    'archway',
    'river-bridge',
    'sakura-bridge',
    'torii-gate',
    'sakura-pavilion',
    'windmill',
    'moonstone-ruins',
    'emerald-pier',
    'sky-observatory',
    'sunset-bell-tower',
    'solstice-sanctuary',
    'cloudcrest-beacon',
    'south-overlook',
  ] as const;

  for (const id of requiredIds) {
    const lm = getGladeLandmarkById(id);
    assert.ok(Number.isFinite(lm.x) && Number.isFinite(lm.y) && Number.isFinite(lm.z));
    assert.ok(lm.clearRadius >= 6, `Landmark ${id} must define clearRadius`);
  }

  // Distinct biome destination landmarks must be spaciously separated (>= 140m apart)
  const regionalDestinations = [
    getGladeLandmarkById('archway'),
    getGladeLandmarkById('sakura-pavilion'),
    getGladeLandmarkById('windmill'),
    getGladeLandmarkById('moonstone-ruins'),
    getGladeLandmarkById('emerald-pier'),
    getGladeLandmarkById('sky-observatory'),
    getGladeLandmarkById('sunset-bell-tower'),
    getGladeLandmarkById('solstice-sanctuary'),
    getGladeLandmarkById('cloudcrest-beacon'),
    getGladeLandmarkById('south-overlook'),
  ];
  for (let i = 0; i < regionalDestinations.length; i++) {
    for (let j = i + 1; j < regionalDestinations.length; j++) {
      const a = regionalDestinations[i];
      const b = regionalDestinations[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(
        dist >= 140,
        `Regional landmarks ${a.id} and ${b.id} should be widely separated (>=140m), got ${dist.toFixed(1)}m`,
      );
    }
  }

  // Elevated highland landmarks sit well above valley water level
  assert.ok(getGladeLandmarkById('windmill').y > 12.0);
  assert.ok(getGladeLandmarkById('moonstone-ruins').y > 18.0);
  assert.ok(getGladeLandmarkById('sky-observatory').y > 30.0);
  assert.ok(getGladeLandmarkById('cloudcrest-beacon').y > 32.0);

  // Rolling hills ("ups and downs") provide substantial multi-peak vertical relief across the 1920x1920 interior
  let minDryH = Infinity;
  let maxDryH = -Infinity;
  for (let x = -650; x <= 650; x += 65) {
    for (let z = -650; z <= 650; z += 65) {
      const h = getGladeGroundHeight(x, z);
      if (h > GLADE_WATER_LEVEL + 0.5) {
        minDryH = Math.min(minDryH, h);
        maxDryH = Math.max(maxDryH, h);
      }
    }
  }
  assert.ok(
    maxDryH - minDryH >= 32,
    `Expected rich rolling hill relief (>=32m), got ${(maxDryH - minDryH).toFixed(1)}m`,
  );
});
