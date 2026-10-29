import React, { useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AlertCircle, CheckCircle2, Flag, Link2, ShieldCheck, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SpaceVideo, SpaceVideoCategory } from './types';
import { youtubeIdFromUrl } from './youtubeUrl';

const categories: Array<{ id: Exclude<SpaceVideoCategory, 'all'>; key: string }> = [
  { id: 'missions', key: 'ssMissions' }, { id: 'solar-system', key: 'ssSolarSystem' },
  { id: 'universe', key: 'ssUniverse' }, { id: 'earth', key: 'ssEarth' }
];

// CosmoVision accepts short-form science clips; longer videos are rejected at submission time.
const MAX_VIDEO_SECONDS = 60 * 60;

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
};

type OwnSubmission = { id: string; title: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string };
type PendingVideo = { id: string; videoId: string; title: string; description: string; category: string; channelTitle: string; createdAt: string };
type Report = { id: string; videoId: string; title: string; reason: string; createdAt: string };
type Moderation = { pending: PendingVideo[]; approved: Array<{ id: string; videoId: string; title: string; channelTitle: string }>; reports: Report[] };

async function requestJson(path: string, token?: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`/api/community${path}`, {
    ...init, cache: 'no-store', signal: init?.signal || AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers }
  });
  let data: any;
  try { data = await response.json(); } catch { throw new Error('community-unavailable'); }
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'community-unavailable');
  return data;
}

/** Credentials and access tokens are kept in component memory, not localStorage. */
export function useCommunity() {
  const [configuration, setConfiguration] = useState<'loading' | 'enabled' | 'disabled'>('loading');
  const [token, setToken] = useState('');
  const [moderator, setModerator] = useState(false);
  const [submissions, setSubmissions] = useState<OwnSubmission[]>([]);
  const client = useRef<SupabaseClient | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    requestJson('/config', undefined, { signal: controller.signal }).then((config) => {
      if (controller.signal.aborted) return;
      if (config.enabled === true && typeof config.url === 'string' && typeof config.publicKey === 'string') {
        try {
          client.current = createClient(config.url, config.publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
          setConfiguration('enabled');
          return;
        } catch { /* show unavailable */ }
      }
      setConfiguration('disabled');
    }).catch(() => { if (!controller.signal.aborted) setConfiguration('disabled'); });
    return () => controller.abort();
  }, []);
  const clearSession = () => {
    setToken(''); setModerator(false); setSubmissions([]);
    void client.current?.auth.signOut({ scope: 'local' }).catch(() => {});
  };
  const refresh = async (accessToken = token) => {
    if (!accessToken) return;
    try {
      const data = await requestJson('/me', accessToken);
      setModerator(data.moderator === true);
      setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
    } catch (failure) {
      if (failure instanceof Error && failure.message === 'authentication-required') clearSession();
      throw failure;
    }
  };
  const authenticate = async (email: string, password: string, register: boolean): Promise<'ok' | 'confirm'> => {
    if (!client.current) throw new Error('community-unavailable');
    const result = register
      ? await client.current.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/cosmovision` } })
      : await client.current.auth.signInWithPassword({ email, password });
    if (result.error) throw new Error('auth-error');
    const accessToken = result.data.session?.access_token;
    if (!accessToken) return 'confirm';
    setToken(accessToken);
    try { await refresh(accessToken); } catch { setModerator(false); setSubmissions([]); }
    return 'ok';
  };
  const signOut = () => clearSession();
  return {
    configuration, token, moderator, submissions, authenticate, refresh, signOut,
    request: async (path: string, init?: RequestInit) => {
      try { return await requestJson(path, token || undefined, init); }
      catch (failure) {
        if (failure instanceof Error && failure.message === 'authentication-required') clearSession();
        throw failure;
      }
    }
  };
}
type Community = ReturnType<typeof useCommunity>;

function errorKey(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'duplicate') return 'sfDuplicate';
  if (code === 'duplicate-report') return 'sfReportDuplicate';
  if (code === 'invalid-submission' || code === 'invalid-report') return 'sfValidation';
  if (code === 'youtube-unavailable') return 'sfYouTubeUnavailable';
  if (code === 'video-unavailable') return 'sfVideoUnavailable';
  if (code === 'authentication-required') return 'sfAuthExpired';
  if (code === 'rate-limit') return 'sfRateError';
  if (code === 'auth-error') return 'sfAuthError';
  return 'sfGenericError';
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    // Removing the node closes a native dialog automatically. Calling close()
    // in effect cleanup dispatches a close event during React StrictMode's
    // development replay and immediately dismisses the newly opened dialog.
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className="ss-dialog" aria-labelledby="ss-dialog-title" onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) ref.current?.close(); }}>
      <div className="ss-dialog-header"><h2 id="ss-dialog-title">{title}</h2><button type="button" className="ss-icon-button" onClick={() => ref.current?.close()} aria-label={t('sfClose')} autoFocus><X size={19} aria-hidden="true" /></button></div>
      <div className="ss-dialog-body">{children}</div>
    </dialog>
  );
}

function AuthForm({ community }: { community: Community }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await community.authenticate(email.trim(), password, register);
      setPassword(''); setEmail('');
      if (result === 'confirm') setMessage('sfCheckEmail');
    } catch (failure) { setPassword(''); setError(errorKey(failure)); }
    finally { setBusy(false); }
  };
  if (community.token) return <p className="ss-form-message is-success"><CheckCircle2 size={16} aria-hidden="true" /> {t('sfLoggedIn')}</p>;
  return (
    <div className="ss-auth-box">
      <p className="ss-auth-heading">{t('sfSignInNeeded')}</p>
      <form onSubmit={submit} className="ss-form-grid">
        <label>{t('sfEmail')}<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>{t('sfPassword')}<input type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : 1} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <div className="ss-inline-actions"><button type="submit" className="ss-primary-action" disabled={busy}>{busy ? t('sfSigning') : t(register ? 'sfCreateAccount' : 'sfSignIn')}</button><button type="button" className="ss-link-button" disabled={busy} onClick={() => { setRegister(!register); setError(''); setMessage(''); }}>{t(register ? 'sfSignIn' : 'sfCreateAccount')}</button></div>
      </form>
      {message && <p className="ss-form-message" role="status">{t(message)}</p>}
      {error && <p className="ss-form-message is-error" role="alert">{t(error)}</p>}
      <p className="ss-form-help">{t('sfPrivacy')}</p>
    </div>
  );
}

function UploadDialog({ community, onClose, onSubmitted }: { community: Community; onClose: () => void; onSubmitted: () => void }) {
  const { t } = useTranslation();
  const [source, setSource] = useState<'youtube' | 'file'>('youtube');
  const [url, setUrl] = useState(''); const [title, setTitle] = useState('');
  const [description, setDescription] = useState(''); const [category, setCategory] = useState('');
  const [rights, setRights] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [success, setSuccess] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const id = youtubeIdFromUrl(url.trim());

  useEffect(() => {
    let cancelled = false;
    if (!id) { setDurationSeconds(null); setDurationError(null); return; }
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const response = await fetch(`/api/youtube/meta?url=${encodeURIComponent(url.trim())}`, { signal: AbortSignal.timeout(15_000) });
        if (cancelled) return;
        const data = await response.json().catch(() => ({}));
        if (response.ok && typeof data.durationSeconds === 'number' && data.durationSeconds > 0) setDurationSeconds(data.durationSeconds);
        else setDurationError((data as { error?: string })?.error || 'youtube-unavailable');
      } catch { if (!cancelled) setDurationError('youtube-unavailable'); }
    }, 400);
    return () => { cancelled = true; };
  }, [url, id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(false);
    const cleanTitle = title.trim(); const cleanDescription = description.trim();
    if (!id || cleanTitle.length < 3 || cleanDescription.length < 10 || !category || !rights) { setError('sfValidation'); return; }
    if (durationSeconds != null && durationSeconds > MAX_VIDEO_SECONDS) { setError('sfVideoTooLong'); return; }
    if (!community.token || community.configuration !== 'enabled') { setError('sfSignInNeeded'); return; }
    setBusy(true);
    try {
      const result = await community.request('/submissions', { method: 'POST', body: JSON.stringify({ url: url.trim(), title: cleanTitle, description: cleanDescription, category }) });
      if (result.status !== 'pending') throw new Error('community-unavailable');
      setSuccess(true); setUrl(''); setTitle(''); setDescription(''); setCategory(''); setRights(false);
      void community.refresh().catch(() => {}); onSubmitted();
    } catch (failure) { setError(errorKey(failure)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog title={t('sfUploadTitle')} onClose={onClose}>
      <p className="ss-dialog-intro">{t('sfUploadIntro')}</p>
      {community.configuration !== 'enabled' ? <p className="ss-form-message is-warning" role="status"><AlertCircle size={16} aria-hidden="true" /> {t('sfCommunityUnavailable')}</p> : <AuthForm community={community} />}
      <div className="ss-source-choice" role="group" aria-label={t('sfVideoSource')}>
        <button type="button" aria-pressed={source === 'youtube'} className={source === 'youtube' ? 'is-active' : ''} onClick={() => setSource('youtube')}><Link2 size={16} aria-hidden="true" /> {t('sfYoutube')}</button>
        <button type="button" aria-pressed={source === 'file'} className={source === 'file' ? 'is-active' : ''} onClick={() => setSource('file')}><Upload size={16} aria-hidden="true" /> {t('sfFile')}</button>
      </div>
      {source === 'file' ? <p className="ss-form-message is-warning" role="status">{t('sfFileUnavailable')}</p> : (
        <form onSubmit={submit} className="ss-form-grid">
          <label>{t('sfUrl')}<input type="url" required maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} aria-describedby="ss-url-help" placeholder="https://www.youtube.com/watch?v=…" /><small id="ss-url-help">{t('sfUrlHelp')}</small></label>
          {url && !id && <p className="ss-form-message is-error">{t('sfInvalidUrl')}</p>}
          {id && durationSeconds != null && durationSeconds > MAX_VIDEO_SECONDS && <p className="ss-form-message is-error" role="alert">{t('sfVideoTooLong')}</p>}
          <div className="ss-link-preview"><div className="ss-preview-image">{id ? <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" /> : <Link2 size={24} aria-hidden="true" />}</div><div><strong>{t('sfPreview')}</strong><p>{id ? (title || id) : t('sfNoPreview')}</p>{durationSeconds != null && <span className="ss-duration">{t('sfDuration', { duration: formatDuration(durationSeconds) })}</span>}{durationError && !durationSeconds && <span className="ss-duration is-warning">{t('sfDurationUnknown')}</span>}</div></div>
          <label>{t('sfVideoTitle')}<input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>{t('sfDescription')}<textarea required minLength={10} maxLength={2000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>{t('sfCategory')}<select required value={category} onChange={(event) => setCategory(event.target.value)}><option value="">{t('sfChooseCategory')}</option>{categories.map((item) => <option key={item.id} value={item.id}>{t(item.key)}</option>)}</select></label>
          <label className="ss-check-label"><input type="checkbox" required checked={rights} onChange={(event) => setRights(event.target.checked)} /> <span>{t('sfRights')}</span></label>
          {error && <p className="ss-form-message is-error" role="alert">{t(error)}</p>}
          {success && <p className="ss-form-message is-success" role="status"><CheckCircle2 size={16} aria-hidden="true" /> {t('sfSubmitted')}</p>}
          <div className="ss-dialog-actions"><button type="button" className="ss-secondary-action" onClick={onClose}>{t('sfCancel')}</button><button type="submit" className="ss-primary-action" disabled={busy || community.configuration !== 'enabled' || !community.token}>{busy ? t('sfSubmitting') : t('sfSubmit')}</button></div>
        </form>
      )}
    </Dialog>
  );
}

function MyDialog({ community, onClose }: { community: Community; onClose: () => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  useEffect(() => { void community.refresh().catch(() => setError(true)); }, []);
  return <Dialog title={t('sfMyTitle')} onClose={onClose}>
    {error && <p role="alert" className="ss-form-message is-error">{t('sfGenericError')}</p>}
    {!community.submissions.length && !error && <p className="ss-dialog-intro">{t('sfNoSubmissions')}</p>}
    <div className="ss-review-list">{community.submissions.map((item) => <div key={item.id} className="ss-review-item"><strong>{item.title}</strong><span className={`ss-review-status is-${item.status}`}>{t(item.status === 'approved' ? 'sfApproved' : item.status === 'rejected' ? 'sfRejected' : 'sfPending')}</span></div>)}</div>
  </Dialog>;
}

function ModerationDialog({ community, onClose, onUpdated }: { community: Community; onClose: () => void; onUpdated: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Moderation | null>(null); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const load = async () => { const result = await community.request('/moderation'); setData({ pending: Array.isArray(result.pending) ? result.pending : [], approved: Array.isArray(result.approved) ? result.approved : [], reports: Array.isArray(result.reports) ? result.reports : [] }); };
  useEffect(() => { void load().catch((failure) => setError(errorKey(failure))); }, []);
  const act = async (id: string, action: 'approve' | 'reject' | 'takedown') => {
    setBusy(true); setError(''); setMessage('');
    try {
      await community.request(`/moderation/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action }) });
      await load(); setMessage('sfModUpdated'); onUpdated();
    } catch { setError('sfModError'); }
    finally { setBusy(false); }
  };
  const dismiss = async (id: string) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await community.request(`/moderation/reports/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
      await load(); setMessage('sfModUpdated');
    } catch { setError('sfModError'); }
    finally { setBusy(false); }
  };
  return <Dialog title={t('sfModeration')} onClose={onClose}>
    <p className="ss-dialog-intro">{t('sfModerationIntro')}</p>
    {error && <p role="alert" className="ss-form-message is-error">{t(error)}</p>}{message && <p role="status" className="ss-form-message is-success">{t(message)}</p>}
    {!data && !error && <p role="status">{t('ssLoading')}</p>}
    {data && <><h3 className="ss-dialog-section">{t('sfQueue')}</h3>
      {!data.pending.length && <p className="ss-form-help">{t('sfNoQueue')}</p>}
      <div className="ss-review-list">{data.pending.map((video) => <article className="ss-review-item" key={video.id}>
        <strong>{video.title}</strong><p>{video.channelTitle} · {t(categories.find((item) => item.id === video.category)?.key || 'sfCategory')}</p><p>{video.description}</p>
        {/^[A-Za-z0-9_-]{11}$/.test(video.videoId) && <a className="ss-text-link" href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer">{t('sfOpenSource')}</a>}
        <div className="ss-inline-actions"><button type="button" className="ss-primary-action" disabled={busy} onClick={() => act(video.id, 'approve')}>{t('sfApprove')}</button><button type="button" className="ss-secondary-action" disabled={busy} onClick={() => act(video.id, 'reject')}>{t('sfReject')}</button></div>
      </article>)}</div>
      <h3 className="ss-dialog-section">{t('sfReports')}</h3>{!data.reports.length && <p className="ss-form-help">{t('sfNoReports')}</p>}
      <div className="ss-review-list">{data.reports.map((report) => <article className="ss-review-item" key={report.id}><strong>{report.title}</strong><p>{report.reason}</p><div className="ss-inline-actions"><button type="button" className="ss-secondary-action" disabled={busy} onClick={() => act(report.videoId, 'takedown')}>{t('sfTakeDown')}</button><button type="button" className="ss-secondary-action" disabled={busy} onClick={() => dismiss(report.id)}>{t('sfDismiss')}</button></div></article>)}</div>
      <h3 className="ss-dialog-section">{t('sfApprovedList')}</h3>{!data.approved.length && <p className="ss-form-help">{t('sfNoApproved')}</p>}
      <div className="ss-review-list">{data.approved.map((video) => <article className="ss-review-item" key={video.id}><strong>{video.title}</strong><p>{video.channelTitle}</p><button type="button" className="ss-secondary-action" disabled={busy} onClick={() => act(video.id, 'takedown')}>{t('sfTakeDown')}</button></article>)}</div>
    </>}
  </Dialog>;
}

function ReportDialog({ video, community, onClose, onSignIn }: { video: SpaceVideo; community: Community; onClose: () => void; onSignIn: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await community.request(`/videos/${encodeURIComponent(video.communityId || '')}/report`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      if (result.status !== 'received') throw new Error('community-unavailable');
      setSuccess(true); setReason('');
    } catch (failure) { setError(errorKey(failure)); }
    finally { setBusy(false); }
  };
  return <Dialog title={t('sfReportTitle')} onClose={onClose}>
    <p className="ss-dialog-intro">{video.title}</p>
    {!community.token ? <><p>{t('sfSignInNeeded')}</p><button className="ss-primary-action" type="button" onClick={onSignIn}>{t('sfSignIn')}</button></> : <form className="ss-form-grid" onSubmit={submit}>
      <label>{t('sfReason')}<textarea required minLength={3} maxLength={500} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {error && <p role="alert" className="ss-form-message is-error">{t(error)}</p>}{success && <p role="status" className="ss-form-message is-success">{t('sfReportReceived')}</p>}
      <div className="ss-dialog-actions"><button type="button" className="ss-secondary-action" onClick={onClose}>{t('sfCancel')}</button><button className="ss-primary-action" type="submit" disabled={busy || success}>{t('sfSendReport')}</button></div>
    </form>}
  </Dialog>;
}

export function CommunityActions({ community, reportVideo, clearReport, onUpdated }: { community: Community; reportVideo: SpaceVideo | null; clearReport: () => void; onUpdated: () => void }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<'upload' | 'my' | 'moderation' | null>(null);
  return <>
    <div className="ss-community-actions">
      <button type="button" className="ss-primary-action" onClick={() => setDialog('upload')}><Upload size={16} aria-hidden="true" /> {t('sfSubmitVideo')}</button>
      {community.token && <><button type="button" className="ss-secondary-action" onClick={() => setDialog('my')}>{t('sfMySubmissions')}</button>{community.moderator && <button type="button" className="ss-secondary-action" onClick={() => setDialog('moderation')}><ShieldCheck size={15} aria-hidden="true" /> {t('sfModeration')}</button>}<button type="button" className="ss-link-button" onClick={community.signOut}>{t('sfSignOut')}</button></>}
    </div>
    {dialog === 'upload' && <UploadDialog community={community} onClose={() => setDialog(null)} onSubmitted={onUpdated} />}
    {dialog === 'my' && <MyDialog community={community} onClose={() => setDialog(null)} />}
    {dialog === 'moderation' && <ModerationDialog community={community} onClose={() => setDialog(null)} onUpdated={onUpdated} />}
    {reportVideo && !dialog && <ReportDialog video={reportVideo} community={community} onClose={clearReport} onSignIn={() => { clearReport(); setDialog('upload'); }} />}
  </>;
}

export function ReportButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return <button type="button" className="ss-report-button" onClick={onClick}><Flag size={14} aria-hidden="true" /> {t('sfReport')}</button>;
}
