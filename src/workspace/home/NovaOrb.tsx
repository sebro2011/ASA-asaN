/**
 * NovaOrb — the liquid-glass hero mark of the Home surface.
 *
 * Composition, not simulation: four blurred colour fields drift behind a single
 * glass shell, so the orb reads as one body of liquid rather than four circles.
 * Only `transform` and `opacity` animate, so the whole thing is composited by the
 * GPU and stays cheap on mid-range phones.
 *
 * States are real: `idle` at rest, `thinking` while a request is in flight,
 * `listening` while the composer holds focus, `generating` while an answer is
 * arriving. Nothing here claims a capability the app does not have — the label is
 * the only thing assistive tech reads.
 */
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../app/theme';

export type OrbState = 'idle' | 'thinking' | 'listening' | 'generating';

/** Literal keys, so the shell parity test can verify all three languages. */
export function orbStateLabelKey(state: OrbState): string {
  switch (state) {
    case 'thinking':
      return 'wsOrbThinking';
    case 'listening':
      return 'wsOrbListening';
    case 'generating':
      return 'wsOrbGenerating';
    default:
      return 'wsOrbIdle';
  }
}

export default function NovaOrb({
  state = 'idle',
  size = 152,
  className = '',
}: {
  state?: OrbState;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const { reducedMotion } = useTheme();
  const active = state === 'thinking' || state === 'generating';

  return (
    <motion.div
      className={`nova-orb ${className}`}
      data-state={state}
      style={{ width: size, height: size }}
      role="img"
      aria-label={t(orbStateLabelKey(state))}
      animate={reducedMotion ? undefined : { scale: active ? 1.04 : 1, y: active ? -2 : 0 }}
      transition={{ type: 'spring', stiffness: 140, damping: 18, mass: 0.6 }}
    >
      <span className="nova-orb__halo" aria-hidden="true" />
      <span className="nova-orb__blob nova-orb__blob--a" aria-hidden="true" />
      <span className="nova-orb__blob nova-orb__blob--b" aria-hidden="true" />
      <span className="nova-orb__blob nova-orb__blob--c" aria-hidden="true" />
      <span className="nova-orb__blob nova-orb__blob--d" aria-hidden="true" />
      <span className="nova-orb__glass" aria-hidden="true" />
      <span className="nova-orb__shine" aria-hidden="true" />
      <span className="nova-orb__ring" aria-hidden="true" />
    </motion.div>
  );
}
