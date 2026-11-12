import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { VoiceSearchInput } from './VoiceSearchInput';
import { fetchApod as fetchApodPipeline, fetchSpaceNewsStatus as fetchNewsPipeline, translateSpaceContent } from '@/lib/nasaApi';
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

function NasaNewsFeed() {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);

  // States
  const [apod, setApod] = useState(null);
  const [apodLoading, setApodLoading] = useState(true);
  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsStatus, setNewsStatus] = useState({ ok: true, partial: false });
  const newsRequest = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [copiedId, setCopiedId] = useState(null);
  const [savedArticles, setSavedArticles] = useState([]);

  // Translation cache for articles: `${lang}:${guid}` -> { title, description }
  const [translations, setTranslations] = useState({});
  const [translatingIds, setTranslatingIds] = useState(new Set());

  // The shared pipeline rejects synthetic APOD records. Do not reuse legacy
  // IndexedDB entries: their provenance and requested date are not trustworthy.
  const fetchApod = async () => {
    setApodLoading(true);
    try {
      const data = await fetchApodPipeline();
      setApod(data && !data._isSample && !data._isFallback ? data : null);
    } catch {
      setApod(null);
    } finally {
      setApodLoading(false);
    }
  };

  const fetchNewsFeed = async (refresh = false) => {
    const request = ++newsRequest.current;
    setNewsLoading(true);
    try {
      const result = await fetchNewsPipeline({ refresh });
      if (request !== newsRequest.current) return;
      setNewsStatus(result);
      const formatted = result.items
        .filter(item => !item._isSample && typeof item.title === 'string' && typeof item.url === 'string' && /^https?:\/\//i.test(item.url))
        .map((item, index) => ({
          guid: item.id || `news-${index}`,
          title: item.title,
          pubDate: item.publishedAt || item.date || null,
          link: item.url,
          description: item.summary || item.description || '',
          thumbnail: item.imageUrl || item.image || item.thumbnail || null,
          category: item.category || 'Space News',
          source: item.sourceLabel || 'Space news provider'
        }));
      setNewsItems(formatted);
    } catch {
      if (request === newsRequest.current) {
        setNewsStatus({ ok: false });
        setNewsItems([]);
      }
    } finally {
      if (request === newsRequest.current) setNewsLoading(false);
    }
  };

  useEffect(() => {
    fetchApod();
    fetchNewsFeed();
    const interval = setInterval(() => {
      fetchNewsFeed();
      fetchApod();
    }, 45000); // 45s throttled polling for 60FPS background efficiency
    return () => { clearInterval(interval); newsRequest.current++; };
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
          const data = await translateSpaceContent(item.title, item.description, currentLang);
          if (data && data.title) {
            setTranslations(prev => ({ ...prev, [key]: { title: data.title, description: data.explanation } }));
          }
        } catch {
          // Keep the original text when translation is unavailable.
        } finally {
          setTranslatingIds(prev => {
            const next = new Set(prev);
            next.delete(item.guid);
            return next;
          });
        }
      }
    };

    translateItems();
  }, [currentLang, newsItems]);

  // APOD remains in its original language here; the dedicated APOD viewer
  // offers translation and reports failures.
  const apodDisplay = apod ? { title: apod.title, explanation: apod.explanation } : null;

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
    <section className="w-full space-y-8 py-4 font-sans text-ink">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/20 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 mb-2">
            <Flame className="w-3.5 h-3.5 text-cyan-400" />
            <span>Space News & NASA APOD</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Newspaper className="w-7 h-7 text-cyan-400" />
            <span>
              {currentLang === 'si' && 'අභ්‍යවකාශ පුවත් සහ NASA APOD'}
              {currentLang === 'ta' && 'விண்வெளி செய்திகள் மற்றும் NASA APOD'}
              {currentLang === 'en' && 'Space News & Cosmic Discoveries'}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-ink-3 mt-1 max-w-2xl">
            {currentLang === 'si' && 'විවිධ මූලාශ්‍රවල අභ්‍යවකාශ පුවත් සහ NASA APOD. පරිවර්තනය නොලැබුණහොත් මුල් පෙළ පෙන්වයි.'}
            {currentLang === 'ta' && 'பல மூலங்களின் விண்வெளிச் செய்திகள் மற்றும் NASA APOD. மொழிபெயர்ப்பு கிடைக்காவிட்டால் அசல் உரை காட்டப்படும்.'}
            {currentLang === 'en' && 'Space news from multiple providers and NASA APOD. Translation may be unavailable; original text is retained.'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchApod(); fetchNewsFeed(true); }}
            className="p-2.5 rounded-[10px] bg-surface/65 border border-line text-ink-2 hover:text-cyan-400 hover:border-cyan-500/50 transition shadow-md flex items-center gap-2 text-xs font-semibold"
            title="Refresh Feed"
          >
            <RotateCw className={`w-4 h-4 ${newsLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {!apodLoading && !apod && <p role="status" className="text-sm text-ink-3">NASA APOD is currently unavailable.</p>}
      {/* Featured NASA APOD Highlight Banner */}
      {apod && (
        <div className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-r from-[#0B0F19] via-[#0e1626] to-[#0B0F19] p-1 shadow-2xl backdrop-blur-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 sm:p-8 items-center">
            {/* APOD Media Preview */}
            <div className="lg:col-span-5 relative rounded-[14px] overflow-hidden aspect-video lg:aspect-square bg-[#05070d] border border-cyan-500/20 shadow-xl group">
              {apod.media_type !== 'video' ? <img
                src={apod.url}
                alt={apod.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              /> : <p className="p-6 text-ink-2">Video APOD: open the media link below.</p>}
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
                <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-signal border border-emerald-500/30">
                  FEATURED DISCOVERY
                </span>
                <span className="text-xs text-ink-3 font-mono">
                  Original text
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-white leading-snug font-display">
                {apodDisplay?.title || apod.title}
              </h3>

              <p className="text-sm text-ink-2 leading-relaxed line-clamp-4 font-sans">
                {apodDisplay?.explanation || apod.explanation}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <a
                  href={apod.hdurl || apod.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-[10px] text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-2 shadow-lg shadow-cyan-600/30"
                >
                  <span>Open APOD media</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {apod.copyright && (
                  <span className="text-xs text-ink-3 italic">
                    © {apod.copyright}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 apple-liquid-glass p-5 rounded-3xl shadow-lg">
        {/* Voice and Keyword Search Input */}
        <div className="flex-1 min-w-[260px] max-w-md">
          <VoiceSearchInput
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            lang={currentLang}
            placeholder={
              currentLang === 'si' ? 'අභ්‍යවකාශ පුවත් හඬින් හෝ ලියා සොයන්න...' :
              currentLang === 'ta' ? 'செய்திகளை குரல் மூலம் தேடுங்கள்...' :
              'Speak or search space news...'
            }
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-[14px] text-xs font-semibold whitespace-nowrap transition border ${
                selectedCategory === cat
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-md shadow-cyan-600/20 font-bold'
                  : 'apple-liquid-glass text-ink-2 hover:text-ink'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* News Cards Grid */}
      {!newsLoading && newsStatus.ok && newsStatus.partial && <p role="status" className="text-sm text-caution">{currentLang === 'si' ? 'සමහර පුවත් මූලාශ්‍ර දැනට නොලැබේ.' : currentLang === 'ta' ? 'சில செய்தி மூலங்கள் தற்போது கிடைக்கவில்லை.' : 'Some news providers are currently unavailable.'}</p>}
      {newsLoading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-ink-3">
          <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
          <p className="text-xs font-mono">Loading space news...</p>
        </div>
      ) : !newsStatus.ok ? (
        <div role="alert" className="py-16 text-center text-ink-3 apple-liquid-glass rounded-3xl">
          <p>{currentLang === 'si' ? 'පුවත් සේවාව දැනට ලබාගත නොහැක.' : currentLang === 'ta' ? 'செய்தி சேவை தற்போது கிடைக்கவில்லை.' : 'The news service is currently unavailable.'}</p>
          <button type="button" onClick={() => fetchNewsFeed(true)} className="mt-3 rounded-lg border border-line px-4 py-2 text-ink">{currentLang === 'si' ? 'නැවත උත්සාහ කරන්න' : currentLang === 'ta' ? 'மீண்டும் முயற்சிக்கவும்' : 'Retry'}</button>
        </div>
      ) : filteredNews.length === 0 ? (
        <div className="py-16 text-center text-ink-3 apple-liquid-glass rounded-3xl">
          <Info className="w-8 h-8 text-cyan-400 mx-auto mb-2 opacity-60" />
          <p className="text-sm">{newsItems.length === 0
            ? (currentLang === 'si' ? 'දැනට පුවත් හමු නොවීය.' : currentLang === 'ta' ? 'தற்போது செய்திகள் இல்லை.' : 'No news returned by the available providers.')
            : (currentLang === 'si' ? 'සෙවුමට ගැළපෙන පුවත් නැත.' : currentLang === 'ta' ? 'தேடலுக்குப் பொருந்தும் செய்திகள் இல்லை.' : 'No news matches your search.')}</p>
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
                className="group flex flex-col justify-between rounded-3xl overflow-hidden apple-liquid-glass transition-all duration-300 shadow-xl hover:-translate-y-1.5"
              >
                {/* Article Image Banner */}
                <div className="relative aspect-video w-full overflow-hidden bg-transparent">
                  {article.thumbnail && <img
                    src={article.thumbnail}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />}
                  
                  {/* Category Badge */}
                  <div className="absolute top-3 left-3">
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase apple-liquid-glass text-cyan-300 border-cyan-500/30">
                      {article.category}
                    </span>
                  </div>

                  {/* Bookmark Button */}
                  <button
                    onClick={() => toggleBookmark(article.guid)}
                    className="absolute top-3 right-3 p-2 rounded-[10px] apple-liquid-glass text-ink-2 hover:text-ink transition"
                    title="Bookmark Article"
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-cyan-400 text-cyan-400' : ''}`} />
                  </button>
                </div>

                {/* Article Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    {/* Date & Translation Indicator */}
                    <div className="flex items-center justify-between text-[11px] text-ink-3 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-cyan-400" />
                        <span>{article.pubDate ? new Date(article.pubDate).toLocaleDateString() : 'Date unavailable'}</span>
                      </div>

                      <span>{article.source}</span>
                      {isTranslating ? (
                        <span className="flex items-center gap-1 text-caution text-[10px]">
                          <Sparkles className="w-3 h-3 animate-spin" />
                          Translating...
                        </span>
                      ) : translated ? (
                        <span className="flex items-center gap-1 text-signal text-[10px]">
                          <Sparkles className="w-3 h-3" />
                          {currentLang === 'si' ? 'සිංහල' : 'தமிழ்'}
                        </span>
                      ) : currentLang !== 'en' ? (
                        <span className="text-[10px]">Original text</span>
                      ) : null}
                    </div>

                    {/* Headline */}
                    <h4 className="text-base font-bold text-white group-hover:text-cyan-200 transition-colors leading-snug line-clamp-2">
                      {displayTitle}
                    </h4>

                    {/* Excerpt */}
                    <p className="text-xs text-ink-2 leading-relaxed line-clamp-3">
                      {displayDesc}
                    </p>
                  </div>

                  {/* Footer Action Links */}
                  <div className="pt-3 border-t border-line flex items-center justify-between">
                    <button
                      onClick={() => copyArticleLink(article.guid, article.link)}
                      className="text-xs text-ink-3 hover:text-ink-2 transition flex items-center gap-1"
                      title="Copy Link"
                    >
                      {copiedId === article.guid ? (
                        <Check className="w-3.5 h-3.5 text-signal" />
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

export default memo(NasaNewsFeed);
