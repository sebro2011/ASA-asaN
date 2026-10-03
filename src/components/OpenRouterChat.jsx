'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Bot, 
  Send, 
  User, 
  Sparkles, 
  RotateCw, 
  Copy, 
  Check, 
  Trash2, 
  Cpu, 
  Radio, 
  Globe2, 
  Rocket, 
  AlertCircle,
  HelpCircle,
  ChevronDown,
  Volume2,
  VolumeX,
  Zap,
  ShieldCheck
} from 'lucide-react';
import { generateLocalSpaceResponse } from '../utils/spaceLocalAiEngine.js';

/**
 * Lightweight Web Audio API synthesizer for sci-fi UI feedback
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

  // Subtle high-pitch laser click on message send (quick sweep 1350Hz -> 380Hz)
  playSendLaser() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1350, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.075);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio policy ignored
    }
  }

  // Futuristic celestial harmonic chime when AI response arrives (multitone chord)
  playReceiveChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Harmonic celestial chord: F#5 (740 Hz), B5 (988 Hz), D#6 (1245 Hz)
      const tones = [
        { freq: 740, type: 'sine', delay: 0, duration: 0.35, gain: 0.12 },
        { freq: 988, type: 'triangle', delay: 0.04, duration: 0.38, gain: 0.10 },
        { freq: 1245, type: 'sine', delay: 0.08, duration: 0.42, gain: 0.08 }
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
    } catch {
      // Audio policy ignored
    }
  }
}

const spaceAudio = new SpaceAudioSynthesizer();

const AVAILABLE_MODELS = [
  {
    id: 'nasa-local-core',
    name: 'NASA Local AI Engine',
    tag: 'STANDALONE • ZERO LATENCY',
    badgeColor: 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10',
    description: 'Built-in local neural engine with full NASA telemetry, zero API key required'
  },
  {
    id: 'deep-space-cosmology',
    name: 'Cosmology & Missions Core',
    tag: 'BUILT-IN',
    badgeColor: 'border-purple-500/40 text-purple-300 bg-purple-500/10',
    description: 'Specialized for JWST, Artemis, Black Holes, and Exoplanet Habitability'
  },
  {
    id: 'orbital-flight-telemetry',
    name: 'Orbital & Planetary Flight',
    tag: 'KEYLESS',
    badgeColor: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
    description: 'ISS tracking, Mars Rovers (Perseverance), and Asteroid Defense (DART/NeoWs)'
  }
];

const STARTER_PROMPTS = [
  {
    en: 'What is the orbital speed and altitude of the ISS?',
    si: 'ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානයේ (ISS) වේගය කොපමණද?',
    ta: 'சர்வதேச விண்வெளி நிலையத்தின் (ISS) வேகம் என்ன?'
  },
  {
    en: 'What are Perseverance and Curiosity doing on Mars?',
    si: 'අඟහරු මත Perseverance රෝවරය කරන්නේ කුමක්ද?',
    ta: 'செவ்வாய் கிரகத்தில் பெர்சிவரன்ஸ் ரோவர் என்ன செய்கிறது?'
  },
  {
    en: 'How does the James Webb Telescope detect early galaxies?',
    si: 'ජේම්ස් වෙබ් දුරේක්ෂය මුල්ම මන්දාකිණි දකින්නේ කෙසේද?',
    ta: 'ஜேம்ஸ் வெப் தொலைநோக்கி ஆரம்பகால விண்மீன்களை எவ்வாறு காண்கிறது?'
  },
  {
    en: 'What is the flight plan for NASA Artemis to return humans to the Moon?',
    si: 'නාසා ආටෙමිස් මෙහෙයුම මඟින් මිනිසුන් නැවත සඳට යවන්නේ කෙසේද?',
    ta: 'நாசா ஆர்ட்டெமிஸ் திட்டத்தின் மூலம் மனிதர்களை நிலவுக்கு அனுப்பும் திட்டம் என்ன?'
  }
];

/**
 * OpenRouterChat - Standalone Local NASA Astrophysics AI Assistant Component
 * Zero external API dependencies, 100% keyless local inference.
 */
export default function OpenRouterChat({ className = '', onClose = () => {} }) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);

  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [messages, setMessages] = useState([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content: currentLang === 'si'
        ? 'ආයුබෝවන්! මම නාසා තාරකා භෞතික විද්‍යා දේශීය AI සහකරු වෙමි. ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය (ISS), අඟහරු රෝවර, ජේම්ස් වෙබ් දුරේක්ෂය, ආටෙමිස් මෙහෙයුම හෝ බාහිර ග්‍රහලෝක පිළිබඳව සිංහල, දෙමළ හෝ ඉංග්‍රීසි බසින් මාගෙන් විමසන්න. (Zero API Key Needed • 100% Standalone)'
        : currentLang === 'ta'
        ? 'வணக்கம்! நான் நாசா விண்வெளி ஆராய்ச்சி உள்ளூர் AI உதவியாளர். சர்வதேச விண்வெளி நிலையம் (ISS), செவ்வாய் ரோவர்கள், ஜேம்ஸ் வெப் தொலைநோக்கி, ஆர்ட்டெமிஸ் அல்லது புறக்கோள்கள் பற்றி தமிழ், சிங்களம் அல்லது ஆங்கிலத்தில் என்னிடம் கேளுங்கள்.'
        : 'Greetings! I am your NASA Astrophysics and Space Exploration Local AI Assistant. Ask me anything about the ISS, Mars Rovers, James Webb Space Telescope, Artemis Moon Missions, or Exoplanets in English, Sinhala, or Tamil. (Zero API Keys Needed • 100% Standalone)',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: [
        currentLang === 'si' ? 'ISS කක්ෂය කොහොමද?' : currentLang === 'ta' ? 'ISS வேகம் என்ன?' : 'What is the ISS orbital speed?',
        currentLang === 'si' ? 'අඟහරු රෝවර මොනවාද?' : currentLang === 'ta' ? 'செவ்வாய் ரோவர் என்ன செய்கிறது?' : 'What is Perseverance doing on Mars?',
        currentLang === 'si' ? 'ජේම්ස් වෙබ් දුරේක්ෂය' : currentLang === 'ta' ? 'ஜேம்ஸ் வெப் தொலைநோக்கி' : 'How does James Webb see back in time?'
      ]
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Audio feedback toggle (persisted to localStorage)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nasa_chat_sound_enabled');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('nasa_chat_sound_enabled', String(next));
      }
      if (next) {
        spaceAudio.playSendLaser();
      }
      return next;
    });
  };

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Smooth scroll to bottom whenever messages update
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Copy message text to clipboard
  const handleCopy = (id, text) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Clear conversation history
  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: currentLang === 'si'
          ? 'සංවාද ඉතිහාසය පිරිසිදු කරන ලදී. නව තාරකා විද්‍යා ප්‍රශ්නයක් අසන්න.'
          : currentLang === 'ta'
          ? 'உரையாடல் அழிக்கப்பட்டது. புதிய வானியல் கேள்வியைக் கேட்கவும்.'
          : 'Telemetry reset. How can I assist your deep-space research today?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Send message using the built-in standalone keyless local space AI engine with fast typing simulation
  const sendMessage = async (customPrompt) => {
    const textToSend = (customPrompt || inputText).trim();
    if (!textToSend || isLoading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    if (soundEnabled) {
      spaceAudio.playSendLaser();
    }

    // Step 1: Generate immediate zero-latency local intelligence response
    const aiResult = generateLocalSpaceResponse(textToSend, currentLang);
    const fullText = aiResult.text;

    // Step 2: Simulate ultra-smooth, high-speed streaming response
    const botId = `bot-${Date.now()}`;
    const botMessage = {
      id: botId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      modelUsed: 'NASA Local AI Engine (Standalone)',
      provider: 'local-standalone',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: aiResult.suggestions
    };

    setMessages(prev => [...prev, botMessage]);

    // Stream word chunks rapidly (~20ms per chunk)
    const words = fullText.split(' ');
    let currentWordIndex = 0;
    const chunkSize = 3;

    if (soundEnabled) {
      spaceAudio.playReceiveChime();
    }

    const interval = setInterval(() => {
      currentWordIndex += chunkSize;
      const partialText = words.slice(0, currentWordIndex).join(' ');

      if (currentWordIndex >= words.length) {
        clearInterval(interval);
        setMessages(prev =>
          prev.map(m =>
            m.id === botId
              ? { ...m, content: fullText, isStreaming: false }
              : m
          )
        );
        setIsLoading(false);
      } else {
        setMessages(prev =>
          prev.map(m =>
            m.id === botId
              ? { ...m, content: partialText }
              : m
          )
        );
      }
    }, 24);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const currentModelObj = AVAILABLE_MODELS.find(m => m.id === selectedModel) || AVAILABLE_MODELS[0];

  return (
    <div className={`w-full max-w-4xl mx-auto rounded-3xl apple-liquid-glass shadow-2xl overflow-hidden flex flex-col h-[700px] text-slate-100 font-sans ${className}`}>
      
      {/* Space Chat Header */}
      <div className="p-4 sm:p-5 border-b border-white/10 apple-liquid-glass flex items-center justify-between gap-4 flex-wrap select-none">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Bot className="w-5 h-5 text-white" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#030712] animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Orbitron'] font-bold text-sm sm:text-base text-white tracking-wide">
                NASA Local AI Engine
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                STANDALONE • KEYLESS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span>Zero-latency</span>
              <span>•</span>
              <span>English • සිංහල • தமிழ்</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Audio Synthesizer Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`p-2 rounded-xl border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer ${
              soundEnabled
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'apple-liquid-glass border-white/10 text-slate-400 hover:text-slate-200'
            }`}
            title={soundEnabled ? 'Mute Sci-Fi Audio Synthesizer' : 'Enable Sci-Fi Audio Synthesizer'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Clear History Button */}
          <button
            type="button"
            onClick={handleClearHistory}
            className="p-2 rounded-xl apple-liquid-glass hover:border-rose-500/40 border-white/10 text-slate-400 hover:text-rose-400 transition cursor-pointer"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Model Selection Tabs Bar */}
      <div className="px-4 py-2.5 border-b border-white/10 apple-liquid-glass flex items-center gap-2 overflow-x-auto text-[11px] font-mono select-none">
        <span className="text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1">
          <Cpu className="w-3 h-3 text-cyan-400" />
          Active Core:
        </span>
        {AVAILABLE_MODELS.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedModel(m.id)}
            className={`px-3 py-1 rounded-xl transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              selectedModel === m.id
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-bold shadow-md shadow-cyan-950/40'
                : 'apple-liquid-glass text-slate-400 hover:text-white border-white/10'
            }`}
          >
            <span>{m.name}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/30 text-cyan-300">{m.tag}</span>
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-sans text-sm">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[88%] sm:max-w-[80%] ${
                isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
              }`}
            >
              {/* Avatar Icon */}
              <div
                className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-xs font-bold shadow-md ${
                  isUser
                    ? 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white border border-cyan-400/40'
                    : 'bg-gradient-to-tr from-purple-700 via-indigo-700 to-slate-900 text-purple-200 border border-purple-500/40'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-purple-300" />}
              </div>

              {/* Message Bubble Card */}
              <div className="space-y-1.5 group">
                <div
                  className={`p-4 rounded-2xl relative shadow-xl backdrop-blur-md text-sm leading-relaxed select-text whitespace-pre-wrap ${
                    isUser
                      ? 'bg-gradient-to-br from-cyan-600/80 to-blue-700/80 text-white rounded-tr-none border border-cyan-400/40'
                      : 'apple-liquid-glass text-slate-200 rounded-tl-none border-white/15'
                  }`}
                >
                  {/* Message Content */}
                  <div>
                    {msg.content}
                    {msg.isStreaming && (
                      <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
                    )}
                  </div>

                  {/* Copy Button for Assistant Messages */}
                  {!isUser && !msg.isStreaming && (
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="absolute top-2.5 right-2.5 p-1 rounded-lg apple-liquid-glass text-slate-400 hover:text-white transition opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Copy to clipboard"
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {/* Subtitle / Timestamp */}
                <div
                  className={`flex items-center gap-2 text-[10px] font-mono text-slate-500 px-1 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span>{msg.timestamp}</span>
                  {!isUser && msg.modelUsed && (
                    <>
                      <span>•</span>
                      <span className="text-cyan-400/80 font-bold">{msg.modelUsed}</span>
                    </>
                  )}
                </div>

                {/* Suggested follow-up prompt chips if available */}
                {!isUser && msg.suggestions && msg.suggestions.length > 0 && !msg.isStreaming && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {msg.suggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => sendMessage(sug)}
                        className="px-2.5 py-1 rounded-xl apple-liquid-glass hover:border-cyan-400/50 text-cyan-300 text-[11px] font-mono transition text-left cursor-pointer shadow-sm hover:scale-[1.02]"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Starter Prompts Strip */}
      {messages.length <= 2 && (
        <div className="px-4 py-2 border-t border-white/10 apple-liquid-glass overflow-x-auto flex items-center gap-2 select-none">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Quick Explore:
          </span>
          {STARTER_PROMPTS.map((promptObj, idx) => {
            const promptText = promptObj[currentLang] || promptObj.en;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => sendMessage(promptText)}
                className="px-3 py-1 rounded-xl apple-liquid-glass hover:border-cyan-400/50 text-[11px] font-mono text-slate-300 hover:text-cyan-200 whitespace-nowrap transition cursor-pointer"
              >
                {promptText}
              </button>
            );
          })}
        </div>
      )}

      {/* Input Composer Form */}
      <div className="p-4 border-t border-white/10 apple-liquid-glass">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="relative flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              currentLang === 'si'
                ? 'ISS, අඟහරු රෝවර හෝ අභ්‍යවකාශය ගැන ඕනෑම දෙයක් අසන්න...'
                : currentLang === 'ta'
                ? 'ISS, செவ்வாய் அல்லது விண்வெளி பற்றி கேளுங்கள்...'
                : 'Ask about the ISS, Mars rovers, JWST, Artemis, or black holes...'
            }
            disabled={isLoading}
            className="w-full pl-4 pr-12 py-3 rounded-2xl apple-liquid-glass border-white/15 focus:border-cyan-400 text-white placeholder-slate-400 text-xs sm:text-sm font-sans focus:outline-none transition shadow-inner disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="absolute right-2 p-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white disabled:opacity-40 disabled:hover:from-cyan-600 disabled:hover:to-indigo-500 transition shadow-md shadow-cyan-950/50 cursor-pointer disabled:cursor-not-allowed"
            title="Transmit query"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-2 px-1">
          <span className="flex items-center gap-1 text-emerald-400">
            <Zap className="w-3 h-3 text-emerald-400" />
            Instant Zero-Latency Local Inference • Keyless
          </span>
          <span className="hidden sm:inline">Press Enter to send</span>
        </div>
      </div>
    </div>
  );
}
