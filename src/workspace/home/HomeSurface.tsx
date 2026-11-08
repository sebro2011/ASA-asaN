/**
 * NOVA Home — the liquid-glass dashboard.
 *
 * Structure, top to bottom: the orb (stateful, purely decorative to assistive
 * tech), the greeting, a floating glass composer that hands a prompt to `/chat`,
 * prompt suggestions, four quick actions, then the live/system cards.
 *
 * Everything on this page is still truthful: the provider and cloud cards read
 * live state, the quick actions point at routes that exist, and the composer
 * only claims to send text — the deployment has no upload or speech endpoint, so
 * no attachment or microphone button is drawn.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Compass,
  Leaf,
  MessageSquare,
  Rocket,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Telescope,
  UserRound,
} from 'lucide-react';
import { Link, navigate } from '../../app/router';
import ThemeOptions from '../../app/ThemeOptions';
import { NovaMark } from '../../app/Brand';
import { WORKSPACE_NAV } from '../../app/navConfig';
import { onlineProviderNames, useProviderConfig } from '../useProviderConfig';
import { useOptionalAuth } from '../../auth/AuthProvider';
import SyncBadge from '../../auth/SyncBadge';
import NovaOrb, { type OrbState } from './NovaOrb';
import { queuePrompt, queueThinking } from '../chat/pendingPrompt';
import ThinkingMenu from '../chat/ThinkingMenu';
import {
  readThinkingPreference,
  thinkingDepthDots,
  thinkingMeta,
  THINKING_ORDER,
  unavailableThinkingLevels,
  writeThinkingPreference,
  type ThinkingLevel,
} from '../chat/thinking';
import { SCIENCE_PROMPTS } from '../chat/sciencePrompts';

function greetingKey(hour: number): string {
  if (hour < 12) return 'wsGoodMorning';
  if (hour < 18) return 'wsGoodAfternoon';
  return 'wsGoodEvening';
}

/** Prompt suggestions. Plain text, so they can be edited before sending. */
const SUGGESTIONS = ['wsHomeSuggestion1', 'wsHomeSuggestion2', 'wsHomeSuggestion3', 'wsHomeSuggestion4'];

/** Cloud status: unconfigured, signed out, or signed in with live sync state. */
function CloudCard() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const unconfigured = !auth || auth.status === 'unconfigured';
  const signedIn = auth?.status === 'signed-in';

  return (
    <div className="nova-card p-4" aria-labelledby="nova-cloud-heading">
      <div className="flex items-center justify-between gap-3">
        <p id="nova-cloud-heading" className="text-[12.5px] font-medium text-ws-text">
          {t('wsHomeCloudTitle')}
        </p>
        {signedIn ? <SyncBadge compact /> : null}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ws-text-3">
        {unconfigured
          ? t('wsHomeCloudUnconfigured')
          : signedIn
            ? t('wsHomeCloudSignedIn')
            : t('wsHomeCloudSignedOut')}
      </p>
      {!signedIn && !unconfigured ? (
        <Link
          to="/profile"
          className="nova-btn nova-btn--secondary mt-3 w-full justify-center"
          style={{ height: '2rem' }}
        >
          {t('wsAuthSignIn')}
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function ProviderStatus() {
  const { t } = useTranslation();
  const { status, providers } = useProviderConfig();
  const online = onlineProviderNames(providers);

  return (
    <div className="nova-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ws-text">{t('wsAiStatusTitle')}</p>
        <span
          className="nova-chip"
          style={{
            color: online.length ? 'var(--color-ws-success)' : 'var(--color-ws-text-2)',
            borderColor: online.length
              ? 'color-mix(in srgb, var(--color-ws-success) 40%, transparent)'
              : undefined,
          }}
        >
          <span className="nova-dot" aria-hidden="true" />
          {status === 'loading' ? t('wsChecking') : online.length ? `${online.length} online` : t('wsAiNone')}
        </span>
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-ws-text-2" role="status">
        {status === 'loading'
          ? t('wsChecking')
          : online.length
            ? t('wsAiConfigured', { providers: online.join(' · ') })
            : t('wsAiOfflineOnly')}
      </p>

      <ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
        {[
          { id: 'arena', label: 'Arena AI', on: providers?.arena },
          { id: 'openrouter', label: 'OpenRouter', on: providers?.openrouter },
          { id: 'gemini', label: 'Google Gemini', on: providers?.gemini },
          { id: 'local', label: 'NOVA offline engine', on: providers?.local },
        ].map((provider) => (
          <li key={provider.id} className="flex items-center justify-between gap-3 text-[11.5px]">
            <span className="text-ws-text-2">{provider.label}</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ws-text-3">
              <span
                className="nova-dot"
                aria-hidden="true"
                style={{
                  background: provider.on ? 'var(--color-ws-success)' : 'var(--color-ws-line-strong)',
                }}
              />
              {provider.on ? t('wsOn') : t('wsOff')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScienceGlyph({ id, size = 15 }: { id: string; size?: number }) {
  const props = { size, strokeWidth: 1.8, 'aria-hidden': true } as const;
  if (id === 'mission') return <Rocket {...props} />;
  if (id === 'sky') return <Telescope {...props} />;
  if (id === 'neo') return <Target {...props} />;
  if (id === 'earth') return <Leaf {...props} />;
  return <Brain {...props} />;
}

/** The floating glass composer. Sending queues the prompt for `/chat`. */
function HomeComposer({
  onSend,
  thinking,
  onThinkingChange,
  unavailable,
}: {
  onSend: (text: string) => void;
  thinking: ThinkingLevel;
  onThinkingChange: (level: ThinkingLevel) => void;
  unavailable: ThinkingLevel[];
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const canSend = draft.trim().length > 0;

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend(draft.trim());
  }, [canSend, draft, onSend]);

  const applySuggestion = (value: string) => {
    setDraft(value);
    inputRef.current?.focus();
  };

  return (
    <form
      className="nova-composer w-full p-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor="nova-home-prompt">
        {t('wsHomeComposerPlaceholder')}
      </label>
      <textarea
        id="nova-home-prompt"
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={t('wsHomeComposerPlaceholder')}
        className="nova-scroll block max-h-40 min-h-[2.75rem] w-full resize-none bg-transparent px-3 py-2.5 text-[14px] leading-relaxed text-ws-text outline-none placeholder:text-ws-text-3"
      />
      <div className="nova-home-composer__bar">
        <div className="flex min-w-0 items-center gap-2">
          <ThinkingMenu value={thinking} onChange={onThinkingChange} unavailable={unavailable} />
          <span className="nova-home-composer__hint">
            <Sparkles size={11} strokeWidth={1.9} aria-hidden="true" className="text-ws-accent-ink" />
            {t('wsHomeComposerHint')}
          </span>
        </div>
        <button
          type="submit"
          className="nova-btn nova-btn--primary ml-auto"
          disabled={!canSend}
          aria-label={t('wsChatSend')}
        >
          {t('wsChatSend')}
          <Send size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {focused ? t('wsOrbListening') : ''}
      </span>
      <div className="hidden gap-1.5 pt-1.5 sm:flex">
        {SUGGESTIONS.map((key) => (
          <button
            key={key}
            type="button"
            className="nova-chip-glass max-w-full truncate"
            onClick={() => applySuggestion(t(key))}
          >
            {t(key)}
          </button>
        ))}
      </div>
    </form>
  );
}

export default function HomeSurface() {
  const { t } = useTranslation();
  const hour = new Date().getHours();
  const planned = WORKSPACE_NAV.filter((item) => item.status === 'planned');
  const auth = useOptionalAuth();
  const signedIn = auth?.status === 'signed-in';
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [thinking, setThinking] = useState<ThinkingLevel>(readThinkingPreference);
  const { thinking: thinkingCatalogue } = useProviderConfig();
  const unavailable = unavailableThinkingLevels(thinkingCatalogue?.levels);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    writeThinkingPreference(thinking);
  }, [thinking]);

  useEffect(() => {
    if (unavailable.includes(thinking)) setThinking('auto');
  }, [unavailable, thinking]);

  /**
   * Hand the prompt to the chat surface. Guests are welcome: the chat keeps
   * their thread on this device until they sign in.
   */
  const sendPrompt = useCallback(
    (text: string, level: ThinkingLevel = thinking) => {
      if (!queuePrompt(text)) return;
      queueThinking(unavailable.includes(level) ? 'auto' : level);
      setOrbState('thinking');
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      // The orb is left "thinking" just long enough to acknowledge the send.
      resetTimer.current = window.setTimeout(() => setOrbState('idle'), 1_200);
      navigate('/chat');
    },
    [thinking, unavailable],
  );

  const quickActions = [
    { id: 'chat', to: '/chat', icon: MessageSquare, titleKey: 'wsMenuChat', bodyKey: 'wsAreaChatDesc' },
    {
      id: 'explore',
      to: '/explore',
      icon: Compass,
      titleKey: 'wsExploreCardTitle',
      bodyKey: 'wsHomeQuickExploreBody',
    },
    { id: 'settings', to: '/settings', icon: Settings2, titleKey: 'wsSettings', bodyKey: 'wsHomeQuickSettingsBody' },
    { id: 'profile', to: '/profile', icon: UserRound, titleKey: 'wsProfile', bodyKey: 'wsHomeQuickProfileBody' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* ---------------------------------------------------------- hero */}
      <section className="nova-hero-wash relative overflow-hidden rounded-[26px] border border-ws-line">
        <div className="relative flex flex-col items-center px-4 py-8 text-center sm:px-8 sm:py-11">
          <div className="flex items-center gap-2.5">
            <NovaMark size={18} />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ws-text-3">
              AI Workspace
            </span>
          </div>

          <NovaOrb state={orbState} size={148} className="mt-5 sm:mt-6" />

          <h1
            id="nova-home-greeting"
            className="mt-5 text-[27px] font-semibold leading-[1.12] tracking-[-0.03em] text-ws-text sm:text-[36px]"
          >
            {t(greetingKey(hour))} <span aria-hidden="true">✌️</span>
          </h1>
          <p className="mt-2.5 max-w-[34rem] text-[13.5px] leading-relaxed text-ws-text-2">
            {t('wsHomeSubtitle')}
          </p>

          <div className="mt-6 w-full max-w-[720px]">
            <HomeComposer
              onSend={sendPrompt}
              thinking={thinking}
              onThinkingChange={setThinking}
              unavailable={unavailable}
            />
            {!signedIn && auth?.status !== 'unconfigured' ? (
              <p className="mt-2.5 text-[11.5px] text-ws-text-3" role="note">
                {t('wsHomeSignInNote')}{' '}
                <Link to="/profile" className="text-ws-accent-ink underline-offset-2 hover:underline">
                  {t('wsAuthSignIn')}
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- quick actions */}
      <section aria-labelledby="nova-quick-heading" className="mt-6">
        <h2
          id="nova-quick-heading"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-ws-text-3"
        >
          {t('wsHomeQuickTitle')}
        </h2>
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.id} to={action.to} className="nova-quick-card group">
                <span className="flex items-center justify-between gap-2">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-[10px] border border-ws-line text-ws-accent-ink"
                    style={{ background: 'color-mix(in srgb, var(--color-ws-accent) 10%, transparent)' }}
                  >
                    <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <ArrowUpRight
                    size={15}
                    strokeWidth={1.9}
                    aria-hidden="true"
                    className="text-ws-text-3 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </span>
                <span className="mt-1 block text-[13px] font-medium text-ws-text">
                  {t(action.titleKey)}
                </span>
                <span className="block text-[11.5px] leading-relaxed text-ws-text-3">
                  {t(action.bodyKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------- astronomy studio */}
      <section aria-labelledby="nova-science-heading" className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h2 id="nova-science-heading" className="nova-section-title">
              {t('wsScienceTitle')}
            </h2>
            <p className="mt-1 max-w-[42rem] text-[12px] leading-relaxed text-ws-text-3">
              {t('wsScienceBody')}
            </p>
          </div>
          <span className="nova-chip">
            <Brain size={11} strokeWidth={2} aria-hidden="true" />
            {t('wsThinkingLabel')}
          </span>
        </div>

        <div className="nova-science-grid mt-3">
          {SCIENCE_PROMPTS.map((card) => (
            <button
              key={card.id}
              type="button"
              className="nova-science-card"
              onClick={() => sendPrompt(t(card.promptKey), card.thinking)}
            >
              <span className="nova-science-card__icon" aria-hidden="true">
                <ScienceGlyph id={card.id} />
              </span>
              <span className="nova-science-card__title">{t(card.titleKey)}</span>
              <span className="nova-science-card__body">{t(card.bodyKey)}</span>
              <span className="nova-science-card__level">
                {t(thinkingMeta(card.thinking).labelKey)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- live + system */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="nova-card overflow-hidden" aria-labelledby="nova-explore-heading">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="nova-chip" style={{ color: 'var(--color-ws-success)' }}>
                  <CheckCircle2 size={11} strokeWidth={2.2} aria-hidden="true" />
                  {t('wsAvailableNow')}
                </p>
                <h2
                  id="nova-explore-heading"
                  className="mt-2.5 flex items-center gap-2 text-[17px] font-semibold tracking-[-0.015em] text-ws-text"
                >
                  <Compass size={18} strokeWidth={1.9} aria-hidden="true" className="text-ws-accent-ink" />
                  {t('wsExploreCardTitle')}
                </h2>
                <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ws-text-2">
                  {t('wsExploreCardBody')}
                </p>
              </div>
              <Link to="/explore" className="nova-btn nova-btn--primary shrink-0">
                {t('wsOpenExplore')}
                <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>
            <div className="border-t border-ws-line px-5 py-3">
              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ws-text-3">
                <ShieldCheck size={13} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 shrink-0" />
                {t('wsHomeShellNote')}
              </p>
            </div>
          </section>

          <section aria-labelledby="nova-modules-heading" className="nova-card p-5">
            <h2 id="nova-modules-heading" className="text-[15px] font-semibold text-ws-text">
              {t('wsModulesTitle')}
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ws-text-2">{t('wsModulesBody')}</p>

            <ul className="mt-4 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2">
              {planned.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      className="nova-card nova-card--interactive flex w-full items-center gap-2.5 px-3 py-2.5"
                      style={{ boxShadow: 'none', background: 'transparent' }}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-ws-line text-ws-text-3">
                        <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ws-text">
                        {t(item.labelKey)}
                      </span>
                      <span className="nova-nav-item__flag shrink-0">{item.phase}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="nova-appearance-heading" className="nova-card p-4">
            <h2 id="nova-appearance-heading" className="text-[12.5px] font-medium text-ws-text">
              {t('wsAppearanceTitle')}
            </h2>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ws-text-3">{t('wsAppearanceBody')}</p>
            <div className="mt-3">
              <ThemeOptions compact />
            </div>
          </section>

          <section className="nova-card p-4" aria-labelledby="nova-thinking-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="nova-thinking-heading" className="text-[12.5px] font-medium text-ws-text">
                {t('wsThinkingLadderTitle')}
              </h2>
              <span className="nova-chip">{t(thinkingMeta(thinking).labelKey)}</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ws-text-3">
              {t('wsThinkingLadderBody')}
            </p>
            <ul className="mt-3 flex list-none flex-col gap-1 p-0">
              {THINKING_ORDER.map((level) => {
                const meta = thinkingMeta(level);
                const current = level === thinking;
                return (
                  <li key={level}>
                    <button
                      type="button"
                      className={`nova-ladder-row ${current ? 'nova-ladder-row--active' : ''}`}
                      aria-pressed={current}
                      onClick={() => setThinking(level)}
                      title={t(meta.hintKey)}
                    >
                      <span className="nova-ladder-row__name">{t(meta.labelKey)}</span>
                      <span className="nova-ladder-row__dots font-mono" aria-hidden="true">
                        {thinkingDepthDots(level)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2.5 text-[10.5px] leading-relaxed text-ws-text-3">{t('wsThinkingLadderHint')}</p>
          </section>

          <ProviderStatus />
          <CloudCard />

          <Link
            to="/explore"
            className="nova-card nova-card--interactive flex items-center justify-between gap-3 p-4"
          >
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ws-text">{t('wsExplore')}</span>
              <span className="mt-0.5 block text-[11.5px] text-ws-text-3">{t('wsExploreEyebrow')}</span>
            </span>
            <ArrowUpRight size={16} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-ws-text-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
