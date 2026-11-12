/**
 * Small controls shared by the research panels.
 *
 * They exist so the panels stay about research logic rather than markup, and so
 * accessible behaviour (labels, `aria-*`, keyboard) is written once:
 *  - every input is bound to a `<label>`;
 *  - the array editor removes items without ever reordering the rest;
 *  - the field group renders as a definition-style block, not a naked column.
 */

import type { ReactNode } from 'react';

export function Labeled({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`fr-field${wide ? ' is-wide' : ''}`}>
      <span className="fr-field__label">{label}</span>
      {children}
      {hint ? <span className="fr-field__hint">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'url' | 'number' | 'date';
  disabled?: boolean;
  onBlur?: () => void;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A list of strings with add/remove, used for questions, limitations, etc. */
export function StringListEditor({
  items,
  onChange,
  addLabel,
  removeLabel,
  placeholder,
  multiline,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  removeLabel: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div className="fr-list">
      {items.map((item, index) => (
        <div className="fr-list__row" key={`${index}-${items.length}`}>
          {multiline ? (
            <TextArea
              value={item}
              rows={2}
              onChange={(value) => onChange(items.map((entry, position) => (position === index ? value : entry)))}
            />
          ) : (
            <TextInput
              value={item}
              placeholder={placeholder}
              onChange={(value) => onChange(items.map((entry, position) => (position === index ? value : entry)))}
            />
          )}
          <button
            type="button"
            className="fr-btn fr-btn--ghost"
            aria-label={`${removeLabel}: ${item.slice(0, 40) || index + 1}`}
            onClick={() => onChange(items.filter((_, position) => position !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="fr-btn fr-btn--soft" onClick={() => onChange([...items, ''])}>
        {addLabel}
      </button>
    </div>
  );
}

/**
 * Key/value rows for structured lists (predictions, dataset requirements).
 * Kept generic so the two shapes share one implementation instead of two.
 */
export function RowsEditor<Row extends Record<string, string>>({
  rows,
  fields,
  onChange,
  addLabel,
  removeLabel,
}: {
  rows: Row[];
  fields: Array<{ key: keyof Row & string; label: string }>;
  onChange: (rows: Row[]) => void;
  addLabel: string;
  removeLabel: string;
}) {
  const blank = Object.fromEntries(fields.map((field) => [field.key, ''])) as Row;
  return (
    <div className="fr-list">
      {rows.map((row, index) => (
        <div className="fr-list__row fr-list__row--grid" key={`${index}-${rows.length}`}>
          {fields.map((field) => (
            <TextInput
              key={field.key}
              value={row[field.key] ?? ''}
              placeholder={field.label}
              onChange={(value) =>
                onChange(rows.map((entry, position) => (position === index ? { ...entry, [field.key]: value } : entry)))
              }
            />
          ))}
          <button
            type="button"
            className="fr-btn fr-btn--ghost"
            aria-label={removeLabel}
            onClick={() => onChange(rows.filter((_, position) => position !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="fr-btn fr-btn--soft" onClick={() => onChange([...rows, blank])}>
        {addLabel}
      </button>
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) {
  return <span className={`fr-badge fr-badge--${tone}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="fr-empty">{children}</p>;
}
