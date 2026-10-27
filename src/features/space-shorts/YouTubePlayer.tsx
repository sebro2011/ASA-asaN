import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import type { SpaceVideo } from './types';

type PlayerInstance = {
  destroy: () => void;
  mute: () => void;
  playVideo: () => void;
  getIframe: () => HTMLIFrameElement;
};
type YouTubeApi = { Player: new (element: HTMLElement, options: Record<string, unknown>) => PlayerInstance };
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | null = null;

/** Load the official API only after a viewer explicitly starts a video. */
function loadPlayerApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    let script = document.querySelector<HTMLScriptElement>('script[data-space-youtube-api]');
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error || !window.YT?.Player) {
        script?.remove();
        reject(error || new Error('YouTube player unavailable'));
      } else resolve(window.YT);
    };
    const timeout = window.setTimeout(() => finish(new Error('YouTube player timed out')), 12000);
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      finish();
    };
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.spaceYoutubeApi = 'true';
      script.onerror = () => finish(new Error('YouTube player blocked'));
      document.head.appendChild(script);
    }
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

export default function YouTubePlayer({ video }: { video: SpaceVideo }) {
  const { t } = useTranslation();
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let player: PlayerInstance | undefined;
    const mount = mountRef.current;
    setStatus('loading');
    if (!mount || !/^[A-Za-z0-9_-]{11}$/.test(video.id)) {
      setStatus('error');
      return;
    }
    loadPlayerApi().then((api) => {
      if (cancelled) return;
      const element = document.createElement('div');
      mount.replaceChildren(element);
      player = new api.Player(element, {
        host: 'https://www.youtube-nocookie.com',
        width: '100%',
        height: '100%',
        videoId: video.id,
        playerVars: {
          autoplay: 1, mute: 1, playsinline: 1, controls: 1, rel: 0,
          cc_load_policy: 1, origin: window.location.origin
        },
        events: {
          onReady: (event: { target: PlayerInstance }) => {
            if (cancelled) return;
            event.target.getIframe().title = video.title;
            event.target.mute();
            event.target.playVideo();
            setStatus('ready');
          },
          onError: () => { if (!cancelled) setStatus('error'); }
        }
      });
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => {
      cancelled = true;
      player?.destroy();
      mount.replaceChildren();
    };
  }, [video.id, video.title, attempt]);

  return (
    <div className="absolute inset-0 bg-black">
      <div ref={mountRef} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-[#07111f] p-5 text-center" role="status">
          <div><span className="ss-spinner mx-auto mb-3 block" /><span className="text-xs text-ink-2">{t('ssPlayerLoading')}</span></div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07111f] p-6 text-center" role="alert">
          <AlertTriangle className="h-7 w-7 text-caution" aria-hidden="true" />
          <p className="max-w-xs text-sm leading-relaxed text-ink-2">{t('ssPlayerError')}</p>
          <button type="button" className="ss-secondary-action" onClick={() => setAttempt((value) => value + 1)}>
            <RefreshCw size={15} aria-hidden="true" /> {t('ssTryPlayer')}
          </button>
          <a className="ss-text-link" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer">
            {t('ssOpenYouTube')} <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
