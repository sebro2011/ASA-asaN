/**
 * Star Library — keep your own text sources and ask questions about them.
 *
 * Files are read in the browser with `FileReader` and stored in the on-device
 * record store: nothing is uploaded, and no index is claimed. A binary file is
 * refused with an explanation instead of being silently stored as a size, and
 * the preview is the file's own first characters — never a summary.
 */
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, FileText, MessageSquare, Search, Trash2, Upload } from 'lucide-react';
import { askNovaWithPrompt } from './ModuleSurface';
import { useRecords } from './useRecords';

const MAX_FILE_BYTES = 200_000;
const MAX_PROMPT_CHARS = 6_000;
const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|log|dat)$/i;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function StarLibrarySurface() {
  const { t } = useTranslation();
  const { records, saved, save, remove } = useRecords('library');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      `${record.data.name ?? ''} ${record.data.text ?? ''}`.toLowerCase().includes(needle),
    );
  }, [filter, records]);

  const readFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(t('wsLibTooBig', { limit: humanSize(MAX_FILE_BYTES) }));
      return;
    }
    if (!TEXT_EXTENSIONS.test(file.name) && !file.type.startsWith('text/')) {
      setError(t('wsLibTextOnly'));
      return;
    }
    try {
      const content = await file.text();
      setName(file.name);
      setText(content);
    } catch {
      setError(t('wsLibReadFailed'));
    }
  };

  const add = () => {
    const trimmedName = name.trim() || t('wsLibUntitled');
    if (!text.trim()) {
      setError(t('wsLibEmptyText'));
      return;
    }
    save({
      name: trimmedName,
      kind: 'text',
      bytes: String(new Blob([text]).size),
      text: text.slice(0, 20_000),
    });
    setName('');
    setText('');
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ws-text-3">{t('wsWorkspace')}</p>
        <h1 className="mt-1.5 flex items-center gap-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ws-text">
          <BookOpen size={22} strokeWidth={1.9} aria-hidden="true" className="text-ws-accent-ink" />
          {t('wsMenuKnowledge')}
        </h1>
        <p className="mt-2 max-w-[46rem] text-[13px] leading-relaxed text-ws-text-2">{t('wsAreaKnowledgeDesc')}</p>
      </header>

      <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ws-text-3">
        <span className="nova-chip">{t('wsModDeviceNote')}</span>
        {!saved ? <span className="nova-chip nova-chip--danger">{t('wsModUnsaved')}</span> : null}
        <span className="min-w-0">{t('wsLibNote')}</span>
      </p>

      <section className="nova-card mt-4 p-5" aria-label={t('wsLibAdd')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nova-lib-name" className="nova-field__label">
              {t('wsFieldSourceName')}
            </label>
            <input
              id="nova-lib-name"
              className="nova-field__input"
              value={name}
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('wsLibNamePlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="nova-lib-file" className="nova-field__label">
              {t('wsLibFile')}
            </label>
            <input
              id="nova-lib-file"
              ref={fileRef}
              type="file"
              className="nova-field__input"
              accept=".txt,.md,.markdown,.csv,.tsv,.json,.log,.dat,text/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="nova-lib-text" className="nova-field__label">
              {t('wsLibPaste')}
            </label>
            <textarea
              id="nova-lib-text"
              className="nova-field__input nova-field__textarea"
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('wsLibPastePlaceholder')}
            />
          </div>
          {error ? (
            <p className="text-[12px] text-ws-danger sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2 sm:col-span-2">
            <button type="button" className="nova-btn nova-btn--primary" onClick={add}>
              <Upload size={13} strokeWidth={2} aria-hidden="true" />
              {t('wsLibAdd')}
            </button>
          </div>
        </div>
      </section>

      <div className="mt-4 flex items-center gap-2">
        <label htmlFor="nova-lib-search" className="sr-only">
          {t('wsModSearch')}
        </label>
        <span className="nova-field__search">
          <Search size={13} strokeWidth={2} aria-hidden="true" />
          <input
            id="nova-lib-search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('wsModSearch')}
            className="nova-field__search-input"
          />
        </span>
        <span className="nova-chip">{t('wsModRecordCount', { count: records.length })}</span>
      </div>

      {records.length === 0 ? (
        <div className="nova-card mt-3 p-5">
          <p className="text-[13px] font-medium text-ws-text">{t('wsLibEmpty')}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ws-text-3">{t('wsModEmptyBody')}</p>
        </div>
      ) : null}

      {records.length > 0 ? (
        <ul className="mt-3 grid list-none gap-3 p-0 lg:grid-cols-2">
          {visible.map((record) => {
            const text = record.data.text ?? '';
            const open = openId === record.id;
            return (
              <li key={record.id} className="nova-record">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="nova-record__title flex items-center gap-2">
                    <FileText size={14} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-ws-text-3" />
                    {record.data.name || t('wsLibUntitled')}
                  </h2>
                  <button
                    type="button"
                    className="nova-icon-btn"
                    aria-label={t('wsModDelete')}
                    onClick={() => remove(record.id)}
                  >
                    <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <p className="nova-record__meta">
                  <span>{humanSize(Number(record.data.bytes) || text.length)}</span>
                  <span>{t('wsLibStored')}</span>
                </p>
                <p className="nova-record__notes">{open ? text : `${text.slice(0, 220)}${text.length > 220 ? '…' : ''}`}</p>
                <div className="nova-record__actions">
                  <button
                    type="button"
                    className="nova-btn nova-btn--secondary"
                    onClick={() => setOpenId(open ? null : record.id)}
                  >
                    {t(open ? 'wsLibCollapse' : 'wsLibPreview')}
                  </button>
                  <button
                    type="button"
                    className="nova-btn nova-btn--secondary"
                    onClick={() =>
                      askNovaWithPrompt(
                        t('wsLibAskPrompt', {
                          name: record.data.name || t('wsLibUntitled'),
                          text: text.slice(0, MAX_PROMPT_CHARS),
                        }),
                      )
                    }
                  >
                    <MessageSquare size={12} strokeWidth={2} aria-hidden="true" />
                    {t('wsModAsk')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {records.length > 0 && visible.length === 0 ? (
        <p className="mt-3 text-[12px] text-ws-text-3">{t('wsModNoMatch')}</p>
      ) : null}
    </div>
  );
}
