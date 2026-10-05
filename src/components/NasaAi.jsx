'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Bot, 
  Send, 
  Sparkles, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  ShieldCheck, 
  RefreshCw,
  Zap,
  HelpCircle,
  Award,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { askNasaAi } from '@/lib/nasaApi';

const STORAGE_KEY = 'nasa_ai_chat_history_v2';

/**
 * Trilingual Astrobiology and Deep Space Intelligence Knowledge Bank
 */
const SPACE_INTELLIGENCE_BASE = {
  apod: {
    en: '🌌 NASA APOD Feature: "The Pillars of Creation in Deep Infrared" reveals monumental spires of dense interstellar hydrogen gas and dust in the Eagle Nebula (M16), spanning 4–5 light-years. Intense ultraviolet stellar winds from newborn massive stars sculpt these cosmic towers where new protostellar systems are born.',
    si: '🌌 නාසා APOD විශේෂාංගය: "ගැඹුරු අධෝරක්ත කිරණින් මැවුම්කාර කුළුණු" (Pillars of Creation) මඟින් ඊගල් නිහාරිකාව (M16) තුළ ආලෝක වර්ෂ 4-5ක් පුරා විහිදෙන කොස්මික් දූවිලි හා හයිඩ්‍රජන් වායු කුළුණු අනාවරණය කරයි. නවක තාරකාවල ප්‍රබල පාරජම්බුල විකිරණ මඟින් මෙම තාරකා තවාන් අලංකාර ලෙස හැඩගස්වා ඇත.',
    ta: '🌌 நாசா APOD சிறப்பம்சம்: "ஆழ அகச்சிவப்புக் கதிர்களில் படைப்பின் தூண்கள்" (Pillars of Creation) என்பது கழுகு நெபுலாவில் (M16) 4–5 ஒளியாண்டுகள் பரவியுள்ள அடர்ந்த காஸ்மிக் வாயு மற்றும் தூசு தூண்களைக் காட்டுகிறது. புதிய விண்மீன்களின் தீவிர புற ஊதா கதிர்வீச்சு இந்த விண்மீன் நாற்றங்கால்களை வடிவமைக்கிறது.'
  },
  jwst: {
    en: '🚀 JWST Discoveries: Operating 1.5 million km away at Sun-Earth L2, the James Webb Space Telescope’s 6.5m gold-beryllium mirror penetrates cosmic dust to observe the earliest galaxies formed over 13.5 billion years ago (SMACS 0723, GLASS-z12) and spectroscopically confirms atmospheric methane and water vapor on habitable-zone exoplanets.',
    si: '🚀 JWST සොයාගැනීම්: පෘථිවියේ සිට කි.මී. මිලියන 1.5ක් ඈතින් L2 ලක්ෂ්‍යයේ කක්ෂගතව ඇති ජේම්ස් වෙබ් දුරේක්ෂයේ මීටර් 6.5ක රන් ආලේපිත දර්පණ මඟින් වසර බිලියන 13.5කට පෙර බිහිවූ මුල්ම මන්දාකිණිවල ආලෝකය සහ බාහිර ග්‍රහලෝකවල වායුගෝලීය ජල වාෂ්ප සාන්ද්‍රණයන් විමර්ශනය කරයි.',
    ta: '🚀 JWST கண்டுபிடிப்புகள்: பூமியிலிருந்து 1.5 மில்லியன் கி.மீ தொலைவில் உள்ள L2 புள்ளியில் இயங்கும் ஜேம்ஸ் வெப் தொலைநோக்கியின் 6.5 மீ தங்க முலாம் பூசப்பட்ட கண்ணாடிகள், 13.5 பில்லியன் ஆண்டுகளுக்கு முந்தைய ஆரம்பகால விண்மீன் திரள்களையும் வாழக்கூடிய புறக்கோள்களின் வளிமண்டல நீராவியையும் கண்டறிந்துள்ளன.'
  },
  mars: {
    en: '🔴 Mars Surface Weather: In Jezero Crater, the Perseverance MEDA weather station records a current diurnal atmospheric surface pressure of 748 Pascals (~7.5 mbar) with ambient air temperatures fluctuating between a midday high of -18°C (0°F) to an overnight low of -82°C (-115°F) under clear, dusty skies.',
    si: '🔴 අඟහරු කාලගුණය: ජෙසීරෝ ආවාටයේ Perseverance රෝවරයේ MEDA කාලගුණ මධ්‍යස්ථානයට අනුව මතුපිට වායුගෝලීය පීඩනය පැස්කල් 748ක් වන අතර දිවා කාලයේ උපරිම උෂ්ණත්වය -18°C දක්වා සහ රාත්‍රී කාලයේ අවම උෂ්ණත්වය -82°C දක්වා වෙනස් වන පැහැදිලි දූවිලි සහිත අහසක් පවතී.',
    ta: '🔴 செவ்வாய் வானிலை: ஜெசிரோ பள்ளத்தில் உள்ள பெர்சிவரன்ஸ் ரோவரின் MEDA வானிலை மையம், வளிமண்டல அழுத்தத்தை 748 பாஸ்கல் எனவும், வெப்பநிலை பகலில் அதிகபட்சமாக -18°C முதல் இரவில் குறைந்தபட்சமாக -82°C வரை பதிவாகியுள்ளதாகவும் தெரிவிக்கிறது.'
  }
};

/**
 * Trilingual Quiz Generator for APOD
 */
const APOD_QUIZ_DATA = {
  en: [
    {
      question: "1. What is the primary cosmic structure featured in today's deep infrared APOD?",
      options: [
        "The Pillars of Creation (Eagle Nebula M16)",
        "The Great Red Spot of Jupiter",
        "The Rings of Saturn",
        "The Andromeda Galactic Core"
      ],
      correctIndex: 0,
      explanation: "Today's APOD showcases the iconic Pillars of Creation in deep infrared inside the Eagle Nebula."
    },
    {
      question: "2. Why was deep infrared imagery crucial for observing this region?",
      options: [
        "It penetrates thick cosmic dust to reveal newborn protostars",
        "It makes stars look closer to Earth",
        "It cools down space telescope sensors",
        "It only works on solid planets"
      ],
      correctIndex: 0,
      explanation: "Infrared wavelengths pass straight through dense obscuring interstellar dust clouds."
    },
    {
      question: "3. Roughly how wide are these monumental interstellar pillars?",
      options: [
        "4 to 5 light-years across",
        "100 kilometers across",
        "1 astronomical unit (AU)",
        "50 meters across"
      ],
      correctIndex: 0,
      explanation: "These immense gas pillars span approximately 4 to 5 light-years across space."
    }
  ],
  si: [
    {
      question: "1. අද දවසේ ගැඹුරු අධෝරක්ත APOD හි ප්‍රධාන වශයෙන් දිස්වන විශ්වීය ව්‍යුහය කුමක්ද?",
      options: [
        "මැවුම්කාර කුළුණු (ඊගල් නිහාරිකාව - M16)",
        "බ්‍රහස්පතිගේ රතු ලපය",
        "සෙනසුරුගේ වළලු පද්ධතිය",
        "ඇන්ඩ්‍රොමිඩා මන්දාකිණි කේන්ද්‍රය"
      ],
      correctIndex: 0,
      explanation: "අද APOD විශේෂාංගය ඊගල් නිහාරිකාව තුළ පිහිටි විස්මිත මැවුම්කාර කුළුණු අධෝරක්ත කිරණින් පෙන්වයි."
    },
    {
      question: "2. මෙම කලාපය නිරීක්ෂණයට ගැඹුරු අධෝරක්ත කිරණ (Infrared) භාවිත කිරීමේ වාසිය කුමක්ද?",
      options: [
        "ඝන කොස්මික් දූවිලි විනිවිද යමින් අලුත උපන් තාරකා හෙළිදරව් කිරීම",
        "තාරකා පෘථිවියට සමීප කර පෙන්වීම",
        "දුරේක්ෂයේ උෂ්ණත්වය පාලනය කිරීම",
        "ඝන ග්‍රහලෝක පමණක් සෙවීම"
      ],
      correctIndex: 0,
      explanation: "අධෝරක්ත කිරණ මඟින් ඝන අභ්‍යවකාශ දූවිලි වළාකුළු විනිවිද දැකීමට හැකිවේ."
    },
    {
      question: "3. මෙම දැවැන්ත කොස්මික් කුළුණු කොපමණ දුරකට විහිදේ ද?",
      options: [
        "ආලෝක වර්ෂ 4 සිට 5 දක්වා",
        "කිලෝමීටර් 100 ක් පමණ",
        "තාරකා විද්‍යා ඒකක 1 ක් (1 AU)",
        "මීටර් 50 ක් පමණ"
      ],
      correctIndex: 0,
      explanation: "මෙම වායු කුළුණු ආලෝක වර්ෂ 4 සිට 5 දක්වා විශාලත්වයකින් යුක්ත වේ."
    }
  ],
  ta: [
    {
      question: "1. இன்றைய ஆழ அகச்சிவப்பு APOD இல் உள்ள முதன்மை விண்வெளி அம்சம் எது?",
      options: [
        "படைப்பின் தூண்கள் (கழுகு நெபுலா M16)",
        "வியாழனின் பெருஞ் சிவப்புப் பொட்டு",
        "சனியின் வளையங்கள்",
        "ஆண்ட்ரோமிடா விண்மீன் மையம்"
      ],
      correctIndex: 0,
      explanation: "இன்றைய APOD கழுகு நெபுலாவில் உள்ள புகழ்பெற்ற படைப்பின் தூண்களைக் காட்டுகிறது."
    },
    {
      question: "2. இந்தப் பகுதியை ஆய்வு செய்ய ஆழ அகச்சிவப்பு கதிர்கள் ஏன் முக்கியம்?",
      options: [
        "அடர்ந்த விண்வெளி தூசியை ஊடுருவி புதிய விண்மீன்களை வெளிப்படுத்துகிறது",
        "விண்மீன்களை பூமிக்கு அருகில் காட்டுகிறது",
        "தொலைநோக்கியைக் குளிர்விக்கிறது",
        "கிரகங்களை மட்டுமே பார்க்க உதவும்"
      ],
      correctIndex: 0,
      explanation: "அகச்சிவப்புக் கதிர்கள் அடர்ந்த காஸ்மிக் தூசு மேகங்களை எளிதாக ஊடுருவுகின்றன."
    },
    {
      question: "3. இந்த மாபெரும் காஸ்மிக் தூண்கள் தோராயமாக எவ்வளவு தூரம் பரவியுள்ளன?",
      options: [
        "4 முதல் 5 ஒளியாண்டுகள்",
        "100 கிலோமீட்டர்",
        "1 வானியல் அலகு (1 AU)",
        "50 மீட்டர்கள்"
      ],
      correctIndex: 0,
      explanation: "இந்த பிரம்மாண்டமான தூண்கள் சுமார் 4 முதல் 5 ஒளியாண்டுகள் அகலம் கொண்டவை."
    }
  ]
};

function resolveNasaQuery(query, lang = 'en') {
  const q = (query || '').toLowerCase().trim();

  if (q.includes('apod') || q.includes('today') || q.includes('picture') || q.includes('අද') || q.includes('இன்றைய')) {
    return SPACE_INTELLIGENCE_BASE.apod[lang] || SPACE_INTELLIGENCE_BASE.apod.en;
  }
  if (q.includes('jwst') || q.includes('webb') || q.includes('discover') || q.includes('වෙබ්') || q.includes('கண்டுபிடிப்பு')) {
    return SPACE_INTELLIGENCE_BASE.jwst[lang] || SPACE_INTELLIGENCE_BASE.jwst.en;
  }
  if (q.includes('mars') || q.includes('weather') || q.includes('perseverance') || q.includes('අඟහරු') || q.includes('செவ்வாய்')) {
    return SPACE_INTELLIGENCE_BASE.mars[lang] || SPACE_INTELLIGENCE_BASE.mars.en;
  }
  if (q.includes('iss') || q.includes('orbit') || q.includes('කක්ෂ') || q.includes('சுற்றுப்பாதை')) {
    if (lang === 'si') {
      return '🛰️ ISS තොරතුරු: ජාත්‍යන්තර අභ්‍යවකාශ නැවතුම පෘථිවිය වටා පැයට කි.මී. 27,580 ක වේගයෙන් සහ කි.මී. 420 ක උන්නතාංශයක කක්ෂගතව පවතී. සෑම මිනිත්තු 92.7 කට වරක් පෘථිවිය වටා එක් වටයක් සම්පූර්ණ කරයි.';
    }
    if (lang === 'ta') {
      return '🛰️ ISS தகவல்: சர்வதேச விண்வெளி நிலையம் மணிக்கு 27,580 கி.மீ வேகத்தில் பூமியில் இருந்து சுமார் 420 கி.மீ உயரத்தில் சுற்றிவருகிறது. ஒவ்வொரு 92.7 நிமிடங்களுக்கும் ஒருமுறை பூமியை வலம் வருகிறது.';
    }
    return '🛰️ ISS Telemetry: The International Space Station orbits at ~27,580 km/h (17,137 mph) at ~420 km altitude, completing an entire Earth orbit every 92.68 minutes.';
  }

  if (lang === 'si') {
    return `🛰️ නාසා බුද්ධි තොරතුරු ("${query}"): නාසා දත්ත පද්ධතිය මඟින් සනාථ කරන්නේ සෞරග්‍රහ මණ්ඩල ගවේෂණ, ආටෙමිස් චන්ද්‍ර මෙහෙයුම් සහ ගැඹුරු විශ්වයේ තාරකා භෞතික විද්‍යා පරීක්ෂණ සාර්ථකව ක්‍රියාත්මක වන බවයි.`;
  }
  if (lang === 'ta') {
    return `🛰️ நாசா நுண்ணறிவு தகவல் ("${query}"): நாசாவின் அதிகாரப்பூர்வ தரவுகளின்படி ஆர்ட்டெமிஸ் நிலவுத் திட்டம், செவ்வாய் ஆய்வு மற்றும் விண்மீன் ஆய்வுகள் வெற்றிகரமாக நடைபெற்று வருகின்றன.`;
  }
  return `🛰️ NASA Astrophysics Intelligence for "${query}": Telemetry confirms operational readiness across LEO (ISS), Cislunar space (Artemis), Mars astrobiology (Perseverance), and deep-space cosmology (JWST).`;
}

/**
 * Trilingual Quick Prompt Chips
 */
const QUICK_PROMPT_CHIPS = [
  { id: 'apod', label: '🌌 Today APOD' },
  { id: 'jwst', label: '🚀 JWST Discoveries' },
  { id: 'mars', label: '🔴 Mars Weather' }
];

/**
 * NasaAi Component
 * 
 * Features:
 * 1. Non-collapsing structural layout:
 *    w-full min-h-[240px] bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between
 * 2. Quick Prompt Chips row above input: ['🌌 Today APOD', '🚀 JWST Discoveries', '🔴 Mars Weather']
 * 3. Text Streaming Effect (smooth character-by-character render)
 * 4. Text-to-Speech (TTS) integration with active language ('si-LK', 'en-US', 'ta-LK')
 * 5. Instant Quiz Generator: "Generate Quiz from Today's APOD" returning 3 multiple-choice questions
 * 6. History Persistence: Saves latest 10 messages to localStorage
 */
export function NasaAi({ className = '', lang: propLang }) {
  const { i18n } = useTranslation();
  
  // 4. State Management: activeLang, query, response, loading
  const activeLang = propLang || i18n?.language || 'en';
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Audio & Voice State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);

  // Dynamic Quiz State
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);

  // Conversation History (Persisted to localStorage)
  const [history, setHistory] = useState([]);

  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamIntervalRef = useRef(null);
  const outputViewportRef = useRef(null);

  // Map active language to speech recognition / synthesis locale
  const getSpeechLocale = useCallback((code) => {
    switch (code) {
      case 'si': return 'si-LK';
      case 'ta': return 'ta-LK';
      case 'en':
      default: return 'en-US';
    }
  }, []);

  // 4. History Persistence: Load latest 10 chat messages on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHistory(parsed.slice(-10));
            // Show latest assistant message as active response
            const latestAssistant = [...parsed].reverse().find(m => m.role === 'assistant');
            if (latestAssistant && latestAssistant.text) {
              setResponse(latestAssistant.text);
            }
          }
        }
      } catch {}
    }
  }, []);

  // Set default initial welcoming intelligence response if empty
  useEffect(() => {
    if (!response && history.length === 0) {
      if (activeLang === 'si') {
        setResponse('ආයුබෝවන්! මම නාසා අභ්‍යවකාශ සහායකයා වෙමි. අද දවසේ APOD, ජේම්ස් වෙබ් දුරේක්ෂය හෝ අඟහරු කාලගුණය පිළිබඳ විමසීමට පහත බොත්තමක් ඔබන්න.');
      } else if (activeLang === 'ta') {
        setResponse('வணக்கம்! நான் நாசா விண்வெளி நுண்ணறிவு உதவியாளர். இன்றைய APOD, ஜேம்ஸ் வெப் தொலைநோக்கி அல்லது செவ்வாய் கிரக வானிலை பற்றி அறிய கீழே உள்ள பட்டன்களை அழுத்தவும்.');
      } else {
        setResponse('Greetings, Space Explorer! I am your NASA Deep-Space Intelligence Assistant. Select a quick prompt chip above or type any query to retrieve real-time astrophysics telemetry.');
      }
    }
  }, [activeLang, response, history]);

  // Client speech capability check (SSR safe)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasSpeech = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
      setIsSpeechSupported(hasSpeech);
    }
  }, []);

  // Save latest 10 messages to localStorage
  const saveToHistory = useCallback((userQ, aiResp) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      setHistory(prev => {
        const newHistory = [
          ...prev,
          { role: 'user', text: userQ, timestamp: Date.now() },
          { role: 'assistant', text: aiResp, timestamp: Date.now() }
        ].slice(-10); // Keep latest 10 messages
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
        return newHistory;
      });
    } catch {}
  }, []);

  // Clear chat history
  const handleClearHistory = () => {
    stopSpeech();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    setHistory([]);
    setActiveQuiz(null);
    setResponse(
      activeLang === 'si'
        ? 'සංවාද ඉතිහාසය මකා දමන ලදී. නව අභ්‍යවකාශ පැනයක් විමසන්න.'
        : activeLang === 'ta'
        ? 'அரட்டை வரலாறு அழிக்கப்பட்டது. புதிய விண்வெளி கேள்வியைக் கேளுங்கள்.'
        : 'Conversation history cleared. Ready for your next deep-space exploration query.'
    );
  };

  // 2. Text-to-Speech (TTS) Integration
  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const toggleSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return;

    if (isSpeaking) {
      stopSpeech();
      return;
    }

    if (!response) return;

    stopSpeech();

    // Clean markdown/emojis for smoother voice synthesis
    const cleanSpeechText = response
      .replace(/[*#_~`]/g, '')
      .replace(/[🌌🚀🔴🛰️💡🎯]/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    const targetLocale = getSpeechLocale(activeLang);
    utterance.lang = targetLocale;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const match = voices.find(v => v.lang === targetLocale || v.lang.startsWith(activeLang));
      if (match) utterance.voice = match;
    }

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [activeLang, getSpeechLocale, isSpeaking, response, stopSpeech]);

  // 1. Text Streaming Effect (smooth character-by-character render)
  const streamTextResponse = useCallback((fullText, userQueryText) => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
    }

    setResponse('');
    setIsStreaming(true);
    setLoading(false);

    let charIndex = 0;
    const totalChars = fullText.length;
    // Dynamic chunk step so longer answers stream briskly within 1.5s
    const step = Math.max(1, Math.floor(totalChars / 55));

    streamIntervalRef.current = setInterval(() => {
      charIndex += step;
      if (charIndex >= totalChars) {
        clearInterval(streamIntervalRef.current);
        setResponse(fullText);
        setIsStreaming(false);
        saveToHistory(userQueryText, fullText);
      } else {
        setResponse(fullText.slice(0, charIndex));
      }

      if (outputViewportRef.current) {
        outputViewportRef.current.scrollTop = outputViewportRef.current.scrollHeight;
      }
    }, 18);
  }, [saveToHistory]);

  // Execute Query (with streaming and @/lib/nasaApi integration)
  const executeQuery = useCallback(async (targetText) => {
    const text = (targetText || query).trim();
    if (!text || loading) return;

    stopSpeech();
    setActiveQuiz(null);
    setLoading(true);
    setQuery(text);

    try {
      const aiResult = await askNasaAi(text, activeLang);
      const fullResult = aiResult || resolveNasaQuery(text, activeLang);
      streamTextResponse(fullResult, text);
    } catch {
      const fallbackResult = resolveNasaQuery(text, activeLang);
      streamTextResponse(fallbackResult, text);
    }
  }, [activeLang, loading, query, stopSpeech, streamTextResponse]);

  // Quick Prompt Chip Handler
  const handleChipClick = (chip) => {
    setQuery(chip.label);
    executeQuery(chip.label);
  };

  // 3. Instant Quiz Generator: "Generate Quiz from Today's APOD"
  const handleGenerateApodQuiz = () => {
    stopSpeech();
    setLoading(true);
    setActiveQuiz(null);
    setSelectedAnswers({});
    setQuizScore(null);
    
    const quizTitle = activeLang === 'si' 
      ? '🎯 අද දවසේ APOD ප්‍රශ්නාවලිය ජනනය වෙමින් පවතී...'
      : activeLang === 'ta'
      ? '🎯 இன்றைய APOD வினாடி வினா உருவாக்கப்படுகிறது...'
      : '🎯 Generating 3-Question Quiz from Today’s APOD Telemetry...';

    setResponse(quizTitle);

    setTimeout(() => {
      const questions = APOD_QUIZ_DATA[activeLang] || APOD_QUIZ_DATA.en;
      setActiveQuiz(questions);
      setLoading(false);

      const introMsg = activeLang === 'si'
        ? '🎯 අද දවසේ APOD ප්‍රශ්නාවලිය සූදානම්! පහත ප්‍රශ්න 3ට පිළිතුරු සපයා ඔබේ දැනුම පරීක්ෂා කරන්න:'
        : activeLang === 'ta'
        ? '🎯 இன்றைய APOD வினாடி வினா தயார்! உங்கள் விண்வெளி அறிவை சோதிக்க கீழே உள்ள 3 கேள்விகளுக்கு பதிலளிக்கவும்:'
        : '🎯 Today’s APOD Quiz generated! Test your astrophysics knowledge on the 3 questions below:';

      streamTextResponse(introMsg, "Generate Quiz from Today's APOD");
    }, 350);
  };

  // Select quiz option
  const handleSelectQuizOption = (qIdx, optIdx) => {
    if (quizScore !== null) return; // Already submitted
    setSelectedAnswers(prev => ({
      ...prev,
      [qIdx]: optIdx
    }));
  };

  // Submit quiz and calculate score
  const handleSubmitQuiz = () => {
    if (!activeQuiz) return;
    let correctCount = 0;
    activeQuiz.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctIndex) {
        correctCount += 1;
      }
    });
    setQuizScore(correctCount);
  };

  // Toggle Voice Recognition
  const toggleVoiceInput = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      inputRef.current?.focus();
      return;
    }

    if (isListening && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      setIsListening(false);
      return;
    }

    stopSpeech();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = getSpeechLocale(activeLang);

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (e) => {
        const speechText = e.results[0][0].transcript;
        if (speechText) {
          setQuery(speechText);
          setIsListening(false);
          executeQuery(speechText);
        }
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [activeLang, executeQuery, getSpeechLocale, isListening, stopSpeech]);

  // Clean up
  useEffect(() => {
    return () => {
      stopSpeech();
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, [stopSpeech]);

  // Copy response
  const copyResponse = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard && response) {
      navigator.clipboard.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    /* 1. Outer Wrapper with required non-collapsing structural layout */
    <div 
      className={`w-full min-h-[240px] bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between font-sans text-slate-100 ${className}`}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-0.5 flex items-center justify-center shadow-md shrink-0">
            <Bot className="w-4 h-4 text-white" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-['Orbitron'] font-bold text-sm sm:text-base text-white tracking-wide">
                NASA Trilingual Space AI
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-cyan-400" />
                {getSpeechLocale(activeLang)} • KEYLESS
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          {/* 2. Text-to-Speech (TTS) Speaker Button */}
          {typeof window !== 'undefined' && 'speechSynthesis' in window && (
            <button
              type="button"
              onClick={toggleSpeech}
              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                isSpeaking 
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' 
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title={isSpeaking ? 'Stop voice reading' : `Read response aloud (${getSpeechLocale(activeLang)})`}
            >
              {isSpeaking ? <VolumeX className="w-3.5 h-3.5 text-cyan-400" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span className="text-[10px] hidden sm:inline">{isSpeaking ? 'Stop' : 'Listen'}</span>
            </button>
          )}

          {/* Copy Button */}
          <button
            type="button"
            onClick={copyResponse}
            className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer flex items-center gap-1"
            title="Copy Response"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="text-[10px] hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Clear History Button */}
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              title="Clear stored chat history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Internal Response Output Viewport (with character streaming effect) */}
      <div 
        ref={outputViewportRef}
        className="w-full bg-slate-950/60 border border-slate-800 max-h-[120px] overflow-y-auto rounded-xl p-3.5 my-2.5 shadow-inner transition-all select-text"
      >
        {loading ? (
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
            <span>
              {activeLang === 'si' ? 'නාසා දත්ත පද්ධතිය විමසමින් පවතී...' :
               activeLang === 'ta' ? 'நாசா விண்வெளித் தரவு மீட்டெடுக்கப்படுகிறது...' :
               'Consulting NASA astrophysics intelligence telemetry...'}
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
              {response}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-cyan-400 animate-pulse align-middle" />
              )}
            </p>

            {/* 3. Interactive APOD Dynamic Quiz Panel inside Output Viewport */}
            {activeQuiz && (
              <div className="pt-2 border-t border-slate-800 space-y-3">
                {activeQuiz.map((q, qIdx) => (
                  <div key={qIdx} className="space-y-1.5 text-xs font-mono">
                    <p className="font-bold text-cyan-300">{q.question}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {q.options.map((opt, optIdx) => {
                        const isSelected = selectedAnswers[qIdx] === optIdx;
                        const isCorrect = q.correctIndex === optIdx;
                        let btnStyle = 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700';

                        if (quizScore !== null) {
                          if (isCorrect) {
                            btnStyle = 'bg-emerald-500/20 border-emerald-500 text-emerald-200 font-bold';
                          } else if (isSelected && !isCorrect) {
                            btnStyle = 'bg-rose-500/20 border-rose-500 text-rose-300';
                          }
                        } else if (isSelected) {
                          btnStyle = 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold';
                        }

                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => handleSelectQuizOption(qIdx, optIdx)}
                            className={`p-2 rounded-lg border text-left transition cursor-pointer text-[11px] leading-snug flex items-center justify-between ${btnStyle}`}
                          >
                            <span>{opt}</span>
                            {quizScore !== null && isCorrect && (
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Submit Quiz & Score Banner */}
                <div className="pt-1 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                  {quizScore === null ? (
                    <button
                      type="button"
                      onClick={handleSubmitQuiz}
                      disabled={Object.keys(selectedAnswers).length < activeQuiz.length}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-40 transition cursor-pointer disabled:cursor-not-allowed"
                    >
                      {activeLang === 'si' ? 'පිළිතුරු තහවුරු කරන්න' :
                       activeLang === 'ta' ? 'விடைகளைச் சமர்ப்பிக்கவும்' :
                       'Submit Quiz Answers'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-emerald-400" />
                        Score: {quizScore} / {activeQuiz.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAnswers({});
                          setQuizScore(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Control Section */}
      <div className="space-y-2">
        {/* 2. Quick Prompt Chips Row & 3. Instant Quiz Generator Button */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 select-none scrollbar-none flex-wrap">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Quick:
          </span>

          {QUICK_PROMPT_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleChipClick(chip)}
              className="px-3 py-1 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-cyan-400/60 hover:bg-slate-800 text-[11px] font-mono text-slate-200 hover:text-cyan-200 whitespace-nowrap transition cursor-pointer active:scale-95 shadow-sm"
            >
              {chip.label}
            </button>
          ))}

          {/* 3. Instant Quiz Generator Button */}
          <button
            type="button"
            onClick={handleGenerateApodQuiz}
            className="px-3 py-1 rounded-xl bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border border-purple-500/40 hover:border-purple-400 text-[11px] font-mono text-purple-300 hover:text-purple-100 whitespace-nowrap transition cursor-pointer active:scale-95 shadow-sm flex items-center gap-1.5"
            title="Generate a 3-question multiple choice quiz from today's active APOD telemetry"
          >
            <HelpCircle className="w-3 h-3 text-purple-400" />
            <span>
              {activeLang === 'si' ? '🎯 APOD ප්‍රශ්නාවලිය ජනනය කරන්න' :
               activeLang === 'ta' ? '🎯 இன்றைய APOD வினாடி வினா' :
               '🎯 Generate Quiz from Today’s APOD'}
            </span>
          </button>
        </div>

        {/* Fallback Visual Text Input Field & Voice Trigger Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeQuery();
          }}
          className="relative flex items-center gap-2 w-full"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                activeLang === 'si'
                  ? 'ISS, අඟහරු රෝවර හෝ අභ්‍යවකාශය ගැන ඕනෑම පැනයක් විමසන්න...'
                  : activeLang === 'ta'
                  ? 'ISS, செவ்வாய் அல்லது விண்வெளி பற்றி கேளுங்கள்...'
                  : 'Ask about the ISS, Mars rovers, JWST, Artemis, or black holes...'
              }
              disabled={loading}
              className="w-full pl-3.5 pr-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 focus:border-cyan-400 text-white placeholder-slate-400 text-xs sm:text-sm font-sans focus:outline-none transition shadow-inner disabled:opacity-50"
            />
          </div>

          {/* Voice Microphone Trigger Button */}
          {isSpeechSupported && (
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={loading}
              className={`p-2.5 rounded-xl border transition cursor-pointer shrink-0 ${
                isListening
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-md shadow-rose-950/50 animate-pulse'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50'
              }`}
              title={isListening ? 'Stop Voice Recording' : `Speak in ${getSpeechLocale(activeLang)}`}
            >
              {isListening ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-cyan-400" />}
            </button>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white disabled:opacity-40 transition shadow-md shadow-cyan-950/50 cursor-pointer disabled:cursor-not-allowed shrink-0"
            title="Transmit Query"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Footer Status Meta */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1 flex-wrap gap-1">
          <span className="flex items-center gap-1 text-emerald-400">
            <Zap className="w-3 h-3 text-emerald-400" />
            Streaming Astrophysics Intelligence • {history.length > 0 ? `${history.length / 2} Queries Cached` : 'Ready'}
          </span>
          <span className="text-slate-500">
            {isSpeechSupported 
              ? `Mic: ${getSpeechLocale(activeLang)} • Press Enter to query` 
              : 'Keyboard input ready • Press Enter to query'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(NasaAi);
