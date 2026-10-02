import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { SupportedLanguage } from './i18n/translations';
import AnimatedNavbar from './components/AnimatedNavbar.jsx';
import CosmicStarfieldBackground from './components/CosmicStarfieldBackground.jsx';
import FloatingLanguageSwitcher from './components/FloatingLanguageSwitcher';
import AmbientSoundscapeControl from './components/AmbientSoundscapeControl';
import PulsarLoader from './components/PulsarLoader';
import AtmosphericEntryTransition from './components/AtmosphericEntryTransition';
import SlideToAction from './components/SlideToAction.jsx';
import NASABottomBar from './components/NASABottomBar.jsx';
import { ApodViewer } from './components/ApodViewer';
import { Space3DViewer } from './components/Space3DViewer';
import { MissionsTimeline } from './components/MissionsTimeline';
import { NewsSection } from './components/NewsSection';
import { SavedFavorites } from './components/SavedFavorites';
import { SpaceTriviaQuiz } from './components/SpaceTriviaQuiz';
import ISSTracker from './components/ISSTracker.jsx';
import AsteroidRadar from './components/AsteroidRadar.jsx';
import EPICViewer from './components/EPICViewer.jsx';
import ExoplanetLab from './components/ExoplanetLab.jsx';
import FloatingVoiceControl from './components/FloatingVoiceControl.jsx';
import SolarAlertCard from './components/SolarAlertCard.jsx';
import SolarWeatherAlertCard from './components/SolarWeatherAlertCard.jsx';
import SpaceQuizModule from './components/SpaceQuizModule.jsx';
import SmartSpaceQuiz from './components/SmartSpaceQuiz.jsx';
import MarsImageTagger from './components/MarsImageTagger.jsx';
import PWAInstallButton from './components/PWAInstallButton';
import OfflineIndicator from './components/OfflineIndicator';
import { TrilingualProvider } from './context/TrilingualProvider.jsx';
import { ExportHtmlModal } from './components/ExportHtmlModal';
import OpenRouterChat from './components/OpenRouterChat.jsx';
import { useFavorites } from './utils/favorites';
import { 
  Sparkles, 
  Orbit, 
  Rocket, 
  Newspaper, 
  Compass, 
  ExternalLink, 
  FileCode,
  Globe2,
  Cpu,
  Bookmark,
  Heart,
  Radio,
  Clock,
  Activity,
  Layers,
  ChevronRight,
  ShieldCheck,
  Bot,
  MessageSquare,
  BrainCircuit,
  Award
} from 'lucide-react';

type TabKey = 'apod' | '3d' | 'asteroids' | 'epic' | 'exoplanets' | 'missions' | 'news' | 'saved' | 'assistant' | 'quiz' | 'iss';

export default function App() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2) as SupportedLanguage;
  const [activeTab, setActiveTab] = useState<TabKey>('apod');
  const [displayedTab, setDisplayedTab] = useState<TabKey>('apod');
  const [isTabLoading, setIsTabLoading] = useState<boolean>(false);
  const [targetApodDate, setTargetApodDate] = useState<string | undefined>(undefined);
  const [targetMissionId, setTargetMissionId] = useState<string | undefined>(undefined);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const { totalCount, savedApods, savedMissionIds } = useFavorites();

  // Live Mission Control UTC Clock
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(
        now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync HTML title & lang
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const handleTabSwitch = (tab: TabKey) => {
    if (tab === activeTab && !isTabLoading) return;

    setActiveTab(tab);
    setIsTabLoading(true);

    const element = document.getElementById('main-tab-content');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }

    // Trigger glowing pulsar animation transition
    setTimeout(() => {
      setDisplayedTab(tab);
      setIsTabLoading(false);
    }, 420);
  };

  // Voice Navigation command dispatcher
  const handleVoiceNavigate = (target: string) => {
    if (target === 'mars') {
      setTargetMissionId('perseverance');
      handleTabSwitch('missions');
    } else if (target === 'sun') {
      handleTabSwitch('missions');
    } else if (target === 'iss') {
      handleTabSwitch('iss');
    } else if (target === 'epic') {
      handleTabSwitch('epic');
    } else if (target === 'exoplanets') {
      handleTabSwitch('exoplanets');
    } else if (target === 'asteroids') {
      handleTabSwitch('asteroids');
    } else if (target === 'apod') {
      handleTabSwitch('apod');
    } else if (target === 'quiz') {
      handleTabSwitch('quiz');
    }
  };

  const handleVoiceCameraAction = (action: string) => {
    window.dispatchEvent(new CustomEvent('nasa-camera-action', { detail: { action } }));
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative">
      {/* High-Performance 60FPS Cosmic Starfield & Meteor Particle Background */}
      <CosmicStarfieldBackground starCount={240} enableMeteors={true} speed={0.28} />

      {/* Floating Trilingual Language Switcher (Top-Right) */}
      <FloatingLanguageSwitcher />

      {/* Mission Control Live Telemetry Top Strip */}
      <div className="relative z-50 bg-[#070A12]/95 border-b border-cyan-500/15 py-1.5 px-4 text-[11px] font-mono text-slate-400 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              DSN LIVE LINK
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>{utcTime || 'SYNCHRONIZING...'}</span>
            </span>
            <span className="hidden md:inline text-slate-600">|</span>
            <span className="hidden md:inline text-slate-400">
              ISS VELOCITY: <span className="text-cyan-300">27,580 KM/H</span> · ALT: <span className="text-cyan-300">418 KM</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden lg:inline text-slate-400">
              AI ENGINE: <span className="text-emerald-300 font-semibold">GEMINI 2.5 FLASH</span>
            </span>
            {/* PWA In-App Install Button */}
            <PWAInstallButton lang={lang} />
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 transition"
            >
              <FileCode className="w-3 h-3" />
              <span>{t('navExportHtml')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Animated Navigation Bar with Framer Motion layoutId */}
      <AnimatedNavbar
        activeTab={activeTab}
        onTabChange={(tab) => handleTabSwitch(tab as any)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
      />

      {/* Main Content Dashboard Container */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        
        {/* Sleek Hero Banner with Glassmorphism and Mission Highlights */}
        <section className="relative rounded-3xl p-6 sm:p-8 overflow-hidden border border-cyan-500/20 bg-gradient-to-br from-[#0B0F19]/90 via-[#0d1424]/90 to-[#0B0F19]/95 shadow-2xl backdrop-blur-2xl">
          <div className="absolute -right-16 -top-16 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {lang === 'en' && 'Real-Time NASA Feed & Gemini AI Dynamic Translation'}
                {lang === 'si' && 'නාසා සජීවී දත්ත සහ Gemini AI ස්වභාවික සිංහල පරිවර්තනය'}
                {lang === 'ta' && 'நாசா நேரலை தரவு & Gemini AI துல்லிய தமிழ் மொழிபெயர்ப்பு'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight font-['Orbitron']">
              {lang === 'en' && (
                <>Explore the Cosmos in <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">Three Languages</span></>
              )}
              {lang === 'si' && (
                <>විශ්වයේ විස්මිත අසිරිය <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">සිංහල බසින්</span> විඳගන්න</>
              )}
              {lang === 'ta' && (
                <>பிரபஞ்சத்தின் அதிசயங்களை <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">தமிழில்</span> ஆராயுங்கள்</>
              )}
            </h1>

            <p className="text-xs sm:text-sm md:text-base text-slate-300 leading-relaxed max-w-2xl font-sans">
              {lang === 'en' && 'Astronomy Picture of the Day (APOD), interactive 3D celestial mechanics, landmark spaceflight breakdowns from Apollo to Artemis, and live deep-space discoveries translated dynamically on-the-fly.'}
              {lang === 'si' && 'නාසා ආයතනයේ දවසේ තාරකා විද්‍යා ඡායාරූපය (APOD), ත්‍රිමාන (3D) අභ්‍යවකාශ ආකෘති, ඇපලෝ සිට ආටෙමිස් දක්වා ඓතිහාසික චන්ද්‍ර මෙහෙයුම් සහ සජීවී විද්‍යා පුවත් එකම වේදිකාවකින්.'}
              {lang === 'ta' && 'நாசாவின் நாளின் வானியல் புகைப்படம் (APOD), 3D கோளப் பார்வை, வரலாற்று விண்வெளி பயணங்களின் விரிவான தகவல்கள் மற்றும் நேரலைச் செய்திகள்.'}
            </p>

            {/* Slide To Action Quick Launcher */}
            <div className="pt-2 max-w-sm">
              <SlideToAction
                label={
                  lang === 'si' ? 'ගවේෂණය සඳහා අදින්න' :
                  lang === 'ta' ? 'ஆராய ஸ்லைடு செய்யவும்' :
                  'Slide to Explore 3D Lab'
                }
                successLabel={
                  lang === 'si' ? '3D අභ්‍යවකාශගාරය විවෘතයි' :
                  lang === 'ta' ? '3D ஆய்வகம் திறக்கப்பட்டது' :
                  '3D Space Lab Launched!'
                }
                onSuccess={() => handleTabSwitch('3d')}
              />
            </div>
          </div>
        </section>

        {/* Space Dashboard Multi-Card Grid Hub with Framer Motion hover */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
          {/* Tile 1: APOD */}
          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTabSwitch('apod')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
              activeTab === 'apod'
                ? 'bg-cyan-950/40 border-cyan-400/60 shadow-lg shadow-cyan-950/50'
                : 'bg-[#0B0F19]/80 hover:bg-slate-900/60 border-slate-800 hover:border-cyan-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                <Compass className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                DAILY
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-bold text-white font-['Orbitron']">
                {t('navApod')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                4K Space Imagery
              </p>
            </div>
          </motion.button>

          {/* Tile 2: 3D Lab */}
          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTabSwitch('3d')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
              activeTab === '3d'
                ? 'bg-blue-950/40 border-blue-400/60 shadow-lg shadow-blue-950/50'
                : 'bg-[#0B0F19]/80 hover:bg-slate-900/60 border-slate-800 hover:border-blue-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
                <Orbit className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                WEBGL 60FPS
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-bold text-white font-['Orbitron']">
                {t('nav3D')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Planets & JWST
              </p>
            </div>
          </motion.button>

          {/* Tile 3: Missions */}
          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTabSwitch('missions')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
              activeTab === 'missions'
                ? 'bg-amber-950/30 border-amber-400/60 shadow-lg shadow-amber-950/50'
                : 'bg-[#0B0F19]/80 hover:bg-slate-900/60 border-slate-800 hover:border-amber-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                TIMELINE
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-bold text-white font-['Orbitron']">
                {t('navMissions')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Apollo to Artemis
              </p>
            </div>
          </motion.button>

          {/* Tile 4: NASA News */}
          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTabSwitch('news')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
              activeTab === 'news'
                ? 'bg-emerald-950/30 border-emerald-400/60 shadow-lg shadow-emerald-950/50'
                : 'bg-[#0B0F19]/80 hover:bg-slate-900/60 border-slate-800 hover:border-emerald-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Newspaper className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                LIVE RSS
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-bold text-white font-['Orbitron']">
                {t('navNews')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Gemini AI Translate
              </p>
            </div>
          </motion.button>

          {/* Tile 5: Space Trivia Quiz */}
          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTabSwitch('quiz')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
              activeTab === 'quiz'
                ? 'bg-cyan-950/50 border-cyan-400/70 shadow-lg shadow-cyan-950/60'
                : 'bg-[#0B0F19]/80 hover:bg-slate-900/60 border-slate-800 hover:border-cyan-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                TRIVIA
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-bold text-white font-['Orbitron']">
                {lang === 'si' ? 'දැනුම මිනුම' : lang === 'ta' ? 'வினாடி வினா' : 'Space Trivia'}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                {lang === 'si' ? 'Gemini AI ප්‍රශ්න' : lang === 'ta' ? 'AI வினாக்கள்' : 'AI Quiz & Confetti'}
              </p>
            </div>
          </motion.button>

          {/* Tile 6: AI Assistant (OpenRouter) */}
          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTabSwitch('assistant')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
              activeTab === 'assistant'
                ? 'bg-purple-950/40 border-purple-400/60 shadow-lg shadow-purple-950/50'
                : 'bg-[#0B0F19]/80 hover:bg-slate-900/60 border-slate-800 hover:border-purple-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                OPENROUTER
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-bold text-white font-['Orbitron']">
                AI Assistant
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Llama 3.3 & DeepSeek
              </p>
            </div>
          </motion.button>

          {/* Tile 7: ISS Tracker */}
          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTabSwitch('iss')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
              activeTab === 'iss'
                ? 'bg-indigo-950/50 border-indigo-400/70 shadow-lg shadow-indigo-950/60'
                : 'bg-[#0B0F19]/80 hover:bg-slate-900/60 border-slate-800 hover:border-indigo-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                <Globe2 className="w-5 h-5 text-indigo-400 animate-spin" style={{ animationDuration: '30s' }} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-bold text-white font-['Orbitron']">
                {lang === 'si' ? 'ISS ලුහුබැඳීම' : lang === 'ta' ? 'ISS நேரலை' : 'ISS Tracker'}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                {lang === 'si' ? 'තත්‍ය කාලීන කක්ෂය' : lang === 'ta' ? 'நேரலை சுற்றுப்பாதை' : 'Real-Time Orbit'}
              </p>
            </div>
          </motion.button>

          {/* Tile 8: Saved Favorites */}
          <motion.button
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTabSwitch('saved')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
              activeTab === 'saved'
                ? 'bg-pink-950/40 border-pink-400/60 shadow-lg shadow-pink-950/50'
                : 'bg-[#0B0F19]/80 hover:bg-slate-900/60 border-slate-800 hover:border-pink-500/40'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center">
                <Heart className={`w-5 h-5 ${totalCount > 0 ? 'text-pink-400 fill-pink-500/40' : 'text-pink-400'}`} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 font-bold">
                {totalCount} ITEMS
              </span>
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-bold text-white font-['Orbitron']">
                {t('navSaved')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Cosmic Favorites
              </p>
            </div>
          </motion.button>
        </section>

        {/* Dashboard Workspace Display (Active View) */}
        <div id="main-tab-content" className="scroll-mt-24">
          <AnimatePresence mode="wait">
            {isTabLoading && (
              <PulsarLoader key={`loader-${activeTab}`} targetTab={activeTab} lang={lang} />
            )}

            {!isTabLoading && displayedTab === 'apod' && (
              <AtmosphericEntryTransition key="entry-apod" tabKey="apod">
                <section className="space-y-4">
                  <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                        <Compass className="w-6 h-6 text-cyan-400" />
                        <span>{t('apodHeading')}</span>
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1">
                        {t('apodSubheading')}
                      </p>
                    </div>
                  </div>

                  <ApodViewer 
                    lang={lang} 
                    onOpenExportModal={() => setIsExportModalOpen(true)} 
                    initialDate={targetApodDate}
                  />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === '3d' && (
              <AtmosphericEntryTransition key="entry-3d" tabKey="3d">
                <section className="space-y-4">
                  <div className="border-b border-slate-800/80 pb-3">
                    <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                      <Orbit className="w-6 h-6 text-cyan-400" />
                      <span>{t('visualizerHeading')}</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      {t('visualizerSubheading')}
                    </p>
                  </div>

                  <Space3DViewer lang={lang} />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'asteroids' && (
              <AtmosphericEntryTransition key="entry-asteroids" tabKey="asteroids">
                <AsteroidRadar lang={lang} />
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'epic' && (
              <AtmosphericEntryTransition key="entry-epic" tabKey="epic">
                <EPICViewer lang={lang} />
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'exoplanets' && (
              <AtmosphericEntryTransition key="entry-exoplanets" tabKey="exoplanets">
                <ExoplanetLab lang={lang} />
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'missions' && (
              <AtmosphericEntryTransition key="entry-missions" tabKey="missions">
                <section className="space-y-6">
                  <div className="border-b border-slate-800/80 pb-3">
                    <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                      <Rocket className="w-6 h-6 text-cyan-400" />
                      <span>{t('missionsHeading')}</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      {t('missionsSubheading')}
                    </p>
                  </div>

                  <MissionsTimeline 
                    lang={lang} 
                    initialMissionId={targetMissionId}
                  />

                  {/* Mars Rover Surface Image Hotspot Tagger */}
                  <MarsImageTagger />

                  {/* Solar Weather AI Alert System */}
                  <SolarWeatherAlertCard />
                  <SolarAlertCard />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'news' && (
              <AtmosphericEntryTransition key="entry-news" tabKey="news">
                <section className="space-y-4">
                  <div className="border-b border-slate-800/80 pb-3">
                    <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                      <Newspaper className="w-6 h-6 text-cyan-400" />
                      <span>{t('newsHeading')}</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      {t('newsSubheading')}
                    </p>
                  </div>

                  <NewsSection lang={lang} />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'saved' && (
              <AtmosphericEntryTransition key="entry-saved" tabKey="saved">
                <section className="space-y-4">
                  <SavedFavorites
                    lang={lang}
                    onNavigateToApod={(date) => {
                      if (date) setTargetApodDate(date);
                      handleTabSwitch('apod');
                    }}
                    onNavigateToMission={(missionId) => {
                      if (missionId) setTargetMissionId(missionId);
                      handleTabSwitch('missions');
                    }}
                  />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'quiz' && (
              <AtmosphericEntryTransition key="entry-quiz" tabKey="quiz">
                <section className="space-y-6">
                  {/* Smart Interactive Space Flight Quiz */}
                  <SmartSpaceQuiz />
                  <SpaceQuizModule lang={lang} />
                  <SpaceTriviaQuiz lang={lang} />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'iss' && (
              <AtmosphericEntryTransition key="entry-iss" tabKey="iss">
                <section className="space-y-4">
                  <ISSTracker />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'assistant' && (
              <AtmosphericEntryTransition key="entry-assistant" tabKey="assistant">
                <section className="space-y-4">
                  <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                        <Bot className="w-6 h-6 text-purple-400" />
                        <span>NASA Astrophysics AI Assistant</span>
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1">
                        NASA Deep Space Intelligence & Mission Assistant • Fluent in English, සිංහල, and தமிழ்
                      </p>
                    </div>
                  </div>

                  <OpenRouterChat />
                </section>
              </AtmosphericEntryTransition>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Floating AI Assistant Quick Trigger (Desktop & Mobile) */}
      <button
        type="button"
        onClick={() => handleTabSwitch('assistant')}
        className={`fixed bottom-24 sm:bottom-8 right-5 z-40 p-3 sm:px-4 sm:py-3 rounded-full flex items-center gap-2 shadow-2xl transition-all duration-300 ${
          activeTab === 'assistant'
            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white ring-2 ring-purple-400 scale-105 shadow-purple-500/50'
            : 'bg-[#0B0F19]/90 border border-purple-500/40 text-purple-300 hover:border-purple-400 hover:bg-slate-900/90 shadow-purple-950/60 hover:scale-105'
        }`}
        title="Open NASA AI Assistant"
      >
        <div className="relative">
          <Bot className="w-5 h-5 text-purple-300" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        </div>
        <span className="hidden sm:inline text-xs font-bold font-['Orbitron'] tracking-wider">
          NASA AI
        </span>
      </button>

      {/* Cosmic Dashboard Footer */}
      <footer className="relative z-10 mt-16 pb-28 border-t border-slate-800/80 bg-[#070A12]/90 py-10 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-900/60 border border-cyan-400/40 flex items-center justify-center font-['Orbitron'] font-bold text-[11px] text-rose-500 shadow-md">
              NASA
            </div>
            <div>
              <div className="text-white font-semibold font-['Orbitron']">{t('appName')}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                {t('footerPoweredBy')}
              </div>
            </div>
          </div>

          {/* Ambient Deep Space Soundscape Synthesizer Control */}
          <div className="flex items-center justify-center">
            <AmbientSoundscapeControl lang={lang} />
          </div>

          <div className="flex items-center gap-5 text-xs">
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1.5 transition"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{t('navExportHtml')}</span>
            </button>
            <a
              href="https://api.nasa.gov"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-cyan-400 transition flex items-center gap-1"
            >
              <span>NASA API Portal</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

      {/* Offline Status & Cached Telemetry Indicator */}
      <OfflineIndicator lang={lang} />

      {/* Voice-Controlled 3D Navigation Hook Floating Mic Overlay */}
      <FloatingVoiceControl
        onNavigate={handleVoiceNavigate}
        onCameraAction={handleVoiceCameraAction}
        lang={lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-IN' : 'en-US'}
        className="bottom-24 sm:bottom-24 right-5"
      />

      {/* Responsive iOS-Style Bottom Navigation Bar with Spring Bounce Animation */}
      <NASABottomBar
        activeTab={activeTab}
        onTabChange={(tabId: string) => handleTabSwitch(tabId as any)}
      />

      {/* Single HTML Export / Copy Modal */}
      <ExportHtmlModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        lang={lang}
      />
    </div>
  );
}
