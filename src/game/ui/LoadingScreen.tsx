/**
 * The loading screen.
 *
 * Shown while the engine builds its first chunk ring and the canvas compiles its
 * shaders. The progress bar is deliberately *not* a fake animation: it advances
 * through named steps that the shell actually completes (capability probe, engine
 * construction, first ring, save restore), so it cannot sit at 90 % while nothing
 * happens — or, worse, reach 100 % before the world exists.
 */
import { useEffect, useState } from 'react';
import type { GameCopy } from './copy';

export type LoadStep = 'capability' | 'world' | 'restore' | 'ready';

const STEP_ORDER: LoadStep[] = ['capability', 'world', 'restore', 'ready'];

export function LoadingScreen({ copy, step, detail }: { copy: GameCopy; step: LoadStep; detail?: string | null }) {
  const index = Math.max(0, STEP_ORDER.indexOf(step));
  const percent = Math.round((index / (STEP_ORDER.length - 1)) * 100);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="grid min-h-dvh place-items-center bg-void px-4" role="status" aria-live="polite">
      <div className="w-full max-w-sm">
        <p className="eyebrow">COSMORA · MARS</p>
        <p className="mt-2 text-[15px] font-medium text-ink">{copy.loading}</p>

        <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-surface-3/80">
          <div className="h-full rounded-full bg-atmo transition-[width] duration-500" style={{ width: `${Math.max(4, percent)}%` }} />
        </div>

        <p className="mt-2 font-mono text-[10px] text-ink-3">
          {step === 'restore' && detail ? detail : `${percent}%`}
          {elapsed >= 8 && <span className="ml-2 text-caution">· {elapsed}s</span>}
        </p>

        <p className="sr-only">{copy.loading} {percent}%</p>
      </div>
    </div>
  );
}
