export type SupportedLanguage = 'en' | 'si' | 'ta';

export interface TranslationDictionary {
  appName: string;
  appSubtitle: string;
  navApod: string;
  nav3D: string;
  navMissions: string;
  navNews: string;
  navSaved: string;
  navExportHtml: string;
  langEn: string;
  langSi: string;
  langTa: string;

  // Saved Favorites section
  savedHeading: string;
  savedSubheading: string;
  savedApodTitle: string;
  savedMissionsTitle: string;
  noSavedItems: string;
  noSavedSub: string;
  saveToFavorites: string;
  savedInFavorites: string;
  removeFromFavorites: string;
  savedBadge: string;
  clearAllSaved: string;
  filterAll: string;

  // APOD section
  apodHeading: string;
  apodSubheading: string;
  selectDate: string;
  today: string;
  yesterday: string;
  randomDate: string;
  viewOriginalHd: string;
  translatingWithGemini: string;
  translatedByAi: string;
  readAloud: string;
  stopAudio: string;
  copyText: string;
  copiedText: string;
  quickPresets: string;
  presetWebbDeepField: string;
  presetPillars: string;
  presetArtemisOrion: string;
  presetMarsPanorama: string;
  originalEnglish: string;
  copyright: string;

  // 3D Visualizer
  visualizerHeading: string;
  visualizerSubheading: string;
  targetEarth: string;
  targetMoon: string;
  targetMars: string;
  targetSpacecraft: string;
  toggleOrbit: string;
  toggleAtmosphere: string;
  resetCamera: string;
  telemetrySpeed: string;
  telemetryAltitude: string;
  telemetryDistance: string;
  solarSystemScale: string;
  orbitControlsHint: string;

  // Missions section
  missionsHeading: string;
  missionsSubheading: string;
  missionStatus: string;
  missionLaunchDate: string;
  missionDestination: string;
  missionOperator: string;
  missionObjective: string;
  stepBreakdown: string;
  stepLaunch: string;
  stepCruise: string;
  stepArrival: string;
  stepSurface: string;
  stepCompletion: string;

  // News section
  newsHeading: string;
  newsSubheading: string;
  readOfficialRelease: string;
  latestUpdates: string;

  // Single HTML Export modal
  exportModalTitle: string;
  exportModalDesc: string;
  copyHtmlCode: string;
  downloadHtmlFile: string;
  openStandaloneTab: string;
  close: string;
}

export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    appName: "NASA Space Explorer",
    appSubtitle: "Trilingual Cosmic Portal (English • සිංහල • தமிழ்)",
    navApod: "Cosmic APOD",
    nav3D: "3D Space Lab",
    navMissions: "Landmark Missions",
    navNews: "NASA News Feed",
    navSaved: "Saved",
    navExportHtml: "Single HTML File",
    langEn: "English",
    langSi: "සිංහල",
    langTa: "தமிழ்",

    savedHeading: "Saved Cosmic Favorites",
    savedSubheading: "Your personalized collection of Astronomy Pictures of the Day and historic NASA space missions stored locally.",
    savedApodTitle: "Saved APOD Discoveries",
    savedMissionsTitle: "Bookmarked Space Missions",
    noSavedItems: "No Saved Items Yet",
    noSavedSub: "Tap the bookmark or heart icon on any APOD image or space mission to save it to your personal cosmic archive.",
    saveToFavorites: "Save to Favorites",
    savedInFavorites: "Saved",
    removeFromFavorites: "Remove from Saved",
    savedBadge: "Saved",
    clearAllSaved: "Clear All Saved",
    filterAll: "All Favorites",

    apodHeading: "Astronomy Picture of the Day",
    apodSubheading: "Discover the cosmos through the lens of NASA observatories, dynamically translated into Sinhala and Tamil via Gemini AI.",
    selectDate: "Select Date",
    today: "Today",
    yesterday: "Yesterday",
    randomDate: "Random Cosmic Day",
    viewOriginalHd: "View Ultra HD (4K)",
    translatingWithGemini: "Translating dynamically with Gemini AI...",
    translatedByAi: "Dynamic Gemini AI Science Translation",
    readAloud: "Read Aloud",
    stopAudio: "Stop Audio",
    copyText: "Copy Content",
    copiedText: "Copied to clipboard!",
    quickPresets: "Iconic Archive Jumps:",
    presetWebbDeepField: "Webb Deep Field",
    presetPillars: "Pillars of Creation",
    presetArtemisOrion: "Artemis Orion Earthrise",
    presetMarsPanorama: "Mars Jezero Panorama",
    originalEnglish: "English (Original NASA)",
    copyright: "Image Credit & Copyright",

    visualizerHeading: "Interactive 3D Celestial & Spacecraft Lab",
    visualizerSubheading: "Explore real-time 3D rendered planetary bodies and spacecraft with orbital mechanics, lighting controls, and camera telemetry.",
    targetEarth: "Planet Earth",
    targetMoon: "The Moon",
    targetMars: "Mars (Red Planet)",
    targetSpacecraft: "Orion Spacecraft",
    toggleOrbit: "Auto Rotate",
    toggleAtmosphere: "Atmosphere Glow",
    resetCamera: "Reset Vantage",
    telemetrySpeed: "Orbital Velocity",
    telemetryAltitude: "Current Altitude",
    telemetryDistance: "Telemetry Range",
    solarSystemScale: "Scale Realism",
    orbitControlsHint: "Drag to rotate • Scroll to zoom • Right-click to pan",

    missionsHeading: "Landmark NASA Space Missions",
    missionsSubheading: "From humankind's first steps on the lunar surface to deep-space infrared eyes and Martian robotic explorers.",
    missionStatus: "Status",
    missionLaunchDate: "Launch Date",
    missionDestination: "Destination",
    missionOperator: "Mission Control",
    missionObjective: "Primary Objective",
    stepBreakdown: "Phase-by-Phase Mission Flight Plan",
    stepLaunch: "Liftoff & Booster Separation",
    stepCruise: "Trans-Planetary Injection & Cruise",
    stepArrival: "Orbital Insertion & Entry",
    stepSurface: "Surface Deployment & Exploration",
    stepCompletion: "Mission Science & Legacy",

    newsHeading: "Live NASA Science News",
    newsSubheading: "Recent official press releases and breakthrough astrophysical discoveries direct from NASA headquarters.",
    readOfficialRelease: "Read on NASA.gov",
    latestUpdates: "Latest Bulletins",

    exportModalTitle: "Standalone Single HTML File Export",
    exportModalDesc: "A complete, self-contained single HTML file with embedded CSS and inline JavaScript. Works independently in any browser with no dependencies required!",
    copyHtmlCode: "Copy Raw HTML",
    downloadHtmlFile: "Download .html File",
    openStandaloneTab: "Open Standalone Preview",
    close: "Close"
  },

  si: {
    appName: "නාසා විශ්ව ගවේෂකය",
    appSubtitle: "තුන්භාෂා අභ්‍යවකාශ ද්වාරය (සිංහල • தமிழ் • English)",
    navApod: "දවසේ තාරකා ඡායාරූපය",
    nav3D: "3D අභ්‍යවකාශගාරය",
    navMissions: "ඓතිහාසික මෙහෙයුම්",
    navNews: "නාසා සජීවී පුවත්",
    navSaved: "සුරැකි දෑ",
    navExportHtml: "තනි HTML ගොනුව",
    langEn: "English",
    langSi: "සිංහල",
    langTa: "தமிழ்",

    savedHeading: "ඔබ සුරැකි විශ්ව එකතුව (Saved Favorites)",
    savedSubheading: "ඔබ ප්‍රියකළ තාරකා විද්‍යා ඡායාරූප (APOD) සහ ඓතිහාසික අභ්‍යවකාශ මෙහෙයුම් දත්ත ඔබගේ උපාංගයේ සුරැකී ඇත.",
    savedApodTitle: "සුරැකි APOD ඡායාරූප",
    savedMissionsTitle: "සුරැකි අභ්‍යවකාශ මෙහෙයුම්",
    noSavedItems: "තවමත් කිසිදු අයිතමයක් සුරැකී නොමැත",
    noSavedSub: "ඕනෑම APOD ඡායාරූපයක හෝ මෙහෙයුමක ඇති Bookmark හෝ Heart සලකුණ ක්ලික් කර එය ඔබගේ සුරැකි ලැයිස්තුවට එක්කරන්න.",
    saveToFavorites: "සුරැකි ලැයිස්තුවට එක්කරන්න",
    savedInFavorites: "සුරැකිණි",
    removeFromFavorites: "සුරැකි ලැයිස්තුවෙන් ඉවත්කරන්න",
    savedBadge: "සුරැකිණි",
    clearAllSaved: "සියලු සුරැකි දෑ මකන්න",
    filterAll: "සියල්ල",

    apodHeading: "දවසේ තාරකා විද්‍යා ඡායාරූපය (APOD)",
    apodSubheading: "නාසා නිරීක්ෂණාගාර මඟින් ග්‍රහණය කරගත් විශ්වයේ අසිරිය, Gemini AI මඟින් නිරවුල් සහ ස්වභාවික සිංහල භාෂාවට පරිවර්තනය කර රසවිඳින්න.",
    selectDate: "දිනය තෝරන්න",
    today: "අද දිනය",
    yesterday: "ඊයේ දිනය",
    randomDate: "අහඹු විශ්ව දිනය",
    viewOriginalHd: "අධි-විභේදන (4K) ඡායාරූපය",
    translatingWithGemini: "Gemini AI මඟින් සිංහල විද්‍යාත්මක පරිවර්තනය සකසමින් පවතී...",
    translatedByAi: "Gemini AI ස්වභාවික විද්‍යා පරිවර්තනය",
    readAloud: "හඬින් අසන්න",
    stopAudio: "හඬ නවත්වන්න",
    copyText: "පෙළ පිටපත් කරන්න",
    copiedText: "සාර්ථකව පිටපත් විය!",
    quickPresets: "සුප්‍රකට විශ්ව සංරක්ෂිත:",
    presetWebbDeepField: "ජේම්ස් වෙබ් ගැඹුරු විශ්වය",
    presetPillars: "මැවීමේ කුළුණු (Pillars)",
    presetArtemisOrion: "ආටෙමිස් ඔරායන් චන්ද්‍ර දසුන",
    presetMarsPanorama: "අඟහරු ජෙසීරෝ පරිදර්ශනය",
    originalEnglish: "මූලික ඉංග්‍රීසි (Original)",
    copyright: "ඡායාරූප හිමිකම",

    visualizerHeading: "අන්තර්ක්‍රියාකාරී 3D අභ්‍යවකාශ සහ යානා නිරීක්ෂණාගාරය",
    visualizerSubheading: "ග්‍රහලෝක කක්ෂ, වායුගෝලීය ආලෝකකරණය සහ අභ්‍යවකාශ යානා ආකෘති ත්‍රිමාන (3D) තාක්ෂණයෙන් තත්‍ය කාලීනව නිරීක්ෂණය කරන්න.",
    targetEarth: "පෘථිවි ග්‍රහලෝකය",
    targetMoon: "චන්ද්‍රයා (සඳ)",
    targetMars: "අඟහරු (රතු ග්‍රහයා)",
    targetSpacecraft: "ඔරායන් අභ්‍යවකාශ යානය",
    toggleOrbit: "ස්වයංක්‍රීය භ්‍රමණය",
    toggleAtmosphere: "වායුගෝලීය දීප්තිය",
    resetCamera: "කැමරාව මුල් පිහිටුමට",
    telemetrySpeed: "කක්ෂීය ප්‍රවේගය",
    telemetryAltitude: "වර්තමාන උන්නතාංශය",
    telemetryDistance: "දුරස්ථ දත්ත මිනුම",
    solarSystemScale: "පරිමාණ යථාර්ථවාදය",
    orbitControlsHint: "කරකැවීමට Mouse අදින්න • විශාලනයට Scroll කරන්න • පෑන් කිරීමට Right-click කරන්න",

    missionsHeading: "නාසා හි ඓතිහාසික අභ්‍යවකාශ මෙහෙයුම්",
    missionsSubheading: "මිනිසා සඳ මත පා තැබූ ඇපලෝ 11 සිට, ආටෙමිස්, ජේම්ස් වෙබ් දුරේක්ෂය සහ අඟහරු රෝවර දක්වා වික්‍රමාන්විත ගමන් මඟ.",
    missionStatus: "තත්ත්වය",
    missionLaunchDate: "දියත් කළ දිනය",
    missionDestination: "ඉලක්කය",
    missionOperator: "මෙහෙයුම් මධ්‍යස්ථානය",
    missionObjective: "ප්‍රධාන අරමුණ",
    stepBreakdown: "මෙහෙයුමේ පියවරෙන් පියවර ගමන් සටහන",
    stepLaunch: "ගුවන්ගත වීම සහ රොකට් වෙන්වීම",
    stepCruise: "ග්‍රහලෝකාන්තර ගමන් මඟ",
    stepArrival: "කක්ෂගත වීම සහ ඇතුළු වීම",
    stepSurface: "පෘෂ්ඨීය ගවේෂණය හා සාම්පල ලබාගැනීම",
    stepCompletion: "විද්‍යාත්මක සොයාගැනීම් සහ උරුමය",

    newsHeading: "නාසා සජීවී විද්‍යා පුවත්",
    newsSubheading: "නාසා මූලස්ථානයෙන් නිකුත් වන නවතම නිල මාධ්‍ය නිවේදන සහ අභ්‍යවකාශ සොයාගැනීම් පිළිබඳ තොරතුරු.",
    readOfficialRelease: "NASA.gov හි කියවන්න",
    latestUpdates: "නවතම ප්‍රවෘත්ති",

    exportModalTitle: "ස්වාධීන තනි HTML ගොනුව (Single HTML Export)",
    exportModalDesc: "CSS සහ JavaScript සියල්ල ඇතුළත් කර සකස් කළ ස්වාධීන තනි HTML ගොනුවකි. ඕනෑම වෙබ් බ්‍රවුසරයක කිසිදු බාහිර අවශ්‍යතාවයකින් තොරව සෘජුවම ක්‍රියාත්මක කළ හැක!",
    copyHtmlCode: "HTML කේතය පිටපත් කරන්න",
    downloadHtmlFile: ".html ගොනුව බාගන්න",
    openStandaloneTab: "තනි ගොනුව පෙරදසුන් කරන්න",
    close: "වසන්න"
  },

  ta: {
    appName: "நாசா விண்வெளி ஆய்வு மையம்",
    appSubtitle: "முமொழி விண்வெளி தளம் (தமிழ் • සිංහල • English)",
    navApod: "நாளின் வானியல் படம்",
    nav3D: "3D விண்வெளி ஆய்வகம்",
    navMissions: "வரலாற்றுப் பணிகள்",
    navNews: "நாசா நேரலைச் செய்திகள்",
    navSaved: "சேமிக்கப்பட்டவை",
    navExportHtml: "ஒற்றை HTML கோப்பு",
    langEn: "English",
    langSi: "සිංහල",
    langTa: "தமிழ்",

    savedHeading: "சேமிக்கப்பட்ட விருப்பங்கள் (Saved Favorites)",
    savedSubheading: "நாளின் வானியல் படங்கள் (APOD) மற்றும் வரலாற்று விண்வெளி பயணங்கள் உங்கள் சாதனத்தில் பாதுகாப்பாக சேமிக்கப்பட்டுள்ளன.",
    savedApodTitle: "சேமிக்கப்பட்ட APOD படங்கள்",
    savedMissionsTitle: "சேமிக்கப்பட்ட விண்வெளிப் பணிகள்",
    noSavedItems: "இதுவரை எதுவும் சேமிக்கப்படவில்லை",
    noSavedSub: "எந்தவொரு APOD படம் அல்லது விண்வெளிப் பணியிலும் உள்ள புக்மார்க் அல்லது இதயக் குறியீட்டை அழுத்தி உங்கள் தனிப்பட்ட காப்பகத்தில் சேர்க்கவும்.",
    saveToFavorites: "விருப்பங்களில் சேமி",
    savedInFavorites: "சேமிக்கப்பட்டது",
    removeFromFavorites: "சேமிப்பிலிருந்து நீக்கு",
    savedBadge: "சேமிக்கப்பட்டது",
    clearAllSaved: "அனைத்தையும் நீக்கு",
    filterAll: "அனைத்தும்",

    apodHeading: "நாளின் வானியல் புகைப்படம் (APOD)",
    apodSubheading: "நாசாவின் தொலைநோக்கிகள் படம் பிடித்த பிரபஞ்ச விந்தைகளை, Gemini AI தொழில்நுட்பத்துடன் துல்லியமான தமிழ் மொழியில் கண்டு மகிழுங்கள்.",
    selectDate: "தேதியைத் தேர்ந்தெடுக்கவும்",
    today: "இன்று",
    yesterday: "நேற்று",
    randomDate: "ஏதேனும் ஒரு விண்வெளி நாள்",
    viewOriginalHd: "முழு HD (4K) காட்சி",
    translatingWithGemini: "Gemini AI மூலம் தமிழில் மொழிபெயர்க்கப்படுகிறது...",
    translatedByAi: "Gemini AI துல்லிய தமிழ் அறிவியல் மொழிபெயர்ப்பு",
    readAloud: "வாசித்து கேட்க",
    stopAudio: "ஒலியை நிறுத்து",
    copyText: "உரையை நகலெடு",
    copiedText: "நகலெடுக்கப்பட்டது!",
    quickPresets: "முக்கிய விண்வெளி காப்பகங்கள்:",
    presetWebbDeepField: "வெப் ஆழ விண்வெளிப் பார்வை",
    presetPillars: "படைப்பின் தூண்கள் (Pillars)",
    presetArtemisOrion: "ஆர்ட்டெமிஸ் ஓரியன் சந்திரக் காட்சி",
    presetMarsPanorama: "செவ்வாய் ஜெசெரோ பரந்த பார்வை",
    originalEnglish: "அசல் ஆங்கிலம் (Original)",
    copyright: "பட உரிமை & கடன்",

    visualizerHeading: "ஊடாடும் 3D விண்வெளி & விண்கல ஆய்வகம்",
    visualizerSubheading: "கோள்கள், விண்கலங்கள் மற்றும் வளிமண்டல ஒளிர்வை முப்பரிமாண (3D) தொழில்நுட்பத்தில் நிகழ்நேரத்தில் ஆராயுங்கள்.",
    targetEarth: "பூமி கிரகம்",
    targetMoon: "சந்திரன் (நிலவு)",
    targetMars: "செவ்வாய் (சிவப்பு கிரகம்)",
    targetSpacecraft: "ஓரியன் விண்கலம்",
    toggleOrbit: "சுய சுழற்சி",
    toggleAtmosphere: "வளிமண்டல ஒளிர்வு",
    resetCamera: "கேமராவை மீட்டமை",
    telemetrySpeed: "சுற்றுப்பாதை வேகம்",
    telemetryAltitude: "தற்போதைய உயரம்",
    telemetryDistance: "தொலைத்தொடர்பு வரம்பு",
    solarSystemScale: "அளவு யதார்த்தம்",
    orbitControlsHint: "சுழற்ற இழுக்கவும் • பெரிதாக்க ஸ்க்ரோல் செய்யவும் • நகர்த்த வலது கிளிக் செய்யவும்",

    missionsHeading: "நாசாவின் வரலாற்றுச் சிறப்புமிக்க விண்வெளிப் பணிகள்",
    missionsSubheading: "மனிதன் நிலவில் காலடி வைத்த அப்பல்லோ 11 முதல், ஆர்ட்டெமிஸ், ஜேம்ஸ் வெப் மற்றும் செவ்வாய் ரோவர்கள் வரை.",
    missionStatus: "நிலை",
    missionLaunchDate: "ஏவப்பட்ட தேதி",
    missionDestination: "இலக்கு",
    missionOperator: "கட்டுப்பாட்டு மையம்",
    missionObjective: "முதன்மை நோக்கம்",
    stepBreakdown: "படிப்படியான விண்வெளி பயண திட்டம்",
    stepLaunch: "ஏவுதல் மற்றும் பூஸ்டர் பிரிப்பு",
    stepCruise: "கோள்களுக்கிடையேயான பயணம்",
    stepArrival: "சுற்றுப்பாதையில் நுழைதல்",
    stepSurface: "தரை இறங்குதல் & ஆய்வு",
    stepCompletion: "அறிவியல் சாதனைகள் மற்றும் தாக்கம்",

    newsHeading: "நாசா நேரலை அறிவியல் செய்திகள்",
    newsSubheading: "நாசா தலைமையகத்திலிருந்து நேரடியாக வெளியாகும் சமீபத்திய அதிகாரப்பூர்வ செய்திகள் மற்றும் கண்டுபிடிப்புகள்.",
    readOfficialRelease: "NASA.gov இல் வாசிக்க",
    latestUpdates: "சமீபத்திய அறிவிப்புகள்",

    exportModalTitle: "தனித்த ஒற்றை HTML கோப்பு (Single HTML Export)",
    exportModalDesc: "CSS மற்றும் JavaScript அனைத்தையும் உள்ளடக்கிய முழுமையான ஒற்றை HTML கோப்பு. எந்த உலாவியிலும் வெளிப்புற இணைப்புகள் இன்றி நேரடியாக இயங்கும்!",
    copyHtmlCode: "HTML குறியீட்டை நகலெடு",
    downloadHtmlFile: ".html கோப்பைப் பதிவிறக்கு",
    openStandaloneTab: "முன்னோட்டத்தைத் திற",
    close: "மூடு"
  }
};
