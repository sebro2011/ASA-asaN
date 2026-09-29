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
  VolumeX
} from 'lucide-react';

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
      // Audio autoplay policy or device failure gracefully ignored
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
      // Audio autoplay policy or device failure gracefully ignored
    }
  }
}

const spaceAudio = new SpaceAudioSynthesizer();

const AVAILABLE_MODELS = [
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    tag: 'RECOMMENDED',
    badgeColor: 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10',
    description: 'Meta 70B flagship instruct model, superior for multilingual astrophysics'
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1',
    tag: 'FREE / REASONING',
    badgeColor: 'border-purple-500/40 text-purple-300 bg-purple-500/10',
    description: 'DeepSeek reasoning model with step-by-step mathematical & physical deduction'
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct:free',
    name: 'Llama 3.1 8B',
    tag: 'FREE',
    badgeColor: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
    description: 'Fast lightweight free Llama model on OpenRouter'
  }
];

const NASA_SYSTEM_PROMPT = `You are a NASA Senior Astrophysicist and Cosmic Exploration Assistant. 
You specialize in astrophysics, orbital mechanics, planetary science, cosmology, stellar nucleosynthesis, and NASA missions (Apollo, Artemis, James Webb Space Telescope, Perseverance, Curiosity, Europa Clipper, Voyager).

Language Capabilities:
- You are fluent in English, Sinhala (සිංහල), and Tamil (தமிழ்).
- Always answer in the language the user speaks to you, or respect their requested language.
- Provide clear, engaging, scientifically accurate, and inspiring answers suitable for students, space enthusiasts, and researchers alike.
- Use formatting (bullet points, bold highlights) to make complex concepts easy to read.`;

const STARTER_PROMPTS = [
  {
    en: 'Explain how the James Webb Telescope detects the earliest galaxies.',
    si: 'ජේම්ස් වෙබ් දුරේක්ෂය මඟින් විශ්වයේ මුල්ම මන්දාකිණි හඳුනාගන්නේ කෙසේද?',
    ta: 'ஜேம்ஸ் வெப் தொலைநோக்கி ஆரம்பகால விண்மீன் திரள்களை எவ்வாறு கண்டறிகிறது?'
  },
  {
    en: 'What is the flight plan for NASA Artemis to return humans to the Moon?',
    si: 'නාසා ආටෙමිස් මෙහෙයුම මඟින් මිනිසුන් නැවත සඳට යවන්නේ කෙසේද?',
    ta: 'நாசா ஆர்ட்டெமிஸ் திட்டத்தின் மூலம் மனிதர்களை நிலவுக்கு அனுப்பும் திட்டம் என்ன?'
  },
  {
    en: 'How do supermassive black holes affect galaxy formation?',
    si: 'අති දැවැන්ත කළු කුහර මඟින් මන්දාකිණි නිර්මාණයට වන බලපෑම කුමක්ද?',
    ta: 'மிகப்பெரிய கருந்துளைகள் விண்மீன் உருவாக்கத்தை எவ்வாறு பாதிக்கின்றன?'
  },
  {
    en: 'What conditions exist in the subsurface ocean of Jupiter’s moon Europa?',
    si: 'බ්‍රහස්පතිගේ යුරෝපා උපග්‍රහයාගේ අභ්‍යන්තර සාගරයේ ඇති තත්ත්වයන් මොනවාද?',
    ta: 'வியாழனின் நிலவான யூரோப்பாவின் மேற்பரப்பு பெருங்கடலில் என்ன நிலைமைகள் உள்ளன?'
  }
];

/**
 * OpenRouterChat - NASA Astrophysics AI Assistant Component
 * 
 * @param {Object} props
 * @param {string} [props.className] - Additional wrapper styling
 * @param {() => void} [props.onClose] - Optional close modal callback
 */
export default function OpenRouterChat({ className = '', onClose }) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);

  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [messages, setMessages] = useState([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content: currentLang === 'si'
        ? 'ආයුබෝවන්! මම නාසා තාරකා භෞතික විද්‍යා AI සහකරු වෙමි. කළු කුහර, ආටෙමිස් මෙහෙයුම, හෝ විශ්වයේ ඕනෑම අභිරහසක් පිළිබඳව සිංහල, දෙමළ හෝ ඉංග්‍රීසි බසින් මාගෙන් විමසන්න.'
        : currentLang === 'ta'
        ? 'வணக்கம்! நான் நாசா வானியற்பியல் AI உதவியாளர். கருந்துளைகள், ஆர்ட்டெமிஸ் திட்டம் அல்லது விண்வெளியின் ரகசியங்கள் பற்றி தமிழ், சிங்களம் அல்லது ஆங்கிலத்தில் என்னிடம் கேளுங்கள்.'
        : 'Greetings! I am your NASA Astrophysics and Space Exploration AI Assistant. Ask me anything about orbital mechanics, black holes, the James Webb Space Telescope, or Artemis lunar missions in English, Sinhala, or Tamil.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
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
    setErrorMsg(null);
  };

  // Send message to OpenRouter API (via server proxy or direct)
  const sendMessage = async (customPrompt) => {
    const textToSend = (customPrompt || inputText).trim();
    if (!textToSend || isLoading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInputText('');
    setErrorMsg(null);
    setIsLoading(true);

    // Audio feedback: Laser click on message send
    if (soundEnabled) {
      spaceAudio.playSendLaser();
    }

    try {
      // Build API payload including the system prompt
      const apiMessages = [
        { role: 'system', content: NASA_SYSTEM_PROMPT },
        ...newHistory.map(m => ({ role: m.role, content: m.content }))
      ];

      // Try secure server-side proxy route first
      let response = await fetch('/api/openrouter/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 1024
        })
      });

      // If server proxy is unavailable, call OpenRouter directly
      if (!response.ok) {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'NASA Space Explorer'
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: apiMessages,
            temperature: 0.7,
            max_tokens: 1024
          })
        });
      }

      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const replyContent = data.choices?.[0]?.message?.content || 
        'Telemetry received, but no textual analysis could be extracted.';

      const botMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: replyContent,
        modelUsed: data.model || selectedModel,
        provider: data.provider || 'openrouter',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, botMessage]);

      // Audio feedback: Futuristic celestial harmonic chime when response arrives
      if (soundEnabled) {
        spaceAudio.playReceiveChime();
      }
    } catch (err) {
      console.error('Chat generation error:', err);
      setErrorMsg(
        currentLang === 'si'
          ? 'දත්ත සම්ප්‍රේෂණ දෝෂයක් සිදු විය. කරුණාකර නැවත උත්සාහ කරන්න.'
          : currentLang === 'ta'
          ? 'தகவல் பரிமாற்ற பிழை ஏற்பட்டது. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.'
          : 'Communication downlink interrupted. Please try again or switch model.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const currentModelObj = AVAILABLE_MODELS.find(m => m.id === selectedModel) || AVAILABLE_MODELS[0];

  return (
    <div className={`w-full max-w-4xl mx-auto rounded-3xl border border-cyan-500/25 bg-[#0B0F19]/90 backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col h-[700px] text-slate-100 font-sans ${className}`}>
      
      {/* Space Chat Header */}
      <div className="p-4 sm:p-5 border-b border-cyan-500/20 bg-gradient-to-r from-[#070A12] via-[#0E1626] to-[#070A12] flex items-center justify-between gap-4 flex-wrap select-none">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-sky-600 to-blue-700 p-0.5 shadow-lg shadow-cyan-950/60 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border border-slate-950" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight font-['Orbitron']">
                NASA Astrophysics AI
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                <Radio className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
                OPENROUTER
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Trilingual Space Intelligence • 🇱🇰 සිංහල | 🇮🇳 தமிழ் | 🇬🇧 English
            </p>
          </div>
        </div>

        {/* Header Controls: Model Selector & Clear Button */}
        <div className="flex items-center gap-2">
          {/* Model Selector Dropdown */}
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="appearance-none bg-slate-900 border border-slate-700 text-xs text-slate-200 font-semibold py-1.5 pl-3 pr-7 rounded-xl focus:outline-none focus:border-cyan-400 cursor-pointer"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                  {m.name} ({m.tag})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Sound Mute/Unmute Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`p-2 rounded-xl border transition-all duration-150 flex items-center justify-center ${
              soundEnabled
                ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300 hover:bg-cyan-500/25 shadow-sm shadow-cyan-500/20'
                : 'bg-slate-900/90 border-slate-700/80 text-slate-500 hover:text-slate-300 hover:border-slate-600'
            }`}
            title={soundEnabled ? 'Mute UI sound effects' : 'Enable UI sound effects'}
            aria-label={soundEnabled ? 'Mute UI sound effects' : 'Enable UI sound effects'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Clear Chat */}
          <button
            onClick={handleClearHistory}
            className="p-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message History Viewport with Custom Cosmic Scroll */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-md ${
                isUser 
                  ? 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white' 
                  : 'bg-slate-900 border border-cyan-500/30 text-cyan-400'
              }`}>
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div className={`group relative max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-lg ${
                isUser
                  ? 'bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 text-white border border-cyan-400/40 rounded-tr-none'
                  : 'bg-[#0E1524]/90 backdrop-blur-md border border-cyan-500/20 text-slate-200 rounded-tl-none'
              }`}>
                {/* Text Content */}
                <div className="whitespace-pre-wrap font-sans">
                  {msg.content}
                </div>

                {/* Footer Meta: Timestamp, Model tag, Copy button */}
                <div className={`mt-2 pt-1 flex items-center justify-between gap-3 text-[10px] font-mono border-t ${
                  isUser ? 'border-cyan-400/30 text-cyan-100' : 'border-slate-800 text-slate-500'
                }`}>
                  <span className="flex items-center gap-1.5">
                    <span>{msg.timestamp}</span>
                    {msg.modelUsed && (
                      <span className="hidden sm:inline px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        {msg.modelUsed.split('/')[1] || msg.modelUsed}
                      </span>
                    )}
                  </span>

                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className="opacity-70 hover:opacity-100 transition flex items-center gap-1"
                    title="Copy message"
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
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing Status Indicator */}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 animate-bounce" />
            </div>
            <div className="bg-[#0E1524]/90 border border-cyan-500/20 rounded-2xl rounded-tl-none p-3.5 shadow-lg flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse delay-150" />
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse delay-300" />
              </div>
              <span className="text-xs font-mono text-cyan-300 tracking-wide">
                Astrophysicist AI analyzing deep-space telemetry ({currentModelObj.name})...
              </span>
            </div>
          </div>
        )}

        {/* Error notification if connection drops */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => sendMessage()}
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold transition"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Recommended Starter Question Pills */}
      <div className="px-4 py-2 border-t border-slate-800/80 bg-[#070A12]/80 flex items-center gap-2 overflow-x-auto text-xs no-scrollbar">
        <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          SUGGESTIONS:
        </span>
        {STARTER_PROMPTS.map((prompt, idx) => {
          const promptText = prompt[currentLang] || prompt.en;
          return (
            <button
              key={idx}
              onClick={() => sendMessage(promptText)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 text-[11px] whitespace-nowrap transition flex items-center gap-1.5"
            >
              <span>{promptText}</span>
            </button>
          );
        })}
      </div>

      {/* Input Form with Multi-line Textarea and Send Button */}
      <div className="p-4 border-t border-cyan-500/20 bg-gradient-to-t from-[#070A12] to-[#0B0F19]">
        <div className="relative flex items-center gap-2 bg-[#0E1524] rounded-2xl border border-cyan-500/30 p-2 shadow-inner focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              currentLang === 'si'
                ? 'තාරකා භෞතික විද්‍යා ප්‍රශ්නයක් ඇතුළත් කරන්න (Enter ඔබන්න)...'
                : currentLang === 'ta'
                ? 'வானியற்பியல் கேள்வியை உள்ளிடவும் (Enter அழுத்தவும்)...'
                : 'Ask a NASA astrophysics question (Press Enter to transmit)...'
            }
            rows={1}
            disabled={isLoading}
            className="w-full bg-transparent text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 resize-none focus:outline-none px-2 py-1 max-h-24 overflow-y-auto"
          />

          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={!inputText.trim() || isLoading}
            className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-cyan-600/30 transition-transform active:scale-95 shrink-0"
            title="Transmit query"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>Active: {currentModelObj.name}</span>
          <span>OpenRouter Endpoint: openrouter.ai/api/v1/chat/completions</span>
        </div>
      </div>

    </div>
  );
}
