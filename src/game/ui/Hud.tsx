/**
 * The gameplay HUD.
 *
 * Layout: a single glazed strip along the bottom (mission telemetry) and a compact
 * top-left status block, so the centre of the screen — where the player is looking —
 * stays clear. On a tablet the strip collapses to two rows and the touch controls
 * take the corners.
 *
 * Every numeric reading here is *simulated*, and the panel says so once, plainly,
 * rather than decorating each value with a badge.
 */
import type { StoreSnapshot } from '../state/marsGameStore';
import type { GameCopy } from './copy';
import { Glass } from '../../ui/Glass';

function Meter({ label, value, copy }: { label: string; value: number; copy: GameCopy }) {
  const percent = Math.round(value * 100);
  const low = value < 0.2;
  return (
    <div className="min-w-[92px] flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">{label}</span>
        <span className={`font-mono text-[11px] tabular-nums ${low ? 'text-critical' : 'text-ink'}`}>{percent}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3/80" role="presentation">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${low ? 'bg-critical' : 'bg-atmo'}`}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
      <span className="sr-only">
        {label}: {percent}% ({copy.simulated})
      </span>
    </div>
  );
}

export interface HudProps {
  copy: GameCopy;
  snapshot: StoreSnapshot;
  /** Longitude/latitude are not a thing on Mars; these are world metres. */
  onOpenMap: () => void;
  onOpenJournal: () => void;
  onOpenInventory: () => void;
  onPause: () => void;
  isTouch: boolean;
}

export function Hud({ copy, snapshot, onOpenMap, onOpenJournal, onOpenInventory, onPause, isTouch }: HudProps) {
  const modeLabel = snapshot.playerMode === 'rover' ? copy.hudRover : copy.hudFoot;

  return (
    <>
      {/* ------------------------------- top-left: mode, position, prompt */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[min(88vw,340px)] flex-col gap-2 sm:left-4 sm:top-4">
        <Glass className="pointer-events-auto px-3 py-2">
          <div className="flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-atmo" aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2">{modeLabel}</span>
            <span className="font-mono text-[10px] tabular-nums text-ink-3">
              {snapshot.position.x.toFixed(0)}, {snapshot.position.z.toFixed(0)} m
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[9.5px] text-ink-4">
            <span>{snapshot.fps} FPS</span>
            <span className="h-2 w-px bg-line-strong" aria-hidden="true" />
            <span>{copy.simulationBadge}</span>
          </div>
        </Glass>

        {snapshot.prompt && (
          <Glass tone="strong" className="pointer-events-auto flex items-center gap-2.5 px-3 py-2" role="status">
            <kbd className="rounded border border-line-strong bg-surface-3/80 px-1.5 py-0.5 font-mono text-[10px] text-ink">
              {isTouch ? 'TAP' : snapshot.playerMode === 'rover' ? 'F' : 'E'}
            </kbd>
            <span className="text-[12.5px] text-ink">
              {snapshot.prompt.action} · {snapshot.prompt.label}
            </span>
          </Glass>
        )}
      </div>

      {/* --------------------------------------- top-right: research + menus */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-4 sm:top-4">
        <Glass className="hidden px-3 py-2 sm:block">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">{copy.research}</span>
            <span className="font-mono text-[11px] tabular-nums text-ink">{Math.round(snapshot.researchProgress * 100)}%</span>
          </div>
          <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-surface-3/80">
            <div className="h-full rounded-full bg-signal" style={{ width: `${Math.max(2, snapshot.researchProgress * 100)}%` }} />
          </div>
        </Glass>
        <button
          type="button"
          onClick={onPause}
          aria-label={copy.paused}
          className="grid h-9 w-9 place-items-center rounded-[10px] border border-line-strong bg-surface-2/80 text-ink transition-colors hover:border-atmo/50 hover:text-atmo"
        >
          <span aria-hidden="true" className="text-[13px] leading-none">II</span>
        </button>
      </div>

      {/* ------------------------------------------------ bottom telemetry */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 sm:inset-x-4 sm:bottom-4">
        <Glass className="pointer-events-auto px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5">
            <Meter label={copy.oxygen} value={snapshot.oxygen} copy={copy} />
            <Meter label={copy.suit} value={snapshot.suitBattery} copy={copy} />
            <Meter label={copy.roverBattery} value={snapshot.roverBattery} copy={copy} />
            <Meter label={copy.energy} value={snapshot.energy} copy={copy} />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line/60 pt-2">
            <button type="button" onClick={onOpenMap} className="rounded border border-line/70 px-2 py-1 font-mono text-[10px] text-ink-2 transition-colors hover:border-atmo/50 hover:text-ink">
              {copy.map}
            </button>
            <button type="button" onClick={onOpenJournal} className="rounded border border-line/70 px-2 py-1 font-mono text-[10px] text-ink-2 transition-colors hover:border-atmo/50 hover:text-ink">
              {copy.journal}
            </button>
            <button type="button" onClick={onOpenInventory} className="rounded border border-line/70 px-2 py-1 font-mono text-[10px] text-ink-2 transition-colors hover:border-atmo/50 hover:text-ink">
              {copy.inventory} · {snapshot.samples.length}
            </button>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-4">
              {copy.distance}: {snapshot.playerMode === 'rover' ? snapshot.roverDistance.toFixed(0) : snapshot.walkedDistance.toFixed(0)} m
            </span>
          </div>
        </Glass>

        {!isTouch && (
          <p className="mt-1.5 hidden text-center font-mono text-[9.5px] text-ink-4 sm:block">{copy.movementHelp}</p>
        )}
      </div>

      {snapshot.qualityNote && (
        <p className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-line/70 bg-surface/85 px-3 py-1 font-mono text-[9.5px] text-caution sm:top-4">
          {snapshot.qualityNote}
        </p>
      )}

      {snapshot.notification && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-4 sm:top-20">
          <Glass tone="strong" className="max-w-md px-4 py-3" role="status" aria-live="polite">
            <p className="text-[13px] font-semibold text-ink">{snapshot.notification.title}</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">{snapshot.notification.body}</p>
          </Glass>
        </div>
      )}
    </>
  );
}
