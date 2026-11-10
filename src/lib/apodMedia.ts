/**
 * APOD media resolution.
 *
 * NASA's `media_type` is not enough on its own to render an entry:
 *
 *  - older records still carry `http://` URLs, which an HTTPS page blocks as
 *    mixed content (the page CSP allows `https:` only), so the image silently
 *    never appears;
 *  - a `video` entry is usually a YouTube **watch** URL, and YouTube refuses to
 *    be framed, so a naive `<iframe src={url}>` renders an empty box;
 *  - some entries are direct `.mp4` files, which need `<video>`, not `<iframe>`;
 *  - `thumbnail_url` is the only usable still for a video entry.
 *
 * This module turns those cases into one decision the UI can render, with no
 * network and no guessing: anything unrecognised falls back to the thumbnail or
 * a plain link, and never to a blank box.
 */

export type ApodPlaybackKind = 'image' | 'embed' | 'video' | 'link';

export interface ApodPlaybackInput {
  url?: string;
  hdurl?: string;
  thumbnail_url?: string;
  media_type?: string;
  title?: string;
}

export interface ApodPlayback {
  kind: ApodPlaybackKind;
  /** Candidate sources in order: the browser falls through them on error. */
  sources: string[];
  /** Frame URL for `kind: 'embed'`. */
  embedUrl?: string;
  /** Poster for `kind: 'video'`. */
  poster?: string;
  /** Always the URL a user can open to see the original. */
  originalUrl: string;
}

const YOUTUBE_ID = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i;
const YOUTUBE_HOST = /(?:^|\.)youtube(?:-nocookie)?\.com$|^youtu\.be$/i;
const DIRECT_VIDEO = /\.(mp4|webm|ogv|ogg|m4v)(?:$|[?#])/i;

/** Upgrades the `http://` URLs NASA still returns for older entries. */
export function httpsUrl(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^http:\/\//i, 'https://');
}

/** `https://www.youtube.com/watch?v=abc123` → `https://www.youtube.com/embed/abc123`. */
export function youtubeEmbedUrl(url: string): string | undefined {
  const match = YOUTUBE_ID.exec(url);
  if (!match) return undefined;
  return `https://www.youtube.com/embed/${match[1]}`;
}

function isYoutube(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return YOUTUBE_HOST.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Resolves one APOD record into something renderable.
 *
 * `sources` is ordered best-first and de-duplicated, so the UI can move to the
 * next candidate when a URL 404s instead of showing a broken image.
 */
export function resolveApodPlayback(record: ApodPlaybackInput): ApodPlayback {
  const url = httpsUrl(record.url);
  const hdurl = httpsUrl(record.hdurl);
  const thumbnail = httpsUrl(record.thumbnail_url);
  const mediaType = String(record.media_type || 'image').toLowerCase();
  const originalUrl = url || hdurl || thumbnail || 'https://apod.nasa.gov/apod/astropix.html';

  if (!url && !hdurl && !thumbnail) {
    return { kind: 'link', sources: [], originalUrl };
  }

  if (mediaType === 'video') {
    if (url && isYoutube(url)) {
      const embedUrl = youtubeEmbedUrl(url);
      if (embedUrl) return { kind: 'embed', sources: [embedUrl], embedUrl, poster: thumbnail, originalUrl: url };
      // A YouTube URL we cannot parse is not framable either — use the still.
      return thumbnail
        ? { kind: 'image', sources: [thumbnail], originalUrl: url }
        : { kind: 'link', sources: [], originalUrl: url };
    }
    if (url && DIRECT_VIDEO.test(url)) {
      return { kind: 'video', sources: [url], poster: thumbnail, originalUrl: url };
    }
    // Vimeo/other players are not embeddable under our CSP frame-src, so show
    // the still and link out rather than an iframe that would be blocked.
    return thumbnail
      ? { kind: 'image', sources: [thumbnail], originalUrl: url || thumbnail }
      : { kind: 'link', sources: [], originalUrl: url || thumbnail || originalUrl };
  }

  if (mediaType === 'image') {
    const sources = [hdurl, url, thumbnail].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
    return { kind: 'image', sources, originalUrl: originalUrl };
  }

  // Anything else (older `other`, or an unlabelled record): stills first.
  const sources = [url, thumbnail].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  if (sources.length && sources.some((source) => /\.(jpe?g|png|webp|gif|avif)(?:$|[?#])/i.test(source))) {
    return { kind: 'image', sources, originalUrl: originalUrl };
  }
  return sources.length
    ? { kind: 'image', sources, originalUrl }
    : { kind: 'link', sources: [], originalUrl };
}
