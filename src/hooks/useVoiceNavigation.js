'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Command matching dictionary for multilingual voice control
 * English, Sinhala (සිංහල), Tamil (தமிழ்)
 */
const VOICE_COMMANDS = {
  // Navigation targets
  nav_mars: {
    patterns: ['mars', 'go to mars', 'show mars', 'අඟහරු', 'අගහරු', 'செவ்வாய்'],
    target: 'mars',
    type: 'navigate',
    label: 'Mars Target'
  },
  nav_iss: {
    patterns: ['iss', 'space station', 'station', 'මධ්‍යස්ථානය', 'මධ්යස්ථානය', 'අයිඑස්එස්', 'விண்வெளி நிலையம்', 'ஐஎஸ்எஸ்'],
    target: 'iss',
    type: 'navigate',
    label: 'ISS Tracker'
  },
  nav_sun: {
    patterns: ['sun', 'solar', 'go to sun', 'ඉර', 'සූර්යයා', 'சூரியன்'],
    target: 'sun',
    type: 'navigate',
    label: 'Solar Weather'
  },
  nav_earth: {
    patterns: ['earth', 'epic', 'home planet', 'පෘථිවිය', 'ලෝකය', 'பூமி'],
    target: 'epic',
    type: 'navigate',
    label: 'EPIC Earth'
  },
  nav_earthlab: {
    patterns: ['earth lab', 'earth intelligence', 'climate', 'weather', 'rainfall', 'temperature', 'පෘථිවි පරීක්ෂණාගාරය', 'දේශගුණය', 'வானிலை', 'பூமி ஆய்வகம்'],
    target: 'earthlab',
    type: 'navigate',
    label: 'Earth Intelligence Lab'
  },
  nav_exoplanets: {
    patterns: ['exoplanet', 'exoplanets', 'alien planet', 'බාහිර ග්‍රහලෝක', 'පුදුම ග්‍රහලෝක', 'புறக்கோள்கள்'],
    target: 'exoplanets',
    type: 'navigate',
    label: 'Exoplanet Lab'
  },
  nav_asteroids: {
    patterns: ['asteroid', 'asteroids', 'meteor', 'ග්‍රහක', 'ඇස්ටරොයිඩ්', 'சிறுகோள்'],
    target: 'asteroids',
    type: 'navigate',
    label: 'Asteroid Radar'
  },
  nav_apod: {
    patterns: ['apod', 'astronomy picture', 'picture of the day', 'photo', 'ඡායාරූපය', 'දවසේ පින්තූරය', 'படம்'],
    target: 'apod',
    type: 'navigate',
    label: 'Cosmic APOD'
  },
  nav_quiz: {
    patterns: ['quiz', 'trivia', 'game', 'space quiz', 'ප්‍රශ්නාවලිය', 'තරඟය', 'வினாடி வினா'],
    target: 'quiz',
    type: 'navigate',
    label: 'Space Quiz'
  },

  // 3D Camera & Viewport Actions
  action_rotate: {
    patterns: ['rotate', 'spin', 'auto rotate', 'turn', 'කැරකෙන්න', 'කරකවන්න', 'சுழற்று'],
    action: 'rotate',
    type: 'camera',
    label: 'Toggle Rotation'
  },
  action_reset: {
    patterns: ['reset', 'reset view', 'home view', 'center', 'මුල් තත්වයට', 'යළි පිහිටුවන්න', 'மீட்டமை'],
    action: 'reset',
    type: 'camera',
    label: 'Reset Camera'
  },
  action_zoom_in: {
    patterns: ['zoom in', 'closer', 'enlarge', 'zoom', 'විශාලනය', 'ළංවන්න', 'பெரிதாக்கு'],
    action: 'zoom_in',
    type: 'camera',
    label: 'Zoom In'
  },
  action_zoom_out: {
    patterns: ['zoom out', 'farther', 'back out', 'කුඩා කරන්න', 'ඈත් වන්න', 'சிறிதாக்கு'],
    action: 'zoom_out',
    type: 'camera',
    label: 'Zoom Out'
  }
};

/**
 * useVoiceNavigation
 * Standalone browser-native voice control hook using Web Speech API
 * 
 * @param {Object} options
 * @param {(target: string, command: Object) => void} [options.onNavigate]
 * @param {(action: string, command: Object) => void} [options.onCameraAction]
 * @param {string} [options.lang='en-US']
 */
export function useVoiceNavigation({ onNavigate, onCameraAction, lang = 'en-US' } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastCommand, setLastCommand] = useState(null);
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(false);

  const recognitionRef = useRef(null);
  const manualStopRef = useRef(false);

  // Initialize SpeechRecognition on client
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    setSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        currentTranscript += item[0].transcript;
      }

      const cleanTranscript = currentTranscript.trim().toLowerCase();
      setTranscript(cleanTranscript);

      // Parse transcript against VOICE_COMMANDS
      for (const [cmdKey, cmd] of Object.entries(VOICE_COMMANDS)) {
        for (const pattern of cmd.patterns) {
          if (cleanTranscript.includes(pattern.toLowerCase())) {
            setLastCommand({ ...cmd, key: cmdKey, matchedPattern: pattern });
            
            if (cmd.type === 'navigate' && onNavigate) {
              onNavigate(cmd.target, cmd);
            } else if (cmd.type === 'camera' && onCameraAction) {
              onCameraAction(cmd.action, cmd);
            }
            break;
          }
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        // Benign silence timeout
        return;
      }
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone permissions.');
      } else {
        setError(`Speech recognition notice: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      // Auto-restart if not manually stopped
      if (!manualStopRef.current && isListening) {
        try {
          recognition.start();
        } catch (_) {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    return () => {
      manualStopRef.current = true;
      try {
        recognition.stop();
      } catch (_) {}
    };
  }, [lang, onNavigate, onCameraAction]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    manualStopRef.current = false;
    setError(null);
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (_) {
      // Already running or permission waiting
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    manualStopRef.current = true;
    try {
      recognitionRef.current.stop();
    } catch (_) {}
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    transcript,
    lastCommand,
    error,
    supported,
    toggleListening,
    startListening,
    stopListening
  };
}

export default useVoiceNavigation;
