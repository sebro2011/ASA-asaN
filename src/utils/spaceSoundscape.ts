/**
 * Pure Web Audio API Deep Space Soundscape Synthesizer
 * Re-creates the rich, ethereal, multi-chord ambient space pad & crystalline shimmer
 * matching the serene interstellar soundscape.
 */

interface ChordVoices {
  nodes: (OscillatorNode | GainNode | BiquadFilterNode)[];
  gain: GainNode;
}

class DeepSpaceSoundscape {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private volume: number = 0.7; // Default 70% volume
  private masterGain: GainNode | null = null;
  private delayLeft: DelayNode | null = null;
  private delayRight: DelayNode | null = null;
  private feedbackGain: GainNode | null = null;
  private chordInterval: any = null;
  private activeVoices: ChordVoices[] = [];
  private currentChordIndex: number = 0;

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain && this.isPlaying) {
      // Scaled master gain (max 0.35 for pleasant headphone listening)
      const targetGain = this.volume * this.volume * 0.35;
      this.masterGain.gain.setValueAtTime(targetGain, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  // Atmospheric Ambient Chords (Frequencies in Hz)
  // Cmaj9, Fmaj7, Am9, Gsus4
  private chords = [
    // Cmaj9: C2 (65.41), G2 (98.0), C3 (130.81), E3 (164.81), G3 (196.0), B3 (246.94), D4 (293.66)
    [65.41, 98.0, 130.81, 164.81, 196.0, 246.94, 293.66],
    // Fmaj7: F2 (87.31), C3 (130.81), F3 (174.61), A3 (220.0), C4 (261.63), E4 (329.63)
    [87.31, 130.81, 174.61, 220.0, 261.63, 329.63],
    // Am9: A1 (55.0), E2 (82.41), A2 (110.0), C3 (130.81), E3 (164.81), G3 (196.0), B3 (246.94)
    [55.0, 82.41, 110.0, 130.81, 164.81, 196.0, 246.94],
    // Gsus4: G1 (49.0), D2 (73.42), G2 (98.0), C3 (130.81), D3 (146.83), G3 (196.0)
    [49.0, 73.42, 98.0, 130.81, 146.83, 196.0]
  ];

  // Crystalline Star Shimmer Frequencies
  private shimmerFreqs = [1046.5, 1318.51, 1567.98, 1975.53];

  public toggle(): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public start() {
    if (this.isPlaying) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      // Master Gain Node
      this.masterGain = this.ctx.createGain();
      const targetGain = this.volume * this.volume * 0.35;
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 2.5);

      // Stereo Space Delay Network (380ms Left, 520ms Right for spacious reverb diffusion)
      this.delayLeft = this.ctx.createDelay();
      this.delayLeft.delayTime.setValueAtTime(0.38, this.ctx.currentTime);

      this.delayRight = this.ctx.createDelay();
      this.delayRight.delayTime.setValueAtTime(0.52, this.ctx.currentTime);

      this.feedbackGain = this.ctx.createGain();
      this.feedbackGain.gain.setValueAtTime(0.42, this.ctx.currentTime);

      // Connect Delay Feedback Loop
      this.delayLeft.connect(this.feedbackGain);
      this.delayRight.connect(this.feedbackGain);
      this.feedbackGain.connect(this.delayLeft);
      this.feedbackGain.connect(this.delayRight);

      this.delayLeft.connect(this.masterGain);
      this.delayRight.connect(this.masterGain);

      this.masterGain.connect(this.ctx.destination);

      // Play First Ambient Space Pad Chord
      this.currentChordIndex = 0;
      this.playChord(this.chords[0], 9.0);

      // Schedule Ethereal Breathing Chord Progressions (Swelling every 8.5 seconds)
      this.chordInterval = setInterval(() => {
        if (!this.isPlaying || !this.ctx) return;
        this.currentChordIndex = (this.currentChordIndex + 1) % this.chords.length;
        this.playChord(this.chords[this.currentChordIndex], 8.5);
      }, 8500);

      // Add Crystalline High Star Shimmer Layer
      this.startStarShimmer();

      // Add Deep Sub-Bass Drone Layer (32.7Hz - C1)
      this.startSubDrone();

      this.isPlaying = true;
    } catch (e) {
      console.warn('Deep Space Soundscape error:', e);
    }
  }

  private playChord(freqs: number[], durationSec: number) {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const chordGain = this.ctx.createGain();

    // Warm Lowpass Filter for soft analog synth pad character
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, now);
    filter.Q.setValueAtTime(2.2, now);

    // Filter Sweep LFO (Breathing motion)
    filter.frequency.linearRampToValueAtTime(1100, now + durationSec * 0.45);
    filter.frequency.linearRampToValueAtTime(450, now + durationSec);

    // Chord Volume Envelope (Attack & Release swell)
    chordGain.gain.setValueAtTime(0.001, now);
    chordGain.gain.linearRampToValueAtTime(0.22, now + durationSec * 0.4);
    chordGain.gain.linearRampToValueAtTime(0.001, now + durationSec + 1.2);

    const voiceNodes: (OscillatorNode | GainNode | BiquadFilterNode)[] = [chordGain, filter];

    freqs.forEach((freq, idx) => {
      if (!this.ctx) return;
      // Dual detuned oscillators per note for rich chorus texture
      [0, 3.5, -3.5].forEach((detune) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        osc.type = idx < 2 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime(detune, now);

        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.12 / freqs.length, now);

        osc.connect(oscGain);
        oscGain.connect(filter);
        osc.start(now);
        osc.stop(now + durationSec + 1.5);

        voiceNodes.push(osc, oscGain);
      });
    });

    filter.connect(chordGain);
    chordGain.connect(this.masterGain);
    if (this.delayLeft) chordGain.connect(this.delayLeft);

    // Track active voices for cleanup
    const voiceObj: ChordVoices = { nodes: voiceNodes, gain: chordGain };
    this.activeVoices.push(voiceObj);

    // Clean up expired nodes
    setTimeout(() => {
      const idx = this.activeVoices.indexOf(voiceObj);
      if (idx !== -1) {
        this.activeVoices.splice(idx, 1);
      }
    }, (durationSec + 2) * 1000);
  }

  private startStarShimmer() {
    if (!this.ctx || !this.masterGain) return;

    this.shimmerFreqs.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Tremolo LFO for celestial twinkle
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.15 + i * 0.08, now);

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(0.012, now);

      const shimmerGain = this.ctx.createGain();
      shimmerGain.gain.setValueAtTime(0.015, now);

      lfo.connect(lfoGain);
      lfoGain.connect(shimmerGain.gain);

      osc.connect(shimmerGain);
      shimmerGain.connect(this.masterGain);
      if (this.delayRight) shimmerGain.connect(this.delayRight);

      osc.start(now);
      lfo.start(now);
    });
  }

  private startSubDrone() {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(32.7, now); // C1 Sub-bass

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.28, now);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
  }

  public stop() {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;

    try {
      if (this.chordInterval) {
        clearInterval(this.chordInterval);
        this.chordInterval = null;
      }

      // Smooth 1.5 second fade out
      this.masterGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

      setTimeout(() => {
        if (this.ctx) {
          try { this.ctx.close(); } catch {}
        }
        this.ctx = null;
        this.activeVoices = [];
        this.isPlaying = false;
      }, 1600);
    } catch {
      this.isPlaying = false;
    }
  }
}

export const spaceSoundscape = new DeepSpaceSoundscape();
