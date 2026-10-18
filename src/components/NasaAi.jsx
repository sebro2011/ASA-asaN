'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, 
  Send, 
  Sparkles, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Volume1, 
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
  Compass,
  Radio,
  Flame,
  Globe,
  Share2,
  Square,
  Plus,
  Terminal,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Layers,
  MessageSquare,
  Telescope,
  Atom,
  Clock,
  ExternalLink,
  CornerDownLeft
} from 'lucide-react';
import { askNovaAi } from '@/lib/nasaApi';
import { generateLocalSpaceResponse } from '../utils/spaceLocalAiEngine.js';
import GeminiLiveVoice from './GeminiLiveVoice.jsx';

const STORAGE_KEY = 'nasa_ai_chat_thread_v3';
const NOVA_PROVIDER_STORAGE_KEY = 'nova_ai_provider_v1';
const NOVA_PROVIDER_VALUES = new Set(['auto', 'local', 'gemini', 'openrouter']);

function getSavedNovaProvider() {
  if (typeof window === 'undefined' || !window.localStorage) return 'auto';
  try {
    const savedProvider = localStorage.getItem(NOVA_PROVIDER_STORAGE_KEY)?.trim().toLowerCase();
    return NOVA_PROVIDER_VALUES.has(savedProvider) ? savedProvider : 'auto';
  } catch {
    return 'auto';
  }
}

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
 * 6 Attractive Space Explorer Suggestion Cards (Trilingual)
 */
const WELCOME_SUGGESTION_CARDS = [
  {
    id: 'card-apod',
    icon: Telescope,
    badge: 'APOD',
    title: {
      en: "Today's APOD Imagery",
      si: "දවසේ තාරකා ඡායාරූපය",
      ta: "இன்றைய வானியல் புகைப்படம்"
    },
    desc: {
      en: "Explain today's Astronomy Picture of the Day with deep-space science.",
      si: "අද දින නාසා තාරකා විද්‍යා ඡායාරූපය ගැඹුරු විද්‍යාත්මකව පැහැදිලි කරන්න.",
      ta: "இன்றைய நாசா வானியல் புகைப்படத்தை அறிவியல் விளக்கத்துடன் அறியுங்கள்."
    },
    prompt: "Explain today's Astronomy Picture of the Day (APOD) with scientific insights and cosmic context."
  },
  {
    id: 'card-asteroids',
    icon: Flame,
    badge: 'PHA',
    title: {
      en: "Near-Earth Asteroids",
      si: "පෘථිවි-ආසන්න ග්‍රහක",
      ta: "பூமிக்கு அருகிலான சிறுகோள்கள்"
    },
    desc: {
      en: "Explore the latest asteroid tracking data and planetary defense measures.",
      si: "නවතම ග්‍රහක ලුහුබැඳීමේ දත්ත සහ DART පෘථිවි ආරක්ෂණ තාක්ෂණය විමසන්න.",
      ta: "சமீபத்திய சிறுகோள் தரவு மற்றும் நாசாவின் கிரக பாதுகாப்பு முறைகள்."
    },
    prompt: "Explore the latest asteroid data: How does NASA detect Potentially Hazardous Asteroids and how did DART alter Dimorphos?"
  },
  {
    id: 'card-iss',
    icon: Radio,
    badge: 'LEO',
    title: {
      en: "How the ISS Works",
      si: "ජාත්‍යන්තර අභ්‍යවකාශ නැවතුම",
      ta: "சர்வதேச விண்வெளி நிலையம்"
    },
    desc: {
      en: "Orbital physics, life-support mechanics, and speed of the space station.",
      si: "කක්ෂීය භෞතික විද්‍යාව, ජීවිත ආධාරක සහ පැයට කි.මී. 27,580ක පියාසැරිය.",
      ta: "சுற்றுப்பாதை இயற்பியல், உயிர் ஆதரவு அமைப்புகள் மற்றும் விண்வெளி வேக விவரங்கள்."
    },
    prompt: "How does the International Space Station work? Explain its orbital mechanics, altitude, speed, and daily science experiments."
  },
  {
    id: 'card-blackholes',
    icon: Atom,
    badge: 'COSMOS',
    title: {
      en: "Black Holes Explained",
      si: "කළු කුහර සරල බසින්",
      ta: "கருந்துளைகள் விளக்கம்"
    },
    desc: {
      en: "Event horizons, gravitational singularity, and supermassive black holes.",
      si: "සිද්ධි ක්ෂිතිජය, ගුරුත්වාකර්ෂණ කේන්ද්‍රය සහ අති දැවැන්ත කළු කුහර.",
      ta: "நிகழ்வு எல்லை, ஈர்ப்பு விசை மற்றும் பிரம்மாண்ட கருந்துளைகள் பற்றிய விளக்கம்."
    },
    prompt: "Explain black holes in simple language: What are event horizons, how do they form, and what did Event Horizon Telescope photograph?"
  },
  {
    id: 'card-mars',
    icon: Compass,
    badge: 'JEZERO',
    title: {
      en: "Mars Rover Missions",
      si: "අඟහරු රෝවර මෙහෙයුම්",
      ta: "செவ்வாய் ரோவர் பயணங்கள்"
    },
    desc: {
      en: "Perseverance in Jezero Crater, Ingenuity flights, and search for ancient life.",
      si: "පර්සෙවරන්ස් රෝවරය, ඉන්ජෙනුයිටි පියාසැරි සහ අතීත ක්ෂුද්‍රජීවී සාක්ෂි සෙවීම.",
      ta: "பெர்சவரன்ஸ் ரோவர், இன்ஜெனியூட்டி ஹெலிகாப்டர் மற்றும் பண்டைய நுண்ணுயிர் தேடல்."
    },
    prompt: "Discover Mars rover missions: What is Perseverance exploring in Jezero Crater and what rock cores has it cached for Earth return?"
  },
  {
    id: 'card-solar',
    icon: Zap,
    badge: 'SPACE WX',
    title: {
      en: "Solar Storms & Flares",
      si: "සූර්ය කුණාටු සහ කාලගුණය",
      ta: "சூரிய புயல்கள் & வானிலை"
    },
    desc: {
      en: "Coronal mass ejections, geomagnetic auroras, and Parker Solar Probe.",
      si: "කොරෝනා විදාරණ, භූකාන්ත අරෝරා සහ සූර්යයා ස්පර්ශ කරන පාකර් යානය.",
      ta: "சூரிய காந்த புயல்கள், அரோரா ஒளி மற்றும் பார்க்கர் விண்கல ஆய்வுகள்."
    },
    prompt: "Learn about solar storms: What are solar flares, coronal mass ejections (CMEs), and how does NASA monitor space weather?"
  }
];

function getNovaErrorMessage(error, lang = 'en') {
  const language = typeof lang === 'string' ? lang.split(/[-_]/)[0].toLowerCase() : 'en';
  const code = typeof error?.code === 'string' ? error.code : '';
  const messages = {
    en: {
      AI_NOT_CONFIGURED: 'NOVA AI is not configured on this deployment. Please contact the site administrator.',
      PROVIDER_NOT_CONFIGURED: 'That provider is not configured on the server. Choose Auto or Local, or ask the administrator to add its server-side API key.',
      RATE_LIMITED: 'Too many NOVA requests were sent. Please wait a moment and retry.',
      UPSTREAM_RATE_LIMITED: 'The selected AI provider is busy or rate-limited. Please wait a moment and retry.',
      FREE_MODEL_UNAVAILABLE: 'No free OpenRouter model is available for this request right now. Please retry shortly.',
      MODEL_UNAVAILABLE: 'The selected model is unavailable right now. Please retry shortly.',
      AI_TIMEOUT: 'NOVA took too long to respond. Please retry.',
      NETWORK_ERROR: 'Could not reach NOVA. Check your connection and retry.',
      UPSTREAM_NETWORK_ERROR: 'Could not reach the AI provider. Check your connection and retry.',
      PROVIDER_UNAVAILABLE: 'The AI provider is temporarily unavailable. Please retry shortly.',
      PROVIDER_AUTH_ERROR: 'The AI provider could not process this request. Please try again later.',
      INVALID_REQUEST: 'That message could not be sent. Please check it and try again.',
      REQUEST_TOO_LARGE: 'That request is too long. Shorten it and try again.',
      MESSAGE_TOO_LARGE: 'That message is too long. Shorten it and try again.',
      HISTORY_TOO_LARGE: 'The conversation is too long to send. Start a new chat or shorten your message.',
      HISTORY_TOO_LONG: 'The conversation history is too long. Start a new chat and try again.',
    },
    si: {
      AI_NOT_CONFIGURED: 'මෙම යෙදවුමේ NOVA AI සකසා නැත. කරුණාකර අඩවි පරිපාලක අමතන්න.',
      PROVIDER_NOT_CONFIGURED: 'තෝරාගත් AI සේවාව සේවාදායකයේ සකසා නැත. Auto හෝ Local තෝරන්න, නැතහොත් සේවාදායකයේ API යතුර එක් කරන ලෙස පරිපාලකගෙන් ඉල්ලන්න.',
      RATE_LIMITED: 'NOVA ඉල්ලීම් වැඩි ප්‍රමාණයක් යවා ඇත. මොහොතක් රැඳී නැවත උත්සාහ කරන්න.',
      UPSTREAM_RATE_LIMITED: 'තෝරාගත් AI සේවාව මේ මොහොතේ කාර්යබහුලයි. මොහොතක් රැඳී නැවත උත්සාහ කරන්න.',
      FREE_MODEL_UNAVAILABLE: 'දැනට OpenRouter නොමිලේ මාදිලියක් ලබාගත නොහැක. මඳ වේලාවකින් නැවත උත්සාහ කරන්න.',
      MODEL_UNAVAILABLE: 'තෝරාගත් AI මාදිලිය දැනට ලබාගත නොහැක. මඳ වේලාවකින් නැවත උත්සාහ කරන්න.',
      AI_TIMEOUT: 'NOVA පිළිතුරු දීමට වැඩි වේලාවක් ගත විය. නැවත උත්සාහ කරන්න.',
      NETWORK_ERROR: 'NOVA වෙත සම්බන්ධ විය නොහැක. ඔබගේ සම්බන්ධතාව පරීක්ෂා කර නැවත උත්සාහ කරන්න.',
      UPSTREAM_NETWORK_ERROR: 'AI සේවාව වෙත සම්බන්ධ විය නොහැක. සම්බන්ධතාව පරීක්ෂා කර නැවත උත්සාහ කරන්න.',
      PROVIDER_UNAVAILABLE: 'AI සේවාව තාවකාලිකව ලබාගත නොහැක. මඳ වේලාවකින් නැවත උත්සාහ කරන්න.',
      PROVIDER_AUTH_ERROR: 'AI සේවාවට මෙම ඉල්ලීම සකස් කළ නොහැකි විය. පසුව නැවත උත්සාහ කරන්න.',
      INVALID_REQUEST: 'එම පණිවිඩය යැවිය නොහැක. එය පරීක්ෂා කර නැවත උත්සාහ කරන්න.',
      REQUEST_TOO_LARGE: 'එම ඉල්ලීම දිග වැඩිය. කෙටි කර නැවත උත්සාහ කරන්න.',
      MESSAGE_TOO_LARGE: 'එම පණිවිඩය දිග වැඩිය. කෙටි කර නැවත උත්සාහ කරන්න.',
      HISTORY_TOO_LARGE: 'සංවාදය යැවීමට දිග වැඩිය. නව සංවාදයක් ආරම්භ කරන්න හෝ පණිවිඩය කෙටි කරන්න.',
      HISTORY_TOO_LONG: 'සංවාද ඉතිහාසය දිග වැඩිය. නව සංවාදයක් ආරම්භ කර නැවත උත්සාහ කරන්න.',
    },
    ta: {
      AI_NOT_CONFIGURED: 'இந்த வெளியீட்டில் NOVA AI அமைக்கப்படவில்லை. தள நிர்வாகியைத் தொடர்புகொள்ளவும்.',
      PROVIDER_NOT_CONFIGURED: 'தேர்ந்தெடுத்த AI சேவை சேவையகத்தில் அமைக்கப்படவில்லை. Auto அல்லது Local-ஐத் தேர்ந்தெடுக்கவும் அல்லது சேவையக API சாவியைச் சேர்க்க நிர்வாகியிடம் கேட்கவும்.',
      RATE_LIMITED: 'NOVA கோரிக்கைகள் அதிகமாக அனுப்பப்பட்டுள்ளன. சிறிது நேரம் காத்திருந்து மீண்டும் முயற்சிக்கவும்.',
      UPSTREAM_RATE_LIMITED: 'தேர்ந்தெடுத்த AI சேவை தற்போது அதிக பயன்பாட்டில் உள்ளது. சிறிது நேரம் காத்திருந்து மீண்டும் முயற்சிக்கவும்.',
      FREE_MODEL_UNAVAILABLE: 'இந்தக் கோரிக்கைக்கு இப்போது OpenRouter இலவச மாதிரி கிடைக்கவில்லை. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.',
      MODEL_UNAVAILABLE: 'தேர்ந்தெடுத்த AI மாதிரி தற்போது கிடைக்கவில்லை. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.',
      AI_TIMEOUT: 'NOVA பதிலளிக்க அதிக நேரம் எடுத்தது. மீண்டும் முயற்சிக்கவும்.',
      NETWORK_ERROR: 'NOVA-வை அணுக முடியவில்லை. உங்கள் இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
      UPSTREAM_NETWORK_ERROR: 'AI சேவையை அணுக முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
      PROVIDER_UNAVAILABLE: 'AI சேவை தற்காலிகமாக கிடைக்கவில்லை. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.',
      PROVIDER_AUTH_ERROR: 'AI சேவையால் இந்தக் கோரிக்கையைச் செயல்படுத்த முடியவில்லை. பின்னர் மீண்டும் முயற்சிக்கவும்.',
      INVALID_REQUEST: 'இந்தச் செய்தியை அனுப்ப முடியவில்லை. சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
      REQUEST_TOO_LARGE: 'இந்தக் கோரிக்கை மிக நீளமாக உள்ளது. சுருக்கி மீண்டும் முயற்சிக்கவும்.',
      MESSAGE_TOO_LARGE: 'இந்தச் செய்தி மிக நீளமாக உள்ளது. சுருக்கி மீண்டும் முயற்சிக்கவும்.',
      HISTORY_TOO_LARGE: 'உரையாடல் மிக நீளமாக உள்ளது. புதிய உரையாடலைத் தொடங்கவும் அல்லது செய்தியைச் சுருக்கவும்.',
      HISTORY_TOO_LONG: 'உரையாடல் வரலாறு மிக நீளமாக உள்ளது. புதிய உரையாடலைத் தொடங்கி மீண்டும் முயற்சிக்கவும்.',
    },
  };

  const languageMessages = messages[language] || messages.en;
  if (languageMessages[code]) return languageMessages[code];
  if (code.includes('TOO_LARGE') || code === 'HISTORY_TOO_LONG') return languageMessages.REQUEST_TOO_LARGE;
  if (code.startsWith('INVALID_') || code === 'LATEST_MESSAGE_MUST_BE_USER') return languageMessages.INVALID_REQUEST;
  return languageMessages.PROVIDER_UNAVAILABLE;
}

/**
 * Robust, Safe Markdown Formatter with Code Block Support & Copy-to-Clipboard
 */
function FormattedMessageText({ text }) {
  if (!text) return null;

  // Split by code blocks ```
  const codeBlockParts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 leading-relaxed text-slate-200">
      {codeBlockParts.map((block, blockIdx) => {
        // If code block
        if (block.startsWith('```') && block.endsWith('```')) {
          const rawContent = block.slice(3, -3);
          const firstLineBreak = rawContent.indexOf('\n');
          let language = 'code';
          let codeBody = rawContent;

          if (firstLineBreak !== -1) {
            const possibleLang = rawContent.slice(0, firstLineBreak).trim();
            if (possibleLang && !possibleLang.includes(' ')) {
              language = possibleLang;
              codeBody = rawContent.slice(firstLineBreak + 1);
            }
          }

          return (
            <CodeBlockRenderer 
              key={`code-${blockIdx}`} 
              language={language} 
              code={codeBody.trim()} 
            />
          );
        }

        // Regular text block with lines
        const lines = block.split('\n');

        return (
          <div key={`text-${blockIdx}`} className="space-y-1.5">
            {lines.map((line, idx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={idx} className="h-1" />;

              // Header ###
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={idx} className="text-sm font-bold text-cyan-300 font-['Orbitron'] mt-3 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{trimmed.replace(/^###\s+/, '')}</span>
                  </h4>
                );
              }

              // Header ##
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={idx} className="text-base font-bold text-white font-['Orbitron'] mt-3.5 mb-1.5 text-purple-300 flex items-center gap-1.5">
                    <Atom className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>{trimmed.replace(/^##\s+/, '')}</span>
                  </h3>
                );
              }

              // Header #
              if (trimmed.startsWith('# ')) {
                return (
                  <h2 key={idx} className="text-lg font-bold text-white font-['Orbitron'] mt-4 mb-2 text-cyan-200">
                    {trimmed.replace(/^#\s+/, '')}
                  </h2>
                );
              }

              // Blockquote >
              if (trimmed.startsWith('> ')) {
                return (
                  <blockquote key={idx} className="pl-3 py-1 my-1 border-l-2 border-cyan-400/80 bg-cyan-950/20 text-cyan-200/90 text-xs sm:text-sm italic rounded-r-lg">
                    <BoldParser content={trimmed.replace(/^>\s+/, '')} />
                  </blockquote>
                );
              }

              // Bullet points
              if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const content = trimmed.replace(/^[•\-\*]\s+/, '');
                return (
                  <div key={idx} className="flex items-start gap-2 pl-1 text-xs sm:text-sm">
                    <span className="text-cyan-400 mt-1 text-xs shrink-0">•</span>
                    <span className="flex-1">
                      <BoldParser content={content} />
                    </span>
                  </div>
                );
              }

              // Numbered list
              const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
              if (numMatch) {
                return (
                  <div key={idx} className="flex items-start gap-2 pl-1 text-xs sm:text-sm">
                    <span className="text-purple-400 font-mono text-xs font-semibold shrink-0">{numMatch[1]}.</span>
                    <span className="flex-1">
                      <BoldParser content={numMatch[2]} />
                    </span>
                  </div>
                );
              }

              return (
                <p key={idx} className="text-xs sm:text-sm leading-relaxed">
                  <BoldParser content={line} />
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Dedicated Code Block with Copy Action
 */
function CodeBlockRenderer({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-3 rounded-xl bg-slate-950/95 border border-slate-800 overflow-hidden font-mono text-xs shadow-xl">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span className="uppercase text-cyan-300 font-bold">{language}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
          title="Copy code"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-slate-200 leading-relaxed scrollbar-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function BoldParser({ content }) {
  // Parse inline code `code` first, then **bold**
  const codeParts = content.split(/(`[^`]+`)/g);

  return (
    <>
      {codeParts.map((part, cIdx) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code key={cIdx} className="px-1.5 py-0.5 mx-0.5 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 font-mono text-[11px]">
              {part.slice(1, -1)}
            </code>
          );
        }

        // Bold parser with **bold** regex
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return (
          <React.Fragment key={cIdx}>
            {boldParts.map((bPart, bIdx) => {
              if (bPart.startsWith('**') && bPart.endsWith('**')) {
                return (
                  <strong key={bIdx} className="font-semibold text-white">
                    {bPart.slice(2, -2)}
                  </strong>
                );
              }
              return <span key={bIdx}>{bPart}</span>;
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}

/**
 * NasaAi - Premium Cinematic Space AI Chatbot
 */
export function NasaAi({ className = '', lang: propLang }) {
  const { i18n } = useTranslation();
  const activeLang = propLang || i18n?.language || 'en';

  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState('');

  // Audio & Voice States
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Dynamic Quiz State
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);

  // Conversation Thread
  const [messages, setMessages] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(getSavedNovaProvider);
  const [providerAvailability, setProviderAvailability] = useState({ local: true, gemini: null, openrouter: null });
  const [activeModel, setActiveModel] = useState('Auto routing');
  const [connectionState, setConnectionState] = useState('ready'); // 'ready' | 'online' | 'connecting' | 'offline' | 'error'

  const chatScrollRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamTimerRef = useRef(null);
  const requestAbortControllerRef = useRef(null);

  const getSpeechLocale = useCallback((code) => {
    switch (code) {
      case 'si': return 'si-LK';
      case 'ta': return 'ta-LK';
      case 'en':
      default: return 'en-US';
    }
  }, []);

  // Monitor network online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setConnectionState('ready');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setConnectionState('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Read only public key-availability flags; the API never sends provider secrets to the browser.
  useEffect(() => {
    let mounted = true;
    fetch('/api/nova/config', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (!mounted || !config?.providers) return;
        setProviderAvailability({
          local: true,
          gemini: config.providers.gemini === true,
          openrouter: config.providers.openrouter === true,
        });
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if ((selectedProvider === 'gemini' || selectedProvider === 'openrouter') && providerAvailability[selectedProvider] === false) {
      setSelectedProvider('auto');
      try { localStorage.setItem(NOVA_PROVIDER_STORAGE_KEY, 'auto'); } catch {}
    }
  }, [providerAvailability, selectedProvider]);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 46), 140);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputQuery, adjustTextareaHeight]);

  // Load conversation thread from localStorage
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

    setMessages(initialList);
  }, []);

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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newMsgs.slice(-25)));
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
    utterance.rate = 0.98;
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

  // Stop Generation / Streaming helper
  const handleStopGeneration = useCallback(() => {
    if (requestAbortControllerRef.current) {
      requestAbortControllerRef.current.abort();
      requestAbortControllerRef.current = null;
    }
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setStreamingMessageId(null);
    setStreamingText('');
    setLoading(false);
    setConnectionState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'ready');
    if (streamingMessageId) {
      setMessages(prev => {
        const updated = prev.filter(message => message.id !== streamingMessageId || message.text);
        persistMessages(updated);
        return updated;
      });
    }
    stopSpeech();
  }, [persistMessages, stopSpeech, streamingMessageId]);

  // Clear chat / New Chat
  const handleStartNewChat = () => {
    handleStopGeneration();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    setActiveQuiz(null);
    setMessages([]);
    setInputQuery('');
    setLastSubmittedQuery('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  // Streaming animation helper
  const streamAssistantResponse = useCallback((assistantMsg, fullText, finalConnectionState = 'online') => {
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
        streamTimerRef.current = null;
        setStreamingMessageId(null);
        setStreamingText('');
        setConnectionState(finalConnectionState);
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
    setLastSubmittedQuery(text);
    setLoading(true);
    setConnectionState('connecting');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

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
      queryText: text,
      suggestions: [],
      model: 'nasa-local-engine',
      provider: 'NOVA AI'
    };

    const updatedWithUser = [...messages, userMessage, initialAssistantMsg];
    setMessages(updatedWithUser);
    const requestController = new AbortController();
    requestAbortControllerRef.current = requestController;

    try {
      // Keep a bounded, validated conversation context; error messages are not sent back as AI history.
      const historyContext = messages
        .filter((m) =>
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.text === 'string' &&
          m.text.trim() &&
          !m.isError
        )
        .slice(-6)
        .map((m) => ({
          role: m.role,
          text: m.isFallback ? `[Local offline fallback; may be incomplete] ${m.text}` : m.text
        }));

      const localLanguage = typeof activeLang === 'string' ? activeLang.split(/[-_]/)[0] : 'en';
      const apiResult = selectedProvider === 'local'
        ? (() => {
          const local = generateLocalSpaceResponse(text, localLanguage);
          return {
            text: local.text,
            suggestions: local.suggestions || [],
            model: 'nasa-local-engine',
            provider: 'NOVA Local Space Engine',
            lang: local.lang || localLanguage,
            fallback: false,
            intent: local.intent,
          };
        })()
        : await askNovaAi(text, activeLang, historyContext, {
          signal: requestController.signal,
          provider: selectedProvider,
        });
      const answerText = apiResult.text;
      const suggestions = apiResult.suggestions || [];
      const modelName = apiResult.model || 'nasa-local-engine';
      const providerName = apiResult.provider || 'NOVA Local Space Engine';

      setActiveModel(modelName);

      // Show the provider/model actually used (including a labeled local fallback).
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m,
        suggestions,
        model: modelName,
        provider: providerName,
        isFallback: apiResult.fallback === true
      } : m));

      setLoading(false);
      streamAssistantResponse(initialAssistantMsg, answerText);
    } catch (error) {
      if (requestController.signal.aborted) {
        setLoading(false);
        setConnectionState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'ready');
        setMessages(prev => {
          const updated = prev.filter(m => m.id !== assistantMsgId);
          persistMessages(updated);
          return updated;
        });
        return;
      }

      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isOffline) {
        const fallbackLang = typeof activeLang === 'string' ? activeLang.split(/[-_]/)[0] : 'en';
        const localResult = generateLocalSpaceResponse(text, fallbackLang);
        const fallbackText = localResult.text;
        const localProvider = 'NOVA Local Space Engine';

        setLoading(false);
        setActiveModel('nasa-local-engine');
        setMessages(prev => {
          const updated = prev.map(m => m.id === assistantMsgId ? {
            ...m,
            model: 'nasa-local-engine',
            provider: localProvider,
            suggestions: localResult.suggestions || [],
            isFallback: true
          } : m);
          persistMessages(updated);
          return updated;
        });
        streamAssistantResponse(initialAssistantMsg, fallbackText, 'offline');
        return;
      }

      const errorText = getNovaErrorMessage(error, activeLang);
      const fallbackLang = typeof activeLang === 'string' ? activeLang.split(/[-_]/)[0] : 'en';
      const unavailableLabel = fallbackLang === 'si'
        ? 'තාවකාලිකව ලබාගත නොහැක'
        : fallbackLang === 'ta'
        ? 'தற்காலிகமாக கிடைக்கவில்லை'
        : 'Temporarily unavailable';

      setLoading(false);
      setConnectionState('error');
      setActiveModel(unavailableLabel);
      setMessages(prev => {
        const updated = prev.map(m => m.id === assistantMsgId ? {
          ...m,
          text: errorText,
          suggestions: [],
          model: unavailableLabel,
          provider: error?.provider || 'NOVA AI',
          isError: true
        } : m);
        persistMessages(updated);
        return updated;
      });
    } finally {
      if (requestAbortControllerRef.current === requestController) {
        requestAbortControllerRef.current = null;
      }
    }
  }, [activeLang, inputQuery, loading, messages, selectedProvider, soundEffectsEnabled, stopSpeech, streamAssistantResponse, persistMessages]);

  // Voice Microphone Input
  const toggleVoiceInput = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      textareaRef.current?.focus();
      return;
    }

    if (isListening && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      setIsListening(false);
      return;
    }

    stopSpeech();
    setSpeechError(null);

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = getSpeechLocale(activeLang);

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };
      recognition.onresult = (e) => {
        const speechText = e.results[0][0].transcript;
        if (speechText) {
          setIsListening(false);
          executeUserQuery(speechText);
        }
      };
      recognition.onerror = (err) => {
        setIsListening(false);
        setSpeechError(err.error || 'Mic error');
        setTimeout(() => setSpeechError(null), 3500);
      };
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechError('Mic unavailable');
      setTimeout(() => setSpeechError(null), 3500);
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
      model: 'APOD quiz bank',
      provider: 'NASA APOD Quiz Module'
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

  // Check if conversation has any messages
  const hasConversation = messages.length > 0;

  return (
    <div 
      className={`w-full min-h-[640px] lg:min-h-[720px] bg-[#010409]/95 border border-cyan-500/30 rounded-2xl p-4 sm:p-6 shadow-[0_0_35px_rgba(6,182,212,0.18)] flex flex-col justify-between font-sans text-slate-100 backdrop-blur-2xl relative overflow-hidden hover:border-cyan-400/50 hover:shadow-[0_0_45px_rgba(6,182,212,0.28)] transition-all duration-300 ${className}`}
    >
      {/* Deep Space Background Ambient Glow Radiance */}
      <div className="absolute -top-36 -right-36 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-36 -left-36 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* TOP COMPACT HEADER BAR */}
      <div className="relative z-10 flex items-center justify-between gap-3 flex-wrap pb-3.5 border-b border-cyan-500/20">
        
        {/* Assistant Identity & Real-Time Connection Indicator */}
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1.5px] flex items-center justify-center shadow-lg shadow-cyan-950/50 shrink-0">
            <div className="w-full h-full bg-[#010409] rounded-[14px] flex items-center justify-center">
              <Bot className="w-5 h-5 text-cyan-400" />
            </div>
            {/* Live Connection Status Dot */}
            <span 
              className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${
                connectionState === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : connectionState === 'offline' || !isOnline || connectionState === 'error'
                  ? 'bg-rose-500 ring-1 ring-rose-400'
                  : connectionState === 'ready'
                  ? 'bg-slate-400'
                  : 'bg-emerald-400 animate-pulse ring-1 ring-emerald-300/50'
              }`}
              title={
                connectionState === 'connecting' ? 'Transmitting Query' :
                connectionState === 'offline' || !isOnline ? 'Offline Guard Engine' :
                connectionState === 'error' ? 'NOVA provider request failed' :
                connectionState === 'ready' ? 'Ready to connect' :
                'NOVA AI Online'
              }
            />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-['Orbitron'] font-bold text-base sm:text-lg text-white tracking-wide">
                NOVA - NASA Mission Control AI
              </h3>
              
              {/* AI Engine Badge */}
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                {activeLang === 'si' ? 'දේශීය • Gemini • OpenRouter' : activeLang === 'ta' ? 'உள்ளூர் • Gemini • OpenRouter' : 'Local • Gemini • OpenRouter'}
              </span>

              {/* Verified Online/Connecting State Badge */}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono flex items-center gap-1.5 ${
                connectionState === 'connecting'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : connectionState === 'offline' || !isOnline || connectionState === 'error'
                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  : connectionState === 'ready'
                  ? 'bg-slate-500/15 text-slate-300 border border-slate-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  connectionState === 'connecting' ? 'bg-amber-400 animate-spin' :
                  connectionState === 'offline' || !isOnline || connectionState === 'error' ? 'bg-rose-400' :
                  connectionState === 'ready' ? 'bg-slate-400' :
                  'bg-emerald-400'
                }`} />
                <span>
                  {connectionState === 'connecting' 
                    ? (activeLang === 'si' ? 'සම්ප්‍රේෂණය වෙමින්...' : activeLang === 'ta' ? 'இணைக்கிறது...' : 'Connecting...') 
                    : connectionState === 'offline' || !isOnline
                    ? (activeLang === 'si' ? 'Offline Guard' : activeLang === 'ta' ? 'ஆஃப்லைன் பயன்முறை' : 'Offline Guard')
                    : connectionState === 'error'
                    ? (activeLang === 'si' ? 'AI සේවාව තාවකාලිකව අසාර්ථකයි' : activeLang === 'ta' ? 'AI சேவை தற்காலிகமாகக் கிடைக்கவில்லை' : 'AI temporarily unavailable')
                    : connectionState === 'ready'
                    ? (activeLang === 'si' ? 'සම්බන්ධ වීමට සූදානම්' : activeLang === 'ta' ? 'இணைக்கத் தயார்' : 'Ready to connect')
                    : (activeLang === 'si' ? 'දේශීය • Gemini • OpenRouter' : activeLang === 'ta' ? 'உள்ளூர் • Gemini • OpenRouter' : 'Local • Gemini • OpenRouter')}
                </span>
              </span>

              {/* Language Pill */}
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/15 border border-purple-500/30 text-purple-300 uppercase">
                {activeLang === 'si' ? '🇱🇰 සිංහල' : activeLang === 'ta' ? '🇮🇳 தமிழ்' : '🇬🇧 EN'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
              {activeLang === 'si' ? 'අභ්‍යවකාශ සහායක • දේශීය එන්ජිම, Gemini සහ OpenRouter' :
               activeLang === 'ta' ? 'விண்வெளி உதவியாளர் • உள்ளூர் இயந்திரம், Gemini மற்றும் OpenRouter' :
               'Space Assistant • Local Engine, Gemini & OpenRouter'}
            </p>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-1.5 text-xs font-mono flex-wrap">

          {/* Engine selector; keys are configured server-side and never entered in the browser. */}
          <label
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-slate-300"
            title={activeLang === 'si'
              ? 'Gemini සහ OpenRouter API යතුරු සේවාදායකයේ ආරක්ෂිතව සකසන්න.'
              : activeLang === 'ta'
              ? 'Gemini மற்றும் OpenRouter API சாவிகளை சேவையகத்தில் பாதுகாப்பாக அமைக்கவும்.'
              : 'Provider API keys are configured securely on the server.'}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <select
              aria-label={activeLang === 'si' ? 'NOVA AI එන්ජිම තෝරන්න' : activeLang === 'ta' ? 'NOVA AI இயந்திரத்தைத் தேர்ந்தெடுக்கவும்' : 'Choose NOVA AI engine'}
              value={selectedProvider}
              disabled={loading || Boolean(streamingMessageId)}
              onChange={(event) => {
                const nextProvider = event.target.value;
                setSelectedProvider(nextProvider);
                try { localStorage.setItem(NOVA_PROVIDER_STORAGE_KEY, nextProvider); } catch {}
              }}
              className="max-w-[170px] bg-transparent text-[11px] font-semibold text-cyan-100 outline-none cursor-pointer disabled:cursor-not-allowed"
            >
              <option value="auto">{activeLang === 'si' ? 'ස්වයංක්‍රීය' : activeLang === 'ta' ? 'தானியங்கி' : 'Auto (OpenRouter → Gemini → Local)'}</option>
              <option value="local">{activeLang === 'si' ? 'දේශීය අභ්‍යවකාශ එන්ජිම' : activeLang === 'ta' ? 'உள்ளூர் விண்வெளி இயந்திரம்' : 'Local Space Engine'}</option>
              <option value="gemini" disabled={providerAvailability.gemini === false}>
                Gemini{providerAvailability.gemini === false
                  ? (activeLang === 'si' ? ' · යතුර සකසා නැත' : activeLang === 'ta' ? ' · சாவி அமைக்கப்படவில்லை' : ' · key not configured')
                  : ' API'}
              </option>
              <option value="openrouter" disabled={providerAvailability.openrouter === false}>
                OpenRouter{providerAvailability.openrouter === false
                  ? (activeLang === 'si' ? ' · යතුර සකසා නැත' : activeLang === 'ta' ? ' · சாவி அமைக்கப்படவில்லை' : ' · key not configured')
                  : ' API'}
              </option>
            </select>
          </label>

          {/* New Chat Button */}
          <button
            type="button"
            onClick={handleStartNewChat}
            className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
            title="Start a fresh conversation thread"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-semibold hidden sm:inline">
              {activeLang === 'si' ? 'නව සංවාදය' : activeLang === 'ta' ? 'புதிய அரட்டை' : 'New Chat'}
            </span>
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

          {/* Gemini Live Real-Time Bidi Voice Comms Button */}
          <button
            type="button"
            onClick={() => setIsLiveVoiceOpen(true)}
            className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600/30 to-blue-600/30 border border-cyan-500/50 hover:border-cyan-400 text-cyan-200 text-xs flex items-center gap-1.5 transition cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:scale-[1.02] active:scale-95"
            title="Connect to Gemini Live Bidi-Streaming Voice Channel (16kHz In / 24kHz Out)"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="text-[11px] font-semibold hidden sm:inline">
              {activeLang === 'si' ? 'සජීවී හඬ' : activeLang === 'ta' ? 'நேரலை குரல்' : 'Live Voice'}
            </span>
          </button>

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

          {/* Clear History Button */}
          {hasConversation && (
            <button
              type="button"
              onClick={handleStartNewChat}
              className="p-2 rounded-xl bg-slate-900/80 border border-slate-700 hover:border-rose-500/50 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              title="Clear current conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* QUICK TOPIC STRIP */}
      {hasConversation && (
        <div className="relative z-10 py-2.5 flex items-center gap-2 overflow-x-auto select-none scrollbar-none border-b border-slate-800/50">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 pl-1">
            <Compass className="w-3 h-3 text-cyan-400" />
            {activeLang === 'si' ? 'මාතෘකා:' : activeLang === 'ta' ? 'தலைப்புகள்:' : 'Topics:'}
          </span>

          {WELCOME_SUGGESTION_CARDS.map((card) => {
            const label = card.title[activeLang] || card.title.en;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => executeUserQuery(card.prompt)}
                className="px-3 py-1 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-400/60 hover:bg-slate-800 text-[11px] font-mono text-slate-300 hover:text-cyan-200 whitespace-nowrap transition cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-sm shrink-0"
              >
                <card.icon className="w-3 h-3 text-cyan-400" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* MAIN CHAT CONVERSATION VIEW / WELCOME SCREEN */}
      <div 
        ref={chatScrollRef}
        className="relative z-10 flex-1 my-3 pr-1 space-y-4 overflow-y-auto max-h-[420px] sm:max-h-[480px] lg:max-h-[520px] scroll-smooth"
      >
        {/* ELEGANT WELCOME SCREEN (When No Conversation Exists) */}
        {!hasConversation ? (
          <div className="py-6 sm:py-8 px-2 sm:px-4 max-w-4xl mx-auto space-y-8 animate-fadeIn">
            
            {/* Mission Control Welcome Hero */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-semibold shadow-inner">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>NASA MISSION INTELLIGENCE CORE</span>
              </div>

              <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif tracking-tight text-white font-['Orbitron']">
                {activeLang === 'si' 
                  ? 'සාදරයෙන් පිළිගනිමු, අභ්‍යවකාශ ගවේෂකයාණනි' 
                  : activeLang === 'ta' 
                  ? 'விண்வெளி ஆய்வாளரே, நல்வரவு' 
                  : 'Welcome, Space Explorer'}
              </h2>

              <p className="text-xs sm:text-sm md:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed font-sans">
                {activeLang === 'si'
                  ? 'විශ්වය, නාසා මෙහෙයුම්, ග්‍රහලෝක, තාරකා, කළු කුහර සහ අභ්‍යවකාශ විද්‍යාව පිළිබඳ ඕනෑම පැනයක් විමසන්න.'
                  : activeLang === 'ta'
                  ? 'பிரபஞ்சம், நாசா திட்டங்கள், கோள்கள், விண்மீன்கள், கருந்துளைகள் மற்றும் விண்வெளி அறிவியல் பற்றி எதையும் கேளுங்கள்.'
                  : 'Ask me anything about the universe, NASA missions, planets, stars, black holes, and space science.'}
              </p>
            </div>

            {/* 6 Attractive Suggestion Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {WELCOME_SUGGESTION_CARDS.map((card) => {
                const IconComponent = card.icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => executeUserQuery(card.prompt)}
                    className="group p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/60 hover:shadow-[0_0_25px_rgba(34,211,238,0.18)] transition-all duration-300 text-left flex flex-col justify-between space-y-2 cursor-pointer active:scale-98"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-300 group-hover:scale-110 group-hover:bg-cyan-500/20 transition-all">
                        <IconComponent className="w-4 h-4 text-cyan-400" />
                      </div>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 group-hover:text-cyan-300 group-hover:border-cyan-500/30 transition">
                        {card.badge}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-cyan-200 transition font-['Orbitron']">
                        {card.title[activeLang] || card.title.en}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug line-clamp-2">
                        {card.desc[activeLang] || card.desc.en}
                      </p>
                    </div>

                    <div className="pt-1 flex items-center gap-1 text-[11px] font-mono text-cyan-400/80 group-hover:text-cyan-300 transition">
                      <span>{activeLang === 'si' ? 'විමසන්න' : activeLang === 'ta' ? 'கேளுங்கள்' : 'Explore'}</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quick Helper Tip */}
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-400 text-center">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {activeLang === 'si' 
                  ? 'ඉඟිය: හඬින් විමසීමට මයික්‍රෆෝනය ඔබන්න හෝ පහතින් ඔබේ පැනය ලියා යවන්න.' 
                  : activeLang === 'ta' 
                  ? 'குறிப்பு: குரல் மூலம் கேட்க மைக்ரோஃபோனை அழுத்தவும் அல்லது கீழே தட்டச்சு செய்யவும்.' 
                  : 'Tip: Click the microphone to speak or type your custom astrophysics query below.'}
              </span>
            </div>

          </div>
        ) : null}

        {/* ACTIVE CONVERSATION THREAD MESSAGES */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isStreaming = streamingMessageId === msg.id;
            const displayContent = isStreaming ? streamingText : msg.text;
            const isPlayingSpeech = speakingMessageId === msg.id;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar Badge */}
                <div 
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                    isUser 
                      ? 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 border border-blue-400/50 text-white shadow-blue-950/50' 
                      : 'bg-slate-950 border border-cyan-500/40 text-cyan-400 shadow-cyan-950/50'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Message Bubble Body */}
                <div 
                  className={`max-w-[92%] sm:max-w-[82%] rounded-2xl p-4 sm:p-5 shadow-2xl transition-all ${
                    isUser
                      ? 'bg-gradient-to-r from-blue-950/70 via-indigo-950/70 to-slate-950/90 border border-blue-500/40 text-blue-50 rounded-tr-none'
                      : msg.isError
                      ? 'bg-rose-950/35 border border-rose-500/40 text-rose-100 rounded-tl-none'
                      : 'bg-slate-950/90 border border-slate-800/90 text-slate-100 rounded-tl-none hover:border-cyan-500/40'
                  }`}
                >
                  {/* Bubble Meta Header */}
                  <div className="flex items-center justify-between gap-2 mb-2 text-[10px] font-mono text-slate-400 border-b border-slate-800/60 pb-1.5">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isUser ? 'bg-blue-400' : 'bg-cyan-400'}`} />
                      {isUser ? (activeLang === 'si' ? 'ගවේෂකයා (ඔබ)' : activeLang === 'ta' ? 'ஆய்வாளர் (நீங்கள்)' : 'Space Explorer') : (msg.provider || 'NOVA AI Assistant')}
                    </span>
                    
                    {!isUser && msg.model && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px] font-bold">
                        {msg.model}
                      </span>
                    )}
                  </div>

                  {!isUser && (msg.isError || msg.isFallback) && (
                    <div className={`mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-mono ${
                      msg.isError
                        ? 'bg-rose-500/10 text-rose-200 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-200 border border-amber-500/20'
                    }`}>
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>
                        {msg.isError
                          ? (activeLang === 'si' ? 'NOVA AI පිළිතුර ලබාගත නොහැකි විය. පහත Retry භාවිත කරන්න.' : activeLang === 'ta' ? 'NOVA AI பதில் கிடைக்கவில்லை. கீழே உள்ள Retry-ஐப் பயன்படுத்தவும்.' : 'NOVA could not get a provider response. Use Retry below.')
                          : (activeLang === 'si' ? 'මෙම පිළිතුර NOVA හි දේශීය අභ්‍යවකාශ දැනුම් එන්ජිමෙන් ලබාගත්තකි.' : activeLang === 'ta' ? 'இந்தப் பதில் NOVA-வின் உள்ளூர் விண்வெளி அறிவு இயந்திரத்திலிருந்து வழங்கப்பட்டது.' : 'Answered by NOVA’s built-in local space-knowledge engine.')}
                      </span>
                    </div>
                  )}

                  {/* Message Formatted Text Content */}
                  <div className="text-xs sm:text-sm font-sans select-text">
                    <FormattedMessageText text={displayContent} />
                    {isStreaming && (
                      <span className="inline-block w-2 h-4 ml-1.5 bg-cyan-400 animate-pulse align-middle" />
                    )}
                  </div>

                  {/* Assistant Footer Action Bar (Copy, TTS, Timestamp) */}
                  {!isUser && !isStreaming && msg.text && (
                    <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        
                        {/* Copy Message Button */}
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.text)}
                          className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-[11px] font-mono transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                          title="Copy message text"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        {/* TTS Voice Listen Button */}
                        {typeof window !== 'undefined' && 'speechSynthesis' in window && (
                          <button
                            type="button"
                            onClick={() => toggleSpeakMessage(msg.id, msg.text)}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-mono border transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 ${
                              isPlayingSpeech
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 animate-pulse'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                            }`}
                            title={isPlayingSpeech ? 'Stop Voice Synthesis' : 'Listen with Speech Synthesis Voice'}
                          >
                            {isPlayingSpeech ? <VolumeX className="w-3 h-3 text-cyan-400" /> : <Volume1 className="w-3 h-3" />}
                            <span>{isPlayingSpeech ? 'Stop' : 'Listen'}</span>
                          </button>
                        )}

                        {/* Retry Prompt Button */}
                        {lastSubmittedQuery && (
                          <button
                            type="button"
                            onClick={() => executeUserQuery(msg.queryText || lastSubmittedQuery)}
                            disabled={loading}
                            className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-[11px] font-mono transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                            title="Regenerate / Retry response"
                          >
                            <RotateCcw className="w-3 h-3 text-amber-400" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>

                      {/* Message Timestamp */}
                      <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}

                  {/* Follow-Up Suggestions Chips */}
                  {!isUser && !isStreaming && Array.isArray(msg.suggestions) && msg.suggestions.length > 0 && (
                    <div className="mt-3.5 pt-2.5 border-t border-slate-800/60 space-y-1.5">
                      <span className="text-[10px] font-mono text-cyan-400/90 flex items-center gap-1.5 font-semibold">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        {activeLang === 'si' ? 'යෝජිත පසු විපරම් ප්‍රශ්න:' :
                         activeLang === 'ta' ? 'பரிந்துரைக்கப்பட்ட தொடர் கேள்விகள்:' :
                         'Suggested Follow-Up Inquiries:'}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestions.map((sug, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            onClick={() => executeUserQuery(sug)}
                            className="px-3 py-1 rounded-xl bg-cyan-950/40 border border-cyan-800/50 hover:border-cyan-400 hover:bg-cyan-900/40 text-cyan-300 text-[11px] font-mono transition cursor-pointer text-left active:scale-95 shadow-sm flex items-center gap-1.5"
                          >
                            <ChevronRight className="w-3 h-3 text-cyan-400" />
                            <span>{sug}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* LOADING & TYPING GENERATION INDICATOR */}
        {loading && (
          <div className="flex items-start gap-3 animate-fadeIn">
            <div className="w-9 h-9 rounded-2xl bg-slate-950 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-950/50">
              <Bot className="w-4 h-4 animate-bounce text-cyan-400" />
            </div>
            <div className="rounded-2xl p-4 bg-slate-950/90 border border-cyan-500/30 text-cyan-300 flex items-center justify-between gap-4 text-xs font-mono shadow-2xl max-w-md">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse delay-75" />
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse delay-150" />
                </div>
                <span>
                  {activeLang === 'si' ? 'NOVA AI පිළිතුර සකස් කරමින්...' :
                   activeLang === 'ta' ? 'NOVA AI பதிலை உருவாக்குகிறது...' :
                   selectedProvider === 'local' ? 'Searching the local space-knowledge engine...' : 'NOVA is preparing a response with your selected provider...'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleStopGeneration}
                className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-rose-500 text-rose-400 hover:text-white text-[10px] transition cursor-pointer flex items-center gap-1"
                title="Cancel generation"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>Stop</span>
              </button>
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
                className="text-xs text-slate-400 hover:text-white font-mono cursor-pointer"
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

      {/* BOTTOM UPGRADED SMART CHAT COMPOSER */}
      <div className="relative z-10 pt-3 space-y-2 border-t border-slate-800/80">
        
        {/* Speech Error Notice */}
        {speechError && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-mono animate-fadeIn">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Voice error: {speechError}. Please check microphone permissions.</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeUserQuery();
          }}
          className="relative flex items-end gap-2 w-full"
        >
          {/* Natural Multiline Expanding Input */}
          <div className="relative flex-1 rounded-2xl bg-slate-950/90 border border-slate-800 focus-within:border-cyan-400/80 focus-within:ring-1 focus-within:ring-cyan-400/50 shadow-inner transition-all flex items-center">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  executeUserQuery();
                }
              }}
              placeholder={
                activeLang === 'si'
                  ? 'අභ්‍යවකාශය, ISS, ආටෙමිස්, ජේම්ස් වෙබ් හෝ කළු කුහර ගැන විමසන්න... (Shift+Enter නව පේළිය)'
                  : activeLang === 'ta'
                  ? 'விண்வெளி, ISS, ஆர்ட்டெமிஸ், ஜேம்ஸ் வெப் அல்லது கருந்துளைகள் பற்றிக் கேளுங்கள்... (Shift+Enter புதிய வரி)'
                  : 'Ask about Artemis, James Webb, Mars rovers, ISS, black holes... (Shift+Enter for new line)'
              }
              disabled={loading}
              className="w-full pl-4 pr-10 py-3 bg-transparent text-white placeholder-slate-400 text-xs sm:text-sm font-sans focus:outline-none resize-none max-h-36 overflow-y-auto disabled:opacity-50"
            />

            {/* Input Enter Icon Indicator */}
            {inputQuery.trim() && !loading && (
              <span className="absolute right-3 bottom-3 text-slate-500 pointer-events-none hidden sm:inline" title="Press Enter to send">
                <CornerDownLeft className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          {/* Voice Microphone Trigger Button */}
          {isSpeechSupported && (
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={loading}
              className={`p-3 rounded-2xl border transition cursor-pointer shrink-0 shadow-lg ${
                isListening
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-rose-950/50 ring-2 ring-rose-400 animate-pulse'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50'
              }`}
              title={isListening ? 'Stop Voice Recording' : `Speak in ${getSpeechLocale(activeLang)}`}
            >
              {isListening ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-cyan-400" />}
            </button>
          )}

          {/* Send or Stop Generation Button */}
          {loading || streamingMessageId ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              className="p-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-lg shadow-rose-600/30 cursor-pointer shrink-0 active:scale-95"
              title="Stop Generation"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputQuery.trim() || loading}
              className="p-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold disabled:opacity-40 transition shadow-lg shadow-cyan-500/30 cursor-pointer disabled:cursor-not-allowed shrink-0 active:scale-95"
              title="Send Query"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>

        {/* Footer Real-Time Telemetry Bar */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1 flex-wrap gap-2">
          <span className="flex items-center gap-1.5 text-cyan-300">
            <Zap className="w-3 h-3 text-cyan-400" />
            <span>AI Engine: {activeModel}</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              {activeLang === 'si' ? 'දේශීය • Gemini • OpenRouter' : activeLang === 'ta' ? 'உள்ளூர் • Gemini • OpenRouter' : 'Local • Gemini • OpenRouter'}
            </span>
          </span>
          <span className="text-slate-500">
            {isSpeechSupported 
              ? `Mic: ${getSpeechLocale(activeLang)} • Enter to transmit • Shift+Enter new line` 
              : 'Enter to transmit • Shift+Enter new line'}
          </span>
        </div>

      </div>

      {/* Gemini Live Real-Time Bidi Voice Comms Modal */}
      <GeminiLiveVoice
        lang={activeLang}
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
      />
    </div>
  );
}

export default memo(NasaAi);
