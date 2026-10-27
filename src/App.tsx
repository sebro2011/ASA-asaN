import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import type { SupportedLanguage } from './i18n/translations';
import AppHeader from './ui/AppHeader';
import AppFooter from './ui/AppFooter';
import MobileTabBar from './ui/MobileTabBar';
import { PageHeader, DataStateBadge, Button } from './ui/primitives';
import ErrorBoundary from './ui/ErrorBoundary';
import type { TabId } from './ui/navigation';
import { NAV_ENTRIES } from './ui/navigation';
import HomePage from './pages/home/HomePage';
import { ApodViewer } from './components/ApodViewer';
import { NewsSection } from './components/NewsSection';
import { SavedFavorites } from './components/SavedFavorites';
import { SpaceTriviaQuiz } from './components/SpaceTriviaQuiz';
import FloatingVoiceControl from './components/FloatingVoiceControl.jsx';
import PWAInstallButton from './components/PWAInstallButton';
import OfflineIndicator from './components/OfflineIndicator';
import { ExportHtmlModal } from './components/ExportHtmlModal';
import { useFavorites } from './utils/favorites';
import { Radio, ArrowLeft, Download } from 'lucide-react';

/* ------------------------------------------------------------------ chunks
 * Destinations are code-split by weight, not by accident: the shell, home and
 * APOD screens ship in the initial bundle; anything that pulls three.js,
 * Leaflet, the mission chart engine or the assistant client loads on entry.
 * Each destination still renders its real component — this is transport only.
 */
const SpaceShortsPage = lazy(() => import('./features/space-shorts/SpaceShortsPage'));
const EarthIntelligenceLab = lazy(() => import('./components/EarthIntelligenceLab.jsx'));
const Space3DViewer = lazy(() =>
  import('./components/Space3DViewer').then((m) => ({ default: m.Space3DViewer }))
);
const ARPlanetViewer = lazy(() =>
  import('./components/ARPlanetViewer.jsx').then((m) => ({ default: m.ARPlanetViewer }))
);
const RocketLaunchSimulator = lazy(() => import('./components/RocketLaunchSimulator'));
const NasaAi = lazy(() => import('./components/NasaAi.jsx'));
const AsteroidRadar = lazy(() => import('./components/AsteroidRadar.jsx'));
const ISSTracker = lazy(() => import('./components/ISSTracker.jsx'));
const IssTracker2D = lazy(() => import('./components/IssTracker2D.jsx'));
const ExoplanetLab = lazy(() => import('./components/ExoplanetLab.jsx'));
const EPICViewer = lazy(() => import('./components/EPICViewer.jsx'));
const MissionsTimeline = lazy(() =>
  import('./components/MissionsTimeline').then((m) => ({ default: m.MissionsTimeline }))
);
const MarsImageTagger = lazy(() => import('./components/MarsImageTagger.jsx'));
const SolarWeather = lazy(() => import('./components/SolarWeather.jsx'));
const CosmicCalendar = lazy(() => import('./components/CosmicCalendar.jsx'));
const SmartSpaceQuiz = lazy(() => import('./components/SmartSpaceQuiz.jsx'));
const SpaceQuizModule = lazy(() => import('./components/SpaceQuizModule.jsx'));
const GeminiChatWidget = lazy(() => import('./components/GeminiChatWidget.jsx'));
const GeminiLiveVoice = lazy(() => import('./components/GeminiLiveVoice.jsx'));
const AmbientSoundscapeControl = lazy(() => import('./components/AmbientSoundscapeControl'));

/** Shown while a destination chunk streams in — never a blank frame. */
function DestinationSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="surface flex flex-col gap-4 p-6 sm:p-8" role="status" aria-live="polite">
      <span className="h-6 w-40 animate-pulse rounded-full bg-surface-2" />
      <span className="h-3 w-full max-w-xl animate-pulse rounded-full bg-surface-2/70" />
      <span className="h-3 w-3/4 max-w-md animate-pulse rounded-full bg-surface-2/50" />
      <span className="sr-only">{t('stateLoading')}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ types */

type TabKey = TabId;

interface TabMeta {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

/* -------------------------------------------------------------- component */

export default function App() {
  const { t, i18n } = useTranslation();
  const lang = ((i18n.language || 'en').slice(0, 2) as SupportedLanguage) || 'en';

  const isSpaceShortsPath = (pathname: string) => /^\/space-shorts\/?$/.test(pathname);
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    typeof window !== 'undefined' && isSpaceShortsPath(window.location.pathname) ? 'space-shorts' : 'home'
  );
  // Keep all legacy tabs state-based; only bridge the new shareable route.
  const previousAppUrl = useRef(
    typeof window !== 'undefined' && !isSpaceShortsPath(window.location.pathname)
      ? `${window.location.pathname}${window.location.search}${window.location.hash}` : '/'
  );
  const [targetApodDate, setTargetApodDate] = useState<string | undefined>(undefined);
  const [targetMissionId, setTargetMissionId] = useState<string | undefined>(undefined);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isLiveVoiceModalOpen, setIsLiveVoiceModalOpen] = useState<boolean>(false);
  // Bumped by the error-boundary fallback's Retry action to force a clean
  // remount of a failed lazy destination (e.g. a chunk that failed to load).
  const [destinationRetry, setDestinationRetry] = useState<number>(0);
  const { totalCount } = useFavorites();

  /* Keep the document language in sync for correct script rendering. */
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (isSpaceShortsPath(window.location.pathname)) {
        setActiveTab('space-shorts');
      } else {
        previousAppUrl.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const tab = event.state?.asaTab;
        setActiveTab(tab === 'home' || NAV_ENTRIES.some((entry) => entry.id === tab) ? tab : 'home');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleTabSwitch = (tab: TabKey) => {
    const inShortsRoute = isSpaceShortsPath(window.location.pathname);
    if (tab === 'space-shorts' && !inShortsRoute) {
      previousAppUrl.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState({ ...window.history.state, asaTab: activeTab }, '');
      window.history.pushState({ asaTab: tab }, '', '/space-shorts');
    } else if (tab !== 'space-shorts' && inShortsRoute) {
      window.history.pushState({ asaTab: tab }, '', previousAppUrl.current);
    }
    setActiveTab(tab);
    if (tab === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const target = document.getElementById('page-top');
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  /* Voice navigation dispatcher (kept from the original build). */
  const handleVoiceNavigate = (target: string) => {
    const map: Record<string, TabKey> = {
      mars: 'missions',
      sun: 'missions',
      iss: 'iss',
      epic: 'epic',
      exoplanets: 'exoplanets',
      earth: 'earth',
      earthlab: 'earth',
      climate: 'earth',
      weather: 'earth',
      asteroids: 'asteroids',
      apod: 'apod',
      quiz: 'quiz',
      launch: 'launch',
      rocket: 'launch',
      simulator: 'launch',
      home: 'home'
    };
    if (target === 'mars') setTargetMissionId('perseverance');
    const next = map[target];
    if (next) handleTabSwitch(next);
  };

  const handleVoiceCameraAction = (action: string) => {
    window.dispatchEvent(new CustomEvent('nasa-camera-action', { detail: { action } }));
  };

  /* Horizontal touch-swipe navigation between primary destinations. */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sequence: TabKey[] = ['home', 'earth', 'iss', 'apod', 'missions', 'asteroids', 'assistant'];
    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let ignore = false;

    const onStart = (event: TouchEvent) => {
      if (window.innerWidth >= 1024 || !event.touches || event.touches.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('canvas') ||
        target?.closest('input') ||
        target?.closest('textarea') ||
        target?.closest('select') ||
        target?.closest('button') ||
        target?.closest('[data-no-swipe]') ||
        target?.closest('.no-swipe') ||
        target?.closest('[role="dialog"]')
      ) {
        ignore = true;
        return;
      }
      ignore = false;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      startedAt = Date.now();
    };

    const onEnd = (event: TouchEvent) => {
      if (ignore || window.innerWidth >= 1024) return;
      if (!event.changedTouches || event.changedTouches.length !== 1) return;
      const deltaX = event.changedTouches[0].clientX - startX;
      const deltaY = event.changedTouches[0].clientY - startY;
      if (Date.now() - startedAt < 450 && Math.abs(deltaX) > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.6) {
        const index = sequence.indexOf(activeTab);
        if (index === -1) return;
        if (deltaX < 0 && index < sequence.length - 1) handleTabSwitch(sequence[index + 1]);
        if (deltaX > 0 && index > 0) handleTabSwitch(sequence[index - 1]);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [activeTab]);

  /* ------------------------------------------------------ page metadata */

  const liveVoiceAction = (
    <Button
      variant="secondary"
      size="sm"
      icon={Radio}
      onClick={() => setIsLiveVoiceModalOpen(true)}
      className="border-atmo/30 text-atmo hover:border-atmo/60"
    >
      {lang === 'si' ? 'සජීවී හඬ' : lang === 'ta' ? 'நேரலை குரல்' : 'Live voice'}
    </Button>
  );

  const meta: Record<TabKey, TabMeta> = {
    home: { eyebrow: '', title: '', description: '' },
    'space-shorts': {
      eyebrow: t('ssEyebrow'),
      title: t('ssTitle'),
      description: t('ssDescription')
    },
    apod: {
      eyebrow: t('pageApodEyebrow'),
      title: t('apodHeading'),
      description: t('apodSubheading'),
      meta: (
        <>
          <span className="font-mono">api.nasa.gov/planetary/apod</span>
          <span className="h-3 w-px bg-line-strong" />
          <span>English original · සිංහල · தமிழ்</span>
        </>
      )
    },
    '3d': {
      eyebrow: t('page3dEyebrow'),
      title: t('visualizerHeading'),
      description: t('visualizerSubheading'),
      meta: (
        <>
          <span className="font-mono">WebGL · three.js</span>
          <span className="h-3 w-px bg-line-strong" />
          <span>Scale and lighting are illustrative, not to scale unless stated</span>
        </>
      )
    },
    missions: {
      eyebrow: t('pageMissionsEyebrow'),
      title: t('missionsHeading'),
      description: t('missionsSubheading'),
      meta: (
        <>
          <span className="font-mono">Curated mission dossiers</span>
          <span className="h-3 w-px bg-line-strong" />
          <span>Historical record · not live</span>
        </>
      )
    },
    news: {
      eyebrow: t('pageNewsEyebrow'),
      title: t('newsHeading'),
      description: t('newsSubheading'),
      meta: <span className="font-mono">NASA newsroom · translation may be machine-generated</span>
    },
    quiz: {
      eyebrow: t('pageQuizEyebrow'),
      title: t('quizTitle'),
      description: t('quizDescription'),
      meta: <span className="font-mono">Local question bank · no account required</span>
    },
    earth: {
      eyebrow: t('pageEarthEyebrow'),
      title: t('earthHeading'),
      description: t('earthSubheading'),
      meta: (
        <>
          <span className="font-mono">NASA POWER · NASA GIBS</span>
          <span className="h-3 w-px bg-line-strong" />
          <span>{t('earthDisclaimer')}</span>
        </>
      )
    },
    epic: {
      eyebrow: t('pageEpicEyebrow'),
      title: t('epicTitle'),
      description: t('epicDescription'),
      meta: <span className="font-mono">DSCOVR EPIC · published with latency</span>
    },
    iss: {
      eyebrow: t('pageIssEyebrow'),
      title: t('issTitle'),
      description: t('issDescription'),
      meta: <span className="font-mono">api.wheretheiss.at · propagated fallback</span>
    },
    asteroids: {
      eyebrow: t('pageNeoEyebrow'),
      title: t('neoTitle'),
      description: t('neoDescription'),
      meta: <span className="font-mono">NASA NeoWs · JPL close-approach data</span>
    },
    exoplanets: {
      eyebrow: t('pageExoEyebrow'),
      title: t('exoTitle'),
      description: t('exoDescription'),
      meta: <span className="font-mono">NASA Exoplanet Archive</span>
    },
    launch: {
      eyebrow: t('pageLaunchEyebrow'),
      title: t('launchTitle'),
      description: t('launchDescription'),
      actions: <DataStateBadge state="static" label={t('stateSimulated')} />,
      meta: <span className="font-mono">Physics model · not flight telemetry</span>
    },
    assistant: {
      eyebrow: t('pageAssistantEyebrow'),
      title: t('assistantTitle'),
      description: t('assistantDescription'),
      actions: liveVoiceAction,
      meta: (
        <>
          <span className="font-mono">Server-side keys · grounded prompts</span>
          <span className="h-3 w-px bg-line-strong" />
          <span>EN · සිං · தமி</span>
        </>
      )
    },
    saved: {
      eyebrow: t('pageSavedEyebrow'),
      title: t('savedTitle'),
      description: t('savedDescription'),
      meta: <span className="font-mono">{totalCount} item{totalCount === 1 ? '' : 's'} stored locally</span>
    }
  };

  /* ------------------------------------------------------------ render */

  return (
    <div className="flex min-h-screen flex-col bg-void text-ink">
      {/* Honour prefers-reduced-motion across every framer-motion surface
          (page transitions, floating widgets, modals): transform/layout
          animations become instant while opacity cross-fades remain. The
          CSS media query in styles/tokens.css covers non-motion CSS. */}
      <MotionConfig reducedMotion="user">
      <a href="#main-content" className="skip-link">
        {t('skipToContent')}
      </a>

      <div className="fixed inset-x-0 top-0 z-40 h-px bg-gradient-to-r from-transparent via-atmo/40 to-transparent" aria-hidden="true" />

      <AppHeader
        activeTab={activeTab}
        lang={lang}
        onTabChange={handleTabSwitch}
        onOpenExport={() => setIsExportModalOpen(true)}
        dataStatus={
          activeTab === 'home' || activeTab === 'space-shorts' ? null : (
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" />
              {t('networkStatus')}
            </span>
          )
        }
      />

      <main id="main-content" className="flex-1 pb-28 lg:pb-0">
        <AnimatePresence mode="wait">
          {activeTab === 'home' ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <HomePage lang={lang} onNavigate={handleTabSwitch} />
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              id="page-top"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto max-w-[1400px] scroll-mt-24 px-4 pt-7 sm:px-6 sm:pt-9 lg:px-8"
            >
              <button
                type="button"
                onClick={() => handleTabSwitch('home')}
                className="mb-5 inline-flex items-center gap-1.5 text-[11.5px] text-ink-4 transition-colors hover:text-ink-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
                {t('navHome')}
              </button>

              <PageHeader
                eyebrow={meta[activeTab].eyebrow}
                title={meta[activeTab].title}
                description={meta[activeTab].description}
                actions={meta[activeTab].actions}
                meta={meta[activeTab].meta}
                icon={NAV_ENTRIES.find((entry) => entry.id === activeTab)?.icon}
              />

              <div className="mt-7 sm:mt-8">
                <ErrorBoundary
                  key={`${activeTab}-${destinationRetry}`}
                  resetKey={destinationRetry}
                  fallback={
                    <div className="surface p-6 sm:p-8" role="alert">
                      <p className="text-sm font-medium text-ink">{t('destinationErrorTitle')}</p>
                      <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">
                        {t('destinationErrorBody')}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setDestinationRetry((n) => n + 1)}
                        >
                          {t('retry')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleTabSwitch('home')}
                        >
                          {t('navHome')}
                        </Button>
                      </div>
                    </div>
                  }
                >
                <Suspense fallback={<DestinationSkeleton />}>
                {activeTab === 'space-shorts' && <SpaceShortsPage />}

                {activeTab === 'apod' && (
                  <ApodViewer
                    lang={lang}
                    onOpenExportModal={() => setIsExportModalOpen(true)}
                    initialDate={targetApodDate}
                  />
                )}

                {activeTab === '3d' && (
                  <div className="space-y-6">
                    <Space3DViewer lang={lang} />
                    <ARPlanetViewer lang={lang} />
                  </div>
                )}

                {activeTab === 'asteroids' && <AsteroidRadar lang={lang} />}

                {activeTab === 'epic' && <EPICViewer lang={lang} />}

                {activeTab === 'exoplanets' && <ExoplanetLab lang={lang} />}

                {activeTab === 'earth' && (
                  <Suspense
                    fallback={
                      <div className="surface flex flex-col items-center gap-3 p-12 text-center" role="status" aria-live="polite">
                        <span className="h-8 w-8 animate-spin rounded-full border-2 border-atmo/20 border-t-atmo" />
                        <p className="text-sm text-ink-2">{t('earthLoadingSeries')}</p>
                        <p className="font-mono text-[10px] text-ink-4">NASA POWER · NASA GIBS · Leaflet</p>
                      </div>
                    }
                  >
                    <EarthIntelligenceLab lang={lang} />
                  </Suspense>
                )}

                {activeTab === 'missions' && (
                  <div className="space-y-6">
                    <div className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                      <div className="min-w-0">
                        <p className="eyebrow">Simulation</p>
                        <p className="mt-1.5 text-sm font-medium text-ink">{t('launchTitle')}</p>
                        <p className="mt-1 text-[11.5px] text-ink-3">
                          Launch Complex 39B · propellant, staging and telemetry console
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => handleTabSwitch('launch')}>
                        {lang === 'si'
                          ? 'පාලන කාමරයට ඇතුළු වන්න'
                          : lang === 'ta'
                            ? 'கட்டுப்பாட்டு அறைக்குச் செல்லுங்கள்'
                            : 'Enter control room'}
                      </Button>
                    </div>
                    <MissionsTimeline lang={lang} initialMissionId={targetMissionId} />
                    <MarsImageTagger />
                    <SolarWeather />
                  </div>
                )}

                {activeTab === 'launch' && <RocketLaunchSimulator />}

                {activeTab === 'news' && (
                  <div className="space-y-6">
                    <CosmicCalendar lang={lang} />
                    <NewsSection lang={lang} />
                  </div>
                )}

                {activeTab === 'saved' && (
                  <SavedFavorites
                    lang={lang}
                    onNavigateToApod={(date) => {
                      if (date) setTargetApodDate(date);
                      handleTabSwitch('apod');
                    }}
                    onNavigateToMission={(missionId) => {
                      if (missionId) setTargetMissionId(missionId);
                      handleTabSwitch('missions');
                    }}
                  />
                )}

                {activeTab === 'quiz' && (
                  <div className="space-y-6">
                    <SmartSpaceQuiz />
                    <SpaceQuizModule lang={lang} />
                    <SpaceTriviaQuiz lang={lang} />
                  </div>
                )}

                {activeTab === 'iss' && (
                  <div className="space-y-6">
                    <IssTracker2D lang={lang} />
                    <ISSTracker />
                  </div>
                )}

                {activeTab === 'assistant' && <NasaAi lang={lang} />}
                </Suspense>
                </ErrorBoundary>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* App-level utilities: available on every destination. */}
      <div className="mx-auto mt-4 flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-4 border-t border-line/60 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={null}>
            <AmbientSoundscapeControl lang={lang} />
          </Suspense>
          <PWAInstallButton lang={lang} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon={Download} onClick={() => setIsExportModalOpen(true)}>
            {t('navExportHtml')}
          </Button>
          <a
            href="https://api.nasa.gov"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] text-ink-4 transition-colors hover:text-ink"
          >
            NASA API portal ↗
          </a>
        </div>
      </div>

      <AppFooter onTabChange={handleTabSwitch} onOpenExport={() => setIsExportModalOpen(true)} lang={lang} />

      <MobileTabBar activeTab={activeTab} onTabChange={handleTabSwitch} lang={lang} />

      {/* Global overlays (all pre-existing features, preserved) */}
      {/* The conversational widget stays available on desktop; on phones the
          Assistant destination is one tap away in the bottom bar, which avoids
          stacking three floating controls over the content. */}
      <Suspense fallback={null}>
        <div className="hidden lg:block">
          <GeminiChatWidget lang={lang} onNavigateToTab={(tabId: string) => handleTabSwitch(tabId as TabKey)} />
        </div>
        <GeminiLiveVoice lang={lang} isOpen={isLiveVoiceModalOpen} onClose={() => setIsLiveVoiceModalOpen(false)} />
      </Suspense>
      <OfflineIndicator lang={lang} />
      <FloatingVoiceControl
        onNavigate={handleVoiceNavigate}
        onCameraAction={handleVoiceCameraAction}
        lang={lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-IN' : 'en-US'}
        className="bottom-24 left-4 sm:left-6 lg:bottom-8 lg:left-6"
      />
      <ExportHtmlModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} lang={lang} />
      </MotionConfig>
    </div>
  );
}
