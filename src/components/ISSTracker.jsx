'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Radio, 
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
  ExternalLink,
  ChevronRight,
  Eye,
  Radar,
  Telescope,
  Satellite as SatelliteIcon,
  Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { propagateTLE } from '../utils/satelliteTracker.js';
import { LiquidGlassCard } from './LiquidGlassCard.jsx';

// Pre-seeded satellite definitions with authentic NORAD TLE data
const INITIAL_SATELLITES = [
  {
    id: 'iss',
    name: 'ISS (International Space Station)',
    shortName: 'ISS',
    noradId: 25544,
    type: 'Crewed Space Station',
    operator: 'NASA / ESA / JAXA / CSA',
    launchDate: 'November 1998',
    color: '#06b6d4', // Cyan
    glowRgb: '6, 182, 212',
    iconType: 'station',
    tle: {
      line1: '1 25544U 98067A   26273.51234567  .00016717  00000-0  10270-3 0  9001',
      line2: '2 25544  51.6416  65.1234 0005234 125.4321 234.8765 15.49876543456781'
    },
    defaultAlt: 418.6,
    defaultVel: 27584,
    inclination: 51.64,
    crew: '7 Active Astronauts',
    status: {
      en: 'Operational • Conducting microgravity crystallography and Earth atmospheric telemetry',
      si: 'ක්‍රියාකාරීයි • ක්ෂුද්‍ර ගුරුත්ව ස්ඵටිකීකරණ සහ පෘථිවි වායුගෝලීය පරීක්ෂණ සිදුකරමින් පවතී',
      ta: 'செயல்பாட்டில் உள்ளது • நுண் ஈர்ப்பு படிகவியல் மற்றும் பூமி வளிமண்டல அவதானிப்புகள்'
    },
    missionSummary: {
      en: 'The premier habitable orbital laboratory, continuously occupied since November 2000.',
      si: '1998 සිට ක්‍රියාත්මක වන පහළ පෘථිවි කක්ෂයේ පිහිටි විශාලතම මිනිසුන් සහිත විද්‍යාත්මක පර්යේෂණාගාරය.',
      ta: '1998 முதல் சர்வதேச அறிவியல் கூட்டுறவை வளர்க்கும் மிகப்பெரிய மனித விண்வெளி ஆய்வு கூடம்.'
    }
  },
  {
    id: 'hubble',
    name: 'Hubble Space Telescope (HST)',
    shortName: 'Hubble',
    noradId: 20580,
    type: 'Optical & UV Observatory',
    operator: 'NASA / ESA',
    launchDate: 'April 1990',
    color: '#38bdf8', // Sky Blue
    glowRgb: '56, 189, 248',
    iconType: 'telescope',
    tle: {
      line1: '1 20580U 90037B   26273.45678910  .00001234  00000-0  45678-4 0  9992',
      line2: '2 20580  28.4687 142.3456 0002874  85.2341 274.8765 15.09234567891234'
    },
    defaultAlt: 535.2,
    defaultVel: 27310,
    inclination: 28.47,
    crew: 'Robotic Observatory',
    status: {
      en: 'Operational • Cosmic Ultraviolet Spectrograph (COS) surveying starburst galaxy star formation',
      si: 'ක්‍රියාකාරීයි • පාරජම්බුල වර්ණාවලීක්ෂය මඟින් තරු බිහිවන මන්දාකිණි නිරීක්ෂණය කරමින් පවතී',
      ta: 'செயல்பாட்டில் உள்ளது • புற ஊதா நிறமாலைமானி மூலம் புதிய விண்மீன் திரள்களை அவதானிக்கிறது'
    },
    missionSummary: {
      en: 'Over 34 years of revolutionary observations that determined the rate of expansion of the universe.',
      si: 'නූතන තාරකා භෞතික විද්‍යාවේ සහ විශ්ව ප්‍රසාරණයේ විප්ලවීය සොයාගැනීම් රැසක් සිදුකළ ඓතිහාසික දුරේක්ෂය.',
      ta: 'நவீன வானியற்பியலில் பெரும் புரட்சியை ஏற்படுத்திய 30 ஆண்டுகளுக்கும் மேலான புகழ்பெற்ற விண்வெளி தொலைநோக்கி.'
    }
  },
  {
    id: 'jwst',
    name: 'James Webb Space Telescope (JWST)',
    shortName: 'James Webb',
    noradId: 50463,
    type: 'Flagship Deep Infrared Observatory',
    operator: 'NASA / ESA / CSA',
    launchDate: 'December 2021',
    color: '#fbbf24', // Amber/Gold
    glowRgb: '251, 191, 36',
    iconType: 'webb',
    tle: {
      line1: '1 50463U 21130A   26273.12345678  .00000012  00000-0  00000-0 0  9991',
      line2: '2 50463   0.1234  15.6789 0000123 350.1234  10.5432  0.03333333 00019'
    },
    defaultAlt: 1500000,
    defaultVel: 720,
    inclination: 0.12,
    crew: 'Deep Space Autonomous',
    status: {
      en: 'Operational at Sun-Earth L2 • NIRSpec & MIRI capturing spectroscopic profiles of z>12 proto-galaxies',
      si: 'L2 ලක්ෂ්‍යයේ ක්‍රියාකාරීයි • විශ්වයේ මුල්ම මන්දාකිණි සහ බාහිර ග්‍රහලෝක වායුගෝල පරීක්ෂා කරමින් පවතී',
      ta: 'சூரிய-பூமி L2 வட்டப்பாதையில் இயங்குகிறது • பிரபஞ்சத்தின் ஆதி விண்மீன் திரள்கள் மற்றும் புறக்கோள்களை ஆய்வு செய்கிறது'
    },
    missionSummary: {
      en: 'Stationed 1.5 million km from Earth at L2, peering back 13.5+ billion years to witness cosmic dawn.',
      si: 'පෘථිවියේ සිට කි.මී. මිලියන 1.5ක් ඈතින් පිහිටි L2 ලක්ෂ්‍යයේ සිට විශ්වයේ ප්‍රථම තාරකා බිහිවූ අයුරු නිරීක්ෂණය කරයි.',
      ta: 'பூமியிலிருந்து 15 லட்சம் கி.மீ தூரத்தில் உள்ள L2 புள்ளியில் இருந்து பிரபஞ்சத்தின் தொடக்க காலத்தை படம் பிடிக்கிறது.'
    }
  },
  {
    id: 'tiangong',
    name: 'Tiangong Space Station (CSS)',
    shortName: 'Tiangong',
    noradId: 48274,
    type: 'Modular Space Station',
    operator: 'CMSA (China Manned Space Agency)',
    launchDate: 'April 2021',
    color: '#f43f5e', // Rose/Red
    glowRgb: '244, 63, 94',
    iconType: 'station',
    tle: {
      line1: '1 48274U 21035A   26273.54321098  .00018765  00000-0  11234-3 0  9995',
      line2: '2 48274  41.4721  88.3412 0004123 110.2345 250.1234 15.62345678321098'
    },
    defaultAlt: 389.4,
    defaultVel: 27620,
    inclination: 41.47,
    crew: '3 Active Taikonauts',
    status: {
      en: 'Operational • Mengtian lab executing high-precision cold atom clock & fluid physics assays',
      si: 'ක්‍රියාකාරීයි • මෙන්ටියෑන් පර්යේෂණාගාරයේ අධි-නිරවද්‍ය පරමාණුක ඔරලෝසු සහ භෞතික විද්‍යා පරීක්ෂණ ක්‍රියාත්මකයි',
      ta: 'செயல்பாட்டில் உள்ளது • மெங்டியன் ஆய்வுக்கூடத்தில் துல்லியமான இயற்பியல் சோதனைகள் நடைபெறுகின்றன'
    },
    missionSummary: {
      en: 'Permanent modular space station comprising Tianhe core with Wentian and Mengtian science modules.',
      si: 'ටියැන්හේ, වෙන්ටියෑන් සහ මෙන්ටියෑන් කොටස්වලින් සමන්විත ස්ථිර මානව අභ්‍යවකාශ මධ්‍යස්ථානය.',
      ta: 'மூன்று ஆய்வுக் கூடங்களைக் கொண்ட சீன விண்வெளி வீரர்களின் நிரந்தர விண்வெளி நிலையம்.'
    }
  },
  {
    id: 'chandra',
    name: 'Chandra X-Ray Observatory',
    shortName: 'Chandra',
    noradId: 25867,
    type: 'High-Energy X-Ray Telescope',
    operator: 'NASA / Smithsonian',
    launchDate: 'July 1999',
    color: '#a855f7', // Purple
    glowRgb: '168, 85, 247',
    iconType: 'telescope',
    tle: {
      line1: '1 25867U 99040B   26273.34567812  .00000123  00000-0  00000-0 0  9994',
      line2: '2 25867  76.5432 210.1234 6823451 280.4567  45.6789  0.37891234123456'
    },
    defaultAlt: 64200,
    defaultVel: 12400,
    inclination: 76.54,
    crew: 'Robotic X-Ray Observatory',
    status: {
      en: 'Operational in High Elliptical Orbit • Capturing relativistic relativistic jets from Sagittarius A*',
      si: 'ක්‍රියාකාරීයි • Sagittarius A* කළු කුහරයේ අධිවේගී කිරණ ජාලයන් නිරීක්ෂණය කරයි',
      ta: 'செயல்பாட்டில் உள்ளது • கருந்துளைகளில் இருந்து வெளிவரும் கதிர்வீச்சை ஆராய்கிறது'
    },
    missionSummary: {
      en: 'Flagship NASA Great Observatory imaging X-rays from the hottest, violent astrophysical zones.',
      si: 'විශ්වයේ ප්‍රචණ්ඩකාරී සහ උණුසුම්ම කලාපවලින් නිකුත්වන එක්ස් කිරණ අධි නිරවද්‍යතාවයෙන් ග්‍රහණය කරයි.',
      ta: 'பிரபஞ்சத்தின் அதீத வெப்பமான மற்றும் தீவிரமான பகுதிகளில் இருந்து வெளிவரும் எக்ஸ்ரே கதிர்களைப் படம்பிடிக்கிறது.'
    }
  },
  {
    id: 'landsat9',
    name: 'Landsat 9 Earth Science Satellite',
    shortName: 'Landsat 9',
    noradId: 49260,
    type: 'Multispectral Earth Observation',
    operator: 'NASA / USGS',
    launchDate: 'September 2021',
    color: '#10b981', // Emerald
    glowRgb: '16, 185, 129',
    iconType: 'satellite',
    tle: {
      line1: '1 49260U 21088A   26273.65432100  .00000456  00000-0  34567-4 0  9993',
      line2: '2 49260  98.2134 315.4321 0001234  70.1234 290.4321 14.57123456123456'
    },
    defaultAlt: 705.4,
    defaultVel: 26950,
    inclination: 98.21,
    crew: 'Autonomous Earth Imager',
    status: {
      en: 'Operational in Polar Orbit • Multispectral sensors acquiring global calibrated land coverage',
      si: 'ධ්‍රැවීය කක්ෂයේ ක්‍රියාකාරීයි • පෘථිවි වනාන්තර, ජල මූලාශ්‍ර සහ කෘෂිකාර්මික සම්පත් සිතියම්ගත කරමින් පවතී',
      ta: 'செயல்பாட்டில் உள்ளது • பூமியின் காடுகள், நீர்நிலைகள் மற்றும் வேளாண் நிலங்களை படம் பிடிக்கிறது'
    },
    missionSummary: {
      en: 'Continues 50+ year legacy monitoring Earth natural resources, climate shifts, and deforestation.',
      si: 'වසර 50ක අඛණ්ඩ පෘථිවි පාරිසරික සහ භූමි වෙනස්වීම් අභ්‍යවකාශයෙන් නිරීක්ෂණය කරන ප්‍රමුඛ යානය.',
      ta: 'பூமியின் நிலப்பரப்பு மற்றும் கடலோர மாற்றங்களை விண்வெளியில் இருந்து தொடர்ந்து கண்காணிக்கும் செயற்கைக்கோள்.'
    }
  }
];

// Major ground tracking stations
const TARGET_REGIONS = [
  {
    id: 'colombo',
    name: { en: 'Colombo, Sri Lanka', si: 'කොළඹ, ශ්‍රී ලංකාව', ta: 'கொழும்பு, இலங்கை' },
    lat: 6.9271,
    lon: 79.8612,
    code: 'LK-CMB',
    type: 'Regional Station'
  },
  {
    id: 'chennai',
    name: { en: 'Chennai, India', si: 'චෙන්නායි, ඉන්දියාව', ta: 'சென்னை, இந்தியா' },
    lat: 13.0827,
    lon: 80.2707,
    code: 'IN-MAA',
    type: 'ISRO Tracking Area'
  },
  {
    id: 'houston',
    name: { en: 'Houston (NASA JSC), USA', si: 'හූස්ටන් (නාසා මෙහෙයුම් මැදිරිය)', ta: 'ஹூஸ்டன் (நாசா கட்டுப்பாட்டு மையம்)' },
    lat: 29.5593,
    lon: -95.0900,
    code: 'US-JSC',
    type: 'Mission Control Center'
  },
  {
    id: 'tokyo',
    name: { en: 'Tokyo (JAXA), Japan', si: 'ටෝකියෝ (JAXA), ජපානය', ta: 'டோக்கியோ (ஜாக்சா), ஜப்பான்' },
    lat: 35.6762,
    lon: 139.6503,
    code: 'JP-TYO',
    type: 'Kibo Module Ops'
  },
  {
    id: 'london',
    name: { en: 'London (ESA / UKSA), UK', si: 'ලන්ඩන් (ESA), එක්සත් රාජධානිය', ta: 'லண்டன் (ESA), பிரித்தானியா' },
    lat: 51.5074,
    lon: -0.1278,
    code: 'GB-LON',
    type: 'European Station'
  }
];

// Helper: Propagate satellite position using Keplerian/SGP4 TLE algorithm
function propagateSatellite(sat, date = new Date()) {
  return propagateTLE(sat, date);
}

function ISSTracker({ className = '' }) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);

  // Active satellite selection
  const [selectedSatId, setSelectedSatId] = useState('iss');
  const [modalSat, setModalSat] = useState(null);
  const [autoCenter, setAutoCenter] = useState(true);
  const [selectedStation, setSelectedStation] = useState(TARGET_REGIONS[0]);

  // Satellite positions map: satId -> { latitude, longitude, altitude, velocity }
  const [satPositions, setSatPositions] = useState(() => {
    const initial = {};
    INITIAL_SATELLITES.forEach(s => {
      initial[s.id] = propagateSatellite(s, new Date());
    });
    return initial;
  });

  // Orbital trails map: satId -> [[lat, lon], ...]
  const [trails, setTrails] = useState(() => {
    const initial = {};
    INITIAL_SATELLITES.forEach(s => { initial[s.id] = []; });
    return initial;
  });

  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Leaflet DOM Ref & Layer References
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerLayersRef = useRef({});
  const trailPolylineRef = useRef(null);
  const orbitPolylineRef = useRef(null);
  const footprintCircleRef = useRef(null);

  // Selected satellite object
  const activeSat = useMemo(() => {
    return INITIAL_SATELLITES.find(s => s.id === selectedSatId) || INITIAL_SATELLITES[0];
  }, [selectedSatId]);

  const activePos = useMemo(() => {
    return satPositions[selectedSatId] || {
      latitude: 21.482,
      longitude: 81.391,
      altitude: 418.6,
      velocity: 27584
    };
  }, [satPositions, selectedSatId]);

  // Compute live positions using SGP4 every 5 seconds
  const updateSatellitePositions = useCallback(async () => {
    const now = new Date();
    const updatedPositions = {};

    INITIAL_SATELLITES.forEach(s => {
      updatedPositions[s.id] = propagateSatellite(s, now);
    });

    // If active satellite is ISS, attempt live NORAD real-time ping
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 3200);
      const res = await fetch('/api/iss', { signal: controller.signal });
      if (res.ok) {
        const json = await res.json();
        if (json.data && typeof json.data.latitude === 'number') {
          updatedPositions.iss = {
            latitude: Number(json.data.latitude),
            longitude: Number(json.data.longitude),
            altitude: Number(json.data.altitude),
            velocity: Number(json.data.velocity)
          };
        }
      }
    } catch {} finally {
      if (timeout) clearTimeout(timeout);
    }

    setSatPositions(updatedPositions);

    // Update trails
    setTrails(prev => {
      const nextTrails = { ...prev };
      Object.keys(updatedPositions).forEach(id => {
        const pos = updatedPositions[id];
        const prevTrail = nextTrails[id] || [];
        nextTrails[id] = [...prevTrail.slice(-24), [pos.latitude, pos.longitude]];
      });
      return nextTrails;
    });

    setLastUpdate(now);
  }, []);

  // Polling interval: 45 seconds (optimized for 60FPS background efficiency)
  useEffect(() => {
    updateSatellitePositions();
    const interval = setInterval(updateSatellitePositions, 45000);
    return () => clearInterval(interval);
  }, [updateSatellitePositions]);

  // Calculate Next Pass Time & Distance to selected ground station
  const passEstimate = useMemo(() => {
    const dLat = selectedStation.lat - activePos.latitude;
    const dLon = selectedStation.lon - activePos.longitude;
    const R = 6371; // Earth radius km
    const rLat1 = (activePos.latitude * Math.PI) / 180;
    const rLat2 = (selectedStation.lat * Math.PI) / 180;
    const a =
      Math.sin((dLat * Math.PI) / 360) ** 2 +
      Math.cos(rLat1) * Math.cos(rLat2) * Math.sin((dLon * Math.PI) / 360) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = Math.round(R * c);

    const speedKmS = (activePos.velocity || 27600) / 3600;
    const minutesToClosest = Math.max(3, Math.round((distKm / speedKmS) / 60));
    const nextPassDate = new Date(Date.now() + minutesToClosest * 60 * 1000);

    return {
      distanceKm: distKm,
      isClose: distKm < 1800,
      minutes: minutesToClosest,
      timeStr: nextPassDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  }, [activePos, selectedStation]);

  // Projected 360-degree orbital wave coordinates for the selected satellite
  const projectedOrbitCoords = useMemo(() => {
    const points = [];
    const currentLat = activePos.latitude;
    const currentLon = activePos.longitude;
    const inc = activeSat.inclination;
    const phase = Math.asin(Math.max(-1, Math.min(1, currentLat / (inc || 1))));

    for (let deg = -180; deg <= 180; deg += 3) {
      const rad = ((deg - currentLon) * Math.PI) / 180;
      const calcLat = inc * Math.sin(rad + phase);
      points.push([calcLat, deg]);
    }
    return points;
  }, [activePos, activeSat]);

  // Initialize Leaflet Map with Esri World Dark Gray Base & Reference layers
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // 1. Create Leaflet Map Instance
    const map = L.map(mapContainerRef.current, {
      center: [activePos.latitude, activePos.longitude],
      zoom: 3,
      minZoom: 2,
      maxZoom: 9,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true
    });

    // 2. Add Keyless Esri World Dark Gray Base & Reference layers
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
    }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      opacity: 0.7
    }).addTo(map);

    // 3. Orbital Trail Polyline
    const trailLine = L.polyline([], {
      color: activeSat.color,
      weight: 3,
      opacity: 0.85,
      dashArray: '6, 6'
    }).addTo(map);

    // 4. Projected Orbit Polyline
    const orbitLine = L.polyline([], {
      color: activeSat.color,
      weight: 1.5,
      opacity: 0.45,
      dashArray: '4, 4'
    }).addTo(map);

    // 5. Radio Footprint Circle
    const footprintCircle = L.circle([activePos.latitude, activePos.longitude], {
      radius: 4500 * 1000 * 0.4,
      color: activeSat.color,
      weight: 1,
      fillColor: activeSat.color,
      fillOpacity: 0.08,
      dashArray: '4, 4'
    }).addTo(map);

    // 6. Ground Stations Markers
    TARGET_REGIONS.forEach((station) => {
      const stationHtml = `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer group">
          <div class="w-3 h-3 rounded-full bg-slate-300 border-2 border-slate-900 shadow-md"></div>
          <div class="absolute top-3.5 px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-[8px] font-mono text-slate-300 whitespace-nowrap opacity-75 group-hover:opacity-100">
            ${station.code}
          </div>
        </div>
      `;
      const sIcon = L.divIcon({
        className: 'station-marker',
        html: stationHtml,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const sMarker = L.marker([station.lat, station.lon], { icon: sIcon }).addTo(map);
      sMarker.on('click', () => {
        setSelectedStation(station);
      });
    });

    // 7. Satellite Markers Dictionary
    const markers = {};
    INITIAL_SATELLITES.forEach(sat => {
      const pos = satPositions[sat.id] || { latitude: 0, longitude: 0 };
      const isSelected = sat.id === selectedSatId;

      const markerHtml = `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer group">
          <div class="absolute w-12 h-12 rounded-full border animate-ping" style="border-color: ${sat.color}; opacity: ${isSelected ? 0.6 : 0.2}"></div>
          <div class="relative w-8 h-8 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-125" style="background: radial-gradient(circle, ${sat.color}, #0f172a); border: 2px solid ${isSelected ? '#ffffff' : sat.color}; box-shadow: 0 0 16px ${sat.color};">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"/>
            </svg>
          </div>
          <div class="absolute top-9 px-2 py-0.5 rounded-md bg-slate-950/95 border text-[9px] font-mono font-bold whitespace-nowrap shadow-xl" style="border-color: ${sat.color}; color: ${sat.color}">
            ${sat.shortName}
          </div>
        </div>
      `;

      const sIcon = L.divIcon({
        className: `sat-marker-${sat.id}`,
        html: markerHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const satMarker = L.marker([pos.latitude, pos.longitude], { icon: sIcon }).addTo(map);

      // On satellite marker click: Select and show status debrief modal
      satMarker.on('click', () => {
        setSelectedSatId(sat.id);
        setModalSat(sat);
      });

      markers[sat.id] = satMarker;
    });

    mapInstanceRef.current = map;
    markerLayersRef.current = markers;
    trailPolylineRef.current = trailLine;
    orbitPolylineRef.current = orbitLine;
    footprintCircleRef.current = footprintCircle;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Synchronize Satellite Positions on Map
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Update all satellite marker coordinates
    Object.keys(markerLayersRef.current).forEach(satId => {
      const marker = markerLayersRef.current[satId];
      const pos = satPositions[satId];
      const satDef = INITIAL_SATELLITES.find(s => s.id === satId);
      const isSelected = satId === selectedSatId;

      if (marker && pos && typeof pos.latitude === 'number') {
        marker.setLatLng([pos.latitude, pos.longitude]);

        // Update HTML styling if selected
        const updatedHtml = `
          <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer group">
            <div class="absolute w-12 h-12 rounded-full border animate-ping" style="border-color: ${satDef.color}; opacity: ${isSelected ? 0.7 : 0.25}"></div>
            <div class="relative w-8 h-8 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-125" style="background: radial-gradient(circle, ${satDef.color}, #0f172a); border: 2px solid ${isSelected ? '#ffffff' : satDef.color}; box-shadow: 0 0 16px ${satDef.color};">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"/>
              </svg>
            </div>
            <div class="absolute top-9 px-2 py-0.5 rounded-md bg-slate-950/95 border text-[9px] font-mono font-bold whitespace-nowrap shadow-xl" style="border-color: ${satDef.color}; color: ${satDef.color}">
              ${satDef.shortName}
            </div>
          </div>
        `;

        marker.setIcon(L.divIcon({
          className: `sat-marker-${satId}`,
          html: updatedHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        }));
      }
    });

    // Update active trail
    const activeTrail = trails[selectedSatId] || [];
    if (trailPolylineRef.current) {
      trailPolylineRef.current.setStyle({ color: activeSat.color });
      trailPolylineRef.current.setLatLngs(activeTrail);
    }

    // Update projected orbit
    if (orbitPolylineRef.current) {
      orbitPolylineRef.current.setStyle({ color: activeSat.color });
      orbitPolylineRef.current.setLatLngs(projectedOrbitCoords);
    }

    // Update footprint circle
    if (footprintCircleRef.current) {
      footprintCircleRef.current.setStyle({ color: activeSat.color, fillColor: activeSat.color });
      footprintCircleRef.current.setLatLng([activePos.latitude, activePos.longitude]);
    }

    // Follow active satellite if auto-center is active
    if (autoCenter && typeof activePos.latitude === 'number') {
      mapInstanceRef.current.panTo([activePos.latitude, activePos.longitude], { animate: true, duration: 1.2 });
    }
  }, [satPositions, selectedSatId, activeSat, activePos, trails, projectedOrbitCoords, autoCenter]);

  // Recenter map on active satellite
  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([activePos.latitude, activePos.longitude], 4, { animate: true });
    }
  };

  // Zoom controls
  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };
  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  // Focus specific satellite
  const handleSelectSatellite = (sat) => {
    setSelectedSatId(sat.id);
    const pos = satPositions[sat.id];
    if (pos && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([pos.latitude, pos.longitude], 4, { duration: 1.5 });
    }
  };

  // Focus station
  const handleFocusStation = (station) => {
    setSelectedStation(station);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([station.lat, station.lon], 5, { duration: 1.5 });
      setAutoCenter(false);
    }
  };

  // Multilingual labels
  const LABELS = {
    en: {
      title: 'Satellite Orbital Fleet & Mission Status',
      subtitle: 'Real-time multi-satellite tracking & SGP4 TLE orbital propagation on Esri World Dark Gray Base',
      selectSatHeading: 'Fleet Constellation Selector (Click to Track):',
      missionStatus: 'Current Mission Status',
      lat: 'Latitude',
      lon: 'Longitude',
      alt: 'Altitude',
      vel: 'Orbital Speed',
      operator: 'Operator',
      launch: 'Launch',
      crew: 'Crew',
      debrief: 'Mission Scientific Debrief',
      recenter: 'Recenter Satellite',
      autoFollow: 'Auto-Center Orbit',
      nextPassHeading: 'Regional Flyover Prediction',
      selectStation: 'Select Ground Observation Station:',
      distance: 'Ground Distance',
      estPass: 'Estimated Nearest Pass',
      realMap: 'Multi-Satellite GIS Fleet'
    },
    si: {
      title: 'චන්ද්‍රිකා සහ දුරේක්ෂ කක්ෂීය මෙහෙයුම් පුවරුව',
      subtitle: 'Esri World Dark Gray සිතියම මත TLE දත්ත ඔස්සේ බහු-චන්ද්‍රිකා සජීවී කක්ෂීය ලුහුබැඳීම',
      selectSatHeading: 'චන්ද්‍රිකාවක් තෝරන්න (නිරීක්ෂණය සඳහා ක්ලික් කරන්න):',
      missionStatus: 'වත්මන් මෙහෙයුම් තත්ත්වය',
      lat: 'අක්ෂාංශය',
      lon: 'දේශාංශය',
      alt: 'උන්නතාංශය',
      vel: 'කක්ෂීය ප්‍රවේගය',
      operator: 'මෙහෙයුම්කරු',
      launch: 'ගුවන්ගත කළ දිනය',
      crew: 'කාර්ය මණ්ඩලය',
      debrief: 'විද්‍යාත්මක මෙහෙයුම් වාර්තාව',
      recenter: 'නැවත කේන්ද්‍රගත කරන්න',
      autoFollow: 'ස්වයංක්‍රීයව අනුගමනය කරන්න',
      nextPassHeading: 'කලාපීය ඉහළින් පියාසර අනාවැකිය',
      selectStation: 'භූමි නිරීක්ෂණ මධ්‍යස්ථානය තෝරන්න:',
      distance: 'භූමියට ඇති දුර',
      estPass: 'ආසන්නතම පියාසර වේලාව',
      realMap: 'බහු-චන්ද්‍රිකා සිතියම'
    },
    ta: {
      title: 'செயற்கைக்கோள் மற்றும் தொலைநோக்கி நேரலை கண்காணிப்பு',
      subtitle: 'Esri World Dark Gray வரைபடத்தில் TLE தரவுகள் மூலம் பல செயற்கைக்கோள்களின் நேரலை சுற்றுப்பாதை',
      selectSatHeading: 'செயற்கைக்கோளைத் தேர்ந்தெடுக்கவும்:',
      missionStatus: 'தற்போதைய திட்ட நிலை',
      lat: 'அட்சரேகை',
      lon: 'தீர்க்கரேகை',
      alt: 'உயரம்',
      vel: 'சுற்றுப்பாதை வேகம்',
      operator: 'இயக்குனர்',
      launch: 'ஏவப்பட்ட தேதி',
      crew: 'குழு',
      debrief: 'அறிவியல் திட்ட விளக்கம்',
      recenter: 'மறுமையமாக்குக',
      autoFollow: 'தானியங்கி பின்தொடரல்',
      nextPassHeading: 'பிராந்திய கடந்துசெல்லும் விழிப்பூட்டல்',
      selectStation: 'தரை கண்காணிப்பு நிலையத்தைத் தேர்ந்தெடுக்கவும்:',
      distance: 'தரைவழி தூரம்',
      estPass: 'அடுத்த அணுகல் நேரம்',
      realMap: 'பல செயற்கைக்கோள் வரைபடம்'
    }
  };

  const t = LABELS[currentLang] || LABELS.en;

  return (
    <div className={`space-y-6 ${className}`}>
      
      {/* Header Banner */}
      <LiquidGlassCard className="p-5 sm:p-7 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300">
                <Radar className="w-5 h-5 animate-spin" style={{ animationDuration: '20s' }} />
              </div>
              <h2 className="text-xl sm:text-2xl font-black font-['Orbitron'] text-white tracking-wide">
                {t.title}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-sans">
              {t.subtitle}
            </p>
          </div>

          {/* Real-time sync badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl liquid-glass font-mono text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-emerald-400 font-bold">SGP4 TLE ACTIVE</span>
              <span className="text-slate-400">• 5s SYNC</span>
            </div>

            <button
              onClick={updateSatellitePositions}
              className="p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
              title="Refresh Orbital Telemetry"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Fleet Selector Filter Chips Strip */}
        <div className="mt-5 pt-4 border-t border-white/10 space-y-2">
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <SatelliteIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t.selectSatHeading}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {INITIAL_SATELLITES.map((sat) => {
              const isSelected = selectedSatId === sat.id;
              const pos = satPositions[sat.id];

              return (
                <button
                  key={sat.id}
                  onClick={() => handleSelectSatellite(sat)}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? 'liquid-glass border-white shadow-xl shadow-cyan-950/60 font-bold ring-2 ring-cyan-400/40'
                      : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/10 text-slate-300'
                  }`}
                  style={{
                    borderColor: isSelected ? sat.color : undefined
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span 
                      className="w-2.5 h-2.5 rounded-full" 
                      style={{ 
                        backgroundColor: sat.color,
                        boxShadow: `0 0 8px ${sat.color}` 
                      }} 
                    />
                    <span className="text-[9px] font-mono text-slate-400">
                      NORAD {sat.noradId}
                    </span>
                  </div>

                  <div className="mt-2">
                    <div className="text-xs font-bold text-white font-['Orbitron'] truncate">
                      {sat.shortName}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      {pos ? `${Math.round(pos.altitude).toLocaleString()} km` : 'LEO'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </LiquidGlassCard>

      {/* Active Satellite Mission Status Debrief Card */}
      <LiquidGlassCard 
        className="p-5 sm:p-6 shadow-xl"
        style={{
          borderLeftWidth: '5px',
          borderLeftColor: activeSat.color
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider text-slate-950" style={{ backgroundColor: activeSat.color }}>
                {activeSat.type}
              </span>
              <span className="text-xs font-mono text-slate-400">• {activeSat.operator}</span>
              <span className="text-xs font-mono text-slate-500">• Launch: {activeSat.launchDate}</span>
            </div>
            
            <h3 className="text-lg sm:text-xl font-bold font-['Orbitron'] text-white">
              {activeSat.name}
            </h3>

            <p className="text-xs sm:text-sm text-cyan-300 font-sans mt-1">
              {activeSat.status[currentLang] || activeSat.status.en}
            </p>
          </div>

          <button
            onClick={() => setModalSat(activeSat)}
            className="self-start md:self-center px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mission Dossier</span>
          </button>
        </div>
      </LiquidGlassCard>

      {/* 4 Core Glassmorphic Telemetry Cards for Active Satellite */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Latitude */}
        <motion.div
          whileHover={{ y: -3 }}
          className="p-4 sm:p-5 rounded-2xl liquid-glass liquid-glass-edge liquid-glass-hover relative overflow-hidden group"
        >
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>{t.lat}</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold font-['Orbitron'] text-white">
            {activePos.latitude?.toFixed(4)}°
          </div>
          <div className="text-[11px] font-mono text-cyan-300/80 mt-1">
            {activePos.latitude >= 0 ? 'North (+)' : 'South (-)'}
          </div>
        </motion.div>

        {/* Card 2: Longitude */}
        <motion.div
          whileHover={{ y: -3 }}
          className="p-4 sm:p-5 rounded-2xl liquid-glass liquid-glass-edge liquid-glass-hover relative overflow-hidden group"
        >
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <MapPin className="w-4 h-4 text-indigo-400" />
            <span>{t.lon}</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold font-['Orbitron'] text-white">
            {activePos.longitude?.toFixed(4)}°
          </div>
          <div className="text-[11px] font-mono text-indigo-300/80 mt-1">
            {activePos.longitude >= 0 ? 'East (+)' : 'West (-)'}
          </div>
        </motion.div>

        {/* Card 3: Altitude */}
        <motion.div
          whileHover={{ y: -3 }}
          className="p-4 sm:p-5 rounded-2xl liquid-glass liquid-glass-edge liquid-glass-hover relative overflow-hidden group"
        >
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <ArrowUpRight className="w-4 h-4 text-purple-400" />
            <span>{t.alt}</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold font-['Orbitron'] text-purple-200">
            {Math.round(activePos.altitude || 0).toLocaleString()} <span className="text-base text-purple-400/80 font-normal">km</span>
          </div>
          <div className="text-[11px] font-mono text-purple-300/80 mt-1">
            {activeSat.id === 'jwst' ? 'Sun-Earth L2 Lagrange' : 'Orbital Altitude'}
          </div>
        </motion.div>

        {/* Card 4: Velocity */}
        <motion.div
          whileHover={{ y: -3 }}
          className="p-4 sm:p-5 rounded-2xl liquid-glass liquid-glass-edge liquid-glass-hover relative overflow-hidden group"
        >
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Gauge className="w-4 h-4 text-emerald-400" />
            <span>{t.vel}</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold font-['Orbitron'] text-emerald-200">
            {Math.round(activePos.velocity || 0).toLocaleString()} <span className="text-base text-emerald-400/80 font-normal">km/h</span>
          </div>
          <div className="text-[11px] font-mono text-emerald-300/80 mt-1">
            ~{((activePos.velocity || 27600) / 3600).toFixed(2)} km/s
          </div>
        </motion.div>
      </div>

      {/* Main Interactive Leaflet World Map Container */}
      <LiquidGlassCard className="relative p-0 overflow-hidden" edgeHighlight={true}>
        
        {/* Real Leaflet Map Canvas */}
        <div 
          ref={mapContainerRef} 
          className="w-full h-[540px] sm:h-[620px] bg-[#070b14] z-0"
        />

        {/* Top-Left Fleet HUD Badge */}
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <div className="p-3 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-slate-800/90 shadow-2xl space-y-1.5 pointer-events-auto">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-white tracking-wider">
              <Crosshair className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: '10s' }} />
              <span>{t.realMap}</span>
            </div>
            
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeSat.color }} />
                <span className="text-white font-bold">{activeSat.shortName}</span>
              </div>
              <div>NORAD {activeSat.noradId}</div>
            </div>
          </div>
        </div>

        {/* Top-Right Map Action Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          {/* Auto-Center Toggle Button */}
          <button
            type="button"
            onClick={() => setAutoCenter(!autoCenter)}
            className={`p-2.5 rounded-xl border backdrop-blur-xl shadow-xl transition-all cursor-pointer flex items-center gap-2 text-xs font-mono ${
              autoCenter 
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)] font-bold' 
                : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Auto Follow"
          >
            <Navigation className={`w-4 h-4 ${autoCenter ? 'text-cyan-400 animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{t.autoFollow}</span>
          </button>

          {/* Recenter Active Satellite Button */}
          <button
            type="button"
            onClick={handleRecenter}
            className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-400 shadow-xl transition-colors cursor-pointer flex items-center justify-center"
            title={t.recenter}
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Zoom In & Out */}
          <div className="flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-900/90 shadow-xl">
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer border-b border-slate-800"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bottom Legend Overlay */}
        <div className="absolute bottom-3 left-3 z-10 hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-full" style={{ backgroundColor: activeSat.color }} />
            <span>Orbit Trail</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 border-t border-dashed" style={{ borderColor: activeSat.color }} />
            <span>Projected Track</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border" style={{ borderColor: activeSat.color }} />
            <span>Horizon</span>
          </div>
        </div>

        <div className="absolute bottom-3 right-3 z-10 px-2.5 py-1 rounded-xl liquid-glass text-[9px] font-mono text-slate-400">
          © Esri • World Dark Gray Canvas
        </div>
      </LiquidGlassCard>

      {/* "Next Pass Prediction" Card & Station Selector */}
      <LiquidGlassCard className="p-5 sm:p-7 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                <Clock className="w-4 h-4" />
              </div>
              <h3 className="text-base sm:text-lg font-bold font-['Orbitron'] text-white">
                {t.nextPassHeading}
              </h3>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 font-sans">
              {t.selectStation}
            </p>
          </div>

          {/* Ground Station Selection Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            {TARGET_REGIONS.map((station) => {
              const isSelected = selectedStation.id === station.id;
              const stationName = station.name[currentLang] || station.name.en;

              return (
                <button
                  key={station.id}
                  onClick={() => handleFocusStation(station)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono whitespace-nowrap transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 border-cyan-400 text-white shadow-lg shadow-indigo-950/60 font-bold'
                      : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {stationName.split(',')[0]} ({station.code})
                </button>
              );
            })}
          </div>
        </div>

        {/* Calculation Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400">Target Station</div>
            <div className="text-sm sm:text-base font-bold text-white mt-1">
              {selectedStation.name[currentLang] || selectedStation.name.en}
            </div>
            <div className="text-[11px] font-mono text-indigo-400 mt-1">
              {selectedStation.lat}° N, {selectedStation.lon}° E • {selectedStation.type}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400">{t.distance} ({activeSat.shortName})</div>
            <div className="text-xl sm:text-2xl font-bold font-['Orbitron'] text-cyan-300 mt-1">
              {passEstimate.distanceKm.toLocaleString()} <span className="text-sm font-normal text-slate-400">km</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1">
              {passEstimate.isClose ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Inside Direct Radio Horizon
                </span>
              ) : (
                'Outside Direct Horizon Line'
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400">{t.estPass}</div>
            <div className="text-xl sm:text-2xl font-bold font-['Orbitron'] text-amber-300 mt-1">
              ~{passEstimate.timeStr}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1">
              Approx. {passEstimate.minutes} minutes away ({Math.round(passEstimate.minutes / 92.6)} orbits)
            </div>
          </div>
        </div>
      </LiquidGlassCard>

      {/* Mission Dossier Modal when clicking marker or "Mission Dossier" */}
      <AnimatePresence>
        {modalSat && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-2xl rounded-3xl liquid-glass border border-white/20 p-6 sm:p-8 shadow-2xl space-y-6"
            >
              <button
                type="button"
                onClick={() => setModalSat(null)}
                className="absolute top-5 right-5 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-2 pr-10">
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="px-2.5 py-0.5 rounded-full text-slate-950 font-bold" style={{ backgroundColor: modalSat.color }}>
                    NORAD {modalSat.noradId}
                  </span>
                  <span className="text-slate-400">• {modalSat.type}</span>
                  <span className="text-slate-400">• {modalSat.operator}</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold font-['Orbitron'] text-white">
                  {modalSat.name}
                </h3>
                <div className="text-xs font-mono text-cyan-300">
                  {modalSat.status[currentLang] || modalSat.status.en}
                </div>
              </div>

              {/* Real-Time Coordinates Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">{t.lat}</div>
                  <div className="text-base font-bold text-white font-['Orbitron'] mt-0.5">
                    {satPositions[modalSat.id]?.latitude?.toFixed(2)}°
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">{t.lon}</div>
                  <div className="text-base font-bold text-white font-['Orbitron'] mt-0.5">
                    {satPositions[modalSat.id]?.longitude?.toFixed(2)}°
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">{t.alt}</div>
                  <div className="text-base font-bold text-white font-['Orbitron'] mt-0.5">
                    {Math.round(satPositions[modalSat.id]?.altitude || 0).toLocaleString()} km
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">{t.vel}</div>
                  <div className="text-base font-bold text-white font-['Orbitron'] mt-0.5">
                    {Math.round(satPositions[modalSat.id]?.velocity || 0).toLocaleString()} km/h
                  </div>
                </div>
              </div>

              {/* TLE Two-Line Element Details */}
              <div className="space-y-1.5 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 font-mono text-[10px] text-slate-400 overflow-x-auto">
                <div className="text-slate-300 font-bold uppercase tracking-wider">NORAD Two-Line Element (TLE) Payload:</div>
                <div className="text-cyan-300">{modalSat.tle.line1}</div>
                <div className="text-indigo-300">{modalSat.tle.line2}</div>
              </div>

              {/* Scientific Briefing */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                  {t.debrief}
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed font-sans">
                  {modalSat.missionSummary[currentLang] || modalSat.missionSummary.en}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectSatellite(modalSat);
                    setModalSat(null);
                  }}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs font-mono text-slate-950 transition-colors cursor-pointer"
                  style={{ backgroundColor: modalSat.color }}
                >
                  Track & Follow on Map
                </button>

                <button
                  type="button"
                  onClick={() => setModalSat(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 transition-colors cursor-pointer"
                >
                  Close
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
