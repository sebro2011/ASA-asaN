/**
 * NOVA HYPOTHESIS FORGE — Evidence Passport.
 *
 * A reproducible record of one investigation. The JSON package is the canonical
 * artefact: it contains every prompt-independent input (question, language,
 * window, thresholds, analyses with their parameters and results), every
 * evidence item with the rule that produced it, and provenance for each source
 * (official URL, retrieval timestamp, payload hash).
 *
 * Three renderings are produced from the same object:
 *   - JSON   — machine-readable, for reproducibility;
 *   - Markdown — plain text for review or issue trackers;
 *   - HTML   — printable in the browser ("Save as PDF"), self-contained.
 *
 * The passport never labels itself a peer-reviewed paper and never omits the
 * contradicting evidence section, even when it is empty.
 */

import type { Investigation } from './types';
import { FORGE_MODEL_VERSION, FORGE_SCHEMA_TAG } from './types';
import { ALPHA, EFFECT_FLOOR, MIN_CORRELATION_N, MIN_THRESHOLD_N, MIN_TREND_N } from './evidence';
import { forgeText } from './strings';

export const PASSPORT_VERSION = 'nova-evidence-passport/1';

export interface PassportEvidence {
  id: string;
  classification: string;
  strength: string;
  datasetTitle: string;
  organisation: string;
  sourceUrl: string;
  retrievedAt: string;
  observationStart: string | null;
  observationEnd: string | null;
  measurements: string;
  units: string;
  rule: string;
  values: Record<string, number | string | null>;
}

export interface EvidencePassport {
  schema: typeof FORGE_SCHEMA_TAG;
  passportVersion: string;
  modelVersion: typeof FORGE_MODEL_VERSION;
  generatedAt: string;
  investigationId: string;
  language: string;
  researchQuestion: string;
  hypothesis: {
    id: string | null;
    statement: string;
    status: string;
    nullHypothesisConsidered: boolean;
    falsificationCriteria: string[];
    alternativeExplanations: string[];
  };
  investigationDate: string;
  timeWindow: { start: string; end: string; resolution: string; label: string; assumed: boolean };
  region: { name: string; latitude: number | null; longitude: number | null; source: string };
  dataSources: Array<{
    datasetId: string;
    title: string;
    organisation: string;
    documentationUrl: string;
    sourceUrl: string | null;
    retrievedAt: string | null;
    observationStart: string | null;
    observationEnd: string | null;
    payloadHash: string;
    recordCount: number;
    status: string;
    detail: string | null;
    limitations: string[];
  }>;
  analysis: {
    methods: Array<{
      id: string;
      label: string;
      inputVariables: string[];
      datasetRefs: string[];
      assumptions: string[];
      parameters: Record<string, unknown>;
      results: Record<string, unknown>;
      sampleSize: number;
      limitations: string[];
      skipped: boolean;
      skipReason?: string;
    }>;
    thresholds: {
      alpha: number;
      minCorrelationN: number;
      minThresholdN: number;
      minTrendN: number;
      effectFloor: number;
    };
  };
  evidence: {
    supporting: PassportEvidence[];
    contradicting: PassportEvidence[];
    neutral: PassportEvidence[];
    insufficient: PassportEvidence[];
  };
  uncertainty: Array<{ kind: string; severity: string; title: string; detail: string }>;
  limitations: string[];
  conclusion: {
    verdict: string;
    title: string;
    summary: string;
    causalCaveat: string;
    counts: {
      supporting: number;
      contradicting: number;
      neutral: number;
      insufficient: number;
    };
  };
  reproducibility: {
    instructions: string;
    engine: string;
    api: { investigate: string; interpret: string; catalogue: string };
    request: unknown;
    planDatasetIds: string[];
    deterministic: true;
  };
  disclaimer: string;
  generatedNotice: string;
  imagery: Investigation['imagery'];
}

function toPassportEvidence(investigation: Investigation): PassportEvidence[] {
  return investigation.evidence.map((item) => ({
    id: item.id,
    classification: item.classification,
    strength: item.strength,
    datasetTitle: item.datasetTitle,
    organisation: item.organisation,
    sourceUrl: item.sourceUrl,
    retrievedAt: item.retrievedAt,
    observationStart: item.observationStart,
    observationEnd: item.observationEnd,
    measurements: item.measurements,
    units: item.units,
    rule: item.rule,
    values: item.values,
  }));
}

export function buildPassport(investigation: Investigation, generatedAt?: string): EvidencePassport {
  const language = investigation.language;
  const selected =
    investigation.hypotheses.find((hypothesis) => hypothesis.id === investigation.selectedHypothesisId) ??
    null;
  const evidence = toPassportEvidence(investigation);

  return {
    schema: FORGE_SCHEMA_TAG,
    passportVersion: PASSPORT_VERSION,
    modelVersion: FORGE_MODEL_VERSION,
    generatedAt: generatedAt ?? new Date().toISOString(),
    investigationId: investigation.id,
    language,
    researchQuestion: investigation.question,
    hypothesis: {
      id: selected?.id ?? null,
      statement: selected ? (selected.userStatement || selected.statement) : '',
      status: selected?.status ?? 'none',
      nullHypothesisConsidered: investigation.hypotheses.some((hypothesis) => hypothesis.isNull),
      falsificationCriteria: selected?.falsificationCriteria ?? [],
      alternativeExplanations: selected?.alternativeExplanations ?? [],
    },
    investigationDate: investigation.createdAt,
    timeWindow: {
      start: investigation.request.timeRange.start,
      end: investigation.request.timeRange.end,
      resolution: investigation.request.timeRange.resolution,
      label: investigation.request.timeRange.label,
      assumed: investigation.request.timeRange.assumed,
    },
    region: {
      name: investigation.request.region.name,
      latitude: investigation.request.region.latitude,
      longitude: investigation.request.region.longitude,
      source: investigation.request.region.source,
    },
    dataSources: investigation.datasets.map((result) => {
      const series = result.series[0];
      return {
        datasetId: result.datasetId,
        title: series?.provenance.datasetTitle ?? result.datasetId,
        organisation: series?.provenance.organisation ?? 'Other',
        documentationUrl: result.documentationUrl,
        sourceUrl: series?.provenance.sourceUrl ?? null,
        retrievedAt: series?.provenance.retrievedAt ?? null,
        observationStart: series?.provenance.observationStart ?? null,
        observationEnd: series?.provenance.observationEnd ?? null,
        payloadHash: series?.provenance.payloadHash ?? '',
        recordCount: result.series.reduce((total, entry) => total + entry.observations.length, 0),
        status: result.status,
        detail: result.detail ?? null,
        limitations: series
          ? result.series.flatMap((entry) => entry.provenance.processingHistory).slice(0, 3)
          : [],
      };
    }),
    analysis: {
      methods: investigation.analyses.map((analysis) => ({
        id: analysis.id,
        label: analysis.methodLabel,
        inputVariables: analysis.inputVariables,
        datasetRefs: analysis.datasetRefs,
        assumptions: analysis.assumptions,
        parameters: analysis.parameters,
        results: analysis.results,
        sampleSize: analysis.sampleSize,
        limitations: analysis.limitations,
        skipped: analysis.skipped,
        skipReason: analysis.skipReason,
      })),
      thresholds: {
        alpha: ALPHA,
        minCorrelationN: MIN_CORRELATION_N,
        minThresholdN: MIN_THRESHOLD_N,
        minTrendN: MIN_TREND_N,
        effectFloor: EFFECT_FLOOR,
      },
    },
    evidence: {
      supporting: evidence.filter((item) => item.classification === 'supporting'),
      contradicting: evidence.filter((item) => item.classification === 'contradicting'),
      neutral: evidence.filter((item) => item.classification === 'neutral'),
      insufficient: evidence.filter((item) => item.classification === 'insufficient'),
    },
    uncertainty: investigation.counterEvidence.findings.map((finding) => ({
      kind: finding.kind,
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
    })),
    limitations: investigation.limitations,
    conclusion: {
      verdict: investigation.conclusion.verdict,
      title: investigation.conclusion.title,
      summary: investigation.conclusion.summary,
      causalCaveat: investigation.conclusion.causalCaveat,
      counts: {
        supporting: investigation.conclusion.supportingCount,
        contradicting: investigation.conclusion.contradictingCount,
        neutral: investigation.conclusion.neutralCount,
        insufficient: investigation.conclusion.insufficientCount,
      },
    },
    reproducibility: {
      instructions: forgeText(language, 'passport_reproduce'),
      engine: `${FORGE_SCHEMA_TAG} ${FORGE_MODEL_VERSION}`,
      api: {
        investigate: 'POST /api/forge/investigate',
        interpret: 'POST /api/forge/interpret',
        catalogue: 'GET /api/forge/catalogue',
      },
      request: investigation.request,
      planDatasetIds: investigation.plan.datasets.filter((dataset) => dataset.compatible).map((dataset) => dataset.datasetId),
      deterministic: true,
    },
    disclaimer: forgeText(language, 'passport_disclaimer'),
    generatedNotice: forgeText(language, 'passport_generated_notice'),
    imagery: investigation.imagery,
  };
}

/* ------------------------------------------------------------- serialisation */

export function passportToJson(passport: EvidencePassport): string {
  return JSON.stringify(passport, null, 2);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    return Number(value.toFixed(6)).toString();
  }
  if (value === null || value === undefined) return '—';
  return String(value);
}

export function passportToMarkdown(passport: EvidencePassport): string {
  const lines: string[] = [];
  lines.push(`# ${forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_title')}`);
  lines.push('');
  lines.push(`**Investigation:** ${passport.investigationId}  `);
  lines.push(`**Generated:** ${passport.generatedAt}  `);
  lines.push(`**Engine:** ${passport.reproducibility.engine}`);
  lines.push('');
  lines.push(`## ${forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_section_question')}`);
  lines.push(passport.researchQuestion);
  lines.push('');
  lines.push(`## ${forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_section_hypothesis')}`);
  lines.push(passport.hypothesis.statement || '—');
  lines.push('');
  lines.push(`**Status:** ${passport.hypothesis.status}`);
  lines.push('');
  lines.push(`**Falsification criteria:**`);
  for (const criterion of passport.hypothesis.falsificationCriteria) lines.push(`- ${criterion}`);
  lines.push('');
  lines.push(`## ${forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_section_sources')}`);
  lines.push('| Dataset | Organisation | Status | Retrieved | Records | Documentation |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const source of passport.dataSources) {
    lines.push(
      `| ${source.title} | ${source.organisation} | ${source.status} | ${source.retrievedAt ?? '—'} | ${source.recordCount} | ${source.documentationUrl} |`,
    );
  }
  lines.push('');
  lines.push(`## ${forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_section_methods')}`);
  for (const method of passport.analysis.methods) {
    lines.push(`### ${method.label}${method.skipped ? ' (skipped)' : ''}`);
    lines.push(`- Inputs: ${method.inputVariables.join(', ') || '—'}`);
    lines.push(`- n: ${method.sampleSize}`);
    for (const [key, value] of Object.entries(method.results)) {
      lines.push(`- ${key}: ${formatNumber(value)}`);
    }
    if (method.skipReason) lines.push(`- ${method.skipReason}`);
    lines.push('');
  }
  const sections: Array<[string, PassportEvidence[]]> = [
    ['passport_section_supporting', passport.evidence.supporting],
    ['passport_section_contradicting', passport.evidence.contradicting],
  ];
  for (const [key, items] of sections) {
    lines.push(`## ${forgeText(passport.language as 'en' | 'si' | 'ta', key)}`);
    if (items.length === 0) lines.push(forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_none'));
    for (const item of items) {
      lines.push(`- **${item.datasetTitle}** (${item.organisation}) — ${item.rule}`);
      lines.push(`  - Source: ${item.sourceUrl}`);
      lines.push(`  - Retrieval: ${item.retrievedAt}`);
    }
    lines.push('');
  }
  lines.push(`## ${forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_section_uncertainty')}`);
  for (const finding of passport.uncertainty) {
    lines.push(`- (${finding.severity}) ${finding.title} — ${finding.detail}`);
  }
  lines.push('');
  lines.push(`## ${forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_section_limitations')}`);
  for (const limitation of passport.limitations) lines.push(`- ${limitation}`);
  lines.push('');
  lines.push(`## ${forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_section_conclusion')}`);
  lines.push(`**${passport.conclusion.title}**`);
  lines.push('');
  lines.push(passport.conclusion.summary);
  lines.push('');
  lines.push(`> ${passport.conclusion.causalCaveat}`);
  lines.push('');
  lines.push(`## ${forgeText(passport.language as 'en' | 'si' | 'ta', 'passport_section_reproducibility')}`);
  lines.push(passport.reproducibility.instructions);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(passport.reproducibility.request, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push(`*${passport.disclaimer}*`);
  lines.push('');
  lines.push(`*${passport.generatedNotice}*`);
  return lines.join('\n');
}

/** Self-contained printable HTML. Images are referenced by URL, never inlined or invented. */
export function passportToHtml(passport: EvidencePassport): string {
  const language = passport.language as 'en' | 'si' | 'ta';
  const section = (key: string) => escapeHtml(forgeText(language, key));
  const evidenceTable = (items: PassportEvidence[], heading: string) => {
    const rows = items
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.datasetTitle)}<br><span class="muted">${escapeHtml(item.organisation)}</span></td>
          <td>${escapeHtml(item.strength)}</td>
          <td>${escapeHtml(item.rule)}</td>
          <td><a href="${escapeHtml(item.sourceUrl)}" rel="noreferrer noopener">${escapeHtml(item.sourceUrl)}</a><br>
          <span class="muted">${escapeHtml(item.retrievedAt)}</span></td>
        </tr>`,
      )
      .join('');
    return `<h2>${escapeHtml(heading)}</h2>
      ${
        items.length === 0
          ? `<p class="muted">${section('passport_none')}</p>`
          : `<table><thead><tr><th>Dataset</th><th>Strength</th><th>Rule</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>`
      }`;
  };

  const methodBlocks = passport.analysis.methods
    .map((method) => {
      const resultRows = Object.entries(method.results)
        .map(
          ([key, value]) =>
            `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(formatNumber(value))}</td></tr>`,
        )
        .join('');
      return `<div class="card">
        <h3>${escapeHtml(method.label)}${method.skipped ? ' — skipped' : ''}</h3>
        <p class="muted">n = ${method.sampleSize} · inputs: ${escapeHtml(method.inputVariables.join(', ') || '—')}</p>
        <table><tbody>${resultRows}</tbody></table>
        ${method.skipReason ? `<p class="muted">${escapeHtml(method.skipReason)}</p>` : ''}
      </div>`;
    })
    .join('');

  const sourceRows = passport.dataSources
    .map(
      (source) => `<tr>
        <td>${escapeHtml(source.title)}<br><span class="muted">${escapeHtml(source.organisation)}</span></td>
        <td>${escapeHtml(source.status)}</td>
        <td>${escapeHtml(source.retrievedAt ?? '—')}</td>
        <td>${source.recordCount}</td>
        <td><a href="${escapeHtml(source.documentationUrl)}" rel="noreferrer noopener">documentation</a></td>
      </tr>`,
    )
    .join('');

  const uncertaintyItems = passport.uncertainty
    .map(
      (finding) =>
        `<li><strong>${escapeHtml(finding.title)}</strong> <span class="badge">${escapeHtml(
          finding.severity,
        )}</span><br>${escapeHtml(finding.detail)}</li>`,
    )
    .join('');

  const limitationItems = passport.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  const imagery = passport.imagery
    .map(
      (image) =>
        `<figure><img src="${escapeHtml(image.wmsUrl)}" alt="${escapeHtml(image.title)}" loading="lazy"><figcaption>${escapeHtml(
          image.title,
        )} — ${escapeHtml(image.date)}. ${escapeHtml(image.attribution)}</figcaption></figure>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${escapeHtml(passport.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${section('passport_title')} — ${escapeHtml(passport.investigationId)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #05070f; color: #e7eefb; font: 15px/1.55 "Inter", system-ui, sans-serif; }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 0.12em; color: #7fd9ff; margin: 32px 0 10px; }
  h3 { font-size: 14px; margin: 0 0 6px; }
  p, li, td, th { font-size: 13.5px; }
  .muted { color: #93a4bf; }
  .badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; border: 1px solid #2b3c58; border-radius: 999px; padding: 1px 7px; }
  .meta { color: #93a4bf; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #18243a; vertical-align: top; }
  th { color: #93a4bf; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  a { color: #7fd9ff; word-break: break-all; }
  .card { border: 1px solid #18243a; border-radius: 12px; padding: 12px 14px; margin: 10px 0; background: rgba(15, 22, 36, 0.6); }
  .verdict { border: 1px solid #2b3c58; border-left: 3px solid #7fd9ff; border-radius: 10px; padding: 12px 14px; background: rgba(20, 30, 48, 0.6); }
  .notice { font-size: 11.5px; color: #93a4bf; border-top: 1px solid #18243a; margin-top: 28px; padding-top: 12px; }
  img { max-width: 100%; border-radius: 10px; border: 1px solid #18243a; }
  figure { margin: 12px 0; }
  figcaption { font-size: 11.5px; color: #93a4bf; }
  @media print { body { background: #fff; color: #111; padding: 0; } a { color: #0b5bd3; } .card, .verdict { background: #fff; border-color: #ccc; } th, td { border-color: #ddd; } .muted, .meta { color: #555; } h2 { color: #0b5bd3; } }
</style>
</head>
<body>
<main>
  <h1>${section('passport_title')}</h1>
  <p class="meta">${escapeHtml(passport.investigationId)} · ${escapeHtml(passport.generatedAt)} · ${escapeHtml(
    passport.reproducibility.engine,
  )}</p>

  <h2>${section('passport_section_question')}</h2>
  <p>${escapeHtml(passport.researchQuestion)}</p>

  <h2>${section('passport_section_hypothesis')}</h2>
  <p>${escapeHtml(passport.hypothesis.statement || '—')}</p>
  <p class="meta">Status: ${escapeHtml(passport.hypothesis.status)} · Null hypothesis considered: ${
    passport.hypothesis.nullHypothesisConsidered ? 'yes' : 'no'
  }</p>
  <ul>${passport.hypothesis.falsificationCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>

  <h2>${section('passport_section_sources')}</h2>
  <table><thead><tr><th>Dataset</th><th>Status</th><th>Retrieved (UTC)</th><th>Records</th><th>Reference</th></tr></thead>
  <tbody>${sourceRows || `<tr><td colspan="5" class="muted">${section('passport_none')}</td></tr>`}</tbody></table>

  <h2>${section('passport_section_methods')}</h2>
  ${methodBlocks || `<p class="muted">${section('passport_none')}</p>`}

  ${evidenceTable(passport.evidence.supporting, forgeText(language, 'passport_section_supporting'))}
  ${evidenceTable(passport.evidence.contradicting, forgeText(language, 'passport_section_contradicting'))}

  <h2>${section('passport_section_uncertainty')}</h2>
  <ul>${uncertaintyItems || `<li class="muted">${section('passport_none')}</li>`}</ul>

  <h2>${section('passport_section_limitations')}</h2>
  <ul>${limitationItems || `<li class="muted">${section('passport_none')}</li>`}</ul>

  <h2>${section('passport_section_conclusion')}</h2>
  <div class="verdict">
    <strong>${escapeHtml(passport.conclusion.title)}</strong>
    <p>${escapeHtml(passport.conclusion.summary)}</p>
    <p class="muted">${escapeHtml(passport.conclusion.causalCaveat)}</p>
  </div>

  <h2>${section('passport_section_reproducibility')}</h2>
  <p>${escapeHtml(passport.reproducibility.instructions)}</p>
  <pre class="meta">${escapeHtml(JSON.stringify(passport.reproducibility.request, null, 2))}</pre>

  ${imagery}

  <div class="notice">
    <p>${escapeHtml(passport.disclaimer)}</p>
    <p>${escapeHtml(passport.generatedNotice)}</p>
  </div>
</main>
</body>
</html>`;
}
