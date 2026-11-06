/**
 * Supabase repositories (RLS-scoped).
 *
 * Every query runs with the signed-in user's JWT, so the policies in
 * supabase/migrations/20261105_nova_workspace.sql decide what is visible. There
 * is deliberately **no** `user_id` filtering in application code: if a filter
 * were forgotten the database would still refuse the row — and if the database
 * were permissive the app filter would not save us.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncTransport } from './sync';
import type {
  ConversationRow,
  DocumentRow,
  DocumentKind,
  MessageRow,
  ProfileRow,
  ProjectRow,
  SyncTable,
  TaskRow,
  TaskPriority,
  TaskStatus,
} from './types';

const KNOWLEDGE_BUCKET = 'knowledge';
const MAX_UPLOAD_BYTES = 26214400; // 25 MB, matches the bucket limit

/** Tables without an `updated_at` column cannot participate in conflict checks. */
const TABLES_WITH_UPDATED_AT = new Set<SyncTable>([
  'projects',
  'conversations',
  'messages',
  'documents',
  'tasks',
]);

export interface RepositoryError {
  code: 'quota-exceeded' | 'unauthorised' | 'not-found' | 'invalid-input' | 'network' | 'unknown';
  message: string;
}

export function toRepositoryError(error: unknown): RepositoryError {
  const raw = error as { message?: string; code?: string; status?: number } | null;
  const message = String(raw?.message ?? '');
  if (/quota-exceeded/i.test(message)) {
    return { code: 'quota-exceeded', message: 'This workspace has reached its storage limit.' };
  }
  if (raw?.code === '42501' || /row-level security|permission denied|authentication-required/i.test(message)) {
    return { code: 'unauthorised', message: 'You do not have access to this record.' };
  }
  if (raw?.status === 404 || /not found/i.test(message)) {
    return { code: 'not-found', message: 'This record no longer exists.' };
  }
  if (/invalid input|violates check constraint|violates not-null/i.test(message)) {
    return { code: 'invalid-input', message: 'Some fields are not valid.' };
  }
  if (/fetch|network|timeout/i.test(message)) {
    return { code: 'network', message: 'The cloud is unreachable.' };
  }
  return { code: 'unknown', message: 'The request could not be completed.' };
}

function unwrap<T>(result: { data: T | null; error: unknown | null }): T {
  if (result.error) throw toRepositoryError(result.error);
  return (result.data ?? ([] as unknown)) as T;
}

/* ------------------------------------------------------------------ transport */

export function createSupabaseTransport(client: SupabaseClient): SyncTransport {
  return {
    async fetchUpdatedAt(table, id) {
      if (!TABLES_WITH_UPDATED_AT.has(table)) return null;
      const { data, error } = await client
        .from(table)
        .select('updated_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw toRepositoryError(error);
      return (data as { updated_at?: string } | null)?.updated_at ?? null;
    },

    async upsert(table, row) {
      const { error } = await client.from(table).upsert(row, { onConflict: 'id' });
      if (error) throw toRepositoryError(error);
    },

    async remove(table, id) {
      const { error } = await client.from(table).delete().eq('id', id);
      if (error) throw toRepositoryError(error);
    },
  };
}

/* ------------------------------------------------------------------- profiles */

export function profileRepo(client: SupabaseClient) {
  return {
    async get(userId: string): Promise<ProfileRow | null> {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw toRepositoryError(error);
      return (data as ProfileRow | null) ?? null;
    },

    async update(userId: string, patch: Partial<ProfileRow>): Promise<ProfileRow | null> {
      const { data, error } = await client
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('*')
        .maybeSingle();
      if (error) throw toRepositoryError(error);
      return (data as ProfileRow | null) ?? null;
    },
  };
}

/* -------------------------------------------------------------- conversations */

export function conversationRepo(client: SupabaseClient) {
  return {
    async list(limit = 30, before?: string): Promise<ConversationRow[]> {
      let query = client
        .from('conversations')
        .select('*')
        .is('deleted_at', null)
        .order('last_message_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (before) query = query.lt('last_message_at', before);
      const { data, error } = await query;
      if (error) throw toRepositoryError(error);
      return (data as ConversationRow[] | null) ?? [];
    },

    async get(id: string): Promise<ConversationRow | null> {
      const { data, error } = await client
        .from('conversations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw toRepositoryError(error);
      return (data as ConversationRow | null) ?? null;
    },

    async create(
      userId: string,
      input: { id?: string; title: string; projectId?: string | null },
    ): Promise<ConversationRow> {
      const row = {
        id: input.id ?? crypto.randomUUID(),
        user_id: userId,
        title: input.title.trim().slice(0, 160) || 'New conversation',
        project_id: input.projectId ?? null,
      };
      const { data, error } = await client.from('conversations').insert(row).select('*').single();
      if (error) throw toRepositoryError(error);
      return data as ConversationRow;
    },

    async update(id: string, patch: Partial<ConversationRow>): Promise<ConversationRow | null> {
      const { data, error } = await client
        .from('conversations')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw toRepositoryError(error);
      return (data as ConversationRow | null) ?? null;
    },

    /** Soft delete keeps the row (and the audit trail) until the user purges. */
    async softDelete(id: string): Promise<void> {
      const { error } = await client
        .from('conversations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw toRepositoryError(error);
    },
  };
}

/* ------------------------------------------------------------------- messages */

export function messageRepo(client: SupabaseClient) {
  return {
    async list(conversationId: string, afterSeq?: number): Promise<MessageRow[]> {
      let query = client
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('seq', { ascending: true })
        .limit(200);
      if (afterSeq !== undefined) query = query.gt('seq', afterSeq);
      const { data, error } = await query;
      if (error) throw toRepositoryError(error);
      return (data as MessageRow[] | null) ?? [];
    },

    async countForConversation(conversationId: string): Promise<number> {
      const { count, error } = await client
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);
      if (error) throw toRepositoryError(error);
      return count ?? 0;
    },

    async create(
      userId: string,
      input: {
        id?: string;
        conversationId: string;
        role: MessageRow['role'];
        content: string;
        provider?: string | null;
        model?: string | null;
        isError?: boolean;
        createdAt?: string;
      },
    ): Promise<MessageRow> {
      const row = {
        id: input.id ?? crypto.randomUUID(),
        conversation_id: input.conversationId,
        user_id: userId,
        role: input.role,
        content: input.content.slice(0, 32000),
        provider: input.provider ?? null,
        model: input.model ?? null,
        is_error: input.isError === true,
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
      };
      const { data, error } = await client.from('messages').insert(row).select('*').single();
      if (error) throw toRepositoryError(error);
      return data as MessageRow;
    },

    /** Used by "regenerate": the superseded answer is removed, not duplicated. */
    async remove(id: string): Promise<void> {
      const { error } = await client.from('messages').delete().eq('id', id);
      if (error) throw toRepositoryError(error);
    },
  };
}

/* ------------------------------------------------------------------- projects */

export function projectRepo(client: SupabaseClient) {
  return {
    async list(): Promise<ProjectRow[]> {
      const { data, error } = await client
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw toRepositoryError(error);
      return (data as ProjectRow[] | null) ?? [];
    },

    async create(
      userId: string,
      input: { name: string; description?: string; instructions?: string; color?: string | null },
    ): Promise<ProjectRow> {
      const row = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: input.name.trim().slice(0, 120),
        description: (input.description ?? '').slice(0, 2000),
        instructions: (input.instructions ?? '').slice(0, 4000),
        color: input.color ?? null,
      };
      const { data, error } = await client.from('projects').insert(row).select('*').single();
      if (error) throw toRepositoryError(error);
      return data as ProjectRow;
    },

    async update(id: string, patch: Partial<ProjectRow>): Promise<ProjectRow | null> {
      const { data, error } = await client
        .from('projects')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw toRepositoryError(error);
      return (data as ProjectRow | null) ?? null;
    },

    async remove(id: string): Promise<void> {
      const { error } = await client.from('projects').delete().eq('id', id);
      if (error) throw toRepositoryError(error);
    },
  };
}

/* ------------------------------------------------------------------ documents */

export function documentRepo(client: SupabaseClient) {
  return {
    async list(kind?: DocumentKind): Promise<DocumentRow[]> {
      let query = client
        .from('documents')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (kind) query = query.eq('kind', kind);
      const { data, error } = await query;
      if (error) throw toRepositoryError(error);
      return (data as DocumentRow[] | null) ?? [];
    },

    async create(
      userId: string,
      input: {
        title: string;
        kind?: DocumentKind;
        content?: string;
        projectId?: string | null;
        language?: string | null;
      },
    ): Promise<DocumentRow> {
      const row = {
        id: crypto.randomUUID(),
        user_id: userId,
        project_id: input.projectId ?? null,
        kind: input.kind ?? 'document',
        title: input.title.trim().slice(0, 200),
        content: (input.content ?? '').slice(0, 400000),
        language: input.language ?? null,
      };
      const { data, error } = await client.from('documents').insert(row).select('*').single();
      if (error) throw toRepositoryError(error);
      return data as DocumentRow;
    },

    async update(id: string, patch: Partial<DocumentRow>): Promise<DocumentRow | null> {
      const { data, error } = await client
        .from('documents')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw toRepositoryError(error);
      return (data as DocumentRow | null) ?? null;
    },

    async addRevision(documentId: string, userId: string, content: string): Promise<void> {
      const { error } = await client
        .from('document_revisions')
        .insert({ document_id: documentId, user_id: userId, content: content.slice(0, 400000) });
      if (error) throw toRepositoryError(error);
    },
  };
}

/* ---------------------------------------------------------------------- tasks */

export function taskRepo(client: SupabaseClient) {
  return {
    async list(status?: TaskStatus): Promise<TaskRow[]> {
      let query = client
        .from('tasks')
        .select('*')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(500);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw toRepositoryError(error);
      return (data as TaskRow[] | null) ?? [];
    },

    async create(
      userId: string,
      input: { title: string; notes?: string; priority?: TaskPriority; projectId?: string | null },
    ): Promise<TaskRow> {
      const row = {
        id: crypto.randomUUID(),
        user_id: userId,
        project_id: input.projectId ?? null,
        title: input.title.trim().slice(0, 200),
        notes: (input.notes ?? '').slice(0, 4000),
        priority: input.priority ?? 'medium',
      };
      const { data, error } = await client.from('tasks').insert(row).select('*').single();
      if (error) throw toRepositoryError(error);
      return data as TaskRow;
    },

    async update(id: string, patch: Partial<TaskRow>): Promise<TaskRow | null> {
      const { data, error } = await client
        .from('tasks')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw toRepositoryError(error);
      return (data as TaskRow | null) ?? null;
    },

    async remove(id: string): Promise<void> {
      const { error } = await client.from('tasks').delete().eq('id', id);
      if (error) throw toRepositoryError(error);
    },
  };
}

/* ------------------------------------------------------------------ knowledge */

export function knowledgeRepo(client: SupabaseClient) {
  return {
    /**
     * Upload to the private bucket under the caller's folder, then record the
     * metadata row. The storage policy independently verifies the folder, so a
     * forged path is rejected by the bucket, not by this function.
     */
    async upload(
      userId: string,
      file: { name: string; mime: string; bytes: Blob | ArrayBuffer | Uint8Array },
      projectId: string | null = null,
    ) {
      const size =
        typeof (file.bytes as Blob).size === 'number'
          ? (file.bytes as Blob).size
          : (file.bytes as ArrayBuffer).byteLength;
      if (size > MAX_UPLOAD_BYTES) {
        throw { code: 'invalid-input', message: 'Files must be 25 MB or smaller.' } as RepositoryError;
      }

      const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file';
      const path = `${userId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await client.storage
        .from(KNOWLEDGE_BUCKET)
        .upload(path, file.bytes, { contentType: file.mime, upsert: false });
      if (uploadError) throw toRepositoryError(uploadError);

      const { data, error } = await client
        .from('knowledge_files')
        .insert({
          user_id: userId,
          project_id: projectId,
          name: safeName.slice(0, 200),
          mime: file.mime.slice(0, 120),
          size_bytes: size,
          storage_path: path,
        })
        .select('*')
        .single();

      if (error) {
        // Metadata insert failed: remove the orphaned object rather than leaking
        // storage the user cannot see.
        await client.storage.from(KNOWLEDGE_BUCKET).remove([path]);
        throw toRepositoryError(error);
      }
      return data;
    },

    async remove(userId: string, id: string, storagePath: string): Promise<void> {
      if (!storagePath.startsWith(`${userId}/`)) {
        throw { code: 'unauthorised', message: 'That file is not yours.' } as RepositoryError;
      }
      const { error } = await client.from('knowledge_files').delete().eq('id', id);
      if (error) throw toRepositoryError(error);
      await client.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
    },
  };
}

/* ------------------------------------------------------- export / bulk delete */

export interface WorkspaceExport {
  format: 'nova-workspace-export-v1';
  exportedAt: string;
  profile: ProfileRow | null;
  projects: ProjectRow[];
  conversations: ConversationRow[];
  messages: MessageRow[];
  documents: DocumentRow[];
  tasks: TaskRow[];
}

/**
 * Full client-side export. Runs through RLS, so it can only ever contain the
 * caller's rows; no secrets, tokens or storage URLs are included.
 */
export async function exportWorkspace(client: SupabaseClient, userId: string): Promise<WorkspaceExport> {
  const [profile, projects, conversations, documents, tasks] = await Promise.all([
    profileRepo(client).get(userId),
    client.from('projects').select('*').then((r) => (unwrap(r) as ProjectRow[])),
    client.from('conversations').select('*').then((r) => (unwrap(r) as ConversationRow[])),
    client.from('documents').select('*').then((r) => (unwrap(r) as DocumentRow[])),
    client.from('tasks').select('*').then((r) => (unwrap(r) as TaskRow[])),
  ]);

  const messages: MessageRow[] = [];
  if (conversations.length > 0) {
    const { data, error } = await client
      .from('messages')
      .select('*')
      .order('seq', { ascending: true })
      .limit(10000);
    if (error) throw toRepositoryError(error);
    messages.push(...((data as MessageRow[] | null) ?? []));
  }

  return {
    format: 'nova-workspace-export-v1',
    exportedAt: new Date().toISOString(),
    profile,
    projects,
    conversations,
    documents,
    tasks,
    messages,
  };
}

/** Deletes this user's workspace rows via the scoped RPC; keeps the account. */
export async function deleteMyWorkspaceData(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('delete_my_workspace_data');
  if (error) throw toRepositoryError(error);
}
