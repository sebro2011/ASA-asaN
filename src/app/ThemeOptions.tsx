/**
 * Three-way appearance control (Dark · Light · System).
 *
 * Shared by the mobile drawer and the workspace home card so the control has
 * one implementation and one set of labels. Uses a real radiogroup with
 * aria-checked rather than styled buttons pretending to be a switch.
 */
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from './theme';

const OPTIONS: Array<{ id: ThemePreference; labelKey: string; icon: typeof Sun }> = [
  { id: 'dark', labelKey: 'wsThemeDark', icon: Moon },
  { id: 'light', labelKey: 'wsThemeLight', icon: Sun },
  { id: 'system', labelKey: 'wsThemeSystem', icon: Monitor },
];

export default function ThemeOptions({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={t('wsTheme')}
      className="grid gap-1"
      style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = preference === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(option.id)}
            className="nova-btn nova-btn--secondary"
            style={{
              height: compact ? '2.25rem' : '2.5rem',
              gap: '0.375rem',
              fontSize: '0.75rem',
              borderColor: active ? 'color-mix(in srgb, var(--color-ws-accent) 55%, transparent)' : undefined,
              background: active ? 'color-mix(in srgb, var(--color-ws-accent) 16%, transparent)' : undefined,
              color: active ? 'var(--color-ws-text)' : undefined,
            }}
          >
            <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
