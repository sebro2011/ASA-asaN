/**
 * NOVA Settings (Phase 3C).
 *
 * Only controls with real behaviour are here. Appearance and language are
 * device preferences (they work signed out); the chat provider default lives in
 * `profiles`, so it is offered only when there is an account to write it to.
 *
 * Deliberately absent: font scale and default surface. Those columns exist in
 * the schema but nothing reads them yet, and a control that changes nothing
 * would be a lie.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, UserRound } from 'lucide-react';
import { useTheme } from '../../app/theme';
import { isChatLocalOnly, setChatLocalOnly } from '../chat/chatStorage';
import ThemeOptions from '../../app/ThemeOptions';
import { useLanguage } from '../../app/LanguageMenu';
import { Link } from '../../app/router';
import { useAuth } from '../../auth/AuthProvider';
import { useProviderConfig } from '../useProviderConfig';
import type { ChatProvider } from '../chat/chatClient';
import AiStatusCard from './AiStatusCard';

const PROVIDERS: Array<{ id: ChatProvider; labelKey: string }> = [
  { id: 'auto', labelKey: 'wsChatProvider_auto' },
  { id: 'arena', labelKey: 'wsChatProvider_arena' },
  { id: 'openrouter', labelKey: 'wsChatProvider_openrouter' },
  { id: 'gemini', labelKey: 'wsChatProvider_gemini' },
  { id: 'local', labelKey: 'wsChatProvider_local' },
];

/** Literal keys, so the shell parity test can see all three languages. */
function providerLabelKey(provider: ChatProvider): string {
  switch (provider) {
    case 'arena':
      return 'wsChatProvider_arena';
    case 'openrouter':
      return 'wsChatProvider_openrouter';
    case 'gemini':
      return 'wsChatProvider_gemini';
    case 'local':
      return 'wsChatProvider_local';
    default:
      return 'wsChatProvider_auto';
  }
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-ws-text">{label}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ws-text-3">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors"
        style={{
          borderColor: checked
            ? 'color-mix(in srgb, var(--color-ws-accent) 60%, transparent)'
            : 'var(--color-ws-border)',
          background: checked
            ? 'color-mix(in srgb, var(--color-ws-accent) 45%, transparent)'
            : 'color-mix(in srgb, var(--color-ws-text) 8%, transparent)',
        }}
      >
        <span
          className="absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all"
          style={{
            left: checked ? '1.15rem' : '0.15rem',
            background: checked ? 'var(--color-ws-accent-solid)' : 'var(--color-ws-text-3)',
          }}
        />
      </button>
    </div>
  );
}

export default function SettingsSurface() {
  const { t } = useTranslation();
  const { reducedMotion, setReducedMotion, highContrast, setHighContrast } = useTheme();
  const { lang, changeLanguage } = useLanguage();
  const { status, profile, updateProfile } = useAuth();
  const { providers } = useProviderConfig();
  const [saved, setSaved] = useState(false);
  // Device-only conversations: a preference, not a deletion. Turning it off
  // leaves the device copy alone and returns to syncing when signed in.
  const [localChatOnly, setLocalChatOnly] = useState(isChatLocalOnly);

  const signedIn = status === 'signed-in';
  const provider = (profile?.preferred_provider as ChatProvider | undefined) ?? 'auto';

  // Never offer a provider this deployment cannot call. Local and Auto always
  // exist; an online provider appears only when the server reports a key.
  const available = useMemo(() => {
    if (!providers) return PROVIDERS;
    return PROVIDERS.filter((item) => {
      if (item.id === 'auto' || item.id === 'local') return true;
      return providers[item.id] === true;
    });
  }, [providers]);

  const providerMissing = Boolean(providers) && !available.some((item) => item.id === provider);

  const chooseProvider = async (next: ChatProvider) => {
    const result = await updateProfile({ preferred_provider: next });
    if (result.ok) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-[16px] font-semibold text-ws-text">{t('wsSettingsTitle')}</h1>
        <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-ws-text-3">{t('wsSettingsIntro')}</p>
      </header>

      <section aria-labelledby="nova-settings-appearance" className="nova-card p-4">
        <h2 id="nova-settings-appearance" className="text-[12.5px] font-medium text-ws-text">
          {t('wsSettingsAppearance')}
        </h2>
        <div className="mt-3">
          <ThemeOptions compact />
        </div>
        <div className="mt-2 divide-y" style={{ borderColor: 'var(--color-ws-border)' }}>
          <Toggle
            checked={highContrast}
            onChange={setHighContrast}
            label={t('wsSettingsContrast')}
            description={t('wsSettingsContrastBody')}
          />
          <Toggle
            checked={reducedMotion}
            onChange={setReducedMotion}
            label={t('wsSettingsMotion')}
            description={t('wsSettingsMotionBody')}
          />
          <Toggle
            checked={localChatOnly}
            onChange={(next) => {
              setLocalChatOnly(next);
              setChatLocalOnly(next);
            }}
            label={t('wsChatLocalOnly')}
            description={t('wsChatLocalOnlyBody')}
          />
        </div>
      </section>

      <section aria-labelledby="nova-settings-language" className="nova-card p-4">
        <h2 id="nova-settings-language" className="text-[12.5px] font-medium text-ws-text">
          {t('wsSettingsLanguage')}
        </h2>
        <div role="radiogroup" aria-label={t('wsSettingsLanguage')} className="mt-3 flex flex-wrap gap-2">
          {[
            { code: 'en' as const, label: 'English' },
            { code: 'si' as const, label: 'සිංහල' },
            { code: 'ta' as const, label: 'தமிழ்' },
          ].map((option) => {
            const active = lang === option.code;
            return (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => changeLanguage(option.code)}
                className="nova-btn nova-btn--ghost"
                style={
                  active
                    ? {
                        borderColor: 'color-mix(in srgb, var(--color-ws-accent) 55%, transparent)',
                        color: 'var(--color-ws-accent-ink)',
                      }
                    : undefined
                }
              >
                {active ? <Check size={13} aria-hidden="true" /> : null}
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="nova-settings-chat" className="nova-card p-4">
        <h2 id="nova-settings-chat" className="text-[12.5px] font-medium text-ws-text">
          {t('wsSettingsChat')}
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ws-text-3">{t('wsSettingsProviderBody')}</p>

        {signedIn ? (
          <>
            <label className="mt-3 flex items-center gap-2 text-[12px] text-ws-text-2">
              <span>{t('wsSettingsProvider')}</span>
              <select
                value={provider}
                onChange={(event) => void chooseProvider(event.target.value as ChatProvider)}
                className="nova-field h-7 py-0 text-[12px]"
              >
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            {providerMissing ? (
              <p className="mt-2 text-[11px] text-ws-warn">
                {t('wsSettingsProviderUnavailable', { provider: t(providerLabelKey(provider)) })}
              </p>
            ) : null}
            <p className="mt-2 text-[11px] text-ws-text-3" role="status" aria-live="polite">
              {saved ? t('wsSettingsSaved') : ''}
            </p>
          </>
        ) : (
          <p className="mt-3 text-[11.5px] text-ws-text-3">{t('wsSettingsSignedOutNote')}</p>
        )}
      </section>

      <AiStatusCard />

      <section aria-labelledby="nova-settings-account" className="nova-card p-4">
        <h2 id="nova-settings-account" className="text-[12.5px] font-medium text-ws-text">
          {t('wsSettingsAccount')}
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ws-text-3">{t('wsSettingsAccountBody')}</p>
        <Link to="/profile" className="nova-btn nova-btn--secondary mt-3">
          <UserRound size={13} aria-hidden="true" />
          {t('wsSettingsOpenProfile')}
        </Link>
      </section>
    </div>
  );
}
