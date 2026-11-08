/**
 * Space News surface tests — DOM, no network.
 *
 * The contract under test is honesty:
 *   - only configured providers appear as live; a keyless provider says so and
 *     is never called;
 *   - every story shows the publisher and links out; nothing is invented when a
 *     feed is empty or down;
 *   - "Ask NOVA" quotes only the title/summary the server delivered.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-news.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

function installDom() {
  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: false,
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  window.Element.prototype.scrollIntoView = () => {};

  for (const [key, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: window.matchMedia,
  })) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

const NEWS_BODY = {
  ok: true,
  items: [
    {
      id: 'spaceflight-1',
      title: 'Webb measures a rocky exoplanet atmosphere',
      summary: 'Transmission spectra hint at a thin atmosphere around a nearby super-Earth.',
      url: 'https://example.org/webb-exoplanet',
      imageUrl: null,
      sourceId: 'spaceflight',
      sourceLabel: 'Spaceflight Now',
      publishedAt: '2026-11-07T09:00:00Z',
      kind: 'news',
    },
    {
      id: 'guardian-2',
      title: 'Black hole jet traced to its launch point',
      summary: 'Radio interferometry pins the jet base within a few Schwarzschild radii.',
      url: 'https://example.org/black-hole-jet',
      imageUrl: null,
      sourceId: 'guardian',
      sourceLabel: 'The Guardian',
      publishedAt: '2026-11-06T12:00:00Z',
      kind: 'news',
    },
  ],
  sources: [
    { id: 'spaceflight', label: 'Spaceflight News', kind: 'news', envVar: null, docs: 'https://x', configured: true, state: 'ok', count: 1 },
    { id: 'gnews', label: 'GNews', kind: 'news', envVar: 'GNEWS_API_KEY', docs: 'https://x', configured: false, state: 'unconfigured', count: 0 },
    { id: 'guardian', label: 'The Guardian', kind: 'news', envVar: 'GUARDIAN_API_KEY', docs: 'https://x', configured: true, state: 'ok', count: 1 },
  ],
  generatedAt: '2026-11-08T10:00:00Z',
};

const PAPERS_BODY = {
  ok: true,
  items: [
    {
      id: 'arxiv-2611.00001',
      title: 'Probing reionization with 21cm tomography',
      summary: 'We present a new limit on the epoch of reionization.',
      url: 'https://arxiv.org/abs/2611.00001v1',
      authors: ['A. Astronomer', 'B. Cosmologist'],
      publishedAt: '2026-11-07T18:00:00Z',
      categories: ['astro-ph.CO'],
      kind: 'paper',
    },
  ],
};

function stubFetch({ news = NEWS_BODY, newsStatus = 200, papers = PAPERS_BODY, papersStatus = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const target = String(url);
    calls.push(target);
    const status = target.includes('/papers') ? papersStatus : newsStatus;
    const body = target.includes('/papers') ? papers : news;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  return calls;
}

async function mountNews() {
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const { default: i18n } = await import('../src/i18n.ts');
  const { default: NewsSurface } = await import('../src/workspace/news/NewsSurface.tsx');

  window.history.replaceState({}, '', '/news');
  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(NewsSurface)));
  });
  await settle(act, 60);

  return {
    act,
    i18n,
    text: () => document.body.textContent || '',
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

async function settle(act, ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

test('configured sources render as live, keyless ones say so and are never called', async () => {
  const dom = installDom();
  try {
    const calls = stubFetch();
    const app = await mountNews();

    const chips = [...document.querySelectorAll('.nova-news-source')];
    const text = chips.map((chip) => chip.textContent || '');
    const gnews = chips.find((chip) => /GNews/.test(chip.textContent || ''));
    assert.ok(gnews, 'the keyless provider is still listed');
    assert.match(gnews.className, /nova-news-source--off/);
    assert.match(gnews.textContent, /no key/);
    assert.match(gnews.getAttribute('title') || '', /GNEWS_API_KEY/, 'the UI names the env var to set');
    assert.ok(text.some((entry) => /Spaceflight News/.test(entry) && /live/.test(entry)));
    assert.equal(calls.filter((url) => url.includes('gnews')).length, 0, 'a keyless provider is never called');

    // Only the two routes the surface owns are fetched.
    assert.equal(calls.length, 2);
    assert.ok(calls.some((url) => url.startsWith('/api/news?topic=all')));
    assert.ok(calls.some((url) => url.startsWith('/api/news/papers')));
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('stories render with their publisher, an outbound link and a grounded Ask NOVA', async () => {
  const dom = installDom();
  try {
    stubFetch();
    window.sessionStorage.clear();
    const app = await mountNews();

    const cards = [...document.querySelectorAll('.nova-news-card')];
    assert.equal(cards.length, 2);
    assert.match(cards[0].textContent, /Webb measures a rocky exoplanet atmosphere/);
    assert.match(cards[0].textContent, /Spaceflight Now/);

    const links = [...cards[0].querySelectorAll('a')];
    const outbound = links.find((link) => link.getAttribute('href') === 'https://example.org/webb-exoplanet');
    assert.ok(outbound, 'the headline links to the publisher');
    assert.equal(outbound.getAttribute('target'), '_blank');
    assert.match(outbound.getAttribute('rel') || '', /noopener/);

    const ask = [...cards[0].querySelectorAll('button')].find((node) => /Ask NOVA/.test(node.textContent || ''));
    assert.ok(ask, 'each story can be handed to the AI');
    await app.act(async () => {
      ask.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 40);

    const prompt = window.sessionStorage.getItem('nova_pending_prompt') || '';
    assert.match(prompt, /Webb measures a rocky exoplanet atmosphere/);
    assert.match(prompt, /Spaceflight Now/);
    assert.match(prompt, /Transmission spectra/);
    assert.equal(window.sessionStorage.getItem('nova_pending_thinking'), 'thinking');
    assert.equal(window.location.pathname, '/chat');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('an empty feed says so instead of showing filler', async () => {
  const dom = installDom();
  try {
    stubFetch({ news: { ok: true, items: [], sources: NEWS_BODY.sources, generatedAt: '2026-11-08T10:00:00Z' } });
    const app = await mountNews();

    assert.equal(document.querySelectorAll('.nova-news-card').length, 0);
    assert.match(app.text(), /No headlines right now/);
    assert.match(app.text(), /nothing is filled in for you/i);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a failed feed offers a retry that refetches', async () => {
  const dom = installDom();
  try {
    const calls = stubFetch({ news: { ok: false, code: 'upstream' }, newsStatus: 502 });
    const app = await mountNews();

    assert.match(app.text(), /news feed could not be reached/);
    const before = calls.length;
    const retry = [...document.querySelectorAll('button')].find((node) => /Retry/.test(node.textContent || ''));
    assert.ok(retry, 'a retry button is offered');
    await app.act(async () => {
      retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 60);
    assert.ok(calls.length > before, 'retry performs a new request');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('arXiv papers render with authors and their own Ask NOVA prompt', async () => {
  const dom = installDom();
  try {
    stubFetch();
    window.sessionStorage.clear();
    const app = await mountNews();

    const paper = document.querySelector('.nova-paper');
    assert.ok(paper, 'a paper row is rendered');
    assert.match(paper.textContent, /Probing reionization with 21cm tomography/);
    assert.match(paper.textContent, /2 authors/);
    assert.match(paper.textContent, /astro-ph\.CO/);
    const link = paper.querySelector('a');
    assert.equal(link.getAttribute('href'), 'https://arxiv.org/abs/2611.00001v1');

    const ask = [...paper.querySelectorAll('button')].find((node) => /Explain this paper/.test(node.textContent || ''));
    assert.ok(ask);
    await app.act(async () => {
      ask.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 40);
    const prompt = window.sessionStorage.getItem('nova_pending_prompt') || '';
    assert.match(prompt, /Probing reionization/);
    assert.match(prompt, /A\. Astronomer/);
    assert.match(prompt, /new limit on the epoch of reionization/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('the news copy exists in Sinhala and Tamil too', async () => {
  const { workspaceCopy } = await import('../src/i18n/workspaceCopy.ts');
  for (const lang of ['si', 'ta']) {
    for (const key of ['wsMenuNews', 'wsNewsTitle', 'wsNewsEmptyBody', 'wsNewsAskPrompt', 'wsNewsPaperPrompt', 'wsAreaNewsDesc']) {
      assert.ok(workspaceCopy[lang][key] && workspaceCopy[lang][key].trim(), `${lang}.${key}`);
      assert.notEqual(workspaceCopy[lang][key], workspaceCopy.en[key], `${lang}.${key} is translated`);
    }
  }
});
