/**
 * COSMORA: Mars Explorer — the route shell.
 *
 * Owns everything that is not the frame loop: WebGL capability, the engine
 * instance, input wiring, the save lifecycle, the overlay stack and the quality
 * policy. The 3D scene and the HUD are children of this component and never talk to
 * each other.
 *
 * Two escape hatches are deliberate:
 *   · no WebGL  → a real page explaining it, with a link back to the site, instead
 *                 of a black rectangle.
 *   · any error → the ErrorBoundary renders the same fallback, so a driver bug in
 *                 one user's browser cannot white-screen the route.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '../i18n/translations';
import { MarsEngine, START_POSITION } from './engine';
import type { StoreSnapshot } from './state/marsGameStore';
import { createSnapshot, STATIONS } from './state/marsGameStore';
import { clearSave, isPersistenceAvailable, loadGame, newGameData, saveGame } from './state/save';
import { GAME_COPY } from './ui/copy';
import { MainMenu } from './ui/MainMenu';
import { Hud } from './ui/Hud';
import { InventoryPanel, JournalPanel, MapPanel, PauseMenu, SettingsPanel } from './ui/Panels';
import { TouchControls } from './ui/TouchControls';
import { choosePreset, QUALITY_PRESETS, createFrameSampler, sampleFrame, shouldDownscale, lowerPixelRatio } from './quality';
import type { QualityPreset } from './quality';
import { reduceKeys, ACTION_KEYS, CONSUMED_KEYS, EMPTY_INTENT } from './input/keyboard';
import type { InputIntent } from './input/keyboard';
import { createTouchState, resetTouchState, touchToIntent } from './input/touch';
import type { TouchState } from './input/touch';
import ErrorBoundary from '../ui/ErrorBoundary';
import { Button } from '../ui/primitives';
import { Glass } from '../ui/Glass';
import { detectWebGL, readDeviceSignals } from './ui/capability';
import { MarsScene } from './render/MarsScene';
import { LoadingScreen, type LoadStep } from './ui/LoadingScreen';

type Screen = 'menu' | 'playing' | 'unavailable';
type Overlay = 'none' | 'pause' | 'settings' | 'inventory' | 'journal' | 'map';

const AUTOSAVE_INTERVAL_MS = 20_000;

export default function MarsGame() {
  const { i18n } = useTranslation();
  const lang = (((i18n.language || 'en').slice(0, 2)) as SupportedLanguage) || 'en';
  const copy = GAME_COPY[lang] ?? GAME_COPY.en;

  const [screen, setScreen] = useState<Screen>('menu');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [snapshot, setSnapshot] = useState<StoreSnapshot>(createSnapshot);
  const [quality, setQuality] = useState<QualityPreset>('high');
  const [cameraMode, setCameraMode] = useState<'third' | 'first'>('third');
  const [sensitivity, setSensitivity] = useState(1);
  const [pixelRatio, setPixelRatio] = useState(1);
  const [starting, setStarting] = useState(false);
  const [loadStep, setLoadStep] = useState<LoadStep>('capability');
  const [loadDetail, setLoadDetail] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{ hasSave: boolean; savedNote: string | null }>({ hasSave: false, savedNote: null });
  const [capability, setCapability] = useState<'checking' | 'ok' | 'unavailable'>('checking');

  const intentRef = useRef<InputIntent>({ ...EMPTY_INTENT });
  const lookRef = useRef({ x: 0, y: 0 });
  const touchRef = useRef<TouchState>(createTouchState());
  const pressedKeys = useRef(new Set<string>());
  const engineRef = useRef<MarsEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const samplerRef = useRef(createFrameSampler());
  const lastSaveRef = useRef(0);
  const snapshotSink = useRef<(value: StoreSnapshot) => void>(setSnapshot);

  const isTouch = useMemo(() => isTouchDevice(), []);

  /* --------------------------------------------------------- capability */

  useEffect(() => {
    let cancelled = false;
    void detectWebGL().then((support) => {
      if (cancelled) return;
      if (!support.ok) {
        setCapability('unavailable');
        setScreen('unavailable');
        return;
      }
      setCapability('ok');
      const preset = choosePreset(readDeviceSignals(support.info));
      setQuality(preset);
      setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[preset].maxPixelRatio));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* --------------------------------------------------------------- save */

  const refreshSaveState = useCallback(async () => {
    const result = await loadGame();
    setSaveState((current) => ({ ...current, hasSave: result.status === 'ok' }));
    return result;
  }, []);

  useEffect(() => {
    void refreshSaveState();
  }, [refreshSaveState]);

  const persist = useCallback(async (note: string | null = null) => {
    const engine = engineRef.current;
    if (!engine) return;
    const result = await saveGame(engine.toSave());
    if (result.ok) {
      setSaveState({ hasSave: true, savedNote: note ?? copy.saved });
      window.setTimeout(() => setSaveState((current) => ({ ...current, savedNote: null })), 2500);
    }
  }, [copy.saved]);

  useEffect(() => {
    if (screen !== 'playing') return;
    const timer = window.setInterval(() => {
      void persist(null);
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [screen, persist]);

  /* ------------------------------------------------------------- engine */

  const buildEngine = useCallback(
    (restore: boolean) => {
      const engine = new MarsEngine({ onSnapshot: (value) => snapshotSink.current(value) });
      engineRef.current = engine;
      engine.setQuality(quality);

      if (restore) {
        void loadGame().then((result) => {
          if (result.status === 'ok') {
            engine.restore(result.data);
            setCameraMode(result.data.settings.cameraMode);
            setQuality(result.data.settings.quality);
            setSensitivity(1);
          } else if (result.status === 'corrupt') {
            setStartError(`${copy.restart}: ${result.reason}`);
          }
        });
      } else {
        const data = newGameData(engine.state.sunAngle);
        void clearSave();
        engine.restore({ ...data, progress: { ...data.progress, sunAngle: engine.state.sunAngle } });
      }

      engine.start();
      engine.pause();
      return engine;
    },
    [copy.restart, quality],
  );

  const startGame = useCallback(
    (mode: 'new' | 'continue') => {
      setStarting(true);
      setStartError(null);
      setLoadStep('capability');
      setLoadDetail(mode === 'continue' ? copy.continueGame : copy.newGame);

      // The steps are yielded to the browser so the loading screen paints between
      // them; without the awaits the whole sequence would run inside one frame and
      // the screen would never be seen.
      const run = async () => {
        try {
          await nextFrame();
          setLoadStep('world');
          buildEngine(mode === 'continue');
          await nextFrame();
          setLoadStep('restore');
          // The first ring is built by the engine constructor; give React one frame
          // to mount the canvas before handing it over.
          await nextFrame();
          setLoadStep('ready');
          setScreen('playing');
          setOverlay('none');
          window.setTimeout(() => containerRef.current?.focus(), 30);
        } catch (error) {
          setStartError(error instanceof Error ? error.message : 'The surface could not be prepared.');
        } finally {
          setStarting(false);
        }
      };
      void run();
    },
    [buildEngine, copy.continueGame, copy.newGame],
  );

  const exitGame = useCallback(() => {
    void persist(null);
    engineRef.current = null;
    setScreen('menu');
    setOverlay('none');
    void refreshSaveState();
  }, [persist, refreshSaveState]);

  /* --------------------------------------------------- keyboard plumbing */

  useEffect(() => {
    if (screen !== 'playing') return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      // Never intercept typing into a form control.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (CONSUMED_KEYS.has(event.code)) event.preventDefault();
      pressedKeys.current.add(event.code);

      const action = ACTION_KEYS[event.code];
      if (action && !event.repeat) {
        event.preventDefault();
        if (action === 'togglePause') {
          setOverlay((current) => (current === 'none' ? 'pause' : 'none'));
        } else if (action === 'toggleMap') setOverlay((current) => (current === 'map' ? 'none' : 'map'));
        else if (action === 'toggleJournal') setOverlay((current) => (current === 'journal' ? 'none' : 'journal'));
        else if (action === 'toggleInventory') setOverlay((current) => (current === 'inventory' ? 'none' : 'inventory'));
        else if (action === 'toggleCamera') {
          const engine = engineRef.current;
          if (engine) {
            const next = engine.state.camera.mode === 'third' ? 'first' : 'third';
            engine.setCameraMode(next);
            setCameraMode(next);
          }
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeys.current.delete(event.code);
    };

    const onBlur = () => {
      pressedKeys.current.clear();
      resetTouchState(touchRef.current);
      intentRef.current = { ...EMPTY_INTENT };
      lookRef.current = { x: 0, y: 0 };
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pressedKeys.current.clear();
    };
  }, [screen]);

  /* ------------------------------------------------------ pointer look */

  useEffect(() => {
    if (screen !== 'playing' || isTouch) return undefined;
    const node = containerRef.current;
    if (!node) return undefined;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      // Pointer lock is the right model for a desktop game, but it needs a user
      // gesture and can be denied; drag-look is the fallback, not a second mode.
      if (event.button !== 0) return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      if (node.requestPointerLock && document.pointerLockElement !== node) {
        try {
          const request = node.requestPointerLock();
          if (request && typeof request.catch === 'function') request.catch(() => undefined);
        } catch {
          // Denied: drag-look still works.
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const locked = document.pointerLockElement === node;
      const dx = event.movementX ?? event.clientX - lastX;
      const dy = event.movementY ?? event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (!locked && event.movementX === undefined) {
        // Already computed above.
      }
      lookRef.current.x += dx * 0.0024 * sensitivity;
      lookRef.current.y += dy * 0.0024 * sensitivity;
    };

    const onPointerUp = () => {
      dragging = false;
    };

    node.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (document.pointerLockElement === node) document.exitPointerLock?.();
    };
  }, [screen, isTouch, sensitivity]);

  /* ---------------------------------------- scroll prevention (in-game) */

  useEffect(() => {
    if (screen !== 'playing') return undefined;
    // Wheel and touch scrolling are suppressed over the game surface only, so the
    // rest of the site keeps navigating normally. `passive: false` is required for
    // preventDefault to take effect on some browsers.
    const prevent = (event: Event) => {
      event.preventDefault();
    };
    const node = containerRef.current;
    node?.addEventListener('wheel', prevent, { passive: false });
    node?.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      node?.removeEventListener('wheel', prevent);
      node?.removeEventListener('touchmove', prevent);
    };
  }, [screen]);

  /* -------------------------------------------------- adaptive quality */

  const handleFrame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    // Frame timing is sampled from the engine's own FPS figure, which is already
    // smoothed over 0.5 s; a second timer here would fight it.
    const frameMs = engine.state.time > 0 ? 1000 / Math.max(1, snapshotRef.current.fps || 60) : 16.7;
    samplerRef.current = sampleFrame(samplerRef.current, frameMs);
    if (!shouldDownscale(samplerRef.current)) return;
    samplerRef.current = createFrameSampler();
    setPixelRatio((current) => {
      const next = lowerPixelRatio(current, QUALITY_PRESETS[quality]);
      if (next < current) {
        engine.setQuality(quality, copy.fpsNote);
        return next;
      }
      return current;
    });
  }, [copy.fpsNote, quality]);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    if (overlay !== 'none' || screen !== 'playing') {
      pressedKeys.current.clear();
      resetTouchState(touchRef.current);
      intentRef.current = { ...EMPTY_INTENT };
      lookRef.current = { x: 0, y: 0 };
    }
  }, [overlay, screen]);

  /* --------------------------------------------------------------- input */

  const syncIntent = useCallback(() => {
    const keyboard = reduceKeys(pressedKeys.current);
    const touch = touchToIntent(touchRef.current);
    intentRef.current = {
      ...EMPTY_INTENT,
      forward: clampUnit(keyboard.forward + touch.forward),
      strafe: clampUnit(keyboard.strafe + touch.strafe),
      throttle: clampUnit(keyboard.throttle + touch.forward),
      steer: clampUnit(keyboard.steer + touch.strafe),
      running: keyboard.running || touch.running,
      jump: keyboard.jump || touch.jump,
      interact: keyboard.interact || touch.interact,
      board: keyboard.board || touch.board,
      brake: keyboard.brake || (snapshotRef.current.playerMode === 'rover' && touch.jump),
    };
  }, []);

  /* --------------------------------------------------------------- view */

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.setCameraMode(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) {
      if (overlay === 'none') engine.resume();
      else engine.pause();
    }
  }, [overlay]);

  if (screen === 'unavailable' || capability === 'unavailable') {
    return <Unavailable copy={{ title: copy.webglTitle, body: copy.webglBody, back: copy.webglBack }} />;
  }

  if (screen === 'menu') {
    if (starting) return <LoadingScreen copy={copy} step={loadStep} detail={loadDetail} />;
    return (
      <MainMenu
        lang={lang}
        hasSave={saveState.hasSave}
        onRequestFullscreen={() => requestFullscreen(containerRef.current)}
        onStart={() => startGame('new')}
        onContinue={() => startGame('continue')}
        onExit={() => window.location.assign('/')}
        starting={starting}
        startError={startError}
      />
    );
  }

  const preset = QUALITY_PRESETS[quality];
  const engine = engineRef.current;
  if (!engine) {
    // The menu's start button constructs the engine before flipping the screen;
    // this guard covers a React 19 double-render of the transition frame.
    return <div className="grid h-dvh place-items-center bg-void text-[12.5px] text-ink-3">{copy.loading}</div>;
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="application"
      aria-label={copy.title}
      className="relative h-dvh w-full overflow-hidden bg-void outline-none"
      style={{ touchAction: 'none' }}
    >
      <ErrorBoundary fallback={<Unavailable copy={{ title: copy.webglTitle, body: copy.webglBody, back: copy.webglBack }} />}>
        <Canvas
          dpr={pixelRatio}
          frameloop="always"
          shadows={preset.shadowMapSize > 0 ? 'soft' : false}
          gl={{ antialias: preset.antialias, powerPreference: 'high-performance', alpha: false, stencil: false }}
          camera={{ fov: 62, near: 0.15, far: 1200, position: [START_POSITION.x, 8, START_POSITION.z + 6] }}
          onCreated={({ gl, scene }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            // 1.0 rather than 1.05: the scene is calibrated so a sunlit ochre patch
            // lands mid-tone. Extra exposure here only re-flattens it.
            gl.toneMappingExposure = 1.0;
            scene.background = new THREE.Color('#0b0a0c');
          }}
        >
          <MarsScene
            engine={engine}
            intentRef={intentRef}
            lookRef={lookRef}
            quality={quality}
            pixelRatio={pixelRatio}
            onFrame={() => {
              syncIntent();
              handleFrame();
            }}
          />
        </Canvas>
      </ErrorBoundary>

      <Hud
        copy={copy}
        snapshot={snapshot}
        isTouch={isTouch}
        onOpenMap={() => setOverlay('map')}
        onOpenJournal={() => setOverlay('journal')}
        onOpenInventory={() => setOverlay('inventory')}
        onPause={() => setOverlay('pause')}
      />

      {isTouch && overlay === 'none' && (
        <TouchControls
          copy={copy}
          state={touchRef.current}
          onChange={syncIntent}
          lookRef={lookRef}
          sensitivity={sensitivity}
          onMenu={() => setOverlay('pause')}
          playerMode={snapshot.playerMode}
          roverNear={snapshot.prompt?.kind === 'rover'}
        />
      )}

      {overlay === 'pause' && (
        <PauseMenu
          copy={copy}
          saved={saveState.savedNote}
          onResume={() => setOverlay('none')}
          onSettings={() => setOverlay('settings')}
          onInventory={() => setOverlay('inventory')}
          onJournal={() => setOverlay('journal')}
          onMap={() => setOverlay('map')}
          onRestart={() => {
            void clearSave();
            startGame('new');
          }}
          onExit={exitGame}
        />
      )}

      {overlay === 'settings' && (
        <SettingsPanel
          copy={copy}
          quality={quality}
          cameraMode={cameraMode}
          sensitivity={sensitivity}
          persistenceAvailable={isPersistenceAvailable()}
          onQuality={(next) => {
            setQuality(next);
            setPixelRatio((current) => Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[next].maxPixelRatio, Math.max(current, 1)));
            engineRef.current?.setQuality(next);
          }}
          onCamera={setCameraMode}
          onSensitivity={setSensitivity}
          onSaveNow={() => void persist(copy.saved)}
          onClearSave={() => {
            void clearSave();
            setSaveState({ hasSave: false, savedNote: null });
          }}
          onClose={() => setOverlay('pause')}
        />
      )}

      {overlay === 'inventory' && <InventoryPanel copy={copy} snapshot={snapshot} onClose={() => setOverlay('none')} />}
      {overlay === 'journal' && <JournalPanel copy={copy} snapshot={snapshot} onClose={() => setOverlay('none')} />}
      {overlay === 'map' && (
        <MapPanel
          copy={copy}
          snapshot={snapshot}
          rover={{ x: engineRef.current?.state.rover.position.x ?? 0, z: engineRef.current?.state.rover.position.z ?? 0 }}
          onClose={() => setOverlay('none')}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Unavailable({ copy }: { copy: { title: string; body: string; back: string } }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-void px-4 py-12">
      <Glass className="max-w-lg p-6 sm:p-8">
        <p className="eyebrow">COSMORA · MARS</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">{copy.title}</h1>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">{copy.body}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => window.location.assign('/')}>{copy.back}</Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>Retry</Button>
        </div>
        <p className="mt-4 font-mono text-[10px] leading-relaxed text-ink-4">
          WebGL 1 or 2 is required. On a desktop, check that hardware acceleration is enabled in the browser settings.
        </p>
      </Glass>
    </div>
  );
}

/** Resolves after the browser has painted a frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else window.setTimeout(resolve, 16);
  });
}

/**
 * Requests fullscreen, tolerating the three ways it can fail.
 *
 * `requestFullscreen` is not available in iOS Safari, it rejects when the call is not
 * in a user gesture, and some embedded webviews reject it outright. None of those is
 * an error the player needs to see: the game is already full-viewport, so fullscreen
 * is a nicety.
 */
function requestFullscreen(node: HTMLElement | null): void {
  if (!node) return;
  const request = node.requestFullscreen?.bind(node);
  if (!request) return;
  try {
    const result = request({ navigationUI: 'hide' });
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  } catch {
    // Denied or unsupported: stay in the viewport.
  }
}

function clampUnit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
}

/** Re-exported so the tests can assert the seeding rather than hardcode it. */
export { STATIONS };
export type { Overlay };
