/**
 * On-device record store for the astronomy modules.
 *
 * Missions, observation logs, the research journal, deep-sky research, the star
 * library and the observing plan all persist through this one versioned store.
 * It is deliberately local-first: a signed-out reader gets a real, usable tool
 * the moment the page loads, and a failed write is reported instead of being
 * pretended away (`writeRecords` returns a boolean and the UI marks the record
 * "not saved").
 *
 * Rules:
 *   - reads are validated, so a corrupt payload is ignored rather than trusted;
 *   - every value is a string and is capped, so nothing surprising is rendered;
 *   - records are capped per module so the store cannot grow without bound.
 */

export const MODULE_IDS = ['missions', 'logs', 'journal', 'research', 'library', 'plan'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleRecord {
  id: string;
  module: ModuleId;
  createdAt: string;
  updatedAt: string;
  data: Record<string, string>;
}

export const RECORDS_STORAGE_KEY = 'nova_module_records_v1';
export const RECORDS_CHANGED_EVENT = 'nova-module-records-changed';

const STORE_VERSION = 1;
const MAX_RECORDS_TOTAL = 600;
const MAX_RECORDS_PER_MODULE = 200;
const MAX_VALUE_CHARS = 20_000;
const MAX_DATA_BYTES = 60_000;

interface StoreShape {
  version: number;
  records: ModuleRecord[];
}

const EMPTY: StoreShape = { version: STORE_VERSION, records: [] };

function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && (MODULE_IDS as readonly string[]).includes(value);
}

function cleanData(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 40) return null;
  const data: Record<string, string> = {};
  let bytes = 0;
  for (const [key, raw] of entries) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 40) return null;
    if (typeof raw !== 'string') return null;
    const text = raw.slice(0, MAX_VALUE_CHARS);
    bytes += text.length;
    if (bytes > MAX_DATA_BYTES) return null;
    data[key] = text;
  }
  return data;
}

function cleanRecord(value: unknown): ModuleRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 80) return null;
  if (!isModuleId(raw.module)) return null;
  const data = cleanData(raw.data);
  if (!data) return null;
  const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : null;
  const updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : null;
  if (!createdAt || !updatedAt) return null;
  return { id: raw.id, module: raw.module, createdAt, updatedAt, data };
}

export function readRecords(): ModuleRecord[] {
  if (typeof window === 'undefined') return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RECORDS_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.records)) return [];
    return parsed.records.flatMap((entry) => {
      const clean = cleanRecord(entry);
      return clean ? [clean] : [];
    }).slice(0, MAX_RECORDS_TOTAL);
  } catch {
    return [];
  }
}

export function writeRecords(records: ModuleRecord[]): boolean {
  if (typeof window === 'undefined') return false;
  const payload: StoreShape = {
    version: STORE_VERSION,
    records: records.slice(0, MAX_RECORDS_TOTAL),
  };
  try {
    window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(RECORDS_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function recordsFor(moduleId: ModuleId, records = readRecords()): ModuleRecord[] {
  return records
    .filter((record) => record.module === moduleId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function createRecordId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random;
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface SaveResult {
  record: ModuleRecord;
  saved: boolean;
}

/** Create or update one record inside `moduleId`. */
export function saveRecord(
  moduleId: ModuleId,
  data: Record<string, string>,
  options: { id?: string; now?: Date } = {},
): SaveResult {
  const clean = cleanData(data) ?? {};
  const now = (options.now ?? new Date()).toISOString();
  const all = readRecords();
  const existing = options.id ? all.find((record) => record.id === options.id) : undefined;
  const record: ModuleRecord = existing
    ? { ...existing, updatedAt: now, data: clean }
    : {
        id: options.id ?? createRecordId(),
        module: moduleId,
        createdAt: now,
        updatedAt: now,
        data: clean,
      };

  const others = all.filter((entry) => entry.id !== record.id);
  const sameModule = [record, ...others.filter((entry) => entry.module === moduleId)]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_RECORDS_PER_MODULE);
  const next = [...sameModule, ...others.filter((entry) => entry.module !== moduleId)];
  return { record, saved: writeRecords(next) };
}

export function deleteRecord(id: string): boolean {
  const all = readRecords();
  const next = all.filter((record) => record.id !== id);
  if (next.length === all.length) return true;
  return writeRecords(next);
}

export function clearModule(moduleId: ModuleId): boolean {
  return writeRecords(readRecords().filter((record) => record.module !== moduleId));
}

/** The record as plain labelled text, used to ground an Ask NOVA prompt. */
export function recordToText(record: ModuleRecord, labels: Record<string, string>): string {
  return Object.entries(record.data)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${labels[key] ?? key}: ${value.trim()}`)
    .join('\n');
}
