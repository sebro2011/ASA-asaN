/**
 * NOVA AI — brand icon generator.
 *
 * Renders every raster brand asset from one vector definition so the mark can
 * never drift between the favicon, the PWA icon and the in-app logo.
 *
 * Requires a one-off rasteriser (not a runtime/build dependency):
 *   npm i --no-save sharp
 *   node scripts/generate-brand-icons.mjs
 *
 * Outputs (all git-tracked):
 *   public/favicon.ico · favicon.png · apple-touch-icon.png
 *   public/pwa-192x192.png · pwa-512x512.png · pwa-maskable-512x512.png
 *   public/logo.png · public/icon.svg
 *   public/brand/icon-192.png · icon-512.png · og-image.png · nova-mark.png
 *
 * Legacy assets are preserved in public/brand/legacy/ — never overwritten here.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pub = (...p) => path.join(root, 'public', ...p);

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('Missing rasteriser. Run: npm i --no-save sharp');
  process.exit(1);
}

/* ----------------------------------------------------------------- artwork */

const STAR = `
  <path d="M13 2.4c.92 5.6 4.08 8.76 9.68 9.68-5.6.92-8.76 4.08-9.68 9.68-.92-5.6-4.08-8.76-9.68-9.68C8.92 11.16 12.08 8 13 2.4Z"
        fill="url(#starGrad)" />
  <path d="M23.6 17.8c.42 2.56 1.86 4 4.42 4.42-2.56.42-4 1.86-4.42 4.42-.42-2.56-1.86-4-4.42-4.42 2.56-.42 4-1.86 4.42-4.42Z"
        fill="#FFFFFF" fill-opacity="0.92" />`;

const defs = `
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#171C2B" />
      <stop offset="0.55" stop-color="#101320" />
      <stop offset="1" stop-color="#080A11" />
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(168 120) rotate(38) scale(300)">
      <stop offset="0" stop-color="#5B84FF" stop-opacity="0.42" />
      <stop offset="0.6" stop-color="#5B84FF" stop-opacity="0.08" />
      <stop offset="1" stop-color="#5B84FF" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="starGrad" x1="4" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#C3D2FF" />
      <stop offset="0.52" stop-color="#5B84FF" />
      <stop offset="1" stop-color="#7A58FF" />
    </linearGradient>
  </defs>`;

/** @param {'rounded'|'square'} shape @param {number} scale 32-unit → 512-unit scale */
function iconSvg(shape, scale) {
  const rx = shape === 'rounded' ? 116 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${defs}
  <rect width="512" height="512" rx="${rx}" ry="${rx}" fill="url(#bgGrad)" />
  <rect width="512" height="512" rx="${rx}" ry="${rx}" fill="url(#glow)" />
  <rect x="0.5" y="0.5" width="511" height="511" rx="${rx}" ry="${rx}" fill="none"
        stroke="#FFFFFF" stroke-opacity="0.06" />
  <g transform="translate(256 256) scale(${scale}) translate(-15.2 -15.4)">${STAR}</g>
</svg>`;
}

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  ${defs}
  <rect width="1200" height="630" fill="#08090D" />
  <rect width="1200" height="630" fill="url(#glow)" opacity="0.5" />
  <g opacity="0.13" stroke="#8FA6FF" stroke-width="1">
    ${Array.from({ length: 13 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="630" />`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="1200" y2="${i * 100}" />`).join('')}
  </g>
  <g transform="translate(820 150) scale(11)" opacity="0.07">${STAR}</g>
  <g transform="translate(88 116) scale(5.1)">${STAR}</g>
  <text x="86" y="424" font-family="Inter, DejaVu Sans, Segoe UI, sans-serif" font-size="92"
        font-weight="700" letter-spacing="-3" fill="#F5F7FF">NOVA</text>
  <text x="382" y="424" font-family="Inter, DejaVu Sans, Segoe UI, sans-serif" font-size="92"
        font-weight="700" letter-spacing="-3" fill="#5B84FF">AI</text>
  <text x="88" y="482" font-family="Inter, DejaVu Sans, Segoe UI, sans-serif" font-size="27"
        fill="#9299AA">AI assistant &amp; productivity workspace</text>
  <rect x="88" y="524" width="64" height="3" rx="1.5" fill="#5B84FF" />
  <rect x="160" y="524" width="22" height="3" rx="1.5" fill="#8B6BFF" opacity="0.85" />
  <text x="88" y="566" font-family="Inter, DejaVu Sans, Segoe UI, sans-serif" font-size="19"
        letter-spacing="2.4" fill="#6E7686">CHAT · DOCUMENTS · PROJECTS · RESEARCH · EXPLORE</text>
</svg>`;

/* ------------------------------------------------------------------ writers */

function icoBuffer(pngs) {
  // PNG-compressed ICO (supported by every current browser and by Windows).
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const render = async (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer();

const renderWide = async (svg, width, height) =>
  sharp(Buffer.from(svg)).resize(width, height, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();

/* ------------------------------------------------------------------- build */

await mkdir(pub('brand'), { recursive: true });

const rounded = iconSvg('rounded', 10.4);
const square = iconSvg('square', 10.4);
const maskable = iconSvg('square', 7.6);

await writeFile(pub('icon.svg'), rounded, 'utf8');
await sharp(Buffer.from(rounded)).resize(512, 512).png().toFile(pub('logo.png'));
await sharp(Buffer.from(rounded)).resize(512, 512).png().toFile(pub('brand', 'icon-512.png'));
await sharp(Buffer.from(rounded)).resize(192, 192).png().toFile(pub('brand', 'icon-192.png'));
await sharp(Buffer.from(rounded)).resize(192, 192).png().toFile(pub('pwa-192x192.png'));
await sharp(Buffer.from(rounded)).resize(512, 512).png().toFile(pub('pwa-512x512.png'));
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(pub('pwa-maskable-512x512.png'));
await sharp(Buffer.from(square)).resize(180, 180).png().toFile(pub('apple-touch-icon.png'));
await sharp(Buffer.from(rounded)).resize(32, 32).png().toFile(pub('favicon.png'));

const favSizes = [16, 32, 48];
const favPngs = await Promise.all(
  favSizes.map(async (size) => ({ size, data: await render(rounded, size) })),
);
await writeFile(pub('favicon.ico'), icoBuffer(favPngs));

// NOTE: public/brand/og-image.png is the commissioned NASA Space Explorer
// artwork (1200x630, palette PNG). Re-running this script overwrites it with the
// older SVG lockup — only do that if the artwork is being replaced on purpose.
await sharp(Buffer.from(ogSvg)).resize(1200, 630).png({ compressionLevel: 9 }).toFile(pub('brand', 'og-image.png'));

const mark = await readFile(pub('brand', 'nova-mark.svg'), 'utf8');
await sharp(Buffer.from(mark)).resize(256, 256).png().toFile(pub('brand', 'nova-mark.png'));

console.log('Brand icons written:');
for (const file of ['favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'pwa-192x192.png',
  'pwa-512x512.png', 'pwa-maskable-512x512.png', 'logo.png', 'icon.svg',
  'brand/icon-192.png', 'brand/icon-512.png', 'brand/og-image.png', 'brand/nova-mark.png']) {
  console.log(' ·', file);
}
