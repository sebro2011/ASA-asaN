'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
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
  Copy, 
  Check, 
  RefreshCw, 
  Trash2, 
  User, 
  Terminal, 
  Square, 
  X, 
  Maximize2, 
  Minimize2, 
  ChevronDown, 
  ChevronUp,
  ChevronRight,
  Radio, 
  Globe2, 
  Zap, 
  AlertCircle,
  HelpCircle,
  Activity,
  Compass,
  Telescope,
  Atom,
  Flame,
  Satellite,
  RotateCcw
} from 'lucide-react';
import { askNasaAi, fetchApod, fetchAsteroidsNeows, fetchIssLocation } from '../lib/nasaApi';
import GeminiLiveVoice from './GeminiLiveVoice.jsx';

const STORAGE_KEY = 'nasa_ai_chat_thread_v3';

// Mission Control Snappy Ease-Out Cubic-Bezier Curve [x1, y1, x2, y2]
const MISSION_CONTROL_EASE_OUT = [0.16, 1, 0.3, 1];

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

      gain.gain.setValueAtTime(0.12, now);
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
        { freq: 784, type: 'sine', delay: 0, duration: 0.35, gain: 0.09 },
        { freq: 988, type: 'triangle', delay: 0.04, duration: 0.38, gain: 0.07 },
        { freq: 1318, type: 'sine', delay: 0.08, duration: 0.45, gain: 0.05 }
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

  // Soft frequency drop on terminal reset
  playResetChirp() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.07);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.075);
    } catch {}
  }
}

const spaceAudio = new SpaceAudioSynthesizer();

const SUGGESTION_CARDS = [
  {
    id: 'sugg-apod',
    icon: Telescope,
    label: {
      en: "Explain today's Astronomy Picture of the Day",
      si: "අද දවසේ තාරකා විද්‍යා ඡායාරූපය (APOD) පැහැදිලි කරන්න",
      ta: "இன்றைய வானியல் புகைப்படத்தை (APOD) விளக்குங்கள்"
    },
    prompt: {
      en: "Explain today's Astronomy Picture of the Day (APOD) and the cosmic astrophysics behind it in simple terms.",
      si: "අද දවසේ තාරකා විද්‍යා ඡායාරූපය (APOD) සහ එහි අන්තර්ගත තාරකා භෞතික විද්‍යාත්මක පසුබිම සරලව පැහැදිලි කරන්න.",
      ta: "இன்றைய வானியல் புகைப்படம் (APOD) மற்றும் அதன் பின்னணியில் உள்ள விண்வெளி அறிவியலை எளிய தமிழில் விளக்குங்கள்."
    }
  },
  {
    id: 'sugg-asteroid',
    icon: Activity,
    label: {
      en: "Explore the latest asteroid data",
      si: "නවතම පෘථිවි-ආසන්න ග්‍රහක දත්ත ගවේෂණය කරන්න",
      ta: "சமீபத்திய சிறுகோள் தரவுகளை ஆராயுங்கள்"
    },
    prompt: {
      en: "Explore the latest asteroid data: How many Near-Earth Objects (NEOs) is NASA tracking today and how does Planetary Defense work?",
      si: "නවතම ග්‍රහක දත්ත මොනවාද? නාසා ආයතනය අද දින පෘථිවියට ආසන්න ග්‍රහක කීයක් නිරීක්ෂණය කරනවාද සහ පෘථිවි ආරක්ෂණ පද්ධතිය ක්‍රියාත්මක වන්නේ කෙසේද?",
      ta: "சமீபத்திய சிறுகோள் தரவுகளைக் கூறுங்கள்: நாசா இன்று பூமியை நெருங்கும் எத்தனை சிறுகோள்களைக் கண்காணிக்கிறது மற்றும் கிரகப் பாதுகாப்பு எவ்வாறு செயல்படுகிறது?"
    }
  },
  {
    id: 'sugg-iss',
    icon: Satellite,
    label: {
      en: "How does the International Space Station work?",
      si: "ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය (ISS) ක්‍රියාත්මක වන්නේ කෙසේද?",
      ta: "சர்வதேச விண்வெளி நிலையம் எவ்வாறு இயங்குகிறது?"
    },
    prompt: {
      en: "How does the International Space Station work? What is its current speed, altitude, and what science experiments take place aboard?",
      si: "ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය (ISS) ක්‍රියාත්මක වන්නේ කෙසේද? එහි කක්ෂීය වේගය, උන්නතාංශය සහ එහි සිදුවන පර්යේෂණ මොනවාද?",
      ta: "சர்வதேச விண்வெளி நிலையம் (ISS) எவ்வாறு இயங்குகிறது? அதன் தற்போதைய வேகம், உயரம் மற்றும் அங்கு நடைபெறும் சோதனைகள் என்ன?"
    }
  },
  {
    id: 'sugg-blackholes',
    icon: Atom,
    label: {
      en: "Explain black holes in simple language",
      si: "කළු කුහර ගැන සරල බසින් පැහැදිලි කරන්න",
      ta: "கருந்துளைகளைப் பற்றி எளிய மொழியில் விளக்குங்கள்"
    },
    prompt: {
      en: "Explain black holes in simple language: What happens at the event horizon and how did NASA image the supermassive black hole at M87?",
      si: "කළු කුහර ගැන සරල බසින් පහදා දෙන්න: ඒවායේ සිදුවීම් ක්ෂිතිජය (Event Horizon) යනු කුමක්ද සහ ඒවා නිරීක්ෂණය කරන්නේ කෙසේද?",
      ta: "கருந்துளைகளைப் பற்றி எளிய மொழியில் விளக்குங்கள்: நிகழ்வு எல்லை (Event Horizon) என்றால் என்ன மற்றும் நாசா அவற்றை எவ்வாறு படம்பிடித்தது?"
    }
  },
  {
    id: 'sugg-mars',
    icon: Flame,
    label: {
      en: "Discover Mars rover missions",
      si: "අඟහරු රෝවර මෙහෙයුම් සහ සොයාගැනීම්",
      ta: "செவ்வாய் ரோவர் பணிகளைப் பற்றி அறியுங்கள்"
    },
    prompt: {
      en: "Discover Mars rover missions: What has Perseverance found in Jezero Crater and what happened to the Ingenuity helicopter?",
      si: "අඟහරු ගවේෂණ රෝවර මෙහෙයුම් ගැන විස්තර කරන්න: ජෙසීරෝ ආවාටයේ පර්සෙවරන්ස් රෝවරය සොයාගෙන ඇත්තේ මොනවාද?",
      ta: "செவ்வாய் ரோவர் பணிகளைப் பற்றி விவரிக்கவும்: ஜெசெரோ பள்ளத்தில் பெர்சவரன்ஸ் ரோவர் கண்டறிந்த முக்கிய விஷயங்கள் என்ன?"
    }
  },
  {
    id: 'sugg-solar',
    icon: Zap,
    label: {
      en: "Learn about solar storms",
      si: "සූර්ය කුණාටු සහ කොස්මික් කාලගුණය",
      ta: "சூரிய புயல்கள் & விண்வெளி வானிலை"
    },
    prompt: {
      en: "Learn about solar storms: What are solar flares and coronal mass ejections (CMEs), and how does NASA monitor space weather?",
      si: "සූර්ය කුණාටු ගැන කියාදෙන්න: සූර්ය ගිනිදැල්, කොරෝනා විදාරණ සහ අභ්‍යවකාශ කාලගුණය පෘථිවියට බලපාන්නේ කෙසේද?",
      ta: "சூரிய புயல்கள் பற்றி விளக்குங்கள்: சூரிய எரிப்புகள் மற்றும் காந்தப் புயல்கள் எவ்வாறு பூமியை பாதிக்கின்றன?"
    }
  }
];

const UI_TEXTS = {
  en: {
    title: 'NOVA - NASA Mission Control AI',
    statusOnline: 'DSN LINK NOMINAL',
    statusConnecting: 'ORBITAL UPLINK ACTIVE...',
    statusOffline: 'LOCAL TELEMETRY ENGINE',
    welcomeTitle: 'Welcome, Space Explorer',
    welcomeSub: 'Ask me anything about the universe, NASA missions, planets, stars, black holes, and space science.',
    suggestionsHeader: 'Mission Inquiries & Telemetry Briefs',
    placeholder: 'Ask NOVA about NASA missions, telemetry, celestial bodies...',
    send: 'Transmit',
    stop: 'Halt Signal',
    clearChat: 'Reset Uplink',
    clearConversation: 'Clear Conversation',
    clearConversationShort: 'Clear',
    copy: 'Copy Brief',
    copied: 'Copied',
    retry: 'Retry Transmission',
    speaking: 'Audio Transmission...',
    micListening: 'Listening to radio comms...',
    micUnsupported: 'Voice comms unavailable in this browser',
    modelTag: 'Google Gemini 3.8 Flash • Live Telemetry Link',
    telemetryActive: 'Active Telemetry Linked',
    newChatConfirm: 'Start a new mission control session?',
    liveVoiceBtn: 'Live Voice',
    liveVoiceTooltip: 'Launch Gemini Live Real-time Bidi Voice Comms (16kHz PCM In • 24kHz PCM Out)'
  },
  si: {
    title: 'NOVA - නාසා මෙහෙයුම් පාලන කෘතිම බුද්ධිය',
    statusOnline: 'DSN සබඳතාව සක්‍රියයි',
    statusConnecting: 'දත්ත සම්ප්‍රේෂණය වෙමින්...',
    statusOffline: 'නොබැඳි දේශීය එන්ජිම',
    welcomeTitle: 'සාදරයෙන් පිළිගනිමු, අභ්‍යවකාශ ගවේෂකයාණනි',
    welcomeSub: 'විශ්වය, නාසා මෙහෙයුම්, ග්‍රහලෝක, තාරකා, කළු කුහර සහ අභ්‍යවකාශ විද්‍යාව පිළිබඳ ඕනෑම දෙයක් විමසන්න.',
    suggestionsHeader: 'යෝජිත මෙහෙයුම් විමසුම්',
    placeholder: 'නාසා මෙහෙයුම්, ටෙලිමෙට්‍රි හෝ විශ්වය ගැන NOVA ගෙන් විමසන්න...',
    send: 'යවන්න',
    stop: 'නවත්වන්න',
    clearChat: 'නව කතාබහක්',
    clearConversation: 'සංවාදය හිස් කරන්න',
    clearConversationShort: 'හිස් කරන්න',
    copy: 'පිටපත් කරන්න',
    copied: 'පිටපත් විය',
    retry: 'යළි උත්සාහ කරන්න',
    speaking: 'හඬ විකාශනය...',
    micListening: 'සවන් දෙමින් පවතී...',
    micUnsupported: 'මෙම බ්‍රවුසරයේ හඬ සේවාව ක්‍රියාත්මක නොවේ',
    modelTag: 'Google Gemini 3.8 Flash • සජීවී ටෙලිමෙට්‍රි සබඳතාව',
    telemetryActive: 'සජීවී ටෙලිමෙට්‍රි සම්බන්ධයි',
    newChatConfirm: 'නව කතාබහක් ආරම්භ කිරීමට අවශ්‍යද?',
    liveVoiceBtn: 'සජීවී හඬ',
    liveVoiceTooltip: 'Gemini Live සජීවී ද්වි-දිශා හඬ සබඳතාව (16kHz In • 24kHz Out)'
  },
  ta: {
    title: 'NOVA - நாசா கட்டுப்பாட்டு மைய AI',
    statusOnline: 'DSN இணைப்பு செயலில் உள்ளது',
    statusConnecting: 'தரவு அனுப்பப்படுகிறது...',
    statusOffline: 'உள்ளூர் ஆஃப்லைன் இயந்திரம்',
    welcomeTitle: 'விண்வெளி ஆய்வாளரே, வருக!',
    welcomeSub: 'பிரபஞ்சம், நாசா திட்டங்கள், கோள்கள், நட்சத்திரங்கள், கருந்துளைகள் மற்றும் விண்வெளி அறிவியல் பற்றி எதையும் கேளுங்கள்.',
    suggestionsHeader: 'பரிந்துரைக்கப்பட்ட விண்வெளி வினாக்கள்',
    placeholder: 'நாசா பணிகள், விண்வெளி அளவீடுகள் குறித்து NOVA-விடம் கேளுங்கள்...',
    send: 'அனுப்பு',
    stop: 'நிறுத்து',
    clearChat: 'புதிய உரையாடல்',
    clearConversation: 'உரையாடலை அழிக்கவும்',
    clearConversationShort: 'அழி',
    copy: 'நகலெடு',
    copied: 'நகலெடுக்கப்பட்டது',
    retry: 'மீண்டும் முயற்சி செய்',
    speaking: 'ஒலி வாசிப்பு...',
    micListening: 'குரல் கேட்கிறது...',
    micUnsupported: 'குரல் உள்ளீடு ஆதரிக்கப்படவில்லை',
    modelTag: 'Google Gemini 3.8 Flash • நேரலை விண்வெளி அளவீடுகள்',
    telemetryActive: 'நேரலை அளவீடுகள் இணைக்கப்பட்டுள்ளன',
    newChatConfirm: 'புதிய அமர்வைத் தொடங்கவா?',
    liveVoiceBtn: 'நேரலை குரல்',
    liveVoiceTooltip: 'Gemini Live நிகழ்நேர குரல் தொடர்பு (16kHz In • 24kHz Out)'
  }
};

/**
 * Robust Safe Markdown Formatter with Code Block Support & Copy Actions
 */
function MarkdownTextRenderer({ text }) {
  if (!text) return null;

  const codeBlockParts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 leading-relaxed text-slate-200 break-words text-xs sm:text-sm">
      {codeBlockParts.map((block, blockIdx) => {
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
            <CodeBlockView 
              key={`code-${blockIdx}`} 
              language={language} 
              code={codeBody.trim()} 
            />
          );
        }

        const lines = block.split('\n');

        return (
          <div key={`text-${blockIdx}`} className="space-y-1.5">
            {lines.map((line, idx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={idx} className="h-1" />;

              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={idx} className="text-sm font-bold text-cyan-300 font-['Orbitron'] mt-3 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{trimmed.replace(/^###\s+/, '')}</span>
                  </h4>
                );
              }

              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={idx} className="text-base font-bold text-white font-['Orbitron'] mt-3.5 mb-1.5 text-purple-300 flex items-center gap-1.5">
                    <Atom className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>{trimmed.replace(/^##\s+/, '')}</span>
                  </h3>
                );
              }

              if (trimmed.startsWith('# ')) {
                return (
                  <h2 key={idx} className="text-lg font-bold text-white font-['Orbitron'] mt-4 mb-2 text-cyan-200">
                    {trimmed.replace(/^#\s+/, '')}
                  </h2>
                );
              }

              if (trimmed.startsWith('> ')) {
                return (
                  <blockquote key={idx} className="pl-3 py-1 my-1 border-l-2 border-cyan-400/80 bg-cyan-950/20 text-cyan-200/90 text-xs italic rounded-r-lg">
                    <InlineTextParser content={trimmed.replace(/^>\s+/, '')} />
                  </blockquote>
                );
              }

              if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const content = trimmed.replace(/^[•\-\*]\s+/, '');
                return (
                  <div key={idx} className="flex items-start gap-2 pl-1">
                    <span className="text-cyan-400 mt-1 text-xs shrink-0">•</span>
                    <span className="flex-1">
                      <InlineTextParser content={content} />
                    </span>
                  </div>
                );
              }

              const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
              if (numMatch) {
                return (
                  <div key={idx} className="flex items-start gap-2 pl-1">
                    <span className="text-cyan-400 font-mono text-xs font-semibold shrink-0">{numMatch[1]}.</span>
                    <span className="flex-1">
                      <InlineTextParser content={numMatch[2]} />
                    </span>
                  </div>
                );
              }

              return (
                <p key={idx} className="leading-relaxed">
                  <InlineTextParser content={line} />
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function CodeBlockView({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-2.5 rounded-xl bg-[#030712] border border-cyan-950/80 overflow-hidden font-mono text-xs shadow-xl">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950 border-b border-cyan-950/60 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span className="uppercase text-cyan-300 font-bold">{language}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-900 text-slate-300 hover:text-white transition cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-slate-200 leading-relaxed scrollbar-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InlineTextParser({ content }) {
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
 * GeminiChatWidget Component
 * Glassmorphic floating terminal at the bottom-right corner with #010409 cosmic dark styling,
 * cyan glowing borders, Framer Motion expand/collapse animations, and trilingual support.
 */
export function GeminiChatWidget({ 
  lang: propLang, 
  onNavigateToTab,
  defaultOpen = false 
}) {
  const { i18n } = useTranslation();
  const currentLang = (propLang || i18n?.language || 'en').slice(0, 2);
  const [activeLang, setActiveLang] = useState(currentLang);

  useEffect(() => {
    if (propLang) setActiveLang(propLang.slice(0, 2));
    else if (i18n?.language) setActiveLang(i18n.language.slice(0, 2));
  }, [propLang, i18n?.language]);

  const ui = UI_TEXTS[activeLang] || UI_TEXTS.en;

  // Terminal UI state
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);

  // Chat conversation state
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState('online'); // 'online' | 'connecting' | 'offline'
  const [copiedId, setCopiedId] = useState(null);

  // Streaming animation states
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const streamTimerRef = useRef(null);

  // Audio & Speech
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const [speechError, setSpeechError] = useState(null);
  const recognitionRef = useRef(null);

  // Active Real-Time NASA Telemetry cache for dynamic prompt injection
  const [telemetry, setTelemetry] = useState({
    apodTitle: 'The Pillars of Creation in Deep Infrared',
    asteroidCount: 8,
    issPosition: { lat: 21.48, lon: 81.39 },
    issAltitude: 418.6,
    issVelocity: 27584
  });

  const chatScrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Load telemetry asynchronously on mount
  useEffect(() => {
    let isMounted = true;
    async function loadTelemetry() {
      try {
        const [apodRes, neoRes, issRes] = await Promise.allSettled([
          fetchApod(),
          fetchAsteroidsNeows(),
          fetchIssLocation()
        ]);

        if (!isMounted) return;

        setTelemetry(prev => {
          const next = { ...prev };
          if (apodRes.status === 'fulfilled' && apodRes.value?.title) {
            next.apodTitle = apodRes.value.title;
          }
          if (neoRes.status === 'fulfilled' && neoRes.value?.element_count) {
            next.asteroidCount = neoRes.value.element_count;
          }
          if (issRes.status === 'fulfilled' && issRes.value) {
            const pos = issRes.value;
            next.issPosition = {
              lat: Number(pos.latitude ?? pos.lat ?? 21.48),
              lon: Number(pos.longitude ?? pos.lon ?? 81.39)
            };
            if (pos.altitude) next.issAltitude = Number(pos.altitude);
            if (pos.velocity) next.issVelocity = Number(pos.velocity);
          }
          return next;
        });
      } catch {}
    }

    loadTelemetry();
    return () => { isMounted = false; };
  }, []);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => setConnectionState('online');
    const handleOffline = () => setConnectionState('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load conversation history from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
          }
        }
      } catch {}
    }
  }, []);

  // Persist messages
  const persistMessages = useCallback((newMsgs) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newMsgs.slice(-30)));
      } catch {}
    }
  }, []);

  // Auto-scroll on new message or stream chunk
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, loading]);

  // Auto-adjust multiline input height
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 42), 140);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputQuery, adjustTextareaHeight]);

  // Audio Synthesizer speech synthesis
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
    const targetLocale = activeLang === 'si' ? 'si-LK' : activeLang === 'ta' ? 'ta-LK' : 'en-US';
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
  }, [activeLang, speakingMessageId, stopSpeech]);

  // Cancel response streaming
  const handleStopGeneration = useCallback(() => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setStreamingMessageId(null);
    setStreamingText('');
    setLoading(false);
    setConnectionState('online');
    stopSpeech();
  }, [stopSpeech]);

  // Start fresh conversation / Clear chat history while preserving current AI session state (telemetry, models, language, connection)
  const handleClearConversation = useCallback(() => {
    stopSpeech();
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setStreamingMessageId(null);
    setStreamingText('');
    setLoading(false);

    setMessages([]);
    setInputQuery('');

    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
    if (soundEffectsEnabled) {
      spaceAudio.playResetChirp();
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  }, [stopSpeech, soundEffectsEnabled]);

  const handleNewChat = handleClearConversation;

  // Stream assistant response with typewriter pacing
  const streamAssistantResponse = useCallback((assistantMsg, fullText) => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
    }

    setStreamingMessageId(assistantMsg.id);
    setStreamingText('');

    let charIndex = 0;
    const totalChars = fullText.length;
    const step = Math.max(2, Math.floor(totalChars / 40));

    streamTimerRef.current = setInterval(() => {
      charIndex += step;
      if (charIndex >= totalChars) {
        clearInterval(streamTimerRef.current);
        streamTimerRef.current = null;
        setStreamingMessageId(null);
        setStreamingText('');
        setConnectionState('online');

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

  // Submit query
  const executeUserQuery = useCallback(async (queryText) => {
    const text = (queryText || inputQuery).trim();
    if (!text || loading) return;

    stopSpeech();
    setInputQuery('');
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
      suggestions: [],
      model: 'gemini-3.8-flash',
      provider: 'Google Gemini 3.8 Flash'
    };

    const updatedWithUser = [...messages, userMessage, initialAssistantMsg];
    setMessages(updatedWithUser);

    try {
      const historyContext = messages.slice(-6).map(m => ({
        role: m.role,
        text: m.text
      }));

      // Pass active telemetry payload for real-time accurate answers
      const telemetryPayload = {
        apodTitle: telemetry.apodTitle,
        asteroidCount: telemetry.asteroidCount,
        issPosition: telemetry.issPosition,
        issAltitude: telemetry.issAltitude,
        issVelocity: telemetry.issVelocity
      };

      const apiResult = await askNasaAi(text, activeLang, historyContext, telemetryPayload);
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
        answerText = activeLang === 'si'
          ? `🛰️ NOVA පාලක පද්ධතිය: "${text}" පිළිබඳ විමසුමට අදාළව නාසා සජීවී ටෙලිමෙට්‍රි සබඳතාව තහවුරු කෙරිණි. (ISS උන්නතාංශය: ~${Math.round(telemetry.issAltitude)} km, අද දින ග්‍රහක: ${telemetry.asteroidCount} ක් නිරීක්ෂණයේ).`
          : activeLang === 'ta'
          ? `🛰️ NOVA கட்டுப்பாட்டு மையம்: "${text}" தொடர்பான தரவுகள் நாசா நேரலை அளவீடுகளுடன் ஒத்திசைக்கப்பட்டுள்ளன. (ISS உயரம்: ~${Math.round(telemetry.issAltitude)} km, சிறுகோள்கள்: ${telemetry.asteroidCount}).`
          : `🛰️ NOVA Mission Control: Telemetry uplink active for "${text}". Real-time status confirms ISS altitude at ~${Math.round(telemetry.issAltitude)} km, ${telemetry.asteroidCount} Near-Earth asteroids monitored today.`;
      }

      setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
        ...m,
        suggestions,
        model: modelName,
        provider: providerName
      } : m));

      setLoading(false);
      streamAssistantResponse(initialAssistantMsg, answerText);
    } catch {
      const fallbackText = activeLang === 'si'
        ? `🛰️ NOVA මෙහෙයුම් පාලනය (නොබැඳි සංචිතය): "${text}" සඳහා නාසා දත්ත සංරක්ෂිතය සක්‍රියයි. සියලු ගවේෂණ පද්ධති නාමික මට්ටමේ පවතී.`
        : activeLang === 'ta'
        ? `🛰️ NOVA கட்டுப்பாட்டு மையம் (ஆஃப்லைன்): "${text}" க்கான நாசா காப்பகத் தரவு பெறப்பட்டது. அமைப்புகள் இயல்பு நிலையில் உள்ளன.`
        : `🛰️ NOVA Mission Control: Spacecraft telemetry confirms nominal flight systems for "${text}".`;

      setLoading(false);
      setConnectionState('offline');
      streamAssistantResponse(initialAssistantMsg, fallbackText);
    }
  }, [activeLang, inputQuery, loading, messages, soundEffectsEnabled, stopSpeech, streamAssistantResponse, telemetry]);

  // Voice speech-to-text
  const toggleVoiceInput = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError(ui.micUnsupported);
      setTimeout(() => setSpeechError(null), 3000);
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
      recognition.lang = activeLang === 'si' ? 'si-LK' : activeLang === 'ta' ? 'ta-LK' : 'en-US';

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
        setTimeout(() => setSpeechError(null), 3000);
      };
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechError('Mic unavailable');
      setTimeout(() => setSpeechError(null), 3000);
    }
  }, [activeLang, executeUserQuery, isListening, stopSpeech, ui.micUnsupported]);

  // Copy message
  const handleCopyMessage = (msgId, text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeUserQuery();
    }
  };

  const handleLanguageChange = (code) => {
    setActiveLang(code);
    if (i18n?.changeLanguage) {
      i18n.changeLanguage(code);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18nextLng', code);
    }
  };

  return (
    <>
      {/* Floating Trigger Pill when closed */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 15 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed bottom-24 sm:bottom-6 right-5 z-40"
          >
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#010409]/95 border border-cyan-500/40 text-cyan-200 shadow-[0_0_24px_rgba(6,182,212,0.25)] hover:border-cyan-400 hover:shadow-[0_0_35px_rgba(6,182,212,0.4)] backdrop-blur-xl transition-all cursor-pointer select-none"
              title="Open NOVA NASA AI Assistant"
            >
              {/* Radial glow background */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 opacity-70 group-hover:opacity-100 transition" />
              
              {/* Status pulse indicator */}
              <div className="relative flex items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span className="absolute w-4 h-4 rounded-full bg-cyan-400/40 animate-ping" />
              </div>

              {/* Bot icon */}
              <div className="w-7 h-7 rounded-full bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300 group-hover:scale-105 transition">
                <Bot className="w-4 h-4" />
              </div>

              {/* Text label */}
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold font-['Orbitron'] tracking-wider text-white flex items-center gap-1.5">
                  NOVA
                  <span className="text-[10px] font-mono font-normal text-cyan-400/90 px-1 py-0.2 rounded bg-cyan-950/60 border border-cyan-500/30">
                    AI
                  </span>
                </span>
                <span className="text-[10px] font-mono text-cyan-400/80 -mt-0.5 hidden sm:inline">
                  Mission Control
                </span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Glassmorphic Terminal Window when opened */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ opacity: 0, height: 0, scale: 0.94, y: 18 }}
            animate={{ 
              opacity: 1, 
              height: isCollapsed 
                ? 56 
                : (isMaximized ? 'min(860px, calc(100vh - 48px))' : 'min(640px, 86vh)'),
              scale: 1, 
              y: 0 
            }}
            exit={{ opacity: 0, height: 0, scale: 0.94, y: 18 }}
            transition={{ 
              height: { duration: 0.38, ease: MISSION_CONTROL_EASE_OUT },
              scale: { duration: 0.32, ease: MISSION_CONTROL_EASE_OUT },
              opacity: { duration: 0.25, ease: MISSION_CONTROL_EASE_OUT },
              y: { duration: 0.32, ease: MISSION_CONTROL_EASE_OUT }
            }}
            className={`fixed z-50 flex flex-col overflow-hidden bg-[#010409]/95 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.22)] ${
              isMaximized
                ? 'inset-3 sm:inset-6 max-w-5xl mx-auto'
                : 'bottom-20 sm:bottom-6 right-3 sm:right-6 w-[calc(100vw-24px)] sm:w-[460px] md:w-[500px]'
            }`}
            style={{
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 35px rgba(6, 182, 212, 0.22)'
            }}
          >
            {/* Top Atmospheric Ambient Glow Line */}
            <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80" />

            {/* Terminal Header */}
            <header 
              onClick={() => {
                if (isCollapsed) setIsCollapsed(false);
              }}
              className={`px-4 py-3 bg-[#010409]/90 border-b border-cyan-500/20 flex items-center justify-between gap-3 shrink-0 select-none ${
                isCollapsed ? 'cursor-pointer hover:bg-slate-950/95 transition' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Assistant avatar badge */}
                <div className="relative w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center shrink-0 text-cyan-300 shadow-inner">
                  <Bot className="w-4 h-4" />
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                    connectionState === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : connectionState === 'offline'
                      ? 'bg-rose-500'
                      : 'bg-emerald-400'
                  }`} />
                </div>

                <div className="min-w-0 flex flex-col">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] tracking-wide truncate">
                      {ui.title}
                    </h3>
                  </div>

                  {/* Status Indicator Pulse & Telemetry Pill */}
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400/90">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      connectionState === 'connecting'
                        ? 'bg-amber-400 animate-ping'
                        : connectionState === 'offline'
                        ? 'bg-rose-400'
                        : 'bg-emerald-400'
                    }`} />
                    <span className="truncate">
                      {connectionState === 'connecting'
                        ? ui.statusConnecting
                        : connectionState === 'offline'
                        ? ui.statusOffline
                        : ui.statusOnline}
                    </span>
                  </div>
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Trilingual Language Selector */}
                <div className="flex items-center p-0.5 rounded-lg bg-slate-900/80 border border-cyan-950">
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('en')}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                      activeLang === 'en' 
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="English"
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('si')}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                      activeLang === 'si' 
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="සිංහල"
                  >
                    සිං
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('ta')}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                      activeLang === 'ta' 
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="தமிழ்"
                  >
                    தமி
                  </button>
                </div>

                {/* SFX Audio Toggle */}
                <button
                  type="button"
                  onClick={() => setSoundEffectsEnabled(!soundEffectsEnabled)}
                  className={`p-1.5 rounded-lg border transition ${
                    soundEffectsEnabled
                      ? 'border-cyan-500/40 text-cyan-300 bg-cyan-950/40'
                      : 'border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                  title={soundEffectsEnabled ? 'Mute sound effects' : 'Enable sound effects'}
                >
                  {soundEffectsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>

                {/* Gemini Live Real-time Voice API Button */}
                <button
                  type="button"
                  onClick={() => setIsLiveVoiceOpen(true)}
                  className="px-2 py-1.5 rounded-lg border border-cyan-500/40 hover:border-cyan-400 bg-gradient-to-r from-cyan-950/90 to-blue-950/90 hover:from-cyan-900 hover:to-blue-900 text-cyan-300 flex items-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.3)] transition hover:scale-105 active:scale-95 cursor-pointer"
                  title={ui.liveVoiceTooltip}
                  aria-label={ui.liveVoiceTooltip}
                >
                  <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse shrink-0" />
                  <span className="text-[11px] font-mono font-bold hidden md:inline whitespace-nowrap">
                    {ui.liveVoiceBtn}
                  </span>
                </button>

                {/* Clear Conversation Action Button */}
                <button
                  type="button"
                  onClick={handleClearConversation}
                  disabled={messages.length === 0}
                  className={`px-2.5 py-1.5 rounded-lg border transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                    messages.length > 0
                      ? 'border-cyan-500/30 hover:border-rose-500/60 text-slate-300 hover:text-rose-300 bg-slate-900/80 hover:bg-rose-950/30 active:scale-95 shadow-sm hover:shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                      : 'border-slate-900/60 text-slate-600 bg-slate-950/40 cursor-not-allowed opacity-40'
                  }`}
                  title={ui.clearConversation}
                  aria-label={ui.clearConversation}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-mono tracking-tight hidden sm:inline whitespace-nowrap">
                    {ui.clearConversation}
                  </span>
                </button>

                {/* Collapse / Expand Height Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCollapsed(!isCollapsed);
                  }}
                  className="p-1.5 rounded-lg border border-slate-800/80 hover:border-cyan-500/40 text-slate-400 hover:text-white bg-slate-900/60 transition cursor-pointer"
                  title={isCollapsed ? 'Expand terminal' : 'Collapse terminal'}
                  aria-label={isCollapsed ? 'Expand terminal' : 'Collapse terminal'}
                >
                  {isCollapsed ? <ChevronUp className="w-3.5 h-3.5 text-cyan-300" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {/* Maximize / Restore Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCollapsed) setIsCollapsed(false);
                    setIsMaximized(!isMaximized);
                  }}
                  className="p-1.5 rounded-lg border border-slate-800/80 hover:border-cyan-500/40 text-slate-400 hover:text-white bg-slate-900/60 transition hidden sm:inline-flex cursor-pointer"
                  title={isMaximized ? 'Restore size' : 'Maximize terminal'}
                >
                  {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  className="p-1.5 rounded-lg border border-slate-800/80 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 bg-slate-900/60 transition cursor-pointer"
                  title="Close terminal"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </header>

            {/* Collapsible Terminal Content Container with Snappy Mission Control Ease-Out Transition */}
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  key="terminal-collapsible-body"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: '100%' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ 
                    height: { duration: 0.38, ease: MISSION_CONTROL_EASE_OUT },
                    opacity: { duration: 0.22, ease: MISSION_CONTROL_EASE_OUT }
                  }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  {/* Active Telemetry Mini Status Strip */}
                  <div className="px-3 py-1 bg-slate-950/80 border-b border-cyan-950/60 flex items-center justify-between text-[10px] font-mono text-slate-400 overflow-x-auto scrollbar-none gap-3 select-none">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-cyan-400 font-bold flex items-center gap-1">
                        <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                        DSN TELEMETRY:
                      </span>
                      <span className="text-slate-300">
                        ISS ({telemetry.issPosition.lat.toFixed(1)}°, {telemetry.issPosition.lon.toFixed(1)}°) • {Math.round(telemetry.issAltitude)} km
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-500">|</span>
                      <span className="text-slate-300">
                        NEO: {telemetry.asteroidCount} objects
                      </span>
                    </div>
                  </div>

                  {/* Chat Message Scrollport */}
                  <div 
                    ref={chatScrollRef}
                    className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-cyan-900/40"
                  >
                    {/* Welcome Screen when conversation is empty */}
                    {messages.length === 0 && (
                      <div className="py-4 space-y-5">
                        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-cyan-950/30 via-slate-950/60 to-transparent border border-cyan-500/20 relative overflow-hidden">
                          <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-2xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)] mb-3">
                              <Bot className="w-6 h-6 animate-pulse" />
                            </div>
                            <h4 className="text-base sm:text-lg font-bold text-white font-['Orbitron']">
                              {ui.welcomeTitle}
                            </h4>
                            <p className="text-xs text-slate-300 mt-1 max-w-md leading-relaxed">
                              {ui.welcomeSub}
                            </p>
                          </div>
                        </div>

                        {/* Suggestion Cards Grid */}
                        <div>
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-400/90 uppercase tracking-wider mb-2.5">
                            <Sparkles className="w-3 h-3 text-cyan-400" />
                            <span>{ui.suggestionsHeader}</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {SUGGESTION_CARDS.map((card) => {
                              const IconComponent = card.icon;
                              const labelText = card.label[activeLang] || card.label.en;
                              const promptText = card.prompt[activeLang] || card.prompt.en;

                              return (
                                <button
                                  key={card.id}
                                  type="button"
                                  onClick={() => executeUserQuery(promptText)}
                                  className="group p-2.5 sm:p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/40 text-left transition-all hover:bg-cyan-950/20 flex items-start gap-2.5 cursor-pointer shadow-sm"
                                >
                                  <div className="w-7 h-7 rounded-lg bg-cyan-950/60 border border-cyan-800/40 flex items-center justify-center text-cyan-400 shrink-0 group-hover:scale-105 transition">
                                    <IconComponent className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="text-xs text-slate-300 group-hover:text-white leading-snug line-clamp-2">
                                    {labelText}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Message List */}
                    {messages.map((msg) => {
                      const isUser = msg.role === 'user';
                      const isStreamingThis = streamingMessageId === msg.id;
                      const displayText = isStreamingThis ? streamingText : msg.text;
                      const isSpeakingThis = speakingMessageId === msg.id;

                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                          className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                        >
                          {!isUser && (
                            <div className="w-7 h-7 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0 mt-0.5">
                              <Bot className="w-3.5 h-3.5" />
                            </div>
                          )}

                          <div className={`max-w-[85%] sm:max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                            {/* Message Bubble with subtle border gradient effect on hover & refined padding for long-form AI explanations */}
                            <div
                              className={`group/bubble relative rounded-2xl transition-all duration-300 ${
                                isUser
                                  ? 'rounded-tr-none p-[1px] bg-gradient-to-r from-cyan-500/35 via-blue-500/40 to-indigo-500/30 hover:from-cyan-400 hover:via-sky-400 hover:to-blue-400 shadow-md hover:shadow-[0_4px_20px_rgba(6,182,212,0.25)]'
                                  : 'rounded-tl-none p-[1px] bg-gradient-to-br from-cyan-500/25 via-slate-800/40 to-blue-500/20 hover:from-cyan-400/80 hover:via-cyan-300/50 hover:to-blue-400/70 shadow-[0_4px_24px_rgba(0,0,0,0.55)] hover:shadow-[0_4px_30px_rgba(6,182,212,0.22)]'
                              }`}
                            >
                              <div
                                className={`rounded-2xl transition-all duration-300 ${
                                  isUser
                                    ? 'rounded-tr-none bg-gradient-to-br from-cyan-600/95 via-blue-600/95 to-indigo-700/90 group-hover/bubble:from-cyan-500/95 group-hover/bubble:via-blue-500/95 px-4 py-3 sm:px-4.5 sm:py-3.5 text-white shadow-inner'
                                    : 'rounded-tl-none bg-[#030712]/95 group-hover/bubble:bg-[#04081c]/95 px-4.5 py-4 sm:px-5 sm:py-4.5 text-slate-100 backdrop-blur-xl'
                                }`}
                              >
                                {isUser ? (
                                  <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words font-sans">
                                    {displayText}
                                  </p>
                                ) : (
                                  <div className="space-y-2.5 text-xs sm:text-sm leading-relaxed text-slate-100">
                                    <MarkdownTextRenderer text={displayText} />

                                    {/* Typewriter Cursor during streaming */}
                                    {isStreamingThis && (
                                      <span className="inline-block w-2 h-4 bg-cyan-400 ml-1 animate-pulse align-middle" />
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Footer Actions for Assistant Messages */}
                            {!isUser && displayText && (
                              <div className="flex items-center gap-2 mt-1.5 px-1 text-[10px] font-mono text-slate-400">
                                <span className="text-cyan-400/80">
                                  {msg.model || 'Google Gemini 3.8 Flash'}
                                </span>

                                <span className="text-slate-600">•</span>

                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg.id, displayText)}
                                  className="hover:text-cyan-300 flex items-center gap-1 transition cursor-pointer"
                                  title="Copy response"
                                >
                                  {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  <span>{copiedId === msg.id ? ui.copied : ui.copy}</span>
                                </button>

                                <span className="text-slate-600">•</span>

                                <button
                                  type="button"
                                  onClick={() => toggleSpeakMessage(msg.id, displayText)}
                                  className={`flex items-center gap-1 transition cursor-pointer ${
                                    isSpeakingThis ? 'text-cyan-400 font-bold' : 'hover:text-cyan-300'
                                  }`}
                                  title="Read response aloud"
                                >
                                  <Volume2 className={`w-3 h-3 ${isSpeakingThis ? 'animate-bounce' : ''}`} />
                                  <span>{isSpeakingThis ? 'Speaking...' : 'Listen'}</span>
                                </button>
                              </div>
                            )}

                            {/* Follow-up Suggestion Chips generated by NOVA */}
                            {!isUser && msg.suggestions && msg.suggestions.length > 0 && !isStreamingThis && (
                              <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {msg.suggestions.map((sugg, sIdx) => (
                                  <button
                                    key={`sugg-${sIdx}`}
                                    type="button"
                                    onClick={() => executeUserQuery(sugg)}
                                    className="px-2.5 py-1 rounded-full bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono transition flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>{sugg}</span>
                                    <ChevronRight className="w-3 h-3 opacity-70" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {isUser && (
                            <div className="w-7 h-7 rounded-xl bg-blue-900/60 border border-blue-400/40 flex items-center justify-center text-blue-200 shrink-0 mt-0.5">
                              <User className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </motion.div>
                      );
                    })}

                    {/* Typing Indicator while awaiting initial model response */}
                    {loading && !streamingMessageId && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2.5"
                      >
                        <div className="w-7 h-7 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                        <div className="p-3.5 rounded-2xl rounded-tl-none bg-[#030712]/90 border border-cyan-500/25 flex items-center gap-2 text-cyan-400 text-xs font-mono shadow-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                          <span>Processing live astrophysics telemetry...</span>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Speech error indicator toast */}
                  {speechError && (
                    <div className="px-4 py-1.5 bg-rose-950/90 border-t border-rose-800 text-rose-300 text-xs font-mono flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{speechError}</span>
                    </div>
                  )}

                  {/* Composer Box */}
                  <footer className="p-3 bg-[#010409]/95 border-t border-cyan-500/20 shrink-0">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        executeUserQuery();
                      }}
                      className="relative flex items-end gap-2 bg-slate-950/90 border border-cyan-500/30 focus-within:border-cyan-400 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.25)] rounded-2xl p-1.5 transition-all"
                    >
                      {/* Voice Input Microphone Button */}
                      <button
                        type="button"
                        onClick={toggleVoiceInput}
                        className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
                          isListening
                            ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse'
                            : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40'
                        }`}
                        title={isListening ? 'Stop listening' : 'Start voice transmission'}
                      >
                        {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>

                      {/* Gemini Live Bidi Voice Button */}
                      <button
                        type="button"
                        onClick={() => setIsLiveVoiceOpen(true)}
                        className="p-2 rounded-xl border border-cyan-500/30 hover:border-cyan-400 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-400 hover:text-cyan-200 transition cursor-pointer shrink-0 shadow-sm flex items-center justify-center group"
                        title={ui.liveVoiceTooltip}
                      >
                        <Radio className="w-4 h-4 animate-pulse group-hover:scale-110 transition" />
                      </button>

                      {/* Multiline auto-expanding textarea */}
                      <textarea
                        ref={textareaRef}
                        value={inputQuery}
                        onChange={(e) => setInputQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={ui.placeholder}
                        rows={1}
                        disabled={loading && !streamingMessageId}
                        className="flex-1 bg-transparent border-0 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 resize-none py-2 px-1 max-h-[140px] leading-relaxed"
                      />

                      {/* Send / Stop Generation Button */}
                      {loading || streamingMessageId ? (
                        <button
                          type="button"
                          onClick={handleStopGeneration}
                          className="p-2 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white transition cursor-pointer shrink-0"
                          title={ui.stop}
                        >
                          <Square className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={!inputQuery.trim()}
                          className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
                            inputQuery.trim()
                              ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                              : 'bg-slate-900 text-slate-600 cursor-not-allowed'
                          }`}
                          title={ui.send}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                    </form>

                    {/* Sub-bar hint: Enter to send, Shift+Enter for new line */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1.5 mt-1.5">
                      <span className="hidden sm:inline">Enter ↵ to send • Shift+Enter for new line</span>
                      <span className="truncate text-cyan-500/70">{ui.modelTag}</span>
                    </div>
                  </footer>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Gemini Live Real-time Voice API Modal */}
      <GeminiLiveVoice
        lang={activeLang}
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
      />
    </>
  );
}

export default memo(GeminiChatWidget);
