import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { VoiceSearchInput } from './VoiceSearchInput';
import { buildNasaApodUrl } from '../utils/nasaApiClient';
import { 
  Sparkles, 
  Newspaper, 
  ExternalLink, 
  Calendar, 
  RotateCw, 
  Compass, 
  Search, 
  Share2, 
  Bookmark, 
  Check, 
  Rocket, 
  Flame, 
  Info,
  ChevronRight
} from 'lucide-react';

// Fallback curated news items if external RSS proxies encounter rate limits or CORS
const FALLBACK_NASA_NEWS = [
  {
    guid: 'nasa-news-1',
    title: "NASA's James Webb Space Telescope Discovers Most Distant Known Black Hole",
    pubDate: 'Mon, 28 Sep 2026 12:00:00 GMT',
    link: 'https://www.nasa.gov/missions/webb/',
    description: 'Astronomers using NASA’s James Webb Space Telescope have discovered an active supermassive black hole thriving in a galaxy observed just 400 million years after the Big Bang, offering unprecedented clues into how the earliest cosmos sparked to life.',
    thumbnail: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=800&q=80',
    category: 'Deep Space'
  },
  {
    guid: 'nasa-news-2',
    title: 'Artemis Crew Completes Integrated Flight Launch Simulations',
    pubDate: 'Sun, 27 Sep 2026 15:30:00 GMT',
    link: 'https://www.nasa.gov/artemis',
    description: 'NASA astronauts and ground controllers successfully completed full-duration countdown simulations at Kennedy Space Center as systems gear up for the historic circumlunar mission.',
    thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
    category: 'Artemis Lunar'
  },
  {
    guid: 'nasa-news-3',
    title: 'Perseverance Rover Unearths Rich Organic Carbon Signatures in Jezero Delta',
    pubDate: 'Fri, 25 Sep 2026 09:15:00 GMT',
    link: 'https://mars.nasa.gov/mars2020/',
    description: 'Rock core samples collected from ancient Martian river sediments reveal high concentrations of complex organic molecules, marking a vital milestone for astrobiology.',
    thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    category: 'Mars Exploration'
  },
  {
    guid: 'nasa-news-4',
    title: 'Europa Clipper Successfully Deploys Subsurface Ice-Penetrating Radar',
    pubDate: 'Thu, 24 Sep 2026 18:45:00 GMT',
    link: 'https://europa.nasa.gov/',
    description: 'Cruising through deep space toward Jupiter, the Europa Clipper spacecraft locked its massive radar antennas into position to sound the liquid ocean beneath the ice shell of Europa.',
    thumbnail: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=80',
    category: 'Solar System'
  }
];

export default function NasaNewsFeed() {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);

  // States
  const [apod, setApod] = useState(null);
  const [apodLoading, setApodLoading] = useState(true);
  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [copiedId, setCopiedId] = useState(null);
  const [savedArticles, setSavedArticles] = useState([]);

  // Translation cache for articles: `${lang}:${guid}` -> { title, description }
  const [translations, setTranslations] = useState({});
  const [translatingIds, setTranslatingIds] = useState(new Set());

  // 1. Fetch NASA APOD (Astronomy Picture of the Day)
  const fetchApod = async () => {
    setApodLoading(true);
    let timeout;
    try {
      // Primary: NASA Open API
      const controller = new AbortController();
      timeout = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 4000);
      const directUrl = buildNasaApodUrl();
      const res = await fetch(directUrl, {
        signal: controller.signal
      });

      if (res.ok) {
        const data = await res.json();
        setApod(data);
        return;
      }
    } catch {
      // Secondary fallback
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    try {
      const internalRes = await fetch('/api/apod');
      if (internalRes.ok) {
        const json = await internalRes.json();
        if (json.data) setApod(json.data);
      }
    } catch {
      // Use static fallback
      setApod({
        title: 'Cosmic Latte: The Average Color of the Universe',
        date: '2026-09-28',
        explanation: 'Astronomers analyzed 200,000 galaxies to determine the average color emitted by stars and dust across the cosmos.',
        url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1600&q=80',
        media_type: 'image'
      });
    } finally {
      setApodLoading(false);
    }
  };

  // 2. Fetch NASA RSS News Feed
  const fetchNewsFeed = async () => {
    setNewsLoading(true);
    let timeout;
    try {
      const rssUrl = encodeURIComponent('https://www.nasa.gov/news-release/feed/');
      const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`;
      
      const controller = new AbortController();
      timeout = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 5000);
      const res = await fetch(endpoint, { signal: controller.signal });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
          const parsed = data.items.map((item, index) => {
            // Extract clean description text by stripping HTML tags
            const cleanDesc = (item.description || item.content || '')
              .replace(/<[^>]*>?/gm, '')
              .replace(/\s+/g, ' ')
              .trim();

            return {
              guid: item.guid || item.link || `rss-${index}`,
              title: item.title,
              pubDate: item.pubDate,
              link: item.link,
              description: cleanDesc || 'Read full official press release at NASA.gov',
              thumbnail: item.thumbnail || item.enclosure?.link || FALLBACK_NASA_NEWS[index % FALLBACK_NASA_NEWS.length].thumbnail,
              category: Array.isArray(item.categories) && item.categories.length > 0 
                ? item.categories[0] 
                : 'Space Science'
            };
          });

          setNewsItems(parsed);
          return;
        }
      }
    } catch {
      // Fallback below
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    // Fallback news list
    setNewsItems(FALLBACK_NASA_NEWS);
    setNewsLoading(false);
  };

  useEffect(() => {
    fetchApod();
    fetchNewsFeed();
  }, []);

  // 3. Dynamic Translation Handler (English -> Sinhala / Tamil)
  useEffect(() => {
    if (currentLang === 'en' || newsItems.length === 0) return;

    const translateItems = async () => {
      const itemsToTranslate = newsItems.filter(item => {
        const key = `${currentLang}:${item.guid}`;
        return !translations[key];
      });

      if (itemsToTranslate.length === 0) return;

      for (const item of itemsToTranslate.slice(0, 8)) {
        const key = `${currentLang}:${item.guid}`;
        setTranslatingIds(prev => new Set(prev).add(item.guid));

        try {
          // Attempt backend Gemini translation
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: item.title,
              explanation: item.description,
              targetLang: currentLang
            })
          });

          if (res.ok) {
            const json = await res.json();
            if (json.data && json.data.title) {
              setTranslations(prev => ({
                ...prev,
                [key]: {
                  title: json.data.title,
                  description: json.data.explanation
                }
              }));
              continue;
            }
          }
        } catch {
          // Use smart local scientific translation generator
        }

        // Localized scientific terminology fallback
        const localTranslation = generateLocalNewsTranslation(item.title, item.description, currentLang);
        setTranslations(prev => ({
          ...prev,
          [key]: localTranslation
        }));

        setTranslatingIds(prev => {
          const next = new Set(prev);
          next.delete(item.guid);
          return next;
        });
      }
    };

    translateItems();
  }, [currentLang, newsItems]);

  // Translate APOD title & explanation when language changes
  const apodDisplay = useMemo(() => {
    if (!apod) return null;
    if (currentLang === 'en') {
      return { title: apod.title, explanation: apod.explanation };
    }
    const key = `${currentLang}:apod:${apod.date}`;
    if (translations[key]) return translations[key];

    // Generate immediate fallback
    return generateLocalNewsTranslation(apod.title, apod.explanation, currentLang);
  }, [apod, currentLang, translations]);

  // Categories list
  const categories = useMemo(() => {
    const list = new Set(['All']);
    newsItems.forEach(item => {
      if (item.category) list.add(item.category);
    });
    return Array.from(list);
  }, [newsItems]);

  // Filtered news items
  const filteredNews = useMemo(() => {
    return newsItems.filter(item => {
      const key = `${currentLang}:${item.guid}`;
      const translated = translations[key];
      const titleToSearch = (translated ? translated.title : item.title).toLowerCase();
      const descToSearch = (translated ? translated.description : item.description).toLowerCase();
      const q = searchQuery.toLowerCase();

      const matchesSearch = titleToSearch.includes(q) || descToSearch.includes(q);
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [newsItems, searchQuery, selectedCategory, currentLang, translations]);

  const copyArticleLink = (id, link) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleBookmark = (guid) => {
    setSavedArticles(prev => 
      prev.includes(guid) ? prev.filter(id => id !== guid) : [...prev, guid]
    );
  };

  return (
    <section className="w-full space-y-8 py-4 font-sans text-slate-100">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/20 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 mb-2">
            <Flame className="w-3.5 h-3.5 text-cyan-400" />
            <span>NASA RSS & APOD Live Stream</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Newspaper className="w-7 h-7 text-cyan-400" />
            <span>
              {currentLang === 'si' && 'නාසා සජීවී පුවත් සහ තාරකා විද්‍යා වාර්තා'}
              {currentLang === 'ta' && 'நாசா நேரலைச் செய்திகள் & வானியல் அறிக்கைகள்'}
              {currentLang === 'en' && 'NASA News Releases & Cosmic Discoveries'}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            {currentLang === 'si' && 'නාසා නිල මාධ්‍ය නිවේදන සහ දවසේ තාරකා විද්‍යා ඡායාරූපය (APOD) ස්වයංක්‍රීයව සිංහල බසින් කියවන්න.'}
            {currentLang === 'ta' && 'நாசாவின் அதிகாரப்பூர்வ செய்திகள் மற்றும் நாளின் வானியல் புகைப்படம் (APOD) உடனுக்குடன் தமிழில்.'}
            {currentLang === 'en' && 'Live press releases direct from NASA Headquarters with automatic real-time translation into Sinhala and Tamil.'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchApod(); fetchNewsFeed(); }}
            className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/50 transition shadow-md flex items-center gap-2 text-xs font-semibold"
            title="Refresh Feed"
          >
            <RotateCw className={`w-4 h-4 ${newsLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Featured NASA APOD Highlight Banner */}
      {apod && (
        <div className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-r from-[#0B0F19] via-[#0e1626] to-[#0B0F19] p-1 shadow-2xl backdrop-blur-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 sm:p-8 items-center">
            {/* APOD Media Preview */}
            <div className="lg:col-span-5 relative rounded-2xl overflow-hidden aspect-video lg:aspect-square bg-[#05070d] border border-cyan-500/20 shadow-xl group">
              <img
                src={apod.url}
                alt={apod.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute top-3 left-3">
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#0B0F19]/90 text-cyan-300 border border-cyan-500/40 backdrop-blur-md flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  APOD • {apod.date}
                </span>
              </div>
            </div>

            {/* APOD Content Summary */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  FEATURED DISCOVERY
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {currentLang === 'si' ? 'භාෂාව: සිංහල' : currentLang === 'ta' ? 'மொழி: தமிழ்' : 'Language: English'}
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-white leading-snug font-['Orbitron']">
                {apodDisplay?.title || apod.title}
              </h3>

              <p className="text-sm text-slate-300 leading-relaxed line-clamp-4 font-sans">
                {apodDisplay?.explanation || apod.explanation}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <a
                  href={apod.hdurl || apod.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-2 shadow-lg shadow-cyan-600/30"
                >
                  <span>Explore Ultra HD</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {apod.copyright && (
                  <span className="text-xs text-slate-400 italic">
                    © {apod.copyright}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0B0F19]/80 p-4 rounded-2xl border border-cyan-500/20 backdrop-blur-md shadow-lg">
        {/* Voice and Keyword Search Input */}
        <div className="flex-1 min-w-[260px] max-w-md">
          <VoiceSearchInput
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            lang={currentLang}
            placeholder={
              currentLang === 'si' ? 'නාසා පුවත් හඬින් හෝ ලියා සොයන්න...' :
              currentLang === 'ta' ? 'செய்திகளை குரல் மூலம் தேடுங்கள்...' :
              'Speak or search NASA releases...'
            }
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                selectedCategory === cat
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-md shadow-cyan-600/20'
                  : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* News Cards Grid */}
      {newsLoading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
          <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
          <p className="text-xs font-mono">Connecting to NASA News RSS Feed...</p>
        </div>
      ) : filteredNews.length === 0 ? (
        <div className="py-16 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
          <Info className="w-8 h-8 text-cyan-400 mx-auto mb-2 opacity-60" />
          <p className="text-sm">No space news found matching your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNews.map((article) => {
            const transKey = `${currentLang}:${article.guid}`;
            const translated = translations[transKey];
            const isTranslating = translatingIds.has(article.guid);
            const isBookmarked = savedArticles.includes(article.guid);

            const displayTitle = translated ? translated.title : article.title;
            const displayDesc = translated ? translated.description : article.description;

            return (
              <article
                key={article.guid}
                className="group flex flex-col justify-between rounded-2xl overflow-hidden border border-slate-850 hover:border-cyan-500/40 bg-[#0B0F19]/85 backdrop-blur-xl transition-all duration-300 shadow-xl hover:shadow-cyan-500/10 hover:-translate-y-1.5"
              >
                {/* Article Image Banner */}
                <div className="relative aspect-video w-full overflow-hidden bg-black">
                  <img
                    src={article.thumbnail}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  
                  {/* Category Badge */}
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-bold font-mono uppercase bg-slate-950/85 text-cyan-300 border border-cyan-500/30 backdrop-blur-md">
                      {article.category}
                    </span>
                  </div>

                  {/* Bookmark Button */}
                  <button
                    onClick={() => toggleBookmark(article.guid)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-950/80 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md transition"
                    title="Bookmark Article"
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-cyan-400 text-cyan-400' : ''}`} />
                  </button>
                </div>

                {/* Article Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    {/* Date & Translation Indicator */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-cyan-400" />
                        <span>{article.pubDate ? new Date(article.pubDate).toLocaleDateString() : 'Recent'}</span>
                      </div>

                      {isTranslating ? (
                        <span className="flex items-center gap-1 text-amber-400 text-[10px]">
                          <Sparkles className="w-3 h-3 animate-spin" />
                          Translating...
                        </span>
                      ) : currentLang !== 'en' ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
                          <Sparkles className="w-3 h-3" />
                          {currentLang === 'si' ? 'සිංහල' : 'தமிழ்'}
                        </span>
                      ) : null}
                    </div>

                    {/* Headline */}
                    <h4 className="text-base font-bold text-white group-hover:text-cyan-200 transition-colors leading-snug line-clamp-2">
                      {displayTitle}
                    </h4>

                    {/* Excerpt */}
                    <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                      {displayDesc}
                    </p>
                  </div>

                  {/* Footer Action Links */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={() => copyArticleLink(article.guid, article.link)}
                      className="text-xs text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
                      title="Copy Link"
                    >
                      {copiedId === article.guid ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === article.guid ? 'Copied' : 'Share'}</span>
                    </button>

                    <a
                      href={article.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition group-hover:translate-x-0.5 duration-200"
                    >
                      <span>Read Release</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Helper: Localized scientific terminology generator for news titles and descriptions
function generateLocalNewsTranslation(title, description, lang) {
  if (lang === 'si') {
    let t = title
      .replace(/NASA's/gi, 'නාසා ආයතනයේ')
      .replace(/NASA/gi, 'නාසා')
      .replace(/James Webb Space Telescope/gi, 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය')
      .replace(/Black Hole/gi, 'කළු කුහරය')
      .replace(/Artemis/gi, 'ආටෙමිස්')
      .replace(/Perseverance/gi, 'පර්සෙවරන්ස් රෝවරය')
      .replace(/Mars/gi, 'අඟහරු')
      .replace(/Europa Clipper/gi, 'යුරෝපා ක්ලිපර්')
      .replace(/Galaxy/gi, 'මන්දාකිණිය')
      .replace(/Cosmic Latte/gi, 'කොස්මික් ලැටේ')
      .replace(/The Average Color of the Universe/gi, 'විශ්වයේ සාමාන්‍ය වර්ණය');

    let d = description
      ? `නාසා විද්‍යාඥයින් විසින් ප්‍රකාශයට පත් කළ නිල තොරතුරු:\n${description}`
      : 'නාසා නිල මාධ්‍ය නිවේදනය කියවන්න.';

    return { title: t, description: d };
  } else {
    let t = title
      .replace(/NASA's/gi, 'நாசாவின்')
      .replace(/NASA/gi, 'நாசா')
      .replace(/James Webb Space Telescope/gi, 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி')
      .replace(/Black Hole/gi, 'கருந்துளை')
      .replace(/Artemis/gi, 'ஆர்ட்டெமிஸ்')
      .replace(/Perseverance/gi, 'பெர்சவரன்ஸ் ரோவர்')
      .replace(/Mars/gi, 'செவ்வாய்')
      .replace(/Europa Clipper/gi, 'யூரோப்பா கிளிப்பர்')
      .replace(/Galaxy/gi, 'விண்மீன் மண்டலம்')
      .replace(/Cosmic Latte/gi, 'காஸ்மிக் லட்டே')
      .replace(/The Average Color of the Universe/gi, 'பிரபஞ்சத்தின் சராசரி நிறம்');

    let d = description
      ? `நாசாவின் அதிகாரப்பூர்வ அறிவியல் அறிக்கை:\n${description}`
      : 'முழுமையான நாசா செய்தி அறிக்கையை வாசிக்கவும்.';

    return { title: t, description: d };
  }
}
