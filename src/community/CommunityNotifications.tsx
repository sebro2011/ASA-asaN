import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupportedLanguage } from '../i18n/translations';

const text = {
  en: { title:'Notifications', refresh:'Refresh', empty:'No notifications yet.', loading:'Loading notifications…', error:'Unable to load or update notifications.', read:'Mark as read', remove:'Dismiss', unread:'Unread', events:{post_approved:'Your post was approved.',post_rejected:'Your post was not approved or was removed.',comment_approved:'Your comment was approved.',comment_rejected:'Your comment was not approved.',profile_approved:'Your display name was approved.',profile_rejected:'Your display name was not approved.',group_approved:'Your group was approved.',group_rejected:'Your group was not approved.',report_resolved:'A report you submitted was reviewed.'} },
  si: { title:'දැනුම්දීම්', refresh:'යාවත්කාලීන කරන්න', empty:'තවම දැනුම්දීම් නැත.', loading:'දැනුම්දීම් පූරණය වේ…', error:'දැනුම්දීම් පූරණය කිරීමට හෝ වෙනස් කිරීමට නොහැක.', read:'කියවූ ලෙස සලකුණු කරන්න', remove:'ඉවත් කරන්න', unread:'නොකියවූ', events:{post_approved:'ඔබේ පළ කිරීම අනුමත විය.',post_rejected:'ඔබේ පළ කිරීම අනුමත නොවීය හෝ ඉවත් කරන ලදී.',comment_approved:'ඔබේ අදහස අනුමත විය.',comment_rejected:'ඔබේ අදහස අනුමත නොවීය.',profile_approved:'ඔබේ ප්‍රසිද්ධ නම අනුමත විය.',profile_rejected:'ඔබේ ප්‍රසිද්ධ නම අනුමත නොවීය.',group_approved:'ඔබේ කණ්ඩායම අනුමත විය.',group_rejected:'ඔබේ කණ්ඩායම අනුමත නොවීය.',report_resolved:'ඔබ යැවූ වාර්තාවක් පරීක්ෂා කරන ලදී.'} },
  ta: { title:'அறிவிப்புகள்', refresh:'புதுப்பி', empty:'இன்னும் அறிவிப்புகள் இல்லை.', loading:'அறிவிப்புகள் ஏற்றப்படுகின்றன…', error:'அறிவிப்புகளை ஏற்றவோ மாற்றவோ முடியவில்லை.', read:'படித்ததாகக் குறி', remove:'அகற்று', unread:'படிக்காதது', events:{post_approved:'உங்கள் இடுகை அங்கீகரிக்கப்பட்டது.',post_rejected:'உங்கள் இடுகை அங்கீகரிக்கப்படவில்லை அல்லது அகற்றப்பட்டது.',comment_approved:'உங்கள் கருத்து அங்கீகரிக்கப்பட்டது.',comment_rejected:'உங்கள் கருத்து அங்கீகரிக்கப்படவில்லை.',profile_approved:'உங்கள் காட்சிப் பெயர் அங்கீகரிக்கப்பட்டது.',profile_rejected:'உங்கள் காட்சிப் பெயர் அங்கீகரிக்கப்படவில்லை.',group_approved:'உங்கள் குழு அங்கீகரிக்கப்பட்டது.',group_rejected:'உங்கள் குழு அங்கீகரிக்கப்படவில்லை.',report_resolved:'நீங்கள் அளித்த புகார் மதிப்பாய்வு செய்யப்பட்டது.'} },
} as const;
type EventKind = keyof typeof text.en.events;
type Notification = { id: string; event: EventKind; created_at: string; read_at: string | null };
const button = 'rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-ink hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50';

export default function CommunityNotifications({ client, userId, lang }: { client: SupabaseClient; userId: string; lang: SupportedLanguage }) {
  const t = text[lang] || text.en;
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await client.from('community_notifications').select('id,event,created_at,read_at').eq('recipient_id',userId).order('created_at',{ascending:false}).limit(50);
      if (result.error) setError(true); else { setItems((result.data || []) as Notification[]); setError(false); }
    } catch { setError(true); } finally { setLoading(false); }
  }, [client,userId]);
  useEffect(() => { setItems([]); setLoading(true); void refresh(); },[refresh]);
  const change = async (item: Notification, remove: boolean) => {
    if (busy) return; setBusy(true); setError(false);
    try {
      const result = remove ? await client.from('community_notifications').delete().eq('id',item.id).eq('recipient_id',userId) : await client.from('community_notifications').update({read_at:new Date().toISOString()}).eq('id',item.id).eq('recipient_id',userId);
      if (result.error) setError(true); else await refresh();
    } catch { setError(true); } finally { setBusy(false); }
  };
  return <section className="surface space-y-3 p-5" aria-labelledby="community-notifications-title"><div className="flex items-center justify-between gap-2"><h2 id="community-notifications-title" className="font-medium">{t.title}</h2><button className={button} onClick={()=>void refresh()} disabled={busy}>{t.refresh}</button></div>{loading ? <p role="status" className="text-sm">{t.loading}</p> : error ? <p role="alert" className="text-sm">{t.error}</p> : items.length===0 && <p className="text-sm text-ink-2">{t.empty}</p>}{items.map(item=><article key={item.id} className="space-y-2 border-t border-white/10 pt-3"><p className="text-sm">{t.events[item.event]}</p><div className="flex flex-wrap items-center gap-2 text-xs text-ink-3"><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString(lang)}</time>{!item.read_at && <span>{t.unread}</span>}</div><div className="flex flex-wrap gap-2">{!item.read_at && <button className={button} disabled={busy} onClick={()=>void change(item,false)}>{t.read}</button>}<button className={button} disabled={busy} onClick={()=>void change(item,true)}>{t.remove}</button></div></article>)}</section>;
}
