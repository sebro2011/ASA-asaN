/**
 * Shared NASA Spacecraft Catalog, Tier-Adaptive Viewer Config & Safe Model URL Guard.
 *
 * Single source of truth shared between `SpacecraftViewer` (R3F GLB studio)
 * and `ArModelViewer` (`@google/model-viewer` WebXR / Quick Look AR).
 */

import type { QualityProfile } from './quality';

export interface SpacecraftSpec {
  readonly orbit: string;
  readonly launchYear: string;
  readonly dimensions: string;
  readonly mass: string;
}

export interface SpacecraftCatalogEntry {
  readonly id: string;
  readonly glb: string;
  readonly usdz: string;
  readonly category: string;
  readonly cameraOrbit: string;
  readonly cameraPosition: readonly [number, number, number];
  readonly alt: string;
  readonly name: { readonly en: string; readonly si: string; readonly ta: string };
  readonly detail: { readonly en: string; readonly si: string; readonly ta: string };
  readonly specs: SpacecraftSpec;
}

export const SPACECRAFT_CATALOG: readonly SpacecraftCatalogEntry[] = [
  {
    id: 'iss',
    glb: '/models/iss.glb',
    usdz: '/models/iss.usdz',
    category: 'Orbital Outpost',
    cameraOrbit: '25deg 72deg 108%',
    cameraPosition: [4.6, 1.8, 5.4],
    alt: 'International Space Station with truss, solar arrays and docked capsule in 3D AR',
    name: {
      en: 'International Space Station',
      si: 'ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය',
      ta: 'சர்வதேச விண்வெளி நிலையம்',
    },
    detail: {
      en: 'Modular orbiting laboratory · truss, four solar wing pairs and docked capsule',
      si: 'මොඩියුලර් කක්ෂීය විද්‍යාගාරය · ට්‍රස්, සූර්ය පුවරු යුගල හතරක් සහ කැප්සියුලය',
      ta: 'சுற்றுப்பாதை ஆய்வகம் · டிரஸ், நான்கு சூரிய இறக்கைகள் மற்றும் காப்சூல்',
    },
    specs: {
      orbit: 'LEO · ~408 km',
      launchYear: '1998',
      dimensions: '109 m span',
      mass: '~420,000 kg',
    },
  },
  {
    id: 'jwst',
    glb: '/models/jwst.glb',
    usdz: '/models/jwst.usdz',
    category: 'Deep Space Observatory',
    cameraOrbit: '-28deg 74deg 105%',
    cameraPosition: [4.0, 1.6, 4.9],
    alt: 'James Webb Space Telescope with 18 gold hex mirror segments and diamond sunshield in 3D AR',
    name: {
      en: 'James Webb Space Telescope',
      si: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය',
      ta: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி',
    },
    detail: {
      en: '18-segment gold primary mirror, secondary struts and five-layer diamond sunshield',
      si: 'ඛණ්ඩ 18ක රන් දර්පණය, ද්විතියික ආධාරක සහ ස්ථර පහේ සූර්ය පලිහ',
      ta: '18 தங்க கண்ணாடிப் பகுதிகள், துணைத் தூண்கள் மற்றும் ஐந்து அடுக்கு சூரியக் கவசம்',
    },
    specs: {
      orbit: 'Sun–Earth L2 · 1.5M km',
      launchYear: '2021',
      dimensions: '6.5 m mirror · 21 m shield',
      mass: '6,500 kg',
    },
  },
  {
    id: 'perseverance',
    glb: '/models/perseverance.glb',
    usdz: '/models/perseverance.usdz',
    category: 'Planetary Rover',
    cameraOrbit: '32deg 74deg 105%',
    cameraPosition: [4.0, 1.8, 4.8],
    alt: 'Perseverance rover with six wheels, instrument mast and robotic arm in 3D AR',
    name: {
      en: 'Perseverance Rover',
      si: 'පර්සවරන්ස් අඟහරු රෝවරය',
      ta: 'பெர்சவரன்ஸ் செவ்வாய் ரோவர்',
    },
    detail: {
      en: 'Six-wheel rocker-bogie chassis, instrument mast, robotic arm and RTG',
      si: 'රෝද හයේ රොකර්-බෝගී චැසිය, උපකරණ මාස්ටුව, රොබෝ අත සහ RTG',
      ta: 'ஆறு சக்கர ராக்கர்-போகி சேஸிஸ், கருவி மாஸ்ட், ரோபோ கை மற்றும் RTG',
    },
    specs: {
      orbit: 'Mars · Jezero Crater',
      launchYear: '2020',
      dimensions: '3.0 m × 2.7 m × 2.2 m',
      mass: '1,025 kg',
    },
  },
  {
    id: 'orion',
    glb: '/models/orion.glb',
    usdz: '/models/orion.usdz',
    category: 'Crewed Spaceflight',
    cameraOrbit: '20deg 75deg 105%',
    cameraPosition: [4.2, 1.5, 5.0],
    alt: 'Orion crew capsule with service module and four solar wings in 3D AR',
    name: {
      en: 'Orion / Artemis Capsule',
      si: 'ඔරියන් ආටෙමිස් කැප්සියුලය',
      ta: 'ஓரியன் ஆர்ட்டெமிஸ் காப்சூல்',
    },
    detail: {
      en: 'Crew capsule with heat shield, European Service Module and four solar wings',
      si: 'තාප පලිහ සහිත කාර්ය මණ්ඩල කැප්සියුලය, සේවා මොඩියුලය සහ සූර්ය පුවරු හතරක්',
      ta: 'வெப்பக் கவச காப்சூல், ஐரோப்பிய சேவை கூறு மற்றும் நான்கு சூரிய இறக்கைகள்',
    },
    specs: {
      orbit: 'Cislunar · Artemis',
      launchYear: '2022',
      dimensions: '5.0 m dia · 19 m wings',
      mass: '26,520 kg',
    },
  },
  {
    id: 'apollo-csm',
    glb: '/models/apollo-csm.glb',
    usdz: '/models/apollo-csm.usdz',
    category: 'Historic Spacecraft',
    cameraOrbit: '22deg 76deg 105%',
    cameraPosition: [4.2, 1.5, 5.0],
    alt: 'Apollo Command and Service Module with engine bell and RCS thrusters in 3D AR',
    name: {
      en: 'Apollo Command & Service Module',
      si: 'ඇපලෝ අණදෙන හා සේවා මොඩියුලය',
      ta: 'அப்பல்லோ கட்டளை & சேவை கூறு',
    },
    detail: {
      en: 'Blunt-body command cone, service bay, RCS quads and engine bell',
      si: 'මොට සිරුරේ අණදෙන කේතුව, සේවා බොක්ක, RCS තෙරපුම් සහ එන්ජින් බෙලය',
      ta: 'மழுங்கிய கட்டளைக் கூம்பு, சேவைப் பகுதி, RCS தள்ளிகள் மற்றும் என்ஜின் பெல்',
    },
    specs: {
      orbit: 'Lunar Orbit · Apollo',
      launchYear: '1968',
      dimensions: '11.0 m × 3.9 m',
      mass: '28,800 kg',
    },
  },
];

export interface SpacecraftViewerConfig {
  readonly enableWebGL: boolean;
  readonly dpr: [number, number];
  readonly environmentResolution: number;
  readonly starCount: number;
  readonly enableContactShadows: boolean;
  readonly enablePostprocessing: boolean;
  readonly bloomIntensity: number;
  readonly enableShadows: boolean;
}

export function getSpacecraftViewerConfig(profile: QualityProfile): SpacecraftViewerConfig {
  if (!profile.enableWebGL) {
    return {
      enableWebGL: false,
      dpr: [1, 1],
      environmentResolution: 0,
      starCount: 0,
      enableContactShadows: false,
      enablePostprocessing: false,
      bloomIntensity: 0,
      enableShadows: false,
    };
  }

  switch (profile.tier) {
    case 'tier-1':
      return {
        enableWebGL: true,
        dpr: [profile.dpr[0], profile.dpr[1]],
        environmentResolution: 64,
        starCount: 350,
        enableContactShadows: false,
        enablePostprocessing: false,
        bloomIntensity: 0,
        enableShadows: false,
      };
    case 'tier-2':
      return {
        enableWebGL: true,
        dpr: [profile.dpr[0], profile.dpr[1]],
        environmentResolution: 128,
        starCount: 800,
        enableContactShadows: true,
        enablePostprocessing: true,
        bloomIntensity: 0.55,
        enableShadows: false,
      };
    case 'tier-3':
    default:
      return {
        enableWebGL: true,
        dpr: [profile.dpr[0], profile.dpr[1]],
        environmentResolution: 256,
        starCount: 1400,
        enableContactShadows: true,
        enablePostprocessing: true,
        bloomIntensity: 0.72,
        enableShadows: true,
      };
  }
}

/**
 * Validates custom GLB/GLTF URLs supplied to `ArModelViewer`.
 * Allows relative `/models/...` paths or explicit `https://` URLs ending in
 * `.glb` or `.gltf` (query params allowed); rejects `javascript:`, `data:`,
 * `file:`, and insecure `http:` URLs.
 */
export function isSafeModelUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) return false;
    const cleanPath = trimmed.split(/[?#]/)[0].toLowerCase();
    return cleanPath.endsWith('.glb') || cleanPath.endsWith('.gltf');
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    const cleanPath = parsed.pathname.toLowerCase();
    return cleanPath.endsWith('.glb') || cleanPath.endsWith('.gltf');
  } catch {
    return false;
  }
}
