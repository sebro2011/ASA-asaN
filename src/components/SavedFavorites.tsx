import React, { useState, useMemo } from 'react';
import { SupportedLanguage, translations } from '../i18n/translations';
import { useFavorites, SavedApod } from '../utils/favorites';
import { SPACE_MISSIONS, SpaceMission } from '../data/missions';
import { 
  Bookmark, 
  Heart, 
  Trash2, 
  ExternalLink, 
  Calendar, 
  Rocket, 
  Sparkles, 
  Compass, 
  ChevronRight, 
  Layers, 
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Eye
} from 'lucide-react';

interface SavedFavoritesProps {
  lang: SupportedLanguage;
  onNavigateToApod: (date?: string) => void;
  onNavigateToMission: (missionId: string) => void;
}

export const SavedFavorites: React.FC<SavedFavoritesProps> = React.memo(({
  lang,
  onNavigateToApod,
  onNavigateToMission
}) => {
  const t = translations[lang];
  const { 
    savedApods, 
    savedMissionIds, 
    removeSavedApod, 
    removeSavedMission, 
    clearAll 
  } = useFavorites();

  const [activeFilter, setActiveFilter] = useState<'all' | 'apod' | 'missions'>('all');
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  // Map saved mission IDs to actual mission objects
  const savedMissions = useMemo(() => {
    return savedMissionIds
      .map(id => SPACE_MISSIONS.find(m => m.id === id))
      .filter((m): m is SpaceMission => Boolean(m));
  }, [savedMissionIds]);

  const totalCount = savedApods.length + savedMissions.length;

  const handleClearAll = () => {
    clearAll();
    setConfirmClear(false);
  };

  return (
    <div className="w-full space-y-6">
      {/* Header Bar with Counters & Action Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 apple-liquid-glass p-6 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-cyan-500/20 border border-pink-500/30 flex items-center justify-center shadow-lg">
            <Heart className="w-6 h-6 text-pink-400 fill-pink-500/30 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white font-['Orbitron'] tracking-wide">
                {t.savedHeading}
              </h2>
              <span className="px-3 py-0.5 rounded-full text-xs font-mono font-bold bg-pink-500/20 text-pink-300 border border-pink-500/40">
                {totalCount} {totalCount === 1 ? 'item' : 'items'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {t.savedSubheading}
            </p>
          </div>
        </div>

        {/* Filter Pills & Clear Button */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-1.5 apple-liquid-glass rounded-2xl">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeFilter === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.filterAll} ({totalCount})
            </button>
            <button
              onClick={() => setActiveFilter('apod')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                activeFilter === 'apod'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>APOD ({savedApods.length})</span>
            </button>
            <button
              onClick={() => setActiveFilter('missions')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                activeFilter === 'missions'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>{t.navMissions} ({savedMissions.length})</span>
            </button>
          </div>

          {totalCount > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-1.5 bg-red-950/60 p-1.5 rounded-2xl border border-red-500/40">
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1 text-xs font-bold text-red-300 hover:bg-red-900/50 rounded-xl transition"
                >
                  Confirm Clear?
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1 text-xs text-slate-300 hover:text-white rounded-xl transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="p-2.5 rounded-2xl text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 apple-liquid-glass transition"
                title={t.clearAllSaved}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Empty State */}
      {totalCount === 0 && (
        <div className="p-12 text-center rounded-3xl apple-liquid-glass flex flex-col items-center justify-center space-y-4">
          <div className="w-20 h-20 rounded-3xl apple-liquid-glass border-cyan-500/30 flex items-center justify-center shadow-xl">
            <Bookmark className="w-10 h-10 text-cyan-400/60 animate-pulse" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h3 className="text-lg font-bold text-white font-['Orbitron']">
              {t.noSavedItems}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              {t.noSavedSub}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => onNavigateToApod()}
              className="px-4 py-2.5 rounded-2xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/30 flex items-center gap-2 hover:brightness-110 transition"
            >
              <Compass className="w-4 h-4" />
              <span>Explore APOD Archive</span>
            </button>
            <button
              onClick={() => onNavigateToMission('apollo-11')}
              className="px-4 py-2.5 rounded-2xl text-xs font-semibold apple-liquid-glass text-slate-200 hover:text-white flex items-center gap-2 transition"
            >
              <Rocket className="w-4 h-4" />
              <span>Browse Space Missions</span>
            </button>
          </div>
        </div>
      )}

      {/* Saved Content Grid */}
      {totalCount > 0 && (
        <div className="space-y-8">
          {/* Section A: Saved APODs */}
          {(activeFilter === 'all' || activeFilter === 'apod') && savedApods.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-base font-bold text-white flex items-center gap-2 font-['Orbitron']">
                  <Compass className="w-5 h-5 text-cyan-400" />
                  <span>{t.savedApodTitle}</span>
                  <span className="text-xs text-slate-400 font-normal">({savedApods.length})</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedApods.map((apod) => (
                  <div
                    key={apod.date}
                    className="group relative rounded-3xl overflow-hidden apple-liquid-glass shadow-lg transition-all duration-300 flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Thumbnail */}
                      <div className="relative aspect-video w-full overflow-hidden bg-transparent">
                        {apod.media_type === 'video' ? (
                          <div className="w-full h-full flex items-center justify-center text-cyan-400 text-xs font-mono">
                            Video Media
                          </div>
                        ) : (
                          <img
                            src={apod.url}
                            alt={apod.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80" />

                        {/* Date Badge */}
                        <div className="absolute top-2.5 left-2.5 px-3 py-1 rounded-xl apple-liquid-glass text-[11px] font-mono text-cyan-300 flex items-center gap-1.5 shadow-md">
                          <Calendar className="w-3 h-3 text-cyan-400" />
                          <span>{apod.date}</span>
                        </div>

                        {/* Remove from Saved Button */}
                        <button
                          onClick={() => removeSavedApod(apod.date)}
                          className="absolute top-2.5 right-2.5 p-2 rounded-xl apple-liquid-glass hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition"
                          title={t.removeFromFavorites}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Content Details */}
                      <div className="p-5 space-y-2">
                        <h4 className="text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-cyan-300 transition-colors font-['Orbitron']">
                          {lang !== 'en' && apod.translatedTitle ? apod.translatedTitle : apod.title}
                        </h4>
                        <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed font-sans">
                          {lang !== 'en' && apod.translatedExplanation ? apod.translatedExplanation : apod.explanation}
                        </p>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="p-5 pt-0 border-t border-white/10 flex items-center justify-between gap-2">
                      <button
                        onClick={() => onNavigateToApod(apod.date)}
                        className="px-3.5 py-1.5 rounded-2xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View in APOD</span>
                      </button>

                      {apod.hdurl && (
                        <a
                          href={apod.hdurl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl apple-liquid-glass text-slate-300 hover:text-white transition text-xs flex items-center gap-1"
                          title="Open Ultra HD Image"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-mono">4K HD</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section B: Saved Missions */}
          {(activeFilter === 'all' || activeFilter === 'missions') && savedMissions.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-base font-bold text-white flex items-center gap-2 font-['Orbitron']">
                  <Rocket className="w-5 h-5 text-cyan-400" />
                  <span>{t.savedMissionsTitle}</span>
                  <span className="text-xs text-slate-400 font-normal">({savedMissions.length})</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {savedMissions.map((mission) => (
                  <div
                    key={mission.id}
                    className="group relative rounded-3xl overflow-hidden apple-liquid-glass shadow-lg transition-all duration-300 flex flex-col justify-between"
                  >
                    <div>
                      {/* Image & Year Header */}
                      <div className="relative h-44 w-full overflow-hidden bg-transparent">
                        <img
                          src={mission.image}
                          alt={mission.name[lang] || mission.name.en}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />

                        <div className="absolute top-2.5 left-2.5 flex items-center gap-2">
                          <span className="px-3 py-1 rounded-xl bg-cyan-600/90 text-white font-mono text-xs font-bold shadow-md">
                            {mission.year}
                          </span>
                          <span className="px-3 py-1 rounded-xl apple-liquid-glass text-[11px] font-mono text-emerald-300">
                            {mission.status[lang] || mission.status.en}
                          </span>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeSavedMission(mission.id)}
                          className="absolute top-2.5 right-2.5 p-2 rounded-xl apple-liquid-glass hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition"
                          title={t.removeFromFavorites}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="absolute bottom-2.5 left-4 right-4">
                          <h4 className="text-base font-bold text-white drop-shadow font-['Orbitron']">
                            {mission.name[lang] || mission.name.en}
                          </h4>
                          <p className="text-xs text-cyan-300 font-mono">
                            {mission.subtitle[lang] || mission.subtitle.en}
                          </p>
                        </div>
                      </div>

                      {/* Body Info */}
                      <div className="p-5 space-y-3">
                        <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed font-sans">
                          {mission.summary[lang] || mission.summary.en}
                        </p>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="p-2.5 rounded-2xl apple-liquid-glass">
                            <span className="text-slate-400 block text-[10px]">Destination</span>
                            <span className="text-cyan-300 font-semibold">{mission.destination[lang] || mission.destination.en}</span>
                          </div>
                          <div className="p-2.5 rounded-2xl apple-liquid-glass">
                            <span className="text-slate-400 block text-[10px]">Control</span>
                            <span className="text-slate-200 font-semibold truncate block">{mission.operator}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action */}
                    <div className="p-5 pt-0 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-400">
                        {mission.steps.length} Flight Phases
                      </span>
                      <button
                        onClick={() => onNavigateToMission(mission.id)}
                        className="px-4 py-2 rounded-2xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md shadow-cyan-600/25 transition flex items-center gap-1.5"
                      >
                        <span>Open Mission Timeline</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
