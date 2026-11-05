/**
 * Profile and data — the first real (non-planned) workspace surface.
 *
 * Everything here is either read from the signed-in session/profile or reported
 * by the sync engine. The "local data" block is the only place the legacy
 * `nasa_ai_chat_thread_v3` thread is mentioned, and the only place that can
 * delete it — after an import has been verified.
 */
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  Download,
  Loader2,
  MailCheck,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import SyncBadge from '../../auth/SyncBadge';

function downloadJson(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on the next tick so Safari has a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export default function ProfileSurface() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const baseId = useId();

  const [displayName, setDisplayName] = useState(auth.profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [importState, setImportState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [importedCount, setImportedCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteState, setDeleteState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(auth.profile?.display_name ?? '');
  }, [auth.profile?.display_name]);

  if (!auth.user) return null;

  const alreadyImported = auth.migration?.status === 'done';
  const canImport = auth.localThreadMessages > 0;

  const saveName = async () => {
    setSaving(true);
    setSaveState('idle');
    const result = await auth.updateProfile({
      display_name: displayName.trim() ? displayName.trim().slice(0, 80) : null,
    });
    setSaving(false);
    setSaveState(result.ok ? 'saved' : 'error');
  };

  const runImport = async () => {
    setImportState('busy');
    const result = await auth.importLocalThread();
    if (result.status === 'imported') {
      setImportedCount(result.count);
      setImportState('done');
    } else if (result.status === 'already-imported') {
      setImportedCount(result.count);
      setImportState('done');
    } else if (result.status === 'empty' || result.status === 'unavailable') {
      setImportState('idle');
    } else {
      setImportState('failed');
    }
  };

  const runExport = async () => {
    setExporting(true);
    const result = await auth.exportData();
    setExporting(false);
    if (result.ok && result.value) {
      downloadJson(result.value, `nova-workspace-${new Date().toISOString().slice(0, 10)}.json`);
      setNotice(t('wsProfileExportDone'));
    } else {
      setNotice(t('wsAuthErrUnknown'));
    }
  };

  const runDelete = async () => {
    setDeleteState('busy');
    const result = await auth.deleteAllData();
    setDeleteState(result.ok ? 'done' : 'error');
    if (result.ok) setConfirmDelete(false);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ws-text">
          {t('wsProfileTitle')}
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ws-text-2">{t('wsProfileIntro')}</p>
      </header>

      <div className="flex flex-col gap-4">
        {/* Account ------------------------------------------------------- */}
        <section className="nova-card p-5" aria-labelledby={`${baseId}-account`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`${baseId}-account`} className="text-[14px] font-semibold text-ws-text">
                {t('wsProfileIdentity')}
              </h2>
              <p className="mt-1 truncate text-[13px] text-ws-text-2" dir="ltr">
                {auth.user.email}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ws-text-3">
                {auth.user.emailConfirmed ? (
                  <>
                    <CheckCircle2 size={13} className="text-ws-success" aria-hidden="true" />
                    {t('wsSignedInAs')}
                  </>
                ) : (
                  <>
                    <AlertCircle size={13} className="text-ws-danger" aria-hidden="true" />
                    {t('wsAuthEmailUnconfirmed')}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SyncBadge />
              {!auth.user.emailConfirmed ? (
                <button
                  type="button"
                  className="nova-btn nova-btn--secondary"
                  onClick={async () => {
                    const result = await auth.resendVerification(auth.user!.email ?? '');
                    setNotice(result.ok ? t('wsAuthResent') : t('wsAuthErrUnknown'));
                  }}
                >
                  <MailCheck size={14} aria-hidden="true" />
                  {t('wsAuthResend')}
                </button>
              ) : null}
            </div>
          </div>

          <hr className="nova-divider my-4" />

          <div className="nova-field max-w-sm">
            <label className="nova-label" htmlFor={`${baseId}-name`}>
              {t('wsProfileDisplayName')}
            </label>
            <input
              id={`${baseId}-name`}
              className="nova-input"
              value={displayName}
              maxLength={80}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setSaveState('idle');
              }}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="nova-btn nova-btn--secondary"
              onClick={() => void saveName()}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
              {t('wsProfileSave')}
            </button>
            {saveState === 'saved' ? (
              <span className="text-[12px] text-ws-text-2" role="status">
                {t('wsProfileSaved')}
              </span>
            ) : null}
            {saveState === 'error' ? (
              <span className="nova-error" role="alert">
                <AlertCircle size={13} aria-hidden="true" />
                {t('wsAuthErrUnknown')}
              </span>
            ) : null}
          </div>
        </section>

        {/* Local data ---------------------------------------------------- */}
        <section className="nova-card p-5" aria-labelledby={`${baseId}-local`}>
          <h2 id={`${baseId}-local`} className="text-[14px] font-semibold text-ws-text">
            {t('wsProfileLocalData')}
          </h2>

          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-lg text-[13px] leading-relaxed text-ws-text-2">
                {canImport
                  ? t('wsProfileLocalThreadFound', { count: auth.localThreadMessages })
                  : alreadyImported
                    ? t('wsProfileImportDone', { count: auth.migration?.count ?? 0 })
                    : t('wsProfileLocalData')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {canImport ? (
                  <button
                    type="button"
                    className="nova-btn nova-btn--primary"
                    onClick={() => void runImport()}
                    disabled={importState === 'busy'}
                  >
                    {importState === 'busy' ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <CloudUpload size={14} aria-hidden="true" />
                    )}
                    {t('wsProfileImport')}
                  </button>
                ) : null}
                {canImport ? (
                  <button
                    type="button"
                    className="nova-btn nova-btn--ghost"
                    onClick={() => {
                      auth.removeLocalThread();
                      setNotice(t('wsProfileRemoveLocalDone'));
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {t('wsProfileRemoveLocal')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="nova-btn nova-btn--secondary"
                  onClick={() => void runExport()}
                  disabled={exporting}
                >
                  {exporting ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Download size={14} aria-hidden="true" />
                  )}
                  {t('wsProfileExport')}
                </button>
              </div>
            </div>

            {importState === 'done' ? (
              <p className="flex items-center gap-1.5 text-[12.5px] text-ws-text-2" role="status">
                <CheckCircle2 size={14} className="text-ws-success" aria-hidden="true" />
                {t('wsProfileImportDone', { count: importedCount })}
              </p>
            ) : null}
            {importState === 'failed' ? (
              <p className="nova-error" role="alert">
                <AlertCircle size={14} aria-hidden="true" />
                {t('wsProfileImportFailed')}
              </p>
            ) : null}
            {notice ? (
              <p className="text-[12.5px] text-ws-text-2" role="status">
                {notice}
              </p>
            ) : null}
          </div>
        </section>

        {/* Danger zone --------------------------------------------------- */}
        <section className="nova-card p-5" aria-labelledby={`${baseId}-danger`}>
          <h2 id={`${baseId}-danger`} className="text-[14px] font-semibold text-ws-text">
            {t('wsProfileDangerZone')}
          </h2>
          <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-ws-text-2">
            {t('wsProfileDeleteBody')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  className="nova-btn nova-btn--secondary"
                  style={{ color: 'var(--color-ws-danger)' }}
                  onClick={() => void runDelete()}
                  disabled={deleteState === 'busy'}
                >
                  {deleteState === 'busy' ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 size={14} aria-hidden="true" />
                  )}
                  {t('wsProfileDeleteConfirm')}
                </button>
                <button
                  type="button"
                  className="nova-btn nova-btn--ghost"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('wsProfileDeleteCancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="nova-btn nova-btn--secondary"
                style={{ color: 'var(--color-ws-danger)' }}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={14} aria-hidden="true" />
                {t('wsProfileDangerZone')}
              </button>
            )}
            {deleteState === 'done' ? (
              <span className="text-[12.5px] text-ws-text-2" role="status">
                {t('wsProfileDeleted')}
              </span>
            ) : null}
            {deleteState === 'error' ? (
              <span className="nova-error" role="alert">
                <AlertCircle size={13} aria-hidden="true" />
                {t('wsAuthErrUnknown')}
              </span>
            ) : null}
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ws-text-3">
            {i18n.language}
          </p>
        </section>
      </div>
    </div>
  );
}
