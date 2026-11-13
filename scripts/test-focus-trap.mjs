/**
 * Focus trap behaviour, in jsdom.
 *
 * `useFocusTrap` already existed for the mobile drawer and the command palette.
 * This pins what it actually does, and asserts the two sheets that were missing
 * it now use it — a static "it is imported" check would pass even if the hook
 * were wired to the wrong element.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-focus-trap.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'localStorage', 'sessionStorage', 'getComputedStyle']) {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
  // jsdom performs no layout, so every element reports 0x0 and the hook's
  // "is it visible?" filter (offsetWidth/offsetHeight) excludes everything. Give
  // the prototype a fake box instead of weakening the filter in production code.
  for (const dimension of ['offsetWidth', 'offsetHeight']) {
    Object.defineProperty(dom.window.HTMLElement.prototype, dimension, {
      configurable: true,
      get() {
        return this.style.display === 'none' || this.hasAttribute('hidden') ? 0 : 10;
      },
    });
  }
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

/** jsdom has no layout, so visibility is decided by the style attribute. */
function visible(el) {
  return el.style.display !== 'none' && !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true';
}

test('the trap keeps Tab inside an open panel and restores focus when it closes', async () => {
  const dom = installDom();
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useFocusTrap } = await import('../src/app/hooks.ts');

    function Harness({ open }) {
      const ref = React.useRef(null);
      useFocusTrap(open, ref);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement('button', { id: 'outside' }, 'outside'),
        React.createElement(
          'div',
          { id: 'panel', ref },
          React.createElement('button', { id: 'first' }, 'first'),
          React.createElement('button', { id: 'middle' }, 'middle'),
          React.createElement('button', { id: 'last' }, 'last'),
        ),
      );
    }

    const outside = document.createElement('button');
    outside.id = 'trigger';
    outside.textContent = 'trigger';
    document.body.appendChild(outside);
    outside.focus();
    assert.equal(document.activeElement.id, 'trigger');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // React flushes the effect at the end of `act`, so the requestAnimationFrame
    // it schedules lands in a second turn. Waiting inside the same act block would
    // assert before the trap had a chance to run.
    await act(async () => {
      root.render(React.createElement(Harness, { open: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // Opening moves focus to the first control inside the panel.
    assert.equal(document.activeElement.id, 'first', 'focus must move into the panel');

    // Tab from the last control wraps to the first instead of leaving.
    const panel = document.getElementById('panel');
    document.getElementById('last').focus();
    const tab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true, 'the trap must intercept Tab at the end');
    assert.equal(document.activeElement.id, 'first', 'Tab from the last control wraps to the first');

    // Shift+Tab from the first wraps to the last.
    document.getElementById('first').focus();
    const shiftTab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(shiftTab);
    assert.equal(shiftTab.defaultPrevented, true);
    assert.equal(document.activeElement.id, 'last', 'Shift+Tab from the first wraps to the last');

    // A Tab from the middle is left to the browser: the trap must not hijack it.
    document.getElementById('middle').focus();
    const middleTab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(middleTab);
    assert.equal(middleTab.defaultPrevented, false, 'Tab in the middle is not intercepted');

    // Closing restores focus to whatever was focused before the panel opened.
    await act(async () => {
      root.render(React.createElement(Harness, { open: false }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(document.activeElement.id, 'trigger', 'focus returns to the trigger');

    assert.ok(panel, 'the panel existed');

    await act(async () => root.unmount());
  } finally {
    dom.window.close();
  }
});

test('a closed trap does not listen at all', async () => {
  const dom = installDom();
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useFocusTrap } = await import('../src/app/hooks.ts');

    function Harness() {
      const ref = React.useRef(null);
      useFocusTrap(false, ref);
      return React.createElement('div', { ref }, React.createElement('button', { id: 'only' }, 'only'));
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Harness));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const event = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, 'an inactive trap must not swallow Tab');
    await act(async () => root.unmount());
  } finally {
    dom.window.close();
  }
});

test('both mobile sheets, the drawer and the palette are wired to the trap', () => {
  const files = [
    'src/ui/AppHeader.tsx',
    'src/ui/MobileTabBar.tsx',
    'src/app/MobileDrawer.tsx',
    'src/app/CommandPalette.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /useFocusTrap\(/, `${file} must trap focus`);
    // The hook is useless without a ref on the panel it is trapping.
    const call = /useFocusTrap\(([^)]*)\)/.exec(source);
    assert.match(call[1], /Ref/, `${file} must pass a panel ref to useFocusTrap`);
    assert.match(source, new RegExp(`ref=\\{${call[1].split(',')[1].trim()}\\}`), `${file} must attach that ref to the panel`);
  }
});
