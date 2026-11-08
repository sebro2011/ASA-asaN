/**
 * NOVA AI — router (Phase 3A)
 * -----------------------------------------------------------------------------
 * A ~150-line history router instead of a routing dependency: the app already
 * spoke the History API (the legacy `/cosmovision` bridge), the deployment is a
 * single SPA rewrite (`vercel.json`), and a hand-written table makes the
 * Explore alias and the workspace routes explicit in one readable file.
 *
 * Pure parsing functions are exported separately so they can be unit-tested
 * without a DOM (see scripts/test-workspace-shell.mjs).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import type { TabId } from '../ui/navigation';
import { NAV_ENTRIES } from '../ui/navigation';

export type RouteName =
  | 'home'
  /** The NOVA workspace dashboard, moved off the front door in the recovery. */
  | 'workspace'
  | 'chat'
  | 'projects'
  | 'documents'
  | 'writing'
  | 'research'
  | 'code'
  | 'knowledge'
  | 'tasks'
  | 'settings'
  | 'search'
  | 'profile'
  | 'explore'
  | 'notFound';

export interface AppRoute {
  name: RouteName;
  /** Detail id for `/chat/:id`, `/projects/:id`, `/documents/:id` … */
  id?: string;
  /** Explore destination when `name === 'explore'`. */
  tab?: TabId;
  /** Canonical pathname this route resolves to. */
  path: string;
}

const DETAIL_SEGMENTS: Record<string, RouteName> = {
  chat: 'chat',
  projects: 'projects',
  documents: 'documents',
  writing: 'writing',
  research: 'research',
  code: 'code',
};

const FLAT_SEGMENTS: Record<string, RouteName> = {
  workspace: 'workspace',
  chat: 'chat',
  projects: 'projects',
  documents: 'documents',
  writing: 'writing',
  research: 'research',
  code: 'code',
  knowledge: 'knowledge',
  tasks: 'tasks',
  settings: 'settings',
  search: 'search',
  profile: 'profile',
};

const TAB_IDS = new Set<string>(NAV_ENTRIES.map((entry) => entry.id));

export function isTabId(value: string): value is TabId {
  return TAB_IDS.has(value);
}

/** Normalise a pathname: single leading slash, no trailing slash, no query/hash. */
export function normalisePath(pathname: string): string {
  let path = String(pathname || '/').split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

export function parseRoute(pathname: string): AppRoute {
  const path = normalisePath(pathname);
  if (path === '/') return { name: 'home', path: '/' };

  const parts = path
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  // Legacy shareable route: `/cosmovision` stays valid forever.
  if (parts[0] === 'cosmovision' && parts.length === 1) {
    return { name: 'explore', tab: 'space-shorts', path: '/cosmovision' };
  }

  if (parts[0] === 'explore') {
    if (parts.length === 1) return { name: 'explore', tab: 'home', path: '/explore' };
    // The in-Explore assistant tab was retired in favour of the NOVA chat
    // workspace. Old bookmarks keep working: they resolve to the chat surface.
    if (parts.length === 2 && parts[1] === 'assistant') return { name: 'chat', path: '/chat' };
    if (parts.length === 2 && isTabId(parts[1])) {
      const tab = parts[1];
      return { name: 'explore', tab, path: tab === 'space-shorts' ? '/cosmovision' : `/explore/${tab}` };
    }
    return { name: 'notFound', path };
  }

  if (parts.length === 1) {
    const flat = FLAT_SEGMENTS[parts[0]];
    if (flat) return { name: flat, path };
    return { name: 'notFound', path };
  }

  if (parts.length === 2) {
    const detail = DETAIL_SEGMENTS[parts[0]];
    if (detail && parts[1]) return { name: detail, id: parts[1], path };
  }

  return { name: 'notFound', path };
}

/** Canonical pathname for a workspace destination. */
export function routeHref(name: RouteName, options: { id?: string; tab?: TabId } = {}): string {
  if (name === 'home') return '/';
  if (name === 'workspace') return '/workspace';
  if (name === 'notFound') return '/404';
  if (name === 'explore') {
    const tab = options.tab ?? 'home';
    return tab === 'home' ? '/explore' : tab === 'space-shorts' ? '/cosmovision' : `/explore/${tab}`;
  }
  const base = `/${name}`;
  return options.id ? `${base}/${encodeURIComponent(options.id)}` : base;
}

export const NAVIGATE_EVENT = 'nova:navigate';

export interface NavigateOptions {
  replace?: boolean;
  state?: Record<string, unknown>;
}

export function navigate(to: string, options: NavigateOptions = {}): void {
  if (typeof window === 'undefined') return;
  const next = normalisePath(to);
  const current = normalisePath(window.location.pathname);
  if (next === current) {
    // Same destination: still notify listeners so panels can reset (e.g. a
    // second press of the active nav item should not stack history entries).
    window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { path: next } }));
    return;
  }
  const method = options.replace ? 'replaceState' : 'pushState';
  window.history[method]({ ...(options.state || {}), novaRoute: next }, '', next);
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { path: next } }));
}

const RouterContext = createContext<{ path: string; route: AppRoute } | null>(null);

function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return normalisePath(window.location.pathname);
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(currentPath);

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      setPath(normalisePath(detail?.path || currentPath()));
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener(NAVIGATE_EVENT, onNavigate);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener(NAVIGATE_EVENT, onNavigate);
    };
  }, []);

  const value = useMemo(() => ({ path, route: parseRoute(path) }), [path]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRoute(): AppRoute {
  const context = useContext(RouterContext);
  // Falling back to the live URL keeps components usable in isolation (tests,
  // story-style rendering) without a provider.
  return context ? context.route : parseRoute(currentPath());
}

export function useNavigate() {
  return useCallback((to: string, options?: NavigateOptions) => navigate(to, options), []);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  replace?: boolean;
  children: ReactNode;
};

/**
 * Anchor that participates in client-side routing while keeping real link
 * semantics: middle-click, ⌘/Ctrl-click, right-click and "open in new tab" all
 * behave exactly as a browser link should.
 */
export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    event.preventDefault();
    navigate(to, { replace });
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
