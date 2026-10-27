/** Parse supported public YouTube links without ever fetching or embedding the supplied URL. */
export function youtubeIdFromUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048 || input !== input.trim() || /[\u0000-\u0020\u007f\\]/u.test(input)) return null;
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const idPattern = /^[A-Za-z0-9_-]{11}$/;
  let id: string | null = null;
  if (url.hostname === 'youtu.be') {
    const match = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
    id = match?.[1] ?? null;
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') {
      const values = url.searchParams.getAll('v');
      id = values.length === 1 ? values[0] : null;
    } else {
      const match = /^\/shorts\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
      id = match?.[1] ?? null;
    }
  }
  return id && idPattern.test(id) ? id : null;
}
