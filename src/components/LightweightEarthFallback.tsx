'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { SupportedLanguage } from '../i18n/translations';
import { 
  Zap, 
  Orbit, 
  RotateCw, 
  Compass, 
  ShieldCheck, 
  Globe2, 
  Cpu, 
  Layers, 
  Sparkles, 
  Eye, 
  ChevronRight,
  Info,
  Radio
} from 'lucide-react';

interface LightweightEarthFallbackProps {
  lang: SupportedLanguage;
  hardwareReason?: string;
  cores?: number;
  memoryGB?: number | null;
  onLaunchFull3D?: () => void;
}

type CelestialTargetKey = 'earth' | 'moon' | 'mars' | 'jwst';

interface CelestialTargetInfo {
  id: CelestialTargetKey;
  name: { en: string; si: string; ta: string };
  type: { en: string; si: string; ta: string };
  image: string;
  haloColor: string;
  glowColor: string;
  telemetry: {
    velocity: string;
    distance: string;
    altitude: string;
    period: string;
    temperature: string;
  };
  description: {
    en: string;
    si: string;
    ta: string;
  };
}

const CELESTIAL_TARGETS: Record<CelestialTargetKey, CelestialTargetInfo> = {
  earth: {
    id: 'earth',
    name: {
      en: 'Planet Earth (Terra)',
      si: 'පෘථිවි ග්‍රහලෝකය',
      ta: 'பூமி கிரகம் (டெர்ரா)'
    },
    type: {
      en: 'Home Planet • Habitable World',
      si: 'වාසයට සුදුසු ලෝකය',
      ta: 'வாழ்விட உலகம்'
    },
    // High-resolution NASA photorealistic Earth composite
    image: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1200&q=85',
    haloColor: 'rgba(56, 189, 248, 0.4)',
    glowColor: 'rgba(6, 182, 212, 0.35)',
    telemetry: {
      velocity: '29.78 km/s (107,200 km/h)',
      distance: '149.6 Million km (1.00 AU)',
      altitude: '12,742 km Diameter',
      period: '365.25 Days',
      temperature: '+15°C Average'
    },
    description: {
      en: 'Third planet from the Sun and the only known astronomical object known to harbor life. Rich nitrogen-oxygen atmosphere with dynamic liquid oceans and active magnetosphere.',
      si: 'සූර්යයාගේ සිට තුන්වන ග්‍රහලෝකය වන අතර ජීවය පවතින බවට තහවුරු වූ එකම ලෝකයයි. ද්‍රව ජලය සහ ආරක්ෂිත චුම්භක ක්ෂේත්‍රයකින් සමන්විතය.',
      ta: 'சூரியனில் இருந்து மூன்றாவது கிரகம் மற்றும் உயிரினங்களைக் கொண்ட ஒரே அறியப்பட்ட பிரபஞ்ச உலகம். நீர் மற்றும் காந்தப்புலம் கொண்டது.'
    }
  },
  moon: {
    id: 'moon',
    name: {
      en: 'The Moon (Luna)',
      si: 'චන්ද්‍රයා (හඳ)',
      ta: 'நிலவு (லூனா)'
    },
    type: {
      en: 'Earth Natural Satellite • Artemis Base',
      si: 'පෘථිවියේ ස්වාභාවික චන්ද්‍රයා',
      ta: 'பூமியின் இயற்கை துணைக்கோள்'
    },
    image: 'https://images.unsplash.com/photo-1522030299830-16b8d3d049fe?auto=format&fit=crop&w=1200&q=85',
    haloColor: 'rgba(203, 213, 225, 0.35)',
    glowColor: 'rgba(148, 163, 184, 0.25)',
    telemetry: {
      velocity: '1.02 km/s (3,683 km/h)',
      distance: '384,400 km from Earth',
      altitude: '3,474 km Diameter',
      period: '27.3 Days (Tidally Locked)',
      temperature: '-130°C to +120°C'
    },
    description: {
      en: 'Earth\'s only permanent natural satellite. Destination for NASA\'s landmark Apollo landings and the upcoming Artemis deep space program for sustainable lunar exploration.',
      si: 'පෘථිවියේ එකම ස්වභාවික චන්ද්‍රයා. ඇපලෝ මෙහෙයුම් සහ නාසා ආටෙමිස් වැඩසටහනේ මූලික ඉලක්කයයි.',
      ta: 'பூமியின் ஒரே நிரந்தர இயற்கை துணைக்கோள். அப்பல்லோ மற்றும் ஆர்ட்டெமிஸ் திட்டத்தின் முக்கிய இலக்கு.'
    }
  },
  mars: {
    id: 'mars',
    name: {
      en: 'Planet Mars (The Red Planet)',
      si: 'අඟහරු ග්‍රහලෝකය',
      ta: 'செவ்வாய் கிரகம்'
    },
    type: {
      en: 'Fourth Planet • Jezero Crater',
      si: 'සිව්වන ග්‍රහලෝකය • පර්සවරන්ස්',
      ta: 'நான்காவது கிரகம்'
    },
    image: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1200&q=85',
    haloColor: 'rgba(244, 63, 94, 0.4)',
    glowColor: 'rgba(239, 68, 68, 0.3)',
    telemetry: {
      velocity: '24.07 km/s (86,677 km/h)',
      distance: '225 Million km (Avg)',
      altitude: '6,779 km Diameter',
      period: '687 Earth Days',
      temperature: '-62°C Average'
    },
    description: {
      en: 'The dusty, cold, desert world with a very thin carbon dioxide atmosphere. Host to NASA\'s active Perseverance and Curiosity rovers seeking traces of ancient microbial life.',
      si: 'සිහින් කාබන් ඩයොක්සයිඩ් වායුගෝලයකින් යුතු රතු ග්‍රහලෝකය. පර්සවරන්ස් සහ කියුරියෝසිටි රෝවර මෙහි ක්‍රියාත්මක වේ.',
      ta: 'மெல்லிய வளிமண்டலம் கொண்ட சிவப்பு கிரகம். நாசாவின் பெர்செவரன்ஸ் ரோவர் செயல்படும் தளம்.'
    }
  },
  jwst: {
    id: 'jwst',
    name: {
      en: 'James Webb Space Telescope (JWST)',
      si: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය',
      ta: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி'
    },
    type: {
      en: 'Infrared Space Observatory • Sun-Earth L2',
      si: 'අධෝරක්ත අභ්‍යවකාශ නිරීක්ෂණාගාරය',
      ta: 'அகச்சிவப்பு விண்வெளி ஆய்வகம்'
    },
    image: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=85',
    haloColor: 'rgba(245, 158, 11, 0.45)',
    glowColor: 'rgba(217, 119, 6, 0.35)',
    telemetry: {
      velocity: '0.20 km/s (L2 Orbit)',
      distance: '1.5 Million km from Earth',
      altitude: 'Sun-Earth L2 Lagrange',
      period: 'Halo Orbit ~6 Months',
      temperature: '-233°C (Cryogenic)'
    },
    description: {
      en: 'NASA\'s premier infrared astrophysics observatory. Positioned at the Sun-Earth L2 point, gazing into deep space to unveil the earliest galaxies formed after the Big Bang.',
      si: 'නාසා ආයතනයේ ප්‍රමුඛ අධෝරක්ත දුරේක්ෂය. මහා පිපිරුමෙන් පසු බිහි වූ මුල්ම තාරකා සහ මන්දාකිණි නිරීක්ෂණය කරයි.',
      ta: 'நாசாவின் முதன்மை அகச்சிவப்பு தொலைநோக்கி. பிக் பேங் நிகழ்வுக்குப் பின் உருவான விண்மீன்களை ஆராய்கிறது.'
    }
  }
};

export const LightweightEarthFallback: React.FC<LightweightEarthFallbackProps> = memo(({
  lang = 'en',
  hardwareReason = 'Mobile / Multi-core optimization',
  cores = 4,
  memoryGB = null,
  onLaunchFull3D
}) => {
  const [selectedTarget, setSelectedTarget] = useState<CelestialTargetKey>('earth');
  const [isRotating, setIsRotating] = useState(true);

  // Parallax tilt state for interactive CSS motion
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const target = CELESTIAL_TARGETS[selectedTarget];

  // Mouse / Touch Parallax Handler
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2; // -1 to 1
    setTilt({ x: x * 12, y: -y * 12 });
  };

  const handlePointerLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  return (
    <div className="w-full space-y-6 select-none font-sans">
      {/* 1. Device Optimization Notification Banner */}
      <div className="p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-cyan-500/30 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
            <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-['Orbitron'] text-xs font-bold text-white tracking-wide">
                {lang === 'si' && 'ස්වයංක්‍රීය කාර්යසාධන ප්‍රශස්තකරණය (ECO-PARALLAX)'}
                {lang === 'ta' && 'தானியங்கி சாதன உகப்பாக்கம் (ECO-PARALLAX)'}
                {lang === 'en' && 'Auto Performance Optimizer Active (Eco Parallax)'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/30">
                60 FPS • ZERO GPU LOAD
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              {hardwareReason} {memoryGB ? `• ${memoryGB}GB RAM` : ''} • {cores} CPU Cores • Battery Saver Mode
            </p>
          </div>
        </div>

        {onLaunchFull3D && (
          <button
            type="button"
            onClick={onLaunchFull3D}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/40 flex items-center justify-center gap-2 transition hover:scale-102 active:scale-98 cursor-pointer shrink-0"
          >
            <Orbit className="w-3.5 h-3.5 text-cyan-200" />
            <span>
              {lang === 'si' ? 'ත්‍රිමාන 3D WebGL ක්‍රියාත්මක කරන්න' :
               lang === 'ta' ? 'முழு 3D WebGL-க்கு மாறுக' :
               'Launch Full 3D WebGL'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-cyan-200" />
          </button>
        )}
      </div>

      {/* 2. Target Switcher Carousel */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {(Object.keys(CELESTIAL_TARGETS) as CelestialTargetKey[]).map((key) => {
          const item = CELESTIAL_TARGETS[key];
          const isSelected = selectedTarget === key;
          return (
            <button
              key={key}
              onClick={() => setSelectedTarget(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold font-['Orbitron'] transition-all border whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-md shadow-cyan-600/30'
                  : 'bg-slate-950/80 text-slate-400 hover:text-white border-slate-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? '#ffffff' : item.haloColor }} />
              <span>{item.name[lang] || item.name.en}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Main Interactive Planetary Parallax Display */}
      <div 
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="relative w-full min-h-[460px] sm:min-h-[520px] rounded-3xl bg-gradient-to-b from-[#020617] via-[#010409] to-[#020617] border border-slate-800/80 p-6 sm:p-10 flex flex-col lg:flex-row items-center justify-between gap-8 overflow-hidden shadow-2xl transition-all"
        style={{ perspective: '1200px' }}
      >
        {/* Atmospheric Background Starscape Gradients */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, ${target.glowColor} 0%, transparent 70%)`
          }}
        />

        {/* Left: 3D-Look Tilt Globe Sphere Container with Pure CSS Parallax */}
        <div className="relative flex-1 flex items-center justify-center w-full max-w-md py-4">
          
          {/* Orbital Satellite Trajectory Ring */}
          <div 
            className="absolute w-[320px] h-[320px] sm:w-[400px] sm:h-[400px] rounded-full border border-dashed border-cyan-500/25 pointer-events-none"
            style={{
              transform: `rotateX(68deg) rotateY(${tilt.x * 0.4}deg)`,
              transition: 'transform 0.15s ease-out'
            }}
          >
            {/* Orbiting Satellite Marker (ISS / Observer) */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950/90 border border-cyan-400/60 text-cyan-300 font-mono text-[9px] shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>ISS ORBIT</span>
            </div>
          </div>

          {/* Planetary Globe Sphere with Parallax Tilt & Rotational Animation */}
          <div
            className="relative w-56 h-56 sm:w-72 sm:h-72 rounded-full overflow-hidden shadow-2xl cursor-grab active:cursor-grabbing transition-transform duration-150 ease-out"
            style={{
              transform: `rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
              boxShadow: `0 0 50px ${target.haloColor}, inset -24px -24px 60px rgba(0,0,0,0.9), inset 12px 12px 30px rgba(255,255,255,0.2)`
            }}
            onClick={() => setIsRotating(!isRotating)}
            title="Click to toggle planetary rotation"
          >
            {/* Photorealistic Celestial Surface Layer */}
            <div
              className={`w-full h-full rounded-full bg-cover bg-center ${isRotating ? 'animate-spin' : ''}`}
              style={{
                backgroundImage: `url(${target.image})`,
                animationDuration: '60s',
                animationTimingFunction: 'linear'
              }}
            />

            {/* Atmosphere Rayleigh Scattering Cyan Rim Glow Filter */}
            <div 
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(0,0,0,0.85) 0%, transparent 60%)`,
                boxShadow: `inset 0 0 25px ${target.haloColor}`
              }}
            />
          </div>

          {/* Interactive Hint Indicator */}
          <div className="absolute bottom-0 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400">
            <RotateCw className="w-3 h-3 text-cyan-400" />
            <span>Interactive CSS Parallax • Tilt device or hover mouse</span>
          </div>
        </div>

        {/* Right: Live Telemetry Readout & Celestial Facts */}
        <div className="relative z-10 flex-1 max-w-lg space-y-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] uppercase font-bold tracking-wider">
              {target.type[lang] || target.type.en}
            </div>

            <h3 className="text-2xl sm:text-3xl font-black font-['Orbitron'] text-white tracking-wide mt-2">
              {target.name[lang] || target.name.en}
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed mt-2">
              {target.description[lang] || target.description.en}
            </p>
          </div>

          {/* Telemetry Metric Cards Grid */}
          <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase">
                {lang === 'si' ? 'කක්ෂීය ප්‍රවේගය' : lang === 'ta' ? 'சுற்றுப்பாதை வேகம்' : 'Orbital Velocity'}
              </span>
              <div className="text-cyan-300 font-bold text-xs sm:text-sm mt-0.5">
                {target.telemetry.velocity}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase">
                {lang === 'si' ? 'දුරස්ථභාවය' : lang === 'ta' ? 'தொலைவு' : 'Distance / Semimajor'}
              </span>
              <div className="text-sky-300 font-bold text-xs sm:text-sm mt-0.5">
                {target.telemetry.distance}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase">
                {lang === 'si' ? 'ප්‍රමාණය' : lang === 'ta' ? 'அளவு' : 'Diameter / Dimensions'}
              </span>
              <div className="text-emerald-300 font-bold text-xs sm:text-sm mt-0.5">
                {target.telemetry.altitude}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase">
                {lang === 'si' ? 'කාලාවර්තය' : lang === 'ta' ? 'கால அளவு' : 'Period / Cycle'}
              </span>
              <div className="text-amber-300 font-bold text-xs sm:text-sm mt-0.5">
                {target.telemetry.period}
              </div>
            </div>
          </div>

          {/* Surface Temperature & State */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">
              {lang === 'si' ? 'මතුපිට උෂ්ණත්වය:' : lang === 'ta' ? 'மேற்பரப்பு வெப்பநிலை:' : 'Surface Temp:'}
            </span>
            <span className="text-white font-bold">{target.telemetry.temperature}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default LightweightEarthFallback;
