'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Radio,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Wifi,
  WifiOff,
  Activity,
  Headphones,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Play,
  Square,
  Globe2,
  Settings2,
  Zap,
  Info
} from 'lucide-react';

const GEMINI_LIVE_BIDI_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

const VOICE_OPTIONS = [
  { id: 'Puck', name: 'Puck (Nominal Flight Director)', gender: 'Balanced' },
  { id: 'Charon', name: 'Charon (Deep Space Relay)', gender: 'Deep' },
  { id: 'Kore', name: 'Kore (Orbital Science Specialist)', gender: 'Clear' },
  { id: 'Fenrir', name: 'Fenrir (Propulsion Officer)', gender: 'Dynamic' },
  { id: 'Zephyr', name: 'Zephyr (Atmospheric Navigation)', gender: 'Warm' },
  { id: 'Aoede', name: 'Aoede (Exoplanetary Observer)', gender: 'Bright' }
];

const UI_STRINGS = {
  en: {
    badge: 'GEMINI LIVE BIDI-STREAMING',
    title: 'NOVA Live Voice Uplink',
    subtitle: 'Real-time low-latency voice telemetry powered by Gemini Live API (16kHz PCM In • 24kHz PCM Out)',
    connecting: 'Establishing orbital Bidi WebSocket uplink...',
    connected: 'Live Voice Uplink Nominal',
    listening: 'Radio mic active • Speak naturally with NOVA',
    aiSpeaking: 'NOVA Transmitting Voice Audio (24kHz PCM)...',
    interrupted: 'Barge-in detected • Model yielded radio channel',
    disconnected: 'Voice channel standby',
    error: 'Telemetry uplink error',
    startVoice: 'Open Live Voice Channel',
    stopVoice: 'End Voice Transmission',
    muteMic: 'Mute Radio Mic',
    unmuteMic: 'Unmute Radio Mic',
    selectVoice: 'Flight Voice Persona',
    transcriptTitle: 'Live Comms Transcript',
    userBadge: 'ASTRONAUT',
    novaBadge: 'NOVA AI',
    noTranscript: 'Awaiting first voice transmission...',
    micPermissionDenied: 'Microphone access denied. Please allow microphone permissions in your browser.',
    modelTag: 'Gemini 3.8 Live API • Low Latency Bidi-Stream',
    latencyPill: 'Low Latency Audio Stream',
    dsnTelemetry: 'DSN CARRIER FREQUENCY: 8.4 GHz (X-BAND)'
  },
  si: {
    badge: 'GEMINI සජීවී ද්වි-දිශා හඬ සබඳතාව',
    title: 'NOVA සජීවී හඬ සන්නිවේදනය',
    subtitle: 'Gemini Live API මඟින් බලගැන්වෙන තත්පරයෙන් තත්පරයට ක්‍රියාත්මක වන තථ්‍ය කාලීන හඬ සබඳතාව',
    connecting: 'ද්වි-දිශා WebSocket සබඳතාව ස්ථාපනය වෙමින්...',
    connected: 'සජීවී හඬ සබඳතාව සාර්ථකයි',
    listening: 'මයික්‍රෆෝනය සක්‍රියයි • NOVA සමඟ සජීවීව කතා කරන්න',
    aiSpeaking: 'NOVA හඬ දත්ත සම්ප්‍රේෂණය කරමින් (24kHz PCM)...',
    interrupted: 'බාධා කිරීම හඳුනාගැනිණි • හඬ නාලිකාව මුදාහැරිනි',
    disconnected: 'හඬ නාලිකාව විසන්ධි විය',
    error: 'හඬ සබඳතා දෝෂයකි',
    startVoice: 'සජීවී හඬ නාලිකාව අරඹන්න',
    stopVoice: 'හඬ සම්ප්‍රේෂණය නවත්වන්න',
    muteMic: 'මයික්‍රෆෝනය නිහඬ කරන්න',
    unmuteMic: 'මයික්‍රෆෝනය සක්‍රිය කරන්න',
    selectVoice: 'හඬ පෞරුෂය',
    transcriptTitle: 'සජීවී සංවාද සටහන',
    userBadge: 'ගගනගාමියා',
    novaBadge: 'NOVA AI',
    noTranscript: 'පළමු හඬ සම්ප්‍රේෂණය අපේක්ෂාවෙන්...',
    micPermissionDenied: 'මයික්‍රෆෝන අවසරය ලබාදී නැත. කරුණාකර බ්‍රවුසරයේ අවසර සක්‍රිය කරන්න.',
    modelTag: 'Gemini 3.8 Live API • සජීවී ශ්‍රව්‍ය සබඳතාව',
    latencyPill: 'අඩු ප්‍රමාද ශ්‍රව්‍ය සම්ප්‍රේෂණය',
    dsnTelemetry: 'DSN සංඛ්‍යාතය: 8.4 GHz (X-BAND)'
  },
  ta: {
    badge: 'GEMINI நேரலை இருவழி ஒலி ஸ்ட்ரீமிங்',
    title: 'NOVA நேரலை குரல் இணைப்பு',
    subtitle: 'Gemini Live API மூலம் இயக்கப்படும் நிகழ்நேர குறைந்த தாமத குரல் அளவீடு (16kHz PCM In • 24kHz PCM Out)',
    connecting: 'WebSocket இருவழி இணைப்பு நிறுவப்படுகிறது...',
    connected: 'நேரலை குரல் இணைப்பு செயலில் உள்ளது',
    listening: 'மைக் செயலில் உள்ளது • NOVA உடன் இயல்பாகப் பேசுங்கள்',
    aiSpeaking: 'NOVA குரல் தரவு அனுப்புகிறது (24kHz PCM)...',
    interrupted: 'குறுக்கீடு கண்டறியப்பட்டது • அலைவரிசை விடுவிக்கப்பட்டது',
    disconnected: 'குரல் அலைவரிசை காத்திருப்பில்',
    error: 'இணைப்பு பிழை',
    startVoice: 'நேரலை குரலைத் தொடங்கு',
    stopVoice: 'குரல் இணைப்பை நிறுத்து',
    muteMic: 'மைக்கை முடக்கு',
    unmuteMic: 'மைக்கை இயக்கு',
    selectVoice: 'குரல் வகை',
    transcriptTitle: 'நேரலை உரையாடல் பதிவு',
    userBadge: 'விண்வெளி வீரர்',
    novaBadge: 'NOVA AI',
    noTranscript: 'முதல் குரல் ஒலிபரப்பிற்காக காத்திருக்கிறது...',
    micPermissionDenied: 'மைக் அனுமதி மறுக்கப்பட்டது. உலாவியில் மைக் அனுமதியை வழங்கவும்.',
    modelTag: 'Gemini 3.8 Live API • நேரலை ஒலி இணைப்பு',
    latencyPill: 'குறைந்த தாமத ஒலி இணைப்பு',
    dsnTelemetry: 'DSN அதிர்வெண்: 8.4 GHz (X-BAND)'
  }
};

/**
 * Utility: Downsample Float32 audio array to 16,000 Hz if hardware runs at a different rate
 */
function downsampleTo16k(buffer, fromRate) {
  if (fromRate === 16000) return buffer;
  const ratio = fromRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const originIndex = i * ratio;
    const index = Math.floor(originIndex);
    const frac = originIndex - index;
    const nextIndex = Math.min(index + 1, buffer.length - 1);
    result[i] = buffer[index] * (1 - frac) + buffer[nextIndex] * frac;
  }
  return result;
}

/**
 * Utility: Convert Float32 audio samples to 16-bit Signed Little-Endian PCM Uint8Array
 */
function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Uint8Array(buffer);
}

/**
 * Utility: Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Utility: Decode base64 24kHz 16-bit PCM to Float32Array for Web Audio playback
 */
function base64PCM24kToFloat32(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

/**
 * GeminiLiveVoice Component
 * Real-time bidirectional streaming voice client using WebSocket (BidiGenerateContent),
 * capturing client microphone at 16kHz PCM and playing 24kHz PCM responses via Web Audio API.
 */
export function GeminiLiveVoice({
  lang = 'en',
  isOpen = false,
  onClose,
  initialVoice = 'Puck',
  className = ''
}) {
  const activeLang = (lang || 'en').slice(0, 2);
  const ui = UI_STRINGS[activeLang] || UI_STRINGS.en;

  // Session State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(initialVoice);
  const [errorMessage, setErrorMessage] = useState(null);
  const [statusText, setStatusText] = useState(ui.disconnected);

  // Audio Visualizer Levels
  const [micLevel, setMicLevel] = useState(0);
  const [aiLevel, setAiLevel] = useState(0);

  // Live Comms Transcripts
  const [transcripts, setTranscripts] = useState([]);

  // Audio and WebSocket references
  const wsRef = useRef(null);
  const inputAudioCtxRef = useRef(null);
  const outputAudioCtxRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const activeAudioSourcesRef = useRef([]);
  const nextPlaybackTimeRef = useRef(0);
  const analyserNodeRef = useRef(null);
  const micAnalyserNodeRef = useRef(null);
  const animFrameRef = useRef(null);

  // Cleanup all audio resources
  const cleanupAudioAndSocket = useCallback(() => {
    // Cancel animation frame
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Stop and disconnect input processor
    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      mediaStreamRef.current = null;
    }

    // Close input audio context
    if (inputAudioCtxRef.current) {
      try {
        inputAudioCtxRef.current.close();
      } catch {}
      inputAudioCtxRef.current = null;
    }

    // Stop active playback sources
    if (activeAudioSourcesRef.current.length > 0) {
      activeAudioSourcesRef.current.forEach((src) => {
        try { src.stop(); } catch {}
      });
      activeAudioSourcesRef.current = [];
    }

    // Close output audio context
    if (outputAudioCtxRef.current) {
      try {
        outputAudioCtxRef.current.close();
      } catch {}
      outputAudioCtxRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    nextPlaybackTimeRef.current = 0;
    setIsConnected(false);
    setIsConnecting(false);
    setIsAiSpeaking(false);
    setMicLevel(0);
    setAiLevel(0);
  }, []);

  // Stop playback immediately when barge-in happens
  const stopAudioPlayback = useCallback(() => {
    if (activeAudioSourcesRef.current.length > 0) {
      activeAudioSourcesRef.current.forEach((src) => {
        try { src.stop(); } catch {}
      });
      activeAudioSourcesRef.current = [];
    }
    if (outputAudioCtxRef.current) {
      nextPlaybackTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
    setIsAiSpeaking(false);
    setAiLevel(0);
  }, []);

  // Schedule and play 24kHz PCM chunk seamlessly
  const playAudioChunk = useCallback((base64Data) => {
    try {
      if (!outputAudioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        outputAudioCtxRef.current = new AudioCtx({ sampleRate: 24000 });
      }

      const outCtx = outputAudioCtxRef.current;
      if (outCtx.state === 'suspended') {
        outCtx.resume().catch(() => {});
      }

      // Initialize analyzer for AI audio visualizer
      if (!analyserNodeRef.current) {
        analyserNodeRef.current = outCtx.createAnalyser();
        analyserNodeRef.current.fftSize = 64;
      }

      const float32 = base64PCM24kToFloat32(base64Data);
      if (float32.length === 0) return;

      const buffer = outCtx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = outCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyserNodeRef.current);
      analyserNodeRef.current.connect(outCtx.destination);

      const now = outCtx.currentTime;
      const startTime = Math.max(now, nextPlaybackTimeRef.current);
      source.start(startTime);
      nextPlaybackTimeRef.current = startTime + buffer.duration;

      activeAudioSourcesRef.current.push(source);
      setIsAiSpeaking(true);

      source.onended = () => {
        activeAudioSourcesRef.current = activeAudioSourcesRef.current.filter((s) => s !== source);
        if (activeAudioSourcesRef.current.length === 0) {
          setIsAiSpeaking(false);
          setAiLevel(0);
        }
      };
    } catch (err) {
      console.error('[Gemini Live] Error playing 24kHz audio chunk:', err);
    }
  }, []);

  // Start Real-Time Bidirectional Session
  const startLiveVoiceSession = useCallback(async () => {
    cleanupAudioAndSocket();
    setErrorMessage(null);
    setIsConnecting(true);
    setStatusText(ui.connecting);

    try {
      // 1. Fetch server live config & API key
      let apiKey = '';
      let useProxy = false;

      try {
        const tokenRes = await fetch('/api/gemini-live-token');
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.apiKey) {
            apiKey = tokenData.apiKey;
          }
        }
      } catch (e) {
        console.warn('[Gemini Live] Failed to fetch token endpoint, will use proxy fallback:', e);
      }

      // Determine WebSocket connection URL
      let targetWsUrl = '';
      if (apiKey) {
        targetWsUrl = `${GEMINI_LIVE_BIDI_WS_URL}?key=${apiKey}`;
      } else {
        // Fallback to local server WebSocket bridge
        const isSecure = window.location.protocol === 'https:';
        targetWsUrl = `${isSecure ? 'wss:' : 'ws:'}//${window.location.host}/ws/live`;
        useProxy = true;
      }

      console.log(`[Gemini Live] Connecting via ${useProxy ? 'Server Proxy /ws/live' : 'Direct Bidi API'}...`);
      const ws = new WebSocket(targetWsUrl);
      wsRef.current = ws;

      // 2. Setup AudioContexts and microphone capture
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputCtx;

      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputCtx;
      nextPlaybackTimeRef.current = outputCtx.currentTime;

      // Microphone permission & stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      // Mic input visualizer analyser
      const micAnalyser = inputCtx.createAnalyser();
      micAnalyser.fftSize = 64;
      micAnalyserNodeRef.current = micAnalyser;

      const micSource = inputCtx.createMediaStreamSource(stream);
      micSource.connect(micAnalyser);

      // Script processor for capturing PCM 16kHz chunks
      const bufferSize = 2048;
      const scriptNode = inputCtx.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = scriptNode;

      scriptNode.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (isMicMuted) {
          setMicLevel(0);
          return;
        }

        const inputChannelData = e.inputBuffer.getChannelData(0);

        // Calculate RMS for visualizer
        let sum = 0;
        for (let i = 0; i < inputChannelData.length; i++) {
          sum += inputChannelData[i] * inputChannelData[i];
        }
        const rms = Math.sqrt(sum / inputChannelData.length);
        setMicLevel(Math.min(1, rms * 5));

        // Resample to 16kHz if needed
        const resampledData = downsampleTo16k(inputChannelData, inputCtx.sampleRate);
        const pcm16Bytes = floatTo16BitPCM(resampledData);
        const base64Chunk = uint8ArrayToBase64(pcm16Bytes);

        // Send realtimeInput packet to Gemini Live API
        try {
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [
                {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Chunk
                }
              ]
            }
          }));
        } catch {}
      };

      micSource.connect(scriptNode);
      scriptNode.connect(inputCtx.destination);

      // Animation loop for audio visualizers
      const updateVisualizers = () => {
        if (analyserNodeRef.current && isAiSpeaking) {
          const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount);
          analyserNodeRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length / 255;
          setAiLevel(avg);
        } else if (!isAiSpeaking) {
          setAiLevel(0);
        }

        animFrameRef.current = requestAnimationFrame(updateVisualizers);
      };
      animFrameRef.current = requestAnimationFrame(updateVisualizers);

      // 3. WebSocket Event Handlers
      ws.onopen = () => {
        console.log('[Gemini Live] WebSocket opened. Sending initial setup payload...');
        setIsConnecting(false);
        setIsConnected(true);
        setStatusText(ui.connected);

        // Initial setup payload according to Gemini Live BidiGenerateContent spec
        const setupPayload = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: selectedVoice || 'Puck'
                  }
                }
              }
            },
            systemInstruction: {
              parts: [
                {
                  text: `You are NOVA, NASA Mission Control AI. You are in a real-time low-latency voice telemetry conversation with a space explorer.
- Respond with clear, direct, scientific mission control radio comms.
- Keep answers concise, natural, and engaging (1-3 sentences suitable for radio).
- Answer questions on NASA missions, Apollo, Artemis, James Webb, ISS orbits, Mars rovers, astrophysics, and black holes.
- You understand and can naturally converse in English, Sinhala (සිංහල), or Tamil (தமிழ்) depending on what the user speaks.`
                }
              ]
            }
          }
        };

        try {
          ws.send(JSON.stringify(setupPayload));
        } catch (e) {
          console.error('[Gemini Live] Failed to send setup payload:', e);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Check if server or upstream returned an error
          if (data.error) {
            console.error('[Gemini Live] Server error message:', data.error);
            setErrorMessage(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
            setStatusText(ui.error);
            return;
          }

          // Handle serverContent
          if (data.serverContent) {
            // Check for interruption (barge-in: user began speaking)
            if (data.serverContent.interrupted) {
              console.log('[Gemini Live] Interruption signal received (Barge-in)');
              stopAudioPlayback();
              setStatusText(ui.interrupted);
              setTimeout(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  setStatusText(ui.listening);
                }
              }, 1200);
              return;
            }

            // Check for modelTurn audio chunks
            const parts = data.serverContent.modelTurn?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                // If part contains PCM audio
                if (part.inlineData?.data) {
                  setStatusText(ui.aiSpeaking);
                  playAudioChunk(part.inlineData.data);
                }

                // If part contains text transcript
                if (part.text && part.text.trim()) {
                  setTranscripts((prev) => {
                    const newEntry = {
                      id: `transcript-${Date.now()}-${Math.random()}`,
                      sender: 'nova',
                      text: part.text.trim(),
                      timestamp: new Date().toLocaleTimeString()
                    };
                    return [...prev.slice(-14), newEntry];
                  });
                }
              }
            }

            // Turn completed
            if (data.serverContent.turnComplete) {
              setTimeout(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN && !isAiSpeaking) {
                  setStatusText(ui.listening);
                }
              }, 400);
            }
          }
        } catch (err) {
          console.error('[Gemini Live] Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[Gemini Live] WebSocket connection error:', err);
        setErrorMessage(ui.error);
        setStatusText(ui.error);
      };

      ws.onclose = (event) => {
        console.log(`[Gemini Live] WebSocket closed with code ${event.code}`);
        cleanupAudioAndSocket();
        setStatusText(ui.disconnected);
      };
    } catch (err) {
      console.error('[Gemini Live] Initialization error:', err);
      cleanupAudioAndSocket();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage(ui.micPermissionDenied);
      } else {
        setErrorMessage(err.message || 'Failed to initialize Live voice uplink');
      }
      setStatusText(ui.error);
    }
  }, [cleanupAudioAndSocket, isAiSpeaking, isMicMuted, playAudioChunk, selectedVoice, stopAudioPlayback, ui]);

  // Clean up when unmounting
  useEffect(() => {
    return () => {
      cleanupAudioAndSocket();
    };
  }, [cleanupAudioAndSocket]);

  // Toggle Mute
  const toggleMute = () => {
    setIsMicMuted((prev) => !prev);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`w-full max-w-2xl bg-[#010409]/95 border border-cyan-500/40 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.3)] flex flex-col overflow-hidden text-slate-100 font-sans ${className}`}
            style={{
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(6, 182, 212, 0.25)'
            }}
          >
            {/* Top Atmospheric Glow Line */}
            <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

            {/* Header */}
            <div className="px-4 py-3.5 bg-slate-950/90 border-b border-cyan-500/20 flex items-center justify-between gap-3 select-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                  isConnected
                    ? 'bg-cyan-950/90 border-cyan-400/60 text-cyan-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}>
                  <Radio className={`w-4 h-4 ${isConnected ? 'animate-pulse' : ''}`} />
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                    isConnected ? 'bg-emerald-400' : isConnecting ? 'bg-amber-400 animate-ping' : 'bg-rose-500'
                  }`} />
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-white font-['Orbitron'] tracking-wider truncate">
                      {ui.title}
                    </h3>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 uppercase tracking-widest hidden sm:inline">
                      LIVE BIDI
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400/80 truncate">
                    {ui.dsnTelemetry}
                  </span>
                </div>
              </div>

              {/* Header Right Controls */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Voice Persona Selector */}
                <select
                  value={selectedVoice}
                  disabled={isConnected}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg bg-slate-900 border border-cyan-500/30 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-50 cursor-pointer hidden sm:inline-block"
                  title={ui.selectVoice}
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id} className="bg-slate-950 text-slate-200">
                      {v.name}
                    </option>
                  ))}
                </select>

                {onClose && (
                  <button
                    type="button"
                    onClick={() => {
                      cleanupAudioAndSocket();
                      onClose();
                    }}
                    className="p-1.5 rounded-lg border border-slate-800 hover:border-rose-500/50 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                    title="Close Voice Link"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Main Interactive Stage */}
            <div className="p-5 sm:p-6 flex flex-col items-center justify-center space-y-6 bg-gradient-to-b from-[#010409] via-slate-950/90 to-[#010409]">
              {/* Central Glowing Orb & Waveform */}
              <div className="relative flex items-center justify-center w-36 h-36 sm:w-44 sm:h-44">
                {/* Outer pulsing atmospheric rings */}
                <motion.div
                  animate={{
                    scale: isConnected ? [1, 1.15 + (isAiSpeaking ? aiLevel * 0.4 : micLevel * 0.4), 1] : 1,
                    opacity: isConnected ? [0.25, 0.6, 0.25] : 0.1
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-500/30 to-blue-600/30 blur-xl"
                />

                {/* Secondary ring */}
                <div className={`absolute inset-3 rounded-full border border-dashed transition-all duration-300 ${
                  isConnected 
                    ? (isAiSpeaking ? 'border-cyan-400 animate-spin' : 'border-cyan-500/40') 
                    : 'border-slate-800'
                }`} style={{ animationDuration: '18s' }} />

                {/* Core Sphere */}
                <div className={`relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center border shadow-2xl transition-all duration-300 ${
                  isConnected
                    ? (isAiSpeaking 
                        ? 'bg-cyan-950/90 border-cyan-400 shadow-[0_0_40px_rgba(6,182,212,0.6)] text-cyan-200' 
                        : 'bg-slate-950 border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.3)] text-cyan-300')
                    : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}>
                  {isAiSpeaking ? (
                    <Volume2 className="w-8 h-8 sm:w-10 sm:h-10 animate-bounce text-cyan-300" />
                  ) : isConnected ? (
                    <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-cyan-400" />
                  ) : (
                    <Radio className="w-8 h-8 sm:w-10 sm:h-10 text-slate-500" />
                  )}

                  <span className="text-[9px] font-mono font-bold uppercase mt-1 tracking-wider">
                    {isAiSpeaking ? 'TRANSMITTING' : isConnected ? 'LISTENING' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              {/* Live Audio Visualizer Bars */}
              <div className="flex items-center justify-center gap-1.5 h-10 w-full max-w-xs px-4">
                {[...Array(16)].map((_, i) => {
                  const level = isAiSpeaking ? aiLevel : (isConnected && !isMicMuted ? micLevel : 0.05);
                  const dynamicHeight = Math.max(6, Math.min(36, Math.sin((i / 16) * Math.PI) * (level * 40) + Math.random() * 8));

                  return (
                    <motion.div
                      key={i}
                      animate={{ height: isConnected ? dynamicHeight : 4 }}
                      transition={{ duration: 0.08 }}
                      className={`w-1 rounded-full transition-colors ${
                        isAiSpeaking
                          ? 'bg-gradient-to-t from-cyan-500 to-sky-300'
                          : isConnected && !isMicMuted
                          ? 'bg-gradient-to-t from-emerald-500 to-cyan-400'
                          : 'bg-slate-800'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Status Indicator Text */}
              <div className="text-center space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    isConnected 
                      ? (isAiSpeaking ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400 animate-pulse') 
                      : isConnecting 
                      ? 'bg-amber-400 animate-ping' 
                      : 'bg-slate-600'
                  }`} />
                  <p className="text-xs sm:text-sm font-mono text-cyan-300 font-semibold tracking-wide">
                    {statusText}
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
                  {ui.subtitle}
                </p>
              </div>

              {/* Error Alert if any */}
              {errorMessage && (
                <div className="w-full max-w-md p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-semibold">Comms Warning: </span>
                    <span>{errorMessage}</span>
                  </div>
                </div>
              )}

              {/* Primary Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 w-full">
                {!isConnected ? (
                  <button
                    type="button"
                    onClick={startLiveVoiceSession}
                    disabled={isConnecting}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold font-['Orbitron'] text-xs sm:text-sm tracking-wider flex items-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.4)] transition hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Radio className="w-4 h-4" />
                    <span>{isConnecting ? ui.connecting : ui.startVoice}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={cleanupAudioAndSocket}
                      className="px-5 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-700/80 text-rose-200 font-mono text-xs sm:text-sm flex items-center gap-2 transition hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <Square className="w-4 h-4 text-rose-400" />
                      <span>{ui.stopVoice}</span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleMute}
                      className={`px-4 py-2.5 rounded-xl border font-mono text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                        isMicMuted
                          ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                          : 'bg-slate-900 hover:bg-slate-800 border-cyan-500/40 text-cyan-300'
                      }`}
                      title={isMicMuted ? ui.unmuteMic : ui.muteMic}
                    >
                      {isMicMuted ? <MicOff className="w-4 h-4 text-amber-400" /> : <Mic className="w-4 h-4" />}
                      <span>{isMicMuted ? ui.unmuteMic : ui.muteMic}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Live Comms Transcripts Feed */}
            {transcripts.length > 0 && (
              <div className="px-4 py-3 bg-slate-950 border-t border-cyan-950/80 max-h-44 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-cyan-900/40">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400 uppercase tracking-wider mb-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  <span>{ui.transcriptTitle}</span>
                </div>
                {transcripts.map((t) => (
                  <div key={t.id} className="text-xs font-mono flex items-start gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 shrink-0 font-bold">
                      {ui.novaBadge}
                    </span>
                    <span className="text-slate-300 leading-relaxed">{t.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Footer Telemetry strip */}
            <div className="px-4 py-2.5 bg-[#010409] border-t border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono text-slate-400 gap-2">
              <div className="flex items-center gap-2 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-cyan-400/90 font-bold">{ui.modelTag}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-slate-500">PCM 16k In • 24k Out</span>
                <span className="text-slate-600">|</span>
                <span className="text-emerald-400">WebSocket Bidi Active</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default memo(GeminiLiveVoice);
