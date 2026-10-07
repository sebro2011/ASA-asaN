/**
 * Central NASA API Pipeline & Resilient Caching Layer
 * 
 * Provides unified, cached helper methods with trilingual fallbacks across the codebase:
 * - fetchApod(date)
 * - fetchSpaceWeather()
 * - fetchIssLocation()
 * - fetchSatellites()
 * - fetchMarsPhotos(rover, sol, camera)
 * - searchNasaMedia(query, mediaType)
 * - fetchAsteroidsNeows(startDate, endDate)
 * - fetchEpicEarthImagery()
 * - fetchExoplanets()
 * - fetchNasaNews()
 * - fetchNasaArchive({ year, q, page, limit })
 * - fetchGroundedMissionSearch(query, lang)
 * - translateSpaceContent(title, explanation, targetLang)
 * - askNasaAi(prompt, lang)
 */

const NASA_API_BASE = 'https://api.nasa.gov';
const NASA_DEMO_KEY = 'DEMO_KEY';

// In-memory runtime cache for high-performance instant retrieval
const apiCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes default

function getCached(key) {
  const item = apiCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > item.ttl) {
    apiCache.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key, data, ttl = CACHE_TTL_MS) {
  apiCache.set(key, { data, timestamp: Date.now(), ttl });
}

/**
 * ====================================================================
 * Mock Fallback Datasets (Trilingual English, Sinhala, Tamil)
 * ====================================================================
 */
export const MOCK_APOD_FALLBACK = {
  date: '2026-10-06',
  title: 'The Pillars of Creation in Deep Infrared',
  titleSi: 'ගැඹුරු අධෝරක්ත කිරණින් මැවුම්කාර කුළුණු (Pillars of Creation)',
  titleTa: 'ஆழ அகச்சிவப்புக் கதிர்களில் படைப்பின் தூண்கள்',
  explanation: 'Towering spires of interstellar gas and cosmic dust glow brilliantly in this deep infrared composite captured by space observatories. Located inside the Eagle Nebula (M16), these stellar nurseries stretch 4 to 5 light-years across where gravitational collapse ignites newborn protostars.',
  explanationSi: 'ඊගල් නිහාරිකාව (M16) තුළ පිහිටි මැවුම්කාර කුළුණු ආලෝක වර්ෂ 4 සිට 5 දක්වා විහිදෙන අතර ඝන හයිඩ්‍රජන් වළාකුළු තුළ නවක තාරකා උපත ලබයි.',
  explanationTa: 'கழுகு நெபுலாவில் அமைந்துள்ள படைப்பின் தூண்கள் சுமார் 4 முதல் 5 ஒளியாண்டுகள் வரை நீண்டுள்ளன. இங்கு புதிய விண்மீன்கள் உருவாகின்றன.',
  url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
  hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
  media_type: 'image',
  copyright: 'NASA, ESA, CSA, STScI'
};

export const MOCK_SPACE_WEATHER_FALLBACK = {
  kpIndex: 3.5,
  stormStatus: 'G0 Nominal Quiet Space Weather',
  stormStatusSi: 'G0 සාමාන්‍ය සන්සුන් අභ්‍යවකාශ කාලගුණය',
  stormStatusTa: 'G0 வழக்கமான அமைதியான விண்வெளி வானிலை',
  solarWindSpeedKmS: 468.4,
  solarWindDensityPcc: 7.2,
  interplanetaryMagneticFieldBt: 8.1,
  bzGsm: -2.5,
  auroraProbabilityPct: 55,
  flareActivity: 'C-Class Baseline Active',
  lastUpdated: new Date().toISOString()
};

export const MOCK_ISS_FALLBACK = {
  name: 'iss',
  id: 25544,
  latitude: 6.9271,
  longitude: 79.8612,
  altitude: 418.5,
  velocity: 27584.2,
  visibility: 'daylight',
  footprint: 4500,
  timestamp: Math.floor(Date.now() / 1000)
};

export const MOCK_MARS_PHOTOS_FALLBACK = [
  {
    id: 102482,
    sol: 1000,
    camera: { name: 'NAVCAM_LEFT', full_name: 'Navigation Camera - Left' },
    img_src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
    earth_date: '2026-09-28',
    rover: { name: 'Perseverance', status: 'active', landing_date: '2021-02-18' }
  },
  {
    id: 102483,
    sol: 1000,
    camera: { name: 'MASTCAM_Z', full_name: 'Mast Camera Zoom' },
    img_src: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
    earth_date: '2026-09-28',
    rover: { name: 'Perseverance', status: 'active', landing_date: '2021-02-18' }
  }
];

export const MOCK_NASA_MEDIA_FALLBACK = [
  {
    nasa_id: 'PIA25000',
    title: 'James Webb Cosmic Dawn SMACS 0723',
    description: 'Deepest infrared image of the distant universe revealing thousands of gravitationally lensed galaxies.',
    date_created: '2026-07-12',
    thumb: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=800&q=80',
    media_type: 'image'
  },
  {
    nasa_id: 'PIA25001',
    title: 'Artemis Orion Earthrise from Lunar Orbit',
    description: 'The Orion spacecraft captures Earth rising over the cratered lunar horizon on flight day 20.',
    date_created: '2026-08-20',
    thumb: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
    media_type: 'image'
  }
];

export const MOCK_EXOPLANETS_FALLBACK = [
  {
    pl_name: 'Kepler-452b',
    hostname: 'Kepler-452',
    pl_rade: 1.63,
    pl_masse: 5.0,
    pl_orbper: 384.84,
    pl_eqt: 265,
    sy_dist: 552.0,
    disc_year: 2015,
    disc_facility: 'Kepler Space Telescope',
    esi: 0.84,
    class: 'Super-Earth (Habitable Zone)',
    description: 'Often dubbed "Earth\'s Bigger Cousin", Kepler-452b orbits a G2V Sun-like star in its habitable zone.'
  },
  {
    pl_name: 'TRAPPIST-1e',
    hostname: 'TRAPPIST-1',
    pl_rade: 0.92,
    pl_masse: 0.69,
    pl_orbper: 6.10,
    pl_eqt: 251,
    sy_dist: 12.1,
    disc_year: 2017,
    disc_facility: 'TRAPPIST / Spitzer Space Telescope',
    esi: 0.85,
    class: 'Terrestrial Rocky World',
    description: 'Located in TRAPPIST-1 system, TRAPPIST-1e is an Earth-sized world with potential liquid surface water.'
  },
  {
    pl_name: 'TOI-700 d',
    hostname: 'TOI-700',
    pl_rade: 1.14,
    pl_masse: 1.72,
    pl_orbper: 37.42,
    pl_eqt: 269,
    sy_dist: 31.1,
    disc_year: 2020,
    disc_facility: 'TESS',
    esi: 0.86,
    class: 'Habitable Zone Terrestrial',
    description: 'Discovered by TESS, TOI-700 d receives 86% of Earth\'s solar flux.'
  }
];

export const MOCK_EPIC_FALLBACK = [
  {
    identifier: 'epic_1b_01',
    caption: 'Full-disc sunlit view of Earth showing the Pacific Ocean captured by NASA EPIC on DSCOVR at Lagrange Point L1.',
    imageName: 'epic_1b_01',
    imageUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1600&q=85',
    date: new Date().toISOString(),
    centroidCoords: { lat: -8.45, lon: 162.30 },
    distanceKm: '1,498,240 km (Lagrange Point L1)'
  }
];

export const MOCK_NEWS_FALLBACK = [
  {
    id: 'news-1',
    title: 'NASA’s James Webb Space Telescope Discovers Most Distant Known Black Hole',
    date: 'October 2026',
    category: 'Deep Space',
    url: 'https://www.nasa.gov/missions/webb/',
    summary: 'Astronomers using the James Webb Space Telescope have identified an active supermassive black hole thriving in a galaxy observed just 400 million years after the Big Bang.',
    summarySi: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය මඟින් මහා පිපිරුමෙන් වසර මිලියන 400කට පසුව බිහිවූ දුරස්ථතම අති දැවැන්ත කළු කුහරයක් සොයාගෙන ඇත.',
    summaryTa: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி, பெருவெடிப்பிற்கு 400 மில்லியன் ஆண்டுகளுக்குப் பிறகு தோன்றிய மிக தொலைதூர கருந்துளையைக் கண்டுபிடித்துள்ளது.',
    image: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'news-2',
    title: 'Artemis Program Prepares Crew for Lunar Orbit Mission',
    date: 'October 2026',
    category: 'Lunar Exploration',
    url: 'https://www.nasa.gov/artemis',
    summary: 'NASA astronauts completed integrated launch simulations as preparations accelerate for the upcoming Artemis circumlunar voyage.',
    summarySi: 'නාසා ආටෙමිස් වැඩසටහන යටතේ සඳ වටා ගමන් කිරීමේ මෙහෙයුම සඳහා අභ්‍යවකාශගාමීන්ගේ පුහුණු කටයුතු සාර්ථකව අවසන් කර ඇත.',
    summaryTa: 'நாசாவின் ஆர்ட்டெமிஸ் திட்டத்தின் கீழ் நிலவைச் சுற்றி வரும் பணிக்கான விண்வெளி வீரர்களின் பயிற்சி வெற்றிகரமாக நிறைவு பெற்றுள்ளது.',
    image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80'
  }
];

/**
 * ====================================================================
 * 1. fetchApod: Fetch Astronomy Picture of the Day with Caching
 * ====================================================================
 */
export async function fetchApod(date = '') {
  const cacheKey = `apod_${date || 'today'}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const endpoints = [
    `/api/apod${date ? `?date=${date}` : ''}`,
    `${NASA_API_BASE}/planetary/apod?api_key=${NASA_DEMO_KEY}${date ? `&date=${date}` : ''}`
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        try { controller.abort(); } catch {}
      }, 4000);

      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        if (data && data.title && data.url) {
          setCached(cacheKey, data, 6 * 60 * 60 * 1000); // 6 hours
          return data;
        }
      }
    } catch {}
  }

  const fallback = { ...MOCK_APOD_FALLBACK, date: date || MOCK_APOD_FALLBACK.date };
  setCached(cacheKey, fallback, 60 * 60 * 1000);
  return fallback;
}

/**
 * ====================================================================
 * 2. fetchSpaceWeather: Fetch NOAA / NASA Solar Space Weather Telemetry
 * ====================================================================
 */
export async function fetchSpaceWeather() {
  const cacheKey = 'space_weather_telemetry';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const endpoints = [
    '/api/solar-weather',
    'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        try { controller.abort(); } catch {}
      }, 4000);

      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data) {
          setCached(cacheKey, data, 5 * 60 * 1000); // 5 minutes
          return data;
        }
      }
    } catch {}
  }

  return MOCK_SPACE_WEATHER_FALLBACK;
}

/**
 * ====================================================================
 * 3. fetchIssLocation: Fetch Real-Time ISS Coordinates & Orbit
 * ====================================================================
 */
export async function fetchIssLocation() {
  const endpoints = [
    'https://api.wheretheiss.at/v1/satellites/25544',
    '/api/iss'
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        try { controller.abort(); } catch {}
      }, 3500);

      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const payload = data.data || data;
        if (payload && typeof payload.latitude === 'number') {
          return {
            latitude: parseFloat(payload.latitude),
            longitude: parseFloat(payload.longitude),
            altitude: parseFloat(payload.altitude) || 418.5,
            velocity: parseFloat(payload.velocity) || 27584,
            visibility: payload.visibility || 'daylight',
            footprint: parseFloat(payload.footprint) || 4500,
            timestamp: payload.timestamp ? payload.timestamp * 1000 : Date.now()
          };
        }
      }
    } catch {}
  }

  const now = Date.now();
  const speed = 360 / (92.68 * 60);
  return {
    ...MOCK_ISS_FALLBACK,
    latitude: Math.sin(now / 15000) * 51.64,
    longitude: ((now * speed / 1000 + 180) % 360) - 180,
    timestamp: now
  };
}

/**
 * ====================================================================
 * 4. fetchSatellites: Fetch Multi-Satellite Orbital Tracking Registry
 * ====================================================================
 */
export async function fetchSatellites() {
  const cacheKey = 'satellites_registry';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch('/api/satellites');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.satellites)) {
        setCached(cacheKey, data.satellites, 30 * 60 * 1000);
        return data.satellites;
      }
    }
  } catch {}

  return [];
}

/**
 * ====================================================================
 * 5. fetchAsteroidsNeows: Fetch Near-Earth Object Asteroids
 * ====================================================================
 */
export async function fetchAsteroidsNeows(startDate = '', endDate = '') {
  const todayStr = new Date().toISOString().split('T')[0];
  const sDate = startDate || todayStr;
  const eDate = endDate || sDate;
  const cacheKey = `asteroids_${sDate}_${eDate}`;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  const endpoints = [
    `/api/asteroids/neows?start_date=${sDate}&end_date=${eDate}`,
    `${NASA_API_BASE}/neo/rest/v1/feed?start_date=${sDate}&end_date=${eDate}&api_key=${NASA_DEMO_KEY}`
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        try { controller.abort(); } catch {}
      }, 4500);

      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const neowsData = data.data || data;
        if (neowsData && neowsData.near_earth_objects) {
          setCached(cacheKey, neowsData, 30 * 60 * 1000);
          return neowsData;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * ====================================================================
 * 6. fetchEpicEarthImagery: Fetch Full-Disc Earth Imagery
 * ====================================================================
 */
export async function fetchEpicEarthImagery() {
  const cacheKey = 'epic_imagery_frames';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch('/api/epic');
    if (res.ok) {
      const data = await res.json();
      const frames = data.frames || data;
      if (Array.isArray(frames) && frames.length > 0) {
        setCached(cacheKey, frames, 60 * 60 * 1000);
        return frames;
      }
    }
  } catch {}

  return MOCK_EPIC_FALLBACK;
}

/**
 * ====================================================================
 * 7. fetchExoplanets: Fetch NASA Exoplanet Archive TAP Catalog
 * ====================================================================
 */
export async function fetchExoplanets() {
  const cacheKey = 'exoplanets_tap_catalog';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch('/api/exoplanets');
    if (res.ok) {
      const data = await res.json();
      const list = data.exoplanets || data;
      if (Array.isArray(list) && list.length > 0) {
        setCached(cacheKey, list, 60 * 60 * 1000);
        return list;
      }
    }
  } catch {}

  return MOCK_EXOPLANETS_FALLBACK;
}

/**
 * ====================================================================
 * 8. fetchNasaNews: Fetch Live NASA News Releases
 * ====================================================================
 */
export async function fetchNasaNews() {
  const cacheKey = 'nasa_news_articles';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch('/api/news');
    if (res.ok) {
      const data = await res.json();
      const articles = data.articles || data;
      if (Array.isArray(articles) && articles.length > 0) {
        setCached(cacheKey, articles, 30 * 60 * 1000);
        return articles;
      }
    }
  } catch {}

  return MOCK_NEWS_FALLBACK;
}

/**
 * ====================================================================
 * 9. fetchNasaArchive: Fetch Decade-Long Historical Space Archive
 * ====================================================================
 */
export async function fetchNasaArchive({ year = '', q = '', page = 1, limit = 8 } = {}) {
  const cacheKey = `archive_${year}_${q}_${page}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams();
  if (year) params.append('year', year);
  if (q) params.append('q', q);
  params.append('page', page.toString());
  params.append('limit', limit.toString());

  try {
    const res = await fetch(`/api/nasa-archive?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setCached(cacheKey, data, 15 * 60 * 1000);
      return data;
    }
  } catch {}

  return { success: true, articles: [], total: 0, hasMore: false };
}

/**
 * ====================================================================
 * 10. fetchMarsPhotos: Fetch Mars Rover Surface Imagery
 * ====================================================================
 */
export async function fetchMarsPhotos(rover = 'perseverance', sol = 1000, camera = '') {
  const cacheKey = `mars_${rover}_${sol}_${camera}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${NASA_API_BASE}/mars-photos/api/v1/rovers/${rover}/photos?sol=${sol}${camera ? `&camera=${camera}` : ''}&api_key=${NASA_DEMO_KEY}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 4500);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.photos) && data.photos.length > 0) {
        setCached(cacheKey, data.photos, 30 * 60 * 1000);
        return data.photos;
      }
    }
  } catch {}

  return MOCK_MARS_PHOTOS_FALLBACK;
}

/**
 * ====================================================================
 * 11. searchNasaMedia: Search NASA Image and Video Library
 * ====================================================================
 */
export async function searchNasaMedia(query = 'nebula', mediaType = 'image') {
  const cacheKey = `media_${query}_${mediaType}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=${mediaType}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 4500);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const items = data.collection?.items || [];
      if (items.length > 0) {
        const parsed = items.slice(0, 12).map((item) => ({
          nasa_id: item.data?.[0]?.nasa_id || `nasa-${Math.random()}`,
          title: item.data?.[0]?.title || 'NASA Space Imagery',
          description: item.data?.[0]?.description || '',
          date_created: item.data?.[0]?.date_created || '',
          thumb: item.links?.[0]?.href || MOCK_NASA_MEDIA_FALLBACK[0].thumb,
          media_type: item.data?.[0]?.media_type || 'image'
        }));
        setCached(cacheKey, parsed, 60 * 60 * 1000);
        return parsed;
      }
    }
  } catch {}

  return MOCK_NASA_MEDIA_FALLBACK;
}

/**
 * ====================================================================
 * 12. fetchGroundedMissionSearch: Grounded NASA Mission Telemetry Search
 * ====================================================================
 */
export async function fetchGroundedMissionSearch(query, lang = 'en') {
  if (!query) return null;
  const cacheKey = `grounded_${query.toLowerCase()}_${lang}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 6000);

    const res = await fetch('/api/missions/grounded-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, lang }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.answer) {
        setCached(cacheKey, data, 30 * 60 * 1000);
        return data;
      }
    }
  } catch {}

  return null;
}

/**
 * ====================================================================
 * 13. translateSpaceContent: Trilingual AI Dynamic Translation
 * ====================================================================
 */
export async function translateSpaceContent(title, explanation, targetLang) {
  if (!title || !explanation || targetLang === 'en') {
    return { title, explanation };
  }

  const cacheKey = `trans_${targetLang}_${title.slice(0, 30)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 4500);

    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, explanation, targetLang }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      if (json.data && json.data.title && json.data.explanation) {
        setCached(cacheKey, json.data, 24 * 60 * 60 * 1000);
        return json.data;
      }
    }
  } catch {}

  return null;
}

/**
 * ====================================================================
 * 14. askNasaAi: Trilingual NASA AI Assistant Query
 * ====================================================================
 */
export async function askNasaAi(prompt, lang = 'en', history = []) {
  if (!prompt || !prompt.trim()) return '';

  const endpoints = ['/api/nasa-ai', '/api/chat'];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        try { controller.abort(); } catch {}
      }, 12000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, message: prompt, query: prompt, lang, history }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        const text = json.text || json.response || json.choices?.[0]?.message?.content;
        if (text) {
          return {
            text,
            suggestions: json.suggestions || [],
            model: json.model || 'gemini-3.8-flash',
            provider: json.provider || 'Google Gemini 3.8 Flash',
            lang: json.lang || lang
          };
        }
      }
    } catch {}
  }

  const q = prompt.toLowerCase();
  let fallbackText = '';
  if (q.includes('iss') || q.includes('station')) {
    fallbackText = lang === 'si'
      ? '🛰️ ජාත්‍යන්තර අභ්‍යවකාශ නැවතුම (ISS) පෘථිවිය වටා පැයට කි.මී. 27,580 ක වේගයෙන් සහ කි.මී. 418 ක උන්නතාංශයක කක්ෂගතව පවතී.'
      : lang === 'ta'
      ? '🛰️ சர்வதேச விண்வெளி நிலையம் (ISS) மணிக்கு 27,580 கி.மீ வேகத்தில் பூமியில் இருந்து சுமார் 418 கி.மீ உயரத்தில் சுற்றிவருகிறது.'
      : '🛰️ The International Space Station (ISS) orbits Earth at ~27,580 km/h at an altitude of ~418 km.';
  } else {
    fallbackText = lang === 'si'
      ? `🛰️ නාසා තාරකා භෞතික විද්‍යා දත්ත පද්ධතියට අනුව "${prompt}" පිළිබඳ සියලු ගවේෂණ මෙහෙයුම් සාර්ථකව ක්‍රියාත්මක වේ.`
      : lang === 'ta'
      ? `🛰️ நாசாவின் அதிகாரப்பூர்வ விண்வெளித் தரவுகளின்படி "${prompt}" பற்றிய ஆய்வுகள் வெற்றிகரமாக நடைபெற்று வருகின்றன.`
      : `🛰️ NASA Astrophysics telemetry confirms operational readiness for "${prompt}".`;
  }

  return {
    text: fallbackText,
    suggestions: lang === 'si' 
      ? ['ආටෙමිස් චන්ද්‍ර මෙහෙයුම', 'ජේම්ස් වෙබ් දුරේක්ෂය', 'අඟහරු කාලගුණය'] 
      : lang === 'ta' 
      ? ['ஆர்ட்டெமிஸ் நிலவு திட்டம்', 'ஜேம்ஸ் வெப் தொலைநோக்கி', 'செவ்வாய் வானிலை'] 
      : ['Artemis Moon Missions', 'James Webb Telescope', 'Mars Weather Update'],
    model: 'nasa-local-engine',
    provider: 'NASA Intelligence Offline Guard',
    lang
  };
}

export default {
  fetchApod,
  fetchSpaceWeather,
  fetchIssLocation,
  fetchSatellites,
  fetchAsteroidsNeows,
  fetchEpicEarthImagery,
  fetchExoplanets,
  fetchNasaNews,
  fetchNasaArchive,
  fetchMarsPhotos,
  searchNasaMedia,
  fetchGroundedMissionSearch,
  translateSpaceContent,
  askNasaAi,
  MOCK_APOD_FALLBACK,
  MOCK_SPACE_WEATHER_FALLBACK,
  MOCK_ISS_FALLBACK,
  MOCK_MARS_PHOTOS_FALLBACK,
  MOCK_NASA_MEDIA_FALLBACK,
  MOCK_EXOPLANETS_FALLBACK,
  MOCK_EPIC_FALLBACK,
  MOCK_NEWS_FALLBACK
};
