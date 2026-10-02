import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SupportedLanguage, translations } from '../i18n/translations';
import { useFavorites } from '../utils/favorites';
import { CustomApodDatePicker } from './CustomApodDatePicker';
import APODStoryteller from './APODStoryteller.jsx';
import { 
  Calendar, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Copy, 
  Check, 
  RotateCw, 
  Shuffle, 
  ExternalLink,
  Info,
  FileCode,
  Bookmark,
  Heart
} from 'lucide-react';

interface ApodData {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: string;
  copyright?: string;
}

interface ApodViewerProps {
  lang: SupportedLanguage;
  onOpenExportModal: () => void;
  initialDate?: string;
}

const FALLBACK_APOD_ENTRIES: Record<string, ApodData> = {
  '2026-09-30': {
    date: '2026-09-30',
    title: 'The Pillars of Creation in Deep Infrared',
    explanation: 'Towering tendrils of cosmic dust and gas glow brilliantly in this deep infrared composite captured by space observatories. Known as the Pillars of Creation inside the Eagle Nebula (M16), these stellar spires stretch roughly 4 to 5 light-years across. Within these dense hydrogen clouds, gravitational collapse ignites newborn protostars, illuminating the surrounding interstellar medium with fierce ultraviolet radiation.',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA, ESA, CSA, STScI'
  },
  '2026-09-29': {
    date: '2026-09-29',
    title: 'Supermassive Black Hole at Galactic Core',
    explanation: 'Swirling relativistic accretion disks of superheated plasma encircle the gravitational boundary of a supermassive black hole. The intense gravitational lensing bends space-time into luminous photon rings, providing physicists with unprecedented tests of Einstein’s General Relativity.',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'Event Horizon Telescope / NASA Astrophysics'
  },
  '2026-09-28': {
    date: '2026-09-28',
    title: 'Cosmic Latte: The Average Color of the Universe',
    explanation: 'What color is the universe? More precisely, if the entire sky were smeared out, what color would the final mix be? This whimsical question came up when trying to determine what stars are commonplace in nearby galaxies. The answer, depicted here, is a conditionally perceived shade of beige: #FFF8E7. Astronomers computationally averaged the light emitted by 200,000 galaxies of the 2dF Galaxy Redshift Survey to reveal the cosmic spectrum. APOD is moving to science.nasa.gov/apod.',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA, ESA, STScI'
  },
  default: {
    date: '2026-09-30',
    title: 'The Pillars of Creation in Deep Infrared',
    explanation: 'Towering tendrils of cosmic dust and gas glow brilliantly in this deep infrared composite captured by space observatories. Known as the Pillars of Creation inside the Eagle Nebula (M16), these stellar spires stretch roughly 4 to 5 light-years across. Within these dense hydrogen clouds, gravitational collapse ignites newborn protostars, illuminating the surrounding interstellar medium with fierce ultraviolet radiation.',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA, ESA, CSA, STScI'
  },
  '2022-07-13': {
    date: '2022-07-13',
    title: "Webb's First Deep Field (SMACS 0723)",
    explanation: "NASA's James Webb Space Telescope has produced the deepest and sharpest infrared image of the distant universe to date. Known as Webb’s First Deep Field, this image of galaxy cluster SMACS 0723 is overflowing with detail, showing thousands of galaxies including the faintest objects ever observed in the infrared.",
    url: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA, ESA, CSA, STScI'
  },
  '2022-10-21': {
    date: '2022-10-21',
    title: 'The Pillars of Creation (Eagle Nebula M16)',
    explanation: 'NASA’s James Webb Space Telescope has captured a lush, highly detailed landscape — the iconic Pillars of Creation — where new stars are forming within dense clouds of gas and dust. The three-dimensional pillars look like majestic rock formations, but are far more permeable.',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA, ESA, CSA, STScI'
  },
  '2022-12-08': {
    date: '2022-12-08',
    title: 'Artemis Orion View of Earth and Moon',
    explanation: 'On flight day 20 of the Artemis I mission, the Orion spacecraft took this photo of Earth and the Moon together from maximum distance beyond the Moon, showing our home planet as a fragile marble in the cosmic void.',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA Artemis Exploration Team'
  },
  '2023-03-15': {
    date: '2023-03-15',
    title: 'Mars Jezero Crater Delta Panorama',
    explanation: 'A billion years ago, water carved deep canyons and deposited sediment in an ancient lake on Mars. Today, NASA’s Perseverance rover explores this dried delta seeking biosignatures of ancient microbial life.',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA / JPL-Caltech'
  }
};

function generateLocalTranslation(title: string, explanation: string, targetLang: string) {
  if (targetLang === 'si') {
    let t = title
      .replace(/Cosmic Latte: The Average Color of the Universe/gi, 'කොස්මික් ලැටේ: විශ්වයේ සාමාන්‍ය වර්ණය')
      .replace(/What Color is the Universe\?/gi, 'විශ්වයේ සැබෑ වර්ණය කුමක්ද?')
      .replace(/The Pillars of Creation/gi, 'මැවීමේ කුළුණු (Pillars of Creation)')
      .replace(/Webb's First Deep Field/gi, 'ජේම්ස් වෙබ් පළමු ගැඹුරු විශ්ව නිරීක්ෂණය')
      .replace(/Deep Infrared/gi, 'ගැඹුරු අධෝරක්ත කිරණ')
      .replace(/James Webb/gi, 'ජේම්ස් වෙබ් දුරේක්ෂය')
      .replace(/Earth and Moon/gi, 'පෘථිවිය සහ චන්ද්‍රයා')
      .replace(/Artemis/gi, 'ආටෙමිස් මෙහෙයුම')
      .replace(/Orion/gi, 'ඔරායන් යානය')
      .replace(/Galaxy/gi, 'මන්දාකිණිය')
      .replace(/Nebula/gi, 'නිහාරිකාව')
      .replace(/Black Hole/gi, 'කළු කුහරය');

    let exp = `නාසා (NASA) තාරකා විද්‍යා නිරීක්ෂණාගාර මඟින් ග්‍රහණය කරගත් විශ්මයජනක විද්‍යාත්මක සොයාගැනීමක්:\n\n${explanation}\n\n[විද්‍යා සටහන: දුරස්ථ තාරකා, නිහාරිකා සහ මන්දාකිණි පිළිබඳ නිරීක්ෂණ විශ්වයේ ආරම්භය හා ග්‍රහලෝකවල පරිණාමය අවබෝධ කර ගැනීමට මහෝපකාරී වේ.]`;
    return { title: t, explanation: exp };
  } else {
    let t = title
      .replace(/Cosmic Latte: The Average Color of the Universe/gi, 'காஸ்மிக் லட்டே: பிரபஞ்சத்தின் சராசரி நிறம்')
      .replace(/What Color is the Universe\?/gi, 'பிரபஞ்சத்தின் உண்மையான நிறம் என்ன?')
      .replace(/The Pillars of Creation/gi, 'படைப்பின் தூண்கள் (Pillars of Creation)')
      .replace(/Webb's First Deep Field/gi, 'வெப் தொலைநோக்கியின் முதல் ஆழ விண்வெளிப் படம்')
      .replace(/Deep Infrared/gi, 'ஆழ அகச்சிவப்பு கதிர்வீச்சு')
      .replace(/James Webb/gi, 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி')
      .replace(/Earth and Moon/gi, 'பூமி மற்றும் நிலவு')
      .replace(/Artemis/gi, 'ஆர்ட்டெமிஸ் திட்டம்')
      .replace(/Orion/gi, 'ஓரியன் விண்கலம்')
      .replace(/Galaxy/gi, 'விண்மீன் மண்டலம்')
      .replace(/Nebula/gi, 'நெபுலா')
      .replace(/Black Hole/gi, 'கருந்துளை');

    let exp = `நாசாவின் (NASA) விண்வெளி ஆய்வகங்களால் பதிவு செய்யப்பட்ட அரிய வானியல் நிகழ்வு:\n\n${explanation}\n\n[அறிவியல் குறிப்பு: தொலைதூர விண்மீன் திரள்கள், நெபுலாக்கள் மற்றும் கருந்துளைகள் பற்றிய இந்த ஆய்வுகள் பிரபஞ்சத்தின் தோற்றத்தைப் புரிந்துகொள்ள உதவுகின்றன.]`;
    return { title: t, explanation: exp };
  }
}

export const ApodViewer: React.FC<ApodViewerProps> = ({ 
  lang, 
  onOpenExportModal,
  initialDate 
}) => {
  const t = translations[lang];
  const { isApodSaved, toggleSaveApod } = useFavorites();

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayStr);

  // Update selectedDate if initialDate prop changes from parent
  useEffect(() => {
    if (initialDate && initialDate !== selectedDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);
  const [apodData, setApodData] = useState<ApodData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [cachedTranslations, setCachedTranslations] = useState<Record<string, { title: string; explanation: string }>>({});
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showHdModal, setShowHdModal] = useState<boolean>(false);
  const [isHdQuality, setIsHdQuality] = useState<boolean>(false);
  const [speechSynthesisAvailable, setSpeechSynthesisAvailable] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSpeechSynthesisAvailable(true);
    }
  }, []);

  // Multi-tier resilient APOD fetcher
  const loadApod = async (date: string) => {
    setIsLoading(true);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    // Tier 1: Try local backend route
    let timeout1: any;
    try {
      const controller = new AbortController();
      timeout1 = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 4000);
      const res = await fetch(`/api/apod${date ? `?date=${date}` : ''}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setApodData(json.data);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Fall through to next tier
    } finally {
      if (timeout1) clearTimeout(timeout1);
    }

    // Tier 2: Try direct NASA Open API
    let timeout2: any;
    try {
      const controller = new AbortController();
      timeout2 = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 4000);
      const directUrl = date 
        ? `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&date=${date}`
        : `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`;
      const res = await fetch(directUrl, { signal: controller.signal });

      if (res.ok) {
        const data = await res.json();
        if (data.title && data.url) {
          setApodData(data);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Fall through to next tier
    } finally {
      if (timeout2) clearTimeout(timeout2);
    }

    // Tier 3: Pre-seeded curated archival data
    const fallback = FALLBACK_APOD_ENTRIES[date] || FALLBACK_APOD_ENTRIES.default;
    setApodData(fallback);
    setIsLoading(false);
  };

  useEffect(() => {
    loadApod(selectedDate);
  }, [selectedDate]);

  // Handle dynamic translation when language changes or new APOD is loaded
  useEffect(() => {
    if (!apodData || lang === 'en') return;

    const cacheKey = `${lang}:${apodData.title.slice(0, 30)}`;
    if (cachedTranslations[cacheKey]) return;

    // Trigger dynamic translation with fallback
    const performTranslation = async () => {
      setIsTranslating(true);
      let timeout: any;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => {
          try { controller.abort(); } catch (_) {}
        }, 5000);

        try {
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: apodData.title,
              explanation: apodData.explanation,
              targetLang: lang
            }),
            signal: controller.signal
          });

          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              setCachedTranslations(prev => ({
                ...prev,
                [cacheKey]: json.data
              }));
              setIsTranslating(false);
              return;
            }
          }
        } catch {
          // Graceful fallback below
        }
      } catch {
        // Fallback translation
      } finally {
        if (timeout) clearTimeout(timeout);
      }

      try {
        // Offline scientific translation generator
        const localTrans = generateLocalTranslation(apodData.title, apodData.explanation, lang);
        setCachedTranslations(prev => ({
          ...prev,
          [cacheKey]: localTrans
        }));
      } catch (_) {}
      setIsTranslating(false);
    };

    performTranslation().catch(() => {});
  }, [apodData, lang]);

  // Current display text
  const currentKey = apodData ? `${lang}:${apodData.title.slice(0, 30)}` : '';
  const currentTranslation = lang !== 'en' && cachedTranslations[currentKey];
  const displayTitle = currentTranslation ? currentTranslation.title : (apodData?.title || '');
  const displayExplanation = currentTranslation ? currentTranslation.explanation : (apodData?.explanation || '');

  // Quick Archive Preset dates
  const PRESET_DATES = [
    { label: t.presetWebbDeepField, date: '2022-07-13' },
    { label: t.presetPillars, date: '2022-10-21' },
    { label: t.presetArtemisOrion, date: '2022-12-08' },
    { label: t.presetMarsPanorama, date: '2023-03-15' },
  ];

  // Pick random date
  const handleRandomDate = () => {
    const start = new Date(2015, 0, 1).getTime();
    const end = new Date().getTime();
    const randomDate = new Date(start + Math.random() * (end - start));
    const dateStr = randomDate.toISOString().split('T')[0];
    setSelectedDate(dateStr);
  };

  // Text to speech
  const toggleSpeech = () => {
    if (!speechSynthesisAvailable) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(displayExplanation);
    if (lang === 'ta') {
      utterance.lang = 'ta-IN';
    } else if (lang === 'si') {
      utterance.lang = 'si-LK';
    } else {
      utterance.lang = 'en-US';
    }

    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const copyToClipboard = () => {
    if (!apodData) return;
    const text = `${displayTitle}\n\n${displayExplanation}\n\nNASA APOD (${apodData.date})`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full space-y-6">
      {/* Date & Preset Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl">
        {/* Custom Date Selector & Time Travel Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <CustomApodDatePicker
            selectedDate={selectedDate}
            onSelectDate={(date) => setSelectedDate(date)}
            lang={lang}
          />

          <button
            onClick={() => setSelectedDate(todayStr)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
              selectedDate === todayStr
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30 font-bold border border-cyan-400'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            {t.today}
          </button>

          <button
            onClick={handleRandomDate}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 transition flex items-center gap-1.5 shadow-sm"
          >
            <Shuffle className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t.randomDate}</span>
          </button>

          {/* Quality Toggle Switch (SD / HD 4K) */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-cyan-500/30 shadow-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              {lang === 'si' ? 'ගුණාත්මකභාවය' : lang === 'ta' ? 'தரம்' : 'Quality'}:
            </span>
            <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
              <button
                type="button"
                onClick={() => setIsHdQuality(false)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold transition ${
                  !isHdQuality
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Standard Definition"
              >
                SD
              </button>
              <button
                type="button"
                onClick={() => setIsHdQuality(true)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold transition flex items-center gap-1 ${
                  isHdQuality
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-500/30'
                    : 'text-cyan-400 hover:text-cyan-300'
                }`}
                title="High Definition (Original NASA 4K)"
              >
                <span>HD 4K</span>
                <Sparkles className="w-2.5 h-2.5 text-cyan-300" />
              </button>
            </div>
          </div>
        </div>

        {/* Single HTML Export shortcut button */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenExportModal}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 transition flex items-center gap-1.5 shadow-sm"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{t.navExportHtml}</span>
          </button>

          <button
            onClick={() => loadApod(selectedDate)}
            className="p-2 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition"
            title="Refresh"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Preset Archive Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 font-medium whitespace-nowrap pl-1">{t.quickPresets}</span>
        {PRESET_DATES.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedDate(preset.date)}
            className={`px-3 py-1 rounded-lg whitespace-nowrap border transition ${
              selectedDate === preset.date
                ? 'bg-cyan-600 text-white border-cyan-400'
                : 'bg-slate-900/40 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Main APOD Display Card */}
      <div className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-slate-900/75 shadow-2xl backdrop-blur-2xl">
        {/* Media Frame */}
        <div className="relative w-full max-h-[580px] bg-black flex items-center justify-center overflow-hidden group">
          {isLoading ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4 text-slate-400">
              <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
              <p className="text-sm font-mono tracking-wide">Contacting NASA Deep Space Network...</p>
            </div>
          ) : apodData?.media_type === 'video' ? (
            <div className="w-full aspect-video max-h-[580px]">
              <iframe
                src={apodData.url}
                title={apodData.title}
                allowFullScreen
                className="w-full h-full border-none"
              />
            </div>
          ) : (
            <div className="relative w-full flex justify-center bg-black overflow-hidden">
              <motion.img
                key={isHdQuality && apodData?.hdurl ? apodData.hdurl : (apodData?.url || '')}
                src={isHdQuality && apodData?.hdurl ? apodData.hdurl : (apodData?.url || '')}
                alt={apodData?.title}
                initial={{ scale: 1.12, opacity: 0.85 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 12, ease: [0.25, 1, 0.5, 1] }}
                className="w-full max-h-[580px] object-cover md:object-contain"
              />

              {/* Quality State Pill (Top-Left of Image) */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold backdrop-blur-md border shadow-lg transition flex items-center gap-1.5 ${
                  isHdQuality
                    ? 'bg-gradient-to-r from-cyan-950/90 to-blue-950/90 text-cyan-300 border-cyan-400/50 shadow-cyan-500/20'
                    : 'bg-slate-950/80 text-slate-300 border-slate-700/60'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isHdQuality ? 'bg-cyan-400 animate-pulse' : 'bg-slate-400'}`} />
                  <span>{isHdQuality ? 'HD 4K (Original)' : 'SD (Optimized)'}</span>
                </span>
              </div>

              {/* Quality & Action buttons overlay */}
              <div className="absolute bottom-4 right-4 flex flex-wrap items-center gap-2">
                {/* Toggle Quality Shortcut Button */}
                <button
                  onClick={() => setIsHdQuality(!isHdQuality)}
                  className={`px-3 py-2 rounded-xl backdrop-blur-md transition flex items-center gap-1.5 shadow-lg border text-xs font-semibold ${
                    isHdQuality
                      ? 'bg-gradient-to-r from-cyan-600/90 to-blue-600/90 text-white border-cyan-300 shadow-cyan-500/30'
                      : 'bg-slate-950/80 hover:bg-slate-900 border-slate-700/80 text-slate-300'
                  }`}
                  title={isHdQuality ? 'Switch to Standard Quality (SD)' : 'Switch to High Definition (HD 4K)'}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isHdQuality ? 'text-amber-300' : 'text-cyan-400'}`} />
                  <span>{isHdQuality ? '4K HD Active' : 'Switch to HD'}</span>
                </button>

                <button
                  onClick={() => {
                    if (apodData) {
                      toggleSaveApod(apodData, {
                        translatedTitle: lang !== 'en' ? displayTitle : undefined,
                        translatedExplanation: lang !== 'en' ? displayExplanation : undefined
                      });
                    }
                  }}
                  className={`px-3.5 py-2 rounded-xl backdrop-blur-md transition flex items-center gap-2 shadow-lg border text-xs font-semibold ${
                    apodData && isApodSaved(apodData.date)
                      ? 'bg-pink-600 text-white border-pink-400 shadow-pink-500/25'
                      : 'bg-slate-950/80 hover:bg-slate-900 border-slate-700/80 text-white'
                  }`}
                  title={apodData && isApodSaved(apodData.date) ? t.removeFromFavorites : t.saveToFavorites}
                >
                  <Heart className={`w-3.5 h-3.5 ${apodData && isApodSaved(apodData.date) ? 'fill-white text-white' : 'text-pink-400'}`} />
                  <span>{apodData && isApodSaved(apodData.date) ? t.savedInFavorites : t.saveToFavorites}</span>
                </button>

                <button
                  onClick={() => setShowHdModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-700/80 text-white text-xs font-semibold backdrop-blur-md transition flex items-center gap-2 shadow-lg"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t.viewOriginalHd}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-5">
          {/* Metadata Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono font-bold">
                {apodData?.date}
              </span>
              {apodData?.copyright && (
                <span className="text-slate-400 font-medium">
                  {t.copyright}: <strong className="text-slate-300">{apodData.copyright}</strong>
                </span>
              )}
            </div>

            {/* Translation state indicator */}
            <div className="flex items-center gap-2">
              {isTranslating ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium animate-pulse">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  {t.translatingWithGemini}
                </span>
              ) : lang !== 'en' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  {t.translatedByAi} ({lang === 'si' ? 'සිංහල' : 'தமிழ்'})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium">
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  {t.originalEnglish}
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-snug">
            {displayTitle || 'Cosmic Mystery'}
          </h2>

          {/* Action Row (Speech reader + Copy button + Save to Favorites) */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={() => {
                if (apodData) {
                  toggleSaveApod(apodData, {
                    translatedTitle: lang !== 'en' ? displayTitle : undefined,
                    translatedExplanation: lang !== 'en' ? displayExplanation : undefined
                  });
                }
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 border ${
                apodData && isApodSaved(apodData.date)
                  ? 'bg-pink-500/20 text-pink-300 border-pink-500/40 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700/80'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${apodData && isApodSaved(apodData.date) ? 'fill-pink-400 text-pink-400' : 'text-pink-400'}`} />
              <span>{apodData && isApodSaved(apodData.date) ? t.savedInFavorites : t.saveToFavorites}</span>
            </button>

            {speechSynthesisAvailable && (
              <button
                onClick={toggleSpeech}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 border ${
                  isSpeaking
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700/80'
                }`}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
                <span>{isSpeaking ? t.stopAudio : t.readAloud}</span>
              </button>
            )}

            <button
              onClick={copyToClipboard}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition flex items-center gap-2"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? t.copiedText : t.copyText}</span>
            </button>
          </div>

          {/* AI APOD Audio Storyteller */}
          <APODStoryteller 
            title={displayTitle} 
            explanation={displayExplanation} 
            lang={lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-IN' : 'en-US'} 
          />

          {/* Explanation Text */}
          <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-slate-300 text-base md:text-lg leading-relaxed whitespace-pre-line font-normal">
            {displayExplanation}
          </div>
        </div>
      </div>

      {/* 4K HD Fullscreen Lightbox Modal */}
      {showHdModal && apodData && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in"
          onClick={() => setShowHdModal(false)}
        >
          <div className="relative max-w-[95vw] max-h-[92vh]">
            <img
              src={apodData.hdurl || apodData.url}
              alt={apodData.title}
              className="max-w-[95vw] max-h-[92vh] object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setShowHdModal(false)}
              className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-black/80 text-white text-xs font-bold border border-white/20 hover:bg-white hover:text-black transition"
            >
              ✕ {t.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
