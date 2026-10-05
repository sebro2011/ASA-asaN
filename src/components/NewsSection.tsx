import React, { useState } from 'react';
import { SupportedLanguage } from '../i18n/translations';
import NasaNewsFeed from './NasaNewsFeed.jsx';
import NASANewsExplorer from './NASANewsExplorer.jsx';
import { Radio, Archive, Sparkles } from 'lucide-react';

interface NewsSectionProps {
  lang: SupportedLanguage;
}

export const NewsSection: React.FC<NewsSectionProps> = React.memo(({ lang }) => {
  const [viewMode, setViewMode] = useState<'historical' | 'live'>('historical');

  return (
    <div className="w-full space-y-6">
      {/* Sub-view switcher tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2">
        <div className="flex items-center p-1 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-inner">
          <button
            type="button"
            onClick={() => setViewMode('historical')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              viewMode === 'historical'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>
              {lang === 'si' ? 'දශකයේ ඓතිහාසික එකතුව (2015-2026)' :
               lang === 'ta' ? 'பத்தாண்டு வரலாற்று காப்பகம் (2015-2026)' :
               'Decade Archive (2015 - 2026)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('live')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              viewMode === 'live'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {lang === 'si' ? 'සජීවී නාසා පුවත්' :
               lang === 'ta' ? 'நேரலை நாசா செய்திகள்' :
               'Live NASA Feed'}
            </span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-slate-500 hidden sm:flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>NASA Open API & Media Search Integration</span>
        </div>
      </div>

      {/* Render active view */}
      {viewMode === 'historical' ? (
        <NASANewsExplorer />
      ) : (
        <NasaNewsFeed />
      )}
    </div>
  );
});
