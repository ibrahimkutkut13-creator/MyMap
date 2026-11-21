import {
  formatDayClock,
  getDayPhaseLabel,
  type DayNightPresetId,
} from '../world/dayNightCycle';
import { GLADE_BIOME_META, type GladeBiomeId } from '../world/gladeBiomes';
import type { GladeViewPresetId } from '../world/gladeLevel';
import {
  GLADE_WEATHER_ORDER,
  GLADE_WEATHER_PRESETS,
  type GladeWeatherId,
} from '../world/gladeWeather';

export type WorldLevelId = 'valley' | 'glade';

interface ViewpointItem {
  readonly id: GladeViewPresetId;
  readonly label: string;
}

const GLADE_VIEWPOINTS: readonly ViewpointItem[] = [
  { id: 'crimson-trail', label: 'Crimson Trail' },
  { id: 'sakura-sanctuary', label: 'Sakura Lake' },
  { id: 'golden-meadow', label: 'Golden Hills' },
  { id: 'pine-highlands', label: 'Pine Ruins' },
  { id: 'emerald-lake', label: 'Emerald Pier' },
  { id: 'sky-observatory', label: 'Observatory' },
  { id: 'bell-tower', label: 'Bell Tower' },
  { id: 'cloudcrest-beacon', label: 'Beacon' },
  { id: 'overview', label: 'Overview' },
];

const TIME_PRESETS: ReadonlyArray<{ readonly id: DayNightPresetId; readonly label: string }> = [
  { id: 'dawn', label: 'Dawn' },
  { id: 'day', label: 'Day' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'night', label: 'Night' },
];

export interface GladeHudProps {
  readonly activeLevel: WorldLevelId;
  readonly activeBiome: GladeBiomeId;
  readonly activeView: GladeViewPresetId | null;
  readonly activeWeather: GladeWeatherId;
  readonly dayTimeHours: number;
  readonly cyclePaused: boolean;
  readonly controlsCollapsed: boolean;
  readonly onSelectView: (viewId: GladeViewPresetId) => void;
  readonly onSelectWeather: (weatherId: GladeWeatherId) => void;
  readonly onSelectTimePreset: (presetId: DayNightPresetId) => void;
  readonly onScrubTime: (hours: number) => void;
  readonly onToggleCyclePaused: () => void;
  readonly onToggleControls: () => void;
  readonly onToggleLevel: () => void;
}

export function GladeHud({
  activeLevel,
  activeBiome,
  activeView,
  activeWeather,
  dayTimeHours,
  cyclePaused,
  controlsCollapsed,
  onSelectView,
  onSelectWeather,
  onSelectTimePreset,
  onScrubTime,
  onToggleCyclePaused,
  onToggleControls,
  onToggleLevel,
}: GladeHudProps) {
  const biomeMeta = GLADE_BIOME_META[activeBiome];
  const weatherMeta = GLADE_WEATHER_PRESETS[activeWeather];
  const clockLabel = formatDayClock(dayTimeHours);
  const phaseLabel = getDayPhaseLabel(dayTimeHours);

  const activeTimePreset: DayNightPresetId | null =
    phaseLabel === 'Dawn'
      ? 'dawn'
      : phaseLabel === 'Morning' || phaseLabel === 'Day' || phaseLabel === 'Afternoon'
        ? 'day'
        : phaseLabel === 'Sunset' || phaseLabel === 'Twilight'
          ? 'sunset'
          : 'night';

  if (activeLevel === 'valley') {
    return (
      <>
        <header className="pointer-events-none fixed top-5 left-6 z-10 max-w-xs">
          <h1 className="text-lg font-semibold tracking-tight text-white [text-shadow:0_2px_10px_rgba(12,20,34,0.72)]">
            Azure Vale
          </h1>
          <p className="mt-0.5 text-xs font-medium text-white/90 [text-shadow:0_1px_6px_rgba(12,20,34,0.78)]">
            Stone arch bridge &amp; sunlit river basin
          </p>
        </header>

        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-10 flex justify-center px-4">
          <button
            type="button"
            data-testid="switch-level-button"
            onClick={onToggleLevel}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#151b26]/90 px-4 py-2 text-sm font-medium tracking-wide text-[#f7f4ec] shadow-lg transition-colors duration-150 hover:bg-[#212b3d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5d07a] cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Go to Autumn Glade</span>
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <header
        data-testid="biome-readout"
        className="pointer-events-none fixed top-5 left-6 z-10 max-w-sm"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffe8b8] [text-shadow:0_1px_6px_rgba(10,16,28,0.82)]">
          Autumn Glade · {weatherMeta.label} · {clockLabel} {phaseLabel}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-white [text-shadow:0_2px_12px_rgba(10,16,28,0.78)]">
          {biomeMeta.name}
        </h1>
        <p className="mt-0.5 text-xs font-medium text-white/90 [text-shadow:0_1px_8px_rgba(10,16,28,0.82)]">
          {biomeMeta.subtitle}
        </p>
      </header>

      <div className="pointer-events-none fixed top-5 right-6 z-10 flex items-center gap-2">
        <button
          type="button"
          data-testid="toggle-controls-button"
          onClick={onToggleControls}
          aria-expanded={!controlsCollapsed}
          className="pointer-events-auto rounded-md border border-white/15 bg-[#151b26]/86 px-3 py-1.5 text-xs font-medium text-[#f5f2ea] shadow-md transition-colors duration-150 hover:bg-[#232d40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5d07a] cursor-pointer whitespace-nowrap shrink-0"
        >
          {controlsCollapsed ? 'Show Controls' : 'Hide Controls'}
        </button>
        <button
          type="button"
          data-testid="switch-level-button"
          onClick={onToggleLevel}
          className="pointer-events-auto rounded-md border border-white/15 bg-[#151b26]/86 px-3 py-1.5 text-xs font-medium text-[#f8d78b] shadow-md transition-colors duration-150 hover:bg-[#232d40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5d07a] cursor-pointer whitespace-nowrap shrink-0"
        >
          Azure Vale
        </button>
      </div>

      {!controlsCollapsed && (
        <nav
          aria-label="World viewpoints, weather, and day night controls"
          data-testid="glade-controls-dock"
          className="pointer-events-none fixed inset-x-0 bottom-5 z-10 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex max-w-full flex-col gap-2 rounded-xl border border-white/14 bg-[#141a24]/90 px-3.5 py-2.5 shadow-xl">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                Places
              </span>
              {GLADE_VIEWPOINTS.map((vp) => {
                const isActive = activeView === vp.id;
                return (
                  <button
                    key={vp.id}
                    type="button"
                    data-testid={`view-btn-${vp.id}`}
                    aria-pressed={isActive}
                    onClick={() => onSelectView(vp.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5d07a] cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[#e887a7] text-[#17121b] shadow-sm'
                        : 'bg-white/8 text-[#f2f0ea] hover:bg-white/16'
                    }`}
                  >
                    {vp.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-white/10 pt-2">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                Weather
              </span>
              {GLADE_WEATHER_ORDER.map((weatherId) => {
                const preset = GLADE_WEATHER_PRESETS[weatherId];
                const isActive = activeWeather === weatherId;
                return (
                  <button
                    key={weatherId}
                    type="button"
                    data-testid={`weather-btn-${weatherId}`}
                    aria-pressed={isActive}
                    onClick={() => onSelectWeather(weatherId)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5d07a] cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[#f4c96b] text-[#1a1610] shadow-sm'
                        : 'bg-white/8 text-[#f2f0ea] hover:bg-white/16'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                Time
              </span>
              <span
                data-testid="time-clock-readout"
                className="min-w-[82px] text-center font-mono text-xs font-semibold text-[#ffe8b8]"
              >
                {clockLabel} · {phaseLabel}
              </span>
              <button
                type="button"
                data-testid="toggle-cycle-button"
                aria-pressed={!cyclePaused}
                onClick={onToggleCyclePaused}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5d07a] cursor-pointer whitespace-nowrap shrink-0 ${
                  !cyclePaused
                    ? 'bg-[#7dc7f5] text-[#101c2b] shadow-sm'
                    : 'bg-white/10 text-[#f2f0ea] hover:bg-white/18'
                }`}
              >
                {cyclePaused ? 'Resume Cycle' : 'Pause Cycle'}
              </button>
              <div className="flex items-center gap-1">
                {TIME_PRESETS.map((preset) => {
                  const isActive = activeTimePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`time-btn-${preset.id}`}
                      aria-pressed={isActive}
                      onClick={() => onSelectTimePreset(preset.id)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5d07a] cursor-pointer whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-[#f4c96b] text-[#1a1610] shadow-sm'
                          : 'bg-white/8 text-[#f2f0ea] hover:bg-white/16'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="range"
                aria-label="Time of day"
                data-testid="time-slider"
                min={0}
                max={23.95}
                step={0.05}
                value={dayTimeHours}
                onChange={(e) => onScrubTime(Number(e.target.value))}
                className="h-1.5 w-28 sm:w-36 cursor-pointer accent-[#f4c96b]"
              />
              <span className="ml-1 hidden text-[11px] text-white/50 xl:inline">
                Drag to orbit · Scroll to zoom · WASD to glide · H to hide
              </span>
            </div>
          </div>
        </nav>
      )}
    </>
  );
}
