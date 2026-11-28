import React, { useState, useMemo, useEffect } from 'react';
import { SupportedLanguage, translations } from '../i18n/translations';
import { SPACE_MISSIONS, SpaceMission } from '../data/missions';
import { useFavorites } from '../utils/favorites';
import { VoiceSearchInput } from './VoiceSearchInput';
import { MissionsAnalytics } from './MissionsAnalytics';
import {
  Rocket,
  Milestone,
  ShieldCheck,
  Radio,
  CheckCircle2,
  Gauge,
  Sparkles,
  Heart,
  Search,
  RotateCcw,
  Info,
  Clock,
  BarChart3,
} from 'lucide-react';

interface MissionsTimelineProps {
  lang: SupportedLanguage;
  initialMissionId?: string;
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

export const MissionsTimeline: React.FC<MissionsTimelineProps> = React.memo(({ lang, initialMissionId }) => {
  const t = translations[lang];
  const { isMissionSaved, toggleSaveMission } = useFavorites();
  const [selectedMissionId, setSelectedMissionId] = useState<string>(initialMissionId || SPACE_MISSIONS[0].id);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchExecutionMs, setSearchExecutionMs] = useState<number>(1.2);
  const [activeChipId, setActiveChipId] = useState<string>('all');
  const [subTab, setSubTab] = useState<'timeline' | 'analytics'>('timeline');

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

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setActiveChipId('all');
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
                  ? 'මෙහෙයුම් නම හඬින් හෝ ලියා සොයන්න (උදා: ඇපලෝ 11, ආටෙමිස්, ජේම්ස් වෙබ්)...'
                  : lang === 'ta'
                  ? 'பணிகளை குரல் மூலம் தேடுங்கள் (எ.கா: அப்பல்லோ 11, ஆர்ட்டெமிஸ், ஜேம்ஸ் வெப்)...'
                  : 'Speak or search missions (e.g., Apollo 11, Artemis, James Webb)...'
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
      </div>

      {/* No Local Results Fallback Card */}
      {filteredMissions.length === 0 && (
        <div className="p-8 rounded-3xl bg-surface/50 border border-line text-center space-y-4">
          <div className="w-12 h-12 rounded-[14px] bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-caution">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white">
              {lang === 'si'
                ? `"${searchQuery}" සඳහා මෙහෙයුම් හමුනොවීය`
                : lang === 'ta'
                ? `"${searchQuery}" க்கான பணிகள் எதுவும் கிடைக்கவில்லை`
                : `No missions matching "${searchQuery}"`}
            </h4>
            <p className="text-xs text-ink-3 mt-1 max-w-md mx-auto">
              {lang === 'si'
                ? 'වෙනත් මූල පදයක් උත්සාහ කරන්න හෝ සියලුම මෙහෙයුම් නැවත පෙන්වන්න.'
                : lang === 'ta'
                ? 'வேறு முக்கிய வார்த்தையை முயற்சிக்கவும் அல்லது அனைத்து பணிகளையும் மீண்டும் காட்டவும்.'
                : 'Try a different keyword or reset the filter to browse all missions in the archive.'}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleClearSearch}
              className="px-4 py-2 rounded-[10px] bg-surface-2 text-ink-2 hover:text-ink text-xs font-semibold transition cursor-pointer"
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
