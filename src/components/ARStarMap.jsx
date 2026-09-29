'use client';

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Compass, 
  Crosshair, 
  Eye, 
  Orbit, 
  Radio, 
  Layers, 
  RotateCcw, 
  Sliders, 
  Sun, 
  Moon, 
  Globe2, 
  Navigation, 
  Info, 
  ChevronRight, 
  Activity,
  Zap,
  Volume2,
  VolumeX,
  Target,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Smartphone,
  LocateFixed
} from 'lucide-react';

// Celestial bodies with celestial coordinates (Azimuth 0-360°, Altitude 10-85°)
const CELESTIAL_BODIES = [
  {
    id: 'sun',
    type: 'star',
    category: 'Solar System',
    name: { en: 'The Sun (Sol)', si: 'සූර්යයා (සොල්)', ta: 'சூரியன் (Sol)' },
    subtitle: { en: 'G2V Main-Sequence Star • Solar Core', si: 'G2V ප්‍රධාන-අනුක්‍රමික තාරකාව', ta: 'G2V முதன்மை-வரிசை விண்மீன்' },
    azimuth: 145, // degrees from North
    altitude: 58, // degrees above horizon
    size: 26,
    glowColor: '#f59e0b',
    gradient: 'radial-gradient(circle, #fbbf24 0%, #f59e0b 60%, #b45309 100%)',
    pulseDelay: 0.1,
    details: {
      type: 'Yellow Dwarf (G2V)',
      distance: '1.00 AU (149.6M km)',
      spectralClass: 'G2V',
      apparentMagnitude: '-26.74',
      temperature: '5,778 K (surface)',
      funFact: {
        en: 'The Sun accounts for 99.86% of all mass in the Solar System.',
        si: 'සෞරග්‍රහ මණ්ඩලයේ සමස්ත ස්කන්ධයෙන් 99.86% ක්ම සූර්යයා සතු වේ.',
        ta: 'சூரிய மண்டலத்தின் மொத்த நிறையில் 99.86% சூரியனைக் கொண்டுள்ளது.'
      }
    }
  },
  {
    id: 'moon',
    type: 'moon',
    category: 'Solar System',
    name: { en: 'The Moon (Luna)', si: 'සඳ (ලූනා)', ta: 'சந்திரன் (Luna)' },
    subtitle: { en: 'Natural Satellite • Artemis Target', si: 'ස්වාභාවික උපග්‍රහයා • ආටෙමිස් ඉලක්කය', ta: 'இயற்கை துணைக்கோள் • ஆர்ட்டெமிஸ் இலக்கு' },
    azimuth: 220,
    altitude: 46,
    size: 22,
    glowColor: '#93c5fd',
    gradient: 'radial-gradient(circle, #f8fafc 0%, #cbd5e1 55%, #64748b 100%)',
    pulseDelay: 0.4,
    details: {
      type: 'Planetary-Mass Satellite',
      distance: '384,400 km (1.28 light-sec)',
      spectralClass: 'Reflected Solar',
      apparentMagnitude: '-12.74 (Full)',
      temperature: '-130°C to +120°C',
      funFact: {
        en: 'NASA Artemis III plans to land the next astronauts at the Moon’s permanently shadowed South Pole.',
        si: 'නාසා ආටෙමිස් III මඟින් ගගනගාමීන් සඳෙහි දක්ෂිණ ධ්‍රැවයට ගොඩබැස්සවීමට සැලසුම් කර ඇත.',
        ta: 'நாசா ஆர்ட்டெமிஸ் III அடுத்த விண்வெளி வீரர்களை சந்திரனின் தென் துருவத்தில் தரையிறக்க திட்டமிட்டுள்ளது.'
      }
    }
  },
  {
    id: 'mars',
    type: 'planet',
    category: 'Solar System',
    name: { en: 'Mars (The Red Planet)', si: 'අඟහරු (රතු ග්‍රහලෝකය)', ta: 'செவ்வாய் (சிவப்பு கிரகம்)' },
    subtitle: { en: 'Terrestrial Planet • Perseverance Rover', si: 'පාෂාණමය ග්‍රහලෝකය • පර්සවරන්ස් රෝවරය', ta: 'பாறை கிரகம் • பெர்செவரன்ஸ் ரோவர்' },
    azimuth: 82,
    altitude: 38,
    size: 20,
    glowColor: '#ef4444',
    gradient: 'radial-gradient(circle, #f87171 0%, #ef4444 60%, #991b1b 100%)',
    pulseDelay: 0.7,
    details: {
      type: 'Terrestrial Planet',
      distance: '1.52 AU (225M km avg)',
      spectralClass: 'Reflective Surface',
      apparentMagnitude: '-2.91 (at opposition)',
      temperature: '-63°C (average)',
      funFact: {
        en: 'Home to Olympus Mons, the largest volcano in the Solar System, three times higher than Mount Everest.',
        si: 'එවරස්ට් කන්ද මෙන් තුන් ගුණයකට වඩා උස ඔලිම්පස් මොන්ස් ගිනි කන්ද අඟහරු මත පිහිටා ඇත.',
        ta: 'எவரெஸ்ட் சிகரத்தை விட மூன்று மடங்கு உயரமான ஒலிம்பஸ் மோன்ஸ் எரிமலை செவ்வாயில் உள்ளது.'
      }
    }
  },
  {
    id: 'jupiter',
    type: 'planet',
    category: 'Solar System',
    name: { en: 'Jupiter & Europa', si: 'බ්‍රහස්පති සහ යුරෝපා', ta: 'வியாழன் மற்றும் யூரோப்பா' },
    subtitle: { en: 'Gas Giant • Europa Clipper Target', si: 'වායු යෝධයා • යුරෝපා ක්ලිපර් ඉලක්කය', ta: 'வாயு பெருங்கோள் • யூரோப்பா கிளிப்பர்' },
    azimuth: 295,
    altitude: 64,
    size: 24,
    glowColor: '#fb923c',
    gradient: 'radial-gradient(circle, #fed7aa 0%, #fb923c 60%, #c2410c 100%)',
    pulseDelay: 0.3,
    details: {
      type: 'Gas Giant Planet',
      distance: '5.20 AU (778M km)',
      spectralClass: 'Reflective Ammonia Cloudtops',
      apparentMagnitude: '-2.94',
      temperature: '-110°C (1 bar level)',
      funFact: {
        en: 'The Europa Clipper mission is on its way to investigate whether Europa harbors conditions suitable for life in its vast subsurface ocean.',
        si: 'යුරෝපා ක්ලිපර් මෙහෙයුම එහි භූගත සාගරයේ ජීවය සඳහා හිතකර තත්ත්වයන් පවතීදැයි පරීක්ෂා කරමින් සිටී.',
        ta: 'யூரோப்பாவின் மேற்பரப்பு பெருங்கடலில் வாழ்க்கைக்கான நிலைமைகள் உள்ளதா என்பதை ஆராய யூரோப்பா கிளிப்பர் பயணிக்கிறது.'
      }
    }
  },
  {
    id: 'saturn',
    type: 'planet',
    category: 'Solar System',
    name: { en: 'Saturn', si: 'සෙනසුරු', ta: 'சனி கிரகம்' },
    subtitle: { en: 'Ringed Wonder • Titan & Enceladus', si: 'වළලු සහිත අසිරිය • ටයිටන් සහ එන්සෙලඩස්', ta: 'வளையங்களின் அற்புதம் • டைட்டன்' },
    azimuth: 330,
    altitude: 28,
    size: 21,
    glowColor: '#fde047',
    gradient: 'radial-gradient(circle, #fef08a 0%, #eab308 65%, #854d0e 100%)',
    pulseDelay: 0.9,
    details: {
      type: 'Gas Giant with Planetary Rings',
      distance: '9.58 AU (1.43B km)',
      spectralClass: 'Reflective Ice/Dust Rings',
      apparentMagnitude: '+0.2',
      temperature: '-140°C',
      funFact: {
        en: 'Saturn’s rings are primarily made of chunks of water ice ranging from dust grains to house-sized boulders.',
        si: 'සෙනසුරුගේ වළලු ප්‍රධාන වශයෙන් ජල අයිස් කුට්ටි වලින් සමන්විත වේ.',
        ta: 'சனியின் வளையங்கள் முக்கியமாக நீர் பனித் துகள்களால் ஆனவை.'
      }
    }
  },
  {
    id: 'sirius',
    type: 'star',
    category: 'Deep Space',
    name: { en: 'Sirius (Alpha Canis Majoris)', si: 'සීරියස් (ලුබ්ධක)', ta: 'சிரியஸ் (வானத்து நாய் விண்மீன்)' },
    subtitle: { en: 'Brightest Star in Night Sky • Canis Major', si: 'රාත්‍රී අහසේ දීප්තිමත්ම තරුව', ta: 'இரவு வானின் மிக பிரகாசமான விண்மீன்' },
    azimuth: 175,
    altitude: 32,
    size: 19,
    glowColor: '#38bdf8',
    gradient: 'radial-gradient(circle, #e0f2fe 0%, #38bdf8 60%, #0284c7 100%)',
    pulseDelay: 0.2,
    details: {
      type: 'A-type Main-Sequence Binary Star',
      distance: '8.60 Light Years',
      spectralClass: 'A1V + DA2',
      apparentMagnitude: '-1.46',
      temperature: '9,940 K',
      funFact: {
        en: 'Sirius is a binary star system; its faint companion, Sirius B, was the first white dwarf star ever discovered.',
        si: 'සීරියස් යනු ද්විත්ව තාරකා පද්ධතියක් වන අතර එහි සහකරු ප්‍රථමයෙන් සොයාගත් සුදු වාමන තරුවයි.',
        ta: 'சிரியஸ் ஒரு இரட்டை விண்மீன் அமைப்பு; அதன் துணை விண்மீன் சிரியஸ் பி முதலில் கண்டுபிடிக்கப்பட்ட வெள்ளை குள்ள விண்மீனாகும்.'
      }
    }
  },
  {
    id: 'betelgeuse',
    type: 'star',
    category: 'Deep Space',
    name: { en: 'Betelgeuse (Alpha Orionis)', si: 'බීටල්ජූස් (ඔරායන්)', ta: 'பெட்டல்ஜியூஸ் (திருவாதிரை)' },
    subtitle: { en: 'Pulsating Red Supergiant • Orion', si: 'ස්පන්දනය වන රතු මහා යෝධ තාරකාව', ta: 'துடிக்கும் சிவப்பு பெரும் விண்மீன்' },
    azimuth: 110,
    altitude: 52,
    size: 23,
    glowColor: '#ea580c',
    gradient: 'radial-gradient(circle, #fdba74 0%, #ea580c 60%, #7c2d12 100%)',
    pulseDelay: 1.1,
    details: {
      type: 'Red Supergiant Semiregular Variable',
      distance: '642.5 Light Years',
      spectralClass: 'M1-2 Ia-ab',
      apparentMagnitude: '+0.50 (Variable)',
      temperature: '3,600 K',
      funFact: {
        en: 'Betelgeuse is nearing the end of its life and is expected to explode as a dramatic supernova within the next 100,000 years.',
        si: 'බීටල්ජූස් තාරකාව ඉදිරි වසර 100,000 තුළ සුපර්නෝවා පිපිරීමකින් විනාශ වනු ඇතැයි ගණනය කර ඇත.',
        ta: 'பெட்டல்ஜியூஸ் தனது வாழ்நாளின் இறுதியை எட்டியுள்ளது மற்றும் அடுத்த 100,000 ஆண்டுகளில் சூப்பர்நோவாவாக வெடிக்கும்.'
      }
    }
  },
  {
    id: 'polaris',
    type: 'star',
    category: 'Deep Space',
    name: { en: 'Polaris (North Star)', si: 'ධ්‍රැව තරුව (පොලාරිස්)', ta: 'துருவ விண்மீன் (Polaris)' },
    subtitle: { en: 'Celestial North Anchor • Ursa Minor', si: 'උතුරු ආකාශ නැංගුරම', ta: 'வட வான நங்கூரம்' },
    azimuth: 0,
    altitude: 72,
    size: 18,
    glowColor: '#a7f3d0',
    gradient: 'radial-gradient(circle, #f0fdf4 0%, #6ee7b7 60%, #059669 100%)',
    pulseDelay: 0.5,
    details: {
      type: 'Multiple Star System (F7Ib Yellow Supergiant)',
      distance: '433 Light Years',
      spectralClass: 'F7Ib',
      apparentMagnitude: '+1.98',
      temperature: '6,015 K',
      funFact: {
        en: 'Polaris sits almost directly above the Earth’s northern rotational axis, remaining nearly stationary throughout the night.',
        si: 'පොලාරිස් පෘථිවියේ උතුරු භ්‍රමණ අක්ෂයට ඉහළින් පිහිටා ඇති බැවින් රාත්‍රිය පුරාම නිශ්චලව පෙනේ.',
        ta: 'துருவ விண்மீன் பூமியின் வடக்கு சுழற்சி அச்சுக்கு நேர் மேலே உள்ளது, இதனால் இரவு முழுவதும் நிலையாக காட்சியளிக்கிறது.'
      }
    }
  },
  {
    id: 'jwst',
    type: 'spacecraft',
    category: 'Observatories',
    name: { en: 'James Webb Space Telescope (JWST)', si: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය', ta: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி' },
    subtitle: { en: 'Infrared Eye at Sun-Earth L2 Orbit', si: 'ලග්‍රාන්ජ් 2 ලක්ෂ්‍යයේ අධෝරක්ත ඇස', ta: 'சன்-எர்த் L2 சுற்றுப்பாதையில் அகச்சிவப்பு கண்' },
    azimuth: 255,
    altitude: 41,
    size: 20,
    glowColor: '#eab308',
    gradient: 'radial-gradient(circle, #fef08a 0%, #ca8a04 60%, #713f12 100%)',
    pulseDelay: 0.8,
    details: {
      type: 'Cryogenic Infrared Space Observatory',
      distance: '1.5 Million km (Sun-Earth L2)',
      spectralClass: 'Artificial Satellite (Gold Mirrors)',
      apparentMagnitude: '+14 (Telescopic)',
      temperature: '-233°C (Cryogenic cold side)',
      funFact: {
        en: 'Its 6.5-meter beryllium primary mirror is coated with a microscopic layer of pure gold to reflect infrared light with 98% efficiency.',
        si: 'මෙහි මීටර් 6.5 ක බෙරිලියම් දර්පණය අධෝරක්ත කිරණ පරාවර්තනය කිරීම සඳහා පිරිසිදු රන් ආලේපිත කර ඇත.',
        ta: 'அதன் 6.5 மீட்டர் பெரிலியம் முதன்மை கண்ணாடி அகச்சிவப்பு ஒளியை 98% பிரதிபலிக்க தூய தங்கத்தால் பூசப்பட்டுள்ளது.'
      }
    }
  },
  {
    id: 'iss',
    type: 'spacecraft',
    category: 'Observatories',
    name: { en: 'International Space Station (ISS)', si: 'ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය', ta: 'சர்வதேச விண்வெளி நிலையம்' },
    subtitle: { en: 'Crewed Microgravity Laboratory • LEO', si: 'පහළ පෘථිවි කක්ෂීය විද්‍යාගාරය', ta: 'நுண் ஈர்ப்பு விண்வெளி ஆய்வகம்' },
    azimuth: 48,
    altitude: 54,
    size: 19,
    glowColor: '#38bdf8',
    gradient: 'radial-gradient(circle, #ffffff 0%, #38bdf8 65%, #1e40af 100%)',
    pulseDelay: 0.15,
    details: {
      type: 'Modular Low Earth Orbit Space Station',
      distance: '420 km Altitude (LEO)',
      spectralClass: 'Artificial Satellite (Solar Arrays)',
      apparentMagnitude: '-3.8 (Peak visibility)',
      velocity: '27,600 km/h (7.66 km/s)',
      funFact: {
        en: 'Orbits the Earth every 90 minutes, allowing astronauts to witness 16 sunrises and sunsets every single day.',
        si: 'සෑම මිනිත්තු 90 කට වරක් පෘථිවිය වටා භ්‍රමණය වන බැවින් දිනකට හිරු උදාවීම් සහ බැසීම් 16 ක් දර්ශනය වේ.',
        ta: 'ஒவ்வொரு 90 நிமிடங்களுக்கும் பூமியை சுற்றி வருகிறது, இதனால் விண்வெளி வீரர்கள் ஒரு நாளில் 16 சூரிய உதயங்களைக் காண்கிறார்கள்.'
      }
    }
  }
];

// Constellation Line Definitions connecting celestial bodies or stars with center coordinates
const CONSTELLATIONS = [
  {
    id: 'orion',
    name: { en: 'Orion (The Hunter)', si: 'ඔරායන් (දඩයක්කාරයා)', ta: 'ஓரியன் (வேட்டைக்காரன்)' },
    centerAz: 114,
    centerAlt: 42,
    description: {
      en: 'Features Betelgeuse, Rigel, and Orion’s Belt.',
      si: 'බීටල්ජූස්, රීගල් සහ ඔරායන්ගේ පටිය ඇතුළත් වේ.',
      ta: 'பெட்டல்ஜியூஸ், ரீகல் மற்றும் ஓரியன் பெல்ட் கொண்டது.'
    },
    points: [
      { az: 110, alt: 52 }, // Betelgeuse
      { az: 118, alt: 47 }, // Bellatrix
      { az: 114, alt: 39 }, // Mintaka (Belt)
      { az: 112, alt: 38 }, // Alnilam (Belt)
      { az: 110, alt: 37 }, // Alnitak (Belt)
      { az: 104, alt: 29 }, // Saiph
      { az: 122, alt: 31 }  // Rigel
    ]
  },
  {
    id: 'ursa_major',
    name: { en: 'Ursa Major (Big Dipper)', si: 'මහා වලසා (සප්තර්ෂි)', ta: 'உர்சா மேஜர் (சப்தரிஷி)' },
    centerAz: 12,
    centerAlt: 54,
    description: {
      en: 'Pointer stars point directly to Polaris (North Star).',
      si: 'ධ්‍රැව තරුව වෙත මඟ පෙන්වන සප්තර්ෂි තාරකා රටාව.',
      ta: 'துருவ விண்மீனுக்கு வழிகாட்டும் முக்கியமான வடக்கு விண்மீன் கூட்டம்.'
    },
    points: [
      { az: 345, alt: 60 },
      { az: 350, alt: 54 },
      { az: 358, alt: 50 },
      { az: 4, alt: 48 },
      { az: 12, alt: 54 },
      { az: 22, alt: 56 },
      { az: 28, alt: 64 }
    ]
  },
  {
    id: 'cassiopeia',
    name: { en: 'Cassiopeia (The Queen)', si: 'කැසියෝපියා (රැජින)', ta: 'காசியோபியா (அரசி)' },
    centerAz: 27,
    centerAlt: 68,
    description: {
      en: 'Distinctive W-shaped circumpolar constellation.',
      si: 'W අකුරේ හැඩය ගන්නා උතුරු ආකාශයේ තාරකා රටාව.',
      ta: 'W வடிவிலான தனித்துவமான வடக்கு வான விண்மீன் கூட்டம்.'
    },
    points: [
      { az: 16, alt: 72 },
      { az: 22, alt: 69 },
      { az: 27, alt: 71 },
      { az: 32, alt: 66 },
      { az: 38, alt: 64 }
    ]
  },
  {
    id: 'cygnus',
    name: { en: 'Cygnus (The Swan)', si: 'සිග්නස් (හංසයා)', ta: 'சிக்னஸ் (அன்னப்பறவை)' },
    centerAz: 290,
    centerAlt: 74,
    description: {
      en: 'Northern Cross soaring along the Milky Way with Deneb.',
      si: 'ඩෙනෙබ් තරුව සහිත ක්ෂීරපථයේ උතුරු කුරුසය.',
      ta: 'டெனெப் விண்மீன் மற்றும் பால்வீதி வழியே வடக்கு சிலுவை.'
    },
    points: [
      { az: 290, alt: 80 },
      { az: 291, alt: 74 },
      { az: 293, alt: 66 },
      { az: 280, alt: 75 },
      { az: 302, alt: 73 }
    ]
  }
];

const getCardinalDirection = (deg) => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return directions[index];
};

/**
 * Circular AR Compass Overlay with Live Device Orientation & Constellation Align Beacon
 */
function CircularARCompass({
  azimuthOffset,
  setAzimuthOffset,
  isGyroActive,
  toggleGyro,
  isGyroSupported,
  targetConstellation,
  targetConstellationId,
  setTargetConstellationId,
  constellations,
  isAligned,
  deltaAngle,
  lang,
  isExpanded,
  setIsExpanded
}) {
  const currentCardinal = getCardinalDirection(azimuthOffset);
  const targetName = targetConstellation.name[lang] || targetConstellation.name.en;

  return (
    <div className="absolute top-4 right-4 z-20 pointer-events-auto">
      {/* Minimized Quick Badge */}
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className={`flex items-center gap-2 p-2 rounded-2xl border transition shadow-2xl backdrop-blur-xl ${
            isAligned
              ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow-emerald-500/30'
              : 'bg-slate-950/85 border-cyan-500/30 text-cyan-300 hover:border-cyan-400'
          }`}
          title="Expand AR Compass & Constellation Aligner"
        >
          {/* Rotating mini compass icon */}
          <div className="relative w-7 h-7 flex items-center justify-center">
            <Compass 
              className="w-6 h-6 text-cyan-400"
              style={{ transform: `rotate(${-azimuthOffset}deg)` }}
            />
            {isAligned && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            )}
          </div>
          <div className="text-left font-mono">
            <div className="text-[10px] text-slate-400 leading-tight">COMPASS</div>
            <div className="text-xs font-bold leading-tight flex items-center gap-1">
              <span>{Math.round(azimuthOffset)}°</span>
              <span className="text-cyan-400">{currentCardinal}</span>
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
        </button>
      ) : (
        /* Full Circular Compass HUD Card */
        <div className={`w-[260px] sm:w-[280px] rounded-3xl p-3 border transition-all duration-300 shadow-2xl backdrop-blur-2xl flex flex-col items-center ${
          isAligned 
            ? 'bg-slate-950/95 border-emerald-400/80 shadow-[0_0_25px_rgba(52,211,153,0.3)]' 
            : 'bg-slate-950/90 border-cyan-500/35 shadow-cyan-950/60'
        }`}>
          {/* Compass Top Bar */}
          <div className="w-full flex items-center justify-between pb-2 mb-1.5 border-b border-cyan-500/20 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span className="text-[11px] font-bold text-white tracking-wider font-['Orbitron']">
                AR COMPASS
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Gyro Toggle Button */}
              <button
                onClick={toggleGyro}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 border transition ${
                  isGyroActive 
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-sm shadow-emerald-500/30' 
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title={isGyroActive ? 'Device Gyroscope Active (Tracking Orientation)' : 'Enable Device Orientation Sensors'}
              >
                <Smartphone className={`w-3 h-3 ${isGyroActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                <span>{isGyroActive ? 'GYRO ON' : 'GYRO OFF'}</span>
              </button>

              {/* Minimize Button */}
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition"
                title="Minimize Compass"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* THE CIRCULAR COMPASS DIAL */}
          <div className="relative w-[136px] h-[136px] my-1 flex items-center justify-center select-none">
            {/* Outer Subtle Glass Ring & Glowing Border */}
            <div className={`absolute inset-0 rounded-full border-2 transition-colors duration-300 pointer-events-none ${
              isAligned 
                ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]' 
                : 'border-cyan-500/30 shadow-[inset_0_0_15px_rgba(6,182,212,0.15)]'
            }`} />

            {/* Fixed Top Line-of-Sight Marker (Lubber Line: Where Phone is Pointing) */}
            <div className="absolute top-0.5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
              <span className={`text-[10px] leading-none transition-colors ${isAligned ? 'text-emerald-400 font-bold' : 'text-cyan-400'}`}>
                ▼
              </span>
            </div>

            {/* Rotating Compass Rose Dial */}
            <div 
              className="absolute inset-2 rounded-full transition-transform duration-100 ease-out flex items-center justify-center"
              style={{ transform: `rotate(${-azimuthOffset}deg)` }}
            >
              {/* Compass Degree Tick Marks SVG */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 120 120">
                {/* 12 Degree Radial Ticks (every 30°) */}
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
                  const rad = ((deg - 90) * Math.PI) / 180;
                  const isCardinal = deg % 90 === 0;
                  const r1 = 56;
                  const r2 = isCardinal ? 47 : 50;
                  const x1 = 60 + r1 * Math.cos(rad);
                  const y1 = 60 + r1 * Math.sin(rad);
                  const x2 = 60 + r2 * Math.cos(rad);
                  const y2 = 60 + r2 * Math.sin(rad);
                  return (
                    <line
                      key={`tick-${deg}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isCardinal ? (deg === 0 ? '#f43f5e' : '#38bdf8') : 'rgba(148, 163, 184, 0.4)'}
                      strokeWidth={isCardinal ? (deg === 0 ? '2.2' : '1.8') : '1'}
                    />
                  );
                })}
              </svg>

              {/* Cardinal Labels on Dial */}
              {/* North Pointer Needle */}
              <div className="absolute top-1 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
                <span className="text-[11px] font-mono font-extrabold text-rose-400 leading-none drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]">
                  N
                </span>
                <span className="w-0.5 h-3 bg-rose-500 rounded-full" />
              </div>

              {/* South Marker */}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
                <span className="w-0.5 h-2.5 bg-cyan-600 rounded-full" />
                <span className="text-[9px] font-mono font-bold text-cyan-400 leading-none">
                  S
                </span>
              </div>

              {/* East Marker */}
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <span className="text-[9px] font-mono font-bold text-cyan-400 leading-none">
                  E
                </span>
              </div>

              {/* West Marker */}
              <div className="absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <span className="text-[9px] font-mono font-bold text-cyan-400 leading-none">
                  W
                </span>
              </div>

              {/* TARGET BEACON NEEDLE (Points toward target constellation coordinates) */}
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{ transform: `rotate(${targetConstellation.centerAz}deg)` }}
              >
                <div className="absolute top-0.5 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-amber-400 border border-amber-200 shadow-[0_0_10px_#f59e0b] flex items-center justify-center">
                    <span className="w-1 h-1 rounded-full bg-slate-950" />
                  </div>
                  <div className="w-0.5 h-4 bg-gradient-to-b from-amber-400 to-transparent" />
                </div>
              </div>
            </div>

            {/* Central Digital Readout Hub */}
            <div className={`w-[66px] h-[66px] rounded-full border flex flex-col items-center justify-center z-10 text-center transition-colors duration-200 ${
              isAligned 
                ? 'bg-emerald-950/90 border-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.3)]' 
                : 'bg-slate-900/90 border-cyan-500/40 shadow-inner'
            }`}>
              <span className={`text-[10px] font-mono font-bold leading-none ${isAligned ? 'text-emerald-300' : 'text-cyan-400'}`}>
                {currentCardinal}
              </span>
              <span className="text-sm font-mono font-extrabold text-white leading-tight tracking-tight">
                {Math.round(azimuthOffset)}°
              </span>
              <span className={`text-[8px] font-mono font-semibold leading-none ${isAligned ? 'text-emerald-400' : 'text-slate-400'}`}>
                {isAligned ? 'LOCKED' : `${Math.abs(Math.round(deltaAngle))}° OFF`}
              </span>
            </div>
          </div>

          {/* Alignment Status Guidance Banner */}
          <div className="w-full mt-1.5">
            {isAligned ? (
              <div className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-mono text-[10px] font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 animate-pulse text-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">
                  {lang === 'si' ? 'ඉලක්කය සමපාත විය!' : lang === 'ta' ? 'இலக்கு சீரமைக்கப்பட்டது!' : 'ALIGNED WITH TARGET!'}
                </span>
              </div>
            ) : (
              <div className="px-2.5 py-1 rounded-xl bg-slate-900/90 border border-slate-700/80 text-cyan-200 font-mono text-[10px] flex items-center justify-center gap-1.5 text-center">
                <Navigation className={`w-3 h-3 text-amber-400 shrink-0 ${deltaAngle > 0 ? 'rotate-90' : '-rotate-90'}`} />
                <span>
                  {deltaAngle > 0 
                    ? (lang === 'si' ? `දකුණට හරවන්න +${Math.round(deltaAngle)}°` : lang === 'ta' ? `வலதுபுறம் திருப்பவும் +${Math.round(deltaAngle)}°` : `Turn Right +${Math.round(deltaAngle)}°`)
                    : (lang === 'si' ? `වමට හරවන්න ${Math.round(deltaAngle)}°` : lang === 'ta' ? `இடதுபுறம் திருப்பவும் ${Math.round(deltaAngle)}°` : `Turn Left ${Math.round(deltaAngle)}°`)}
                </span>
              </div>
            )}
          </div>

          {/* Constellation Selector & Snap Coordinates Controls */}
          <div className="w-full mt-1.5 pt-1.5 border-t border-slate-800 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
              <span>{lang === 'si' ? 'ඉලක්ක තාරකා රටාව:' : lang === 'ta' ? 'இலக்கு விண்மீன் கூட்டம்:' : 'Target Constellation:'}</span>
              <span className="text-amber-300 font-bold">AZ {targetConstellation.centerAz}° / ALT +{targetConstellation.centerAlt}°</span>
            </div>

            {/* Constellation Selector Buttons */}
            <div className="grid grid-cols-2 gap-1 w-full">
              {constellations.map((c) => {
                const isSelected = targetConstellationId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setTargetConstellationId(c.id)}
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-mono font-semibold truncate transition text-center ${
                      isSelected
                        ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-600/30 font-bold border border-cyan-400'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {c.name[lang] || c.name.en}
                  </button>
                );
              })}
            </div>

            {/* Quick Snap Alignment Button */}
            <button
              onClick={() => setAzimuthOffset(targetConstellation.centerAz)}
              className="mt-0.5 w-full py-1 px-2 rounded-xl bg-gradient-to-r from-cyan-600/30 to-blue-600/30 hover:from-cyan-600/50 hover:to-blue-600/50 border border-cyan-500/40 text-cyan-200 text-[9px] font-mono font-bold flex items-center justify-center gap-1.5 transition"
              title="Automatically align phone view to target coordinates"
            >
              <LocateFixed className="w-3 h-3 text-cyan-300" />
              <span>{lang === 'si' ? 'ස්වයංක්‍රීයව සමපාත කරන්න' : lang === 'ta' ? 'தானாக சீரமைக்கவும்' : 'Snap View to Coordinates'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ARStarMap({ lang = 'en', onSelectTarget = null }) {
  const [selectedBodyId, setSelectedBodyId] = useState('mars');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [showConstellations, setShowConstellations] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [azimuthOffset, setAzimuthOffset] = useState(0); // Pan orientation in degrees
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const initialOffset = useRef(0);

  // Device orientation (gyroscope) state
  const [deviceHeading, setDeviceHeading] = useState(0);
  const [isGyroActive, setIsGyroActive] = useState(false);
  const [isGyroSupported, setIsGyroSupported] = useState(false);
  const [targetConstellationId, setTargetConstellationId] = useState('orion');
  const [isCompassExpanded, setIsCompassExpanded] = useState(true);
  const prevAlignedRef = useRef(false);

  // Listen for DeviceOrientationEvent
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.DeviceOrientationEvent) {
      setIsGyroSupported(true);
    }

    if (!isGyroActive) return;

    const handleOrientation = (e) => {
      let heading = null;

      // 1. iOS Safari webkitCompassHeading
      if (typeof e.webkitCompassHeading !== 'undefined' && e.webkitCompassHeading !== null) {
        heading = e.webkitCompassHeading;
      }
      // 2. Standard Android alpha
      else if (e.alpha !== null && typeof e.alpha !== 'undefined') {
        heading = (360 - e.alpha) % 360;
      }

      if (heading !== null && !isNaN(heading)) {
        setDeviceHeading(heading);
        setAzimuthOffset(Math.round(heading));
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [isGyroActive]);

  // Toggle Gyroscope with iOS requestPermission handling
  const toggleGyro = async () => {
    if (isGyroActive) {
      setIsGyroActive(false);
      return;
    }

    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          setIsGyroActive(true);
        }
      } catch (err) {
        console.warn('Device orientation permission rejected:', err);
        setIsGyroActive(true);
      }
    } else {
      setIsGyroActive(true);
    }
  };

  // Target constellation and alignment calculation
  const targetConstellation = useMemo(() => {
    return CONSTELLATIONS.find((c) => c.id === targetConstellationId) || CONSTELLATIONS[0];
  }, [targetConstellationId]);

  const targetAzimuth = targetConstellation.centerAz;
  const rawDiff = targetAzimuth - azimuthOffset;
  const deltaAngle = ((rawDiff + 540) % 360) - 180;
  const isAligned = Math.abs(deltaAngle) <= 6;

  // Sound feedback on coordinate alignment
  const playAlignmentChime = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [880, 1320, 1760].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        gain.gain.setValueAtTime(0.001, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.12, now + i * 0.05 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.23);
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([15, 35, 20]);
      }
    } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    if (isAligned && !prevAlignedRef.current) {
      playAlignmentChime();
    }
    prevAlignedRef.current = isAligned;
  }, [isAligned, playAlignmentChime]);

  // Audio Context for AR sensor lock-on sound
  const playTargetLock = () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.08);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch {}
  };

  const selectedBody = useMemo(() => {
    return CELESTIAL_BODIES.find(b => b.id === selectedBodyId) || CELESTIAL_BODIES[0];
  }, [selectedBodyId]);

  // Handle Drag to Rotate / Pan AR Sky Dome
  const handlePointerDown = (e) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    initialOffset.current = azimuthOffset;
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX.current;
    // Map pixels to azimuth angle
    const newOffset = (initialOffset.current - deltaX * 0.35 + 360) % 360;
    setAzimuthOffset(newOffset);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Convert Azimuth (0-360°) and Altitude (0-90°) to 2D Planar Projection
  // Center is Zenit (Altitude = 90°), Outer Ring is Horizon (Altitude = 0°)
  const projectToSkyMap = (azimuth, altitude, width, height) => {
    // Corrected azimuth based on user rotation
    const adjustedAz = ((azimuth - azimuthOffset) % 360 + 360) % 360;
    const azRad = ((adjustedAz - 90) * Math.PI) / 180;
    // Radius proportional to zenith distance (90 - altitude)
    const maxRadius = Math.min(width, height) * 0.44;
    const r = ((90 - Math.max(10, Math.min(88, altitude))) / 80) * maxRadius;

    const cx = width / 2;
    const cy = height / 2;

    const x = cx + r * Math.cos(azRad);
    const y = cy + r * Math.sin(azRad);

    return { x, y, r, adjustedAz };
  };

  // Container dimensions
  const mapWidth = 840;
  const mapHeight = 560;

  const filteredBodies = useMemo(() => {
    if (filterCategory === 'ALL') return CELESTIAL_BODIES;
    return CELESTIAL_BODIES.filter(b => b.category === filterCategory);
  }, [filterCategory]);

  return (
    <div className="w-full bg-[#080D1A] rounded-3xl border border-cyan-500/25 shadow-2xl overflow-hidden text-slate-100 flex flex-col font-sans select-none">
      
      {/* Top AR Star Map Command Bar */}
      <div className="p-4 sm:p-5 border-b border-cyan-500/20 bg-gradient-to-r from-[#070A12] via-[#0E172A] to-[#070A12] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-sky-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-950/60 flex items-center justify-center">
            <Compass className="w-5 h-5 text-white animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight font-['Orbitron']">
                {lang === 'si' ? 'AR අභ්‍යවකාශ තාරකා සිතියම' : lang === 'ta' ? 'AR விண்வெளி விண்மீன் வரைபடம்' : 'AR Celestial Star Map'}
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                LIVE AR
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              {lang === 'si' 
                ? 'තත්‍ය කාලීන ස්පන්දන සජීවිකරණ සහිත ආකාශ ගෝලය' 
                : lang === 'ta' 
                ? 'நிகழ்நேர துடிப்பு அனிமேஷன்களுடன் கூடிய வான உருண்டை' 
                : 'Real-time Celestial Sphere with Framer Motion Pulse Telemetry'}
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800">
          {['ALL', 'Solar System', 'Deep Space', 'Observatories'].map((cat) => {
            const isCatActive = filterCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  isCatActive 
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat === 'ALL' 
                  ? (lang === 'si' ? 'සියල්ල' : lang === 'ta' ? 'அனைத்தும்' : 'All')
                  : cat === 'Solar System'
                  ? (lang === 'si' ? 'සෞරග්‍රහ' : lang === 'ta' ? 'சூரிய மண்டலம்' : 'Planets')
                  : cat === 'Deep Space'
                  ? (lang === 'si' ? 'තාරකා' : lang === 'ta' ? 'விண்மீன்கள்' : 'Stars')
                  : (lang === 'si' ? 'නිරීක්ෂණාගාර' : lang === 'ta' ? 'ஆய்வகங்கள்' : 'Observatories')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Interactive AR Dome Canvas */}
      <div 
        className="relative w-full h-[520px] sm:h-[580px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0d182e] via-[#070d1a] to-[#03060c] overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background Ambient Stars Twinkling */}
        <div className="absolute inset-0 pointer-events-none opacity-60">
          {[...Array(60)].map((_, i) => (
            <motion.div
              key={`bg-star-${i}`}
              className="absolute w-1 h-1 bg-white rounded-full"
              style={{
                top: `${(i * 17) % 100}%`,
                left: `${(i * 29) % 100}%`,
                opacity: 0.2 + ((i % 5) * 0.15)
              }}
              animate={{
                opacity: [0.2, 0.9, 0.2],
                scale: [0.8, 1.3, 0.8]
              }}
              transition={{
                duration: 2.2 + (i % 4),
                repeat: Infinity,
                ease: 'easeInOut',
                delay: (i % 6) * 0.4
              }}
            />
          ))}
        </div>

        {/* Concentric Altitude Grid Rings (Alt: 30°, 60°, 90° Zenith) */}
        {showGrid && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* 30° Altitude Ring */}
            <div className="w-[84%] h-[84%] rounded-full border border-cyan-500/15 border-dashed flex items-center justify-center relative">
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-500/40">ALT 30°</span>
            </div>
            {/* 60° Altitude Ring */}
            <div className="w-[54%] h-[54%] rounded-full border border-cyan-500/20 flex items-center justify-center relative">
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-500/50">ALT 60°</span>
            </div>
            {/* 80° Zenith Ring */}
            <div className="w-[20%] h-[20%] rounded-full border border-cyan-500/25 border-dotted flex items-center justify-center relative">
              <span className="text-[9px] font-mono text-cyan-400/60">ZENITH</span>
            </div>

            {/* Crosshair Cardinal Lines */}
            <div className="absolute w-[88%] h-px bg-cyan-500/15" />
            <div className="absolute h-[88%] w-px bg-cyan-500/15" />

            {/* Cardinal Direction Points (Rotates with Azimuth Offset) */}
            {[
              { label: 'N (000°)', az: 0, color: 'text-rose-400' },
              { label: 'E (090°)', az: 90, color: 'text-cyan-400' },
              { label: 'S (180°)', az: 180, color: 'text-amber-400' },
              { label: 'W (270°)', az: 270, color: 'text-cyan-400' }
            ].map(({ label, az, color }) => {
              const rad = ((az - azimuthOffset - 90) * Math.PI) / 180;
              const r = Math.min(mapWidth, mapHeight) * 0.44;
              const x = r * Math.cos(rad);
              const y = r * Math.sin(rad);

              return (
                <div
                  key={label}
                  className={`absolute font-mono text-[11px] font-bold ${color} px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-800 shadow-md transform -translate-x-1/2 -translate-y-1/2`}
                  style={{
                    transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        )}

        {/* Constellation Star Lines */}
        {showConstellations && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
            {CONSTELLATIONS.map((c) => {
              const projected = c.points.map(pt => projectToSkyMap(pt.az, pt.alt, mapWidth, mapHeight));
              const pathD = projected.reduce((acc, pt, idx) => {
                return `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`;
              }, '');
              const isTargetConstellation = targetConstellationId === c.id;

              return (
                <g key={c.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isTargetConstellation ? 'rgba(251, 191, 36, 0.75)' : 'rgba(56, 189, 248, 0.28)'}
                    strokeWidth={isTargetConstellation ? '2' : '1.2'}
                    strokeDasharray={isTargetConstellation ? 'none' : '3 3'}
                  />
                  {projected.map((pt, i) => (
                    <circle
                      key={`pt-${i}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={isTargetConstellation ? '3' : '2'}
                      fill={isTargetConstellation ? '#fbbf24' : '#38bdf8'}
                      opacity={isTargetConstellation ? '1' : '0.7'}
                    />
                  ))}
                  {/* Constellation Label */}
                  {projected[0] && (
                    <text
                      x={projected[0].x + 6}
                      y={projected[0].y - 6}
                      fill={isTargetConstellation ? '#fbbf24' : 'rgba(148, 163, 184, 0.75)'}
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight={isTargetConstellation ? 'bold' : 'normal'}
                      className="select-none pointer-events-none"
                    >
                      {c.name[lang] || c.name.en}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* CELESTIAL BODIES WITH FRAMER MOTION SUBTLE PULSE ANIMATIONS */}
        {/* ---------------------------------------------------------------- */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {filteredBodies.map((body) => {
            const pos = projectToSkyMap(body.azimuth, body.altitude, mapWidth, mapHeight);
            const isSelected = selectedBodyId === body.id;

            return (
              <div
                key={body.id}
                className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 cursor-pointer flex flex-col items-center"
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`
                }}
                onClick={() => {
                  setSelectedBodyId(body.id);
                  playTargetLock();
                  if (onSelectTarget) {
                    onSelectTarget(body);
                  }
                }}
              >
                {/* Pulse Layer 1: Expanding Radar Ripple Halo */}
                <motion.div
                  className="absolute rounded-full border pointer-events-none"
                  style={{
                    width: `${body.size * 2.6}px`,
                    height: `${body.size * 2.6}px`,
                    borderColor: body.glowColor
                  }}
                  animate={{
                    scale: [1, 1.6, 2.2],
                    opacity: [0.75, 0.35, 0]
                  }}
                  transition={{
                    duration: 3.2 + body.pulseDelay,
                    repeat: Infinity,
                    ease: 'easeOut',
                    delay: body.pulseDelay
                  }}
                />

                {/* Pulse Layer 2: Soft Atmospheric Core Breathing Glow */}
                <motion.div
                  className="absolute rounded-full blur-md pointer-events-none"
                  style={{
                    width: `${body.size * 1.8}px`,
                    height: `${body.size * 1.8}px`,
                    backgroundColor: body.glowColor
                  }}
                  animate={{
                    scale: [1, 1.35, 1],
                    opacity: [0.25, 0.7, 0.25]
                  }}
                  transition={{
                    duration: 2.6 + body.pulseDelay * 0.7,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />

                {/* Target Locked Rotating Reticle */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 1.8, opacity: 0, rotate: 0 }}
                    animate={{ scale: 1, opacity: 1, rotate: 360 }}
                    transition={{
                      scale: { duration: 0.25 },
                      rotate: { duration: 16, repeat: Infinity, ease: 'linear' }
                    }}
                    className="absolute rounded-full border-2 border-dashed border-cyan-400 pointer-events-none"
                    style={{
                      width: `${body.size + 24}px`,
                      height: `${body.size + 24}px`
                    }}
                  />
                )}

                {/* Celestial Body Core Sphere with Subtle Breathing Animation */}
                <motion.div
                  className="relative rounded-full flex items-center justify-center shadow-lg"
                  style={{
                    width: `${body.size}px`,
                    height: `${body.size}px`,
                    background: body.gradient,
                    boxShadow: `0 0 18px ${body.glowColor}`
                  }}
                  animate={{
                    scale: [1, 1.08, 1]
                  }}
                  transition={{
                    duration: 2.5 + body.pulseDelay,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                  whileHover={{
                    scale: 1.4,
                    transition: { duration: 0.15 }
                  }}
                  whileTap={{ scale: 0.9 }}
                >
                  {/* Subtle inner specular glint */}
                  <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-white/70 blur-[0.5px]" />
                </motion.div>

                {/* Celestial Body Tag / Indicator with Floating Framer Motion */}
                <motion.div
                  animate={{
                    y: [0, -2.5, 0],
                    opacity: isSelected ? 1 : 0.85
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                  className={`mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono whitespace-nowrap transition-all duration-200 border flex items-center gap-1 ${
                    isSelected
                      ? 'bg-cyan-950/95 text-cyan-200 border-cyan-400 shadow-md shadow-cyan-900/60 font-bold scale-105'
                      : 'bg-slate-950/80 text-slate-300 border-slate-700/70 hover:border-cyan-500/50'
                  }`}
                >
                  <span 
                    className="w-1.5 h-1.5 rounded-full shrink-0" 
                    style={{ backgroundColor: body.glowColor }} 
                  />
                  <span>{body.name[lang] || body.name.en}</span>
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Subtle Circular AR Compass & Constellation Coordinate Aligner Overlay */}
        <CircularARCompass
          azimuthOffset={azimuthOffset}
          setAzimuthOffset={setAzimuthOffset}
          isGyroActive={isGyroActive}
          toggleGyro={toggleGyro}
          isGyroSupported={isGyroSupported}
          targetConstellation={targetConstellation}
          targetConstellationId={targetConstellationId}
          setTargetConstellationId={setTargetConstellationId}
          constellations={CONSTELLATIONS}
          isAligned={isAligned}
          deltaAngle={deltaAngle}
          lang={lang}
          isExpanded={isCompassExpanded}
          setIsExpanded={setIsCompassExpanded}
        />

        {/* Central AR Crosshair & Orientation Telemetry HUD */}
        <div className="absolute bottom-4 left-4 z-20 pointer-events-auto bg-slate-950/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-3 shadow-2xl flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-cyan-400 animate-pulse" />
            <div>
              <span className="text-[10px] text-slate-400 block">AZIMUTH (HDG)</span>
              <span className="text-cyan-300 font-bold">{Math.round(azimuthOffset)}° N</span>
            </div>
          </div>
          <div className="h-6 w-px bg-slate-800" />
          <div>
            <span className="text-[10px] text-slate-400 block">VISIBLE BODIES</span>
            <span className="text-emerald-400 font-bold">{filteredBodies.length} TRACKED</span>
          </div>
          <div className="h-6 w-px bg-slate-800" />
          <button
            onClick={() => setAzimuthOffset(0)}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition"
            title="Reset Orientation to True North"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        </div>

        {/* Floating Quick Action Controls Bar (Constellations, Grid, Audio) */}
        <div className="absolute bottom-4 right-4 z-20 pointer-events-auto flex items-center gap-2 bg-slate-950/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-1.5 shadow-2xl">
          <button
            onClick={() => setShowConstellations(!showConstellations)}
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              showConstellations ? 'bg-cyan-600/80 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
            title="Toggle Constellation Lines"
          >
            <Sparkles className="w-4 h-4 text-cyan-300" />
            <span className="hidden sm:inline">Lines</span>
          </button>

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              showGrid ? 'bg-indigo-600/80 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
            title="Toggle Altitude Grid"
          >
            <Layers className="w-4 h-4 text-indigo-300" />
            <span className="hidden sm:inline">Grid</span>
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              soundEnabled ? 'bg-emerald-600/80 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
            title="Toggle Sensor Audio"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-300" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>
        </div>
      </div>

      {/* Selected Celestial Body Telemetry Drawer */}
      <AnimatePresence mode="wait">
        {selectedBody && (
          <motion.div
            key={selectedBody.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="p-4 sm:p-6 bg-slate-950/95 border-t border-cyan-500/20"
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg relative shrink-0"
                  style={{ 
                    backgroundColor: `${selectedBody.glowColor}25`,
                    borderColor: `${selectedBody.glowColor}60`,
                    borderWidth: 1 
                  }}
                >
                  <Target className="w-6 h-6 text-cyan-300 animate-pulse" />
                  <motion.div
                    className="absolute inset-0 rounded-2xl border"
                    style={{ borderColor: selectedBody.glowColor }}
                    animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0.2, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white font-['Orbitron']">
                      {selectedBody.name[lang] || selectedBody.name.en}
                    </h3>
                    <span 
                      className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
                      style={{ 
                        color: selectedBody.glowColor, 
                        borderColor: `${selectedBody.glowColor}60`,
                        backgroundColor: `${selectedBody.glowColor}15`
                      }}
                    >
                      {selectedBody.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedBody.subtitle[lang] || selectedBody.subtitle.en}
                  </p>
                </div>
              </div>

              {/* Sky Coordinates Badge */}
              <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 px-4 py-2 rounded-2xl text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block">AZIMUTH</span>
                  <span className="text-cyan-300 font-bold">{selectedBody.azimuth}°</span>
                </div>
                <div className="h-6 w-px bg-slate-800" />
                <div>
                  <span className="text-[10px] text-slate-500 block">ALTITUDE</span>
                  <span className="text-emerald-300 font-bold">+{selectedBody.altitude}°</span>
                </div>
              </div>
            </div>

            {/* Telemetry Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block mb-1">
                  {lang === 'si' ? 'වර්ගීකරණය' : lang === 'ta' ? 'வகைப்பாடு' : 'Classification'}
                </span>
                <span className="text-cyan-200 font-bold">{selectedBody.details.type}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block mb-1">
                  {lang === 'si' ? 'පෘථිවියේ සිට දුර' : lang === 'ta' ? 'பூமியிலிருந்து தூரம்' : 'Distance from Earth'}
                </span>
                <span className="text-cyan-300 font-bold">{selectedBody.details.distance}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block mb-1">
                  {lang === 'si' ? 'දෘශ්‍ය දීප්තිය' : lang === 'ta' ? 'தோற்ற பிரகாசம்' : 'Apparent Magnitude'}
                </span>
                <span className="text-amber-300 font-bold">{selectedBody.details.apparentMagnitude}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block mb-1">
                  {lang === 'si' ? 'උෂ්ණත්වය / තත්ත්වය' : lang === 'ta' ? 'வெப்பநிலை / நிலைமை' : 'Thermal Profile'}
                </span>
                <span className="text-emerald-300 font-bold">{selectedBody.details.temperature || selectedBody.details.velocity}</span>
              </div>
            </div>

            {/* Mission Scientific Insight / Fact */}
            <div className="mt-3 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/25 flex items-start gap-2.5 text-xs text-cyan-200">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                {selectedBody.details.funFact[lang] || selectedBody.details.funFact.en}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
