/**
 * Isolation harness for the Recharts line-series defect.
 * Renders several minimal chart variants in the same jsdom environment and
 * reports which ones produce a rendered line layer.
 */

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
try {
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
} catch {}
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.NodeList = window.NodeList;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(globalThis, 'screen', { value: window.screen, configurable: true });
globalThis.self = window;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

window.Element.prototype.getBoundingClientRect = () => ({
  x: 0, y: 0, top: 0, left: 0, right: 900, bottom: 300, width: 900, height: 300, toJSON: () => ({})
});
class RO {
  constructor(cb) { this.cb = cb; }
  observe(target) { this.cb([{ target, contentRect: { width: 900, height: 300 } }]); }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const R = await import('recharts');

const data = Array.from({ length: 24 }).map((_, index) => ({
  date: `2020-${String((index % 12) + 1).padStart(2, '0')}`,
  value: 20 + Math.sin(index / 3) * 3,
  annual: 20
}));

const variants = {
  'ComposedChart + Line (bare)': React.createElement(
    R.ComposedChart,
    { data },
    React.createElement(R.Line, { dataKey: 'value' })
  ),
  'ComposedChart + Line (styled like the Lab)': React.createElement(
    R.ComposedChart,
    { data },
    React.createElement(R.Line, {
      type: 'monotone',
      dataKey: 'value',
      stroke: '#38bdf8',
      strokeWidth: 1.6,
      dot: false,
      isAnimationActive: false,
      connectNulls: false
    })
  ),
  'LineChart + Line': React.createElement(R.LineChart, { data }, React.createElement(R.Line, { dataKey: 'value' })),
  'ComposedChart + XAxis + Line': React.createElement(
    R.ComposedChart,
    { data },
    React.createElement(R.XAxis, { dataKey: 'date' }),
    React.createElement(R.Line, { dataKey: 'value', dot: false }),
    React.createElement(R.YAxis, null)
  )
};

for (const [name, node] of Object.entries(variants)) {
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(R.ResponsiveContainer, { width: 900, height: 300 }, node));
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const lines = host.querySelectorAll('.recharts-line, .recharts-line-curve');
  const paths = host.querySelectorAll('svg.recharts-surface path');
  console.log(`${lines.length ? '✔' : '✘'} ${name} — line nodes: ${lines.length}, paths: ${paths.length}`);
  if (!lines.length) {
    const classes = new Set();
    host.querySelectorAll('*').forEach((el) => {
      (el.getAttribute('class') || '').split(/\s+/).filter((c) => c.startsWith('recharts')).forEach((c) => classes.add(c));
    });
    console.log('    classes:', [...classes].sort().join(' ').slice(0, 300));
  }
  await act(async () => root.unmount());
  host.remove();
}
process.exit(0);
