import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Search, X, Volume2, AlertCircle } from 'lucide-react';
import { SupportedLanguage } from '../i18n/translations';

interface VoiceSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  lang?: SupportedLanguage;
  className?: string;
  onClear?: () => void;
}

export const VoiceSearchInput: React.FC<VoiceSearchInputProps> = ({
  value,
  onChange,
  placeholder,
  lang = 'en',
  className = '',
  onClear
}) => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  // Map app language to BCP 47 language tags for Web Speech API
  const getSpeechLangCode = (l: SupportedLanguage) => {
    switch (l) {
      case 'si':
        return 'si-LK'; // Sinhala (Sri Lanka)
      case 'ta':
        return 'ta-IN'; // Tamil (India / Sri Lanka)
      case 'en':
      default:
        return 'en-US'; // English (United States)
    }
  };

  const getLangDisplayName = (l: SupportedLanguage) => {
    switch (l) {
      case 'si':
        return 'සිංහල (si-LK)';
      case 'ta':
        return 'தமிழ் (ta-IN)';
      case 'en':
      default:
        return 'English (en-US)';
    }
  };

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMessage(null);
        setInterimTranscript('');
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            currentInterim += transcript;
          }
        }

        if (currentInterim) {
          setInterimTranscript(currentInterim);
        }

        if (finalTranscript) {
          const trimmed = finalTranscript.trim();
          onChange(trimmed);
          setInterimTranscript('');
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        setInterimTranscript('');
        if (event.error === 'not-allowed') {
          setErrorMessage('Microphone access denied. Please allow microphone permission.');
        } else if (event.error === 'no-speech') {
          // No speech detected, quietly stop
        } else if (event.error === 'network') {
          setErrorMessage('Speech recognition network error.');
        } else {
          setErrorMessage(`Speech error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
    } catch {
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
    };
  }, [onChange]);

  // Toggle Voice Recognition
  const toggleListening = () => {
    if (!speechSupported) {
      setErrorMessage('Speech recognition is not supported in this browser. Please use Chrome/Edge.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      setErrorMessage(null);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.lang = getSpeechLangCode(lang);
          recognitionRef.current.start();
        } catch {
          // Already active or starting
        }
      }
    }
  };

  const handleClear = () => {
    onChange('');
    setInterimTranscript('');
    if (onClear) onClear();
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* Input Container */}
      <div
        className={`relative flex items-center w-full rounded-2xl bg-slate-950/80 border transition-all duration-300 ${
          isListening
            ? 'border-cyan-400 ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-500/20'
            : 'border-slate-800 hover:border-slate-700 focus-within:border-cyan-500/60'
        }`}
      >
        {/* Search Icon */}
        <div className="pl-4 pr-2 text-slate-400">
          <Search className="w-4 h-4" />
        </div>

        {/* Text Input */}
        <input
          type="text"
          value={interimTranscript ? `${value} ${interimTranscript}` : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isListening
              ? `${lang === 'si' ? 'හඬට සවන් දෙමින් පවතී...' : lang === 'ta' ? 'குரலைக் கேட்கிறது...' : 'Listening now...'}`
              : placeholder || (lang === 'si' ? 'සොයන්න හෝ කථා කරන්න...' : lang === 'ta' ? 'தேடவும் அல்லது பேசவும்...' : 'Search or speak...')
          }
          className="w-full py-2.5 bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none tracking-wide"
        />

        {/* Clear Button */}
        {(value || interimTranscript) && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 mr-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Microphone Button with Voice Waves */}
        <div className="pr-2 flex items-center">
          <button
            type="button"
            onClick={toggleListening}
            className={`relative p-2 rounded-xl transition-all duration-200 flex items-center justify-center ${
              isListening
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40 animate-pulse'
                : 'bg-slate-900 hover:bg-cyan-600/20 text-cyan-400 hover:text-cyan-200 border border-slate-700/60 hover:border-cyan-500/50'
            }`}
            title={
              isListening
                ? 'Stop listening'
                : `Voice search in ${getLangDisplayName(lang)}`
            }
          >
            {isListening ? (
              <Mic className="w-4 h-4 text-white animate-bounce" />
            ) : (
              <Mic className="w-4 h-4" />
            )}

            {/* Ripple Wave ring when active */}
            {isListening && (
              <span className="absolute -inset-1 rounded-xl bg-rose-500/30 animate-ping pointer-events-none" />
            )}
          </button>
        </div>
      </div>

      {/* Voice Status & Live Audio Bars */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 mt-2 p-2.5 rounded-xl bg-slate-900/95 border border-cyan-500/40 shadow-xl backdrop-blur-xl z-30 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <div className="text-xs font-mono font-medium text-cyan-300">
                {lang === 'si'
                  ? `හඬ හඳුනාගැනීම: ${getLangDisplayName(lang)}`
                  : lang === 'ta'
                  ? `குரல் அறிதல்: ${getLangDisplayName(lang)}`
                  : `Voice Input: ${getLangDisplayName(lang)}`}
              </div>
            </div>

            {/* Simulated Audio Spectrum Visualizer */}
            <div className="flex items-center gap-1 h-3">
              {[40, 80, 60, 100, 50, 90, 70, 30].map((height, idx) => (
                <motion.div
                  key={idx}
                  animate={{ scaleY: [0.3, 1, 0.4] }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.6 + (idx % 3) * 0.2,
                    ease: 'easeInOut'
                  }}
                  className="w-1 bg-cyan-400 rounded-full origin-bottom"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Message Toast */}
      {errorMessage && (
        <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-rose-950/80 border border-rose-500/40 text-[11px] text-rose-300 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-auto text-rose-400 hover:text-white"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
