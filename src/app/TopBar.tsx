/**
 * Workspace top bar: orientation, search, appearance and language.
 *
 * On phones it carries the drawer trigger and the current destination; on
 * desktop it is a slim strip with breadcrumb, command-palette trigger and the
 * two personalisation controls. No account affordance until authentication
 * exists (Phase 3B) — a signed-out avatar that does nothing would be a lie.
 */
import { useTranslation } from 'react-i18next';
import { Menu, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from './theme';
import LanguageMenu from './LanguageMenu';

interface TopBarProps {
  title: string;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  isMobile: boolean;
  /** Tablets in rail mode still need a way to reach the full destination list. */
  showMenuButton?: boolean;
}

const THEME_ORDER: ThemePreference[] = ['dark', 'light', 'system'];

function ThemeButton() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const Icon = preference === 'light' ? Sun : preference === 'system' ? Monitor : Moon;
  const next = THEME_ORDER[(THEME_ORDER.indexOf(preference) + 1) % THEME_ORDER.length];

  return (
    <button
      type="button"
      className="nova-icon-btn"
      onClick={() => setPreference(next)}
      aria-label={`${t('wsToggleTheme')} (${t('wsTheme')}: ${t(
        preference === 'light' ? 'wsThemeLight' : preference === 'system' ? 'wsThemeSystem' : 'wsThemeDark',
      )})`}
      title={t('wsToggleTheme')}
    >
      <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

export default function TopBar({
  title,
  onOpenMenu,
  onOpenSearch,
  isMobile,
  showMenuButton = isMobile,
}: TopBarProps) {
  const { t } = useTranslation();

  return (
    <header className="nova-topbar">
      {showMenuButton ? (
        <button
          type="button"
          className="nova-icon-btn"
          onClick={onOpenMenu}
          aria-label={t('wsOpenMenu')}
          title={t('wsOpenMenu')}
        >
          <Menu size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ws-text">{title}</p>
        {isMobile ? (
          <p className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-ws-text-3">
            NOVA AI
          </p>
        ) : (
          <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.16em] text-ws-text-3">
            AI Workspace
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        className="nova-btn nova-btn--secondary"
        aria-label={t('wsOpenCommandPalette')}
        title={t('wsOpenCommandPalette')}
        style={{ height: '2rem', gap: '0.5rem', paddingInline: isMobile ? '0.5rem' : '0.625rem' }}
      >
        <Search size={14} strokeWidth={1.9} aria-hidden="true" />
        {isMobile ? null : <span className="text-[12px] text-ws-text-2">{t('wsSearch')}</span>}
        {isMobile ? null : (
          <span className="ml-1 flex items-center gap-0.5">
            <kbd className="nova-kbd">⌘</kbd>
            <kbd className="nova-kbd">K</kbd>
          </span>
        )}
      </button>

      <ThemeButton />
      <LanguageMenu compact={isMobile} />
    </header>
  );
}
