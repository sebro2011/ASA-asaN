/**
 * Schema-driven astronomy record surface.
 *
 * Missions, observation logs, the research journal, deep-sky research and the
 * observing plan all need the same three things — a form, a list and an
 * "explain this to me" hand-off — so they share this component and differ only
 * by their field schema. Nothing is pre-filled and nothing is simulated: an
 * empty workspace says it is empty, and every record was typed by the reader.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { navigate } from '../../app/router';
import { queuePrompt, queueThinking } from '../chat/pendingPrompt';
import { recordToText, type ModuleId, type ModuleRecord } from './records';
import { useRecords } from './useRecords';

export interface FieldOption {
  value: string;
  labelKey: string;
}

export interface FieldSpec {
  key: string;
  labelKey: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'lines';
  options?: FieldOption[];
  required?: boolean;
  placeholderKey?: string;
  maxLength?: number;
}

interface ModuleSurfaceProps {
  moduleId: ModuleId;
  titleKey: string;
  subtitleKey: string;
  fields: FieldSpec[];
  /** Field whose value titles a record in the list. */
  primaryKey: string;
  /** Fields shown as a compact meta line. */
  metaKeys?: string[];
  /** A `lines` field rendered as a table (pipe-separated cells). */
  linesKey?: string;
  /** Extra content inside a card (e.g. the Moon phase for a session date). */
  renderExtra?: (record: ModuleRecord) => ReactNode;
  /** Optional note above the list, e.g. what the module deliberately does not do. */
  noteKey?: string;
}

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function defaultsFor(fields: FieldSpec[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === 'date') values[field.key] = today();
    else if (field.type === 'select') values[field.key] = field.options?.[0]?.value ?? '';
    else values[field.key] = '';
  }
  return values;
}

export function askNovaWithPrompt(prompt: string): void {
  if (!queuePrompt(prompt)) return;
  queueThinking('thinking');
  navigate('/chat');
}

export default function ModuleSurface({
  moduleId,
  titleKey,
  subtitleKey,
  fields,
  primaryKey,
  metaKeys = [],
  linesKey,
  renderExtra,
  noteKey,
}: ModuleSurfaceProps) {
  const { t } = useTranslation();
  const { records, saved, save, remove } = useRecords(moduleId);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const prefix = useId();

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const field of fields) map[field.key] = t(field.labelKey);
    return map;
  }, [fields, t]);

  const startNew = () => {
    setError(null);
    setEditingId(null);
    setDraft(defaultsFor(fields));
  };

  const startEdit = (record: ModuleRecord) => {
    setError(null);
    setEditingId(record.id);
    setDraft({ ...defaultsFor(fields), ...record.data });
  };

  const submit = () => {
    if (!draft) return;
    const missing = fields.find((field) => field.required && !draft[field.key]?.trim());
    if (missing) {
      setError(t('wsModRequired', { field: t(missing.labelKey) }));
      return;
    }
    save(draft, editingId ?? undefined);
    setDraft(null);
    setEditingId(null);
    setError(null);
  };

  const ask = (record: ModuleRecord) => {
    const prompt = t('wsModAskPrompt', {
      module: t(titleKey),
      record: recordToText(record, labels) || t(primaryKey),
    });
    askNovaWithPrompt(prompt);
  };

  const rows = (record: ModuleRecord): string[][] => {
    if (!linesKey) return [];
    return (record.data[linesKey] ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split('|').map((cell) => cell.trim()))
      .filter((cells) => cells.some(Boolean));
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ws-text-3">{t('wsWorkspace')}</p>
          <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ws-text">
            {t(titleKey)}
          </h1>
          <p className="mt-2 max-w-[46rem] text-[13px] leading-relaxed text-ws-text-2">{t(subtitleKey)}</p>
        </div>
        <button type="button" className="nova-btn nova-btn--primary" onClick={startNew} disabled={draft !== null}>
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          {t('wsModNew')}
        </button>
      </header>

      <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ws-text-3">
        <span className="nova-chip">{t('wsModDeviceNote')}</span>
        {!saved ? <span className="nova-chip nova-chip--danger">{t('wsModUnsaved')}</span> : null}
        {noteKey ? <span className="min-w-0">{t(noteKey)}</span> : null}
      </p>

      {draft ? (
        <section className="nova-card mt-4 p-5" aria-label={editingId ? t('wsModEdit') : t('wsModNew')}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {fields.map((field) => {
              const id = `${prefix}-${field.key}`;
              const value = draft[field.key] ?? '';
              const common = {
                id,
                value,
                maxLength: field.maxLength ?? (field.type === 'textarea' || field.type === 'lines' ? 20_000 : 300),
                onChange: (
                  event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
                ) => setDraft({ ...draft, [field.key]: event.target.value }),
              };
              return (
                <div
                  key={field.key}
                  className={field.type === 'textarea' || field.type === 'lines' ? 'sm:col-span-2' : undefined}
                >
                  <label htmlFor={id} className="nova-field__label">
                    {t(field.labelKey)}
                    {field.required ? <span aria-hidden="true"> *</span> : null}
                  </label>
                  {field.type === 'textarea' || field.type === 'lines' ? (
                    <textarea
                      {...common}
                      id={id}
                      rows={field.type === 'lines' ? 4 : 5}
                      className="nova-field__input nova-field__textarea"
                      placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                    />
                  ) : field.type === 'select' ? (
                    <select {...common} id={id} className="nova-field__input">
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      {...common}
                      id={id}
                      type={field.type === 'date' ? 'date' : 'text'}
                      className="nova-field__input"
                      placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                    />
                  )}
                </div>
              );
            })}
            {error ? (
              <p className="sm:col-span-2 text-[12px] text-ws-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-2 sm:col-span-2">
              <button type="submit" className="nova-btn nova-btn--primary">
                <Save size={13} strokeWidth={2} aria-hidden="true" />
                {t('wsModSave')}
              </button>
              <button
                type="button"
                className="nova-btn nova-btn--secondary"
                onClick={() => {
                  setDraft(null);
                  setEditingId(null);
                  setError(null);
                }}
              >
                <X size={13} strokeWidth={2} aria-hidden="true" />
                {t('wsModCancel')}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {records.length === 0 && !draft ? (
        <div className="nova-card mt-4 p-5">
          <p className="text-[13px] font-medium text-ws-text">{t('wsModEmpty')}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ws-text-3">{t('wsModEmptyBody')}</p>
        </div>
      ) : null}

      {records.length > 0 ? (
        <ul className="mt-4 grid list-none gap-3 p-0 lg:grid-cols-2">
          {records.map((record) => {
            const table = rows(record);
            const notes = fields.find((field) => field.type === 'textarea');
            return (
              <li key={record.id} className="nova-record">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="nova-record__title">{record.data[primaryKey] || t(primaryKey)}</h2>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="nova-icon-btn"
                      aria-label={t('wsModEdit')}
                      title={t('wsModEdit')}
                      onClick={() => startEdit(record)}
                    >
                      <Pencil size={13} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="nova-icon-btn"
                      aria-label={t('wsModDelete')}
                      title={t('wsModDelete')}
                      onClick={() => setConfirming(record.id)}
                    >
                      <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {metaKeys.length > 0 ? (
                  <p className="nova-record__meta">
                    {metaKeys
                      .filter((key) => record.data[key])
                      .map((key) => {
                        const field = fields.find((entry) => entry.key === key);
                        const option = field?.options?.find((entry) => entry.value === record.data[key]);
                        const shown = option ? t(option.labelKey) : record.data[key];
                        return (
                          <span key={key}>
                            {field ? `${t(field.labelKey)}: ` : ''}
                            {shown}
                          </span>
                        );
                      })}
                  </p>
                ) : null}

                {table.length > 0 ? (
                  <table className="nova-record__table">
                    <caption className="sr-only">{linesKey ? t(fields.find((field) => field.key === linesKey)?.labelKey ?? '') : ''}</caption>
                    <tbody>
                      {table.map((cells, index) => (
                        <tr key={`${record.id}-row-${index}`}>
                          {cells.map((cell, cellIndex) => (
                            <td key={`${record.id}-cell-${index}-${cellIndex}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {notes && record.data[notes.key] ? (
                  <p className="nova-record__notes">{record.data[notes.key]}</p>
                ) : null}

                {renderExtra ? renderExtra(record) : null}

                <div className="nova-record__actions">
                  <button type="button" className="nova-btn nova-btn--secondary" onClick={() => ask(record)}>
                    <MessageSquare size={12} strokeWidth={2} aria-hidden="true" />
                    {t('wsModAsk')}
                  </button>
                  <span className="nova-record__stamp">
                    {new Date(record.updatedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                {confirming === record.id ? (
                  <div className="nova-record__confirm" role="alertdialog" aria-label={t('wsModDelete')}>
                    <p className="text-[11.5px] text-ws-text-2">{t('wsModDeleteConfirm')}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="nova-btn nova-btn--danger"
                        onClick={() => {
                          remove(record.id);
                          setConfirming(null);
                        }}
                      >
                        {t('wsModDelete')}
                      </button>
                      <button type="button" className="nova-btn nova-btn--secondary" onClick={() => setConfirming(null)}>
                        {t('wsModCancel')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
