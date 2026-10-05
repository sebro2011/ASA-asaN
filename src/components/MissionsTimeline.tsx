import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SupportedLanguage, translations } from '../i18n/translations';
import { SPACE_MISSIONS, SpaceMission } from '../data/missions';
import { useFavorites } from '../utils/favorites';
import { VoiceSearchInput } from './VoiceSearchInput';
import { 
  Rocket, 
  Milestone, 
  ShieldCheck, 
  Radio, 
  CheckCircle2, 
  ChevronRight, 
  Gauge, 
  Sparkles, 
  Heart, 
  Zap, 
  Globe, 
  ExternalLink, 
  Loader2, 
  Search, 
  RotateCcw, 
  Info,
  Clock,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Bookmark,
  Compass,
  Telescope,
  Atom,
  Flame
} from 'lucide-react';

interface MissionsTimelineProps {
  lang: SupportedLanguage;
  initialMissionId?: string;
}

interface GroundedSearchResult {
  query: string;
  answer: string;
  sources: { title: string; url: string; domain?: string }[];
  searchQueries?: string[];
  provider?: string;
  error?: string;
  fallbackMessage?: string;
}

// Quick 1-click preset filter suggestions
const QUICK_SEARCH_CHIPS = [
  { id: 'all', label: { en: 'All Missions', si: 'සියල්ල', ta: 'அனைத்தும்' }, query: '' },
  { id: 'apollo', label: { en: 'Apollo 11', si: 'ඇපලෝ 11', ta: 'அப்பல்லோ 11' }, query: 'Apollo' },
  { id: 'artemis', label: { en: 'Artemis', si: 'ආටෙමිස්', ta: 'ஆர்ட்டெமிஸ்' }, query: 'Artemis' },
  { id: 'jwst', label: { en: 'James Webb', si: 'ජේම්ස් වෙබ්', ta: 'ஜேම්ස් வெப்' }, query: 'Webb' },
  { id: 'perseverance', label: { en: 'Perseverance', si: 'පර්සවරන්ස්', ta: 'பெர்செவரன்ஸ்' }, query: 'Perseverance' },
  { id: 'curiosity', label: { en: 'Curiosity', si: 'කියුරියෝසිටි', ta: 'கியூரியோசிட்டி' }, query: 'Curiosity' },
  { id: 'voyager', label: { en: 'Voyager', si: 'වොයේජර්', ta: 'வாயேஜர்' }, query: 'Voyager' },
  { id: 'moon', label: { en: 'Lunar / Moon', si: 'චන්ද්‍ර ගවේෂණ', ta: 'நிலவுப் பயணம்' }, query: 'Moon' },
  { id: 'mars', label: { en: 'Mars Explorers', si: 'අඟහරු ගවේෂණ', ta: 'செவ்வாய்' }, query: 'Mars' },
];

// Trending Google Search Grounding Exploration Topics
const TRENDING_GROUNDED_TOPICS = [
  { id: 'europa-clipper', name: { en: 'Europa Clipper', si: 'යුරෝපා ක්ලිපර්', ta: 'யூரோப்பா கிளிப்பர்' }, query: 'Europa Clipper mission NASA status' },
  { id: 'parker-solar', name: { en: 'Parker Solar Probe', si: 'පාකර් සූර්ය යානය', ta: 'பார்க்கர் விண்கலம்' }, query: 'Parker Solar Probe record close approach NASA' },
  { id: 'artemis-3', name: { en: 'Artemis III Crewed Landing', si: 'ආටෙමිස් III සඳ ගොඩබැසීම', ta: 'ஆர்ட்டெமிஸ் III மனித தரையிறக்கம்' }, query: 'Artemis 3 NASA crew landing updates' },
  { id: 'dragonfly', name: { en: 'Dragonfly Titan Rotorcraft', si: 'ඩ්‍රැගන්ෆ්ලයි ටයිටන් යානය', ta: 'டிராகன்ஃபிளை விண்கலம்' }, query: 'Dragonfly mission Saturn moon Titan NASA' },
  { id: 'roman-telescope', name: { en: 'Nancy Grace Roman Telescope', si: 'රෝමන් අභ්‍යවකාශ දුරේක්ෂය', ta: 'ரோமன் விண்வெளி தொலைநோக்கி' }, query: 'Nancy Grace Roman Space Telescope launch date' },
  { id: 'osiris-apex', name: { en: 'OSIRIS-APEX (Apophis)', si: 'ඔසිරිස්-ඇපෙක්ස් ඇපොෆිස්', ta: 'ஒசிரிஸ்-அபெக்ஸ்' }, query: 'OSIRIS-APEX asteroid Apophis mission NASA' },
];

export const MissionsTimeline: React.FC<MissionsTimelineProps> = React.memo(({ lang, initialMissionId }) => {
  const t = translations[lang];
  const { isMissionSaved, toggleSaveMission } = useFavorites();
  const [selectedMissionId, setSelectedMissionId] = useState<string>(initialMissionId || SPACE_MISSIONS[0].id);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchExecutionMs, setSearchExecutionMs] = useState<number>(1.2);
  const [activeChipId, setActiveChipId] = useState<string>('all');

  // Google Search Grounding state
  const [isGroundedSearching, setIsGroundedSearching] = useState<boolean>(false);
  const [groundedResult, setGroundedResult] = useState<GroundedSearchResult | null>(null);
  const [showGroundedSection, setShowGroundedSection] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [copiedBriefing, setCopiedBriefing] = useState<boolean>(false);

  useEffect(() => {
    if (initialMissionId && initialMissionId !== selectedMissionId) {
      setSelectedMissionId(initialMissionId);
      setActiveStepIndex(0);
    }
  }, [initialMissionId]);

  // Ultra-fast millisecond auto-search pipeline
  const { filteredMissions, executionDuration } = useMemo(() => {
    const t0 = performance.now();
    const q = searchQuery.toLowerCase().trim();

    if (!q) {
      const t1 = performance.now();
      return { filteredMissions: SPACE_MISSIONS, executionDuration: Math.max(0.4, t1 - t0) };
    }

    const tokens = q.split(/\s+/).filter(Boolean);

    const matches = SPACE_MISSIONS.filter(m => {
      const enName = m.name.en.toLowerCase();
      const siName = m.name.si.toLowerCase();
      const taName = m.name.ta.toLowerCase();
      const year = m.year.toLowerCase();
      const operator = m.operator.toLowerCase();
      const enSummary = m.summary.en.toLowerCase();
      const siSummary = m.summary.si.toLowerCase();
      const taSummary = m.summary.ta.toLowerCase();
      const enDest = m.destination.en.toLowerCase();
      const siDest = m.destination.si.toLowerCase();
      const taDest = m.destination.ta.toLowerCase();

      return tokens.every(token => {
        return (
          enName.includes(token) ||
          siName.includes(token) ||
          taName.includes(token) ||
          year.includes(token) ||
          operator.includes(token) ||
          enSummary.includes(token) ||
          siSummary.includes(token) ||
          taSummary.includes(token) ||
          enDest.includes(token) ||
          siDest.includes(token) ||
          taDest.includes(token) ||
          m.steps.some(s => 
            s.phase.toLowerCase().includes(token) || 
            s.title.en.toLowerCase().includes(token) || 
            s.title.si.toLowerCase().includes(token) ||
            s.title.ta.toLowerCase().includes(token)
          )
        );
      });
    });

    const t1 = performance.now();
    const duration = Math.max(0.6, t1 - t0);
    return { filteredMissions: matches, executionDuration: duration };
  }, [searchQuery]);

  // Update live execution timer in milliseconds
  useEffect(() => {
    setSearchExecutionMs(executionDuration);
  }, [executionDuration]);

  // Speech cleanup on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setActiveChipId('all');
      setGroundedResult(null);
      setShowGroundedSection(false);
      return;
    }

    const q = val.toLowerCase().trim();
    const matched = SPACE_MISSIONS.find(m => {
      return (
        m.name.en.toLowerCase().includes(q) ||
        m.name.si.includes(q) ||
        m.name.ta.includes(q) ||
        m.year.includes(q) ||
        m.destination.en.toLowerCase().includes(q) ||
        m.destination.si.includes(q) ||
        m.destination.ta.includes(q)
      );
    });

    if (matched) {
      setSelectedMissionId(matched.id);
      setActiveStepIndex(0);
    }
  };

  const handleChipClick = (chip: typeof QUICK_SEARCH_CHIPS[0]) => {
    setActiveChipId(chip.id);
    setSearchQuery(chip.query);
    setGroundedResult(null);
    setShowGroundedSection(false);

    if (chip.query) {
      const q = chip.query.toLowerCase();
      const matched = SPACE_MISSIONS.find(m => 
        m.name.en.toLowerCase().includes(q) || 
        m.name.si.includes(q) || 
        m.name.ta.includes(q)
      );
      if (matched) {
        setSelectedMissionId(matched.id);
        setActiveStepIndex(0);
      }
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveChipId('all');
    setGroundedResult(null);
    setShowGroundedSection(false);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Google Search Grounding with Gemini 3.5 Flash
  const handleGroundedSearch = async (termToSearch?: string) => {
    const queryTerm = termToSearch || searchQuery;
    if (!queryTerm.trim()) return;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    setIsGroundedSearching(true);
    setShowGroundedSection(true);

    try {
      const res = await fetch('/api/missions/grounded-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryTerm, lang })
      });

      if (res.ok) {
        const data = await res.json();
        setGroundedResult(data);
      } else {
        setGroundedResult({
          query: queryTerm,
          answer: lang === 'si'
            ? 'සජීවී ගූගල් දත්ත සෙවීම සම්බන්ධ කරගත නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න.'
            : lang === 'ta'
            ? 'நேரடி கூகுள் தேடலை இணைக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.'
            : 'Could not connect to live Google search grounding. Please try again.',
          sources: []
        });
      }
    } catch (err: any) {
      setGroundedResult({
        query: queryTerm,
        answer: lang === 'si'
          ? 'සෙවීම් සේවාව තාවකාලිකව සීමාවී ඇත.'
          : lang === 'ta'
          ? 'தேடல் சேவை தற்காலிகமாக கிடைக்கவில்லை.'
          : 'Search service temporarily busy.',
        sources: []
      });
    } finally {
      setIsGroundedSearching(false);
    }
  };

  // Text-to-speech audio read aloud
  const handleToggleSpeech = () => {
    if (!('speechSynthesis' in window) || !groundedResult?.answer) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = groundedResult.answer
      .replace(/###/g, '')
      .replace(/\*\*/g, '')
      .replace(/#/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-IN' : 'en-US';
    utterance.rate = 0.95;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleCopyBriefing = () => {
    if (!groundedResult?.answer) return;
    navigator.clipboard.writeText(groundedResult.answer);
    setCopiedBriefing(true);
    setTimeout(() => setCopiedBriefing(false), 2000);
  };

  const currentMission: SpaceMission = 
    filteredMissions.find(m => m.id === selectedMissionId) || filteredMissions[0] || SPACE_MISSIONS[0];

  return (
    <div className="w-full space-y-6">
      
      {/* Search Header Bar with Real-Time Millisecond Execution Badge */}
      <div className="bg-slate-900/80 p-4 sm:p-5 rounded-3xl border border-cyan-500/25 backdrop-blur-xl shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex-1 max-w-xl">
            <VoiceSearchInput
              value={searchQuery}
              onChange={handleSearchChange}
              onClear={handleClearSearch}
              lang={lang}
              placeholder={
                lang === 'si'
                  ? 'මෙහෙයුම් නම හඬින් හෝ ලියා සොයන්න (උදා: ඇපලෝ 11, ආටෙමිස්, යුරෝපා ක්ලිපර්)...'
                  : lang === 'ta'
                  ? 'பணிகளை குரல் மூலம் தேடுங்கள் (எ.கா: அப்பல்லோ 11, ஆர்ட்டெமிஸ், யூரோப்பா)...'
                  : 'Speak or search missions (e.g., Apollo 11, Artemis, Europa Clipper)...'
              }
            />
          </div>

          {/* Real-Time Millisecond Telemetry & Results Counter */}
          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-200 text-xs font-mono font-bold flex items-center gap-1.5 shadow-md shadow-cyan-950/50">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-pulse" />
              <span>
                {lang === 'si'
                  ? `${searchExecutionMs.toFixed(1)} ms තුළ සෙවිණි`
                  : lang === 'ta'
                  ? `${searchExecutionMs.toFixed(1)} ms இல் தேடப்பட்டது`
                  : `Searched in ${searchExecutionMs.toFixed(1)} ms`}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-300 text-xs font-mono flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>
                {lang === 'si'
                  ? `ප්‍රතිඵල ${filteredMissions.length} ක්`
                  : lang === 'ta'
                  ? `${filteredMissions.length} முடிவுகள்`
                  : `${filteredMissions.length} found`}
              </span>
            </div>

            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-mono transition flex items-center gap-1"
                title="Clear search query"
              >
                <RotateCcw className="w-3 h-3 text-cyan-400" />
                <span>{lang === 'si' ? 'මකන්න' : lang === 'ta' ? 'அழி' : 'Clear'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Instant 1-Click Suggestion / Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 pr-1">
            <Rocket className="w-3 h-3 text-cyan-500" />
            {lang === 'si' ? 'ඉක්මන් සෙවුම්:' : lang === 'ta' ? 'விரைவு தேடல்:' : 'Quick Filters:'}
          </span>
          {QUICK_SEARCH_CHIPS.map(chip => {
            const isSelected = activeChipId === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => handleChipClick(chip)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400/60 shadow-md shadow-cyan-600/30 scale-105'
                    : 'bg-slate-950/60 text-slate-400 hover:text-white border-slate-800 hover:border-slate-700'
                }`}
              >
                {chip.label[lang] || chip.label.en}
              </button>
            );
          })}
        </div>

        {/* Google Grounded Discovery Trending Highlights Strip */}
        <div className="pt-2 border-t border-slate-800/70 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 font-semibold">
              <Globe className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>
                {lang === 'si' ? 'Google Search Grounding සමඟ සජීවීව සොයන්න:' : lang === 'ta' ? 'கூகுள் தேடல் மூலம் நேரடித் தகவல்:' : 'Search Live Web via Google Grounding:'}
              </span>
            </div>

            <button
              onClick={() => handleGroundedSearch(searchQuery || 'NASA Space Missions 2026 Telemetry')}
              disabled={isGroundedSearching}
              className="px-3 py-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition shadow-lg shadow-cyan-600/20 disabled:opacity-50"
            >
              {isGroundedSearching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  <span>{lang === 'si' ? 'සොයමින්...' : lang === 'ta' ? 'தேடுகிறது...' : 'Searching...'}</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>{lang === 'si' ? 'සජීවී සෙවුම අරඹන්න' : lang === 'ta' ? 'நேரடித் தேடல்' : 'Search Live Web'}</span>
                </>
              )}
            </button>
          </div>

          {/* Trending Mission Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {TRENDING_GROUNDED_TOPICS.map(topic => (
              <button
                key={topic.id}
                onClick={() => {
                  setSearchQuery(topic.name[lang] || topic.name.en);
                  handleGroundedSearch(topic.query);
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-950/40 hover:bg-blue-900/60 text-cyan-300 hover:text-white border border-blue-500/30 text-[11px] font-medium whitespace-nowrap transition flex items-center gap-1 shadow-sm"
              >
                <Compass className="w-3 h-3 text-cyan-400" />
                <span>{topic.name[lang] || topic.name.en}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Google Search Grounded Briefing Card */}
      {showGroundedSection && (
        <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900/95 via-[#071126]/95 to-slate-950 border border-cyan-500/40 shadow-2xl space-y-4 backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 p-[1.5px] shadow-lg shadow-cyan-500/30">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <Globe className="w-5 h-5 text-cyan-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-white font-['Orbitron']">
                    Google Search Grounded Discovery
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    gemini-3.5-flash
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  {lang === 'si' 
                    ? `"${groundedResult?.query || searchQuery}" පිළිබඳ සජීවීව තහවුරු කළ විද්‍යාත්මක තොරතුරු` 
                    : lang === 'ta' 
                    ? `"${groundedResult?.query || searchQuery}" பற்றிய நேரடித் தரவுகள்` 
                    : `Live verified facts & telemetry for "${groundedResult?.query || searchQuery}"`}
                </p>
              </div>
            </div>

            {/* Quick Actions: Audio Speech & Copy */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleSpeech}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                  isSpeaking
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                }`}
                title="Read aloud in your language"
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
                <span>{isSpeaking ? (lang === 'si' ? 'නවත්වන්න' : 'Stop') : (lang === 'si' ? 'හඬින් අසන්න' : lang === 'ta' ? 'கேளுங்கள்' : 'Listen')}</span>
              </button>

              <button
                onClick={handleCopyBriefing}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500/40 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
                title="Copy briefing"
              >
                {copiedBriefing ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                <span>{copiedBriefing ? (lang === 'si' ? 'පිටපත් විය!' : 'Copied!') : (lang === 'si' ? 'පිටපත්' : lang === 'ta' ? 'நகல்' : 'Copy')}</span>
              </button>

              <button
                onClick={() => {
                  setShowGroundedSection(false);
                  if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    setIsSpeaking(false);
                  }
                }}
                className="text-xs font-mono text-slate-400 hover:text-white px-2.5 py-1.5 rounded-xl hover:bg-slate-800 border border-transparent hover:border-slate-700"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Search Queries Executed */}
          {groundedResult?.searchQueries && groundedResult.searchQueries.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-slate-400">
              <span className="text-slate-500">{lang === 'si' ? 'සෙවූ විමසුම්:' : lang === 'ta' ? 'தேடல் கேள்விகள்:' : 'Queries Executed:'}</span>
              {groundedResult.searchQueries.map((sq, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-cyan-300">
                  🔍 {sq}
                </span>
              ))}
            </div>
          )}

          {/* Content Loading State */}
          {isGroundedSearching ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-cyan-300 font-mono text-xs">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                <Globe className="w-5 h-5 text-cyan-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <span>
                {lang === 'si' 
                  ? 'Google Search Grounding මඟින් සජීවී නාසා සහ අභ්‍යවකාශ දත්ත පිරික්සමින් පවතී...' 
                  : lang === 'ta' 
                  ? 'கூகுள் தேடல் மூலம் நேரடி நாசா தரவுகள் திரட்டப்படுகின்றன...' 
                  : 'Retrieving live space telemetry & official NASA sources via Google Search Grounding...'}
              </span>
            </div>
          ) : groundedResult ? (
            <div className="space-y-4">
              {/* Formatted Answer Body */}
              <div className="text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-line bg-slate-950/70 p-5 rounded-2xl border border-cyan-500/20 font-sans shadow-inner space-y-2">
                {groundedResult.answer}
              </div>

              {/* Web Sources & Grounding Citations */}
              {groundedResult.sources && groundedResult.sources.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2 font-semibold">
                    {lang === 'si' ? 'තහවුරු කළ නිල මූලාශ්‍ර සහ සබැඳි:' : lang === 'ta' ? 'சரிபார்க்கப்பட்ட அதிகாரப்பூர்வ இணைப்புகள்:' : 'Verified Official Sources & Grounding Citations:'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {groundedResult.sources.map((src, idx) => (
                      <a
                        key={idx}
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-cyan-300 hover:text-cyan-200 flex items-center justify-between gap-2 font-mono text-xs transition group shadow-sm"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                          <div className="truncate">
                            <div className="truncate font-semibold text-white group-hover:text-cyan-200">{src.title}</div>
                            {src.domain && (
                              <div className="text-[10px] text-slate-500">{src.domain}</div>
                            )}
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-300 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* No Local Results Fallback Card */}
      {filteredMissions.length === 0 && (
        <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white">
              {lang === 'si'
                ? `"${searchQuery}" සඳහා ස්ථානීය මෙහෙයුම් හමුනොවීය`
                : lang === 'ta'
                ? `"${searchQuery}" க்கான உள்ளூர் பணிகள் எதுவும் கிடைக்கவில்லை`
                : `No local missions matching "${searchQuery}"`}
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {lang === 'si'
                ? 'කෙසේ වෙතත්, ඔබට Google Search Grounding මඟින් මෙම මෙහෙයුම ගැන සජීවී තොරතුරු ලබාගත හැක.'
                : lang === 'ta'
                ? 'ஆயினும் கூகுள் தேடல் மூலம் இந்த பணி பற்றிய நேரடி தகவல்களை பெறலாம்.'
                : 'You can query live Google search data to discover facts about this mission.'}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => handleGroundedSearch()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-cyan-600/30 hover:brightness-110 transition"
            >
              <Globe className="w-4 h-4" />
              <span>{lang === 'si' ? 'Google සමඟ සජීවීව සොයන්න' : lang === 'ta' ? 'கூகுள் மூலம் தேடு' : 'Search Live on Web'}</span>
            </button>
            <button
              onClick={handleClearSearch}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition"
            >
              {lang === 'si' ? 'සියල්ල පෙන්වන්න' : lang === 'ta' ? 'அனைத்தையும் காட்டு' : 'Reset All'}
            </button>
          </div>
        </div>
      )}

      {/* Mission Tabs Bar */}
      {filteredMissions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800 scrollbar-thin">
          {filteredMissions.map(mission => {
            const isSelected = mission.id === currentMission.id;
            const isFav = isMissionSaved(mission.id);
            return (
              <button
                key={mission.id}
                onClick={() => {
                  setSelectedMissionId(mission.id);
                  setActiveStepIndex(0);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400/50 shadow-lg shadow-cyan-500/20'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Rocket className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-cyan-400'}`} />
                <span>{mission.name[lang] || mission.name.en}</span>
                {isFav && (
                  <Heart className="w-3 h-3 fill-pink-500 text-pink-400" />
                )}
                <span className="text-[10px] opacity-75 font-mono px-1.5 py-0.5 rounded bg-black/30">
                  {mission.year}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Mission Display Card */}
      {currentMission && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 apple-liquid-glass rounded-3xl p-6 sm:p-8 shadow-2xl">
          {/* Left Column: Mission Overview & Facts */}
          <div className="lg:col-span-5 space-y-5">
            <div className="relative rounded-3xl overflow-hidden apple-liquid-glass aspect-video group">
              <img 
                src={currentMission.image} 
                alt={currentMission.name[lang] || currentMission.name.en}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 rounded-3xl"
              />
              {/* Save to Favorites Button */}
              <button
                onClick={() => toggleSaveMission(currentMission.id)}
                className={`absolute top-3 right-3 px-3.5 py-1.5 rounded-2xl transition flex items-center gap-1.5 text-xs font-semibold shadow-lg ${
                  isMissionSaved(currentMission.id)
                    ? 'bg-pink-600/90 text-white border border-pink-400 shadow-pink-500/30'
                    : 'apple-liquid-glass text-slate-200 hover:text-white'
                }`}
                title={isMissionSaved(currentMission.id) ? t.removeFromFavorites : t.saveToFavorites}
              >
                <Heart className={`w-3.5 h-3.5 ${isMissionSaved(currentMission.id) ? 'fill-white text-white' : 'text-pink-400'}`} />
                <span>{isMissionSaved(currentMission.id) ? t.savedInFavorites : t.saveToFavorites}</span>
              </button>

              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent flex items-end p-5 pointer-events-none rounded-3xl">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <ShieldCheck className="w-3 h-3" />
                    {currentMission.status[lang] || currentMission.status.en}
                  </span>
                  <h3 className="text-xl font-bold text-white mt-1 font-['Orbitron']">
                    {currentMission.name[lang] || currentMission.name.en}
                  </h3>
                  <p className="text-xs text-cyan-300 font-medium">
                    {currentMission.subtitle[lang] || currentMission.subtitle.en}
                  </p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="p-5 rounded-3xl apple-liquid-glass text-slate-200 text-sm leading-relaxed">
              {currentMission.summary[lang] || currentMission.summary.en}
            </div>

            {/* Quick Facts Grid */}
            <div className="grid grid-cols-2 gap-3">
              {currentMission.facts.map((fact, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl apple-liquid-glass">
                  <div className="text-[11px] text-slate-400 font-medium">{fact.label[lang] || fact.label.en}</div>
                  <div className="text-xs font-semibold text-cyan-200 mt-0.5">{fact.value}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300 p-3.5 rounded-2xl apple-liquid-glass">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>{t.missionOperator}:</span>
              </span>
              <span className="font-semibold text-white">{currentMission.operator}</span>
            </div>
          </div>

          {/* Right Column: Step-by-Step Flight Breakdown */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 font-['Orbitron']">
                  <Milestone className="w-4 h-4 text-cyan-400" />
                  {t.stepBreakdown}
                </h4>
                <span className="text-xs text-slate-400 font-mono">
                  Stage {activeStepIndex + 1} of {currentMission.steps.length}
                </span>
              </div>

              {/* Stepper Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {currentMission.steps.map((step, idx) => {
                  const isActive = idx === activeStepIndex;
                  return (
                    <button
                      key={idx}
                      onClick={() => setActiveStepIndex(idx)}
                      className={`p-3 rounded-2xl text-left transition border text-xs ${
                        isActive
                          ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200 shadow-md ring-1 ring-cyan-400/50'
                          : 'apple-liquid-glass text-slate-300 hover:text-white'
                      }`}
                    >
                      <div className="text-[10px] font-mono text-cyan-400 font-bold mb-1">
                        {step.phase}
                      </div>
                      <div className="font-semibold line-clamp-1">{step.title[lang] || step.title.en}</div>
                    </button>
                  );
                })}
              </div>

              {/* Active Step Detailed Card */}
              {currentMission.steps[activeStepIndex] && (
                <div className="p-6 rounded-3xl apple-liquid-glass shadow-xl relative overflow-hidden space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full apple-liquid-glass text-cyan-300 font-mono text-xs border-cyan-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                      {currentMission.steps[activeStepIndex].phase}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
                      <Gauge className="w-3.5 h-3.5 text-amber-400" />
                      <span>{currentMission.steps[activeStepIndex].telemetry}</span>
                    </div>
                  </div>

                  <h5 className="text-base font-bold text-white font-['Orbitron']">
                    {currentMission.steps[activeStepIndex].title[lang] || currentMission.steps[activeStepIndex].title.en}
                  </h5>

                  <p className="text-sm text-slate-200 leading-relaxed">
                    {currentMission.steps[activeStepIndex].description[lang] || currentMission.steps[activeStepIndex].description.en}
                  </p>
                </div>
              )}
            </div>

            {/* Stepper Navigation buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <button
                onClick={() => setActiveStepIndex(prev => Math.max(0, prev - 1))}
                disabled={activeStepIndex === 0}
                className="px-4 py-2 rounded-2xl text-xs font-semibold apple-liquid-glass text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← {lang === 'si' ? 'පෙර අදියර' : lang === 'ta' ? 'முந்தைய நிலை' : 'Previous Phase'}
              </button>
              <button
                onClick={() => setActiveStepIndex(prev => Math.min(currentMission.steps.length - 1, prev + 1))}
                disabled={activeStepIndex === currentMission.steps.length - 1}
                className="px-4 py-2 rounded-2xl text-xs font-semibold bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 shadow-lg shadow-cyan-600/30"
              >
                {lang === 'si' ? 'මීළඟ අදියර' : lang === 'ta' ? 'அடுத்த நிலை' : 'Next Phase'} →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
