'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Radio, 
  Play, 
  Pause, 
  Sliders, 
  Sparkles, 
  Wind, 
  Activity, 
  Compass,
  Headphones,
  Check
} from 'lucide-react';

/**
 * Procedural Web Audio API Planetary Soundscape Synthesizer
 * Generates authentic acoustic simulations of:
 * 1. Voyager Interstellar Plasma Waves (PWS Instrument)
 * 2. Mars Jezero Crater Surface Wind (SuperCam Microphones)
 * 3. Vela Pulsar Radio Frequency Beacon (PSR B0833-45)
 */
class PlanetaryAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.currentTrackNodes = [];
    this.analyser = null;
    this.isPlaying = false;
    this.currentTrackId = 'voyager';
    this.volume = 0.45;
  }

  init() {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.ctx && AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;

        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch {
      // Audio context policy ignored
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(this.volume, this.ctx.currentTime + 0.05);
    }
  }

  stopCurrent() {
    this.currentTrackNodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch {}
    });
    this.currentTrackNodes = [];
    this.isPlaying = false;
  }

  // 1. Voyager Plasma Wave Synthesizer
  playVoyager() {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.masterGain) return;
    this.stopCurrent();

    const now = this.ctx.currentTime;

    // Carrier Drone
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(142, now);

    // FM Modulator (Cosmic Plasma Flutter)
    const modulator = this.ctx.createOscillator();
    modulator.type = 'triangle';
    modulator.frequency.setValueAtTime(1.8, now);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(32, now);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    // Resonant Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, now);
    filter.Q.setValueAtTime(4.5, now);

    // Second harmonic whistle
    const whistle = this.ctx.createOscillator();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(1240, now);

    const whistleGain = this.ctx.createGain();
    whistleGain.gain.setValueAtTime(0.08, now);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.35, now);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(450, now);
    lfo.connect(lfoGain);
    lfoGain.connect(whistle.frequency);

    // Connect
    carrier.connect(filter);
    whistle.connect(whistleGain);
    whistleGain.connect(filter);
    filter.connect(this.masterGain);

    carrier.start();
    modulator.start();
    whistle.start();
    lfo.start();

    this.currentTrackNodes = [carrier, modulator, modGain, filter, whistle, whistleGain, lfo, lfoGain];
    this.isPlaying = true;
    this.currentTrackId = 'voyager';
  }

  // 2. Mars Surface Wind Gust Synthesizer
  playMarsWind() {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.masterGain) return;
    this.stopCurrent();

    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // Generate Brown Noise (deeper and more natural than white noise)
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Resonant Lowpass Filter for atmospheric howling
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, this.ctx.currentTime);
    filter.Q.setValueAtTime(3.2, this.ctx.currentTime);

    // Gust Modulation LFO
    const gustLfo = this.ctx.createOscillator();
    gustLfo.frequency.setValueAtTime(0.2, this.ctx.currentTime);

    const gustGain = this.ctx.createGain();
    gustGain.gain.setValueAtTime(90, this.ctx.currentTime);
    gustLfo.connect(gustGain);
    gustGain.connect(filter.frequency);

    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(windGain);
    windGain.connect(this.masterGain);

    whiteNoise.start();
    gustLfo.start();

    this.currentTrackNodes = [whiteNoise, filter, gustLfo, gustGain, windGain];
    this.isPlaying = true;
    this.currentTrackId = 'mars';
  }

  // 3. Pulsar Radio Beacon Synthesizer
  playPulsar() {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.masterGain) return;
    this.stopCurrent();

    const now = this.ctx.currentTime;

    // Rhythmic 11.2 Hz pulses
    const pulseOsc = this.ctx.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.setValueAtTime(85, now);

    const pulseAmp = this.ctx.createGain();
    pulseAmp.gain.setValueAtTime(0.01, now);

    const clickLfo = this.ctx.createOscillator();
    clickLfo.type = 'square';
    clickLfo.frequency.setValueAtTime(11.2, now); // Vela pulsar rate

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.22, now);
    clickLfo.connect(clickGain);
    clickGain.connect(pulseAmp.gain);

    pulseOsc.connect(pulseAmp);
    pulseAmp.connect(this.masterGain);

    pulseOsc.start();
    clickLfo.start();

    this.currentTrackNodes = [pulseOsc, pulseAmp, clickLfo, clickGain];
    this.isPlaying = true;
    this.currentTrackId = 'pulsar';
  }

  playTrack(trackId) {
    if (trackId === 'voyager') this.playVoyager();
    else if (trackId === 'mars') this.playMarsWind();
    else if (trackId === 'pulsar') this.playPulsar();
  }
}

// Global Singleton Audio Engine
export const planetaryAudio = new PlanetaryAudioEngine();

/**
 * Ambient Space Soundscape Full Control Component
 */
export function SpaceAudioPlayer({ className = '', lang = 'en' }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState('voyager');
  const [volume, setVolume] = useState(45);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  const TRACKS = [
    {
      id: 'voyager',
      name: lang === 'si' ? 'වොයේජර් ප්ලාස්මා තරංග' : lang === 'ta' ? 'வாயேஜர் பிளாஸ்மா அலைகள்' : 'Voyager Plasma Waves',
      desc: lang === 'si' ? 'අන්තර් තාරකා ප්ලාස්මා කම්පනය (PWS උපකරණය)' : lang === 'ta' ? 'விண்மீன் இடை பிளாஸ்மா அதிர்வு' : 'Interstellar plasma resonance (Voyager 1 PWS)',
      icon: Radio,
      badge: 'INTERSTELLAR'
    },
    {
      id: 'mars',
      name: lang === 'si' ? 'අඟහරු සුළං හඬ' : lang === 'ta' ? 'செவ்வாய் காற்று சத்தம்' : 'Mars Surface Wind',
      desc: lang === 'si' ? 'ජෙසීරෝ ආවාටයේ වායුගෝලීය සුළඟ (Perseverance)' : lang === 'ta' ? 'ஜெசிரோ பள்ள வளிமண்டல காற்று' : 'Jezero crater acoustic gusts (Perseverance SuperCam)',
      icon: Wind,
      badge: 'MARS 748 Pa'
    },
    {
      id: 'pulsar',
      name: lang === 'si' ? 'වේලා පල්සර් සංඛ්‍යාතය' : lang === 'ta' ? 'வேலா பல்சர் அலைவரிசை' : 'Vela Pulsar Beacon',
      desc: lang === 'si' ? 'තත්පරයට ස්පන්දන 11.2ක විද්‍යුත් චුම්භක සංඛ්‍යාතය' : lang === 'ta' ? 'வினாடிக்கு 11.2 துடிப்பு மின்காந்த அதிர்வு' : '11.2 Hz electromagnetic pulses (PSR B0833-45)',
      icon: Activity,
      badge: '11.2 Hz'
    }
  ];

  const handleTogglePlay = () => {
    if (isPlaying) {
      planetaryAudio.stopCurrent();
      setIsPlaying(false);
    } else {
      planetaryAudio.playTrack(currentTrack);
      setIsPlaying(true);
    }
  };

  const handleSelectTrack = (trackId) => {
    setCurrentTrack(trackId);
    planetaryAudio.playTrack(trackId);
    setIsPlaying(true);
  };

  const handleVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    planetaryAudio.setVolume(val / 100);
  };

  // Real-time Canvas Waveform Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(32);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (planetaryAudio.analyser && isPlaying) {
        planetaryAudio.analyser.getByteFrequencyData(dataArray);

        const barWidth = canvas.width / 16;
        for (let i = 0; i < 16; i++) {
          const val = dataArray[i * 2] / 255;
          const barHeight = Math.max(3, val * canvas.height * 0.9);
          const x = i * barWidth;
          const y = canvas.height - barHeight;

          const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
          grad.addColorStop(0, '#22d3ee');
          grad.addColorStop(1, '#6366f1');

          ctx.fillStyle = grad;
          ctx.fillRect(x + 1.5, y, barWidth - 3, barHeight);
        }
      } else {
        // Idle baseline wave
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        for (let i = 0; i < 16; i++) {
          const barWidth = canvas.width / 16;
          ctx.fillRect(i * barWidth + 1.5, canvas.height - 4, barWidth - 3, 3);
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  return (
    <div className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 font-sans text-slate-100 ${className}`}>
      {/* Top Banner */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 p-0.5 flex items-center justify-center shadow-md shrink-0">
            <Headphones className="w-5 h-5 text-white" />
            {isPlaying && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-ping" />
            )}
          </div>
          <div>
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-semibold leading-none">
              NASA Planetary Acoustic Telemetry
            </span>
            <h3 className="text-base font-bold font-['Orbitron'] text-white leading-tight mt-1">
              {lang === 'si' ? 'අභ්‍යවකාශ සංගීත හා ශබ්ද තරංග' :
               lang === 'ta' ? 'விண்வெளி ஒலி அலைகள்' :
               'Deep Space Ambient Soundscape'}
            </h3>
          </div>
        </div>

        {/* Master Play/Stop Button */}
        <button
          type="button"
          onClick={handleTogglePlay}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 shadow-md ${
            isPlaying 
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 hover:bg-rose-500/30' 
              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 hover:bg-cyan-500/30'
          }`}
        >
          {isPlaying ? (
            <>
              <Pause className="w-4 h-4 text-rose-400" />
              <span>{lang === 'si' ? 'නවත්වන්න' : lang === 'ta' ? 'நிறுத்து' : 'Mute Soundscape'}</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 text-cyan-400" />
              <span>{lang === 'si' ? 'වාදනය කරන්න' : lang === 'ta' ? 'ஒலிக்கவும்' : 'Play Soundscape'}</span>
            </>
          )}
        </button>
      </div>

      {/* Visualizer & Track Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TRACKS.map(t => {
          const Icon = t.icon;
          const isSelected = currentTrack === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelectTrack(t.id)}
              className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
                isSelected && isPlaying
                  ? 'bg-slate-800/90 border-cyan-400 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-400/50'
                  : isSelected
                  ? 'bg-slate-800/60 border-slate-700'
                  : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${isSelected && isPlaying ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-900 text-slate-400'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-xs text-white">{t.name}</span>
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                  {t.badge}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                {t.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Volume & Spectrum Visualizer Strip */}
      <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {volume === 0 ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={handleVolumeChange}
            className="w-32 sm:w-40 h-1.5 bg-slate-800 rounded-lg accent-cyan-400 cursor-pointer"
            title="Volume"
          />
          <span className="text-xs font-mono text-slate-400">{volume}%</span>
        </div>

        {/* Real-time Spectrum Canvas */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500">SPECTRUM:</span>
          <canvas
            ref={canvasRef}
            width={96}
            height={22}
            className="rounded bg-slate-950/80 border border-slate-800"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Compact Dashboard Header Mute/Unmute Cosmic Button
 */
export function CosmicAudioHeaderButton({ lang = 'en' }) {
  const [isPlaying, setIsPlaying] = useState(false);

  const toggleSound = () => {
    if (isPlaying) {
      planetaryAudio.stopCurrent();
      setIsPlaying(false);
    } else {
      planetaryAudio.playTrack('voyager');
      setIsPlaying(true);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleSound}
      className={`px-2.5 py-1 rounded-full border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
        isPlaying
          ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300 ring-1 ring-cyan-400/40 shadow-cyan-950/50'
          : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
      }`}
      title={isPlaying ? 'Mute Ambient Space Soundscape' : 'Play Voyager Plasma Waves Soundscape'}
    >
      {isPlaying ? (
        <>
          <div className="flex items-center gap-0.5 h-3">
            <span className="w-0.5 h-2 bg-cyan-400 animate-pulse" />
            <span className="w-0.5 h-3 bg-cyan-300 animate-bounce" />
            <span className="w-0.5 h-1.5 bg-cyan-400 animate-pulse" />
          </div>
          <span className="text-[10px] font-bold text-cyan-200 hidden sm:inline">SPACE AUDIO</span>
        </>
      ) : (
        <>
          <VolumeX className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] hidden sm:inline">SOUNDSCAPE</span>
        </>
      )}
    </button>
  );
}

export default memo(SpaceAudioPlayer);
