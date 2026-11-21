import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAY_NIGHT_PRESET_HOURS,
  DEFAULT_DAY_TIME_HOURS,
  computeCelestialVectors,
  evaluateDayNightSample,
  formatDayClock,
  getDayPhaseLabel,
  normalizeDayHours,
} from './dayNightCycle';
import { getGladeWeatherPreset } from './gladeWeather';

test('Day/night clock normalization, formatting, and phase labels wrap cleanly across 24h', () => {
  assert.equal(normalizeDayHours(25.5), 1.5);
  assert.equal(normalizeDayHours(-2.0), 22.0);
  assert.equal(formatDayClock(0), '00:00');
  assert.equal(formatDayClock(11.25), '11:15');
  assert.equal(formatDayClock(18.5), '18:30');

  assert.equal(getDayPhaseLabel(DAY_NIGHT_PRESET_HOURS.dawn), 'Dawn');
  assert.equal(getDayPhaseLabel(DAY_NIGHT_PRESET_HOURS.day), 'Day');
  assert.equal(getDayPhaseLabel(DAY_NIGHT_PRESET_HOURS.sunset), 'Sunset');
  assert.equal(getDayPhaseLabel(DAY_NIGHT_PRESET_HOURS.night), 'Night');
});

test('Day/night celestial arc illuminates daytime with sun and nighttime with moon, stars, and glowing lanterns', () => {
  const sunny = getGladeWeatherPreset('sunny');
  const day = evaluateDayNightSample(DEFAULT_DAY_TIME_HOURS, sunny, 'sunny');
  const sunset = evaluateDayNightSample(DAY_NIGHT_PRESET_HOURS.sunset, sunny, 'sunny');
  const night = evaluateDayNightSample(DAY_NIGHT_PRESET_HOURS.night, sunny, 'sunny');

  assert.equal(day.isNight, false);
  assert.equal(day.atmosphere.starIntensity, 0);
  assert.equal(day.moonIntensity, 0);
  assert.ok(day.atmosphere.sunIntensity > 1.7);

  assert.equal(night.isNight, true);
  assert.ok(night.atmosphere.starIntensity > 0.9, 'Stars should shine brightly at night');
  assert.ok(night.moonIntensity > 0.9, 'Moon should be visible at night');
  assert.ok(night.lanternGlow > day.lanternGlow * 2.0, 'Lanterns should glow warmly at night');
  assert.ok(night.atmosphere.sunIntensity < 0.9 && night.atmosphere.sunIntensity >= 0.65);

  // Sunset sits warmly between day and night
  assert.ok(sunset.lanternGlow > day.lanternGlow);
  assert.ok(sunset.atmosphere.sunIntensity > night.atmosphere.sunIntensity);

  // Celestial vectors remain finite and normalized across all 24 hours
  for (let h = 0; h < 24; h += 0.75) {
    const c = computeCelestialVectors(h);
    assert.ok(c.sunPos.every(Number.isFinite));
    assert.ok(c.lightPos.every(Number.isFinite));
    const mLen = Math.hypot(c.moonDir[0], c.moonDir[1], c.moonDir[2]);
    assert.ok(Math.abs(mLen - 1) < 1e-4, `Moon direction must be unit length, got ${mLen}`);
  }
});
