'use client';

import React, { useState, useRef, useMemo, useEffect, useCallback, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Sparkles, Float } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Rocket, 
  Flame, 
  Gauge, 
  Activity, 
  Radio, 
  Compass, 
  Play, 
  RotateCcw, 
  Square, 
  Eye, 
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX, 
  Sparkles as SparklesIcon, 
  ShieldAlert, 
  CheckCircle2, 
  TrendingUp,
  Cpu,
  Layers,
  ChevronRight
} from 'lucide-react';
import DynamicStarfield from '../src/components/DynamicStarfield.jsx';

// =================================================================
// 1. PROCEDURAL 3D ROCKET MESH COMPONENT
// =================================================================
function ProceduralSpaceVehicle({ 
  flightStage, 
  thrustIntensity, 
  altitude, 
  rollAngle,
  separated = false 
}) {
  const rocketGroupRef = useRef();
  const plumeRef = useRef();
  const innerFlameRef = useRef();
  const srbLeftPlumeRef = useRef();
  const srbRightPlumeRef = useRef();

  // Engine Bell and Fuselage Materials
  const materials = useMemo(() => {
    return {
      coreFoam: new THREE.MeshStandardMaterial({
        color: '#ea580c', // SLS Core Orange Foam
        roughness: 0.65,
        metalness: 0.15
      }),
      coreWhite: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.3,
        metalness: 0.3
      }),
      darkCarbon: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.4,
        metalness: 0.7
      }),
      metallicGold: new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        roughness: 0.2,
        metalness: 0.85
      }),
      engineBell: new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.3,
        metalness: 0.9
      }),
      flameCore: new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.95
      }),
      flameOuter: new THREE.MeshBasicMaterial({
        color: '#f97316',
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      })
    };
  }, []);

  // Frame update for engine flame pulsation and vehicle micro-jitter
  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    if (thrustIntensity > 0) {
      // Dynamic plume expansion & flicker
      const flicker = 1.0 + Math.sin(time * 45) * 0.15 + (Math.random() - 0.5) * 0.1;
      const plumeScaleY = thrustIntensity * flicker * 2.8;
      const plumeScaleXZ = (1.0 + (altitude / 400) * 1.5) * (0.8 + Math.random() * 0.2); // Expands in vacuum!

      if (plumeRef.current) {
        plumeRef.current.scale.set(plumeScaleXZ, plumeScaleY, plumeScaleXZ);
      }
      if (innerFlameRef.current) {
        innerFlameRef.current.scale.set(plumeScaleXZ * 0.6, plumeScaleY * 0.85, plumeScaleXZ * 0.6);
      }
      if (srbLeftPlumeRef.current && !separated) {
        srbLeftPlumeRef.current.scale.set(0.7, plumeScaleY * 0.9, 0.7);
      }
      if (srbRightPlumeRef.current && !separated) {
        srbRightPlumeRef.current.scale.set(0.7, plumeScaleY * 0.9, 0.7);
      }
    } else {
      if (plumeRef.current) plumeRef.current.scale.set(0.001, 0.001, 0.001);
      if (innerFlameRef.current) innerFlameRef.current.scale.set(0.001, 0.001, 0.001);
      if (srbLeftPlumeRef.current) srbLeftPlumeRef.current.scale.set(0.001, 0.001, 0.001);
      if (srbRightPlumeRef.current) srbRightPlumeRef.current.scale.set(0.001, 0.001, 0.001);
    }

    // Vehicle slight roll program
    if (rocketGroupRef.current) {
      rocketGroupRef.current.rotation.y = rollAngle;
    }
  });

  return (
    <group ref={rocketGroupRef}>
      {/* 1. Main Core Stage Fuselage (Orange External Tank / Core) */}
      <mesh position={[0, 1.2, 0]} material={materials.coreFoam} castShadow receiveShadow>
        <cylinderGeometry args={[0.7, 0.7, 4.8, 32]} />
      </mesh>

      {/* Black and white roll pattern bands */}
      <mesh position={[0, 3.2, 0]} material={materials.darkCarbon}>
        <cylinderGeometry args={[0.705, 0.705, 0.35, 32]} />
      </mesh>
      <mesh position={[0, -0.8, 0]} material={materials.coreWhite}>
        <cylinderGeometry args={[0.705, 0.705, 0.45, 32]} />
      </mesh>

      {/* 2. Upper Stage (Interstage + ICPS) */}
      <mesh position={[0, 4.0, 0]} material={materials.coreWhite}>
        <cylinderGeometry args={[0.62, 0.7, 1.2, 32]} />
      </mesh>

      {/* 3. Orion Crew Capsule & Heat Shield */}
      <mesh position={[0, 4.9, 0]} material={materials.darkCarbon}>
        <coneGeometry args={[0.65, 0.75, 32]} />
      </mesh>

      {/* Launch Abort System (LAS) Tower on top */}
      <mesh position={[0, 5.7, 0]} material={materials.coreWhite}>
        <cylinderGeometry args={[0.08, 0.12, 1.0, 16]} />
      </mesh>
      <mesh position={[0, 6.3, 0]} material={materials.coreWhite}>
        <coneGeometry args={[0.16, 0.4, 16]} />
      </mesh>

      {/* 4. Core Base Engine Section (4x Main RS-25 Bell Nozzles) */}
      <group position={[0, -1.3, 0]}>
        {[
          [-0.25, -0.25],
          [0.25, -0.25],
          [-0.25, 0.25],
          [0.25, 0.25]
        ].map(([nx, nz], i) => (
          <mesh key={i} position={[nx, -0.2, nz]} material={materials.engineBell}>
            <coneGeometry args={[0.18, 0.45, 16]} />
          </mesh>
        ))}

        {/* Dynamic Core Engine Exhaust Plume */}
        <group position={[0, -0.45, 0]}>
          {/* Inner White Flame Core */}
          <mesh ref={innerFlameRef} position={[0, -1.0, 0]} rotation={[Math.PI, 0, 0]} material={materials.flameCore}>
            <coneGeometry args={[0.42, 2.2, 24]} />
          </mesh>

          {/* Outer Radiant Orange Flame */}
          <mesh ref={plumeRef} position={[0, -1.5, 0]} rotation={[Math.PI, 0, 0]} material={materials.flameOuter}>
            <coneGeometry args={[0.75, 3.2, 24]} />
          </mesh>

          {/* Downward Sparkles Shower */}
          {thrustIntensity > 0 && (
            <Sparkles
              count={70}
              scale={[1.4, 6.0, 1.4]}
              position={[0, -2.5, 0]}
              speed={5}
              size={3.2}
              color="#fb923c"
            />
          )}
        </group>
      </group>

      {/* 5. Solid Rocket Boosters (SRBs) Left & Right */}
      {!separated && (
        <>
          {/* Left SRB */}
          <group position={[-1.05, 0.6, 0]}>
            <mesh material={materials.coreWhite}>
              <cylinderGeometry args={[0.28, 0.28, 4.4, 24]} />
            </mesh>
            {/* SRB Nose Cone */}
            <mesh position={[0, 2.45, 0]} material={materials.coreWhite}>
              <coneGeometry args={[0.28, 0.65, 24]} />
            </mesh>
            {/* SRB Nozzle */}
            <mesh position={[0, -2.35, 0]} material={materials.engineBell}>
              <coneGeometry args={[0.22, 0.4, 16]} />
            </mesh>
            {/* Left SRB Plume */}
            <mesh ref={srbLeftPlumeRef} position={[0, -3.3, 0]} rotation={[Math.PI, 0, 0]} material={materials.flameOuter}>
              <coneGeometry args={[0.38, 2.2, 16]} />
            </mesh>
          </group>

          {/* Right SRB */}
          <group position={[1.05, 0.6, 0]}>
            <mesh material={materials.coreWhite}>
              <cylinderGeometry args={[0.28, 0.28, 4.4, 24]} />
            </mesh>
            {/* SRB Nose Cone */}
            <mesh position={[0, 2.45, 0]} material={materials.coreWhite}>
              <coneGeometry args={[0.28, 0.65, 24]} />
            </mesh>
            {/* SRB Nozzle */}
            <mesh position={[0, -2.35, 0]} material={materials.engineBell}>
              <coneGeometry args={[0.22, 0.4, 16]} />
            </mesh>
            {/* Right SRB Plume */}
            <mesh ref={srbRightPlumeRef} position={[0, -3.3, 0]} rotation={[Math.PI, 0, 0]} material={materials.flameOuter}>
              <coneGeometry args={[0.38, 2.2, 16]} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}

// =================================================================
// 2. LAUNCH PAD GANTRY & TERRESTRIAL HORIZON
// =================================================================
function LaunchPadEnvironment({ altitude }) {
  // Ground pad fades and moves downward as altitude grows
  const padOpacity = Math.max(0, 1.0 - altitude / 45);

  if (padOpacity <= 0) return null;

  return (
    <group position={[0, -2.2, 0]}>
      {/* Launch Pad Mobile Launcher Base */}
      <mesh position={[0, -0.6, 0]} receiveShadow>
        <boxGeometry args={[12, 1.2, 12]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>

      {/* Flame Trench Cutout */}
      <mesh position={[0, -0.8, 0]}>
        <boxGeometry args={[4, 1.4, 8]} />
        <meshStandardMaterial color="#090d16" roughness={0.9} />
      </mesh>

      {/* Tower Gantry (Mobile Launcher Tower) */}
      <group position={[2.8, 4.5, 0]}>
        <mesh>
          <boxGeometry args={[1.4, 10.5, 1.4]} />
          <meshStandardMaterial color="#64748b" wireframe={true} />
        </mesh>
        {/* Service Swing Arms */}
        <mesh position={[-1.2, 1.8, 0]}>
          <boxGeometry args={[1.6, 0.25, 0.3]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[-1.2, 3.8, 0]}>
          <boxGeometry args={[1.6, 0.25, 0.3]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      </group>

      {/* Horizon Pad Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color="#0f172a" roughness={0.95} />
      </mesh>
    </group>
  );
}

// =================================================================
// 3. CURVED EARTH SURFACE AT ORBITAL ALTITUDE
// =================================================================
function OrbitalEarthGlobe({ altitude }) {
  // Gradually reveal Earth curvature as rocket reaches high altitude
  const earthY = -120 - (400 - altitude) * 0.15;
  const earthVisible = altitude > 35;

  if (!earthVisible) return null;

  return (
    <group position={[0, earthY, -40]}>
      <mesh receiveShadow>
        <sphereGeometry args={[110, 64, 64]} />
        <meshStandardMaterial
          color="#0d3b66"
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>
      {/* Atmospheric Haze Rim */}
      <mesh>
        <sphereGeometry args={[112, 48, 48]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.35}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// =================================================================
// 4. DYNAMIC CAMERA CONTROLLER & SHAKE PHYSICS
// =================================================================
function CameraRigController({ 
  flightStage, 
  altitude, 
  cameraMode, 
  rocketY, 
  shakeIntensity, 
  controlsRef 
}) {
  const { camera } = useThree();
  const targetPosRef = useRef(new THREE.Vector3(0, 4, 14));
  const lookTargetRef = useRef(new THREE.Vector3(0, 2, 0));

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    // 1. Determine base target coordinates by camera mode
    if (cameraMode === 'PAD') {
      targetPosRef.current.set(0, 2, 14);
      lookTargetRef.current.set(0, Math.min(6, rocketY + 2), 0);
    } else if (cameraMode === 'CHASE') {
      targetPosRef.current.set(0, rocketY + 3.2, 11);
      lookTargetRef.current.set(0, rocketY + 2.5, 0);
    } else if (cameraMode === 'ORBIT') {
      targetPosRef.current.set(16, rocketY + 8, 22);
      lookTargetRef.current.set(0, rocketY + 2, 0);
    } else if (cameraMode === 'NOSE') {
      targetPosRef.current.set(0, rocketY + 6.8, 1.2);
      lookTargetRef.current.set(0, rocketY - 10, 0);
    }

    // 2. Smooth Lerp to Camera Position
    camera.position.lerp(targetPosRef.current, delta * 3.5);

    // 3. Realistic Dynamic Camera Shake Physics (Peak at Max-Q & Ignition)
    if (shakeIntensity > 0) {
      const shakeX = Math.sin(time * 52) * shakeIntensity * 0.45 + (Math.random() - 0.5) * shakeIntensity * 0.25;
      const shakeY = Math.cos(time * 44) * shakeIntensity * 0.45 + (Math.random() - 0.5) * shakeIntensity * 0.25;
      const shakeZ = Math.sin(time * 36) * shakeIntensity * 0.25;
      camera.position.x += shakeX;
      camera.position.y += shakeY;
      camera.position.z += shakeZ;
    }

    // 4. Update OrbitControls Target smoothly
    if (controlsRef.current) {
      controlsRef.current.target.lerp(lookTargetRef.current, delta * 4.0);
      controlsRef.current.update();
    }
  });

  return null;
}

// =================================================================
// 5. SYNTHESIZED WEB AUDIO ROCKET THRUSTER GENERATOR (Zero dependencies)
// =================================================================
class WebAudioRocketSynth {
  constructor() {
    this.ctx = null;
    this.noiseNode = null;
    this.filterNode = null;
    this.gainNode = null;
    this.isPlaying = false;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Create pink/brown noise buffer for deep rocket engine combustion rumble
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02; // Brown noise curve
        lastOut = output[i];
        output[i] *= 3.5;
      }

      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = noiseBuffer;
      this.noiseNode.loop = true;

      // Lowpass resonant filter for acoustic exhaust resonance
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 160;
      this.filterNode.Q.value = 3.0;

      // Master Gain
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0.0;

      this.noiseNode.connect(this.filterNode);
      this.filterNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
      this.noiseNode.start(0);
    } catch (_) {}
  }

  setVolume(vol, pitch = 160) {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.gainNode && this.filterNode) {
      this.gainNode.gain.setTargetAtTime(Math.min(0.8, Math.max(0, vol)), this.ctx.currentTime, 0.08);
      this.filterNode.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.08);
    }
  }

  // 1. Realistic Engine Ignition Sound Effect (Pyro crackle, turbopump whine & deep combustion thud)
  playIgnitionSound() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;

      // A. Pyrotechnic sparklers burst (pre-ignition crackle)
      const sparkLen = Math.floor(this.ctx.sampleRate * 0.45);
      const sparkBuffer = this.ctx.createBuffer(1, sparkLen, this.ctx.sampleRate);
      const sData = sparkBuffer.getChannelData(0);
      for (let i = 0; i < sparkLen; i++) {
        sData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
      }
      const sparkSrc = this.ctx.createBufferSource();
      sparkSrc.buffer = sparkBuffer;
      const sparkFilter = this.ctx.createBiquadFilter();
      sparkFilter.type = 'bandpass';
      sparkFilter.frequency.value = 2600;
      sparkFilter.Q.value = 3.5;
      const sparkGain = this.ctx.createGain();
      sparkGain.gain.setValueAtTime(0.4, now);
      sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      sparkSrc.connect(sparkFilter).connect(sparkGain).connect(this.ctx.destination);
      sparkSrc.start(now);

      // B. Turbopump spin-up whine
      const turboOsc = this.ctx.createOscillator();
      const turboGain = this.ctx.createGain();
      turboOsc.type = 'sawtooth';
      turboOsc.frequency.setValueAtTime(120, now);
      turboOsc.frequency.exponentialRampToValueAtTime(1400, now + 1.2);
      turboGain.gain.setValueAtTime(0.001, now);
      turboGain.gain.linearRampToValueAtTime(0.25, now + 0.45);
      turboGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      turboOsc.connect(turboGain).connect(this.ctx.destination);
      turboOsc.start(now);
      turboOsc.stop(now + 1.5);

      // C. Heavy Combustion Chamber Ignition "WHUMP / ROAR"
      const boomOsc = this.ctx.createOscillator();
      const boomGain = this.ctx.createGain();
      boomOsc.type = 'sine';
      boomOsc.frequency.setValueAtTime(140, now + 0.15);
      boomOsc.frequency.exponentialRampToValueAtTime(32, now + 1.8);
      boomGain.gain.setValueAtTime(0.001, now + 0.15);
      boomGain.gain.linearRampToValueAtTime(0.85, now + 0.35);
      boomGain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);
      boomOsc.connect(boomGain).connect(this.ctx.destination);
      boomOsc.start(now + 0.15);
      boomOsc.stop(now + 1.9);
    } catch (_) {}
  }

  // 2. Realistic Stage Separation Sound Effect (Pyrotechnic bolts, pneumatic pushers, and hull thud)
  playStageSeparationSound() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;

      // A. Sharp Pyrotechnic Frangible Nut / Bolt Detonation (Mechanical Clang)
      const boltOsc = this.ctx.createOscillator();
      const boltGain = this.ctx.createGain();
      boltOsc.type = 'triangle';
      boltOsc.frequency.setValueAtTime(1100, now);
      boltOsc.frequency.exponentialRampToValueAtTime(80, now + 0.14);
      boltGain.gain.setValueAtTime(0.9, now);
      boltGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      boltOsc.connect(boltGain).connect(this.ctx.destination);
      boltOsc.start(now);
      boltOsc.stop(now + 0.18);

      // B. Pneumatic Pusher / Gas Decompression Venting
      const pLen = Math.floor(this.ctx.sampleRate * 0.7);
      const pushBuffer = this.ctx.createBuffer(1, pLen, this.ctx.sampleRate);
      const pData = pushBuffer.getChannelData(0);
      for (let i = 0; i < pLen; i++) {
        pData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.2));
      }
      const pushSrc = this.ctx.createBufferSource();
      pushSrc.buffer = pushBuffer;
      const pushFilter = this.ctx.createBiquadFilter();
      pushFilter.type = 'lowpass';
      pushFilter.frequency.setValueAtTime(1600, now);
      pushFilter.frequency.exponentialRampToValueAtTime(180, now + 0.6);
      const pushGain = this.ctx.createGain();
      pushGain.gain.setValueAtTime(0.65, now);
      pushGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      pushSrc.connect(pushFilter).connect(pushGain).connect(this.ctx.destination);
      pushSrc.start(now);

      // C. Heavy Booster Jettison Hull Thud
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(85, now);
      thudOsc.frequency.exponentialRampToValueAtTime(25, now + 0.38);
      thudGain.gain.setValueAtTime(0.8, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      thudOsc.connect(thudGain).connect(this.ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.4);
    } catch (_) {}
  }

  // 3. Realistic Atmosphere Exit Sound Effect (Air hiss decay and ethereal cosmic chime)
  playAtmosphereExitSound() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;

      // A. Atmospheric Whoosh Decrescendo (Air resistance dropping away)
      const aLen = Math.floor(this.ctx.sampleRate * 1.6);
      const atmoBuffer = this.ctx.createBuffer(1, aLen, this.ctx.sampleRate);
      const aData = atmoBuffer.getChannelData(0);
      for (let i = 0; i < aLen; i++) {
        aData[i] = (Math.random() * 2 - 1) * (1.0 - i / aLen);
      }
      const atmoSrc = this.ctx.createBufferSource();
      atmoSrc.buffer = atmoBuffer;
      const atmoFilter = this.ctx.createBiquadFilter();
      atmoFilter.type = 'lowpass';
      atmoFilter.frequency.setValueAtTime(3200, now);
      atmoFilter.frequency.exponentialRampToValueAtTime(40, now + 1.4);
      const atmoGain = this.ctx.createGain();
      atmoGain.gain.setValueAtTime(0.45, now);
      atmoGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      atmoSrc.connect(atmoFilter).connect(atmoGain).connect(this.ctx.destination);
      atmoSrc.start(now);

      // B. Ethereal Cosmic Harmonic Chime (Entrance into pure microgravity vacuum)
      const chordFrequencies = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C Major 7th shimmer
      chordFrequencies.forEach((freq, idx) => {
        const chimeOsc = this.ctx.createOscillator();
        const chimeGain = this.ctx.createGain();
        chimeOsc.type = 'sine';
        chimeOsc.frequency.setValueAtTime(freq, now + idx * 0.1);
        chimeGain.gain.setValueAtTime(0.001, now + idx * 0.1);
        chimeGain.gain.linearRampToValueAtTime(0.18, now + idx * 0.1 + 0.06);
        chimeGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 2.4);
        chimeOsc.connect(chimeGain).connect(this.ctx.destination);
        chimeOsc.start(now + idx * 0.1);
        chimeOsc.stop(now + idx * 0.1 + 2.5);
      });
    } catch (_) {}
  }

  stop() {
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(0.0, this.ctx?.currentTime || 0, 0.1);
    }
  }
}

// Single instance of rocket audio synth
const globalRocketAudio = typeof window !== 'undefined' ? new WebAudioRocketSynth() : null;

// =================================================================
// 6. MAIN AAA ROCKET LAUNCH SIMULATOR COMPONENT
// =================================================================
export function AaaRocketLaunch({ 
  className = '',
  onLaunchComplete = undefined
}) {
  // Telemetry Metrics State
  const [altitude, setAltitude] = useState(0); // km (0 to 400 LEO)
  const [velocity, setVelocity] = useState(0); // km/h (0 to 28,000)
  const [fuel, setFuel] = useState(92); // %
  const [payloadWeight, setPayloadWeight] = useState(8500); // kg
  const [flightStage, setFlightStage] = useState('idle'); // 'idle' | 'countdown' | 'launched' | 'orbit' | 'failed'
  
  // Game & Viewport Modes
  const [cameraMode, setCameraMode] = useState('PAD'); // 'PAD' | 'CHASE' | 'ORBIT' | 'NOSE'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [subStage, setSubStage] = useState('PAD STANDBY • T-00:00:05');
  const [srbSeparated, setSrbSeparated] = useState(false);

  // Real-time animation physics variables
  const [rocketY, setRocketY] = useState(0);
  const [thrustIntensity, setThrustIntensity] = useState(0);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [rollAngle, setRollAngle] = useState(0);
  const [audioNotification, setAudioNotification] = useState(null);

  const containerRef = useRef(null);
  const controlsRef = useRef(null);
  const flightTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const audioNoticeTimerRef = useRef(null);
  const hasTriggeredSepRef = useRef(false);
  const hasTriggeredAtmoRef = useRef(false);

  // Trigger floating visual audio notification toast in the HUD
  const triggerAudioNotice = useCallback((message, type = 'info') => {
    setAudioNotification({ message, type, time: Date.now() });
    if (audioNoticeTimerRef.current) clearTimeout(audioNoticeTimerRef.current);
    audioNoticeTimerRef.current = setTimeout(() => {
      setAudioNotification(null);
    }, 4000);
  }, []);

  // Mach Number derived computation: 1 Mach ≈ 1,225 km/h
  const machSpeed = useMemo(() => {
    return (velocity / 1225.04).toFixed(2);
  }, [velocity]);

  // Audio syncer
  useEffect(() => {
    if (!soundEnabled || flightStage === 'idle') {
      globalRocketAudio?.stop();
    } else if (flightStage === 'countdown') {
      globalRocketAudio?.setVolume(0.2, 120);
    } else if (flightStage === 'launched') {
      const pitch = Math.min(320, 160 + altitude * 0.8);
      globalRocketAudio?.setVolume(0.75, pitch);
    } else if (flightStage === 'orbit') {
      globalRocketAudio?.setVolume(0.08, 90); // Quiet vacuum hum
    }
  }, [flightStage, soundEnabled, altitude]);

  // Fullscreen Handler
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Reset Flight
  const handleReset = useCallback(() => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (flightTimerRef.current) clearInterval(flightTimerRef.current);
    if (audioNoticeTimerRef.current) clearTimeout(audioNoticeTimerRef.current);
    hasTriggeredSepRef.current = false;
    hasTriggeredAtmoRef.current = false;
    setFlightStage('idle');
    setAltitude(0);
    setVelocity(0);
    setFuel(92);
    setRocketY(0);
    setThrustIntensity(0);
    setShakeIntensity(0);
    setRollAngle(0);
    setSrbSeparated(false);
    setCountdown(5);
    setSubStage('PAD STANDBY • T-00:00:05');
    setCameraMode('PAD');
    setAudioNotification(null);
    globalRocketAudio?.stop();
  }, []);

  // Launch Ignition Sequence
  const handleInitiateLaunch = () => {
    if (flightStage === 'countdown' || flightStage === 'launched') return;

    handleReset();
    setFlightStage('countdown');
    setCountdown(5);
    setSubStage('COUNTDOWN ACTIVE: APU START');
    setThrustIntensity(0.15); // Pre-burn ignition pilot

    let count = 5;
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      setCountdown(count);

      if (count === 3) {
        setSubStage('T-3s: MAIN ENGINES IGNITION');
        setThrustIntensity(0.7);
        setShakeIntensity(0.05);
        if (soundEnabled) {
          globalRocketAudio?.playIgnitionSound();
          triggerAudioNotice('⚡ ENGINE IGNITION: RS-25 Main Engine Pyrotechnic Ignition', 'ignition');
        }
      } else if (count === 1) {
        setSubStage('T-1s: SOLID ROCKET BOOSTERS ARMED');
        setThrustIntensity(1.0);
        setShakeIntensity(0.09);
      } else if (count <= 0) {
        clearInterval(countdownTimerRef.current);
        executeLiftoffPhysics();
      }
    }, 1000);
  };

  // Liftoff & Ascending Physics Loop
  const executeLiftoffPhysics = () => {
    setFlightStage('launched');
    setCameraMode('CHASE');
    setSubStage('LIFTOFF! TOWER CLEARED');
    setThrustIntensity(1.0);
    setShakeIntensity(0.14);

    if (soundEnabled) {
      globalRocketAudio?.playIgnitionSound();
      triggerAudioNotice('🚀 LIFTOFF: Solid Rocket Booster Ignition & Full Thrust Acoustic Blast', 'ignition');
    }

    let currentAlt = 0;
    let currentVel = 0;
    let currentFuel = fuel;
    let curRocketY = 0;
    let curRoll = 0;

    // Check launch validation criteria
    const isUnderfueled = currentFuel < 40;
    const isOverweight = payloadWeight > 12000;

    flightTimerRef.current = setInterval(() => {
      // 1. Failure Intercept
      if (isUnderfueled && currentAlt >= 22) {
        clearInterval(flightTimerRef.current);
        setFlightStage('failed');
        setThrustIntensity(0);
        setShakeIntensity(0);
        setSubStage('ANOMALY: PROPELLANT DEPLETION FLAMEOUT (<40%)');
        globalRocketAudio?.stop();
        return;
      }

      if (isOverweight && currentAlt >= 38) {
        clearInterval(flightTimerRef.current);
        setFlightStage('failed');
        setThrustIntensity(0);
        setShakeIntensity(0);
        setSubStage('ANOMALY: MAX-Q STRUCTURAL FAILURE (>12,000kg)');
        globalRocketAudio?.stop();
        return;
      }

      // 2. Normal Ascent Progression
      currentAlt += 5.5;
      currentVel += 410;
      currentFuel = Math.max(0, currentFuel - 0.95);
      curRocketY += 0.85;
      curRoll += 0.015;

      setAltitude(Math.min(400, Math.round(currentAlt)));
      setVelocity(Math.min(28000, Math.round(currentVel)));
      setFuel(Math.round(currentFuel));
      setRocketY(curRocketY);
      setRollAngle(curRoll);

      // Camera Shake Dynamics during flight
      if (currentAlt < 25) {
        setShakeIntensity(0.15); // Max shake at pad & Max-Q
        setSubStage('MAX-Q: PEAK DYNAMIC PRESSURE');
      } else if (currentAlt >= 75 && currentAlt < 95) {
        setSrbSeparated(true);
        setSubStage('STAGE 1 SEPARATION (MECO)');
        setShakeIntensity(0.08);

        // Stage Separation Sound Trigger
        if (!hasTriggeredSepRef.current) {
          hasTriggeredSepRef.current = true;
          if (soundEnabled) {
            globalRocketAudio?.playStageSeparationSound();
            triggerAudioNotice('💥 STAGE 1 SEPARATION: Pyrotechnic Bolts Severed & Pneumatic Pusher Jettison', 'separation');
          }
        }
      } else if (currentAlt >= 100 && currentAlt < 120) {
        setSubStage('KARMAN LINE CROSSED (100km): SPACE VACUUM');
        setCameraMode('ORBIT');
        setShakeIntensity(0.03);

        // Atmosphere Exit Sound Trigger
        if (!hasTriggeredAtmoRef.current) {
          hasTriggeredAtmoRef.current = true;
          if (soundEnabled) {
            globalRocketAudio?.playAtmosphereExitSound();
            triggerAudioNotice('🌌 ATMOSPHERE EXIT: Kármán Line Crossed (100km) • Vacuum Harmonic Resonance', 'vacuum');
          }
        }
      } else if (currentAlt >= 240 && currentAlt < 260) {
        setSubStage('UPPER STAGE ORBITAL INSERTION BURN');
        setShakeIntensity(0.02);
      }

      // 3. Low Earth Orbit Insertion at 400km
      if (currentAlt >= 400) {
        clearInterval(flightTimerRef.current);
        setAltitude(400);
        setVelocity(28000);
        setFlightStage('orbit');
        setSubStage('ORBITAL INSERTION ACHIEVED: 400KM LEO');
        setThrustIntensity(0.1); // Attitude thruster puffs
        setShakeIntensity(0.0);
        setCameraMode('ORBIT');
        if (onLaunchComplete) onLaunchComplete({ altitude: 400, velocity: 28000 });
      }
    }, 110);
  };

  // Clean on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (flightTimerRef.current) clearInterval(flightTimerRef.current);
      globalRocketAudio?.stop();
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-[620px] sm:h-[720px] rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950/90 shadow-2xl flex flex-col justify-between selection:bg-cyan-500/30 hover:border-cyan-500/40 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 ${className}`}
    >
      {/* ===================================================== */}
      {/* 3D WEBGL CANVAS VIEWPORT */}
      {/* ===================================================== */}
      <div className="absolute inset-0 z-0">
        <Canvas
          dpr={[1, 1.2]}
          camera={{ position: [0, 4, 14], fov: 48 }}
          gl={{
            powerPreference: 'high-performance',
            antialias: false,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.25
          }}
        >
          {/* Static Rig Controller with Camera Shake */}
          <CameraRigController
            flightStage={flightStage}
            altitude={altitude}
            cameraMode={cameraMode}
            rocketY={rocketY}
            shakeIntensity={shakeIntensity}
            controlsRef={controlsRef}
          />

          {/* Realistic Space Lighting */}
          <ambientLight intensity={altitude > 80 ? 0.2 : 0.4} />

          {/* High-Intensity Sun Directional Light */}
          <directionalLight
            position={[18, 32, 16]}
            intensity={3.2}
            color="#fffcf5"
            castShadow
          />

          {/* Deep Space Blue Point Light */}
          <pointLight
            position={[-12, -4, -10]}
            intensity={1.8}
            color="#38bdf8"
          />

          {/* Dynamic Engine Plume Ground Light */}
          {thrustIntensity > 0 && (
            <pointLight
              position={[0, rocketY - 2.5, 0]}
              intensity={thrustIntensity * 6.5}
              color="#f97316"
              distance={35}
            />
          )}

          {/* Cosmic Background Starfield Particles */}
          <DynamicStarfield count={8500} minRadius={90} maxRadius={360} driftSpeed={0.005} />

          {/* Ground Launch Complex 39B Horizon */}
          <LaunchPadEnvironment altitude={altitude} />

          {/* Procedural 3D Space Vehicle */}
          <group position={[0, rocketY, 0]}>
            <ProceduralSpaceVehicle
              flightStage={flightStage}
              thrustIntensity={thrustIntensity}
              altitude={altitude}
              rollAngle={rollAngle}
              separated={srbSeparated}
            />
          </group>

          {/* Curved Earth Sphere at High Orbit */}
          <OrbitalEarthGlobe altitude={altitude} />

          {/* Smooth User Orbit Controls */}
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.06}
            minDistance={4}
            maxDistance={45}
          />
        </Canvas>
      </div>

      {/* ===================================================== */}
      {/* FUTURISTIC AAA GAME HUD OVERLAY */}
      {/* ===================================================== */}
      
      {/* 1. TOP HUD BAR: MISSION STATUS & VIEW CONTROLS */}
      <div className="relative z-10 p-4 sm:p-6 flex items-start justify-between gap-4 pointer-events-none">
        
        {/* Left Telemetry Stamp Badge */}
        <div className="pointer-events-auto bg-slate-950/80 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-3 shadow-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0">
            <Rocket className="w-5 h-5 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-['Orbitron'] font-black text-xs sm:text-sm text-white tracking-wider">
                TITAN-V LAUNCH SYSTEM
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                flightStage === 'orbit' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                flightStage === 'failed' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                flightStage === 'launched' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-ping' :
                'bg-slate-800 text-slate-300'
              }`}>
                {flightStage}
              </span>
            </div>
            <p className="text-[11px] font-mono text-cyan-300/80 mt-0.5">
              {subStage}
            </p>
          </div>
        </div>

        {/* Right Camera & Audio Mode Toolbar */}
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-1.5 shadow-2xl">
          {/* Camera View Toggles */}
          {(['PAD', 'CHASE', 'ORBIT', 'NOSE']).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setCameraMode(mode)}
              className={`px-2.5 py-1.5 rounded-xl font-mono text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                cameraMode === mode
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{mode}</span>
            </button>
          ))}

          <div className="w-[1px] h-4 bg-slate-800 mx-1" />

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl transition cursor-pointer ${
              soundEnabled ? 'text-cyan-400 hover:bg-cyan-500/10' : 'text-slate-500 hover:bg-slate-800'
            }`}
            title={soundEnabled ? 'Thruster Audio Active' : 'Audio Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Quick SFX Audition Buttons */}
          <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-slate-800">
            <button
              type="button"
              onClick={() => {
                globalRocketAudio?.playIgnitionSound();
                triggerAudioNotice('⚡ ENGINE IGNITION: RS-25 Pyro Ignition Triggered', 'ignition');
              }}
              className="px-2 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9px] font-mono font-bold transition flex items-center gap-1 cursor-pointer"
              title="Test Engine Ignition Sound Effect"
            >
              <span>🔥 Ignition FX</span>
            </button>
            <button
              type="button"
              onClick={() => {
                globalRocketAudio?.playStageSeparationSound();
                triggerAudioNotice('💥 STAGE SEPARATION: Bolt Detonation & Pneumatic Pushers', 'separation');
              }}
              className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-mono font-bold transition flex items-center gap-1 cursor-pointer"
              title="Test Stage Separation Sound Effect"
            >
              <span>💥 Sep FX</span>
            </button>
            <button
              type="button"
              onClick={() => {
                globalRocketAudio?.playAtmosphereExitSound();
                triggerAudioNotice('🌌 ATMOSPHERE EXIT: Kármán Vacuum Entry Resonance', 'vacuum');
              }}
              className="px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-mono font-bold transition flex items-center gap-1 cursor-pointer"
              title="Test Atmosphere Exit Sound Effect"
            >
              <span>🌌 Exit FX</span>
            </button>
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Toggle Viewport Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Dynamic Web Audio Event HUD Banner */}
      <AnimatePresence>
        {audioNotification && (
          <motion.div
            initial={{ opacity: 0, y: -15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            className={`absolute top-24 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-2xl backdrop-blur-xl border shadow-2xl flex items-center gap-2.5 font-mono text-xs font-bold pointer-events-none ${
              audioNotification.type === 'ignition' 
                ? 'bg-orange-950/90 border-orange-500/70 text-orange-200 shadow-orange-500/25'
                : audioNotification.type === 'separation'
                ? 'bg-amber-950/90 border-amber-500/70 text-amber-200 shadow-amber-500/25'
                : 'bg-cyan-950/90 border-cyan-500/70 text-cyan-200 shadow-cyan-500/25'
            }`}
          >
            <Volume2 className="w-4 h-4 animate-pulse shrink-0 text-cyan-300" />
            <span>{audioNotification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. CENTER FLIGHT CROSSHAIRS & PITCH RETICLE (Subtle AAA HUD) */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="relative w-64 h-64 border border-cyan-500/15 rounded-full flex items-center justify-center">
          {/* Horizontal Reticle Marks */}
          <div className="absolute left-2 w-6 h-[1.5px] bg-cyan-400/40" />
          <div className="absolute right-2 w-6 h-[1.5px] bg-cyan-400/40" />
          <div className="absolute top-2 h-6 w-[1.5px] bg-cyan-400/40" />
          <div className="absolute bottom-2 h-6 w-[1.5px] bg-cyan-400/40" />
          
          {/* Flight Center Pip */}
          <div className="w-2 h-2 rounded-full border border-cyan-400/60" />
        </div>
      </div>

      {/* 3. BOTTOM HUD CONSOLE: TELEMETRY GAUGES & LAUNCH IGNITION TRIGGER */}
      <div className="relative z-10 p-4 sm:p-6 flex flex-col md:flex-row items-stretch md:items-end justify-between gap-4 pointer-events-none">
        
        {/* Left Flight Metrics Array */}
        <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 max-w-lg w-full">
          
          {/* Primary Telemetry Grid */}
          <div className="grid grid-cols-3 gap-3">
            
            {/* Metric 1: Altitude */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>ALTITUDE</span>
                <Compass className="w-3 h-3 text-cyan-400" />
              </div>
              <div className="text-lg sm:text-xl font-black text-white font-['Orbitron'] mt-1">
                {altitude} <span className="text-[10px] font-mono font-normal text-cyan-300">KM</span>
              </div>
              <div className="text-[9px] font-mono text-slate-500">LEO: 400 KM</div>
            </div>

            {/* Metric 2: Velocity */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>VELOCITY</span>
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              </div>
              <div className="text-lg sm:text-xl font-black text-white font-['Orbitron'] mt-1">
                {velocity.toLocaleString()} <span className="text-[10px] font-mono font-normal text-emerald-300">KM/H</span>
              </div>
              <div className="text-[9px] font-mono text-slate-500">7.78 KM/S</div>
            </div>

            {/* Metric 3: Mach Speed Indicator */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>MACH</span>
                <Flame className="w-3 h-3 text-orange-400" />
              </div>
              <div className="text-lg sm:text-xl font-black text-white font-['Orbitron'] mt-1">
                M {machSpeed}
              </div>
              <div className="text-[9px] font-mono text-orange-400 font-semibold truncate">
                {velocity > 6100 ? 'HYPERSONIC' : velocity > 1225 ? 'SUPERSONIC' : 'SUBSONIC'}
              </div>
            </div>
          </div>

          {/* Propellant & Flight Progress Dual Meter */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Flame className="w-3 h-3 text-cyan-400" />
                <span>PROPELLANT RESERVES:</span>
              </span>
              <span className={`font-bold ${fuel < 40 ? 'text-rose-400' : 'text-cyan-300'}`}>
                {fuel}% {fuel < 40 ? '(ABORT THRESHOLD)' : ''}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div 
                className={`h-full transition-all duration-150 ${fuel < 40 ? 'bg-rose-500' : 'bg-gradient-to-r from-cyan-500 to-blue-500'}`}
                style={{ width: `${fuel}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right Ignition Trigger & Abort Control Station */}
        <div className="pointer-events-auto flex items-center gap-3">
          {flightStage === 'idle' && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={handleInitiateLaunch}
              className="px-6 sm:px-8 py-4 rounded-2xl bg-gradient-to-r from-orange-600 via-amber-600 to-cyan-600 hover:from-orange-500 hover:to-cyan-500 text-white font-mono font-black text-xs sm:text-sm tracking-wider shadow-2xl shadow-orange-500/30 flex items-center gap-2.5 cursor-pointer border border-orange-400/40"
            >
              <Flame className="w-5 h-5 text-white animate-pulse" />
              <span>IGNITE LAUNCH SEQUENCE</span>
            </motion.button>
          )}

          {flightStage === 'countdown' && (
            <div className="px-6 py-3.5 rounded-2xl bg-amber-950/80 border border-amber-500 text-amber-300 font-mono font-black text-sm flex items-center gap-3 shadow-xl backdrop-blur-xl">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
              <span>T-MINUS 00:0{countdown} SECONDS</span>
            </div>
          )}

          {(flightStage === 'launched' || flightStage === 'orbit' || flightStage === 'failed') && (
            <button
              type="button"
              onClick={handleReset}
              className="px-5 py-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xl backdrop-blur-xl"
            >
              <RotateCcw className="w-4 h-4" />
              <span>RESET SIMULATOR</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AaaRocketLaunch;
