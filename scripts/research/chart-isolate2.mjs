/** Second isolation pass: reproduce the Lab's exact chart composition. */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/', pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch {}
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
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  const cls = this.getAttribute?.('class') || '';
  // Recharts measures the legend and the tooltip portaller to reserve plot space.
  if (cls.includes('recharts-legend-wrapper')) return { x: 0, y: 280, top: 280, left: 0, right: 900, bottom: 300, width: 900, height: 20, toJSON: () => ({}) };
  if (cls.includes('recharts-default-legend')) return { x: 0, y: 280, top: 280, left: 0, right: 900, bottom: 300, width: 900, height: 20, toJSON: () => ({}) };
  if (this.tagName === 'LI' || this.tagName === 'SPAN' || this.tagName === 'text' || this.tagName === 'tspan') return { x: 0, y: 0, top: 0, left: 0, right: 60, bottom: 16, width: 60, height: 16, toJSON: () => ({}) };
  return { x: 0, y: 0, top: 0, left: 0, right: 900, bottom: 300, width: 900, height: 300, toJSON: () => ({}) };
};
class RO { constructor(cb) { this.cb = cb; } observe(t) { this.cb([{ target: t, contentRect: { width: 900, height: 300 } }]); } unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO; window.ResizeObserver = RO;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const R = await import('recharts');

const START = 2005, END = 2024;
const rows = [];
for (let y = START; y <= END; y += 1) {
  for (let m = 1; m <= 12; m += 1) {
    const value = Number((27.6 + 1.6 * Math.sin(((m - 4) / 12) * 2 * Math.PI) + (y - START) * 0.02).toFixed(2));
    rows.push({ date: `${y}-${String(m).padStart(2, '0')}`, value, annualMean: 27.6 });
  }
}
const h = React.createElement;

const variants = {
  'Tooltip only (no formatter)': h(R.ComposedChart, { data: rows },
    h(R.XAxis, { dataKey: 'date' }), h(R.YAxis, { width: 56 }), h(R.Tooltip, null),
    h(R.Line, { dataKey: 'value', dot: false })
  ),
  'Tooltip only (array formatter)': h(R.ComposedChart, { data: rows },
    h(R.XAxis, { dataKey: 'date' }), h(R.YAxis, { width: 56 }),
    h(R.Tooltip, { formatter: (v) => [`${v} °C`, 'x'] }),
    h(R.Line, { dataKey: 'value', dot: false })
  ),
  'Legend only': h(R.ComposedChart, { data: rows },
    h(R.XAxis, { dataKey: 'date' }), h(R.YAxis, { width: 56 }), h(R.Legend, null),
    h(R.Line, { dataKey: 'value', dot: false })
  ),
  'Tooltip + Legend': h(R.ComposedChart, { data: rows },
    h(R.XAxis, { dataKey: 'date' }), h(R.YAxis, { width: 56 }),
    h(R.Tooltip, null), h(R.Legend, null),
    h(R.Line, { dataKey: 'value', dot: false })
  ),
  'Tooltip + Legend (Lab order, 2 lines)': h(R.ComposedChart, { data: rows },
    h(R.CartesianGrid, { stroke: '#1e293b' }),
    h(R.XAxis, { dataKey: 'date' }), h(R.YAxis, { width: 56 }),
    h(R.Tooltip, null), h(R.Legend, { wrapperStyle: { fontSize: 11 } }),
    h(R.Line, { dataKey: 'value', dot: false, name: 'A' }),
    h(R.Line, { dataKey: 'annualMean', dot: false, name: 'B' })
  ),
  'Legend + Line name prop': h(R.ComposedChart, { data: rows },
    h(R.Legend, null), h(R.Line, { dataKey: 'value', dot: false, name: 'Temperature' })
  )
};

const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.map((a) => String(a?.message || a)).join(' ')); };
console.warn = () => {};

for (const [name, node] of Object.entries(variants)) {
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const root = createRoot(host);
  root.render(h(R.ResponsiveContainer, { width: 900, height: 300 }, node));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const lines = host.querySelectorAll('.recharts-line, .recharts-line-curve');
  console.log(`${lines.length ? '✔' : '✘'} ${name} — line nodes: ${lines.length}, errors: ${errors.length}`);
  if (errors.length) console.log('    last error:', errors[errors.length - 1].slice(0, 300));
  errors.length = 0;
  root.unmount();
  host.remove();
}
console.error = origError;
process.exit(0);
