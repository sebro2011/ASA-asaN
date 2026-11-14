/**
 * The one loader for the official YouTube IFrame Player API.
 *
 * This module is a verbatim extraction of the loader that used to live inside
 * `YouTubePlayer.tsx`, extended with the methods the cinematic chrome needs. The
 * playback engine is unchanged on purpose: same official API, same
 * `youtube-nocookie.com` host, same lazy load (only after an explicit play), same
 * 12 s script timeout and 15 s ready timeout, same single retry path. Nothing here
 * talks to a Google API with a key, and no new dependency was added.
 */

export const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5
} as const;

/** Only the members this integration actually calls. */
export interface YouTubePlayerInstance {
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoLoadedFraction: () => number;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  /** Present on the iframe API; guarded at every call site. */
  setOption?: (module: string, option: string, value: unknown) => void;
  loadModule?: (module: string) => void;
  unloadModule?: (module: string) => void;
}

export interface YouTubePlayerEvent {
  target: YouTubePlayerInstance;
  data?: number;
}

export interface YouTubeApi {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayerInstance;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | null = null;

/** Load the official API only after a viewer explicitly starts a video. */
export function loadPlayerApi(): Promise<YouTubeApi> {
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
