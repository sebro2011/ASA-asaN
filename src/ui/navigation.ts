/**
 * Navigation information architecture.
 *
 * The product has thirteen destinations; a flat 13-item strip is unreadable.
 * They are grouped by *domain of enquiry* — Home, Explore (discovery), Earth
 * (our planet), Solar System (everything else out there), and Assistant — which
 * is how a science platform is actually browsed.
 */

import {
  Activity,
  Aperture,
  Bot,
  BrainCircuit,
  Compass,
  Flame,
  Globe2,
  Leaf,
  Newspaper,
  Orbit,
  Rocket,
  Satellite,
  Sparkles,
  Target,
  Clapperboard
} from 'lucide-react';
import type { SupportedLanguage } from '../i18n/translations';

export type TabId =
  | 'home'
  | 'apod'
  | 'space-shorts'
  | '3d'
  | 'asteroids'
  | 'epic'
  | 'exoplanets'
  | 'earth'
  | 'missions'
  | 'launch'
  | 'news'
  | 'saved'
  | 'assistant'
  | 'quiz'
  | 'iss';

export interface NavEntry {
  id: TabId;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  labels: Record<SupportedLanguage, string>;
  /** Short technical descriptor used in menus and cards. */
  hint: Record<SupportedLanguage, string>;
  group: 'explore' | 'earth' | 'system' | 'assistant';
}

export const NAV_ENTRIES: NavEntry[] = [
  {
    id: 'space-shorts',
    icon: Clapperboard,
    group: 'explore',
    labels: { en: 'Space Shorts', si: 'අභ්‍යවකාශ කෙටි වීඩියෝ', ta: 'விண்வெளிக் குறுங்காணொளிகள்' },
    hint: { en: 'Shorts & space videos', si: 'කෙටි හා දිගු අභ්‍යවකාශ වීඩියෝ', ta: 'குறும் & விண்வெளிக் காணொளிகள்' }
  },
  {
    id: 'apod',
    icon: Aperture,
    group: 'explore',
    labels: { en: 'Astronomy Picture of the Day', si: 'දවසේ තාරකා ඡායාරූපය', ta: 'நாளின் வானியல் படம்' },
    hint: { en: 'NASA APOD archive', si: 'NASA APOD ලේඛනාගාරය', ta: 'NASA APOD காப்பகம்' }
  },
  {
    id: '3d',
    icon: Orbit,
    group: 'explore',
    labels: { en: '3D Space Lab', si: '3D අභ්‍යවකාශ ආයතනය', ta: '3D விண்வெளி ஆய்வகம்' },
    hint: { en: 'Planets, spacecraft, AR', si: 'ග්‍රහලෝක, අභ්‍යවකාශ යානා, AR', ta: 'கோள்கள், விண்கலங்கள், AR' }
  },
  {
    id: 'missions',
    icon: Rocket,
    group: 'explore',
    labels: { en: 'Landmark Missions', si: 'ඓතිහාසික මෙහෙයුම්', ta: 'வரலாற்றுப் பயணங்கள்' },
    hint: { en: 'Apollo → Artemis', si: 'ඇපලෝ → ආර්ටෙමිස්', ta: 'அப்பல்லோ → ஆர்ட்டெமிஸ்' }
  },
  {
    id: 'news',
    icon: Newspaper,
    group: 'explore',
    labels: { en: 'NASA News', si: 'නාසා පුවත්', ta: 'நாசா செய்திகள்' },
    hint: { en: 'Agency releases & calendar', si: 'නිවේදන සහ දින දර්ශනය', ta: 'அறிவிப்புகள் & நாட்காட்டி' }
  },
  {
    id: 'quiz',
    icon: BrainCircuit,
    group: 'explore',
    labels: { en: 'Space Trivia', si: 'අභ්‍යවකාශ දැනුම', ta: 'விண்வெளி வினாடி வினா' },
    hint: { en: 'Guided learning', si: 'මාර්ගෝපදේශිත ඉගෙනීම', ta: 'வழிகாட்டப்பட்ட கற்றல்' }
  },
  {
    id: 'earth',
    icon: Leaf,
    group: 'earth',
    labels: { en: 'Earth Intelligence Lab', si: 'පෘථිවි බුද්ධි ආයතනය', ta: 'பூமி நுண்ணறிவு ஆய்வகம்' },
    hint: { en: 'POWER climate archive · GIBS imagery', si: 'POWER දේශගුණික ලේඛනාගාරය', ta: 'POWER காலநிலை காப்பகம்' }
  },
  {
    id: 'epic',
    icon: Globe2,
    group: 'earth',
    labels: { en: 'EPIC Earth', si: 'EPIC පෘථිවිය', ta: 'EPIC பூமி' },
    hint: { en: 'DSCOVR · L1 full-disc', si: 'DSCOVR · L1 සම්පූර්ණ ගෝලය', ta: 'DSCOVR · L1 முழு வட்டு' }
  },
  {
    id: 'iss',
    icon: Satellite,
    group: 'earth',
    labels: { en: 'Orbital Tracking', si: 'කක්ෂීය ගමන් විස්තර', ta: 'சுற்றுப்பாதை கண்காணிப்பு' },
    hint: { en: 'ISS + tracked satellites', si: 'ISS සහ චන්ද්‍රිකා', ta: 'ISS & செயற்கைக்கோள்கள்' }
  },
  {
    id: 'asteroids',
    icon: Target,
    group: 'system',
    labels: { en: 'Near-Earth Objects', si: 'පෘථිවියට සමීප වස්තු', ta: 'பூமிக்கு அருகில் உள்ளவை' },
    hint: { en: 'NASA NeoWs close approaches', si: 'NASA NeoWs සමීප ගමන්', ta: 'NASA NeoWs அணுகல்கள்' }
  },
  {
    id: 'exoplanets',
    icon: Sparkles,
    group: 'system',
    labels: { en: 'Exoplanet Lab', si: 'බාහිර ග්‍රහලෝක', ta: 'புறக்கோள்கள்' },
    hint: { en: 'Kepler & TESS candidates', si: 'Kepler සහ TESS', ta: 'Kepler & TESS' }
  },
  {
    id: 'launch',
    icon: Flame,
    group: 'system',
    labels: { en: 'Launch Simulator', si: 'දියත්කිරීම් අනුකරණය', ta: 'ஏவுதல் உருவகப்படுத்தல்' },
    hint: { en: 'Simulated flight console', si: 'අනුකරණ පියාසැරි කොන්සෝලය', ta: 'உருவகப்படுத்தப்பட்ட பறப்பு' }
  },
  {
    id: 'assistant',
    icon: Bot,
    group: 'assistant',
    labels: { en: 'NOVA Assistant', si: 'NOVA සහායකයා', ta: 'NOVA உதவியாளர்' },
    hint: { en: 'Grounded AI · EN · සිං · தமி', si: 'AI සහායක · භාෂා තුන', ta: 'AI உதவியாளர் · மூன்று மொழிகள்' }
  },
  {
    id: 'saved',
    icon: Activity,
    group: 'assistant',
    labels: { en: 'Saved Research', si: 'සුරැකි පර්යේෂණ', ta: 'சேமித்த ஆய்வுகள்' },
    hint: { en: 'Your APODs & missions', si: 'ඔබේ ඡායාරූප සහ මෙහෙයුම්', ta: 'உங்கள் படங்கள் & பயணங்கள்' }
  }
];

export const NAV_GROUPS: Array<{
  id: 'explore' | 'earth' | 'system' | 'assistant';
  labels: Record<SupportedLanguage, string>;
}> = [
  { id: 'explore', labels: { en: 'Explore', si: 'ගවේෂණය', ta: 'ஆராய்க' } },
  { id: 'earth', labels: { en: 'Earth', si: 'පෘථිවිය', ta: 'பூமி' } },
  { id: 'system', labels: { en: 'Solar System', si: 'සෞරග්‍රහ මණ්ඩලය', ta: 'சூரிய குடும்பம்' } },
  { id: 'assistant', labels: { en: 'Assistant', si: 'සහායක', ta: 'உதவியாளர்' } }
];

export function navEntry(id: TabId): NavEntry | undefined {
  return NAV_ENTRIES.find((entry) => entry.id === id);
}

export function labelFor(id: TabId, lang: SupportedLanguage, fallback = ''): string {
  return navEntry(id)?.labels[lang] || navEntry(id)?.labels.en || fallback;
}

/** Primary mobile destinations — the rest live behind the "More" sheet. */
export const MOBILE_PRIMARY: TabId[] = ['home', 'earth', 'space-shorts', 'assistant', 'saved'];
