import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupportedLanguage } from '../i18n/translations';

const labels = {
  en: { profile: 'Community profile', name: 'Public display name', save: 'Submit name for review', notice: 'Use a nickname. Do not include personal information.', pending: 'Awaiting review', approved: 'Approved', rejected: 'Not approved', saved: 'Submitted for review.', error: 'Unable to complete this request.', reports: 'Open reports', noReports: 'No open reports.', reason: 'Reason', snapshot: 'Reported text', dismiss: 'Dismiss report', remove: 'Remove reported post', removed: 'Report resolved.', stale: 'The post changed since it was reported; nothing was removed.', unavailable: 'Unable to load reports.', refresh: 'Refresh' },
  si: { profile: 'ප්‍රජා පැතිකඩ', name: 'ප්‍රසිද්ධ නම', save: 'නම පරීක්ෂාවට යවන්න', notice: 'අන්වර්ථ නාමයක් භාවිතා කරන්න. පෞද්ගලික තොරතුරු ඇතුළත් නොකරන්න.', pending: 'පරීක්ෂාව බලාපොරොත්තුවෙන්', approved: 'අනුමතයි', rejected: 'අනුමත නොවීය', saved: 'පරීක්ෂාවට යවන ලදී.', error: 'ඉල්ලීම සම්පූර්ණ කළ නොහැක.', reports: 'විවෘත වාර්තා', noReports: 'විවෘත වාර්තා නැත.', reason: 'හේතුව', snapshot: 'වාර්තා කළ පෙළ', dismiss: 'වාර්තාව ඉවත දමන්න', remove: 'වාර්තා කළ පළ කිරීම ඉවත් කරන්න', removed: 'වාර්තාව විසඳන ලදී.', stale: 'වාර්තා කිරීමෙන් පසු පළ කිරීම වෙනස් වී ඇත; කිසිවක් ඉවත් නොකළේය.', unavailable: 'වාර්තා පූරණය කළ නොහැක.', refresh: 'යාවත්කාලීන කරන්න' },
  ta: { profile: 'சமூக சுயவிவரம்', name: 'பொது காட்சிப் பெயர்', save: 'பெயரை மதிப்பாய்வுக்கு அனுப்பு', notice: 'புனைப்பெயரைப் பயன்படுத்துங்கள். தனிப்பட்ட தகவலைச் சேர்க்க வேண்டாம்.', pending: 'மதிப்பாய்வுக்காகக் காத்திருக்கிறது', approved: 'அங்கீகரிக்கப்பட்டது', rejected: 'அங்கீகரிக்கப்படவில்லை', saved: 'மதிப்பாய்வுக்கு அனுப்பப்பட்டது.', error: 'கோரிக்கையை முடிக்க முடியவில்லை.', reports: 'திறந்த புகார்கள்', noReports: 'திறந்த புகார்கள் இல்லை.', reason: 'காரணம்', snapshot: 'புகாரளிக்கப்பட்ட உரை', dismiss: 'புகாரை நிராகரி', remove: 'புகாரளிக்கப்பட்ட இடுகையை அகற்று', removed: 'புகார் முடிக்கப்பட்டது.', stale: 'புகாருக்குப் பிறகு இடுகை மாறியுள்ளது; எதுவும் அகற்றப்படவில்லை.', unavailable: 'புகார்களை ஏற்ற முடியவில்லை.', refresh: 'புதுப்பி' },
} as const;
const button = 'rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-ink hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50';
type Profile = { display_name: string; status: 'pending' | 'approved' | 'rejected' };
type Report = { id: string; reason: string; reported_body: string };

export function CommunityProfile({ client, userId, lang, onSaved }: { client: SupabaseClient; userId: string; lang: SupportedLanguage; onSaved: () => void }) {
  const t = labels[lang] || labels.en;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let live = true;
    setLoaded(false); setProfile(null); setName('');
    void client.from('community_profiles').select('display_name,status').eq('user_id', userId).maybeSingle().then(({ data, error }) => {
      if (!live) return;
      if (error) setMessage(t.error);
      else { setProfile(data as Profile | null); setName(data?.display_name || ''); setLoaded(true); }
    });
    return () => { live = false; };
  }, [client, userId, t.error]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!loaded || busy || name.trim().length < 2) return;
    setBusy(true); setMessage('');
    try {
      const result = profile ? await client.from('community_profiles').update({ display_name: name.trim() }).eq('user_id', userId) : await client.from('community_profiles').insert({ display_name: name.trim() });
      if (result.error) setMessage(t.error);
      else { setProfile({ display_name: name.trim(), status: 'pending' }); setMessage(t.saved); onSaved(); }
    } catch { setMessage(t.error); } finally { setBusy(false); }
  };
  return <section className="surface space-y-3 p-5"><h2 className="font-medium">{t.profile}</h2><p className="text-sm text-ink-2">{t.notice}</p>{profile && <p className="text-xs text-ink-3">{t[profile.status]}</p>}<form onSubmit={submit} className="space-y-2"><label htmlFor="community-name" className="block text-sm">{t.name}</label><input id="community-name" className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-ink" minLength={2} maxLength={40} required value={name} onChange={e => setName(e.target.value)} /><button className={button} disabled={!loaded || busy || name.trim().length < 2}>{t.save}</button></form>{message && <p role="status" className="text-sm">{message}</p>}</section>;
}

export function CommunityReports({ client, lang, onResolved }: { client: SupabaseClient; lang: SupportedLanguage; onResolved: () => void }) {
  const t = labels[lang] || labels.en;
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => { try { const r = await client.rpc('community_report_queue'); if (r.error) setError(true); else { setReports(r.data as Report[]); setError(false); } } catch { setError(true); } }, [client]);
  useEffect(() => { void refresh(); }, [refresh]);
  const resolve = async (id: string, decision: 'dismissed' | 'removed') => {
    if (busy) return; setBusy(true); setMessage('');
    try { const r = await client.rpc('community_resolve_report', { report_id: id, decision }); if (r.error || r.data === 'missing') setMessage(t.error); else { setMessage(r.data === 'stale' ? t.stale : t.removed); await refresh(); onResolved(); } } catch { setMessage(t.error); } finally { setBusy(false); }
  };
  return <section className="surface space-y-3 p-5"><h2 className="font-medium">{t.reports}</h2>{error ? <p role="alert" className="text-sm">{t.unavailable}</p> : reports.length === 0 && <p className="text-sm text-ink-2">{t.noReports}</p>}{message && <p role="status" className="text-sm">{message}</p>}<button className={button} onClick={() => void refresh()}>{t.refresh}</button>{reports.map(r => <article key={r.id} className="space-y-2 border-t border-white/10 pt-3"><p className="text-xs text-ink-3">{t.reason}</p><p className="whitespace-pre-wrap break-words text-sm">{r.reason}</p><p className="text-xs text-ink-3">{t.snapshot}</p><p className="whitespace-pre-wrap break-words text-sm">{r.reported_body}</p><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void resolve(r.id, 'dismissed')}>{t.dismiss}</button><button className={button} disabled={busy} onClick={() => void resolve(r.id, 'removed')}>{t.remove}</button></div></article>)}</section>;
}
