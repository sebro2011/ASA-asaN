/**
 * CosmoVision cinematic player — behaviour, honesty and accessibility.
 *
 * The player drives a *stubbed* YouTube IFrame API, so every assertion here is about
 * what this integration actually does: which calls reach the player object, which
 * controls exist at all, and that no control is rendered for a capability the engine
 * does not have (Picture-in-Picture and audio tracks are the two traps: a YouTube
 * iframe has neither).
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-cosmovision-player.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

/* ------------------------------------------------------------------ pure logic */
const {
  CHROME_IDLE_MS,
  NUDGE_SECONDS,
  SKIP_SECONDS,
  chromeVisible,
  clampSeek,
  formatClock,
  formatRemaining,
  playerCapabilities,
  progressFraction,
  resolveShortcut,
  timelineValueText,
  volumeState
} = await import('../src/features/space-shorts/playerControls.ts');

test('formatClock renders minutes, hours and never NaN', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(7), '0:07');
  assert.equal(formatClock(65), '1:05');
  assert.equal(formatClock(605), '10:05');
  assert.equal(formatClock(3723), '1:02:03');
  assert.equal(formatClock(72.9), '1:12');
  for (const bad of [null, undefined, NaN, -4, Infinity]) assert.equal(formatClock(bad), '0:00');
});

test('formatRemaining counts down and stops at zero instead of -0:00', () => {
  assert.equal(formatRemaining(20, 80), '-1:00');
  assert.equal(formatRemaining(79.6, 80), '0:00');
  assert.equal(formatRemaining(80, 80), '0:00');
  assert.equal(formatRemaining(120, 80), '0:00');
  assert.equal(formatRemaining(0, 0), '0:00');
  assert.equal(formatRemaining(5, NaN), '0:00');
});

test('clampSeek keeps every seek inside the video', () => {
  assert.equal(clampSeek(-30, 300), 0);
  assert.equal(clampSeek(45, 300), 45);
  assert.equal(clampSeek(400, 300), 300);
  assert.equal(formatClock(clampSeek(0, 300)), '0:00');
  assert.equal(clampSeek(NaN, 300), 0);
  assert.equal(clampSeek(45, 0), 45, 'unknown duration must not clamp to zero');
});

test('progressFraction is always 0…1, so the timeline cannot break layout', () => {
  assert.equal(progressFraction(0, 300), 0);
  assert.equal(progressFraction(150, 300), 0.5);
  assert.equal(progressFraction(600, 300), 1);
  assert.equal(progressFraction(10, 0), 0);
  assert.equal(progressFraction(NaN, 300), 0);
  assert.equal(progressFraction(10, NaN), 0);
});

test('unsupported capabilities are reported as unsupported, not faked', () => {
  const ready = playerCapabilities({
    apiReady: true,
    captionsApi: true,
    sameOriginVideo: false,
    fullscreenApi: true,
    hardwareVolume: false,
    shareApi: true
  });
  assert.equal(ready.play, true);
  assert.equal(ready.seek, true);
  assert.equal(ready.volume, true);
  assert.equal(ready.fullscreen, true);
  assert.equal(ready.captions, true);
  assert.equal(ready.share, true);
  assert.equal(ready.pictureInPicture, false, 'a cross-origin iframe has no <video> for PiP');
  assert.equal(ready.audioTracks, false, 'the iframe API exposes no audio tracks');

  const bare = playerCapabilities({
    apiReady: false,
    captionsApi: false,
    sameOriginVideo: false,
    fullscreenApi: false,
    hardwareVolume: true,
    shareApi: false
  });
  assert.equal(bare.seek, false);
  assert.equal(bare.volume, false, 'iOS ignores setVolume; the hardware buttons own the level');
  assert.equal(bare.captions, false);
  assert.equal(bare.fullscreen, false);
  assert.equal(bare.share, true, 'sharing is a URL, so it never depends on the player');
});

test('keyboard map covers playback, seeking, volume, fullscreen and close', () => {
  assert.equal(resolveShortcut(' '), 'toggle');
  assert.equal(resolveShortcut('k'), 'toggle');
  assert.equal(resolveShortcut('K'), 'toggle');
  assert.equal(resolveShortcut('ArrowLeft'), 'seek-back');
  assert.equal(resolveShortcut('ArrowRight'), 'seek-forward');
  assert.equal(resolveShortcut('j'), 'jump-back');
  assert.equal(resolveShortcut('L'), 'jump-forward');
  assert.equal(resolveShortcut('m'), 'mute');
  assert.equal(resolveShortcut('ArrowUp'), 'volume-up');
  assert.equal(resolveShortcut('ArrowDown'), 'volume-down');
  assert.equal(resolveShortcut('f'), 'fullscreen');
  assert.equal(resolveShortcut('c'), 'captions');
  assert.equal(resolveShortcut('Home'), 'start');
  assert.equal(resolveShortcut('End'), 'end');
  assert.equal(resolveShortcut('Escape', { hasClose: true }), 'close');
  assert.equal(resolveShortcut('Escape', { hasClose: false }), null, 'never close a player that has no close button');
  assert.equal(resolveShortcut('z'), null);
  assert.equal(resolveShortcut('Tab'), null, 'never swallow focus navigation');
});

test('chrome stays while paused, hovered, focused or scrubbing and hides on idle play', () => {
  const base = { playing: true, hoveringChrome: false, focusWithin: false, scrubbing: false, idleMs: 9000 };
  assert.equal(chromeVisible({ ...base, idleMs: CHROME_IDLE_MS + 1 }), false);
  assert.equal(chromeVisible({ ...base, playing: false }), true);
  assert.equal(chromeVisible({ ...base, hoveringChrome: true }), true);
  assert.equal(chromeVisible({ ...base, focusWithin: true }), true);
  assert.equal(chromeVisible({ ...base, scrubbing: true }), true);
  assert.equal(chromeVisible({ ...base, idleMs: 10 }), true);
});

test('volume icon state cannot disagree with the label', () => {
  assert.equal(volumeState(0, false), 'muted');
  assert.equal(volumeState(80, true), 'muted');
  assert.equal(volumeState(20, false), 'low');
  assert.equal(volumeState(80, false), 'high');
});

test('timeline announces elapsed, duration and remaining time', () => {
  assert.equal(timelineValueText(30, 90), '0:30 / 1:30, -1:00');
});

test('caption readers trust only what the API actually returned', async () => {
  const { readCaptionTracks, readActiveCaptionCode } = await import('../src/features/space-shorts/playerControls.ts');
  for (const junk of [undefined, null, {}, { tracklist: 'nope' }, { tracklist: [null, 5, {}] }]) {
    assert.deepEqual(readCaptionTracks(junk), [], 'unknown shapes must produce no menu at all');
    assert.equal(readActiveCaptionCode(junk), null);
  }
  const options = {
    tracklist: [
      { languageCode: 'en', languageName: 'English' },
      { languageCode: 'si' },
      { languageCode: 'en', languageName: 'English (duplicate)' }
    ],
    tracks: [{ languageCode: 'si', languageName: 'Sinhala' }]
  };
  assert.deepEqual(readCaptionTracks(options), [
    { languageCode: 'en', languageName: 'English' },
    { languageCode: 'si', languageName: 'si' }
  ]);
  assert.equal(readActiveCaptionCode(options), 'si');
});

test('skip and nudge constants match the buttons and the keys', () => {
  assert.equal(SKIP_SECONDS, 15);
  assert.equal(NUDGE_SECONDS, 5);
  assert.ok(CHROME_IDLE_MS >= 2000, 'chrome must not vanish while a viewer is still reading it');
});

/* ------------------------------------------------------------- translations */
const playerKeySources = {
  en: readFileSync('src/i18n/en/spaceShorts.ts', 'utf8'),
  si: readFileSync('src/i18n/si/spaceShorts.ts', 'utf8'),
  ta: readFileSync('src/i18n/ta/spaceShorts.ts', 'utf8')
};

test('every new control label exists in Sinhala, Tamil and English', async () => {
  const shared = Object.keys((await import('../src/i18n/en/spaceShorts.ts')).spaceShortsEn);
  const controlKeys = shared.filter((key) => /^cv[A-Z]/.test(key));
  assert.ok(controlKeys.length >= 19, `expected the full control vocabulary, saw ${controlKeys.length}`);
  for (const locale of ['si', 'ta']) {
    const bundle = Object.keys((await import(`../src/i18n/${locale}/spaceShorts.ts`))[`spaceShorts${locale === 'si' ? 'Si' : 'Ta'}`]);
    assert.deepEqual(bundle.sort(), shared.sort(), `${locale} must expose exactly the English key set`);
    for (const key of controlKeys) assert.ok(playerKeySources[locale].includes(`${key}:`), `${locale} is missing ${key}`);
  }
  const used = [...new Set([...playerKeySources.en.matchAll(/\bt\('(cv[A-Za-z0-9]+)'/g)].map((match) => match[1]))];
  for (const key of used) assert.ok(controlKeys.includes(key), `player uses untranslated key ${key}`);
});

test('the player source uses only keys that exist in the bundle', async () => {
  const source = readFileSync('src/features/space-shorts/YouTubePlayer.tsx', 'utf8');
  const bundle = Object.keys((await import('../src/i18n/en/spaceShorts.ts')).spaceShortsEn);
  for (const [, key] of source.matchAll(/\bt\('([A-Za-z0-9]+)'/g)) {
    assert.ok(bundle.includes(key), `YouTubePlayer uses missing translation key ${key}`);
  }
});

/* ------------------------------------------------------------------- jsdom UI */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.test/' });
const { window } = dom;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'localStorage', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
}
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** One stub instance per mount, recorded so assertions can read the calls. */
const calls = { created: [], destroyed: [], destroyedInstances: 0, seek: [], volume: [], mute: 0, unmute: 0, play: 0, pause: 0, fullscreen: 0, shared: [], captions: [] };
let stubConfig = { captionsApi: true, duration: 90, currentTime: 30, volume: 70, muted: true, state: 2, captionOptions: null, captionActive: null };
let clockTime = 0;

class StubYoutubePlayer {
  constructor(element, options) {
    this.options = options;
    calls.created.push({ id: options.videoId, host: options.host, vars: options.playerVars });
    this.frame = window.document.createElement('iframe');
    this.frame.title = 'stub';
    element.replaceWith(this.frame);
    if (stubConfig.captionsApi) {
      this.setOption = (module, option, value) => {
        calls.captions.push({ module, option, value });
        stubConfig.captionActive = value?.languageCode ?? null;
      };
      this.loadModule = (module) => (calls.captionsModule = `load:${module}`);
      this.unloadModule = (module) => (calls.captionsModule = `unload:${module}`);
      this.getOptions = (module) => {
        if (module !== 'captions' || !stubConfig.captionOptions) return undefined;
        return {
          tracklist: stubConfig.captionOptions,
          tracks: stubConfig.captionActive ? [{ languageCode: stubConfig.captionActive }] : []
        };
      };
    }
    setTimeout(() => options.events.onReady({ target: this }), 0);
  }
  getIframe() { return this.frame; }
  playVideo() { calls.play++; stubConfig.state = 1; this.options.events.onStateChange({ data: 1 }); }
  pauseVideo() { calls.pause++; stubConfig.state = 2; this.options.events.onStateChange({ data: 2 }); }
  seekTo(seconds) { calls.seek.push(seconds); clockTime = seconds; }
  getCurrentTime() { return clockTime; }
  getDuration() { return stubConfig.duration; }
  getVideoLoadedFraction() { return 0.5; }
  getPlayerState() { return stubConfig.state; }
  setVolume(value) { calls.volume.push(value); stubConfig.volume = value; }
  getVolume() { return stubConfig.volume; }
  mute() { calls.mute++; stubConfig.muted = true; }
  unMute() { calls.unmute++; stubConfig.muted = false; }
  isMuted() { return stubConfig.muted; }
  destroy() { calls.destroyed.push(this.options.videoId); calls.destroyedInstances++; this.frame.remove(); }
}
/**
 * `loadPlayerApi()` caches the API object for the whole process, so the stub is read
 * through a getter: a later test can swap the engine without re-loading the module.
 */
let playerClass = StubYoutubePlayer;
window.YT = {
  get Player() {
    return playerClass;
  }
};
Object.defineProperty(window.document, 'fullscreenEnabled', { value: true, configurable: true });
window.HTMLElement.prototype.requestFullscreen = function requestFullscreen() {
  calls.fullscreen++;
  return Promise.resolve();
};
window.document.exitFullscreen = async () => undefined;
Object.defineProperty(window.navigator, 'share', {
  configurable: true,
  value: async (data) => { calls.shared.push(data); }
});

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nextProvider } = await import('react-i18next');
const i18n = (await import('../src/i18n.ts')).default;
await i18n.changeLanguage('en');
const YouTubePlayer = (await import('../src/features/space-shorts/YouTubePlayer.tsx')).default;

const video = { id: '1ifqd3n6ZFY', title: 'A cinematic test short', description: '', channelTitle: 'Test', portraitVerified: true };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resetCalls() {
  for (const key of Object.keys(calls)) calls[key] = Array.isArray(calls[key]) ? [] : 0;
  calls.created = [];
  stubConfig = { captionsApi: true, duration: 90, currentTime: 30, volume: 70, muted: true, state: 2, captionOptions: null, captionActive: null };
  clockTime = 30;
}

/**
 * The engine resolves on its own timers, so every mount waits for the state it needs
 * instead of guessing a delay: ready first, then one poll tick so the duration the
 * timeline depends on has actually arrived.
 */
async function waitFor(predicate, message = 'condition', timeout = 4000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${message}`);
    await act(async () => { await sleep(20); });
  }
}

async function mount(props = {}) {
  const host = window.document.createElement('div');
  host.className = 'ss-film-frame';
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(I18nextProvider, { i18n }, React.createElement(YouTubePlayer, { video, ...props }))
    );
  });
  await waitFor(() => host.querySelector('.cv-player[data-status="ready"]'), 'the player to become ready');
  await waitFor(() => host.querySelector('.cv-timeline:not([disabled])'), 'the duration to arrive');
  return {
    host,
    async unmount() {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  };
}

const buttons = () => [...window.document.querySelectorAll('.cv-player button')];
const labelOf = (element) => element.getAttribute('aria-label') || element.textContent.trim();
const findButton = (label) => buttons().find((element) => labelOf(element) === label);

test('the engine is the same YouTube iframe API, on the privacy host, muted and chromeless', async () => {
  resetCalls();
  const view = await mount();
  try {
    assert.equal(calls.created.length, 1);
    const created = calls.created[0];
    assert.equal(created.id, video.id);
    assert.equal(created.host, 'https://www.youtube-nocookie.com', 'privacy-enhanced host must not regress');
    assert.equal(created.vars.autoplay, 1);
    assert.equal(created.vars.mute, 1);
    assert.equal(created.vars.playsinline, 1);
    assert.equal(created.vars.rel, 0);
    assert.equal(created.vars.controls, 0, 'the cinematic chrome replaces the YouTube chrome');
    assert.equal(calls.play, 1, 'the muted autoplay contract is unchanged');
    assert.equal(calls.mute, 1);
    assert.equal(window.document.querySelectorAll('.cv-engine iframe').length, 1);
    assert.ok(!window.document.querySelector('.cv-state'), 'no loading overlay once ready');
  } finally {
    await view.unmount();
  }
});

test('no control is rendered for a capability the iframe cannot provide', async () => {
  resetCalls();
  const view = await mount();
  try {
    const labels = buttons().map(labelOf);
    assert.ok(labels.some((label) => label === 'Play' || label === 'Pause'), labels.join(' | '));
    assert.ok(labels.includes('Back 15 seconds'));
    assert.ok(labels.includes('Forward 15 seconds'));
    assert.ok(labels.some((label) => label === 'Mute' || label === 'Unmute'));
    assert.ok(labels.includes('Share this video'));
    assert.ok(labels.includes('Subtitles and captions'));
    assert.ok(labels.includes('Fullscreen'));
    assert.ok(!labels.some((label) => /picture.?in.?picture/i.test(label)), 'PiP is impossible for a YouTube iframe');
    assert.ok(!labels.some((label) => /audio track|audio language/i.test(label)), 'the iframe API exposes no audio tracks');
    assert.equal(window.document.querySelector('.cv-player').getAttribute('aria-roledescription'), 'video player');
    assert.equal(window.document.querySelector('.cv-player').getAttribute('aria-label'), video.title);
    assert.equal(window.document.querySelectorAll('[data-fake]').length, 0);
    // Every control must be operable by an assistive technology.
    for (const element of buttons()) assert.ok(labelOf(element).length > 1, 'every button needs an accessible name');
  } finally {
    await view.unmount();
  }
});

test('captions control only exists when the player actually implements it', async () => {
  resetCalls();
  stubConfig = { ...stubConfig, captionsApi: false };
  const view = await mount();
  try {
    assert.equal(buttons().map(labelOf).includes('Subtitles and captions'), false, 'no dead captions button');
  } finally {
    await view.unmount();
  }
});

test('play, pause, ±15 s, mute, volume and the timeline all reach the player object', async () => {
  resetCalls();
  const view = await mount();
  try {
    const toggle = () => buttons().find((element) => /^(Play|Pause)$/.test(labelOf(element)));
    // Autoplay already started the video, so the first press pauses.
    assert.equal(labelOf(toggle()), 'Pause');
    await act(async () => { toggle().click(); });
    assert.equal(calls.pause, 1);
    assert.equal(labelOf(toggle()), 'Play', 'the label flips with the real state');

    await act(async () => { toggle().click(); });
    assert.equal(calls.play, 2, 'autoplay plus the explicit press');

    const forwards = buttons().find((element) => /Forward 15/.test(labelOf(element)));
    await act(async () => { forwards.click(); });
    assert.deepEqual(calls.seek, [45], 'current 30 + 15');
    const backwards = buttons().find((element) => /Back 15/.test(labelOf(element)));
    await act(async () => { backwards.click(); });
    assert.deepEqual(calls.seek, [45, 30]);

    const mute = buttons().find((element) => /Unmute|Mute/.test(labelOf(element)));
    await act(async () => { mute.click(); });
    assert.equal(calls.unmute, 1, 'starts muted, so the first press unmutes');

    const slider = window.document.querySelector('.cv-volume-slider');
    assert.ok(slider, 'a real volume slider, not a decorative icon');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(slider, '35');
      slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.deepEqual(calls.volume, [35]);

    const timeline = window.document.querySelector('.cv-timeline');
    assert.ok(timeline, 'timeline is an input[type=range], so it is keyboard operable');
    assert.equal(timeline.getAttribute('type'), 'range');
    assert.equal(timeline.getAttribute('aria-label'), 'Video progress');
    assert.match(timeline.getAttribute('aria-valuetext'), /\/ 1:30/);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(timeline, '60');
      timeline.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.ok(calls.seek.includes(60), 'scrubbing seeks');
  } finally {
    await view.unmount();
  }
});

test('caption tracks are offered only when the player reported them, and only those are requested', async () => {
  resetCalls();
  stubConfig = {
    ...stubConfig,
    captionOptions: [
      { languageCode: 'en', languageName: 'English' },
      { languageCode: 'si', languageName: 'Sinhala' }
    ],
    captionActive: 'en'
  };
  const view = await mount();
  try {
    const cc = findButton('Subtitles and captions');
    assert.ok(cc, 'the captions control exists when the API implements it');
    assert.equal(cc.getAttribute('aria-pressed'), 'true', 'the pressed state is the real active track, not a guess');
    assert.equal(cc.getAttribute('aria-haspopup'), 'true');
    assert.equal(window.document.querySelector('.cv-captions-menu'), null, 'the menu is closed until asked for');

    await act(async () => { cc.click(); });
    const options = [...window.document.querySelectorAll('.cv-captions-option')].map((node) => node.textContent.trim());
    assert.deepEqual(options, ['Off', 'English', 'Sinhala'], 'off plus the reported tracks, nothing invented');

    const sinhala = [...window.document.querySelectorAll('.cv-captions-option')].find((node) => node.textContent.trim() === 'Sinhala');
    await act(async () => { sinhala.click(); });
    assert.deepEqual(calls.captions.at(-1), { module: 'captions', option: 'track', value: { languageCode: 'si' } });
    assert.equal(window.document.querySelector('.cv-captions-menu'), null, 'choosing closes the menu');
    assert.equal(findButton('Subtitles and captions').getAttribute('aria-pressed'), 'true');

    await act(async () => { findButton('Subtitles and captions').click(); });
    const off = [...window.document.querySelectorAll('.cv-captions-option')].find((node) => node.textContent.trim() === 'Off');
    await act(async () => { off.click(); });
    assert.deepEqual(calls.captions.at(-1), { module: 'captions', option: 'track', value: {} });
    assert.equal(findButton('Subtitles and captions').getAttribute('aria-pressed'), 'false');

    // Escape closes the menu before it would close the player.
    await act(async () => { findButton('Subtitles and captions').click(); });
    assert.ok(window.document.querySelector('.cv-captions-menu'));
    const player = window.document.querySelector('.cv-player');
    await act(async () => {
      player.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(window.document.querySelector('.cv-captions-menu'), null, 'Escape closes the menu first');
  } finally {
    await view.unmount();
  }
});

test('a single reported track toggles captions without inventing a menu', async () => {
  resetCalls();
  stubConfig = { ...stubConfig, captionOptions: [{ languageCode: 'en', languageName: 'English' }], captionActive: null };
  const view = await mount();
  try {
    assert.equal(findButton('Subtitles and captions').getAttribute('aria-pressed'), 'false', 'nothing active is reported, so nothing is claimed');
    await act(async () => { findButton('Subtitles and captions').click(); });
    assert.equal(window.document.querySelector('.cv-captions-menu'), null, 'one track needs no menu');
    assert.deepEqual(calls.captions.at(-1), { module: 'captions', option: 'track', value: { languageCode: 'en' } });
  } finally {
    await view.unmount();
  }
});

test('share uses the Web Share API with the validated watch URL', async () => {
  resetCalls();
  const view = await mount();
  try {
    await act(async () => { findButton('Share this video').click(); await sleep(20); });
    assert.equal(calls.shared.length, 1);
    assert.equal(calls.shared[0].url, `https://www.youtube.com/watch?v=${video.id}`);
    assert.equal(calls.shared[0].title, video.title);
  } finally {
    await view.unmount();
  }
});

test('fullscreen is requested on the player frame, and the close button calls the page', async () => {
  resetCalls();
  let closed = 0;
  const view = await mount({ onClose: () => { closed++; } });
  try {
    await act(async () => { findButton('Fullscreen').click(); await sleep(20); });
    assert.equal(calls.fullscreen, 1);
    await act(async () => { findButton('Close player').click(); });
    assert.equal(closed, 1);
  } finally {
    await view.unmount();
  }
});

test('a player left without onClose (the gallery card) keeps the page’s own close', async () => {
  resetCalls();
  const view = await mount();
  try {
    assert.equal(buttons().some((element) => labelOf(element) === 'Close player'), false);
  } finally {
    await view.unmount();
  }
});

test('keyboard shortcuts drive the player and never hijack Tab', async () => {
  resetCalls();
  const view = await mount();
  try {
    const player = window.document.querySelector('.cv-player');
    const press = async (key) => {
      await act(async () => {
        player.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      });
    };
    await press('ArrowRight');
    assert.ok(calls.seek.includes(35), 'arrow nudges 5 s');
    await press('l');
    assert.ok(calls.seek.includes(50), 'J/L jump 15 s from the new position');
    await press('m');
    assert.equal(calls.unmute, 1);
    await press(' ');
    assert.equal(calls.play + calls.pause >= 1, true);
    const tabEvent = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(async () => { player.dispatchEvent(tabEvent); });
    assert.equal(tabEvent.defaultPrevented, false, 'Tab must reach the browser, never be swallowed');
  } finally {
    await view.unmount();
  }
});

test('chrome fades out after inactivity during playback and returns on interaction', async () => {
  resetCalls();
  stubConfig = { ...stubConfig, state: 1 };
  const view = await mount();
  try {
    const bottom = window.document.querySelector('.cv-bottom');
    assert.equal(window.document.querySelector('.cv-player').dataset.chrome, 'shown');
    await act(async () => { await sleep(3200); });
    assert.equal(window.document.querySelector('.cv-player').dataset.chrome, 'hidden', 'controls auto-hide while playing');
    assert.equal(bottom.dataset.visible, 'false');
    await act(async () => {
      window.document.querySelector('.cv-player').dispatchEvent(new window.Event('pointermove', { bubbles: true }));
      await sleep(40);
    });
    assert.equal(window.document.querySelector('.cv-player').dataset.chrome, 'shown', 'interaction brings them back');

    // A fade-out must not cost the viewer a pause: the first tap only reveals the chrome.
    await act(async () => { await sleep(3200); });
    assert.equal(window.document.querySelector('.cv-player').dataset.chrome, 'hidden');
    await act(async () => { window.document.querySelector('.cv-surface').click(); await sleep(40); });
    assert.equal(window.document.querySelector('.cv-player').dataset.chrome, 'shown');
    assert.equal(calls.pause, 0, 'revealing the chrome must not toggle playback');
  } finally {
    await view.unmount();
  }
});

test('an error state retries and always offers the real YouTube page', async () => {
  resetCalls();
  const host = window.document.createElement('div');
  host.className = 'ss-film-frame';
  window.document.body.appendChild(host);
  const root = createRoot(host);
  const originalPlayer = playerClass;
  playerClass = class BrokenPlayer {
    constructor(element, options) {
      this.frame = window.document.createElement('iframe');
      element.replaceWith(this.frame);
      setTimeout(() => options.events.onError({ data: 101 }), 0);
    }
    destroy() { this.frame.remove(); }
  };
  try {
    await act(async () => {
      root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(YouTubePlayer, { video })));
    });
    await waitFor(() => host.querySelector('[role=alert]'), 'the error state');
    const alert = host.querySelector('[role=alert]');
    assert.ok(alert, 'an unplayable video announces itself');
    assert.match(alert.textContent, /cannot be played here/);
    const link = host.querySelector(`a[href="https://www.youtube.com/watch?v=${video.id}"]`);
    assert.ok(link, 'the honest fallback link survives');
    assert.equal(host.querySelector('.cv-bottom'), null, 'no controls pretending there is video');
    await act(async () => { alert.querySelector('button').click(); });
    await waitFor(() => host.querySelector('[role=alert]'), 'the error state after retry');
    assert.ok(host.querySelector('[role=alert]'), 'retry keeps the error visible until the player answers');
  } finally {
    await act(async () => { root.unmount(); });
    playerClass = originalPlayer;
    host.remove();
  }
});

test('switching videos destroys the old player instead of leaking it', async () => {
  resetCalls();
  const host = window.document.createElement('div');
  host.className = 'ss-film-frame';
  window.document.body.appendChild(host);
  const root = createRoot(host);
  const render = (item) =>
    React.createElement(I18nextProvider, { i18n }, React.createElement(YouTubePlayer, { key: item.id, video: item }));
  try {
    await act(async () => { root.render(render(video)); await sleep(60); });
    await act(async () => { root.render(render({ ...video, id: 'TseGuyuVWKM' })); await sleep(60); });
    assert.deepEqual(calls.destroyed, [video.id]);
    assert.equal(host.querySelectorAll('iframe').length, 1);
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
  }
});

test.after(() => { dom.window.close(); });
