import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SupportedLanguage, translations } from '../i18n/translations';
import { SPACE_MISSIONS, SpaceMission } from '../data/missions';
import { useFavorites } from '../utils/favorites';
import { VoiceSearchInput } from './VoiceSearchInput';
import { fetchGroundedMissionSearch } from '@/lib/nasaApi';
import { MissionsAnalytics } from './MissionsAnalytics';
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
  Flame,
  BarChart3
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
  const [subTab, setSubTab] = useState<'timeline' | 'analytics'>('timeline');

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
      const data = await fetchGroundedMissionSearch(queryTerm, lang);
      if (data && data.answer) {
        setGroundedResult(data as GroundedSearchResult);
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
      
      {/* Missions Module Sub-Navigation Switcher: Explorer Timeline vs Analytics */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-surface/40 p-1.5 sm:p-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSubTab('timeline')}
            className={`px-4 py-2 rounded-[10px] text-xs sm:text-sm font-semibold font-mono flex items-center gap-2 transition-all cursor-pointer ${
              subTab === 'timeline'
                ? 'border border-atmo/40 bg-atmo/10 text-ink'
                : 'border border-transparent text-ink-3 hover:bg-surface-2/60 hover:text-ink'
            }`}
          >
            <Rocket className="w-4 h-4 text-cyan-300" />
            <span>
              {lang === 'si'
                ? 'මෙහෙයුම් කාලරේඛාව සහ අදියර'
                : lang === 'ta'
                ? 'பணிகள் காலவரிசை & படிகள்'
                : 'Mission Explorer & Timeline'}
            </span>
          </button>

          <button
            onClick={() => setSubTab('analytics')}
            className={`px-4 py-2 rounded-[10px] text-xs sm:text-sm font-semibold font-mono flex items-center gap-2 transition-all cursor-pointer relative ${
              subTab === 'analytics'
                ? 'border border-atmo/40 bg-atmo/10 text-ink'
                : 'border border-transparent text-ink-3 hover:bg-surface-2/60 hover:text-ink'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-cyan-300" />
            <span>
              {lang === 'si'
                ? 'ඓතිහාසික විශ්ලේෂණ (Analytics)'
                : lang === 'ta'
                ? 'வரலாற்றுப் பகுப்பாய்வு (Analytics)'
                : 'Mission Analytics & Trends'}
            </span>
            <span className="ml-0.5 rounded-full border border-line px-1.5 py-0.5 font-mono text-[9px] text-ink-4">
              CHARTS
            </span>
          </button>
        </div>

        <p className="hidden pr-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4 md:block">
          Curated archive · not a live feed
        </p>
      </div>

      {subTab === 'analytics' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-3 rounded-[12px] border border-line bg-surface/40 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.8} />
            <p className="max-w-4xl text-[11.5px] leading-relaxed text-ink-3">
              {lang === 'si'
                ? 'පහත සංඛ්‍යා ඓතිහාසික මෙහෙයුම් වාර්තාවලින් සකසන ලද සාරාංශ වන අතර, සජීවී ටෙලිමෙට්‍රිය නොවේ. ප්‍රමාණයන් වාර්තාගත දියත්කිරීම් ගණන් කිරීම් මත පදනම් වේ.'
                : lang === 'ta'
                  ? 'கீழே உள்ள எண்கள் வரலாற்றுப் பணிப் பதிவுகளிலிருந்து தொகுக்கப்பட்டவை; நேரடி அளவீடுகள் அல்ல.'
                  : 'The figures below are summaries compiled from the historical mission record, not live telemetry. Percentages describe reported missions in this curated set.'}
            </p>
          </div>
          <MissionsAnalytics lang={lang} />
        </div>
      ) : (
        <>
          {/* Search Header Bar with Real-Time Millisecond Execution Badge */}
          <div className="space-y-4 rounded-[14px] border border-line bg-surface/40 p-4 sm:p-5">
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
            <div className="flex items-center gap-1.5 rounded-[8px] border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink-4">
              <Clock className="h-3 w-3" strokeWidth={1.8} />
              <span>
                {lang === 'si'
                  ? `${searchExecutionMs.toFixed(1)} ms`
                  : lang === 'ta'
                  ? `${searchExecutionMs.toFixed(1)} ms`
                  : `${searchExecutionMs.toFixed(1)} ms query`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-[8px] border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink-2">
              <Sparkles className="h-3 w-3 text-atmo" strokeWidth={1.8} />
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
                className="flex items-center gap-1 rounded-[8px] border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink-3 transition-colors hover:bg-surface-2/70 hover:text-ink"
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
          <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider shrink-0 flex items-center gap-1 pr-1">
            <Rocket className="w-3 h-3 text-cyan-500" />
            {lang === 'si' ? 'ඉක්මන් සෙවුම්:' : lang === 'ta' ? 'விரைவு தேடல்:' : 'Quick Filters:'}
          </span>
          {QUICK_SEARCH_CHIPS.map(chip => {
            const isSelected = activeChipId === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => handleChipClick(chip)}
                className={`px-3 py-1 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'border-atmo/50 bg-atmo/10 text-ink'
                    : 'bg-abyss/60 text-ink-3 hover:text-ink border-line hover:border-line'
                }`}
              >
                {chip.label[lang] || chip.label.en}
              </button>
            );
          })}
        </div>

        {/* Google Grounded Discovery Trending Highlights Strip */}
        <div className="pt-2 border-t border-line/70 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 font-semibold">
              <Globe className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} />
              <span>
                {lang === 'si'
                  ? 'මූලාශ්‍ර සහිත AI සෙවුම (අන්තර්ජාලය හරහා):'
                  : lang === 'ta'
                    ? 'மூலங்களுடன் கூடிய AI தேடல் (இணையம் வழியாக):'
                    : 'Grounded AI search with cited sources:'}
              </span>
            </div>

            <button
              onClick={() => handleGroundedSearch(searchQuery || 'NASA Space Missions 2026 Telemetry')}
              disabled={isGroundedSearching}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-atmo/40 bg-atmo/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-atmo transition-colors hover:bg-atmo/15 disabled:opacity-50"
            >
              {isGroundedSearching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  <span>{lang === 'si' ? 'සොයමින්...' : lang === 'ta' ? 'தேடுகிறது...' : 'Searching...'}</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>{lang === 'si' ? 'සෙවීම අරඹන්න' : lang === 'ta' ? 'தேடலைத் தொடங்கு' : 'Run grounded search'}</span>
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
                className="px-2.5 py-1 rounded-[8px] bg-blue-950/40 hover:bg-blue-900/60 text-cyan-300 hover:text-ink border border-blue-500/30 text-[11px] font-medium whitespace-nowrap transition flex items-center gap-1 shadow-sm"
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
        <div className="space-y-4 rounded-[14px] border border-line bg-surface/40 p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-[10px] border border-atmo/30 bg-atmo/10 p-[1.5px]">
                <div className="w-full h-full bg-abyss rounded-[14px] flex items-center justify-center">
                  <Globe className="w-5 h-5 text-cyan-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-white font-display">
                    Google Search Grounded Discovery
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-signal border border-emerald-500/40 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-signal" />
                    gemini-3.5-flash
                  </span>
                </div>
                <p className="text-xs text-ink-3 font-mono">
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
                className={`px-3 py-1.5 rounded-[10px] border text-xs font-semibold flex items-center gap-1.5 transition ${
                  isSpeaking
                    ? 'border-caution/40 bg-caution/10 text-caution'
                    : 'bg-surface/60 border-line text-ink-2 hover:text-ink'
                }`}
                title="Read aloud in your language"
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
                <span>{isSpeaking ? (lang === 'si' ? 'නවත්වන්න' : 'Stop') : (lang === 'si' ? 'හඬින් අසන්න' : lang === 'ta' ? 'கேளுங்கள்' : 'Listen')}</span>
              </button>

              <button
                onClick={handleCopyBriefing}
                className="px-3 py-1.5 rounded-[10px] bg-surface/60 border border-line hover:border-cyan-500/40 text-ink-2 hover:text-ink text-xs font-semibold flex items-center gap-1.5 transition"
                title="Copy briefing"
              >
                {copiedBriefing ? <Check className="w-3.5 h-3.5 text-signal" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
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
                className="text-xs font-mono text-ink-3 hover:text-ink px-2.5 py-1.5 rounded-[10px] hover:bg-surface-2 border border-transparent hover:border-line"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Search Queries Executed */}
          {groundedResult?.searchQueries && groundedResult.searchQueries.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-ink-3">
              <span className="text-ink-4">{lang === 'si' ? 'සෙවූ විමසුම්:' : lang === 'ta' ? 'தேடல் கேள்விகள்:' : 'Queries Executed:'}</span>
              {groundedResult.searchQueries.map((sq, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md bg-abyss border border-line text-cyan-300">
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
                <Globe className="absolute inset-0 m-auto h-5 w-5 text-atmo" strokeWidth={1.6} />
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
              <div className="text-ink-2 text-xs sm:text-sm leading-relaxed whitespace-pre-line bg-abyss/70 p-5 rounded-[14px] border border-cyan-500/20 font-sans shadow-inner space-y-2">
                {groundedResult.answer}
              </div>

              {/* Web Sources & Grounding Citations */}
              {groundedResult.sources && groundedResult.sources.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-mono text-ink-3 uppercase tracking-wider block mb-2 font-semibold">
                    {lang === 'si' ? 'තහවුරු කළ නිල මූලාශ්‍ර සහ සබැඳි:' : lang === 'ta' ? 'சரிபார்க்கப்பட்ட அதிகாரப்பூர்வ இணைப்புகள்:' : 'Verified Official Sources & Grounding Citations:'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {groundedResult.sources.map((src, idx) => (
                      <a
                        key={idx}
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-[10px] bg-surface/65 hover:bg-surface-2 border border-line hover:border-cyan-500/50 text-cyan-300 hover:text-cyan-200 flex items-center justify-between gap-2 font-mono text-xs transition group shadow-sm"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                          <div className="truncate">
                            <div className="truncate font-semibold text-white group-hover:text-cyan-200">{src.title}</div>
                            {src.domain && (
                              <div className="text-[10px] text-ink-4">{src.domain}</div>
                            )}
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-ink-3 group-hover:text-cyan-300 shrink-0" />
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
        <div className="p-8 rounded-3xl bg-surface/50 border border-line text-center space-y-4">
          <div className="w-12 h-12 rounded-[14px] bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-caution">
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
            <p className="text-xs text-ink-3 mt-1 max-w-md mx-auto">
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
              className="inline-flex items-center gap-2 rounded-[8px] bg-atmo px-3.5 py-2 text-[12px] font-semibold text-[#04202b] transition-colors hover:bg-atmo-soft"
            >
              <Globe className="w-4 h-4" />
              <span>{lang === 'si' ? 'Google සමඟ සජීවීව සොයන්න' : lang === 'ta' ? 'கூகுள் மூலம் தேடு' : 'Search Live on Web'}</span>
            </button>
            <button
              onClick={handleClearSearch}
              className="px-4 py-2 rounded-[10px] bg-surface-2 text-ink-2 hover:text-ink text-xs font-semibold transition"
            >
              {lang === 'si' ? 'සියල්ල පෙන්වන්න' : lang === 'ta' ? 'அனைத்தையும் காட்டு' : 'Reset All'}
            </button>
          </div>
        </div>
      )}

      {/* Mission Tabs Bar */}
      {filteredMissions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-line scrollbar-thin">
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
                className={`flex items-center gap-2 px-4 py-2.5 rounded-[10px] font-semibold text-xs whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'border-atmo/50 bg-atmo/10 text-ink'
                    : 'bg-surface/50 text-ink-3 hover:text-ink-2 border-line hover:border-line'
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 apple-liquid-glass rounded-[14px] p-6 sm:p-8 shadow-2xl">
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
                className={`absolute top-3 right-3 px-3.5 py-1.5 rounded-[14px] transition flex items-center gap-1.5 text-xs font-semibold shadow-lg ${
                  isMissionSaved(currentMission.id)
                    ? 'bg-pink-600/90 text-white border border-pink-400 shadow-pink-500/30'
                    : 'apple-liquid-glass text-ink-2 hover:text-ink'
                }`}
                title={isMissionSaved(currentMission.id) ? t.removeFromFavorites : t.saveToFavorites}
              >
                <Heart className={`w-3.5 h-3.5 ${isMissionSaved(currentMission.id) ? 'fill-white text-white' : 'text-pink-400'}`} />
                <span>{isMissionSaved(currentMission.id) ? t.savedInFavorites : t.saveToFavorites}</span>
              </button>

              <div className="pointer-events-none absolute inset-0 flex items-end rounded-[14px] bg-gradient-to-t from-void/95 via-void/25 to-transparent p-5">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-signal border border-emerald-500/40">
                    <ShieldCheck className="w-3 h-3" />
                    {currentMission.status[lang] || currentMission.status.en}
                  </span>
                  <h3 className="text-xl font-bold text-white mt-1 font-display">
                    {currentMission.name[lang] || currentMission.name.en}
                  </h3>
                  <p className="text-xs text-cyan-300 font-medium">
                    {currentMission.subtitle[lang] || currentMission.subtitle.en}
                  </p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="p-5 rounded-3xl apple-liquid-glass text-ink-2 text-sm leading-relaxed">
              {currentMission.summary[lang] || currentMission.summary.en}
            </div>

            {/* Quick Facts Grid */}
            <div className="grid grid-cols-2 gap-3">
              {currentMission.facts.map((fact, idx) => (
                <div key={idx} className="p-3.5 rounded-[14px] apple-liquid-glass">
                  <div className="text-[11px] text-ink-3 font-medium">{fact.label[lang] || fact.label.en}</div>
                  <div className="text-xs font-semibold text-cyan-200 mt-0.5">{fact.value}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-ink-2 p-3.5 rounded-[14px] apple-liquid-glass">
              <span className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} />
                <span>{t.missionOperator}:</span>
              </span>
              <span className="font-semibold text-white">{currentMission.operator}</span>
            </div>
          </div>

          {/* Right Column: Step-by-Step Flight Breakdown */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 font-display">
                  <Milestone className="w-4 h-4 text-cyan-400" />
                  {t.stepBreakdown}
                </h4>
                <span className="text-xs text-ink-3 font-mono">
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
                      className={`p-3 rounded-[14px] text-left transition border text-xs ${
                        isActive
                          ? 'bg-cyan-950/70 border-cyan-500/60 text-cyan-200 shadow-md ring-1 ring-cyan-400/50'
                          : 'apple-liquid-glass text-ink-2 hover:text-ink'
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
                    <div className="flex items-center gap-1.5 text-xs font-mono text-ink-2">
                      <Gauge className="w-3.5 h-3.5 text-caution" />
                      <span>{currentMission.steps[activeStepIndex].telemetry}</span>
                    </div>
                  </div>

                  <h5 className="text-base font-bold text-white font-display">
                    {currentMission.steps[activeStepIndex].title[lang] || currentMission.steps[activeStepIndex].title.en}
                  </h5>

                  <p className="text-sm text-ink-2 leading-relaxed">
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
                className="px-4 py-2 rounded-[14px] text-xs font-semibold apple-liquid-glass text-ink-2 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← {lang === 'si' ? 'පෙර අදියර' : lang === 'ta' ? 'முந்தைய நிலை' : 'Previous Phase'}
              </button>
              <button
                onClick={() => setActiveStepIndex(prev => Math.min(currentMission.steps.length - 1, prev + 1))}
                disabled={activeStepIndex === currentMission.steps.length - 1}
                className="px-4 py-2 rounded-[14px] text-xs font-semibold bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 shadow-lg shadow-cyan-600/30"
              >
                {lang === 'si' ? 'මීළඟ අදියර' : lang === 'ta' ? 'அடுத்த நிலை' : 'Next Phase'} →
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
});
