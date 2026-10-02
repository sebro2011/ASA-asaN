/**
 * Standalone Local Space AI Knowledge Base & Intent Engine
 * 
 * 100% Client/Local Server Standalone - ZERO external API dependencies
 * No OPENROUTER_API_KEY or GEMINI_API_KEY required.
 * Instant zero-latency responses with rich scientific accuracy and trilingual support (English, Sinhala, Tamil).
 */

// Language detector helper
export function detectLanguage(text = '') {
  const str = String(text);
  // Sinhala unicode range: \u0D80-\u0DFF
  if (/[\u0D80-\u0DFF]/.test(str)) {
    return 'si';
  }
  // Tamil unicode range: \u0B80-\u0BFF
  if (/[\u0B80-\u0BFF]/.test(str)) {
    return 'ta';
  }

  // Singlish keyword patterns
  const singlishTokens = ['kohomada', 'mokakda', 'mokadda', 'monawada', 'kiyanna', 'sada', 'tharu', 'grahaloka', 'avakasaya', 'karanna'];
  const lower = str.toLowerCase();
  for (const token of singlishTokens) {
    if (lower.includes(token)) return 'si';
  }

  // Tanglish keyword patterns
  const tanglishTokens = ['enna', 'eppadi', 'solla', 'nilavu', 'suriyan', 'vinveli', 'kandupidi', 'engae', 'irukku'];
  for (const token of tanglishTokens) {
    if (lower.includes(token)) return 'ta';
  }

  return 'en';
}

// Comprehensive NASA & Astrophysics Knowledge Base
export const SPACE_KNOWLEDGE_BASE = {
  // 1. ISS (International Space Station)
  iss: {
    keywords: [
      'iss', 'space station', 'international space station', 'orbit', 'astronaut', 'spacewalk', 'station',
      'අභ්‍යවකාශ නැවතුම්පොළ', 'අයිඑස්එස්', 'නැවතුම්පොළ', 'ගගනගාමී',
      'சர்வதேச விண்வெளி நிலையம்', 'விண்வெளி மையம்', 'விண்வெளி வீரர்'
    ],
    responses: {
      en: `🛰️ **International Space Station (ISS) Telemetry & Operations:**

• **Orbital Altitude:** Approximately **408 to 420 kilometers** above Earth in Low Earth Orbit (LEO).
• **Orbital Velocity:** Moving at **27,600 km/h (7.66 km/s)**, circling Earth every **90 to 92 minutes**.
• **Day/Night Cycle:** The resident astronauts witness **16 sunrises and 16 sunsets** every 24 hours.
• **Scientific Mission:** Operating as a microgravity laboratory hosting cutting-edge biological, material science, fluid dynamics, and astronomical payloads.
• **Human Presence:** Continuously inhabited since November 2000, serving as humanity's premier cooperative deep-space testbed.

💡 *Tip: You can track the real-time geographic position of the ISS on the "ISS Orbit" tab!*`,
      si: `🛰️ **ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය (ISS) තොරතුරු:**

• **කක්ෂීය උස:** පෘථිවි මතුපිට සිට සාමාන්‍යයෙන් **කිලෝමීටර 408 - 420 ක්** ඉහළින් පිහිටා ඇත.
• **කක්ෂීය වේගය:** පැයට **කි.මී. 27,600 ක (තත්පරයට කි.මී. 7.66)** අධික වේගයකින් පෘථිවිය වටා භ්‍රමණය වේ.
• **කාලපරිච්ඡේදය:** සෑම මිනිත්තු 90 කට වරක් පෘථිවිය වටා එක් වටයක් සම්පූර්ණ කරන අතර, ගගනගාමීන් දිනකට **හිරු උදාවීම් 16 ක් සහ හිරු බැසයෑම් 16 ක්** අත්විඳිති.
• **ප්‍රධාන අරමුණ:** ක්ෂුද්‍ර ගුරුත්වය (Microgravity) යටතේ ජීව විද්‍යාත්මක හා භෞතික විද්‍යාත්මක පරීක්ෂණ පැවැත්වීම.

💡 *සටහන: අපගේ යෙදුමේ "ISS Orbit" ටැබය හරහා ඔබට ISS හි සජීවී පිහිටීම සිතියම මත නැරඹිය හැක!*`,
      ta: `🛰️ **சர்வதேச விண்வெளி நிலையம் (ISS) நேரலை அளவீடுகள்:**

• **சுற்றுப்பாதை உயரம்:** பூமியின் மேற்பரப்பில் இருந்து சுமார் **408 முதல் 420 கி.மீ** உயரத்தில் சுற்றி வருகிறது.
• **சுற்றுப்பாதை வேகம்:** மணிக்கு **27,600 கி.மீ (விநாடிக்கு 7.66 கி.மீ)** வேகத்தில் பூமியைச் சுற்றுகிறது.
• **சுழற்சி காலம்:** ஒவ்வொரு **90 நிமிடங்களுக்கும்** ஒருமுறை பூமியை முழுமையாக சுற்றி வருகிறது; விண்வெளி வீரர்கள் ஒரு நாளில் **16 சூரிய உதயங்களையும், 16 சூரிய அஸ்தமனங்களையும்** காண்கிறார்கள்.
• **முதன்மை நோக்கம்:** புவியீர்ப்பு விசை குறைந்த சூழலில் (microgravity) உயிரியல், மருத்துவம் மற்றும் இயற்பியல் ஆராய்ச்சிகளை மேற்கொள்வது.

💡 *குறிப்பு: இந்த தளத்தில் உள்ள "ISS Orbit" பக்கத்தில் சர்வதேச விண்வெளி நிலையத்தின் நேரலை நிலையை நேரடியாகக் காணலாம்!*`
    }
  },

  // 2. Mars Rovers & Exploration
  mars: {
    keywords: [
      'mars', 'rover', 'perseverance', 'curiosity', 'jezero', 'ingenuity', 'red planet', 'opportunity', 'spirit',
      'අඟහරු', 'රෝවරය', 'පර්සවරන්ස්', 'කියුරියෝසිටි', 'රතු ග්‍රහලෝකය',
      'செவ்வாய்', 'ரோவர்', 'பெர்சிவரன்ஸ்', 'கியூரியோசிட்டி', 'சிவப்பு கிரகம்'
    ],
    responses: {
      en: `🔴 **NASA Mars Surface Exploration (Perseverance & Curiosity):**

• **Perseverance Rover:** Landed in **Jezero Crater** on February 18, 2021. It is currently drilling rock core samples to search for ancient biosignatures of microbial life in an ancient dried river delta.
• **Ingenuity Mars Helicopter:** Achieved the historic first powered, controlled flight on another planet, completing **72 flights** across the Martian skies.
• **Curiosity Rover:** Exploring **Gale Crater** and climbing the slopes of Mount Sharp since August 2012, discovering evidence of persistent liquid fresh-water lakes in Mars' ancient past.
• **Atmospheric Conditions:** Mars has a thin, mostly carbon dioxide atmosphere (95% CO₂) with surface pressure less than 1% of Earth's and average temperatures of -63°C (-81°F).`,
      si: `🔴 **නාසා අඟහරු ගවේෂණ මෙහෙයුම් (Perseverance & Curiosity):**

• **Perseverance රෝවරය:** 2021 පෙබරවාරි 18 දින **ජෙසෙරෝ ආවාටයට (Jezero Crater)** ගොඩබසින ලදී. අතීත ක්ෂුද්‍ර ජීවී සාක්ෂි සෙවීම සඳහා පාෂාණ සාම්පල එකතු කරමින් පවතී.
• **Ingenuity හෙලිකොප්ටරය:** වෙනත් ග්‍රහලෝකයක පියාසර කළ පළමු ගුවන් යානය වන මෙය අඟහරු මත සාර්ථක ගුවන් ගමන් **72 ක්** වාර්තා කළේය.
• **Curiosity රෝවරය:** 2012 වසරේ සිට **ගේල් ආවාටයේ (Gale Crater)** ක්‍රියාත්මක වන අතර අඟහරු මත අතීතයේ ද්‍රව ජලය පැවති බවට තහවුරු කළේය.
• **පරිසරය:** අඟහරු වායුගෝලයෙන් 95% කට වඩා කාබන් ඩයොක්සයිඩ් වලින් සමන්විත වන අතර සාමාන්‍ය උෂ්ණත්වය සෙල්සියස් අංශක -63°C පමණ වේ.`,
      ta: `🔴 **நாசா செவ்வாய் கிரக ரோவர் ஆய்வுகள் (Perseverance & Curiosity):**

• **பெர்சிவரன்ஸ் ரோவர் (Perseverance):** பிப்ரவரி 18, 2021 அன்று **ஜெசெரோ பள்ளத்தில் (Jezero Crater)** தரையிறங்கியது. பண்டைய நுண்ணுயிர் வாழ்க்கைக்கான தடயங்களை பாறை மாதிரிகள் எடுத்து ஆராய்கிறது.
• **இன்ஜெனியூட்டி ஹெலிகாப்டர் (Ingenuity):** பூமியைத் தவிர மற்றொரு கிரகத்தில் பறந்த முதல் இயந்திரம்; செவ்வாய் வளிமண்டலத்தில் **72 வெற்றிகரமான விமானங்களை** மேற்கொண்டது.
• **கியூரியோசிட்டி ரோவர் (Curiosity):** 2012 முதல் **கேல் பள்ளத்தில் (Gale Crater)** ஆய்வு செய்து, செவ்வாயில் ஒரு காலத்தில் நன்னீர் ஏரிகள் இருந்ததை உறுதிப்படுத்தியுள்ளது.
• **வளிமண்டலம்:** செவ்வாயின் வளிமண்டலம் 95% க்கும் அதிகமாக கார்பன் டை ஆக்சைடால் ஆனது மற்றும் சராசரி வெப்பநிலை -63°C ஆகும்.`
    }
  },

  // 3. APOD (Astronomy Picture of the Day)
  apod: {
    keywords: [
      'apod', 'astronomy picture', 'picture of the day', 'photo', 'telescope image',
      'දවසේ තාරකා ඡායාරූපය', 'තාරකා පින්තූරය', 'ඡායාරූපය',
      'நாளின் வானியல் படம்', 'வானியல் புகைப்படம்', 'நாசா படம்'
    ],
    responses: {
      en: `✨ **NASA Astronomy Picture of the Day (APOD):**

• **Overview:** Created in 1995 by NASA astrophysicists Robert Nemiroff and Jerry Bonnell, APOD features a different cosmic image every day along with an explanation written by a professional astronomer.
• **Sources:** Captures deep-sky targets from the James Webb Space Telescope (JWST), Hubble Space Telescope, Chandra X-Ray Observatory, and master astrophotographers worldwide.
• **Featured Objects:** Nebulae (stellar nurseries), colliding galaxies, gravitational lensing arcs, supernovae remnants, and solar flares.

💡 *Tip: Check out the "Cosmic APOD" tab above to view today's official NASA release with dynamic trilingual translations and high-resolution 4K previews!*`,
      si: `✨ **නාසා දවසේ තාරකා විද්‍යා ඡායාරූපය (APOD):**

• **හැඳින්වීම:** 1995 දී නාසා ආයතනයේ රොබට් නෙමිරොෆ් සහ ජෙරී බොනෙල් විසින් ආරම්භ කරන ලද APOD මඟින් දිනපතා අලුත් විශ්වීය ඡායාරූපයක් විද්‍යාත්මක පැහැදිලි කිරීමක් සමඟ ප්‍රකාශයට පත් කරයි.
• **මූලාශ්‍ර:** ජේම්ස් වෙබ් (JWST), හබල් (Hubble) සහ ලොව පුරා ප්‍රමුඛ තාරකා ඡායාරූප ශිල්පීන්ගේ විස්මිත ඡායාරූප මෙහි ඇතුළත් වේ.
• **අන්තර්ගතය:** නෙබියුලාවන්, මන්දාකිණි ගැටුම්, සුපර්නෝවා අවශේෂ සහ සෞරග්‍රහ මණ්ඩලයේ විස්මිත දසුන්.

💡 *ඉඟිය: අපගේ "Cosmic APOD" ටැබය හරහා අද දින නිල ඡායාරූපය සිංහල භාෂාවෙන් විස්තර සහිතව නරඹන්න!*`,
      ta: `✨ **நாசாவின் நாளின் வானியல் புகைப்படம் (APOD):**

• **அறிமுகம்:** 1995 இல் நாசா விஞ்ஞானிகள் ராபர்ட் நெமிராஃப் மற்றும் ஜெர்ரி பொன்னெல் ஆகியோரால் தொடங்கப்பட்டது. ஒவ்வொரு நாளும் புதிய பிரபஞ்ச புகைப்படம் அறிவியல் விளக்கத்துடன் வெளியிடப்படுகிறது.
• **ஆதாரங்கள்:** ஜேம்ஸ் வெப் தொலைநோக்கி, ஹப்பிள் தொலைநோக்கி மற்றும் சர்வதேச வானியலாளர்களின் உயர் தெளிவுத்திறன் படங்கள்.
• **காட்சிகள்:** விண்மீன் நெபுலாக்கள், மோதும் விண்மீன் திரள்கள், கருந்துளை ஒளிவட்டங்கள் மற்றும் சூப்பர்நோவா எச்சங்கள்.

💡 *குறிப்பு: இன்றைய நாசா அதிகாரப்பூர்வ புகைப்படத்தை தமிழில் படிக்க "Cosmic APOD" பக்கத்திற்குச் செல்லவும்!*`
    }
  },

  // 4. Asteroids & Planetary Defense (NeoWs & DART)
  asteroids: {
    keywords: [
      'asteroid', 'neows', 'near earth', 'meteor', 'dart', 'apophis', 'bennu', 'planetary defense', 'threat', 'collision',
      'ග්‍රහක', 'උල්කාෂ්ම', 'ඇස්ටරොයිඩ්', 'පෘථිවි ආසන්න', 'අපෝෆිස්',
      'சிறுகோள்', 'விண்கல்', 'பூமிக்கு அருகில்', 'அப்போபிஸ்', 'தாக்குதல்'
    ],
    responses: {
      en: `☄️ **Near-Earth Asteroids & Planetary Defense:**

• **NASA NeoWs (Near Earth Object Web Service):** Continuously tracks over **34,000 Near-Earth Objects (NEOs)** using ground telescopes and space observatories.
• **Potentially Hazardous Asteroids (PHAs):** Defined as asteroids larger than 140 meters approaching within 7.5 million kilometers (19.5 Lunar Distances) of Earth's orbit.
• **Famous Targets:**
  - **Asteroid Apophis (99942):** Will safely pass within 31,600 km of Earth on April 13, 2029—closer than geostationary satellites!
  - **OSIRIS-REx / Bennu:** NASA returned 121.6 grams of pristine carbonaceous sample from asteroid Bennu in September 2023.
• **DART Mission (Double Asteroid Redirection Test):** In 2022, NASA successfully impacted asteroid Dimorphos, altering its orbital period by 33 minutes and proving kinetic deflection works!

💡 *Tip: Open our "Asteroid Radar" tab to view real-time live approach tracks from NASA NeoWs!*`,
      si: `☄️ **පෘථිවි ආසන්න ග්‍රහක සහ ග්‍රහලෝක ආරක්ෂණ පද්ධතිය (Planetary Defense):**

• **නාසා NeoWs පද්ධතිය:** පෘථිවිය ආසන්නයෙන් ගමන් කරන ග්‍රහක **34,000 කට අධික ප්‍රමාණයක්** නිරන්තරයෙන් නිරීක්ෂණය කරයි.
• **අනතුරුදායක ග්‍රහක (PHA):** විෂ්කම්භය මීටර් 140 ට වැඩි සහ පෘථිවියට කි.මී. මිලියන 7.5 කට වඩා ආසන්න වන ග්‍රහක මේ යටතට වැටේ.
• **ප්‍රධාන ග්‍රහක:**
  - **අපෝෆිස් (Apophis 99942):** 2029 අප්‍රේල් 13 වන දින පෘථිවියට කි.මී. 31,600 ක් ආසන්නයෙන් ආරක්ෂිතව ගමන් කරනු ඇත.
  - **DART මෙහෙයුම:** ග්‍රහකයක කක්ෂය වෙනස් කළ හැකි බව ඔප්පු කරමින් ඩයිමෝෆෝස් ග්‍රහකයේ සාර්ථකව ගැටී එහි ගමන් මග වෙනස් කරන ලදී.

💡 *අපගේ "Asteroid Radar" ටැබය හරහා සජීවීව පෘථිවිය අසලින් ගමන් කරන ග්‍රහක නිරීක්ෂණය කරන්න!*`,
      ta: `☄️ **பூமிக்கு அருகிலுள்ள சிறுகோள்கள் மற்றும் பாதுகாப்பு (Planetary Defense):**

• **நாசா NeoWs அமைப்பு:** பூமிக்கு அருகில் வரும் **34,000 க்கும் மேற்பட்ட சிறுகோள்களை** விண்வெளி தொலைநோக்கிகள் மூலம் தொடர்ந்து கண்காணிக்கிறது.
• **அபாயகரமான சிறுகோள்கள் (PHA):** 140 மீட்டருக்கு மேல் விட்டம் கொண்ட மற்றும் பூமிக்கு 7.5 மில்லியன் கி.மீ சுற்றளவுக்குள் வரும் சிறுகோள்கள்.
• **முக்கிய சிறுகோள்கள்:**
  - **அப்போபிஸ் (Apophis 99942):** ஏப்ரல் 13, 2029 அன்று பூமிக்கு வெறும் 31,600 கி.மீ தொலைவில் பாதுகாப்பாக கடந்து செல்லும்.
  - **DART திட்டம்:** 2022 இல் டைமார்போஸ் சிறுகோள் மீது விண்கலத்தை மோதி அதன் சுற்றுப்பாதையை வெற்றிகரமாக மாற்றியது நாசா.

💡 *இந்த தளத்தில் உள்ள "Asteroid Radar" பக்கத்தில் நேரலை சிறுகோள் நகர்வுகளைக் காணலாம்!*`
    }
  },

  // 5. Exoplanets & Alien Worlds
  exoplanets: {
    keywords: [
      'exoplanet', 'kepler', 'trappist', 'alien planet', 'habitable zone', 'goldilocks', 'proxima b', 'k2-18b', 'toi-700',
      'බාහිර ග්‍රහලෝක', 'කෙප්ලර්', 'ට්‍රැපිස්ට්', 'වාසය කළ හැකි', 'පිටසක්වල',
      'புறக்கோள்கள்', 'கெப்லர்', 'டிராப்பிஸ்ட்', 'வேற்று கிரகம்', 'உயிர் வாழக்கூடிய'
    ],
    responses: {
      en: `🪐 **NASA Exoplanet Archive & Habitable Worlds:**

• **Confirmed Exoplanets:** Over **5,600 confirmed exoplanets** discovered beyond our Solar System.
• **Detection Methods:** Transit Photometry (measuring brightness dip as planet crosses star) and Radial Velocity (detecting star's gravitational wobble).
• **Prime Earth-like Candidates:**
  - **TRAPPIST-1e:** Earth-sized rocky world in a 7-planet system, receiving ideal stellar energy for liquid surface water.
  - **Kepler-452b:** "Earth's Bigger Cousin" (1.6x Earth radius) orbiting a Sun-like star with a 385-day year.
  - **K2-18b:** A candidate Hycean ocean world where the James Webb Telescope detected atmospheric carbon dioxide and methane.
• **The Habitable (Goldilocks) Zone:** The orbital region around a star where temperatures permit liquid water to exist stably on a planet's surface.

💡 *Tip: Test the 3D comparative size & habitability scale on the "Exoplanet Lab" tab!*`,
      si: `🪐 **නාසා බාහිර ග්‍රහලෝක (Exoplanets) සහ වාසස්ථානීය ලෝක:**

• **තහවුරු කළ ග්‍රහලෝක:** සෞරග්‍රහ මණ්ඩලයෙන් ඔබ්බෙහි පිහිටි බාහිර ග්‍රහලෝක **5,600 කට වඩා** මෙතෙක් සොයාගෙන ඇත.
• **සොයාගැනීමේ ක්‍රම:** සංක්‍රමණ ක්‍රමය (Transit Method) සහ කක්ෂීය චලන ක්‍රමය (Radial Velocity).
• **ප්‍රධාන අපේක්ෂකයින්:**
  - **TRAPPIST-1e:** පෘථිවියට සමාන ප්‍රමාණයකින් යුත් ද්‍රව ජලය පැවතිය හැකි පාෂාණමය ග්‍රහලෝකයකි.
  - **Kepler-452b:** පෘථිවියේ "ලොකු ඥාතියා" ලෙස හඳුන්වන අතර සූර්යයා වැනි තරුවක් වටා දින 385 ක වසරක් සහිතව භ්‍රමණය වේ.
  - **K2-18b:** ජේම්ස් වෙබ් දුරේක්ෂය මඟින් කාබන්ඩයොක්සයිඩ් සහ මීතේන් වායු හඳුනාගත් සාගර සහිත උප-නෙප්චූන් ග්‍රහලෝකයකි.

💡 *අපගේ "Exoplanet Lab" ටැබය හරහා පෘථිවිය සමඟ ත්‍රිමාන (3D) සංසන්දනය නරඹන්න!*`,
      ta: `🪐 **நாசா புறக்கோள்கள் (Exoplanets) மற்றும் உயிர்வாழும் மண்டலம்:**

• **உறுதிப்படுத்தப்பட்ட கோள்கள்:** நமது சூரிய மண்டலத்திற்கு வெளியே **5,600 க்கும் மேற்பட்ட புறக்கோள்கள்** கண்டுபிடிக்கப்பட்டுள்ளன.
• **கண்டுபிடிக்கும் முறைகள்:** போக்குவரத்து முறை (Transit Method) மற்றும் ஆர வேக முறை (Radial Velocity).
• **முக்கிய பூமியைப் போன்ற கோள்கள்:**
  - **TRAPPIST-1e:** திரவ நீர் இருப்பதற்கான சாத்தியக்கூறுகள் உள்ள பூமி அளவிலான பாறை கிரகம்.
  - **Kepler-452b:** "பூமியின் மூத்த உறவினர்" என அழைக்கப்படுகிறது; 385 நாட்கள் கொண்ட சுற்றுப்பாதை காலம் கொண்டது.
  - **K2-18b:** ஜேம்ஸ் வெப் தொலைநோக்கி மூலம் வளிமண்டலத்தில் மீத்தேன் மற்றும் கார்பன் டை ஆக்சைடு கண்டறியப்பட்ட பெருங்கடல் கோள்.

💡 *இந்த தளத்தில் உள்ள "Exoplanet Lab" பக்கத்தில் 3D மாதிரிகளை பூமியுடன் ஒப்பிடலாம்!*`
    }
  },

  // 6. Solar Weather, Sun & Auroras
  solar: {
    keywords: [
      'sun', 'solar weather', 'cme', 'coronal mass ejection', 'aurora', 'geomagnetic', 'solar flare', 'parker solar probe',
      'සූර්යයා', 'සූර්ය කුණාටු', 'අවුරෝරා', 'සූර්ය සුළං',
      'சூரியன்', 'சூரிய புயல்', 'அரோரா', 'காந்த புயல்'
    ],
    responses: {
      en: `☀️ **Solar Dynamics, Space Weather & Auroras:**

• **The Sun's Engine:** Powered by nuclear fusion converting 600 million tons of hydrogen into helium every second at its 15,000,000°C core.
• **Solar Flares & CMEs:** High-energy explosions of magnetic radiation (Solar Flares) and massive clouds of magnetized plasma ejected into space (Coronal Mass Ejections).
• **Geomagnetic Storms & Auroras:** When CMEs interact with Earth's magnetosphere, accelerated charged particles collide with oxygen and nitrogen in the upper atmosphere, generating the Aurora Borealis and Australis.
• **Parker Solar Probe:** NASA's fastest spacecraft (moving over 600,000 km/h), repeatedly flying directly through the Sun’s scorching outer corona to study coronal heating.`,
      si: `☀️ **සූර්ය ගතිකත්වය, සූර්ය කුණාටු සහ අවුරෝරා (Auroras):**

• **සූර්ය බලශක්තිය:** සූර්ය අභ්‍යන්තරයේ සෙල්සියස් අංශක මිලියන 15 ක උෂ්ණත්වයකදී සිදුවන න්‍යෂ්ටික විලයනය (Nuclear Fusion) මඟින් තත්පරයකට හයිඩ්‍රජන් ටොන් මිලියන 600 ක් හීලියම් බවට පත් වේ.
• **සූර්ය කුණාටු (CMEs):** සූර්යයාගෙන් අධික වේගයෙන් නිකුත් වන චුම්භක ප්ලාස්මා වලාකුළු පෘථිවියේ චුම්භක ක්ෂේත්‍රය සමඟ ගැටීමෙන් භූ-චුම්භක කුණාටු ඇතිවේ.
• **අවුරෝරා ආලෝක ධාරා:** මෙම ආරෝපිත අංශු පෘථිවි වායුගෝලයේ ඔක්සිජන් සහ නයිට්‍රජන් සමඟ ප්‍රතික්‍රියා කිරීමෙන් ධ්‍රැවාසන්න අහසේ විස්මිත අවුරෝරා ආලෝක නිර්මාණය වේ.`,
      ta: `☀️ **சூரிய வானிலை, சூரிய புயல்கள் மற்றும் அரோரா (Auroras):**

• **சூரியனின் ஆற்றல்:** சூரியனின் மையத்தில் 15 மில்லியன் டிகிரி செல்சியஸ் வெப்பநிலையில் நிகழும் அணுக்கரு இணைவு (Nuclear Fusion) மூலம் வினாடிக்கு 600 மில்லியன் டன் ஹைட்ரஜன் ஹீலியமாக மாற்றப்படுகிறது.
• **சூரிய புயல்கள் (CMEs):** சூரியனிலிருந்து வெளியேற்றப்படும் காந்த பிளாஸ்மா அலைகள் பூமியின் காந்தப்புலத்துடன் மோதுகின்றன.
• **அரோரா ஒளிக்கற்றைகள்:** இந்த துகள்கள் பூமியின் வளிமண்டலத்திலுள்ள ஆக்ஸிஜன் மற்றும் நைட்ரஜனுடன் வினைபுரிந்து வட மற்றும் தென் துருவங்களில் வண்ணமயமான அரோரா ஒளிகளை உருவாக்குகின்றன.
• **பார்க்கர் சோலார் ப்ரோப் (Parker Solar Probe):** மணிக்கு 600,000 கி.மீ வேகத்தில் சூரியனின் வளிமண்டலத்திற்குள் (Corona) நேரடியாகப் பாய்ந்து ஆய்வு செய்யும் நாசா விண்கலம்.`
    }
  },

  // 7. James Webb Space Telescope (JWST)
  jwst: {
    keywords: [
      'webb', 'jwst', 'james webb', 'infrared', 'lagrange l2', 'cosmic dawn',
      'ජේම්ස් වෙබ්', 'දුරේක්ෂය', 'අධෝරක්ත',
      'ஜேம்ஸ் வெப்', 'தொலைநோக்கி', 'அகச்சிவப்பு'
    ],
    responses: {
      en: `🔭 **James Webb Space Telescope (JWST):**

• **Location:** Orbiting the Sun at **Lagrange Point 2 (L2)**, approximately **1.5 million kilometers** from Earth.
• **Optics:** Features a **6.5-meter primary mirror** made of 18 gold-coated beryllium hexagonal segments, shielded by a 5-layer tennis-court-sized sunshield.
• **Infrared Vision:** Operates in near-infrared (NIRCam) and mid-infrared (MIRI), allowing it to pierce through dense cosmic dust pillars and detect redshifted light from the earliest stars and galaxies formed over **13.5 billion years ago**.
• **Breakthroughs:** Discovering mature galaxies in the Cosmic Dawn, mapping exoplanet atmospheric compositions, and resolving stellar birth in the Pillars of Creation.`,
      si: `🔭 **ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය (JWST):**

• **පිහිටීම:** පෘථිවියේ සිට කිලෝමීටර **මිලියන 1.5 ක් ඈතින්** පිහිටි ලග්‍රාන්ජ් 2 (L2) ලක්ෂ්‍යයේ කක්ෂගතව ඇත.
• **දර්පණය:** රන් ආලේපිත බෙරිලියම් ෂඩාස්‍රාකාර කොටස් 18 කින් යුත් **මීටර් 6.5 ක දැවැන්ත ප්‍රධාන දර්පණයකින්** සමන්විත වේ.
• **තාක්ෂණය:** අධෝරක්ත (Infrared) කිරණ මඟින් ඝන දුහුවිලි වලාකුළු විනිවිද දකිමින් මීට වසර බිලියන 13.5 කට පෙර විශ්වයේ බිහිවූ මුල්ම තාරකා සහ මන්දාකිණි නිරීක්ෂණය කරයි.`,
      ta: `🔭 **ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி (JWST):**

• **அமைவிடம்:** பூமியிலிருந்து **1.5 மில்லியன் கி.மீ** தொலைவில் உள்ள லக்ராஞ்ச் 2 (L2) புள்ளியில் சூரியனைச் சுற்றி வருகிறது.
• **ஆடி:** 18 தங்க முலாம் பூசப்பட்ட பெரிலியம் அறுகோண கண்ணாடிகளைக் கொண்ட **6.5 மீட்டர் அகல பிரதான ஆடி**.
• **தொழில்நுட்பம்:** அகச்சிவப்பு (Infrared) ஒளியில் செயல்படுவதால், விண்வெளி தூசுகளை ஊடுருவி, 13.5 பில்லியன் ஆண்டுகளுக்கு முன்பு உருவான ஆரம்பகால விண்மீன் திரள்களை துல்லியமாகப் படம்பிடிக்கிறது.`
    }
  },

  // 8. Artemis Program & Moon Landing
  artemis: {
    keywords: [
      'artemis', 'moon', 'lunar', 'apollo', 'orion', 'sls', 'gateway', 'south pole',
      'ආටෙමිස්', 'සඳ', 'චන්ද්‍ර', 'ඇපලෝ', 'ඔරායන්',
      'ஆர்ட்டெமிஸ்', 'நிலவு', 'சந்திரன்', 'அப்பல்லோ', 'ஓரியன்'
    ],
    responses: {
      en: `🚀 **NASA Artemis Program — Return to the Moon:**

• **Goal:** Returning astronauts to the lunar surface sustainably, landing the first woman and first person of color on the Moon.
• **Key Hardware:**
  - **SLS (Space Launch System):** The world’s most powerful operational rocket, producing 8.8 million pounds of thrust.
  - **Orion Spacecraft:** Deep-space crew capsule designed for trans-lunar injection, lunar orbit, and safe Earth atmospheric re-entry at 40,000 km/h.
  - **Gateway:** A lunar-orbiting space station providing staging and scientific support for surface expeditions.
• **Destination:** The **Lunar South Pole**, home to permanently shadowed craters containing billions of metric tons of water ice for rocket propellant and life support.`,
      si: `🚀 **නාසා ආටෙමිස් (Artemis) චන්ද්‍ර මෙහෙයුම:**

• **ප්‍රධාන අරමුණ:** ප්‍රථම කාන්තාව සහ පළමු කළු ජාතිකයා ඇතුළු ගගනගාමීන් නැවත සඳ මතට ගොඩබැස්සවීම සහ ස්ථිර චන්ද්‍ර කඳවුරු පිහිටුවීම.
• **ප්‍රධාන යානා:**
  - **SLS රොකට්ටුව:** ලොව බලගතුම මෙහෙයුම් රොකට්ටුව වන අතර රාත්තල් මිලියන 8.8 ක තෙරපුම් බලයක් නිපදවයි.
  - **ඔරායන් (Orion) අභ්‍යවකාශ යානය:** ගගනගාමීන් සඳ කරා ගෙනයන සහ නැවත පෘථිවියට ආරක්ෂිතව ගෙනෙන යානයයි.
  - **Gateway:** සඳ වටා කක්ෂගත වන අභ්‍යවකාශ නැවතුම්පොළ.
• **ගොඩබසින ස්ථානය:** ජල අයිස් නිධි පවතින **චන්ද්‍ර දක්ෂිණ ධ්‍රැවය (Lunar South Pole)**.`,
      ta: `🚀 **நாசா ஆர்ட்டெமிஸ் திட்டம் (Artemis Lunar Mission):**

• **நோக்கம்:** முதல் பெண் மற்றும் முதல் வெள்ளையர் அல்லாத விண்வெளி வீரரை நிலவின் மேற்பரப்பில் தரையிறக்கி, அங்கு நிலையான மனித இருப்பை உருவாக்குவது.
• **முக்கிய பாகங்கள்:**
  - **SLS ராக்கெட் (Space Launch System):** 8.8 மில்லியன் பவுண்டுகள் உந்துவிசை கொண்ட உலகின் அதிநவீன ராக்கெட்.
  - **ஓரியன் விண்கலம் (Orion):** நிலவுக்கு மனிதர்களை அழைத்துச் செல்லும் பாதுகாப்பு காப்ஸ்யூல்.
  - **கேட்வே (Gateway):** நிலவின் சுற்றுப்பாதையில் இயங்கும் விண்வெளி நிலையம்.
• **இலக்கு:** நிலவின் **தென் துருவம் (South Pole)**; இங்குள்ள நிழல் நிறைந்த பள்ளங்களில் பில்லியன் கணக்கான டன் நீர் பனிக்கட்டி உள்ளது.`
    }
  },

  // 9. Black Holes & Cosmology
  blackholes: {
    keywords: [
      'black hole', 'singularity', 'event horizon', 'sagittarius a', 'gravity', 'general relativity', 'hawking',
      'කළු කුහර', 'ගුරුත්වාකර්ෂණය', 'සිංගියුලාරිටි',
      'கருந்துளை', 'ஈர்ப்பு விசை', 'நிகழ்வு எல்லை'
    ],
    responses: {
      en: `🕳️ **Black Holes & General Relativity:**

• **Definition:** A region of spacetime where gravity is so intense that nothing—not even electromagnetic radiation like light—has sufficient escape velocity to break free.
• **Event Horizon:** The absolute point of no return. Beyond this boundary, all paths through spacetime lead inward to the central gravitational singularity.
• **Sagittarius A* (Sgr A*):** The supermassive black hole at the center of our Milky Way galaxy, containing approximately **4.3 million times the mass of the Sun**.
• **Gravitational Lensing & Waves:** Supermassive black holes bend spacetime so severely that background starlight forms glowing Einstein rings. When black holes collide, they emit ripples in spacetime called gravitational waves, detected on Earth by LIGO and Virgo observatories.`,
      si: `🕳️ **කළු කුහර (Black Holes) සහ විශ්ව විද්‍යාව:**

• **හැඳින්වීම:** ආලෝකයට පවා මිදී යා නොහැකි තරම් අතිශය දැවැන්ත ගුරුත්වාකර්ෂණ බලයක් සහිත අභ්‍යවකාශ කලාපයකි.
• **සිද්ධි ක්ෂිතිජය (Event Horizon):** කළු කුහරයකින් ආපසු හැරී ආ නොහැකි සීමාවයි. මෙම සීමාව පසු කළ පසු ඕනෑම දෙයක් කේන්ද්‍රයේ ඇති සිංගියුලාරිටිය (Singularity) වෙත ඇදී යයි.
• **Sagittarius A*:** අපගේ ක්ෂීරපථ (Milky Way) මන්දාකිණියේ කේන්ද්‍රයේ පිහිටි සූර්ය ස්කන්ධ මෙන් **මිලියන 4.3 ක** අති දැවැන්ත කළු කුහරයයි.`,
      ta: `🕳️ **கருந்துளைகள் (Black Holes) மற்றும் பொது சார்பியல்:**

• **விளக்கம்:** ஒளியினால் கூட தப்ப முடியாத அளவுக்கு அதீத ஈர்ப்பு விசை கொண்ட விண்வெளிப் பகுதி.
• **நிகழ்வு எல்லை (Event Horizon):** இதைக் கடந்த பின் எதனாலும் மீண்டும் வெளியேற முடியாது.
• **சகிட்டாரியஸ் A* (Sagittarius A*):** நமது பால்வெளி மண்டலத்தின் (Milky Way) மையத்தில் அமைந்துள்ள, சூரியனைப் போல **4.3 மில்லியன் மடங்கு நிறை கொண்ட** பிரம்மாண்ட கருந்துளை.`
    }
  },

  // 10. Greetings & Identity
  greetings: {
    keywords: [
      'hello', 'hi', 'hey', 'greetings', 'who are you', 'help', 'what can you do',
      'ආයුබෝවන්', 'සුභ දවසක්', 'ඔබ කවුද', 'උදව්',
      'வணக்கம்', 'யார் நீ', 'உதவி'
    ],
    responses: {
      en: `👋 **Greetings! I am the NASA Astrophysics Local Intelligence Assistant.**

I operate with a built-in, standalone space knowledge engine requiring zero external API keys! You can ask me questions across deep space topics:

• **International Space Station (ISS):** Orbit speed, altitude, crew life, and live flyovers
• **Mars Exploration:** Perseverance & Curiosity rovers, Jezero crater, Ingenuity helicopter
• **Cosmic APOD:** How NASA selects the Astronomy Picture of the Day
• **Asteroids & Defense:** Near-Earth objects, DART deflection mission, asteroid Apophis
• **Exoplanets & Habitable Worlds:** TRAPPIST-1, Kepler-452b, Goldilocks zone, James Webb discoveries
• **Solar Space Weather:** Solar flares, Coronal Mass Ejections, and Northern Lights (Auroras)
• **James Webb Space Telescope:** Mirror design, L2 orbit, deep infrared cosmic dawn
• **Artemis Program:** SLS rocket, Orion spacecraft, and human return to the Moon South Pole

What cosmic phenomenon would you like to explore today?`,
      si: `👋 **ආයුබෝවන්! මම නාසා තාරකා භෞතික විද්‍යා දේශීය බුද්ධිමය සහකරු වෙමි.**

බාහිර API යතුරු කිසිවක් අවශ්‍ය නොවන ස්වාධීන දේශීය පද්ධතියක් මඟින් මම ක්‍රියාත්මක වෙමි. පහත සඳහන් ඕනෑම මාතෘකාවක් පිළිබඳව සිංහල, ඉංග්‍රීසි හෝ දෙමළ බසින් මගෙන් විමසිය හැක:

• **ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය (ISS)** - කක්ෂීය වේගය, උස සහ ගගනගාමීන්ගේ ජීවිතය
• **අඟහරු ගවේෂණය** - Perseverance, Curiosity රෝවර සහ Jezero ආවාටය
• **දවසේ තාරකා ඡායාරූපය (APOD)** - විශ්වීය ඡායාරූප විස්තර
• **පෘථිවි ආසන්න ග්‍රහක** - DART මෙහෙයුම, Apophis ග්‍රහකය
• **බාහිර ග්‍රහලෝක (Exoplanets)** - TRAPPIST-1, Kepler-452b, වාසස්ථානීය කලාප
• **සූර්ය කුණාටු සහ අවුරෝරා ආලෝක**
• **ජේම්ස් වෙබ් දුරේක්ෂය (JWST) සහ ආටෙමිස් චන්ද්‍ර මෙහෙයුම**

අද දිනයේ ඔබ දැනගැනීමට කැමති අභ්‍යවකාශ මාතෘකාව කුමක්ද?`,
      ta: `👋 **வணக்கம்! நான் நாசா விண்வெளி ஆராய்ச்சி உள்ளூர் AI உதவியாளர்.**

எந்தவொரு வெளிப்புற API சாவிகளும் இன்றி நேரடியாக இயங்கும் சுயமாக செயல்படும் அறிவுசார் தளம். நீங்கள் பின்வரும் தலைப்புகளில் என்னிடம் கேட்கலாம்:

• **சர்வதேச விண்வெளி நிலையம் (ISS)** - வேகம், உயரம் மற்றும் சுற்றுப்பாதை விவரங்கள்
• **செவ்வாய் ரோவர்கள்** - பெர்சிவரன்ஸ், கியூரியோசிட்டி மற்றும் இன்ஜெனியூட்டி
• **நாளின் வானியல் புகைப்படம் (APOD)** - நாசா வெளியீடுகள்
• **சிறுகோள்கள் மற்றும் பூமி பாதுகாப்பு** - DART திட்டம் மற்றும் அப்போபிஸ்
• **புறக்கோள்கள் (Exoplanets)** - TRAPPIST-1, கெப்லர்-452b மற்றும் உயிர் வாழக்கூடிய மண்டலம்
• **சூரிய புயல்கள் மற்றும் அரோரா ஒளிகள்**
• **ஜேம்ஸ் வெப் தொலைநோக்கி மற்றும் ஆர்ட்டெமிஸ் நிலவு திட்டம்**

இன்று நீங்கள் எதைப் பற்றி ஆராய விரும்புகிறீர்கள்?`
    }
  }
};

// Fallback response with suggested questions
export function getFallbackResponse(lang = 'en') {
  if (lang === 'si') {
    return {
      text: `🚀 **නාසා තාරකා විද්‍යා සහකරු වෙත සාදරයෙන් පිළිගනිමු.**

ඔබ විමසූ ප්‍රශ්නයට අදාළ නිශ්චිත විද්‍යාත්මක මාතෘකාවක් හඳුනාගත නොහැකි විය. පහත දැක්වෙන ප්‍රධාන අභ්‍යවකාශ මාතෘකා ඔස්සේ මගෙන් ප්‍රශ්න විමසිය හැක:

• **"ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානයේ (ISS) වේගය කොපමණද?"**
• **"අඟහරු මත Perseverance රෝවරය කරන්නේ කුමක්ද?"**
• **"ජේම්ස් වෙබ් දුරේක්ෂය මුල්ම මන්දාකිණි දකින්නේ කෙසේද?"**
• **"ආටෙමිස් මෙහෙයුම මඟින් මිනිසුන් සඳට යවන්නේ කෙසේද?"**
• **"පෘථිවියට සමාන බාහිර ග්‍රහලෝක මොනවාද?"**
• **"කළු කුහරයක සිද්ධි ක්ෂිතිජය යනු කුමක්ද?"**`,
      suggestions: [
        'ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානයේ (ISS) වේගය කොපමණද?',
        'අඟහරු මත Perseverance රෝවරය කරන්නේ කුමක්ද?',
        'ජේම්ස් වෙබ් දුරේක්ෂය ක්‍රියා කරන්නේ කෙසේද?'
      ]
    };
  }

  if (lang === 'ta') {
    return {
      text: `🚀 **நாசா விண்வெளி உதவி மையத்திற்கு வரவேற்கிறோம்.**

நீங்கள் கேட்ட கேள்விக்கான குறிப்பிட்ட அறிவியல் தலைப்பைக் கண்டறிய முடியவில்லை. பின்வரும் தலைப்புகளில் என்னிடம் கேட்கலாம்:

• **"சர்வதேச விண்வெளி நிலையத்தின் (ISS) வேகம் என்ன?"**
• **"செவ்வாய் கிரகத்தில் பெர்சிவரன்ஸ் ரோவர் என்ன செய்கிறது?"**
• **"ஜேம்ஸ் வெப் தொலைநோக்கி எவ்வாறு ஆரம்பகால விண்மீன்களைப் பார்க்கிறது?"**
• **"ஆர்ட்டெமிஸ் திட்டம் மூலம் மனிதர்கள் எவ்வாறு நிலவுக்குச் செல்கிறார்கள்?"**
• **"பூமியைப் போன்ற பிற புறக்கோள்கள் எவை?"**
• **"கருந்துளையின் நிகழ்வு எல்லை என்றால் என்ன?"**`,
      suggestions: [
        'சர்வதேச விண்வெளி நிலையத்தின் (ISS) வேகம் என்ன?',
        'செவ்வாய் கிரகத்தில் பெர்சிவரன்ஸ் ரோவர் என்ன செய்கிறது?',
        'ஜேம்ஸ் வெப் தொலைநோக்கி எவ்வாறு இயங்குகிறது?'
      ]
    };
  }

  return {
    text: `🚀 **NASA Deep Space Intelligence Engine:**

I couldn't pinpoint that exact space inquiry, but I have comprehensive built-in telemetry across NASA missions! Try asking about one of these major topics:

• **"What is the orbital speed and altitude of the ISS?"**
• **"What are Perseverance and Curiosity doing on Mars?"**
• **"How does the James Webb Telescope detect early galaxies?"**
• **"What is the NASA Artemis flight plan to the Moon's South Pole?"**
• **"What are the most habitable exoplanets discovered?"**
• **"How do solar storms and Auroras form?"**
• **"What is a black hole event horizon?"**`,
    suggestions: [
      'What is the orbital speed and altitude of the ISS?',
      'What are Perseverance and Curiosity doing on Mars?',
      'How does the James Webb Telescope detect early galaxies?'
    ]
  };
}

/**
 * Main Standalone Zero-Latency Inference Function
 * Evaluates user input against the built-in knowledge base.
 */
export function generateLocalSpaceResponse(userQuery = '', userLang) {
  const query = String(userQuery).trim();
  const lowerQuery = query.toLowerCase();
  const detectedLang = userLang || detectLanguage(query);

  if (!query) {
    return {
      text: getFallbackResponse(detectedLang).text,
      intent: 'fallback',
      lang: detectedLang,
      suggestions: getFallbackResponse(detectedLang).suggestions
    };
  }

  // Iterate through knowledge base intents and calculate keyword scores
  let bestIntent = null;
  let highestScore = 0;

  for (const [intentKey, data] of Object.entries(SPACE_KNOWLEDGE_BASE)) {
    let score = 0;
    for (const kw of data.keywords) {
      const lowerKw = kw.toLowerCase();
      if (lowerQuery.includes(lowerKw)) {
        // Longer matching keywords get higher score
        score += Math.max(2, lowerKw.length);
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestIntent = intentKey;
    }
  }

  // Match threshold
  if (bestIntent && highestScore >= 2) {
    const intentData = SPACE_KNOWLEDGE_BASE[bestIntent];
    const responseText = intentData.responses[detectedLang] || intentData.responses.en;
    
    return {
      text: responseText,
      intent: bestIntent,
      lang: detectedLang,
      suggestions: [
        detectedLang === 'si' ? 'අඟහරු රෝවර ගැන කියන්න' : detectedLang === 'ta' ? 'செவ்வாய் ரோவர் பற்றி கூறுங்கள்' : 'Tell me about Mars Rovers',
        detectedLang === 'si' ? 'ISS කක්ෂය කොහොමද?' : detectedLang === 'ta' ? 'ISS சுற்றுப்பாதை எப்படி?' : 'How does the ISS orbit Earth?',
        detectedLang === 'si' ? 'ජේම්ස් වෙබ් දුරේක්ෂය' : detectedLang === 'ta' ? 'ஜேம்ஸ் வெப் தொலைநோக்கி' : 'How does James Webb see back in time?'
      ]
    };
  }

  const fallback = getFallbackResponse(detectedLang);
  return {
    text: fallback.text,
    intent: 'fallback',
    lang: detectedLang,
    suggestions: fallback.suggestions
  };
}
