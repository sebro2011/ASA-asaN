/**
 * Workspace shell.
 *
 * Composes sidebar + top bar + mobile drawer + mobile bar + command palette
 * around the active surface, and owns the three shell-level behaviours:
 * keyboard shortcuts, route-change focus/scroll handling, and the persisted
 * sidebar width preference.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from './hooks';
import type { AppRoute } from './router';
import Sidebar, { readCollapsedPreference, SIDEBAR_STORAGE_KEY } from './Sidebar';
import TopBar from './TopBar';
import MobileDrawer from './MobileDrawer';
import MobileBar from './MobileBar';
import CommandPalette from './CommandPalette';
import { ROUTE_LABEL_KEYS } from './navConfig';
import { NAV_ENTRIES } from '../ui/navigation';

function titleFor(route: AppRoute, t: (key: string) => string): string {
  if (route.name === 'explore') {
    const entry = route.tab ? NAV_ENTRIES.find((item) => item.id === route.tab) : undefined;
    return entry ? entry.labels.en : t('wsExplore');
  }
  const key = ROUTE_LABEL_KEYS[route.name];
  return key ? t(key) : t('wsNotFoundTitle');
}

export default function AppShell({ route, children }: { route: AppRoute; children: ReactNode }) {
  const { t } = useTranslation();
  const isMobile = !useMediaQuery('(min-width: 768px)');
  /**
   * The fixed mobile bar is hidden from 1024px up (`lg:hidden`), NOT from 768px.
   * Between those widths — a portrait Android tablet — the bar is on screen, so
   * the content region has to reserve its height or the bar covers the last
   * controls of a long panel.
   */
  const hasMobileBar = !useMediaQuery('(min-width: 1024px)');
  // Below 1024px the sidebar is an icon rail, so the drawer is the only way to
  // read the destination labels.
  const showMenuButton = !useMediaQuery('(min-width: 1024px)');
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsedPreference);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const lastPath = useRef(route.path);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        /* storage blocked — preference applies for this session */
      }
      return next;
    });
  }, []);

  // Global shortcuts. Deliberately few: ⌘K and ⌘\ are enough to make the shell
  // fully keyboard-navigable without hijacking normal typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (meta && event.key === '\\') {
        event.preventDefault();
        toggleCollapsed();
        return;
      }
      if (!typing && event.key === '/' && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCollapsed]);

  // Route change: scroll to top, move focus into the content region, update the
  // document title. Focus lands on <main> (tabIndex -1), never on a control, so
  // assistive tech announces the new region without stealing the caret.
  useEffect(() => {
    if (lastPath.current === route.path) return;
    lastPath.current = route.path;
    window.scrollTo({ top: 0, behavior: 'auto' });
    mainRef.current?.focus({ preventScroll: true });
  }, [route.path]);

  useEffect(() => {
    const label = titleFor(route, t);
    document.title = route.name === 'home' ? 'NOVA AI — AI workspace' : `${label} · NOVA AI`;
  }, [route, t]);

  return (
    <div className="nova-app">
      <a href="#nova-main" className="skip-link">
        {t('wsSkipToContent')}
      </a>

      <Sidebar route={route} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={titleFor(route, t)}
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenSearch={() => setPaletteOpen(true)}
          isMobile={isMobile}
          showMenuButton={showMenuButton}
        />

        <main
          id="nova-main"
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1 outline-none"
          style={{
            paddingBottom: hasMobileBar
              ? 'calc(var(--spacing-ws-mobilebar, 4.5rem) + env(safe-area-inset-bottom))'
              : undefined
          }}
        >
          {children}
        </main>
      </div>

      <MobileBar route={route} onOpenMenu={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} route={route} onClose={() => setDrawerOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
