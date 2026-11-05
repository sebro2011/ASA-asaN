/**
 * Row types for the Phase 3B schema (supabase/migrations/20261105_nova_workspace.sql).
 *
 * These mirror the SQL exactly — column names, not camelCase — so a row can be
 * passed straight to PostgREST and compared with what comes back.
 */

export type IsoDate = string;

export type Locale = 'en' | 'si' | 'ta';
export type ThemePreference = 'dark' | 'light' | 'system';
export type MessageRole = 'user' | 'assistant' | 'system';
export type DocumentKind = 'document' | 'writing' | 'research' | 'code' | 'note';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProfileRow {
  id: string;
  display_name: string | null;
  locale: Locale;
  theme: ThemePreference;
  reduce_motion: boolean;
  high_contrast: boolean;
  sidebar_collapsed: boolean;
  font_scale: number;
  preferred_provider: 'auto' | 'arena' | 'openrouter' | 'gemini' | 'local';
  default_surface: string;
  created_at: IsoDate;
  updated_at: IsoDate;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  instructions: string;
  color: string | null;
  archived: boolean;
  created_at: IsoDate;
  updated_at: IsoDate;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  archived: boolean;
  pinned: boolean;
  last_message_at: IsoDate;
  deleted_at: IsoDate | null;
  created_at: IsoDate;
  updated_at: IsoDate;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  provider: string | null;
  model: string | null;
  is_error: boolean;
  seq: number | string;
  created_at: IsoDate;
  updated_at: IsoDate;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  project_id: string | null;
  kind: DocumentKind;
  title: string;
  content: string;
  language: string | null;
  metadata: Record<string, unknown>;
  pinned: boolean;
  deleted_at: IsoDate | null;
  created_at: IsoDate;
  updated_at: IsoDate;
}

export interface TaskRow {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  position: number;
  created_at: IsoDate;
  updated_at: IsoDate;
}

export interface KnowledgeFileRow {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  mime: string;
  size_bytes: number;
  storage_path: string;
  extracted_text: string | null;
  index_status: 'ready' | 'metadata_only';
  created_at: IsoDate;
}

/** Tables the sync engine is allowed to write. */
export type SyncTable = 'projects' | 'conversations' | 'messages' | 'documents' | 'tasks' | 'knowledge_files';

export const SYNC_TABLES: readonly SyncTable[] = [
  'projects',
  'conversations',
  'messages',
  'documents',
  'tasks',
  'knowledge_files',
] as const;

export function isSyncTable(value: string): value is SyncTable {
  return (SYNC_TABLES as readonly string[]).includes(value);
}
