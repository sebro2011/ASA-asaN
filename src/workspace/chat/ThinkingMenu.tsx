/**
 * Thinking picker — the five-level reasoning ladder, in one control.
 *
 * A button that opens a `listbox` of the ordered levels: auto, flash, flash
 * thinking, thinking, deep thinking. Each row explains what the level does and
 * how deep the reasoning goes, so the choice is informed rather than mystical.
 *
 * Accessibility: the trigger is a real button, the list is a `listbox` with
 * `option` children, arrow keys / Home / End move the active option, Enter or
 * Space selects, Escape closes and returns focus to the trigger, and a click
 * outside closes it. Nothing here traps focus.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, ChevronDown, Check, FastForward, Sparkles, Zap } from 'lucide-react';
import {
  THINKING_ORDER,
  THINKING_LEVELS,
  thinkingMeta,
  type ThinkingLevel,
} from './thinking';

function LevelIcon({ level, size = 14 }: { level: ThinkingLevel; size?: number }) {
  const props = { size, strokeWidth: 1.9, 'aria-hidden': true } as const;
  switch (level) {
    case 'flash':
      return <Zap {...props} />;
    case 'flash-thinking':
      return <FastForward {...props} />;
    case 'thinking':
      return <Brain {...props} />;
    case 'deep-thinking':
      return <Sparkles {...props} />;
    default:
      return <Sparkles {...props} />;
  }
}

export interface ThinkingMenuProps {
  value: ThinkingLevel;
  onChange: (level: ThinkingLevel) => void;
  /** Rungs the deployment cannot serve yet; shown but not selectable. */
  unavailable?: ThinkingLevel[];
  /** Renders the trigger without the label text (used in tight toolbars). */
  compact?: boolean;
  className?: string;
  disabled?: boolean;
}

export default function ThinkingMenu({
  value,
  onChange,
  unavailable = [],
  compact = false,
  className = '',
  disabled = false,
}: ThinkingMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  const levels = THINKING_ORDER;
  const current = thinkingMeta(value);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // Move real focus with the active option, so screen readers announce it.
  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const openMenu = () => {
    if (disabled) return;
    const index = Math.max(0, levels.indexOf(value));
    setActiveIndex(index);
    setOpen(true);
  };

  const select = (level: ThinkingLevel) => {
    if (unavailable.includes(level)) return;
    onChange(level);
    close();
  };

  const step = (delta: number) => {
    setActiveIndex((index) => {
      const next = (index + delta + levels.length) % levels.length;
      return next;
    });
  };

  return (
    <div ref={rootRef} className={`nova-thinking ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="nova-thinking__trigger"
        onClick={() => (open ? close() : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${t('wsThinkingLabel')}: ${t(current.labelKey)}`}
        title={t(current.hintKey)}
        disabled={disabled}
        data-level={current.id}
      >
        <span className="nova-thinking__icon" aria-hidden="true">
          <LevelIcon level={current.id} />
        </span>
        {compact ? null : <span className="nova-thinking__label">{t(current.labelKey)}</span>}
        <span className="nova-thinking__dots" aria-hidden="true">
          {current.depth === 0 ? '·' : '●'.repeat(current.depth)}
        </span>
        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className="nova-thinking__chevron" />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={t('wsThinkingLabel')}
          aria-activedescendant={`${listId}-${levels[activeIndex]}`}
          className="nova-thinking__menu"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              step(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              step(-1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              setActiveIndex(levels.length - 1);
            } else if (event.key === 'Tab') {
              close(false);
            }
          }}
        >
          <p className="nova-thinking__menu-title">{t('wsThinkingMenuTitle')}</p>
          {levels.map((level, index) => {
            const meta = THINKING_LEVELS[level];
            const selected = level === value;
            const offline = unavailable.includes(level);
            return (
              <button
                key={level}
                id={`${listId}-${level}`}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={offline || undefined}
                tabIndex={index === activeIndex ? 0 : -1}
                className={`nova-thinking__option ${selected ? 'nova-thinking__option--selected' : ''} ${
                  offline ? 'nova-thinking__option--offline' : ''
                }`}
                onClick={() => select(level)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="nova-thinking__option-icon" aria-hidden="true">
                  <LevelIcon level={level} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="nova-thinking__option-label">
                    {t(meta.labelKey)}
                    <span className="nova-thinking__option-dots" aria-hidden="true">
                      {meta.depth === 0 ? '·' : '●'.repeat(meta.depth)}
                    </span>
                  </span>
                  <span className="nova-thinking__option-hint">
                    {t(meta.hintKey)}
                    {offline ? ` · ${t('wsThinkingNotConfigured')}` : ''}
                  </span>
                </span>
                {selected ? (
                  <Check size={14} strokeWidth={2.4} aria-hidden="true" className="nova-thinking__check" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
