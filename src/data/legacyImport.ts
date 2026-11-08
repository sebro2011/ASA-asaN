/**
 * One-time, opt-in import of the pre-workspace assistant thread.
 *
 * The retired legacy assistant (`src/components/NasaAi.jsx`, removed in favour
 * of the workspace chat) persisted its thread to `nasa_ai_chat_thread_v3` (the
 * last 25 messages). That is the only local user content that exists, so it is
 * the only thing this importer migrates.
 *
 * Guarantees, in order of importance:
 *   1. **Nothing is deleted.** The local key is never removed here; the profile
 *      screen offers an explicit "remove local copy" once the import is verified.
 *   2. **Idempotent.** The conversation id is generated once and stored in a
 *      pending marker *before* the first write, so a retry re-uses the same id
 *      (an upsert), never a duplicate thread.
 *   3. **Verified.** The number of messages re-read from the server must match
 *      what was sent, otherwise the import is reported as failed and the marker
 *      stays unverified.
 *
 * All I/O is injected, so the behaviour is tested without a browser or Supabase.
 */
export const LEGACY_THREAD_KEY = 'nasa_ai_chat_thread_v3';
export const MIGRATION_MARKER_KEY = 'nova_migration_v1';
export const MAX_IMPORTED_MESSAGES = 100;

export interface LegacyMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

export interface MigrationMarker {
  status: 'pending' | 'done' | 'failed';
  conversationId: string;
  count: number;
  at: string;
  error?: string;
}

export interface LegacyImportDeps {
  readRaw(): string | null;
  readMarker(): MigrationMarker | null;
  writeMarker(marker: MigrationMarker): void;
  /** Upsert by id — calling twice with the same id must not duplicate the row. */
  ensureConversation(input: {
    id: string;
    title: string;
    lastMessageAt: string;
  }): Promise<void>;
  insertMessages(conversationId: string, messages: LegacyMessage[]): Promise<void>;
  countMessages(conversationId: string): Promise<number>;
  now?: () => Date;
  newId?: () => string;
}

export type LegacyImportResult =
  | { status: 'imported'; conversationId: string; count: number }
  | { status: 'already-imported'; conversationId: string; count: number }
  | { status: 'empty' }
  | { status: 'failed'; error: string; conversationId: string | null; localDataKept: true };

export const IMPORT_TITLE_MAX = 80;

/**
 * Accepts the shapes the science assistant has written over time:
 * `{role, text}`, `{role, content}` and `{role, text, timestamp|ts|created_at}`.
 * Anything that is not a user/assistant message with text is dropped, as are
 * offline-fallback notices (they are not conversation content).
 */
export function parseLegacyThread(raw: string | null): LegacyMessage[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const messages: LegacyMessage[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null;
    if (!role) continue;

    const rawText =
      typeof record.text === 'string'
        ? record.text
        : typeof record.content === 'string'
          ? record.content
          : '';
    const content = rawText.trim();
    if (!content) continue;
    if (/^\[Local offline fallback/i.test(content)) continue;

    const rawDate = record.createdAt ?? record.created_at ?? record.timestamp ?? record.ts;
    const createdAt =
      typeof rawDate === 'string' && !Number.isNaN(Date.parse(rawDate))
        ? new Date(rawDate).toISOString()
        : undefined;

    messages.push({ role, content: content.slice(0, 32000), createdAt });
  }

  return messages.slice(-MAX_IMPORTED_MESSAGES);
}

/** Title from the first user message, so the imported thread is recognisable. */
export function deriveTitle(messages: LegacyMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  const source = (firstUser?.content ?? 'Imported conversation').replace(/\s+/g, ' ').trim();
  return source.length > IMPORT_TITLE_MAX ? `${source.slice(0, IMPORT_TITLE_MAX - 1)}…` : source;
}

export async function importLegacyThread(deps: LegacyImportDeps): Promise<LegacyImportResult> {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const marker = deps.readMarker();
  if (marker?.status === 'done') {
    return { status: 'already-imported', conversationId: marker.conversationId, count: marker.count };
  }

  const messages = parseLegacyThread(deps.readRaw());
  if (messages.length === 0) return { status: 'empty' };

  // Re-use the id from a previous attempt so a retry cannot duplicate the thread.
  const conversationId = marker?.conversationId ?? newId();
  const lastMessageAt =
    messages[messages.length - 1]?.createdAt ?? now().toISOString();

  deps.writeMarker({
    status: 'pending',
    conversationId,
    count: messages.length,
    at: now().toISOString(),
  });

  try {
    await deps.ensureConversation({
      id: conversationId,
      title: deriveTitle(messages),
      lastMessageAt,
    });
    await deps.insertMessages(conversationId, messages);

    const written = await deps.countMessages(conversationId);
    if (written !== messages.length) {
      const error = `verification failed: expected ${messages.length}, found ${written}`;
      deps.writeMarker({
        status: 'failed',
        conversationId,
        count: written,
        at: now().toISOString(),
        error,
      });
      return { status: 'failed', error, conversationId, localDataKept: true };
    }

    deps.writeMarker({
      status: 'done',
      conversationId,
      count: written,
      at: now().toISOString(),
    });
    return { status: 'imported', conversationId, count: written };
  } catch (error) {
    const message = String((error as { message?: string } | null)?.message ?? error).slice(0, 240);
    deps.writeMarker({
      status: 'failed',
      conversationId,
      count: 0,
      at: now().toISOString(),
      error: message,
    });
    return { status: 'failed', error: message, conversationId, localDataKept: true };
  }
}

/* --------------------------------------------------------- browser-bound deps */

export interface BrowserImportStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createBrowserDeps(options: {
  storage: BrowserImportStorage;
  ensureConversation: LegacyImportDeps['ensureConversation'];
  insertMessages: LegacyImportDeps['insertMessages'];
  countMessages: LegacyImportDeps['countMessages'];
}): LegacyImportDeps {
  return {
    readRaw: () => {
      try {
        return options.storage.getItem(LEGACY_THREAD_KEY);
      } catch {
        return null;
      }
    },
    readMarker: () => {
      try {
        const raw = options.storage.getItem(MIGRATION_MARKER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as MigrationMarker;
        return parsed && typeof parsed.conversationId === 'string' ? parsed : null;
      } catch {
        return null;
      }
    },
    writeMarker: (marker) => {
      try {
        options.storage.setItem(MIGRATION_MARKER_KEY, JSON.stringify(marker));
      } catch {
        /* storage blocked: the import result is still reported to the caller */
      }
    },
    ensureConversation: options.ensureConversation,
    insertMessages: options.insertMessages,
    countMessages: options.countMessages,
  };
}

/** True when a local thread still exists (used by the "remove local copy" UI). */
export function localThreadCount(storage: BrowserImportStorage): number {
  try {
    return parseLegacyThread(storage.getItem(LEGACY_THREAD_KEY)).length;
  } catch {
    return 0;
  }
}
