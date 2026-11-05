/**
 * Mobile navigation drawer.
 *
 * A real modal dialog: focus trapped, background scroll locked, Escape and
 * backdrop close, focus restored to the trigger. It is the complete navigation
 * (workspace + Explore destinations + settings), so nothing is reachable only
 * from a hidden gesture.
 */
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Plus, X } from 'lucide-react';
import { Link } from './router';
import type { AppRoute } from './router';
import { NovaWordmark } from './Brand';
import { ACCOUNT_NAV, EXPLORE_NAV, WORKSPACE_NAV } from './navConfig';
import { useBodyScrollLock, useEscape, useFocusTrap } from './hooks';
import ThemeOptions from './ThemeOptions';
import { NAV_ENTRIES, NAV_GROUPS } from '../ui/navigation';

interface MobileDrawerProps {
  open: boolean;
  route: AppRoute;
  onClose: () => void;
}

export default function MobileDrawer({ open, route, onClose }: MobileDrawerProps) {
  const { t, i18n } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const lang = ((i18n.language || 'en').slice(0, 2) as 'en' | 'si' | 'ta') || 'en';

  useFocusTrap(open, panelRef);
  useBodyScrollLock(open);
  useEscape(open, onClose);

  if (!open) return null;

  const linkClass = 'nova-nav-item';

  return (
    <div className="fixed inset-0 z-[60] lg:hidden">
      <button
        type="button"
        aria-label={t('wsCloseMenu')}
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/55 backdrop-blur-[2px]"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('wsDrawerNavigation')}
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(88vw,20rem)] flex-col border-r border-ws-line bg-ws-surface shadow-[var(--ws-shadow-2)]"
        style={{ animation: 'nova-drawer-in 200ms cubic-bezier(.16,1,.3,1)' }}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-ws-line px-3">
          <Link to="/" className="rounded-lg" onClick={onClose} aria-label="NOVA AI — Home">
            <NovaWordmark />
          </Link>
          <button
            type="button"
            className="nova-icon-btn"
            onClick={onClose}
            aria-label={t('wsCloseMenu')}
            title={t('wsCloseMenu')}
          >
            <X size={18} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>

        <div className="nova-scroll flex-1 overflow-y-auto px-2 py-3" style={{ overscrollBehavior: 'contain' }}>
          <Link to="/chat" onClick={onClose} className="nova-btn nova-btn--primary mb-3 w-full">
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            {t('wsNewChat')}
            <span className="nova-nav-item__flag">3D</span>
          </Link>

          <ul className="flex list-none flex-col gap-0.5 p-0">
            {WORKSPACE_NAV.map((item) => {
              const Icon = item.icon;
              const active = route.name === item.route;
              return (
                <li key={item.id}>
                  <Link
                    to={item.href}
                    onClick={onClose}
                    className={linkClass}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="nova-nav-item__icon" aria-hidden="true">
                      <Icon size={17} strokeWidth={active ? 2 : 1.75} />
                    </span>
                    <span className="nova-nav-item__label">{t(item.labelKey)}</span>
                    {item.status === 'planned' ? (
                      <span className="nova-nav-item__flag">{t('wsPlannedFlag')}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="nova-nav-section">{t('wsExplore')}</p>
          <ul className="flex list-none flex-col gap-0.5 p-0">
            <li>
              <Link
                to={EXPLORE_NAV.href}
                onClick={onClose}
                className={linkClass}
                aria-current={route.name === 'explore' ? 'page' : undefined}
              >
                <span className="nova-nav-item__icon" aria-hidden="true">
                  <EXPLORE_NAV.icon size={17} strokeWidth={1.9} />
                </span>
                <span className="nova-nav-item__label">{t(EXPLORE_NAV.labelKey)}</span>
              </Link>
            </li>
          </ul>

          <p className="nova-nav-section">{t('wsDestinations')}</p>
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {NAV_GROUPS.map((group) =>
              NAV_ENTRIES.filter((entry) => entry.group === group.id).map((entry) => {
                const Icon = entry.icon;
                const active = route.name === 'explore' && route.tab === entry.id;
                const href =
                  entry.id === 'space-shorts'
                    ? '/cosmovision'
                    : entry.id === 'home'
                      ? '/explore'
                      : `/explore/${entry.id}`;
                return (
                  <li key={entry.id}>
                    <Link
                      to={href}
                      onClick={onClose}
                      className={linkClass}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="nova-nav-item__icon" aria-hidden="true">
                        <Icon className="h-[15px] w-[15px]" strokeWidth={1.7} />
                      </span>
                      <span className="nova-nav-item__label text-[12.5px]">
                        {entry.labels[lang] || entry.labels.en}
                      </span>
                    </Link>
                  </li>
                );
              }),
            )}
          </ul>

          <div className="mt-5">
            <ThemeOptions compact />
          </div>

          <div className="mt-4 border-t border-ws-line pt-2">
            <ul className="flex list-none flex-col gap-0.5 p-0">
              {ACCOUNT_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link to={item.href} onClick={onClose} className={linkClass}>
                      <span className="nova-nav-item__icon" aria-hidden="true">
                        <Icon size={17} strokeWidth={1.75} />
                      </span>
                      <span className="nova-nav-item__label">{t(item.labelKey)}</span>
                      <span className="nova-nav-item__flag">{item.phase}</span>
                    </Link>
                  </li>
                );
              })}
              <li>
                <Link to="/explore" onClick={onClose} className={linkClass}>
                  <span className="nova-nav-item__icon" aria-hidden="true">
                    <ArrowUpRight size={16} strokeWidth={1.8} />
                  </span>
                  <span className="nova-nav-item__label">{t('wsOpenExplore')}</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
