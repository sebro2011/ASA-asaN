/**
 * NOVA Home (Phase 3A).
 *
 * Deliberately sparse and entirely truthful: greeting, the one surface that is
 * fully live (Explore), appearance, live provider availability, and the module
 * roadmap. No invented recents, no placeholder metrics, no dead widgets — the
 * data-backed blocks (recent conversations, projects, documents) arrive with
 * the modules that own them and will slot into the same grid.
 */
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowUpRight, CheckCircle2, Compass, ShieldCheck } from 'lucide-react';
import { Link } from '../../app/router';
import ThemeOptions from '../../app/ThemeOptions';
import { NovaMark } from '../../app/Brand';
import { WORKSPACE_NAV } from '../../app/navConfig';
import { onlineProviderNames, useProviderConfig } from '../useProviderConfig';

function greetingKey(hour: number): string {
  if (hour < 12) return 'wsGoodMorning';
  if (hour < 18) return 'wsGoodAfternoon';
  return 'wsGoodEvening';
}

function ProviderStatus() {
  const { t } = useTranslation();
  const { status, providers } = useProviderConfig();
  const online = onlineProviderNames(providers);

  return (
    <div className="nova-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ws-text">{t('wsAiStatusTitle')}</p>
        <span
          className="nova-chip"
          style={{
            color: online.length ? 'var(--color-ws-success)' : 'var(--color-ws-text-2)',
            borderColor: online.length
              ? 'color-mix(in srgb, var(--color-ws-success) 40%, transparent)'
              : undefined,
          }}
        >
          <span className="nova-dot" aria-hidden="true" />
          {status === 'loading' ? t('wsChecking') : online.length ? `${online.length} online` : t('wsAiNone')}
        </span>
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-ws-text-2" role="status">
        {status === 'loading'
          ? t('wsChecking')
          : online.length
            ? t('wsAiConfigured', { providers: online.join(' · ') })
            : t('wsAiOfflineOnly')}
      </p>

      <ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
        {[
          { id: 'arena', label: 'Arena AI', on: providers?.arena },
          { id: 'openrouter', label: 'OpenRouter', on: providers?.openrouter },
          { id: 'gemini', label: 'Google Gemini', on: providers?.gemini },
          { id: 'local', label: 'NOVA offline engine', on: providers?.local },
        ].map((provider) => (
          <li key={provider.id} className="flex items-center justify-between gap-3 text-[11.5px]">
            <span className="text-ws-text-2">{provider.label}</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ws-text-3">
              <span
                className="nova-dot"
                aria-hidden="true"
                style={{
                  background: provider.on ? 'var(--color-ws-success)' : 'var(--color-ws-line-strong)',
                }}
              />
              {provider.on ? t('wsOn') : t('wsOff')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HomeSurface() {
  const { t } = useTranslation();
  const hour = new Date().getHours();
  const planned = WORKSPACE_NAV.filter((item) => item.status === 'planned');

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      <header className="max-w-2xl">
        <div className="flex items-center gap-2.5">
          <NovaMark size={20} />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ws-text-3">
            AI Workspace
          </span>
        </div>
        <h1 className="mt-4 text-[27px] font-semibold leading-[1.15] tracking-[-0.025em] text-ws-text sm:text-[33px]">
          {t(greetingKey(hour))}
        </h1>
        <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-ws-text-2">{t('wsHomeSubtitle')}</p>
      </header>

      <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Live surface ------------------------------------------------ */}
          <section className="nova-card overflow-hidden" aria-labelledby="nova-explore-heading">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="nova-chip" style={{ color: 'var(--color-ws-success)' }}>
                  <CheckCircle2 size={11} strokeWidth={2.2} aria-hidden="true" />
                  {t('wsAvailableNow')}
                </p>
                <h2
                  id="nova-explore-heading"
                  className="mt-2.5 flex items-center gap-2 text-[17px] font-semibold tracking-[-0.015em] text-ws-text"
                >
                  <Compass size={18} strokeWidth={1.9} aria-hidden="true" className="text-ws-accent-ink" />
                  {t('wsExploreCardTitle')}
                </h2>
                <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ws-text-2">
                  {t('wsExploreCardBody')}
                </p>
              </div>
              <Link to="/explore" className="nova-btn nova-btn--primary shrink-0">
                {t('wsOpenExplore')}
                <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>
            <div className="border-t border-ws-line px-5 py-3">
              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ws-text-3">
                <ShieldCheck size={13} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 shrink-0" />
                {t('wsHomeShellNote')}
              </p>
            </div>
          </section>

          {/* Roadmap ---------------------------------------------------- */}
          <section aria-labelledby="nova-modules-heading" className="nova-card p-5">
            <h2 id="nova-modules-heading" className="text-[15px] font-semibold text-ws-text">
              {t('wsModulesTitle')}
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ws-text-2">{t('wsModulesBody')}</p>

            <ul className="mt-4 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2">
              {planned.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      className="nova-card nova-card--interactive flex w-full items-center gap-2.5 px-3 py-2.5"
                      style={{ boxShadow: 'none', background: 'transparent' }}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-ws-line text-ws-text-3">
                        <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ws-text">
                        {t(item.labelKey)}
                      </span>
                      <span className="nova-nav-item__flag shrink-0">{item.phase}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="nova-appearance-heading" className="nova-card p-4">
            <h2 id="nova-appearance-heading" className="text-[12.5px] font-medium text-ws-text">
              {t('wsAppearanceTitle')}
            </h2>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ws-text-3">{t('wsAppearanceBody')}</p>
            <div className="mt-3">
              <ThemeOptions compact />
            </div>
          </section>

          <ProviderStatus />

          <Link
            to="/explore"
            className="nova-card nova-card--interactive flex items-center justify-between gap-3 p-4"
          >
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ws-text">{t('wsExplore')}</span>
              <span className="mt-0.5 block text-[11.5px] text-ws-text-3">
                {t('wsExploreEyebrow')}
              </span>
            </span>
            <ArrowUpRight size={16} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-ws-text-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
