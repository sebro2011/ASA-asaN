import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  TooltipProps
} from 'recharts';
import { SupportedLanguage } from '../i18n/translations';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Compass, 
  Rocket, 
  Award, 
  CheckCircle2, 
  ShieldCheck, 
  Zap, 
  Activity,
  Layers,
  Sparkles,
  Filter,
  Info
} from 'lucide-react';

interface MissionsAnalyticsProps {
  lang: SupportedLanguage;
}

// Historical launch success data by decade
interface DecadeLaunchData {
  decade: string;
  total: number;
  success: number;
  partialOrFailed: number;
  successRate: number;
  highlight: Record<SupportedLanguage, string>;
}

const HISTORICAL_LAUNCH_DATA: DecadeLaunchData[] = [
  {
    decade: '1960s',
    total: 24,
    success: 21,
    partialOrFailed: 3,
    successRate: 87.5,
    highlight: {
      en: 'Mercury, Gemini & Apollo 11 Lunar Landing',
      si: 'මර්කරි, ජෙමිනි සහ ඇපලෝ 11 සඳ ගොඩබැසීම',
      ta: 'மெர்குரி, ஜெமினி & அப்பல்லோ 11 நிலவுப் பயணம்'
    }
  },
  {
    decade: '1970s',
    total: 32,
    success: 30,
    partialOrFailed: 2,
    successRate: 93.8,
    highlight: {
      en: 'Apollo 12-17, Skylab, Viking 1&2, Voyager 1&2',
      si: 'ඇපලෝ 12-17, ස්කයිලැබ්, වයිකින්ග්, වොයේජර් 1 සහ 2',
      ta: 'அப்பல்லோ 12-17, ஸ்கைலேப், வைக்கிங், வாயேஜர் 1&2'
    }
  },
  {
    decade: '1980s',
    total: 38,
    success: 36,
    partialOrFailed: 2,
    successRate: 94.7,
    highlight: {
      en: 'Space Shuttle operational era & Magellan Venus probe',
      si: 'අභ්‍යවකාශ ෂටල් යුගය සහ මැගලන් සිකුරු යානය',
      ta: 'ஸ்பேஸ் ஷட்டில் காலம் & மெகல்லன் விண்கலம்'
    }
  },
  {
    decade: '1990s',
    total: 46,
    success: 44,
    partialOrFailed: 2,
    successRate: 95.7,
    highlight: {
      en: 'Hubble Space Telescope, Galileo Jupiter, Mars Pathfinder',
      si: 'හබල් දුරේක්ෂය, ගැලීලියෝ බ්‍රහස්පති යානය, අඟහරු පාත්ෆයින්ඩර්',
      ta: 'ஹப்பிள் தொலைநோக்கி, கலிலியோ, மார்ஸ் பாத்ஃபைண்டர்'
    }
  },
  {
    decade: '2000s',
    total: 42,
    success: 41,
    partialOrFailed: 1,
    successRate: 97.6,
    highlight: {
      en: 'Mars Rovers Spirit & Opportunity, Cassini Saturn, ISS build',
      si: 'ස්පිරිට් හා ඔපචුනිටි රෝවර, කැසිනි සෙනසුරු යානය, ISS ඉදිවීම',
      ta: 'ஸ்பிரிட் & ஆப்பர்சூனிட்டி ரோவர்கள், காசினி, ISS உருவாக்கம்'
    }
  },
  {
    decade: '2010s',
    total: 39,
    success: 39,
    partialOrFailed: 0,
    successRate: 100.0,
    highlight: {
      en: 'Curiosity Mars, New Horizons Pluto flyby, Juno Jupiter, Kepler',
      si: 'කියුරියෝසිටි රෝවරය, නිව් හොරයිසන්ස් ප්ලූටෝ, ජූනෝ, කෙප්ලර්',
      ta: 'கியூரியோசிட்டி, நியூ ஹொரைசன்ஸ் புளூட்டோ, ஜூனோ, கெப்லர்'
    }
  },
  {
    decade: '2020s',
    total: 28,
    success: 28,
    partialOrFailed: 0,
    successRate: 100.0,
    highlight: {
      en: 'Perseverance & Ingenuity, James Webb (JWST), Artemis I, DART',
      si: 'පර්සෙවරන්ස් සහ ඉන්ජෙනුයිටි, ජේම්ස් වෙබ් (JWST), ආටෙමිස් I, DART',
      ta: 'பெர்சவரன்ஸ், ஜேம்ஸ் வெப் (JWST), ஆர்ட்டெமிஸ் I, டார்ட்'
    }
  }
];

// Landmark mission flight operating duration (in days)
interface MissionDurationData {
  name: string;
  category: string;
  days: number;
  years: number;
  color: string;
  destination: Record<SupportedLanguage, string>;
  statusNote: Record<SupportedLanguage, string>;
}

const MISSION_DURATION_DATA: MissionDurationData[] = [
  {
    name: 'Apollo 11',
    category: 'Manned Lunar',
    days: 8,
    years: 0.02,
    color: '#38bdf8',
    destination: { en: 'Moon (Tranquility)', si: 'චන්ද්‍රයා', ta: 'நிலவு' },
    statusNote: { en: 'Completed (8.1 days)', si: 'දින 8.1 කින් සාර්ථකව අවසන්', ta: '8.1 நாட்களில் நிறைவு' }
  },
  {
    name: 'Apollo 17',
    category: 'Manned Lunar',
    days: 13,
    years: 0.04,
    color: '#38bdf8',
    destination: { en: 'Moon (Taurus-Littrow)', si: 'චන්ද්‍රයා (ටෝරස්)', ta: 'நிலவு' },
    statusNote: { en: 'Completed (12.6 days)', si: 'දින 12.6 කින් සාර්ථකව අවසන්', ta: '12.6 நாட்களில் நிறைவு' }
  },
  {
    name: 'STS-135 Atlantis',
    category: 'Space Shuttle',
    days: 13,
    years: 0.04,
    color: '#60a5fa',
    destination: { en: 'Low Earth Orbit (ISS)', si: 'පෘථිවි පහළ කක්ෂය', ta: 'பூமி சுற்றுப்பாதை' },
    statusNote: { en: 'Final Shuttle Flight (13 days)', si: 'අවසන් ෂටල් පියාසැරිය', ta: 'இறுதி ஷட்டில் பயணம்' }
  },
  {
    name: 'Mars Pathfinder',
    category: 'Mars Surface',
    days: 85,
    years: 0.23,
    color: '#f97316',
    destination: { en: 'Mars (Ares Vallis)', si: 'අඟහරු', ta: 'செவ்வாய்' },
    statusNote: { en: 'Completed (85 days)', si: 'දින 85 කින් සාර්ථකව අවසන්', ta: '85 நாட்களில் நிறைவு' }
  },
  {
    name: 'InSight Lander',
    category: 'Mars Surface',
    days: 1440,
    years: 3.9,
    color: '#f59e0b',
    destination: { en: 'Mars (Elysium Planitia)', si: 'අඟහරු (භූකම්පන)', ta: 'செவ்வாய் நிலநடுக்கம்' },
    statusNote: { en: 'Completed (3.9 yrs)', si: 'වසර 3.9 ක් සක්‍රීයව පැවතිණි', ta: '3.9 ஆண்டுகள் இயங்கியது' }
  },
  {
    name: 'Kepler Telescope',
    category: 'Space Observatory',
    days: 3520,
    years: 9.6,
    color: '#a855f7',
    destination: { en: 'Earth-trailing heliocentric', si: 'සූර්ය කක්ෂය', ta: 'சூரிய சுற்றுப்பாதை' },
    statusNote: { en: '2,662 Exoplanets Confirmed', si: 'බාහිර ග්‍රහලෝක 2,662 ක් සොයාගැනුණි', ta: '2,662 புறக்கோள்கள்' }
  },
  {
    name: 'Opportunity Rover',
    category: 'Mars Surface',
    days: 5498,
    years: 15.1,
    color: '#f97316',
    destination: { en: 'Mars (Meridiani Planum)', si: 'අඟහරු (වසර 15 ක්)', ta: 'செவ்வாய் (15 ஆண்டுகள்)' },
    statusNote: { en: '55x Beyond 90-day Primary Mission', si: 'මුල් සැලසුමට වඩා 55 ගුණයක්', ta: 'திட்டமிட்டதை விட 55 மடங்கு' }
  },
  {
    name: 'Cassini-Huygens',
    category: 'Outer Planets',
    days: 7260,
    years: 19.9,
    color: '#eab308',
    destination: { en: 'Saturn & Enceladus', si: 'සෙනසුරු හා ටයිටන්', ta: 'சனி & டைட்டன்' },
    statusNote: { en: 'Grand Finale Atmospheric Dive', si: 'සෙනසුරු වායුගෝලයට කිඳා බැසීම', ta: 'சனி வளிமண்டல முடிவு' }
  },
  {
    name: 'Hubble Space Telescope',
    category: 'Space Observatory',
    days: 12700,
    years: 34.8,
    color: '#c084fc',
    destination: { en: 'Low Earth Orbit (540 km)', si: 'පෘථිවි කක්ෂය (කි.මී. 540)', ta: 'பூமி சுற்றுப்பாதை' },
    statusNote: { en: 'Active (34+ Years Operations)', si: 'තවමත් සක්‍රීයයි (වසර 34+)', ta: 'இன்னமும் செயலில் உள்ளது' }
  },
  {
    name: 'Voyager 2',
    category: 'Interstellar Probe',
    days: 17310,
    years: 47.4,
    color: '#10b981',
    destination: { en: 'Interstellar Space (20.5B km)', si: 'අන්තර්තාරකා අභ්‍යවකාශය', ta: 'விண்மீன்களிடை வெளி' },
    statusNote: { en: 'Active in Interstellar Medium', si: 'තවමත් සංඥා එවයි', ta: 'இப்போதும் தரவு அனுப்புகிறது' }
  },
  {
    name: 'Voyager 1',
    category: 'Interstellar Probe',
    days: 17370,
    years: 47.6,
    color: '#14b8a6',
    destination: { en: 'Interstellar Space (24.5B km)', si: 'දුරම මානව යානය (කි.මී. බිලියන 24.5)', ta: 'மிக தொலைவு விண்கலம்' },
    statusNote: { en: 'Farthest Human-Made Object', si: 'පෘථිවියෙන් දුරම මානව නිර්මාණය', ta: 'மிக தொலைதூர மனிதப் பொருள்' }
  }
];

// Target destination distribution
interface DestinationDistribution {
  name: Record<SupportedLanguage, string>;
  count: number;
  percentage: number;
  color: string;
}

const DESTINATION_DATA: DestinationDistribution[] = [
  {
    name: { en: 'Moon (Orbit & Surface)', si: 'චන්ද්‍රයා (කක්ෂය හා මතුපිට)', ta: 'நிலவு (சுற்றுப்பாதை & தரை)' },
    count: 42,
    percentage: 28,
    color: '#38bdf8'
  },
  {
    name: { en: 'Mars (Rovers & Orbiters)', si: 'අඟහරු (රෝවර හා කක්ෂගත යානා)', ta: 'செவ்வாய் (ரோவர்கள் & விண்கலங்கள்)' },
    count: 36,
    percentage: 24,
    color: '#f97316'
  },
  {
    name: { en: 'Earth Orbit & Telescopes', si: 'පෘථිවි කක්ෂය හා දුරේක්ෂ', ta: 'பூமி சுற்றுப்பாதை & தொலைநோக்கிகள்' },
    count: 33,
    percentage: 22,
    color: '#a855f7'
  },
  {
    name: { en: 'Outer Planets & Probes', si: 'බාහිර ග්‍රහයන් (බ්‍රහස්පති/සෙනසුරු)', ta: 'வெளிப்புற கோள்கள் (வியாழன்/சனி)' },
    count: 22,
    percentage: 15,
    color: '#10b981'
  },
  {
    name: { en: 'Sun & Inner Planets (Venus/Mercury)', si: 'සූර්යයා, සිකුරු සහ බුධ', ta: 'சூரியன், வெள்ளி மற்றும் புதன்' },
    count: 16,
    percentage: 11,
    color: '#eab308'
  }
];

// Heavy launcher payload capabilities
const LAUNCHER_PAYLOAD_DATA = [
  { name: 'Saturn V (Apollo)', payloadLeoTons: 140, payloadTliTons: 47, firstFlight: 1967, status: 'Retired' },
  { name: 'SLS Block 1 (Artemis)', payloadLeoTons: 95, payloadTliTons: 27, firstFlight: 2022, status: 'Active' },
  { name: 'Space Shuttle', payloadLeoTons: 27.5, payloadTliTons: 0, firstFlight: 1981, status: 'Retired' },
  { name: 'Titan IVB (Cassini)', payloadLeoTons: 21.6, payloadTliTons: 5.8, firstFlight: 1997, status: 'Retired' },
  { name: 'Atlas V 551 (JWST/Perseverance)', payloadLeoTons: 18.8, payloadTliTons: 8.9, firstFlight: 2002, status: 'Active' },
  { name: 'Delta IV Heavy (Parker Solar)', payloadLeoTons: 28.4, payloadTliTons: 11.2, firstFlight: 2004, status: 'Retired' }
];

export const MissionsAnalytics: React.FC<MissionsAnalyticsProps> = ({ lang }) => {
  const [activeMetricTab, setActiveMetricTab] = useState<'success' | 'duration' | 'destinations' | 'launchers'>('success');
  const [durationUnit, setDurationUnit] = useState<'years' | 'days'>('years');

  // Custom styled Tooltip for dark glassmorphic Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950/95 border border-cyan-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-xl font-mono text-xs space-y-1.5 z-50">
          <div className="font-bold text-white border-b border-slate-800 pb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>{label}</span>
          </div>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 text-slate-300">
              <span className="flex items-center gap-1" style={{ color: entry.color || entry.fill }}>
                <span>{entry.name}:</span>
              </span>
              <span className="font-bold text-white">
                {typeof entry.value === 'number' && entry.name.toLowerCase().includes('rate')
                  ? `${entry.value.toFixed(1)}%`
                  : entry.value.toLocaleString()}
                {entry.unit ? ` ${entry.unit}` : ''}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      
      {/* Top Telemetry KPI Metric Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Metric 1: Tracked Historical Missions */}
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-xl hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              {lang === 'si' ? 'ඓතිහාසික මෙහෙයුම්' : lang === 'ta' ? 'வரலாற்றுப் பணிகள்' : 'Landmark Missions'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
              <Rocket className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-['Orbitron'] text-white">
            168<span className="text-cyan-400 text-lg font-normal">+</span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-1">
            {lang === 'si' ? '1960 සිට 2026 දක්වා වාර්තාගත' : lang === 'ta' ? '1960 முதல் 2026 வரை' : 'Documented 1960 to 2026'}
          </p>
        </div>

        {/* Metric 2: Overall Mission Success Frequency */}
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-xl hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              {lang === 'si' ? 'සාර්ථකත්ව අනුපාතය' : lang === 'ta' ? 'வெற்றி விகிதம்' : 'Success Frequency'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-['Orbitron'] text-emerald-400">
            95.2<span className="text-emerald-300 text-lg font-normal">%</span>
          </div>
          <p className="text-[10px] text-emerald-400/90 font-mono mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 inline" />
            <span>{lang === 'si' ? '2010 සිට 100% සාර්ථකත්වය' : lang === 'ta' ? '2010 முதல் 100% வெற்றி' : '100% since 2010 to date'}</span>
          </p>
        </div>

        {/* Metric 3: Deepest Active Human Mission Distance */}
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-xl hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              {lang === 'si' ? 'දුරම සක්‍රීය යානය' : lang === 'ta' ? 'மிக தொலைதூர விண்கலம்' : 'Farthest Active'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Compass className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-['Orbitron'] text-amber-300">
            24.5<span className="text-amber-400 text-sm font-normal"> B km</span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-1">
            Voyager 1 • 163.8 AU from Sun
          </p>
        </div>

        {/* Metric 4: Longest Continuous Mission Flight */}
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-xl hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              {lang === 'si' ? 'දීර්ඝතම මෙහෙයුම් කාලය' : lang === 'ta' ? 'நீண்ட கால பயணம்' : 'Longest Flight'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-['Orbitron'] text-purple-300">
            47.6<span className="text-purple-400 text-sm font-normal"> Yrs</span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-1">
            {lang === 'si' ? 'වොයේජර් 1 සහ 2 (1977 සිට)' : lang === 'ta' ? 'வாயேஜர் 1 & 2 (1977 முதல்)' : 'Voyager 1 & 2 (Launched 1977)'}
          </p>
        </div>

      </div>

      {/* Sub-Metric Selector Navigation */}
      <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-2 flex-wrap shadow-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none w-full sm:w-auto">
          <button
            onClick={() => setActiveMetricTab('success')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold font-mono flex items-center gap-2 transition-all ${
              activeMetricTab === 'success'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/25 border border-cyan-400/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{lang === 'si' ? 'දියත්කිරීම් සාර්ථකත්වය' : lang === 'ta' ? 'ஏவுதல் வெற்றி அதிர்வெண்' : 'Launch Success Frequency'}</span>
          </button>

          <button
            onClick={() => setActiveMetricTab('duration')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold font-mono flex items-center gap-2 transition-all ${
              activeMetricTab === 'duration'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/25 border border-cyan-400/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{lang === 'si' ? 'මෙහෙයුම් කාල පරාසය' : lang === 'ta' ? 'பணி கால விநியோகம்' : 'Mission Duration Distribution'}</span>
          </button>

          <button
            onClick={() => setActiveMetricTab('destinations')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold font-mono flex items-center gap-2 transition-all ${
              activeMetricTab === 'destinations'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/25 border border-cyan-400/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{lang === 'si' ? 'ගමනාන්ත ව්‍යාප්තිය' : lang === 'ta' ? 'இலக்கு பகிர்வு' : 'Destination Breakdown'}</span>
          </button>

          <button
            onClick={() => setActiveMetricTab('launchers')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold font-mono flex items-center gap-2 transition-all ${
              activeMetricTab === 'launchers'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/25 border border-cyan-400/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <Rocket className="w-3.5 h-3.5" />
            <span>{lang === 'si' ? 'රොකට් භාර ධාරිතාව' : lang === 'ta' ? 'ராக்கெட் சுமை திறன்' : 'Rocket Payload Capacity'}</span>
          </button>
        </div>

        {activeMetricTab === 'duration' && (
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-[11px] font-mono shrink-0">
            <button
              onClick={() => setDurationUnit('years')}
              className={`px-2.5 py-1 rounded-lg transition ${
                durationUnit === 'years' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'si' ? 'වසර' : lang === 'ta' ? 'ஆண்டுகள்' : 'Years'}
            </button>
            <button
              onClick={() => setDurationUnit('days')}
              className={`px-2.5 py-1 rounded-lg transition ${
                durationUnit === 'days' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'si' ? 'දින' : lang === 'ta' ? 'நாட்கள்' : 'Days'}
            </button>
          </div>
        )}
      </div>

      {/* Main Interactive Recharts Visualization Panels */}

      {/* TAB 1: Launch Success Frequency by Decade */}
      {activeMetricTab === 'success' && (
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-6 hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white font-['Orbitron'] flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                <span>
                  {lang === 'si'
                    ? 'දශක අනුව නාසා මෙහෙයුම් දියත්කිරීම් සාර්ථකත්ව ප්‍රවණතාව'
                    : lang === 'ta'
                    ? 'பத்தாண்டு வாரியாக நாசா விண்வெளி ஏவுதல் வெற்றி விகிதங்கள்'
                    : 'NASA Historical Launch Success Frequency (1960s – 2020s)'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-1">
                {lang === 'si'
                  ? 'ඇපලෝ, ෂටල්, අඟහරු රෝවර සහ නූතන ගැඹුරු අභ්‍යවකාශ මෙහෙයුම් සංසන්දනය'
                  : lang === 'ta'
                  ? 'அப்பல்லோ, ஷட்டில், செவ்வாய் ரோவர்கள் மற்றும் ஆழமான விண்வெளி பணிகளின் ஒப்பீடு'
                  : 'Comparing total launches vs verified mission completions & success percentages over 6 decades.'}
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-cyan-400" />
                <span className="text-slate-300">{lang === 'si' ? 'සාර්ථක මෙහෙයුම්' : lang === 'ta' ? 'வெற்றிகரமானவை' : 'Successful'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="text-slate-300">{lang === 'si' ? 'සාර්ථකත්ව අනුපාතය (%)' : lang === 'ta' ? 'வெற்றி விகிதம் (%)' : 'Success Rate (%)'}</span>
              </div>
            </div>
          </div>

          {/* Recharts Area / Bar Combined Visualizer */}
          <div className="w-full h-80 sm:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={HISTORICAL_LAUNCH_DATA} margin={{ top: 15, right: 25, left: -10, bottom: 25 }}>
                <defs>
                  <linearGradient id="cyanAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="emeraldRateGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis 
                  dataKey="decade" 
                  stroke="#64748b" 
                  tick={{ fill: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}
                  tickLine={{ stroke: '#334155' }}
                />
                <YAxis 
                  yAxisId="left" 
                  stroke="#64748b" 
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickLine={{ stroke: '#334155' }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  domain={[70, 105]} 
                  unit="%" 
                  stroke="#10b981" 
                  tick={{ fill: '#34d399', fontSize: 11, fontFamily: 'monospace' }}
                  tickLine={{ stroke: '#065f46' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="success" 
                  name={lang === 'si' ? 'සාර්ථක මෙහෙයුම්' : lang === 'ta' ? 'வெற்றிகள்' : 'Successful Missions'} 
                  stroke="#22d3ee" 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#cyanAreaGradient)" 
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="successRate" 
                  name={lang === 'si' ? 'සාර්ථකත්ව අනුපාතය' : lang === 'ta' ? 'வெற்றி விகிதம்' : 'Success Rate'} 
                  stroke="#10b981" 
                  strokeWidth={3.5} 
                  dot={{ r: 5, fill: '#10b981', stroke: '#020617', strokeWidth: 2 }} 
                  activeDot={{ r: 8, fill: '#34d399', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Decade Summary Insight Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {HISTORICAL_LAUNCH_DATA.slice(-4).map((d) => (
              <div key={d.decade} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1 font-mono">
                <div className="flex items-center justify-between text-slate-300 font-bold">
                  <span>{d.decade}</span>
                  <span className="text-emerald-400">{d.successRate}%</span>
                </div>
                <div className="text-[11px] text-slate-400 line-clamp-1">
                  {d.highlight[lang] || d.highlight.en}
                </div>
                <div className="text-[10px] text-cyan-400/80">
                  {d.success} / {d.total} {lang === 'si' ? 'සාර්ථකයි' : lang === 'ta' ? 'வெற்றி' : 'Completed Successfully'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Mission Duration Distribution */}
      {activeMetricTab === 'duration' && (
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-6 hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white font-['Orbitron'] flex items-center gap-2">
                <Clock className="w-5 h-5 text-cyan-400" />
                <span>
                  {lang === 'si'
                    ? 'නාසා සුවිශේෂී මෙහෙයුම් කාල පරාසය (දින හෝ වසර)'
                    : lang === 'ta'
                    ? 'முக்கிய நாசா பணிகளின் இயக்கக் கால அளவு'
                    : 'Landmark Mission Operating Flight Duration Distribution'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-1">
                {lang === 'si'
                  ? 'මිනිසුන් සහිත ඇපලෝ සිට වසර 47 ක වොයේජර් දක්වා මෙහෙයුම් දිගුකාලීනත්වය'
                  : lang === 'ta'
                  ? 'அப்பல்லோ 11 முதல் 47 ஆண்டுகள் இயங்கும் வாயேஜர் வரை விண்கலங்களின் கால அளவு'
                  : 'From Apollo 11 (8 days) to deep space interstellar Voyagers (47+ continuous years).'}
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-cyan-400 font-semibold">
                {durationUnit === 'years' 
                  ? (lang === 'si' ? 'ඒකකය: පෘථිවි වසර' : lang === 'ta' ? 'அலகு: ஆண்டுகள்' : 'Unit: Earth Years')
                  : (lang === 'si' ? 'ඒකකය: දින' : lang === 'ta' ? 'அலகு: நாட்கள்' : 'Unit: Operating Days')}
              </span>
            </div>
          </div>

          {/* Horizontal / Vertical Bar Chart */}
          <div className="w-full h-80 sm:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={MISSION_DURATION_DATA} 
                margin={{ top: 20, right: 20, left: 10, bottom: 45 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis 
                  dataKey="name" 
                  stroke="#64748b" 
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickLine={{ stroke: '#334155' }}
                />
                <YAxis 
                  stroke="#64748b" 
                  unit={durationUnit === 'years' ? ' yr' : ' d'}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickLine={{ stroke: '#334155' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey={durationUnit === 'years' ? 'years' : 'days'} 
                  name={durationUnit === 'years' ? (lang === 'si' ? 'ක්‍රියාකාරී වසර' : lang === 'ta' ? 'ஆண்டுகள்' : 'Years Active') : (lang === 'si' ? 'ක්‍රියාකාරී දින' : lang === 'ta' ? 'நாட்கள்' : 'Days Active')}
                  radius={[6, 6, 0, 0]}
                >
                  {MISSION_DURATION_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Quick Highlight Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="text-xs font-mono text-cyan-400 font-semibold">
                {lang === 'si' ? 'වේගවත්ම සඳ මෙහෙයුම්' : lang === 'ta' ? 'நிலவுப் பயணம்' : 'Shortest Lunar Manned'}
              </div>
              <div className="text-sm font-bold text-white">Apollo 11 (8.1 Days)</div>
              <p className="text-[11px] text-slate-400 font-mono">
                {lang === 'si' ? 'පැය 21.5 ක් සඳ මතුපිට, ආරක්ෂිතව සාගරයට පැමිණීම.' : lang === 'ta' ? 'நிலவில் 21.5 மணி நேரம் ஆய்வு செய்து திரும்பியது.' : '21.5 hours on surface, landed safely in Pacific Ocean.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="text-xs font-mono text-amber-400 font-semibold">
                {lang === 'si' ? 'දීර්ඝතම අඟහරු රෝවරය' : lang === 'ta' ? 'செவ்வாய் சாதனை ரோவர்' : 'Longest Mars Surface'}
              </div>
              <div className="text-sm font-bold text-white">Opportunity (15.1 Years)</div>
              <p className="text-[11px] text-slate-400 font-mono">
                {lang === 'si' ? 'දින 90 ක මුල් මෙහෙයුම වසර 15 ක් දක්වා විහිදී කි.මී. 45 ක් ගමන් කළේය.' : lang === 'ta' ? '90 நாள் திட்டமிடல் 15 ஆண்டுகள் வரை நீடித்தது.' : 'Planned for 90 days, survived 5,498 days and 45.16 km.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="text-xs font-mono text-emerald-400 font-semibold">
                {lang === 'si' ? 'අන්තර්තාරකා ජයග්‍රහණය' : lang === 'ta' ? 'விண்மீன்களிடை சாதனை' : 'Farthest Interstellar Flight'}
              </div>
              <div className="text-sm font-bold text-white">Voyager 1 & 2 (47.6 Years)</div>
              <p className="text-[11px] text-slate-400 font-mono">
                {lang === 'si' ? 'තවමත් සූර්යයාගේ ආධිපත්‍යයෙන් ඔබ්බට සංඥා විකාශය කරයි.' : lang === 'ta' ? 'சூரியக் குடும்பத்தைக் கடந்து தரவுகளை அனுப்புகிறது.' : 'Still transmitting telemetry from outside the Heliosphere.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Destination Breakdown */}
      {activeMetricTab === 'destinations' && (
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-6 hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all">
          <div className="border-b border-slate-800/80 pb-4">
            <h3 className="text-base sm:text-lg font-bold text-white font-['Orbitron'] flex items-center gap-2">
              <Compass className="w-5 h-5 text-cyan-400" />
              <span>
                {lang === 'si'
                  ? 'නාසා ගවේෂණ මෙහෙයුම්වල සෞරග්‍රහ මණ්ඩල ගමනාන්ත ව්‍යාප්තිය'
                  : lang === 'ta'
                  ? 'நாசா விண்வெளி இலக்குகளின் விகிதாசாரப் பகிர்வு'
                  : 'Planetary Target & Destination Distribution Ratio'}
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {lang === 'si'
                ? 'සඳ, අඟහරු, බාහිර ග්‍රහලෝක සහ ගැඹුරු අභ්‍යවකාශයට යැවූ යානා ප්‍රතිශත'
                : lang === 'ta'
                ? 'சந்திரன், செவ்வாய், புறக்கோள்கள் மற்றும் விண்மீன்களிடை பணிகளின் ஒப்பீடு'
                : 'Distribution of NASA probes, orbiters, rovers and crewed flights by destination target.'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Donut Pie Chart */}
            <div className="lg:col-span-6 h-72 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={DESTINATION_DATA}
                    dataKey="count"
                    nameKey="name.en"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={4}
                    stroke="#020617"
                    strokeWidth={2}
                  >
                    {DESTINATION_DATA.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Target Details Legend */}
            <div className="lg:col-span-6 space-y-3 font-mono">
              {DESTINATION_DATA.map((dest, idx) => (
                <div 
                  key={idx}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: dest.color }} />
                    <span className="text-slate-200 font-medium">
                      {dest.name[lang] || dest.name.en}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-slate-400 font-bold">{dest.count} {lang === 'si' ? 'මෙහෙයුම්' : lang === 'ta' ? 'பணிகள்' : 'missions'}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-white font-bold" style={{ color: dest.color }}>
                      {dest.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Launcher Payload Capacities */}
      {activeMetricTab === 'launchers' && (
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-6 hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all">
          <div className="border-b border-slate-800/80 pb-4">
            <h3 className="text-base sm:text-lg font-bold text-white font-['Orbitron'] flex items-center gap-2">
              <Rocket className="w-5 h-5 text-cyan-400" />
              <span>
                {lang === 'si'
                  ? 'නාසා ඓතිහාසික රොකට් පද්ධතිවල භාර ධාරිතාව (ටොන්)'
                  : lang === 'ta'
                  ? 'வரலாற்று சிறப்புமிக்க நாசா ஏவுகணை சுமை திறன் (டன்கள்)'
                  : 'NASA Historical Heavy Launch Vehicle Payload Comparison (LEO vs Moon TLI)'}
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {lang === 'si'
                ? 'සැටර්න් V, SLS, අභ්‍යවකාශ ෂටල්, සහ ඩෙල්ටා IV රොකට්වල එසවුම් ශක්තිය'
                : lang === 'ta'
                ? 'சாட்டர்ன் V, ஆர்ட்டெமிஸ் SLS மற்றும் ஸ்பேஸ் ஷட்டில் ராக்கெட்டுகளின் ஒப்பீடு'
                : 'Comparing Low Earth Orbit (LEO) and Translunar Injection (TLI) lift capability in metric tons.'}
            </p>
          </div>

          <div className="w-full h-80 sm:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={LAUNCHER_PAYLOAD_DATA} margin={{ top: 20, right: 20, left: 10, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis 
                  dataKey="name" 
                  stroke="#64748b" 
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickLine={{ stroke: '#334155' }}
                />
                <YAxis 
                  stroke="#64748b" 
                  unit=" t"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickLine={{ stroke: '#334155' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: 10, fontFamily: 'monospace', fontSize: 12 }} 
                />
                <Bar 
                  dataKey="payloadLeoTons" 
                  name={lang === 'si' ? 'පෘථිවි පහළ කක්ෂයට භාරය (LEO)' : lang === 'ta' ? 'பூமி சுற்றுப்பாதை சுமை (LEO)' : 'Low Earth Orbit (LEO Tons)'} 
                  fill="#06b6d4" 
                  radius={[5, 5, 0, 0]} 
                />
                <Bar 
                  dataKey="payloadTliTons" 
                  name={lang === 'si' ? 'චන්ද්‍ර ගමනට භාරය (TLI)' : lang === 'ta' ? 'நிலவுப் பயண சுமை (TLI)' : 'Translunar Injection (TLI Tons)'} 
                  fill="#f59e0b" 
                  radius={[5, 5, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

    </div>
  );
};
