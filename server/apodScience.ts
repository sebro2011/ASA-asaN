/** Conservative, date-matched NASA Science APOD image-article fallback. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BASE = 'https://science.nasa.gov/wp-json/wp/v2';
const SOURCE = 'NASA Science APOD archive';

function plain(value: string): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|ldquo|rdquo);/gi, (all, entity) => {
      const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
      if (entity[0] !== '#') return named[entity.toLowerCase()] ?? all;
      const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
    }).replace(/\s+/g, ' ').trim();
}

function validUrl(value: unknown, host: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password && !url.port ? url.toString() : null;
  } catch { return null; }
}

/**
 * WordPress payloads, narrowed to the fields read below. Every one is optional
 * and re-validated (`validUrl`, `typeof`, `Number.isSafeInteger`) before use, so
 * the cast in `readJson` describes the intent rather than trusting the source.
 */
interface WpPost {
  title?: { rendered?: string };
  link?: string;
  content?: { rendered?: string };
  featured_media?: number;
}
interface WpMedia {
  id?: number;
  source_url?: string;
  media_type?: string;
  mime_type?: string;
}

/** The one place untyped JSON becomes typed; `?type=media` matters: this is NASA's CMS. */
async function readJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(3000), redirect: 'error', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('NASA Science unavailable');
  const size = Number(response.headers.get('content-length'));
  if (size > 1_500_000) throw new Error('NASA Science response too large');
  const raw = await response.text();
  if (raw.length > 1_500_000) throw new Error('NASA Science response too large');
  return JSON.parse(raw) as T;
}

export async function fetchScienceApod(date: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<Record<string, unknown> | null> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (!MONTHS[month - 1] || day < 1 || day > 31) return null;
  try {
    // Search can match body text or neighboring dates; compare the full title
    // date, never the WordPress publication timestamp (which can be an import date).
    const params = new URLSearchParams({ search: `APOD ${year} ${MONTHS[month - 1]} ${day}`, per_page: '20', _fields: 'id,link,title,content,featured_media' });
    const posts = await readJson<WpPost[]>(`${BASE}/image-article?${params}`, fetchImpl);
    if (!Array.isArray(posts)) return null;
    const expected = new RegExp(`^APOD:\\s*${year}\\s+${MONTHS[month - 1]}\\s+0?${day}\\s*[–—-]\\s*(.+)$`, 'i');
    const candidates = posts.flatMap((post) => {
      if (typeof post?.title?.rendered !== 'string') return [];
      const title = expected.exec(plain(post.title.rendered));
      return title ? [{ post, title: title[1] }] : [];
    });
    if (candidates.length !== 1) return null;
    const { post, title } = candidates[0];
    const articleUrl = validUrl(post.link, 'science.nasa.gov');
    const html = post.content?.rendered;
    const mediaId = post.featured_media;
    // `Number.isSafeInteger(undefined)` is false, so the guard is the same check
    // as before — it just has to be on a local for the type to follow it.
    if (!articleUrl || !new URL(articleUrl).pathname.startsWith('/image-article/apod-') || typeof mediaId !== 'number' || !Number.isSafeInteger(mediaId) || mediaId <= 0 || typeof html !== 'string' || html.length > 500_000) return null;
    // Featured images can be thumbnails for videos. Do not treat an embedded
    // video as the actual APOD image; leave unsupported records unavailable.
    if (/<(?:iframe|video|object|embed)\b|(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(html)) return null;
    const explanationMatch = /Explanation:\s*(?:<\/(?:strong|b)>\s*)?([\s\S]*?)<\/p\s*>/i.exec(html);
    const explanation = explanationMatch ? plain(explanationMatch[1]) : '';
    if (!title || title.length > 500 || explanation.length < 20 || explanation.length > 15000) return null;
    const media = await readJson<WpMedia>(`${BASE}/media/${mediaId}?_fields=id,source_url,media_type,mime_type`, fetchImpl);
    const image = validUrl(media?.source_url, 'assets.science.nasa.gov');
    if (media?.id !== mediaId || media.media_type !== 'image' || typeof media.mime_type !== 'string' || !/^image\/(jpeg|png|gif|webp)$/i.test(media.mime_type) || !image || !new URL(image).pathname.toLowerCase().includes('/apod/')) return null;
    return { date, title, explanation, media_type: 'image', url: image, source: SOURCE, source_url: articleUrl, media_note: 'NASA Science featured image; check the original record for media and credits.' };
  } catch { return null; }
}
