/**
 * Guest chat store — the chat works without an account.
 *
 * Signed-in readers keep conversations in Supabase (RLS on every row). Signed-out
 * readers, and deployments with no Supabase credentials, keep them here: a small,
 * versioned localStorage store with hard caps, so a guest can still start a
 * conversation, reload the page and find it, without anything leaving the device.
 *
 * Honesty rules:
 *  - the store never pretends to be cloud data: the surface says "this device";
 *  - nothing is uploaded, and signing in does not silently merge guest rows;
 *  - writes are best-effort — a blocked storage API degrades to session memory
 *    and the message is marked unsaved instead of being reported as saved.
 */
import type { ConversationRow, MessageRow, MessageRole } from '../../data/types';

export const LOCAL_CHAT_KEY = 'nova_local_chat_v1';
export const GUEST_USER_ID = 'local-guest';

const MAX_CONVERSATIONS = 40;
const MAX_MESSAGES = 800;
const MAX_MESSAGE_CHARS = 20_000;
const MAX_TITLE_CHARS = 120;

interface LocalChatState {
  version: 1;
  conversations: ConversationRow[];
  messages: MessageRow[];
}

function emptyState(): LocalChatState {
  return { version: 1, conversations: [], messages: [] };
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isConversation(value: unknown): value is ConversationRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.title === 'string';
}

function isMessage(value: unknown): value is MessageRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.conversation_id === 'string' &&
    typeof row.role === 'string' &&
    typeof row.content === 'string'
  );
}

/** Read + validate. A corrupt or foreign payload is ignored, never repaired in place. */
export function readLocalChat(): LocalChatState {
  const store = storage();
  if (!store) return emptyState();
  try {
    const raw = store.getItem(LOCAL_CHAT_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LocalChatState>;
    if (!parsed || parsed.version !== 1) return emptyState();
    return {
      version: 1,
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations.filter(isConversation) : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages.filter(isMessage) : [],
    };
  } catch {
    return emptyState();
  }
}

/** Write with caps. Returns false when storage refused the write (quota, privacy mode). */
function writeLocalChat(state: LocalChatState): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const conversations = [...state.conversations]
      .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)))
      .slice(0, MAX_CONVERSATIONS);
    const keep = new Set(conversations.map((row) => row.id));
    const messages = state.messages.filter((row) => keep.has(row.conversation_id)).slice(-MAX_MESSAGES);
    store.setItem(LOCAL_CHAT_KEY, JSON.stringify({ version: 1, conversations, messages }));
    return true;
  } catch {
    return false;
  }
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

export function listLocalConversations(): ConversationRow[] {
  return readLocalChat()
    .conversations.filter((row) => !row.deleted_at)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.last_message_at).localeCompare(String(a.last_message_at));
    });
}

export function createLocalConversation(
  title: string,
  { now = () => new Date(), newId = () => crypto.randomUUID() } = {},
): ConversationRow {
  const state = readLocalChat();
  const timestamp = nowIso(now);
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS) || 'New conversation';
  const row: ConversationRow = {
    id: newId(),
    user_id: GUEST_USER_ID,
    project_id: null,
    title: cleanTitle,
    archived: false,
    pinned: false,
    last_message_at: timestamp,
    deleted_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  state.conversations.unshift(row);
  writeLocalChat(state);
  return row;
}

export function updateLocalConversation(id: string, patch: Partial<ConversationRow>): void {
  const state = readLocalChat();
  const timestamp = new Date().toISOString();
  state.conversations = state.conversations.map((row) =>
    row.id === id
      ? {
          ...row,
          ...patch,
          title: typeof patch.title === 'string'
            ? patch.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS) || row.title
            : row.title,
          updated_at: timestamp,
        }
      : row,
  );
  writeLocalChat(state);
}

export function listLocalMessages(conversationId: string | null): MessageRow[] {
  if (!conversationId) return [];
  return readLocalChat()
    .messages.filter((row) => row.conversation_id === conversationId)
    .sort((a, b) => {
      const left = Number(a.seq);
      const right = Number(b.seq);
      if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
}

export interface LocalMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  provider?: string | null;
  model?: string | null;
  isError?: boolean;
  id?: string;
  createdAt?: string;
}

export function appendLocalMessage(
  input: LocalMessageInput,
  { newId = () => crypto.randomUUID() } = {},
): { row: MessageRow; saved: boolean } {
  const state = readLocalChat();
  const existing = state.messages.filter((row) => row.conversation_id === input.conversationId);
  const timestamp = input.createdAt || new Date().toISOString();
  const row: MessageRow = {
    id: input.id || newId(),
    conversation_id: input.conversationId,
    user_id: GUEST_USER_ID,
    role: input.role,
    content: String(input.content || '').slice(0, MAX_MESSAGE_CHARS),
    provider: input.provider ?? null,
    model: input.model ?? null,
    is_error: input.isError ?? false,
    seq: existing.length + 1,
    created_at: timestamp,
    updated_at: timestamp,
  };
  state.messages.push(row);
  state.conversations = state.conversations.map((conversation) =>
    conversation.id === input.conversationId
      ? { ...conversation, last_message_at: timestamp, updated_at: timestamp }
      : conversation,
  );
  const saved = writeLocalChat(state);
  return { row, saved };
}

export function removeLocalMessage(id: string): void {
  const state = readLocalChat();
  state.messages = state.messages.filter((row) => row.id !== id);
  writeLocalChat(state);
}
