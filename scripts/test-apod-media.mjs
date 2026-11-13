/**
 * APOD media — the paths that used to fail silently.
 *
 * The reported bug was "the APOD image does not render". Three code paths could
 * produce that with no error anywhere, so each one gets a test:
 *
 *   1. NASA returns `http://` URLs → the HTTPS page blocks them (mixed content).
 *   2. A `video` entry is a YouTube *watch* URL → an iframe of it is refused.
 *   3. A URL that 404s → the panel stayed empty with no explanation.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-apod-media.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

import { httpsUrl, resolveApodPlayback, youtubeEmbedUrl } from '../src/lib/apodMedia.ts';
import { normaliseApodMedia } from '../server/nasaRoutes.ts';

/* ------------------------------------------------------------ pure helpers */

test('http URLs are upgraded — mixed content is what blocked the image', () => {
  assert.equal(httpsUrl('http://apod.nasa.gov/apod/image/2501/pillars.jpg'), 'https://apod.nasa.gov/apod/image/2501/pillars.jpg');
  assert.equal(httpsUrl('https://apod.nasa.gov/apod/image/2501/pillars.jpg'), 'https://apod.nasa.gov/apod/image/2501/pillars.jpg');
  assert.equal(httpsUrl('   '), undefined);
  assert.equal(httpsUrl(undefined), undefined);
});

test('a YouTube watch URL becomes an embed, and youtu.be too', () => {
  assert.equal(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(youtubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(youtubeEmbedUrl('https://example.com/not-youtube'), undefined);
});

test('an image record offers HD, standard and thumbnail, best first', () => {
  const playback = resolveApodPlayback({
    media_type: 'image',
    url: 'http://apod.nasa.gov/apod/image/2501/a.jpg',
    hdurl: 'http://apod.nasa.gov/apod/image/2501/a_hd.jpg',
    thumbnail_url: 'https://apod.nasa.gov/apod/image/2501/a_thumb.jpg',
  });
  assert.equal(playback.kind, 'image');
  assert.deepEqual(playback.sources, [
    'https://apod.nasa.gov/apod/image/2501/a_hd.jpg',
    'https://apod.nasa.gov/apod/image/2501/a.jpg',
    'https://apod.nasa.gov/apod/image/2501/a_thumb.jpg',
  ]);
  assert.equal(playback.originalUrl, 'https://apod.nasa.gov/apod/image/2501/a.jpg');
});

test('a YouTube video entry is embedded with its thumbnail as poster', () => {
  const playback = resolveApodPlayback({
    media_type: 'video',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    thumbnail_url: 'https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg',
  });
  assert.equal(playback.kind, 'embed');
  assert.equal(playback.embedUrl, 'https://www.youtube.com/embed/abcdefghijk');
  assert.equal(playback.poster, 'https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg');
});

test('a direct mp4 uses <video>, not an iframe', () => {
  const playback = resolveApodPlayback({
    media_type: 'video',
    url: 'https://example.nasa.gov/media/entry.mp4',
    thumbnail_url: 'https://example.nasa.gov/media/entry.jpg',
  });
  assert.equal(playback.kind, 'video');
  assert.equal(playback.poster, 'https://example.nasa.gov/media/entry.jpg');
});

test('an unembeddable video falls back to its still, never a blocked iframe', () => {
  const withStill = resolveApodPlayback({
    media_type: 'video',
    url: 'https://player.vimeo.com/video/123456789',
    thumbnail_url: 'https://example.nasa.gov/still.jpg',
  });
  assert.equal(withStill.kind, 'image');
  assert.deepEqual(withStill.sources, ['https://example.nasa.gov/still.jpg']);

  const withoutStill = resolveApodPlayback({ media_type: 'video', url: 'https://player.vimeo.com/video/123456789' });
  assert.equal(withoutStill.kind, 'link');
});

test('a record with no usable URL is a link, not a blank box', () => {
  const playback = resolveApodPlayback({ media_type: 'image', title: 'Broken' });
  assert.equal(playback.kind, 'link');
  assert.deepEqual(playback.sources, []);
  assert.match(playback.originalUrl, /apod\.nasa\.gov/);
});

test('the server normaliser strips an unusable url and keeps the rest', () => {
  const record = normaliseApodMedia({
    title: 'Entry',
    url: 'http://apod.nasa.gov/apod/image/a.jpg',
    hdurl: 'http://apod.nasa.gov/apod/image/a_hd.jpg',
    thumbnail_url: '',
    media_type: 'image',
  });
  assert.equal(record.url, 'https://apod.nasa.gov/apod/image/a.jpg');
  assert.equal(record.hdurl, 'https://apod.nasa.gov/apod/image/a_hd.jpg');
  assert.equal('thumbnail_url' in record, false);

  const unusable = normaliseApodMedia({ title: 'x', url: 'ftp://example.com/a.jpg' });
  assert.equal('url' in unusable, false, 'a scheme the browser cannot render is dropped');
});

/* ------------------------------------------------------- server behaviour */

test('a bundled fixture is never served as cached NASA data', async () => {
  const { app } = await import('../server.ts');
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  // The claim under test is "when NASA cannot answer, the fixture is not passed
  // off as a cache hit". Relying on this machine's egress to fail made the test
  // pass only where the network was blocked: on a CI runner with internet the
  // request could succeed. The outage is stubbed so the test proves the
  // behaviour rather than the environment.
  //
  // Both upstreams must be stubbed. When the legacy APOD API fails the route
  // legitimately tries the official NASA Science record, so a runner with
  // internet answers 200 from that source and the outage never happens.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('api.nasa.gov') || href.includes('science.nasa.gov')) {
      throw new TypeError('fetch failed: stubbed NASA outage');
    }
    return realFetch(url, init);
  };
  try {
    const { port } = server.address();
    // This date is one of the bundled fixtures. It used to answer
    // `{ cached: true }` and skip NASA entirely.
    const response = await fetch(`http://127.0.0.1:${port}/api/apod?date=2026-09-30`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json();
    assert.equal(body.cached, undefined, 'a placeholder is never labelled as a cache hit');
    assert.equal(response.status, 503);
    assert.equal(body.code, 'APOD_UNAVAILABLE');
    assert.equal(body.data, null);
    assert.ok(body.hint, 'and it explains why');
  } finally {
    globalThis.fetch = realFetch;
    server.close();
  }
});

/* ------------------------------------------------------------------- DOM */

function installDom() {
  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: false,
  });
  const { window } = dom;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  for (const [key, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  })) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

const APOD_BASE = {
  date: '2026-11-08',
  title: 'A real entry',
  explanation: 'Explanation text.',
  media_type: 'image',
  url: 'https://apod.nasa.gov/apod/image/a.jpg',
  hdurl: 'https://apod.nasa.gov/apod/image/a_hd.jpg',
};

test('the home panel falls back to the thumbnail, then says the image failed', async () => {
  const dom = installDom();
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { I18nextProvider } = await import('react-i18next');
    const { default: i18n } = await import('../src/i18n.ts');
    const { ApodMedia } = await import('../src/pages/home/MissionOverview.tsx');

    const container = document.getElementById('root');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(I18nextProvider, { i18n }, React.createElement(ApodMedia, { apod: { ...APOD_BASE, thumbnail_url: 'https://apod.nasa.gov/apod/image/a_thumb.jpg' } })),
      );
    });

    const image = container.querySelector('[data-testid="apod-media"]');
    assert.ok(image, 'the image element is rendered');
    assert.equal(image.getAttribute('src'), 'https://apod.nasa.gov/apod/image/a.jpg');

    // A failed main URL retries the thumbnail rather than showing nothing.
    await act(async () => {
      image.dispatchEvent(new dom.window.Event('error'));
    });
    const retried = container.querySelector('[data-testid="apod-media"]');
    assert.equal(retried.getAttribute('src'), 'https://apod.nasa.gov/apod/image/a_thumb.jpg');

    // When that fails too, the panel explains itself and links to the original.
    await act(async () => {
      retried.dispatchEvent(new dom.window.Event('error'));
    });
    const message = container.querySelector('[data-testid="apod-media-unavailable"]');
    assert.ok(message, 'a broken URL produces a message, not an empty panel');
    assert.match(message.textContent, /could not be loaded/i);
    const link = container.querySelector('a[href="https://apod.nasa.gov/apod/image/a.jpg"]');
    assert.ok(link, 'the original is always reachable');

    await act(async () => root.unmount());
  } finally {
    dom.window.close();
  }
});

test('a video entry shows its still on the home panel', async () => {
  const dom = installDom();
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { I18nextProvider } = await import('react-i18next');
    const { default: i18n } = await import('../src/i18n.ts');
    const { ApodMedia } = await import('../src/pages/home/MissionOverview.tsx');

    const container = document.getElementById('root');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(I18nextProvider, { i18n }, React.createElement(ApodMedia, {
          apod: {
            ...APOD_BASE,
            media_type: 'video',
            url: 'https://www.youtube.com/watch?v=abcdefghijk',
            thumbnail_url: 'https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg',
          },
        })),
      );
    });

    const image = container.querySelector('[data-testid="apod-media"]');
    assert.ok(image, 'a video entry is not a blank box');
    assert.equal(image.getAttribute('src'), 'https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg');
    assert.match(container.textContent, /video, not a still image/i);
    const link = container.querySelector('a[href="https://www.youtube.com/watch?v=abcdefghijk"]');
    assert.ok(link, 'the player is one click away');

    await act(async () => root.unmount());
  } finally {
    dom.window.close();
  }
});

test('the NASA logo is rejected as the day’s picture, and said so plainly', async () => {
  const { isDegradedApodRecord, apodFallbackHint } = await import('../server/nasaRoutes.ts');

  // Measured live on 2026-11-11: api.nasa.gov answered with this.
  const degraded = {
    date: '2026-11-10',
    title: 'NASA Science',
    url: 'https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png',
    hdurl: 'https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png',
    media_type: 'image',
    explanation: 'Sometimes Saturn disappears…',
  };
  assert.equal(isDegradedApodRecord(degraded), true);

  // A real entry is untouched.
  const real = {
    date: '2026-11-09',
    title: 'Saturn and the Moon',
    url: 'https://apod.nasa.gov/apod/image/2511/saturn.jpg',
    hdurl: 'https://apod.nasa.gov/apod/image/2511/saturn_hd.jpg',
    media_type: 'image',
  };
  assert.equal(isDegradedApodRecord(real), false);
  assert.equal(isDegradedApodRecord(null), false);

  // Only the logo URL, without the site title, is still degraded.
  assert.equal(isDegradedApodRecord({ ...real, url: degraded.url }), true);

  const hint = apodFallbackHint({ failureKind: 'degraded', upstreamStatus: 200, usingDemoKey: false });
  assert.match(hint, /site logo/);
  assert.match(hint, /retry later/i);
  assert.doesNotMatch(hint, /did not answer in time/);
});
