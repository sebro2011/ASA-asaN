/**
 * Workspace authentication + sync provider.
 *
 * Responsibilities, deliberately narrow:
 *   * resolve the runtime cloud config and build one Supabase client;
 *   * track the session (persisted, auto-refreshed, PKCE) and the profile row;
 *   * mirror device preferences up to `profiles` (device wins);
 *   * own the sync engine and flush it on sign-in, reconnect, focus and request.
 *
 * It never renders UI and never invents state: when the deployment has no
 * Supabase credentials the status is `unconfigured` and every action returns a
 * typed failure instead of pretending.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  loadCloudConfig,
  resetCloudConfigCache,
  type CloudConfig,
  type CloudConfigReason,
} from '../data/config';
import { getCloudClient } from '../data/supabaseClient';
import { Outbox, defaultStorage, type StorageLike } from '../data/outbox';
import { SyncEngine } from '../data/sync';
import {
  conversationRepo,
  createSupabaseTransport,
  deleteMyWorkspaceData,
  exportWorkspace,
  messageRepo,
  profileRepo,
  toRepositoryError,
  type WorkspaceExport,
} from '../data/repositories';
import { preferenceDiff, readDevicePreferences } from '../data/preferences';
import {
  authRedirectUrl,
  resendConfirmation,
  sendPasswordReset,
  signIn as signInRequest,
  signOut as signOutRequest,
  signUp as signUpRequest,
  updatePassword as updatePasswordRequest,
  type AuthErrorCode,
} from '../data/authApi';
import {
  createBrowserDeps,
  importLegacyThread,
  localThreadCount,
  LEGACY_THREAD_KEY,
  type LegacyImportResult,
  type MigrationMarker,
} from '../data/legacyImport';
import type { ProfileRow } from '../data/types';

export type AuthStatus = 'loading' | 'unconfigured' | 'signed-out' | 'signed-in';

export interface AuthUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error';
  pending: number;
  conflicts: number;
  lastSyncedAt: string | null;
}

export type ActionResult<T = undefined> = { ok: true; value?: T } | { ok: false; code: AuthErrorCode };

export interface AuthContextValue {
  status: AuthStatus;
  /** The live client, or null when the cloud is unconfigured/signed out. */
  client: SupabaseClient | null;
  config: CloudConfig | null;
  reason: CloudConfigReason | null;
  user: AuthUser | null;
  profile: ProfileRow | null;
  sync: SyncState;
  localThreadMessages: number;
  migration: MigrationMarker | null;
  signIn(email: string, password: string): Promise<ActionResult>;
  signUp(email: string, password: string): Promise<ActionResult<{ needsConfirmation: boolean }>>;
  signOut(): Promise<ActionResult>;
  resetPassword(email: string): Promise<ActionResult>;
  changePassword(password: string): Promise<ActionResult>;
  resendVerification(email: string): Promise<ActionResult>;
  updateProfile(patch: Partial<ProfileRow>): Promise<ActionResult>;
  refreshProfile(): Promise<void>;
  /** Re-probe `/api/workspace/config` after a network blip (never cached forever). */
  retryConnection(): Promise<void>;
  syncNow(): Promise<void>;
  importLocalThread(): Promise<LegacyImportResult | { status: 'unavailable' }>;
  removeLocalThread(): void;
  exportData(): Promise<ActionResult<WorkspaceExport>>;
  deleteAllData(): Promise<ActionResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  /** Test seam: replace the real client factory. */
  createClient?: () => Promise<SupabaseClient | null>;
  /** Test seam: replace storage (outbox, migration marker, preferences). */
  storage?: StorageLike;
}

const EMPTY_SYNC: SyncState = { status: 'idle', pending: 0, conflicts: 0, lastSyncedAt: null };

function safeStorage(): StorageLike {
  return defaultStorage();
}

export function AuthProvider({ children, createClient, storage }: AuthProviderProps) {
  const store = useMemo(() => storage ?? safeStorage(), [storage]);
  const outbox = useMemo(() => new Outbox(store), [store]);

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [sync, setSync] = useState<SyncState>(EMPTY_SYNC);
  const [localThreadMessages, setLocalThreadMessages] = useState(0);
  const [migration, setMigration] = useState<MigrationMarker | null>(null);

  const engineRef = useRef<SyncEngine | null>(null);
  const mountedRef = useRef(true);
  const profileRef = useRef<ProfileRow | null>(null);

  profileRef.current = profile;

  const readMarker = useCallback((): MigrationMarker | null => {
    try {
      const raw = store.getItem('nova_migration_v1');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as MigrationMarker;
      return typeof parsed?.conversationId === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }, [store]);

  /* ------------------------------------------------------------- session */

  const applySession = useCallback(
    async (activeClient: SupabaseClient, session: Session | null) => {
      if (!mountedRef.current) return;
      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setStatus('signed-out');
        return;
      }

      const nextUser: AuthUser = {
        id: session.user.id,
        email: session.user.email ?? null,
        emailConfirmed: Boolean(session.user.email_confirmed_at ?? session.user.confirmed_at),
      };
      setUser(nextUser);
      setStatus('signed-in');

      const repo = profileRepo(activeClient);
      try {
        let row = await repo.get(nextUser.id);
        if (!row) {
          // The DB trigger creates the row; if it was skipped (for example a user
          // created before the migration) create the minimal row here.
          await activeClient.from('profiles').insert({ id: nextUser.id });
          row = await repo.get(nextUser.id);
        }
        if (!mountedRef.current) return;
        setProfile(row);

        // Device preferences win, but they should survive onto other devices.
        if (row) {
          const diff = preferenceDiff(readDevicePreferences(store), row);
          if (Object.keys(diff).length > 0) {
            const updated = await repo.update(nextUser.id, diff);
            if (mountedRef.current && updated) setProfile(updated);
          }
        }
      } catch {
        // A profile read failure must not lock the user out of the workspace.
        if (mountedRef.current) setProfile(null);
      }
    },
    [store],
  );

  // Bumped by `retryConnection()` so a failed probe is never cached for the session.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    const factory = createClient ?? getCloudClient;

    const bootstrap = async () => {
      const cloudConfig = await loadCloudConfig();
      if (!mountedRef.current) return;
      setConfig(cloudConfig);

      const activeClient = await factory();
      if (!mountedRef.current) return;
      setClient(activeClient);

      if (!activeClient) {
        setStatus('unconfigured');
        return;
      }

      try {
        const { data } = await activeClient.auth.getSession();
        await applySession(activeClient, data.session ?? null);
      } catch {
        await applySession(activeClient, null);
      }
    };

    void bootstrap();

    return () => {
      mountedRef.current = false;
    };
  }, [applySession, createClient, attempt]);

  const retryConnection = useCallback(async () => {
    setStatus('loading');
    setConfig(null);
    resetCloudConfigCache();
    setAttempt((value) => value + 1);
  }, []);

  // Subscribe separately so the listener survives the async bootstrap above.
  useEffect(() => {
    if (!client) return undefined;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      void applySession(client, session);
    });
    return () => data.subscription.unsubscribe();
  }, [applySession, client]);

  /* ---------------------------------------------------------------- sync */

  const refreshPending = useCallback(() => {
    const pending = outbox.pending();
    setSync((current) => ({
      ...current,
      pending: pending.upserts + pending.deletes,
    }));
  }, [outbox]);

  const flush = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) {
      refreshPending();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSync((current) => ({ ...current, status: 'offline', pending: outbox.size() }));
      return;
    }

    setSync((current) => ({ ...current, status: 'syncing' }));
    const summary = await engine.flush();
    if (!mountedRef.current) return;
    setSync((current) => ({
      status:
        summary.status === 'offline' ? 'offline' : summary.status === 'partial' ? 'error' : 'idle',
      pending: summary.remaining,
      conflicts: current.conflicts + summary.conflicts,
      lastSyncedAt:
        summary.pushed > 0 ? new Date().toISOString() : current.lastSyncedAt,
    }));
  }, [outbox]);

  useEffect(() => {
    if (!client || !user) {
      engineRef.current = null;
      refreshPending();
      return;
    }

    engineRef.current = new SyncEngine({
      outbox,
      transport: createSupabaseTransport(client),
      onEvent: () => {
        /* events are summarised in SyncState; individual entries stay internal */
      },
    });

    void flush();
    return () => {
      engineRef.current = null;
    };
  }, [client, flush, outbox, refreshPending, user]);

  // Reconnect / focus / tab visibility are the three moments a device can catch up.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onOnline = () => void flush();
    const onOffline = () =>
      setSync((current) => ({ ...current, status: 'offline', pending: outbox.size() }));
    const onFocus = () => void flush();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void flush();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush, outbox]);

  // Local thread + migration marker are read after hydration so SSR/first paint
  // never touches storage.
  useEffect(() => {
    setLocalThreadMessages(localThreadCount(store));
    setMigration(readMarker());
  }, [readMarker, store, status]);

  /* ------------------------------------------------------------- actions */

  const requireClient = useCallback((): SupabaseClient | null => client, [client]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<ActionResult> => {
      const activeClient = requireClient();
      if (!activeClient) return { ok: false, code: 'unknown' };
      const result = await signInRequest(activeClient, { email, password });
      return result.ok ? { ok: true } : { ok: false, code: result.code };
    },
    [requireClient],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<ActionResult<{ needsConfirmation: boolean }>> => {
      const activeClient = requireClient();
      if (!activeClient) return { ok: false, code: 'unknown' };
      const locale = (document?.documentElement?.lang || 'en').slice(0, 2) as 'en' | 'si' | 'ta';
      const result = await signUpRequest(activeClient, {
        email,
        password,
        locale,
        redirectTo: authRedirectUrl('/profile'),
      });
      return result.ok
        ? { ok: true, value: { needsConfirmation: result.value.needsConfirmation } }
        : { ok: false, code: result.code };
    },
    [requireClient],
  );

  const signOut = useCallback(async (): Promise<ActionResult> => {
    const activeClient = requireClient();
    if (!activeClient) return { ok: false, code: 'unknown' };
    const result = await signOutRequest(activeClient);
    if (!result.ok) return { ok: false, code: result.code };
    setUser(null);
    setProfile(null);
    setStatus('signed-out');
    setSync(EMPTY_SYNC);
    // Pending writes stay queued: they belong to the account and will flush on
    // the next sign-in on this device.
    return { ok: true };
  }, [requireClient]);

  const resetPassword = useCallback(
    async (email: string): Promise<ActionResult> => {
      const activeClient = requireClient();
      if (!activeClient) return { ok: false, code: 'unknown' };
      const result = await sendPasswordReset(activeClient, email, authRedirectUrl('/profile'));
      return result.ok ? { ok: true } : { ok: false, code: result.code };
    },
    [requireClient],
  );

  const changePassword = useCallback(
    async (password: string): Promise<ActionResult> => {
      const activeClient = requireClient();
      if (!activeClient) return { ok: false, code: 'unknown' };
      const result = await updatePasswordRequest(activeClient, password);
      return result.ok ? { ok: true } : { ok: false, code: result.code };
    },
    [requireClient],
  );

  const resendVerification = useCallback(
    async (email: string): Promise<ActionResult> => {
      const activeClient = requireClient();
      if (!activeClient) return { ok: false, code: 'unknown' };
      const result = await resendConfirmation(activeClient, email, authRedirectUrl('/profile'));
      return result.ok ? { ok: true } : { ok: false, code: result.code };
    },
    [requireClient],
  );

  const refreshProfile = useCallback(async () => {
    const activeClient = requireClient();
    if (!activeClient || !user) return;
    try {
      const row = await profileRepo(activeClient).get(user.id);
      if (mountedRef.current) setProfile(row);
    } catch {
      /* keep the previous profile; the UI shows the last known values */
    }
  }, [requireClient, user]);

  const updateProfile = useCallback(
    async (patch: Partial<ProfileRow>): Promise<ActionResult> => {
      const activeClient = requireClient();
      if (!activeClient || !user) return { ok: false, code: 'session-missing' };
      try {
        const updated = await profileRepo(activeClient).update(user.id, patch);
        if (mountedRef.current && updated) setProfile(updated);
        return { ok: true };
      } catch (error) {
        const mapped = toRepositoryError(error);
        return {
          ok: false,
          code: mapped.code === 'unauthorised' ? 'session-missing' : 'unknown',
        };
      }
    },
    [requireClient, user],
  );

  const importLocalThread = useCallback(async (): Promise<LegacyImportResult | { status: 'unavailable' }> => {
    const activeClient = requireClient();
    if (!activeClient || !user) return { status: 'unavailable' };

    const conversations = conversationRepo(activeClient);
    const messages = messageRepo(activeClient);

    const deps = createBrowserDeps({
      storage: store,
      async ensureConversation({ id, title, lastMessageAt }) {
        const existing = await conversations.get(id);
        if (existing) {
          if (existing.title !== title) await conversations.update(id, { title });
          return;
        }
        // Insert with the client-generated id so retries are idempotent.
        const { error } = await activeClient.from('conversations').insert({
          id,
          user_id: user.id,
          title,
          last_message_at: lastMessageAt,
        });
        if (error && !/duplicate key/i.test(error.message)) throw toRepositoryError(error);
      },
      async insertMessages(conversationId, list) {
        // Skip messages that already exist (retry after a partial failure).
        const written = await messages.countForConversation(conversationId);
        if (written >= list.length) return;
        for (const message of list.slice(written)) {
          await messages.create(user.id, {
            conversationId,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          });
        }
      },
      countMessages: (conversationId) => messages.countForConversation(conversationId),
    });

    const result = await importLegacyThread(deps);
    setMigration(readMarker());
    setLocalThreadMessages(localThreadCount(store));
    void flush();
    return result;
  }, [flush, readMarker, requireClient, store, user]);

  const removeLocalThread = useCallback(() => {
    try {
      store.removeItem(LEGACY_THREAD_KEY);
    } catch {
      /* storage blocked: nothing to remove */
    }
    setLocalThreadMessages(localThreadCount(store));
  }, [store]);

  const exportData = useCallback(async (): Promise<ActionResult<WorkspaceExport>> => {
    const activeClient = requireClient();
    if (!activeClient || !user) return { ok: false, code: 'session-missing' };
    try {
      return { ok: true, value: await exportWorkspace(activeClient, user.id) };
    } catch {
      return { ok: false, code: 'unknown' };
    }
  }, [requireClient, user]);

  const deleteAllData = useCallback(async (): Promise<ActionResult> => {
    const activeClient = requireClient();
    if (!activeClient || !user) return { ok: false, code: 'session-missing' };
    try {
      await deleteMyWorkspaceData(activeClient);
      outbox.clear();
      setSync((current) => ({ ...current, pending: 0 }));
      return { ok: true };
    } catch {
      return { ok: false, code: 'unknown' };
    }
  }, [outbox, requireClient, user]);

  const syncNow = useCallback(async () => {
    await flush();
  }, [flush]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      client,
      config,
      reason: config && !config.enabled ? config.reason : null,
      user,
      profile,
      sync,
      localThreadMessages,
      migration,
      signIn,
      signUp,
      signOut,
      resetPassword,
      changePassword,
      resendVerification,
      updateProfile,
      refreshProfile,
      retryConnection,
      syncNow,
      importLocalThread,
      removeLocalThread,
      exportData,
      deleteAllData,
    }),
    [
      status,
      client,
      config,
      user,
      profile,
      sync,
      localThreadMessages,
      migration,
      signIn,
      signUp,
      signOut,
      resetPassword,
      changePassword,
      resendVerification,
      updateProfile,
      refreshProfile,
      retryConnection,
      syncNow,
      importLocalThread,
      removeLocalThread,
      exportData,
      deleteAllData,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Convenience for components that only care whether they may show data. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
