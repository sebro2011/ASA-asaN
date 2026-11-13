/**
 * NOVA Chat surface — the astronomy-focused AI workspace.
 *
 * Layout, left to right: a conversation rail (search, filter, pin/archive) and
 * the thread itself, with a sticky head, the transcript, and a floating composer
 * whose toolbar carries the provider and the five-level thinking ladder
 * (auto → flash → flash thinking → thinking → deep thinking).
 *
 * Astronomy is a first-class part of the surface, not a garnish: the empty state
 * offers four grounded space-science starters, and each one pre-selects the
 * thinking level that suits it. The starters ask for reasoning, named sources
 * and explicit uncertainty; none of them asks NOVA to pretend it has live
 * telemetry.
 *
 * Honesty notes (unchanged from Phase 3D-1):
 *  - a reply is revealed with a typewriter effect, not streamed;
 *  - a message that could not be persisted is marked "not saved";
 *  - the model and provider that actually answered are recorded on the bubble.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Aperture,
  Archive,
  ArchiveRestore,
  ArrowUp,
  Brain,
  Check,
  Copy,
  Leaf,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Pin,
  FlaskConical,
  PinOff,
  RefreshCw,
  Rocket,
  Search,
  Square,
  Target,
  Telescope,
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
import { isChatLocalOnly } from './chatStorage';
import { takePrompt, takeThinking } from './pendingPrompt';
import MessageBody from './MessageBody';
import ThinkingMenu from './ThinkingMenu';
import {
  isThinkingLevel,
  unavailableThinkingLevels,
  readThinkingPreference,
  thinkingMeta,
  writeThinkingPreference,
  type ThinkingLevel,
} from './thinking';
import { DEEP_SCIENCE_PROMPT, SCIENCE_PROMPTS, type SciencePromptId } from './sciencePrompts';
import { displayModelName } from '../../lib/modelLabels';
import NovaOrb from '../home/NovaOrb';
import ForgeSurface from '../../features/hypothesis-forge/ForgeSurface';

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

function ScienceIcon({ id, size = 16 }: { id: SciencePromptId | 'deep'; size?: number }) {
  const props = { size, strokeWidth: 1.8, 'aria-hidden': true } as const;
  switch (id) {
    case 'mission':
      return <Rocket {...props} />;
    case 'sky':
      return <Telescope {...props} />;
    case 'neo':
      return <Target {...props} />;
    case 'earth':
      return <Leaf {...props} />;
    default:
      return <Brain {...props} />;
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
  const { client, user, profile, status: authStatus } = useAuth();
  const { providers, thinking: thinkingCatalogue } = useProviderConfig();
  const userId = user?.id ?? null;
  const conversationId = route.id ?? null;

  const conversations = useConversations(client, userId);
  const thread = useThread(client, userId, conversationId);

  // Two modes share one NOVA assistant: the conversational astronomy chat and
  // the evidence-based investigation workspace. Neither replaces the other.
  const [mode, setMode] = useState<'chat' | 'forge'>('chat');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showList, setShowList] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  // Read once per mount: the rail says where threads live, and it must not
  // claim they sync when the reader has asked for device-only.
  const [localOnly] = useState(isChatLocalOnly);
  const [provider, setProvider] = useState<ChatProvider>(
    (profile?.preferred_provider as ChatProvider | undefined) ?? 'auto',
  );
  const [thinking, setThinking] = useState<ThinkingLevel>(readThinkingPreference);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [apodState, setApodState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [apodNotice, setApodNotice] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const copyTimer = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

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

  const unavailable = useMemo(
    () => unavailableThinkingLevels(thinkingCatalogue?.levels),
    [thinkingCatalogue],
  );

  useEffect(() => {
    if (!available.includes(provider)) setProvider('auto');
  }, [available, provider]);

  useEffect(() => {
    if (unavailable.includes(thinking)) setThinking('auto');
  }, [unavailable, thinking]);

  useEffect(() => {
    writeThinkingPreference(thinking);
  }, [thinking]);

  const visible = conversations.items.filter((row) =>
    showArchived
      ? row.archived
      : !row.archived && (!filter || row.title.toLowerCase().includes(filter.toLowerCase())),
  );
  const archivedCount = conversations.items.filter((row) => row.archived).length;

  const lastAssistant = [...thread.messages].reverse().find((row) => row.role === 'assistant');
  const currentThinking = thinkingMeta(thinking);

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
   * Ask `/api/nova/chat` for a reply and record it. The request carries the
   * chosen thinking level, the provider and an AbortSignal so Stop can end it
   * immediately.
   */
  const requestReply = useCallback(
    async (history: ChatTurn[], targetId: string | null, level: ThinkingLevel) => {
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await sendChat({
        messages: history,
        lang: locale.slice(0, 2),
        provider,
        thinking: level,
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
    async (override?: string, levelOverride?: ThinkingLevel) => {
      const text = (override ?? draft).trim();
      if (!text || sending) return;
      const requested = levelOverride ?? thinking;
      const level: ThinkingLevel = unavailable.includes(requested) ? 'auto' : requested;
      if (levelOverride && level !== thinking) setThinking(level);
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

      await requestReply(history, targetId, level);
    },
    [draft, sending, thinking, unavailable, conversationId, conversations, thread, requestReply],
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
    await requestReply(history, conversationId, thinking);
  }, [sending, conversationId, thread, requestReply, thinking]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Put a prompt (and its level) into the composer, ready to edit. */
  const seedPrompt = useCallback((text: string, level: ThinkingLevel) => {
    setDraft(text);
    setThinking(level);
    setShowList(false);
    const composer = composerRef.current ?? document.getElementById('nova-chat-composer');
    (composer as HTMLTextAreaElement | null)?.focus();
  }, []);

  /** A science starter seeds the composer and pre-selects its level. */
  const applySciencePrompt = useCallback(
    (promptKey: string, level: ThinkingLevel) => seedPrompt(t(promptKey), level),
    [seedPrompt, t],
  );

  /**
   * Ground a question in real data: fetch today's NASA APOD and put its own
   * caption into the prompt. The caption is quoted verbatim and labelled, and a
   * cached reference entry is announced rather than passed off as live.
   */
  const groundWithApod = useCallback(async () => {
    if (apodState === 'loading') return;
    setApodState('loading');
    setApodNotice('');
    try {
      const response = await fetch('/api/apod', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('apod-unavailable');
      const payload = (await response.json()) as {
        data?: { title?: unknown; date?: unknown; explanation?: unknown };
        isFallback?: unknown;
      };
      const title = typeof payload?.data?.title === 'string' ? payload.data.title : '';
      if (!title) throw new Error('apod-empty');
      const explanation = typeof payload?.data?.explanation === 'string'
        ? payload.data.explanation.replace(/\s+/g, ' ').trim().slice(0, 700)
        : '';
      const date = typeof payload?.data?.date === 'string' ? payload.data.date.slice(0, 10) : '';
      seedPrompt(
        t('wsScienceApodPrompt', {
          title: title.slice(0, 160),
          date,
          explanation,
          interpolation: { escapeValue: false },
        }),
        'thinking',
      );
      setApodState('idle');
      if (payload?.isFallback === true) setApodNotice(t('wsScienceApodFallback'));
    } catch {
      setApodState('error');
    }
  }, [apodState, seedPrompt, t]);

  /**
   * A prompt typed on Home is handed over through sessionStorage. It is consumed
   * exactly once, and only after the conversation list has loaded, so "New chat"
   * is created by the same code path as a typed message.
   */
  useEffect(() => {
    if (pendingRef.current || conversationId) return;
    if (authStatus === 'loading') return;
    if (conversations.state !== 'ready') return;
    pendingRef.current = true;
    const pending = takePrompt();
    const pendingLevel = takeThinking();
    if (pending) {
      void send(pending, isThinkingLevel(pendingLevel) ? pendingLevel : undefined);
    }
  }, [authStatus, conversationId, conversations.state, send]);

  const reveal = useTypewriter(
    revealingId && lastAssistant?.id === revealingId ? lastAssistant.content : '',
    Boolean(revealingId && lastAssistant?.id === revealingId),
  );

  // Once the reveal finishes, hand the message to the markdown renderer.
  useEffect(() => {
    if (revealingId && reveal.done) setRevealingId(null);
  }, [revealingId, reveal.done]);

  // The session state decides where conversations live (cloud vs. device), so
  // the surface waits one tick rather than briefly reading the wrong store.
  if (authStatus === 'loading') {
    return (
      <div className="nova-chat-shell">
        <div className="nova-card m-auto p-5 text-[12.5px] text-ws-text-3" role="status">
          {t('wsChatLoading')}
        </div>
      </div>
    );
  }

  if (mode === 'forge') {
    return (
      <div className="nova-chat-shell nova-chat-shell--forge">
        <section className="nova-chat-main" aria-label={t('hfTitle')}>
          <ForgeSurface onExitToChat={() => setMode('chat')} />
        </section>
      </div>
    );
  }

  return (
    <div className="nova-chat-shell">
      {/* ------------------------------------------------------ conversation rail */}
      <aside
        className={`nova-chat-rail ${showList ? 'flex' : 'hidden'} md:flex`}
        aria-label={t('wsChatListTitle')}
      >
        <div className="nova-chat-rail__head">
          <p className="nova-chat-rail__title">{t('wsChatListTitle')}</p>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="nova-btn nova-btn--primary nova-chat-rail__new"
          >
            <MessageSquarePlus size={14} strokeWidth={2.1} aria-hidden="true" />
            {t('wsChatNew')}
          </button>
        </div>

        {authStatus !== 'signed-in' || localOnly ? (
          <div className="nova-chat-guest">
            <p className="nova-chat-guest__title">{t('wsChatGuestTitle')}</p>
            <p className="nova-chat-guest__body">
              {authStatus === 'signed-in' ? t('wsChatLocalOnlyChipBody') : t('wsChatGuestBody')}
            </p>
            {authStatus === 'signed-in' ? (
              <Link to="/settings" className="nova-chat-guest__cta">
                {t('wsSettings')}
              </Link>
            ) : (
              <Link to="/profile" className="nova-chat-guest__cta">
                {t('wsChatGuestCta')}
              </Link>
            )}
          </div>
        ) : null}

        <div className="nova-chat-rail__search">
          <Search size={13} strokeWidth={1.9} aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('wsChatFilterPlaceholder')}
            aria-label={t('wsChatFilterPlaceholder')}
            className="nova-chat-rail__input"
          />
        </div>

        <div className="nova-chat-rail__tabs" role="group" aria-label={t('wsChatListTitle')}>
          <button
            type="button"
            className={`nova-chat-rail__tab ${showArchived ? '' : 'nova-chat-rail__tab--active'}`}
            aria-pressed={!showArchived}
            onClick={() => setShowArchived(false)}
          >
            {t('wsChatListTitle')}
          </button>
          <button
            type="button"
            className={`nova-chat-rail__tab ${showArchived ? 'nova-chat-rail__tab--active' : ''}`}
            aria-pressed={showArchived}
            onClick={() => setShowArchived(true)}
          >
            {t('wsChatArchivedToggle')}
            {archivedCount ? <span className="nova-chat-rail__count">{archivedCount}</span> : null}
          </button>
        </div>

        <div
          className="nova-chat-rail__scroll overflow-y-auto"
          role="region"
          aria-label={t('wsChatListTitle')}
          tabIndex={0}
        >
          {conversations.state === 'loading' && conversations.items.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-ws-text-3">{t('wsChatLoading')}</p>
          ) : null}

          {conversations.state === 'error' ? (
            <div className="nova-card m-1 p-3 text-[12px] text-ws-text-2">
              <p>{t('wsChatListError')}</p>
              <button type="button" onClick={() => void conversations.reload()} className="nova-link mt-2">
                {t('wsChatRetry')}
              </button>
            </div>
          ) : null}

          {visible.length === 0 && conversations.state === 'ready' ? (
            <p className="px-2 py-1.5 text-[12px] leading-relaxed text-ws-text-3">
              {showArchived ? t('wsChatEmptyArchive') : t('wsChatEmptyList')}
            </p>
          ) : null}

          <ul className="nova-chat-rail__list">
            {visible.map((row) => {
              const isActive = row.id === conversationId;
              return (
                <li key={row.id}>
                  <div
                    className={`nova-chat-rail__item group ${isActive ? 'nova-chat-rail__item--active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
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
                          className="nova-chat-rail__link"
                          onClick={() => setShowList(false)}
                        >
                          <span className="nova-chat-rail__link-title">
                            {row.pinned ? (
                              <Pin size={11} className="shrink-0 text-ws-accent-ink" aria-hidden="true" />
                            ) : null}
                            <span className="truncate">{row.title}</span>
                          </span>
                          <span className="nova-chat-rail__link-time">
                            {relativeTime(row.last_message_at ?? row.updated_at, locale)}
                          </span>
                        </Link>

                        <span className="nova-chat-rail__actions">
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

      {/* --------------------------------------------------------------- thread */}
      <section className="nova-chat-main" aria-label={t('wsChatTitle')}>
        <header className="nova-chat-head">
          <button
            type="button"
            className="nova-btn nova-btn--ghost nova-chat-head__list md:hidden"
            onClick={() => setShowList((value) => !value)}
            aria-label={t('wsChatListTitle')}
          >
            <Archive size={14} strokeWidth={1.9} aria-hidden="true" />
            {t('wsChatListTitle')}
          </button>

          <div className="nova-chat-head__titles">
            <h1 className="nova-chat-head__title">
              {active ? active.title : t('wsChatNew')}
              {active?.archived ? <span className="nova-chip ml-2">{t('wsChatArchivedChip')}</span> : null}
              {authStatus !== 'signed-in' ? (
                <span className="nova-chip ml-2">{t('wsChatGuestChip')}</span>
              ) : null}
            </h1>
            <p className="nova-chat-head__sub">
              <span className="nova-chat-head__dot" aria-hidden="true" />
              {t('wsChatTitle')} · {providerLabel(provider, t)}
              <span className="nova-chat-head__sep" aria-hidden="true">/</span>
              {t(currentThinking.labelKey)}
            </p>
          </div>

          <div className="nova-chat-head__actions">
            <button
              type="button"
              className="nova-chat-mode"
              onClick={() => setMode('forge')}
              title={t('hfModeHint')}
              aria-label={t('hfModeHint')}
            >
              <FlaskConical size={14} strokeWidth={1.9} aria-hidden="true" />
              <span className="nova-chat-mode__label">{t('hfModeInvestigate')}</span>
            </button>
            <ThinkingMenu
              value={thinking}
              onChange={setThinking}
              unavailable={unavailable}
              className="nova-thinking--head"
            />
            <button
              type="button"
              className="nova-icon-btn nova-chat-head__new"
              onClick={() => navigate('/chat')}
              aria-label={t('wsChatNew')}
              title={t('wsChatNew')}
            >
              <MessageSquarePlus size={16} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          className="nova-chat-thread overflow-y-auto"
          role="region"
          aria-label={t('wsChatThreadRegion')}
          tabIndex={0}
        >
          {!conversationId || thread.messages.length === 0 ? (
            <div className="nova-chat-empty">
              <div className="nova-chat-empty__orb">
                <NovaOrb state={sending ? 'generating' : 'idle'} size={96} />
              </div>
              <p className="nova-chat-empty__title">{t('wsChatEmptyThread')}</p>
              <p className="nova-chat-empty__body">{t('wsChatEmptyThreadBody')}</p>

              <div className="nova-science-grid">
                {SCIENCE_PROMPTS.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="nova-science-card"
                    onClick={() => applySciencePrompt(card.promptKey, card.thinking)}
                  >
                    <span className="nova-science-card__icon" aria-hidden="true">
                      <ScienceIcon id={card.id} />
                    </span>
                    <span className="nova-science-card__title">{t(card.titleKey)}</span>
                    <span className="nova-science-card__body">{t(card.bodyKey)}</span>
                    <span className="nova-science-card__level">
                      {t(thinkingMeta(card.thinking).labelKey)}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="nova-science-deep"
                onClick={() => applySciencePrompt(DEEP_SCIENCE_PROMPT.promptKey, DEEP_SCIENCE_PROMPT.thinking)}
              >
                <span className="nova-science-deep__icon" aria-hidden="true">
                  <ScienceIcon id="deep" size={17} />
                </span>
                <span className="min-w-0 text-left">
                  <span className="nova-science-deep__title">{t(DEEP_SCIENCE_PROMPT.titleKey)}</span>
                  <span className="nova-science-deep__body">{t(DEEP_SCIENCE_PROMPT.bodyKey)}</span>
                </span>
                <span className="nova-science-deep__level">
                  {t(thinkingMeta(DEEP_SCIENCE_PROMPT.thinking).labelKey)}
                </span>
              </button>

              <div className="nova-ground-row">
                <button
                  type="button"
                  className="nova-ground-btn"
                  onClick={() => void groundWithApod()}
                  aria-busy={apodState === 'loading'}
                  disabled={apodState === 'loading'}
                >
                  <span className="nova-ground-btn__icon" aria-hidden="true">
                    {apodState === 'loading' ? (
                      <Loader2 size={14} strokeWidth={2} className="nova-spin" />
                    ) : (
                      <Aperture size={14} strokeWidth={1.9} />
                    )}
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="nova-ground-btn__title">
                      {apodState === 'loading' ? t('wsScienceApodLoading') : t('wsScienceApodTitle')}
                    </span>
                    <span className="nova-ground-btn__body">{t('wsScienceApodBody')}</span>
                  </span>
                </button>
                {apodState === 'error' ? (
                  <p className="nova-ground-note" role="status">{t('wsScienceApodError')}</p>
                ) : apodNotice ? (
                  <p className="nova-ground-note" role="status">{apodNotice}</p>
                ) : null}
              </div>

              <div className="nova-chat-empty__suggestions">
                {SUGGESTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="nova-chip-glass"
                    onClick={() => {
                      setDraft(t(key));
                      composerRef.current?.focus();
                    }}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="nova-msg-list">
              {thread.messages.map((row) => {
                const isUser = row.role === 'user';
                const isRevealing = row.id === revealingId && row.id === lastAssistant?.id;
                return (
                  <li
                    key={row.id}
                    className={`nova-msg ${isUser ? 'nova-msg--user' : 'nova-msg--assistant'} ${
                      row.is_error ? 'nova-msg--error' : ''
                    }`}
                    data-role={row.role}
                  >
                    <span className="nova-msg__avatar" aria-hidden="true">
                      {isUser ? (
                        <span className="nova-msg__avatar-initial">
                          {(profile?.display_name || user?.email || 'U').slice(0, 1).toUpperCase()}
                        </span>
                      ) : (
                        <span className="nova-msg__avatar-nova">
                          <NovaOrb state={sending && row.id === lastAssistant?.id ? 'generating' : 'idle'} size={26} />
                        </span>
                      )}
                    </span>

                    <div className="nova-msg__body">
                      <div className="nova-msg__bubble">
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
                      </div>

                      <div className="nova-msg__meta">
                        {!isUser && row.provider ? <span>{row.provider}</span> : null}
                        {!isUser && displayModelName(row.model) ? <span>· {displayModelName(row.model)}</span> : null}
                        {thread.unsaved.includes(row.id) ? (
                          <span className="text-[color:var(--color-ws-danger)]">· {t('wsChatNotSaved')}</span>
                        ) : null}
                        {!isUser && !row.is_error ? (
                          <span className="nova-msg__actions">
                            <button
                              type="button"
                              className="nova-icon-btn h-6 w-6"
                              aria-label={t('wsChatCopy')}
                              title={t('wsChatCopy')}
                              onClick={() => void copyMessage(row)}
                            >
                              {copiedId === row.id ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
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
                <li className="nova-msg nova-msg--assistant nova-msg--pending" role="status">
                  <span className="nova-msg__avatar" aria-hidden="true">
                    <span className="nova-msg__avatar-nova">
                      <NovaOrb state="thinking" size={26} />
                    </span>
                  </span>
                  <div className="nova-msg__body">
                    <p className="nova-msg__pending">
                      <span className="nova-msg__dots" aria-hidden="true">
                        <i /><i /><i />
                      </span>
                      {t(currentThinking.statusKey)}
                    </p>
                  </div>
                </li>
              ) : null}
            </ul>
          )}
        </div>

        <form
          className="nova-composer nova-chat-composer"
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
            ref={composerRef}
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
            className="nova-chat-composer__input"
          />
          <div className="nova-chat-composer__bar">
            <div className="nova-chat-composer__controls">
              <label className="nova-chat-composer__provider">
                <span className="sr-only">{t('wsChatProvider')}</span>
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as ChatProvider)}
                  className="nova-chat-composer__select"
                  aria-label={t('wsChatProvider')}
                >
                  {available.map((item) => (
                    <option key={item} value={item}>
                      {providerLabel(item, t)}
                    </option>
                  ))}
                </select>
              </label>

              <ThinkingMenu value={thinking} onChange={setThinking} unavailable={unavailable} />

              <button
                type="button"
                className="nova-composer__tool"
                onClick={() => void groundWithApod()}
                aria-label={t('wsScienceApodTitle')}
                title={t('wsScienceApodBody')}
                aria-busy={apodState === 'loading'}
                disabled={apodState === 'loading'}
              >
                {apodState === 'loading' ? (
                  <Loader2 size={13} strokeWidth={2} aria-hidden="true" className="nova-spin" />
                ) : (
                  <Aperture size={13} strokeWidth={1.9} aria-hidden="true" />
                )}
                <span className="nova-composer__tool-label">{t('wsScienceApodTitle')}</span>
              </button>
            </div>

            <div className="nova-chat-composer__actions">
              <span className="nova-chat-composer__hint">{t('wsChatComposerHint')}</span>
              {sending ? (
                <button
                  type="button"
                  onClick={stop}
                  className="nova-btn nova-btn--secondary nova-chat-composer__stop"
                  aria-label={t('wsChatStop')}
                >
                  <Square size={11} strokeWidth={2.6} aria-hidden="true" />
                  {t('wsChatStop')}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="nova-chat-composer__send"
                  aria-label={t('wsChatSend')}
                  title={t('wsChatSend')}
                >
                  <ArrowUp size={16} strokeWidth={2.4} aria-hidden="true" />
                  <span className="sr-only">{t('wsChatSend')}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
