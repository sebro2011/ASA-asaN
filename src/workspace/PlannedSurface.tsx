/**
 * Honest "not enabled yet" surface for modules that are scheduled but not
 * built. It states the phase, what the module will do, and that nothing here is
 * simulated — rather than rendering a mock editor or an empty list that looks
 * like a bug.
 */
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, CircleDashed, ShieldCheck } from 'lucide-react';
import { Link } from '../app/router';
import type { WorkspaceNavItem } from '../app/navConfig';

export default function PlannedSurface({ item }: { item: WorkspaceNavItem }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const bullets = (item.bulletKeys || []).map((key) => t(key));

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-12">
      <p className="nova-chip">
        <CircleDashed size={11} strokeWidth={2.2} aria-hidden="true" />
        {t('wsNotAvailable')}
      </p>

      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-ws-line bg-ws-elev text-ws-accent-ink">
          <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ws-text">
            {t(item.labelKey)}
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ws-text-3">
            {t('wsPhaseLabel', { phase: item.phase })}
          </p>
        </div>
      </div>

      <p className="mt-5 max-w-[62ch] text-[13.5px] leading-relaxed text-ws-text-2">
        {t('wsPlannedBody', { phase: item.phase })}
      </p>

      {item.descriptionKey ? (
        <section className="nova-card mt-6 p-5" aria-labelledby="nova-planned-capabilities">
          <h2 id="nova-planned-capabilities" className="text-[13px] font-semibold text-ws-text">
            {t('wsPlannedCapabilities')}
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ws-text-2">{t(item.descriptionKey)}</p>
          {bullets.length ? (
            <ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ws-text-2">
                  <span
                    className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
                    style={{ background: 'var(--color-ws-accent)' }}
                    aria-hidden="true"
                  />
                  {bullet}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <p className="mt-4 flex items-start gap-2 text-[11.5px] leading-relaxed text-ws-text-3">
        <ShieldCheck size={13} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 shrink-0" />
        {t('wsNoSimulation')}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-2">
        <Link to="/" className="nova-btn nova-btn--secondary">
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          {t('wsBackHome')}
        </Link>
        <Link to="/explore" className="nova-btn nova-btn--ghost">
          {t('wsExploreInstead')}
          <ArrowUpRight size={15} strokeWidth={1.9} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
