/**
 * IndexedDB Caching Utility for NASA APOD and News API Data
 * 
 * Features:
 * - Native browser IndexedDB with Promise-based asynchronous transactions
 * - 6-hour TTL expiration policy for instant loading without external API calls
 * - In-memory Map fallback for SSR or environments with restricted storage
 * - Hardcoded Sinhala (si), Tamil (ta), and English (en) mock space data fallbacks
 */

const DB_NAME = 'NASA_SPACE_EXPLORATION_CACHE';
const DB_VERSION = 1;
const APOD_STORE = 'apod_cache';
const NEWS_STORE = 'news_cache';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000; // 6 hours

// In-memory fallback if IndexedDB is unavailable
const memoryFallback = new Map();

/**
 * Hardcoded Trilingual Mock Space Data Fallbacks
 */
export const HARDCODED_MOCK_APOD = {
  en: {
    date: '2026-10-04',
    title: 'The Pillars of Creation in Deep Infrared',
    explanation: 'Towering tendrils of cosmic dust and gas glow brilliantly in this deep infrared composite captured by space observatories. Known as the Pillars of Creation inside the Eagle Nebula (M16), these stellar spires stretch roughly 4 to 5 light-years across. Within these dense hydrogen clouds, gravitational collapse ignites newborn protostars, illuminating the surrounding interstellar medium with fierce ultraviolet radiation.',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA, ESA, CSA, STScI'
  },
  si: {
    date: '2026-10-04',
    title: 'ගැඹුරු අධෝරක්ත කිරණින් මැවුම්කාර කුළුණු (Pillars of Creation)',
    explanation: 'අභ්‍යවකාශ දුරේක්ෂ මගින් ග්‍රහණය කරගත් මෙම ගැඹුරු අධෝරක්ත සංයුක්ත ඡායාරූපයෙහි කොස්මික් දූවිලි හා වායු තීරුවල විස්මිත දීප්තිය මනාව දිස්වේ. ඊගල් නිහාරිකාව (M16) තුළ පිහිටි මැවුම්කාර කුළුණු ආලෝක වර්ෂ 4 සිට 5 දක්වා විහිදේ. මෙම ඝන හයිඩ්‍රජන් වළාකුළු තුළ සිදුවන ගුරුත්වාකර්ෂණ හැකිලීම මගින් නවක තාරකා උපත ලබන අතර ප්‍රබල පාරජම්බුල විකිරණ අවට මුදාහරිමින් ආලෝකමත් කරයි.',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'නාසා, යුරෝපානු අභ්‍යවකාශ ඒජන්සිය (NASA, ESA, STScI)'
  },
  ta: {
    date: '2026-10-04',
    title: 'ஆழ அகச்சிவப்புக் கதிர்களில் படைப்பின் தூண்கள் (Pillars of Creation)',
    explanation: 'விண்வெளி தொலைநோக்கிகளால் பதிவு செய்யப்பட்ட இந்த ஆழ அகச்சிவப்பு வண்ணப் படத்தில் காஸ்மிக் தூசு மற்றும் வாயு தூண்கள் அற்புதமான பிரகாசத்துடன் ஒளிர்கின்றன. கழுகு நெபுலாவில் (M16) அமைந்துள்ள படைப்பின் தூண்கள் சுமார் 4 முதல் 5 ஒளியாண்டுகள் வரை நீண்டுள்ளன. இந்த அடர்ந்த ஹைட்ரஜன் மேகங்களுக்குள் புவியீர்ப்பு சுருக்கம் காரணமாக புதிய விண்மீன்கள் உருவாகி தீவிர புற ஊதா கதிர்வீச்சை வெளியிடுகின்றன.',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'நாசா, ஐரோப்பிய விண்வெளி நிறுவனம் (NASA, ESA, STScI)'
  }
};

export const HARDCODED_MOCK_NEWS = {
  en: [
    {
      guid: 'news-mock-1-en',
      title: 'NASA’s James Webb Telescope Discovers Atmospheric Water Vapor on Habitable Exoplanet',
      description: 'Spectroscopic transmission analysis by Webb reveals rich atmospheric methane and water vapor signatures within the temperate habitable zone of exoplanet K2-18b, marking a major milestone in astrobiology.',
      pubDate: 'Mon, 05 Oct 2026 12:00:00 GMT',
      link: 'https://www.nasa.gov/news-release/',
      thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
      category: 'Exoplanets & Astrobiology'
    },
    {
      guid: 'news-mock-2-en',
      title: 'Artemis Lunar Base Camp: Astronaut Surface Exploration Systems Pass Final Testing',
      description: 'NASA and international partner agencies conclude vacuum thermal endurance verification of the Lunar Terrain Vehicle and pressurized rover habitat modules for upcoming human expeditions.',
      pubDate: 'Sun, 04 Oct 2026 18:30:00 GMT',
      link: 'https://www.nasa.gov/news-release/',
      thumbnail: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=800&q=80',
      category: 'Artemis Lunar Program'
    },
    {
      guid: 'news-mock-3-en',
      title: 'Perseverance Rover Unearths Ancient Sedimentary Mudstones in Mars Jezero Crater',
      description: 'Core sample analysis confirms fine-grained deltaic mudstones deposited during Mars’s warm, wet fluvial era over 3.5 billion years ago, preserving vital prebiotic organic chemistry.',
      pubDate: 'Sat, 03 Oct 2026 09:15:00 GMT',
      link: 'https://www.nasa.gov/news-release/',
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
      category: 'Mars Exploration'
    }
  ],
  si: [
    {
      guid: 'news-mock-1-si',
      title: 'ජේම්ස් වෙබ් දුරේක්ෂය මඟින් වාසයට සුදුසු බාහිර ග්‍රහලෝකයක ජල වාෂ්ප හඳුනාගනී',
      description: 'K2-18b නම් බාහිර ග්‍රහලෝකයේ වායුගෝලීය වර්ණාවලි පරීක්ෂණ මඟින් මීතේන් සහ ජල වාෂ්ප සාන්ද්‍රණය තහවුරු කර ඇති අතර එය ජීවය සෙවීමේ අභ්‍යවකාශ ගවේෂණයේ දැවැන්ත සන්ධිස්ථානයකි.',
      pubDate: '2026 ඔක්තෝබර් 05',
      link: 'https://www.nasa.gov/news-release/',
      thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
      category: 'බාහිර ග්‍රහලෝක ගවේෂණය'
    },
    {
      guid: 'news-mock-2-si',
      title: 'ආටෙමිස් චන්ද්‍ර කඳවුර: ගගනගාමීන්ගේ සඳමත ගමන් වාහන අවසන් පරීක්ෂණ සාර්ථකයි',
      description: 'නාසා ආයතනය සහ ජාත්‍යන්තර අභ්‍යවකාශ සහකරුවන් විසින් චන්ද්‍ර මතුපිට ගවේෂණ වාහන සහ පීඩන කුටි මොඩියුලවල රික්තක තාප ප්‍රතිරෝධී පරීක්ෂණ සාර්ථකව අවසන් කර ඇත.',
      pubDate: '2026 ඔක්තෝබර් 04',
      link: 'https://www.nasa.gov/news-release/',
      thumbnail: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=800&q=80',
      category: 'ආටෙමිස් මෙහෙයුම'
    },
    {
      guid: 'news-mock-3-si',
      title: 'පර්සවරන්ස් රෝවරය අඟහරු මතින් වසර බිලියන 3.5ක් පැරණි අවසාදිත පාෂාණ සොයාගනී',
      description: 'ජෙසීරෝ ආවාටයේ වියළි ඩෙල්ටා කලාපයෙන් ලබාගත් පාෂාණ සාම්පල පරීක්ෂා කිරීමේදී පුරාණ ක්ෂුද්‍ර ජීවී අංශු පිළිබඳ රසායනික සාධක රැඳී තිබිය හැකි අවසාදිත හමුවී ඇත.',
      pubDate: '2026 ඔක්තෝබර් 03',
      link: 'https://www.nasa.gov/news-release/',
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
      category: 'අඟහරු ගවේෂණය'
    }
  ],
  ta: [
    {
      guid: 'news-mock-1-ta',
      title: 'ஜேம்ஸ் வெப் தொலைநோக்கி வாழக்கூடிய புறக்கோளில் நீராவி இருப்பதைக் கண்டுபிடித்தது',
      description: 'K2-18b புறக்கோளின் வளிமண்டலத்தில் மீத்தேன் மற்றும் நீராவி இருப்பதற்கான துல்லியமான சான்றுகளை ஜேம்ஸ் வெப் தொலைநோக்கி கண்டறிந்து புதிய வரலாற்று மைல்கல்லை எட்டியுள்ளது.',
      pubDate: '05 அக்டோபர் 2026',
      link: 'https://www.nasa.gov/news-release/',
      thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
      category: 'புறக்கோள் வானியல்'
    },
    {
      guid: 'news-mock-2-ta',
      title: 'ஆர்ட்டெமிஸ் நிலவு முகாம்: விண்வெளி வீரர்கள் ஆய்வு வாகனங்களின் இறுதி சோதனை நிறைவு',
      description: 'நிலவின் தென் துருவத்தில் எதிர்கால மனித ஆய்வுப் பயணங்களுக்காக வடிவமைக்கப்பட்ட நிலப்பரப்பு வாகனங்கள் மற்றும் அழுத்த கட்டுப்பாட்டு அறைகளின் வெப்ப வெற்றிட சோதனைகள் வெற்றிகரமாக நிறைவுற்றன.',
      pubDate: '04 அக்டோபர் 2026',
      link: 'https://www.nasa.gov/news-release/',
      thumbnail: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=800&q=80',
      category: 'ஆர்ட்டெமிஸ் நிலவுத் திட்டம்'
    },
    {
      guid: 'news-mock-3-ta',
      title: 'பெர்சிவரன்ஸ் ரோவர் செவ்வாய் கிரகத்தில் 3.5 பில்லியன் ஆண்டுகள் பழமையான வண்டல் பாறைகளை கண்டறிந்தது',
      description: 'ஜெசிரோ பள்ளத்தில் உள்ள பண்டைய ஆற்றுப் படுகையில் இருந்து எடுக்கப்பட்ட பாறை மாதிரிகள் பழங்கால நுண்ணுயிர் வேதியியல் தடயங்களை ஆய்வு செய்வதற்கு புதிய நம்பிக்கையை அளித்துள்ளன.',
      pubDate: '03 அக்டோபர் 2026',
      link: 'https://www.nasa.gov/news-release/',
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
      category: 'செவ்வாய் கிரக ஆய்வு'
    }
  ]
};

/**
 * Open or create the IndexedDB instance
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported or running on server'));
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(APOD_STORE)) {
          db.createObjectStore(APOD_STORE, { keyPath: 'cacheKey' });
        }
        if (!db.objectStoreNames.contains(NEWS_STORE)) {
          db.createObjectStore(NEWS_STORE, { keyPath: 'cacheKey' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
      request.onblocked = () => resolve(request.result);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Get APOD data from IndexedDB cache if under 6 hours old
 * @param {string} [date] - Specific YYYY-MM-DD date or 'today'
 * @returns {Promise<{ data: Object, isFresh: boolean, timestamp: number } | null>}
 */
export async function getCachedApod(date = 'today') {
  const key = date || 'today';

  // 1. Try IndexedDB
  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(APOD_STORE, 'readonly');
      const store = tx.objectStore(APOD_STORE);
      const req = store.get(key);

      req.onsuccess = () => {
        const entry = req.result;
        if (!entry || !entry.data || !entry.timestamp) {
          resolve(null);
          return;
        }

        const age = Date.now() - entry.timestamp;
        const isFresh = age < SIX_HOURS_MS;

        // If under 6 hours old, serve instantly without calling external APIs
        if (isFresh) {
          resolve({
            data: entry.data,
            isFresh: true,
            timestamp: entry.timestamp,
            ageMinutes: Math.floor(age / 60000)
          });
        } else {
          // Stale, return stale indicator so caller can refresh or use as fallback
          resolve({
            data: entry.data,
            isFresh: false,
            timestamp: entry.timestamp,
            ageMinutes: Math.floor(age / 60000)
          });
        }
      };

      req.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    // 2. Fall back to in-memory cache
    const memEntry = memoryFallback.get(`apod:${key}`);
    if (memEntry && memEntry.data && memEntry.timestamp) {
      const age = Date.now() - memEntry.timestamp;
      return {
        data: memEntry.data,
        isFresh: age < SIX_HOURS_MS,
        timestamp: memEntry.timestamp,
        ageMinutes: Math.floor(age / 60000)
      };
    }
    return null;
  }
}

/**
 * Save fetched APOD json object with timestamp in IndexedDB
 * @param {string} [date] - Date string or 'today'
 * @param {Object} apodData - Raw APOD data object
 * @returns {Promise<boolean>}
 */
export async function setCachedApod(date = 'today', apodData) {
  if (!apodData || !apodData.title) return false;
  const key = date || apodData.date || 'today';
  const entry = {
    cacheKey: key,
    data: apodData,
    timestamp: Date.now()
  };

  // Always update memory fallback for ultra-fast sync lookups
  memoryFallback.set(`apod:${key}`, entry);

  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(APOD_STORE, 'readwrite');
      const store = tx.objectStore(APOD_STORE);
      const req = store.put(entry);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Get News items from IndexedDB cache if under 6 hours old
 * @param {string} [lang='en']
 * @returns {Promise<{ data: Array, isFresh: boolean, timestamp: number } | null>}
 */
export async function getCachedNews(lang = 'en') {
  const key = `news_${lang}`;

  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(NEWS_STORE, 'readonly');
      const store = tx.objectStore(NEWS_STORE);
      const req = store.get(key);

      req.onsuccess = () => {
        const entry = req.result;
        if (!entry || !Array.isArray(entry.data) || !entry.timestamp) {
          resolve(null);
          return;
        }

        const age = Date.now() - entry.timestamp;
        resolve({
          data: entry.data,
          isFresh: age < SIX_HOURS_MS,
          timestamp: entry.timestamp,
          ageMinutes: Math.floor(age / 60000)
        });
      };

      req.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    const memEntry = memoryFallback.get(`news:${key}`);
    if (memEntry && Array.isArray(memEntry.data)) {
      return {
        data: memEntry.data,
        isFresh: (Date.now() - memEntry.timestamp) < SIX_HOURS_MS,
        timestamp: memEntry.timestamp,
        ageMinutes: Math.floor((Date.now() - memEntry.timestamp) / 60000)
      };
    }
    return null;
  }
}

/**
 * Save fetched NASA News items with timestamp in IndexedDB
 * @param {string} [lang='en']
 * @param {Array} newsItems
 * @returns {Promise<boolean>}
 */
export async function setCachedNews(lang = 'en', newsItems) {
  if (!Array.isArray(newsItems) || newsItems.length === 0) return false;
  const key = `news_${lang}`;
  const entry = {
    cacheKey: key,
    data: newsItems,
    timestamp: Date.now()
  };

  memoryFallback.set(`news:${key}`, entry);

  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(NEWS_STORE, 'readwrite');
      const store = tx.objectStore(NEWS_STORE);
      const req = store.put(entry);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Get gracefully localized mock space data fallback
 * @param {string} [lang='en'] - 'en' | 'si' | 'ta'
 * @returns {Object}
 */
export function getMockApodFallback(lang = 'en') {
  const code = (lang || 'en').slice(0, 2);
  return HARDCODED_MOCK_APOD[code] || HARDCODED_MOCK_APOD.en;
}

/**
 * Get gracefully localized mock news items fallback
 * @param {string} [lang='en'] - 'en' | 'si' | 'ta'
 * @returns {Array}
 */
export function getMockNewsFallback(lang = 'en') {
  const code = (lang || 'en').slice(0, 2);
  return HARDCODED_MOCK_NEWS[code] || HARDCODED_MOCK_NEWS.en;
}

export default {
  getCachedApod,
  setCachedApod,
  getCachedNews,
  setCachedNews,
  getMockApodFallback,
  getMockNewsFallback,
  HARDCODED_MOCK_APOD,
  HARDCODED_MOCK_NEWS
};
