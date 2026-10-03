'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sun, Zap } from 'lucide-react';
import { useTrilingual } from '../context/TrilingualProvider';
import { LiquidGlassCard } from './LiquidGlassCard.jsx';

const NOAA_SCALES = {
  0: {
    scale: 'G0',
    title: { en: 'Quiet / Nominal Space Weather', si: 'සන්සුන් සාමාන්‍ය සූර්ය කාලගුණය', ta: 'அமைதியான விண்வெளி வானிலை' },
    severity: 'NOMINAL',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.4)',
    auroraLat: '65°+ N/S (Polar regions only)',
    gridImpact: { en: 'No operational degradation.', si: 'විදුලිබල පද්ධතිවලට බලපෑමක් නැත.', ta: 'மின் கட்டமைப்பு பாதிப்பில்லை.' },
    satImpact: { en: 'Nominal orbital drag and solar panel efficiency.', si: 'චන්ද්‍රිකා කක්ෂවලට බාධාවක් නොමැත.', ta: 'செயற்கைக்கோள் இயல்பாக செயல்படுகிறது.' },
    mitigationTip: { en: 'Standard routine orbit maintenance protocols.', si: 'සාමාන්‍ය නඩත්තු ක්‍රියා පටිපාටිය.', ta: 'வழக்கமான பராமரிப்பு போதுமானது.' }
  },
  5: {
    scale: 'G1 (Minor)',
    title: { en: 'G1 Minor Geomagnetic Storm', si: 'G1 සුළු භූ-චුම්භක කුණාටුවක්', ta: 'G1 சிறிய புவிக்காந்த புயல்' },
    severity: 'MINOR',
    color: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.4)',
    auroraLat: '60°+ N/S (High latitudes)',
    gridImpact: { en: 'Weak power grid fluctuations may occur.', si: 'සුළු විදුලි රැහැන් විචල්‍යතා ඇති විය හැක.', ta: 'லேசான மின் ஏற்ற இறக்கங்கள்.' },
    satImpact: { en: 'Minor impact on satellite operations.', si: 'චන්ද්‍රිකා මෙහෙයුම්වලට සුළු බලපෑමක්.', ta: 'செயற்கைக்கோள்களில் சிறிய தாக்கம்.' },
    mitigationTip: { en: 'Monitor low-earth orbit station telemetry.', si: 'පහළ කක්ෂීය චන්ද්‍රිකා නිරීක්ෂණය කරන්න.', ta: 'பூமிக்கு அருகிலுள்ள சுற்றுப்பாதையை கண்காணிக்கவும்.' }
  },
  6: {
    scale: 'G2 (Moderate)',
    title: { en: 'G2 Moderate Geomagnetic Storm', si: 'G2 මධ්‍යස්ථ භූ-චුම්භක කුණාටුවක්', ta: 'G2 மிதமான புவிக்காந்த புயல்' },
    severity: 'MODERATE',
    color: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.4)',
    auroraLat: '55°+ N/S (New York, Northern UK)',
    gridImpact: { en: 'High-latitude power systems may experience voltage alarms.', si: 'අධි-අක්ෂාංශ විදුලිබල පද්ධතිවල අනතුරු ඇඟවීම්.', ta: 'உயர் அட்சரேகை மின் இணைப்புகளில் எச்சரிக்கை.' },
    satImpact: { en: 'Corrective orientation maneuvers may be required.', si: 'චන්ද්‍රිකා පිහිටුම් නිවැරදි කිරීම් අවශ්‍ය විය හැක.', ta: 'செயற்கைக்கோள் திசையமைப்பை மாற்ற வேண்டியிருக்கலாம்.' },
    mitigationTip: { en: 'Enable automated transformer voltage stabilization.', si: 'ස්වයංක්‍රීය වෝල්ටීයතා ස්ථායීකාරක ක්‍රියාත්මක කරන්න.', ta: 'மின்மாற்றி மின்னழுத்த நிலைப்படுத்தலை இயக்கவும்.' }
  },
  7: {
    scale: 'G3 (Strong)',
    title: { en: 'G3 Strong Geomagnetic Storm', si: 'G3 ප්‍රබල භූ-චුම්භක කුණාටුවක්', ta: 'G3 வலுவான புவிக்காந்த புயல்' },
    severity: 'STRONG',
    color: '#f97316',
    glow: 'rgba(249, 115, 22, 0.4)',
    auroraLat: '50°+ N/S (Mid-latitudes visible)',
    gridImpact: { en: 'Voltage corrections required; false protective alarms.', si: 'වෝල්ටීයතා නිවැරදි කිරීම් අවශ්‍ය වේ.', ta: 'மின்னழுத்த திருத்தங்கள் தேவை.' },
    satImpact: { en: 'Surface charging on satellites; increased atmospheric drag.', si: 'චන්ද්‍රිකා මත ආරෝපණ එකතු වීම; වැඩි වායු ඝර්ෂණය.', ta: 'செயற்கைக்கோள் வளிமண்டல உராய்வு அதிகரிப்பு.' },
    mitigationTip: { en: 'Switch polar flight routes to lower sub-auroral paths.', si: 'ධ්‍රැවීය ගුවන් ගමන් මාර්ග වෙනස් කරන්න.', ta: 'துருவ விமானப் பாதைகளை மாற்றவும்.' }
  },
  8: {
    scale: 'G4 (Severe)',
    title: { en: 'G4 Severe Solar & Geomagnetic Storm', si: 'G4 දරුණු සූර්ය සහ භූ-චුම්භක කුණාටුවක්', ta: 'G4 கடுமையான சூரிய புவிக்காந்த புயல்' },
    severity: 'SEVERE',
    color: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.5)',
    auroraLat: '45°+ N/S (Widespread auroras)',
    gridImpact: { en: 'Possible widespread voltage control problems and grid trips.', si: 'විදුලි පද්ධති බිඳවැටීම් සහ විසන්ධිවීම්.', ta: 'பரவலான மின் கட்டமைப்பு சிக்கல்கள்.' },
    satImpact: { en: 'Extensive tracking and orientation issues; payload safe-mode.', si: 'චන්ද්‍රිකා උපකරණ ආරක්ෂිත මාදිලියට පත්කිරීම.', ta: 'செயற்கைக்கோள்கள் பாதுகாப்பான பயன்முறைக்கு மாற்றம்.' },
    mitigationTip: { en: 'Initiate payload safe-mode; reroute satellite comms links.', si: 'චන්ද්‍රිකා ආරක්ෂිත මාදිලියට මාරු කරන්න.', ta: 'செயற்கைக்கோள் தகவல்தொடர்புகளை மாற்றுப்பாதையில் இயக்கவும்.' }
  },
  9: {
    scale: 'G5 (Extreme)',
    title: { en: 'G5 Extreme Carrington-Class Event', si: 'G5 අතිශය දරුණු කැරින්ටන් මට්ටමේ සූර්ය කුණාටුවක්', ta: 'G5 மிக தீவிர காரிங்டன்-வகுப்பு புயல்' },
    severity: 'EXTREME',
    color: '#e11d48',
    glow: 'rgba(225, 29, 72, 0.6)',
    auroraLat: '40°+ N/S (Visible near tropics)',
    gridImpact: { en: 'Widespread grid collapse or transformer damage possible.', si: 'සම්පූර්ණ විදුලිබල පද්ධති බිඳවැටීමේ අවදානමක්.', ta: 'முழுமையான மின் கட்டமைப்பு முடக்கம் ஏற்படலாம்.' },
    satImpact: { en: 'Loss of operational control and rapid orbital decay.', si: 'චන්ද්‍රිකා පාලනය ගිලිහී යාමේ අවදානම.', ta: 'செயற்கைக்கோள் கட்டுப்பாடு இழப்பு மற்றும் சுற்றுப்பாதை சரிவு.' },
    mitigationTip: { en: 'Disconnect long transmission lines and secure ground grids.', si: 'දිගු සම්ප්‍රේෂණ රැහැන් විසන්ධි කර ආරක්ෂිත පියවර ගන්න.', ta: 'நீண்ட மின் விநியோக கம்பிகளை துண்டிக்கவும்.' }
  }
};

export function SolarWeatherAlertCard({ className = '' }) {
  const { lang, t } = useTrilingual();
  const [kpIndex, setKpIndex] = useState(3.4);
  const [solarWindSpeed, setSolarWindSpeed] = useState(480);

  const activeScale = useMemo(() => {
    const roundedKp = Math.floor(kpIndex);
    if (roundedKp >= 9) return NOAA_SCALES[9];
    if (roundedKp >= 8) return NOAA_SCALES[8];
    if (roundedKp >= 7) return NOAA_SCALES[7];
    if (roundedKp >= 6) return NOAA_SCALES[6];
    if (roundedKp >= 5) return NOAA_SCALES[5];
    return NOAA_SCALES[0];
  }, [kpIndex]);

  const activeTitle = activeScale.title[lang] || activeScale.title.en;
  const activeGrid = activeScale.gridImpact[lang] || activeScale.gridImpact.en;
  const activeSat = activeScale.satImpact[lang] || activeScale.satImpact.en;
  const activeMitigation = activeScale.mitigationTip[lang] || activeScale.mitigationTip.en;

  return (
    <LiquidGlassCard 
      className={`px-5 py-4 max-h-[250px] space-y-3 font-sans ${className}`}
      edgeHighlight={true}
      hoverable={true}
      padding="py-4 px-5"
    >
      {/* Header with Live Pulsing Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div 
            className="p-2 rounded-xl flex items-center justify-center shadow-lg transition-colors shrink-0"
            style={{ backgroundColor: `${activeScale.color}20`, color: activeScale.color }}
          >
            <Sun className="w-5 h-5 animate-spin" style={{ animationDuration: '24s' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Orbitron'] font-bold text-white text-sm md:text-base leading-tight">
                NASA DONKI Space Weather Alert
              </h3>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Planetary Kp Geomagnetic Storm Index & Aurora Forecast
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border shadow-md"
            style={{
              backgroundColor: `${activeScale.color}18`,
              color: activeScale.color,
              borderColor: `${activeScale.color}50`,
              boxShadow: `0 0 16px ${activeScale.glow}`
            }}
          >
            {activeScale.scale}
          </span>
        </div>
      </div>

      {/* Main Content with Scroll Container */}
      <div className="overflow-y-auto max-h-[140px] space-y-2.5 pr-1 text-xs">
        {/* Main Alert Banner */}
        <div 
          className="p-2.5 rounded-xl border transition-all duration-500 space-y-1 apple-liquid-glass"
          style={{
            backgroundColor: `${activeScale.color}10`,
            borderColor: `${activeScale.color}35`
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-['Orbitron'] text-xs font-bold text-white tracking-wide">
              {activeTitle}
            </span>
            <span className="font-mono text-xs font-bold" style={{ color: activeScale.color }}>
              Kp = {kpIndex.toFixed(1)} / 9.0
            </span>
          </div>
          <p className="text-[11px] text-slate-300 font-mono leading-relaxed">
            Aurora Visibility Threshold: <strong className="text-white">{activeScale.auroraLat}</strong>
          </p>
        </div>

        {/* Real-Time Telemetry Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
          <div className="p-2 rounded-xl apple-liquid-glass">
            <span className="text-slate-400 block text-[9px] uppercase">Solar Wind</span>
            <span className="text-cyan-300 font-bold text-xs">{solarWindSpeed} km/s</span>
          </div>

          <div className="p-2 rounded-xl apple-liquid-glass">
            <span className="text-slate-400 block text-[9px] uppercase">Power Grid</span>
            <span className="text-slate-200 font-medium text-[11px] leading-tight block truncate">{activeGrid}</span>
          </div>

          <div className="p-2 rounded-xl apple-liquid-glass">
            <span className="text-slate-400 block text-[9px] uppercase">Satellite Link</span>
            <span className="text-slate-200 font-medium text-[11px] leading-tight block truncate">{activeSat}</span>
          </div>
        </div>

        {/* Critical Mitigation Protocols */}
        <div className="p-2.5 rounded-xl bg-indigo-950/25 border border-indigo-500/25 font-mono text-xs space-y-1">
          <span className="text-indigo-300 font-bold text-[10px] flex items-center gap-1">
            <Zap className="w-3 h-3 text-indigo-400" />
            Recommended Operational Mitigation:
          </span>
          <p className="text-slate-200 text-xs leading-relaxed">
            {activeMitigation}
          </p>
        </div>
      </div>
    </LiquidGlassCard>
  );
}

export default SolarWeatherAlertCard;
