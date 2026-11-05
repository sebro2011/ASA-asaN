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
import { lazy, Suspense } from 'react';
import { useNavigate, useRoute, type AppRoute } from './app/router';
import AppShell from './app/AppShell';
import { navItemForRoute } from './app/navConfig';
import HomeSurface from './workspace/home/HomeSurface';
import PlannedSurface from './workspace/PlannedSurface';
import NotFound from './workspace/NotFound';
import type { TabId } from './ui/navigation';
import { NovaMark } from './app/Brand';

const ExploreApp = lazy(() => import('./explore/ExploreApp'));

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
        onExitToWorkspace={() => navigate('/')}
      />
    </Suspense>
  );
}

function WorkspaceSurface({ route }: { route: AppRoute }) {
  if (route.name === 'home') return <HomeSurface />;
  if (route.name === 'notFound') return <NotFound />;

  const item = navItemForRoute(route.name);
  if (item && item.status === 'planned') return <PlannedSurface item={item} />;

  // A route exists but has no surface yet — never render a blank page.
  return <NotFound />;
}

export default function App() {
  const route = useRoute();

  if (route.name === 'explore') return <ExploreSurface route={route} />;

  return (
    <AppShell route={route}>
      <WorkspaceSurface route={route} />
    </AppShell>
  );
}
