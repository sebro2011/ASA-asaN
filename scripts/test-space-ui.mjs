/** Optional Chromium smoke: mocks the YouTube player and community service. */
import assert from 'node:assert/strict';
import { chromium as playwright } from 'playwright-core';

let executablePath = process.env.CHROMIUM_PATH;
let args = ['--no-sandbox'];
if (!executablePath) {
  const chromium = (await import('@sparticuz/chromium')).default;
  executablePath = await chromium.executablePath(); args = chromium.args;
}
const base = process.env.SPACE_TEST_BASE || 'http://127.0.0.1:3000';
const playerApi = `
  window.__spacePlayers = {created: [], destroyed: [], muted: 0, played: 0};
  window.YT = {Player: class {
    constructor(element, options) {
      this.id = options.videoId; this.frame = document.createElement('iframe'); element.replaceWith(this.frame);
      window.__spacePlayers.created.push({id: this.id, host: options.host, vars: options.playerVars});
      setTimeout(() => { options.events.onReady({target: this}); if (this.id === 'TseGuyuVWKM') options.events.onError({data: 101}); }, 0);
    }
    getIframe() { return this.frame; } mute() { window.__spacePlayers.muted++; } playVideo() { window.__spacePlayers.played++; }
    destroy() { window.__spacePlayers.destroyed.push(this.id); this.frame.remove(); }
  }}; window.onYouTubeIframeAPIReady();
`;
const browser = await playwright.launch({ executablePath, args, headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
await context.addInitScript(() => localStorage.setItem('nasa_welcome_preference_v1', JSON.stringify({ showOnStartup: false, dismissedAt: null })));
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url === 'https://www.youtube.com/iframe_api') return route.fulfill({ status: 200, contentType: 'application/javascript', body: playerApi });
  if (url.startsWith(base) || url.startsWith('data:')) return route.continue();
  return route.abort();
});

async function noOverflow(width) {
  await page.setViewportSize({ width, height: 800 });
  const result = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.equal(result.scroll, result.client, `no horizontal overflow at ${width}px`);
}
async function checkAxe(scope = '.space-shorts') {
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  const violations = await page.evaluate(async (selector) => {
    const result = await window.axe.run(document.querySelector(selector), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
  }, scope);
  assert.deepEqual(violations, [], `accessibility violations in ${scope}: ${JSON.stringify(violations)}`);
}

try {
  // The legacy route still opens the short-video feed.
  await page.goto(`${base}/space-shorts`, { waitUntil: 'domcontentloaded' });
  await page.locator('.ss-short-panel').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('h1').innerText(), 'CosmoVision');
  assert.equal(await page.getByRole('tab', { name: 'Space Shorts' }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('.ss-video-card').count(), 5);
  assert.equal(await page.locator('iframe').count(), 0, 'no player before explicit interaction');
  assert.match(await page.locator('.ss-disclaimers').innerText(), /official Shorts status may vary/);
  await page.locator('.ss-short-panel').focus(); await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('.ss-story-title')?.textContent.includes('South Pole'));
  await page.keyboard.press('ArrowUp');
  await page.locator('.ss-poster').click(); await page.waitForFunction(() => window.__spacePlayers?.played === 1);
  let state = await page.evaluate(() => window.__spacePlayers);
  assert.equal(state.created[0].id, '1ifqd3n6ZFY'); assert.equal(state.created[0].host, 'https://www.youtube-nocookie.com');
  assert.equal(state.created[0].vars.mute, 1); assert.equal(state.muted, 1);
  await page.getByRole('button', { name: 'Next video', exact: true }).click();
  await page.waitForFunction(() => window.__spacePlayers?.created.length === 2);
  state = await page.evaluate(() => window.__spacePlayers); assert.deepEqual(state.destroyed, ['1ifqd3n6ZFY']);
  assert.equal(await page.locator('iframe').count(), 1);
  await page.locator('.ss-queue-item').last().click();
  await page.getByRole('alert').filter({ hasText: 'This video cannot be played here' }).waitFor();
  assert.equal(await page.locator('.ss-film-frame a').getAttribute('href'), 'https://www.youtube.com/watch?v=TseGuyuVWKM');

  // The four real tabs have roving keyboard selection and switching destroys the player.
  await page.getByRole('tab', { name: 'All videos' }).click();
  await page.locator('.ss-video-card').first().waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.match(await page.locator('.ss-source-badge').innerText(), /STARTER COLLECTION/);
  assert.match(await page.locator('.ss-notice').last().innerText(), /community feed is unavailable/i);
  await page.getByRole('tab', { name: 'All videos' }).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Space Shorts' }).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End'); assert.equal(await page.getByRole('tab', { name: 'Community videos' }).getAttribute('aria-selected'), 'true');
  await page.getByRole('alert').filter({ hasText: 'community feed is unavailable' }).waitFor();
  await page.getByRole('tab', { name: 'NASA videos' }).click(); await page.locator('.ss-video-card').first().waitFor();
  assert.ok((await page.locator('.ss-channel-name').allTextContents()).every((name) => name === 'NASA Goddard'));
  await page.getByRole('tab', { name: 'All videos' }).click(); await page.locator('.ss-video-card').first().waitFor();
  await page.getByRole('button', { name: 'Load more' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ss-video-card').length === 15);
  await page.getByLabel('Search astronomy videos').fill('moon'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ss-video-card').length > 0 && [...document.querySelectorAll('.ss-card-body')].every((card) => /moon/i.test(card.textContent)));
  await page.getByRole('button', { name: 'Clear search' }).click(); await page.locator('.ss-video-card').first().waitFor();

  // A disabled backend never accepts a file or fakes a submission.
  const upload = page.getByRole('button', { name: 'Upload video' }); await upload.click();
  const dialog = page.getByRole('dialog', { name: 'Share a science video' }); await dialog.waitFor();
  assert.match(await dialog.innerText(), /not configured yet/i);
  assert.equal(await dialog.getByRole('button', { name: 'Submit for review' }).isDisabled(), true);
  await dialog.getByLabel('YouTube URL').fill('https://youtube.com.evil.test/watch?v=abcdefghijk');
  assert.equal(await dialog.getByText('Enter a supported HTTPS YouTube link.').count(), 1);
  await dialog.getByLabel('YouTube URL').fill('https://youtu.be/abcdefghijk');
  assert.match(await dialog.locator('.ss-preview-image img').getAttribute('src'), /abcdefghijk/);
  await dialog.getByRole('button', { name: 'Video file' }).click();
  assert.match(await dialog.innerText(), /File uploads are not available/); assert.equal(await dialog.locator('input[type=file]').count(), 0);
  await checkAxe('.ss-dialog'); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  assert.equal(await upload.evaluate((element) => document.activeElement === element), true, 'focus returns to dialog trigger');

  // Translations, responsive layouts, reduced motion and modal fit.
  for (const language of ['si', 'ta', 'en']) {
    const current = await page.locator('html').getAttribute('lang');
    if (current !== language) {
      await page.getByRole('button', { name: /^Language:/ }).click();
      await page.getByRole('menuitemradio', { name: language === 'si' ? /සිංහල/ : language === 'ta' ? /தமிழ்/ : /English/ }).click();
      await page.waitForFunction((lang) => document.documentElement.lang === lang, language);
    }
    for (const width of [320, 390, 768, 1280]) await noOverflow(width);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.locator('.ss-community-actions .ss-primary-action').click(); await page.getByRole('dialog').waitFor();
    await noOverflow(320); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  await page.setViewportSize({ width: 1280, height: 900 }); await checkAxe();
  assert.deepEqual(errors, [], 'no browser exceptions in the unconfigured feed');

  // The canonical route opens All videos, while preserving history/navigation.
  await page.goto(`${base}/cosmovision`, { waitUntil: 'domcontentloaded' }); await page.locator('.ss-video-card').first().waitFor();
  assert.equal(await page.getByRole('tab', { name: 'All videos' }).getAttribute('aria-selected'), 'true');
  // A delayed old pagination response must not overwrite a newly selected topic.
  const delayOldPage = async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (!params.has('pageToken')) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 700));
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'curated', items: [{ id: 'abcdefghijk', title: 'STALE OLD PAGE', description: 'Old response', channelTitle: 'Old', officialAgency: false }], nextPageToken: null }) }); } catch { /* request was correctly aborted */ }
  };
  await page.route('**/api/space-videos?*', delayOldPage);
  await page.getByRole('button', { name: 'Load more' }).click();
  await page.getByRole('button', { name: 'Missions', exact: true }).click();
  await page.locator('.ss-video-card').first().waitFor();
  await page.waitForTimeout(800);
  assert.equal(await page.getByText('STALE OLD PAGE').count(), 0);
  assert.ok((await page.locator('.ss-card-topics').allTextContents()).every((value) => value.includes('Missions')));
  await page.unroute('**/api/space-videos?*', delayOldPage);
  await page.getByRole('button', { name: 'All topics', exact: true }).click();

  // Simulate an explicitly configured Supabase project and real HTTP outcomes.
  // These are browser mocks, not evidence of a live deployment or credentials.
  const id1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const id2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const access = 'mocked-access-token-for-ui-testing'; const requests = []; let attempts = 0;
  let pending = [{ id: id2, videoId: 'COMMUNITY02', title: 'Awaiting moderation', description: 'A community astronomy lesson.', category: 'universe', channelTitle: 'Creator', createdAt: '2026-01-01' }];
  let approved = [{ id: id1, videoId: 'COMMUNITY01', title: 'Community astronomy', channelTitle: 'Creator' }];
  let reports = [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', videoId: id1, title: 'Community astronomy', reason: 'Please review this', createdAt: '2026-01-01' }];
  const video1 = { id: 'COMMUNITY01', communityId: id1, title: 'Community astronomy', description: 'A community astronomy lesson.', channelTitle: 'Creator', officialAgency: false, categories: ['universe'] };
  const duplicate = { id: '0rHUDWjR5gg', communityId: id2, title: 'Approved shared astronomy', description: 'An astronomy introduction.', channelTitle: 'CrashCourse', officialAgency: false, categories: ['universe'] };
  const video2 = { id: 'COMMUNITY02', communityId: id2, title: 'More community astronomy', description: 'A second community astronomy lesson.', channelTitle: 'Creator', officialAgency: false, categories: ['universe'] };
  const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }, body: JSON.stringify(body) });
  await page.route('https://example.supabase.co/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
    if (route.request().url().includes('/auth/v1/token')) return fulfill(route, { access_token: access, token_type: 'bearer', expires_in: 3600, refresh_token: 'fake-refresh-token', user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'tester@example.test' } });
    if (route.request().url().includes('/auth/v1/logout')) return fulfill(route, {});
    return route.abort();
  });
  await page.route('**/api/community/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); requests.push({ path: url.pathname, auth: req.headers().authorization, body: req.postData() });
    if (url.pathname.endsWith('/config')) return fulfill(route, { enabled: true, url: 'https://example.supabase.co', publicKey: 'sb_publishable_fake' });
    if (url.pathname.endsWith('/videos') && req.method() === 'GET') return fulfill(route, { source: 'community', items: url.searchParams.has('pageToken') ? [video2] : [video1, duplicate], nextPageToken: url.searchParams.has('pageToken') ? null : 'p.12' });
    if (url.pathname.endsWith('/me')) return fulfill(route, { moderator: true, submissions: attempts > 1 ? [{ id: id2, title: 'A journey to Mars', status: 'pending', createdAt: '2026-01-01' }] : [] });
    if (url.pathname.endsWith('/submissions')) { attempts++; return attempts === 1 ? fulfill(route, { error: 'duplicate' }, 409) : fulfill(route, { status: 'pending' }, 201); }
    if (url.pathname.endsWith(`/videos/${id1}/report`)) return fulfill(route, { status: 'received' }, 201);
    if (url.pathname.endsWith('/moderation') && req.method() === 'GET') return fulfill(route, { pending, approved, reports });
    if (url.pathname.endsWith(`/moderation/${id2}`)) { pending = []; return fulfill(route, { status: 'approved' }); }
    if (url.pathname.endsWith(`/moderation/${id1}`)) { approved = []; reports = []; return fulfill(route, { status: 'rejected' }); }
    if (url.pathname.endsWith('/dismiss')) { reports = []; return fulfill(route, { status: 'resolved' }); }
    return fulfill(route, { error: 'not-found' }, 404);
  });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText('Community astronomy', { exact: true }).first().waitFor();
  assert.equal(await page.locator('.ss-video-card').count(), 10, 'all feed merges and deduplicates both sources');
  await page.getByRole('button', { name: 'Load more' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ss-video-card').length === 17);
  await page.getByRole('button', { name: 'Upload video' }).click();
  const configured = page.getByRole('dialog', { name: 'Share a science video' }); await configured.waitFor();
  await configured.getByLabel('Email').fill('tester@example.test'); await configured.getByLabel('Password').fill('password-for-mock');
  await configured.getByRole('button', { name: 'Sign in', exact: true }).click();
  await configured.getByText('Signed in for this session.').waitFor();
  await configured.getByLabel('YouTube URL').fill('https://youtu.be/abcdefghijk');
  await configured.getByLabel('Title', { exact: true }).fill('A journey to Mars');
  await configured.getByLabel('Description', { exact: true }).fill('A real educational video about Mars.');
  await configured.getByRole('combobox').selectOption('missions');
  await configured.getByRole('checkbox').check();
  await configured.getByRole('button', { name: 'Submit for review' }).click();
  await configured.getByRole('alert').filter({ hasText: 'already been submitted' }).waitFor();
  assert.equal(await configured.getByText(/Submission received/).count(), 0, 'no success on backend rejection');
  await configured.getByRole('button', { name: 'Submit for review' }).click();
  await configured.getByText(/Submission received/).waitFor(); assert.equal(attempts, 2);
  assert.ok(requests.filter((r) => r.path.endsWith('/submissions')).every((r) => r.auth === `Bearer ${access}`));
  assert.equal(await page.evaluate((token) => JSON.stringify(localStorage).includes(token), access), false, 'session token is not persisted to local storage');
  await page.keyboard.press('Escape'); await configured.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'My submissions' }).click();
  await page.getByRole('dialog', { name: 'Your submissions' }).getByText('Pending review').waitFor(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Moderation', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Moderation' }); await review.getByText('Awaiting moderation').waitFor();
  await review.getByRole('button', { name: 'Approve', exact: true }).click(); await review.getByText('Review updated.').waitFor();
  await review.getByRole('button', { name: 'Dismiss report', exact: true }).click(); await review.getByText('No open reports.').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Community videos' }).click(); await page.getByText('Community astronomy', { exact: true }).first().waitFor();
  await page.locator('.ss-video-card').filter({ hasText: 'Community astronomy' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Report video' }).click();
  const reportDialog = page.getByRole('dialog', { name: 'Report a community video' });
  await reportDialog.getByLabel('Why should this be reviewed?').fill('This needs a moderator review.');
  await reportDialog.getByRole('button', { name: 'Send report' }).click(); await reportDialog.getByText('Report received for moderator review.').waitFor();
  await page.keyboard.press('Escape'); assert.deepEqual(errors, [], 'no browser exceptions in mocked community flow');
  console.log('CosmoVision browser smoke passed (YouTube and community mocked; no real playback or live backend tested).');
} finally { await browser.close(); }
