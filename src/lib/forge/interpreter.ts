/**
 * NOVA HYPOTHESIS FORGE — natural-language research interpreter.
 *
 * Turns an English, Sinhala or Tamil research question into a structured,
 * auditable `ResearchRequest`. This is deliberately deterministic: a keyword
 * lexicon, explicit date parsing and explicit defaults. Every assumption made
 * (a default period, a global frame, an inferred variable) is written into
 * `notes` and `interpretationConfidence`, so the UI can show what was read and
 * what was assumed.
 *
 * Cross-language retrieval is provided by matching Sinhala/Tamil stems against
 * the same domain lexicon, not by machine-translating the question. The original
 * wording is preserved verbatim in `question`.
 */

import { WORLD_PLACES, SRI_LANKA_PLACES } from '../earth/geocode.ts';
import type {
  AnalysisMethodId,
  LanguageCode,
  ResearchRequest,
  ScientificDomain,
  TimeRange,
  TimeResolution,
  VariableId,
  VariableRef,
  ResearchRegion,
} from './types';
import { FORGE_MODEL_VERSION } from './types';
import { DOMAIN_DEFINITIONS, NAMED_EVENTS, VARIABLES, variableMeta } from './vocab';
import { forgeText } from './strings';

/* ------------------------------------------------------------------ helpers */

/** FNV-1a 32-bit, hex. Stable ids without a dependency. */
export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const SINHALA = /[\u0D80-\u0DFF]/g;
const TAMIL = /[\u0B80-\u0BFF]/g;

/** Detect the language of a question. Mixed text chooses the script with more characters. */
export function detectLanguage(text: string): LanguageCode {
  const sinhala = (text.match(SINHALA) || []).length;
  const tamil = (text.match(TAMIL) || []).length;
  if (sinhala >= 3 && sinhala >= tamil) return 'si';
  if (tamil >= 3 && tamil > sinhala) return 'ta';
  return 'en';
}

/** Keyword match that respects word boundaries for short ASCII terms. */
export function containsKeyword(text: string, keyword: string): boolean {
  const haystack = text.toLowerCase();
  const needle = keyword.toLowerCase();
  if (!needle) return false;
  const ascii = /^[\x00-\x7F]+$/.test(needle);
  if (!ascii || needle.includes(' ') || needle.length > 4) return haystack.includes(needle);
  return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(
    haystack,
  );
}

export function scoreDomain(text: string): { domain: ScientificDomain; score: number } {
  let best: { domain: ScientificDomain; score: number } = { domain: 'unsupported', score: 0 };
  for (const definition of DOMAIN_DEFINITIONS) {
    let score = 0;
    for (const keyword of definition.keywords) {
      if (containsKeyword(text, keyword)) score += keyword.includes(' ') ? 3 : 2;
    }
    if (score > best.score) best = { domain: definition.id, score };
  }
  return best;
}

/* ------------------------------------------------------------------- dates */

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
  // Sinhala months
  'ජනවාරි': 0, 'පෙබරවාරි': 1, 'මාර්තු': 2, 'අප්‍රේල්': 3, 'මැයි': 4, 'ජූනි': 5,
  'ජූලි': 6, 'අගෝස්තු': 7, 'සැප්තැම්බර්': 8, 'ඔක්තෝබර්': 9, 'නොවැම්බර්': 10, 'දෙසැම්බර්': 11,
  // Tamil months
  'ஜனவரி': 0, 'பிப்ரவரி': 1, 'மார்ச்': 2, 'ஏப்ரல்': 3, 'மே': 4, 'ஜூன்': 5,
  'ஜூலை': 6, 'ஆகஸ்ட்': 7, 'செப்டம்பர்': 8, 'அக்டோபர்': 9, 'நவம்பர்': 10, 'டிசம்பர்': 11,
};

function startOfDayUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function endOfDayUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
}

function monthEndUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function clampToNow(range: { start: string; end: string }, now: Date): { start: string; end: string } {
  const nowIso = now.toISOString();
  const start = range.start;
  const end = range.end > nowIso ? nowIso : range.end;
  return { start, end };
}

export interface ParsedRange {
  range: TimeRange;
  notes: string[];
}

/** Parse an explicit or relative period. Returns null when nothing was stated. */
export function parseTimeRange(
  text: string,
  domain: ScientificDomain,
  language: LanguageCode,
  now: Date = new Date(),
): ParsedRange | null {
  const lower = text.toLowerCase();

  // 1. Named historical events. Only an event *name* triggers this branch:
  //    "March 2024" is a month, not the Gannon storm.
  for (const event of NAMED_EVENTS) {
    if (event.names.some((token) => containsKeyword(lower, token))) {
      return {
        range: {
          start: event.start,
          end: event.end,
          resolution: 'hour',
          origin: 'named-event',
          label: event.label,
          assumed: false,
        },
        notes: [forgeText(language, 'rangeNamedEvent', { event: event.label })],
      };
    }
  }

  // 2. Full ISO date or date range: 2024-05-10, 2024-05-10 to 2024-05-12.
  const isoDate = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  const isoMatches = [...lower.matchAll(isoDate)];
  if (isoMatches.length > 0) {
    const first = isoMatches[0];
    const start = startOfDayUtc(Number(first[1]), Number(first[2]) - 1, Number(first[3]));
    let end = endOfDayUtc(Number(first[1]), Number(first[2]) - 1, Number(first[3]));
    if (isoMatches.length > 1) {
      const last = isoMatches[isoMatches.length - 1];
      end = endOfDayUtc(Number(last[1]), Number(last[2]) - 1, Number(last[3]));
    }
    if (isValidDate(start) && isValidDate(end) && end >= start) {
      const clamped = clampToNow({ start: start.toISOString(), end: end.toISOString() }, now);
      return {
        range: {
          ...clamped,
          resolution: domain === 'earth-environment' ? 'day' : 'hour',
          origin: 'explicit-date',
          label: `${clamped.start.slice(0, 10)} → ${clamped.end.slice(0, 10)}`,
          assumed: false,
        },
        notes: [forgeText(language, 'rangeExplicit')],
      };
    }
  }

  // 3. Month + year, in any of the three languages: "March 1989", "මාර්තු 1989".
  const monthNames = Object.keys(MONTHS).join('|');
  const monthYear = new RegExp(`(${monthNames})\\s+?(\\d{4})|(\\d{4})\\s+?(${monthNames})`, 'i');
  const monthMatch = lower.match(monthYear);
  if (monthMatch) {
    const monthToken = monthMatch[1] || monthMatch[4];
    const yearToken = monthMatch[2] || monthMatch[3];
    const month = MONTHS[monthToken.toLowerCase()] ?? MONTHS[monthToken];
    const year = Number(yearToken);
    if (month !== undefined && Number.isFinite(year)) {
      const start = startOfDayUtc(year, month, 1);
      const end = monthEndUtc(year, month);
      const clamped = clampToNow({ start: start.toISOString(), end: end.toISOString() }, now);
      return {
        range: {
          ...clamped,
          resolution: 'hour',
          origin: 'explicit-month',
          label: `${start.toISOString().slice(0, 7)}`,
          assumed: false,
        },
        notes: [forgeText(language, 'rangeExplicit')],
      };
    }
  }

  // 4. Explicit year → that calendar year.
  const yearMatch = lower.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    const start = startOfDayUtc(year, 0, 1);
    const end = endOfDayUtc(year, 11, 31);
    const clamped = clampToNow({ start: start.toISOString(), end: end.toISOString() }, now);
    return {
      range: {
        ...clamped,
        resolution: 'day',
        origin: 'explicit-year',
        label: String(year),
        assumed: false,
      },
      notes: [forgeText(language, 'rangeExplicit')],
    };
  }

  // 5. Relative: "last 30 days", "past two weeks", " අවසන් දින 30", "கடந்த 30 நாட்கள்".
  const relative = lower.match(/(?:last|past|recent|අවසන්|පසුගිය|கடந்த)\s*(\d{1,3})?\s*(day|days|week|weeks|month|months|දින|සති|මාස|நாட்கள்|வாரங்கள்|மாதங்கள்)/);
  if (relative) {
    const amount = Number(relative[1] || 7);
    const unit = relative[2];
    const days = unit.startsWith('day') || unit === 'දින' || unit === 'நாட்கள்'
      ? 1
      : unit.startsWith('week') || unit === 'සති' || unit === 'வாரங்கள்'
        ? 7
        : 30;
    const end = now;
    const start = new Date(now.getTime() - amount * days * 86_400_000);
    return {
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
        resolution: days === 30 && domain === 'earth-environment' ? 'month' : 'hour',
        origin: 'relative',
        label: `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
        assumed: false,
      },
      notes: [forgeText(language, 'rangeExplicit')],
    };
  }

  return null;
}

function defaultRange(domain: ScientificDomain, language: LanguageCode, now: Date): ParsedRange {
  const definition = DOMAIN_DEFINITIONS.find((entry) => entry.id === domain);
  const resolution: TimeResolution = definition?.resolution ?? 'day';
  const days = resolution === 'month' ? 365 * 5 : resolution === 'hour' ? 30 : 180;
  const start = new Date(now.getTime() - days * 86_400_000);
  return {
    range: {
      start: start.toISOString(),
      end: now.toISOString(),
      resolution,
      origin: 'default',
      label: `${start.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`,
      assumed: true,
    },
    notes: [forgeText(language, 'rangeDefault')],
  };
}

/* ------------------------------------------------------------------ regions */

const REGION_ALIASES: Array<{ alias: string[]; place: string }> = [
  { alias: ['sri lanka', 'ශ්‍රී ලංකා', 'ශ්‍රී ලංකාව', 'இலங்கை'], place: 'Sri Lanka (island-wide)' },
  { alias: ['colombo', 'කොළඹ', 'கொழும்பு'], place: 'Colombo' },
  { alias: ['kandy', 'මහනුවර', 'கண்டி'], place: 'Kandy' },
  { alias: ['jaffna', 'යාපනය', 'யாழ்ப்பாணம்'], place: 'Jaffna' },
  { alias: ['galle', 'ගාල්ල', 'காலி'], place: 'Galle' },
  { alias: ['batticaloa', 'මඩකලපුව', 'மட்டக்களப்பு'], place: 'Batticaloa' },
  { alias: ['trincomalee', 'ත්‍රිකුණාමලය', 'திருகோணமலை'], place: 'Trincomalee' },
  { alias: ['anuradhapura', 'අනුරාධපුරය', 'அனுராதபுரம்'], place: 'Anuradhapura' },
  { alias: ['hambantota', 'හම්බන්තොට', 'அம்பாந்தோட்டை'], place: 'Hambantota' },
  { alias: ['nuwara eliya', 'නුවරඑළිය', 'நுவரெலியா'], place: 'Nuwara Eliya' },
];

/** Resolve a named study area using the existing Earth Lab gazetteer. */
export function parseRegion(text: string): ResearchRegion {
  const lower = text.toLowerCase();
  for (const entry of REGION_ALIASES) {
    if (entry.alias.some((alias) => lower.includes(alias.toLowerCase()))) {
      const place =
        SRI_LANKA_PLACES.find((candidate) => candidate.name === entry.place) ||
        WORLD_PLACES.find((candidate) => candidate.name === entry.place);
      if (place) {
        return {
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          source: 'gazetteer',
          bounds: place.bounds,
        };
      }
    }
  }
  // English place names from the gazetteer (island-wide names, regional names).
  for (const place of [...SRI_LANKA_PLACES, ...WORLD_PLACES]) {
    const name = place.name.toLowerCase();
    const stem = name.replace(/\s*\(.*\)$/, '');
    if (stem.length >= 4 && lower.includes(stem)) {
      return {
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        source: 'gazetteer',
        bounds: place.bounds,
      };
    }
  }
  return { name: 'Global', latitude: null, longitude: null, source: 'global' };
}

/* ---------------------------------------------------------------- variables */

const VARIABLE_KEYWORDS: Record<VariableId, string[]> = {
  kp: ['kp', 'k-index', 'k index', 'geomagnetic index', 'චුම්බක දර්ශක', 'காந்தக் குறியீடு'],
  solar_wind_speed: ['solar wind speed', 'wind speed', 'සුළං වේගය', 'காற்றின் வேகம்'],
  bz_gsm: ['bz', 'bz gsm', 'imf bz'],
  bt: ['bt', 'imf magnitude'],
  proton_density: ['density', 'proton', 'ඝනත්වය', 'அடர்த்தி'],
  cme_speed: ['cme', 'coronal mass ejection', 'කෝරෝනා', 'கொரோனா'],
  temperature: ['temperature', 'heat', 'warming', 'උෂ්ණත්ව', 'வெப்பநிலை'],
  precipitation: ['rain', 'rainfall', 'precipitation', 'monsoon', 'වර්ෂා', 'වැසි', 'மழை'],
  asteroid_miss_distance: ['miss distance', 'close approach', 'distance'],
  asteroid_diameter: ['size', 'diameter', 'how big'],
  orbital_altitude: ['altitude', 'height', 'orbit height'],
};

export function detectVariables(text: string, domain: ScientificDomain): VariableId[] {
  const definition = DOMAIN_DEFINITIONS.find((entry) => entry.id === domain);
  const allowed = new Set<VariableId>(definition?.variables ?? []);
  const found: VariableId[] = [];
  for (const [id, keywords] of Object.entries(VARIABLE_KEYWORDS) as Array<[VariableId, string[]]>) {
    if (!allowed.has(id)) continue;
    if (keywords.some((keyword) => containsKeyword(text, keyword))) found.push(id);
  }
  if (found.length > 0) return found;
  return definition?.variables.length ? [definition.variables[0]] : [];
}

function buildVariableRefs(variables: VariableId[], domain: ScientificDomain): VariableRef[] {
  return variables.map((id) => {
    const meta = variableMeta(id);
    const role: VariableRef['role'] =
      domain === 'space-weather'
        ? id === 'kp'
          ? 'dependent'
          : 'independent'
        : id === 'temperature' || id === 'precipitation'
          ? 'dependent'
          : 'context';
    return {
      id,
      unit: meta?.unit ?? 'unit not published',
      datasetId: meta?.datasetId ?? 'unassigned',
      role,
    };
  });
}

/* ------------------------------------------------------------------ methods */

export function selectMethods(
  domain: ScientificDomain,
  variables: VariableId[],
  range: TimeRange,
): AnalysisMethodId[] {
  const methods: AnalysisMethodId[] = ['descriptive', 'missing-data'];
  const hasNumeric = variables.length > 0;
  if (!hasNumeric) return methods;

  if (domain === 'space-weather') {
    methods.push('correlation', 'cross-correlation', 'threshold-exceedance');
    methods.push('anomaly');
  } else if (domain === 'earth-environment') {
    methods.push('correlation', 'trend', 'anomaly');
  } else if (domain === 'near-earth-objects') {
    methods.push('correlation');
  } else {
    methods.push('descriptive');
  }
  if (range.origin === 'named-event' && domain === 'space-weather') {
    methods.push('before-after');
  }
  return [...new Set(methods)];
}

/* --------------------------------------------------------------- interpreter */

export interface InterpretOptions {
  now?: Date;
  /** Previous request, for a follow-up question. */
  context?: ResearchRequest | null;
  /** Force the language chosen in the UI (never overrides a clearly written script). */
  preferredLanguage?: LanguageCode;
}

export function interpret(question: string, options: InterpretOptions = {}): ResearchRequest {
  const now = options.now ?? new Date();
  const text = String(question || '').trim();
  const detected = detectLanguage(text);
  const language: LanguageCode =
    detected === 'en' && options.preferredLanguage ? options.preferredLanguage : detected;

  const notes: string[] = [];
  const scored = scoreDomain(text);
  let domain = scored.domain;

  // A follow-up that names no domain inherits the previous investigation's domain.
  const isFollowUp = Boolean(options.context && (scored.score === 0 || !parseTimeRange(text, domain, language, now)));
  if (isFollowUp && options.context) domain = options.context.domain;

  const parsed = parseTimeRange(text, domain, language, now);
  const inherited = !parsed && options.context ? options.context.timeRange : null;
  const inheritsRange = inherited !== null;
  const range = parsed?.range ?? inherited ?? defaultRange(domain, language, now).range;
  if (parsed) notes.push(...parsed.notes);
  else if (inheritsRange) notes.push(forgeText(language, 'followUpMerged'));
  else notes.push(forgeText(language, 'rangeDefault'));

  const region = parseRegion(text);
  if (region.source === 'gazetteer') {
    notes.push(
      forgeText(language, 'regionResolved', {
        region: region.name,
        lat: region.latitude ?? 0,
        lon: region.longitude ?? 0,
      }),
    );
  } else if (domain !== 'space-weather' && domain !== 'near-earth-objects') {
    notes.push(forgeText(language, 'regionGlobal'));
  }

  let variables = detectVariables(text, domain);
  if (variables.length === 0 && isFollowUp && options.context) {
    variables = options.context.variables.map((variable) => variable.id);
  }
  // Keep the pair needed for the space-weather tests even when the user named only one.
  if (domain === 'space-weather') {
    if (!variables.includes('kp')) variables = ['kp', ...variables];
    if (variables.length === 1) variables = ['kp', 'solar_wind_speed'];
  }

  const definition = DOMAIN_DEFINITIONS.find((entry) => entry.id === domain);
  const datasets = definition?.datasets ?? [];
  const methods = selectMethods(domain, variables, range);

  if (domain === 'unsupported') notes.push(forgeText(language, 'noCompatibleDataset'));
  if (range.assumed) notes.push(forgeText(language, 'rangeDefault'));

  const objectiveKey = `obj_${domain.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}`;
  const objective = forgeText(language, objectiveKey);

  const expectedOutput =
    domain === 'earth-environment'
      ? 'time-series-characterisation'
      : domain === 'planetary-imagery' || domain === 'astronomy-context'
        ? 'imagery-context'
        : domain === 'unsupported'
          ? 'none'
          : 'quantified-association';

  const confidence: ResearchRequest['interpretationConfidence'] =
    domain === 'unsupported'
      ? 'low'
      : parsed && !range.assumed && region.source !== 'none'
        ? 'high'
        : range.assumed
          ? 'medium'
          : 'high';

  return {
    version: FORGE_MODEL_VERSION,
    id: hashString(`${text}|${language}|${range.start}|${range.end}`),
    question: text,
    language,
    domain,
    objective,
    timeRange: range,
    region,
    variables: buildVariableRefs([...new Set(variables)], domain),
    requiredDatasets: datasets,
    methods,
    expectedOutput,
    followUp: Boolean(options.context),
    interpretationConfidence: confidence,
    notes: [...new Set(notes)],
  };
}

/** Vocabulary summary for the UI's "what was understood" panel. */
export function summariseRequest(request: ResearchRequest): Array<{ label: string; value: string }> {
  return [
    { label: 'domain', value: request.domain },
    { label: 'period', value: request.timeRange.label },
    { label: 'region', value: request.region.name },
    {
      label: 'variables',
      value: request.variables.map((variable) => variableMeta(variable.id)?.englishLabel ?? variable.id).join(', ') || '—',
    },
    { label: 'datasets', value: request.requiredDatasets.join(', ') || '—' },
  ];
}

export const SUPPORTED_LANGUAGES: LanguageCode[] = ['en', 'si', 'ta'];

export { VARIABLES };
