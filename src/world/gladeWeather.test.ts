import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GLADE_WEATHER_ORDER,
  GLADE_WEATHER_PRESETS,
  createWeatherRuntimeState,
  getGladeWeatherPreset,
  stepWeatherRuntimeState,
} from './gladeWeather';

test('All 5 Autumn Glade weather presets are defined with valid ranges and distinct moods', () => {
  assert.equal(GLADE_WEATHER_ORDER.length, 5);

  for (const id of GLADE_WEATHER_ORDER) {
    const preset = getGladeWeatherPreset(id);
    assert.equal(preset.id, id);
    assert.ok(preset.label.length > 0);
    assert.ok(preset.exposure > 0.7 && preset.exposure < 1.5);
    assert.ok(preset.windMultiplier > 0.3 && preset.windMultiplier < 3.0);
    assert.ok(preset.atmosphere.fogDensity > 0.0004 && preset.atmosphere.fogDensity < 0.01);
    assert.ok(preset.cloudOpacity >= 0.4 && preset.cloudOpacity <= 1.0);
  }

  // Rain has active falling streaks; sunny does not
  assert.equal(GLADE_WEATHER_PRESETS.sunny.rainOpacity, 0);
  assert.ok(GLADE_WEATHER_PRESETS.rain.rainOpacity >= 0.45);
  assert.ok(GLADE_WEATHER_PRESETS['sakura-breeze'].petalIntensity > GLADE_WEATHER_PRESETS.sunny.petalIntensity);
  assert.ok(GLADE_WEATHER_PRESETS['golden-sunset'].lanternGlow > GLADE_WEATHER_PRESETS.sunny.lanternGlow);
  assert.ok(GLADE_WEATHER_PRESETS.mist.atmosphere.fogDensity > GLADE_WEATHER_PRESETS.sunny.atmosphere.fogDensity);
});

test('Weather runtime state smoothly damps toward target preset and snaps on immediate=true', () => {
  const state = createWeatherRuntimeState('sunny');
  assert.equal(state.rainOpacity, 0);
  assert.equal(state.windMultiplier, GLADE_WEATHER_PRESETS.sunny.windMultiplier);

  // Switch to rain and step gradually
  state.targetWeather = 'rain';
  for (let i = 0; i < 60; i += 1) {
    stepWeatherRuntimeState(state, 0.05, false);
  }
  assert.ok(
    Math.abs(state.rainOpacity - GLADE_WEATHER_PRESETS.rain.rainOpacity) < 0.03,
    `Expected rainOpacity to converge near ${GLADE_WEATHER_PRESETS.rain.rainOpacity}, got ${state.rainOpacity}`,
  );
  assert.ok(
    Math.abs(state.windMultiplier - GLADE_WEATHER_PRESETS.rain.windMultiplier) < 0.06,
    'Wind multiplier should converge toward rain preset',
  );

  // Immediate snap to golden-sunset
  state.targetWeather = 'golden-sunset';
  stepWeatherRuntimeState(state, 0.016, true);
  assert.equal(state.exposure, GLADE_WEATHER_PRESETS['golden-sunset'].exposure);
  assert.equal(state.rainOpacity, 0);
  assert.equal(state.lanternGlow, GLADE_WEATHER_PRESETS['golden-sunset'].lanternGlow);
});
