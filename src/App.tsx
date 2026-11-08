/**
 * NOVA AI — application root (Phase 3A)
 * -----------------------------------------------------------------------------
 * Two surfaces, one product:
 *
 *   workspace  `/`, `/chat`, `/projects`, …  → AppShell + workspace surfaces
 *   explore    `/explore`, `/cosmovision`    → the preserved NASA science suite
 *
 * The science suite is loaded lazily so its components (and the three.js /
 * Leaflet / chart chunks behind them) never enter the workspace's first load.
 * It is not modified — `src/explore/ExploreApp.tsx` is the original tab shell
 * with the URL now owned by the router.
 */
import { lazy, Suspense, useEffect, type LazyExoticComponent, type ReactElement } from 'react';
import { navigate, normalisePath, useNavigate, useRoute, type AppRoute } from './app/router';
import AppShell from './app/AppShell';
import { navItemForRoute } from './app/navConfig';
import HomeSurface from './workspace/home/HomeSurface';
import ProfileSurface from './workspace/profile/ProfileSurface';
import RequireAuth from './auth/RequireAuth';
import NotFound from './workspace/NotFound';
import type { TabId } from './ui/navigation';
import { NovaMark } from './app/Brand';

const ExploreApp = lazy(() => import('./explore/ExploreApp'));
// Chat carries the markdown + highlighter chunk; it must never enter the entry.
const SearchSurface = lazy(() => import('./workspace/search/SearchSurface'));
const SettingsSurface = lazy(() => import('./workspace/settings/SettingsSurface'));

const ChatSurface = lazy(() => import('./workspace/chat/ChatSurface'));
// The news surface fetches two feeds; keep it out of the workspace entry chunk.
const NewsSurface = lazy(() => import('./workspace/news/NewsSurface'));

// Astronomy modules: one lazy chunk each, so a reader who never opens a module
// never downloads its surface.
const MissionsSurface = lazy(() => import('./workspace/modules/surfaces').then((m) => ({ default: m.MissionsSurface })));
const ObservationLogsSurface = lazy(() => import('./workspace/modules/surfaces').then((m) => ({ default: m.ObservationLogsSurface })));
const ResearchJournalSurface = lazy(() => import('./workspace/modules/surfaces').then((m) => ({ default: m.ResearchJournalSurface })));
const DeepSkyResearchSurface = lazy(() => import('./workspace/modules/surfaces').then((m) => ({ default: m.DeepSkyResearchSurface })));
const ObservingPlanSurface = lazy(() => import('./workspace/modules/surfaces').then((m) => ({ default: m.ObservingPlanSurface })));
const OrbitLabSurface = lazy(() => import('./workspace/modules/OrbitLabSurface'));
const StarLibrarySurface = lazy(() => import('./workspace/modules/StarLibrarySurface'));

const MODULE_SURFACES: Partial<Record<AppRoute['name'], LazyExoticComponent<() => ReactElement>>> = {
  projects: MissionsSurface,
  documents: ObservationLogsSurface,
  writing: ResearchJournalSurface,
  research: DeepSkyResearchSurface,
  code: OrbitLabSurface,
  knowledge: StarLibrarySurface,
  tasks: ObservingPlanSurface,
};

/** Branded loading state for the Explore chunk (kept dark: Explore is dark). */
function ExploreLoading() {
  return (
    <div
      className="grid min-h-dvh place-items-center"
      style={{ background: '#03060e', color: '#eef3fb' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <NovaMark size={30} />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: '#8294ad' }}>
          Loading explore
        </p>
      </div>
    </div>
  );
}

function ExploreSurface({ route }: { route: AppRoute }) {
  const navigate = useNavigate();
  const tab: TabId = route.tab ?? 'home';

  return (
    <Suspense fallback={<ExploreLoading />}>
      <ExploreApp
        tab={tab}
        onSelectTab={(next) => {
          navigate(next === 'home' ? '/explore' : next === 'space-shorts' ? '/cosmovision' : `/explore/${next}`);
        }}
        onExitToWorkspace={() => navigate('/workspace')}
        onOpenChat={() => navigate('/chat')}
      />
    </Suspense>
  );
}

/** Shared Suspense fallback for lazily-loaded surfaces. */
function SurfaceLoading({ label }: { label: string }) {
  return (
    <div className="nova-card p-6 text-[12.5px] text-ws-text-3" role="status">
      {label}
    </div>
  );
}

function ChatLoading() {
  return <SurfaceLoading label="Loading chat…" />;
}

function WorkspaceSurface({ route }: { route: AppRoute }) {
  if (route.name === 'workspace') return <HomeSurface />;
  if (route.name === 'notFound') return <NotFound />;

  if (route.name === 'chat') {
    // Chat is open to everyone. Signed-in readers get cloud-synced threads;
    // signed-out readers get the on-device guest store (see localChat.ts), so a
    // missing account never blocks the AI surface.
    return (
      <Suspense fallback={<ChatLoading />}>
        <ChatSurface />
      </Suspense>
    );
  }

  if (route.name === 'search') {
    return (
      <RequireAuth>
        <Suspense fallback={<SurfaceLoading label="Loading search…" />}>
          <SearchSurface />
        </Suspense>
      </RequireAuth>
    );
  }

  if (route.name === 'news') {
    return (
      <Suspense fallback={<SurfaceLoading label="Loading space news…" />}>
        <NewsSurface />
      </Suspense>
    );
  }

  if (route.name === 'settings') {
    return (
      <Suspense fallback={<SurfaceLoading label="Loading settings…" />}>
        <SettingsSurface />
      </Suspense>
    );
  }

  if (route.name === 'profile') {
    return (
      <RequireAuth>
        <ProfileSurface />
      </RequireAuth>
    );
  }

  const ModuleSurface = MODULE_SURFACES[route.name];
  if (ModuleSurface) {
    return (
      <Suspense fallback={<SurfaceLoading label="Loading module…" />}>
        <ModuleSurface />
      </Suspense>
    );
  }

  // A route exists but has no surface yet — never render a blank page.
  return <NotFound />;
}

export default function App() {
  const route = useRoute();

  // `/explore/assistant` was the old NOVA assistant tab. It is retired; the URL
  // is rewritten once so a bookmark lands in the chat workspace cleanly.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (normalisePath(window.location.pathname) === '/explore/assistant') {
      navigate('/chat', { replace: true });
    }
  }, [route.path]);

  // NASA Space Explorer is the product. It owns `/` and every science
  // destination; the NOVA workspace is a destination of its own at /workspace,
  // and NOVA's astronomy assistant is a tab inside Explore (as it always was).
  if (route.name === 'home') return <ExploreSurface route={{ ...route, tab: 'home' }} />;
  if (route.name === 'explore') return <ExploreSurface route={route} />;

  return (
    <AppShell route={route}>
      <WorkspaceSurface route={route} />
    </AppShell>
  );
}
