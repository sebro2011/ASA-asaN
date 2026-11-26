/**
 * Small, deterministic retrieval for the local-first chat.
 *
 * Device-library records are searched in the browser; signed-in knowledge files
 * are retrieved through the owner-scoped `nova_retrieve_knowledge` RPC. No
 * embedding model, hosted API or fallback search service is required.
 */
import type { KnowledgeFileRow } from '../../data/types';
import type { ModuleRecord } from '../modules/records';

export type EvidenceSource = 'device-library' | 'private-library';

export interface ChatEvidence {
  id: string;
  source: EvidenceSource;
  title: string;
  content: string;
}

export interface RetrievedCloudChunk {
  knowledge_file_id: string;
  chunk_id: string;
  title: string;
  content: string;
  rank: number;
  chunk_index: number;
  created_at: string;
}

const TOKEN = /[\p{L}\p{M}\p{N}]{2,}/gu;
const EN_STOPWORDS = new Set(['about', 'after', 'also', 'and', 'are', 'for', 'from', 'how', 'into', 'that', 'the', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'your']);

/** Reviewable concept bridges, not machine translation. */
const CONCEPTS = [
  { en: ['moon', 'lunar'], si: ['චන්ද්‍රයා', 'සඳ', 'චන්ද්‍ර'], ta: ['நிலா', 'சந்திரன்'] },
  { en: ['star', 'stellar'], si: ['තාරකාව', 'තරුව'], ta: ['விண்மீன்', 'நட்சத்திரம்'] },
  { en: ['planet'], si: ['ග්‍රහලෝකය', 'ග්‍රහයා'], ta: ['கோள்', 'கிரகம்'] },
  { en: ['orbit'], si: ['කක්ෂය', 'කක්ෂීය'], ta: ['சுற்றுப்பாதை'] },
  { en: ['telescope'], si: ['දුරේක්ෂය'], ta: ['தொலைநோக்கி'] },
  { en: ['radiation'], si: ['විකිරණය'], ta: ['கதிர்வீச்சு'] },
  { en: ['mars'], si: ['අඟහරු'], ta: ['செவ்வாய்'] },
  { en: ['earth'], si: ['පෘථිවිය'], ta: ['பூமி'] },
  { en: ['water', 'ice'], si: ['ජලය', 'අයිස්'], ta: ['நீர்', 'பனி'] },
  { en: ['galaxy'], si: ['මන්දාකිණිය', 'ගැලැක්සිය'], ta: ['விண்மீன் மண்டலம்', 'அண்டம்'] },
];

function tokens(value: string): string[] {
  return (value.normalize('NFC').toLocaleLowerCase().match(TOKEN) ?? [])
    .filter((word) => !EN_STOPWORDS.has(word));
}

function expandedQuery(query: string): Set<string> {
  const base = new Set(tokens(query));
  for (const concept of CONCEPTS) {
    const groups = [concept.en, concept.si, concept.ta];
    if (!groups.some((group) => group.some((word) => base.has(word.toLocaleLowerCase())))) continue;
    for (const word of groups.flat()) {
      for (const part of tokens(word)) base.add(part);
    }
  }
  return base;
}

function splitChunks(text: string, size = 1_200, overlap = 180): string[] {
  const clean = text.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length && chunks.length < 64) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf('\n', end), clean.lastIndexOf('. ', end), clean.lastIndexOf('。', end));
      if (boundary > start + Math.floor(size * 0.55)) end = boundary + 1;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function scoreText(query: Set<string>, title: string, content: string): number {
  if (query.size === 0) return 0;
  const titleTokens = new Set(tokens(title));
  const contentTokens = tokens(content);
  const contentSet = new Set(contentTokens);
  let coverage = 0;
  let titleMatches = 0;
  let frequency = 0;
  for (const token of query) {
    if (contentSet.has(token)) {
      coverage += 1;
      frequency += contentTokens.filter((item) => item === token).length;
    }
    if (titleTokens.has(token)) titleMatches += 1;
  }
  if (coverage === 0 && titleMatches === 0) return 0;
  return (coverage / query.size) * 5 + titleMatches * 2 + Math.min(frequency, 8) / 10;
}

/** Rank local Star Library excerpts; a file contributes at most one passage. */
export function retrieveDeviceLibrary(queryText: string, records: ModuleRecord[], limit = 3): ChatEvidence[] {
  const query = expandedQuery(queryText);
  if (query.size === 0) return [];
  const candidates: Array<{ evidence: ChatEvidence; score: number; updatedAt: number }> = [];

  for (const record of records.filter((item) => item.module === 'library').slice(0, 200)) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(record.id)) continue;
    const title = record.data.name?.trim() || 'Untitled source';
    const body = (record.data.text || '').slice(0, 20_000);
    for (const content of splitChunks(body)) {
      const score = scoreText(query, title, content);
      if (score > 0) {
        candidates.push({
          evidence: { id: record.id, source: 'device-library', title: title.slice(0, 160), content: content.slice(0, 1_200) },
          score,
          updatedAt: Date.parse(record.updatedAt) || 0,
        });
      }
    }
  }

  const chosen: ChatEvidence[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)) {
    if (seen.has(candidate.evidence.id)) continue;
    seen.add(candidate.evidence.id);
    chosen.push(candidate.evidence);
    if (chosen.length >= Math.min(Math.max(limit, 1), 5)) break;
  }
  return chosen;
}

/** Convert private RPC hits into a narrow, citation-safe request contract. */
export function cloudChunksToEvidence(chunks: RetrievedCloudChunk[], files: KnowledgeFileRow[] = []): ChatEvidence[] {
  const names = new Map(files.map((file) => [file.id, file.name]));
  return chunks.slice(0, 5).flatMap((chunk) => {
    if (typeof chunk.knowledge_file_id !== 'string' || typeof chunk.content !== 'string') return [];
    const title = names.get(chunk.knowledge_file_id) || chunk.title;
    return [{
      id: chunk.knowledge_file_id,
      source: 'private-library' as const,
      title: String(title || 'Private source').slice(0, 160),
      content: chunk.content.slice(0, 1_200),
    }];
  });
}

/** Merge both retrieval paths while respecting the chat server's evidence cap. */
export function mergeEvidence(...groups: ChatEvidence[][]): ChatEvidence[] {
  const result: ChatEvidence[] = [];
  const seen = new Set<string>();
  const encoder = new TextEncoder();
  const maxJsonBytes = 5_500;
  let totalBytes = 0;
  for (const item of groups.flat()) {
    const key = `${item.source}:${item.id}`;
    if (seen.has(key) || result.length >= 5) continue;
    const title = item.title.trim().slice(0, 160);
    const id = item.id.slice(0, 128);
    const rawContent = item.content.trim();
    if (!title || !rawContent) continue;

    const remaining = maxJsonBytes - totalBytes;
    const points = Array.from(rawContent).slice(0, 1_200);
    let low = 0;
    let high = points.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate: ChatEvidence = {
        id,
        source: item.source,
        title,
        content: points.slice(0, middle).join(''),
      };
      if (encoder.encode(JSON.stringify(candidate)).length <= remaining) low = middle;
      else high = middle - 1;
    }

    if (low === 0) continue;
    const bounded: ChatEvidence = {
      id,
      source: item.source,
      title,
      content: points.slice(0, low).join(''),
    };
    result.push(bounded);
    seen.add(key);
    totalBytes += encoder.encode(JSON.stringify(bounded)).length;
  }
  return result;
}
