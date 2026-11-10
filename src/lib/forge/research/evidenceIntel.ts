/**
 * Evidence intelligence — provenance, hierarchy and honesty.
 *
 * The rule that shapes this module: **the Forge never authors a citation.** It
 * can only hold a citation that a connector or a researcher supplied, and it
 * records where it came from. A URL is accepted only when it is https and on a
 * host the Forge can actually retrieve from; a DOI is accepted only when it is
 * syntactically a DOI and was supplied rather than composed. Anything else is
 * marked `unverified` and excluded from supportive counts.
 *
 * The second rule: evidence is only ever *about* a hypothesis. There is no
 * global "evidence score", because a paper that supports one claim is neutral to
 * another.
 */

import type { EvidenceItem } from '../types';
import type { CitationRecord } from './project';

export type EvidenceSourceType =
  | 'peer-reviewed'
  | 'official-dataset'
  | 'preprint'
  | 'secondary'
  | 'ai-generated';

export type EvidenceStance = 'supporting' | 'contradicting' | 'neutral' | 'insufficient' | 'unverified';

/** Weighting used for ordering, never for a truth score. */
export const SOURCE_WEIGHT: Record<EvidenceSourceType, number> = {
  'peer-reviewed': 4,
  'official-dataset': 3,
  preprint: 2,
  secondary: 1,
  'ai-generated': 0,
};

export const SOURCE_CAVEAT: Record<EvidenceSourceType, string> = {
  'peer-reviewed': 'Peer review is a filter on methodology, not a guarantee of correctness.',
  'official-dataset': 'An official dataset is authoritative for what was measured, not for what it means.',
  preprint: 'Not peer reviewed: treat the result as provisional until it is.',
  secondary: 'A secondary source (news, blog, textbook summary) — cite the primary source where possible.',
  'ai-generated': 'Produced by a language model. It is not evidence and must not be cited as a source.',
};

export interface EvidenceRecord {
  id: string;
  title: string;
  /** Authors exactly as supplied. Empty means unknown — never guessed. */
  authors: string[];
  url: string | null;
  doi: string | null;
  publisher: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  /** Dataset identity and the exact version used. */
  datasetId: string | null;
  datasetVersion: string | null;
  /** What was observed, in the researcher's words. */
  observation: string;
  unit: string;
  /** Method that produced the observation. */
  method: string;
  limitations: string[];
  citation: string;
  sourceType: EvidenceSourceType;
  stance: EvidenceStance;
  /** Hypotheses this record bears on. */
  hypothesisIds: string[];
  fullText: 'full' | 'abstract' | 'metadata-only';
  /** Provenance of the record itself. */
  origin: 'connector' | 'user' | 'import';
  /** The retrieval limit actually hit, in plain words. */
  accessNote: string;
  /** Set when validation could not confirm the source; never silently dropped. */
  verification: 'verified-structure' | 'unverified' | 'rejected';
  verificationNote: string;
}

const DOI_PATTERN = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/;
const ALLOWED_HOST_SUFFIXES = [
  'nasa.gov',
  'gsfc.nasa.gov',
  'noaa.gov',
  'esa.int',
  'ipcc.ch',
  'wmo.int',
  'usgs.gov',
  'doi.org',
  'arxiv.org',
  'nature.com',
  'science.org',
  'agu.org',
  'wiley.com',
  'springer.com',
  'elsevier.com',
  'copernicus.org',
  'frontiersin.org',
  'plos.org',
  'mdpi.com',
  'iopscience.iop.org',
  'aanda.org',
];

export function isAllowedHost(url: string): { allowed: boolean; reason: string; host: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'Not a valid absolute URL.', host: '' };
  }
  if (parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'Only https sources are accepted.', host: parsed.hostname };
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  return {
    allowed,
    reason: allowed ? 'Host is on the recognised scientific-source list.' : `Host ${host} is not a recognised scientific source.`,
    host,
  };
}

export function isValidDoi(doi: string): boolean {
  return DOI_PATTERN.test(doi.trim());
}

/**
 * Validates a record supplied by a connector or a researcher. It never adds a
 * URL or DOI that is missing; missing identifiers stay missing and visible.
 */
export function validateEvidenceRecord(record: Partial<EvidenceRecord>): {
  verification: EvidenceRecord['verification'];
  note: string;
} {
  if (record.origin === 'user' && !record.url && !record.doi) {
    return {
      verification: 'unverified',
      note: 'No URL or DOI supplied. The record is kept as an unverified claim by the researcher.',
    };
  }
  if (record.doi && !isValidDoi(record.doi)) {
    return { verification: 'rejected', note: `"${record.doi}" is not a syntactically valid DOI.` };
  }
  if (record.url) {
    const host = isAllowedHost(record.url);
    if (!host.allowed) {
      return { verification: 'unverified', note: `${host.reason} Verify the link manually before citing it.` };
    }
  }
  if (record.sourceType === 'ai-generated') {
    return {
      verification: 'unverified',
      note: 'Model-generated text is not a citable source, even when it names one.',
    };
  }
  if (!record.url && !record.doi) {
    return {
      verification: 'unverified',
      note: 'No resolvable identifier. Only a title and publisher are known, which is not enough to verify the item exists.',
    };
  }
  return { verification: 'verified-structure', note: 'Structurally valid: the identifier is present and well formed. Structure is not content — read the source.' };
}

/** Ranks records for display. Weight, then stance, then recency. */
export function rankEvidence(records: EvidenceRecord[]): EvidenceRecord[] {
  const stanceWeight: Record<EvidenceStance, number> = {
    supporting: 3,
    contradicting: 3,
    neutral: 2,
    insufficient: 1,
    unverified: 0,
  };
  return [...records].sort((a, b) => {
    const bySource = SOURCE_WEIGHT[b.sourceType] - SOURCE_WEIGHT[a.sourceType];
    if (bySource !== 0) return bySource;
    const byStance = stanceWeight[b.stance] - stanceWeight[a.stance];
    if (byStance !== 0) return byStance;
    return (b.publishedAt ?? b.retrievedAt).localeCompare(a.publishedAt ?? a.retrievedAt);
  });
}

/**
 * Counts by stance for one hypothesis. `unverified` is reported separately and
 * is *not* folded into "insufficient", because the two need different action.
 */
export function stanceCounts(records: EvidenceRecord[], hypothesisId: string): Record<EvidenceStance, number> {
  const counts: Record<EvidenceStance, number> = {
    supporting: 0,
    contradicting: 0,
    neutral: 0,
    insufficient: 0,
    unverified: 0,
  };
  for (const record of records) {
    if (!record.hypothesisIds.includes(hypothesisId)) continue;
    counts[record.stance] += 1;
  }
  return counts;
}

export interface EvidenceBalance {
  hypothesisId: string;
  supporting: number;
  contradicting: number;
  neutral: number;
  insufficient: number;
  unverified: number;
  statement: string;
  /** True when the evidence could not decide either way. */
  indeterminate: boolean;
}

/**
 * A deliberately non-numeric summary. A ratio of "supporting" to
 * "contradicting" counts papers, not evidence strength, so the Forge reports the
 * counts and a sentence, never a percentage or a confidence.
 */
export function evidenceBalance(records: EvidenceRecord[], hypothesisId: string): EvidenceBalance {
  const counts = stanceCounts(records, hypothesisId);
  const decisive = counts.supporting + counts.contradicting;
  const indeterminate = decisive === 0 || counts.insufficient > 0 || counts.unverified > 0;
  const parts: string[] = [];
  parts.push(`${counts.supporting} supporting`);
  parts.push(`${counts.contradicting} contradicting`);
  if (counts.neutral > 0) parts.push(`${counts.neutral} neutral`);
  if (counts.insufficient > 0) parts.push(`${counts.insufficient} insufficient`);
  if (counts.unverified > 0) parts.push(`${counts.unverified} unverified`);
  const statement =
    decisive === 0
      ? `No decisive evidence is attached to this hypothesis (${parts.join(', ')}).`
      : `${parts.join(', ')}. Evidence strength depends on each study's design, not on how many papers sit on one side.`;
  return { hypothesisId, ...counts, statement, indeterminate };
}

/** Projects an engine evidence item into a research record without inventing fields. */
export function fromEngineEvidence(item: EvidenceItem, options: { datasetVersion: string }): EvidenceRecord {
  const record: EvidenceRecord = {
    id: item.id,
    title: item.datasetTitle,
    authors: [item.organisation],
    url: item.sourceUrl || null,
    doi: null,
    publisher: item.organisation,
    publishedAt: item.observationEnd,
    retrievedAt: item.retrievedAt,
    datasetId: item.datasetId,
    datasetVersion: options.datasetVersion,
    observation: item.measurements,
    unit: item.units,
    method: item.processing,
    limitations: [...item.limitations],
    citation: `${item.organisation}. ${item.datasetTitle}. Retrieved ${item.retrievedAt}. ${item.sourceUrl}`,
    sourceType: 'official-dataset',
    stance:
      item.classification === 'supporting'
        ? 'supporting'
        : item.classification === 'contradicting'
          ? 'contradicting'
          : item.classification === 'insufficient'
            ? 'insufficient'
            : 'neutral',
    hypothesisIds: [...item.hypothesisIds],
    fullText: 'metadata-only',
    origin: 'connector',
    accessNote:
      'The Forge retrieved the dataset and its metadata; it did not read a paper. No full text was available to it.',
    verification: 'verified-structure',
    verificationNote: 'Official agency endpoint. The dataset is authoritative for its measurements, not for their interpretation.',
  };
  const validation = validateEvidenceRecord(record);
  return { ...record, verification: validation.verification, verificationNote: validation.note };
}

/** Converts a citation record into a printable reference, without embellishment. */
export function formatCitation(citation: CitationRecord): string {
  const authors = citation.authors.length > 0 ? citation.authors.join(', ') : 'Authors not recorded';
  const year = citation.year ? ` (${citation.year})` : ' (year not recorded)';
  const identifiers = [citation.doi ? `doi:${citation.doi}` : null, citation.url].filter(Boolean).join(' · ');
  return `${authors}${year}. ${citation.title}. ${citation.publisher}.${identifiers ? ` ${identifiers}` : ''}`;
}
