import { SupportedLanguage } from '../i18n/translations';

export interface MissionStep {
  phase: string;
  title: Record<SupportedLanguage, string>;
  description: Record<SupportedLanguage, string>;
  telemetry: string;
}

export interface SpaceMission {
  id: string;
  name: Record<SupportedLanguage, string>;
  subtitle: Record<SupportedLanguage, string>;
  year: string;
  status: Record<SupportedLanguage, string>;
  destination: Record<SupportedLanguage, string>;
  operator: string;
  image: string;
  summary: Record<SupportedLanguage, string>;
  facts: {
    label: Record<SupportedLanguage, string>;
    value: string;
  }[];
  steps: MissionStep[];
}

export const SPACE_MISSIONS: SpaceMission[] = [
  {
    id: 'apollo-11',
    name: {
      en: 'Apollo 11',
      si: 'ඇපලෝ 11 (Apollo 11)',
      ta: 'அப்பல்லோ 11 (Apollo 11)'
    },
    subtitle: {
      en: 'First Human Lunar Landing',
      si: 'මානව ඉතිහාසයේ පළමු සඳ තරණය',
      ta: 'மனிதனின் முதல் நிலவுப் பயணம்'
    },
    year: '1969',
    status: {
      en: 'Mission Accomplished',
      si: 'මෙහෙයුම සාර්ථකව නිම විය',
      ta: 'பணி வெற்றிகரமாக நிறைவுற்றது'
    },
    destination: {
      en: 'Moon (Sea of Tranquility)',
      si: 'චන්ද්‍රයා (ශාන්තියේ මුහුද)',
      ta: 'நிலவு (அமைதிக் கடல்)'
    },
    operator: 'NASA / Houston Control',
    image: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=1200&q=80',
    summary: {
      en: 'On July 20, 1969, astronauts Neil Armstrong and Buzz Aldrin stepped onto the lunar surface from the Lunar Module Eagle, fulfilling humanity’s age-old dream of walking on another world.',
      si: '1969 ජූලි 20 වන දින, ඇමරිකානු ගගනගාමීන් වන නීල් ආම්ස්ට්‍රෝං සහ බස් ඕල්ඩ්‍රින් ඊගල් යානයෙන් සඳ මතුපිටට පා තබමින් වෙනත් ලෝකයකට ගිය පළමු මිනිසුන් බවට පත්විය.',
      ta: 'ஜூலை 20, 1969 அன்று, நீல் ஆம்ஸ்ட்ராங் மற்றும் பஸ் ஆல்ட்ரின் ஆகியோர் சந்திரனின் மேற்பரப்பில் காலடி எடுத்து வைத்து வரலாற்றுச் சாதனை படைத்தனர்.'
    },
    facts: [
      { label: { en: 'Launch Vehicle', si: 'රොකට්ටුව', ta: 'ராக்கெட்' }, value: 'Saturn V' },
      { label: { en: 'Crew Members', si: 'කාර්ය මණ්ඩලය', ta: 'விண்வெளி வீரர்கள்' }, value: 'Armstrong, Aldrin, Collins' },
      { label: { en: 'Time on Moon', si: 'සඳ මත ගතකළ කාලය', ta: 'நிலவில் இருந்த நேரம்' }, value: '21 hrs 36 mins' },
      { label: { en: 'Samples Returned', si: 'ගෙනා සාම්පල', ta: 'கொண்டு வரப்பட்ட மாதிரிகள்' }, value: '21.55 kg lunar rocks' }
    ],
    steps: [
      {
        phase: '1. Launch',
        title: {
          en: 'Saturn V Ignition from Launch Complex 39A',
          si: '39A වේදිකාවෙන් සැටර්න් V රොකට්ටුව ගුවන්ගත වීම',
          ta: '39A தளத்திலிருந்து சாட்டர்ன் V ஏவுதல்'
        },
        description: {
          en: '7.5 million pounds of thrust propelled the 363-foot-tall Saturn V into Earth orbit within 11 minutes.',
          si: 'රාත්තල් මිලියන 7.5 ක තෙරපුමක් සමඟ අඩි 363 ක් උසැති සැටර්න් V රොකට්ටුව මිනිත්තු 11 ක් ඇතුළත පෘථිවි කක්ෂයට ඇතුළු විය.',
          ta: '7.5 மில்லியன் பவுண்டுகள் உந்துவிசையுடன் சாட்டர்ன் V ராக்கெட் பூமியின் சுற்றுப்பாதையை அடைந்தது.'
        },
        telemetry: 'Speed: 28,000 km/h • Altitude: 185 km'
      },
      {
        phase: '2. Trans-Lunar Injection',
        title: {
          en: 'Translunar Coast & Docking',
          si: 'සඳ බලා ගමන් කිරීම සහ යානා එකතු කිරීම',
          ta: 'நிலவை நோக்கிய பயணம் மற்றும் இணைப்பு'
        },
        description: {
          en: 'The third stage S-IVB fired to send Apollo toward the Moon across a 384,000 km journey taking three days.',
          si: 'තෙවැනි අදියර ක්‍රියාත්මක කර කිලෝමීටර 384,000 ක දුරක් ගෙවා දින තුනකින් සඳ කරා ළඟාවීමට ගමන් ආරම්භ විය.',
          ta: 'பூமியிலிருந்து 3,84,000 கி.மீ தூரமுள்ள சந்திரனை நோக்கி 3 நாட்கள் பயணம் தொடங்கியது.'
        },
        telemetry: 'Speed: 39,000 km/h • Range: 240,000 km'
      },
      {
        phase: '3. Lunar Landing',
        title: {
          en: 'Eagle Touches Down on Sea of Tranquility',
          si: 'ඊගල් යානය සඳ මතුපිට ශාන්තියේ මුහුදට ගොඩබැසීම',
          ta: 'ஈகிள் விண்கலம் அமைதிக் கடலில் தரையிறங்குதல்'
        },
        description: {
          en: '"Houston, Tranquility Base here. The Eagle has landed." Neil Armstrong steered manually past boulder-strewn craters.',
          si: '"හූස්ටන්, ට්‍රැන්ක්විලිටි කඳවුර මෙහි. ඊගල් යානය ගොඩබෑවා." ආම්ස්ට්‍රෝං විසින් ගල්පර සහිත ආවාට මඟහරිමින් යානය ගොඩබස්වන ලදී.',
          ta: '"ஈகிள் தரை இறங்கிவிட்டது." நீல் ஆம்ஸ்ட்ராங் கைமுறையாக விண்கலத்தை பாதுகாப்பாகத் தரை இறக்கினார்.'
        },
        telemetry: 'Fuel Remaining: 25 seconds • Pitch: 0 deg'
      },
      {
        phase: '4. Surface Science & Return',
        title: {
          en: 'First Steps & Pacific Ocean Splashdown',
          si: 'පළමු පියවර සහ පැසිෆික් සාගරයට ගොඩබැසීම',
          ta: 'முதல் அடிகள் மற்றும் பசிபிக் கடலில் மீளல்'
        },
        description: {
          en: 'Armstrong and Aldrin deployed seismic and solar wind experiments, raised the flag, and returned safely to splash down.',
          si: 'භූ කම්පන සහ සූර්ය සුළං පරීක්ෂණ උපකරණ සවිකර සාම්පල රැගෙන සාගරයට ආරක්ෂිතව ගොඩබසින ලදී.',
          ta: 'நிலவின் மாதிரிகளைச் சேகரித்து அமெரிக்கக் கொடியை நாட்டி, பசிபிக் பெருங்கடலில் பாதுகாப்பாகத் திரும்பினர்.'
        },
        telemetry: 'Recovery: USS Hornet • Quarantine: 21 Days'
      }
    ]
  },
  {
    id: 'artemis',
    name: {
      en: 'Artemis Program',
      si: 'ආටෙමිස් වැඩසටහන (Artemis)',
      ta: 'ஆர்ட்டெமிஸ் திட்டம் (Artemis)'
    },
    subtitle: {
      en: 'Humankind’s Return to Moon & Gateway to Mars',
      si: 'මිනිසා යළි සඳට සහ අඟහරු ගමනට මඟපෙන්වීම',
      ta: 'மீண்டும் நிலவுக்கு மற்றும் செவ்வாய்க்கான பாதை'
    },
    year: '2022 - Present',
    status: {
      en: 'Active & Accelerating',
      si: 'ක්‍රියාකාරී මෙහෙයුම් මට්ටමේ',
      ta: 'செயலில் உள்ள திட்டம்'
    },
    destination: {
      en: 'Lunar South Pole & Gateway Orbit',
      si: 'චන්ද්‍ර දක්ෂිණ ධ්‍රැවය සහ ගේට්වේ කක්ෂය',
      ta: 'நிலவின் தென் துருவம் & கேட்வே'
    },
    operator: 'NASA / ESA / JAXA / CSA',
    image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
    summary: {
      en: 'With the Artemis campaign, NASA is landing the first woman and first person of color on the Moon, using innovative technologies to explore more of the lunar surface than ever before.',
      si: 'ආටෙමිස් මෙහෙයුම මඟින් පළමු කාන්තාව සහ වර්ණවත් පුද්ගලයා සඳ මතුපිටට ගොඩබස්වා, අනාගත අඟහරු ගවේෂණය සඳහා ස්ථිර චන්ද්‍ර කඳවුරක් බිහිකිරීම අරමුණු කරයි.',
      ta: 'ஆர்ட்டெமிஸ் திட்டம் மூலம் முதல் பெண் மற்றும் கறுப்பினத்தவரை நிலவில் தரையிறக்கி, செவ்வாய் கிரகப் பயணத்திற்கான அடித்தளத்தை அமைக்கிறது.'
    },
    facts: [
      { label: { en: 'Launch Rocket', si: 'රොකට්ටුව', ta: 'ராக்கெட்' }, value: 'SLS (Space Launch System)' },
      { label: { en: 'Crew Capsule', si: 'කාර්ය මණ්ඩල යානය', ta: 'விண்கலம்' }, value: 'Orion Spacecraft' },
      { label: { en: 'Lunar Station', si: 'අභ්‍යවකාශ මධ්‍යස්ථානය', ta: 'நிலவு நிலையம்' }, value: 'Gateway Station' },
      { label: { en: 'Landing Target', si: 'ගොඩබසින ප්‍රදේශය', ta: 'தரையிறங்கும் பகுதி' }, value: 'Shackleton Crater Ice' }
    ],
    steps: [
      {
        phase: 'Artemis I',
        title: {
          en: 'Uncrewed Distant Retrograde Orbit Flight',
          si: 'නියමුවන් රහිත දුරස්ථ ප්‍රතිගාමී කක්ෂීය පරීක්ෂාව',
          ta: 'ஆளில்லா ஓரியன் விண்கல சோதனைப் பயணம்'
        },
        description: {
          en: 'Orion traveled 1.4 million miles, flew beyond the Moon farther than any spacecraft built for humans, and aced heat shield atmospheric entry.',
          si: 'ඔරායන් යානය සැතපුම් මිලියන 1.4 ක් ගමන් කර, මිනිසුන් සඳහා නිපදවූ ඕනෑම යානයකට වඩා දුරක් ගොස් තාප ආවරණ පරීක්ෂාව සාර්ථකව අවසන් කළේය.',
          ta: 'மனிதர்களுக்காக வடிவமைக்கப்பட்ட விண்கலம் நிலவைத் தாண்டி சாதனை தூரம் பயணித்து பாதுகாப்பாகத் திரும்பியது.'
        },
        telemetry: 'Splashdown: Dec 11, 2022 • Mach 32 Reentry'
      },
      {
        phase: 'Artemis II',
        title: {
          en: 'Crewed Flyby of the Moon',
          si: 'ගගනගාමීන් සමඟ චන්ද්‍රයා වටා ගමන් කිරීම',
          ta: 'விண்வெளி வீரர்களுடன் நிலவைச் சுற்றி வருதல்'
        },
        description: {
          en: 'Four astronauts (Wiseman, Glover, Koch, Hansen) embark on a 10-day circumlunar voyage verifying life support in deep space.',
          si: 'ගගනගාමීන් සිව්දෙනෙකු දින 10 ක් පුරා ගැඹුරු අභ්‍යවකාශයේ ජීවිත ආධාරක පද්ධති පරීක්ෂා කරමින් සඳ වටා ගමන් කරයි.',
          ta: 'நான்கு விண்வெளி வீரர்கள் 10 நாள் பயணமாக நிலவைச் சுற்றி வந்து உயிர் ஆதரவு அமைப்புகளைச் சோதிக்கின்றனர்.'
        },
        telemetry: 'Crew: 4 Astronauts • Distance: 400,000 km'
      },
      {
        phase: 'Artemis III & Beyond',
        title: {
          en: 'Human Landing at the Lunar South Pole',
          si: 'චන්ද්‍ර දක්ෂිණ ධ්‍රැවයට මිනිසුන් ගොඩබැසීම',
          ta: 'நிலவின் தென் துருவத்தில் மனித தரையிறக்கம்'
        },
        description: {
          en: 'Astronauts will explore shadowed craters containing water ice, establishing the foundation for long-term presence and Mars missions.',
          si: 'ජල අයිස් පවතින සෙවණැලි ආවාට ගවේෂණය කරමින් අනාගත අඟහරු මෙහෙයුම් සඳහා මූලික කඳවුරක් ස්ථාපිත කිරීම.',
          ta: 'நீர் பனிக்கட்டி நிறைந்த நிழல் பள்ளங்களை ஆய்வு செய்து, செவ்வாய் பயணத்திற்கான தளத்தை உருவாக்குதல்.'
        },
        telemetry: 'EVA Duration: 5+ Days • SpaceX HLS lander'
      }
    ]
  },
  {
    id: 'jwst',
    name: {
      en: 'James Webb Space Telescope',
      si: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය',
      ta: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி'
    },
    subtitle: {
      en: 'Humanity’s Golden Eye into the Cosmic Dawn',
      si: 'විශ්වයේ ආරම්භය නිරීක්ෂණය කරන රන්වන් නෙත',
      ta: 'பிரபஞ்சத்தின் ஆரம்பத்தை நோக்கும் தங்கக் கண்'
    },
    year: '2021 - Present',
    status: {
      en: 'Active Science Operations',
      si: 'ක්‍රියාකාරී විද්‍යාත්මක මෙහෙයුම්',
      ta: 'செயலில் உள்ள அறிவியல் பணிகள்'
    },
    destination: {
      en: 'Sun-Earth Lagrange Point 2 (1.5M km)',
      si: 'සූර්ය-පෘථිවි ලග්‍රාන්ජ් 2 ලක්ෂ්‍යය (කි.මී. මිලියන 1.5)',
      ta: 'சூரியன்-பூமி லாக்ராஞ்ச் 2 புள்ளி (15 லட்சம் கி.மீ)'
    },
    operator: 'NASA / ESA / CSA',
    image: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1200&q=80',
    summary: {
      en: 'Equipped with a 6.5-meter gold-coated beryllium mirror and ultra-sensitive infrared detectors, JWST peers back over 13.5 billion years to see the first stars and galaxies igniting.',
      si: 'මීටර් 6.5 ක රත්‍රන් ආලේපිත දර්පණයකින් සමන්විත ජේම්ස් වෙබ් දුරේක්ෂය මඟින් වසර බිලියන 13.5 කට පෙර බිහිවූ මුල්ම තාරකා සහ මන්දාකිණිවල ආලෝකය නිරීක්ෂණය කරයි.',
      ta: '6.5 மீட்டர் தங்க முலாம் பூசப்பட்ட கண்ணாடியுடன், 1350 கோடி ஆண்டுகளுக்கு முன் தோன்றிய முதல் விண்மீன்களை இது படம்பிடிக்கிறது.'
    },
    facts: [
      { label: { en: 'Primary Mirror', si: 'ප්‍රධාන දර්පණය', ta: 'முதன்மை கண்ணாடி' }, value: '6.5m Gold-coated Beryllium' },
      { label: { en: 'Sunshield', si: 'සූර්ය ආවරණය', ta: 'சூரியக் கவசம்' }, value: '5 layers (Tennis Court size)' },
      { label: { en: 'Operating Temp', si: 'ක්‍රියාකාරී උෂ්ණත්වය', ta: 'இயக்க வெப்பநிலை' }, value: '-233°C (40 Kelvin)' },
      { label: { en: 'Wavelengths', si: 'තරංග ආයාම', ta: 'அலைநீளம்' }, value: 'Optical to Mid-Infrared' }
    ],
    steps: [
      {
        phase: 'Ariane 5 Launch',
        title: {
          en: 'Christmas Day Precision Liftoff',
          si: 'නත්තල් දින අභ්‍යවකාශගත වීම',
          ta: 'கிறிஸ்துமஸ் தினத்தில் துல்லியமான ஏவுதல்'
        },
        description: {
          en: 'Launched from French Guiana on Dec 25, 2021 with such pinpoint accuracy that onboard propellant was saved for 20+ years of science.',
          si: '2021 දෙසැම්බර් 25 වන දින ප්‍රංශ ගයනාවෙන් අතිශය නිරවද්‍ය ලෙස දියත් කිරීම නිසා ඉන්ධන ඉතිරිවී වසර 20 කට වැඩි ආයුකාලයක් ලැබිණි.',
          ta: 'துல்லியமாக ஏவப்பட்டதன் மூலம் 20 ஆண்டுகளுக்கும் மேலான பணிக்கான எரிபொருள் மிச்சப்படுத்தப்பட்டது.'
        },
        telemetry: 'Liftoff: Dec 25, 2021 • Ariane 5 ECA'
      },
      {
        phase: 'Origami Deployment',
        title: {
          en: 'Unfolding the Tennis-Court Sunshield & Mirror',
          si: 'ටෙනිස් පිටියක් තරම් සූර්ය ආවරණය දිගහැරීම',
          ta: 'சூரியக் கவசம் மற்றும் கண்ணாடிகளை விரித்தல்'
        },
        description: {
          en: 'Over 344 single-point failures were successfully overcome as the 5-layer Kapton sunshield tensioned and 18 mirror segments aligned.',
          si: 'අවදානම් ලක්ෂ්‍ය 344 ක් සාර්ථකව ජයගනිමින් දර්පණ ඛණ්ඩ 18 ක් සහ පස් ස්ථර සූර්ය ආවරණය නැනෝමීටර් මට්ටමේ නිරවද්‍යතාවයෙන් පෙළගස්වන ලදී.',
          ta: '344 சாத்தியமான ஆபத்துகளைக் கடந்து 18 கண்ணாடிகள் மற்றும் 5 அடுக்கு சூரியக் கவசம் விண்வெளியில் விரிந்தன.'
        },
        telemetry: 'Alignment accuracy: 20 nanometers'
      },
      {
        phase: 'Cosmic Dawn Science',
        title: {
          en: 'Spectroscopy of Exoplanet Atmospheres & Early Galaxies',
          si: 'පිටසක්වල ග්‍රහලෝක වායුගෝල හා ආදිතම මන්දාකිණි පරීක්ෂාව',
          ta: 'புறக்கோள் வளிமண்டலங்கள் மற்றும் ஆதி விண்மீன் திரள்கள்'
        },
        description: {
          en: 'Detected water vapor, carbon dioxide, and sulfur dioxide on alien worlds, and discovered massive galaxies existing only 300 million years after the Big Bang.',
          si: 'වෙනත් සෞරග්‍රහ මණ්ඩලවල ග්‍රහලෝක මත ජල වාෂ්ප, කාබන් ඩයොක්සයිඩ් හඳුනාගත් අතර මහා පිපිරුමෙන් සුළු කලකට පසු බිහිවූ මන්දාකිණි හෙළිදරව් කළේය.',
          ta: 'வேற்று கிரகங்களில் நீர் மற்றும் கார்பன் டை ஆக்சைடை கண்டறிந்து, பிரபஞ்சத்தின் தொடக்க கால விண்மீன் திரள்களை வெளிப்படுத்தியது.'
        },
        telemetry: 'Resolving power: 0.1 arcsecond'
      }
    ]
  },
  {
    id: 'perseverance',
    name: {
      en: 'Mars Perseverance & Ingenuity',
      si: 'අඟහරු පර්සෙවරන්ස් සහ ඉන්ජෙනුයිටි',
      ta: 'செவ்வாய் பெர்சவரன்ஸ் & இன்ஜெனியூட்டி'
    },
    subtitle: {
      en: 'Astrobiology & Powered Flight on Another Planet',
      si: 'පිටසක්වල ජීවය සෙවීම සහ වෙනත් ලෝකයක පළමු පියාසැරිය',
      ta: 'வேற்று கிரகத்தில் முதல் இயந்திரப் பறத்தல்'
    },
    year: '2020 - Present',
    status: {
      en: 'Exploring Jezero Crater',
      si: 'ජෙසීරෝ ආවාටය ගවේෂණය කරමින් පවතී',
      ta: 'ஜெசெரோ பள்ளத்தில் தீவிர ஆய்வு'
    },
    destination: {
      en: 'Mars (Jezero Crater Paleolake)',
      si: 'අඟහරු (ජෙසීරෝ ආවාටයේ පැරණි විල)',
      ta: 'செவ்வாய் (ஜெசெரோ பண்டைய ஏரி)'
    },
    operator: 'NASA / Jet Propulsion Laboratory (JPL)',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
    summary: {
      en: 'Perseverance seeks signs of ancient microscopic life and collects rock core samples for future return to Earth, while the Ingenuity helicopter achieved 72 historic flights through the thin Martian air.',
      si: 'පර්සෙවරන්ස් රෝවරය අඟහරු මත අතීත ක්ෂුද්‍ර ජීවී සාක්ෂි සොයමින් පර්යේෂණ සාම්පල එකතු කරන අතර ඉන්ජෙනුයිටි හෙලිකොප්ටරය අඟහරු වායුගෝලයේ ඓතිහාසික පියාසැරි 72 ක් සිදුකළේය.',
      ta: 'பெர்சவரன்ஸ் ரோவர் பண்டைய நுண்ணுயிர் தடயங்களைத் தேடி மாதிரிகளைச் சேகரிக்கிறது. இன்ஜெனியூட்டி ஹெலிகாப்டர் 72 முறை பறந்து சாதனை படைத்தது.'
    },
    facts: [
      { label: { en: 'Rover Weight', si: 'රෝවරයේ බර', ta: 'ரோவர் எடை' }, value: '1,025 kg (Car-sized)' },
      { label: { en: 'Power Source', si: 'බලශක්ති ප්‍රභවය', ta: 'மின் சக்தி' }, value: 'MMRTG Nuclear Battery' },
      { label: { en: 'Ingenuity Flights', si: 'හෙලිකොප්ටර් පියාසැරි', ta: 'ஹெலிகாப்டர் பறப்புகள்' }, value: '72 Flights completed' },
      { label: { en: 'Samples Cached', si: 'තැන්පත් කළ සාම්පල', ta: 'சேகரிக்கப்பட்ட மாதிரிகள்' }, value: '24 Hermetic Titanium Tubes' }
    ],
    steps: [
      {
        phase: '7 Minutes of Terror',
        title: {
          en: 'Sky Crane Descent through Martian Atmosphere',
          si: 'ස්කයි ක්‍රේන් (Sky Crane) මඟින් අඟහරු මතුපිටට ගොඩබැසීම',
          ta: 'ஸ்கை கிரேன் மூலம் செவ்வாய் தரையிறங்குதல்'
        },
        description: {
          en: 'Terrain-Relative Navigation guided the heat shield, supersonic parachute, and rocket-powered sky crane to lower the rover gently onto the red dirt.',
          si: 'ස්වයංක්‍රීය භූමි සංචලනය, සුපර්සොනික් පැරෂුටය සහ රොකට් බලැති ස්කයි ක්‍රේන් ආධාරයෙන් රෝවරය ආරක්ෂිතව අඟහරු මත පතිත විය.',
          ta: 'சூப்பர்சோனிக் பாராசூட் மற்றும் ராக்கெட் கிரேன் உதவியுடன் ரோவர் செவ்வாய் தரையில் மென்மையாக இறக்கப்பட்டது.'
        },
        telemetry: 'Touchdown: Feb 18, 2021 • Speed: 2.7 km/h'
      },
      {
        phase: 'Aviation Milestone',
        title: {
          en: 'Ingenuity Helicopter First Powered Controlled Flight',
          si: 'ඉන්ජෙනුයිටි හෙලිකොප්ටරයේ පළමු පාලිත පියාසැරිය',
          ta: 'வேற்று கிரகத்தில் முதல் ஹெலிகாப்டர் பறப்பு'
        },
        description: {
          en: 'Spinning counter-rotating blades at 2,400 RPM in an atmosphere 1% as dense as Earth’s, proving aerial scouting is feasible on other worlds.',
          si: 'පෘථිවි වායුගෝල ඝනත්වයෙන් 1% ක් වන අඟහරු මත මිනිත්තුවට වට 2,400 ක වේගයෙන් තල කරකවමින් ඉතිහාසයේ ප්‍රථම වරට පියාසර කළේය.',
          ta: 'பூமியின் வளிமண்டல அடர்த்தியில் 1% மட்டுமே உள்ள சூழலில் சுழலிகளை இயக்கி வரலாற்றுப் பறப்பை நிகழ்த்தியது.'
        },
        telemetry: 'Total Flight Time: 128 minutes • Distance: 17 km'
      },
      {
        phase: 'Mars Sample Return',
        title: {
          en: 'Drilling & Caching Organic-Rich River Delta Cores',
          si: 'පැරණි ගංගා ඩෙල්ටාවෙන් සාම්පල විද ලබාගැනීම',
          ta: 'கரிம மாதிரிகளை சேகரித்து பாதுகாத்தல்'
        },
        description: {
          en: 'Cores drilled from mudstones rich in clays and carbonates are sealed in titanium tubes to be brought to Earth laboratories for biosignature scrutiny.',
          si: 'මැටි සහ කාබනේට් සහිත ගල් කුට්ටිවලින් විද ලබාගත් සාම්පල ටයිටේනියම් නල තුළ මුද්‍රා තබා පෘථිවියට ගෙන ඒම සඳහා සුරක්ෂිතව තබා ඇත.',
          ta: 'உயிரியல் அடையாளங்களை ஆராய பூமியின் ஆய்வகங்களுக்கு கொண்டு வர மாதிரிகள் டைட்டானியம் குழாய்களில் அடைக்கப்பட்டுள்ளன.'
        },
        telemetry: 'Sample Depth: 5 cm • Tube Purity: Ultra-clean'
      }
    ]
  }
];
