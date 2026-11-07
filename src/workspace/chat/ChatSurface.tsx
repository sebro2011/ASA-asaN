/**
 * NOVA Chat surface (Phase 3D-1).
 *
 * Conversations live in Supabase; the reply transport is the existing
 * `POST /api/nova/chat` handler, unchanged. Signed-in only, by decision: the
 * route is wrapped in `RequireAuth`, so every write has a real owner and RLS
 * does the enforcement.
 *
 * Honesty notes:
 *  - the reply is revealed with a typewriter effect, not streamed; nothing in
 *    the UI claims otherwise;
 *  - a message that could not be persisted is marked "not saved" instead of
 *    silently pretending it was.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Link, navigate, useRoute } from '../../app/router';
import { useProviderConfig } from '../useProviderConfig';
import {
  chatErrorKey,
  describeChatFailure,
  describeFallbackChain,
  historyWindow,
  sendChat,
  type ChatProvider,
  type ChatTurn,
} from './chatClient';
import { useConversations, useThread } from './useChatData';
import { takePrompt } from './pendingPrompt';
import MessageBody from './MessageBody';
import { displayModelName } from '../../lib/modelLabels';
import NovaOrb from '../home/NovaOrb';

/** Literal keys, so the shell test can verify all three languages. */
function providerLabel(provider: ChatProvider, t: (key: string) => string): string {
  switch (provider) {
    case 'arena':
      return t('wsChatProvider_arena');
    case 'openrouter':
      return t('wsChatProvider_openrouter');
    case 'gemini':
      return t('wsChatProvider_gemini');
    case 'local':
      return t('wsChatProvider_local');
    default:
      return t('wsChatProvider_auto');
  }
}

/** Same four prompts as the dashboard, so the two surfaces teach one language. */
const SUGGESTIONS = ['wsHomeSuggestion1', 'wsHomeSuggestion2', 'wsHomeSuggestion3', 'wsHomeSuggestion4'];

function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return locale.startsWith('si') ? 'දැන්' : locale.startsWith('ta') ? 'இப்போது' : 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function useTypewriter(text: string, enabled: boolean) {
  const [shown, setShown] = useState(enabled ? '' : text);
  const [done, setDone] = useState(!enabled);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setShown(text);
      setDone(true);
      return;
    }
    setShown('');
    setDone(false);
    let index = 0;
    const step = Math.max(1, Math.round(text.length / 140));
    timer.current = window.setInterval(() => {
      index = Math.min(text.length, index + step);
      setShown(text.slice(0, index));
      if (index >= text.length) {
        if (timer.current) {
          window.clearInterval(timer.current);
          timer.current = null;
        }
        setDone(true);
      }
    }, 16);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [text, enabled]);

  return { shown, done };
}

export default function ChatSurface() {
  const { t, i18n } = useTranslation();
  const route = useRoute();
  const { client, user, profile } = useAuth();
  const { providers } = useProviderConfig();
  const userId = user?.id ?? null;
  const conversationId = route.id ?? null;

  const conversations = useConversations(client, userId);
  const thread = useThread(client, userId, conversationId);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showList, setShowList] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [provider, setProvider] = useState<ChatProvider>(
    (profile?.preferred_provider as ChatProvider | undefined) ?? 'auto',
  );
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const copyTimer = useRef<number | null>(null);

  const locale = i18n.language || 'en';
  const active = conversations.items.find((row) => row.id === conversationId) ?? null;

  const available: ChatProvider[] = useMemo(() => {
    const list: ChatProvider[] = ['auto'];
    if (providers?.arena) list.push('arena');
    if (providers?.openrouter) list.push('openrouter');
    if (providers?.gemini) list.push('gemini');
    if (providers?.local) list.push('local');
    return list;
  }, [providers]);

  useEffect(() => {
    if (!available.includes(provider)) setProvider('auto');
  }, [available, provider]);

  const visible = conversations.items.filter((row) =>
    showArchived
      ? row.archived
      : !row.archived && (!filter || row.title.toLowerCase().includes(filter.toLowerCase())),
  );
  const archivedCount = conversations.items.filter((row) => row.archived).length;

  const lastAssistant = [...thread.messages].reverse().find((row) => row.role === 'assistant');

  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  /** Copy a bubble. Falls back to a hidden textarea when the API is blocked. */
  const copyMessage = useCallback(async (row: { id: string; content: string }) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(row.content);
      } else {
        const area = document.createElement('textarea');
        area.value = row.content;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      setCopiedId(row.id);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(null), 2_000);
    } catch {
      /* clipboard blocked — better silence than a false "copied" */
    }
  }, []);

  /**
   * Ask the unchanged `/api/nova/chat` handler for a reply and record it.
   * The request carries an AbortSignal so Stop can end it immediately.
   */
  const requestReply = useCallback(
    async (history: ChatTurn[], targetId: string | null) => {
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await sendChat({
        messages: history,
        lang: locale.slice(0, 2),
        provider,
        signal: controller.signal,
      });
      abortRef.current = null;

      if (!result.ok && result.code === 'ABORTED') {
        // Nothing failed, so nothing is reported as an error: the transcript just
        // records that the answer was stopped.
        await thread.append({
          role: 'assistant',
          content: t('wsChatStopped'),
          conversationId: targetId ?? undefined,
        });
        setSending(false);
        return;
      }

      if (result.ok) {
        // An offline answer must say so in the transcript, and the server says why
        // every online provider was skipped. Both survive a reload.
        const chain = describeFallbackChain(result.reply.fallbackChain);
        const offlineNote = result.reply.fallback
          ? [t('wsChatOfflineNote'), chain].filter(Boolean).join(' — ')
          : '';
        const saved = await thread.append({
          role: 'assistant',
          content: offlineNote ? `${result.reply.text}\n\n${offlineNote}` : result.reply.text,
          provider: result.reply.provider,
          model: result.reply.model,
          conversationId: targetId ?? undefined,
        });
        setRevealingId(saved.row.id);
      } else {
        // Keep the cause on the bubble: provider, code and HTTP status, no secrets.
        const detail = describeChatFailure(result);
        const saved = await thread.append({
          role: 'assistant',
          content: detail ? `${t(chatErrorKey(result.code))}\n${detail}` : t(chatErrorKey(result.code)),
          isError: true,
          conversationId: targetId ?? undefined,
        });
        thread.markUnsaved(saved.row.id);
      }
      void conversations.reload();
      setSending(false);
    },
    [locale, provider, t, thread, conversations],
  );

  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? draft).trim();
      if (!text || sending) return;
      setSending(true);
      setDraft('');
      setShowList(false);

      let targetId = conversationId;
      try {
        if (!targetId) {
          const title = text.replace(/\s+/g, ' ').slice(0, 60);
          const created = await conversations.create(title);
          targetId = created.id;
          navigate(`/chat/${created.id}`);
        }
      } catch {
        setSending(false);
        return;
      }

      await thread.append({ role: 'user', content: text, conversationId: targetId });

      const history: ChatTurn[] = historyWindow([
        ...thread.messages.map((row) => ({ role: row.role, content: row.content })),
        { role: 'user' as const, content: text },
      ]);

      await requestReply(history, targetId);
    },
    [draft, sending, conversationId, conversations, thread, requestReply],
  );

  /**
   * Regenerate: the superseded answer is deleted and asked again from the same
   * transcript, so history stays linear instead of stacking two replies.
   */
  const regenerate = useCallback(async () => {
    if (sending || !conversationId) return;
    const rows = thread.messages;
    const lastUser = [...rows].reverse().find((row) => row.role === 'user');
    if (!lastUser) return;
    const lastReply = [...rows].reverse().find((row) => row.role === 'assistant');
    if (lastReply) await thread.remove(lastReply.id);
    setSending(true);
    const history: ChatTurn[] = historyWindow(
      rows
        .filter((row) => row.id !== lastReply?.id)
        .map((row) => ({ role: row.role, content: row.content })),
    );
    await requestReply(history, conversationId);
  }, [sending, conversationId, thread, requestReply]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * A prompt typed on Home is handed over through sessionStorage. It is consumed
   * exactly once, and only after the conversation list has loaded, so "New chat"
   * is created by the same code path as a typed message.
   */
  useEffect(() => {
    if (pendingRef.current || conversationId) return;
    if (conversations.state !== 'ready') return;
    pendingRef.current = true;
    const pending = takePrompt();
    if (pending) void send(pending);
  }, [conversationId, conversations.state, send]);

  const reveal = useTypewriter(
    revealingId && lastAssistant?.id === revealingId ? lastAssistant.content : '',
    Boolean(revealingId && lastAssistant?.id === revealingId),
  );

  // Once the reveal finishes, hand the message to the markdown renderer.
  useEffect(() => {
    if (revealingId && reveal.done) setRevealingId(null);
  }, [revealingId, reveal.done]);

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* Conversation list */}
      <aside
        className={`${showList ? 'flex' : 'hidden'} nova-glass-strong w-full shrink-0 flex-col gap-3 rounded-[22px] p-3 md:flex md:w-[288px]`}
        aria-label={t('wsChatListTitle')}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="nova-btn nova-btn--primary flex-1 justify-center"
          >
            <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            {t('wsChatNew')}
          </button>
        </div>

        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('wsChatFilterPlaceholder')}
          aria-label={t('wsChatFilterPlaceholder')}
          className="nova-field"
        />

        <div className="flex items-center justify-between gap-2 text-[11px] text-ws-text-3">
          <span>{showArchived ? t('wsChatArchivedToggle') : t('wsChatListTitle')}</span>
          <button
            type="button"
            onClick={() => setShowArchived((value) => !value)}
            className="nova-link text-[11px]"
            aria-pressed={showArchived}
          >
            {showArchived ? t('wsChatListTitle') : `${t('wsChatArchivedToggle')}${archivedCount ? ` (${archivedCount})` : ''}`}
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          role="region"
          aria-label={t('wsChatListTitle')}
          tabIndex={0}
        >
          {conversations.state === 'loading' && conversations.items.length === 0 ? (
            <p className="p-2 text-[12px] text-ws-text-3">{t('wsChatLoading')}</p>
          ) : null}

          {conversations.state === 'error' ? (
            <div className="nova-card p-3 text-[12px] text-ws-text-2">
              <p>{t('wsChatListError')}</p>
              <button type="button" onClick={() => void conversations.reload()} className="nova-link mt-2">
                {t('wsChatRetry')}
              </button>
            </div>
          ) : null}

          {visible.length === 0 && conversations.state === 'ready' ? (
            <p className="p-2 text-[12px] leading-relaxed text-ws-text-3">
              {showArchived ? t('wsChatEmptyArchive') : t('wsChatEmptyList')}
            </p>
          ) : null}

          <ul className="flex flex-col gap-1">
            {visible.map((row) => {
              const isActive = row.id === conversationId;
              return (
                <li key={row.id}>
                  <div
                    className={`nova-nav-item group flex items-center gap-1.5 ${isActive ? 'nova-nav-item--active' : ''}`}
                  >
                    {renaming === row.id ? (
                      <form
                        className="flex flex-1 items-center gap-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void conversations.rename(row.id, renameDraft);
                          setRenaming(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          aria-label={t('wsChatRename')}
                          className="nova-field h-7 flex-1 text-[12px]"
                        />
                        <button type="submit" aria-label={t('wsChatSave')} className="nova-icon-btn h-6 w-6">
                          <Check size={13} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={t('wsChatCancel')}
                          onClick={() => setRenaming(null)}
                          className="nova-icon-btn h-6 w-6"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <Link
                          to={`/chat/${row.id}`}
                          className="min-w-0 flex-1"
                          onClick={() => setShowList(false)}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {row.pinned ? (
                              <Pin size={11} className="shrink-0 text-ws-accent-ink" aria-hidden="true" />
                            ) : null}
                            <span className="truncate text-[12.5px]">{row.title}</span>
                          </span>
                          <span className="mt-0.5 block text-[10.5px] text-ws-text-3">
                            {relativeTime(row.last_message_at ?? row.updated_at, locale)}
                          </span>
                        </Link>

                        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
                          <button
                            type="button"
                            className="nova-icon-btn h-6 w-6"
                            aria-label={row.pinned ? t('wsChatUnpin') : t('wsChatPin')}
                            onClick={() => void conversations.setPinned(row.id, !row.pinned)}
                          >
                            {row.pinned ? <PinOff size={12} aria-hidden="true" /> : <Pin size={12} aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            className="nova-icon-btn h-6 w-6"
                            aria-label={t('wsChatRename')}
                            onClick={() => {
                              setRenaming(row.id);
                              setRenameDraft(row.title);
                            }}
                          >
                            <Pencil size={12} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="nova-icon-btn h-6 w-6"
                            aria-label={showArchived ? t('wsChatUnarchive') : t('wsChatArchive')}
                            onClick={() => void conversations.setArchived(row.id, !row.archived)}
                          >
                            {showArchived ? (
                              <ArchiveRestore size={12} aria-hidden="true" />
                            ) : (
                              <Archive size={12} aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="nova-icon-btn h-6 w-6"
                            aria-label={t('wsChatDelete')}
                            onClick={() => {
                              void conversations.remove(row.id);
                              if (row.id === conversationId) navigate('/chat');
                            }}
                          >
                            <Trash2 size={12} aria-hidden="true" />
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Thread */}
      <section className="flex min-w-0 flex-1 flex-col gap-3" aria-label={t('wsChatTitle')}>
        <div className="flex items-center gap-2 md:hidden">
          <button type="button" className="nova-btn nova-btn--ghost" onClick={() => setShowList((value) => !value)}>
            {t('wsChatListTitle')}
          </button>
        </div>

        {active ? (
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-[15px] font-semibold text-ws-text">{active.title}</h1>
            {active.archived ? <span className="nova-chip">{t('wsChatArchivedChip')}</span> : null}
          </div>
        ) : (
          <h1 className="text-[15px] font-semibold text-ws-text">{t('wsChatNew')}</h1>
        )}

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl"
          role="region"
          aria-label={t('wsChatThreadRegion')}
          tabIndex={0}
        >
          {!conversationId || thread.messages.length === 0 ? (
            <div className="nova-hero-wash flex h-full flex-col items-center justify-center rounded-[22px] border border-ws-line px-5 py-10 text-center">
              <NovaOrb state={sending ? 'generating' : 'idle'} size={96} />
              <p className="mt-5 text-[21px] font-semibold tracking-[-0.02em] text-ws-text">
                {t('wsChatEmptyThread')}
              </p>
              <p className="mt-2 max-w-[34rem] text-[13px] leading-relaxed text-ws-text-2">
                {t('wsChatEmptyThreadBody')}
              </p>
              <div className="mt-5 flex max-w-[38rem] flex-wrap items-center justify-center gap-2">
                {SUGGESTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="nova-chip-glass"
                    onClick={() => {
                      setDraft(t(key));
                      document.getElementById('nova-chat-composer')?.focus();
                    }}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-3 p-1">
              {thread.messages.map((row) => {
                const isUser = row.role === 'user';
                const isRevealing = row.id === revealingId && row.id === lastAssistant?.id;
                return (
                  <li
                    key={row.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    data-role={row.role}
                  >
                    <div
                      className={`max-w-[min(46rem,92%)] rounded-[18px] border px-3.5 py-2.5 shadow-[var(--ws-shadow-1)] ${
                        row.is_error
                          ? 'border-[color-mix(in_srgb,var(--color-ws-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-ws-danger)_10%,transparent)]'
                          : isUser
                            ? 'border-[color-mix(in_srgb,var(--color-ws-accent)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-ws-accent)_12%,transparent)]'
                            : 'nova-card'
                      }`}
                    >
                      {row.is_error ? (
                        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ws-text">
                          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                          <span className="whitespace-pre-line">{row.content}</span>
                        </p>
                      ) : isUser ? (
                        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ws-text">{row.content}</p>
                      ) : isRevealing ? (
                        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ws-text">{reveal.shown}</p>
                      ) : (
                        <MessageBody content={row.content} />
                      )}

                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px] text-ws-text-3">
                        {!isUser && row.provider ? <span>{row.provider}</span> : null}
                        {!isUser && displayModelName(row.model) ? (
                          <span>· {displayModelName(row.model)}</span>
                        ) : null}
                        {thread.unsaved.includes(row.id) ? (
                          <span className="text-[color:var(--color-ws-danger)]">· {t('wsChatNotSaved')}</span>
                        ) : null}
                        {!isUser && !row.is_error ? (
                          <span className="ml-auto flex items-center gap-0.5">
                            <button
                              type="button"
                              className="nova-icon-btn h-6 w-6"
                              aria-label={t('wsChatCopy')}
                              title={t('wsChatCopy')}
                              onClick={() => void copyMessage(row)}
                            >
                              {copiedId === row.id ? (
                                <Check size={12} aria-hidden="true" />
                              ) : (
                                <Copy size={12} aria-hidden="true" />
                              )}
                            </button>
                            {row.id === lastAssistant?.id && !sending ? (
                              <button
                                type="button"
                                className="nova-icon-btn h-6 w-6"
                                aria-label={t('wsChatRegenerate')}
                                title={t('wsChatRegenerate')}
                                onClick={() => void regenerate()}
                              >
                                <RefreshCw size={12} aria-hidden="true" />
                              </button>
                            ) : null}
                            <span className="sr-only" aria-live="polite">
                              {copiedId === row.id ? t('wsChatCopied') : ''}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
              {sending ? (
                <li className="text-[11.5px] text-ws-text-3" role="status">
                  {t('wsChatSending')}
                </li>
              ) : null}
            </ul>
          )}
        </div>

        <form
          className="nova-composer flex flex-col gap-2 p-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="nova-chat-composer">
            {t('wsChatComposerLabel')}
          </label>
          <textarea
            id="nova-chat-composer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={t('wsChatComposerPlaceholder')}
            className="nova-field min-h-[3.25rem] resize-y border-0 bg-transparent"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-ws-text-3">
              <span>{t('wsChatProvider')}</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as ChatProvider)}
                className="nova-field h-7 py-0 text-[11.5px]"
              >
                {available.map((item) => (
                  <option key={item} value={item}>
                    {providerLabel(item, t)}
                  </option>
                ))}
              </select>
            </label>

            {sending ? (
              <button
                type="button"
                onClick={stop}
                className="nova-btn nova-btn--secondary justify-center"
                aria-label={t('wsChatStop')}
              >
                <Square size={11} strokeWidth={2.6} aria-hidden="true" />
                {t('wsChatStop')}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="nova-btn nova-btn--primary justify-center disabled:opacity-50"
              >
                <Send size={13} strokeWidth={2.2} aria-hidden="true" />
                {t('wsChatSend')}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
