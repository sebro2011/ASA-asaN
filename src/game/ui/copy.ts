/**
 * Game interface copy, in all three languages the product ships.
 *
 * Kept out of the JSX for the same reason the rest of the app does it: a
 * translator can review one file, and no screen can silently fall back to English.
 * The type below is derived from `en`, so a missing Sinhala or Tamil string is a
 * type error rather than a runtime surprise.
 */
import type { SupportedLanguage } from '../../i18n/translations';

const en = {
  /* shell */
  eyebrow: 'COSMORA · MARS',
  title: 'Mars Explorer',
  subtitle:
    'An open-world expedition across a procedurally generated Mars. Walk, drive, scan and record. Every resource figure and mineral identification is a simulation.',
  enter: 'Enter the surface',
  continueGame: 'Resume expedition',
  newGame: 'New expedition',
  loading: 'Preparing the surface…',
  returnToSite: 'Back to COSMORA',
  fullscreen: 'Fullscreen',

  /* menu */
  menuTitle: 'Mission control',
  menuBody: 'Choose how to begin. Saving happens on this device; nothing is uploaded.',
  discoverTitle: 'What is simulated',
  discover1: 'Terrain is generated from a fixed seed, so the same planet returns every visit.',
  discover2: 'Oxygen, suit power and rover battery are fictional gameplay values, not telemetry.',
  discover3: 'Rock classifications are illustrative, drawn from published NASA findings.',

  /* hud */
  hudMode: 'Mode',
  hudFoot: 'On foot',
  hudRover: 'Driving',
  hudPos: 'Position',
  hudSol: 'Sol time',
  hudFps: 'FPS',
  oxygen: 'Oxygen',
  suit: 'Suit power',
  roverBattery: 'Rover battery',
  energy: 'Stamina',
  samples: 'Samples',
  distance: 'Distance',
  research: 'Research',
  promptHint: 'to',
  movementHelp: 'WASD move · Shift run · Space jump · E scan · F rover · M map · J journal · I inventory · Esc pause',

  /* pause */
  paused: 'Paused',
  resume: 'Resume',
  settings: 'Settings',
  inventory: 'Inventory',
  map: 'Map',
  journal: 'Research journal',
  restart: 'Restart expedition',
  exit: 'Leave the surface',

  /* settings */
  settingsTitle: 'Settings',
  quality: 'Graphics quality',
  qualityHigh: 'High',
  qualityBalanced: 'Balanced',
  qualityLow: 'Low',
  qualityAuto: 'Automatic',
  camera: 'Camera',
  cameraThird: 'Third person',
  cameraFirst: 'First person',
  sensitivity: 'Look sensitivity',
  saveNow: 'Save now',
  saved: 'Saved to this device',
  saveUnavailable: 'Saving is unavailable in this browser; progress lasts for this session.',
  clearSave: 'Delete saved expedition',

  /* inventory + journal */
  inventoryTitle: 'Samples',
  inventoryEmpty: 'No samples yet. Walk up to a rock and press E.',
  missionsTitle: 'Exploration missions',
  missionGeology: 'Geology survey: scan three different simulated rock types.',
  missionGeologyFact: 'Mars rocks preserve evidence of volcanic activity and past environments. Classifications here are illustrative.',
  missionCrater: 'Crater investigation: walk to the rim of the generated crater centred near (79, 21).',
  missionCraterFact: 'Impact craters form when objects strike a planetary surface; their rims can expose excavated material.',
  missionTraverse: 'Rover traverse: drive within 10 m of (35, 0), then (65, −5).',
  missionTraverseFact: 'Real Mars rovers compare observations across a traverse; this vehicle and route are fictional.',
  missionNote: 'Objectives, locations and mineral identifications are simulated; they are not real Mars measurements.',
  missionSource: 'NASA: Mars exploration science',
  missionComplete: 'Complete',
  journalTitle: 'Research journal',
  journalEmpty: 'Your field notes will appear here as you explore.',
  confidence: 'match',
  collectedAt: 'Collected',
  progressLabel: 'Research complete',
  attribution:
    'Mineral classifications are illustrative, drawn from published NASA/JPL results for Spirit, Opportunity, Curiosity and Perseverance. They are not measurements made by this page.',
  simulated: 'Simulated value',

  /* map */
  mapTitle: 'Surface map',
  mapLegend: 'You · rover · base · samples',
  mapEmpty: 'No discoveries marked yet.',
  mapRadius: 'm radius',

  /* touch */
  touchInteract: 'Scan',
  touchBoard: 'Rover',
  touchJump: 'Jump',
  touchBrake: 'Brake',
  touchRun: 'Run',
  touchMenu: 'Menu',

  /* fallback */
  webglTitle: 'This device cannot render the surface',
  webglBody:
    'COSMORA: Mars Explorer needs WebGL. The rest of the site, including the NASA imagery and data, works without it.',
  webglBack: 'Return to COSMORA',

  /* honesty */
  simulationBadge: 'Simulation',
  liveBadge: 'Live NASA imagery',
  fpsNote: 'Resolution reduced to hold frame rate',
};

export type GameCopy = typeof en;

const si: GameCopy = {
  eyebrow: 'COSMORA · අඟහරු',
  title: 'අඟහරු ගවේෂකයා',
  subtitle:
    'ක්‍රමලේඛනයෙන් ජනිත අඟහරු මතුපිටක් හරහා විවෘත ලෝක ගවේෂණයක්. ඇවිදින්න, රිය පදවන්න, පරිලෝකනය කරන්න, සටහන් කරන්න. සෑම සම්පත් අගයක් සහ ඛනිජ හඳුනාගැනීමක්ම අනුකරණයකි.',
  enter: 'මතුපිටට ඇතුළු වන්න',
  continueGame: 'ගවේෂණය දිගටම කරගෙන යන්න',
  newGame: 'නව ගවේෂණයක්',
  loading: 'මතුපිට සූදානම් කරමින්…',
  returnToSite: 'COSMORA වෙත ආපසු',
  fullscreen: 'පූර්ණ තිරය',

  menuTitle: 'මෙහෙයුම් පාලනය',
  menuBody: 'ආරම්භ කරන ආකාරය තෝරන්න. සුරැකීම මෙම උපාංගයේ සිදු වේ; කිසිවක් උඩුගත නොවේ.',
  discoverTitle: 'අනුකරණය කරන්නේ කුමක්ද',
  discover1: 'භූමිය නිශ්චිත බීජයකින් ජනිත වේ, එබැවින් සෑම අවස්ථාවකම එකම ග්‍රහලෝකය ලැබේ.',
  discover2: 'ඔක්සිජන්, ඇඳුම් බලය සහ රෝවර් බැටරිය ප්‍රබන්ධ ක්‍රීඩා අගයන් මිස තාක්ෂණික දත්ත නොවේ.',
  discover3: 'පාෂාණ වර්ගීකරණය NASA ප්‍රකාශිත සොයාගැනීම් මත පදනම් වූ නිදර්ශනාත්මක ඒවාය.',

  hudMode: 'ප්‍රකාරය',
  hudFoot: 'පාදයෙන්',
  hudRover: 'රිය පදවමින්',
  hudPos: 'ස්ථානය',
  hudSol: 'Sol වේලාව',
  hudFps: 'FPS',
  oxygen: 'ඔක්සිජන්',
  suit: 'ඇඳුම් බලය',
  roverBattery: 'රෝවර් බැටරිය',
  energy: 'ශක්තිය',
  samples: 'නියදි',
  distance: 'දුර',
  research: 'පර්යේෂණ',
  promptHint: 'සඳහා',
  movementHelp: 'WASD චලනය · Shift දිවීම · Space පැනීම · E පරිලෝකනය · F රෝවර් · M සිතියම · J සටහන් · I ඉන්වෙන්ටරි · Esc විරාමය',

  paused: 'විරාමය',
  resume: 'දිගටම කරගෙන යන්න',
  settings: 'සැකසුම්',
  inventory: 'ඉන්වෙන්ටරි',
  map: 'සිතියම',
  journal: 'පර්යේෂණ සටහන්',
  restart: 'ගවේෂණය නැවත අරඹන්න',
  exit: 'මතුපිටින් ඉවත් වන්න',

  settingsTitle: 'සැකසුම්',
  quality: 'ග්‍රැෆික් ගුණාත්මකභාවය',
  qualityHigh: 'ඉහළ',
  qualityBalanced: 'සමතුලිත',
  qualityLow: 'අඩු',
  qualityAuto: 'ස්වයංක්‍රීය',
  camera: 'කැමරාව',
  cameraThird: 'තෙවන පුද්ගල',
  cameraFirst: 'පළමු පුද්ගල',
  sensitivity: 'බැලීමේ සංවේදීතාව',
  saveNow: 'දැන් සුරකින්න',
  saved: 'මෙම උපාංගයේ සුරකින ලදි',
  saveUnavailable: 'මෙම බ්‍රවුසරයේ සුරැකීම නොමැත; ප්‍රගතිය මෙම සැසියට පමණක් පවතී.',
  clearSave: 'සුරකින ලද ගවේෂණය මකන්න',

  inventoryTitle: 'නියදි',
  inventoryEmpty: 'තවම නියදි නැත. පාෂාණයක් ළඟට ගොස් E ඔබන්න.',
  missionsTitle: 'ගවේෂණ මෙහෙයුම්',
  missionGeology: 'භූ විද්‍යා සමීක්ෂණය: අනුකරණය කළ විවිධ පාෂාණ වර්ග තුනක් පරිලෝකනය කරන්න.',
  missionGeologyFact: 'අඟහරු පාෂාණවල ගිනිකඳු ක්‍රියාකාරිත්වය සහ පැරණි පරිසර පිළිබඳ සාක්ෂි ඇත. මෙහි වර්ගීකරණ ආදර්ශ පමණි.',
  missionCrater: 'ආවාට පරීක්ෂණය: (79, 21) අසල පිහිටි ජනිත ආවාටයේ දාරය වෙත ඇවිදින්න.',
  missionCraterFact: 'වස්තු ග්‍රහලෝක මතුපිටට ගැටීමෙන් ආවාට සෑදෙන අතර දාරවල කැණුණු ද්‍රව්‍ය දැකිය හැක.',
  missionTraverse: 'රෝවර් ගමන: (35, 0) සිට මීටර 10ක් තුළටත් ඉන්පසු (65, −5) වෙතත් ධාවනය කරන්න.',
  missionTraverseFact: 'සැබෑ අඟහරු රෝවර් ගමනක් දිගේ නිරීක්ෂණ සසඳයි; මෙම වාහනය සහ මාර්ගය ප්‍රබන්ධ වේ.',
  missionNote: 'අරමුණු, ස්ථාන සහ ඛනිජ හඳුනාගැනීම් අනුකරණයන් මිස සැබෑ අඟහරු මිනුම් නොවේ.',
  missionSource: 'NASA: අඟහරු ගවේෂණ විද්‍යාව',
  missionComplete: 'සම්පූර්ණයි',
  journalTitle: 'පර්යේෂණ සටහන්',
  journalEmpty: 'ඔබ ගවේෂණය කරන විට ඔබේ ක්ෂේත්‍ර සටහන් මෙහි පෙනෙනු ඇත.',
  confidence: 'ගැළපීම',
  collectedAt: 'එකතු කළේ',
  progressLabel: 'පර්යේෂණ සම්පූර්ණයි',
  attribution:
    'ඛනිජ වර්ගීකරණය NASA/JPL විසින් Spirit, Opportunity, Curiosity සහ Perseverance සඳහා ප්‍රකාශිත ප්‍රතිඵල මත පදනම් වූ නිදර්ශනාත්මක ඒවාය. ඒවා මෙම පිටුව විසින් කළ මිනුම් නොවේ.',
  simulated: 'අනුකරණ අගය',

  mapTitle: 'මතුපිට සිතියම',
  mapLegend: 'ඔබ · රෝවර් · මධ්‍යස්ථානය · නියදි',
  mapEmpty: 'තවම සොයාගැනීම් සලකුණු කර නැත.',
  mapRadius: 'm අරය',

  touchInteract: 'පරිලෝකනය',
  touchBoard: 'රෝවර්',
  touchJump: 'පනින්න',
  touchBrake: 'තිරිංග',
  touchRun: 'දුවන්න',
  touchMenu: 'මෙනුව',

  webglTitle: 'මෙම උපාංගයට මතුපිට පෙන්විය නොහැක',
  webglBody:
    'COSMORA: Mars Explorer සඳහා WebGL අවශ්‍යයි. NASA ඡායාරූප සහ දත්ත ඇතුළු අනෙක් සියල්ල එය නොමැතිව ක්‍රියා කරයි.',
  webglBack: 'COSMORA වෙත ආපසු',

  simulationBadge: 'අනුකරණය',
  liveBadge: 'සජීවී NASA ඡායාරූප',
  fpsNote: 'තිර රාමු වේගය රැක ගැනීමට විභේදනය අඩු කරන ලදි',
};

const ta: GameCopy = {
  eyebrow: 'COSMORA · செவ்வாய்',
  title: 'செவ்வாய் ஆய்வாளர்',
  subtitle:
    'நிரலாக்கத்தால் உருவாக்கப்பட்ட செவ்வாய் மேற்பரப்பில் ஒரு திறந்த உலக பயணம். நடங்கள், ஓட்டுங்கள், ஸ்கேன் செய்யுங்கள், பதிவு செய்யுங்கள். ஒவ்வொரு வள அளவும் கனிம அடையாளமும் ஒரு உருவகப்படுத்துதல்.',
  enter: 'மேற்பரப்பில் நுழையுங்கள்',
  continueGame: 'பயணத்தைத் தொடருங்கள்',
  newGame: 'புதிய பயணம்',
  loading: 'மேற்பரப்பு தயாராகிறது…',
  returnToSite: 'COSMORA க்குத் திரும்பு',
  fullscreen: 'முழுத்திரை',

  menuTitle: 'பணிக் கட்டுப்பாடு',
  menuBody: 'எப்படித் தொடங்குவது என்பதைத் தேர்ந்தெடுங்கள். சேமிப்பு இந்தச் சாதனத்தில் நடக்கிறது; எதுவும் பதிவேற்றப்படவில்லை.',
  discoverTitle: 'எது உருவகப்படுத்தப்பட்டது',
  discover1: 'நிலப்பரப்பு நிலையான விதையிலிருந்து உருவாக்கப்படுகிறது, எனவே ஒவ்வொரு முறையும் அதே கோள் வரும்.',
  discover2: 'ஆக்சிஜன், உடை சக்தி, ரோவர் மின்கலம் ஆகியவை கற்பனை விளையாட்டு மதிப்புகள், தொலைஅளவீடு அல்ல.',
  discover3: 'பாறை வகைப்பாடுகள் NASA வெளியிட்ட முடிவுகளின் அடிப்படையிலான விளக்க வகைப்பாடுகள்.',

  hudMode: 'பயன்முறை',
  hudFoot: 'நடந்து',
  hudRover: 'ஓட்டுகிறது',
  hudPos: 'இருப்பிடம்',
  hudSol: 'Sol நேரம்',
  hudFps: 'FPS',
  oxygen: 'ஆக்சிஜன்',
  suit: 'உடை சக்தி',
  roverBattery: 'ரோவர் மின்கலம்',
  energy: 'சக்தி',
  samples: 'மாதிரிகள்',
  distance: 'தூரம்',
  research: 'ஆய்வு',
  promptHint: 'செய்ய',
  movementHelp: 'WASD நகர்வு · Shift ஓட்டம் · Space குதி · E ஸ்கேன் · F ரோவர் · M வரைபடம் · J பதிவுகள் · I இருப்பு · Esc இடைநிறுத்தம்',

  paused: 'இடைநிறுத்தப்பட்டது',
  resume: 'தொடரவும்',
  settings: 'அமைப்புகள்',
  inventory: 'இருப்பு',
  map: 'வரைபடம்',
  journal: 'ஆய்வுப் பதிவுகள்',
  restart: 'பயணத்தை மீண்டும் தொடங்கு',
  exit: 'மேற்பரப்பை விட்டு வெளியேறு',

  settingsTitle: 'அமைப்புகள்',
  quality: 'வரைகலை தரம்',
  qualityHigh: 'உயர்',
  qualityBalanced: 'சமநிலை',
  qualityLow: 'தாழ்',
  qualityAuto: 'தானியங்கி',
  camera: 'கேமரா',
  cameraThird: 'மூன்றாம் நபர்',
  cameraFirst: 'முதல் நபர்',
  sensitivity: 'பார்வை உணர்திறன்',
  saveNow: 'இப்போது சேமி',
  saved: 'இந்தச் சாதனத்தில் சேமிக்கப்பட்டது',
  saveUnavailable: 'இந்த உலாவியில் சேமிப்பு இல்லை; முன்னேற்றம் இந்த அமர்வுக்கு மட்டும்.',
  clearSave: 'சேமித்த பயணத்தை அழி',

  inventoryTitle: 'மாதிரிகள்',
  inventoryEmpty: 'மாதிரிகள் இன்னும் இல்லை. ஒரு பாறையருகே சென்று E அழுத்துங்கள்.',
  missionsTitle: 'ஆய்வுப் பணிகள்',
  missionGeology: 'புவியியல் ஆய்வு: உருவகப்படுத்தப்பட்ட மூன்று வெவ்வேறு பாறை வகைகளைப் பகுப்பாய்வு செய்யுங்கள்.',
  missionGeologyFact: 'செவ்வாய்ப் பாறைகள் எரிமலைச் செயல்பாடு மற்றும் பழைய சூழல்களின் சான்றுகளைப் பாதுகாக்கின்றன. இங்குள்ள வகைப்பாடுகள் விளக்கத்திற்கானவை.',
  missionCrater: 'பள்ள ஆய்வு: (79, 21) அருகே உருவாக்கப்பட்ட பள்ளத்தின் விளிம்பிற்கு நடந்து செல்லுங்கள்.',
  missionCraterFact: 'ஒரு பொருள் கோள் மேற்பரப்பில் மோதும்போது பள்ளம் உருவாகிறது; அதன் விளிம்பில் தோண்டப்பட்ட பொருட்கள் வெளிப்படலாம்.',
  missionTraverse: 'ரோவர் பயணம்: முதலில் (35, 0), பின்னர் (65, −5) இடத்திலிருந்து 10 மீட்டருக்குள் ஓட்டுங்கள்.',
  missionTraverseFact: 'உண்மையான செவ்வாய் ரோவர்கள் பயணப் பாதையில் கண்டறிவுகளை ஒப்பிடுகின்றன; இவ்வாகனமும் பாதையும் கற்பனையானவை.',
  missionNote: 'நோக்கங்கள், இடங்கள் மற்றும் கனிம அடையாளங்கள் உருவகங்கள்; உண்மையான செவ்வாய் அளவீடுகள் அல்ல.',
  missionSource: 'NASA: செவ்வாய் ஆய்வு அறிவியல்',
  missionComplete: 'முடிந்தது',
  journalTitle: 'ஆய்வுப் பதிவுகள்',
  journalEmpty: 'நீங்கள் ஆராயும்போது உங்கள் களக் குறிப்புகள் இங்கே தோன்றும்.',
  confidence: 'பொருத்தம்',
  collectedAt: 'சேகரித்தது',
  progressLabel: 'ஆய்வு முடிந்தது',
  attribution:
    'கனிம வகைப்பாடுகள் Spirit, Opportunity, Curiosity, Perseverance ஆகியவற்றுக்கான NASA/JPL வெளியிட்ட முடிவுகளின் அடிப்படையிலான விளக்க வகைப்பாடுகள். அவை இந்தப் பக்கம் செய்த அளவீடுகள் அல்ல.',
  simulated: 'உருவகப்படுத்தப்பட்ட மதிப்பு',

  mapTitle: 'மேற்பரப்பு வரைபடம்',
  mapLegend: 'நீங்கள் · ரோவர் · தளம் · மாதிரிகள்',
  mapEmpty: 'கண்டுபிடிப்புகள் இன்னும் குறிக்கப்படவில்லை.',
  mapRadius: 'm ஆரம்',

  touchInteract: 'ஸ்கேன்',
  touchBoard: 'ரோவர்',
  touchJump: 'குதி',
  touchBrake: 'நிறுத்து',
  touchRun: 'ஓடு',
  touchMenu: 'பட்டி',

  webglTitle: 'இந்தச் சாதனத்தால் மேற்பரப்பைக் காட்ட முடியாது',
  webglBody:
    'COSMORA: Mars Explorer க்கு WebGL தேவை. NASA படங்கள் மற்றும் தரவு உட்பட மற்றவை அது இல்லாமலும் வேலை செய்யும்.',
  webglBack: 'COSMORA க்குத் திரும்பு',

  simulationBadge: 'உருவகப்படுத்துதல்',
  liveBadge: 'நேரடி NASA படங்கள்',
  fpsNote: 'திரை வேகத்தைத் தக்கவைக்க பிரிதிறன் குறைக்கப்பட்டது',
};

export const GAME_COPY: Record<SupportedLanguage, GameCopy> = { en, si, ta };

export function gameCopy(lang: SupportedLanguage): GameCopy {
  return GAME_COPY[lang] ?? GAME_COPY.en;
}
