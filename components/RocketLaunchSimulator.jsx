'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  Rocket, 
  Flame, 
  Gauge, 
  Terminal, 
  AlertTriangle, 
  CheckCircle2, 
  RotateCcw, 
  Play, 
  Square, 
  Activity, 
  Weight, 
  Fuel, 
  Compass, 
  ShieldAlert, 
  Radio, 
  Copy, 
  Check, 
  Sparkles, 
  Layers,
  ChevronRight,
  TrendingUp,
  Cpu,
  Eye,
  Tv
} from 'lucide-react';
import AaaRocketLaunch from './AaaRocketLaunch.jsx';

/**
 * Rocket Presets for quick testing
 */
const ROCKET_PRESETS = [
  {
    id: 'sls-artemis',
    name: 'SLS Artemis (Lunar Crew)',
    fuel: 95,
    payload: 9500,
    desc: 'Deep Space Crewed Configuration'
  },
  {
    id: 'falcon-heavy',
    name: 'Heavy Lift Vehicle',
    fuel: 85,
    payload: 11200,
    desc: 'Commercial Geostationary Payload'
  },
  {
    id: 'underfueled-test',
    name: 'Deficient Propellant Test',
    fuel: 28,
    payload: 6500,
    desc: 'Simulate Fuel Margin Failure (< 40%)'
  },
  {
    id: 'overweight-test',
    name: 'Overloaded Cargo Test',
    fuel: 90,
    payload: 14800,
    desc: 'Simulate Payload Exceedance (> 12,000kg)'
  }
];

/**
 * RocketLaunchSimulator Props:
 * @param {Object} props
 * @param {string} [props.className]
 * @param {Function} [props.onComplete]
 */
export function RocketLaunchSimulator({ className = '', onComplete = undefined }) {
  const { i18n } = useTranslation();
  const lang = (i18n?.language || 'en').slice(0, 2);

  // ----------------------------------------------------
  // Interactive Telemetry State
  // ----------------------------------------------------
  const [altitude, setAltitude] = useState(0); // km (0 to 400 LEO)
  const [velocity, setVelocity] = useState(0); // km/h (0 to 28,000)
  const [fuel, setFuel] = useState(85); // % (0 to 100)
  const [payloadWeight, setPayloadWeight] = useState(8500); // kg (1,000 to 20,000)
  const [flightStage, setFlightStage] = useState('idle'); // 'idle' | 'countdown' | 'launched' | 'orbit' | 'failed'
  
  // Secondary Telemetry
  const [simViewMode, setSimViewMode] = useState('3d'); // '3d' | 'telemetry'
  const [countdown, setCountdown] = useState(5);
  const [gForce, setGForce] = useState(1.0); // Gs
  const [subStage, setSubStage] = useState('PAD READY');
  const [failureReason, setFailureReason] = useState('');
  const [activePreset, setActivePreset] = useState(null);
  const [copiedLogs, setCopiedLogs] = useState(false);

  // Terminal Logs State
  const [logs, setLogs] = useState([
    {
      id: 1,
      time: 'T-00:00:00',
      type: 'info',
      message: 'NASA KSC Launch Complex 39B: Mission Control telemetry link verified.'
    },
    {
      id: 2,
      time: 'T-00:00:00',
      type: 'info',
      message: 'Ground Launch Sequencer (GLS) in standby. Stand by for fuel & payload verification.'
    }
  ]);

  const terminalEndRef = useRef(null);
  const flightIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Log Dispatcher helper
  const addLog = useCallback((message, type = 'info') => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0')}`;
    setLogs((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        time: timeStr,
        type,
        message
      }
    ]);
  }, []);

  // ----------------------------------------------------
  // Launch Validation Logic
  // ----------------------------------------------------
  // Criteria:
  // if fuel < 40% OR payload > 12000kg -> TRIGGER FAILURE
  // Otherwise -> Reach 400km LEO Orbit
  const validateFlightParameters = useCallback(() => {
    if (fuel < 40) {
      return {
        valid: false,
        reason: lang === 'si' 
          ? `ප්‍රචාලක ඉන්ධන ඌනතාවය: ඉන්ධන ප්‍රතිශතය ${fuel}% වන අතර අවම 40% සීමාවට වඩා අඩුය.` 
          : lang === 'ta'
          ? `போதுமான எரிபொருள் இல்லை: இருப்பு ${fuel}% (தேவையான குறைந்தபட்சம் 40%).`
          : `CRITICAL PROPELLANT DEFICIT: Fuel level at ${fuel}% is below the mandatory 40% margin for orbital insertion.`,
        stage: 'PROPELLANT DEPLETION'
      };
    }
    if (payloadWeight > 12000) {
      return {
        valid: false,
        reason: lang === 'si'
          ? `බර පැටවීමේ සීමාව ඉක්මවා ඇත: බර කිලෝග්‍රෑම් ${payloadWeight.toLocaleString()} වන අතර උපරිම 12,000kg සීමාව ඉක්මවයි.`
          : lang === 'ta'
          ? `அதிக சுமை கண்டறியப்பட்டது: எடை ${payloadWeight.toLocaleString()}kg (அனுமதிக்கப்பட்ட உச்சவரம்பு 12,000kg).`
          : `MAX PAYLOAD EXCEEDED: Payload weight of ${payloadWeight.toLocaleString()}kg exceeds the 12,000kg LEO threshold for thrust-to-weight ratio.`,
        stage: 'MAX-Q STRUCTURAL FAILURE'
      };
    }
    return { valid: true };
  }, [fuel, payloadWeight, lang]);

  // Handle Abort
  const handleAbort = useCallback(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (flightIntervalRef.current) clearInterval(flightIntervalRef.current);
    setFlightStage('failed');
    setSubStage('MISSION ABORTED');
    setFailureReason('MANUAL EMERGENCY ABORT TRIGGERED BY FLIGHT DIRECTOR.');
    addLog('EMERGENCY ABORT: Flight Director initiated pad/in-flight shutdown command.', 'error');
  }, [addLog]);

  // Reset Simulator
  const handleReset = useCallback(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (flightIntervalRef.current) clearInterval(flightIntervalRef.current);
    setFlightStage('idle');
    setAltitude(0);
    setVelocity(0);
    setGForce(1.0);
    setCountdown(5);
    setSubStage('PAD READY');
    setFailureReason('');
    addLog('SYSTEM RESET: Flight computers reinitialized to pre-launch state. Complex 39B ready.', 'info');
  }, [addLog]);

  // Clean intervals on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (flightIntervalRef.current) clearInterval(flightIntervalRef.current);
    };
  }, []);

  // ----------------------------------------------------
  // Launch Sequence Initiation
  // ----------------------------------------------------
  const handleStartLaunch = () => {
    if (flightStage === 'countdown' || flightStage === 'launched') return;

    setFlightStage('countdown');
    setAltitude(0);
    setVelocity(0);
    setGForce(1.0);
    setCountdown(5);
    setFailureReason('');
    setSubStage('TERMINAL COUNTDOWN');

    addLog(`LAUNCH SEQUENCE INITIATED. Payload: ${payloadWeight.toLocaleString()}kg | Propellant: ${fuel}%`, 'info');
    addLog('T-5 seconds: Auxiliary Power Units (APU) started. Range safety armed.', 'info');

    let currentCount = 5;
    countdownIntervalRef.current = setInterval(() => {
      currentCount -= 1;
      setCountdown(currentCount);

      if (currentCount === 3) {
        addLog('T-3 seconds: Main Engine ignition sequence started.', 'info');
      } else if (currentCount === 1) {
        addLog('T-1 seconds: Solid Rocket Booster (SRB) ignition armed.', 'info');
      } else if (currentCount <= 0) {
        clearInterval(countdownIntervalRef.current);
        executeLiftoff();
      }
    }, 1000);
  };

  // Liftoff Execution & Flight Physics Loop
  const executeLiftoff = () => {
    setFlightStage('launched');
    setSubStage('LIFTOFF & TOWER CLEAR');
    setGForce(1.4);
    addLog('T-00:00: LIFTOFF! We have liftoff of NASA Space Exploration launch vehicle!', 'success');

    const validation = validateFlightParameters();
    let currentAlt = 0;
    let currentVel = 0;
    let currentFuel = fuel;
    let currentG = 1.4;

    flightIntervalRef.current = setInterval(() => {
      // 1. Check Failure Conditions during ascent
      if (!validation.valid) {
        // Trigger simulated failure during ascent
        if (currentAlt >= 18 || currentVel >= 3200) {
          clearInterval(flightIntervalRef.current);
          setFlightStage('failed');
          setSubStage(validation.stage);
          setFailureReason(validation.reason);
          setGForce(0);
          addLog(`[CRITICAL ANOMALY DETECTED]: ${validation.reason}`, 'error');
          addLog(`Flight Termination System (FTS) safed vehicle. Stage failure at altitude ${Math.round(currentAlt)}km.`, 'error');
          return;
        }
      }

      // 2. Normal Ascent Progression
      currentAlt += 7.5;
      currentVel += 520;
      currentFuel = Math.max(0, currentFuel - 1.2);
      currentG = currentAlt < 60 ? 2.8 : currentAlt < 180 ? 3.6 : 1.2;

      setAltitude(Math.min(400, Math.round(currentAlt)));
      setVelocity(Math.min(28000, Math.round(currentVel)));
      setFuel(Math.round(currentFuel));
      setGForce(Number(currentG.toFixed(1)));

      // Sub-stage milestone event logging
      if (currentAlt >= 15 && currentAlt < 25) {
        setSubStage('MAX-Q: PEAK AERODYNAMIC PRESSURE');
      } else if (currentAlt >= 70 && currentAlt < 85) {
        setSubStage('STAGE 1 SEPARATION (MECO)');
      } else if (currentAlt >= 140 && currentAlt < 160) {
        setSubStage('PAYLOAD FAIRING JETTISON');
      } else if (currentAlt >= 280 && currentAlt < 300) {
        setSubStage('STAGE 2 ORBITAL INSERTION BURN');
      }

      // 3. Low Earth Orbit (LEO) 400km Milestone Reached
      if (currentAlt >= 400) {
        clearInterval(flightIntervalRef.current);
        setAltitude(400);
        setVelocity(28000);
        setFlightStage('orbit');
        setSubStage('400KM LEO ORBIT CONFIRMED');
        setGForce(0.0); // Microgravity
        addLog('T+08:42: SECOND STAGE ENGINE CUTOFF (SECO). Spacecraft in nominal orbit.', 'success');
        addLog('MISSION SUCCESS: Low Earth Orbit (LEO) reached at altitude 400.0 km. Velocity: 28,000 km/h (7.78 km/s). Telemetry locked.', 'success');
        if (onComplete) onComplete({ altitude: 400, velocity: 28000, fuel: currentFuel });
      }
    }, 120);
  };

  // Preset Applicator
  const applyPreset = (preset) => {
    if (flightStage === 'countdown' || flightStage === 'launched') return;
    setActivePreset(preset.id);
    setFuel(preset.fuel);
    setPayloadWeight(preset.payload);
    addLog(`Preset applied: ${preset.name} (Fuel: ${preset.fuel}%, Payload: ${preset.payload.toLocaleString()}kg)`, 'info');
  };

  // Copy Logs
  const handleCopyLogs = () => {
    const text = logs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard?.writeText?.(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  // Localized Labels
  const labels = useMemo(() => {
    return {
      title: lang === 'si' ? 'නාසා රොකට් දියත්කිරීමේ පාලක සිමියුලේටරය' : lang === 'ta' ? 'நாசா ராக்கெட் ஏவுதள கட்டுப்பாட்டு சிமுலேட்டர்' : 'NASA Rocket Launch Control Simulator',
      subtitle: lang === 'si' ? 'සජීවී ටෙලිමෙට්‍රි දත්ත, කක්ෂීය ප්‍රවේග ගණනය සහ මෙහෙයුම් පාලන පර්යන්තය' : lang === 'ta' ? 'நேரலை தொலைநிலை அளவீடு, சுற்றுப்பாதை வேகம் மற்றும் மிஷன் கண்ட்ரோல் டெர்மினல்' : 'Interactive Telemetry, Flight Validation & Real-Time Mission Control Terminal',
      fuelLevel: lang === 'si' ? 'ඉන්ධන ප්‍රතිශතය (අවම 40%)' : lang === 'ta' ? 'எரிபொருள் அளவு (குறைந்தபட்சம் 40%)' : 'Propellant Level (Min 40%)',
      payload: lang === 'si' ? 'බර ප්‍රමාණය (උපරිම 12,000kg)' : lang === 'ta' ? 'சுமை எடை (அதிகபட்சம் 12,000kg)' : 'Payload Mass (Max 12,000 kg)',
      altitude: lang === 'si' ? 'උන්නතාංශය' : lang === 'ta' ? 'உயரம்' : 'Altitude',
      velocity: lang === 'si' ? 'ප්‍රවේගය' : lang === 'ta' ? 'வேகம்' : 'Velocity',
      launchBtn: lang === 'si' ? 'දියත්කිරීම ආරම්භ කරන්න' : lang === 'ta' ? 'ஏவுதலைத் தொடங்கு' : 'INITIATE LAUNCH SEQUENCE',
      abortBtn: lang === 'si' ? 'හදිසි නැවැත්වීම' : lang === 'ta' ? 'அவசர நிறுத்தம்' : 'EMERGENCY ABORT',
      resetBtn: lang === 'si' ? 'නැවත සකසන්න' : lang === 'ta' ? 'மீட்டமைக்க' : 'RESET SIMULATOR',
      stage: lang === 'si' ? 'පියවර' : lang === 'ta' ? 'நிலை' : 'Flight Stage',
      terminalLogs: lang === 'si' ? 'මෙහෙයුම් පාලන පර්යන්ත සටහන්' : lang === 'ta' ? 'மிஷன் கண்ட்ரோல் கன்சோல்' : 'Mission Control Console Log'
    };
  }, [lang]);

  return (
    <div className={`w-full bg-slate-900/95 border border-cyan-500/30 rounded-3xl p-5 sm:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden text-slate-100 ${className}`}>
      {/* Top Ambient Glow Nebula */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header with Telemetry Status Stamp */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold mb-2">
            <Rocket className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>KSC LAUNCH COMPLEX 39B • SIMULATOR ACTIVE</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white font-['Orbitron'] tracking-wide">
            {labels.title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-mono mt-1">
            {labels.subtitle}
          </p>
        </div>

        {/* View Mode & Flight Stage Status Badge */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950/80 p-1 rounded-2xl border border-cyan-500/30 shadow-md">
            <button
              type="button"
              onClick={() => setSimViewMode('3d')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
                simViewMode === '3d'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>🎮 3D AAA VIEW</span>
            </button>
            <button
              type="button"
              onClick={() => setSimViewMode('telemetry')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
                simViewMode === 'telemetry'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>📊 MISSION CONTROL</span>
            </button>
          </div>

          <div className={`px-4 py-2 rounded-2xl border font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg ${
            flightStage === 'orbit' 
              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' 
              : flightStage === 'failed'
              ? 'bg-rose-500/20 border-rose-400 text-rose-300'
              : flightStage === 'launched'
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 animate-pulse'
              : flightStage === 'countdown'
              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
              : 'bg-slate-800/80 border-slate-700 text-slate-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              flightStage === 'orbit' ? 'bg-emerald-400' :
              flightStage === 'failed' ? 'bg-rose-400' :
              flightStage === 'launched' ? 'bg-cyan-400 animate-ping' :
              flightStage === 'countdown' ? 'bg-amber-400' : 'bg-slate-400'
            }`} />
            <span>STAGE: {flightStage}</span>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            title={labels.resetBtn}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3D AAA Game Mode Viewport */}
      {simViewMode === '3d' && (
        <div className="relative z-10 mt-6 space-y-4">
          <AaaRocketLaunch onLaunchComplete={onComplete} />
        </div>
      )}

      {/* Main Grid: Controls, Telemetry Dashboard & Visual Ascent Track */}
      <div className={`relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 ${simViewMode === '3d' ? 'hidden' : 'block'}`}>
        
        {/* Left Column (5 Cols): Mission Configuration & Sliders */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Quick Vehicle Configuration Presets */}
          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>VEHICLE FLIGHT PRESETS</span>
              <span className="text-[10px] text-cyan-400">TEST SCENARIOS</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ROCKET_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={flightStage === 'countdown' || flightStage === 'launched'}
                  onClick={() => applyPreset(preset)}
                  className={`p-2.5 rounded-xl border text-left transition text-xs font-mono disabled:opacity-50 cursor-pointer ${
                    activePreset === preset.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-slate-850/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-bold truncate">{preset.name}</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{preset.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Configuration Sliders Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-5">
            
            {/* Slider 1: Propellant Fuel Level */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Fuel className={`w-3.5 h-3.5 ${fuel < 40 ? 'text-rose-400 animate-pulse' : 'text-cyan-400'}`} />
                  {labels.fuelLevel}
                </span>
                <span className={`font-bold px-2 py-0.5 rounded ${
                  fuel < 40 
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                }`}>
                  {fuel}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="1"
                disabled={flightStage === 'countdown' || flightStage === 'launched'}
                value={fuel}
                onChange={(e) => {
                  setFuel(Number(e.target.value));
                  setActivePreset(null);
                }}
                className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-2 cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>0% (Empty)</span>
                <span className="text-amber-400 font-semibold">40% MIN MARGIN</span>
                <span>100% (Full)</span>
              </div>
            </div>

            {/* Slider 2: Payload Weight */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Weight className={`w-3.5 h-3.5 ${payloadWeight > 12000 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
                  {labels.payload}
                </span>
                <span className={`font-bold px-2 py-0.5 rounded ${
                  payloadWeight > 12000 
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  {payloadWeight.toLocaleString()} kg
                </span>
              </div>
              <input
                type="range"
                min="2000"
                max="18000"
                step="250"
                disabled={flightStage === 'countdown' || flightStage === 'launched'}
                value={payloadWeight}
                onChange={(e) => {
                  setPayloadWeight(Number(e.target.value));
                  setActivePreset(null);
                }}
                className="w-full accent-amber-400 bg-slate-800 rounded-lg h-2 cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>2,000 kg</span>
                <span className="text-rose-400 font-semibold">12,000 kg MAX LIMIT</span>
                <span>18,000 kg</span>
              </div>
            </div>

            {/* Live Safety Check Badge */}
            <div className="pt-2 border-t border-slate-800/80">
              {fuel >= 40 && payloadWeight <= 12000 ? (
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>PRE-FLIGHT CHECKS: Propellant & Weight within nominal LEO envelope.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-mono text-rose-400 bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-xl">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 animate-bounce" />
                  <span>
                    WARNING: {fuel < 40 ? 'Fuel below 40% threshold. ' : ''}
                    {payloadWeight > 12000 ? 'Payload exceeds 12,000kg threshold.' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={flightStage === 'countdown' || flightStage === 'launched' || flightStage === 'orbit'}
              onClick={handleStartLaunch}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-xs tracking-wider shadow-lg shadow-cyan-500/25 disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{labels.launchBtn}</span>
            </button>

            <button
              type="button"
              disabled={flightStage === 'idle' || flightStage === 'orbit' || flightStage === 'failed'}
              onClick={handleAbort}
              className="w-full py-3.5 px-4 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/60 text-rose-300 font-mono font-bold text-xs tracking-wider shadow-lg disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>{labels.abortBtn}</span>
            </button>
          </div>
        </div>

        {/* Right Column (7 Cols): Live Telemetry Gauges, Ascent Visualizer & Terminal */}
        <div className="lg:col-span-7 space-y-6 flex flex-col justify-between">
          
          {/* Real-Time Telemetry Metrics HUD Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            {/* Metric 1: Altitude */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-lg relative overflow-hidden">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>{labels.altitude}</span>
                <Compass className="w-3 h-3 text-cyan-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-white font-['Orbitron'] mt-1">
                {altitude} <span className="text-xs font-mono font-normal text-cyan-300">km</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                Target: 400 km (LEO)
              </div>
            </div>

            {/* Metric 2: Velocity */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-lg relative overflow-hidden">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>{labels.velocity}</span>
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-white font-['Orbitron'] mt-1">
                {velocity.toLocaleString()} <span className="text-[10px] font-mono font-normal text-emerald-300">km/h</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                Orbital: 28,000 km/h
              </div>
            </div>

            {/* Metric 3: G-Force */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-lg relative overflow-hidden">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>G-FORCE</span>
                <Activity className="w-3 h-3 text-amber-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-white font-['Orbitron'] mt-1">
                {gForce} <span className="text-xs font-mono font-normal text-amber-300">G</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                Max-Q: ~3.8 G
              </div>
            </div>

            {/* Metric 4: Sub-Stage Status */}
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-lg relative overflow-hidden">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>STATUS</span>
                <Cpu className="w-3 h-3 text-indigo-400" />
              </div>
              <div className="text-xs font-mono font-bold text-cyan-300 mt-1 line-clamp-2">
                {subStage}
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">
                {flightStage === 'countdown' ? `T-${countdown}s` : flightStage}
              </div>
            </div>
          </div>

          {/* Visual Trajectory Progress Bar (Launchpad -> Karman Line -> 400km LEO) */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Rocket className="w-3.5 h-3.5 text-cyan-400" />
                <span>TRAJECTORY PROFILE: 0 km ➔ 400 km LOW EARTH ORBIT</span>
              </span>
              <span className="text-cyan-300 font-bold">
                {((altitude / 400) * 100).toFixed(0)}%
              </span>
            </div>

            {/* Track Bar with Altitude Milestones */}
            <div className="relative w-full h-4 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <motion.div
                className={`h-full rounded-full transition-all duration-150 ${
                  flightStage === 'failed'
                    ? 'bg-rose-500'
                    : flightStage === 'orbit'
                    ? 'bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, (altitude / 400) * 100))}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-500 px-1">
              <span>PAD (0 km)</span>
              <span>TROPO (12 km)</span>
              <span>STRATO (50 km)</span>
              <span>KARMAN (100 km)</span>
              <span className="text-emerald-400 font-semibold">LEO ORBIT (400 km)</span>
            </div>
          </div>

          {/* Real-Time Mission Control Terminal Console */}
          <div className="rounded-2xl bg-[#050811] border border-cyan-500/20 shadow-2xl overflow-hidden flex flex-col h-60">
            {/* Terminal Header */}
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <div className="text-xs font-mono font-bold text-cyan-300 flex items-center gap-1.5 ml-2">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{labels.terminalLogs}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="text-[10px] font-mono text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-800 flex items-center gap-1 transition cursor-pointer"
                >
                  {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLogs ? 'COPIED' : 'COPY'}</span>
                </button>
              </div>
            </div>

            {/* Terminal Log Stream Window */}
            <div className="p-3.5 font-mono text-xs overflow-y-auto space-y-1.5 flex-1 select-text scrollbar-thin scrollbar-thumb-slate-800">
              {logs.map((log) => (
                <div 
                  key={log.id} 
                  className={`flex items-start gap-2 leading-relaxed ${
                    log.type === 'error'
                      ? 'text-rose-400 font-bold bg-rose-950/30 px-1.5 py-0.5 rounded'
                      : log.type === 'success'
                      ? 'text-emerald-300 font-semibold'
                      : log.type === 'warn'
                      ? 'text-amber-300'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="text-slate-500 text-[10px] shrink-0 font-mono select-none">
                    [{log.time}]
                  </span>
                  <span className="break-words">
                    {log.type === 'error' && '✖ '}
                    {log.type === 'success' && '✔ '}
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            {/* Terminal Live Prompt Bar */}
            <div className="px-3.5 py-1.5 bg-slate-950/80 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 font-bold">telemetry@nasa-ksc:~$</span>
                <span className="text-slate-400 animate-pulse">_</span>
              </div>
              <div>STREAM ACTIVE • PORT 8080</div>
            </div>
          </div>
        </div>
      </div>

      {/* Failure Anomaly Modal / Banner */}
      <AnimatePresence>
        {flightStage === 'failed' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="mt-6 p-4 rounded-2xl bg-rose-950/50 border border-rose-500/50 backdrop-blur-md flex items-center justify-between gap-4 flex-wrap"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white font-['Orbitron']">
                  MISSION TERMINATION • ANOMALY FLIGHT STAGE
                </h4>
                <p className="text-xs text-rose-300 font-mono mt-0.5">
                  {failureReason || 'Vehicle was unable to achieve orbital flight parameters.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold transition shadow-md cursor-pointer"
            >
              RECONFIGURE & RETRY
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success LEO Banner */}
      <AnimatePresence>
        {flightStage === 'orbit' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="mt-6 p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/50 backdrop-blur-md flex items-center justify-between gap-4 flex-wrap"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white font-['Orbitron']">
                  400 KM LOW EARTH ORBIT (LEO) ACHIEVED
                </h4>
                <p className="text-xs text-emerald-300 font-mono mt-0.5">
                  Orbital velocity confirmed at 28,000 km/h. Flight parameters validated successfully.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition shadow-md cursor-pointer"
            >
              SIMULATE ANOTHER LAUNCH
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default RocketLaunchSimulator;
