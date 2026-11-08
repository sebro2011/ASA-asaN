/**
 * Data hooks for the chat surface (Phase 3D-1).
 *
 * Everything goes through the typed repositories from Phase 3B, so RLS is the
 * enforcement layer and the row shapes match the SQL exactly. Writes are
 * best-effort: when a write fails (offline, quota) the UI keeps the message and
 * marks it as not saved rather than pretending it was persisted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { conversationRepo, messageRepo } from '../../data/repositories';
import type { ConversationRow, MessageRow } from '../../data/types';
import {
  appendLocalMessage,
  createLocalConversation,
  listLocalConversations,
  listLocalMessages,
  removeLocalMessage,
  updateLocalConversation,
} from './localChat';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface ConversationActions {
  reload(): Promise<void>;
  create(title?: string): Promise<ConversationRow>;
  rename(id: string, title: string): Promise<void>;
  setPinned(id: string, pinned: boolean): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

export function useConversations(client: SupabaseClient | null, userId: string | null) {
  const [items, setItems] = useState<ConversationRow[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);

  const repo = useMemo(() => (client ? conversationRepo(client) : null), [client]);
  /** No cloud session (signed out, or no Supabase on this deployment) → device store. */
  const local = !repo || !userId;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!repo || !userId) {
      if (!mounted.current) return;
      setItems(listLocalConversations());
      setState('ready');
      return;
    }
    setState('loading');
    setError(null);
    try {
      const rows = await repo.list(60);
      if (!mounted.current) return;
      setItems(rows);
      setState('ready');
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof Error ? caught.message : 'load failed');
      setState('error');
    }
  }, [repo, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Apply a row locally so the list never waits on a round trip. */
  const patchLocal = useCallback((id: string, patch: Partial<ConversationRow>) => {
    setItems((current) =>
      current
        .map((row) => (row.id === id ? { ...row, ...patch } : row))
        .filter((row) => !row.deleted_at),
    );
  }, []);

  const actions: ConversationActions = useMemo(
    () => ({
      reload,
      async create(title = 'New conversation') {
        if (!repo || !userId) {
          const row = createLocalConversation(title);
          setItems((current) => [row, ...current]);
          return row;
        }
        const row = await repo.create(userId, { title });
        setItems((current) => [row, ...current]);
        return row;
      },
      async rename(id, title) {
        const next = title.trim().slice(0, 160) || 'New conversation';
        patchLocal(id, { title: next });
        if (local) updateLocalConversation(id, { title: next });
        else if (repo) await repo.update(id, { title: next });
      },
      async setPinned(id, pinned) {
        patchLocal(id, { pinned });
        if (local) updateLocalConversation(id, { pinned });
        else if (repo) await repo.update(id, { pinned });
      },
      async setArchived(id, archived) {
        patchLocal(id, { archived });
        if (local) updateLocalConversation(id, { archived });
        else if (repo) await repo.update(id, { archived });
      },
      async remove(id) {
        patchLocal(id, { deleted_at: new Date().toISOString() });
        if (local) updateLocalConversation(id, { deleted_at: new Date().toISOString() });
        else if (repo) await repo.softDelete(id);
      },
      async restore(id) {
        patchLocal(id, { deleted_at: null });
        if (local) updateLocalConversation(id, { deleted_at: null });
        else if (repo) await repo.update(id, { deleted_at: null });
      },
    }),
    [repo, userId, local, reload, patchLocal],
  );

  return { items, state, error, ...actions };
}

export interface ThreadActions {
  reload(): Promise<void>;
  append(input: {
    role: MessageRow['role'];
    content: string;
    provider?: string | null;
    model?: string | null;
    isError?: boolean;
    id?: string;
    createdAt?: string;
    /** Overrides the hook's conversation (used right after creating one). */
    conversationId?: string;
  }): Promise<{ saved: boolean; row: MessageRow }>;
  markUnsaved(id: string): void;
  /** Hard delete of a single message — used by "regenerate" only. */
  remove(id: string): Promise<void>;
}

export function useThread(client: SupabaseClient | null, userId: string | null, conversationId: string | null) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<string[]>([]);

  const repo = useMemo(() => (client ? messageRepo(client) : null), [client]);
  const local = !repo || !userId;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setState('idle');
      return;
    }
    if (local) {
      setMessages(listLocalMessages(conversationId));
      setState('ready');
      return;
    }
    if (!repo) {
      setMessages([]);
      setState('idle');
      return;
    }
    setState('loading');
    setError(null);
    try {
      const rows = await repo.list(conversationId);
      if (!mounted.current) return;
      setMessages(rows);
      setState('ready');
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof Error ? caught.message : 'load failed');
      setState('error');
    }
  }, [repo, local, conversationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const append: ThreadActions['append'] = useCallback(
    async (input) => {
      const targetId = input.conversationId ?? conversationId;
      const row: MessageRow = {
        id: input.id ?? crypto.randomUUID(),
        conversation_id: targetId ?? 'local',
        user_id: userId ?? 'local',
        role: input.role,
        content: input.content,
        provider: input.provider ?? null,
        model: input.model ?? null,
        is_error: input.isError ?? false,
        seq: undefined as unknown as number,
        created_at: input.createdAt ?? new Date().toISOString(),
        updated_at: input.createdAt ?? new Date().toISOString(),
      } as MessageRow;

      setMessages((current) => [...current, row]);

      if (local && targetId) {
        const stored = appendLocalMessage({
          conversationId: targetId,
          role: row.role,
          content: row.content,
          provider: row.provider,
          model: row.model,
          isError: row.is_error,
          id: row.id,
          createdAt: row.created_at,
        });
        if (stored.saved) {
          setMessages((current) => current.map((item) => (item.id === row.id ? stored.row : item)));
          return { saved: true, row: stored.row };
        }
        setUnsaved((current) => [...current, row.id]);
        return { saved: false, row };
      }

      if (!repo || !userId || !targetId) {
        setUnsaved((current) => [...current, row.id]);
        return { saved: false, row };
      }

      try {
        const saved = await repo.create(userId, {
          id: row.id,
          conversationId: targetId,
          role: row.role,
          content: row.content,
          provider: row.provider,
          model: row.model,
          isError: row.is_error,
          createdAt: row.created_at,
        });
        if (mounted.current) {
          setMessages((current) => current.map((item) => (item.id === row.id ? saved : item)));
        }
        return { saved: true, row: saved };
      } catch {
        if (mounted.current) setUnsaved((current) => [...current, row.id]);
        return { saved: false, row };
      }
    },
    [repo, local, userId, conversationId],
  );

  const markUnsaved = useCallback((id: string) => {
    setUnsaved((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  /**
   * Drop a message. The local list is updated first so the UI never lags behind
   * the click; a failed delete leaves the row out of the transcript for this
   * session and the next reload restores it — the safer of the two failures.
   */
  const remove = useCallback(
    async (id: string) => {
      setMessages((current) => current.filter((row) => row.id !== id));
      setUnsaved((current) => current.filter((item) => item !== id));
      if (local) {
        removeLocalMessage(id);
      } else if (repo && userId) {
        try {
          await repo.remove(id);
        } catch {
          /* offline: the row survives on the server and returns on reload */
        }
      }
    },
    [repo, local, userId],
  );

  return { messages, state, error, unsaved, reload, append, markUnsaved, remove };
}
