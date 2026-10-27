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

const browser = await playwright.launch({ executablePath, args, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
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
  assert.equal(await page.locator('h1').innerText(), 'Space Shorts');
  await page.getByRole('button', { name: 'Replay welcome screen' }).click();
  await welcome.waitFor();
  await welcome.getByRole('button', { name: 'Skip', exact: true }).click();
  await welcome.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('iframe').count(), 0, 'no player before explicit interaction');
  assert.match(await page.locator('.ss-source-badge').innerText(), /STARTER COLLECTION/);

  // Deep links, navigation and browser history work without changing legacy tab URLs.
  await page.getByRole('button', { name: 'NASA Space Explorer — home' }).click();
  await page.waitForURL(`${base}/`);
  await page.goBack();
  await page.waitForURL(`${base}/space-shorts`);
  await page.locator('.ss-short-panel').waitFor();
  await page.goForward();
  await page.waitForURL(`${base}/`);
  await page.locator('nav[aria-label="Primary"]').getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('menuitem', { name: /Space Shorts/ }).click();
  await page.waitForURL(`${base}/space-shorts`);
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
  await page.waitForFunction(() => document.querySelector('.ss-story-title')?.textContent.includes('Visualizing'));
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => document.querySelector('.ss-story-title')?.textContent.includes('South Pole'));

  // An explicitly started player is muted, uses the official privacy host,
  // and is destroyed before a new one replaces it. Errors expose a safe link.
  await page.locator('.ss-poster').click();
  await page.waitForFunction(() => window.__spacePlayers?.played === 1);
  let state = await page.evaluate(() => window.__spacePlayers);
  assert.equal(state.created[0].id, 'KBPc_zyJICE');
  assert.equal(state.created[0].host, 'https://www.youtube-nocookie.com');
  assert.equal(state.created[0].vars.mute, 1);
  assert.equal(state.muted, 1);
  assert.equal(await page.locator('.ss-film-frame iframe').count(), 1);
  await page.getByRole('button', { name: 'Next video', exact: true }).click();
  await page.waitForFunction(() => window.__spacePlayers?.created.length === 2);
  await page.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  assert.equal(await page.locator('.ss-short-story .ss-channel-name').innerText(), 'Publisher not verified');
  state = await page.evaluate(() => window.__spacePlayers);
  assert.deepEqual(state.destroyed, ['KBPc_zyJICE']);
  assert.equal(await page.locator('.ss-film-frame iframe').count(), 1);
  assert.equal(await page.locator('.ss-film-frame a').getAttribute('href'), 'https://www.youtube.com/watch?v=TseGuyuVWKM');
  await page.getByRole('button', { name: 'Try player again', exact: true }).click();
  await page.waitForFunction(() => window.__spacePlayers?.created.length === 3);
  await page.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  await page.locator('.ss-queue-item').last().click();
  await page.waitForFunction(() => window.__spacePlayers?.created.length === 4);
  state = await page.evaluate(() => window.__spacePlayers);
  assert.equal(state.created[3].id, 'bX0hv0EFKnI', 'queue selection opens the selected player');
  assert.equal(state.destroyed.filter((id) => id === 'TseGuyuVWKM').length, 2);
  assert.equal(await page.locator('iframe').count(), 1);
  await page.locator('.ss-mode-switch').getByRole('button', { name: 'Videos', exact: true }).click();
  await page.locator('.ss-video-card').first().waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(await page.locator('.ss-video-card').count(), 9);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ss-video-card').length > 9);
  assert.equal(await page.locator('.ss-video-card').count(), 11);
  await page.locator('.ss-card-image').first().click();
  await page.locator('.ss-gallery-player iframe').waitFor();
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

  // Mobile controls remain reachable without horizontal overflow.
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.equal(dimensions.scroll, dimensions.client, `no horizontal overflow at ${width}px`);
  }
  assert.deepEqual(pageErrors, []);

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
  assert.equal(await blocked.locator('.ss-film-frame a').getAttribute('href'), 'https://www.youtube.com/watch?v=KBPc_zyJICE');
  const retryRequest = blocked.waitForRequest('https://www.youtube.com/iframe_api');
  await blocked.getByRole('button', { name: 'Try player again', exact: true }).click();
  await retryRequest;
  await blocked.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  assert.equal(apiLoads, 2);
  await blocked.close();
  console.log('✔ Space Shorts browser smoke: route/history, three languages, player lifecycle/error, search, filters, pagination, and responsive widths');
} finally {
  await browser.close();
}
