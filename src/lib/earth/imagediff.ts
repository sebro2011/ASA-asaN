/**
 * Derived metric for two-date comparison.
 *
 * The metric is computed from the *rendered* WMS images of the same bounding
 * box, so pixels line up exactly. It is deliberately labelled as a rendered
 * difference: it is not a calibrated reflectance change, not an NDVI change, and
 * not evidence of a trend. Pixel comparison only runs when the imagery is
 * served with permissive CORS headers; otherwise the function reports why it
 * could not run instead of inventing a number.
 */

import { wmsGetMapUrl, bbox3857FromLatLngBounds } from './gibsClient';
import type { GibsLayerMeta } from './types';

export interface RenderedDifference {
  /** Mean absolute luminance difference, 0–1 (rendered pixels only). */
  meanAbsoluteDifference: number;
  /** Share of pixels whose luminance changed by more than 12/255. */
  changedFraction: number;
  sampledPixels: number;
  /** Fraction of pixels that are fully transparent in either image. */
  transparentFraction: number;
  urlA: string;
  urlB: string;
  computedAt: string;
  method: string;
}

export type DifferenceOutcome =
  | { ok: true; result: RenderedDifference }
  | { ok: false; reason: 'cors' | 'load-failed' | 'canvas-unsupported'; detail: string };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

/**
 * Compare the rendered imagery of one layer between two dates over a bounding box.
 * `bounds` is `[south, west, north, east]` in degrees.
 */
export async function compareRenderedImagery(
  layer: GibsLayerMeta,
  dateA: string,
  dateB: string,
  bounds: [number, number, number, number],
  size = 256
): Promise<DifferenceOutcome> {
  if (typeof document === 'undefined') {
    return { ok: false, reason: 'canvas-unsupported', detail: 'No DOM available for image comparison.' };
  }
  const [south, west, north, east] = bounds;
  const bbox = bbox3857FromLatLngBounds(south, west, north, east);
  const urlA = wmsGetMapUrl({ layer, time: dateA, bbox3857: bbox, width: size, height: size });
  const urlB = wmsGetMapUrl({ layer, time: dateB, bbox3857: bbox, width: size, height: size });

  try {
    const [imageA, imageB] = await Promise.all([loadImage(urlA), loadImage(urlB)]);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false, reason: 'canvas-unsupported', detail: 'A 2D canvas context could not be created.' };

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(imageA, 0, 0, size, size);
    const dataA = ctx.getImageData(0, 0, size, size).data; // throws (SecurityError) when the canvas is tainted
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(imageB, 0, 0, size, size);
    const dataB = ctx.getImageData(0, 0, size, size).data;

    let sum = 0;
    let changed = 0;
    let transparent = 0;
    const pixels = size * size;
    for (let index = 0; index < pixels; index += 1) {
      const offset = index * 4;
      const aAlpha = dataA[offset + 3] / 255;
      const bAlpha = dataB[offset + 3] / 255;
      if (aAlpha === 0 || bAlpha === 0) {
        transparent += 1;
        continue;
      }
      const lumA = 0.2126 * dataA[offset] + 0.7152 * dataA[offset + 1] + 0.0722 * dataA[offset + 2];
      const lumB = 0.2126 * dataB[offset] + 0.7152 * dataB[offset + 1] + 0.0722 * dataB[offset + 2];
      const diff = Math.abs(lumA - lumB);
      sum += diff;
      if (diff > 12) changed += 1;
    }

    const compared = Math.max(1, pixels - transparent);
    return {
      ok: true,
      result: {
        meanAbsoluteDifference: Number((sum / compared / 255).toFixed(4)),
        changedFraction: Number((changed / compared).toFixed(4)),
        sampledPixels: compared,
        transparentFraction: Number((transparent / pixels).toFixed(4)),
        urlA,
        urlB,
        computedAt: new Date().toISOString(),
        method: `Mean absolute luminance difference over a ${size}×${size} WMS rendering of the same bounding box (${south.toFixed(2)}, ${west.toFixed(2)}, ${north.toFixed(2)}, ${east.toFixed(2)}).`
      }
    };
  } catch (error) {
    const message = (error as Error)?.message || 'unknown error';
    if (/security|tainted|cross-origin/i.test(message)) {
      return {
        ok: false,
        reason: 'cors',
        detail: 'The imagery service did not permit pixel readback (CORS), so no rendered difference could be computed.'
      };
    }
    return { ok: false, reason: 'load-failed', detail: `Imagery could not be loaded for comparison (${message}).` };
  }
}
