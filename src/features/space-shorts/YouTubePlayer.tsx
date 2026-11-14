import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Captions,
  ExternalLink,
  Maximize,
  Minimize,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Share2,
  Volume1,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { SpaceVideo } from './types';
import { loadPlayerApi, PLAYER_STATE, type YouTubePlayerInstance } from './youtubePlayerApi';
import {
  CHROME_IDLE_MS,
  NUDGE_SECONDS,
  SKIP_SECONDS,
  VOLUME_STEP,
  chromeVisible,
  clampSeek,
  formatClock,
  formatRemaining,
  playerCapabilities,
  progressFraction,
  readActiveCaptionCode,
  readCaptionTracks,
  resolveShortcut,
  timelineValueText,
  volumeState,
  type CaptionTrack
} from './playerControls';

type PlayerStatus = 'loading' | 'ready' | 'error';

/** Chrome-only DOM that Safari still prefixes; typed instead of `any`. */
type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };

/**
 * CosmoVision cinematic player.
 *
 * The playback engine is the same official YouTube IFrame Player API as before
 * (lazy `iframe_api` load, `youtube-nocookie.com`, autoplay + muted, 12 s script and
 * 15 s ready timeouts, one retry, "Watch on YouTube" fallback). What changed is the
 * control layer: it drives that player object directly and only renders controls
 * this engine can actually perform, so nothing on screen is decorative.
 */
export default function YouTubePlayer({ video, onClose }: { video: SpaceVideo; onClose?: () => void }) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);

  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captionsAvailable, setCaptionsAvailable] = useState(false);
  /** Only set when the API actually reported a track list; never guessed. */
  const [captionTracks, setCaptionTracks] = useState<CaptionTrack[]>([]);
  const [captionMenuOpen, setCaptionMenuOpen] = useState(false);
  const [activeCaption, setActiveCaption] = useState<string | null>(null);
  const [captionStateKnown, setCaptionStateKnown] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenApi, setFullscreenApi] = useState(false);
  const [hardwareVolume, setHardwareVolume] = useState(false);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [hoverChrome, setHoverChrome] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [idleMs, setIdleMs] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [hint, setHint] = useState<{ left: number; time: number } | null>(null);

  const lastActivity = useRef(Date.now());
  const poke = useCallback(() => {
    lastActivity.current = Date.now();
    setIdleMs(0);
  }, []);

  /* ---------------------------------------------------------------- capability probe */
  useEffect(() => {
    const doc = document as WebkitDocument;
    setFullscreenApi(Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled));
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
    const iPadOs = typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    setHardwareVolume(/iPad|iPhone|iPod/.test(ua) || iPadOs);
  }, []);

  const caps = useMemo(
    () =>
      playerCapabilities({
        apiReady: status === 'ready',
        captionsApi: captionsAvailable,
        sameOriginVideo: false, // a cross-origin iframe can never offer real PiP
        fullscreenApi,
        hardwareVolume,
        shareApi: true
      }),
    [status, captionsAvailable, fullscreenApi, hardwareVolume]
  );

  /* ------------------------------------------------------------------- engine mount */
  useEffect(() => {
    let cancelled = false;
    let readyTimer: number | undefined;
    let instance: YouTubePlayerInstance | null = null;
    setStatus('loading');
    setPlaying(false);
    setCurrent(0);
    setDuration(0);

    const fail = () => {
      if (cancelled) return;
      setStatus('error');
      setPlaying(false);
    };

    const mount = async () => {
      const mount_ = mountRef.current;
      if (!mount_) return;
      try {
        const api = await loadPlayerApi();
        if (cancelled || !mountRef.current) return;
        mount_.replaceChildren();
        const host = document.createElement('div');
        mount_.appendChild(host);
        instance = new api.Player(host, {
          videoId: video.id,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            mute: 1,
            playsinline: 1,
            // The cinematic chrome replaces the YouTube chrome. Captions keep their
            // original default-on behaviour; the toggle reads the real state back.
            controls: 0,
            cc_load_policy: 1,
            rel: 0,
            fs: 0,
            origin: window.location.origin
          },
          events: {
            onReady: (event: { target: YouTubePlayerInstance }) => {
              if (cancelled) return;
              clearTimeout(readyTimer);
              playerRef.current = event.target;
              try {
                setVolume(Math.round(event.target.getVolume()));
                setMuted(event.target.isMuted());
                setCaptionsAvailable(
                  typeof event.target.setOption === 'function' && typeof event.target.unloadModule === 'function'
                );
                const captionOptions =
                  typeof event.target.getOptions === 'function'
                    ? (() => {
                        try {
                          return event.target.getOptions?.('captions');
                        } catch {
                          return undefined;
                        }
                      })()
                    : undefined;
                const tracks = readCaptionTracks(captionOptions);
                setCaptionTracks(tracks);
                setActiveCaption(readActiveCaptionCode(captionOptions));
                // `undefined` means the API did not answer: keep the button honest by
                // treating the state as unknown instead of claiming captions are off.
                setCaptionStateKnown(captionOptions !== undefined);
                if (captionOptions !== undefined) setCaptionsOn(readActiveCaptionCode(captionOptions) !== null);
                event.target.mute();
                event.target.playVideo();
              } catch {
                /* player surfaced but answered badly — the poll will retry reads */
              }
              setStatus('ready');
            },
            onStateChange: (event: { data?: number }) => {
              if (cancelled) return;
              if (event.data === PLAYER_STATE.PLAYING) {
                setPlaying(true);
                poke();
              } else if (
                event.data === PLAYER_STATE.PAUSED ||
                event.data === PLAYER_STATE.ENDED ||
                event.data === PLAYER_STATE.CUED
              ) {
                setPlaying(false);
              }
            },
            onError: fail
          }
        });
        readyTimer = window.setTimeout(() => {
          if (!cancelled && !playerRef.current) fail();
        }, 15000);
      } catch {
        fail();
      }
    };
    void mount();

    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      playerRef.current = null;
      try {
        instance?.destroy();
      } catch {
        /* already gone */
      }
      mountRef.current?.replaceChildren();
    };
  }, [video.id, attempt, poke]);

  /* --------------------------------------------------------- time / state polling */
  useEffect(() => {
    if (status !== 'ready') return;
    const id = window.setInterval(() => {
      setIdleMs(Date.now() - lastActivity.current);
      const player = playerRef.current;
      if (!player) return;
      try {
        const nextTime = player.getCurrentTime();
        if (Number.isFinite(nextTime)) setCurrent(nextTime);
        const nextDuration = player.getDuration();
        if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
        const fraction = player.getVideoLoadedFraction();
        if (Number.isFinite(fraction)) setBuffered(fraction);
        setPlaying(player.getPlayerState() === PLAYER_STATE.PLAYING);
      } catch {
        /* the player is mid-destroy; the next tick or the mount effect recovers */
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [status]);

  /* --------------------------------------------------------------------- fullscreen */
  useEffect(() => {
    const doc = document as WebkitDocument;
    const sync = () => setFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  /* ------------------------------------------------------------------------- toast */
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* ------------------------------------------------------------------------ actions */
  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (playing) player.pauseVideo();
      else player.playVideo();
      setPlaying(!playing);
    } catch {
      /* keep the previous state; polling reconciles */
    }
    poke();
  }, [playing, poke]);

  const applySeek = useCallback(
    (seconds: number) => {
      const player = playerRef.current;
      const target = clampSeek(seconds, duration);
      if (player) {
        try {
          player.seekTo(target, true);
        } catch {
          return;
        }
      }
      setCurrent(target);
      poke();
    },
    [duration, poke]
  );

  const applyVolume = useCallback(
    (value: number) => {
      const next = Math.min(100, Math.max(0, Math.round(value)));
      setVolume(next);
      const player = playerRef.current;
      if (!player) return;
      try {
        player.setVolume(next);
        if (next > 0) {
          player.unMute();
          setMuted(false);
        } else {
          player.mute();
          setMuted(true);
        }
      } catch {
        /* iOS ignores setVolume; the label still reflects intent */
      }
    },
    []
  );

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    const next = !muted;
    setMuted(next);
    if (!player) return;
    try {
      if (next) player.mute();
      else player.unMute();
    } catch {
      /* ignore */
    }
  }, [muted]);

  /**
   * `null` turns captions off, a language code turns that track on. Only language
   * codes the player itself reported are ever requested.
   */
  const selectCaptionTrack = useCallback(
    (languageCode: string | null) => {
      const player = playerRef.current;
      if (!player) return;
      try {
        if (languageCode) {
          player.loadModule?.('captions');
          player.setOption?.('captions', 'track', { languageCode });
          setActiveCaption(languageCode);
          setCaptionsOn(true);
        } else {
          player.setOption?.('captions', 'track', {});
          setActiveCaption(null);
          setCaptionsOn(false);
        }
        setCaptionStateKnown(true);
      } catch {
        setCaptionsAvailable(false);
        setToast(t('cvCaptionsUnavailable'));
      }
      setCaptionMenuOpen(false);
    },
    [t]
  );

  const toggleCaptions = useCallback(() => {
    if (captionTracks.length > 1) {
      setCaptionMenuOpen((open) => !open);
      return;
    }
    if (captionsOn) {
      selectCaptionTrack(null);
    } else {
      selectCaptionTrack(captionTracks[0]?.languageCode ?? null);
    }
  }, [captionTracks, captionsOn, selectCaptionTrack]);

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    const doc = document as WebkitDocument;
    const element = root as WebkitElement;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else doc.webkitExitFullscreen?.();
      } else if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else {
        setToast(t('cvFullscreenUnavailable'));
      }
    } catch {
      setToast(t('cvFullscreenUnavailable'));
    }
  }, [t]);

  const share = useCallback(async () => {
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: video.title, url });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setToast(t('cvShareCopied'));
        return;
      }
      setToast(t('cvShareUnavailable'));
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return; // viewer cancelled the sheet
      setToast(t('cvShareUnavailable'));
    }
  }, [video.id, video.title, t]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      // Sliders own their arrow keys; text fields own everything.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'Escape' && captionMenuOpen) {
        event.preventDefault();
        setCaptionMenuOpen(false);
        return;
      }
      const action = resolveShortcut(event.key, { hasClose: Boolean(onClose) });
      if (!action) return;
      event.preventDefault();
      switch (action) {
        case 'toggle':
          togglePlay();
          break;
        case 'seek-back':
          applySeek(current - NUDGE_SECONDS);
          break;
        case 'seek-forward':
          applySeek(current + NUDGE_SECONDS);
          break;
        case 'jump-back':
          applySeek(current - SKIP_SECONDS);
          break;
        case 'jump-forward':
          applySeek(current + SKIP_SECONDS);
          break;
        case 'mute':
          toggleMute();
          break;
        case 'volume-up':
          applyVolume((muted ? 0 : volume) + VOLUME_STEP);
          break;
        case 'volume-down':
          applyVolume((muted ? 0 : volume) - VOLUME_STEP);
          break;
        case 'fullscreen':
          void toggleFullscreen();
          break;
        case 'captions':
          if (caps.captions) toggleCaptions();
          break;
        case 'start':
          applySeek(0);
          break;
        case 'end':
          applySeek(duration);
          break;
        case 'close':
          onClose?.();
          break;
        default:
          break;
      }
    },
    [
      applySeek,
      applyVolume,
      captionMenuOpen,
      caps.captions,
      current,
      duration,
      muted,
      onClose,
      toggleCaptions,
      toggleFullscreen,
      toggleMute,
      togglePlay,
      volume
    ]
  );

  const retry = () => {
    setAttempt((value) => value + 1);
    poke();
  };

  const displayCurrent = scrubbing ?? current;
  const fraction = progressFraction(displayCurrent, duration);
  const remaining = formatRemaining(displayCurrent, duration);
  const visible = chromeVisible({
    playing,
    hoveringChrome: hoverChrome,
    focusWithin,
    scrubbing: scrubbing !== null,
    idleMs
  });
  useEffect(() => {
    if (!visible) setCaptionMenuOpen(false);
  }, [visible]);

  const volumeIcon = volumeState(volume, muted);
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;

  return (
    <div
      ref={rootRef}
      className="cv-player"
      role="group"
      aria-roledescription={t('cvPlayer')}
      aria-label={video.title}
      tabIndex={0}
      data-status={status}
      data-chrome={visible ? 'shown' : 'hidden'}
      data-playing={playing ? 'true' : 'false'}
      onPointerMove={poke}
      onPointerDown={poke}
      onKeyDown={onKeyDown}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={() => setFocusWithin(false)}
    >
      <div className="cv-engine" ref={mountRef} aria-hidden="true" />

      {status === 'ready' ? (
        <div
          className="cv-surface"
          aria-hidden="true"
          onClick={() => {
            // The first tap on a faded player only brings the chrome back, so nobody
            // pauses the video by accident while looking for the controls.
            if (!visible) {
              poke();
              return;
            }
            togglePlay();
          }}
        />
      ) : null}

      <div className="cv-top" data-visible={visible ? 'true' : 'false'}>
        <p className="cv-title" title={video.title}>
          {video.title}
        </p>
        {onClose ? (
          <button type="button" className="cv-glass cv-icon" onClick={onClose} aria-label={t('ssClosePlayer')}>
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {status === 'loading' ? (
        <div className="cv-state" role="status">
          <span className="ss-spinner" aria-hidden="true" />
          <p>{t('ssPlayerLoading')}</p>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="cv-state cv-state-error" role="alert">
          <AlertTriangle size={22} aria-hidden="true" />
          <p>{t('ssPlayerError')}</p>
          <div className="cv-state-actions">
            <button type="button" className="cv-glass cv-pill" onClick={retry}>
              <RefreshCw size={15} aria-hidden="true" />
              {t('ssTryPlayer')}
            </button>
            <a className="cv-glass cv-pill" href={watchUrl} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={15} aria-hidden="true" />
              {t('ssOpenYouTube')}
            </a>
          </div>
        </div>
      ) : null}

      {status === 'ready' ? (
        <>
          <div
            className="cv-bottom"
            data-visible={visible ? 'true' : 'false'}
            onPointerEnter={() => setHoverChrome(true)}
            onPointerLeave={() => {
              setHoverChrome(false);
              poke();
            }}
          >
            <div
              className="cv-timeline-wrap"
              onPointerMove={(event) => {
                if (!duration) return;
                const rect = event.currentTarget.getBoundingClientRect();
                if (!rect.width) return;
                const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                setHint({ left: ratio * 100, time: ratio * duration });
              }}
              onPointerLeave={() => setHint(null)}
            >
              <div className="cv-timeline-rail" aria-hidden="true">
                <div className="cv-timeline-buffer" style={{ width: `${Math.min(100, buffered * 100)}%` }} />
                <div className="cv-timeline-played" style={{ width: `${fraction * 100}%` }} />
              </div>
              <input
                className="cv-timeline"
                type="range"
                min={0}
                max={duration > 0 ? Math.floor(duration) : 0}
                step={1}
                value={Math.floor(displayCurrent)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setScrubbing(next);
                  applySeek(next);
                }}
                onPointerUp={() => setScrubbing(null)}
                onBlur={() => setScrubbing(null)}
                aria-label={t('cvTimeline')}
                aria-valuetext={timelineValueText(displayCurrent, duration)}
                disabled={!duration}
              />
              {hint ? (
                <span className="cv-timeline-hint" style={{ left: `${hint.left}%` }} aria-hidden="true">
                  {formatClock(hint.time)}
                </span>
              ) : null}
            </div>

            <div className="cv-row">
              <div className="cv-cluster">
                <button
                  type="button"
                  className="cv-glass cv-icon cv-play"
                  onClick={togglePlay}
                  aria-label={playing ? t('cvPause') : t('cvPlay')}
                >
                  {playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="cv-glass cv-pill cv-skip"
                  onClick={() => applySeek(current - SKIP_SECONDS)}
                  aria-label={t('cvBack15')}
                  disabled={!caps.seek}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  <span>15</span>
                </button>
                <button
                  type="button"
                  className="cv-glass cv-pill cv-skip"
                  onClick={() => applySeek(current + SKIP_SECONDS)}
                  aria-label={t('cvForward15')}
                  disabled={!caps.seek}
                >
                  <RotateCw size={16} aria-hidden="true" />
                  <span>15</span>
                </button>
              </div>

              <div className="cv-times">
                <span className="cv-time">{formatClock(displayCurrent)}</span>
                <span className="cv-time-sep" aria-hidden="true">
                  /
                </span>
                <span className="cv-time cv-time-left" title={t('cvRemaining')}>
                  <span className="cv-sr">{t('cvRemaining')} </span>
                  {remaining}
                </span>
              </div>

              <div className="cv-cluster cv-cluster-end">
                {caps.volume ? (
                  <div className="cv-volume">
                    <button
                      type="button"
                      className="cv-glass cv-icon"
                      onClick={toggleMute}
                      aria-label={muted ? t('cvUnmute') : t('cvMute')}
                    >
                      {volumeIcon === 'muted' ? (
                        <VolumeX size={18} aria-hidden="true" />
                      ) : volumeIcon === 'low' ? (
                        <Volume1 size={18} aria-hidden="true" />
                      ) : (
                        <Volume2 size={18} aria-hidden="true" />
                      )}
                    </button>
                    <input
                      className="cv-volume-slider"
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={muted ? 0 : volume}
                      onChange={(event) => applyVolume(Number(event.target.value))}
                      aria-label={t('cvVolume')}
                      aria-valuetext={`${muted ? 0 : volume}%`}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="cv-glass cv-icon"
                    onClick={toggleMute}
                    aria-label={muted ? t('cvUnmute') : t('cvMute')}
                  >
                    {volumeIcon === 'muted' ? (
                      <VolumeX size={18} aria-hidden="true" />
                    ) : (
                      <Volume2 size={18} aria-hidden="true" />
                    )}
                  </button>
                )}
                {caps.captions ? (
                  <div className="cv-captions">
                    <button
                      type="button"
                      className="cv-glass cv-icon"
                      onClick={toggleCaptions}
                      aria-label={t('cvCaptions')}
                      aria-haspopup={captionTracks.length > 1 ? 'true' : undefined}
                      aria-expanded={captionTracks.length > 1 ? captionMenuOpen : undefined}
                      {...(captionStateKnown ? { 'aria-pressed': captionsOn } : {})}
                    >
                      <Captions size={18} aria-hidden="true" />
                    </button>
                    {captionMenuOpen && captionTracks.length > 1 ? (
                      <div className="cv-captions-menu" role="group" aria-label={t('cvCaptions')}>
                        <button
                          type="button"
                          className="cv-captions-option"
                          onClick={() => selectCaptionTrack(null)}
                          aria-pressed={!captionsOn}
                        >
                          {t('cvCaptionsOff')}
                        </button>
                        {captionTracks.map((track) => (
                          <button
                            key={track.languageCode}
                            type="button"
                            className="cv-captions-option"
                            lang={track.languageCode}
                            onClick={() => selectCaptionTrack(track.languageCode)}
                            aria-pressed={captionsOn && activeCaption === track.languageCode}
                          >
                            {track.languageName}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <button type="button" className="cv-glass cv-icon" onClick={() => void share()} aria-label={t('cvShare')}>
                  <Share2 size={18} aria-hidden="true" />
                </button>
                {caps.fullscreen ? (
                  <button
                    type="button"
                    className="cv-glass cv-icon"
                    onClick={() => void toggleFullscreen()}
                    aria-label={fullscreen ? t('cvExitFullscreen') : t('cvFullscreen')}
                  >
                    {fullscreen ? <Minimize size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}
                  </button>
                ) : null}
              </div>
            </div>

            <p className="cv-keyhint" aria-hidden="true">
              {t('cvKeyboardHint')}
            </p>
          </div>

          <span className="cv-sr" aria-live="polite">
            {playing ? t('cvPlaying') : t('cvPaused')}
          </span>
          {toast ? (
            <p className="cv-toast" role="status">
              {toast}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
