/**
 * Optional real-browser smoke test. Start `npm run dev` first. Install
 * playwright-core and a Chromium executable separately; run against a server
 * with YOUTUBE_API_KEY unset (see docs/space-shorts.md).
 * The YouTube iframe API is mocked; no API key or third-party network is needed.
 */
import assert from 'node:assert/strict';
import { chromium as playwright } from 'playwright-core';

let executablePath = process.env.CHROMIUM_PATH;
let args = ['--no-sandbox'];
if (!executablePath) {
  const chromium = (await import('@sparticuz/chromium')).default;
  executablePath = await chromium.executablePath();
  args = chromium.args;
}
const base = process.env.SPACE_TEST_BASE || 'http://127.0.0.1:3000';
const mockApi = `
  window.__spacePlayers = {created: [], destroyed: [], muted: 0, played: 0};
  window.YT = {Player: class {
    constructor(element, options) {
      this.id = options.videoId;
      this.frame = document.createElement('iframe');
      element.replaceWith(this.frame);
      window.__spacePlayers.created.push({id: options.videoId, host: options.host, vars: options.playerVars});
      setTimeout(() => {
        options.events.onReady({target: this});
        if (this.id === 'TseGuyuVWKM') options.events.onError({data: 101});
      }, 0);
    }
    getIframe() { return this.frame; }
    mute() { window.__spacePlayers.muted++; }
    playVideo() { window.__spacePlayers.played++; }
    destroy() { window.__spacePlayers.destroyed.push(this.id); this.frame.remove(); }
  }};
  window.onYouTubeIframeAPIReady();
`;

let browser = await playwright.launch({ executablePath, args, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
const pageErrors = [];
const browserRequests = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => browserRequests.push({ url: request.url(), headers: request.headers() }));
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url === 'https://www.youtube.com/iframe_api') return route.fulfill({ status: 200, contentType: 'application/javascript', body: mockApi });
  if (url.startsWith(base) || url.startsWith('data:')) return route.continue();
  return route.abort();
});

try {
  await page.goto(`${base}/space-shorts`, { waitUntil: 'domcontentloaded' });
  // The first-visit welcome from the app shell must coexist with direct entry.
  const welcome = page.getByRole('dialog', { name: 'Welcome to your space observation deck' });
  await welcome.waitFor();
  await welcome.getByRole('button', { name: 'Skip', exact: true }).click();
  await welcome.waitFor({ state: 'hidden' });
  await page.locator('.ss-short-panel').waitFor();
  assert.equal(await page.locator('h1').innerText(), 'CosmoVision');
  await page.getByRole('button', { name: 'Replay welcome screen' }).click();
  await welcome.waitFor();
  await welcome.getByRole('button', { name: 'Skip', exact: true }).click();
  await welcome.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('iframe').count(), 0, 'no player before explicit interaction');
  assert.match(await page.locator('.ss-source-badge').innerText(), /STARTER COLLECTION/);
  assert.equal(await page.locator('.ss-mode-switch').getByRole('button', { name: 'Short videos', exact: true }).count(), 1);
  assert.match(await page.locator('.ss-disclaimers').innerText(), /official Shorts status may vary/);
  assert.equal(await page.locator('.ss-short-story .ss-channel-name').innerText(), 'Dr. Becky');
  assert.match(await page.locator('.ss-short-story .ss-source-link').getAttribute('href'), /^https:\/\/www\.thesciencechannel\.org\//);

  // Deep links, navigation and browser history work without changing legacy tab URLs.
  await page.getByRole('button', { name: 'NASA Space Explorer — home' }).click();
  await page.waitForURL(`${base}/`);
  await page.goBack();
  await page.waitForURL(`${base}/space-shorts`);
  await page.locator('.ss-short-panel').waitFor();
  await page.goForward();
  await page.waitForURL(`${base}/`);
  await page.locator('nav[aria-label="Primary"]').getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('menuitem', { name: /CosmoVision/ }).click();
  await page.waitForURL(`${base}/cosmovision`);
  await page.locator('.ss-short-panel').waitFor();

  // Language changes reach the new screen and survive reloads.
  await page.getByRole('button', { name: 'Language: English' }).click();
  await page.getByRole('menuitemradio', { name: /සිංහල/ }).click();
  await page.waitForFunction(() => document.documentElement.lang === 'si');
  assert.ok((await page.locator('.ss-mode-switch').innerText()).includes('කෙටි වීඩියෝ'));
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, 'Sinhala mobile layout');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.lang === 'si');
  await page.getByRole('button', { name: 'Language: Sinhala' }).click();
  await page.getByRole('menuitemradio', { name: /தமிழ்/ }).click();
  await page.waitForFunction(() => document.documentElement.lang === 'ta');
  assert.ok((await page.locator('.ss-mode-switch').innerText()).includes('குறுங்காணொளிகள்'));
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, 'Tamil mobile layout');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.lang === 'ta');
  await page.getByRole('button', { name: 'Language: Tamil' }).click();
  await page.getByRole('menuitemradio', { name: /English/ }).click();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.locator('.ss-short-panel').waitFor();

  // The focusable feed supports arrow keys without trapping normal input.
  await page.locator('.ss-short-panel').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('.ss-story-title')?.textContent.includes('South Pole'));
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => document.querySelector('.ss-story-title')?.textContent.includes('galactic archaeology'));

  // An explicitly started player is muted, uses the official privacy host,
  // and is destroyed before a new one replaces it. Errors expose a safe link.
  await page.locator('.ss-poster').click();
  await page.waitForFunction(() => window.__spacePlayers?.played === 1);
  let state = await page.evaluate(() => window.__spacePlayers);
  assert.equal(state.created[0].id, '1ifqd3n6ZFY');
  assert.equal(state.created[0].host, 'https://www.youtube-nocookie.com');
  assert.equal(state.created[0].vars.mute, 1);
  assert.equal(state.muted, 1);
  assert.equal(await page.locator('.ss-film-frame iframe').count(), 1);
  await page.getByRole('button', { name: 'Next video', exact: true }).click();
  await page.waitForFunction(() => window.__spacePlayers?.created.length === 2);
  state = await page.evaluate(() => window.__spacePlayers);
  assert.equal(state.created[1].id, 'KBPc_zyJICE');
  assert.deepEqual(state.destroyed, ['1ifqd3n6ZFY']);
  await page.locator('.ss-queue-item').last().click();
  await page.waitForFunction(() => window.__spacePlayers?.created.length === 3);
  await page.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  assert.equal(await page.locator('.ss-short-story .ss-channel-name').innerText(), 'Publisher not verified');
  assert.equal(await page.locator('.ss-film-frame iframe').count(), 1);
  assert.equal(await page.locator('.ss-film-frame a').getAttribute('href'), 'https://www.youtube.com/watch?v=TseGuyuVWKM');
  await page.getByRole('button', { name: 'Try player again', exact: true }).click();
  await page.waitForFunction(() => window.__spacePlayers?.created.length === 4);
  await page.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  await page.locator('.ss-queue-item').last().click();
  await page.waitForFunction(() => window.__spacePlayers?.created.length === 5);
  state = await page.evaluate(() => window.__spacePlayers);
  assert.equal(state.created[4].id, 'Is7z49LToNg', 'queue selection opens the other channel’s player');
  assert.equal(state.destroyed.filter((id) => id === 'TseGuyuVWKM').length, 2);
  assert.equal(await page.locator('.ss-short-story .ss-channel-name').innerText(), 'Astrum');
  assert.equal(await page.locator('iframe').count(), 1);
  await page.locator('.ss-mode-switch').getByRole('button', { name: 'Videos', exact: true }).click();
  await page.locator('.ss-video-card').first().waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(await page.locator('.ss-video-card').count(), 9);
  const publishers = await page.locator('.ss-video-card .ss-channel-name').allInnerTexts();
  for (const name of ['CrashCourse', 'NASA Goddard', 'PBS Space Time', 'European Space Agency, ESA']) assert.ok(publishers.includes(name));
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ss-video-card').length > 9);
  assert.equal(await page.locator('.ss-video-card').count(), 15);
  await page.locator('.ss-card-image').first().click();
  await page.locator('.ss-gallery-player iframe').waitFor();
  assert.match(await page.locator('.ss-gallery-player .ss-source-link').getAttribute('href'), /^https:\/\/thecrashcourse\.com\//);
  assert.equal(await page.locator('iframe').count(), 1);
  await page.getByRole('button', { name: 'Close player' }).click();
  assert.equal(await page.locator('iframe').count(), 0);

  // Search, category filters and empty state are driven by the server result.
  await page.locator('.ss-search input').fill('moon');
  const searched = page.waitForResponse((response) => response.url().includes('/api/space-videos?') && response.url().includes('q=moon'));
  await page.locator('.ss-search-submit').click();
  await searched;
  await page.waitForFunction(() => document.querySelectorAll('.ss-video-card').length === 3);
  const texts = await page.locator('.ss-video-card').allInnerTexts();
  assert.ok(texts.every((text) => /moon/i.test(text)));
  await page.locator('.ss-search input').fill('no-such-space-video');
  const empty = page.waitForResponse((response) => response.url().includes('q=no-such-space-video'));
  await page.locator('.ss-search-submit').click();
  await empty;
  await page.getByText('No videos found', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.locator('.ss-video-card').first().waitFor();
  await page.locator('.ss-topics').getByRole('button', { name: 'Earth', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ss-video-card').length === 1);
  assert.match(await page.locator('.ss-video-card').innerText(), /Earth/);
  await page.route('**/api/space-videos?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"upstream"}' }));
  await page.locator('.ss-topics').getByRole('button', { name: 'Missions', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Videos could not be loaded' }).waitFor();
  await page.unroute('**/api/space-videos?*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.locator('.ss-video-card').first().waitFor();
  await page.route('**/api/space-videos?*', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate-limit"}' }));
  await page.locator('.ss-topics').getByRole('button', { name: 'Universe', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Too many requests' }).waitFor();
  await page.unroute('**/api/space-videos?*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.locator('.ss-video-card').first().waitFor();

  // Mobile controls remain reachable without horizontal overflow.
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.equal(dimensions.scroll, dimensions.client, `no horizontal overflow at ${width}px`);
    if (width === 320) {
      const label = page.locator('nav[aria-label="Primary mobile"] button[aria-label="CosmoVision"] span').last();
      assert.equal(await label.innerText(), 'CosmoVision');
      assert.ok(await label.evaluate((element) => element.scrollWidth <= element.clientWidth), 'mobile brand label is not truncated');
    }
  }

  // Later-page failures keep the existing live items and a retry can append
  // the next page without duplicating videos.
  let moreAttempts = 0;
  await page.route('**/api/space-videos?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has('pageToken') && moreAttempts++ === 0) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"upstream"}' });
    }
    const first = { id: '0rHUDWjR5gg', title: 'Introduction to Astronomy', description: 'Explore the universe.', channelTitle: 'CrashCourse', officialAgency: false };
    const second = { id: 'TKM0P3XlMNA', title: 'The Solar System', description: 'Explore the planets.', channelTitle: 'CrashCourse', officialAgency: false };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(params.has('pageToken')
      ? { source: 'youtube', nextPageToken: null, items: [first, second] }
      : { source: 'youtube', nextPageToken: 'y.QUE', items: [first] }) });
  });
  await page.locator('.ss-topics').getByRole('button', { name: 'All topics', exact: true }).click();
  await page.locator('.ss-video-card').first().waitFor();
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'More videos could not be loaded' }).waitFor();
  assert.equal(await page.locator('.ss-video-card').count(), 1);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ss-video-card').length === 2);
  await page.unroute('**/api/space-videos?*');

  // Switching category during a slow continuation must cancel/ignore the old
  // page instead of appending stale results to the newly selected category.
  let releaseContinuation;
  let markContinuationStarted;
  let markContinuationFinished;
  const continuationReleased = new Promise((resolve) => { releaseContinuation = resolve; });
  const continuationStarted = new Promise((resolve) => { markContinuationStarted = resolve; });
  const continuationFinished = new Promise((resolve) => { markContinuationFinished = resolve; });
  await page.route('**/api/space-videos?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const initial = { id: '0rHUDWjR5gg', title: 'Old astronomy result', description: 'Explore the universe.', channelTitle: 'Creator', officialAgency: false };
    const fresh = { id: 'w-9gDALvMF4', title: 'Fresh Earth astronomy', description: 'Explore our planet.', channelTitle: 'Creator', officialAgency: false };
    const stale = { id: 'TKM0P3XlMNA', title: 'Stale continuation', description: 'Old page.', channelTitle: 'Creator', officialAgency: false };
    if (params.has('pageToken')) {
      markContinuationStarted();
      await continuationReleased;
      try {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'youtube', nextPageToken: null, items: [stale] }) });
      } catch { /* the browser may already have aborted this request */ }
      finally { markContinuationFinished(); }
      return;
    }
    const onEarth = params.get('category') === 'earth';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      source: 'youtube', nextPageToken: onEarth ? null : 'y.QUE', items: [onEarth ? fresh : initial]
    }) });
  });
  await page.locator('.ss-topics').getByRole('button', { name: 'Universe', exact: true }).click();
  await page.getByRole('button', { name: 'Old astronomy result', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await continuationStarted;
  try {
    await page.locator('.ss-topics').getByRole('button', { name: 'Earth', exact: true }).click();
    await page.getByRole('button', { name: 'Fresh Earth astronomy', exact: true }).waitFor();
  } finally {
    releaseContinuation();
  }
  await continuationFinished;
  await page.waitForTimeout(100); // let a delivered response reach React before asserting
  assert.equal(await page.getByRole('button', { name: 'Stale continuation', exact: true }).count(), 0);
  assert.equal(await page.locator('.ss-video-card').count(), 1);
  await page.unroute('**/api/space-videos?*');

  // An empty, filtered live page can still advance; untrusted citation URLs
  // cannot turn into links, and the metadata-filter limitation is disclosed.
  await page.route('**/api/space-videos?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const body = params.has('pageToken')
      ? { source: 'youtube', nextPageToken: null, items: [{
        id: '0rHUDWjR5gg', title: 'Introduction to Astronomy', description: 'Explore the universe.',
        channelTitle: 'CrashCourse', officialAgency: false, sourceUrl: 'https://www.pbs.org.evil.example/unsafe'
      }] }
      : { source: 'youtube', nextPageToken: 'NEXT_PAGE1', items: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.locator('.ss-topics').getByRole('button', { name: 'Missions', exact: true }).click();
  await page.getByText('No videos found', { exact: true }).waitFor();
  assert.match(await page.locator('.ss-disclaimers').innerText(), /filtered using titles and descriptions/);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await page.locator('.ss-video-card').first().waitFor();
  await page.locator('.ss-card-image').first().click();
  await page.locator('.ss-gallery-player iframe').waitFor();
  assert.equal(await page.locator('.ss-gallery-player .ss-source-link').count(), 0);
  assert.equal(await page.locator('.ss-gallery-player .ss-text-link').getAttribute('href'), 'https://www.youtube.com/watch?v=0rHUDWjR5gg');
  await page.locator('.ss-mode-switch').getByRole('button', { name: 'Short videos', exact: true }).click();
  await page.getByText('No videos found', { exact: true }).waitFor();
  assert.match(await page.locator('.ss-disclaimers').innerText(), /does not confirm portrait format or Shorts status/);
  await page.unroute('**/api/space-videos?*');
  assert.deepEqual(pageErrors, []);
  const searchRequests = browserRequests.filter((request) => new URL(request.url).pathname === '/api/space-videos');
  assert.ok(searchRequests.length > 0);
  for (const request of searchRequests) {
    const params = new URL(request.url).searchParams;
    assert.equal(params.has('key') || params.has('YOUTUBE_API_KEY'), false);
    assert.equal('x-goog-api-key' in request.headers, false);
  }
  assert.equal(browserRequests.some((request) => request.url.startsWith('https://www.googleapis.com/youtube/v3/')), false,
    'the browser must not call the YouTube Data API directly');

  // A blocked script must fail gracefully and allow the user to retry or open
  // YouTube instead of leaving a permanent loading indicator.
  const blocked = await browser.newPage({ serviceWorkers: 'block' });
  // This independent error-path page represents a returning visitor. Some
  // Chromium environments share storage between pages; seed it explicitly.
  await blocked.addInitScript(() => localStorage.setItem('nasa_welcome_preference_v1', JSON.stringify({ showOnStartup: false, dismissedAt: null })));
  let apiLoads = 0;
  await blocked.route('**/*', (route) => {
    const url = route.request().url();
    if (url === 'https://www.youtube.com/iframe_api') apiLoads++;
    return url.startsWith(base) || url.startsWith('data:') ? route.continue() : route.abort();
  });
  await blocked.goto(`${base}/space-shorts`, { waitUntil: 'domcontentloaded' });
  await blocked.locator('.ss-poster').waitFor();
  await blocked.locator('.ss-poster').click();
  await blocked.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  assert.equal(await blocked.locator('iframe').count(), 0);
  assert.equal(await blocked.locator('.ss-film-frame a').getAttribute('href'), 'https://www.youtube.com/watch?v=1ifqd3n6ZFY');
  const retryRequest = blocked.waitForRequest('https://www.youtube.com/iframe_api');
  await blocked.getByRole('button', { name: 'Try player again', exact: true }).click();
  await retryRequest;
  await blocked.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  assert.equal(apiLoads, 2);
  await blocked.close();
  // Some minimal Chromium builds exit when a disposable context is closed.
  // Isolate the watchdog scenarios in fresh browser processes.
  await browser.close();
  browser = await playwright.launch({ executablePath, args, headless: true });

  // A loaded iframe API can still produce a player that never becomes ready.
  // Speed up only the app's 15s watchdog for a deterministic test, then emit a
  // late onReady event to make sure it cannot restart a timed-out player.
  const stalled = await browser.newPage({ serviceWorkers: 'block' });
  await stalled.addInitScript(() => {
    localStorage.setItem('nasa_welcome_preference_v1', JSON.stringify({ showOnStartup: false, dismissedAt: null }));
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => schedule(fn, delay === 15000 ? 100 : delay, ...args);
  });
  const stalledApi = `
    window.__stalled = { created: 0, destroyed: 0, played: 0, late: 0, invalid: 0 };
    window.YT = { Player: class {
      constructor(element, options) {
        this.frame = document.createElement('iframe'); element.replaceWith(this.frame);
        window.__stalled.created++;
        if (window.__stalled.created === 1) {
          setTimeout(() => { window.__stalled.late++; options.events.onReady({ target: this }); }, 350);
        } else {
          setTimeout(() => {
            window.__stalled.invalid++;
            options.events.onReady({ target: { getIframe() { throw new Error('invalid iframe'); } } });
          }, 30);
        }
      }
      getIframe() { return this.frame; }
      mute() {}
      playVideo() { window.__stalled.played++; }
      destroy() { window.__stalled.destroyed++; this.frame.remove(); }
    }};
    window.onYouTubeIframeAPIReady();
  `;
  await stalled.route('**/*', (route) => {
    const url = route.request().url();
    if (url === 'https://www.youtube.com/iframe_api') return route.fulfill({ status: 200, contentType: 'application/javascript', body: stalledApi });
    return url.startsWith(base) || url.startsWith('data:') ? route.continue() : route.abort();
  });
  await stalled.goto(`${base}/cosmovision`, { waitUntil: 'domcontentloaded' });
  await stalled.locator('.ss-poster').click();
  await stalled.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  await stalled.waitForFunction(() => window.__stalled?.late === 1);
  assert.deepEqual(await stalled.evaluate(() => window.__stalled), { created: 1, destroyed: 1, played: 0, late: 1, invalid: 0 });
  assert.equal(await stalled.locator('.ss-film-frame iframe').count(), 0);
  assert.equal(await stalled.locator('.ss-film-frame a').getAttribute('href'), 'https://www.youtube.com/watch?v=1ifqd3n6ZFY');
  await stalled.getByRole('button', { name: 'Try player again', exact: true }).click();
  await stalled.waitForFunction(() => window.__stalled?.invalid === 1);
  await stalled.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  assert.equal(await stalled.evaluate(() => window.__stalled.played), 0);
  await stalled.close();
  await browser.close();
  browser = await playwright.launch({ executablePath, args, headless: true });

  // A stalled app-server response must leave loading state and permit retry.
  const slow = await browser.newPage({ serviceWorkers: 'block' });
  await slow.addInitScript(() => {
    localStorage.setItem('nasa_welcome_preference_v1', JSON.stringify({ showOnStartup: false, dismissedAt: null }));
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => schedule(fn, delay === 20000 ? 250 : delay, ...args);
  });
  await slow.route('**/*', (route) => {
    const url = route.request().url();
    return url.startsWith(base) || url.startsWith('data:') ? route.continue() : route.abort();
  });
  let delayFirstPage = true;
  await slow.route('**/api/space-videos?*', async (route) => {
    if (!delayFirstPage) return route.continue();
    delayFirstPage = false;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"source":"youtube","items":[],"nextPageToken":null}' }).catch(() => {});
  });
  await slow.goto(`${base}/cosmovision`, { waitUntil: 'domcontentloaded' });
  await slow.getByText('Finding videos…', { exact: true }).waitFor();
  await slow.getByRole('alert').filter({ hasText: 'Videos could not be loaded' }).waitFor();
  await slow.getByRole('button', { name: 'Try again', exact: true }).click();
  await slow.locator('.ss-short-panel').waitFor();
  await slow.waitForTimeout(800); // the aborted, delayed response must not overwrite the retry
  assert.equal(await slow.locator('.ss-short-panel').count(), 1);
  await slow.close();
  console.log('✔ CosmoVision browser smoke: routes, languages, network/player errors and timeouts, pagination, filters and responsive widths');
} finally {
  await browser.close();
}
