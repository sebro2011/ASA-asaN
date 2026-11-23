import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupportedLanguage } from '../i18n/translations';
import GroupAdministration from './GroupAdministration';

const categories = ['astronomy','nasa_missions','mars','black_holes','photography','astrophysics','technology'] as const;
type Category = typeof categories[number];
const copy = {
  en: { title: 'Science groups', description: 'Public groups are reviewed before they appear. Join to contribute.', create: 'Create a group', name: 'Group name', about: 'Description', category: 'Category', send: 'Submit for review', pending: 'Awaiting review', rejected: 'Not approved', search: 'Filter loaded groups', none: 'No groups found.', join: 'Join', leave: 'Leave', owner: 'Group owner', member: 'Member', sign: 'Sign in above to create or join groups.', posts: 'Group posts', empty: 'No posts yet.', post: 'Share with the group', publish: 'Submit post for review', saved: 'Submitted for review.', error: 'Unable to complete the request.', loading: 'Loading groups…', more: 'Show more', all: 'All categories', names: { astronomy:'Astronomy', nasa_missions:'NASA Missions', mars:'Mars Exploration', black_holes:'Black Holes', photography:'Space Photography', astrophysics:'Astrophysics', technology:'Space Technology' } },
  si: { title:'විද්‍යා කණ්ඩායම්', description:'ප්‍රසිද්ධ කණ්ඩායම් පළ කිරීමට පෙර පරීක්ෂා කෙරේ. දායක වීමට එක්වන්න.', create:'කණ්ඩායමක් සාදන්න', name:'කණ්ඩායමේ නම', about:'විස්තරය', category:'කාණ්ඩය', send:'පරීක්ෂාවට යවන්න', pending:'පරීක්ෂාව බලාපොරොත්තුවෙන්', rejected:'අනුමත නොවීය', search:'පූරණය කළ කණ්ඩායම් පෙරන්න', none:'කණ්ඩායම් හමු නොවීය.', join:'එක්වන්න', leave:'ඉවත්වන්න', owner:'කණ්ඩායම් හිමිකරු', member:'සාමාජික', sign:'කණ්ඩායම් සෑදීමට හෝ එක්වීමට ඉහතින් ඇතුළු වන්න.', posts:'කණ්ඩායම් පළ කිරීම්', empty:'තවම පළ කිරීම් නැත.', post:'කණ්ඩායම සමඟ බෙදාගන්න', publish:'පළ කිරීම පරීක්ෂාවට යවන්න', saved:'පරීක්ෂාවට යවන ලදී.', error:'ඉල්ලීම සම්පූර්ණ කළ නොහැක.', loading:'කණ්ඩායම් පූරණය වේ…', more:'තවත් පෙන්වන්න', all:'සියලු කාණ්ඩ', names:{ astronomy:'තාරකා විද්‍යාව', nasa_missions:'නාසා මෙහෙයුම්', mars:'අඟහරු ගවේෂණය', black_holes:'කළු කුහර', photography:'අභ්‍යවකාශ ඡායාරූප', astrophysics:'තාරකා භෞතික විද්‍යාව', technology:'අභ්‍යවකාශ තාක්ෂණය' } },
  ta: { title:'அறிவியல் குழுக்கள்', description:'பொதுக் குழுக்கள் வெளியிடப்படும் முன் மதிப்பாய்வு செய்யப்படும். பங்களிக்க இணைக.', create:'குழுவை உருவாக்கு', name:'குழுவின் பெயர்', about:'விளக்கம்', category:'வகை', send:'மதிப்பாய்வுக்கு அனுப்பு', pending:'மதிப்பாய்வுக்காகக் காத்திருக்கிறது', rejected:'அங்கீகரிக்கப்படவில்லை', search:'ஏற்றிய குழுக்களை வடிகட்டு', none:'குழுக்கள் இல்லை.', join:'இணைக', leave:'வெளியேறு', owner:'குழு உரிமையாளர்', member:'உறுப்பினர்', sign:'குழுக்களை உருவாக்க அல்லது இணைய மேலே உள்நுழையவும்.', posts:'குழு இடுகைகள்', empty:'இன்னும் இடுகைகள் இல்லை.', post:'குழுவுடன் பகிருங்கள்', publish:'இடுகையை மதிப்பாய்வுக்கு அனுப்பு', saved:'மதிப்பாய்வுக்கு அனுப்பப்பட்டது.', error:'கோரிக்கையை முடிக்க முடியவில்லை.', loading:'குழுக்கள் ஏற்றப்படுகின்றன…', more:'மேலும் காட்டு', all:'அனைத்து வகைகளும்', names:{ astronomy:'வானியல்', nasa_missions:'நாசா பயணங்கள்', mars:'செவ்வாய் ஆய்வு', black_holes:'கருந்துளைகள்', photography:'விண்வெளி புகைப்படம்', astrophysics:'வானியற்பியல்', technology:'விண்வெளி தொழில்நுட்பம்' } },
} as const;
type Group = { id: string; owner_id: string; name: string; description: string; category: Category; status: string };
type Membership = { group_id: string; role: 'owner' | 'admin' | 'member' };
type Post = { id: string; body: string; status: string };
const field = 'w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400';
const button = 'rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-ink hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50';

export default function ScienceGroups({ client, userId, lang, onChanged }: { client: SupabaseClient; userId: string | null; lang: SupportedLanguage; onChanged: () => void }) {
  const t = copy[lang] || copy.en;
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('astronomy'); const [filter, setFilter] = useState('');
  const [filterCategory, setFilterCategory] = useState(''); const [body, setBody] = useState('');
  const [limit, setLimit] = useState(20);
  const refresh = useCallback(async () => {
    try {
      const [g,m] = await Promise.all([client.from('community_groups').select('id,owner_id,name,description,category,status').order('created_at',{ascending:false}).limit(limit), userId ? client.from('community_group_members').select('group_id,role') : Promise.resolve({data:[],error:null})]);
      if (g.error || m.error) setMessage(t.error); else { setGroups((g.data || []) as Group[]); setMembers((m.data || []) as Membership[]); }
    } catch { setMessage(t.error); } finally { setLoading(false); }
  }, [client,userId,limit,t.error]);
  const refreshPosts = useCallback(async () => {
    if (!selected) { setPosts([]); return; }
    try { const p = await client.from('community_posts').select('id,body,status').eq('group_id',selected).order('created_at',{ascending:false}).limit(50); if (p.error) setMessage(t.error); else setPosts((p.data || []) as Post[]); } catch { setMessage(t.error); }
  }, [client,selected,t.error]);
  useEffect(() => { void refresh(); }, [refresh]); useEffect(() => { void refreshPosts(); }, [refreshPosts,userId]);
  const action = async (fn: () => PromiseLike<{ error: unknown }>, success?: string) => {
    if (busy) return; setBusy(true); setMessage('');
    try { const r = await fn(); if (r.error) setMessage(t.error); else { if (success) setMessage(success); await Promise.all([refresh(),refreshPosts()]); onChanged(); } } catch { setMessage(t.error); } finally { setBusy(false); }
  };
  const create = (e: FormEvent) => { e.preventDefault(); if (!name.trim() || !description.trim()) return; void action(async () => { const r=await client.from('community_groups').insert({name:name.trim(),description:description.trim(),category}); if (!r.error) {setName('');setDescription('');} return r; },t.saved); };
  const active = groups.find(g => g.id === selected);
  const membership = members.find(m => m.group_id === selected);
  return <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="science-groups-title">
    <h2 id="science-groups-title" className="text-lg font-semibold">{t.title}</h2><p className="text-sm text-ink-2">{t.description}</p>
    {userId ? <details><summary className="cursor-pointer text-sm font-medium">{t.create}</summary><form onSubmit={create} className="mt-3 space-y-3"><label className="block text-sm">{t.name}<input className={`${field} mt-1`} required minLength={3} maxLength={80} value={name} onChange={e=>setName(e.target.value)} /></label><label className="block text-sm">{t.about}<textarea className={`${field} mt-1`} required minLength={5} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} /></label><label className="block text-sm">{t.category}<select className={`${field} mt-1`} value={category} onChange={e=>setCategory(e.target.value as Category)}>{categories.map(c=><option key={c} value={c}>{t.names[c]}</option>)}</select></label><button className={button} disabled={busy}>{t.send}</button></form></details> : <p className="text-sm text-ink-2">{t.sign}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="grid gap-2 sm:grid-cols-2"><label><span className="sr-only">{t.search}</span><input className={field} placeholder={t.search} value={filter} onChange={e=>setFilter(e.target.value)} /></label><label><span className="sr-only">{t.category}</span><select className={field} value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}><option value="">{t.all}</option>{categories.map(c=><option key={c} value={c}>{t.names[c]}</option>)}</select></label></div>
    {loading ? <p role="status">{t.loading}</p> : groups.filter(g=>(!filterCategory || g.category===filterCategory) && `${g.name} ${g.description}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).length===0 && <p className="text-sm text-ink-2">{t.none}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{groups.filter(g=>(!filterCategory || g.category===filterCategory) && `${g.name} ${g.description}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(g=><button key={g.id} type="button" aria-pressed={selected===g.id} onClick={()=>setSelected(g.id)} className="rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><span className="block text-xs text-ink-3">{t.names[g.category]}</span><span className="mt-1 block break-words font-medium">{g.name}</span><span className="mt-1 block break-words text-sm text-ink-2">{g.description}</span>{g.status!=='approved' && <span className="mt-2 block text-xs text-amber-300">{g.status==='pending'?t.pending:t.rejected}</span>}</button>)}</div>
    {groups.length>=limit && <button className={button} onClick={()=>setLimit(n=>n+20)}>{t.more}</button>}
    {active && <div className="space-y-3 border-t border-white/10 pt-4"><h3 className="font-medium">{active.name} · {t.posts}</h3>{userId && (membership?.role==='owner' ? <p className="text-sm text-ink-2">{t.owner}</p> : membership ? <button className={button} disabled={busy} onClick={()=>void action(()=>client.from('community_group_members').delete().eq('group_id',active.id))}>{t.leave}</button> : active.status==='approved' && <button className={button} disabled={busy} onClick={()=>void action(()=>client.from('community_group_members').insert({group_id:active.id}))}>{t.join}</button>)}
      {userId && active.status==='approved' && (membership?.role==='owner' || membership?.role==='admin') && <GroupAdministration key={active.id} client={client} groupId={active.id} actorId={userId} actorRole={membership.role} lang={lang} />}
      {posts.length===0 && <p className="text-sm text-ink-2">{t.empty}</p>}{posts.map(p=><p key={p.id} className="whitespace-pre-wrap break-words rounded-xl bg-white/5 p-3 text-sm">{p.body} {p.status==='pending' && <span className="text-xs text-amber-300">· {t.pending}</span>}</p>)}
      {userId && membership && active.status==='approved' && <form onSubmit={e=>{e.preventDefault(); if (!body.trim()) return; void action(async ()=>{const r=await client.from('community_posts').insert({group_id:active.id,body:body.trim()}); if(!r.error)setBody('');return r;},t.saved);}} className="space-y-2"><label htmlFor="group-post" className="block text-sm">{t.post}</label><textarea id="group-post" className={field} maxLength={2000} required value={body} onChange={e=>setBody(e.target.value)} /><button className={button} disabled={busy}>{t.publish}</button></form>}
    </div>}
  </section>;
}
