/**
 * What the Guardian actually probes.
 *
 * Every entry is a dependency the application already has — none of these URLs
 * was invented for the monitor, and each one matches a real call site:
 *
 *  - NASA data: `server/nasaRoutes.ts` (APOD, EPIC, NeoWs), `src/lib/earth/power.ts`
 *    (POWER), `src/lib/earth/gibsClient.ts` (GIBS), `server/forge/scienceConnectors.ts`
 *    (Exoplanet TAP, JPL SBDB, OSDR) and the image library behind the archive.
 *  - AI: the same providers `server/novaDiagnostics.js` reports on. The AI probes
 *    do **not** re-implement provider logic: they call the existing diagnostics
 *    handler and translate its verdicts.
 *
 * Two design rules keep a monitor from becoming an outage:
 *
 *  1. **Cheap first.** Unkeyed endpoints (POWER, GIBS, images, TAP, SBDB) are
 *     probed every run. Keyed endpoints are `metered` and only probed when the
 *     caller explicitly asks for a deep sweep *and* the fleet budget allows it.
 *  2. **Never invent a verdict.** A probe reports exactly what it observed:
 *     status code, latency, and a schema check. `degraded` means "answered but
 *     not correctly", `down` means "did not answer usably", `skipped` means "we
 *     chose not to call it" — never "probably fine".
 */

import { createDiagnosticsHandler } from '../novaDiagnostics.js';
import type { GuardianProbeStatus, ProbeContext, ProbeOutcome, ProviderDefinition } from './types';

const classifyHttp = (status: number): { status: GuardianProbeStatus; code: string } => {
  if (status >= 200 && status < 300) return { status: 'ok', code: 'OK' };
  if (status === 401 || status === 403) return { status: 'down', code: 'AUTH_ERROR' };
  if (status === 404) return { status: 'down', code: 'ENDPOINT_MISSING' };
  if (status === 408 || status === 504) return { status: 'degraded', code: 'TIMEOUT' };
  if (status === 429) return { status: 'degraded', code: 'RATE_LIMITED' };
  if (status >= 500) return { status: 'down', code: 'UPSTREAM_5XX' };
  return { status: 'down', code: 'UNEXPECTED_STATUS' };
};

const ended = (startedAt: number, now: () => number) => Math.max(0, now() - startedAt);

/** A single GET with a hard timeout, returning the raw response or an outcome. */
async function getJson(
  context: ProbeContext,
  providerId: string,
  url: string,
  validate?: (body: unknown) => string | null,
): Promise<ProbeOutcome> {
  const startedAt = context.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  context.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), context.timeoutMs);
  try {
    const response = await context.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      // A redirect would silently turn a moved endpoint into a "healthy" one.
      redirect: 'error',
    });
    const latencyMs = ended(startedAt, context.now);
    const verdict = classifyHttp(response.status);
    if (response.status < 200 || response.status >= 300) {
      return {
        providerId,
        status: verdict.status,
        code: verdict.code,
        latencyMs,
        httpStatus: response.status,
        reason: `Upstream answered ${response.status}.`,
        checkedAt: context.now(),
      };
    }
    if (!validate) return { providerId, status: 'ok', code: 'OK', latencyMs, httpStatus: response.status, checkedAt: context.now() };
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      return {
        providerId,
        status: 'degraded',
        code: 'SCHEMA_MISMATCH',
        latencyMs,
        httpStatus: response.status,
        reason: 'The response was not JSON.',
        checkedAt: context.now(),
      };
    }
    const problem = validate(body);
    if (problem) {
      return {
        providerId,
        status: 'degraded',
        code: 'SCHEMA_MISMATCH',
        latencyMs,
        httpStatus: response.status,
        reason: problem,
        checkedAt: context.now(),
      };
    }
    return { providerId, status: 'ok', code: 'OK', latencyMs, httpStatus: response.status, checkedAt: context.now() };
  } catch (error) {
    const aborted = (error as { name?: string })?.name === 'AbortError';
    const timedOut = aborted && controller.signal.aborted;
    return {
      providerId,
      status: timedOut ? 'degraded' : 'down',
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      latencyMs: ended(startedAt, context.now),
      reason: timedOut ? `No answer within ${context.timeoutMs} ms.` : 'The request could not be completed.',
      checkedAt: context.now(),
    };
  } finally {
    clearTimeout(timer);
    context.signal.removeEventListener('abort', onAbort);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nasaKey = (env: Record<string, string | undefined>) =>
  (env.NASA_API_KEY || env.NEXT_PUBLIC_NASA_API_KEY || '').trim();

/* --------------------------------- NASA ---------------------------------- */

const nasaApod: ProviderDefinition = {
  id: 'nasa:apod',
  label: 'NASA APOD',
  kind: 'nasa',
  endpoint: 'api.nasa.gov/planetary/apod',
  docsUrl: 'https://api.nasa.gov/',
  requiresEnv: ['NASA_API_KEY'],
  cost: 'metered',
  async run(context) {
    const key = nasaKey(context.env);
    if (!key) {
      return {
        providerId: 'nasa:apod',
        status: 'unconfigured',
        code: 'NASA_KEY_MISSING',
        latencyMs: null,
        reason: 'NASA_API_KEY is not set; the app falls back to DEMO_KEY (30 requests/hour).',
        checkedAt: context.now(),
      };
    }
    return getJson(context, 'nasa:apod', `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}`, (body) =>
      isRecord(body) && typeof body.date === 'string' && typeof body.title === 'string'
        ? null
        : 'APOD payload is missing date/title.',
    );
  },
};

const nasaNeows: ProviderDefinition = {
  id: 'nasa:neows',
  label: 'NASA NeoWs (near-Earth objects)',
  kind: 'nasa',
  endpoint: 'api.nasa.gov/neo/rest/v1',
  docsUrl: 'https://api.nasa.gov/',
  requiresEnv: ['NASA_API_KEY'],
  cost: 'metered',
  async run(context) {
    const key = nasaKey(context.env);
    if (!key) {
      return {
        providerId: 'nasa:neows',
        status: 'unconfigured',
        code: 'NASA_KEY_MISSING',
        latencyMs: null,
        reason: 'NASA_API_KEY is not set; NeoWs is limited to the demo quota.',
        checkedAt: context.now(),
      };
    }
    const today = new Date(context.now()).toISOString().slice(0, 10);
    return getJson(
      context,
      'nasa:neows',
      `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${encodeURIComponent(key)}`,
      (body) => (isRecord(body) && isRecord(body.near_earth_objects) ? null : 'NeoWs payload has no near_earth_objects.'),
    );
  },
};

const nasaEpic: ProviderDefinition = {
  id: 'nasa:epic',
  label: 'NASA EPIC (Earth imagery)',
  kind: 'nasa',
  endpoint: 'api.nasa.gov/EPIC/api',
  docsUrl: 'https://epic.gsfc.nasa.gov/',
  requiresEnv: ['NASA_API_KEY'],
  cost: 'metered',
  async run(context) {
    const key = nasaKey(context.env);
    if (!key) {
      return {
        providerId: 'nasa:epic',
        status: 'unconfigured',
        code: 'NASA_KEY_MISSING',
        latencyMs: null,
        reason: 'NASA_API_KEY is not set; EPIC is limited to the demo quota.',
        checkedAt: context.now(),
      };
    }
    return getJson(
      context,
      'nasa:epic',
      `https://api.nasa.gov/EPIC/api/natural?api_key=${encodeURIComponent(key)}`,
      (body) => (Array.isArray(body) ? null : 'EPIC payload is not a list.'),
    );
  },
};

const nasaImages: ProviderDefinition = {
  id: 'nasa:images',
  label: 'NASA Image and Video Library',
  kind: 'nasa',
  endpoint: 'images-api.nasa.gov',
  docsUrl: 'https://images.nasa.gov/',
  requiresEnv: [],
  cost: 'free',
  run: (context) =>
    getJson(context, 'nasa:images', 'https://images-api.nasa.gov/search?q=apollo&media_type=image&page_size=1', (body) =>
      isRecord(body) && isRecord(body.collection) ? null : 'The image library returned no collection.',
    ),
};

const power: ProviderDefinition = {
  id: 'earth:power',
  label: 'NASA POWER (climate series)',
  kind: 'earth',
  endpoint: 'power.larc.nasa.gov',
  docsUrl: 'https://power.larc.nasa.gov/docs/',
  requiresEnv: [],
  cost: 'free',
  run: (context) =>
    getJson(
      context,
      'earth:power',
      'https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=79.86&latitude=6.93&start=2020&end=2020&format=JSON',
      (body) =>
        isRecord(body) && isRecord(body.properties) && isRecord(body.properties.parameter)
          ? null
          : 'POWER returned no properties.parameter block.',
    ),
};

const gibs: ProviderDefinition = {
  id: 'earth:gibs',
  label: 'NASA GIBS (imagery tiles)',
  kind: 'earth',
  endpoint: 'gibs.earthdata.nasa.gov',
  docsUrl: 'https://nasa-gibs.github.io/gibs-api-docs/',
  requiresEnv: [],
  cost: 'free',
  async run(context) {
    const startedAt = context.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), context.timeoutMs);
    try {
      // One 256 px tile: exactly what the viewer requests, and small.
      const response = await context.fetchImpl(
        'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2020-01-01/250m/0/0/0.jpg',
        { method: 'GET', signal: controller.signal, redirect: 'error' },
      );
      const latencyMs = ended(startedAt, context.now);
      const type = response.headers.get('content-type') || '';
      if (response.ok && type.startsWith('image/')) {
        return { providerId: 'earth:gibs', status: 'ok', code: 'OK', latencyMs, httpStatus: response.status, checkedAt: context.now() };
      }
      const verdict = classifyHttp(response.status);
      return {
        providerId: 'earth:gibs',
        status: response.ok ? 'degraded' : verdict.status,
        code: response.ok ? 'SCHEMA_MISMATCH' : verdict.code,
        latencyMs,
        httpStatus: response.status,
        reason: response.ok ? `Expected an image, received "${type || 'no content type'}".` : `Tile answered ${response.status}.`,
        checkedAt: context.now(),
      };
    } catch {
      return {
        providerId: 'earth:gibs',
        status: 'down',
        code: 'NETWORK_ERROR',
        latencyMs: ended(startedAt, context.now),
        reason: 'The tile request could not be completed.',
        checkedAt: context.now(),
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

const exoplanetTap: ProviderDefinition = {
  id: 'nasa:exoplanet-tap',
  label: 'NASA Exoplanet Archive (TAP)',
  kind: 'science',
  endpoint: 'exoplanetarchive.ipac.caltech.edu',
  docsUrl: 'https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html',
  requiresEnv: [],
  cost: 'free',
  run: (context) =>
    getJson(
      context,
      'nasa:exoplanet-tap',
      'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+top+1+pl_name+from+ps&format=json',
      (body) => (Array.isArray(body) ? null : 'TAP did not return a JSON array.'),
    ),
};

const jplSbdb: ProviderDefinition = {
  id: 'nasa:jpl-sbdb',
  label: 'JPL Small-Body Database',
  kind: 'science',
  endpoint: 'ssd.jpl.nasa.gov/api/sbdb.api',
  docsUrl: 'https://ssd-api.jpl.nasa.gov/doc/sbdb.html',
  requiresEnv: [],
  cost: 'free',
  run: (context) =>
    getJson(context, 'nasa:jpl-sbdb', 'https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=433', (body) =>
      isRecord(body) && (body.object !== undefined || body.moreInfo !== undefined || body.orbit !== undefined)
        ? null
        : 'SBDB returned no object block.',
    ),
};

const osdr: ProviderDefinition = {
  id: 'nasa:osdr',
  label: 'NASA Open Science Data Repository',
  kind: 'science',
  endpoint: 'osdr.nasa.gov',
  docsUrl: 'https://osdr.nasa.gov/bio/api/',
  requiresEnv: [],
  cost: 'free',
  run: (context) =>
    getJson(context, 'nasa:osdr', 'https://osdr.nasa.gov/bio/api/search?term=radiation&type=study&size=1', (body) =>
      isRecord(body) || Array.isArray(body) ? null : 'OSDR returned an unexpected payload.',
    ),
};

/* ----------------------------------- AI ---------------------------------- */

type DiagnosticsVerdict = {
  configured?: boolean;
  status?: string;
  code?: string;
  httpStatus?: number | null;
  ms?: number | null;
  model?: string | null;
  reason?: string | null;
};

/**
 * The AI probe reuses `createDiagnosticsHandler` — the same code path the
 * existing `/api/nova/diagnostics?probe=1` endpoint runs — and only translates
 * its verdict. A second provider-probing implementation would drift from the
 * first one within a release or two.
 */
function aiProbe(id: 'gemini' | 'openrouter' | 'arena', label: string): ProviderDefinition {
  return {
    id: `ai:${id}`,
    label,
    kind: 'ai',
    endpoint: id === 'gemini' ? 'generativelanguage.googleapis.com' : id === 'openrouter' ? 'openrouter.ai' : 'api.arena.ai',
    requiresEnv: [id === 'gemini' ? 'GEMINI_API_KEY' : id === 'openrouter' ? 'OPENROUTER_API_KEY' : 'ARENA_API_KEY'],
    cost: 'metered',
    async run(context) {
      const handler = createDiagnosticsHandler({
        fetchImpl: context.fetchImpl,
        env: context.env,
        timeoutMs: context.timeoutMs,
        now: context.now,
      });
      // A fresh handler per run has no probe cooldown, so `probe: true` is honest.
      const report = await handler({ probe: true });
      const providers = (report as { providers?: Record<string, DiagnosticsVerdict> } | undefined)?.providers ?? {};
      const verdict: DiagnosticsVerdict = providers[id] ?? {};
      const status: GuardianProbeStatus =
        verdict.status === 'ok'
          ? 'ok'
          : verdict.status === 'error'
            ? 'down'
            : verdict.configured === false
              ? 'unconfigured'
              : 'skipped';
      return {
        providerId: `ai:${id}`,
        status,
        code: verdict.code || (status === 'unconfigured' ? 'PROVIDER_NOT_CONFIGURED' : 'NOT_PROBED'),
        latencyMs: typeof verdict.ms === 'number' ? verdict.ms : null,
        httpStatus: typeof verdict.httpStatus === 'number' ? verdict.httpStatus : null,
        reason: verdict.reason ? String(verdict.reason).slice(0, 240) : null,
        evidence: {
          model: verdict.model ?? null,
          probedAt: (report as { checkedAt?: string } | undefined)?.checkedAt ?? null,
        },
        checkedAt: context.now(),
      };
    },
  };
}

const localEngine: ProviderDefinition = {
  id: 'ai:local',
  label: 'NOVA local engine',
  kind: 'internal',
  endpoint: 'in-process',
  requiresEnv: [],
  cost: 'free',
  async run(context) {
    return { providerId: 'ai:local', status: 'ok', code: 'OK', latencyMs: 0, checkedAt: context.now() };
  },
};

export const PROVIDERS: ProviderDefinition[] = [
  localEngine,
  nasaApod,
  nasaNeows,
  nasaEpic,
  nasaImages,
  power,
  gibs,
  exoplanetTap,
  jplSbdb,
  osdr,
  aiProbe('gemini', 'Google Gemini'),
  aiProbe('openrouter', 'OpenRouter'),
  aiProbe('arena', 'Arena AI'),
];

export const PROVIDER_INDEX: Record<string, ProviderDefinition> = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.id, provider]),
);

/** Providers that cost quota; excluded from a cheap sweep unless asked for. */
export const METERED_PROVIDER_IDS = new Set(PROVIDERS.filter((p) => p.cost === 'metered').map((p) => p.id));

export function providerIds(): string[] {
  return PROVIDERS.map((provider) => provider.id);
}

export function describeProviders() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    endpoint: provider.endpoint,
    docsUrl: provider.docsUrl ?? null,
    requiresEnv: provider.requiresEnv,
    cost: provider.cost,
  }));
}
