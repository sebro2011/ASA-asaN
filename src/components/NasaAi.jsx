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
  Trash2,
  User,
  ArrowDown,
  Volume1,
  Compass,
  Radio,
  Flame,
  Globe,
  Share2
} from 'lucide-react';
import { askNasaAi } from '@/lib/nasaApi';

const STORAGE_KEY = 'nasa_ai_chat_thread_v3';

/**
 * Web Audio API synthesizer for sci-fi UI feedback
 * Pure Web Audio - zero external audio asset dependencies
 */
class SpaceAudioSynthesizer {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Laser chirp on query transmission (sweep 1200Hz -> 360Hz)
  playSendLaser() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.08);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.085);
    } catch {}
  }

  // Celestial harmonic chime on response arrival (chord: 784Hz G5, 988Hz B5, 1318Hz E6)
  playReceiveChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const tones = [
        { freq: 784, type: 'sine', delay: 0, duration: 0.35, gain: 0.10 },
        { freq: 988, type: 'triangle', delay: 0.04, duration: 0.38, gain: 0.08 },
        { freq: 1318, type: 'sine', delay: 0.08, duration: 0.45, gain: 0.06 }
      ];

      tones.forEach(({ freq, type, delay, duration, gain: peakGain }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        const startTime = now + delay;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
      });
    } catch {}
  }
}

const spaceAudio = new SpaceAudioSynthesizer();

/**
 * Trilingual Astrobiology and Deep Space Intelligence Knowledge Bank (Offline Guard)
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
  },
  artemis: {
    en: '🌕 NASA Artemis Program: Humanity’s next monumental step to land the first woman and first person of color on the Moon. Artemis II will launch a crew of 4 astronauts on a lunar flyby aboard the Space Launch System (SLS) and Orion capsule, paving the path for the Artemis III South Pole surface landing.',
    si: '🌕 නාසා ආටෙමිස් වැඩසටහන: සඳ මතට ප්‍රථම කාන්තාව සහ ප්‍රථම කළු ජාතිකයා ගොඩබැස්වීමේ ඓතිහාසික මෙහෙයුමයි. SLS රොකට්ටුව සහ ඔරායන් කැප්සියුලය මඟින් ගගනගාමීන් 4 දෙනෙකු සඳ වටා පියාසර කරවීමෙන් පසුව ආටෙමිස් III මඟින් සඳෙහි දක්ෂිණ ධ්‍රැවයට ගොඩබසිනු ඇත.',
    ta: '🌕 ஆர்ட்டெமிஸ் நிலவுத் திட்டம்: நிலவில் முதல் பெண்ணையும் முதல் நிறமுடைய மனிதரையும் தரையிறக்கும் நாசாவின் வரலாற்றுச் சிறப்புமிக்க திட்டம். ஆர்ட்டெமிஸ் II நிலவைச் சுற்றி 4 விண்வெளி வீரர்களைக் கொண்டு செல்லும், ஆர்ட்டெமிஸ் III நிலவின் தென் துருவத்தில் தரையிறங்கும்.'
  }
};

/**
 * Trilingual Interactive Quiz Generator for APOD
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

/**
 * Trilingual Quick Topic Starter Chips
 */
const TOPIC_STARTER_CHIPS = [
  {
    id: 'apod',
    icon: '🌌',
    en: "Today's APOD",
    si: 'අද දවසේ APOD',
    ta: 'இன்றைய APOD',
    query: "Explain today's Astronomy Picture of the Day (APOD) with scientific insights"
  },
  {
    id: 'artemis',
    icon: '🌕',
    en: 'Artemis Moon Mission',
    si: 'ආටෙමිස් සඳ මෙහෙයුම',
    ta: 'ஆர்ட்டெமிஸ் திட்டம்',
    query: 'What is NASA Artemis program and when will astronauts land on the Moon?'
  },
  {
    id: 'jwst',
    icon: '🔭',
    en: 'James Webb (JWST)',
    si: 'ජේම්ස් වෙබ් දුරේක්ෂය',
    ta: 'ஜேம்ஸ் வெப் தொலைநோக்கி',
    query: 'What breakthrough discoveries did the James Webb Space Telescope make recently?'
  },
  {
    id: 'mars',
    icon: '🔴',
    en: 'Mars Perseverance',
    si: 'අඟහරු රෝවරය',
    ta: 'செவ்வாய் ரோவர்',
    query: 'What is the Perseverance rover doing in Jezero Crater on Mars right now?'
  },
  {
    id: 'iss',
    icon: '🛰️',
    en: 'ISS Live Telemetry',
    si: 'ISS කක්ෂය සහ වේගය',
    ta: 'ISS சுற்றுப்பாதை',
    query: 'What is the current orbital altitude, velocity, and mission status of the ISS?'
  },
  {
    id: 'asteroids',
    icon: '☄️',
    en: 'Planetary Defense (DART)',
    si: 'ග්‍රහලෝක ආරක්ෂාව & DART',
    ta: 'சிறுகோள் பாதுகாப்பு',
    query: 'How does NASA track Near-Earth Asteroids and how did DART change Dimorphos orbit?'
  }
];

function resolveLocalFallbackQuery(query, lang = 'en') {
  const q = (query || '').toLowerCase().trim();

  if (q.includes('apod') || q.includes('today') || q.includes('picture') || q.includes('අද') || q.includes('இன்றைய')) {
    return SPACE_INTELLIGENCE_BASE.apod[lang] || SPACE_INTELLIGENCE_BASE.apod.en;
  }
  if (q.includes('artemis') || q.includes('moon') || q.includes('සඳ') || q.includes('நிலவு')) {
    return SPACE_INTELLIGENCE_BASE.artemis[lang] || SPACE_INTELLIGENCE_BASE.artemis.en;
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
    return `🛰️ නාසා තාරකා භෞතික විද්‍යා දත්ත පද්ධතිය ("${query}"): නාසා දත්ත පද්ධතිය මඟින් සනාථ කරන්නේ සෞරග්‍රහ මණ්ඩල ගවේෂණ, ආටෙමිස් චන්ද්‍ර මෙහෙයුම් සහ ගැඹුරු විශ්වයේ තාරකා භෞතික විද්‍යා පරීක්ෂණ සාර්ථකව ක්‍රියාත්මක වන බවයි.`;
  }
  if (lang === 'ta') {
    return `🛰️ நாசா நுண்ணறிவு தகவல் ("${query}"): நாசாவின் அதிகாரப்பூர்வ தரவுகளின்படி ஆர்ட்டெமிஸ் நிலவுத் திட்டம், செவ்வாய் ஆய்வு மற்றும் விண்மீன் ஆய்வுகள் வெற்றிகரமாக நடைபெற்று வருகின்றன.`;
  }
  return `🛰️ NASA Astrophysics Intelligence for "${query}": Telemetry confirms operational readiness across LEO (ISS), Cislunar space (Artemis), Mars astrobiology (Perseverance), and deep-space cosmology (JWST).`;
}

/**
 * Clean markdown formatter for text display
 */
function FormattedMessageText({ text }) {
  if (!text) return null;

  // Split into paragraphs / lines
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed text-slate-200">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        // Header ###
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-sm font-bold text-cyan-300 font-['Orbitron'] mt-2 mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>{trimmed.replace(/^###\s+/, '')}</span>
            </h4>
          );
        }

        // Header ##
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="text-base font-bold text-white font-['Orbitron'] mt-2.5 mb-1 text-purple-300">
              {trimmed.replace(/^##\s+/, '')}
            </h3>
          );
        }

        // Bullet point
        if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.replace(/^[•\-\*]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 text-xs sm:text-sm">
              <span className="text-cyan-400 mt-1 text-xs">•</span>
              <span className="flex-1">
                <BoldParser content={content} />
              </span>
            </div>
          );
        }

        return (
          <p key={idx} className="text-xs sm:text-sm">
            <BoldParser content={line} />
          </p>
        );
      })}
    </div>
  );
}

function BoldParser({ content }) {
  // Bold parser with **bold** regex
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={pIdx} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={pIdx}>{part}</span>;
      })}
    </>
  );
}

/**
 * NasaAi - Complete AAA NASA Astrophysics Trilingual AI Chatbot
 */
export function NasaAi({ className = '', lang: propLang }) {
  const { i18n } = useTranslation();
  const activeLang = propLang || i18n?.language || 'en';

  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [streamingText, setStreamingText] = useState('');

  // Audio & Voice States
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);

  // Dynamic Quiz State
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);

  // Conversation Thread
  const [messages, setMessages] = useState([]);
  const [activeModel, setActiveModel] = useState('gemini-3.8-flash');

  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamTimerRef = useRef(null);

  const getSpeechLocale = useCallback((code) => {
    switch (code) {
      case 'si': return 'si-LK';
      case 'ta': return 'ta-LK';
      case 'en':
      default: return 'en-US';
    }
  }, []);

  // Initialize initial welcoming message and load history
  useEffect(() => {
    let initialList = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            initialList = parsed;
          }
        }
      } catch {}
    }

    if (initialList.length === 0) {
      const welcomeText = activeLang === 'si'
        ? 'ආයුබෝවන්! මම නාසා තාරකා භෞතික විද්‍යා සහ ගැඹුරු අභ්‍යවකාශ ගවේෂණ සහායකයා (Gemini 3.8 Flash) වෙමි. ජාත්‍යන්තර අභ්‍යවකාශ නැවතුම (ISS), ආටෙමිස් චන්ද්‍ර මෙහෙයුම, ජේම්ස් වෙබ් දුරේක්ෂය, අඟහරු රෝවර හෝ අභ්‍යවකාශ කාලගුණය පිළිබඳ ඕනෑම පැනයක් විමසන්න.'
        : activeLang === 'ta'
        ? 'வணக்கம்! நான் நாசாவின் வானியற்பியல் மற்றும் ஆழ விண்வெளி ஆய்வு நுண்ணறிவு உதவியாளர் (Gemini 3.8 Flash). சர்வதேச விண்வெளி நிலையம் (ISS), ஆர்ட்டெமிஸ் நிலவு திட்டம், ஜேம்ஸ் வெப் தொலைநோக்கி, செவ்வாய் ரோவர்கள் பற்றி என்னிடம் கேட்கலாம்.'
        : 'Greetings, Explorer! I am the NASA Astrophysics & Deep-Space Exploration AI Assistant, powered by Gemini 3.8 Flash. Ask me about the ISS telemetry, Artemis lunar missions, James Webb discoveries, Mars Perseverance, exoplanets, or cosmology.';

      const welcomeSuggestions = activeLang === 'si'
        ? ['ආටෙමිස් මෙහෙයුම ගැන කියන්න', 'ජේම්ස් වෙබ් දුරේක්ෂයේ සොයාගැනීම්', 'අද දවසේ APOD පින්තූරය කුමක්ද?']
        : activeLang === 'ta'
        ? ['ஆர்ட்டெமிஸ் திட்டம் பற்றி கூறுங்கள்', 'ஜேம்ஸ் வெப் கண்டுபிடிப்புகள்', 'இன்றைய APOD புகைப்படம் என்ன?']
        : ['What is the Artemis Moon flight plan?', 'What did the James Webb telescope discover?', "Explain today's APOD image"];

      initialList = [
        {
          id: 'welcome-msg',
          role: 'assistant',
          text: welcomeText,
          timestamp: Date.now(),
          suggestions: welcomeSuggestions,
          model: 'gemini-3.8-flash',
          provider: 'Google Gemini 3.8 Flash'
        }
      ];
    }

    setMessages(initialList);
  }, [activeLang]);

  // Speech recognition support check
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasSpeech = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
      setIsSpeechSupported(hasSpeech);
    }
  }, []);

  // Auto-scroll on new message or streaming
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, loading]);

  // Persist messages to localStorage
  const persistMessages = useCallback((newMsgs) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newMsgs.slice(-20)));
      } catch {}
    }
  }, []);

  // Text-to-Speech (TTS)
  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  }, []);

  const toggleSpeakMessage = useCallback((msgId, textToSpeak) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return;

    if (speakingMessageId === msgId) {
      stopSpeech();
      return;
    }

    stopSpeech();

    const cleanText = textToSpeak
      .replace(/[*#_~`]/g, '')
      .replace(/[🌌🚀🔴🛰️💡🎯🔭🌕☄️]/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const targetLocale = getSpeechLocale(activeLang);
    utterance.lang = targetLocale;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const match = voices.find(v => v.lang === targetLocale || v.lang.startsWith(activeLang));
      if (match) utterance.voice = match;
    }

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(msgId);
    window.speechSynthesis.speak(utterance);
  }, [activeLang, getSpeechLocale, speakingMessageId, stopSpeech]);

  // Clear chat history
  const handleClearChat = () => {
    stopSpeech();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    setActiveQuiz(null);

    const resetMsg = {
      id: `welcome-${Date.now()}`,
      role: 'assistant',
      text: activeLang === 'si'
        ? 'සංවාද ඉතිහාසය පිරිසිදු කරන ලදී. නව අභ්‍යවකාශ පැනයක් විමසන්න!'
        : activeLang === 'ta'
        ? 'அரட்டை வரலாறு அழிக்கப்பட்டது. புதிய விண்வெளி கேள்வியைக் கேளுங்கள்!'
        : 'Chat history cleared. What astrophysics mystery would you like to explore next?',
      timestamp: Date.now(),
      suggestions: activeLang === 'si'
        ? ['ආටෙමිස් චන්ද්‍ර මෙහෙයුම', 'ජේම්ස් වෙබ් දුරේක්ෂය', 'අඟහරු කාලගුණය']
        : activeLang === 'ta'
        ? ['ஆர்ட்டெமிஸ் திட்டம்', 'ஜேம்ஸ் வெப் தொலைநோக்கி', 'செவ்வாய் வானிலை']
        : ['Artemis Moon Mission', 'James Webb Telescope', 'Mars Weather Update'],
      model: 'gemini-3.8-flash',
      provider: 'Google Gemini 3.8 Flash'
    };

    setMessages([resetMsg]);
  };

  // Streaming animation helper
  const streamAssistantResponse = useCallback((assistantMsg, fullText) => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
    }

    setStreamingMessageId(assistantMsg.id);
    setStreamingText('');

    let charIndex = 0;
    const totalChars = fullText.length;
    const step = Math.max(2, Math.floor(totalChars / 45));

    streamTimerRef.current = setInterval(() => {
      charIndex += step;
      if (charIndex >= totalChars) {
        clearInterval(streamTimerRef.current);
        setStreamingMessageId(null);
        setStreamingText('');
        // Update assistant message with completed text
        setMessages(prev => {
          const updated = prev.map(m => m.id === assistantMsg.id ? { ...m, text: fullText } : m);
          persistMessages(updated);
          return updated;
        });
        if (soundEffectsEnabled) {
          spaceAudio.playReceiveChime();
        }
      } else {
        setStreamingText(fullText.slice(0, charIndex));
      }

      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 16);
  }, [persistMessages, soundEffectsEnabled]);

  // Execute Query (Multi-turn conversational flow)
  const executeUserQuery = useCallback(async (queryText) => {
    const text = (queryText || inputQuery).trim();
    if (!text || loading) return;

    stopSpeech();
    setInputQuery('');
    setLoading(true);

    if (soundEffectsEnabled) {
      spaceAudio.playSendLaser();
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now()
    };

    const assistantMsgId = `assistant-${Date.now() + 1}`;
    const initialAssistantMsg = {
      id: assistantMsgId,
      role: 'assistant',
      text: '',
      timestamp: Date.now() + 1,
      suggestions: [],
      model: 'gemini-3.8-flash',
      provider: 'Google Gemini 3.8 Flash'
    };

    const updatedWithUser = [...messages, userMessage, initialAssistantMsg];
    setMessages(updatedWithUser);

    try {
      // Pass previous turns for multi-turn conversation memory
      const historyContext = messages.slice(-6).map(m => ({
        role: m.role,
        text: m.text
      }));

      const apiResult = await askNasaAi(text, activeLang, historyContext);
      let answerText = '';
      let suggestions = [];
      let modelName = 'gemini-3.8-flash';
      let providerName = 'Google Gemini 3.8 Flash';

      if (typeof apiResult === 'object' && apiResult !== null) {
        answerText = apiResult.text || '';
        suggestions = apiResult.suggestions || [];
        modelName = apiResult.model || 'gemini-3.8-flash';
        providerName = apiResult.provider || 'Google Gemini 3.8 Flash';
      } else if (typeof apiResult === 'string') {
        answerText = apiResult;
      }

      if (!answerText) {
        answerText = resolveLocalFallbackQuery(text, activeLang);
      }

      setActiveModel(modelName);

      // Attach suggestions to assistant message
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m,
        suggestions,
        model: modelName,
        provider: providerName
      } : m));

      setLoading(false);
      streamAssistantResponse(initialAssistantMsg, answerText);
    } catch {
      const fallbackText = resolveLocalFallbackQuery(text, activeLang);
      setLoading(false);
      setActiveModel('nasa-local-engine');
      streamAssistantResponse(initialAssistantMsg, fallbackText);
    }
  }, [activeLang, inputQuery, loading, messages, soundEffectsEnabled, stopSpeech, streamAssistantResponse]);

  // Voice Microphone Input
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
          setIsListening(false);
          executeUserQuery(speechText);
        }
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [activeLang, executeUserQuery, getSpeechLocale, isListening, stopSpeech]);

  // Dynamic APOD Quiz Trigger
  const handleLaunchApodQuiz = () => {
    stopSpeech();
    setSelectedAnswers({});
    setQuizScore(null);
    const questions = APOD_QUIZ_DATA[activeLang] || APOD_QUIZ_DATA.en;
    setActiveQuiz(questions);

    const quizIntroMessage = {
      id: `quiz-${Date.now()}`,
      role: 'assistant',
      text: activeLang === 'si'
        ? '🎯 අද දවසේ APOD විශේෂාංගය (Pillars of Creation) මත පදනම් වූ අභ්‍යවකාශ ප්‍රශ්නාවලිය ජනනය කරන ලදී! පහත ප්‍රශ්න 3ට පිළිතුරු සපයා ඔබේ ලකුණු පරීක්ෂා කරන්න:'
        : activeLang === 'ta'
        ? '🎯 இன்றைய APOD சிறப்பம்சம் (படைப்பின் தூண்கள்) அடிப்படையிலான வினாடி வினா உருவாக்கப்பட்டது! கீழே உள்ள 3 கேள்விகளுக்கு பதிலளித்து உங்கள் அறிவைச் சோதிக்கவும்:'
        : '🎯 Today’s APOD Quiz (Pillars of Creation) generated! Test your astrophysics knowledge on the 3 questions below:',
      timestamp: Date.now(),
      suggestions: [],
      model: 'gemini-3.8-flash',
      provider: 'Google Gemini 3.8 Flash'
    };

    setMessages(prev => {
      const updated = [...prev, quizIntroMessage];
      persistMessages(updated);
      return updated;
    });

    if (soundEffectsEnabled) {
      spaceAudio.playReceiveChime();
    }
  };

  const handleSelectQuizOption = (qIdx, optIdx) => {
    if (quizScore !== null) return;
    setSelectedAnswers(prev => ({
      ...prev,
      [qIdx]: optIdx
    }));
  };

  const handleSubmitQuiz = () => {
    if (!activeQuiz) return;
    let correct = 0;
    activeQuiz.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctIndex) {
        correct += 1;
      }
    });
    setQuizScore(correct);
    if (soundEffectsEnabled) {
      spaceAudio.playReceiveChime();
    }
  };

  // Copy message helper
  const handleCopyMessage = (id, text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard && text) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeech();
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, [stopSpeech]);

  return (
    <div 
      className={`w-full min-h-[580px] bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col justify-between font-sans text-slate-100 backdrop-blur-xl relative overflow-hidden ${className}`}
    >
      {/* Background Ambient Glow */}
      <div className="absolute -top-32 -right-32 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <div className="relative z-10 flex items-center justify-between gap-3 flex-wrap pb-3.5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-900/40 shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Bot className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950 animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-['Orbitron'] font-bold text-base sm:text-lg text-white tracking-wide">
                NASA Space AI
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                Gemini 3.8 Flash
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/15 border border-purple-500/30 text-purple-300">
                {activeLang.toUpperCase()} • Live Telemetry
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
              {activeLang === 'si' ? 'ගැඹුරු අභ්‍යවකාශ සහායක • බහු-වාර සංවාද මතකය' :
               activeLang === 'ta' ? 'ஆழ விண்வெளி உதவியாளர் • பல திருப்ப உரையாடல் நினைவகம்' :
               'Deep Space Astrophysics Assistant • Multi-Turn Conversational Memory'}
            </p>
          </div>
        </div>

        {/* Header Action Tools */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          {/* Sound FX Toggle */}
          <button
            type="button"
            onClick={() => setSoundEffectsEnabled(prev => !prev)}
            className={`p-2 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
              soundEffectsEnabled
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20'
                : 'bg-slate-800/80 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
            title={soundEffectsEnabled ? 'Sound Effects Enabled' : 'Sound Effects Muted'}
          >
            {soundEffectsEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Instant APOD Quiz Button */}
          <button
            type="button"
            onClick={handleLaunchApodQuiz}
            className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600/25 to-pink-600/25 border border-purple-500/40 hover:border-purple-400 text-purple-200 text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm hover:scale-[1.02] active:scale-95"
            title="Generate a 3-question quiz from today's APOD telemetry"
          >
            <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[11px] font-medium hidden sm:inline">APOD Quiz</span>
          </button>

          {/* Clear History Button */}
          {messages.length > 1 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition cursor-pointer"
              title="Clear chat thread"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Topic Chips Scrollbar */}
      <div className="relative z-10 py-2.5 flex items-center gap-2 overflow-x-auto select-none scrollbar-none border-b border-slate-800/50">
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 pl-1">
          <Compass className="w-3 h-3 text-cyan-400" />
          {activeLang === 'si' ? 'මාතෘකා:' : activeLang === 'ta' ? 'தலைப்புகள்:' : 'Topics:'}
        </span>

        {TOPIC_STARTER_CHIPS.map((chip) => {
          const label = chip[activeLang] || chip.en;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => executeUserQuery(chip.query)}
              className="px-3 py-1 rounded-xl bg-slate-800/60 border border-slate-700/80 hover:border-cyan-400/60 hover:bg-slate-800 text-[11px] font-mono text-slate-300 hover:text-cyan-200 whitespace-nowrap transition cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-sm shrink-0"
            >
              <span>{chip.icon}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Conversation Scroll Thread */}
      <div 
        ref={chatScrollRef}
        className="relative z-10 flex-1 my-3 pr-1 space-y-4 overflow-y-auto max-h-[380px] sm:max-h-[420px] scroll-smooth"
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isStreaming = streamingMessageId === msg.id;
          const displayContent = isStreaming ? streamingText : msg.text;
          const isPlayingSpeech = speakingMessageId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div 
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                  isUser 
                    ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 border border-purple-400/50 text-white' 
                    : 'bg-slate-950 border border-cyan-500/40 text-cyan-400'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble Body */}
              <div 
                className={`max-w-[88%] sm:max-w-[80%] rounded-2xl p-4 shadow-xl transition-all ${
                  isUser
                    ? 'bg-gradient-to-r from-purple-900/50 to-indigo-900/50 border border-purple-500/40 text-purple-100 rounded-tr-none'
                    : 'bg-slate-950/80 border border-slate-800/90 text-slate-100 rounded-tl-none'
                }`}
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] font-mono text-slate-400">
                  <span className="font-semibold text-slate-300 flex items-center gap-1">
                    {isUser ? 'Explorer' : (msg.provider || 'NASA AI Assistant')}
                  </span>
                  
                  {!isUser && msg.model && (
                    <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px]">
                      {msg.model}
                    </span>
                  )}
                </div>

                {/* Message Text Content */}
                <div className="text-xs sm:text-sm font-sans select-text">
                  <FormattedMessageText text={displayContent} />
                  {isStreaming && (
                    <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
                  )}
                </div>

                {/* Bottom Message Actions for Assistant */}
                {!isUser && !isStreaming && msg.text && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {/* TTS Speak Button */}
                      {typeof window !== 'undefined' && 'speechSynthesis' in window && (
                        <button
                          type="button"
                          onClick={() => toggleSpeakMessage(msg.id, msg.text)}
                          className={`p-1 px-2 rounded-lg text-[10px] font-mono border transition cursor-pointer flex items-center gap-1 ${
                            isPlayingSpeech
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 animate-pulse'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                          title={isPlayingSpeech ? 'Stop speech' : 'Listen with TTS voice'}
                        >
                          {isPlayingSpeech ? <VolumeX className="w-3 h-3 text-cyan-400" /> : <Volume1 className="w-3 h-3" />}
                          <span>{isPlayingSpeech ? 'Stop' : 'Listen'}</span>
                        </button>
                      )}

                      {/* Copy Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.text)}
                        className="p-1 px-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-[10px] font-mono transition cursor-pointer flex items-center gap-1"
                        title="Copy message"
                      >
                        {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {/* Follow-Up Suggestions Chips */}
                {!isUser && !isStreaming && Array.isArray(msg.suggestions) && msg.suggestions.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800/60 space-y-1.5">
                    <span className="text-[10px] font-mono text-cyan-400/90 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      {activeLang === 'si' ? 'යෝජිත පසු විපරම් ප්‍රශ්න:' :
                       activeLang === 'ta' ? 'பரிந்துரைக்கப்பட்ட கேள்விகள்:' :
                       'Suggested Follow-ups:'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.suggestions.map((sug, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => executeUserQuery(sug)}
                          className="px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-800/50 hover:border-cyan-400 hover:bg-cyan-900/30 text-cyan-300 text-[11px] font-mono transition cursor-pointer text-left active:scale-95 shadow-sm"
                        >
                          → {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-950 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shrink-0 shadow-md">
              <Bot className="w-4 h-4 animate-bounce" />
            </div>
            <div className="rounded-2xl p-4 bg-slate-950/80 border border-slate-800 text-cyan-300 flex items-center gap-2.5 text-xs font-mono shadow-lg">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
              <span>
                {activeLang === 'si' ? 'නාසා තාරකා භෞතික විද්‍යා දත්ත සම්ප්‍රේෂණය වෙමින් පවතී...' :
                 activeLang === 'ta' ? 'நாசா விண்வெளித் தரவு மீட்டெடுக்கப்படுகிறது...' :
                 'Consulting Gemini 3.8 Flash & NASA Deep Space Telemetry...'}
              </span>
            </div>
          </div>
        )}

        {/* Dynamic Quiz Card in Chat Stream */}
        {activeQuiz && (
          <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-b from-purple-950/40 via-slate-950/80 to-slate-950/90 border border-purple-500/40 shadow-2xl space-y-4 my-2">
            <div className="flex items-center justify-between gap-2 border-b border-purple-500/20 pb-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-purple-400" />
                <h4 className="font-['Orbitron'] font-bold text-sm text-purple-200">
                  {activeLang === 'si' ? 'අද දවසේ APOD අභ්‍යවකාශ ප්‍රශ්නාවලිය' :
                   activeLang === 'ta' ? 'இன்றைய APOD விண்வெளி வினாடி வினா' :
                   'Today’s APOD Telemetry Quiz'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setActiveQuiz(null)}
                className="text-xs text-slate-400 hover:text-white font-mono"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-4">
              {activeQuiz.map((q, qIdx) => (
                <div key={qIdx} className="space-y-2 text-xs font-mono">
                  <p className="font-bold text-cyan-300">{q.question}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer text-[11px] leading-snug flex items-center justify-between ${btnStyle}`}
                        >
                          <span>{opt}</span>
                          {quizScore !== null && isCorrect && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {quizScore !== null && (
                    <p className="text-[10px] text-slate-400 italic pt-0.5">
                      💡 {q.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Quiz Submit Bar */}
            <div className="pt-2 border-t border-purple-500/20 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
              {quizScore === null ? (
                <button
                  type="button"
                  onClick={handleSubmitQuiz}
                  disabled={Object.keys(selectedAnswers).length < activeQuiz.length}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold disabled:opacity-40 transition cursor-pointer disabled:cursor-not-allowed shadow-md"
                >
                  {activeLang === 'si' ? 'පිළිතුරු තහවුරු කරන්න' :
                   activeLang === 'ta' ? 'விடைகளைச் சமர்ப்பிக்கவும்' :
                   'Submit Quiz Answers'}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-400" />
                    Score: {quizScore} / {activeQuiz.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAnswers({});
                      setQuizScore(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
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

      {/* Bottom Message Input Form */}
      <div className="relative z-10 pt-2 space-y-2 border-t border-slate-800/80">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeUserQuery();
          }}
          className="relative flex items-center gap-2 w-full"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={
                activeLang === 'si'
                  ? 'ISS, ආටෙමිස්, ජේම්ස් වෙබ් හෝ කළු කුහර ගැන ඕනෑම පැනයක් විමසන්න...'
                  : activeLang === 'ta'
                  ? 'ISS, ஆர்ட்டெமிஸ், ஜேம்ஸ் வெப் அல்லது கருந்துளைகள் பற்றி கேளுங்கள்...'
                  : 'Ask about Artemis, James Webb, Mars rovers, ISS telemetry, or black holes...'
              }
              disabled={loading}
              className="w-full pl-4 pr-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-cyan-400 text-white placeholder-slate-400 text-xs sm:text-sm font-sans focus:outline-none transition shadow-inner disabled:opacity-50"
            />
          </div>

          {/* Voice Microphone Trigger Button */}
          {isSpeechSupported && (
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={loading}
              className={`p-3 rounded-2xl border transition cursor-pointer shrink-0 ${
                isListening
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-md shadow-rose-950/50 animate-pulse'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50'
              }`}
              title={isListening ? 'Stop Voice Recording' : `Speak in ${getSpeechLocale(activeLang)}`}
            >
              {isListening ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-cyan-400" />}
            </button>
          )}

          {/* Send Query Button */}
          <button
            type="submit"
            disabled={!inputQuery.trim() || loading}
            className="p-3 rounded-2xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white disabled:opacity-40 transition shadow-lg shadow-cyan-950/50 cursor-pointer disabled:cursor-not-allowed shrink-0"
            title="Send Query"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Footer Telemetry Status */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1 flex-wrap gap-2">
          <span className="flex items-center gap-1.5 text-cyan-300">
            <Zap className="w-3 h-3 text-cyan-400" />
            <span>AI Model: {activeModel}</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400">Online Telemetry</span>
          </span>
          <span className="text-slate-500">
            {isSpeechSupported 
              ? `Mic: ${getSpeechLocale(activeLang)} • Press Enter to transmit` 
              : 'Keyboard input ready • Press Enter to transmit'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(NasaAi);
