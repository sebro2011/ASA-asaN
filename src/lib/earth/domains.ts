/**
 * GIBS OGC WMTS `DescribeDomains` parsing and observation-date availability.
 *
 * GIBS answers a DescribeDomains request with the observation-date domain that
 * the layer currently exposes, e.g.
 *
 *   time
 *   2000-02-24/2000-04-25/P1D
 *   2000-04-28/2000-08-06/P1D
 *   ...
 *
 * Ranges are inclusive. Gaps are meaningful: a date inside a gap had no
 * published imagery for that layer, so the Lab refuses to render it (GIBS may
 * otherwise answer with the nearest available day, which would mislabel the
 * observation date shown to the user).
 *
 * Pure functions only — no network, no DOM. Covered by scripts/test-earth-intelligence.mjs.
 */

import type { AvailabilityVerdict, GibsDomain, GibsTimeRange } from './types';

export interface DescribeDomainsError extends Error {
  code: 'invalid-layer' | 'invalid-tilematrixset' | 'unparseable' | 'service-error';
  detail?: string;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function toIsoDate(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${String(input)}`);
  return date.toISOString().slice(0, 10);
}

/** Whole-day difference `b - a` in UTC. */
export function daysBetween(a: string, b: string): number {
  const ma = Date.parse(`${a}T00:00:00Z`);
  const mb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((mb - ma) / 86400000);
}

export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Turn the raw DescribeDomains response body into structured ranges.
 * Throws a typed error when GIBS rejected the layer / tile matrix set.
 */
export function classifyDescribeDomainsError(text: string): DescribeDomainsError | null {
  const lower = text.toLowerCase();
  if (lower.includes('invalid layer')) {
    const error = new Error('GIBS reports this layer identifier as invalid.') as DescribeDomainsError;
    error.code = 'invalid-layer';
    return error;
  }
  if (lower.includes('tilematrixset is invalid')) {
    const error = new Error('GIBS reports this tile matrix set as invalid for the layer.') as DescribeDomainsError;
    error.code = 'invalid-tilematrixset';
    return error;
  }
  if (lower.includes('exceptionreport')) {
    const error = new Error('GIBS returned an OGC exception for this request.') as DescribeDomainsError;
    error.code = 'service-error';
    return error;
  }
  return null;
}

const ISO_RANGE = /(\d{4}-\d{2}-\d{2})(?:T[\d:.]+Z?)?\s*\/\s*(\d{4}-\d{2}-\d{2})(?:T[\d:.]+Z?)?(?:\s*\/\s*(P[0-9A-Z]+))?/g;
const ISO_SINGLE = /(\d{4}-\d{2}-\d{2})(?:T[\d:.]+Z?)?/g;

/**
 * Parse the ISO 8601 time values that GIBS returns for the layer's Time
 * dimension. Handles both interval values (`start/end/P1D`) and single dates.
 */
export function parseTimeValues(xml: string): GibsTimeRange[] {
  const text = String(xml || '').replace(/\r/g, '');
  const consumed: Array<[number, number]> = [];
  const ranges: GibsTimeRange[] = [];

  ISO_RANGE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ISO_RANGE.exec(text)) !== null) {
    const [, start, end, period] = match;
    if (!isIsoDate(start) || !isIsoDate(end)) continue;
    const [from, to] = start <= end ? [start, end] : [end, start];
    ranges.push({ start: from, end: to, period: period || undefined });
    consumed.push([match.index, match.index + match[0].length]);
  }

  ISO_SINGLE.lastIndex = 0;
  while ((match = ISO_SINGLE.exec(text)) !== null) {
    const value = match[1];
    const start = match.index;
    const end = start + match[0].length;
    if (consumed.some(([s, e]) => start >= s && start < e)) continue;
    if (!isIsoDate(value)) continue;
    if (!ranges.some((range) => range.start === value && range.end === value)) {
      ranges.push({ start: value, end: value, period: 'P0D' });
    }
  }

  return ranges
    .filter((range, index, all) =>
      index === all.findIndex((other) => other.start === range.start && other.end === range.end)
    )
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

export interface BuildDomainArgs {
  layerId: string;
  tileMatrixSet?: string;
  xml: string;
  sourceUrl: string;
  retrievedAt?: string;
  fromCache?: boolean;
}

/** Build a `GibsDomain` from a DescribeDomains response, or throw a typed error. */
export function buildDomain({ layerId, tileMatrixSet, xml, sourceUrl, retrievedAt, fromCache }: BuildDomainArgs): GibsDomain {
  const failure = classifyDescribeDomainsError(xml);
  if (failure) throw failure;

  const ranges = parseTimeValues(xml);
  if (!ranges.length) {
    const error = new Error('No observation-date domain was found in the GIBS response.') as DescribeDomainsError;
    error.code = 'unparseable';
    error.detail = String(xml).slice(0, 200);
    throw error;
  }

  return {
    layerId,
    tileMatrixSet,
    ranges,
    minDate: ranges[0].start,
    maxDate: ranges[ranges.length - 1].end,
    retrievedAt: retrievedAt || new Date().toISOString(),
    fromCache: Boolean(fromCache),
    sourceUrl
  };
}

export function rangeContains(range: GibsTimeRange, date: string): boolean {
  return date >= range.start && date <= range.end;
}

/** Nearest date inside the domain (clamped to the closest range boundary). */
export function nearestDateInDomain(domain: GibsDomain, date: string): string | null {
  if (!domain.ranges.length) return null;
  if (domain.ranges.some((range) => rangeContains(range, date))) return date;

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const range of domain.ranges) {
    const candidate = date < range.start ? range.start : range.end;
    const distance = Math.abs(daysBetween(date, candidate));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * Decide whether a requested date can be rendered for a layer.
 * `unknown` means no domain was retrieved, in which case the caller must fall
 * back to a live tile probe instead of assuming the date is available.
 */
export function checkAvailability(domain: GibsDomain | null, layerId: string, requestedDate: string): AvailabilityVerdict {
  if (!domain) {
    return {
      layerId,
      requestedDate,
      verdict: 'unknown',
      nearestDate: null,
      matches: [],
      domain: null,
      detail: 'No published observation-date domain was retrieved for this layer; availability is verified by a live tile request instead.'
    };
  }

  if (!isIsoDate(requestedDate)) {
    return {
      layerId,
      requestedDate,
      verdict: 'unknown',
      nearestDate: domain.maxDate,
      matches: [],
      domain,
      detail: 'The requested date is not a valid ISO calendar date.'
    };
  }

  const matches = domain.ranges.filter((range) => rangeContains(range, requestedDate));
  if (matches.length) {
    return {
      layerId,
      requestedDate,
      verdict: 'available',
      nearestDate: requestedDate,
      matches,
      domain,
      detail: `${requestedDate} falls inside a reported observation period for this layer.`
    };
  }

  const nearest = nearestDateInDomain(domain, requestedDate);
  return {
    layerId,
    requestedDate,
    verdict: 'outside-domain',
    nearestDate: nearest,
    matches: [],
    domain,
    detail: nearest
      ? `GIBS reports no imagery for ${requestedDate} for this layer (observation gaps exist). Nearest reported date: ${nearest}.`
      : `GIBS reports no imagery for ${requestedDate} for this layer.`
  };
}

/** Expand a domain into an explicit date list, capped to the most recent `limit` days. */
export function domainDates(domain: GibsDomain | null, limit = 500): string[] {
  if (!domain) return [];
  const dates = new Set<string>();
  const today = toIsoDate(new Date());
  for (const range of domain.ranges) {
    let cursor = range.start;
    let guard = 0;
    while (cursor <= range.end && guard < 4000) {
      dates.add(cursor);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
  }
  const sorted = [...dates].sort();
  const usable = sorted.filter((date) => date <= today);
  return usable.slice(Math.max(0, usable.length - limit));
}

/** Most recent reported observation date that is not in the future. */
export function latestReportedDate(domain: GibsDomain | null): string | null {
  const today = toIsoDate(new Date());
  const dates = domainDates(domain, 8000);
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    if (dates[index] <= today) return dates[index];
  }
  return domain?.maxDate || null;
}

/** Human readable summary of the reported coverage, for the provenance panel. */
export function describeCoverage(domain: GibsDomain | null): string | undefined {
  if (!domain || !domain.ranges.length) return undefined;
  const parts = [`${domain.minDate} → ${domain.maxDate}`];
  if (domain.ranges.length > 1) parts.push(`${domain.ranges.length} reported periods (gaps present)`);
  return parts.join(' · ');
}
