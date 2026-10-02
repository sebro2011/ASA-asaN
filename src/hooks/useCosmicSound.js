'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useCosmicSound Hook
 * Generates an ambient, synthesized low-frequency deep-space drone using the Web Audio API.
 * 100% Keyless & Client-Side with smooth gain fade in/out and visibility handling.
 */
export function useCosmicSound(initialAutoPlay = false) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState(0.35);

  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const nodesRef = useRef([]);

  const cleanupAudio = useCallback(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      try {
        const now = audioCtxRef.current.currentTime;
        masterGainRef.current.gain.setValueAtTime(masterGainRef.current.gain.value, now);
        masterGainRef.current.gain.linearRampToValueAtTime(0.0001, now + 0.8);
      } catch {}
    }

    setTimeout(() => {
      nodesRef.current.forEach(node => {
        try { node.stop?.(); } catch {}
        try { node.disconnect?.(); } catch {}
      });
      nodesRef.current = [];
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { audioCtxRef.current.close(); } catch {}
        audioCtxRef.current = null;
      }
    }, 900);
  }, []);

  const startSoundscape = useCallback(async () => {
    try {
      cleanupAudio();

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      // Master Gain
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(isMuted ? 0.0001 : volume, ctx.currentTime + 1.8);
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      // 1. Deep Fundamental Sub-Bass Oscillator (43.65 Hz - F1 note / Cosmic Resonance)
      const oscSub = ctx.createOscillator();
      oscSub.type = 'sine';
      oscSub.frequency.setValueAtTime(43.65, ctx.currentTime);

      const oscSubGain = ctx.createGain();
      oscSubGain.gain.setValueAtTime(0.4, ctx.currentTime);
      oscSub.connect(oscSubGain);
      oscSubGain.connect(masterGain);
      oscSub.start();
      nodesRef.current.push(oscSub, oscSubGain);

      // 2. Harmonic Drone Oscillator (87.3 Hz with slow LFO pulse)
      const oscHarmonic = ctx.createOscillator();
      oscHarmonic.type = 'triangle';
      oscHarmonic.frequency.setValueAtTime(87.3, ctx.currentTime);

      // Low-pass filter for warm cosmic warmth
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, ctx.currentTime);
      filter.Q.setValueAtTime(3, ctx.currentTime);

      // Slow LFO for breathing planetary atmosphere
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.08, ctx.currentTime); // 12.5s cycle
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(60, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      oscHarmonic.connect(filter);
      filter.connect(masterGain);
      oscHarmonic.start();
      nodesRef.current.push(oscHarmonic, filter, lfo, lfoGain);

      // 3. Shimmering High Space Dust (Filtered Noise)
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        output[i] = (b0 + b1 + b2) * 0.05;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(680, ctx.currentTime);
      bandpass.Q.setValueAtTime(4.0, ctx.currentTime);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.08, ctx.currentTime);

      whiteNoise.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(masterGain);
      whiteNoise.start();
      nodesRef.current.push(whiteNoise, bandpass, noiseGain);

      setIsPlaying(true);
    } catch (err) {
      console.warn('Web Audio synthesis initialisation deferred:', err);
    }
  }, [cleanupAudio, isMuted, volume]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      cleanupAudio();
      setIsPlaying(false);
    } else {
      startSoundscape();
    }
  }, [cleanupAudio, isPlaying, startSoundscape]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      if (masterGainRef.current && audioCtxRef.current) {
        const now = audioCtxRef.current.currentTime;
        masterGainRef.current.gain.cancelScheduledValues(now);
        masterGainRef.current.gain.linearRampToValueAtTime(next ? 0.0001 : volume, now + 0.2);
      }
      return next;
    });
  }, [volume]);

  // Handle Tab visibility change (auto-pause on hidden, resume on visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isPlaying) {
        if (masterGainRef.current && audioCtxRef.current) {
          masterGainRef.current.gain.setValueAtTime(0.0001, audioCtxRef.current.currentTime);
        }
      } else if (document.visibilityState === 'visible' && isPlaying && !isMuted) {
        if (masterGainRef.current && audioCtxRef.current) {
          masterGainRef.current.gain.setValueAtTime(volume, audioCtxRef.current.currentTime);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isMuted, isPlaying, volume]);

  useEffect(() => {
    if (initialAutoPlay) {
      startSoundscape();
    }
    return () => {
      cleanupAudio();
    };
  }, []);

  return {
    isPlaying,
    isMuted,
    volume,
    togglePlay,
    toggleMute,
    startSoundscape,
    stopSoundscape: cleanupAudio
  };
}

export default useCosmicSound;
