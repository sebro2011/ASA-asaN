'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gauge,
  Compass,
  ArrowUpRight,
  Globe2,
  MapPin,
  Sun,
  Moon,
  Clock,
  RefreshCw,
  Crosshair,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Navigation,
  Sparkles,
  Info,
  X,
  Eye,
  Radar,
  Telescope,
  Satellite as SatelliteIcon,
  Layers,
  HelpCircle,
  Check,
  ChevronDown,
  Link2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { propagateTLE } from '../utils/satelliteTracker.js';
import {
  getNightTerminatorPolygon,
  isSpacecraftInSunlight,
  computeVisibilityRadiusMeters,
  computeGreatCircleDistanceKm,
  computeGreatCircleArc,
  splitAntimeridianPath,
  computeOrbitPeriodMinutes,
  getApproximateRegion,
  formatCoordinate
} from '../utils/orbitalHelpers.js';
import { LiquidGlassCard } from './LiquidGlassCard.jsx';
import { fetchIssLocation } from '@/lib/nasaApi';
import { a11yLabel } from '../lib/a11yLabels';
import { useFocusTrap } from '../app/hooks';

// Pre-seeded spacecraft fleet definitions with authentic NORAD TLE data
const INITIAL_SATELLITES = [
  {
    id: 'iss',
    name: 'ISS (International Space Station)',
    shortName: 'ISS',
    noradId: 25544,
    orbitTier: 'LEO',
    type: {
      en: 'Crewed Space Station',
      si: 'මිනිසුන් සහිත අභ්‍යවකාශ මධ්‍යස්ථානය',
      ta: 'மனித விண்வெளி நிலையம்'
    },
    shortRole: {
      en: 'Space Station',
      si: 'අභ්‍යවකාශ මධ්‍යස්ථානය',
      ta: 'விண்வெளி நிலையம்'
    },
    operator: 'NASA / ESA / JAXA / CSA',
    launchDate: 'Nov 1998',
    color: '#06b6d4',
    glowRgb: '6, 182, 212',
    iconType: 'station',
    tle: {
      line1: '1 25544U 98067A   26273.51234567  .00016717  00000-0  10270-3 0  9001',
      line2: '2 25544  51.6416  65.1234 0005234 125.4321 234.8765 15.49876543456781'
    },
    defaultAlt: 418.6,
    defaultVel: 27584,
    inclination: 51.64,
    crew: {
      en: '7 Astronauts on board',
      si: 'ගගනගාමීන් 7 දෙනෙක්',
      ta: '7 விண்வெளி வீரர்கள்'
    },
    altitudeContext: {
      en: 'Low Earth Orbit · ~40× commercial jet height',
      si: 'පහළ පෘථිවි කක්ෂය · ගුවන් යානයකට ~40× උසින්',
      ta: 'தாழ் பூமி சுற்றுப்பாதை · விமானத்தை விட ~40× உயரம்'
    },
    status: {
      en: 'Operational · Conducting microgravity crystallography and Earth atmospheric telemetry',
      si: 'ක්‍රියාකාරීයි · ක්ෂුද්‍ර ගුරුත්ව ස්ඵටිකීකරණ සහ පෘථිවි වායුගෝලීය පරීක්ෂණ සිදුකරමින් පවතී',
      ta: 'செயல்பாட்டில் உள்ளது · நுண் ஈர்ப்பு படிகவியல் மற்றும் பூமி வளிமண்டல அவதானிப்புகள்'
    },
    missionSummary: {
      en: 'The premier habitable orbital laboratory, continuously occupied since November 2000 as astronauts orbit Earth about 16 times every day.',
      si: '2000 වසරේ සිට අඛණ්ඩව ගගනගාමීන් වාසය කරන පහළ පෘථිවි කක්ෂයේ විශාලතම විද්‍යාත්මක පර්යේෂණාගාරය. මෙය දිනකට ~16 වතාවක් පෘථිවිය වටා ගමන් කරයි.',
      ta: '2000 முதல் தொடர்ச்சியாக விண்வெளி வீரர்கள் வசிக்கும் மிகப்பெரிய விண்வெளி ஆய்வுக் கூடம். இது நாளொன்றுக்கு ~16 முறை பூமியைச் சுற்றி வருகிறது.'
    }
  },
  {
    id: 'hubble',
    name: 'Hubble Space Telescope (HST)',
    shortName: 'Hubble',
    noradId: 20580,
    orbitTier: 'LEO',
    type: {
      en: 'Optical & UV Observatory',
      si: 'දෘශ්‍ය සහ පාරජම්බුල දුරේක්ෂය',
      ta: 'ஒளி மற்றும் புற ஊதா தொலைநோக்கி'
    },
    shortRole: {
      en: 'Space Telescope',
      si: 'අභ්‍යවකාශ දුරේක්ෂය',
      ta: 'விண்வெளி தொலைநோக்கி'
    },
    operator: 'NASA / ESA',
    launchDate: 'Apr 1990',
    color: '#38bdf8',
    glowRgb: '56, 189, 248',
    iconType: 'telescope',
    tle: {
      line1: '1 20580U 90037B   26273.45678910  .00001234  00000-0  45678-4 0  9992',
      line2: '2 20580  28.4687 142.3456 0002874  85.2341 274.8765 15.09234567891234'
    },
    defaultAlt: 535.2,
    defaultVel: 27310,
    inclination: 28.47,
    crew: {
      en: 'Robotic Observatory',
      si: 'ස්වයංක්‍රීය දුරේක්ෂය',
      ta: 'தானியங்கி தொலைநோக்கி'
    },
    altitudeContext: {
      en: 'Low Earth Orbit · Above Earth’s atmosphere',
      si: 'පහළ කක්ෂය · පෘථිවි වායුගෝලයට ඉහළින්',
      ta: 'தாழ் சுற்றுப்பாதை · வளிமண்டலத்திற்கு மேல்'
    },
    status: {
      en: 'Operational · Cosmic Ultraviolet Spectrograph surveying star-forming galaxies',
      si: 'ක්‍රියාකාරීයි · පාරජම්බුල වර්ණාවලීක්ෂය මඟින් තරු බිහිවන මන්දාකිණි නිරීක්ෂණය කරමින් පවතී',
      ta: 'செயல்பாட்டில் உள்ளது · புற ஊதா நிறமாலைமானி மூலம் புதிய விண்மீன் திரள்களை அவதானிக்கிறது'
    },
    missionSummary: {
      en: 'Over three decades of sharp space observations that revealed the age and accelerating expansion of the universe.',
      si: 'වසර 30කට අධික කාලයක් විශ්වයේ වයස සහ ප්‍රසාරණය පිළිබඳ විප්ලවීය සොයාගැනීම් රැසක් සිදුකළ ඓතිහාසික දුරේක්ෂය.',
      ta: '30 ஆண்டுகளுக்கும் மேலாக பிரபஞ்சத்தின் வயது மற்றும் விரிவாக்கத்தைக் கண்டறிந்த புகழ்பெற்ற விண்வெளி தொலைநோக்கி.'
    }
  },
  {
    id: 'jwst',
    name: 'James Webb Space Telescope (JWST)',
    shortName: 'James Webb',
    noradId: 50463,
    orbitTier: 'L2',
    type: {
      en: 'Deep Infrared Observatory',
      si: 'ගැඹුරු අධෝරක්ත දුරේක්ෂය',
      ta: 'ஆழ் அகச்சிவப்பு தொலைநோக்கி'
    },
    shortRole: {
      en: 'Deep Space (L2)',
      si: 'ගැඹුරු අභ්‍යවකාශ (L2)',
      ta: 'ஆழ் விண்வெளி (L2)'
    },
    operator: 'NASA / ESA / CSA',
    launchDate: 'Dec 2021',
    color: '#fbbf24',
    glowRgb: '251, 191, 36',
    iconType: 'webb',
    tle: {
      line1: '1 50463U 21130A   26273.12345678  .00000012  00000-0  00000-0 0  9991',
      line2: '2 50463   0.1234  15.6789 0000123 350.1234  10.5432  0.03333333 00019'
    },
    defaultAlt: 1500000,
    defaultVel: 720,
    inclination: 0.12,
    crew: {
      en: 'Deep Space Autonomous',
      si: 'ස්වයංක්‍රීය (ගැඹුරු අභ්‍යවකාශ)',
      ta: 'ஆழ் விண்வெளி தானியங்கி'
    },
    altitudeContext: {
      en: 'Sun–Earth L2 Point · ~4× farther than the Moon',
      si: 'සූර්ය-පෘථිවි L2 ලක්ෂ්‍යය · සඳට වඩා ~4× ඈතින්',
      ta: 'சூரிய-பூமி L2 புள்ளி · நிலவை விட ~4× தொலைவில்'
    },
    status: {
      en: 'Operational at Sun-Earth L2 · NIRSpec & MIRI capturing early galaxies and exoplanet atmospheres',
      si: 'L2 ලක්ෂ්‍යයේ ක්‍රියාකාරීයි · විශ්වයේ මුල්ම මන්දාකිණි සහ බාහිර ග්‍රහලෝක වායුගෝල පරීක්ෂා කරමින් පවතී',
      ta: 'சூரிய-பூமி L2 வட்டப்பாதையில் இயங்குகிறது · ஆதி விண்மீன் திரள்கள் மற்றும் புறக்கோள்களை ஆய்வு செய்கிறது'
    },
    missionSummary: {
      en: 'Stationed 1.5 million km beyond Earth at the Sun-Earth L2 Lagrange point, peering back over 13.5 billion years to the earliest stars and galaxies.',
      si: 'පෘථිවියේ සිට කි.මී. මිලියන 1.5ක් ඈතින් පිහිටි L2 ලක්ෂ්‍යයේ සිට වසර බිලියන 13.5කට පෙර විශ්වයේ ප්‍රථම තාරකා බිහිවූ අයුරු නිරීක්ෂණය කරයි.',
      ta: 'பூமியிலிருந்து 15 லட்சம் கி.மீ தூரத்தில் உள்ள L2 புள்ளியிலிருந்து 13.5 பில்லியன் ஆண்டுகளுக்கு முந்தைய பிரபஞ்சத்தைப் படம் பிடிக்கிறது.'
    }
  },
  {
    id: 'tiangong',
    name: 'Tiangong Space Station (CSS)',
    shortName: 'Tiangong',
    noradId: 48274,
    orbitTier: 'LEO',
    type: {
      en: 'Modular Space Station',
      si: 'මොඩියුලර් අභ්‍යවකාශ මධ්‍යස්ථානය',
      ta: 'மட்டு விண்வெளி நிலையம்'
    },
    shortRole: {
      en: 'Space Station',
      si: 'අභ්‍යවකාශ මධ්‍යස්ථානය',
      ta: 'விண்வெளி நிலையம்'
    },
    operator: 'CMSA',
    launchDate: 'Apr 2021',
    color: '#f43f5e',
    glowRgb: '244, 63, 94',
    iconType: 'station',
    tle: {
      line1: '1 48274U 21035A   26273.54321098  .00018765  00000-0  11234-3 0  9995',
      line2: '2 48274  41.4721  88.3412 0004123 110.2345 250.1234 15.62345678321098'
    },
    defaultAlt: 389.4,
    defaultVel: 27620,
    inclination: 41.47,
    crew: {
      en: '3 Taikonauts on board',
      si: 'ගගනගාමීන් 3 දෙනෙක්',
      ta: '3 விண்வெளி வீரர்கள்'
    },
    altitudeContext: {
      en: 'Low Earth Orbit · Slightly lower than ISS',
      si: 'පහළ කක්ෂය · ISS යානයට වඩා මඳක් පහළින්',
      ta: 'தாழ் சுற்றுப்பாதை · ISS-ஐ விட சற்று கீழே'
    },
    status: {
      en: 'Operational · Mengtian lab running cold-atom clock and microgravity fluid physics assays',
      si: 'ක්‍රියාකාරීයි · මෙන්ටියෑන් පර්යේෂණාගාරයේ පරමාණුක ඔරලෝසු සහ භෞතික විද්‍යා පරීක්ෂණ ක්‍රියාත්මකයි',
      ta: 'செயல்பாட்டில் உள்ளது · மெங்டியன் ஆய்வுக்கூடத்தில் துல்லியமான இயற்பியல் சோதனைகள் நடைபெறுகின்றன'
    },
    missionSummary: {
      en: 'Permanent three-module crewed space station built around the Tianhe core with Wentian and Mengtian science laboratories.',
      si: 'ටියැන්හේ, වෙන්ටියෑන් සහ මෙන්ටියෑන් කොටස්වලින් සමන්විත චීනයේ ස්ථිර මානව අභ්‍යවකාශ මධ්‍යස්ථානය.',
      ta: 'மூன்று ஆய்வுக் கூடங்களைக் கொண்ட சீன விண்வெளி வீரர்களின் நிரந்தர விண்வெளி நிலையம்.'
    }
  },
  {
    id: 'chandra',
    name: 'Chandra X-Ray Observatory',
    shortName: 'Chandra',
    noradId: 25867,
    orbitTier: 'HEO',
    type: {
      en: 'High-Energy X-Ray Telescope',
      si: 'අධි-ශක්ති එක්ස්-කිරණ දුරේක්ෂය',
      ta: 'உயர் ஆற்றல் எக்ஸ்ரே தொலைநோக்கி'
    },
    shortRole: {
      en: 'X-Ray Observatory',
      si: 'එක්ස්-කිරණ දුරේක්ෂය',
      ta: 'எக்ஸ்ரே தொலைநோக்கி'
    },
    operator: 'NASA / Smithsonian',
    launchDate: 'Jul 1999',
    color: '#a855f7',
    glowRgb: '168, 85, 247',
    iconType: 'telescope',
    tle: {
      line1: '1 25867U 99040B   26273.34567812  .00000123  00000-0  00000-0 0  9994',
      line2: '2 25867  76.5432 210.1234 6823451 280.4567  45.6789  0.37891234123456'
    },
    defaultAlt: 64200,
    defaultVel: 12400,
    inclination: 76.54,
    crew: {
      en: 'Robotic X-Ray Observatory',
      si: 'ස්වයංක්‍රීය එක්ස්-කිරණ යානය',
      ta: 'தானியங்கி எக்ஸ்ரே தொலைநோக்கி'
    },
    altitudeContext: {
      en: 'High Elliptical Orbit · ~1/3 distance to the Moon',
      si: 'ඉහළ ඉලිප්සාකාර කක්ෂය · සඳට ඇති දුරින් ~1/3',
      ta: 'உயர் நீள்வட்டப் பாதை · நிலவு தூரத்தில் ~1/3'
    },
    status: {
      en: 'Operational in High Elliptical Orbit · Capturing relativistic jets from Sagittarius A*',
      si: 'ඉහළ කක්ෂයේ ක්‍රියාකාරීයි · Sagittarius A* කළු කුහරයේ අධිවේගී කිරණ ජාලයන් නිරීක්ෂණය කරයි',
      ta: 'செயல்பாட்டில் உள்ளது · கருந்துளைகளில் இருந்து வெளிவரும் கதிர்வீச்சை ஆராய்கிறது'
    },
    missionSummary: {
      en: 'NASA Great Observatory imaging high-energy X-rays from black holes, supernovas, and galaxy clusters far above Earth’s radiation belts.',
      si: 'පෘථිවි විකිරණ පටිවලට බොහෝ ඉහළින් සිට කළු කුහර, සුපර්නෝවා සහ මන්දාකිණි පොකුරුවල එක්ස්-කිරණ ග්‍රහණය කරන නාසා දුරේක්ෂය.',
      ta: 'பூமியின் கதிர்வீச்சுப் பட்டைகளுக்கு அப்பால் இருந்து கருந்துளைகள் மற்றும் சூப்பர்நோவா எக்ஸ்ரே கதிர்களைப் படம்பிடிக்கிறது.'
    }
  },
  {
    id: 'landsat9',
    name: 'Landsat 9 Earth Science Satellite',
    shortName: 'Landsat 9',
    noradId: 49260,
    orbitTier: 'LEO',
    type: {
      en: 'Earth Observation Satellite',
      si: 'පෘථිවි නිරීක්ෂණ චන්ද්‍රිකාව',
      ta: 'பூமி கண்காணிப்பு செயற்கைக்கோள்'
    },
    shortRole: {
      en: 'Earth Imager',
      si: 'පෘථිවි සිතියම් යානය',
      ta: 'பூமி படப்பிடிப்பி'
    },
    operator: 'NASA / USGS',
    launchDate: 'Sep 2021',
    color: '#10b981',
    glowRgb: '16, 185, 129',
    iconType: 'satellite',
    tle: {
      line1: '1 49260U 21088A   26273.65432100  .00000456  00000-0  34567-4 0  9993',
      line2: '2 49260  98.2134 315.4321 0001234  70.1234 290.4321 14.57123456123456'
    },
    defaultAlt: 705.4,
    defaultVel: 26950,
    inclination: 98.21,
    crew: {
      en: 'Autonomous Earth Imager',
      si: 'ස්වයංක්‍රීය පෘථිවි නිරීක්ෂකයා',
      ta: 'தானியங்கி பூமி படப்பிடிப்பி'
    },
    altitudeContext: {
      en: 'Sun-Synchronous Polar Orbit · Pole-to-pole scan',
      si: 'ධ්‍රැවීය කක්ෂය · උතුරේ සිට දකුණට සම්පූර්ණ සිතියම්ගත කිරීම',
      ta: 'துருவ சுற்றுப்பாதை · வடக்கு-தெற்கு முழு ஆய்வு'
    },
    status: {
      en: 'Operational in Polar Orbit · Mapping global forests, coastlines, crops, and water resources',
      si: 'ධ්‍රැවීය කක්ෂයේ ක්‍රියාකාරීයි · පෘථිවි වනාන්තර, ජල මූලාශ්‍ර සහ කෘෂිකාර්මික සම්පත් සිතියම්ගත කරමින් පවතී',
      ta: 'செயல்பாட்டில் உள்ளது · பூமியின் காடுகள், நீர்நிலைகள் மற்றும் வேளாண் நிலங்களை படம் பிடிக்கிறது'
    },
    missionSummary: {
      en: 'Continues a 50+ year archive monitoring Earth’s forests, water quality, agriculture, and climate changes every 16 days.',
      si: 'වසර 50ක අඛණ්ඩ පෘථිවි පාරිසරික, වනාන්තර සහ භූමි වෙනස්වීම් දින 16කට වරක් සිතියම්ගත කරන ප්‍රමුඛ චන්ද්‍රිකාව.',
      ta: 'பூமியின் காடுகள், கடலோர மற்றும் காலநிலை மாற்றங்களை 50 ஆண்டுகளுக்கும் மேலாகத் தொடர்ந்து கண்காணிக்கும் செயற்கைக்கோள்.'
    }
  }
];

// Curated global ground tracking stations (Colombo default)
const TARGET_REGIONS = [
  {
    id: 'colombo',
    name: { en: 'Colombo, Sri Lanka', si: 'කොළඹ, ශ්‍රී ලංකාව', ta: 'கொழும்பு, இலங்கை' },
    shortName: { en: 'Colombo', si: 'කොළඹ', ta: 'கொழும்பு' },
    lat: 6.9271,
    lon: 79.8612,
    code: 'LK',
    type: { en: 'Sri Lanka Reference', si: 'ශ්‍රී ලංකා මධ්‍යස්ථානය', ta: 'இலங்கை மையம்' }
  },
  {
    id: 'chennai',
    name: { en: 'Chennai, India', si: 'චෙන්නායි, ඉන්දියාව', ta: 'சென்னை, இந்தியா' },
    shortName: { en: 'Chennai', si: 'චෙන්නායි', ta: 'சென்னை' },
    lat: 13.0827,
    lon: 80.2707,
    code: 'IN',
    type: { en: 'South Asia Station', si: 'දකුණු ආසියානු මධ්‍යස්ථානය', ta: 'தெற்கு ஆசிய மையம்' }
  },
  {
    id: 'houston',
    name: { en: 'Houston (NASA JSC), USA', si: 'හූස්ටන් (NASA JSC), ඇමරිකාව', ta: 'ஹூஸ்டன் (நாசா), அமெரிக்கா' },
    shortName: { en: 'Houston', si: 'හූස්ටන්', ta: 'ஹூஸ்டன்' },
    lat: 29.5593,
    lon: -95.0900,
    code: 'US',
    type: { en: 'Mission Control', si: 'නාසා මෙහෙයුම් මැදිරිය', ta: 'நாசா கட்டுப்பாட்டு மையம்' }
  },
  {
    id: 'tokyo',
    name: { en: 'Tokyo (JAXA), Japan', si: 'ටෝකියෝ (JAXA), ජපානය', ta: 'டோக்கியோ (ஜாக்சா), ஜப்பான்' },
    shortName: { en: 'Tokyo', si: 'ටෝකියෝ', ta: 'டோக்கியோ' },
    lat: 35.6762,
    lon: 139.6503,
    code: 'JP',
    type: { en: 'JAXA Operations', si: 'JAXA මෙහෙයුම් කලාපය', ta: 'ஜாக்சா மையம்' }
  },
  {
    id: 'london',
    name: { en: 'London (ESA / UKSA), UK', si: 'ලන්ඩන් (ESA), එක්සත් රාජධානිය', ta: 'லண்டன் (ESA), பிரித்தானியா' },
    shortName: { en: 'London', si: 'ලන්ඩන්', ta: 'லண்டன்' },
    lat: 51.5074,
    lon: -0.1278,
    code: 'GB',
    type: { en: 'European Station', si: 'යුරෝපීය මධ්‍යස්ථානය', ta: 'ஐரோப்பிய மையம்' }
  }
];

function propagateSatellite(sat, date = new Date()) {
  return propagateTLE(sat, date);
}

/** Distinct crisp SVG markup per spacecraft type for Leaflet markers */
function getMarkerSvg(iconType) {
  if (iconType === 'station') {
    // Space station with central module and dual solar wing arrays
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="6" width="4" height="12" rx="1"/>
      <rect x="18" y="6" width="4" height="12" rx="1"/>
      <line x1="6" y1="12" x2="18" y2="12"/>
      <rect x="9.5" y="9" width="5" height="6" rx="1" fill="white" fill-opacity="0.3"/>
    </svg>`;
  }
  if (iconType === 'webb') {
    // Hexagonal primary mirror + sunshield
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 3 18 6.5 18 13.5 12 17 6 13.5 6 6.5 12 3" fill="white" fill-opacity="0.25"/>
      <path d="M4 20 L12 17.5 L20 20"/>
    </svg>`;
  }
  if (iconType === 'telescope') {
    // Cylindrical space telescope with aperture
    return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m14.5 5.5 4 4-9 9-4-4 9-9Z" fill="white" fill-opacity="0.2"/>
      <path d="m16 4 4 4"/>
      <path d="m3 21 4-4"/>
    </svg>`;
  }
  // Earth observation satellite with solar wings + downward sensor
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="8" width="6" height="8" rx="1.5" fill="white" fill-opacity="0.25"/>
    <path d="M3 10h6M3 14h6M15 10h6M15 14h6"/>
    <path d="M12 16v4"/>
  </svg>`;
}

function buildSatelliteMarkerHtml(sat, isSelected) {
  const size = isSelected ? 'w-9 h-9' : 'w-7 h-7';
  const ringOpacity = isSelected ? 0.75 : 0;
  const borderStyle = isSelected ? '2px solid #ffffff' : `1.5px solid ${sat.color}`;
  const shadow = isSelected ? `0 0 20px ${sat.color}` : `0 0 8px rgba(${sat.glowRgb}, 0.55)`;
  const labelBg = isSelected ? 'rgba(5, 11, 22, 0.96)' : 'rgba(5, 11, 22, 0.8)';

  return `
    <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer group">
      ${isSelected ? `<div class="absolute w-14 h-14 rounded-full border-2 animate-ping" style="border-color: ${sat.color}; opacity: ${ringOpacity};"></div>` : ''}
      <div class="relative ${size} rounded-[10px] flex items-center justify-center transition-transform duration-300 group-hover:scale-115" style="background: radial-gradient(circle at 30% 30%, ${sat.color}, #070f1b 90%); border: ${borderStyle}; box-shadow: ${shadow};">
        ${getMarkerSvg(sat.iconType)}
      </div>
      <div class="absolute ${isSelected ? 'top-10' : 'top-8'} px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold whitespace-nowrap shadow-lg" style="background: ${labelBg}; border-color: ${isSelected ? sat.color : 'rgba(148,178,214,0.28)'}; color: ${isSelected ? '#ffffff' : sat.color};">
        ${sat.shortName}
      </div>
    </div>
  `;
}

function buildStationMarkerHtml(station, isSelected, lang) {
  const label = station.shortName[lang] || station.shortName.en;
  if (isSelected) {
    return `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer group">
        <div class="absolute w-8 h-8 rounded-full border border-amber-300/70 animate-ping"></div>
        <div class="w-4 h-4 rounded-full bg-amber-300 border-2 border-slate-950 shadow-[0_0_12px_rgba(251,191,36,0.9)]"></div>
        <div class="absolute top-5 px-2 py-0.5 rounded-md bg-slate-950/95 border border-amber-300/80 text-[10px] font-mono font-bold text-amber-200 whitespace-nowrap shadow-lg">
          ${label}
        </div>
      </div>
    `;
  }
  return `
    <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer group">
      <div class="w-2.5 h-2.5 rounded-full bg-slate-300/90 border-2 border-slate-950 shadow-sm group-hover:bg-amber-300 transition-colors"></div>
      <div class="absolute top-3.5 px-1.5 py-0.5 rounded bg-slate-950/85 border border-slate-700 text-[9px] font-mono text-slate-200 whitespace-nowrap opacity-80 group-hover:opacity-100">
        ${label}
      </div>
    </div>
  `;
}

function renderCraftIcon(iconType, color) {
  const props = { className: 'w-4 h-4 shrink-0', style: { color } };
  if (iconType === 'station') return <Radar {...props} />;
  if (iconType === 'webb') return <Sparkles {...props} />;
  if (iconType === 'telescope') return <Telescope {...props} />;
  return <SatelliteIcon {...props} />;
}

function formatAltitudeShort(altKm) {
  if (!Number.isFinite(altKm)) return '—';
  if (altKm >= 1000000) return `${(altKm / 1000000).toFixed(1)}M km`;
  if (altKm >= 10000) return `${Math.round(altKm / 1000)}k km`;
  return `${Math.round(altKm).toLocaleString()} km`;
}

function formatClock(date) {
  if (!(date instanceof Date)) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const LABELS = {
  en: {
    title: 'Interactive Orbital Map Tracker',
    subtitle: 'Track spacecraft flying above Earth right now. Click any craft to follow its live orbit, sunlight status, and distance from your city.',
    guideBtn: 'How to Read Map',
    guideHide: 'Hide Guide',
    guideSteps: [
      { title: '1. Choose a Spacecraft', desc: 'Pick any of the 6 craft cards below, or click a glowing icon directly on the world map.' },
      { title: '2. Read the Orbit Path', desc: 'The solid line shows where it just flew; the dashed wave projects its full orbit around Earth.' },
      { title: '3. Sky Visibility Ring', desc: 'For near-Earth craft, the shaded circle shows where on Earth it is currently above the horizon.' },
      { title: '4. Measure to a City', desc: 'Pick Colombo or another city below to draw a dashed distance line between the city and the spacecraft.' }
    ],
    liveIss: 'Live ISS Feed',
    modelOrbit: 'Orbital Model',
    updatedAt: 'Updated',
    refreshTitle: 'Refresh spacecraft positions',
    selectSatHeading: 'Select a Spacecraft to Track (6 Active Missions)',
    mapDark: 'Dark Map',
    mapSat: 'Satellite View',
    layers: 'Map Layers',
    layerOrbit: 'Orbit Path & Trail',
    layerHorizon: 'Sky Visibility Zone',
    layerNight: 'Earth Night Shadow',
    layerLink: 'City Distance Line',
    autoFollow: 'Auto-Follow',
    autoFollowOn: 'Following Craft',
    recenter: 'Center on spacecraft',
    fitBoth: 'Show spacecraft & selected city together',
    worldView: 'Reset to full world view',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    overPrefix: 'Over',
    inSunlight: 'In Sunlight',
    inShadow: 'In Earth’s Shadow',
    legendTrail: 'Recent Path',
    legendOrbit: 'Orbit Track',
    legendHorizon: 'Sky Visibility Zone',
    legendLink: 'Distance to City',
    legendNight: 'Night Side of Earth',
    deepSpaceNote: 'Deep-space observatory: the marker shows the point on Earth directly below its line of sight. A small near-Earth visibility circle does not apply here.',
    liveBriefHeading: 'Right Now in Plain Words',
    missionDetails: 'Mission Details',
    centerMap: 'Center on Map',
    altLabel: 'Altitude Above Earth',
    speedLabel: 'Orbital Speed',
    posLabel: 'Position Over Earth',
    lightTiltLabel: 'Sunlight & Orbit Tilt',
    tiltPrefix: 'Orbit tilt',
    orbitPeriodEvery: (m) => `~${m} min per Earth orbit`,
    orbitPeriodHours: (h) => `~${h} hr elliptical orbit`,
    orbitPeriodHalo: 'Halo orbit around L2 (~6 mo)',
    stationHeading: 'Distance From a Ground City',
    stationSub: 'Choose a city to draw its live great-circle link on the map and check whether the craft is inside its sky horizon.',
    showBothBtn: 'Show Craft & City on Map',
    flyCityBtn: 'Focus City',
    selectedCityLabel: 'Reference City',
    distanceLabel: 'Surface Distance',
    horizonInside: (km) => `Within sky horizon (~${km.toLocaleString()} km radius)`,
    horizonOutside: (km) => `Outside sky horizon (~${km.toLocaleString()} km radius)`,
    horizonDeepSpace: 'Deep-space orbit (horizon circle does not apply)',
    distanceHint: 'Straight-line distance along Earth’s surface (not sky visibility).',
    passNoticeTitle: 'About Overhead Pass Times',
    passNotice: 'Next-pass time is not predicted here; it requires current orbital elements and a validated prediction model.',
    lat: 'Latitude',
    lon: 'Longitude',
    alt: 'Altitude',
    vel: 'Speed',
    operator: 'Operator',
    launch: 'Launched',
    crew: 'Crew',
    debrief: 'Mission Overview',
    tleToggle: 'Technical NORAD TLE Orbital Data',
    trackFollow: 'Track & Follow on Map',
    close: 'Close',
    dataSourceFootnote: 'ISS uses a live position fix when reachable; other craft positions use simplified orbital math, not full SGP4.',
    plainSummary: ({ name, region, alt, speed, sunlit, isDeepSpace }) =>
      isDeepSpace
        ? `${name} is operating ${alt} from Earth (aligned above ${region}), moving at ${speed} km/h in continuous sunlight.`
        : `${name} is flying over ${region} at ${alt} altitude, moving at ${speed} km/h — currently ${sunlit ? 'in direct sunlight' : 'passing through Earth’s night shadow'}.`
  },
  si: {
    title: 'අන්තර්ක්‍රියාකාරී කක්ෂීය සිතියම් නිරීක්ෂකය',
    subtitle: 'පෘථිවියට ඉහළින් ගමන් කරන අභ්‍යවකාශ යානා දැන් කොහේදැයි සජීවීව බලන්න. ඕනෑම යානයක් තෝරා එහි ගමන් මග, උස, වේගය සහ ඔබේ නගරයට ඇති දුර පහසුවෙන් තේරුම් ගන්න.',
    guideBtn: 'සිතියම තේරුම් ගන්න',
    guideHide: 'මාර්ගෝපදේශය සඟවන්න',
    guideSteps: [
      { title: '1. යානයක් තෝරන්න', desc: 'පහත යානා 6න් එකක් හෝ සිතියමේ දිලිසෙන අයිකනයක් ක්ලික් කරන්න.' },
      { title: '2. ගමන් මග කියවන්න', desc: 'තද රේඛාවෙන් මෑත ගමන් මගත්, කඩ ඉරි වක්‍රයෙන් ඉදිරි කක්ෂීය මගත් පෙන්වයි.' },
      { title: '3. දෘශ්‍යතා කවය', desc: 'පහළ කක්ෂයේ යානා වටා ඇති වළල්ලෙන් එම යානය අහසේ දිස්වන පෘථිවි කලාපය පෙන්වයි.' },
      { title: '4. නගරයට දුර බලන්න', desc: 'කොළඹ හෝ වෙනත් නගරයක් තෝරා සිතියම මත යානයට ඇති දුර රේඛාව බලන්න.' }
    ],
    liveIss: 'සජීවී ISS දත්ත',
    modelOrbit: 'කක්ෂීය ආකෘතිය',
    updatedAt: 'යාවත්කාලීන',
    refreshTitle: 'යානා පිහිටීම් නැවත යාවත්කාලීන කරන්න',
    selectSatHeading: 'නිරීක්ෂණය කිරීමට අභ්‍යවකාශ යානයක් තෝරන්න (සක්‍රීය මෙහෙයුම් 6)',
    mapDark: 'අඳුරු සිතියම',
    mapSat: 'චන්ද්‍රිකා දසුන',
    layers: 'සිතියම් ස්ථර',
    layerOrbit: 'කක්ෂීය ගමන් මග',
    layerHorizon: 'දෘශ්‍යතා කලාපය',
    layerNight: 'පෘථිවි රාත්‍රී සෙවණැල්ල',
    layerLink: 'නගරයට දුර රේඛාව',
    autoFollow: 'ස්වයං-අනුගමනය',
    autoFollowOn: 'යානය අනුගමනය කරයි',
    recenter: 'තෝරාගත් යානය මැදට ගන්න',
    fitBoth: 'යානය සහ නගරය දෙකම සිතියමේ පෙන්වන්න',
    worldView: 'සම්පූර්ණ ලෝක සිතියම බලන්න',
    zoomIn: 'විශාලනය කරන්න',
    zoomOut: 'කුඩා කරන්න',
    overPrefix: 'ඉහළින්:',
    inSunlight: 'හිරු එළියේ',
    inShadow: 'පෘථිවි සෙවණැල්ලේ',
    legendTrail: 'මෑත ගමන් මග',
    legendOrbit: 'කක්ෂීය මග',
    legendHorizon: 'දෘශ්‍යතා කලාපය',
    legendLink: 'නගරයට දුර රේඛාව',
    legendNight: 'රාත්‍රී කලාපය',
    deepSpaceNote: 'ගැඹුරු අභ්‍යවකාශ දුරේක්ෂයකි: සිතියමේ ලකුණින් පෙන්වන්නේ එහි දිශාවට කෙළින්ම පහළින් පිහිටි පෘථිවි ලක්ෂ්‍යයයි. පහළ කක්ෂ දෘශ්‍යතා කවය මෙයට අදාළ නොවේ.',
    liveBriefHeading: 'දැන් තත්ත්වය සරලව',
    missionDetails: 'සම්පූර්ණ විස්තර',
    centerMap: 'සිතියම මැදට',
    altLabel: 'පෘථිවියේ සිට උස',
    speedLabel: 'ගමන් වේගය',
    posLabel: 'පෘථිවියට ඉහළ පිහිටීම',
    lightTiltLabel: 'ආලෝකය සහ කක්ෂ ආනතිය',
    tiltPrefix: 'කක්ෂ ආනතිය',
    orbitPeriodEvery: (m) => `එක් පෘථිවි වටයකට ~මිනි. ${m}`,
    orbitPeriodHours: (h) => `~පැය ${h} ඉලිප්සාකාර කක්ෂය`,
    orbitPeriodHalo: 'L2 වටා කක්ෂය (~මාස 6)',
    stationHeading: 'භූමි නගරයක සිට ඇති දුර',
    stationSub: 'කොළඹ හෝ වෙනත් නගරයක් තෝරා සිතියම මත යානයට ඇති සජීවී දුර රේඛාව සහ දෘශ්‍යතා සීමාව පරීක්ෂා කරන්න.',
    showBothBtn: 'යානය සහ නගරය එකවර පෙන්වන්න',
    flyCityBtn: 'නගරයට යන්න',
    selectedCityLabel: 'තෝරාගත් නගරය',
    distanceLabel: 'පෘථිවි පෘෂ්ඨය මත දුර',
    horizonInside: (km) => `දෘශ්‍යතා සීමාව ඇතුළත (~කි.මී. ${km.toLocaleString()} අරය)`,
    horizonOutside: (km) => `දෘශ්‍යතා සීමාවෙන් පිටත (~කි.මී. ${km.toLocaleString()} අරය)`,
    horizonDeepSpace: 'ගැඹුරු අභ්‍යවකාශ කක්ෂය (කවය අදාළ නොවේ)',
    distanceHint: 'පෘථිවි පෘෂ්ඨය ඔස්සේ ආසන්න දුර; අහසේ දෘශ්‍යතාව නොවේ.',
    passNoticeTitle: 'මීළඟ ගමන් වේලාව ගැන සටහනක්',
    passNotice: 'මීළඟ ගමන් වේලාව මෙහි ගණනය නොකෙරේ. ඒ සඳහා වලංගු කක්ෂීය දත්ත සහ අනාවැකි ආකෘතියක් අවශ්‍යයි.',
    lat: 'අක්ෂාංශය',
    lon: 'දේශාංශය',
    alt: 'උන්නතාංශය',
    vel: 'වේගය',
    operator: 'මෙහෙයුම්කරු',
    launch: 'ගුවන්ගත කළේ',
    crew: 'කාර්ය මණ්ඩලය',
    debrief: 'මෙහෙයුම් හැඳින්වීම',
    tleToggle: 'තාක්ෂණික NORAD TLE කක්ෂීය දත්ත',
    trackFollow: 'සිතියමේ අනුගමනය කරන්න',
    close: 'වසන්න',
    dataSourceFootnote: 'ISS දත්ත ලැබෙන විට සජීවී පිහිටීම පෙන්වයි; අනෙක් යානා සරල කක්ෂීය ගණනය කිරීම් මත පදනම් වේ (SGP4 නොවේ).',
    plainSummary: ({ name, region, alt, speed, sunlit, isDeepSpace }) =>
      isDeepSpace
        ? `${name} යානය පෘථිවියේ සිට ${alt} ඈතින් (${region} දිශාවට ඉහළින්) පැයට කි.මී. ${speed} ක වේගයෙන් නිරන්තර හිරු එළියේ ක්‍රියාත්මක වේ.`
        : `${name} යානය දැනට ${region} ප්‍රදේශයට ඉහළින් ${alt} උසකින්, පැයට කි.මී. ${speed} ක වේගයෙන් ගමන් කරමින් පවතී — දැනට ${sunlit ? 'හිරු එළියේ' : 'පෘථිවියේ රාත්‍රී සෙවණැල්ලේ'} ඇත.`
  },
  ta: {
    title: 'ஊடாடும் சுற்றுப்பாதை வரைபட கண்காணிப்பி',
    subtitle: 'பூமிக்கு மேலே பறக்கும் விண்கலங்களை நேரடியாகக் காணுங்கள். எந்த விண்கலத்தையும் தேர்ந்தெடுத்து அதன் பாதை, உயரம், வேகம் மற்றும் உங்கள் நகரத்திற்கான தூரத்தை எளிதில் அறியலாம்.',
    guideBtn: 'வரைபட வழிகாட்டி',
    guideHide: 'வழிகாட்டியை மறை',
    guideSteps: [
      { title: '1. விண்கலத்தைத் தேர்வுசெய்க', desc: 'கீழே உள்ள 6 விண்கல அட்டைகளில் ஒன்றையோ வரைபடத்தின் சின்னத்தையோ கிளிக் செய்யவும்.' },
      { title: '2. சுற்றுப்பாதையைப் பார்க்க', desc: 'தொடர் கோடு சமீபத்திய பாதையையும், கோடு-இடைவெளி வளைவு முழு சுற்றுப்பாதையையும் காட்டும்.' },
      { title: '3. வானத் தெரிவு வட்டம்', desc: 'தாழ் சுற்றுப்பாதை விண்கலங்களைச் சுற்றியுள்ள வட்டம் பூமியில் இருந்து அவை தெரியும் பகுதியைக் காட்டும்.' },
      { title: '4. நகரத் தூரம் அறிக', desc: 'கொழும்பு அல்லது பிற நகரத்தைத் தேர்ந்தெடுத்து வரைபடத்தில் தூரக் கோட்டைக் காணலாம்.' }
    ],
    liveIss: 'நேரலை ISS தரவு',
    modelOrbit: 'சுற்றுப்பாதை மாதிரி',
    updatedAt: 'புதுப்பிப்பு',
    refreshTitle: 'விண்கல நிலைகளைப் புதுப்பிக்கவும்',
    selectSatHeading: 'கண்காணிக்க விண்கலத்தைத் தேர்ந்தெடுக்கவும் (6 செயலில் உள்ள திட்டங்கள்)',
    mapDark: 'இருள் வரைபடம்',
    mapSat: 'செயற்கைக்கோள் காட்சி',
    layers: 'வரைபட அடுக்குகள்',
    layerOrbit: 'சுற்றுப்பாதை கோடு',
    layerHorizon: 'தெரிவுநிலை வட்டம்',
    layerNight: 'பூமி இரவு நிழல்',
    layerLink: 'நகர தூரக் கோடு',
    autoFollow: 'தானியங்கி பின்தொடரல்',
    autoFollowOn: 'பின்தொடர்கிறது',
    recenter: 'விண்கலத்தை மையப்படுத்துக',
    fitBoth: 'விண்கலம் மற்றும் நகரத்தை ஒன்றாகக் காட்டுக',
    worldView: 'முழு உலக வரைபடக் காட்சி',
    zoomIn: 'பெரிதாக்கு',
    zoomOut: 'சிறிதாக்கு',
    overPrefix: 'மேல்:',
    inSunlight: 'சூரிய ஒளியில்',
    inShadow: 'பூமியின் நிழலில்',
    legendTrail: 'சமீபத்திய பாதை',
    legendOrbit: 'சுற்றுப்பாதை',
    legendHorizon: 'தெரிவுநிலை பகுதி',
    legendLink: 'நகர தூரக் கோடு',
    legendNight: 'இரவுப் பகுதி',
    deepSpaceNote: 'ஆழ் விண்வெளி தொலைநோக்கி: வரைபடக் குறியீடு அதன் பார்வைக் கோட்டிற்கு நேர் கீழே உள்ள பூமிப் புள்ளியைக் காட்டுகிறது.',
    liveBriefHeading: 'தற்போதைய நிலை சுருக்கம்',
    missionDetails: 'முழு விவரங்கள்',
    centerMap: 'வரைபட மையம்',
    altLabel: 'பூமியிலிருந்து உயரம்',
    speedLabel: 'சுற்றுப்பாதை வேகம்',
    posLabel: 'பூமி மேல் நிலை',
    lightTiltLabel: 'ஒளி மற்றும் சாய்வு',
    tiltPrefix: 'பாதை சாய்வு',
    orbitPeriodEvery: (m) => `ஒரு பூமிச் சுற்றுக்கு ~${m} நிமிடம்`,
    orbitPeriodHours: (h) => `~${h} மணி நீள்வட்டப் பாதை`,
    orbitPeriodHalo: 'L2 வட்டப்பாதை (~6 மாதம்)',
    stationHeading: 'தரை நகரத்திலிருந்து தூரம்',
    stationSub: 'ஒரு நகரத்தைத் தேர்ந்தெடுத்து வரைபடத்தில் தூரக் கோட்டையும் தெரிவுநிலை எல்லையையும் காண்க.',
    showBothBtn: 'விண்கலம் & நகரத்தைக் காட்டு',
    flyCityBtn: 'நகரத்திற்குச் செல்',
    selectedCityLabel: 'தேர்ந்தெடுக்கப்பட்ட நகரம்',
    distanceLabel: 'தரைப்பரப்பு தூரம்',
    horizonInside: (km) => `தெரிவு எல்லைக்குள் (~${km.toLocaleString()} கி.மீ ஆரம்)`,
    horizonOutside: (km) => `தெரிவு எல்லைக்கு வெளியே (~${km.toLocaleString()} கி.மீ ஆரம்)`,
    horizonDeepSpace: 'ஆழ் விண்வெளிப் பாதை (தெரிவு வட்டம் பொருந்தாது)',
    distanceHint: 'பூமி மேற்பரப்பு தூரம்; வானத் தெரிவுநிலை அல்ல.',
    passNoticeTitle: 'அடுத்த கடக்கும் நேரம் குறிப்பு',
    passNotice: 'அடுத்த கடக்கும் நேரம் இங்கு கணிக்கப்படவில்லை; அதற்கு சரியான சுற்றுப்பாதைத் தரவும் மாதிரியும் தேவை.',
    lat: 'அட்சரேகை',
    lon: 'தீர்க்கரேகை',
    alt: 'உயரம்',
    vel: 'வேகம்',
    operator: 'இயக்குனர்',
    launch: 'ஏவப்பட்டது',
    crew: 'குழு',
    debrief: 'திட்ட விளக்கம்',
    tleToggle: 'தொழில்நுட்ப NORAD TLE தரவு',
    trackFollow: 'வரைபடத்தில் பின்தொடரவும்',
    close: 'மூடு',
    dataSourceFootnote: 'ISS நிலை கிடைக்கும்போது நேரடியாகக் காட்டப்படும்; மற்ற பாதைகள் எளிய தோராயங்கள், SGP4 அல்ல.',
    plainSummary: ({ name, region, alt, speed, sunlit, isDeepSpace }) =>
      isDeepSpace
        ? `${name} பூமியிலிருந்து ${alt} தொலைவில் (${region} திசைக்கு மேலே) மணிக்கு ${speed} கி.மீ வேகத்தில் தொடர் சூரிய ஒளியில் இயங்குகிறது.`
        : `${name} தற்போது ${region} பகுதிக்கு மேலே ${alt} உயரத்தில், மணிக்கு ${speed} கி.மீ வேகத்தில் பறக்கிறது — தற்போது ${sunlit ? 'சூரிய ஒளியில்' : 'பூமியின் இரவு நிழலில்'} உள்ளது.`
  }
};

function ISSTracker({ className = '' }) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);
  const t = LABELS[currentLang] || LABELS.en;

  const [selectedSatId, setSelectedSatId] = useState('iss');
  const [modalSat, setModalSat] = useState(null);
  const [autoCenter, setAutoCenter] = useState(true);
  const [selectedStation, setSelectedStation] = useState(TARGET_REGIONS[0]);
  const [showGuide, setShowGuide] = useState(false);
  const [mapStyle, setMapStyle] = useState('dark'); // 'dark' | 'satellite'
  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [layers, setLayers] = useState({
    orbit: true,
    horizon: true,
    night: true,
    stationLink: true
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [satPositions, setSatPositions] = useState(() => {
    const initial = {};
    const now = new Date();
    INITIAL_SATELLITES.forEach((s) => {
      initial[s.id] = propagateSatellite(s, now);
    });
    return initial;
  });

  const [trails, setTrails] = useState(() => {
    const initial = {};
    INITIAL_SATELLITES.forEach((s) => {
      initial[s.id] = [];
    });
    return initial;
  });

  const [lastUpdate, setLastUpdate] = useState(() => new Date());
  const [issFix, setIssFix] = useState('propagated');

  // Refs for Leaflet map, layers, and accessible modal focus trap
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseLayersRef = useRef({});
  const markerLayersRef = useRef({});
  const stationMarkersRef = useRef({});
  const trailPolylineRef = useRef(null);
  const orbitPolylineRef = useRef(null);
  const footprintCircleRef = useRef(null);
  const nightPolygonRef = useRef(null);
  const stationLinkRef = useRef(null);
  const selectedSatIdRef = useRef(selectedSatId);
  const modalRef = useRef(null);
  const layersMenuRef = useRef(null);

  useFocusTrap(Boolean(modalSat), modalRef);

  useEffect(() => {
    selectedSatIdRef.current = selectedSatId;
  }, [selectedSatId]);

  // Close layers popover on outside click or Escape
  useEffect(() => {
    if (!showLayersMenu) return;
    const onPointerDown = (e) => {
      if (layersMenuRef.current && !layersMenuRef.current.contains(e.target)) {
        setShowLayersMenu(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowLayersMenu(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showLayersMenu]);

  // Close modal on Escape
  useEffect(() => {
    if (!modalSat) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setModalSat(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalSat]);

  const activeSat = useMemo(
    () => INITIAL_SATELLITES.find((s) => s.id === selectedSatId) || INITIAL_SATELLITES[0],
    [selectedSatId]
  );

  const activePos = useMemo(
    () =>
      satPositions[selectedSatId] || {
        latitude: 21.482,
        longitude: 81.391,
        altitude: activeSat.defaultAlt,
        velocity: activeSat.defaultVel
      },
    [satPositions, selectedSatId, activeSat]
  );

  const isDeepSpace = activeSat.orbitTier === 'L2' || activeSat.orbitTier === 'HEO';
  const visibilityRadiusMeters = useMemo(
    () => computeVisibilityRadiusMeters(activePos.altitude),
    [activePos.altitude]
  );
  const visibilityRadiusKm = visibilityRadiusMeters ? Math.round(visibilityRadiusMeters / 1000) : null;

  const isSunlit = useMemo(
    () => isSpacecraftInSunlight(activePos.latitude, activePos.longitude, activePos.altitude, lastUpdate),
    [activePos.latitude, activePos.longitude, activePos.altitude, lastUpdate]
  );

  const regionObj = useMemo(
    () => getApproximateRegion(activePos.latitude, activePos.longitude),
    [activePos.latitude, activePos.longitude]
  );
  const regionName = regionObj[currentLang] || regionObj.en;

  const orbitPeriodText = useMemo(() => {
    const mins = computeOrbitPeriodMinutes(activePos.altitude, activeSat.id);
    if (mins === null) return t.orbitPeriodHalo;
    if (mins > 300) return t.orbitPeriodHours((mins / 60).toFixed(1));
    return t.orbitPeriodEvery(mins);
  }, [activePos.altitude, activeSat.id, t]);

  const distanceKm = useMemo(
    () =>
      computeGreatCircleDistanceKm(
        activePos.latitude,
        activePos.longitude,
        selectedStation.lat,
        selectedStation.lon
      ),
    [activePos.latitude, activePos.longitude, selectedStation.lat, selectedStation.lon]
  );

  const withinHorizon = visibilityRadiusKm !== null && distanceKm <= visibilityRadiusKm;

  const stationLinkArc = useMemo(
    () =>
      computeGreatCircleArc(
        activePos.latitude,
        activePos.longitude,
        selectedStation.lat,
        selectedStation.lon,
        44
      ),
    [activePos.latitude, activePos.longitude, selectedStation.lat, selectedStation.lon]
  );

  const projectedOrbitCoords = useMemo(() => {
    const points = [];
    const currentLat = activePos.latitude;
    const currentLon = activePos.longitude;
    const inc = activeSat.inclination;
    const clampedRatio = Math.max(-1, Math.min(1, currentLat / (inc || 1)));
    const phase = Math.asin(clampedRatio);

    for (let deg = -180; deg <= 180; deg += 3) {
      const rad = ((deg - currentLon) * Math.PI) / 180;
      const calcLat = inc * Math.sin(rad + phase);
      points.push([calcLat, deg]);
    }
    return points;
  }, [activePos.latitude, activePos.longitude, activeSat.inclination]);

  const updateSatellitePositions = useCallback(async () => {
    setIsRefreshing(true);
    const now = new Date();
    const updatedPositions = {};

    INITIAL_SATELLITES.forEach((s) => {
      updatedPositions[s.id] = propagateSatellite(s, now);
    });

    try {
      const liveIss = await fetchIssLocation();
      if (liveIss && typeof liveIss.latitude === 'number') {
        setIssFix(liveIss._isSample ? 'propagated' : 'live');
        updatedPositions.iss = {
          latitude: Number(liveIss.latitude),
          longitude: Number(liveIss.longitude),
          altitude: Number(liveIss.altitude),
          velocity: Number(liveIss.velocity)
        };
      }
    } catch {
      // Fall back to propagated positions quietly
    }

    setSatPositions(updatedPositions);

    setTrails((prev) => {
      const nextTrails = { ...prev };
      Object.keys(updatedPositions).forEach((id) => {
        const pos = updatedPositions[id];
        const prevTrail = nextTrails[id] || [];
        nextTrails[id] = [...prevTrail.slice(-28), [pos.latitude, pos.longitude]];
      });
      return nextTrails;
    });

    setLastUpdate(now);
    setTimeout(() => setIsRefreshing(false), 350);
  }, []);

  useEffect(() => {
    updateSatellitePositions();
    const interval = setInterval(updateSatellitePositions, 45000);
    return () => clearInterval(interval);
  }, [updateSatellitePositions]);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [activePos.latitude, activePos.longitude],
      zoom: 3,
      minZoom: 2,
      maxZoom: 9,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true
    });

    const darkBase = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16 }
    );
    const darkRef = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16, opacity: 0.78 }
    );
    const satBase = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16 }
    );
    const satLabels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16, opacity: 0.72 }
    );

    darkBase.addTo(map);
    darkRef.addTo(map);
    baseLayersRef.current = { darkBase, darkRef, satBase, satLabels };

    // Night-side terminator polygon
    const nightPoly = L.polygon(getNightTerminatorPolygon(new Date()), {
      color: 'rgba(148, 178, 214, 0.3)',
      weight: 1,
      fillColor: '#020612',
      fillOpacity: 0.36,
      interactive: false
    }).addTo(map);

    // Projected orbital path (dashed)
    const orbitLine = L.polyline([], {
      color: activeSat.color,
      weight: 1.75,
      opacity: 0.55,
      dashArray: '6, 6',
      interactive: false
    }).addTo(map);

    // Recent orbital trail (solid glowing)
    const trailLine = L.polyline([], {
      color: activeSat.color,
      weight: 3.2,
      opacity: 0.92,
      interactive: false
    }).addTo(map);

    // Geometric sky visibility footprint circle
    const footprintCircle = L.circle([activePos.latitude, activePos.longitude], {
      radius: computeVisibilityRadiusMeters(activePos.altitude) || 2260000,
      color: activeSat.color,
      weight: 1.5,
      fillColor: activeSat.color,
      fillOpacity: 0.1,
      dashArray: '5, 5',
      interactive: false
    }).addTo(map);

    // Great-circle link to selected ground station
    const stationLink = L.polyline([], {
      color: '#fbbf24',
      weight: 2,
      opacity: 0.8,
      dashArray: '4, 7',
      interactive: false
    }).addTo(map);

    // Ground Station markers
    const stationMarkers = {};
    TARGET_REGIONS.forEach((station) => {
      const sIcon = L.divIcon({
        className: `station-marker-${station.id}`,
        html: buildStationMarkerHtml(station, station.id === selectedStation.id, currentLang),
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      const sMarker = L.marker([station.lat, station.lon], {
        icon: sIcon,
        zIndexOffset: 200,
        title: station.name[currentLang] || station.name.en
      }).addTo(map);
      sMarker.on('click', () => {
        setSelectedStation(station);
        setAutoCenter(false);
      });
      stationMarkers[station.id] = sMarker;
    });

    // Satellite markers
    const satMarkers = {};
    INITIAL_SATELLITES.forEach((sat) => {
      const pos = satPositions[sat.id] || { latitude: 0, longitude: 0 };
      const isSelected = sat.id === selectedSatId;
      const sIcon = L.divIcon({
        className: `sat-marker-${sat.id}`,
        html: buildSatelliteMarkerHtml(sat, isSelected),
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      const satMarker = L.marker([pos.latitude, pos.longitude], {
        icon: sIcon,
        zIndexOffset: isSelected ? 600 : 300,
        title: `${sat.name} (${formatAltitudeShort(pos.altitude)})`
      }).addTo(map);

      satMarker.on('click', () => {
        if (selectedSatIdRef.current === sat.id) {
          setModalSat(sat);
        } else {
          setSelectedSatId(sat.id);
          setAutoCenter(true);
        }
      });
      satMarkers[sat.id] = satMarker;
    });

    // Pause auto-follow gently if user manually drags the map
    map.on('dragstart', () => {
      setAutoCenter(false);
    });

    mapInstanceRef.current = map;
    markerLayersRef.current = satMarkers;
    stationMarkersRef.current = stationMarkers;
    trailPolylineRef.current = trailLine;
    orbitPolylineRef.current = orbitLine;
    footprintCircleRef.current = footprintCircle;
    nightPolygonRef.current = nightPoly;
    stationLinkRef.current = stationLink;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Swap Dark vs Satellite base tiles cleanly
  useEffect(() => {
    const map = mapInstanceRef.current;
    const bl = baseLayersRef.current;
    if (!map || !bl.darkBase) return;

    if (mapStyle === 'satellite') {
      if (map.hasLayer(bl.darkBase)) map.removeLayer(bl.darkBase);
      if (map.hasLayer(bl.darkRef)) map.removeLayer(bl.darkRef);
      if (!map.hasLayer(bl.satBase)) bl.satBase.addTo(map);
      if (!map.hasLayer(bl.satLabels)) bl.satLabels.addTo(map);
    } else {
      if (map.hasLayer(bl.satBase)) map.removeLayer(bl.satBase);
      if (map.hasLayer(bl.satLabels)) map.removeLayer(bl.satLabels);
      if (!map.hasLayer(bl.darkBase)) bl.darkBase.addTo(map);
      if (!map.hasLayer(bl.darkRef)) bl.darkRef.addTo(map);
    }
  }, [mapStyle]);

  // Sync map layers, satellite markers, station markers, terminator & link arc
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // 1. Satellite markers
    Object.keys(markerLayersRef.current).forEach((satId) => {
      const marker = markerLayersRef.current[satId];
      const pos = satPositions[satId];
      const satDef = INITIAL_SATELLITES.find((s) => s.id === satId);
      const isSelected = satId === selectedSatId;

      if (marker && satDef && pos && typeof pos.latitude === 'number') {
        marker.setLatLng([pos.latitude, pos.longitude]);
        marker.setZIndexOffset(isSelected ? 600 : 300);
        marker.setIcon(
          L.divIcon({
            className: `sat-marker-${satId}`,
            html: buildSatelliteMarkerHtml(satDef, isSelected),
            iconSize: [36, 36],
            iconAnchor: [18, 18]
          })
        );
      }
    });

    // 2. Ground station markers (highlight selected + localize label)
    TARGET_REGIONS.forEach((station) => {
      const marker = stationMarkersRef.current[station.id];
      if (!marker) return;
      const isSelected = station.id === selectedStation.id;
      marker.setZIndexOffset(isSelected ? 450 : 200);
      marker.setIcon(
        L.divIcon({
          className: `station-marker-${station.id}`,
          html: buildStationMarkerHtml(station, isSelected, currentLang),
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      );
    });

    // 3. Orbit path & antimeridian-safe trail
    if (trailPolylineRef.current && orbitPolylineRef.current) {
      if (layers.orbit) {
        if (!map.hasLayer(orbitPolylineRef.current)) orbitPolylineRef.current.addTo(map);
        if (!map.hasLayer(trailPolylineRef.current)) trailPolylineRef.current.addTo(map);
        orbitPolylineRef.current.setStyle({ color: activeSat.color });
        orbitPolylineRef.current.setLatLngs(projectedOrbitCoords);
        trailPolylineRef.current.setStyle({ color: activeSat.color });
        trailPolylineRef.current.setLatLngs(splitAntimeridianPath(trails[selectedSatId] || []));
      } else {
        if (map.hasLayer(orbitPolylineRef.current)) map.removeLayer(orbitPolylineRef.current);
        if (map.hasLayer(trailPolylineRef.current)) map.removeLayer(trailPolylineRef.current);
      }
    }

    // 4. Visibility horizon circle (only for LEO craft when toggled on)
    if (footprintCircleRef.current) {
      if (layers.horizon && visibilityRadiusMeters) {
        if (!map.hasLayer(footprintCircleRef.current)) footprintCircleRef.current.addTo(map);
        footprintCircleRef.current.setRadius(visibilityRadiusMeters);
        footprintCircleRef.current.setStyle({ color: activeSat.color, fillColor: activeSat.color });
        footprintCircleRef.current.setLatLng([activePos.latitude, activePos.longitude]);
      } else if (map.hasLayer(footprintCircleRef.current)) {
        map.removeLayer(footprintCircleRef.current);
      }
    }

    // 5. Night-side terminator shadow
    if (nightPolygonRef.current) {
      if (layers.night) {
        if (!map.hasLayer(nightPolygonRef.current)) nightPolygonRef.current.addTo(map);
        nightPolygonRef.current.setLatLngs(getNightTerminatorPolygon(lastUpdate));
      } else if (map.hasLayer(nightPolygonRef.current)) {
        map.removeLayer(nightPolygonRef.current);
      }
    }

    // 6. Great-circle station distance link
    if (stationLinkRef.current) {
      if (layers.stationLink) {
        if (!map.hasLayer(stationLinkRef.current)) stationLinkRef.current.addTo(map);
        stationLinkRef.current.setLatLngs(stationLinkArc);
      } else if (map.hasLayer(stationLinkRef.current)) {
        map.removeLayer(stationLinkRef.current);
      }
    }

    // 7. Auto-center smoothly on active craft
    if (autoCenter && typeof activePos.latitude === 'number') {
      map.panTo([activePos.latitude, activePos.longitude], { animate: true, duration: 1.0 });
    }
  }, [
    satPositions,
    selectedSatId,
    selectedStation,
    activeSat,
    activePos,
    trails,
    projectedOrbitCoords,
    visibilityRadiusMeters,
    stationLinkArc,
    layers,
    lastUpdate,
    autoCenter,
    currentLang
  ]);

  const handleRecenter = () => {
    setAutoCenter(true);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([activePos.latitude, activePos.longitude], 4, { duration: 1.1 });
    }
  };

  const handleWorldOverview = () => {
    setAutoCenter(false);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([15, 20], 2, { duration: 1.1 });
    }
  };

  const handleFitCraftAndStation = () => {
    setAutoCenter(false);
    if (!mapInstanceRef.current) return;
    const bounds = L.latLngBounds(
      [activePos.latitude, activePos.longitude],
      [selectedStation.lat, selectedStation.lon]
    );
    mapInstanceRef.current.fitBounds(bounds, { padding: [55, 55], maxZoom: 5, animate: true });
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  const handleSelectSatellite = (sat) => {
    setSelectedSatId(sat.id);
    setAutoCenter(true);
    const pos = satPositions[sat.id];
    if (pos && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([pos.latitude, pos.longitude], sat.orbitTier === 'LEO' ? 4 : 3, {
        duration: 1.2
      });
    }
  };

  const handleSelectStation = (station) => {
    setSelectedStation(station);
    setAutoCenter(false);
    if (mapInstanceRef.current) {
      const bounds = L.latLngBounds(
        [activePos.latitude, activePos.longitude],
        [station.lat, station.lon]
      );
      mapInstanceRef.current.fitBounds(bounds, { padding: [55, 55], maxZoom: 5, animate: true });
    }
  };

  const handleFlyToStation = (station) => {
    setSelectedStation(station);
    setAutoCenter(false);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([station.lat, station.lon], 5, { duration: 1.1 });
    }
  };

  const toggleLayer = (key) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isLiveIssSelected = selectedSatId === 'iss' && issFix === 'live';

  const plainSentence = t.plainSummary({
    name: activeSat.shortName,
    region: regionName,
    alt: formatAltitudeShort(activePos.altitude),
    speed: Math.round(activePos.velocity || 0).toLocaleString(),
    sunlit: isSunlit,
    isDeepSpace
  });

  // Horizon proximity progress bar (0–100% where 100% = right overhead, threshold at horizon radius)
  const proximityRatio = useMemo(() => {
    if (!visibilityRadiusKm) return 0;
    const maxScaleKm = Math.max(visibilityRadiusKm * 3, 12000);
    return Math.max(4, Math.min(100, Math.round((1 - distanceKm / maxScaleKm) * 100)));
  }, [distanceKm, visibilityRadiusKm]);

  return (
    <div className={`space-y-5 ${className}`}>
      {/* 1. Compact Header + Fleet Selector */}
      <LiquidGlassCard className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-2 rounded-[10px] bg-cyan-500/15 border border-cyan-400/35 text-cyan-300">
                <Radar className="w-5 h-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-display text-white tracking-tight">
                {t.title}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-ink-2 max-w-3xl leading-relaxed font-sans">
              {t.subtitle}
            </p>
          </div>

          {/* Right Status + Refresh + Quick Guide Toggle */}
          <div className="flex items-center flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface/70 px-3 py-2 font-mono text-[11px]">
              <span
                className={`h-2 w-2 rounded-full ${isLiveIssSelected ? 'bg-signal' : 'bg-caution'}`}
              />
              <span
                className={`font-semibold ${isLiveIssSelected ? 'text-signal' : 'text-caution'}`}
              >
                {isLiveIssSelected ? t.liveIss : t.modelOrbit}
              </span>
              <span className="text-ink-3 hidden sm:inline">
                · {t.updatedAt} {formatClock(lastUpdate)}
              </span>
            </div>

            <button
              type="button"
              onClick={updateSatellitePositions}
              aria-label={t.refreshTitle}
              title={t.refreshTitle}
              className="p-2.5 rounded-[10px] bg-surface/70 hover:bg-surface-2 border border-line text-ink-2 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-300' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              aria-expanded={showGuide}
              className={`px-3 py-2 rounded-[10px] border text-xs font-sans font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                showGuide
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                  : 'bg-surface/70 hover:bg-surface-2 border-line text-ink-2 hover:text-white'
              }`}
            >
              <HelpCircle className="w-4 h-4 text-cyan-300" />
              <span>{showGuide ? t.guideHide : t.guideBtn}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Plain-Language 4-Step Map Guide */}
        <AnimatePresence initial={false}>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 pb-1">
                {t.guideSteps.map((step) => (
                  <div
                    key={step.title}
                    className="p-3.5 rounded-[12px] bg-abyss/70 border border-cyan-400/20 space-y-1"
                  >
                    <div className="text-xs font-bold text-cyan-300 font-sans">{step.title}</div>
                    <p className="text-xs text-ink-2 leading-relaxed font-sans">{step.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fleet Selector Cards */}
        <div className="pt-3 border-t border-line/80 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-ink-3">
            <span className="flex items-center gap-1.5">
              <SatelliteIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.selectSatHeading}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {INITIAL_SATELLITES.map((sat) => {
              const isSelected = selectedSatId === sat.id;
              const pos = satPositions[sat.id];

              return (
                <button
                  key={sat.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelectSatellite(sat)}
                  className={`p-3 rounded-[12px] border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-surface-2/95 shadow-lg text-white'
                      : 'bg-abyss/55 hover:bg-surface/80 border-line text-ink-2'
                  }`}
                  style={{
                    borderColor: isSelected ? sat.color : undefined,
                    boxShadow: isSelected ? `0 0 0 1px ${sat.color}55, 0 10px 26px -12px rgba(${sat.glowRgb}, 0.6)` : undefined
                  }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      {renderCraftIcon(sat.iconType, sat.color)}
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: sat.color,
                          boxShadow: isSelected ? `0 0 8px ${sat.color}` : 'none'
                        }}
                      />
                    </div>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold border"
                      style={{
                        borderColor: isSelected ? `${sat.color}66` : 'rgba(148,178,214,0.2)',
                        color: isSelected ? sat.color : undefined
                      }}
                    >
                      {sat.orbitTier}
                    </span>
                  </div>

                  <div>
                    <div className="text-sm font-bold text-white font-display truncate">
                      {sat.shortName}
                    </div>
                    <div className="text-[11px] text-ink-3 truncate font-sans mt-0.5">
                      {sat.shortRole[currentLang] || sat.shortRole.en}
                    </div>
                    <div className="text-[11px] font-mono text-ink-2 mt-1">
                      {pos ? formatAltitudeShort(pos.altitude) : '—'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </LiquidGlassCard>

      {/* 2. Map-First Split Workspace: Interactive World Map + Live Plain-Language Readout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Primary Interactive Map Column (8/12 on xl) */}
        <LiquidGlassCard className="xl:col-span-8 p-0 overflow-hidden" edgeHighlight={true}>
          {/* Dedicated Top Map Control Bar (Never overlaps map markers!) */}
          <div className="px-4 py-3 bg-surface/90 border-b border-line flex flex-wrap items-center justify-between gap-3">
            {/* Active Craft + Region + Day/Night Status */}
            <div className="flex items-center flex-wrap gap-2">
              <div className="flex items-center gap-2 pr-2 border-r border-line">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: activeSat.color, boxShadow: `0 0 8px ${activeSat.color}` }}
                />
                <span className="text-sm font-bold text-white font-display">
                  {activeSat.shortName}
                </span>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-abyss/80 border border-line text-xs text-ink font-sans">
                <MapPin className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <span>
                  <span className="text-ink-3">{t.overPrefix}</span>{' '}
                  <strong className="font-semibold text-white">{regionName}</strong>
                </span>
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border text-xs font-sans font-medium ${
                  isSunlit
                    ? 'bg-amber-400/10 border-amber-400/35 text-amber-300'
                    : 'bg-indigo-500/15 border-indigo-400/35 text-indigo-200'
                }`}
              >
                {isSunlit ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{isSunlit ? t.inSunlight : t.inShadow}</span>
              </span>
            </div>

            {/* Right Controls: Map Style Switcher & Layer Toggles */}
            <div className="flex items-center gap-2 relative">
              <div
                className="inline-flex rounded-[9px] bg-abyss/80 border border-line p-0.5"
                role="group"
                aria-label="Map style"
              >
                <button
                  type="button"
                  aria-pressed={mapStyle === 'dark'}
                  onClick={() => setMapStyle('dark')}
                  className={`px-2.5 py-1 rounded-[7px] text-xs font-sans transition-colors cursor-pointer ${
                    mapStyle === 'dark'
                      ? 'bg-surface-3 text-white font-semibold'
                      : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {t.mapDark}
                </button>
                <button
                  type="button"
                  aria-pressed={mapStyle === 'satellite'}
                  onClick={() => setMapStyle('satellite')}
                  className={`px-2.5 py-1 rounded-[7px] text-xs font-sans transition-colors cursor-pointer ${
                    mapStyle === 'satellite'
                      ? 'bg-surface-3 text-white font-semibold'
                      : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {t.mapSat}
                </button>
              </div>

              <div ref={layersMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowLayersMenu((v) => !v)}
                  aria-label={t.layers}
                  aria-expanded={showLayersMenu}
                  className={`px-2.5 py-1.5 rounded-[9px] border text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showLayersMenu
                      ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                      : 'bg-abyss/80 hover:bg-surface-2 border-line text-ink-2 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-cyan-300" />
                  <span className="hidden sm:inline">{t.layers}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {showLayersMenu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-[12px] bg-surface/95 glass-strong border border-line-strong shadow-2xl p-2 z-30 space-y-1">
                    {[
                      { key: 'orbit', label: t.layerOrbit, color: activeSat.color },
                      { key: 'horizon', label: t.layerHorizon, color: activeSat.color },
                      { key: 'night', label: t.layerNight, color: '#64748b' },
                      { key: 'stationLink', label: t.layerLink, color: '#fbbf24' }
                    ].map((item) => {
                      const active = layers[item.key];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleLayer(item.key)}
                          className="w-full px-2.5 py-2 rounded-[8px] hover:bg-surface-2 flex items-center justify-between gap-2 text-xs font-sans text-left transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2 text-ink">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span>{item.label}</span>
                          </span>
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              active
                                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300'
                                : 'border-line text-transparent'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Leaflet Map Canvas */}
          <div className="relative">
            <div
              ref={mapContainerRef}
              className="w-full h-[440px] sm:h-[520px] xl:h-[560px] bg-[#070b14] z-0"
            />

            {/* Floating Top-Right Quick Map Controls */}
            <div className="absolute top-3.5 right-3.5 z-10 flex flex-col gap-2 items-end">
              <button
                type="button"
                aria-pressed={autoCenter}
                onClick={() => setAutoCenter((v) => !v)}
                className={`px-3 py-2 rounded-[10px] border glass-strong shadow-xl transition-all cursor-pointer flex items-center gap-2 text-xs font-sans font-medium ${
                  autoCenter
                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                    : 'bg-surface/85 border-line text-ink-2 hover:text-white'
                }`}
                title={t.autoFollow}
              >
                <Navigation className={`w-3.5 h-3.5 ${autoCenter ? 'text-cyan-300' : ''}`} />
                <span>{autoCenter ? t.autoFollowOn : t.autoFollow}</span>
              </button>

              <div className="flex flex-col rounded-[10px] overflow-hidden border border-line bg-surface/85 glass-strong shadow-xl">
                <button
                  type="button"
                  onClick={handleRecenter}
                  aria-label={t.recenter}
                  title={t.recenter}
                  className="p-2.5 hover:bg-surface-2 text-ink-2 hover:text-cyan-300 transition-colors cursor-pointer border-b border-line"
                >
                  <Crosshair className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleFitCraftAndStation}
                  aria-label={t.fitBoth}
                  title={t.fitBoth}
                  className="p-2.5 hover:bg-surface-2 text-ink-2 hover:text-amber-300 transition-colors cursor-pointer border-b border-line"
                >
                  <Link2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleWorldOverview}
                  aria-label={t.worldView}
                  title={t.worldView}
                  className="p-2.5 hover:bg-surface-2 text-ink-2 hover:text-white transition-colors cursor-pointer border-b border-line"
                >
                  <Globe2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  aria-label={t.zoomIn}
                  title={t.zoomIn}
                  className="p-2.5 hover:bg-surface-2 text-ink-2 hover:text-white transition-colors cursor-pointer border-b border-line"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  aria-label={t.zoomOut}
                  title={t.zoomOut}
                  className="p-2.5 hover:bg-surface-2 text-ink-2 hover:text-white transition-colors cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Helpful Deep-Space Context Banner for JWST / Chandra */}
            {isDeepSpace && (
              <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-lg z-10 px-3 py-2 rounded-[10px] bg-abyss/90 glass border border-amber-400/35 text-xs text-amber-200 flex items-start gap-2 shadow-xl">
                <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <span className="leading-snug font-sans">{t.deepSpaceNote}</span>
              </div>
            )}
          </div>

          {/* Always-Visible Translated Map Legend Footer */}
          <div className="px-4 py-2.5 bg-abyss/90 border-t border-line flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] font-sans text-ink-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-1 rounded-full" style={{ backgroundColor: activeSat.color }} />
                <span>{t.legendTrail}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-4 border-t-2 border-dashed"
                  style={{ borderColor: activeSat.color }}
                />
                <span>{t.legendOrbit}</span>
              </span>
              {visibilityRadiusMeters && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-full border border-dashed"
                    style={{
                      borderColor: activeSat.color,
                      backgroundColor: `rgba(${activeSat.glowRgb}, 0.18)`
                    }}
                  />
                  <span>{t.legendHorizon}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-amber-400" />
                <span>{t.legendLink}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#0b1326] border border-slate-500/60" />
                <span>{t.legendNight}</span>
              </span>
            </div>

            <span className="text-[10px] font-mono text-ink-3">
              © Esri {mapStyle === 'satellite' ? 'World Imagery' : 'Dark Gray Canvas'}
            </span>
          </div>
        </LiquidGlassCard>

        {/* Right Live Plain-Language Briefing & Telemetry Column (4/12 on xl) */}
        <div className="xl:col-span-4 space-y-4">
          {/* Plain-Language Active Spacecraft Card */}
          <LiquidGlassCard
            className="p-5 space-y-4"
            style={{
              borderTopWidth: '3px',
              borderTopColor: activeSat.color
            }}
          >
            <div className="space-y-1.5">
              <div className="flex items-center flex-wrap gap-2">
                <span
                  className="px-2.5 py-0.5 rounded-[7px] text-[10px] font-mono font-bold uppercase tracking-wider text-slate-950"
                  style={{ backgroundColor: activeSat.color }}
                >
                  {activeSat.type[currentLang] || activeSat.type.en}
                </span>
                <span className="text-[11px] font-mono text-ink-3">
                  {activeSat.operator} · {activeSat.launchDate}
                </span>
              </div>

              <h3 className="text-lg font-bold font-display text-white leading-snug">
                {activeSat.name}
              </h3>
            </div>

            {/* Plain-Language "Right Now" Summary Box */}
            <div className="p-3.5 rounded-[12px] bg-abyss/75 border border-line space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                <span>{t.liveBriefHeading}</span>
              </div>
              <p className="text-xs sm:text-sm text-ink leading-relaxed font-sans">
                {plainSentence}
              </p>
            </div>

            {/* Current Scientific Activity */}
            <p className="text-xs text-ink-2 leading-relaxed font-sans">
              {activeSat.status[currentLang] || activeSat.status.en}
            </p>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalSat(activeSat)}
                className="flex-1 px-3.5 py-2.5 rounded-[10px] bg-surface-2 hover:bg-surface-3 border border-line-strong text-xs font-sans font-semibold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Info className="w-3.5 h-3.5 text-cyan-300" />
                <span>{t.missionDetails}</span>
              </button>

              <button
                type="button"
                onClick={handleRecenter}
                className="px-3.5 py-2.5 rounded-[10px] bg-abyss/80 hover:bg-surface-2 border border-line text-xs font-sans font-medium text-ink-2 hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>{t.centerMap}</span>
              </button>
            </div>
          </LiquidGlassCard>

          {/* 4 Human-Friendly Telemetry Readout Cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* 1. Altitude */}
            <div className="p-4 rounded-[14px] liquid-glass liquid-glass-edge space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-sans text-ink-3">
                <ArrowUpRight className="w-3.5 h-3.5 text-derived shrink-0" />
                <span className="truncate">{t.altLabel}</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold font-display text-white">
                {Math.round(activePos.altitude || 0).toLocaleString()}{' '}
                <span className="text-xs font-normal text-ink-3">km</span>
              </div>
              <div className="text-[11px] text-ink-3 leading-snug font-sans">
                {activeSat.altitudeContext[currentLang] || activeSat.altitudeContext.en}
              </div>
            </div>

            {/* 2. Speed & Orbit Period */}
            <div className="p-4 rounded-[14px] liquid-glass liquid-glass-edge space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-sans text-ink-3">
                <Gauge className="w-3.5 h-3.5 text-signal shrink-0" />
                <span className="truncate">{t.speedLabel}</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold font-display text-white">
                {Math.round(activePos.velocity || 0).toLocaleString()}{' '}
                <span className="text-xs font-normal text-ink-3">km/h</span>
              </div>
              <div className="text-[11px] text-signal/90 font-mono">
                {((activePos.velocity || 0) / 3600).toFixed(2)} km/s
              </div>
              <div className="text-[11px] text-ink-3 leading-snug font-sans">{orbitPeriodText}</div>
            </div>

            {/* 3. Position Over Earth */}
            <div className="p-4 rounded-[14px] liquid-glass liquid-glass-edge space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-sans text-ink-3">
                <Compass className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <span className="truncate">{t.posLabel}</span>
              </div>
              <div className="text-sm sm:text-base font-bold font-display text-white leading-snug">
                {regionName}
              </div>
              <div className="text-[11px] font-mono text-cyan-300/90 leading-relaxed">
                <div>{formatCoordinate(activePos.latitude, 'lat', currentLang)}</div>
                <div>{formatCoordinate(activePos.longitude, 'lon', currentLang)}</div>
              </div>
            </div>

            {/* 4. Sunlight & Orbit Tilt */}
            <div className="p-4 rounded-[14px] liquid-glass liquid-glass-edge space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-sans text-ink-3">
                {isSunlit ? (
                  <Sun className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                )}
                <span className="truncate">{t.lightTiltLabel}</span>
              </div>
              <div className="text-sm sm:text-base font-bold font-display text-white leading-snug">
                {isSunlit ? t.inSunlight : t.inShadow}
              </div>
              <div className="text-[11px] font-mono text-ink-2">
                {t.tiltPrefix}: {activeSat.inclination.toFixed(1)}°
              </div>
              <div className="text-[11px] text-ink-3 leading-snug font-sans">
                {activeSat.crew[currentLang] || activeSat.crew.en}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-ink-3 font-sans px-1 leading-relaxed">
            {t.dataSourceFootnote}
          </p>
        </div>
      </div>

      {/* 3. Ground City Distance & Horizon Check Card */}
      <LiquidGlassCard className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-line">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-[8px] bg-amber-400/15 text-amber-300 border border-amber-400/30">
                <Clock className="w-4 h-4" />
              </div>
              <h3 className="text-base sm:text-lg font-bold font-display text-white">
                {t.stationHeading}
              </h3>
            </div>
            <p className="text-xs text-ink-2 font-sans max-w-2xl">{t.stationSub}</p>
          </div>

          <button
            type="button"
            onClick={handleFitCraftAndStation}
            className="self-start lg:self-center px-3.5 py-2 rounded-[10px] bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-xs font-sans font-semibold text-amber-200 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>{t.showBothBtn}</span>
          </button>
        </div>

        {/* City Selection Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {TARGET_REGIONS.map((station) => {
            const isSelected = selectedStation.id === station.id;
            const cityLabel = station.shortName[currentLang] || station.shortName.en;
            return (
              <button
                key={station.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleSelectStation(station)}
                className={`px-3.5 py-2 rounded-[10px] text-xs font-sans transition-all border cursor-pointer flex items-center gap-2 ${
                  isSelected
                    ? 'bg-amber-400/20 border-amber-300 text-white font-semibold shadow-md'
                    : 'bg-abyss/70 hover:bg-surface-2 border-line text-ink-2 hover:text-white'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-ink-3'}`}
                />
                <span>{cityLabel}</span>
                <span className="text-[10px] font-mono text-ink-3">{station.code}</span>
              </button>
            );
          })}
        </div>

        {/* 3 Clear Distance & Context Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Selected City Info */}
          <div className="p-4 rounded-[14px] bg-abyss/65 border border-line flex flex-col justify-between gap-3">
            <div>
              <div className="text-[11px] font-mono text-ink-3">{t.selectedCityLabel}</div>
              <div className="text-base font-bold text-white font-display mt-1">
                {selectedStation.name[currentLang] || selectedStation.name.en}
              </div>
              <div className="text-xs font-mono text-amber-300/90 mt-1">
                {formatCoordinate(selectedStation.lat, 'lat', currentLang)} ·{' '}
                {formatCoordinate(selectedStation.lon, 'lon', currentLang)}
              </div>
              <div className="text-xs text-ink-3 font-sans mt-0.5">
                {selectedStation.type[currentLang] || selectedStation.type.en}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleFlyToStation(selectedStation)}
              className="self-start px-3 py-1.5 rounded-[8px] bg-surface hover:bg-surface-2 border border-line text-xs font-sans text-ink-2 hover:text-white transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-300" />
              <span>{t.flyCityBtn}</span>
            </button>
          </div>

          {/* Ground Distance & Horizon Proximity Bar */}
          <div className="p-4 rounded-[14px] bg-abyss/65 border border-line space-y-2.5">
            <div className="text-[11px] font-mono text-ink-3">
              {t.distanceLabel} ({activeSat.shortName})
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-display text-cyan-300">
              {distanceKm.toLocaleString()}{' '}
              <span className="text-sm font-normal text-ink-3">km</span>
            </div>

            {visibilityRadiusKm ? (
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden border border-line">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${proximityRatio}%`,
                      backgroundColor: withinHorizon ? '#6ee7b7' : activeSat.color
                    }}
                  />
                </div>
                <div
                  className={`text-xs font-sans font-medium ${
                    withinHorizon ? 'text-signal' : 'text-ink-2'
                  }`}
                >
                  {withinHorizon
                    ? t.horizonInside(visibilityRadiusKm)
                    : t.horizonOutside(visibilityRadiusKm)}
                </div>
              </div>
            ) : (
              <div className="text-xs text-amber-200/90 font-sans">{t.horizonDeepSpace}</div>
            )}

            <div className="text-[11px] text-ink-3 font-sans">{t.distanceHint}</div>
          </div>

          {/* Honest Pass-Time Explanation */}
          <div className="p-4 rounded-[14px] bg-abyss/65 border border-line space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink font-sans">
              <Info className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>{t.passNoticeTitle}</span>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed font-sans">{t.passNotice}</p>
          </div>
        </div>
      </LiquidGlassCard>

      {/* 4. Accessible Mission Details Modal */}
      <AnimatePresence>
        {modalSat && (
          <div
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalSat(null);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-abyss/75 glass"
          >
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sat-modal-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl liquid-glass border border-white/20 p-6 sm:p-7 shadow-2xl space-y-5"
            >
              <button
                type="button"
                aria-label={a11yLabel('close', currentLang)}
                onClick={() => setModalSat(null)}
                className="absolute top-5 right-5 p-2 rounded-[10px] bg-surface/70 hover:bg-surface-2 text-ink-3 hover:text-ink transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-2 pr-10">
                <div className="flex items-center flex-wrap gap-2 font-mono text-xs">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-slate-950 font-bold"
                    style={{ backgroundColor: modalSat.color }}
                  >
                    {modalSat.orbitTier} · NORAD {modalSat.noradId}
                  </span>
                  <span className="text-ink-2">
                    {modalSat.type[currentLang] || modalSat.type.en}
                  </span>
                  <span className="text-ink-3">· {modalSat.operator}</span>
                </div>

                <h3
                  id="sat-modal-title"
                  className="text-xl sm:text-2xl font-bold font-display text-white"
                >
                  {modalSat.name}
                </h3>

                <p className="text-xs sm:text-sm text-cyan-300 font-sans">
                  {modalSat.status[currentLang] || modalSat.status.en}
                </p>
              </div>

              {/* Mission Summary First (Plain Language) */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-ink-3">
                  {t.debrief}
                </h4>
                <p className="text-sm text-ink leading-relaxed font-sans">
                  {modalSat.missionSummary[currentLang] || modalSat.missionSummary.en}
                </p>
              </div>

              {/* Clean Live Facts Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-[10px] bg-surface/70 border border-line">
                  <div className="text-[11px] font-sans text-ink-3">{t.alt}</div>
                  <div className="text-base font-bold text-white font-display mt-0.5">
                    {Math.round(satPositions[modalSat.id]?.altitude || 0).toLocaleString()} km
                  </div>
                </div>
                <div className="p-3 rounded-[10px] bg-surface/70 border border-line">
                  <div className="text-[11px] font-sans text-ink-3">{t.vel}</div>
                  <div className="text-base font-bold text-white font-display mt-0.5">
                    {Math.round(satPositions[modalSat.id]?.velocity || 0).toLocaleString()} km/h
                  </div>
                </div>
                <div className="p-3 rounded-[10px] bg-surface/70 border border-line">
                  <div className="text-[11px] font-sans text-ink-3">{t.launch}</div>
                  <div className="text-base font-bold text-white font-display mt-0.5">
                    {modalSat.launchDate}
                  </div>
                </div>
                <div className="p-3 rounded-[10px] bg-surface/70 border border-line">
                  <div className="text-[11px] font-sans text-ink-3">{t.lat}</div>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">
                    {formatCoordinate(satPositions[modalSat.id]?.latitude, 'lat', currentLang)}
                  </div>
                </div>
                <div className="p-3 rounded-[10px] bg-surface/70 border border-line">
                  <div className="text-[11px] font-sans text-ink-3">{t.lon}</div>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">
                    {formatCoordinate(satPositions[modalSat.id]?.longitude, 'lon', currentLang)}
                  </div>
                </div>
                <div className="p-3 rounded-[10px] bg-surface/70 border border-line">
                  <div className="text-[11px] font-sans text-ink-3">{t.crew}</div>
                  <div className="text-xs font-semibold text-white font-sans mt-1">
                    {modalSat.crew[currentLang] || modalSat.crew.en}
                  </div>
                </div>
              </div>

              {/* Collapsible Technical TLE Data (Hidden by default so casual users aren't overwhelmed) */}
              <details className="rounded-[12px] bg-surface/65 border border-line p-3 group">
                <summary className="text-xs font-mono text-ink-2 cursor-pointer select-none flex items-center justify-between">
                  <span>{t.tleToggle}</span>
                  <ChevronDown className="w-4 h-4 text-ink-3 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2.5 pt-2.5 border-t border-line font-mono text-[10px] overflow-x-auto space-y-1">
                  <div className="text-cyan-300 whitespace-nowrap">{modalSat.tle.line1}</div>
                  <div className="text-indigo-300 whitespace-nowrap">{modalSat.tle.line2}</div>
                </div>
              </details>

              <div className="pt-3 border-t border-line flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectSatellite(modalSat);
                    setModalSat(null);
                  }}
                  className="px-5 py-2.5 rounded-[10px] font-bold text-xs font-sans text-slate-950 transition-opacity hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: modalSat.color }}
                >
                  {t.trackFollow}
                </button>

                <button
                  type="button"
                  onClick={() => setModalSat(null)}
                  className="px-4 py-2.5 rounded-[10px] bg-surface/70 hover:bg-surface-2 border border-line text-xs font-sans text-ink-2 hover:text-white transition-colors cursor-pointer"
                >
                  {t.close}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(ISSTracker);
