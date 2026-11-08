/**
 * NOVA HYPOTHESIS FORGE — deterministic trilingual scientific copy.
 *
 * Every sentence the engine writes about a measurement is produced by a
 * template in this file, in the language of the investigation. No language model
 * is involved, so a translated sentence can never invent a number or a source.
 *
 * English scientific terms are kept in parentheses beside Sinhala/Tamil
 * terminology where the technical term is more precise in English. Dataset names
 * and units are never translated.
 */

import type { EvidenceClassification, EvidenceStrength, LanguageCode } from './types';

type Entry = Record<LanguageCode, string>;

export const FORGE_STRINGS: Record<string, Entry> = {
  /* ---------------------------------------------------------- interpreter */
  obj_spaceWeather: {
    en: 'Quantify the relationship between solar-wind drivers and geomagnetic response.',
    si: 'සූර්ය සුළං සාධක සහ භූ-චුම්බක ප්‍රතිචාරය අතර සම්බන්ධතාවය ප්‍රමාණනය කිරීම.',
    ta: 'சூரியக் காற்று காரணிகள் மற்றும் புவிக் காந்தத் துலங்கலுக்கு இடையிலான தொடர்பை அளவிடுதல்.',
  },
  obj_earthEnvironment: {
    en: 'Characterise an environmental time series and state what it cannot establish.',
    si: 'පාරිසරික කාල ශ්‍රේණියක් විස්තර කර එය තහවුරු කළ නොහැකි දේ ප්‍රකාශ කිරීම.',
    ta: 'சுற்றுச்சூழல் காலத் தொடரை விவரித்து, அது நிறுவ முடியாததைத் தெளிவுபடுத்துதல்.',
  },
  obj_nearEarthObjects: {
    en: 'Examine reported near-Earth object close approaches and their selection effects.',
    si: 'වාර්තා වූ පෘථිවියට සමීප වස්තු සමීපවීම් සහ ඒවායේ තේරීම් බලපෑම් විමර්ශනය කිරීම.',
    ta: 'பதிவான புவி-அருகு விண்பொருள் அணுகல்களையும் அவற்றின் தேர்வுச் சார்பையும் ஆராய்தல்.',
  },
  obj_orbital: {
    en: 'Describe the current orbital state and its limits.',
    si: 'වර්තමාන කක්ෂීය තත්ත්වය සහ එහි සීමා විස්තර කිරීම.',
    ta: 'தற்போதைய சுற்றுப்பாதை நிலையையும் அதன் வரம்புகளையும் விவரித்தல்.',
  },
  obj_planetaryImagery: {
    en: 'Retrieve planetary surface imagery and label it as qualitative context.',
    si: 'ග්‍රහලෝක මතුපිට රූප ලබාගෙන ඒවා ගුණාත්මක පසුබිමක් ලෙස ලේබල් කිරීම.',
    ta: 'கோள் மேற்பரப்பு படங்களைப் பெற்று அவற்றைத் தரமான பின்னணியாகக் குறித்தல்.',
  },
  obj_astronomyContext: {
    en: 'Provide astronomy context and label it as editorial material.',
    si: 'තාරකා විද්‍යා පසුබිම ලබා දී එය සංස්කාරක ද්‍රව්‍ය ලෙස ලේබල් කිරීම.',
    ta: 'வானியல் பின்னணியை வழங்கி அதைத் தொகுப்புப் பொருளாகக் குறித்தல்.',
  },
  obj_unsupported: {
    en: 'The question could not be mapped onto a connected NASA or NOAA dataset.',
    si: 'ප්‍රශ්නය සම්බන්ධිත NASA හෝ NOAA දත්ත කට්ටලයකට සිතියම් කළ නොහැකි විය.',
    ta: 'இந்தக் கேள்வியை இணைக்கப்பட்ட NASA அல்லது NOAA தரவுத்தொகுப்புடன் பொருத்த முடியவில்லை.',
  },

  /* --------------------------------------------------------------- range */
  rangeDefault: {
    en: 'No explicit period was stated, so the most recent 30 days were planned. This is an assumption, not a reading of the question.',
    si: 'පැහැදිලි කාල පරාසයක් සඳහන් නොවූ බැවින් අවසන් දින 30 සැලසුම් කරන ලදී. මෙය උපකල්පනයක් මිස ප්‍රශ්නයෙන් ලබාගත් අගයක් නොවේ.',
    ta: 'தெளிவான கால எல்லை தரப்படாததால் கடைசி 30 நாட்கள் திட்டமிடப்பட்டன. இது ஒரு அனுமானம், கேள்வியிலிருந்து பெறப்பட்டது அல்ல.',
  },
  rangeNamedEvent: {
    en: 'The period was taken from a named historical event ({event}).',
    si: 'කාල පරාසය නම් කරන ලද ඓතිහාසික සිදුවීමකින් ({event}) ලබා ගන්නා ලදී.',
    ta: 'கால எல்லை பெயரிடப்பட்ட வரலாற்று நிகழ்விலிருந்து ({event}) எடுக்கப்பட்டது.',
  },
  rangeExplicit: {
    en: 'The period was read directly from the question.',
    si: 'කාල පරාසය ප්‍රශ්නයෙන් සෘජුවම කියවන ලදී.',
    ta: 'கால எல்லை கேள்வியிலிருந்து நேரடியாகப் படிக்கப்பட்டது.',
  },
  regionGlobal: {
    en: 'No study area was named, so a global (planetary) frame is used. Kp and solar-wind measurements are global or single-point by nature.',
    si: 'අධ්‍යයන ප්‍රදේශයක් නම් නොකළ බැවින් ගෝලීය රාමුවක් භාවිතා වේ. Kp සහ සූර්ය සුළං මිනුම් ස්වභාවයෙන්ම ගෝලීය හෝ තනි ලක්ෂ්‍ය වේ.',
    ta: 'ஆய்வுப் பகுதி குறிப்பிடப்படாததால் உலகளாவிய கட்டமைப்பு பயன்படுத்தப்படுகிறது. Kp மற்றும் சூரியக் காற்று அளவீடுகள் இயற்கையாகவே உலகளாவியவை அல்லது ஒரு புள்ளி சார்ந்தவை.',
  },
  regionResolved: {
    en: 'Study area resolved to {region} using the built-in gazetteer ({lat}, {lon}).',
    si: 'අධ්‍යයන ප්‍රදේශය ගොඩනැගූ භූගෝලීය නාමාවලිය මගින් {region} ලෙස විසඳන ලදී ({lat}, {lon}).',
    ta: 'ஆய்வுப் பகுதி உள்ளமைந்த இடப்பெயர் அகராதியால் {region} எனத் தீர்மானிக்கப்பட்டது ({lat}, {lon}).',
  },
  followUpMerged: {
    en: 'This is a follow-up: the previous investigation context was carried forward.',
    si: 'මෙය අනුගාමී ප්‍රශ්නයකි: පෙර විමර්ශනයේ සන්දර්භය ඉදිරියට ගෙන යන ලදී.',
    ta: 'இது தொடர்வினா: முந்தைய ஆய்வுச் சூழல் தொடர்ந்து எடுத்துச் செல்லப்பட்டது.',
  },
  noCompatibleDataset: {
    en: 'No connected dataset can address this question, so no investigation can be executed.',
    si: 'මෙම ප්‍රශ්නයට අදාළ විය හැකි සම්බන්ධිත දත්ත කට්ටලයක් නොමැති බැවින් විමර්ශනයක් ක්‍රියාත්මක කළ නොහැක.',
    ta: 'இந்தக் கேள்விக்குப் பொருந்தும் இணைக்கப்பட்ட தரவுத்தொகுப்பு இல்லாததால் ஆய்வை இயக்க முடியாது.',
  },

  /* ----------------------------------------------------------- variables */
  var_kp: { en: 'Planetary K index (Kp)', si: 'ග්‍රහලෝක Kp දර්ශකය (Kp)', ta: 'கோள் Kp குறியீடு (Kp)' },
  var_solar_wind_speed: {
    en: 'Solar wind speed',
    si: 'සූර්ය සුළං වේගය (solar wind speed)',
    ta: 'சூரியக் காற்றின் வேகம் (solar wind speed)',
  },
  var_bz_gsm: {
    en: 'IMF Bz (GSM)',
    si: 'අන්තර්ග්‍රහලෝක චුම්බක ක්ෂේත්‍ර Bz (IMF Bz, GSM)',
    ta: 'காந்தப்புல Bz (IMF Bz, GSM)',
  },
  var_bt: {
    en: 'IMF magnitude (Bt)',
    si: 'චුම්බක ක්ෂේත්‍ර විශාලත්වය (Bt)',
    ta: 'காந்தப்புல அளவு (Bt)',
  },
  var_proton_density: {
    en: 'Solar wind proton density',
    si: 'සූර්ය සුළං ප්‍රෝටෝන ඝනත්වය (proton density)',
    ta: 'சூரியக் காற்று புரோட்டான் அடர்த்தி',
  },
  var_cme_speed: {
    en: 'CME linear speed (model fit)',
    si: 'CME රේඛීය වේගය (ආකෘති ඇස්තමේන්තුව)',
    ta: 'CME நேர்கோட்டு வேகம் (மாதிரி மதிப்பீடு)',
  },
  var_temperature: {
    en: 'Air temperature at 2 m',
    si: 'මීටර් 2 හි වායු උෂ්ණත්වය',
    ta: '2 m காற்று வெப்பநிலை',
  },
  var_precipitation: {
    en: 'Precipitation rate',
    si: 'වර්ෂාපතන අනුපාතය',
    ta: 'மழை வீதம்',
  },
  var_asteroid_miss_distance: {
    en: 'Close-approach miss distance',
    si: 'සමීපවීමේ දුර (miss distance)',
    ta: 'அணுகல் தூரம் (miss distance)',
  },
  var_asteroid_diameter: {
    en: 'Estimated asteroid diameter',
    si: 'ඇස්තමේන්තුගත ග්‍රහක විෂ්කම්භය',
    ta: 'மதிப்பிடப்பட்ட சிறுகோள் விட்டம்',
  },
  var_orbital_altitude: {
    en: 'Orbital altitude',
    si: 'කක්ෂීය උස',
    ta: 'சுற்றுப்பாதை உயரம்',
  },

  /* ---------------------------------------------------------- hypotheses */
  hyp_lead_lag_statement: {
    en: 'During {period}, changes in {driver} lead changes in {response} by up to {lag} hours, with a {direction} association.',
    si: '{period} කාලය තුළ, {driver} හි වෙනස්කම් {response} හි වෙනස්කම්වලට පැය {lag} ක් දක්වා පෙරදැරි වන අතර, {direction} සම්බන්ධතාවයක් පවතී.',
    ta: '{period} காலத்தில், {driver} மாற்றங்கள் {response} மாற்றங்களுக்கு {lag} மணி நேரம் வரை முன்னோடியாக இருக்கும்; {direction} தொடர்பு இருக்கும்.',
  },
  hyp_lead_lag_explanation: {
    en: 'If the driver genuinely couples energy into the system, it should change before the response, not after it. The claim is testable with a lagged cross-correlation and is falsified by a peak at a negative lag.',
    si: 'සාධකය සැබවින්ම පද්ධතියට ශක්තිය සම්ප්‍රේෂණය කරන්නේ නම්, එය ප්‍රතිචාරයට පෙර වෙනස් විය යුතුය. ප්‍රමාදිත හරස්-සහසම්බන්ධයකින් මෙය පරීක්ෂා කළ හැකි අතර සෘණ ප්‍රමාදයක උපරිමයක් මගින් එය බොරු බව පෙන්වයි.',
    ta: 'காரணி உண்மையில் ஆற்றலை இணைக்குமானால், அது துலங்கலுக்கு முன் மாற வேண்டும். தாமதக் குறுக்குத் தொடர்பால் இதைச் சோதிக்கலாம்; எதிர்மறை தாமதத்தில் உச்சம் இருந்தால் இது பொய்யாகும்.',
  },
  hyp_threshold_statement: {
    en: 'During {period}, {response} exceeds {threshold} only in intervals where {driver} crosses its storm threshold, at a higher rate than the baseline.',
    si: '{period} කාලය තුළ, {driver} එහි කුණාටු සීමාව ඉක්මවන කාල පරතරයන්හිදී පමණක් {response} {threshold} ඉක්මවයි; එය පාදක අගයට වඩා ඉහළ අනුපාතයකි.',
    ta: '{period} காலத்தில், {driver} அதன் புயல் வரம்பைக் கடக்கும் இடைவெளிகளில் மட்டுமே {response} {threshold} ஐ மீறும்; இது அடிப்படை விகிதத்தை விட அதிகம்.',
  },
  hyp_threshold_explanation: {
    en: 'A threshold response is a stronger, more specific claim than a correlation: it predicts that exceedances cluster where the driver is extreme. It can fail either because exceedances are independent of the driver, or because the threshold is wrong.',
    si: 'සීමා ප්‍රතිචාරයක් සහසම්බන්ධයකට වඩා ශක්තිමත් හා විශේෂිත ප්‍රකාශයකි: සාධකය අන්ත වන තැන අගය ඉක්මවීම් එකතු වේ යැයි එය අනාවැකි පළ කරයි. අගය ඉක්මවීම් සාධකයට ස්වාධීන නම් හෝ සීමාව වැරදි නම් එය අසාර්ථක වේ.',
    ta: 'வரம்புத் துலங்கல் தொடர்பை விட வலுவான, குறிப்பான கூற்று: காரணி தீவிரமாக இருக்கும் இடங்களில் மீறல்கள் குவியும் எனக் கணிக்கிறது. மீறல்கள் காரணியிலிருந்து சுயாதீனமாக இருந்தாலோ வரம்பு தவறாக இருந்தாலோ இது தோல்வியடையும்.',
  },
  hyp_null_statement: {
    en: 'There is no detectable association between {driver} and {response} over {period}; any apparent relationship is consistent with chance.',
    si: '{period} කාලය තුළ {driver} සහ {response} අතර හඳුනාගත හැකි සම්බන්ධතාවයක් නොමැත; පෙනෙන සම්බන්ධතාවය අහම්බයකට අනුකූලය.',
    ta: '{period} காலத்தில் {driver} மற்றும் {response} இடையே கண்டறியக்கூடிய தொடர்பு இல்லை; தெரியும் தொடர்பு தற்செயலானது.',
  },
  hyp_null_explanation: {
    en: 'The null hypothesis is stated explicitly so the investigation can fail to reject it. Reporting only confirmations would be a serious methodological error.',
    si: 'ශුන්‍ය උපකල්පනය පැහැදිලිව ප්‍රකාශ කරන්නේ විමර්ශනයට එය ප්‍රතික්ෂේප නොකිරීමට හැකි වන පරිදිය. තහවුරු කිරීම් පමණක් වාර්තා කිරීම බරපතල ක්‍රමවේද දෝෂයකි.',
    ta: 'பூஜ்ய கருதுகோள் வெளிப்படையாகக் கூறப்படுவதால் ஆய்வு அதை நிராகரிக்கத் தவறலாம். உறுதிப்படுத்தல்களை மட்டும் அறிவிப்பது கடும் முறையியல் தவறு.',
  },
  hyp_trend_statement: {
    en: 'Between {start} and {end}, {response} in {region} shows a {direction} linear trend that is distinguishable from zero.',
    si: '{start} සහ {end} අතර, {region} හි {response} ශුන්‍යයෙන් වෙන්කළ හැකි {direction} රේඛීය ප්‍රවණතාවයක් පෙන්වයි.',
    ta: '{start} முதல் {end} வரை, {region} பகுதியில் {response} பூஜ்ஜியத்திலிருந்து வேறுபடுத்தக்கூடிய {direction} நேர்கோட்டுப் போக்கைக் காட்டுகிறது.',
  },
  hyp_trend_explanation: {
    en: 'A trend claim is only meaningful with its uncertainty: slope, confidence interval, sample size and autocorrelation all matter. A monthly series has far fewer independent samples than rows.',
    si: 'ප්‍රවණතා ප්‍රකාශයක් අර්ථවත් වන්නේ එහි අනිශ්චිතතාවය සමඟය: බෑවුම, විශ්වාස පරාසය, නියැදි ප්‍රමාණය සහ ස්වයං-සහසම්බන්ධතාවය වැදගත් වේ. මාසික ශ්‍රේණියක ස්වාධීන නියැදි පේළි ගණනට වඩා බෙහෙවින් අඩුය.',
    ta: 'போக்குக் கூற்று அதன் நிச்சயமற்ற தன்மையுடன் மட்டுமே பொருள்படும்: சாய்வு, நம்பக இடைவெளி, மாதிரி அளவு, தன்-தொடர்பு ஆகியவை முக்கியம். மாதாந்திர தொடரில் சுயாதீன மாதிரிகள் வரிகளை விட மிகக் குறைவு.',
  },
  hyp_before_after_statement: {
    en: 'During {period}, {response} is higher inside the event window than in the surrounding baseline windows.',
    si: '{period} කාලය තුළ, සිදුවීම් කවුළුව තුළ {response} අවට පාදක කවුළුවලට වඩා ඉහළ ය.',
    ta: '{period} காலத்தில், நிகழ்வு சாளரத்திற்குள் {response} சுற்றியுள்ள அடிப்படை சாளரங்களை விட அதிகமாக உள்ளது.',
  },
  hyp_before_after_explanation: {
    en: 'A before/after comparison tests whether an event window differs from its surroundings. It is weak evidence on its own because the baseline may itself be unusual.',
    si: 'පෙර/පසු සංසන්දනය මගින් සිදුවීම් කවුළුවක් එහි පරිසරයට වඩා වෙනස්ද යන්න පරීක්ෂා කරයි. පාදකයද අසාමාන්‍ය විය හැකි බැවින් එය තනිව දුර්වල සාක්ෂියකි.',
    ta: 'முன்/பின் ஒப்பீடு நிகழ்வுச் சாளரம் அதன் சுற்றுப்புறத்திலிருந்து வேறுபடுகிறதா எனச் சோதிக்கிறது. அடிப்படையும் அசாதாரணமாக இருக்கலாம் என்பதால் இது தனியாக பலவீனமான சான்று.',
  },

  hyp_context_statement: {
    en: 'The requested date has retrievable {sourceType} available for {period}; the claim under test is data availability, not a physical relationship.',
    si: 'ඉල්ලා සිටි දිනය සඳහා {period} තුළ {sourceType} ලබාගත හැකිය; පරීක්ෂා කරන ප්‍රකාශය දත්ත ලබාගැනීමේ හැකියාව මිස භෞතික සම්බන්ධතාවයක් නොවේ.',
    ta: 'கோரப்பட்ட தேதிக்கு {period} காலத்தில் {sourceType} பெறக்கூடியதாக உள்ளது; சோதிக்கப்படும் கூற்று தரவு கிடைக்கும் தன்மை, இயற்பியல் தொடர்பு அல்ல.',
  },
  hyp_context_explanation: {
    en: 'Imagery and editorial datasets are qualitative. NOVA will not derive a measurement or a trend from them. The only testable statement they support is whether the record exists for the date requested.',
    si: 'රූප සහ සංස්කාරක දත්ත කට්ටල ගුණාත්මක ය. NOVA ඒවායින් මිනුමක් හෝ ප්‍රවණතාවයක් ලබා නොගනී. ඒවා සහාය දක්වන එකම පරීක්ෂණීය ප්‍රකාශය වන්නේ ඉල්ලා සිටි දිනය සඳහා වාර්තාව පවතීද යන්නයි.',
    ta: 'படங்கள் மற்றும் தொகுப்புத் தரவுத்தொகுப்புகள் தரமானவை. NOVA அவற்றிலிருந்து அளவீடு அல்லது போக்கைப் பெறாது. அவை ஆதரிக்கும் ஒரே சோதனைக் கூற்று, கோரப்பட்ட தேதிக்கான பதிவு உள்ளதா என்பதே.',
  },
  sourceType_imagery: { en: 'surface imagery', si: 'මතුපිට රූප', ta: 'மேற்பரப்புப் படங்கள்' },
  sourceType_context: { en: 'astronomy context', si: 'තාරකා විද්‍යා පසුබිම', ta: 'வானியல் பின்னணி' },

  direction_positive: { en: 'positive', si: 'ධනාත්මක', ta: 'நேர்மறை' },
  direction_negative: { en: 'negative', si: 'සෘණාත්මක', ta: 'எதிர்மறை' },

  alt_autocorrelation: {
    en: 'Serial autocorrelation in finely sampled series inflates apparent significance; the effective sample size is smaller than the row count.',
    si: 'සියුම්ව නියැදි කරන ලද ශ්‍රේණිවල අනුක්‍රමික ස්වයං-සහසම්බන්ධතාවය පෙනෙන වැදගත්කම ඉහළ නංවයි; ඵලදායී නියැදි ප්‍රමාණය පේළි ගණනට වඩා අඩුය.',
    ta: 'நுட்பமாக மாதிரியெடுக்கப்பட்ட தொடர்களில் தொடர் தன்-தொடர்பு தோற்ற அர்த்தத்தை ஊதிப் பெருக்கும்; பயனுள்ள மாதிரி அளவு வரிகளின் எண்ணிக்கையை விடக் குறைவு.',
  },
  alt_chance: {
    en: 'Repeated or multiple testing can produce an apparent correlation by chance alone.',
    si: 'පුනරාවර්ත හෝ බහු පරීක්ෂණ නිසා අහම්බයෙන් පමණක් පෙනෙන සහසම්බන්ධයක් ඇති විය හැක.',
    ta: 'மீண்டும் மீண்டும் அல்லது பல சோதனைகள் தற்செயலாக ஒரு தொடர்பை உருவாக்கலாம்.',
  },
  alt_selection: {
    en: 'The records are a selected sample (detected objects, reported events), so absence from the record is not evidence of absence in nature.',
    si: 'වාර්තා තෝරාගත් නියැදියකි (හඳුනාගත් වස්තු, වාර්තා වූ සිදුවීම්); එබැවින් වාර්තාවේ නොමැති වීම ස්වභාවයේ නොමැති වීමට සාක්ෂියක් නොවේ.',
    ta: 'பதிவுகள் தேர்ந்தெடுக்கப்பட்ட மாதிரி (கண்டறியப்பட்ட பொருட்கள், அறிவிக்கப்பட்ட நிகழ்வுகள்); பதிவில் இல்லாதது இயற்கையில் இல்லாததற்குச் சான்று அல்ல.',
  },
  alt_seasonal: {
    en: 'Seasonal, diurnal or solar-cycle phase effects can create an association unrelated to the hypothesised driver.',
    si: 'ඍතුමය, දෛනික හෝ සූර්ය චක්‍ර අවස්ථා බලපෑම් උපකල්පිත සාධකයට සම්බන්ධ නොවන සම්බන්ධතාවයක් ඇති කළ හැක.',
    ta: 'பருவகால, தினசரி அல்லது சூரியச் சுழற்சி கட்டப் பாதிப்புகள் கருதுகோள் காரணிக்குத் தொடர்பில்லாத தொடர்பை உருவாக்கலாம்.',
  },
  alt_instrument: {
    en: 'Instrument calibration, fill values or a change of source can produce an apparent step or trend.',
    si: 'උපකරණ ක්‍රමාංකනය, පිරවුම් අගයන් හෝ මූලාශ්‍ර වෙනසක් පෙනෙන පියවරක් හෝ ප්‍රවණතාවයක් ඇති කළ හැක.',
    ta: 'கருவி அளவுத்திருத்தம், நிரப்பு மதிப்புகள் அல்லது மூல மாற்றம் தோற்றப் படிநிலை அல்லது போக்கை உருவாக்கலாம்.',
  },
  alt_saturation: {
    en: 'A bounded index such as Kp saturates, so the strongest responses are compressed and linear statistics understate them.',
    si: 'Kp වැනි සීමා සහිත දර්ශකයක් සංතෘප්ත වේ; එබැවින් ශක්තිමත්ම ප්‍රතිචාර සංකෝචනය වන අතර රේඛීය සංඛ්‍යාලේඛන ඒවා අවතක්සේරු කරයි.',
    ta: 'Kp போன்ற வரம்புள்ள குறியீடு நிரம்பிவிடும்; எனவே வலுவான துலங்கல்கள் சுருக்கப்படும், நேர்கோட்டுப் புள்ளியியல் அவற்றைக் குறைத்து மதிப்பிடும்.',
  },
  alt_other_driver: {
    en: 'An unmeasured variable (solar-cycle phase, prior substorm history, local time of the observing site) may influence both series.',
    si: 'මනින නොලද විචල්‍යයක් (සූර්ය චක්‍ර අවස්ථාව, පෙර උප-කුණාටු ඉතිහාසය, නිරීක්ෂණ ස්ථානයේ දේශීය වේලාව) ශ්‍රේණි දෙකටම බලපෑ හැක.',
    ta: 'அளவிடப்படாத மாறி (சூரியச் சுழற்சிக் கட்டம், முந்தைய துணைப் புயல் வரலாறு, கண்காணிப்பு தளத்தின் உள்ளூர் நேரம்) இரு தொடர்களையும் பாதிக்கலாம்.',
  },
  alt_no_mechanism: {
    en: 'No physical mechanism is demonstrated here; observational co-variation alone cannot distinguish a driver from a coincidence.',
    si: 'මෙහි භෞතික යාන්ත්‍රණයක් ප්‍රදර්ශනය නොවේ; නිරීක්ෂණ සහ-විචලනය පමණක් සාධකයක් සහ අහම්බයක් වෙන්කර හඳුනාගත නොහැක.',
    ta: 'இங்கு இயற்பியல் இயங்குமுறை நிரூபிக்கப்படவில்லை; கண்காணிப்பு இணை-மாற்றம் மட்டும் காரணியையும் தற்செயலையும் வேறுபடுத்த முடியாது.',
  },

  falsify_lead_lag: {
    en: 'Reject if the peak cross-correlation is not at a positive lead of the driver, or if the association disappears after detrending.',
    si: 'උපරිම හරස්-සහසම්බන්ධය සාධකයේ ධන පෙරමුණක නොමැති නම්, හෝ ප්‍රවණතා ඉවත් කිරීමෙන් පසු සම්බන්ධය අතුරුදහන් වුවහොත් ප්‍රතික්ෂේප කරන්න.',
    ta: 'உச்சக் குறுக்குத் தொடர்பு காரணியின் நேர்மறை முன்னிலையில் இல்லாவிட்டால், அல்லது போக்கு நீக்கிய பின் தொடர்பு மறைந்தால் நிராகரிக்கவும்.',
  },
  falsify_threshold: {
    en: 'Reject if the exceedance rate inside the event window is indistinguishable from the baseline, or if exceedances occur without the driver crossing its threshold.',
    si: 'සිදුවීම් කවුළුව තුළ ඉක්මවීම් අනුපාතය පාදකයට වෙනස් කළ නොහැකි නම්, හෝ සාධකය සීමාව ඉක්මවා නොයන විට ඉක්මවීම් සිදුවුවහොත් ප්‍රතික්ෂේප කරන්න.',
    ta: 'நிகழ்வுச் சாளரத்தில் மீறல் விகிதம் அடிப்படையிலிருந்து வேறுபடுத்த முடியாவிட்டால், அல்லது காரணி வரம்பைக் கடக்காமல் மீறல்கள் நிகழ்ந்தால் நிராகரிக்கவும்.',
  },
  falsify_null: {
    en: 'Reject the null only if a robust association survives the autocorrelation and multiple-comparison checks. That is evidence against the null, never proof of the alternative.',
    si: 'ස්වයං-සහසම්බන්ධතා සහ බහු-සංසන්දන පරීක්ෂණවලින් පසුවත් ශක්තිමත් සම්බන්ධතාවයක් ඉතිරි වුවහොත් පමණක් ශුන්‍ය උපකල්පනය ප්‍රතික්ෂේප කරන්න. එය ශුන්‍යයට එරෙහි සාක්ෂියකි, විකල්පයේ සාධනයක් නොවේ.',
    ta: 'தன்-தொடர்பு மற்றும் பல்-ஒப்பீட்டுச் சோதனைகளுக்குப் பிறகும் வலுவான தொடர்பு நிலைத்தால் மட்டுமே பூஜ்ய கருதுகோளை நிராகரிக்கவும். அது பூஜ்யத்திற்கு எதிரான சான்று, மாற்றின் நிரூபணம் அல்ல.',
  },
  falsify_trend: {
    en: 'Reject if the slope’s 95% interval includes zero or if the trend does not survive splitting the record in half.',
    si: 'බෑවුමේ 95% පරාසය බිඳුනු අගය (ශුන්‍යය) ඇතුළත් නම්, හෝ වාර්තාව දෙකඩ කිරීමෙන් පසු ප්‍රවණතාවය නොපවතිනම් ප්‍රතික්ෂේප කරන්න.',
    ta: 'சாய்வின் 95% இடைவெளி பூஜ்ஜியத்தை உள்ளடக்கினால், அல்லது பதிவை இரண்டாகப் பிரித்த பின் போக்கு நிலைத்திருக்காவிட்டால் நிராகரிக்கவும்.',
  },
  falsify_before_after: {
    en: 'Reject if the event-window mean lies inside the spread of the baseline windows.',
    si: 'සිදුවීම් කවුළුවේ සාමාන්‍යය පාදක කවුළුවල විසිරීම තුළ පිහිටයි නම් ප්‍රතික්ෂේප කරන්න.',
    ta: 'நிகழ்வுச் சாளர சராசரி அடிப்படை சாளரங்களின் பரவலுக்குள் இருந்தால் நிராகரிக்கவும்.',
  },

  lim_global_index: {
    en: 'Kp is a planetary index and cannot be attributed to a country or a city.',
    si: 'Kp යනු ග්‍රහලෝක මට්ටමේ දර්ශකයක් වන අතර රටකට හෝ නගරයකට ආරෝපණය කළ නොහැක.',
    ta: 'Kp ஒரு கோள் அளவிலான குறியீடு; ஒரு நாடு அல்லது நகரத்திற்குக் காரணமாகக் கூற முடியாது.',
  },
  lim_rolling: {
    en: 'The connected product is a rolling window, so the requested historical period may not be available.',
    si: 'සම්බන්ධිත නිෂ්පාදනය චලනය වන කාල කවුළුවකි; එබැවින් ඉල්ලා සිටි ඓතිහාසික කාලය ලබා නොගත හැකි විය හැක.',
    ta: 'இணைக்கப்பட்ட தயாரிப்பு ஒரு நகரும் சாளரம்; கோரப்பட்ட வரலாற்றுக் காலம் கிடைக்காமல் இருக்கலாம்.',
  },
  lim_monthly: {
    en: 'Monthly resolution cannot resolve storm-time or daily behaviour.',
    si: 'මාසික විභේදනයට කුණාටු කාලයේ හෝ දෛනික හැසිරීම් විසඳිය නොහැක.',
    ta: 'மாதாந்திர தீர்மானம் புயல் கால அல்லது தினசரி நடத்தையைப் பிரிக்க முடியாது.',
  },
  lim_estimate: {
    en: 'Retrieved speeds and diameters are estimates, not direct measurements.',
    si: 'ලබාගත් වේග සහ විෂ්කම්භ ඇස්තමේන්තු මිස සෘජු මිනුම් නොවේ.',
    ta: 'பெறப்பட்ட வேகங்களும் விட்டங்களும் மதிப்பீடுகள், நேரடி அளவீடுகள் அல்ல.',
  },
  lim_single_point: {
    en: 'L1 measurements describe one point upstream of Earth, not the whole system.',
    si: 'L1 මිනුම් පෘථිවියට ඉහළින් ඇති එක් ලක්ෂ්‍යයක් විස්තර කරයි, සම්පූර්ණ පද්ධතිය නොවේ.',
    ta: 'L1 அளவீடுகள் பூமிக்கு மேல்நோக்கிய ஒரு புள்ளியை மட்டுமே விவரிக்கின்றன, முழு அமைப்பையும் அல்ல.',
  },
  lim_correlation: {
    en: 'A statistical association is not a causal mechanism.',
    si: 'සංඛ්‍යානමය සම්බන්ධතාවයක් හේතුකාරක යාන්ත්‍රණයක් නොවේ.',
    ta: 'புள்ளியியல் தொடர்பு ஒரு காரண இயங்குமுறை அல்ல.',
  },
  lim_no_numeric_domain: {
    en: 'This domain has no quantitative measurement in the connected datasets; only qualitative context can be retrieved.',
    si: 'මෙම ක්ෂේත්‍රයට සම්බන්ධිත දත්ත කට්ටලවල ප්‍රමාණාත්මක මිනුමක් නොමැත; ලබාගත හැක්කේ ගුණාත්මක පසුබිමක් පමණි.',
    ta: 'இந்தத் துறைக்கு இணைக்கப்பட்ட தரவுத்தொகுப்புகளில் அளவீட்டு மதிப்பு இல்லை; தரமான பின்னணி மட்டுமே பெற முடியும்.',
  },

  /* ------------------------------------------------------------- planner */
  planWindow: {
    en: 'Retrieval window: {start} → {end} (UTC), {resolution} resolution.',
    si: 'ලබාගැනීමේ කවුළුව: {start} → {end} (UTC), {resolution} විභේදනය.',
    ta: 'பெறுதல் சாளரம்: {start} → {end} (UTC), {resolution} தீர்மானம்.',
  },
  planVerifyProvenance: {
    en: 'Every retrieved record keeps its dataset id, source URL, retrieval timestamp and payload hash.',
    si: 'ලබාගත් සෑම වාර්තාවක්ම එහි දත්ත කට්ටල හැඳුනුම, මූලාශ්‍ර URL, ලබාගැනීමේ වේලාව සහ ධාවක හෑෂ් රඳවා ගනී.',
    ta: 'பெறப்பட்ட ஒவ்வொரு பதிவும் அதன் தரவுத்தொகுப்பு ஐடி, மூல URL, பெறுதல் நேரம் மற்றும் தரவு ஹாஷை வைத்திருக்கும்.',
  },
  planVerifyMissing: {
    en: 'Source fill values are preserved as missing; no interpolation is performed.',
    si: 'මූලාශ්‍ර පිරවුම් අගයන් අතුරුදන් ලෙස රඳවා ගනී; අන්තර්-අගය ගණනය නොකෙරේ.',
    ta: 'மூல நிரப்பு மதிப்புகள் விடுபட்டதாகவே வைக்கப்படும்; இடைச்செருகல் செய்யப்படுவதில்லை.',
  },
  planVerifyUnits: {
    en: 'Units are preserved exactly as published; incompatible units are never combined.',
    si: 'ඒකක ප්‍රකාශිත පරිදිම රඳවා ගනී; නොගැලපෙන ඒකක කිසිවිටෙකත් එකට එକකර නොකෙරේ.',
    ta: 'அலகுகள் வெளியிடப்பட்டபடியே பாதுகாக்கப்படும்; பொருந்தாத அலகுகள் ஒருபோதும் இணைக்கப்படுவதில்லை.',
  },
  coverageInRange: {
    en: 'The requested period falls inside this dataset’s published coverage.',
    si: 'ඉල්ලා සිටි කාලය මෙම දත්ත කට්ටලයේ ප්‍රකාශිත ආවරණය තුළ පිහිටයි.',
    ta: 'கோரப்பட்ட காலம் இந்தத் தரவுத்தொகுப்பின் வெளியிடப்பட்ட பரப்புக்குள் அமைகிறது.',
  },
  coveragePartial: {
    en: 'Only part of the requested period is inside this dataset’s published coverage.',
    si: 'ඉල්ලා සිටි කාලයෙන් කොටසක් පමණක් මෙම දත්ත කට්ටලයේ ප්‍රකාශිත ආවරණය තුළ ඇත.',
    ta: 'கோரப்பட்ட காலத்தின் ஒரு பகுதி மட்டுமே இந்தத் தரவுத்தொகுப்பின் பரப்புக்குள் உள்ளது.',
  },
  coverageOut: {
    en: 'The requested period is outside this dataset’s published coverage ({coverage}). It will not be padded with another period.',
    si: 'ඉල්ලා සිටි කාලය මෙම දත්ත කට්ටලයේ ප්‍රකාශිත ආවරණයෙන් ({coverage}) පිටතය. වෙනත් කාලයකින් එය පිරවීම සිදු නොවේ.',
    ta: 'கோரப்பட்ட காலம் இந்தத் தரவுத்தொகுப்பின் வெளியிடப்பட்ட பரப்புக்கு ({coverage}) வெளியே உள்ளது. வேறு காலத்தால் நிரப்பப்படாது.',
  },
  coverageUnknown: {
    en: 'Coverage for this dataset could not be determined before retrieval.',
    si: 'ලබාගැනීමට පෙර මෙම දත්ත කට්ටලයේ ආවරණය තීරණය කළ නොහැක.',
    ta: 'பெறுவதற்கு முன் இந்தத் தரவுத்தொகுப்பின் பரப்பு தீர்மானிக்க முடியவில்லை.',
  },
  compatDomain: {
    en: 'Compatible with the detected scientific domain.',
    si: 'හඳුනාගත් විද්‍යාත්මක ක්ෂේත්‍රයට ගැලපේ.',
    ta: 'கண்டறியப்பட்ட அறிவியல் துறையுடன் பொருந்துகிறது.',
  },
  compatContext: {
    en: 'Relevant context for this domain: it does not publish the named measured variable, so it is used for context only.',
    si: 'මෙම ක්ෂේත්‍රයට අදාළ පසුබිමකි: එය නම් කළ මිනුම් විචල්‍යය ප්‍රකාශ නොකරයි, එබැවින් භාවිතා වන්නේ පසුබිම සඳහා පමණි.',
    ta: 'இந்தத் துறைக்குப் பொருத்தமான பின்னணி: இது குறிப்பிட்ட அளவீட்டு மாறியை வெளியிடவில்லை, எனவே பின்னணிக்கு மட்டுமே பயன்படுத்தப்படுகிறது.',
  },
  compatDomainMismatch: {
    en: 'Not compatible: this dataset does not address the detected domain.',
    si: 'නොගැලපේ: මෙම දත්ත කට්ටලය හඳුනාගත් ක්ෂේත්‍රයට අදාළ නොවේ.',
    ta: 'பொருந்தாது: இந்தத் தரவுத்தொகுப்பு கண்டறியப்பட்ட துறைக்குப் பொருந்தாது.',
  },
  compatVariableMismatch: {
    en: 'Not compatible: the dataset does not publish the requested variables.',
    si: 'නොගැලපේ: දත්ත කට්ටලය ඉල්ලා සිටි විචල්‍ය ප්‍රකාශ නොකරයි.',
    ta: 'பொருந்தாது: தரவுத்தொகுப்பு கோரப்பட்ட மாறிகளை வெளியிடவில்லை.',
  },
  planMissingTime: {
    en: 'The question did not specify a period explicitly; the planned window is an assumption.',
    si: 'ප්‍රශ්නය කාල පරාසයක් පැහැදිලිව සඳහන් නොකළේය; සැලසුම් කළ කවුළුව උපකල්පනයකි.',
    ta: 'கேள்வி கால எல்லையை வெளிப்படையாகக் குறிப்பிடவில்லை; திட்டமிடப்பட்ட சாளரம் ஒரு அனுமானம்.',
  },
  planMissingResolution: {
    en: 'A monthly dataset cannot answer an hourly question; the resolution mismatch is recorded as a limitation.',
    si: 'මාසික දත්ත කට්ටලයකට පැයක ප්‍රශ්නයකට පිළිතුරු දිය නොහැක; විභේදන නොගැලපීම සීමාවක් ලෙස සටහන් වේ.',
    ta: 'மாதாந்திர தரவுத்தொகுப்பு மணிநேரக் கேள்விக்குப் பதிலளிக்க முடியாது; தீர்மானப் பொருந்தாமை வரம்பாகப் பதிவாகும்.',
  },
  planDemoKey: {
    en: 'The server has no NASA API key configured, so the shared DEMO_KEY will be used. It is heavily rate-limited and may return 429; that will be reported, not hidden.',
    si: 'සේවාදායකයට NASA API යතුරක් වින්‍යාස කර නැති බැවින් හවුල් DEMO_KEY භාවිතා වේ. එය දැඩි ලෙස අනුපාත-සීමිත වන අතර 429 ලබා දිය හැක; එය සඟවා නොගෙන වාර්තා කෙරේ.',
    ta: 'சேவையகத்தில் NASA API விசை அமைக்கப்படாததால் பகிரப்பட்ட DEMO_KEY பயன்படுத்தப்படும். அது கடுமையாக விகித-வரம்புக்குட்பட்டது; 429 வரலாம், அது மறைக்கப்படாமல் அறிவிக்கப்படும்.',
  },
  planVerifySample: {
    en: 'No correlation is classified with fewer than {min} paired observations.',
    si: 'යුගල නිරීක්ෂණ {min} ට අඩුවෙන් කිසිදු සහසම්බන්ධයක් වර්ගීකරණය නොකෙරේ.',
    ta: '{min} க்கும் குறைவான இணைக் கண்காணிப்புகளுடன் எந்தத் தொடர்பும் வகைப்படுத்தப்படாது.',
  },
  planMissingKey: {
    en: 'A required API key is not configured on this server, so this source may be unavailable.',
    si: 'අවශ්‍ය API යතුර මෙම සේවාදායකයේ වින්‍යාස කර නැත, එබැවින් මෙම මූලාශ්‍රය නොමැති විය හැක.',
    ta: 'தேவையான API விசை இந்தச் சேவையகத்தில் அமைக்கப்படவில்லை, எனவே இந்த மூலம் கிடைக்காமல் இருக்கலாம்.',
  },

  /* ------------------------------------------------------------ analysis */
  method_descriptive: { en: 'Descriptive statistics', si: 'විස්තරාත්මක සංඛ්‍යාලේඛන', ta: 'விவரணப் புள்ளியியல்' },
  method_correlation: { en: 'Pearson correlation', si: 'Pearson සහසම්බන්ධය', ta: 'Pearson தொடர்பு' },
  method_crossCorrelation: {
    en: 'Lagged cross-correlation',
    si: 'ප්‍රමාදිත හරස්-සහසම්බන්ධය',
    ta: 'தாமதக் குறுக்குத் தொடர்பு',
  },
  method_beforeAfter: { en: 'Before/after comparison', si: 'පෙර/පසු සංසන්දනය', ta: 'முன்/பின் ஒப்பீடு' },
  method_threshold: {
    en: 'Threshold exceedance table',
    si: 'සීමා ඉක්මවීම් වගුව',
    ta: 'வரம்பு மீறல் அட்டவணை',
  },
  method_trend: { en: 'Linear trend', si: 'රේඛීය ප්‍රවණතාවය', ta: 'நேர்கோட்டுப் போக்கு' },
  method_anomaly: { en: 'Anomaly detection', si: 'විෂමතා හඳුනාගැනීම', ta: 'முரண்பாடு கண்டறிதல்' },
  method_missing: { en: 'Missing-data analysis', si: 'අතුරුදන් දත්ත විශ්ලේෂණය', ta: 'விடுபட்ட தரவுப் பகுப்பாய்வு' },

  stat_mean: { en: 'Mean', si: 'මධ්‍යය', ta: 'சராசரி' },
  stat_median: { en: 'Median', si: 'මධ්‍යස්ථය', ta: 'இடைநிலை' },
  stat_sd: { en: 'Sample standard deviation', si: 'නියැදි සම්මත අපගමනය', ta: 'மாதிரி நிலையான விலகல்' },
  stat_min: { en: 'Minimum', si: 'අවම', ta: 'குறைந்தபட்சம்' },
  stat_max: { en: 'Maximum', si: 'උපරිම', ta: 'அதிகபட்சம்' },
  stat_n: { en: 'Valid observations', si: 'වලංගු නිරීක්ෂණ', ta: 'செல்லுபடியான கண்காணிப்புகள்' },
  stat_r: { en: 'Correlation coefficient r', si: 'සහසම්බන්ධ සංගුණකය r', ta: 'தொடர்புக் குணகம் r' },
  stat_p: { en: 'Two-sided p-value', si: 'ද්වි-පාර්ශ්වික p අගය', ta: 'இரு பக்க p மதிப்பு' },
  stat_lag: { en: 'Best lag (hours)', si: 'හොඳම ප්‍රමාදය (පැය)', ta: 'சிறந்த தாமதம் (மணி)' },
  stat_slope: { en: 'Slope', si: 'බෑවුම', ta: 'சாய்வு' },
  stat_intercept: { en: 'Intercept', si: 'අන්තර්ඡේදනය', ta: 'வெட்டுத்துண்டு' },
  stat_r2: { en: 'Coefficient of determination r²', si: 'නිර්ණායක සංගුණකය r²', ta: 'தீர்மானக் குணகம் r²' },
  stat_change: { en: 'Relative change (%)', si: 'සාපේක්ෂ වෙනස (%)', ta: 'சார்பு மாற்றம் (%)' },
  stat_before: { en: 'Baseline mean', si: 'පාදක මධ්‍යය', ta: 'அடிப்படை சராசரி' },
  stat_after: { en: 'Event-window mean', si: 'සිදුවීම් කවුළු මධ්‍යය', ta: 'நிகழ்வுச் சாளர சராசரி' },
  stat_anomalies: { en: 'Anomalies beyond 3σ', si: '3σ ඉක්මවන විෂමතා', ta: '3σ தாண்டிய முரண்பாடுகள்' },
  stat_missingFraction: { en: 'Missing fraction', si: 'අතුරුදන් භාගය', ta: 'விடுபட்ட விகிதம்' },
  stat_coverage: { en: 'Temporal coverage', si: 'කාලීන ආවරණය', ta: 'காலப் பரப்பு' },
  stat_pairs: { en: 'Paired samples', si: 'යුගල නියැදි', ta: 'இணை மாதிரிகள்' },
  stat_seasonalDiff: {
    en: 'Seasonal difference is not tested here',
    si: 'ඍතුමය වෙනස මෙහි පරීක්ෂා නොකෙරේ',
    ta: 'பருவ வேறுபாடு இங்கு சோதிக்கப்படவில்லை',
  },

  assumption_linear: {
    en: 'Pearson r measures linear, monotonic association only.',
    si: 'Pearson r මනින්නේ රේඛීය, ඒකාකාරී සම්බන්ධතාවය පමණි.',
    ta: 'Pearson r நேர்கோட்டு, ஒரே திசைத் தொடர்பை மட்டுமே அளவிடுகிறது.',
  },
  assumption_independence: {
    en: 'Samples are treated as independent; consecutive geophysical samples usually are not.',
    si: 'නියැදි ස්වාධීන ලෙස සලකනු ලැබේ; අනුක්‍රමික භූ-භෞතික නියැදි සාමාන්‍යයෙන් ස්වාධීන නොවේ.',
    ta: 'மாதிரிகள் சுயாதீனமாகக் கருதப்படுகின்றன; தொடர்ச்சியான புவி-இயற்பியல் மாதிரிகள் பொதுவாக சுயாதீனமல்ல.',
  },
  assumption_normal: {
    en: 'The p-value assumes approximately normal residuals; this is not verified here.',
    si: 'p අගය දළ වශයෙන් සාමාන්‍ය අවශේෂ උපකල්පනය කරයි; එය මෙහි තහවුරු නොකෙරේ.',
    ta: 'p மதிப்பு தோராயமாக இயல்பான மீதிகளைக் கருதுகிறது; இது இங்கு சரிபார்க்கப்படவில்லை.',
  },
  assumption_units: {
    en: 'Both variables are analysed in the units published by their sources.',
    si: 'විචල්‍ය දෙකම ඒවායේ මූලාශ්‍රවල ප්‍රකාශිත ඒකකවලින් විශ්ලේෂණය කෙරේ.',
    ta: 'இரு மாறிகளும் அவற்றின் மூலங்கள் வெளியிட்ட அலகுகளிலேயே பகுப்பாய்வு செய்யப்படுகின்றன.',
  },
  assumption_alignment: {
    en: 'Series are paired by nearest timestamp within a stated tolerance; unpaired samples are dropped and counted.',
    si: 'ශ්‍රේණි ප්‍රකාශිත ඉවසීම තුළ ළඟම කාල මුද්‍රාවෙන් යුගලනය කෙරේ; යුගල නොවූ නියැදි ඉවත් කර ගණන් කෙරේ.',
    ta: 'தொடர்கள் கூறப்பட்ட சகிப்புத்தன்மைக்குள் அருகிலுள்ள நேர முத்திரையால் இணைக்கப்படுகின்றன; இணைக்கப்படாத மாதிரிகள் நீக்கப்பட்டு எண்ணப்படுகின்றன.',
  },
  limitation_autocorr: {
    en: 'Geophysical series are autocorrelated, so the nominal p-value overstates significance.',
    si: 'භූ-භෞතික ශ්‍රේණි ස්වයං-සහසම්බන්ධිත බැවින් නාමික p අගය වැදගත්කම ඉතිරි කරයි.',
    ta: 'புவி-இயற்பியல் தொடர்கள் தன்-தொடர்புடையவை, எனவே பெயரளவு p மதிப்பு அர்த்தத்தை மிகைப்படுத்தும்.',
  },
  limitation_smallN: {
    en: 'The sample is small; a coefficient with a wide interval is weak evidence either way.',
    si: 'නියැදිය කුඩාය; පුළුල් පරාසයක් සහිත සංගුණකයක් දෙපැත්තටම දුර්වල සාක්ෂියකි.',
    ta: 'மாதிரி சிறியது; அகன்ற இடைவெளியுடைய குணகம் எந்தப் பக்கமும் பலவீனமான சான்று.',
  },
  limitation_missing: {
    en: 'Missing values reduce the paired sample; they are never replaced with estimates.',
    si: 'අතුරුදන් අගයන් යුගල නියැදිය අඩු කරයි; ඒවා කිසිවිටෙකත් ඇස්තමේන්තුවලින් ප්‍රතිස්ථාපනය නොකෙරේ.',
    ta: 'விடுபட்ட மதிப்புகள் இணை மாதிரியைக் குறைக்கின்றன; அவை ஒருபோதும் மதிப்பீடுகளால் மாற்றப்படுவதில்லை.',
  },
  limitation_causality: {
    en: 'Association in observational data cannot establish causation.',
    si: 'නිරීක්ෂණ දත්තවල සම්බන්ධතාවයකින් හේතුකාරකත්වය තහවුරු කළ නොහැක.',
    ta: 'கண்காணிப்புத் தரவில் உள்ள தொடர்பு காரணத்தை நிறுவ முடியாது.',
  },
  limitation_insufficient: {
    en: 'Too few valid observations to run this test, so none is reported.',
    si: 'මෙම පරීක්ෂණය සඳහා වලංගු නිරීක්ෂණ ප්‍රමාණවත් නොවන බැවින් කිසිවක් වාර්තා නොකෙරේ.',
    ta: 'இந்தச் சோதனைக்குத் தேவையான செல்லுபடியான கண்காணிப்புகள் போதாததால் எதுவும் அறிவிக்கப்படவில்லை.',
  },
  skip_reason: {
    en: 'Skipped: {reason}',
    si: 'මඟ හරින ලදී: {reason}',
    ta: 'தவிர்க்கப்பட்டது: {reason}',
  },

  /* ------------------------------------------------------------- evidence */
  evidence_supporting: { en: 'Supporting', si: 'සහායක', ta: 'ஆதரவு' },
  evidence_contradicting: { en: 'Contradicting', si: 'පරස්පර', ta: 'முரண்பாடு' },
  evidence_neutral: { en: 'Neutral', si: 'මධ්‍යස්ථ', ta: 'நடுநிலை' },
  evidence_insufficient: { en: 'Insufficient', si: 'ප්‍රමාණවත් නොවේ', ta: 'போதுமானதல்ல' },
  strength_none: { en: 'no evidence', si: 'සාක්ෂි නොමැත', ta: 'சான்று இல்லை' },
  strength_weak: { en: 'weak', si: 'දුර්වල', ta: 'பலவீனம்' },
  strength_moderate: { en: 'moderate', si: 'මධ්‍යම', ta: 'மிதமானது' },
  strength_strong: { en: 'strong', si: 'ශක්තිමත්', ta: 'வலுவானது' },

  rule_insufficient_n: {
    en: 'n = {n} paired observations is below the tested minimum of {min}; no classification is attempted.',
    si: 'n = {n} යුගල නිරීක්ෂණ පරීක්ෂිත අවමය {min} ට වඩා අඩුය; වර්ගීකරණයක් සිදු නොකෙරේ.',
    ta: 'n = {n} இணைக் கண்காணிப்புகள் சோதிக்கப்பட்ட குறைந்தபட்சம் {min} ஐ விடக் குறைவு; வகைப்படுத்தல் செய்யப்படவில்லை.',
  },
  rule_no_data: {
    en: 'No usable observations were retrieved for this dataset, so no evidence is classified.',
    si: 'මෙම දත්ත කට්ලලය සඳහා භාවිතා කළ හැකි නිරීක්ෂණ ලබාගෙන නැත, එබැවින් සාක්ෂි වර්ගීකරණය නොකෙරේ.',
    ta: 'இந்தத் தரவுத்தொகுப்பிற்குப் பயன்படுத்தக்கூடிய கண்காணிப்புகள் பெறப்படவில்லை, எனவே சான்று வகைப்படுத்தப்படவில்லை.',
  },
  rule_correlation_support: {
    en: 'r = {r} (n = {n}, p = {p}) is significant at α = 0.05, |r| ≥ {minR}, and its sign matches the hypothesis.',
    si: 'r = {r} (n = {n}, p = {p}) α = 0.05 හිදී වැදගත් වන අතර |r| ≥ {minR} සහ එහි ලකුණ උපකල්පනයට ගැලපේ.',
    ta: 'r = {r} (n = {n}, p = {p}) α = 0.05 இல் பொருளுடையது, |r| ≥ {minR}, அதன் குறி கருதுகோளுடன் பொருந்துகிறது.',
  },
  rule_correlation_contradict: {
    en: 'r = {r} (n = {n}, p = {p}) is significant, but the sign is opposite to the hypothesis.',
    si: 'r = {r} (n = {n}, p = {p}) වැදගත් වේ, නමුත් ලකුණ උපකල්පනයට ප්‍රතිවිරුද්ධය.',
    ta: 'r = {r} (n = {n}, p = {p}) பொருளுடையது, ஆனால் குறி கருதுகோளுக்கு எதிரானது.',
  },
  rule_correlation_neutral: {
    en: 'r = {r} (n = {n}, p = {p}) is not significant at α = 0.05: no detectable relationship in this window.',
    si: 'r = {r} (n = {n}, p = {p}) α = 0.05 හිදී වැදගත් නොවේ: මෙම කවුළුව තුළ හඳුනාගත හැකි සම්බන්ධතාවයක් නැත.',
    ta: 'r = {r} (n = {n}, p = {p}) α = 0.05 இல் பொருளுடையதல்ல: இந்தச் சாளரத்தில் கண்டறியக்கூடிய தொடர்பு இல்லை.',
  },
  rule_lead_lag: {
    en: 'Peak lagged correlation occurs at {lag} h (r = {r}); the hypothesis expected the driver to lead by {expected} h.',
    si: 'උපරිම ප්‍රමාදිත සහසම්බන්ධය {lag} පැයේදී සිදු වේ (r = {r}); උපකල්පනය අපේක්ෂා කළේ සාධකය පැය {expected} කින් පෙරමුණ ගනී යැයි ය.',
    ta: 'உச்சத் தாமதத் தொடர்பு {lag} மணியில் நிகழ்கிறது (r = {r}); காரணி {expected} மணி முன்னிலை பெறும் எனக் கருதுகோள் எதிர்பார்த்தது.',
  },
  rule_threshold_absent: {
    en: 'No interval in the retrieved record reaches the event threshold, so the threshold claim could not be tested.',
    si: 'ලබාගත් වාර්තාවේ කිසිදු කාල පරතරයක් සිදුවීම් සීමාවට ළඟා නොවේ, එබැවින් සීමා ප්‍රකාශය පරීක්ෂා කළ නොහැකි විය.',
    ta: 'பெறப்பட்ட பதிவில் எந்த இடைவெளியும் நிகழ்வு வரம்பை எட்டவில்லை, எனவே வரம்புக் கூற்றைச் சோதிக்க முடியவில்லை.',
  },
  rule_missing_coverage: {
    en: 'Coverage is {coverage}% of the expected samples; this is reported as a data-quality limitation, not corrected.',
    si: 'ආවරණය අපේක්ෂිත නියැදිවලින් {coverage}% කි; මෙය දත්ත ගුණාත්මක සීමාවක් ලෙස වාර්තා වේ, නිවැරදි නොකෙරේ.',
    ta: 'பரப்பு எதிர்பார்க்கப்பட்ட மாதிரிகளில் {coverage}%; இது தரவுத் தர வரம்பாக அறிவிக்கப்படுகிறது, சரிசெய்யப்படவில்லை.',
  },
  quality_complete: {
    en: 'No fill or null values were found in the retrieved records.',
    si: 'ලබාගත් වාර්තාවල පිරවුම් හෝ ශුන්‍ය අගයන් හමු නොවීය.',
    ta: 'பெறப்பட்ட பதிவுகளில் நிரப்பு அல்லது வெற்று மதிப்புகள் இல்லை.',
  },
  quality_fill: {
    en: '{missing} of {total} source rows were missing/fill values and were excluded from the paired sample.',
    si: 'මූලාශ්‍ර පේළි {total} න් {missing} ක් අතුරුදන්/පිරවුම් අගයන් වූ අතර යුගල නියැදියෙන් බැහැර කරන ලදී.',
    ta: '{total} மூல வரிகளில் {missing} விடுபட்ட/நிரப்பு மதிப்புகள்; இணை மாதிரியிலிருந்து விலக்கப்பட்டன.',
  },
  processing_parse: {
    en: 'Parsed {rows} source rows, normalised timestamps to UTC, preserved published units, and paired series by nearest sample within ±{tolerance} minutes.',
    si: 'මූලාශ්‍ර පේළි {rows} ක් විග්‍රහ කර, කාල මුද්‍රා UTC බවට සාමාන්‍යකරණය කර, ප්‍රකාශිත ඒකක රඳවා, ±{tolerance} මිනිත්තු තුළ ළඟම නියැදියෙන් ශ්‍රේණි යුගලනය කරන ලදී.',
    ta: '{rows} மூல வரிகள் பாகுபடுத்தப்பட்டு, நேர முத்திரைகள் UTC ஆக இயல்பாக்கப்பட்டு, வெளியிடப்பட்ட அலகுகள் பாதுகாக்கப்பட்டு, ±{tolerance} நிமிடங்களுக்குள் அருகிலுள்ள மாதிரியால் தொடர்கள் இணைக்கப்பட்டன.',
  },
  evidence_measurements: {
    en: '{variable} observations used in {method} against {dataset}.',
    si: '{method} හිදී {dataset} සමඟ භාවිතා කළ {variable} නිරීක්ෂණ.',
    ta: '{method} இல் {dataset} உடன் பயன்படுத்தப்பட்ட {variable} கண்காணிப்புகள்.',
  },

  /* ------------------------------------------------------ counter evidence */
  ce_assumption_title: { en: 'Unverified assumption', si: 'සත්‍යාපනය නොකළ උපකල්පනය', ta: 'சரிபார்க்கப்படாத அனுமானம்' },
  ce_assumption_detail: {
    en: 'The method assumes {assumption} That assumption was not tested in this investigation.',
    si: 'ක්‍රමය {assumption} යන උපකල්පනය කරයි. එම උපකල්පනය මෙම විමර්ශනයේදී පරීක්ෂා නොකරන ලදී.',
    ta: 'இந்த முறை {assumption} எனக் கருதுகிறது. அந்த அனுமானம் இந்த ஆய்வில் சோதிக்கப்படவில்லை.',
  },
  ce_alternative_title: { en: 'Alternative explanation', si: 'විකල්ප පැහැදිලි කිරීම', ta: 'மாற்று விளக்கம்' },
  ce_temporal_title: { en: 'Temporal alignment', si: 'කාලීන එකඟතාව', ta: 'கால இணைவு' },
  ce_temporal_detail: {
    en: 'The two series use different cadences ({left} vs {right}); pairing by nearest sample can shift events by up to half a cadence.',
    si: 'ශ්‍රේණි දෙක වෙනස් විභේදන ({left} සහ {right}) භාවිතා කරයි; ළඟම නියැදියෙන් යුගලනය කිරීමෙන් සිදුවීම් අඩ-විභේදනයක් දක්වා මාරු විය හැක.',
    ta: 'இரு தொடர்களும் வெவ்வேறு தீர்மானங்களைப் ({left} மற்றும் {right}) பயன்படுத்துகின்றன; அருகிலுள்ள மாதிரியால் இணைப்பது நிகழ்வுகளை அரை தீர்மானம் வரை நகர்த்தலாம்.',
  },
  ce_uncertainty_title: { en: 'Measurement uncertainty', si: 'මිනුම් අනිශ්චිතතාව', ta: 'அளவீட்டு நிச்சயமற்ற தன்மை' },
  ce_uncertainty_detail: {
    en: 'The retrieved products do not all publish uncertainty estimates. {detail}',
    si: 'ලබාගත් නිෂ්පාදන සියල්ලම අනිශ්චිතතා ඇස්තමේන්තු ප්‍රකාශ නොකරයි. {detail}',
    ta: 'பெறப்பட்ட தயாரிப்புகள் அனைத்தும் நிச்சயமற்ற மதிப்பீடுகளை வெளியிடவில்லை. {detail}',
  },
  ce_selection_title: { en: 'Selection bias', si: 'තේරීම් නැඹුරුතාව', ta: 'தேர்வுச் சார்பு' },
  ce_missing_variable_title: { en: 'Missing variable', si: 'අතුරුදන් විචල්‍යය', ta: 'விடுபட்ட மாறி' },
  ce_data_gap_title: { en: 'Data gap', si: 'දත්ත හිඳ', ta: 'தரவு இடைவெளி' },
  ce_data_gap_detail: {
    en: '{dataset} returned no usable observations for the requested window. The investigation therefore cannot test the hypothesis for this source.',
    si: '{dataset} ඉල්ලා සිටි කවුළුව සඳහා භාවිතා කළ හැකි නිරීක්ෂණ ලබා දුන්නේ නැත. එබැවින් මෙම මූලාශ්‍රය සඳහා උපකල්පනය පරීක්ෂා කළ නොහැක.',
    ta: '{dataset} கோரப்பட்ட சாளரத்திற்குப் பயன்படுத்தக்கூடிய கண்காணிப்புகளை வழங்கவில்லை. எனவே இந்த மூலத்திற்கான கருதுகோளைச் சோதிக்க முடியாது.',
  },
  ce_falsification_title: { en: 'How this hypothesis could fail', si: 'මෙම උපකල්පනය අසාර්ථක විය හැකි ආකාරය', ta: 'இந்தக் கருதுகோள் தோல்வியடையும் விதம்' },
  ce_out_of_coverage_title: { en: 'Requested period not covered', si: 'ඉල්ලා සිටි කාලය ආවරණය නොවේ', ta: 'கோரப்பட்ட காலம் உள்ளடக்கப்படவில்லை' },
  ce_out_of_coverage_detail: {
    en: '{dataset} publishes a {coverage} window; the requested period is outside it. No alternative period was substituted.',
    si: '{dataset} ප්‍රකාශ කරන්නේ {coverage} කවුළුවකි; ඉල්ලා සිටි කාලය ඉන් පිටතය. වෙනත් කාලයක් ආදේශ නොකරන ලදී.',
    ta: '{dataset} {coverage} சாளரத்தை வெளியிடுகிறது; கோரப்பட்ட காலம் அதற்கு வெளியே உள்ளது. வேறு காலம் பதிலாகப் பயன்படுத்தப்படவில்லை.',
  },

  /* ----------------------------------------------------------- conclusion */
  verdict_insufficient_title: {
    en: 'Insufficient evidence',
    si: 'ප්‍රමාණවත් සාක්ෂි නොමැත',
    ta: 'போதுமான சான்று இல்லை',
  },
  verdict_insufficient_summary: {
    en: 'No connected source returned data that could test the hypothesis over the requested period. NOVA will not substitute a different period, a different variable, or simulated values.',
    si: 'ඉල්ලා සිටි කාලය තුළ උපකල්පනය පරීක්ෂා කළ හැකි දත්ත සම්බන්ධිත මූලාශ්‍රයකින් ලැබුණේ නැත. NOVA වෙනත් කාලයක්, වෙනත් විචල්‍යයක් හෝ අනුකරණ අගයන් ආදේශ නොකරයි.',
    ta: 'கோரப்பட்ட காலத்தில் கருதுகோளைச் சோதிக்கக்கூடிய தரவு இணைக்கப்பட்ட மூலத்திலிருந்து வரவில்லை. NOVA வேறு காலம், வேறு மாறி அல்லது உருவகப்படுத்தப்பட்ட மதிப்புகளைப் பதிலாகப் பயன்படுத்தாது.',
  },
  verdict_not_supported_title: {
    en: 'Evidence does not support the hypothesis',
    si: 'සාක්ෂි උපකල්පනයට සහාය නොදක්වයි',
    ta: 'சான்று கருதுகோளை ஆதரிக்கவில்லை',
  },
  verdict_not_supported_summary: {
    en: 'Contradicting evidence outweighs supporting evidence ({contradicting} contradicting vs {supporting} supporting). The hypothesis may still be true — this window and these datasets simply do not support it.',
    si: 'පරස්පර සාක්ෂි සහායක සාක්ෂි ඉක්මවයි (පරස්පර {contradicting}, සහායක {supporting}). උපකල්පනය සත්‍ය විය හැක; මෙම කවුළුව සහ මෙම දත්ත කට්ටල පමණක් එයට සහාය නොදක්වයි.',
    ta: 'முரணான சான்று ஆதரவுச் சான்றை விட அதிகம் (முரண் {contradicting}, ஆதரவு {supporting}). கருதுகோள் உண்மையாக இருக்கலாம்; இந்தச் சாளரமும் இந்தத் தரவுத்தொகுப்புகளும் மட்டும் அதை ஆதரிக்கவில்லை.',
  },
  verdict_mixed_title: {
    en: 'Mixed evidence',
    si: 'මිශ්‍ර සාක්ෂි',
    ta: 'கலப்பான சான்று',
  },
  verdict_mixed_summary: {
    en: 'Supporting and contradicting evidence both appear ({supporting} supporting, {contradicting} contradicting). The hypothesis is not resolved by this investigation.',
    si: 'සහායක සහ පරස්පර සාක්ෂි දෙකම පෙනේ (සහායක {supporting}, පරස්පර {contradicting}). මෙම විමර්ශනයෙන් උපකල්පනය විසඳා නැත.',
    ta: 'ஆதரவு மற்றும் முரணான சான்றுகள் இரண்டும் உள்ளன (ஆதரவு {supporting}, முரண் {contradicting}). இந்த ஆய்வு கருதுகோளைத் தீர்க்கவில்லை.',
  },
  verdict_weak_title: {
    en: 'Weakly supported within limits',
    si: 'සීමා තුළ දුර්වල ලෙස සහාය දක්වයි',
    ta: 'வரம்புகளுக்குள் பலவீனமாக ஆதரிக்கப்படுகிறது',
  },
  verdict_weak_summary: {
    en: 'A statistically significant association consistent with the hypothesis was found ({supporting} supporting, {contradicting} contradicting), with the limitations listed below. This is an observational association — not proof, and not a discovery.',
    si: 'උපකල්පනයට අනුකූල සංඛ්‍යානමය වශයෙන් වැදගත් සම්බන්ධතාවයක් හමු විය (සහායක {supporting}, පරස්පර {contradicting}), පහත සීමා සමඟ. මෙය නිරීක්ෂණ සම්බන්ධතාවයක් මිස සාධනයක් හෝ සොයාගැනීමක් නොවේ.',
    ta: 'கருதுகோளுடன் பொருந்தும் புள்ளியியல் பொருளுடைய தொடர்பு கண்டறியப்பட்டது (ஆதரவு {supporting}, முரண் {contradicting}), கீழே உள்ள வரம்புகளுடன். இது கண்காணிப்புத் தொடர்பே தவிர நிரூபணமோ கண்டுபிடிப்போ அல்ல.',
  },
  passport_title: { en: 'NOVA Evidence Passport', si: 'NOVA සාක්ෂි විදේශ ගමන් බලපත්‍රය', ta: 'NOVA சான்று அனுமதிச் சீட்டு' },
  passport_section_question: { en: 'Research question', si: 'පර්යේෂණ ප්‍රශ්නය', ta: 'ஆய்வுக் கேள்வி' },
  passport_section_hypothesis: { en: 'Selected hypothesis', si: 'තෝරාගත් උපකල්පනය', ta: 'தேர்ந்தெடுக்கப்பட்ட கருதுகோள்' },
  passport_section_sources: { en: 'Data sources and provenance', si: 'දත්ත මූලාශ්‍ර සහ සම්භවය', ta: 'தரவு மூலங்களும் மூலத்தன்மையும்' },
  passport_section_methods: { en: 'Analysis methods and results', si: 'විශ්ලේෂණ ක්‍රම සහ ප්‍රතිඵල', ta: 'பகுப்பாய்வு முறைகளும் முடிவுகளும்' },
  passport_section_supporting: { en: 'Supporting evidence', si: 'සහායක සාක්ෂි', ta: 'ஆதரவுச் சான்று' },
  passport_section_contradicting: { en: 'Contradicting evidence', si: 'පරස්පර සාක්ෂි', ta: 'முரணான சான்று' },
  passport_section_uncertainty: { en: 'Uncertainty and alternative explanations', si: 'අනිශ්චිතතා සහ විකල්ප පැහැදිලි කිරීම්', ta: 'நிச்சயமற்ற தன்மையும் மாற்று விளக்கங்களும்' },
  passport_section_limitations: { en: 'Scientific limitations', si: 'විද්‍යාත්මක සීමා', ta: 'அறிவியல் வரம்புகள்' },
  passport_section_conclusion: { en: 'Conclusion', si: 'නිගමනය', ta: 'முடிவு' },
  passport_section_reproducibility: { en: 'Reproducibility', si: 'නැවත ලබා ගත හැකි බව', ta: 'மீள் உருவாக்கம்' },
  passport_disclaimer: {
    en: 'Generated by NOVA Hypothesis Forge. This is an AI-assisted analytical report, not a peer-reviewed publication and not an official NASA or NOAA finding.',
    si: 'NOVA Hypothesis Forge මගින් උත්පාදනය කරන ලදී. මෙය AI සහායක විශ්ලේෂණාත්මක වාර්තාවක් මිස සමාලෝචිත ප්‍රකාශනයක් හෝ නිල NASA/NOAA සොයාගැනීමක් නොවේ.',
    ta: 'NOVA Hypothesis Forge ஆல் உருவாக்கப்பட்டது. இது AI உதவியுடனான பகுப்பாய்வு அறிக்கை; சக மதிப்பாய்வு செய்யப்பட்ட வெளியீடு அல்ல, அதிகாரப்பூர்வ NASA/NOAA கண்டுபிடிப்பும் அல்ல.',
  },
  passport_generated_notice: {
    en: 'Measured values, timestamps and source URLs below come from the cited datasets. Hypothesis text, classifications and the conclusion are generated by deterministic rules in this codebase.',
    si: 'පහත මිනුම් අගයන්, කාල මුද්‍රා සහ මූලාශ්‍ර URL උපුටා දැක්වූ දත්ත කට්ටලවලින් ලැබේ. උපකල්පන පෙළ, වර්ගීකරණ සහ නිගමනය මෙම කේත පදනමේ නිර්ණායක නීති මගින් උත්පාදනය වේ.',
    ta: 'கீழே உள்ள அளவீடுகள், நேர முத்திரைகள், மூல URL கள் மேற்கோள் காட்டப்பட்ட தரவுத்தொகுப்புகளிலிருந்து வருகின்றன. கருதுகோள் உரை, வகைப்படுத்தல்கள், முடிவு ஆகியவை இந்தக் குறியீட்டுத் தளத்தின் நிர்ணய விதிகளால் உருவாக்கப்படுகின்றன.',
  },
  passport_reproduce: {
    en: 'Re-run the investigation with the same question, language and period. The engine is deterministic: identical payloads produce identical statistics. Every request/parameter used is listed in this passport.',
    si: 'එකම ප්‍රශ්නය, භාෂාව සහ කාලය සමඟ විමර්ශනය නැවත ධාවනය කරන්න. එන්ජිම නිර්ණායකය: සමාන ධාවක සමාන සංඛ්‍යාලේඛන ලබා දෙයි. භාවිතා කළ සෑම ඉල්ලීමක්/පරාමිතියක් මෙම බලපත්‍රයේ ලැයිස්තුගත කර ඇත.',
    ta: 'அதே கேள்வி, மொழி, காலத்துடன் ஆய்வை மீண்டும் இயக்கவும். இயந்திரம் நிர்ணயமானது: ஒத்த தரவுகள் ஒத்த புள்ளியியலைத் தரும். பயன்படுத்திய ஒவ்வொரு கோரிக்கையும் அளவுருவும் இந்த அனுமதிச் சீட்டில் பட்டியலிடப்பட்டுள்ளன.',
  },
  passport_none: { en: 'None recorded', si: 'කිසිවක් සටහන් නොවේ', ta: 'எதுவும் பதிவாகவில்லை' },

  causal_caveat: {
    en: 'Correlation is not causation. This report describes statistical associations between published observations. It does not demonstrate a physical mechanism, and it must not be cited as a NASA or NOAA finding.',
    si: 'සහසම්බන්ධය හේතුකාරකත්වය නොවේ. මෙම වාර්තාව ප්‍රකාශිත නිරීක්ෂණ අතර සංඛ්‍යානමය සම්බන්ධතා විස්තර කරයි. එය භෞතික යාන්ත්‍රණයක් ඔප්පු නොකරන අතර NASA හෝ NOAA සොයාගැනීමක් ලෙස උපුටා දැක්විය නොහැක.',
    ta: 'தொடர்பு காரணம் அல்ல. இந்த அறிக்கை வெளியிடப்பட்ட கண்காணிப்புகளுக்கு இடையிலான புள்ளியியல் தொடர்புகளை விவரிக்கிறது. இது இயற்பியல் இயங்குமுறையை நிரூபிக்கவில்லை; NASA அல்லது NOAA கண்டுபிடிப்பாக மேற்கோள் காட்டக்கூடாது.',
  },

  /* -------------------------------------------------------- dataset errors */
  error_key_not_configured: {
    en: 'No API key is configured on the server for this source, so it was skipped rather than called anonymously.',
    si: 'මෙම මූලාශ්‍රය සඳහා සේවාදායකයේ API යතුරක් වින්‍යාස කර නැත, එබැවින් නිර්නාමිකව ඇමතීම වෙනුවට එය මඟ හරින ලදී.',
    ta: 'இந்த மூலத்திற்கு சேவையகத்தில் API விசை அமைக்கப்படவில்லை, எனவே அநாமதேயமாக அழைக்காமல் தவிர்க்கப்பட்டது.',
  },
  error_source_timeout: {
    en: 'The source did not answer within the request timeout.',
    si: 'මූලාශ්‍රය ඉල්ලීම් කාල සීමාව තුළ පිළිතුරු දුන්නේ නැත.',
    ta: 'மூலம் கோரிக்கை நேர எல்லைக்குள் பதிலளிக்கவில்லை.',
  },
  error_source_network: {
    en: 'The source could not be reached from this server.',
    si: 'මෙම සේවාදායකයෙන් මූලාශ්‍රයට ළඟා විය නොහැකි විය.',
    ta: 'இந்தச் சேவையகத்திலிருந்து மூலத்தை அணுக முடியவில்லை.',
  },
  error_source_rejected: {
    en: 'The source rejected the request (HTTP {status}).',
    si: 'මූලාශ්‍රය ඉල්ලීම ප්‍රතික්ෂේප කළේය (HTTP {status}).',
    ta: 'மூலம் கோரிக்கையை நிராகரித்தது (HTTP {status}).',
  },
  error_source_invalid: {
    en: 'The source replied with a payload this connector could not parse; nothing was inferred from it.',
    si: 'මූලාශ්‍රය මෙම සම්බන්ධකයට විග්‍රහ කළ නොහැකි ධාවකයක් ලබා දුන්නේය; ඉන් කිසිවක් අනුමාන නොකරන ලදී.',
    ta: 'மூலம் இந்த இணைப்பியால் பாகுபடுத்த முடியாத தரவை அளித்தது; அதிலிருந்து எதுவும் ஊகிக்கப்படவில்லை.',
  },
  error_out_of_coverage: {
    en: 'The requested period is outside the published coverage of this source, so it was not called.',
    si: 'ඉල්ලා සිටි කාලය මෙම මූලාශ්‍රයේ ප්‍රකාශිත ආවරණයෙන් පිටත බැවින් එය ඇමතුවේ නැත.',
    ta: 'கோரப்பட்ட காலம் இந்த மூலத்தின் வெளியிடப்பட்ட பரப்புக்கு வெளியே இருந்ததால் அழைக்கப்படவில்லை.',
  },
};

/** Placeholder substitution. Unknown keys return the key so a missing string is visible in tests. */
export function forgeText(
  language: LanguageCode,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const entry = FORGE_STRINGS[key];
  if (!entry) return key;
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function variableLabel(language: LanguageCode, variableId: string): string {
  return forgeText(language, `var_${variableId}`);
}

export function classificationLabel(
  language: LanguageCode,
  classification: EvidenceClassification,
): string {
  return forgeText(language, `evidence_${classification}`);
}

export function strengthLabel(language: LanguageCode, strength: EvidenceStrength): string {
  return forgeText(language, `strength_${strength}`);
}

export const METHOD_LABEL_KEYS: Record<string, string> = {
  descriptive: 'method_descriptive',
  correlation: 'method_correlation',
  'cross-correlation': 'method_crossCorrelation',
  'before-after': 'method_beforeAfter',
  'threshold-exceedance': 'method_threshold',
  trend: 'method_trend',
  anomaly: 'method_anomaly',
  'missing-data': 'method_missing',
};
