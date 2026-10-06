import React from 'react';
import Logo from './Logo';
import { SupportedLanguage, translations } from '../i18n/translations';
import { Sparkles, Globe, FileCode, Orbit, Rocket, Newspaper, Compass } from 'lucide-react';

interface HeaderProps {
  currentLang: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  activeTab: 'apod' | '3d' | 'missions' | 'news';
  onTabChange: (tab: 'apod' | '3d' | 'missions' | 'news') => void;
  onOpenExportModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentLang,
  onLanguageChange,
  activeTab,
  onTabChange,
  onOpenExportModal,
}) => {
  const t = translations[currentLang];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-2xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3.5 cursor-pointer" onClick={() => onTabChange('apod')}>
            <Logo size="md" />

            <div>
              <div className="flex items-center gap-2">
                <span className="font-['Orbitron'] font-bold text-base md:text-lg tracking-tight text-white">
                  {t.appName}
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  APOD • 3D • i18n
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium tracking-wide">
                {t.appSubtitle}
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/70 border border-slate-800">
            <button
              onClick={() => onTabChange('apod')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'apod'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{t.navApod}</span>
            </button>

            <button
              onClick={() => onTabChange('3d')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === '3d'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Orbit className="w-3.5 h-3.5" />
              <span>{t.nav3D}</span>
            </button>

            <button
              onClick={() => onTabChange('missions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'missions'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>{t.navMissions}</span>
            </button>

            <button
              onClick={() => onTabChange('news')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'news'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Newspaper className="w-3.5 h-3.5" />
              <span>{t.navNews}</span>
            </button>
          </nav>

          {/* Right Action Bar: Language Switcher & Export */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Trilingual Switcher (Sinhala, Tamil, English) */}
            <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-cyan-500/30 shadow-md">
              <button
                onClick={() => onLanguageChange('en')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  currentLang === 'en'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Switch to English"
              >
                <span>🇬🇧</span>
                <span className="hidden sm:inline">English</span>
              </button>

              <button
                onClick={() => onLanguageChange('si')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  currentLang === 'si'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="සිංහල භාෂාවට මාරුවන්න"
              >
                <span>🇱🇰</span>
                <span>සිංහල</span>
              </button>

              <button
                onClick={() => onLanguageChange('ta')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  currentLang === 'ta'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="தமிழுக்கு மாறவும்"
              >
                <span>🇮🇳</span>
                <span>தமிழ்</span>
              </button>
            </div>

            {/* Single HTML Export shortcut button */}
            <button
              onClick={onOpenExportModal}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition shadow-sm"
              title={t.navExportHtml}
            >
              <FileCode className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.navExportHtml}</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/80 text-xs">
          <button
            onClick={() => onTabChange('apod')}
            className={`px-3 py-1 rounded-md font-semibold transition ${
              activeTab === 'apod' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400'
            }`}
          >
            {t.navApod}
          </button>
          <button
            onClick={() => onTabChange('3d')}
            className={`px-3 py-1 rounded-md font-semibold transition ${
              activeTab === '3d' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400'
            }`}
          >
            {t.nav3D}
          </button>
          <button
            onClick={() => onTabChange('missions')}
            className={`px-3 py-1 rounded-md font-semibold transition ${
              activeTab === 'missions' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400'
            }`}
          >
            {t.navMissions}
          </button>
          <button
            onClick={() => onTabChange('news')}
            className={`px-3 py-1 rounded-md font-semibold transition ${
              activeTab === 'news' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400'
            }`}
          >
            {t.navNews}
          </button>
        </div>
      </div>
    </header>
  );
};
