/**
 * Pure orbital & geographic helpers for the interactive Leaflet satellite tracker.
 * Computes solar illumination, day/night terminator geometry, horizon radius,
 * antimeridian-safe polylines, great-circle ground links, and plain-language regions.
 */

const EARTH_RADIUS_KM = 6371;
const EARTH_MU_KM3_S2 = 398600.4418;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Approximate sub-solar latitude (declination) and longitude for a UTC Date.
 */
export function getSubSolarPoint(date = new Date()) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - startOfYear) / 86400000 + 1;
  // Solar declination approximation (-23.44 deg to +23.44 deg)
  const declination = 23.44 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));

  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  let longitude = 180 - utcHours * 15;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;

  return {
    latitude: declination,
    longitude
  };
}

/**
 * Build a Leaflet-ready polygon covering Earth's night side across [-360, 360]
 * so horizontal map panning never exposes a clipped terminator edge.
 */
export function getNightTerminatorPolygon(date = new Date()) {
  const sun = getSubSolarPoint(date);
  const decRad = sun.latitude * DEG_TO_RAD;
  // Avoid division by zero right at the equinoxes
  const safeTanDec =
    Math.abs(Math.tan(decRad)) < 1e-4
      ? sun.latitude >= 0
        ? 1e-4
        : -1e-4
      : Math.tan(decRad);

  const curve = [];
  for (let lon = -360; lon <= 360; lon += 4) {
    const deltaLonRad = (lon - sun.longitude) * DEG_TO_RAD;
    const latRad = Math.atan(-Math.cos(deltaLonRad) / safeTanDec);
    const latDeg = Math.max(-85, Math.min(85, latRad * RAD_TO_DEG));
    curve.push([latDeg, lon]);
  }

  // Close the polygon around the pole currently in darkness
  const darkPoleLat = sun.latitude >= 0 ? -85 : 85;
  return [[darkPoleLat, -360], ...curve, [darkPoleLat, 360]];
}

/**
 * Determine whether a spacecraft at (lat, lon, altitudeKm) is currently in
 * direct sunlight or inside Earth's cylindrical umbra shadow.
 */
export function isSpacecraftInSunlight(lat, lon, altitudeKm = 420, date = new Date()) {
  if (altitudeKm > 50000) return true; // Deep space / L2 stays illuminated

  const sun = getSubSolarPoint(date);
  const sLat = sun.latitude * DEG_TO_RAD;
  const sLon = sun.longitude * DEG_TO_RAD;
  const sunVec = [
    Math.cos(sLat) * Math.cos(sLon),
    Math.cos(sLat) * Math.sin(sLon),
    Math.sin(sLat)
  ];

  const r = EARTH_RADIUS_KM + Math.max(0, altitudeKm);
  const pLat = lat * DEG_TO_RAD;
  const pLon = lon * DEG_TO_RAD;
  const satVec = [
    r * Math.cos(pLat) * Math.cos(pLon),
    r * Math.cos(pLat) * Math.sin(pLon),
    r * Math.sin(pLat)
  ];

  const dot = satVec[0] * sunVec[0] + satVec[1] * sunVec[1] + satVec[2] * sunVec[2];
  if (dot >= 0) return true;

  // Perpendicular distance from Earth's center to the anti-solar ray through the satellite
  const px = satVec[0] - dot * sunVec[0];
  const py = satVec[1] - dot * sunVec[1];
  const pz = satVec[2] - dot * sunVec[2];
  const perpDist = Math.sqrt(px * px + py * py + pz * pz);

  return perpDist > EARTH_RADIUS_KM;
}

/**
 * Geometric line-of-sight visibility radius along Earth's surface (in meters).
 * Returns null for high-altitude / deep-space observatories where a LEO ground
 * circle on a 2D map would be misleading.
 */
export function computeVisibilityRadiusMeters(altitudeKm) {
  if (!Number.isFinite(altitudeKm) || altitudeKm <= 0 || altitudeKm > 15000) {
    return null;
  }
  const centralAngleRad = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm));
  return Math.round(EARTH_RADIUS_KM * centralAngleRad * 1000);
}

/**
 * Haversine great-circle distance over Earth's surface in kilometres.
 */
export function computeGreatCircleDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const rLat1 = lat1 * DEG_TO_RAD;
  const rLat2 = lat2 * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return Math.round(EARTH_RADIUS_KM * c);
}

/**
 * Split a sequence of [lat, lon] points into separate polylines whenever consecutive
 * points cross the antimeridian (|deltaLon| > 180) so Leaflet never draws wrap streaks.
 */
export function splitAntimeridianPath(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const segments = [];
  let current = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (Math.abs(next[1] - prev[1]) > 180) {
      if (current.length > 0) segments.push(current);
      current = [next];
    } else {
      current.push(next);
    }
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * Compute antimeridian-safe great-circle arc segments between two coordinates.
 */
export function computeGreatCircleArc(lat1, lon1, lat2, lon2, steps = 40) {
  const phi1 = lat1 * DEG_TO_RAD;
  const lam1 = lon1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lam2 = lon2 * DEG_TO_RAD;

  const x1 = Math.cos(phi1) * Math.cos(lam1);
  const y1 = Math.cos(phi1) * Math.sin(lam1);
  const z1 = Math.sin(phi1);

  const x2 = Math.cos(phi2) * Math.cos(lam2);
  const y2 = Math.cos(phi2) * Math.sin(lam2);
  const z2 = Math.sin(phi2);

  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
  const omega = Math.acos(dot);

  if (omega < 1e-4) {
    return [[[lat1, lon1], [lat2, lon2]]];
  }

  const sinOmega = Math.sin(omega);
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const a = Math.sin((1 - f) * omega) / sinOmega;
    const b = Math.sin(f * omega) / sinOmega;
    const x = a * x1 + b * x2;
    const y = a * y1 + b * y2;
    const z = a * z1 + b * z2;
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD_TO_DEG;
    const lon = Math.atan2(y, x) * RAD_TO_DEG;
    points.push([lat, lon]);
  }

  return splitAntimeridianPath(points);
}

/**
 * Approximate orbital period in minutes using Kepler's third law,
 * with explicit handling for L2 halo / high elliptical missions.
 */
export function computeOrbitPeriodMinutes(altitudeKm, satId) {
  if (satId === 'jwst') return null; // L2 halo orbit (~6 months)
  if (satId === 'chandra') return 3850; // ~64.2 hours elliptical orbit
  const semiMajorAxis = EARTH_RADIUS_KM + Math.max(160, altitudeKm || 420);
  const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / EARTH_MU_KM3_S2);
  return Math.round(periodSeconds / 60);
}

/**
 * Coarse offline region / ocean label so everyday users immediately know where
 * over Earth a spacecraft is flying right now (in English, Sinhala, and Tamil).
 */
export function getApproximateRegion(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { en: 'Earth Orbit', si: 'පෘථිවි කක්ෂය', ta: 'பூமி சுற்றுப்பாதை' };
  }

  if (lat >= 66.5) {
    return { en: 'Arctic Region', si: 'ආක්ටික් කලාපය', ta: 'ஆர்க்டிக் பகுதி' };
  }
  if (lat <= -60) {
    return { en: 'Antarctica & Southern Ocean', si: 'ඇන්ටාක්ටිකාව සහ දකුණු සාගරය', ta: 'அண்டார்டிகா மற்றும் தென் பெருங்கடல்' };
  }

  // Highlight Sri Lanka & immediate surrounding sea first
  if (lat >= 4 && lat <= 11 && lon >= 77 && lon <= 84) {
    return { en: 'Near Sri Lanka', si: 'ශ්‍රී ලංකාව ආසන්නයේ', ta: 'இலங்கைக்கு அருகில்' };
  }
  // South Asia / India
  if (lat >= 6 && lat <= 36 && lon >= 65 && lon <= 95) {
    return { en: 'South Asia', si: 'දකුණු ආසියාව', ta: 'தெற்கு ஆசியா' };
  }
  // Southeast Asia
  if (lat >= -10 && lat <= 24 && lon > 95 && lon <= 140) {
    return { en: 'Southeast Asia', si: 'අග්නිදිග ආසියාව', ta: 'தென்கிழக்கு ஆசியா' };
  }
  // East Asia
  if (lat > 24 && lat <= 55 && lon > 95 && lon <= 150) {
    return { en: 'East Asia', si: 'නැගෙනහිර ආසියාව', ta: 'கிழக்கு ஆசியா' };
  }
  // Middle East
  if (lat >= 12 && lat <= 42 && lon >= 34 && lon < 65) {
    return { en: 'Middle East', si: 'මැදපෙරදිග', ta: 'மத்திய கிழக்கு' };
  }
  // Europe
  if (lat >= 36 && lat < 66.5 && lon >= -12 && lon <= 45) {
    return { en: 'Europe', si: 'යුරෝපය', ta: 'ஐரோப்பா' };
  }
  // Central & North Asia
  if (lat > 36 && lat < 66.5 && lon > 45 && lon <= 150) {
    return { en: 'Central & North Asia', si: 'මධ්‍යම සහ උතුරු ආසියාව', ta: 'மத்திய மற்றும் வடக்கு ஆசியா' };
  }
  // Africa
  if (lat >= -35 && lat < 36 && lon >= -18 && lon <= 52) {
    return { en: 'Africa', si: 'අප්‍රිකාව', ta: 'ஆப்பிரிக்கா' };
  }
  // Australia & Oceania
  if (lat >= -46 && lat < -10 && lon >= 112 && lon <= 179) {
    return { en: 'Australia & Oceania', si: 'ඕස්ට්‍රේලියාව සහ ඕෂනියාව', ta: 'ஆஸ்திரேலியா மற்றும் ஓசியானியா' };
  }
  // North America
  if (lat >= 23 && lat < 66.5 && lon >= -168 && lon <= -52) {
    return { en: 'North America', si: 'උතුරු ඇමරිකාව', ta: 'வட அமெரிக்கா' };
  }
  // Central America & Caribbean
  if (lat >= 7 && lat < 23 && lon >= -118 && lon <= -58) {
    return { en: 'Central America & Caribbean', si: 'මධ්‍යම ඇමරිකාව සහ කැරිබියන්', ta: 'மத்திய அமெரிக்கா மற்றும் கரீபியன்' };
  }
  // South America
  if (lat >= -56 && lat < 13 && lon >= -82 && lon <= -34) {
    return { en: 'South America', si: 'දකුණු ඇමරිකාව', ta: 'தென் அமெரிக்கா' };
  }
  // Major Oceans
  if (lat >= -60 && lat <= 30 && lon >= 20 && lon <= 120) {
    return { en: 'Indian Ocean', si: 'ඉන්දියන් සාගරය', ta: 'இந்தியப் பெருங்கடல்' };
  }
  if (lon >= -70 && lon <= 20) {
    return { en: 'Atlantic Ocean', si: 'අත්ලාන්තික් සාගරය', ta: 'அட்லாண்டிக் பெருங்கடல்' };
  }
  return { en: 'Pacific Ocean', si: 'පැසිෆික් සාගරය', ta: 'பசிபிக் பெருங்கடல்' };
}

/**
 * Format latitude/longitude with localized N/S/E/W compass suffix.
 */
export function formatCoordinate(value, axis, lang = 'en') {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value).toFixed(2);
  const suffixes = {
    en: { N: 'N', S: 'S', E: 'E', W: 'W' },
    si: { N: 'උතුරු', S: 'දකුණු', E: 'නැගෙ.', W: 'බටහිර' },
    ta: { N: 'வடக்கு', S: 'தெற்கு', E: 'கிழக்கு', W: 'மேற்கு' }
  };
  const s = suffixes[lang] || suffixes.en;
  if (axis === 'lat') {
    return `${abs}° ${value >= 0 ? s.N : s.S}`;
  }
  return `${abs}° ${value >= 0 ? s.E : s.W}`;
}
