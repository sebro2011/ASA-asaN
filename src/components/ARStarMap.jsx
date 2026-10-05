'use client';

import React, { useState, useRef, useMemo, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Compass, 
  Crosshair, 
  Eye, 
  Layers, 
  RotateCcw, 
  Sun, 
  Moon, 
  Globe2, 
  Navigation, 
  Info, 
  Activity,
  Zap,
  Volume2,
  VolumeX,
  Target,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Smartphone,
  LocateFixed,
  Camera,
  Video,
  VideoOff,
  SwitchCamera,
  Flashlight,
  CameraOff,
  Download,
  Share2,
  Check,
  Maximize2,
  Radio,
  Sliders
} from 'lucide-react';

// Celestial bodies with real celestial coordinates (Azimuth 0-360°, Altitude 10-85°)
const CELESTIAL_BODIES = [
  {
    id: 'sun',
    type: 'star',
    category: 'Solar System',
    name: { en: 'The Sun (Sol)', si: 'සූර්යයා (සොල්)', ta: 'சூரியன் (Sol)' },
    subtitle: { en: 'G2V Main-Sequence Star • Solar Core', si: 'G2V ප්‍රධාන-අනුක්‍රමික තාරකාව', ta: 'G2V முதன்மை-வரிசை விண்மீன்' },
    azimuth: 145, // degrees from North
    altitude: 58, // degrees above horizon
    size: 32,
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
    size: 26,
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
    size: 24,
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
    size: 28,
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
        en: 'The Europa Clipper mission is on its way to investigate whether Europa harbors conditions suitable for life.',
        si: 'යුරෝපා ක්ලිපර් මෙහෙයුම එහි භූගත සාගරයේ ජීවය සඳහා හිතකර තත්ත්වයන් පවතීදැයි පරීක්ෂා කරමින් සිටී.',
        ta: 'யூரோப்பாவின் மேற்பரப்பு பெருங்கடலில் வாழ்க்கைக்கான நிலைமைகள் உள்ளதா என்பதை ஆராய யூரோப்பா கிளிப்பர் பயணிக்கிறது.'
      }
    }
  },
  {
    id: 'saturn',
    type: 'planet',
    category: 'Solar System',
    name: { en: 'Saturn (Ringed World)', si: 'සෙනසුරු', ta: 'சனி கிரகம்' },
    subtitle: { en: 'Ringed Wonder • Titan & Enceladus', si: 'වළලු සහිත අසිරිය • ටයිටන් සහ එන්සෙලඩස්', ta: 'வளையங்களின் அற்புதம் • டைட்டன்' },
    azimuth: 330,
    altitude: 28,
    size: 25,
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
    size: 22,
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
        en: 'Sirius is a binary star system; its companion, Sirius B, was the first white dwarf star ever discovered.',
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
    size: 27,
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
        en: 'Betelgeuse is nearing the end of its life and is expected to explode as a dramatic supernova within 100,000 years.',
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
    size: 20,
    glowColor: '#a7f3d0',
    gradient: 'radial-gradient(circle, #f0fdf4 0%, #6ee7b7 60%, #059669 100%)',
    pulseDelay: 0.5,
    details: {
      type: 'Multiple Star System (F7Ib Supergiant)',
      distance: '433 Light Years',
      spectralClass: 'F7Ib',
      apparentMagnitude: '+1.98',
      temperature: '6,015 K',
      funFact: {
        en: 'Polaris sits almost directly above the Earth’s northern rotational axis, remaining stationary throughout the night.',
        si: 'පොලාරිස් පෘථිවියේ උතුරු භ්‍රමණ අක්ෂයට ඉහළින් පිහිටා ඇති බැවින් රාත්‍රිය පුරාම නිශ්චලව පෙනේ.',
        ta: 'துருவ விண்மீன் பூமியின் வடக்கு சுழற்சி அச்சுக்கு நேர் மேலே உள்ளது, இதனால் இரவு முழுவதும் நிலையாக காட்சியளிக்கிறது.'
      }
    }
  },
  {
    id: 'iss',
    type: 'spacecraft',
    category: 'Observatories',
    name: { en: 'ISS (Space Station)', si: 'ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය', ta: 'சர்வதேச விண்வெளி நிலையம்' },
    subtitle: { en: 'Crewed Microgravity Laboratory • LEO', si: 'පහළ පෘථිවි කක්ෂීය පර්යේෂණාගාරය', ta: 'நுண் ஈர்ப்பு விண்வெளி ஆய்வகம்' },
    azimuth: 195,
    altitude: 48,
    size: 26,
    glowColor: '#06b6d4',
    gradient: 'radial-gradient(circle, #67e8f9 0%, #06b6d4 60%, #0e7490 100%)',
    pulseDelay: 0.6,
    details: {
      type: 'Crewed Spacecraft Laboratory',
      distance: '418.6 km Altitude',
      spectralClass: 'Artificial Satellite (Solar Arrays)',
      apparentMagnitude: '-3.8 (Peak Pass)',
      temperature: 'Internal 24°C',
      funFact: {
        en: 'Orbiting Earth every 92 minutes at 27,600 km/h, astronauts witness 16 sunrises and sunsets daily.',
        si: 'පැයට කි.මී. 27,600ක වේගයෙන් ගමන් කරමින් දිනකට හිරු උදාවීම් සහ බැසයෑම් 16ක් දැකගත හැක.',
        ta: 'ஒவ்வொரு 92 நிமிடங்களுக்கும் பூமியைச் சுற்றி வரும் விண்வெளி வீரர்கள் தினமும் 16 சூரிய உதயங்களைக் காண்கின்றனர்.'
      }
    }
  },
  {
    id: 'jwst',
    type: 'spacecraft',
    category: 'Observatories',
    name: { en: 'James Webb Telescope (JWST)', si: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය', ta: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி' },
    subtitle: { en: 'Infrared Eye at Sun-Earth L2 Orbit', si: 'ලග්‍රාන්ජ් 2 ලක්ෂ්‍යයේ අධෝරක්ත ඇස', ta: 'L2 சுற்றுப்பாதையில் அகச்சிවப்பு கண்' },
    azimuth: 255,
    altitude: 41,
    size: 24,
    glowColor: '#eab308',
    gradient: 'radial-gradient(circle, #fef08a 0%, #ca8a04 60%, #713f12 100%)',
    pulseDelay: 0.8,
    details: {
      type: 'Cryogenic Infrared Observatory',
      distance: '1.5 Million km (Sun-Earth L2)',
      spectralClass: 'Artificial Satellite (Gold Beryllium)',
      apparentMagnitude: '+14 (Instrument Only)',
      temperature: '-233°C (Cryogenic)',
      funFact: {
        en: 'JWST’s five-layer tennis-court-sized sunshield cools instruments to 40 Kelvin (-233°C).',
        si: 'ජේම්ස් වෙබ් සතු ටෙනිස් පිටියක තරම් සූර්ය ආවරණය මඟින් උෂ්ණත්වය කෙල්වින් 40 දක්වා සිසිල් කෙරේ.',
        ta: 'ஜேம்ஸ் வெப் தொலைநோக்கியின் டென்னிஸ் மைதான அளவுள்ள சூரிய கவசம் கருவிகளை -233°C வரை குளிர்விக்கிறது.'
      }
    }
  }
];

// Major Constellations with constellation star coordinates
const CONSTELLATIONS = [
  {
    id: 'orion',
    name: { en: 'Orion (The Hunter)', si: 'ඔරායන් (දඩයක්කාරයා)', ta: 'ஓரியன் (வேடன் விண்மீன்)' },
    centerAz: 110,
    centerAlt: 50,
    stars: [
      { name: 'Betelgeuse', az: 106, alt: 54, mag: 0.5 },
      { name: 'Bellatrix', az: 115, alt: 53, mag: 1.6 },
      { name: 'Alnitak', az: 108, alt: 49, mag: 1.7 },
      { name: 'Alnilam', az: 110, alt: 49.5, mag: 1.7 },
      { name: 'Mintaka', az: 112, alt: 50, mag: 2.2 },
      { name: 'Saiph', az: 107, alt: 45, mag: 2.1 },
      { name: 'Rigel', az: 116, alt: 44, mag: 0.1 }
    ],
    lines: [
      [0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]
    ]
  },
  {
    id: 'ursa_major',
    name: { en: 'Ursa Major (Big Dipper)', si: 'මහා වලසා (සප්තර්ෂි)', ta: 'சப்தரிஷி மண்டலம் (Ursa Major)' },
    centerAz: 350,
    centerAlt: 68,
    stars: [
      { name: 'Dubhe', az: 345, alt: 72, mag: 1.8 },
      { name: 'Merak', az: 344, alt: 67, mag: 2.4 },
      { name: 'Phecda', az: 350, alt: 65, mag: 2.4 },
      { name: 'Megrez', az: 351, alt: 70, mag: 3.3 },
      { name: 'Alioth', az: 355, alt: 71, mag: 1.8 },
      { name: 'Mizar', az: 358, alt: 70, mag: 2.2 },
      { name: 'Alkaid', az: 2, alt: 66, mag: 1.9 }
    ],
    lines: [
      [0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]
    ]
  },
  {
    id: 'cassiopeia',
    name: { en: 'Cassiopeia (The Queen)', si: 'කැසියෝපියා', ta: 'காசியோபியா' },
    centerAz: 30,
    centerAlt: 62,
    stars: [
      { name: 'Caph', az: 22, alt: 60, mag: 2.3 },
      { name: 'Schedar', az: 26, alt: 64, mag: 2.2 },
      { name: 'Navi', az: 30, alt: 63, mag: 2.1 },
      { name: 'Ruchbah', az: 34, alt: 65, mag: 2.7 },
      { name: 'Segin', az: 38, alt: 61, mag: 3.4 }
    ],
    lines: [
      [0, 1], [1, 2], [2, 3], [3, 4]
    ]
  },
  {
    id: 'southern_cross',
    name: { en: 'Southern Cross (Crux)', si: 'දකුණු කුරුසිය', ta: 'தெற்கு சிலுவை (Crux)' },
    centerAz: 185,
    centerAlt: 24,
    stars: [
      { name: 'Acrux', az: 185, alt: 21, mag: 0.8 },
      { name: 'Mimosa', az: 188, alt: 25, mag: 1.2 },
      { name: 'Gacrux', az: 185, alt: 27, mag: 1.6 },
      { name: 'Imai', az: 182, alt: 24, mag: 2.8 }
    ],
    lines: [
      [0, 2], [1, 3]
    ]
  }
];

function ARStarMap({ lang = 'en', onSelectTarget = null }) {
  // Mode: 'real_ar' (Live Camera + AR overlay) vs 'sky_dome' (Virtual Cosmic Sky Dome)
  const [arMode, setArMode] = useState('real_ar');
  const [selectedBodyId, setSelectedBodyId] = useState('mars');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [showConstellations, setShowConstellations] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Orientation tracking (Heading Azimuth 0-360°, Pitch Altitude -90° to +90°)
  const [heading, setHeading] = useState(110); // Center on Orion/Mars initially
  const [pitch, setPitch] = useState(45); // Looking up ~45°
  const [isGyroActive, setIsGyroActive] = useState(false);
  const [isGyroSupported, setIsGyroSupported] = useState(false);
  const [isAligned, setIsAligned] = useState(false);
  const [targetConstellationId, setTargetConstellationId] = useState('orion');

  // Camera State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('environment'); // 'environment' (back) | 'user' (front)
  const [cameraError, setCameraError] = useState(null);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [snapshotDataUrl, setSnapshotDataUrl] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showDossierModal, setShowDossierModal] = useState(false);

  // Drag interaction refs for manual panning
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startHeading: 0, startPitch: 0 });

  // DOM Refs
  const videoRef = useRef(null);
  const viewfinderRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const prevAlignedRef = useRef(false);

  // Field of View (horizontal ~68°, vertical ~50°)
  const FOV_H = 68;
  const FOV_V = 50;

  // Selected Celestial Body Object
  const selectedBody = useMemo(() => {
    return CELESTIAL_BODIES.find(b => b.id === selectedBodyId) || CELESTIAL_BODIES[0];
  }, [selectedBodyId]);

  // Target Constellation Object
  const targetConstellation = useMemo(() => {
    return CONSTELLATIONS.find(c => c.id === targetConstellationId) || CONSTELLATIONS[0];
  }, [targetConstellationId]);

  // Start Real AR Camera Stream
  const startCamera = useCallback(async (facingMode = 'environment') => {
    try {
      setCameraError(null);
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available on this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Check for flashlight/torch capability on active video track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        setIsTorchSupported(Boolean(capabilities && capabilities.torch));
      }

      setIsCameraActive(true);
    } catch (err) {
      console.warn('Real AR Camera access failed or denied:', err);
      setCameraError(err.message || 'Camera permission denied');
      setIsCameraActive(false);
    }
  }, []);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
  }, []);

  // Toggle Torch / Flashlight
  const toggleTorch = async () => {
    if (!cameraStreamRef.current || !isTorchSupported) return;
    try {
      const track = cameraStreamRef.current.getVideoTracks()[0];
      const nextState = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextState }]
      });
      setIsTorchOn(nextState);
    } catch (e) {
      console.warn('Flashlight control error:', e);
    }
  };

  // Flip Camera Front / Rear
  const flipCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (isCameraActive) {
      startCamera(nextFacing);
    }
  };

  // Auto-start camera when in 'real_ar' mode
  useEffect(() => {
    if (arMode === 'real_ar') {
      startCamera(cameraFacing);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [arMode, cameraFacing, startCamera, stopCamera]);

  // Device Orientation Listener (Gyroscope + Compass)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.DeviceOrientationEvent) {
      setIsGyroSupported(true);
    }

    if (!isGyroActive) return;

    const handleOrientation = (e) => {
      // 1. Compass Azimuth / Heading (0° North, 90° East)
      let currentHeading = null;
      if (typeof e.webkitCompassHeading !== 'undefined' && e.webkitCompassHeading !== null) {
        currentHeading = e.webkitCompassHeading;
      } else if (e.alpha !== null && typeof e.alpha !== 'undefined') {
        currentHeading = (360 - e.alpha) % 360;
      }

      // 2. Pitch / Altitude (-90° to +90°)
      // e.beta represents front-to-back tilt in degrees (-180 to 180)
      let currentPitch = null;
      if (e.beta !== null && typeof e.beta !== 'undefined') {
        // When holding phone upright in portrait, beta is ~90° (horizon), tilted up towards zenith is ~45° to 0°
        currentPitch = Math.max(-10, Math.min(88, e.beta));
      }

      if (currentHeading !== null && !isNaN(currentHeading)) {
        setHeading(Math.round(currentHeading));
      }
      if (currentPitch !== null && !isNaN(currentPitch)) {
        setPitch(Math.round(currentPitch));
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [isGyroActive]);

  // Toggle Gyroscope
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
        setIsGyroActive(true);
      }
    } else {
      setIsGyroActive(true);
    }
  };

  // Sound Synthesizer for Lock-on feedback
  const playTargetLockChime = useCallback(() => {
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
        osc.frequency.setValueAtTime(freq, now + i * 0.04);
        gain.gain.setValueAtTime(0.001, now + i * 0.04);
        gain.gain.linearRampToValueAtTime(0.14, now + i * 0.04 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.22);
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([20, 40, 20]);
      }
    } catch {}
  }, [soundEnabled]);

  // Calculate alignment to selected target
  useEffect(() => {
    const rawDiffAz = selectedBody.azimuth - heading;
    const deltaAz = ((rawDiffAz + 540) % 360) - 180;
    const deltaAlt = selectedBody.altitude - pitch;
    const angularDistance = Math.sqrt(deltaAz * deltaAz + deltaAlt * deltaAlt);
    const locked = angularDistance <= 5.5;

    setIsAligned(locked);
    if (locked && !prevAlignedRef.current) {
      playTargetLockChime();
    }
    prevAlignedRef.current = locked;
  }, [heading, pitch, selectedBody, playTargetLockChime]);

  // Touch / Mouse Dragging for manual camera look
  const handlePointerDown = (e) => {
    if (isGyroActive) return; // Gyroscope is controlling orientation
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startHeading: heading,
      startPitch: pitch
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging || isGyroActive) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // 0.25 degrees per pixel
    const newHeading = ((dragStartRef.current.startHeading - dx * 0.25) % 360 + 360) % 360;
    const newPitch = Math.max(-10, Math.min(88, dragStartRef.current.startPitch + dy * 0.25));

    setHeading(Math.round(newHeading));
    setPitch(Math.round(newPitch));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Snap View directly to selected target coordinates
  const handleSnapToTarget = (body) => {
    setSelectedBodyId(body.id);
    setHeading(body.azimuth);
    setPitch(body.altitude);
    if (onSelectTarget) onSelectTarget(body);
  };

  // Convert Celestial Azimuth/Altitude to Real-Time Viewfinder Screen Coordinates (X, Y)
  const calculateScreenPosition = (targetAz, targetAlt, containerWidth, containerHeight) => {
    const rawDiffAz = targetAz - heading;
    const deltaAz = ((rawDiffAz + 540) % 360) - 180; // horizontal angle offset (-180° to +180°)
    const deltaAlt = targetAlt - pitch; // vertical angle offset

    const isInsideView = Math.abs(deltaAz) <= (FOV_H / 2) && Math.abs(deltaAlt) <= (FOV_V / 2);

    // Projected normalized screen coordinates (0 to 1)
    const normX = 0.5 + (deltaAz / FOV_H);
    const normY = 0.5 - (deltaAlt / FOV_V);

    const screenX = normX * containerWidth;
    const screenY = normY * containerHeight;

    return {
      x: screenX,
      y: screenY,
      isInsideView,
      deltaAz,
      deltaAlt,
      distanceAngle: Math.round(Math.sqrt(deltaAz * deltaAz + deltaAlt * deltaAlt))
    };
  };

  // AR Snapshot / Photo Capture combining camera frame + glowing AR overlay
  const handleCaptureSnapshot = async () => {
    if (!viewfinderRef.current) return;
    setIsCapturing(true);

    try {
      const container = viewfinderRef.current;
      const canvas = document.createElement('canvas');
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 500;
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);

      // 1. Draw Camera video frame if camera is running
      if (videoRef.current && isCameraActive) {
        ctx.drawImage(videoRef.current, 0, 0, width, height);
      } else {
        // Draw deep space gradient background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
        bgGrad.addColorStop(0, '#030712');
        bgGrad.addColorStop(1, '#0b132b');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Draw HUD Grid & Crosshairs
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 40, width - 80, height - 80);

      // Center crosshair
      const cx = width / 2;
      const cy = height / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 20, cy);
      ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 20);
      ctx.stroke();

      // 3. Render visible celestial objects
      CELESTIAL_BODIES.forEach(body => {
        const pos = calculateScreenPosition(body.azimuth, body.altitude, width, height);
        if (pos.isInsideView) {
          // Outer glow circle
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, body.size * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = body.glowColor;
          ctx.shadowColor = body.glowColor;
          ctx.shadowBlur = 18;
          ctx.fill();

          // Body text label
          ctx.font = 'bold 12px Orbitron, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(body.name[lang] || body.name.en, pos.x + body.size * 0.8, pos.y - 6);
          ctx.font = '10px monospace';
          ctx.fillStyle = 'rgba(203, 213, 225, 0.9)';
          ctx.fillText(`Az: ${body.azimuth}° • Alt: ${body.altitude}°`, pos.x + body.size * 0.8, pos.y + 10);
        }
      });

      // 4. Telemetry Stamp
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#22d3ee';
      ctx.shadowBlur = 0;
      ctx.fillText(`NASA AR SKY CAM • HDG: ${heading}° • PITCH: ${pitch}°`, 50, height - 55);
      ctx.fillText(new Date().toUTCString(), 50, height - 40);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setSnapshotDataUrl(dataUrl);
    } catch (err) {
      console.warn('Snapshot error:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  // Multilingual UI Texts
  const UI = {
    en: {
      heading: 'Live Real-AR Sky Viewfinder & Star Map',
      subheading: 'Augment real camera video with live satellites, planets, constellations, and celestial telemetry',
      modeRealAr: 'Live Real-AR Camera',
      modeSkyDome: '360° Cosmic Sky Dome',
      startCamera: 'Activate AR Camera',
      stopCamera: 'Disable Camera',
      cameraFlip: 'Flip Lens',
      torchOn: 'Torch On',
      torchOff: 'Torch Off',
      gyroOn: 'Sensors Active',
      gyroOff: 'Activate Gyroscope',
      targetLocked: 'TARGET LOCKED',
      snapToTarget: 'Snap View to Target',
      capturePhoto: 'Capture AR Photo',
      azimuth: 'Azimuth',
      altitude: 'Altitude',
      heading: 'Heading',
      dossier: 'Scientific Dossier',
      filterAll: 'All Celestial Bodies',
      filterPlanets: 'Planets & Moon',
      filterStars: 'Stars & Constellations',
      filterCraft: 'Spacecraft & Satellites'
    },
    si: {
      heading: 'සැබෑ AR අභ්‍යවකාශ කැමරාව සහ තාරකා සිතියම',
      subheading: 'සැබෑ කැමරා දර්ශනය මත සජීවී චන්ද්‍රිකා, ග්‍රහලෝක සහ තාරකා රටා හෝලෝග්‍රැෆික් ලෙස නිරීක්ෂණය කරන්න',
      modeRealAr: 'සැබෑ AR කැමරාව',
      modeSkyDome: '360° අභ්‍යවකාශ ගෝලය',
      startCamera: 'AR කැමරාව අරඹන්න',
      stopCamera: 'කැමරාව නවතන්න',
      cameraFlip: 'කැමරාව මාරු කරන්න',
      torchOn: 'ෆ්ලෑෂ්ලයට් සක්‍රියයි',
      torchOff: 'ෆ්ලෑෂ්ලයට් අක්‍රියයි',
      gyroOn: 'සංවේදක සක්‍රියයි',
      gyroOff: 'ගයිරෝස්කෝප් සක්‍රිය කරන්න',
      targetLocked: 'ඉලක්කය කේන්ද්‍රගත විය',
      snapToTarget: 'ඉලක්කයට සමපාත කරන්න',
      capturePhoto: 'AR ඡායාරූපයක් ගන්න',
      azimuth: 'දිගංශය',
      altitude: 'උන්නතාංශය',
      heading: 'දිශානතිය',
      dossier: 'විද්‍යාත්මක තොරතුරු',
      filterAll: 'සියලු වස්තූන්',
      filterPlanets: 'ග්‍රහලෝක සහ සඳ',
      filterStars: 'තරු සහ තාරකා රටා',
      filterCraft: 'අභ්‍යවකාශ යානා'
    },
    ta: {
      heading: 'உண்மையான AR விண்வெளி கேமரா & விண்மீன் வரைபடம்',
      subheading: 'நேரலை கேமரா காட்சி மூலம் செயற்கைக்கோள்கள், கோள்கள் மற்றும் விண்மீன் கூட்டங்களை ஆராயுங்கள்',
      modeRealAr: 'நேரலை AR கேமரா',
      modeSkyDome: '360° விண்வெளி மண்டலம்',
      startCamera: 'AR கேமராவை இயக்குக',
      stopCamera: 'கேமராவை நிறுத்துக',
      cameraFlip: 'கேமராவை மாற்றுக',
      torchOn: 'விளக்கு ஆன்',
      torchOff: 'விளக்கு ஆஃப்',
      gyroOn: 'சென்சார் செயலில்',
      gyroOff: 'கைரோஸ்கோப் இயக்குக',
      targetLocked: 'இலக்கு பூட்டப்பட்டது',
      snapToTarget: 'இலக்குக்கு சீரமைக்கவும்',
      capturePhoto: 'AR புகைப்படம் எடுக்கவும்',
      azimuth: 'திசைக் கோணம்',
      altitude: 'உயரக் கோணம்',
      heading: 'திசை',
      dossier: 'அறிவியல் ஆவணம்',
      filterAll: 'அனைத்து உடல்கள்',
      filterPlanets: 'கோள்கள் & சந்திரன்',
      filterStars: 'விண்மீன்கள் & கூட்டங்கள்',
      filterCraft: 'விண்கலங்கள்'
    }
  };

  const t = UI[lang] || UI.en;

  // Filtered celestial bodies
  const filteredBodies = useMemo(() => {
    if (filterCategory === 'PLANETS') return CELESTIAL_BODIES.filter(b => b.type === 'planet' || b.type === 'moon');
    if (filterCategory === 'STARS') return CELESTIAL_BODIES.filter(b => b.type === 'star');
    if (filterCategory === 'CRAFT') return CELESTIAL_BODIES.filter(b => b.type === 'spacecraft');
    return CELESTIAL_BODIES;
  }, [filterCategory]);

  return (
    <div className="w-full space-y-5 select-none font-sans">
      
      {/* Top Banner & AR Mode Switcher */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-indigo-950/80 to-slate-950 border border-slate-800/80 p-5 sm:p-6 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-2">
              <Camera className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>{arMode === 'real_ar' ? 'REAL WEBRTC CAMERA AR' : '360° CELESTIAL DOME'}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-['Orbitron'] text-white tracking-wide">
              {t.heading}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-sans">
              {t.subheading}
            </p>
          </div>

          {/* AR Mode Toggle Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center p-1 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-inner">
              <button
                type="button"
                onClick={() => setArMode('real_ar')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  arMode === 'real_ar'
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-950/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Video className="w-4 h-4 text-cyan-300" />
                <span>{t.modeRealAr}</span>
              </button>

              <button
                type="button"
                onClick={() => setArMode('sky_dome')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  arMode === 'sky_dome'
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-950/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Compass className="w-4 h-4 text-indigo-300" />
                <span>{t.modeSkyDome}</span>
              </button>
            </div>

            {/* Gyroscope toggle */}
            <button
              type="button"
              onClick={toggleGyro}
              className={`p-2.5 rounded-2xl border backdrop-blur-md shadow-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono font-bold ${
                isGyroActive
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.4)]'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white'
              }`}
              title={isGyroActive ? t.gyroOn : t.gyroOff}
            >
              <Smartphone className={`w-4 h-4 ${isGyroActive ? 'text-emerald-400 animate-pulse' : ''}`} />
              <span className="hidden sm:inline">{isGyroActive ? t.gyroOn : t.gyroOff}</span>
            </button>
          </div>
        </div>

        {/* Telemetry Indicator Ribbon */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              HDG: {heading}° ({heading >= 315 || heading < 45 ? 'N' : heading < 135 ? 'E' : heading < 225 ? 'S' : 'W'})
            </span>
            <span className="flex items-center gap-1.5 text-indigo-300 font-bold">
              <Navigation className="w-3.5 h-3.5 text-indigo-400" />
              PITCH: {pitch}°
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isAligned ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-bold animate-pulse">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {t.targetLocked}: {selectedBody.name[lang] || selectedBody.name.en}
              </span>
            ) : (
              <span className="text-slate-500 text-[11px]">
                Target: {selectedBody.name[lang] || selectedBody.name.en} (Az: {selectedBody.azimuth}°, Alt: {selectedBody.altitude}°)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main AR Viewfinder & Interactive Canvas */}
      <div 
        ref={viewfinderRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative w-full h-[520px] sm:h-[620px] rounded-3xl overflow-hidden bg-slate-950 border border-slate-800/90 shadow-2xl cursor-grab active:cursor-grabbing select-none"
      >
        {/* Layer 1: Real Camera Feed Video Backdrop */}
        {arMode === 'real_ar' && (
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
              isCameraActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Fallback Cosmic Night Sky Panorama Backdrop (When camera is disabled or in sky_dome mode) */}
        {(!isCameraActive || arMode === 'sky_dome') && (
          <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#0b0f19] to-[#050a18] overflow-hidden pointer-events-none">
            {/* Ambient Cosmic Nebulae */}
            <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl" />

            {/* Horizon Gradients */}
            <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
            <div className="absolute bottom-20 inset-x-0 border-b border-dashed border-cyan-500/20 text-center">
              <span className="px-3 py-0.5 rounded-full bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-cyan-400">
                ASTRONOMICAL HORIZON • 0° ALTITUDE
              </span>
            </div>
          </div>
        )}

        {/* Layer 2: AR Holographic HUD Grid & Overlays */}
        {showGrid && (
          <div className="absolute inset-0 pointer-events-none border border-cyan-500/20 rounded-3xl m-3">
            {/* Viewfinder Corner Framing Brackets */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-400" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-400" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-400" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-400" />

            {/* Pitch Horizon Ladder Lines */}
            <div className="absolute inset-y-0 left-8 flex flex-col justify-between py-12 text-[10px] font-mono text-cyan-400/60">
              <span>+75° ZENITH</span>
              <span>+50° SKY</span>
              <span>+25° MID</span>
              <span>0° HORIZON</span>
            </div>
          </div>
        )}

        {/* Center Reticle Lock-On Target Frame */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
          <div className={`relative flex items-center justify-center transition-all duration-300 ${
            isAligned ? 'scale-110' : 'scale-100'
          }`}>
            {/* Animated Concentric Rings */}
            <div className={`w-28 h-28 rounded-full border-2 transition-all duration-300 ${
              isAligned 
                ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_30px_rgba(52,211,153,0.6)] animate-pulse' 
                : 'border-cyan-400/40 border-dashed animate-spin'
            }`} style={{ animationDuration: isAligned ? '1s' : '30s' }} />

            <div className={`absolute w-14 h-14 rounded-full border ${
              isAligned ? 'border-emerald-400' : 'border-cyan-400/70'
            }`} />

            <Crosshair className={`absolute w-6 h-6 ${
              isAligned ? 'text-emerald-400' : 'text-cyan-400/80'
            }`} />

            {/* Alignment Tag */}
            {isAligned && (
              <div className="absolute -top-10 px-3 py-1 rounded-xl bg-emerald-950/90 border border-emerald-400 text-emerald-300 text-xs font-mono font-bold tracking-wider shadow-2xl whitespace-nowrap">
                TARGET ACQUIRED
              </div>
            )}
          </div>
        </div>

        {/* Layer 3: Constellation Overlay Vectors */}
        {showConstellations && viewfinderRef.current && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            {CONSTELLATIONS.map(c => {
              const width = viewfinderRef.current?.clientWidth || 800;
              const height = viewfinderRef.current?.clientHeight || 600;

              return (
                <g key={c.id}>
                  {c.lines.map(([i1, i2], lineIdx) => {
                    const s1 = c.stars[i1];
                    const s2 = c.stars[i2];
                    const p1 = calculateScreenPosition(s1.az, s1.alt, width, height);
                    const p2 = calculateScreenPosition(s2.az, s2.alt, width, height);

                    if (p1.isInsideView || p2.isInsideView) {
                      return (
                        <line
                          key={lineIdx}
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke="#818cf8"
                          strokeWidth="1.5"
                          strokeDasharray="4, 4"
                          opacity="0.65"
                        />
                      );
                    }
                    return null;
                  })}

                  {/* Constellation Star dots */}
                  {c.stars.map((s, starIdx) => {
                    const p = calculateScreenPosition(s.az, s.alt, width, height);
                    if (p.isInsideView) {
                      return (
                        <g key={starIdx}>
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={s.mag < 1 ? 4.5 : 3}
                            fill="#ffffff"
                            filter="drop-shadow(0 0 6px #818cf8)"
                          />
                        </g>
                      );
                    }
                    return null;
                  })}
                </g>
              );
            })}
          </svg>
        )}

        {/* Layer 4: Real-Time Augmented Reality Celestial Body Overlays */}
        {viewfinderRef.current && filteredBodies.map(body => {
          const width = viewfinderRef.current?.clientWidth || 800;
          const height = viewfinderRef.current?.clientHeight || 600;
          const pos = calculateScreenPosition(body.azimuth, body.altitude, width, height);
          const isSelected = selectedBodyId === body.id;

          // Inside Viewfinder Display
          if (pos.isInsideView) {
            return (
              <div
                key={body.id}
                onClick={() => {
                  setSelectedBodyId(body.id);
                  if (onSelectTarget) onSelectTarget(body);
                }}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  transform: 'translate(-50%, -50%)'
                }}
                className="absolute z-20 cursor-pointer group"
              >
                {/* Glowing Pulsing Ring */}
                <div
                  className="relative flex items-center justify-center transition-transform group-hover:scale-125"
                  style={{ width: `${body.size}px`, height: `${body.size}px` }}
                >
                  <div
                    className="absolute inset-0 rounded-full animate-ping opacity-60"
                    style={{ backgroundColor: body.glowColor }}
                  />
                  <div
                    className="relative w-full h-full rounded-full border-2 border-white/80 shadow-2xl flex items-center justify-center"
                    style={{
                      background: body.gradient,
                      boxShadow: `0 0 25px ${body.glowColor}`
                    }}
                  />
                </div>

                {/* AR HUD Targeting Label Callout */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 rounded-xl bg-slate-950/90 backdrop-blur-md border border-cyan-400/60 shadow-2xl whitespace-nowrap text-center">
                  <div className="text-[11px] font-bold text-white font-['Orbitron']">
                    {body.name[lang] || body.name.en}
                  </div>
                  <div className="text-[9px] font-mono text-cyan-300">
                    Az {body.azimuth}° • Alt {body.altitude}° • {body.details.distance}
                  </div>
                </div>
              </div>
            );
          }

          // Out-of-View Off-Screen AR Compass Navigator Arrow
          if (isSelected) {
            // Clamp pointer to perimeter edge
            const clampedX = Math.max(30, Math.min(width - 30, (width / 2) + Math.sign(pos.deltaAz) * (width * 0.44)));
            const clampedY = Math.max(30, Math.min(height - 30, (height / 2) - Math.sign(pos.deltaAlt) * (height * 0.44)));

            return (
              <div
                key={`guide-${body.id}`}
                onClick={() => handleSnapToTarget(body)}
                style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-30 cursor-pointer animate-bounce"
              >
                <div className="px-3 py-1.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-indigo-600 border border-white text-white text-xs font-mono font-bold shadow-[0_0_20px_rgba(6,182,212,0.8)] flex items-center gap-1.5 whitespace-nowrap">
                  <Navigation className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Turn {Math.round(pos.distanceAngle)}° towards {body.name[lang]?.split(' ')[0] || body.name.en.split(' ')[0]}</span>
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Viewfinder Controls Floating Strip (Top-Right) */}
        <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
          {/* Real Camera Toggle Button */}
          {arMode === 'real_ar' && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (isCameraActive) stopCamera();
                  else startCamera(cameraFacing);
                }}
                className={`p-2.5 rounded-2xl border backdrop-blur-xl shadow-xl transition-all cursor-pointer flex items-center justify-center ${
                  isCameraActive
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.4)]'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white'
                }`}
                title={isCameraActive ? t.stopCamera : t.startCamera}
              >
                {isCameraActive ? <Video className="w-4 h-4 text-emerald-400" /> : <VideoOff className="w-4 h-4" />}
              </button>

              {/* Camera Flip (Rear / Front) */}
              <button
                type="button"
                onClick={flipCamera}
                className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-400 shadow-xl transition-colors cursor-pointer flex items-center justify-center"
                title={t.cameraFlip}
              >
                <SwitchCamera className="w-4 h-4" />
              </button>

              {/* Torch / Flashlight Toggle */}
              {isTorchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2.5 rounded-2xl border backdrop-blur-xl shadow-xl transition-all cursor-pointer flex items-center justify-center ${
                    isTorchOn
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white'
                  }`}
                  title={isTorchOn ? t.torchOff : t.torchOn}
                >
                  <Flashlight className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {/* AR Photo Capture Button */}
          <button
            type="button"
            onClick={handleCaptureSnapshot}
            disabled={isCapturing}
            className="p-2.5 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 border border-white/50 text-white shadow-xl shadow-cyan-950/60 transition-all cursor-pointer flex items-center justify-center"
            title={t.capturePhoto}
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Audio lock toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-400 shadow-xl transition-colors cursor-pointer flex items-center justify-center"
            title="Audio Feedback"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>

        {/* Bottom Floating Telemetry Overlay Card */}
        <div className="absolute bottom-4 inset-x-4 z-30 pointer-events-none">
          <div className="p-4 rounded-3xl bg-slate-950/85 backdrop-blur-xl border border-slate-800/90 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 pointer-events-auto">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl border flex items-center justify-center shadow-lg"
                style={{
                  background: selectedBody.gradient,
                  borderColor: selectedBody.glowColor,
                  boxShadow: `0 0 15px ${selectedBody.glowColor}`
                }}
              >
                <Target className="w-5 h-5 text-white animate-pulse" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-bold text-white font-['Orbitron']">
                    {selectedBody.name[lang] || selectedBody.name.en}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 text-[10px] font-mono">
                    {selectedBody.details.type}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-sans mt-0.5">
                  {selectedBody.subtitle[lang] || selectedBody.subtitle.en}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSnapToTarget(selectedBody)}
                className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-bold text-cyan-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>{t.snapToTarget}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDossierModal(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-xs font-mono font-bold transition-all shadow-lg shadow-cyan-950/50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Info className="w-3.5 h-3.5" />
                <span>{t.dossier}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Target Selector Carousel Bar */}
      <div className="rounded-3xl bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300">
            <Target className="w-4 h-4 text-cyan-400" />
            <span>Select Target to Track in Real AR:</span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono">
            {['ALL', 'PLANETS', 'STARS', 'CRAFT'].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                  filterCategory === cat
                    ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-bold'
                    : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat === 'ALL' ? t.filterAll : cat === 'PLANETS' ? t.filterPlanets : cat === 'STARS' ? t.filterStars : t.filterCraft}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-1">
          {filteredBodies.map(body => {
            const isSelected = selectedBodyId === body.id;
            return (
              <button
                key={body.id}
                type="button"
                onClick={() => handleSnapToTarget(body)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 border-cyan-400 shadow-xl shadow-cyan-950/50'
                    : 'bg-slate-950/60 hover:bg-slate-900/80 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div 
                    className="w-4 h-4 rounded-full shadow-md"
                    style={{ background: body.gradient, boxShadow: `0 0 10px ${body.glowColor}` }}
                  />
                  <span className="text-[10px] font-mono text-cyan-400">
                    Az {body.azimuth}°
                  </span>
                </div>

                <div className="mt-2">
                  <div className="text-xs font-bold text-white font-['Orbitron'] truncate">
                    {body.name[lang] || body.name.en}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                    Alt {body.altitude}° • {body.category}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Snapshot Preview & Download Dialog */}
      <AnimatePresence>
        {snapshotDataUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl rounded-3xl bg-slate-950 border border-slate-800 p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 font-mono text-sm font-bold text-cyan-300">
                  <Camera className="w-4 h-4" />
                  <span>Real AR Sky Capture Completed</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSnapshotDataUrl(null)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
                <img src={snapshotDataUrl} alt="AR Sky Capture" className="w-full h-auto object-cover" />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSnapshotDataUrl(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-mono"
                >
                  Close
                </button>
                <a
                  href={snapshotDataUrl}
                  download={`NASA_AR_SKY_${Date.now()}.jpg`}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save AR Photo</span>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deep Scientific Dossier Modal */}
      <AnimatePresence>
        {showDossierModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl bg-slate-950 border border-slate-800 p-6 sm:p-7 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: selectedBody.gradient }}
                  />
                  <div>
                    <h3 className="text-lg font-bold font-['Orbitron'] text-white">
                      {selectedBody.name[lang] || selectedBody.name.en}
                    </h3>
                    <div className="text-xs font-mono text-cyan-400">
                      {selectedBody.details.type}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDossierModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Metric Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">COORDINATES</span>
                  <span className="text-white font-bold">Az: {selectedBody.azimuth}° • Alt: {selectedBody.altitude}°</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">DISTANCE</span>
                  <span className="text-white font-bold">{selectedBody.details.distance}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">TEMPERATURE</span>
                  <span className="text-white font-bold">{selectedBody.details.temperature}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">APPARENT MAGNITUDE</span>
                  <span className="text-white font-bold">{selectedBody.details.apparentMagnitude}</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-slate-300 space-y-1">
                <div className="font-mono font-bold text-cyan-300">NASA Science Insight:</div>
                <p className="leading-relaxed font-sans">
                  {selectedBody.details.funFact[lang] || selectedBody.details.funFact.en}
                </p>
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowDossierModal(false)}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(ARStarMap);
