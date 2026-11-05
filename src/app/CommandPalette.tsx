/**
 * Command palette (⌘K / Ctrl K).
 *
 * One keyboard-first surface for: every workspace destination, every preserved
 * NASA Explore destination, appearance and language. It never fakes content
 * search — conversation/document search arrives with the modules that own that
 * data (Phase 3D+), and will be added to this palette rather than bolted on
 * elsewhere.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CornerDownLeft, Monitor, Moon, Search, Sun, type LucideIcon } from 'lucide-react';
import { navigate } from './router';
import { ACCOUNT_NAV, EXPLORE_NAV, WORKSPACE_NAV } from './navConfig';
import { useBodyScrollLock, useEscape, useFocusTrap } from './hooks';
import { useTheme, type ThemePreference } from './theme';
import { useLanguage } from './LanguageMenu';
import { NAV_ENTRIES } from '../ui/navigation';
import type { SupportedLanguage } from '../i18n/translations';

type Group = 'workspace' | 'explore' | 'appearance' | 'language';

interface Command {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  flag?: string;
  icon?: LucideIcon;
  run: () => void;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { setPreference } = useTheme();
  const { changeLanguage } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lang = ((i18n.language || 'en').slice(0, 2) as 'en' | 'si' | 'ta') || 'en';

  useFocusTrap(open, panelRef);
  useBodyScrollLock(open);
  useEscape(open, onClose);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const close = () => onClose();
    const list: Command[] = [];

    [...WORKSPACE_NAV, EXPLORE_NAV, ...ACCOUNT_NAV].forEach((item) => {
      list.push({
        id: `nav:${item.id}`,
        group: 'workspace',
        label: t(item.labelKey),
        flag: item.status === 'planned' ? t('wsPlannedFlag') : undefined,
        icon: item.icon,
        run: () => {
          navigate(item.href);
          close();
        },
      });
    });

    NAV_ENTRIES.forEach((entry) => {
      const href =
        entry.id === 'space-shorts'
          ? '/cosmovision'
          : entry.id === 'home'
            ? '/explore'
            : `/explore/${entry.id}`;
      list.push({
        id: `explore:${entry.id}`,
        group: 'explore',
        label: entry.labels[lang] || entry.labels.en,
        hint: entry.hint[lang] || entry.hint.en,
        icon: entry.icon as unknown as LucideIcon,
        run: () => {
          navigate(href);
          close();
        },
      });
    });

    const themes: Array<{ id: ThemePreference; labelKey: string; icon: typeof Sun }> = [
      { id: 'dark', labelKey: 'wsThemeDark', icon: Moon },
      { id: 'light', labelKey: 'wsThemeLight', icon: Sun },
      { id: 'system', labelKey: 'wsThemeSystem', icon: Monitor },
    ];
    themes.forEach((theme) => {
      list.push({
        id: `theme:${theme.id}`,
        group: 'appearance',
        label: t(theme.labelKey),
        icon: theme.icon,
        run: () => {
          setPreference(theme.id);
          close();
        },
      });
    });

    const languages: Array<{ id: SupportedLanguage; label: string }> = [
      { id: 'en', label: 'English' },
      { id: 'si', label: 'සිංහල' },
      { id: 'ta', label: 'தமிழ்' },
    ];
    languages.forEach((language) => {
      list.push({
        id: `lang:${language.id}`,
        group: 'language',
        label: language.label,
        run: () => {
          changeLanguage(language.id);
          close();
        },
      });
    });

    return list;
  }, [t, lang, onClose, setPreference, changeLanguage]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint || ''} ${command.flag || ''}`.toLowerCase().includes(needle),
    );
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keep the highlighted option visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!open) return null;

  const grouped = (['workspace', 'explore', 'appearance', 'language'] as Group[]).map((group) => ({
    group,
    items: filtered.filter((command) => command.group === group),
  }));

  const flat = grouped.flatMap((section) => section.items);
  const groupLabels: Record<Group, string> = {
    workspace: t('wsCommandNavigate'),
    explore: t('wsCommandExplore'),
    appearance: t('wsCommandAppearance'),
    language: t('wsCommandLanguage'),
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (flat.length ? (index + 1) % flat.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (flat.length ? (index - 1 + flat.length) % flat.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      flat[activeIndex]?.run();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, flat.length - 1));
    }
  };

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]">
      <button
        type="button"
        aria-label={t('wsCommandClose')}
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-[3px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('wsCommandTitle')}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="nova-panel relative w-full max-w-xl overflow-hidden shadow-[var(--ws-shadow-2)]"
        style={{ background: 'var(--ws-glass-strong)', backdropFilter: 'blur(24px) saturate(120%)' }}
      >
        <div className="flex items-center gap-2.5 border-b border-ws-line px-3.5 py-3">
          <Search size={16} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-ws-text-3" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="nova-command-list"
            aria-activedescendant={flat[activeIndex] ? `nova-cmd-${flat[activeIndex].id}` : undefined}
            aria-autocomplete="list"
            aria-label={t('wsCommandTitle')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('wsCommandPlaceholder')}
            className="h-6 w-full border-0 bg-transparent text-[14px] text-ws-text outline-none placeholder:text-ws-text-3"
          />
          <kbd className="nova-kbd shrink-0">esc</kbd>
        </div>

        <ul
          id="nova-command-list"
          ref={listRef}
          role="listbox"
          aria-label={t('wsCommandTitle')}
          className="max-h-[min(60vh,26rem)] list-none overflow-y-auto p-1.5"
        >
          {flat.length === 0 ? (
            <li className="px-3 py-6 text-center text-[12.5px] text-ws-text-3">{t('wsCommandEmpty')}</li>
          ) : (
            grouped.map((section) =>
              section.items.length === 0 ? null : (
                <li key={section.group}>
                  <p className="nova-nav-section">{groupLabels[section.group]}</p>
                  <ul className="list-none p-0">
                    {section.items.map((command) => {
                      runningIndex += 1;
                      const index = runningIndex;
                      const active = index === activeIndex;
                      const Icon = command.icon;
                      return (
                        <li key={command.id}>
                          <button
                            type="button"
                            id={`nova-cmd-${command.id}`}
                            data-index={index}
                            role="option"
                            aria-selected={active}
                            onMouseMove={() => setActiveIndex(index)}
                            onClick={command.run}
                            className="nova-nav-item"
                            style={{
                              background: active
                                ? 'color-mix(in srgb, var(--color-ws-accent) 16%, transparent)'
                                : undefined,
                              color: active ? 'var(--color-ws-text)' : undefined,
                            }}
                          >
                            {Icon ? (
                              <span className="nova-nav-item__icon" aria-hidden="true">
                                <Icon size={16} strokeWidth={1.8} />
                              </span>
                            ) : null}
                            <span className="nova-nav-item__label">{command.label}</span>
                            {command.flag ? <span className="nova-nav-item__flag">{command.flag}</span> : null}
                            {active ? (
                              <CornerDownLeft
                                size={13}
                                strokeWidth={1.8}
                                aria-hidden="true"
                                className="shrink-0 text-ws-text-3"
                              />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ),
            )
          )}
        </ul>
      </div>
    </div>
  );
}
