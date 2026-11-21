/**
 * The overlay panels: pause menu, settings, inventory, journal and map.
 *
 * All five are the same primitive (`Panel` below) so a keyboard user gets the same
 * focus behaviour everywhere: focus moves into the panel on open, Escape closes it,
 * and focus returns to whatever opened it. That is not decoration — an overlay that
 * traps a screen-reader user in an unreachable surface is a bug this repository has
 * already fixed once elsewhere.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { GameCopy } from './copy';
import type { QualityPreset } from '../state/marsGameStore';
import type { StoreSnapshot } from '../state/marsGameStore';
import { Glass } from '../../ui/Glass';
import { Button } from '../../ui/primitives';
import { MINERALS, CATALOGUE_ATTRIBUTION } from '../science/catalogue';
import { STATIONS } from '../state/marsGameStore';
import { missionProgress } from '../science/missions';

/* ------------------------------------------------------------------ shell */

export function Panel({
  title,
  onClose,
  closeLabel,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    first?.focus();
    return () => previouslyFocused.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-void/70 p-3 sm:p-6">
      <Glass
        tone="strong"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[88dvh] w-full overflow-y-auto p-4 sm:p-6 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        ref={ref as unknown as React.Ref<HTMLElement>}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold tracking-tight text-ink sm:text-lg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-strong text-ink-2 transition-colors hover:border-atmo/50 hover:text-ink"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </Glass>
    </div>
  );
}

/* -------------------------------------------------------------- pause menu */

export function PauseMenu({
  copy,
  onResume,
  onSettings,
  onInventory,
  onJournal,
  onMap,
  onRestart,
  onExit,
  saved,
}: {
  copy: GameCopy;
  onResume: () => void;
  onSettings: () => void;
  onInventory: () => void;
  onJournal: () => void;
  onMap: () => void;
  onRestart: () => void;
  onExit: () => void;
  saved: string | null;
}) {
  return (
    <Panel title={copy.paused} onClose={onResume} closeLabel={copy.resume}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="primary" onClick={onResume} className="sm:col-span-2">
          {copy.resume}
        </Button>
        <Button variant="secondary" onClick={onSettings}>{copy.settings}</Button>
        <Button variant="secondary" onClick={onInventory}>{copy.inventory}</Button>
        <Button variant="secondary" onClick={onJournal}>{copy.journal}</Button>
        <Button variant="secondary" onClick={onMap}>{copy.map}</Button>
      </div>

      {saved && <p className="mt-3 font-mono text-[10px] text-signal">{saved}</p>}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line/60 pt-3">
        <Button variant="quiet" size="sm" onClick={onRestart}>{copy.restart}</Button>
        <Button variant="quiet" size="sm" onClick={onExit}>{copy.exit}</Button>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- settings */

export function SettingsPanel({
  copy,
  quality,
  cameraMode,
  sensitivity,
  onQuality,
  onCamera,
  onSensitivity,
  onSaveNow,
  onClearSave,
  persistenceAvailable,
  onClose,
}: {
  copy: GameCopy;
  quality: QualityPreset;
  cameraMode: 'third' | 'first';
  sensitivity: number;
  onQuality: (preset: QualityPreset) => void;
  onCamera: (mode: 'third' | 'first') => void;
  onSensitivity: (value: number) => void;
  onSaveNow: () => void;
  onClearSave: () => void;
  persistenceAvailable: boolean;
  onClose: () => void;
}) {
  const presets: Array<{ id: QualityPreset; label: string }> = [
    { id: 'high', label: copy.qualityHigh },
    { id: 'balanced', label: copy.qualityBalanced },
    { id: 'low', label: copy.qualityLow },
  ];

  return (
    <Panel title={copy.settingsTitle} onClose={onClose} closeLabel={copy.resume}>
      <fieldset className="border-0 p-0">
        <legend className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{copy.quality}</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={copy.quality}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={quality === preset.id}
              onClick={() => onQuality(preset.id)}
              className={`rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
                quality === preset.id ? 'border-atmo/60 bg-atmo/15 text-ink' : 'border-line text-ink-2 hover:text-ink'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 border-0 p-0">
        <legend className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{copy.camera}</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={copy.camera}>
          {(['third', 'first'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={cameraMode === mode}
              onClick={() => onCamera(mode)}
              className={`rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
                cameraMode === mode ? 'border-atmo/60 bg-atmo/15 text-ink' : 'border-line text-ink-2 hover:text-ink'
              }`}
            >
              {mode === 'third' ? copy.cameraThird : copy.cameraFirst}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{copy.sensitivity}</span>
        <input
          type="range"
          min="0.3"
          max="2"
          step="0.1"
          value={sensitivity}
          onChange={(event) => onSensitivity(Number(event.target.value))}
          className="mt-2 w-full"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line/60 pt-3">
        <Button variant="secondary" size="sm" onClick={onSaveNow}>{copy.saveNow}</Button>
        <Button variant="quiet" size="sm" onClick={onClearSave}>{copy.clearSave}</Button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        {persistenceAvailable ? copy.saved : copy.saveUnavailable}
      </p>
    </Panel>
  );
}

/* --------------------------------------------------------------- inventory */

export function InventoryPanel({ copy, snapshot, onClose }: { copy: GameCopy; snapshot: StoreSnapshot; onClose: () => void }) {
  return (
    <Panel title={copy.inventoryTitle} onClose={onClose} closeLabel={copy.resume} wide>
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{copy.progressLabel}</span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3/80">
          <div className="h-full rounded-full bg-signal" style={{ width: `${Math.max(2, snapshot.researchProgress * 100)}%` }} />
        </div>
        <span className="font-mono text-[11px] tabular-nums text-ink">{Math.round(snapshot.researchProgress * 100)}%</span>
      </div>

      {snapshot.samples.length === 0 ? (
        <p className="text-[12.5px] text-ink-2">{copy.inventoryEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {snapshot.samples.map((sample) => {
            const mineral = MINERALS[sample.kind as keyof typeof MINERALS];
            return (
              <li key={sample.sourceId} className="surface-inset flex items-start gap-3 p-3">
                <span
                  className="mt-0.5 h-6 w-6 shrink-0 rounded-md border border-line/60"
                  style={{ background: mineral?.accent ?? '#8f7a63' }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-ink">{mineral?.name ?? sample.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-2">{mineral?.summary}</p>
                  <p className="mt-1 font-mono text-[10px] text-ink-4">
                    {Math.round(sample.confidence * 100)}% {copy.confidence} · {copy.collectedAt} {sample.collectedAt.slice(0, 16).replace('T', ' ')}Z
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 border-t border-line/60 pt-3 text-[10.5px] leading-relaxed text-ink-3">{CATALOGUE_ATTRIBUTION}</p>
    </Panel>
  );
}

/* ----------------------------------------------------------------- journal */

export function JournalPanel({ copy, snapshot, onClose }: { copy: GameCopy; snapshot: StoreSnapshot; onClose: () => void }) {
  return (
    <Panel title={copy.journalTitle} onClose={onClose} closeLabel={copy.resume} wide>
      <MissionList copy={copy} snapshot={snapshot} />
      {snapshot.journal.length === 0 ? (
        <p className="text-[12.5px] text-ink-2">{copy.journalEmpty}</p>
      ) : (
        <ol className="space-y-2.5">
          {snapshot.journal.map((entry) => (
            <li key={entry.id} className="surface-inset p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[12.5px] font-medium text-ink">{entry.title}</p>
                <span className="shrink-0 font-mono text-[10px] text-ink-4">{entry.at.slice(0, 16).replace('T', ' ')}Z</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">{entry.body}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Mission milestones are derived from persisted samples and checkpoint flags. */
export function MissionList({ copy, snapshot }: { copy: GameCopy; snapshot: StoreSnapshot }) {
  const progress = missionProgress(snapshot.samples, snapshot.missionFlags);
  const missions = [
    { text: copy.missionGeology, fact: copy.missionGeologyFact, current: progress.geology, total: 3 },
    { text: copy.missionCrater, fact: copy.missionCraterFact, current: progress.crater, total: 1 },
    { text: copy.missionTraverse, fact: copy.missionTraverseFact, current: progress.traverse, total: 2 },
  ];
  return (
    <section className="mb-5" aria-label={copy.missionsTitle}>
      <h3 className="mb-2 text-sm font-semibold text-ink">{copy.missionsTitle}</h3>
      <ul className="space-y-2">
        {missions.map((mission) => (
          <li key={mission.text} className="surface-inset p-3 text-[12px] text-ink-2">
            <p>{mission.text}</p>
            <p className="mt-1 text-ink-3">{mission.fact}</p>
            <p className="mt-1 font-mono text-signal">{mission.current}/{mission.total} {mission.current === mission.total ? copy.missionComplete : ''}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-3">{copy.missionNote}</p>
      <a className="text-[11px] text-atmo underline" href="https://science.nasa.gov/mars/" target="_blank" rel="noreferrer">{copy.missionSource}</a>
    </section>
  );
}

/* --------------------------------------------------------------------- map */

/**
 * The surface map.
 *
 * Not an image: a top-down canvas drawn from the same `terrainHeight` the world
 * uses, so the map is the terrain. The player, rover, base and every sample are
 * plotted in world metres against a 420 m window.
 */
export function MapPanel({
  copy,
  snapshot,
  rover,
  onClose,
}: {
  copy: GameCopy;
  snapshot: StoreSnapshot;
  rover: { x: number; z: number };
  onClose: () => void;
}) {
  const window_ = 420;
  const half = window_ / 2;
  const originX = snapshot.position.x;
  const originZ = snapshot.position.z;

  const toScreen = (x: number, z: number): { left: string; top: string; visible: boolean } => {
    const left = ((x - originX + half) / window_) * 100;
    const top = ((z - originZ + half) / window_) * 100;
    return { left: `${left}%`, top: `${top}%`, visible: left >= 0 && left <= 100 && top >= 0 && top <= 100 };
  };

  return (
    <Panel title={copy.mapTitle} onClose={onClose} closeLabel={copy.resume} wide>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line/70 bg-abyss">
        {/* Grid: 40 m spacing, so distance is readable at a glance. */}
        <div
          className="absolute inset-0 opacity-30"
          aria-hidden="true"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--color-line) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)',
            backgroundSize: '9.52% 9.52%',
          }}
        />

        {STATIONS.map((station) => {
          const spot = toScreen(station.x, station.z);
          if (!spot.visible) return null;
          return (
            <span
              key={station.id}
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-caution"
              style={{ left: spot.left, top: spot.top }}
              title={station.label}
            />
          );
        })}

        {snapshot.discoveries.map((discovery) => {
          const spot = toScreen(discovery.x, discovery.z);
          if (!spot.visible) return null;
          return (
            <span
              key={discovery.id}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-signal"
              style={{ left: spot.left, top: spot.top }}
              title={discovery.label}
            />
          );
        })}

        {(() => {
          const spot = toScreen(rover.x, rover.z);
          if (!spot.visible) return null;
          return (
            <span
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-ink bg-surface-3"
              style={{ left: spot.left, top: spot.top }}
              title="Rover"
            />
          );
        })()}

        <span
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-atmo bg-ink"
          style={{ left: '50%', top: '50%' }}
          title="You"
        />
        {/* Facing indicator */}
        <span
          className="absolute left-1/2 top-1/2 h-6 w-px origin-bottom -translate-x-1/2 bg-atmo/70"
          style={{ transform: `translate(-50%, -100%) rotate(${snapshot.heading}rad)` }}
          aria-hidden="true"
        />

        <span className="absolute bottom-2 right-2 rounded border border-line/70 bg-surface/85 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-3">
          ±{half} {copy.mapRadius}
        </span>
      </div>

      <p className="mt-3 font-mono text-[10px] text-ink-4">{copy.mapLegend}</p>
      {snapshot.discoveries.length === 0 && <p className="mt-1 text-[11.5px] text-ink-3">{copy.mapEmpty}</p>}
    </Panel>
  );
}
