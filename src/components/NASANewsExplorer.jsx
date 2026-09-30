'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  Search, 
  Calendar, 
  Sparkles, 
  ExternalLink, 
  RefreshCw, 
  Dices, 
  Bookmark, 
  Share2, 
  Check, 
  Filter, 
  ChevronDown, 
  Layers, 
  Globe2, 
  ArrowRight, 
  Clock, 
  Tag, 
  Maximize2, 
  X,
  Compass,
  Rocket
} from 'lucide-react';
import { useFavorites } from '../utils/favorites';

// Available historical filter years
const AVAILABLE_YEARS = [
  { label: 'All Years (2015 - 2026)', value: '' },
  { label: '2026 (Deep Cosmos & Artemis II)', value: '2026' },
  { label: '2025 (Orion Tests & Roman Prep)', value: '2025' },
  { label: '2024 (Europa Clipper Launch)', value: '2024' },
  { label: '2023 (OSIRIS-REx Bennu Return)', value: '2023' },
  { label: '2022 (JWST First Light & DART)', value: '2022' },
  { label: '2021 (Perseverance Lands & JWST Launch)', value: '2021' },
  { label: '2020 (Commercial Crew Demo-2)', value: '2020' },
  { label: '2019 (M87 Black Hole Portrait)', value: '2019' },
  { label: '2018 (Parker Solar Probe to Sun)', value: '2018' },
  { label: '2017 (Cassini Saturn Finale)', value: '2017' },
  { label: '2015 (New Horizons Pluto Flyby)', value: '2015' }
];

// Popular quick discovery search topics
const POPULAR_TOPICS = [
  'James Webb',
  'Mars Rover',
  'Artemis',
  'Black Hole',
  'Europa Clipper',
  'Solar System'
];

export default function NASANewsExplorer({ className = '' }) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);
  const favUtils = useFavorites();
  const isFavorite = favUtils?.isFavorite || favUtils?.isApodSaved || (() => false);
  const toggleFavorite = favUtils?.toggleFavorite || favUtils?.toggleSaveApod || (() => {});

  // Filter & Search states
  const [selectedYear, setSelectedYear] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState('');
  const [archiveMode, setArchiveMode] = useState('all'); // 'all' | 'apod_range'

  // Data & Pagination states
  const [articles, setArticles] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [randomModalItem, setRandomModalItem] = useState(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [translatedMap, setTranslatedMap] = useState({});

  // Multilingual UI Strings
  const UI = {
    en: {
      heading: 'NASA Decade News & Historical Discovery Explorer',
      subheading: 'Query multi-year mission archives, APOD time-series, and NASA media search spanning 2015 to 2026',
      searchPlaceholder: 'Search missions, discoveries (e.g. James Webb, Mars Rover, Artemis)...',
      yearSelector: 'Filter by Mission Year',
      randomBtn: 'Random Historical News',
      loadMoreBtn: 'Load More History',
      allCaughtUp: 'All historical discoveries for this query loaded',
      source: 'Source',
      openNasa: 'NASA Archive',
      saveFavorite: 'Save Favorite',
      share: 'Share',
      copied: 'Link Copied!',
      readMore: 'Mission Briefing',
      close: 'Close',
      historicalArchive: 'Decade Space Archive',
      resultsCount: 'Discoveries Found'
    },
    si: {
      heading: 'නාසා දශකයක ඓතිහාසික පුවත් සහ ගවේෂණ එකතුව',
      subheading: '2015 සිට 2026 දක්වා නාසා මෙහෙයුම් ලේඛනාගාරය, APOD සහ රූප සටහන් ගවේෂණය කරන්න',
      searchPlaceholder: 'මෙහෙයුම් හෝ විද්‍යාත්මක සොයාගැනීම් සොයන්න (උදා: ජේම්ස් වෙබ්, අඟහරු, ආටෙමිස්)...',
      yearSelector: 'වර්ෂය අනුව තෝරන්න',
      randomBtn: 'අහඹු ඓතිහාසික පුවතක්',
      loadMoreBtn: 'තවත් අතීත පුවත් බලන්න',
      allCaughtUp: 'මෙම සෙවුමට අදාළ සියලු ඓතිහාසික තොරතුරු පෙන්වා ඇත',
      source: 'මූලාශ්‍රය',
      openNasa: 'නාසා ලේඛනාගාරය',
      saveFavorite: 'සුරකින්න',
      share: 'බෙදාහරින්න',
      copied: 'සබැඳිය පිටපත් විය!',
      readMore: 'සම්පූර්ණ තොරතුරු',
      close: 'වසන්න',
      historicalArchive: 'දශකයේ අභ්‍යවකාශ එකතුව',
      resultsCount: 'සොයාගැනීම් ප්‍රමාණය'
    },
    ta: {
      heading: 'நாசா பத்தாண்டு வரலாற்று விண்வெளிச் செய்திகள் & ஆய்வுகள்',
      subheading: '2015 முதல் 2026 வரையிலான நாசாவின் விண்வெளிப் பயணங்கள் மற்றும் ஊடகக் களஞ்சியத்தை ஆராயுங்கள்',
      searchPlaceholder: 'திட்டங்கள் மற்றும் கண்டுபிடிப்புகளைத் தேடுங்கள் (எ.கா: ஜேம்ஸ் வெப், செவ்வாய் ரோவர், ஆர்ட்டெமிஸ்)...',
      yearSelector: 'ஆண்டு வாரியாக வடிகட்டவும்',
      randomBtn: 'சீரற்ற வரலாற்று செய்தி',
      loadMoreBtn: 'மேலும் வரலாற்று செய்திகள்',
      allCaughtUp: 'இந்த தேடலுக்கான அனைத்து வரலாற்று ஆவணங்களும் ஏற்றப்பட்டன',
      source: 'மூலம்',
      openNasa: 'நாசா காப்பகம்',
      saveFavorite: 'சேமிக்க',
      share: 'பகிர்க',
      copied: 'இணைப்பு நகலெடுக்கப்பட்டது!',
      readMore: 'முழு விவரம்',
      close: 'மூடுக',
      historicalArchive: 'பத்தாண்டு விண்வெளி ஆவணம்',
      resultsCount: 'கண்டறியப்பட்ட பதிவுகள்'
    }
  };

  const t = UI[currentLang] || UI.en;

  // Fetch articles from backend archive
  const fetchArchive = useCallback(async (targetPage = 1, append = false) => {
    if (targetPage === 1) setIsLoading(true);
    else setIsFetchingMore(true);

    try {
      const activeSearch = activeTopic || searchQuery;
      const params = new URLSearchParams();
      if (selectedYear) params.append('year', selectedYear);
      if (activeSearch) params.append('q', activeSearch);
      params.append('page', targetPage.toString());
      params.append('limit', '8');

      const res = await fetch(`/api/nasa-archive?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const incoming = data.articles || [];
        setTotalCount(data.total || incoming.length);
        setHasMore(data.hasMore ?? incoming.length >= 8);

        if (append) {
          setArticles(prev => {
            const existingIds = new Set(prev.map(x => x.id));
            const newUniques = incoming.filter(x => !existingIds.has(x.id));
            return [...prev, ...newUniques];
          });
        } else {
          setArticles(incoming);
        }
      }
    } catch (err) {
      console.warn('Error fetching NASA archive:', err);
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  }, [selectedYear, searchQuery, activeTopic]);

  // Initial load and filter change trigger
  useEffect(() => {
    setPage(1);
    fetchArchive(1, false);
  }, [selectedYear, activeTopic, fetchArchive]);

  // Handle Search submit / enter
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setActiveTopic('');
    setPage(1);
    fetchArchive(1, false);
  };

  // Load More pagination
  const handleLoadMore = () => {
    if (isFetchingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchArchive(nextPage, true);
  };

  // Pick Random Historical Space News
  const handleRandomDiscovery = () => {
    if (articles.length === 0) return;
    const randomIdx = Math.floor(Math.random() * articles.length);
    const chosen = articles[randomIdx];
    setSelectedDetailItem(chosen);
  };

  // Copy share link
  const handleShare = (item) => {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${url}#${item.id}`);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Get localized content based on language
  const getLocalized = (item) => {
    let title = item.title;
    let desc = item.description;

    if (currentLang === 'si') {
      title = item.titleSi || item.title;
      desc = item.descriptionSi || item.description;
    } else if (currentLang === 'ta') {
      title = item.titleTa || item.title;
      desc = item.descriptionTa || item.description;
    }

    return { title, desc };
  };

  return (
    <div className={`space-y-6 ${className}`}>
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-indigo-950/70 to-slate-950 border border-slate-800/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-3">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.historicalArchive} • 2015 – 2026</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black font-['Orbitron'] text-white tracking-wide">
              {t.heading}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 font-sans leading-relaxed">
              {t.subheading}
            </p>
          </div>

          {/* Random Historical News Action Button */}
          <div className="flex items-center gap-3">
            <motion.button
              type="button"
              onClick={handleRandomDiscovery}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 text-white font-bold font-['Orbitron'] text-xs sm:text-sm shadow-[0_0_25px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] transition-all cursor-pointer whitespace-nowrap"
            >
              <Dices className="w-4 h-4 animate-spin" style={{ animationDuration: '8s' }} />
              <span>{t.randomBtn}</span>
            </motion.button>
          </div>
        </div>

        {/* Filter and Search Bar Strip */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
          
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="md:col-span-7 relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-10 pr-24 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 transition-all font-sans"
            />
            <button
              type="submit"
              className="absolute right-2 px-3 py-1 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-semibold transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Year Filter Dropdown */}
          <div className="md:col-span-5 relative">
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50 transition-all appearance-none cursor-pointer font-sans"
              >
                {AVAILABLE_YEARS.map(y => (
                  <option key={y.value} value={y.value} className="bg-slate-950 text-slate-100 py-1">
                    {y.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Quick Topic Chips */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap flex items-center gap-1">
            <Tag className="w-3 h-3 text-cyan-400" />
            Topics:
          </span>
          {POPULAR_TOPICS.map(topic => {
            const isSelected = activeTopic === topic;
            return (
              <button
                key={topic}
                type="button"
                onClick={() => {
                  if (isSelected) setActiveTopic('');
                  else {
                    setActiveTopic(topic);
                    setSearchQuery('');
                  }
                }}
                className={`px-3 py-1 rounded-xl text-xs font-mono whitespace-nowrap transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                    : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {topic}
              </button>
            );
          })}
        </div>
      </div>

      {/* Discovery Counter Bar */}
      <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>
            {articles.length} {t.resultsCount} {selectedYear ? `(${selectedYear})` : '(2015-2026)'}
          </span>
        </div>
        <div>
          <span>Multi-Year Archive Mode</span>
        </div>
      </div>

      {/* Glassmorphic Multi-Year News Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 py-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-3xl bg-slate-900/60 border border-slate-800/80 p-4 h-80 animate-pulse flex flex-col justify-between">
              <div className="w-full h-40 bg-slate-800/60 rounded-2xl" />
              <div className="space-y-2 mt-4">
                <div className="h-4 bg-slate-800/80 rounded w-3/4" />
                <div className="h-3 bg-slate-800/50 rounded w-full" />
                <div className="h-3 bg-slate-800/50 rounded w-5/6" />
              </div>
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-3xl bg-slate-900/40 border border-slate-800 p-12 text-center space-y-4">
          <Compass className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white font-['Orbitron']">
            No Historical Discoveries Found
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Try adjusting your search keywords or switching the year filter to explore other missions.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedYear('');
              setActiveTopic('');
              setSearchQuery('');
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {articles.map((item, idx) => {
            const { title, desc } = getLocalized(item);
            const isFav = isFavorite(`news-${item.id}`);

            return (
              <motion.article
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: (idx % 8) * 0.05 }}
                className="group flex flex-col justify-between rounded-3xl bg-slate-900/80 hover:bg-slate-900/95 backdrop-blur-xl border border-slate-800/90 hover:border-cyan-500/50 shadow-xl hover:shadow-cyan-950/30 transition-all duration-300 overflow-hidden relative"
              >
                {/* Image Container with HD Badge */}
                <div 
                  className="relative aspect-[16/10] overflow-hidden bg-slate-950 cursor-pointer"
                  onClick={() => setSelectedDetailItem(item)}
                >
                  <img
                    src={item.thumbnail}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

                  {/* Year Tag Badge */}
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-slate-950/80 backdrop-blur-md border border-cyan-500/40 text-[10px] font-mono font-bold text-cyan-300">
                    {item.year || item.date?.slice(0, 4)}
                  </div>

                  {/* Category Pill */}
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-lg bg-indigo-950/80 backdrop-blur-md border border-indigo-500/30 text-[9px] font-mono text-indigo-300">
                    {item.category}
                  </div>

                  {/* Quick Expand Icon Overlay */}
                  <div className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-slate-950/80 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                </div>

                {/* Content Body */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Date stamp */}
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-2">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span>{item.date}</span>
                    </div>

                    {/* Title */}
                    <h3 
                      onClick={() => setSelectedDetailItem(item)}
                      className="text-sm font-bold text-white hover:text-cyan-300 transition-colors line-clamp-2 leading-snug cursor-pointer font-sans"
                    >
                      {title}
                    </h3>

                    {/* Excerpt */}
                    <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed font-sans">
                      {desc}
                    </p>
                  </div>

                  {/* Action Footer Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setSelectedDetailItem(item)}
                      className="inline-flex items-center gap-1 text-xs font-mono font-bold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    >
                      <span>{t.readMore}</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleFavorite({
                          id: `news-${item.id}`,
                          type: 'apod',
                          title: item.title,
                          date: item.date,
                          url: item.thumbnail
                        })}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isFav ? 'bg-pink-500/20 text-pink-400' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                        title={t.saveFavorite}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${isFav ? 'fill-pink-400' : ''}`} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShare(item)}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                        title={copiedId === item.id ? t.copied : t.share}
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      {/* "Load More History" Endless Pagination Button */}
      {articles.length > 0 && (
        <div className="py-6 text-center">
          {hasMore ? (
            <motion.button
              type="button"
              onClick={handleLoadMore}
              disabled={isFetchingMore}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/60 text-slate-100 font-mono font-bold text-xs sm:text-sm shadow-xl transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-cyan-400 ${isFetchingMore ? 'animate-spin' : ''}`} />
              <span>{isFetchingMore ? 'Retrieving Deep Archives...' : t.loadMoreBtn}</span>
            </motion.button>
          ) : (
            <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-500">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>{t.allCaughtUp}</span>
            </div>
          )}
        </div>
      )}

      {/* Full Detail & HD Modal */}
      <AnimatePresence>
        {selectedDetailItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-slate-950 border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setSelectedDetailItem(null)}
                className="absolute top-5 right-5 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Modal Header */}
              <div className="space-y-2 pr-10">
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold">
                    {selectedDetailItem.year || selectedDetailItem.date?.slice(0, 4)}
                  </span>
                  <span className="text-slate-400">• {selectedDetailItem.category}</span>
                  <span className="text-slate-500">• NASA ID: {selectedDetailItem.nasaId}</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold font-['Orbitron'] text-white">
                  {getLocalized(selectedDetailItem).title}
                </h3>
                <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{selectedDetailItem.date}</span>
                </div>
              </div>

              {/* High-Res Image Preview */}
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
                <img
                  src={selectedDetailItem.hdUrl || selectedDetailItem.thumbnail}
                  alt={selectedDetailItem.title}
                  className="w-full max-h-[420px] object-cover"
                />
              </div>

              {/* Scientific Briefing Text */}
              <div className="space-y-3">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                  <Rocket className="w-3.5 h-3.5" />
                  Scientific Mission Debrief
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed font-sans">
                  {getLocalized(selectedDetailItem).desc}
                </p>
              </div>

              {/* External NASA Links & Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3">
                <a
                  href={`https://images.nasa.gov/details/${selectedDetailItem.nasaId || ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 transition-colors"
                >
                  <span>{t.openNasa}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleShare(selectedDetailItem)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedId === selectedDetailItem.id ? t.copied : t.share}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDetailItem(null)}
                    className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono transition-colors cursor-pointer"
                  >
                    {t.close}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
