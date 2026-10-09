'use client';

import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AsteroidRiskBadge from './AsteroidRiskBadge.jsx';
import AsteroidRiskGauge from './AsteroidRiskGauge.jsx';
import { getNasaApiKey, buildNasaNeoWsUrl } from '../utils/nasaApiClient';
import { fetchAsteroidsNeows } from '@/lib/nasaApi';
import { 
  Radio, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert,
  AlertOctagon,
  Flame,
  Bell,
  BellRing,
  BellOff,
  Ruler, 
  Zap, 
  Calendar, 
  ExternalLink, 
  RefreshCw, 
  Info, 
  Compass, 
  Search,
  CheckCircle2,
  X,
  Target,
  Globe,
  SlidersHorizontal,
  ChevronRight,
  Database,
  WifiOff
} from 'lucide-react';

// Planetary Defense Threat Thresholds (NASA PHA Standard)
export const THREAT_THRESHOLDS = {
  DIAMETER_METERS: 140, // Asteroids >= 140m can cause regional devastation upon impact
  CLOSE_APPROACH_LD: 10, // Close approach within 10 Lunar Distances (~3.84M km)
  CLOSE_APPROACH_KM: 7500000, // 7.5 million km (NASA 19.5 LD / 0.05 AU threshold)
  ALERT_NOTIFICATION_KM: 1000000 // Real-time notification threshold (< 1,000,000 km)
};

/**
 * Evaluates whether an asteroid warrants a RED Threat Level badge
 * based on estimated diameter threshold (> 140m) OR close approach distance (< 10 LD / 7.5M km).
 */
export function getAsteroidThreatInfo(ast) {
  if (!ast) {
    return {
      isRedThreat: false,
      level: 'LOW',
      badgeColor: 'emerald',
      reasons: [],
      label: { en: 'Low', si: 'අවම', ta: 'குறைந்த' },
      isDiameterExceeded: false,
      isCloseApproach: false,
      isPha: false
    };
  }

  const diameter = Number(ast.avgDiameterMeters || ast.maxDiameterMeters || 0);
  const lunarDist = parseFloat(ast.lunarDistance) || 999;
  const kmDist = Number(ast.rawKmDistance) || 99999999;
  const isPha = Boolean(ast.isHazardous);

  const isDiameterExceeded = diameter >= THREAT_THRESHOLDS.DIAMETER_METERS;
  const isCloseApproach = lunarDist <= THREAT_THRESHOLDS.CLOSE_APPROACH_LD || kmDist <= THREAT_THRESHOLDS.CLOSE_APPROACH_KM;

  // Red Badge criteria: diameter threshold exceeded OR close approach distance OR explicit PHA
  const isRedThreat = isDiameterExceeded || isCloseApproach || isPha;

  let level = 'LOW';
  let badgeColor = 'emerald';
  let labelEn = 'Low Threat';
  let labelSi = 'අවම තර්ජනය';
  let labelTa = 'குறைந்த அச்சுறுத்தல்';
  const reasons = [];

  if (isDiameterExceeded && isCloseApproach) {
    level = 'CRITICAL';
    badgeColor = 'rose';
    labelEn = 'CRITICAL THREAT';
    labelSi = 'අතිශය බරපතල තර්ජනයක්';
    labelTa = 'மிகக் கடுமையான அச்சுறுத்தல்';
    reasons.push(`Diameter (${diameter}m ≥ ${THREAT_THRESHOLDS.DIAMETER_METERS}m)`);
    reasons.push(`Close Approach (${lunarDist} LD ≤ ${THREAT_THRESHOLDS.CLOSE_APPROACH_LD} LD)`);
  } else if (isDiameterExceeded) {
    level = 'HIGH';
    badgeColor = 'rose';
    labelEn = 'HIGH THREAT';
    labelSi = 'ඉහළ තර්ජනයක්';
    labelTa = 'அதிக அச்சுறுத்தல்';
    reasons.push(`Diameter Exceeded (${diameter}m ≥ ${THREAT_THRESHOLDS.DIAMETER_METERS}m)`);
  } else if (isCloseApproach) {
    level = 'HIGH';
    badgeColor = 'rose';
    labelEn = 'HIGH THREAT';
    labelSi = 'ඉහළ තර්ජනයක්';
    labelTa = 'அதிக அச்சுறுத்தல்';
    reasons.push(`Close Approach Proximity (${lunarDist} LD ≤ ${THREAT_THRESHOLDS.CLOSE_APPROACH_LD} LD)`);
  } else if (isPha) {
    level = 'HIGH';
    badgeColor = 'rose';
    labelEn = 'HIGH THREAT';
    labelSi = 'ඉහළ තර්ජනයක්';
    labelTa = 'அதிக அச்சுறுத்தல்';
    reasons.push('NASA PHA Designated Orbit');
  } else if (diameter >= 70 || lunarDist <= 20) {
    level = 'MODERATE';
    badgeColor = 'amber';
    labelEn = 'MODERATE';
    labelSi = 'මධ්‍යස්ථ අවදානම';
    labelTa = 'மிதமான அச்சுறுத்தல்';
    reasons.push('Elevated orbital tracking');
  } else {
    level = 'LOW';
    badgeColor = 'emerald';
    labelEn = 'LOW / SAFE';
    labelSi = 'ආරක්ෂිත කක්ෂය';
    labelTa = 'பாதுகாப்பானது';
    reasons.push('Safe astronomical distance');
  }

  return {
    isRedThreat,
    level,
    badgeColor,
    label: { en: labelEn, si: labelSi, ta: labelTa },
    reasons,
    isDiameterExceeded,
    isCloseApproach,
    isPha
  };
}

// Comprehensive 8-item Fallback Mock Dataset for Reliable Offline / Netlify Production
const MOCK_NEOWS_FALLBACK = [
  {
    id: '2026-PHA-1',
    name: '433 Eros (1898 DQ)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=433',
    isHazardous: true,
    minDiameterMeters: 16840,
    maxDiameterMeters: 16840,
    avgDiameterMeters: 16840,
    velocityKms: '24.36',
    velocityKmh: '87,696',
    missDistanceKm: '26,740,000',
    rawKmDistance: 26740000,
    lunarDistance: '69.5',
    closeApproachDate: '2026-10-15',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-2',
    name: '99942 Apophis (2004 MN4)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=99942',
    isHazardous: true,
    minDiameterMeters: 340,
    maxDiameterMeters: 370,
    avgDiameterMeters: 355,
    velocityKms: '30.73',
    velocityKmh: '110,628',
    missDistanceKm: '31,600',
    rawKmDistance: 31600,
    lunarDistance: '0.08',
    closeApproachDate: '2029-04-13',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-3',
    name: '101955 Bennu (1999 RQ36)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=101955',
    isHazardous: true,
    minDiameterMeters: 490,
    maxDiameterMeters: 510,
    avgDiameterMeters: 500,
    velocityKms: '27.72',
    velocityKmh: '99,792',
    missDistanceKm: '4,800,000',
    rawKmDistance: 4800000,
    lunarDistance: '12.4',
    closeApproachDate: '2026-11-02',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-4',
    name: '162173 Ryugu (1999 JU3)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=162173',
    isHazardous: true,
    minDiameterMeters: 880,
    maxDiameterMeters: 920,
    avgDiameterMeters: 900,
    velocityKms: '29.00',
    velocityKmh: '104,400',
    missDistanceKm: '9,200,000',
    rawKmDistance: 9200000,
    lunarDistance: '23.9',
    closeApproachDate: '2026-10-24',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-5',
    name: '65803 Didymos (1996 GT)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=65803',
    isHazardous: true,
    minDiameterMeters: 760,
    maxDiameterMeters: 800,
    avgDiameterMeters: 780,
    velocityKms: '23.50',
    velocityKmh: '84,600',
    missDistanceKm: '10,500,000',
    rawKmDistance: 10500000,
    lunarDistance: '27.3',
    closeApproachDate: '2026-10-30',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-6',
    name: '4179 Toutatis (1989 AC)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=4179',
    isHazardous: true,
    minDiameterMeters: 2400,
    maxDiameterMeters: 2500,
    avgDiameterMeters: 2450,
    velocityKms: '38.00',
    velocityKmh: '136,800',
    missDistanceKm: '7,100,000',
    rawKmDistance: 7100000,
    lunarDistance: '18.4',
    closeApproachDate: '2026-12-12',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-7',
    name: '3122 Florence (1981 ET3)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=3122',
    isHazardous: true,
    minDiameterMeters: 4800,
    maxDiameterMeters: 5000,
    avgDiameterMeters: 4900,
    velocityKms: '13.60',
    velocityKmh: '48,960',
    missDistanceKm: '7,060,000',
    rawKmDistance: 7060000,
    lunarDistance: '18.3',
    closeApproachDate: '2026-11-18',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-8',
    name: '3200 Phaethon (1983 TB)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=3200',
    isHazardous: true,
    minDiameterMeters: 5700,
    maxDiameterMeters: 5900,
    avgDiameterMeters: 5800,
    velocityKms: '34.00',
    velocityKmh: '122,400',
    missDistanceKm: '10,300,000',
    rawKmDistance: 10300000,
    lunarDistance: '26.8',
    closeApproachDate: '2026-12-16',
    orbitingBody: 'Earth'
  }
];

function AsteroidRadar({ lang = 'en' }) {
  const [asteroids, setAsteroids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsteroid, setSelectedAsteroid] = useState(null);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'HAZARDOUS' | 'CLOSE' | 'LARGE'
  const [searchQuery, setSearchQuery] = useState('');
  const [isFallback, setIsFallback] = useState(false);
  const [dateRangeInfo, setDateRangeInfo] = useState({ start: '', end: '' });

  // Browser Notification API State for Close Approach Alerts (< 1,000,000 km)
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });
  const [activeCloseApproachAlert, setActiveCloseApproachAlert] = useState(null);
  const notifiedAsteroidsRef = useRef(new Set());

  // Load previously notified asteroid IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('nasa_notified_close_asteroids');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          notifiedAsteroidsRef.current = new Set(parsed);
        }
      }
    } catch {}
  }, []);

  // Helper to format Date to YYYY-MM-DD
  const formatYYYYMMDD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Subtle Web Audio sonar chirp when inspecting blips or asteroids
  const playRadarPing = (isHazardous = false) => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isHazardous ? 920 : 640, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isHazardous ? 460 : 320, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  // High-urgency alert chime for Close Approach Asteroids (< 1,000,000 km)
  const playCloseApproachAlertSound = () => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Pulse 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.setValueAtTime(1250, now + 0.08);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);

      // Pulse 2
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(1100, now + 0.24);
      osc2.frequency.setValueAtTime(1550, now + 0.35);
      gain2.gain.setValueAtTime(0.14, now + 0.24);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.24);
      osc2.stop(now + 0.48);
    } catch {}
  };

  // Request browser Notification API permission
  const handleRequestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        try {
          new Notification('🔔 NASA Space Radar Active', {
            body: 'Real-time Close Approach alerts (< 1,000,000 km) are now active.',
            icon: '/favicon.ico',
            tag: 'nasa-radar-status'
          });
        } catch {}

        // Immediately check current asteroids
        if (asteroids.length > 0) {
          checkAndNotifyCloseApproaches(asteroids);
        }
      }
    } catch (err) {
      console.warn('Error requesting Notification permission:', err);
    }
  };

  // Real-time close approach detection & browser notification dispatcher
  const checkAndNotifyCloseApproaches = (list) => {
    if (!Array.isArray(list) || list.length === 0) return;

    // Filter asteroids within < 1,000,000 km threshold
    const criticalAsteroids = list.filter(ast => {
      const km = Number(ast.rawKmDistance) || parseFloat(String(ast.missDistanceKm).replace(/,/g, '')) || 99999999;
      return km > 0 && km < THREAT_THRESHOLDS.ALERT_NOTIFICATION_KM;
    });

    if (criticalAsteroids.length === 0) return;

    // Sort by proximity to Earth
    criticalAsteroids.sort((a, b) => (Number(a.rawKmDistance) || 0) - (Number(b.rawKmDistance) || 0));

    criticalAsteroids.forEach(ast => {
      if (!notifiedAsteroidsRef.current.has(ast.id)) {
        notifiedAsteroidsRef.current.add(ast.id);

        try {
          localStorage.setItem(
            'nasa_notified_close_asteroids',
            JSON.stringify(Array.from(notifiedAsteroidsRef.current))
          );
        } catch {}

        // Trigger alarm sound & in-app banner
        playCloseApproachAlertSound();
        setActiveCloseApproachAlert(ast);

        // Browser Notification API Alert
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const notif = new Notification(
              `🚨 NASA CRITICAL CLOSE APPROACH: ${ast.name}`,
              {
                body: `Passes within ${ast.missDistanceKm} km (~${ast.lunarDistance} LD) from Earth at ${ast.velocityKmh} km/h on ${ast.closeApproachDate}!`,
                icon: '/favicon.ico',
                tag: `asteroid-close-approach-${ast.id}`,
                requireInteraction: true
              }
            );

            notif.onclick = () => {
              window.focus();
              setSelectedAsteroid(ast);
              notif.close();
            };
          } catch (err) {
            console.warn('Browser Notification delivery error:', err);
          }
        }
      }
    });
  };

  // Manual Test / Simulation Alert
  const handleTestNotification = () => {
    playCloseApproachAlertSound();

    const sampleAst = asteroids.find(a => (Number(a.rawKmDistance) || 0) < THREAT_THRESHOLDS.ALERT_NOTIFICATION_KM) || asteroids[0] || {
      id: 'sim-99942',
      name: '99942 Apophis (Close Approach Simulation)',
      missDistanceKm: '31,600',
      rawKmDistance: 31600,
      lunarDistance: '0.08',
      velocityKms: '30.73',
      velocityKmh: '110,628',
      closeApproachDate: '2029-04-13',
      avgDiameterMeters: 355,
      isHazardous: true,
      orbitingBody: 'Earth'
    };

    setActiveCloseApproachAlert(sampleAst);

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(
          `🚨 [TEST] NASA CLOSE APPROACH: ${sampleAst.name}`,
          {
            body: `Passes within ${sampleAst.missDistanceKm} km (~${sampleAst.lunarDistance} LD) from Earth! Relative velocity: ${sampleAst.velocityKmh} km/h.`,
            icon: '/favicon.ico',
            tag: `test-close-approach-${Date.now()}`
          }
        );
        notif.onclick = () => {
          window.focus();
          setSelectedAsteroid(sampleAst);
          notif.close();
        };
      } catch {}
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      handleRequestNotificationPermission();
    }
  };

  const handleSelectAsteroid = (ast) => {
    setSelectedAsteroid(ast);
    if (ast) {
      playRadarPing(ast.isHazardous);
    }
  };

  // Fetch live NASA NeoWs Feed with dynamic 7-day start_date & end_date
  const fetchAsteroids = async () => {
    setLoading(true);

    // 1. Dynamic Date Logic: today & 7 days from today in YYYY-MM-DD format
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startDate = formatYYYYMMDD(today);
    const endDate = formatYYYYMMDD(nextWeek);
    setDateRangeInfo({ start: startDate, end: endDate });

    let rawNeoObj = null;

    // Central NASA API Pipeline fetch with automatic multi-tier caching & fallbacks
    try {
      const neowsObj = await fetchAsteroidsNeows(startDate, endDate);
      if (neowsObj && typeof neowsObj === 'object') {
        rawNeoObj = neowsObj;
      }
    } catch (err) {
      console.warn('NASA NeoWs pipeline fallback:', err);
    }

    // Direct fallback if fetchAsteroidsNeows returned null
    if (!rawNeoObj) {
      try {
        const directUrl = buildNasaNeoWsUrl(startDate, endDate);
        const directRes = await fetch(directUrl);
        if (directRes.ok) {
          const directData = await directRes.json();
          if (directData && (directData.near_earth_objects || Array.isArray(directData))) {
            rawNeoObj = directData;
          }
        }
      } catch (err) {
        console.warn('Direct NASA NeoWs fetch attempt fallback:', err);
      }
    }

    // Process Received Real-Time Objects
    if (rawNeoObj) {
      const allList = [];
      const dateMap = rawNeoObj.near_earth_objects || (rawNeoObj && !Array.isArray(rawNeoObj) && !rawNeoObj.element_count ? rawNeoObj : null);

      if (dateMap && typeof dateMap === 'object') {
        Object.keys(dateMap).forEach(date => {
          const dayItems = dateMap[date];
          if (Array.isArray(dayItems)) {
            dayItems.forEach(item => {
              if (!item) return;
              const closeApp = Array.isArray(item.close_approach_data) && item.close_approach_data.length > 0
                ? item.close_approach_data[0]
                : (item.close_approach_data || {});

              const kmDistance = parseFloat(closeApp.miss_distance?.kilometers || item.miss_distance_km || item.rawKmDistance || '10000000') || 10000000;
              const lunarDistance = parseFloat(closeApp.miss_distance?.lunar || item.lunarDistance || '25') || 25;
              const velocityKms = parseFloat(closeApp.relative_velocity?.kilometers_per_second || item.velocityKms || '20') || 20;
              const minDiam = item.estimated_diameter?.meters?.estimated_diameter_min || item.minDiameterMeters || 50;
              const maxDiam = item.estimated_diameter?.meters?.estimated_diameter_max || item.maxDiameterMeters || 120;
              const avgDiam = (minDiam + maxDiam) / 2;

              allList.push({
                id: String(item.id || `ast-${Math.random()}`),
                name: item.name || 'Unnamed Asteroid',
                jplUrl: item.nasa_jpl_url || item.jplUrl || `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${item.id}`,
                isHazardous: Boolean(item.is_potentially_hazardous_asteroid ?? item.isHazardous),
                minDiameterMeters: Math.round(minDiam),
                maxDiameterMeters: Math.round(maxDiam),
                avgDiameterMeters: Math.round(avgDiam),
                velocityKms: velocityKms.toFixed(2),
                velocityKmh: Math.round(velocityKms * 3600).toLocaleString(),
                missDistanceKm: Math.round(kmDistance).toLocaleString(),
                rawKmDistance: kmDistance,
                lunarDistance: lunarDistance.toFixed(2),
                closeApproachDate: closeApp.close_approach_date_full || closeApp.close_approach_date || item.closeApproachDate || 'Upcoming',
                orbitingBody: closeApp.orbiting_body || item.orbitingBody || 'Earth'
              });
            });
          }
        });
      } else if (Array.isArray(rawNeoObj)) {
        rawNeoObj.forEach(item => {
          if (!item) return;
          allList.push({
            id: String(item.id || `ast-${Math.random()}`),
            name: item.name || 'Unnamed Asteroid',
            jplUrl: item.jplUrl || item.nasa_jpl_url || `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${item.id}`,
            isHazardous: Boolean(item.isHazardous ?? item.is_potentially_hazardous_asteroid),
            minDiameterMeters: Math.round(item.minDiameterMeters || 100),
            maxDiameterMeters: Math.round(item.maxDiameterMeters || 200),
            avgDiameterMeters: Math.round(item.avgDiameterMeters || 150),
            velocityKms: String(item.velocityKms || '20.00'),
            velocityKmh: String(item.velocityKmh || '72,000'),
            missDistanceKm: String(item.missDistanceKm || '5,000,000'),
            rawKmDistance: Number(item.rawKmDistance) || 5000000,
            lunarDistance: String(item.lunarDistance || '13.0'),
            closeApproachDate: item.closeApproachDate || 'Upcoming',
            orbitingBody: item.orbitingBody || 'Earth'
          });
        });
      }

      if (allList.length > 0) {
        setAsteroids(allList);
        setIsFallback(false);
        setLoading(false);
        checkAndNotifyCloseApproaches(allList);
        return;
      }
    }

    // Tier 3: Seamlessly load Fallback Mock Dataset if API fails, rate-limits (429), or 400
    setAsteroids(MOCK_NEOWS_FALLBACK);
    setIsFallback(true);
    setLoading(false);
    checkAndNotifyCloseApproaches(MOCK_NEOWS_FALLBACK);
  };

  useEffect(() => {
    fetchAsteroids();
    const interval = setInterval(fetchAsteroids, 45000); // 45s throttled polling for 60FPS background efficiency
    return () => clearInterval(interval);
  }, []);

  // Filtered Asteroid List
  const filteredAsteroids = useMemo(() => {
    return asteroids.filter(item => {
      if (filter === 'RED_THREAT' && !getAsteroidThreatInfo(item).isRedThreat) return false;
      if (filter === 'HAZARDOUS' && !item.isHazardous) return false;
      if (filter === 'CLOSE' && parseFloat(item.lunarDistance) > 10) return false;
      if (filter === 'LARGE' && item.avgDiameterMeters < 100) return false;
      
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.id.includes(q);
      }
      return true;
    });
  }, [asteroids, filter, searchQuery]);

  // Language Dictionary
  const UI = {
    en: {
      title: 'NASA NeoWs Near-Earth Asteroid Radar',
      subtitle: 'Real-time 7-day tracking of close-approach asteroids, orbital velocities, and hazardous threat levels',
      refresh: 'Refresh NeoWs Feed',
      filterAll: 'All Near-Earth Objects',
      filterRedThreat: '🚨 Red Threat Level',
      filterHazardous: 'Potentially Hazardous (PHA)',
      filterClose: 'Closest Approaches (< 10 LD)',
      filterLarge: 'Largest Objects (> 100m)',
      searchPlaceholder: 'Search asteroid name or JPL ID...',
      hazardousTag: 'Potentially Hazardous',
      safeTag: 'Non-Hazardous Orbit',
      missDistance: 'Miss Distance',
      velocity: 'Relative Velocity',
      diameter: 'Estimated Diameter',
      approachDate: 'Close Approach Time',
      viewDetails: 'Inspect Object',
      modalTitle: 'Near-Earth Object Telemetry Dossier',
      jplDatabase: 'NASA JPL Small-Body Database',
      radarLegend: 'Target Range: 0 to 30 Million KM',
      sizeBenchmark: 'Size Equivalent',
      machSpeed: 'Mach Number Scale',
      closeApproachTelemetry: 'Close Approach Vector',
      offlineActive: 'OFFLINE / CACHED TELEMETRY ACTIVE',
      liveActive: 'LIVE NASA NEOWS FEED',
      threatLevelHeader: 'RED THREAT CRITERIA',
      threatCriteriaNote: 'Diameter ≥ 140m OR Close Approach ≤ 10 LD (7.5M km)',
      flaggedRed: 'Flagged Red Threat',
      safeTrajectory: 'Safe Trajectory',
      threatAssessmentTitle: 'Planetary Defense Threat Classification',
      notifEnabled: 'Alerts Active (< 1M km)',
      notifEnableBtn: 'Enable Close Approach Alerts (< 1M km)',
      notifBlocked: 'Alerts Blocked in Browser',
      testAlertBtn: 'Simulate Alert (< 1M km)',
      criticalCloseApproachTag: 'CRITICAL CLOSE APPROACH < 1,000,000 KM',
      inspectTarget: 'Inspect Target',
      dismissAlert: 'Dismiss Alert'
    },
    si: {
      title: 'නාසා NeoWs පෘථිවි ආසන්න අභ්‍යවකාශ රේඩාර් පද්ධතිය',
      subheading: 'පෘථිවියට ආසන්නව ගමන් කරන උල්කාෂ්ම, ප්‍රවේග සහ අවදානම් මට්ටම් තත්‍ය කාලීනව නිරීක්ෂණය කරන්න',
      refresh: 'දත්ත යාවත්කාලීන කරන්න',
      filterAll: 'සියලුම වස්තූන්',
      filterRedThreat: '🚨 රතු තර්ජන මට්ටම',
      filterHazardous: 'අනතුරුදායක වස්තූන් (PHA)',
      filterClose: 'ආසන්නතම ගමන් (< 10 LD)',
      filterLarge: 'විශාලතම වස්තූන් (> 100m)',
      searchPlaceholder: 'වස්තුවේ නම හෝ ID ඇතුළත් කරන්න...',
      hazardousTag: 'අනතුරුදායක විය හැක',
      safeTag: 'ආරක්ෂිත කක්ෂය',
      missDistance: 'පෘථිවියේ සිට දුර',
      velocity: 'සාපේක්ෂ වේගය',
      diameter: 'ඇස්තමේන්තුගත විෂ්කම්භය',
      approachDate: 'ආසන්න වන වේලාව',
      viewDetails: 'විස්තර පරීක්ෂා කරන්න',
      modalTitle: 'අභ්‍යවකාශ වස්තු විද්‍යාත්මක වාර්තාව',
      jplDatabase: 'නාසා JPL දත්ත සමුදාය',
      radarLegend: 'රේඩාර් පරාසය: කි.මී. මිලියන 0 සිට 30 දක්වා',
      sizeBenchmark: 'ප්‍රමාණ සැසඳීම',
      machSpeed: 'මැක් වේග සාපේක්ෂතාව',
      closeApproachTelemetry: 'ආසන්න වීමේ ටෙලිමෙට්‍රි දත්ත',
      offlineActive: 'නොබැඳි / කැෂේ දත්ත සක්‍රියයි',
      liveActive: 'සජීවී නාසා NEOWS දත්ත',
      threatLevelHeader: 'රතු තර්ජන නිර්ණායක',
      threatCriteriaNote: 'විෂ්කම්භය ≥ 140m හෝ ආසන්න ගමන් ≤ 10 LD (කි.මී. 7.5M)',
      flaggedRed: 'රතු තර්ජන සලකුණු කර ඇත',
      safeTrajectory: 'ආරක්ෂිත කක්ෂය',
      threatAssessmentTitle: 'ග්‍රහලෝක ආරක්ෂණ තර්ජන වර්ගීකරණය',
      notifEnabled: 'දැනුම්දීම් සක්‍රියයි (< කි.මී. 1M)',
      notifEnableBtn: 'ආසන්න ගමන් දැනුම්දීම් සක්‍රිය කරන්න (< කි.මී. 1M)',
      notifBlocked: 'බ්‍රවුසරයේ දැනුම්දීම් අවහිර කර ඇත',
      testAlertBtn: 'දැනුම්දීම අත්හදා බලන්න',
      criticalCloseApproachTag: 'අතිශය ආසන්න ගමනක් < කි.මී. 1,000,000',
      inspectTarget: 'ඉලක්කය පරීක්ෂා කරන්න',
      dismissAlert: 'ඉවත් කරන්න'
    },
    ta: {
      title: 'நாசா NeoWs பூமிக்கு அருகிலுள்ள சிறுகோள் ரேடார்',
      subheading: 'பூமியை நெருங்கும் சிறுகோள்கள், வேகம் மற்றும் அபாய அளவுகளை நேரலையில் கண்காணிக்கவும்',
      refresh: 'தரவைப் புதுப்பிக்கவும்',
      filterAll: 'அனைத்து பொருட்கள்',
      filterRedThreat: '🚨 சிவப்பு அச்சுறுத்தல்',
      filterHazardous: 'அபாயகரமானவை (PHA)',
      filterClose: 'மிக அருகில் (< 10 LD)',
      filterLarge: 'பெரியவை (> 100m)',
      searchPlaceholder: 'பெயர் அல்லது ID தேடுக...',
      hazardousTag: 'சாத்தியமான அபாயம்',
      safeTag: 'பாதுகாப்பான சுற்றுப்பாதை',
      missDistance: 'பூமியிலிருந்து தொலைவு',
      velocity: 'சார்பு வேகம்',
      diameter: 'மதிப்பிடப்பட்ட விட்டம்',
      approachDate: 'நெருங்கும் நேரம்',
      viewDetails: 'விவரங்களை ஆராய்க',
      modalTitle: 'சிறுகோள் தொலைநிலை ஆய்வு அறிக்கை',
      jplDatabase: 'நாசா JPL தரவுத்தளம்',
      radarLegend: 'ரேடார் வரம்பு: 0 முதல் 30 மில்லியன் கி.மீ',
      sizeBenchmark: 'அளவு ஒப்பீடு',
      machSpeed: 'வேக ஒப்பீடு',
      closeApproachTelemetry: 'நெருங்கும் தொலைநிலை அளவீடுகள்',
      offlineActive: 'ஆஃப்லைன் / சேமிக்கப்பட்ட தரவு',
      liveActive: 'நேரலை நாசா NEOWS தரவு',
      threatLevelHeader: 'சிவப்பு அச்சுறுத்தல் அளவுகோல்',
      threatCriteriaNote: 'விட்டம் ≥ 140m அல்லது நெருங்கிய பாதை ≤ 10 LD (7.5M km)',
      flaggedRed: 'சிவப்பு குறியிடப்பட்டது',
      safeTrajectory: 'பாதுகாப்பான சுற்றுப்பாதை',
      threatAssessmentTitle: 'கோள் பாதுகாப்பு அச்சுறுத்தல் வகைப்பாடு',
      notifEnabled: 'எச்சரிக்கை செயலில் உள்ளது (< 1M கி.மீ)',
      notifEnableBtn: 'நெருங்கிய பாதை எச்சரிக்கையை இயக்கு (< 1M கி.மீ)',
      notifBlocked: 'உலாவியில் எச்சரிக்கை தடுக்கப்பட்டது',
      testAlertBtn: 'எச்சரிக்கை சோதனை',
      criticalCloseApproachTag: 'அதி தீவிர நெருங்கிய பாதை < 1,000,000 கி.மீ',
      inspectTarget: 'இலக்கை ஆராய்க',
      dismissAlert: 'நீக்குக'
    }
  };

  const t = UI[lang] || UI.en;

  // Size benchmark calculation helper
  const getSizeComparison = (meters) => {
    const m = Number(meters) || 0;
    if (m < 10) return lang === 'si' ? 'බස් රථයක ප්‍රමාණය' : lang === 'ta' ? 'பேருந்து அளவு' : 'Size of a City Bus';
    if (m < 50) return lang === 'si' ? 'ඔලිම්පික් පිහිනුම් තටාකයක ප්‍රමාණය' : lang === 'ta' ? 'நீச்சல் குளம் அளவு' : 'Olympic Swimming Pool Length';
    if (m < 150) return lang === 'si' ? 'පාපන්දු ක්‍රීඩාංගණයක ප්‍රමාණය' : lang === 'ta' ? 'கால்பந்து மைதானம் அளவு' : 'Full Football Stadium Size';
    if (m < 400) return lang === 'si' ? 'ඊෆල් කුළුණේ උසට සමානයි' : lang === 'ta' ? 'ஈபிள் கோபுரம் உயரம்' : 'Eiffel Tower Height Equivalent';
    return lang === 'si' ? 'බුර්ජ් කලීෆා ගොඩනැගිල්ලට සමානයි' : lang === 'ta' ? 'புர்ஜ் கலீஃபா உயரம்' : 'Burj Khalifa Tower Scale';
  };

  return (
    <div className="w-full space-y-6 select-none font-sans">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl apple-liquid-glass p-6 sm:p-7 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full apple-liquid-glass text-rose-300 text-xs font-mono border-rose-500/30">
                <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span>NASA NeoWs 7-DAY ORBITAL RADAR</span>
              </div>

              {/* Live / Offline Fallback Badge */}
              {isFallback ? (
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[11px] font-mono font-bold">
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  <span>{t.offlineActive}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-mono font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{t.liveActive}</span>
                </div>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black font-['Orbitron'] text-white tracking-wide">
              {t.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-sans">
              {t.subtitle} {dateRangeInfo.start ? `(${dateRangeInfo.start} to ${dateRangeInfo.end})` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
            {/* Browser Notification Status Control (< 1,000,000 km alerts) */}
            {notificationPermission === 'granted' ? (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-mono font-bold">
                <Bell className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">{t.notifEnabled}</span>
                <span className="sm:hidden">ALERTS ON</span>
              </div>
            ) : notificationPermission === 'denied' ? (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-mono">
                <BellOff className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">{t.notifBlocked}</span>
                <span className="sm:hidden">BLOCKED</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRequestNotificationPermission}
                className="px-3.5 py-2 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 shadow-sm animate-pulse"
              >
                <BellRing className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.notifEnableBtn}</span>
              </button>
            )}

            {/* Simulate / Test Alert */}
            <button
              type="button"
              onClick={handleTestNotification}
              title="Test real-time browser notification (< 1M km)"
              className="px-3 py-2 rounded-2xl apple-liquid-glass hover:text-cyan-300 text-slate-300 text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
            >
              <span>{t.testAlertBtn}</span>
            </button>

            <button
              type="button"
              onClick={fetchAsteroids}
              disabled={loading}
              className="px-4 py-2 rounded-2xl apple-liquid-glass hover:text-white text-cyan-300 text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-950/40"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{t.refresh}</span>
            </button>
          </div>
        </div>

        {/* Threat Level Thresholds & Summary Ribbon */}
        <div className="mt-5 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            </span>
            <span className="text-rose-300 font-bold tracking-wider">{t.threatLevelHeader}:</span>
            <span className="text-slate-300 text-[11px] sm:text-xs">
              {t.threatCriteriaNote}
            </span>
          </div>

          <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-xl apple-liquid-glass text-[11px]">
            <span className="text-rose-400 font-bold flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>{asteroids.filter(a => getAsteroidThreatInfo(a).isRedThreat).length} {t.flaggedRed}</span>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{asteroids.filter(a => !getAsteroidThreatInfo(a).isRedThreat).length} {t.safeTrajectory}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Real-time Close Approach Warning Banner (< 1,000,000 KM) */}
      <AnimatePresence>
        {activeCloseApproachAlert && (
          <motion.div
            initial={{ opacity: 0, y: -15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.98 }}
            className="rounded-3xl p-5 bg-gradient-to-r from-rose-950/90 via-red-900/60 to-slate-900/95 border-2 border-rose-500 shadow-[0_0_35px_rgba(244,63,94,0.4)] backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans select-none"
          >
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-rose-500/25 text-rose-400 border border-rose-500/60 animate-pulse mt-0.5">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-mono font-black uppercase tracking-wider animate-pulse shadow-md shadow-rose-950">
                    {t.criticalCloseApproachTag}
                  </span>
                  <span className="text-xs font-mono text-rose-300 font-bold">
                    {activeCloseApproachAlert.closeApproachDate}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold font-['Orbitron'] text-white">
                  {activeCloseApproachAlert.name}
                </h3>
                <p className="text-xs font-mono text-slate-300">
                  Miss Distance: <span className="text-rose-400 font-bold">{activeCloseApproachAlert.missDistanceKm} km</span> ({activeCloseApproachAlert.lunarDistance} LD) • Velocity: {activeCloseApproachAlert.velocityKmh} km/h • Diameter: ~{activeCloseApproachAlert.avgDiameterMeters}m
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedAsteroid(activeCloseApproachAlert)}
                className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs transition cursor-pointer shadow-lg shadow-rose-950/60 flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                <span>{t.inspectTarget}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveCloseApproachAlert(null)}
                className="p-2.5 rounded-2xl apple-liquid-glass text-slate-400 hover:text-white transition cursor-pointer"
                title={t.dismissAlert}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid: Radar Screen & Threat Detail Column (Left) + Asteroid Controls & Feed (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Structured Flexbox Container wrapping Earth Centered Radar and Threat Detail Card */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          
          {/* Earth Centered Radar Visualizer Card */}
          <div className="w-full rounded-2xl apple-liquid-glass p-5 sm:p-7 shadow-2xl flex flex-col items-center justify-between relative overflow-hidden min-h-[480px]">
            {/* Dedicated Radar Scope Header Bar - Fully decoupled from blips and callouts */}
            <div className="w-full px-4 py-3 rounded-2xl bg-[#060b1e]/90 border border-cyan-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-slate-300 relative z-20 shadow-md">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
                <span className="flex items-center gap-1.5 text-cyan-300 font-bold tracking-wider">
                  <Target className="w-3.5 h-3.5 text-cyan-400" />
                  EARTH CENTERED RADAR
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  7-DAY NEO RANGE
                </span>
              </div>
              <span className="text-slate-400 text-[10px] hidden sm:inline font-mono">
                {t.radarLegend}
              </span>
            </div>

            {/* Radar Screen Sphere Container with dedicated vertical spacing */}
            <div className="relative w-[280px] h-[280px] sm:w-[350px] sm:h-[350px] rounded-full border-2 border-cyan-500/40 apple-liquid-glass shadow-[0_0_50px_rgba(6,182,212,0.2)] flex items-center justify-center my-6 overflow-hidden shrink-0">
              
              {/* Concentric Distance Rings */}
              <div className="absolute w-[80%] h-[80%] rounded-full border border-dashed border-cyan-500/30 flex items-center justify-start pl-2">
                <span className="text-[9px] font-mono text-cyan-400/70 font-semibold">5 LD</span>
              </div>
              <div className="absolute w-[60%] h-[60%] rounded-full border border-cyan-500/25 flex items-center justify-start pl-2">
                <span className="text-[9px] font-mono text-cyan-400/70 font-semibold">2.5 LD</span>
              </div>
              <div className="absolute w-[38%] h-[38%] rounded-full border border-dashed border-cyan-500/30 flex items-center justify-start pl-2">
                <span className="text-[9px] font-mono text-cyan-400/70 font-semibold">1 LD</span>
              </div>

              {/* Radar Crosshairs Axis */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-full h-[1px] bg-cyan-500/30" />
                <div className="h-full w-[1px] bg-cyan-500/30 absolute" />
              </div>

              {/* Central Earth Hub */}
              <div className="relative w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-500 border-2 border-white shadow-[0_0_20px_rgba(6,182,212,0.8)] z-20 flex items-center justify-center">
                <Globe className="w-4 h-4 text-white animate-pulse" />
              </div>

              {/* Rotating Radar Sweep Beam */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                className="absolute inset-0 rounded-full pointer-events-none z-10"
                style={{
                  background: 'conic-gradient(from 0deg, rgba(6, 182, 212, 0.45) 0deg, rgba(6, 182, 212, 0.08) 45deg, transparent 90deg, transparent 360deg)'
                }}
              />

              {/* Asteroids Plotted on Radar Target Grid */}
              {!loading && filteredAsteroids.map((ast, idx) => {
                const maxScaleKm = 28000000;
                const normalizedDist = Math.min(1, Math.max(0.12, ast.rawKmDistance / maxScaleKm));
                const radiusPx = normalizedDist * 140;

                const angleDeg = (idx * 48 + (parseInt(String(ast.id).replace(/\D/g, '')) || idx * 37)) % 360;
                const angleRad = (angleDeg * Math.PI) / 180;

                const x = Math.cos(angleRad) * radiusPx;
                const y = Math.sin(angleRad) * radiusPx;

                const isSelected = selectedAsteroid?.id === ast.id;
                const threat = getAsteroidThreatInfo(ast);

                return (
                  <div
                    key={ast.id}
                    onClick={() => handleSelectAsteroid(ast)}
                    style={{
                      left: '50%',
                      top: '50%',
                      transform: `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px))`
                    }}
                    className="absolute z-20 cursor-pointer group"
                  >
                    {/* Glowing Radar Blip: Red Badge if diameter exceeds threshold or close approach */}
                    <div className="relative flex items-center justify-center">
                      {threat.isRedThreat ? (
                        <>
                          <div className="absolute w-7 h-7 rounded-full bg-rose-500/50 animate-ping" />
                          <div className="absolute w-5 h-5 rounded-full bg-rose-600/30 animate-pulse" />
                          <div className={`w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white shadow-[0_0_15px_#ef4444] transition-transform ${isSelected ? 'scale-150 ring-4 ring-rose-500/70' : 'group-hover:scale-125'}`} />
                        </>
                      ) : (
                        <>
                          <div className="absolute w-4 h-4 rounded-full bg-emerald-500/25 animate-pulse" />
                          <div className={`w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white shadow-[0_0_10px_#10b981] transition-transform ${isSelected ? 'scale-150 ring-4 ring-emerald-500/50' : 'group-hover:scale-125'}`} />
                        </>
                      )}
                    </div>

                    {/* Hover Callout Tag with Threat Level */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-3 py-1.5 rounded-xl apple-liquid-glass text-[10px] font-mono text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-2xl border border-white/20 z-30">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">{ast.name}</span>
                        <span className={`px-1.5 py-0.2 rounded font-black ${threat.isRedThreat ? 'bg-rose-500/30 text-rose-300 border border-rose-500/60' : 'bg-emerald-500/20 text-emerald-300'}`}>
                          {threat.level}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-300">
                        Dist: {ast.lunarDistance} LD • Diam: ~{ast.avgDiameterMeters}m
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Status Pills with proper vertical spacing and z-index to avoid bleeding */}
            <div className="w-full flex items-center justify-between text-xs font-mono text-slate-300 pt-4 mt-2 border-t border-slate-800/80 flex-wrap gap-2.5 relative z-10">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-rose-500/40 text-rose-300 shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                <span className="font-bold">
                  Red Threat Level: {asteroids.filter(a => getAsteroidThreatInfo(a).isRedThreat).length}
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-emerald-500/40 text-emerald-300 shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span>
                  Safe Orbit: {asteroids.filter(a => !getAsteroidThreatInfo(a).isRedThreat).length}
                </span>
              </div>
            </div>
          </div>

          {/* Threat Detail Card (Threat Assessment Card) */}
          {(() => {
            const activeThreatAst = selectedAsteroid || filteredAsteroids.find(a => getAsteroidThreatInfo(a).isRedThreat) || filteredAsteroids[0];
            if (!activeThreatAst) return null;
            const threat = getAsteroidThreatInfo(activeThreatAst);
            const isTargetActive = selectedAsteroid?.id === activeThreatAst.id;

            return (
              <div className="bg-slate-950/95 backdrop-blur-2xl border border-slate-800/80 z-20 relative shadow-2xl rounded-2xl p-5 sm:p-6 space-y-4 hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300">
                {/* Header with Title and Target Status - Clean responsive flow */}
                <div className="flex flex-col sm:flex-row sm:items-start md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div className={`p-2.5 rounded-2xl shrink-0 mt-0.5 sm:mt-0 ${threat.isRedThreat ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.3)]' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'}`}>
                      {threat.isRedThreat ? <AlertOctagon className="w-5 h-5 animate-pulse" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                          {t.threatAssessmentTitle}
                        </span>
                        {isTargetActive && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0">
                            ACTIVE TARGET
                          </span>
                        )}
                      </div>
                      <h3 className="font-['Orbitron'] font-bold text-white text-base sm:text-lg truncate">
                        {activeThreatAst.name}
                      </h3>
                      <p className="text-[11px] font-mono text-slate-400">
                        JPL SPK-ID: {activeThreatAst.id} • Approach: {activeThreatAst.closeApproachDate}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <span className={`px-3 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider ${threat.isRedThreat ? 'bg-rose-500 text-white shadow-lg shadow-rose-900/60 animate-pulse' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}`}>
                      {threat.level}
                    </span>
                    {selectedAsteroid && (
                      <button
                        type="button"
                        onClick={() => setSelectedAsteroid(null)}
                        className="p-1.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
                        title="Deselect Target"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Threat Criteria Breakdown Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
                  <div className={`p-3 rounded-2xl border ${threat.isDiameterExceeded ? 'bg-rose-500/10 border-rose-500/50 text-rose-200' : 'bg-slate-900/60 border-slate-800 text-slate-300'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-400 uppercase">Diameter Criterion (≥ 140m)</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${threat.isDiameterExceeded ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {threat.isDiameterExceeded ? 'EXCEEDED' : 'PASS'}
                      </span>
                    </div>
                    <p className="font-bold text-sm">~{activeThreatAst.avgDiameterMeters} meters</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Threshold: 140m (Catastrophic regional impact limit)</p>
                  </div>

                  <div className={`p-3 rounded-2xl border ${threat.isCloseApproach ? 'bg-rose-500/10 border-rose-500/50 text-rose-200' : 'bg-slate-900/60 border-slate-800 text-slate-300'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-400 uppercase">Close Approach (≤ 10 LD)</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${threat.isCloseApproach ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {threat.isCloseApproach ? 'CLOSE' : 'PASS'}
                      </span>
                    </div>
                    <p className="font-bold text-sm">{activeThreatAst.lunarDistance} Lunar Distances</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Miss Distance: {activeThreatAst.missDistanceKm} km</p>
                  </div>
                </div>

                {/* Physical Telemetry Row & Action */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 flex-wrap gap-2 text-xs font-mono">
                  <div className="flex items-center gap-3 text-slate-300 flex-wrap">
                    <span>Velocity: <span className="text-amber-400 font-bold">{activeThreatAst.velocityKmh} km/h</span></span>
                    <span className="hidden sm:inline">•</span>
                    <span>Scale: <span className="text-indigo-300">{getSizeComparison(activeThreatAst.avgDiameterMeters)}</span></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAsteroid(activeThreatAst)}
                    className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer ml-auto"
                  >
                    <Target className="w-3.5 h-3.5" />
                    <span>View Dossier</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Asteroids Feed List & Filtering Controls */}
        <div className="lg:col-span-6 space-y-4">
          
          {/* Search & Filter Bar */}
          <div className="p-4 sm:p-5 rounded-3xl apple-liquid-glass space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl apple-liquid-glass text-xs font-mono text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono pb-1">
              {[
                { id: 'ALL', label: t.filterAll },
                { id: 'RED_THREAT', label: t.filterRedThreat },
                { id: 'HAZARDOUS', label: t.filterHazardous },
                { id: 'CLOSE', label: t.filterClose },
                { id: 'LARGE', label: t.filterLarge }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`px-3.5 py-1.5 rounded-2xl whitespace-nowrap transition cursor-pointer ${
                    filter === f.id
                      ? f.id === 'RED_THREAT'
                        ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white font-black shadow-lg shadow-rose-950/60 border border-rose-400'
                        : 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-bold shadow-md shadow-cyan-950/50'
                      : f.id === 'RED_THREAT'
                        ? 'apple-liquid-glass text-rose-300 hover:text-white border-rose-500/40'
                        : 'apple-liquid-glass text-slate-300 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Asteroid Cards Scrollable Feed */}
          <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
            {loading ? (
              /* Graceful Loading Skeletons */
              <div className="space-y-3">
                {[1, 2, 3, 4].map(n => (
                  <div 
                    key={n} 
                    className="p-4 rounded-3xl apple-liquid-glass animate-pulse space-y-3"
                  >
                    <div className="flex justify-between items-center">
                      <div className="h-4 w-40 bg-white/10 rounded-lg" />
                      <div className="h-5 w-24 bg-white/10 rounded-full" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="h-8 bg-white/5 rounded-xl" />
                      <div className="h-8 bg-white/5 rounded-xl" />
                      <div className="h-8 bg-white/5 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredAsteroids.length === 0 ? (
              <div className="p-8 text-center font-mono text-xs text-slate-400 apple-liquid-glass rounded-3xl">
                No matching asteroids found in current 7-day orbital window.
              </div>
            ) : (
              filteredAsteroids.map(ast => {
                const threat = getAsteroidThreatInfo(ast);
                return (
                  <motion.div
                    key={ast.id}
                    layout
                    onClick={() => handleSelectAsteroid(ast)}
                    className={`p-4 sm:p-5 rounded-3xl apple-liquid-glass transition-all cursor-pointer space-y-3.5 ${
                      selectedAsteroid?.id === ast.id
                        ? 'ring-2 ring-cyan-400 shadow-xl shadow-cyan-950/50'
                        : threat.isRedThreat
                          ? 'hover:border-rose-400/60 shadow-rose-950/20'
                          : 'hover:border-cyan-400/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-1">
                          {threat.isRedThreat ? (
                            <span className="flex h-3 w-3 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 shadow-[0_0_8px_#ef4444]"></span>
                            </span>
                          ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 mt-0.5 shadow-[0_0_6px_#10b981]" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-['Orbitron'] font-bold text-white text-sm sm:text-base">
                              {ast.name}
                            </h4>
                            {ast.isHazardous && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                NASA PHA
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                            Approach: {ast.closeApproachDate} • Target ID: {ast.id}
                          </span>
                        </div>
                      </div>

                      {/* Visual Threat Level Indicator Badge in Red for Diameter > 140m OR Close Approach < 10 LD */}
                      <div className="flex flex-col items-end gap-1">
                        {threat.isRedThreat ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-rose-500/25 text-rose-300 border-2 border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse">
                              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                              <span>THREAT: {threat.label[lang] || threat.label.en}</span>
                            </span>
                            {threat.reasons.length > 0 && (
                              <span className="text-[9px] font-mono font-semibold text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-500/30">
                                {threat.reasons[0]}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>THREAT: {threat.label[lang] || threat.label.en}</span>
                          </span>
                        )}
                      </div>
                    </div>

                  {/* Key Telemetry Badges */}
                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                    <div className="p-2.5 rounded-2xl apple-liquid-glass">
                      <span className="text-slate-400 block text-[9px] uppercase">Miss Distance</span>
                      <span className="text-cyan-300 font-bold">{ast.lunarDistance} LD</span>
                    </div>

                    <div className="p-2.5 rounded-2xl apple-liquid-glass">
                      <span className="text-slate-400 block text-[9px] uppercase">Velocity</span>
                      <span className="text-amber-300 font-bold">{ast.velocityKms} km/s</span>
                    </div>

                    <div className="p-2.5 rounded-2xl apple-liquid-glass">
                      <span className="text-slate-400 block text-[9px] uppercase">Est. Diameter</span>
                      <span className="text-indigo-300 font-bold">{ast.avgDiameterMeters} m</span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
          </div>
        </div>
      </div>

      {/* Selected Asteroid Modal Dossier */}
      <AnimatePresence>
        {selectedAsteroid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl rounded-3xl apple-liquid-glass p-6 sm:p-8 shadow-2xl space-y-6 text-slate-200 font-sans max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-2xl ${selectedAsteroid.isHazardous ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'}`}>
                    <Target className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-['Orbitron'] font-bold text-white text-lg sm:text-xl">
                      {selectedAsteroid.name}
                    </h3>
                    <p className="text-xs font-mono text-slate-400">
                      JPL SPK-ID: {selectedAsteroid.id} • Approach: {selectedAsteroid.closeApproachDate}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedAsteroid(null)}
                  className="p-2 rounded-xl apple-liquid-glass text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Planetary Defense Threat Level Assessment Card */}
              {(() => {
                const threat = getAsteroidThreatInfo(selectedAsteroid);
                return (
                  <div className={`p-4 sm:p-5 rounded-3xl bg-slate-950/95 backdrop-blur-xl border border-slate-800 relative z-10 shadow-2xl space-y-3 ${threat.isRedThreat ? 'ring-1 ring-rose-500/50 shadow-[0_0_25px_rgba(244,63,94,0.25)]' : 'ring-1 ring-emerald-500/30'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-xl ${threat.isRedThreat ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {threat.isRedThreat ? <AlertOctagon className="w-5 h-5 animate-pulse" /> : <ShieldCheck className="w-5 h-5" />}
                        </div>
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                            {t.threatAssessmentTitle}
                          </span>
                          <h4 className={`font-['Orbitron'] font-bold text-sm sm:text-base ${threat.isRedThreat ? 'text-rose-300' : 'text-emerald-300'}`}>
                            {threat.label[lang] || threat.label.en}
                          </h4>
                        </div>
                      </div>

                      <span className={`px-3 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider ${threat.isRedThreat ? 'bg-rose-500 text-white shadow-lg shadow-rose-900/60 animate-pulse' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}`}>
                        {threat.level}
                      </span>
                    </div>

                    {/* Threat Evaluation Breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs pt-1">
                      <div className={`p-3 rounded-2xl border ${threat.isDiameterExceeded ? 'bg-rose-500/10 border-rose-500/50 text-rose-200' : 'bg-slate-900/40 border-slate-800 text-slate-300'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-400 uppercase">Diameter Criterion (≥ 140m)</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${threat.isDiameterExceeded ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {threat.isDiameterExceeded ? 'EXCEEDED' : 'PASS'}
                          </span>
                        </div>
                        <p className="font-bold text-sm">~{selectedAsteroid.avgDiameterMeters} meters</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Threshold: 140m (Catastrophic regional impact limit)</p>
                      </div>

                      <div className={`p-3 rounded-2xl border ${threat.isCloseApproach ? 'bg-rose-500/10 border-rose-500/50 text-rose-200' : 'bg-slate-900/40 border-slate-800 text-slate-300'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-400 uppercase">Close Approach Criterion (≤ 10 LD)</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${threat.isCloseApproach ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {threat.isCloseApproach ? 'CLOSE' : 'PASS'}
                          </span>
                        </div>
                        <p className="font-bold text-sm">{selectedAsteroid.lunarDistance} Lunar Distances</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Distance: {selectedAsteroid.missDistanceKm} km</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Integrated Risk Gauge */}
              <AsteroidRiskGauge asteroid={selectedAsteroid} />

              {/* Detailed Physical Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3.5 rounded-2xl apple-liquid-glass space-y-1">
                  <span className="text-slate-400 block text-[10px] uppercase">Miss Distance Breakdown</span>
                  <span className="text-white font-bold text-sm">{selectedAsteroid.missDistanceKm} km</span>
                  <span className="text-cyan-400 block text-[11px]">({selectedAsteroid.lunarDistance}x Lunar Distances)</span>
                </div>

                <div className="p-3.5 rounded-2xl apple-liquid-glass space-y-1">
                  <span className="text-slate-400 block text-[10px] uppercase">Orbital Velocity</span>
                  <span className="text-white font-bold text-sm">{selectedAsteroid.velocityKmh} km/h</span>
                  <span className="text-amber-400 block text-[11px]">({selectedAsteroid.velocityKms} km/s • ~Mach {Math.round(parseFloat(selectedAsteroid.velocityKms) * 2916)})</span>
                </div>

                <div className="p-3.5 rounded-2xl apple-liquid-glass space-y-1">
                  <span className="text-slate-400 block text-[10px] uppercase">Size Benchmark</span>
                  <span className="text-white font-bold text-sm">~{selectedAsteroid.avgDiameterMeters} meters</span>
                  <span className="text-indigo-400 block text-[11px]">{getSizeComparison(selectedAsteroid.avgDiameterMeters)}</span>
                </div>

                <div className="p-3.5 rounded-2xl apple-liquid-glass space-y-1">
                  <span className="text-slate-400 block text-[10px] uppercase">Primary Orbiting Body</span>
                  <span className="text-white font-bold text-sm">{selectedAsteroid.orbitingBody}</span>
                  <span className="text-slate-400 block text-[11px]">Heliocentric / Earth Intersection</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <a
                  href={selectedAsteroid.jplUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-xl apple-liquid-glass text-cyan-300 font-mono text-xs flex items-center gap-1.5 transition hover:border-cyan-400"
                >
                  <span>{t.jplDatabase}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => setSelectedAsteroid(null)}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs transition cursor-pointer"
                >
                  Close Dossier
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(AsteroidRadar);
