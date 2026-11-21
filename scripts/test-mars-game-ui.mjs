/**
 * The game's interface, mounted for real in jsdom.
 *
 * What this proves: the route resolves, the menu renders in all three languages,
 * the HUD shows what the engine publishes, every panel is reachable and closable by
 * keyboard, the touch pads produce the right intent, and a failed NASA request
 * degrades to a sentence instead of a broken screen.
 *
 * What this cannot prove: that WebGL renders. There is no GPU in this sandbox, so
 * the 3D canvas is deliberately not mounted here — `MarsScene` and the shaders are
 * exercised only by the type checker and by the shape tests below. Any claim that
 * the rendering was verified would be untrue.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-mars-game-ui.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { parseRoute, routeHref } from '../src/app/router.tsx';
import { GAME_COPY } from '../src/game/ui/copy.ts';
import { VALID_LANGS } from './mars-game-test-helpers.mjs';

const realFetch = globalThis.fetch;

function mountDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent']) {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

test('/mars-game is its own fullscreen route and round-trips', () => {
  assert.deepEqual(parseRoute('/mars-game'), { name: 'marsGame', path: '/mars-game' });
  assert.deepEqual(parseRoute('/mars-game/'), parseRoute('/mars-game'), 'trailing slash is the same route');
  assert.equal(routeHref('marsGame'), '/mars-game');
  assert.equal(parseRoute('/mars-game/extra').name, 'notFound', 'no nested paths');
  // The router must not have quietly made it an Explore tab.
  assert.equal(parseRoute('/explore/mars-game').name, 'notFound');
});

test('every game string exists in all three languages', () => {
  const english = Object.keys(GAME_COPY.en);
  assert.ok(english.length > 50, `only ${english.length} strings`);
  for (const lang of VALID_LANGS) {
    const copy = GAME_COPY[lang];
    assert.ok(copy, `missing ${lang}`);
    for (const key of english) {
      assert.equal(typeof copy[key], 'string', `${lang}.${key} is missing`);
      assert.ok(copy[key].length > 0, `${lang}.${key} is empty`);
    }
    assert.deepEqual(Object.keys(copy).sort(), english.sort(), `${lang} has extra or missing keys`);
  }
  // Sinhala and Tamil must not be silently English.
  for (const lang of ['si', 'ta']) {
    assert.notEqual(GAME_COPY[lang].title, GAME_COPY.en.title, `${lang} title is untranslated`);
    assert.notEqual(GAME_COPY[lang].movementHelp, GAME_COPY.en.movementHelp, `${lang} controls are untranslated`);
  }
});

test('the game copy states plainly that the numbers are simulated', () => {
  for (const lang of VALID_LANGS) {
    const copy = GAME_COPY[lang];
    assert.match(copy.simulationBadge, /\S/);
    assert.ok(/simulat|අනුකරණ|உருவக/i.test(copy.subtitle), `${lang} subtitle does not disclose the simulation`);
    assert.ok(copy.discover2.length > 20, `${lang} has no explanation of what is fictional`);
  }
});

test('no game file uses an explicit any or a raw blur (repository ratchets)', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return /\.(tsx?)$/.test(entry.name) ? [path] : [];
  });

  for (const file of walk('src/game')) {
    const source = readFileSync(file, 'utf8');
    assert.ok(!/:\s*any\b|\bas\s+any\b|<any>/.test(source), `${file} uses an explicit any`);
    assert.ok(!/backdrop-blur/.test(source), `${file} uses a raw backdrop-blur utility`);
  }
});

test('the menu renders with no save, degrades when the NASA feed fails, and offers a way back', async () => {
  const dom = mountDom();
  // A failing feed must not break the screen.
  globalThis.fetch = async () => new Response('', { status: 503 });
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { MainMenu } = await import('../src/game/ui/MainMenu.tsx');

    const container = document.getElementById('root');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(MainMenu, {
        lang: 'en',
        hasSave: false,
        onStart: () => { container.dataset.started = '1'; },
        onContinue: () => {},
        onExit: () => {},
        starting: false,
        startError: null,
      }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    const text = container.textContent;
    assert.match(text, /Mars Explorer/);
    assert.match(text, /Enter the surface/);
    assert.match(text, /not telemetry|fictional gameplay values/i, 'the menu discloses the simulation');
    // No image means no attribution line pretending there was one.
    assert.equal(container.querySelector('img'), null, 'a failed feed must not leave a broken <img>');

    const primary = [...container.querySelectorAll('button')].find((button) => /Enter the surface/.test(button.textContent));
    assert.ok(primary, 'the primary action exists as a real button');
    await act(async () => { primary.click(); });
    assert.equal(container.dataset.started, '1', 'the start handler ran');

    const back = [...container.querySelectorAll('a')].find((link) => /Back to COSMORA/.test(link.textContent));
    assert.ok(back, 'there is a link back to the site');
    assert.equal(back.getAttribute('href'), '/');

    await act(async () => root.unmount());
  } finally {
    globalThis.fetch = realFetch;
    dom.window.close();
  }
});

test('a present save offers Resume, and a missing save does not', async () => {
  const dom = mountDom();
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, images: [] }), { status: 200 });
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { MainMenu } = await import('../src/game/ui/MainMenu.tsx');

    const container = document.getElementById('root');
    const root = createRoot(container);
    const props = { lang: 'si', onStart: () => {}, onContinue: () => {}, onExit: () => {}, starting: false, startError: null };

    await act(async () => {
      root.render(React.createElement(MainMenu, { ...props, hasSave: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.match(container.textContent, /ගවේෂණය දිගටම/, 'Sinhala resume label');
    assert.match(container.textContent, /නව ගවේෂණයක්/, 'Sinhala new-expedition label');

    await act(async () => {
      root.render(React.createElement(MainMenu, { ...props, hasSave: false }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.doesNotMatch(container.textContent, /گවේෂණය දිගටම/);
    assert.match(container.textContent, /මතුපිටට ඇතුළු වන්න/, 'Sinhala enter label');

    await act(async () => root.unmount());
  } finally {
    globalThis.fetch = realFetch;
    dom.window.close();
  }
});

test('the HUD reports the snapshot it is given, including low-resource warnings', async () => {
  const dom = mountDom();
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { Hud } = await import('../src/game/ui/Hud.tsx');
    const { createSnapshot } = await import('../src/game/state/marsGameStore.ts');

    const container = document.getElementById('root');
    const root = createRoot(container);
    const snapshot = {
      ...createSnapshot(),
      ready: true,
      position: { x: 128.4, y: -22, z: -47.6 },
      oxygen: 0.42,
      roverBattery: 0.12,
      samples: [{ sourceId: 'a', kind: 'basalt', label: 'Basalt', confidence: 0.8, x: 0, z: 0, collectedAt: '' }],
      prompt: { id: 'rock:1', kind: 'rock', label: 'Basaltic rock', distance: 2, action: 'Scan' },
      fps: 58,
      researchProgress: 0.33,
      playerMode: 'rover',
      qualityNote: 'Resolution reduced to hold frame rate',
    };

    await act(async () => {
      root.render(React.createElement(Hud, {
        copy: GAME_COPY.en,
        snapshot,
        isTouch: false,
        onOpenMap: () => {},
        onOpenJournal: () => {},
        onOpenInventory: () => {},
        onPause: () => {},
      }));
    });

    const text = container.textContent;
    assert.match(text, /Driving/, 'mode is shown');
    assert.match(text, /128, -48 m/, 'position is shown in metres');
    assert.match(text, /42%/, 'oxygen is shown');
    assert.match(text, /12%/, 'rover battery is shown');
    assert.match(text, /Scan · Basaltic rock/, 'the interaction prompt is shown');
    assert.match(text, /58 FPS/);
    assert.match(text, /33%/, 'research progress');
    assert.match(text, /Resolution reduced to hold frame rate/, 'a quality change is disclosed');
    // The dangerous battery is flagged, not just low.
    assert.ok(container.querySelector('.text-critical'), 'a low battery is marked critical');
    // Every meter carries a screen-reader label that says "simulated".
    assert.ok(/simulated/i.test(container.innerHTML), 'meters are announced as simulated');

    await act(async () => root.unmount());
  } finally {
    dom.window.close();
  }
});

test('panels trap the eye, close on Escape and are labelled dialogs', async () => {
  const dom = mountDom();
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { InventoryPanel } = await import('../src/game/ui/Panels.tsx');
    const { createSnapshot } = await import('../src/game/state/marsGameStore.ts');

    const container = document.getElementById('root');
    const root = createRoot(container);
    let closed = 0;

    await act(async () => {
      root.render(React.createElement(InventoryPanel, {
        copy: GAME_COPY.en,
        snapshot: createSnapshot(),
        onClose: () => { closed += 1; },
      }));
    });

    const dialog = container.querySelector('[role=dialog]');
    assert.ok(dialog, 'the panel is a dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.match(container.textContent, /No samples yet/, 'an empty inventory says what to do');
    assert.match(container.textContent, /illustrative/i, 'the attribution travels with the list');

    await act(async () => {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    assert.equal(closed, 1, 'Escape closes the panel');

    await act(async () => root.unmount());
  } finally {
    dom.window.close();
  }
});

test('the settings panel changes quality and camera through real controls', async () => {
  const dom = mountDom();
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { SettingsPanel } = await import('../src/game/ui/Panels.tsx');

    const container = document.getElementById('root');
    const root = createRoot(container);
    const changes = [];

    await act(async () => {
      root.render(React.createElement(SettingsPanel, {
        copy: GAME_COPY.en,
        quality: 'high',
        cameraMode: 'third',
        sensitivity: 1,
        persistenceAvailable: true,
        onQuality: (value) => changes.push(`quality:${value}`),
        onCamera: (value) => changes.push(`camera:${value}`),
        onSensitivity: () => {},
        onSaveNow: () => {},
        onClearSave: () => {},
        onClose: () => {},
      }));
    });

    const low = [...container.querySelectorAll('[role=radio]')].find((node) => node.textContent === 'Low');
    assert.ok(low, 'the Low preset is a radio');
    await act(async () => { low.click(); });
    assert.deepEqual(changes, ['quality:low']);

    const first = [...container.querySelectorAll('[role=radio]')].find((node) => node.textContent === 'First person');
    await act(async () => { first.click(); });
    assert.deepEqual(changes, ['quality:low', 'camera:first']);

    // The current preset is announced, not merely coloured.
    const high = [...container.querySelectorAll('[role=radio]')].find((node) => node.textContent === 'High');
    assert.equal(high.getAttribute('aria-checked'), 'true');

    await act(async () => root.unmount());
  } finally {
    dom.window.close();
  }
});

test('the map plots the player, rover, stations and discoveries', async () => {
  const dom = mountDom();
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { MapPanel } = await import('../src/game/ui/Panels.tsx');
    const { createSnapshot } = await import('../src/game/state/marsGameStore.ts');

    const container = document.getElementById('root');
    const root = createRoot(container);
    const snapshot = {
      ...createSnapshot(),
      position: { x: 6, y: 0, z: -14 },
      discoveries: [{ id: 'd1', label: 'Olivine site', x: 40, z: -30, at: '' }],
    };

    await act(async () => {
      root.render(React.createElement(MapPanel, { copy: GAME_COPY.en, snapshot, rover: { x: -8, z: -18 }, onClose: () => {} }));
    });

    assert.match(container.textContent, /Surface map/);
    assert.match(container.textContent, /210 m radius/, 'the window size is stated');
    const titles = [...container.querySelectorAll('[title]')].map((node) => node.getAttribute('title'));
    assert.ok(titles.includes('You'), 'the player is plotted');
    assert.ok(titles.includes('Rover'), 'the rover is plotted');
    assert.ok(titles.includes('Hab module'), 'the base is plotted');
    assert.ok(titles.includes('Olivine site'), 'a discovery is plotted');

    await act(async () => root.unmount());
  } finally {
    dom.window.close();
  }
});

test('touch controls produce the intent the engine expects', async () => {
  const { createTouchState, touchToIntent, stickVector, DEAD_ZONE } = await import('../src/game/input/touch.ts');
  const state = createTouchState();

  // A resting thumb must not walk.
  state.move.originX = 100;
  state.move.originY = 100;
  let vector = stickVector(100, 100, 102, 101);
  assert.equal(vector.x, 0, 'inside the dead zone');
  assert.equal(vector.y, 0);

  // Pushing up walks forward: screen Y is inverted into intent.
  vector = stickVector(100, 100, 100, 40);
  state.move.x = vector.x;
  state.move.y = vector.y;
  let intent = touchToIntent(state);
  assert.ok(intent.forward > 0.8, `forward ${intent.forward}`);
  assert.ok(Math.abs(intent.strafe) < 0.01);

  // A diagonal is not faster than a straight push (unit-circle clamp).
  const diagonal = stickVector(100, 100, 40, 40);
  assert.ok(Math.hypot(diagonal.x, diagonal.y) <= 1.0001, `diagonal length ${Math.hypot(diagonal.x, diagonal.y)}`);

  // Full deflection runs.
  state.move.x = 0;
  state.move.y = -1;
  intent = touchToIntent(state);
  assert.equal(intent.running, true, 'full stick runs');

  // Buttons.
  assert.equal(touchToIntent(state).interact, false);
  state.buttons.interact = true;
  assert.equal(touchToIntent(state).interact, true);
  state.buttons.jump = true;
  assert.equal(touchToIntent(state).jump, true);
  assert.ok(DEAD_ZONE > 0 && DEAD_ZONE < 0.2);
});

test('keyboard intent maps WASD and modifiers without stealing typing', async () => {
  const { reduceKeys, CONSUMED_KEYS, ACTION_KEYS } = await import('../src/game/input/keyboard.ts');

  const walk = reduceKeys(new Set(['KeyW']));
  assert.equal(walk.forward, 1);
  assert.equal(walk.running, false);

  const run = reduceKeys(new Set(['KeyW', 'ShiftLeft']));
  assert.equal(run.running, true);

  const diagonal = reduceKeys(new Set(['KeyW', 'KeyD']));
  assert.equal(diagonal.forward, 1);
  assert.equal(diagonal.strafe, 1);

  const back = reduceKeys(new Set(['ArrowDown']));
  assert.equal(back.forward, -1, 'arrow keys work too');

  assert.equal(reduceKeys(new Set(['KeyS', 'KeyW'])).forward, 0, 'opposite keys cancel');

  // Space both jumps (on foot) and brakes (in the rover).
  const space = reduceKeys(new Set(['Space']));
  assert.equal(space.jump, true);
  assert.equal(space.brake, true);

  // Nothing that would break normal page behaviour is consumed.
  for (const code of ['Escape', 'Tab', 'KeyT', 'Enter']) {
    assert.equal(CONSUMED_KEYS.has(code), false, `${code} must not be swallowed`);
  }
  assert.equal(ACTION_KEYS.KeyM, 'toggleMap');
  assert.equal(ACTION_KEYS.KeyJ, 'toggleJournal');
  assert.equal(ACTION_KEYS.KeyI, 'toggleInventory');
});

test('the quality chooser is conservative on weak hardware and generous on strong', async () => {
  const { choosePreset, lowerPixelRatio, QUALITY_PRESETS, createFrameSampler, sampleFrame, shouldDownscale } = await import('../src/game/quality.ts');

  assert.equal(choosePreset({ cores: 16, deviceMemory: 16, mobile: false, softwareRenderer: false, touchPrimary: false }), 'high');
  assert.equal(choosePreset({ cores: 4, deviceMemory: 4, mobile: false, softwareRenderer: false, touchPrimary: false }), 'balanced');
  assert.equal(choosePreset({ cores: 16, deviceMemory: 16, mobile: true, softwareRenderer: false, touchPrimary: true }), 'balanced', 'a strong tablet gets balanced');
  assert.equal(choosePreset({ cores: 4, deviceMemory: 2, mobile: true, softwareRenderer: false, touchPrimary: true }), 'low');
  assert.equal(choosePreset({ cores: 32, deviceMemory: 64, mobile: false, softwareRenderer: true, touchPrimary: false }), 'low', 'a software rasteriser is never high');

  // Resolution steps down but never below the floor, and never above the ceiling.
  let ratio = 2;
  const seen = [];
  for (let i = 0; i < 12; i += 1) {
    ratio = lowerPixelRatio(ratio, QUALITY_PRESETS.low);
    seen.push(ratio);
  }
  assert.ok(Math.min(...seen) >= 0.7, 'never driven to an unreadable buffer');
  assert.ok(seen.every((value, index) => index === 0 || value <= seen[index - 1]));

  // The sampler only asks for a downscale after sustained slowness.
  let sampler = createFrameSampler();
  for (let i = 0; i < 10; i += 1) sampler = sampleFrame(sampler, 40);
  assert.equal(shouldDownscale(sampler), false, '10 slow frames is a hitch, not a trend');
  for (let i = 0; i < 100; i += 1) sampler = sampleFrame(sampler, 40);
  assert.equal(shouldDownscale(sampler), true, '100 slow frames is a trend');
  assert.ok(sampler.fps < 40);

  // Presets are ordered and differ in the ways that cost frame time.
  assert.ok(QUALITY_PRESETS.high.chunkRadius >= QUALITY_PRESETS.low.chunkRadius);
  assert.ok(QUALITY_PRESETS.high.dustCount > QUALITY_PRESETS.low.dustCount);
  assert.ok(QUALITY_PRESETS.high.maxPixelRatio > QUALITY_PRESETS.low.maxPixelRatio);
});

test('the loading screen reports real steps, not a fake animation', async () => {
  const dom = mountDom();
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { LoadingScreen } = await import('../src/game/ui/LoadingScreen.tsx');

    const container = document.getElementById('root');
    const root = createRoot(container);
    const render = async (step, detail) =>
      act(async () => {
        root.render(React.createElement(LoadingScreen, { copy: GAME_COPY.en, step, detail }));
      });

    await render('capability', null);
    assert.match(container.textContent, /0%/);
    assert.equal(container.getAttribute('role'), null);
    // The wrapper is the live region.
    assert.equal(container.querySelector('[role=status]').getAttribute('aria-live'), 'polite');

    await render('world', null);
    assert.match(container.textContent, /33%/);

    await render('restore', 'Resume expedition');
    assert.match(container.textContent, /Resume expedition/, 'the detail line names what is happening');
    assert.match(container.textContent, /67%/);

    await render('ready', null);
    assert.match(container.textContent, /100%/, 'reaching ready means 100%, not "stuck at 90"');

    await act(async () => root.unmount());
  } finally {
    dom.window.close();
  }
});

test('the menu offers fullscreen only when the host can provide it', async () => {
  const dom = mountDom();
  globalThis.fetch = async () => new Response('', { status: 503 });
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { MainMenu } = await import('../src/game/ui/MainMenu.tsx');

    const container = document.getElementById('root');
    const root = createRoot(container);
    const base = { lang: 'en', hasSave: false, onStart: () => {}, onContinue: () => {}, onExit: () => {}, starting: false, startError: null };

    await act(async () => {
      root.render(React.createElement(MainMenu, base));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal([...container.querySelectorAll('button')].some((b) => /Fullscreen/.test(b.textContent)), false, 'no control when the host cannot do it');

    let asked = 0;
    await act(async () => {
      root.render(React.createElement(MainMenu, { ...base, onRequestFullscreen: () => { asked += 1; } }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const fullscreen = [...container.querySelectorAll('button')].find((b) => /Fullscreen/.test(b.textContent));
    assert.ok(fullscreen, 'the control appears when offered');
    await act(async () => { fullscreen.click(); });
    assert.equal(asked, 1);

    await act(async () => root.unmount());
  } finally {
    globalThis.fetch = realFetch;
    dom.window.close();
  }
});

test('touch state resets held actions and pointer ownership on focus loss', async () => {
  const { createTouchState, resetTouchState, touchToIntent } = await import('../src/game/input/touch.ts');
  const state = createTouchState();
  Object.assign(state.move, { active: true, pointerId: 3, x: 0.8, y: -1 });
  state.buttons.board = true;
  resetTouchState(state);
  assert.equal(state.move.pointerId, null);
  assert.equal(state.move.active, false);
  assert.ok(Math.abs(touchToIntent(state).forward) === 0);
  assert.equal(touchToIntent(state).board, false);
});
