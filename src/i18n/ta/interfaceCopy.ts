/**
 * Interface copy for the redesigned shell, home page and page framing.
 *
 * Kept in one typed module instead of inline conditionals so translators can
 * review a single file and no screen silently falls back to English. Merged into
 * the existing i18next resources in src/i18n.ts (same pattern as the Earth Lab).
 */

import type { Copy } from '../interfaceCopy';

export const interfaceCopyTa: Copy = {

  navHome: 'முகப்பு',
  wsNavWorkspace: 'பயணக் கட்டுப்பாடு',
  navExplore: 'ஆராய்க',
  navEarth: 'பூமி',
  navSystem: 'சூரிய குடும்பம்',
  navAssistant: 'உதவியாளர்',
  navAskNova: 'NOVA-விடம் கேளுங்கள்',
  navMenu: 'பட்டி',
  navAllDestinations: 'அனைத்து பகுதிகள்',
  navLanguage: 'மொழி',
  interfaceLanguage: 'இடைமுக மொழி',
  skipToContent: 'முதன்மை உள்ளடக்கத்திற்குச் செல்லவும்',
  siteTagline: 'பூமி · பயணங்கள் · ஆழ்ந்த விண்வெளி',

  stateLive: 'நேரலை',
  stateCached: 'சேமிப்பு',
  stateDerived: 'வழிப்பெறுதி',
  stateStatic: 'குறிப்பு',
  stateSimulated: 'உருவகம்',
  stateUnavailable: 'கிடைக்கவில்லை',
  stateLoading: 'கோருகிறது',
  lastUpdated: 'கடைசி புதுப்பிப்பு',
  retrieved: 'பெறப்பட்டது',
  sourceLabel: 'மூலம்',
  unavailableShort: 'கிடைக்கவில்லை',
  retry: 'மீண்டும் முயற்சிக்கவும்',
  refresh: 'புதுப்பிக்கவும்',
  open: 'திறக்க',
  close: 'மூடு',
  viewAll: 'அனைத்தையும் பார்க்க',

  heroEyebrow: 'பூமி கண்காணிப்பு · கோள் அறிவியல் · ஆழ்ந்த விண்வெளி',
  heroTitleA: 'அடிவானத்திற்கு',
  heroTitleB: 'அப்பால்.',
  heroDescription:
    'மாறிவரும் நமது பூமியைக் கண்டறியுங்கள், சூரியக் குடும்பம் முழுவதும் பயணங்களைப் பின்தொடருங்கள், உண்மையான அறிவியல் தரவு வழியாக பிரபஞ்சத்தை ஆராயுங்கள்.',
  heroCtaPrimary: 'பூமி நுண்ணறிவு ஆய்வகத்தைத் திறக்க',
  heroCtaSecondary: 'பயண மேலோட்டம்',
  heroCtaTertiary: 'இன்றைய வானியல் படம்',
  heroScroll: 'தொலைஅளவியலுக்குச் செல்லவும்',
  heroImageCredit: 'பூமி படங்கள்: NASA Blue Marble, NASA Visible Earth',
  heroFact1: 'நாசா திறந்த தரவு',
  heroFact2: 'மூன்று மொழிகள்',
  heroFact3: 'புனையப்பட்ட மதிப்புகள் இல்லை',

  signalsTitle: 'தரவு இணைப்புகள்',
  signalsSubtitle: 'இந்தப் பக்கம் தற்போது படிக்கும் மூலங்களின் நிலை.',
  signalApod: 'APOD',
  signalIss: 'சுற்றுப்பாதை கண்காணிப்பு',
  signalNeo: 'பூமிக்கு அருகிலுள்ளவை',
  signalPower: 'NASA POWER',

  overviewEyebrow: 'பயண மேலோட்டம்',
  overviewTitle: 'கருவிகள் இப்போது தெரிவிப்பவை',
  overviewDescription:
    'இந்தத் தளம் அணுகக்கூடிய நேரலை மூலங்களின் ஒரே செயல்பாட்டுக் காட்சி. ஒவ்வொரு பலகையும் அதன் மதிப்புகள் நேரலை, சேமிப்பு, உருவகம் அல்லது கிடைக்காதது என்பதைத் தெரிவிக்கிறது.',
  issTitle: 'சர்வதேச விண்வெளி நிலையம்',
  issSubtitle: 'பொது சுற்றுப்பாதை கண்காணிப்பிலிருந்து பெறப்பட்ட நிலை',
  issLatitude: 'அட்சரேகை',
  issLongitude: 'தீர்க்கரேகை',
  issAltitude: 'உயரம்',
  issVelocity: 'தரை வேகம்',
  issVisibility: 'தெரிவுநிலை',
  issOpenTracker: 'சுற்றுப்பாதை கண்காணிப்பைத் திறக்க',
  issSimulatedNote:
    'வெளிப்புற கண்காணிப்பு சேவை பதிலளிக்கவில்லை. இந்த நிலை கடைசி சுற்றுப்பாதை கூறுகளிலிருந்து கணக்கிடப்பட்டது; நேரலைத் தொலைஅளவியல் அல்ல.',
  neoTitle: 'பூமிக்கு அருகிலுள்ள வஸ்துக்கள்',
  neoSubtitle: 'அடுத்த ஏழு நாட்களில் அணுகல்கள் · NASA NeoWs',
  neoCount: 'கண்காணிக்கப்படும் வஸ்துக்கள்',
  neoClosest: 'மிக அருகிலான அணுகல்',
  neoHazardous: 'ஆபத்து எனக் குறிக்கப்பட்டவை',
  neoDiameter: 'மதிப்பிடப்பட்ட விட்டம்',
  neoDistance: 'தவிர்க்கும் தூரம்',
  neoVelocity: 'ஒப்பு வேகம்',
  neoOpen: 'NEO ஆய்வுக் கருவியைத் திறக்க',
  neoDisclaimer:
    '“ஆபத்து வாய்ப்புள்ளது” என்பது அளவு மற்றும் சுற்றுப்பாதையை அடிப்படையாகக் கொண்ட வகைப்பாடு; மோதல் முன்னறிவிப்பு அல்ல. அணுகல் என்பது சாதாரண சுற்றுப்பாதை நிகழ்வு.',
  neoStaticNote:
    'நேரலை NeoWs சேவை கிடைக்காததால் அணுகல் மதிப்புகள் வழங்கப்படவில்லை. அதற்குப் பதிலாக நாசா பட்டியலின் குறிப்பு வஸ்துக்கள் காட்டப்படுகின்றன.',
  apodTitle: 'நாளின் வானியல் படம்',
  apodOpen: 'முழு காப்பகத்தைத் திறக்க',
  apodCredit: 'பட உரிமை',
  apodSampleNote: 'காப்பகக் குறிப்புப் படம் — நேரலை APOD சேவை பதிலளிக்கவில்லை.',
  apodImageFailed: 'நாசாவிடமிருந்து படத்தை ஏற்ற முடியவில்லை. அசல் இன்னும் கிடைக்கிறது.',
  apodMediaMissing: 'நாசா இந்தப் பதிவை நிலைப்படம் இல்லாமல் வெளியிட்டுள்ளது.',
  apodOpenOriginal: 'அசல் ஊடகத்தைத் திறக்க',
  apodVideoNote: 'இந்தப் பதிவு ஒரு காணொளி, நிலைப்படம் அல்ல.',

  earthEyebrow: 'பூமி நுண்ணறிவு',
  earthTitle: 'பதினைந்து ஆண்டு மேற்பரப்பு வெப்பநிலை, ஒரு கட்டச் செல்',
  earthDescription:
    'பூமி நுண்ணறிவு ஆய்வகத்தின் நேரலைப் பகுதி: கொழும்புக்கான NASA POWER மாதாந்திர காற்று வெப்பநிலை, ஆண்டு சராசரிகளாகச் சுருக்கப்பட்டது. ஆய்வகம் மழைப்பொழிவு, ஈரப்பதம், காற்று, கதிர்வீச்சு மற்றும் செயற்கைக்கோள் படங்களையும் சேர்க்கிறது.',
  earthMeanLabel: 'கால சராசரி',
  earthTrendLabel: 'சிறிய வர்க்கப் போக்கு',
  earthPointsLabel: 'முழு ஆண்டுகள்',
  earthOpenLab: 'ஆய்வகத்தைத் திறக்க',
  earthGridNote:
    'POWER கோரப்பட்ட இடத்தை உள்ளடக்கிய ≈0.5° × 0.625° கட்டச் செல்லைத் தெரிவிக்கிறது. இவை செயற்கைக்கோள் மற்றும் மறு பகுப்பாய்வு மதிப்பீடுகள்; வானிலை நிலைய அளவீடுகள் அல்ல.',
  earthLabBriefTitle: 'நான்கு பணியிடங்கள், ஒரே மூல மாதிரி',

  discoveryEyebrow: 'தொடர்ந்து ஆராயுங்கள்',
  discoveryTitle: 'கருவிகள், காப்பகங்கள் மற்றும் உருவகங்கள்',
  discoveryDescription: 'பதின்மூன்று பகுதிகள்; ஒவ்வொன்றுக்கும் தனி தரவு ஒப்பந்தமும் மூல மேற்கோளும் உண்டு.',

  pageApodEyebrow: 'ஆராய்க · நாளின் வானியல் படம்',
  page3dEyebrow: 'ஆராய்க · 3D காட்சிப்படுத்தல்',
  pageMissionsEyebrow: 'ஆராய்க · பறப்பு வரலாறு',
  pageNewsEyebrow: 'ஆராய்க · அறிவிப்புகள்',
  pageQuizEyebrow: 'ஆராய்க · கற்றல்',
  pageEarthEyebrow: 'பூமி · நுண்ணறிவு ஆய்வகம்',
  pageEpicEyebrow: 'பூமி · DSCOVR படங்கள்',
  pageIssEyebrow: 'பூமி · சுற்றுப்பாதை கண்காணிப்பு',
  pageNeoEyebrow: 'சூரிய குடும்பம் · பூமிக்கு அருகிலுள்ளவை',
  pageExoEyebrow: 'சூரிய குடும்பம் · புறக்கோள்கள்',
  pageLaunchEyebrow: 'சூரிய குடும்பம் · உருவகப்படுத்தல்',
  pageAssistantEyebrow: 'உதவியாளர் · அடிப்படை AI',
  pageSavedEyebrow: 'உதவியாளர் · உங்கள் தொகுப்பு',

  footerDisclaimer:
    'பொதுவில் கிடைக்கும் நாசா அறிவியல் தரவுக்கான சுயாதீன, மூன்று மொழி இடைமுகம். நாசா நிறுவனத்துடன் தொடர்பில்லை.',
  footerSources: 'தரவு மூலங்கள்',
  footerExport: 'ஒற்றை HTML கோப்பாக ஏற்றுமதி',
  footerRights: 'அறிவியல் அறிவாற்றலுக்காக உருவாக்கப்பட்டது',
  /* APOD */
  apodLoading: 'APOD பதிவைக் கோருகிறது',
  apodErrorTitle: 'APOD சேவை பதிலளிக்கவில்லை',
  apodErrorBody: 'இந்தத் தேதிக்கு மாற்றுப் படம் எதுவும் உருவாக்கப்படவில்லை. மீண்டும் முயலுங்கள், வேறு நாளைத் தேர்ந்தெடுங்கள் அல்லது apod.nasa.gov இல் பதிவைத் திறக்கவும்.',
  apodRetry: 'மீண்டும் கோரு',
  apodSampleBadge: 'மாதிரிப் பதிவு',
  apodSampleBody: 'நேரடி APOD சேவையை அணுக முடியவில்லை. கீழே உள்ள படமும் உரையும் ஆஃப்லைனுக்காக வைக்கப்பட்ட மாதிரி — தேர்ந்தெடுத்த தேதியின் வெளியீடு அல்ல.',
  apodCachedBadge: 'சேமித்த நகல்',
  apodCachedBody: 'சாதனச் சேமிப்பகத்திலிருந்து வழங்கப்பட்டது; புதிய கோரிக்கை அல்ல.',
  apodCreditLabel: 'நன்றி',
  apodScienceSource: 'NASA Science APOD archive · சிறப்புப் படம்; ஊடகம் மற்றும் உரிமைக்கு NASA பதிவைப் பார்க்கவும்',
  apodScienceCredit: 'உரிமைக்கு NASA பதிவைப் பார்க்கவும்',
  apodOpenSource: 'apod.nasa.gov இல் பதிவைத் திற',
  apodPrevious: 'முந்தைய நாள்',
  apodNext: 'அடுத்த நாள்',
  apodDateLabel: 'தேதி',
  apodResolution: 'தெளிவுத்திறன்',
  apodStandard: 'தரநிலை',
  apodHigh: 'முழு தெளிவுத்திறன்',
  apodArchiveJumps: 'காப்பகத் தாவல்கள்',
  destinationErrorTitle: 'இந்தப் பகுதி ஏற்றப்படவில்லை',
  destinationErrorBody: 'இந்தக் காட்சியின் ஒரு தொகுதி தொடங்க முடியவில்லை — பெரும்பாலும் இந்தச் சாதனத்தின் WebGL, வரைபடம் அல்லது வலையமைப்பு வரம்பு. மற்ற பகுதிகள் பாதிக்கப்படவில்லை.',
  apodReadNasa: 'NASA நாளொன்றுக்கு ஒரு படத்தை வெளியிடுகிறது. வேறுவிதமாகக் குறிப்பிடப்படாவிட்டால் மொழிபெயர்ப்பு இயந்திரத்தால் உருவாக்கப்படுகிறது.',

  /* welcome screen & version management */
  welcomeEyebrow: 'NASA விண்வெளி ஆய்வாளர்',
  welcomeTitle: 'உங்கள் விண்வெளி கண்காணிப்பு மையத்திற்கு வரவேற்கிறோம்',
  welcomeBody:
    'உண்மையான NASA படங்கள், பூமி காலநிலை பதிவுகள், பூமியை அணுகும் பொருள்கள் மற்றும் வரலாற்றுப் பயணங்களை ஆராயுங்கள் — ஒவ்வொரு எண்ணும் அதன் மூலத்துடன் இணைக்கப்பட்டுள்ளது, English, සිංහල மற்றும் தமிழ் மொழிகளில்.',
  welcomeBegin: 'ஆய்வைத் தொடங்குங்கள்',
  welcomeSkip: 'தவிர்க்க',
  welcomeShowOnStartup: 'தொடக்கத்தில் வரவேற்புத் திரையைக் காட்டு',
  welcomeReplay: 'வரவேற்புத் திரையை மீண்டும் காட்டு',
};
