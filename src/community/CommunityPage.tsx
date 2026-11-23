import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '../auth/AuthProvider';
import { CommunityProfile, CommunityReports } from './CommunitySafety';
import ScienceGroups from './ScienceGroups';
import CommunityNotifications from './CommunityNotifications';
import AuthPanel from '../auth/AuthPanel';
import { getCloudClient } from '../data/supabaseClient';
import type { SupportedLanguage } from '../i18n/translations';

const copy = {
  en: { intro: 'Posts and comments are reviewed before appearing publicly. Never share your address, birthday or live location.', unavailable: 'Community is unavailable. The database may not be configured yet.', loading: 'Loading community…', retry: 'Try again', empty: 'No approved posts yet.', sign: 'Sign in to participate', write: 'Share an observation', publish: 'Submit for review', pending: 'Awaiting review', rejected: 'Not approved', edit: 'Edit', save: 'Save', cancel: 'Cancel', remove: 'Delete', confirm: 'Delete this post?', comment: 'Write a comment', comments: 'Comments', send: 'Submit comment', like: 'Like', unlike: 'Remove like', report: 'Report', reason: 'Why are you reporting this post?', submit: 'Send report', reported: 'Report submitted.', error: 'Could not complete the request. Please try again.', moderation: 'Moderation queue', approve: 'Approve', reject: 'Reject', noqueue: 'No items awaiting review.', privateNotice: 'Do not share personal information.', you: 'Your post', member: 'Community member', search: 'Filter loaded posts', more: 'Show more', saved: 'Submitted for review.' },
  si: { intro: 'පළ කිරීම් සහ අදහස් ප්‍රසිද්ධ වීමට පෙර පරීක්ෂා කෙරේ. ඔබේ ලිපිනය, උපන් දිනය හෝ සජීවී ස්ථානය බෙදා නොගන්න.', unavailable: 'ප්‍රජාව ලබා ගත නොහැක. දත්ත ගබඩාව තවම සකසා නොතිබිය හැක.', loading: 'ප්‍රජාව පූරණය වේ…', retry: 'නැවත උත්සාහ කරන්න', empty: 'තවම අනුමත පළ කිරීම් නැත.', sign: 'සහභාගී වීමට ඇතුළු වන්න', write: 'නිරීක්ෂණයක් බෙදාගන්න', publish: 'පරීක්ෂාවට යවන්න', pending: 'පරීක්ෂාව බලාපොරොත්තුවෙන්', rejected: 'අනුමත නොවීය', edit: 'සංස්කරණය', save: 'සුරකින්න', cancel: 'අවලංගු කරන්න', remove: 'මකන්න', confirm: 'මෙම පළ කිරීම මකන්නද?', comment: 'අදහසක් ලියන්න', comments: 'අදහස්', send: 'අදහස යවන්න', like: 'කැමතියි', unlike: 'කැමැත්ත ඉවත් කරන්න', report: 'වාර්තා කරන්න', reason: 'මෙය වාර්තා කරන්නේ ඇයි?', submit: 'වාර්තාව යවන්න', reported: 'වාර්තාව යවන ලදී.', error: 'ඉල්ලීම සම්පූර්ණ කළ නොහැක. නැවත උත්සාහ කරන්න.', moderation: 'පරීක්ෂණ පෝලිම', approve: 'අනුමත කරන්න', reject: 'ප්‍රතික්ෂේප කරන්න', noqueue: 'පරීක්ෂාවට කිසිවක් නැත.', privateNotice: 'පුද්ගලික තොරතුරු බෙදා නොගන්න.', you: 'ඔබේ පළ කිරීම', member: 'ප්‍රජා සාමාජික', search: 'පූරණය කළ පළ කිරීම් පෙරන්න', more: 'තවත් පෙන්වන්න', saved: 'පරීක්ෂාවට යවන ලදී.' },
  ta: { intro: 'இடுகைகளும் கருத்துகளும் பொதுவில் தோன்றும் முன் மதிப்பாய்வு செய்யப்படும். முகவரி, பிறந்த தேதி அல்லது நேரடி இருப்பிடத்தைப் பகிர வேண்டாம்.', unavailable: 'சமூகம் கிடைக்கவில்லை. தரவுத்தளம் இன்னும் அமைக்கப்படாமல் இருக்கலாம்.', loading: 'சமூகம் ஏற்றப்படுகிறது…', retry: 'மீண்டும் முயற்சிக்கவும்', empty: 'இன்னும் அங்கீகரிக்கப்பட்ட இடுகைகள் இல்லை.', sign: 'பங்கேற்க உள்நுழையவும்', write: 'ஒரு அவதானிப்பைப் பகிருங்கள்', publish: 'மதிப்பாய்வுக்கு அனுப்பு', pending: 'மதிப்பாய்வுக்காகக் காத்திருக்கிறது', rejected: 'அங்கீகரிக்கப்படவில்லை', edit: 'திருத்து', save: 'சேமி', cancel: 'ரத்து செய்', remove: 'நீக்கு', confirm: 'இந்த இடுகையை நீக்கவா?', comment: 'கருத்தை எழுதுங்கள்', comments: 'கருத்துகள்', send: 'கருத்தை அனுப்பு', like: 'விருப்பம்', unlike: 'விருப்பத்தை நீக்கு', report: 'புகாரளி', reason: 'இந்த இடுகையை ஏன் புகாரளிக்கிறீர்கள்?', submit: 'புகாரை அனுப்பு', reported: 'புகார் அனுப்பப்பட்டது.', error: 'கோரிக்கையை முடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.', moderation: 'மதிப்பாய்வுப் பட்டியல்', approve: 'அங்கீகரி', reject: 'நிராகரி', noqueue: 'மதிப்பாய்வுக்கு எதுவும் இல்லை.', privateNotice: 'தனிப்பட்ட தகவல்களைப் பகிர வேண்டாம்.', you: 'உங்கள் இடுகை', member: 'சமூக உறுப்பினர்', search: 'ஏற்றிய இடுகைகளை வடிகட்டு', more: 'மேலும் காட்டு', saved: 'மதிப்பாய்வுக்கு அனுப்பப்பட்டது.' },
} as const;
const moderationKinds: Record<SupportedLanguage, Record<string, string>> = { en: { post: 'Post', comment: 'Comment', profile: 'Display name', group: 'Group' }, si: { post: 'පළ කිරීම', comment: 'අදහස', profile: 'ප්‍රසිද්ධ නම', group: 'කණ්ඩායම' }, ta: { post: 'இடுகை', comment: 'கருத்து', profile: 'காட்சிப் பெயர்', group: 'குழு' } };
type Post = { id: string; author_id: string; body: string; status: string; created_at: string };
type Comment = { id: string; post_id: string; body: string; status: string };
type QueueItem = { id: string; kind: string; body: string; created_at: string };
const field = 'w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-sky-400';
const button = 'rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-ink hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50';

export default function CommunityPage({ lang }: { lang: SupportedLanguage }) {
  const t = copy[lang] || copy.en;
  const auth = useAuth();
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [likes, setLikes] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => { let alive = true; void getCloudClient().then(c => { if (alive) { setClient(c); if (!c) { setLoading(false); setUnavailable(true); } } }).catch(() => { if (alive) { setLoading(false); setUnavailable(true); } }); return () => { alive = false; }; }, []);
  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true); setUnavailable(false);
    const result = await client.from('community_posts').select('id,author_id,body,status,created_at').order('created_at', { ascending: false }).limit(limit);
    if (result.error) { setUnavailable(true); setLoading(false); return; }
    const rows = (result.data || []) as Post[];
    const ids = rows.map(p => p.id);
    const [cr, lr, pr] = await Promise.all([
      ids.length ? client.from('community_comments').select('id,post_id,body,status').in('post_id', ids).order('created_at').limit(500) : Promise.resolve({ data: [], error: null }),
      auth.user && ids.length ? client.from('community_likes').select('post_id').in('post_id', ids) : Promise.resolve({ data: [], error: null }),
      rows.length ? client.from('community_profiles').select('user_id,display_name,status').in('user_id', [...new Set(rows.map(p => p.author_id))]) : Promise.resolve({ data: [], error: null }),
    ]);
    if (cr.error || lr.error || pr.error) { setUnavailable(true); setLoading(false); return; }
    setNames(Object.fromEntries((pr.data || []).filter(p => p.status === 'approved').map(p => [p.user_id, p.display_name])));
    setPosts(rows); setComments((cr.data || []) as Comment[]); setLikes((lr.data || []).map((l: { post_id: string }) => l.post_id)); setLoading(false);
    if (auth.user) { const q = await client.rpc('community_review_queue'); setQueue(q.error ? null : q.data as QueueItem[]); } else setQueue(null);
  }, [client, auth.user?.id, limit]);
  useEffect(() => { void refresh(); }, [refresh]);
  const action = async (fn: () => PromiseLike<{ error: unknown }>, success?: string) => {
    if (!client || busy) return;
    setBusy(true); setMessage('');
    try { const result = await fn(); if (result.error || ('data' in result && result.data === false)) setMessage(t.error); else { if (success) setMessage(success); await refresh(); } } catch { setMessage(t.error); } finally { setBusy(false); }
  };
  const sendPost = (e: FormEvent) => { e.preventDefault(); const value = body.trim(); if (!value || !client) return; void action(async () => { const r = await client.from('community_posts').insert({ body: value }); if (!r.error) setBody(''); return r; }, t.saved); };
  if (loading && !posts.length) return <p role="status">{t.loading}</p>;
  if (unavailable) return <div className="surface p-6" role="alert"><p>{t.unavailable}</p><button className={`${button} mt-4`} onClick={() => { if (client) void refresh(); else void auth.retryConnection().then(() => window.location.reload()); }}>{t.retry}</button></div>;
  return <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
    <section aria-label={t.write} className="min-w-0 space-y-4">
      <div className="surface p-5 sm:p-6"><p className="text-sm leading-relaxed text-ink-2">{t.intro}</p>
        {auth.user ? <form onSubmit={sendPost} className="mt-4 space-y-3"><label htmlFor="community-post" className="block text-sm font-medium">{t.write}</label><textarea id="community-post" className={field} value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={4} required /><button className={button} disabled={busy || !body.trim()}>{t.publish}</button></form> : <><button className={`${button} mt-4`} onClick={() => setShowAuth(!showAuth)}>{t.sign}</button>{showAuth && <div className="mt-4"><AuthPanel onAuthenticated={() => setShowAuth(false)} /></div>}</>}
      </div>
      {client && <ScienceGroups client={client} userId={auth.user?.id || null} lang={lang} onChanged={() => void refresh()} />}
      {message && <p role="status" className="surface p-4 text-sm">{message}</p>}
      <label className="block"><span className="sr-only">{t.search}</span><input className={field} value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search} /></label>
      {posts.length === 0 && <p className="surface p-6 text-sm text-ink-2">{t.empty}</p>}
      {posts.filter(p => p.body.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(p => <article key={p.id} className="surface space-y-4 p-5 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3"><span>{p.author_id === auth.user?.id ? t.you : names[p.author_id] || t.member}</span><time dateTime={p.created_at}>{new Date(p.created_at).toLocaleDateString(lang)}</time></header>
        {p.status !== 'approved' && <p className="text-xs text-amber-300">{p.status === 'pending' ? t.pending : t.rejected}</p>}
        {editing === p.id ? <form onSubmit={e => { e.preventDefault(); if (!client || !draft.trim()) return; void action(async () => { const r = await client.from('community_posts').update({ body: draft.trim() }).eq('id', p.id); if (!r.error) setEditing(null); return r; }, t.saved); }} className="space-y-2"><label className="sr-only" htmlFor={`edit-${p.id}`}>{t.edit}</label><textarea id={`edit-${p.id}`} className={field} value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} required /><button className={button} disabled={busy}>{t.save}</button> <button type="button" className={button} onClick={() => setEditing(null)}>{t.cancel}</button></form> : <p className="whitespace-pre-wrap break-words text-sm leading-7">{p.body}</p>}
        {auth.user && <div className="flex flex-wrap gap-2">{p.author_id === auth.user.id ? <><button className={button} onClick={() => { setEditing(p.id); setDraft(p.body); }}>{t.edit}</button><button className={button} disabled={busy} onClick={() => { if (client && window.confirm(t.confirm)) void action(() => client.from('community_posts').delete().eq('id', p.id)); }}>{t.remove}</button></> : p.status === 'approved' && <><button className={button} disabled={busy} aria-pressed={likes.includes(p.id)} onClick={() => { if (!client) return; void action(() => likes.includes(p.id) ? client.from('community_likes').delete().eq('post_id', p.id) : client.from('community_likes').insert({ post_id: p.id })); }}>{likes.includes(p.id) ? t.unlike : t.like}</button><button className={button} onClick={() => { setReporting(p.id); setReason(''); }}>{t.report}</button></>}</div>}
        {reporting === p.id && <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (!client) return; void action(async () => { const r = await client.from('community_reports').insert({ post_id: p.id, reason: reason.trim() }); if (!r.error) setReporting(null); return r; }, t.reported); }}><label htmlFor={`report-${p.id}`} className="block text-sm">{t.reason}</label><textarea id={`report-${p.id}`} className={field} minLength={5} maxLength={500} required value={reason} onChange={e => setReason(e.target.value)} /><button className={button} disabled={busy}>{t.submit}</button> <button type="button" className={button} onClick={() => setReporting(null)}>{t.cancel}</button></form>}
        <div className="space-y-3 border-t border-white/10 pt-4"><h3 className="text-sm font-medium">{t.comments}</h3>{comments.filter(c => c.post_id === p.id).map(c => <p key={c.id} className="rounded-xl bg-white/5 p-3 text-sm whitespace-pre-wrap break-words">{c.body} {c.status === 'pending' && <span className="text-xs text-amber-300">· {t.pending}</span>}</p>)}
        {auth.user && p.status === 'approved' && <form className="space-y-2" onSubmit={e => { e.preventDefault(); const value = (commentDraft[p.id] || '').trim(); if (!client || !value) return; void action(async () => { const r = await client.from('community_comments').insert({ post_id: p.id, body: value }); if (!r.error) setCommentDraft(old => ({ ...old, [p.id]: '' })); return r; }, t.saved); }}><label className="sr-only" htmlFor={`comment-${p.id}`}>{t.comment}</label><textarea id={`comment-${p.id}`} className={field} maxLength={1000} required placeholder={t.comment} value={commentDraft[p.id] || ''} onChange={e => setCommentDraft(old => ({ ...old, [p.id]: e.target.value }))} /><button className={button} disabled={busy}>{t.send}</button></form>}</div>
      </article>)}
      {posts.length >= limit && <button className={button} onClick={() => setLimit(n => n + 20)}>{t.more}</button>}
    </section>
    <aside className="space-y-4">{client && auth.user && <CommunityNotifications key={`notifications-${auth.user.id}`} client={client} userId={auth.user.id} lang={lang} />}{client && auth.user && <CommunityProfile key={auth.user.id} client={client} userId={auth.user.id} lang={lang} onSaved={() => void refresh()} />}<div className="surface p-5 text-sm text-ink-2">{t.privateNotice}</div>{queue && client && <CommunityReports client={client} lang={lang} onResolved={() => void refresh()} />}{queue && <section className="surface space-y-3 p-5"><h2 className="font-medium">{t.moderation}</h2>{queue.length === 0 && <p className="text-sm text-ink-2">{t.noqueue}</p>}{queue.map(item => <div key={`${item.kind}-${item.id}`} className="space-y-2 border-t border-white/10 pt-3"><p className="text-xs text-ink-3">{(moderationKinds[lang] || moderationKinds.en)[item.kind]}</p><p className="break-words whitespace-pre-wrap text-sm">{item.body}</p><div className="flex gap-2"><button className={button} disabled={busy} onClick={() => client && void action(() => client.rpc('community_review', { item_id: item.id, item_kind: item.kind, decision: 'approved', expected_body: item.body }))}>{t.approve}</button><button className={button} disabled={busy} onClick={() => client && void action(() => client.rpc('community_review', { item_id: item.id, item_kind: item.kind, decision: 'rejected', expected_body: item.body }))}>{t.reject}</button></div></div>)}</section>}</aside>
  </div>;
}
