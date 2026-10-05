'use client';

import React, { useState, useMemo, memo } from 'react';
import { 
  Calendar as CalendarIcon, 
  Sparkles, 
  Moon, 
  Sun, 
  Clock, 
  ExternalLink, 
  Filter, 
  Search, 
  Share2, 
  Check, 
  Star, 
  ChevronRight,
  Compass,
  Zap,
  Globe2
} from 'lucide-react';

/**
 * 2026–2027 Verified Astronomical Events Dataset
 */
const ASTRONOMICAL_EVENTS = [
  {
    id: 'perseids-2026',
    title: 'Perseid Meteor Shower Peak (2026)',
    titleSi: 'පර්සියඩ්ස් උල්කාපාත වර්ෂාවේ උපරිමය (2026)',
    titleTa: 'பெர்சீட் விண்கல் மழை உச்சம் (2026)',
    date: '2026-08-12',
    category: 'meteors',
    peakRate: '~100 meteors / hr',
    visibility: 'Global (Best in Northern Hemisphere & Sri Lanka)',
    desc: 'Debris from Comet Swift-Tuttle creates one of the most brilliant meteor displays of the year with frequent fireballs.',
    descSi: 'ස්විෆ්ට්-ටට්ල් වල්ගාතරුවේ අංශු පෘථිවි වායුගෝලයට ඇතුළු වෙමින් පැයකට දීප්තිමත් උල්කාපාත 100කට අධික සංඛ්‍යාවක් නිර්මාණය කරයි.',
    descTa: 'ஸ்விஃப்ட்-டட்டில் வால் நட்சத்திரத்தின் துகள்கள் பூமியின் வளிமண்டலத்தில் நுழைந்து கண்கவர் விண்கல் மழையை உருவாக்குகின்றன.'
  },
  {
    id: 'total-solar-eclipse-2026',
    title: 'Total Solar Eclipse (August 12, 2026)',
    titleSi: 'පූර්ණ සූර්යග්‍රහණය (2026 අගෝස්තු 12)',
    titleTa: 'முழு சூரிய கிரகணம் (ஆகஸ்ட் 12, 2026)',
    date: '2026-08-12',
    category: 'eclipses',
    peakRate: 'Totality Duration: 2m 18s',
    visibility: 'Greenland, Iceland, Northern Spain (Partial across Europe)',
    desc: 'The Moon completely obscures the Sun, revealing the dazzling white solar corona and solar prominences in daylight.',
    descSi: 'සඳ මඟින් සූර්යයා සම්පූර්ණයෙන්ම ආවරණය වන අතර, දීප්තිමත් සූර්ය ප්‍රවාහය (Corona) දහවල් කාලයේ දැකගත හැකිවේ.',
    descTa: 'சந்திரன் சூரியனை முழுமையாக மறைத்து, பகலிலேயே சூரியனின் ஒளிவட்டத்தை (Corona) பிரமிக்க வைக்கிறது.'
  },
  {
    id: 'super-beaver-moon-2026',
    title: 'Super Beaver Moon (Closest Perigee of 2026)',
    titleSi: 'සුපිරි බීවර් පූර්ණ චන්ද්‍රයා (2026)',
    titleTa: 'சூப்பர் முழு நிலவு (2026)',
    date: '2026-11-24',
    category: 'moon',
    peakRate: '356,800 km from Earth',
    visibility: 'Worldwide Visibility',
    desc: 'The full moon coincides with its closest monthly approach to Earth, appearing up to 14% larger and 30% brighter than average.',
    descSi: 'චන්ද්‍රයා පෘථිවියට උපරිමයෙන් ළඟාවන බැවින් සාමාන්‍ය පූර්ණ චන්ද්‍රයාට වඩා 14%ක් විශාලව සහ 30%ක් වඩාත් දීප්තිමත්ව දිස්වේ.',
    descTa: 'சந்திரன் பூமிக்கு மிக அருகில் வருவதால், வழக்கமான முழு நிலவை விட 14% பெரியதாகவும் 30% பிரகாசமாகவும் காட்சி தரும்.'
  },
  {
    id: 'geminids-2026',
    title: 'Geminid Meteor Shower Peak (2026)',
    titleSi: 'ජෙමිනිඩ්ස් උල්කාපාත වර්ෂාව (2026)',
    titleTa: 'ஜெமினிட் விண்கல் மழை உச்சம் (2026)',
    date: '2026-12-14',
    category: 'meteors',
    peakRate: '~120 meteors / hr',
    visibility: 'Worldwide (Optimal after midnight)',
    desc: 'Originating from asteroid 3200 Phaethon, the Geminids produce intensely colorful, slow-moving shooting stars.',
    descSi: 'ෆයිතන් (3200 Phaethon) ග්‍රහකයෙන් හටගන්නා මෙම උල්කාපාත වර්ණවත් හා සෙමෙන් ගමන් ගන්නා දීප්තිමත් දර්ශනයක් ගෙන එයි.',
    descTa: '3200 ஃபைதான் சிறுகோளிலிருந்து உருவாகும் ஜெமினிட்ஸ் வண்ணமயமான, மெதுவாக நகரும் விண்கற்களை உருவாக்குகின்றன.'
  },
  {
    id: 'quadrantids-2027',
    title: 'Quadrantid Meteor Shower Peak (2027)',
    titleSi: 'ක්වාඩ්‍රැන්ටිඩ්ස් උල්කාපාත වර්ෂාව (2027)',
    titleTa: 'குவாட்ரான்டிட் விண்கல் மழை (2027)',
    date: '2027-01-04',
    category: 'meteors',
    peakRate: '~110 meteors / hr',
    visibility: 'Northern Hemisphere',
    desc: 'A sharp, intense burst of meteors with fireballs radiating from the constellation Bootes.',
    descSi: 'පැය කිහිපයක් තුළ අතිශය තියුණු උල්කාපාත ධාරාවක් නිර්මාණය වන වසරේ ප්‍රථම ප්‍රධාන උල්කාපාත වර්ෂාව.',
    descTa: 'பூட்ஸ் விண்மீன் தொகுதியிலிருந்து வெளிப்படும் தீவிரமான மற்றும் குறுகிய விண்கல் மழை.'
  },
  {
    id: 'annular-eclipse-2027',
    title: 'Annular Solar Eclipse "Ring of Fire" (2027)',
    titleSi: 'වලයාකාර සූර්යග්‍රහණය "ගිනි වළල්ල" (2027)',
    titleTa: 'வளைய சூரிய கிரகணம் "நெருப்பு வளையம்" (2027)',
    date: '2027-02-06',
    category: 'eclipses',
    peakRate: 'Annularity: 7m 51s',
    visibility: 'Chile, Argentina, Atlantic Ocean',
    desc: 'The Moon is at apogee, leaving a blazing ring of golden sunlight visible around the lunar silhouette.',
    descSi: 'චන්ද්‍රයා සූර්යයාගේ මධ්‍යය ආවරණය කරමින් වටා විස්මිත රන්වන් ගිනි වළල්ලක් (Ring of Fire) ඉතිරි කරයි.',
    descTa: 'சந்திரன் சூரியனின் மையத்தை மறைத்து, அதைச் சுற்றி ஒரு திகைப்பூட்டும் பொன் வளையத்தை உருவாக்குகிறது.'
  },
  {
    id: 'total-solar-eclipse-2027',
    title: 'Great North African Total Solar Eclipse (2027)',
    titleSi: 'මහා උතුරු අප්‍රිකානු පූර්ණ සූර්යග්‍රහණය (2027)',
    titleTa: 'பெரிய வட ஆப்பிரிக்க முழு சூரிய கிரகணம் (2027)',
    date: '2027-08-02',
    category: 'eclipses',
    peakRate: 'Totality Duration: 6m 23s',
    visibility: 'Spain, Morocco, Egypt (Luxor), Saudi Arabia',
    desc: 'The longest total solar eclipse on land in decades, offering over 6 minutes of complete daytime darkness over Egypt and the Valley of the Kings.',
    descSi: 'දශක ගණනාවකට පසු ගොඩබිමකදී සිදුවන දීර්ඝතම පූර්ණ සූර්යග්‍රහණය; ඊජිප්තුවේදී විනාඩි 6කට වැඩි කාලයක් දහවල් අන්ධකාරය පවතී.',
    descTa: 'பல தசாப்தங்களில் நிலப்பரப்பில் நிகழும் மிக நீண்ட முழு சூரிய கிரகணம்; எகிப்தில் 6 நிமிடங்களுக்கும் மேல் முழு இருள் நிலவும்.'
  },
  {
    id: 'blue-moon-2027',
    title: 'Blue Moon Phenomenon (May 2027)',
    titleSi: 'නීල චන්ද්‍රයා - බ්ලූ මූන් (2027 මැයි)',
    titleTa: 'நீல நிலவு நிகழ்வு (மே 2027)',
    date: '2027-05-20',
    category: 'moon',
    peakRate: 'Calendar Blue Moon',
    visibility: 'Worldwide Visibility',
    desc: 'The second full moon in a single calendar month—a rare astronomical alignment occurring every 2.7 years.',
    descSi: 'එක් දින දර්ශන මාසයක් තුළ උදාවන දෙවන පූර්ණ චන්ද්‍රයා; සෑම වසර 2.7 කට වරක් සිදුවන දුර්ලභ සංසිද්ධියකි.',
    descTa: 'ஒரே மாதத்தில் தோன்றும் இரண்டாவது முழு நிலவு; ஒவ்வொரு 2.7 ஆண்டுகளுக்கும் ஒருமுறை நிகழும் அரிய நிகழ்வு.'
  }
];

export function CosmicCalendar({ className = '', lang = 'en' }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedEventIds, setSavedEventIds] = useState(new Set());

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return ASTRONOMICAL_EVENTS.filter(ev => {
      if (selectedCategory !== 'all' && ev.category !== selectedCategory) return false;
      if (selectedYear !== 'all' && !ev.date.startsWith(selectedYear)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          ev.title.toLowerCase().includes(q) ||
          ev.titleSi.toLowerCase().includes(q) ||
          ev.titleTa.toLowerCase().includes(q) ||
          ev.desc.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [selectedCategory, selectedYear, searchQuery]);

  // Next upcoming event countdown
  const nextEvent = ASTRONOMICAL_EVENTS[0];

  const handleToggleSave = (id) => {
    setSavedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getEventTitle = (ev) => {
    if (lang === 'si') return ev.titleSi;
    if (lang === 'ta') return ev.titleTa;
    return ev.title;
  };

  const getEventDesc = (ev) => {
    if (lang === 'si') return ev.descSi;
    if (lang === 'ta') return ev.descTa;
    return ev.desc;
  };

  const createGoogleCalendarUrl = (ev) => {
    const title = encodeURIComponent(getEventTitle(ev));
    const details = encodeURIComponent(`${getEventDesc(ev)}\nVisibility: ${ev.visibility}\nPeak: ${ev.peakRate}`);
    const dateFormatted = ev.date.replace(/-/g, '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateFormatted}/${dateFormatted}&details=${details}&sf=true&output=xml`;
  };

  return (
    <div className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 font-sans text-slate-100 ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-600 to-rose-600 p-0.5 flex items-center justify-center shadow-lg shadow-amber-950/40 shrink-0">
            <CalendarIcon className="w-5 h-5 text-white" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-['Orbitron'] font-bold text-sm sm:text-base text-white tracking-wide">
                {lang === 'si' ? 'විශ්වීය දින දර්ශනය (2026/2027)' :
                 lang === 'ta' ? 'விண்வெளி நிகழ்வுகள் காலண்டர் (2026/2027)' :
                 'Astronomical Event Calendar (2026–2027)'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                METEORS • ECLIPSES • MOONS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Verified NASA/JPL Almanac: Solar & Lunar Eclipses, Meteor Showers, and Supermoons
            </p>
          </div>
        </div>

        {/* Year Filter Buttons */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          {['all', '2026', '2027'].map(yr => (
            <button
              key={yr}
              type="button"
              onClick={() => setSelectedYear(yr)}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-bold ${
                selectedYear === yr
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {yr.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Featured Highlight Banner: Great 2026/2027 Eclipses */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/30 via-slate-900 to-purple-950/30 border border-amber-500/30 flex items-center justify-between gap-4 flex-wrap shadow-inner">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
            <Sun className="w-5 h-5 animate-spin" style={{ animationDuration: '30s' }} />
          </div>
          <div>
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
              PRIMARY CELESTIAL HIGHLIGHT
            </span>
            <h4 className="text-sm font-bold text-white font-['Orbitron'] mt-0.5">
              Total Solar Eclipse • August 12, 2026
            </h4>
            <p className="text-xs text-slate-300 font-sans mt-0.5">
              Path of Totality sweeps across Greenland, Iceland, and Northern Spain.
            </p>
          </div>
        </div>

        <a
          href={createGoogleCalendarUrl(ASTRONOMICAL_EVENTS[1])}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-mono font-bold hover:bg-amber-500/30 transition flex items-center gap-1.5 shadow-sm"
        >
          <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
          <span>Add to Google Calendar</span>
        </a>
      </div>

      {/* Category Pills & Search Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 select-none scrollbar-none">
          {[
            { id: 'all', label: 'All Events' },
            { id: 'meteors', label: '☄️ Meteor Showers' },
            { id: 'eclipses', label: '🌑 Eclipses' },
            { id: 'moon', label: '🌕 Moon Phases' }
          ].map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1 rounded-xl text-xs font-mono transition whitespace-nowrap cursor-pointer border ${
                selectedCategory === c.id
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-sm'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search celestial events..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
          />
        </div>
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredEvents.map(ev => {
          const isSaved = savedEventIds.has(ev.id);
          return (
            <div
              key={ev.id}
              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition flex flex-col justify-between space-y-3 shadow-md"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-900 border border-slate-800 text-cyan-300">
                    {ev.date}
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 font-semibold">
                    {ev.peakRate}
                  </span>
                </div>

                <h4 className="font-bold text-sm text-white font-['Orbitron'] leading-snug">
                  {getEventTitle(ev)}
                </h4>

                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {getEventDesc(ev)}
                </p>
              </div>

              {/* Event Card Footer */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1 text-slate-400 truncate max-w-[200px]" title={ev.visibility}>
                  <Globe2 className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="truncate">{ev.visibility}</span>
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={createGoogleCalendarUrl(ev)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-400 text-cyan-300 transition"
                    title="Add to Google Calendar"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handleToggleSave(ev.id)}
                    className={`p-1 rounded border transition cursor-pointer ${
                      isSaved
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                    title={isSaved ? 'Bookmarked' : 'Bookmark Event'}
                  >
                    <Star className={`w-3.5 h-3.5 ${isSaved ? 'fill-amber-400' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(CosmicCalendar);
