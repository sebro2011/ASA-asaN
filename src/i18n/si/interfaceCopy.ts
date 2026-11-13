/**
 * Interface copy for the redesigned shell, home page and page framing.
 *
 * Kept in one typed module instead of inline conditionals so translators can
 * review a single file and no screen silently falls back to English. Merged into
 * the existing i18next resources in src/i18n.ts (same pattern as the Earth Lab).
 */

import type { Copy } from '../interfaceCopy';

export const interfaceCopySi: Copy = {

  navHome: 'මුල් පිටුව',
  wsNavWorkspace: 'මෙහෙයුම් පාලනය',
  navExplore: 'ගවේෂණය',
  navEarth: 'පෘථිවිය',
  navSystem: 'සෞරග්‍රහ මණ්ඩලය',
  navAssistant: 'සහායක',
  navAskNova: 'NOVA වෙතින් අසන්න',
  navMenu: 'මෙනුව',
  navAllDestinations: 'සියලු අංශ',
  navLanguage: 'භාෂාව',
  interfaceLanguage: 'අතුරුමුහුණත් භාෂාව',
  skipToContent: 'ප්‍රධාන අන්තර්ගතයට යන්න',
  siteTagline: 'පෘථිවිය · මෙහෙයුම් · ගැඹුරු අභ්‍යවකාශය',

  stateLive: 'සජීවී',
  stateCached: 'සුරකින ලද',
  stateDerived: 'ව්‍යුත්පන්න',
  stateStatic: 'යොමු',
  stateSimulated: 'අනුකරණය',
  stateUnavailable: 'නොමැත',
  stateLoading: 'ඉල්ලමින්',
  lastUpdated: 'අවසන් යාවත්කාලීනය',
  retrieved: 'ලබාගත් වේලාව',
  sourceLabel: 'මූලාශ්‍රය',
  unavailableShort: 'නොමැත',
  retry: 'නැවත උත්සාහ කරන්න',
  refresh: 'පුනර්ජීවනය',
  open: 'විවෘත කරන්න',
  close: 'වසන්න',
  viewAll: 'සියල්ල බලන්න',

  heroEyebrow: 'පෘථිවි නිරීක්ෂණය · ග්‍රහලෝක විද්‍යාව · ගැඹුරු අභ්‍යවකාශය',
  heroTitleA: 'ක්ෂිතිජයෙන්',
  heroTitleB: 'ඔබ්බට.',
  heroDescription:
    'වෙනස් වන අපගේ පෘථිවිය සොයා බලන්න, සෞරග්‍රහ මණ්ඩලය පුරා මෙහෙයුම් අනුගමනය කරන්න, සහ සැබෑ විද්‍යාත්මක දත්ත හරහා විශ්වය ගවේෂණය කරන්න.',
  heroCtaPrimary: 'පෘථිවි බුද්ධි ආයතනය විවෘත කරන්න',
  heroCtaSecondary: 'මෙහෙයුම් දළ විස්තරය',
  heroCtaTertiary: 'අද දින තාරකා ඡායාරූපය',
  heroScroll: 'ටෙලිමිතිය දක්වා අනුචලනය කරන්න',
  heroImageCredit: 'පෘථිවි රූප: NASA Blue Marble, NASA Visible Earth',
  heroFact1: 'නාසා විවෘත දත්ත',
  heroFact2: 'භාෂා තුනක්',
  heroFact3: 'ව්‍යාජ දත්ත නොමැත',

  signalsTitle: 'දත්ත සබැඳි',
  signalsSubtitle: 'මෙම පිටුව දැන් කියවන මූලාශ්‍රවල තත්ත්වය.',
  signalApod: 'APOD',
  signalIss: 'කක්ෂීය ගමන්',
  signalNeo: 'පෘථිවියට සමීප වස්තු',
  signalPower: 'NASA POWER',

  overviewEyebrow: 'මෙහෙයුම් දළ විස්තරය',
  overviewTitle: 'මෙවලම් දැන් වාර්තා කරන දේ',
  overviewDescription:
    'මෙම වේදිකාවට ළඟා විය හැකි සජීවී මූලාශ්‍රවල එකම මෙහෙයුම් දසුන. සෑම පැනලයක්ම එහි අගයන් සජීවී, සුරකින ලද, අනුකරණය හෝ නොමැති දැයි ප්‍රකාශ කරයි.',
  issTitle: 'ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය',
  issSubtitle: 'පොදු කක්ෂීය ගමන් දත්තවලින් ලබාගත් පිහිටීම',
  issLatitude: 'අක්ෂාංශය',
  issLongitude: 'දේශාංශය',
  issAltitude: 'උස',
  issVelocity: 'භූමි වේගය',
  issVisibility: 'දෘශ්‍යතාව',
  issOpenTracker: 'කක්ෂීය ගමන් විවෘත කරන්න',
  issSimulatedNote:
    'බාහිර ගමන් සේවාව ප්‍රතිචාර නොදැක්වීය. මෙම පිහිටීම අවසන් කක්ෂීය මූලද්‍රව්‍යවලින් ගණනය කරන ලද අතර සජීවී ටෙලිමිතිය නොවේ.',
  neoTitle: 'පෘථිවියට සමීප වස්තු',
  neoSubtitle: 'ඉදිරි දින හතේ සමීප ගමන් · NASA NeoWs',
  neoCount: 'නිරීක්ෂණය වන වස්තු',
  neoClosest: 'සමීපතම ගමන්',
  neoHazardous: 'අවදානම් ලෙස සලකුණු කර ඇත',
  neoDiameter: 'ඇස්තමේන්තුගත විෂ්කම්භය',
  neoDistance: 'මගහරින දුර',
  neoVelocity: 'සාපේක්ෂ වේගය',
  neoOpen: 'NEO ගවේෂකය විවෘත කරන්න',
  neoDisclaimer:
    '“අවදානම් විය හැකි” යනු ප්‍රමාණය සහ කක්ෂය මත පදනම් වූ වර්ගීකරණයක් මිස ගැටීමේ අනාවැකියක් නොවේ. සමීප ගමනක් යනු සාමාන්‍ය කක්ෂීය සිදුවීමකි.',
  neoStaticNote:
    'සජීවී NeoWs සේවාව නොමැති බැවින් ගමන් අගයන් ඉදිරිපත් නොකෙරේ. ඒ වෙනුවට නාසා ලේඛනයේ යොමු වස්තු පෙන්වයි.',
  apodTitle: 'දවසේ තාරකා ඡායාරූපය',
  apodOpen: 'සම්පූර්ණ ලේඛනාගාරය විවෘත කරන්න',
  apodCredit: 'රූප ණය',
  apodSampleNote: 'ලේඛනාගාර යොමු රූපයකි — සජීවී APOD සේවාව ප්‍රතිචාර නොදැක්වීය.',
  apodImageFailed: 'නාසා වෙතින් රූපය පූරණය කළ නොහැකි විය. මුල් රූපය තවමත් ලබාගත හැක.',
  apodMediaMissing: 'නාසා මෙම සටහන ස්ථිති රූපයක් නොමැතිව පළ කර ඇත.',
  apodOpenOriginal: 'මුල් මාධ්‍ය විවෘත කරන්න',
  apodVideoNote: 'මෙම සටහන වීඩියෝවක් මිස ස්ථිති රූපයක් නොවේ.',

  earthEyebrow: 'පෘථිවි බුද්ධිය',
  earthTitle: 'වසර පහළොවක මතුපිට උෂ්ණත්වය, එක් ජාල සෛලයක් තුළ',
  earthDescription:
    'පෘථිවි බුද්ධි ආයතනයේ සජීවී කොටසක්: කොළඹ සඳහා NASA POWER මාසික වායු උෂ්ණත්වය, වාර්ෂික සාමාන්‍ය ලෙසට ලඝු කර ඇත. ආයතනය වර්ෂාපතනය, ආර්ද්‍රතාව, සුළං, විකිරණ සහ චන්ද්‍රිකා රූප ද එක් කරයි.',
  earthMeanLabel: 'කාල පරාස සාමාන්‍යය',
  earthTrendLabel: 'න්‍යූනතම වර්ග ප්‍රවණතාව',
  earthPointsLabel: 'සම්පූර්ණ වර්ෂ',
  earthOpenLab: 'ආයතනය විවෘත කරන්න',
  earthGridNote:
    'POWER ඉල්ලා සිටින ස්ථානය අඩංගු ≈0.5° × 0.625° ජාල සෛලය වාර්තා කරයි. මේවා චන්ද්‍රිකා සහ ප්‍රත්‍යාලෝචන ඇස්තමේන්තු මිස කාලගුණ මධ්‍යස්ථාන මිනුම් නොවේ.',
  earthLabBriefTitle: 'වැඩබිම් හතරක්, එකම මූලාශ්‍ර ආකෘතියක්',

  discoveryEyebrow: 'දිගටම ගවේෂණය කරන්න',
  discoveryTitle: 'මෙවලම්, ලේඛනාගාර සහ අනුකරණ',
  discoveryDescription: 'අංශ දහතුනක්; එක් එක් අංශයට තමන්ගේම දත්ත ගිවිසුමක් සහ මූලාශ්‍ර උපහාරයක් ඇත.',

  pageApodEyebrow: 'ගවේෂණය · දවසේ තාරකා ඡායාරූපය',
  page3dEyebrow: 'ගවේෂණය · 3D දෘශ්‍යකරණය',
  pageMissionsEyebrow: 'ගවේෂණය · පියාසැරි ඉතිහාසය',
  pageNewsEyebrow: 'ගවේෂණය · නිවේදන',
  pageQuizEyebrow: 'ගවේෂණය · ඉගෙනීම',
  pageEarthEyebrow: 'පෘථිවිය · බුද්ධි ආයතනය',
  pageEpicEyebrow: 'පෘථිවිය · DSCOVR රූප',
  pageIssEyebrow: 'පෘථිවිය · කක්ෂීය ගමන්',
  pageNeoEyebrow: 'සෞරග්‍රහ මණ්ඩලය · පෘථිවියට සමීප වස්තු',
  pageExoEyebrow: 'සෞරග්‍රහ මණ්ඩලය · බාහිර ග්‍රහලෝක',
  pageLaunchEyebrow: 'සෞරග්‍රහ මණ්ඩලය · අනුකරණය',
  pageAssistantEyebrow: 'සහායක · පදනම්ගත AI',
  pageSavedEyebrow: 'සහායක · ඔබේ එකතුව',

  footerDisclaimer:
    'පොදුවේ ලබාගත හැකි නාසා විද්‍යා දත්ත සඳහා ස්වාධීන, ත්‍රිභාෂා අතුරුමුහුණතක්. නාසා සංවිධානය සමඟ සම්බන්ධ නොවේ.',
  footerSources: 'දත්ත මූලාශ්‍ර',
  footerExport: 'තනි HTML කොපමණක් ලෙස අපනයනය කරන්න',
  footerRights: 'විද්‍යාත්මක සාක්ෂරතාව සඳහා නිර්මිතයි',
  /* APOD */
  apodLoading: 'APOD වාර්තාව ඉල්ලමින්',
  apodErrorTitle: 'APOD සේවාව පිළිතුරු දුන්නේ නැත',
  apodErrorBody: 'මෙම දිනය සඳහා වෙනත් ඡායාරූපයක් නිර්මාණය කර නැත. නැවත උත්සාහ කරන්න, වෙනත් දිනයක් තෝරන්න, නැතහොත් apod.nasa.gov හි වාර්තාව විවෘත කරන්න.',
  apodRetry: 'නැවත ඉල්ලන්න',
  apodSampleBadge: 'ආදර්ශ සටහන',
  apodSampleBody: 'සජීවී APOD සේවාවට සම්බන්ධ විය නොහැකි විය. පහත ඡායාරූපය සහ පෙළ නොබැඳි භාවිතය සඳහා තබා ඇති ආදර්ශයකි — එය තෝරාගත් දිනයේ නිකුතුව නොවේ.',
  apodCachedBadge: 'සුරැකි පිටපත',
  apodCachedBody: 'උපාංගයේ සුරැකි පිටපතෙන් ලබා දී ඇත; නව ඉල්ලීමක් නොවේ.',
  apodCreditLabel: 'ණයගැතියන්',
  apodScienceSource: 'NASA Science APOD archive · විශේෂිත රූපය; මාධ්‍යය සහ හිමිකම් සඳහා NASA වාර්තාව බලන්න',
  apodScienceCredit: 'හිමිකම් සඳහා NASA වාර්තාව බලන්න',
  apodOpenSource: 'apod.nasa.gov හි වාර්තාව විවෘත කරන්න',
  apodPrevious: 'පෙර දිනය',
  apodNext: 'ඊළඟ දිනය',
  apodDateLabel: 'දිනය',
  apodResolution: 'විභේදනය',
  apodStandard: 'සම්මත',
  apodHigh: 'සම්පූර්ණ විභේදනය',
  apodArchiveJumps: 'ලේඛනාගාර පැනීම්',
  destinationErrorTitle: 'මෙම අංශය පූරණය වූයේ නැත',
  destinationErrorBody: 'මෙම දර්ශනයේ මොඩියුලයක් ආරම්භ කළ නොහැකි විය — බොහෝ විට මෙම උපාංගයේ WebGL, සිතියම් හෝ ජාල සීමාවක් විය හැක. අනෙකුත් අංශ සාමාන්‍ය ලෙස ක්‍රියා කරයි.',
  apodReadNasa: 'NASA දිනකට එක් ඡායාරූපයක් ප්‍රකාශයට පත් කරයි. වෙනත් ආකාරයක් සඳහන් නොවේ නම් පරිවර්තනය යන්ත්‍රගතය.',

  /* welcome screen & version management */
  welcomeEyebrow: 'NASA අභ්‍යවකාශ ගවේෂකය',
  welcomeTitle: 'ඔබේ අභ්‍යවකාශ නිරීක්ෂණ මධ්‍යස්ථානයට සාදරයෙන් පිළිගනිමු',
  welcomeBody:
    'සත්‍ය NASA ඡායාරූප, පෘථිවි දේශගුණ වාර්තා, පෘථිවියට ආසන්න වස්තු සහ ඓතිහාසික මෙහෙයුම් ගවේෂණය කරන්න — සෑම අගයකම මූලාශ්‍රය දක්වා ඇත, English, සිංහල සහ தமிழ் භාෂාවලින්.',
  welcomeBegin: 'ගවේෂණය අරඹන්න',
  welcomeSkip: 'මඟ හරින්න',
  welcomeShowOnStartup: 'ආරම්භයේදී පිළිගැනීමේ තිරය පෙන්වන්න',
  welcomeReplay: 'පිළිගැනීමේ තිරය නැවත බලන්න',
};
