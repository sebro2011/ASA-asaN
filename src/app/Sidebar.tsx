/**
 * Desktop / tablet sidebar.
 *
 * ≥1024px: 264px expanded ↔ 72px icon rail (persisted).
 * 768–1023px: icon rail (tablet is a first-class target, not a squeezed phone).
 * <768px: hidden — the drawer and bottom bar take over.
 *
 * The Explore group is the only secondary group: it keeps every NASA science
 * destination one level deep without competing with the workspace.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Link } from './router';
import { NovaWordmark } from './Brand';
import { ACCOUNT_NAV, EXPLORE_NAV, WORKSPACE_NAV, type WorkspaceNavItem } from './navConfig';
import type { AppRoute } from './router';
import { NAV_ENTRIES, NAV_GROUPS } from '../ui/navigation';

export const SIDEBAR_STORAGE_KEY = 'nova_sidebar_collapsed';

export function readCollapsedPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

interface SidebarProps {
  route: AppRoute;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function NavRow({ item, route, collapsed }: { item: WorkspaceNavItem; route: AppRoute; collapsed: boolean }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const active = route.name === item.route;
  const label = t(item.labelKey);

  return (
    <li>
      <Link
        to={item.href}
        className="nova-nav-item"
        aria-current={active ? 'page' : undefined}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
      >
        <span className="nova-nav-item__icon" aria-hidden="true">
          <Icon size={17} strokeWidth={active ? 2 : 1.75} />
        </span>
        <span className="nova-nav-item__label">{label}</span>
        {item.status === 'planned' && !collapsed ? (
          <span className="nova-nav-item__flag" title={t('wsNotAvailable')}>
            {t('wsPlannedFlag')}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export default function Sidebar({ route, collapsed, onToggleCollapsed }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const lang = ((i18n.language || 'en').slice(0, 2) as 'en' | 'si' | 'ta') || 'en';
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  const exploreActive = route.name === 'explore';

  // The Explore group opens itself when the user is already inside Explore.
  useEffect(() => {
    if (exploreActive) setDestinationsOpen(true);
  }, [exploreActive]);

  return (
    <aside
      className="nova-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label={t('wsMainNavigation')}
    >
      <div className="nova-sidebar__brand">
        <Link to="/" className="min-w-0 rounded-lg" aria-label="NOVA AI — Home">
          <NovaWordmark collapsed={collapsed} />
        </Link>
        {collapsed ? null : (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="nova-icon-btn ml-auto hidden lg:inline-grid"
            aria-label={t('wsCollapseSidebar')}
            title={t('wsCollapseSidebar')}
          >
            <ChevronLeft size={16} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* The sidebar scrolls, so it has to be reachable without a mouse
          (WCAG 2.1.1); the global [tabindex] focus ring covers the visual part. */}
      <div
        className="nova-sidebar__scroll"
        role="region"
        aria-label={t('wsMainNavigation')}
        tabIndex={0}
      >
        <Link
          to="/chat"
          className="nova-btn nova-btn--primary mb-3 w-full"
          title={collapsed ? t('wsNewChat') : undefined}
          aria-label={collapsed ? t('wsNewChat') : undefined}
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          <span className="nova-nav-item__label">{t('wsNewChat')}</span>
          {collapsed ? null : (
            <span className="nova-nav-item__flag" title={t('wsNotAvailable')}>
              3D
            </span>
          )}
        </Link>

        <nav aria-label={t('wsMainNavigation')}>
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {WORKSPACE_NAV.map((item) => (
              <NavRow key={item.id} item={item} route={route} collapsed={collapsed} />
            ))}
          </ul>

          <p className="nova-nav-section">{t('wsExplore')}</p>
          <ul className="flex list-none flex-col gap-0.5 p-0">
            <NavRow item={EXPLORE_NAV} route={route} collapsed={collapsed} />
          </ul>

          {collapsed ? null : (
            <div className="nova-sidebar__collapsible mt-1">
              <button
                type="button"
                onClick={() => setDestinationsOpen((open) => !open)}
                aria-expanded={destinationsOpen}
                aria-controls="nova-explore-destinations"
                className="nova-nav-item"
                style={{ paddingLeft: '1.9rem' }}
              >
                <span className="nova-nav-item__label text-[12.5px] text-ws-text-3">
                  {t('wsDestinations')}
                </span>
                <ChevronDown
                  size={14}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  style={{
                    transform: destinationsOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 160ms cubic-bezier(.16,1,.3,1)',
                  }}
                />
              </button>
              {destinationsOpen ? (
                <ul id="nova-explore-destinations" className="mt-1 flex list-none flex-col gap-0.5 p-0">
                  {NAV_GROUPS.map((group) => (
                    <li key={group.id}>
                      <p className="nova-nav-section" style={{ paddingLeft: '1.9rem', marginTop: '0.5rem' }}>
                        {group.labels[lang] || group.labels.en}
                      </p>
                      <ul className="flex list-none flex-col gap-0.5 p-0">
                        {NAV_ENTRIES.filter((entry) => entry.group === group.id).map((entry) => {
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
                                className="nova-nav-item"
                                aria-current={active ? 'page' : undefined}
                                style={{ paddingLeft: '1.9rem' }}
                                title={entry.hint[lang] || entry.hint.en}
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
                        })}
                      </ul>
                    </li>
                  ))}
                  <li>
                    <Link
                      to="/explore"
                      className="nova-nav-item"
                      style={{ paddingLeft: '1.9rem' }}
                    >
                      <span className="nova-nav-item__icon" aria-hidden="true">
                        <ArrowUpRight size={15} strokeWidth={1.7} />
                      </span>
                      <span className="nova-nav-item__label text-[12.5px]">{t('wsOpenExplore')}</span>
                    </Link>
                  </li>
                </ul>
              ) : null}
            </div>
          )}
        </nav>
      </div>

      <div className="nova-sidebar__footer">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="nova-icon-btn mx-auto hidden lg:inline-grid"
            aria-label={t('wsExpandSidebar')}
            title={t('wsExpandSidebar')}
          >
            <ChevronRight size={16} strokeWidth={1.8} />
          </button>
        ) : null}
        <ul className="flex list-none flex-col gap-0.5 p-0">
          {ACCOUNT_NAV.map((item) => {
            const Icon = item.icon;
            const active = route.name === item.route;
            return (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="nova-nav-item"
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? t(item.labelKey) : undefined}
                  aria-label={collapsed ? t(item.labelKey) : undefined}
                >
                  <span className="nova-nav-item__icon" aria-hidden="true">
                    <Icon size={17} strokeWidth={active ? 2 : 1.75} />
                  </span>
                  <span className="nova-nav-item__label">{t(item.labelKey)}</span>
                  {collapsed ? null : <span className="nova-nav-item__flag">{item.phase}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
