'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { SupportedLanguage } from '../i18n/translations';
import { Sparkles, Radio, Orbit, Compass, Rocket, Newspaper, Bot, Bookmark } from 'lucide-react';

interface PulsarLoaderProps {
  targetTab: string;
  lang: SupportedLanguage;
}

const TAB_STATUS_MESSAGES: Record<string, Record<SupportedLanguage, { title: string; subtitle: string; icon: any }>> = {
  apod: {
    en: { title: 'Aligning Deep Space Optical Sensors', subtitle: 'Retrieving NASA Astronomy Picture of the Day & Gemini AI Translation', icon: Compass },
    si: { title: 'ගැඹුරු අභ්‍යවකාශ නිරීක්ෂණ සංවේදක පෙළගස්වමින්', subtitle: 'නාසා දවසේ තාරකා ඡායාරූපය සහ Gemini AI පරිවර්තනය ලබාගනී', icon: Compass },
    ta: { title: 'ஆழ விண்வெளி ஒளியியல் உணரிகளுடன் இணைகிறது', subtitle: 'நாசாவின் நாளின் வானியல் படம் & AI மொழிபெயர்ப்பு பெறப்படுகிறது', icon: Compass }
  },
  '3d': {
    en: { title: 'Calibrating 3D Orbital Coordinates', subtitle: 'Initializing WebGL Three.js Celestial Gravity Simulator', icon: Orbit },
    si: { title: 'ත්‍රිමාන කක්ෂීය ඛණ්ඩාංක ක්‍රමාංකනය කරමින්', subtitle: 'Three.js ත්‍රිමාන අභ්‍යවකාශගාරය සූදානම් කෙරේ', icon: Orbit },
    ta: { title: '3D சுற்றுப்பாதை ஆயங்களை அளவிடுகிறது', subtitle: 'WebGL 3D விண்வெளி ஆய்வகம் துவங்குகிறது', icon: Orbit }
  },
  missions: {
    en: { title: 'Downloading NASA Deep Space Network Telemetry', subtitle: 'Fetching Apollo, Artemis, Webb & Mars Rover Flight Trajectories', icon: Rocket },
    si: { title: 'ගැඹුරු අභ්‍යවකාශ ජාල (DSN) ටෙලිමෙට්‍රි දත්ත බාගනිමින්', subtitle: 'ඇපලෝ, ආටෙමිස්, ජේම්ස් වෙබ් සහ රෝවර් පියාසැරි දත්ත සකසයි', icon: Rocket },
    ta: { title: 'நாசா ஆழ விண்வெளி தொலைநிலை அளவீடுகளைப் பெறுகிறது', subtitle: 'அப்பல்லோ, ஆர்ட்டெமிஸ் மற்றும் வெப் பயணத் தகவல்கள் ஏற்றப்படுகின்றன', icon: Rocket }
  },
  news: {
    en: { title: 'Tuning Live Satellite News Frequency', subtitle: 'Synchronizing NASA RSS Press Releases & Dynamic Multilingual Feed', icon: Newspaper },
    si: { title: 'සජීවී චන්ද්‍රිකා පුවත් තරංග සංඛ්‍යාත සම්බන්ධ කරමින්', subtitle: 'නාසා නවතම නිල මාධ්‍ය නිවේදන සහ පරිවර්තන සමමුහුර්ත කරයි', icon: Newspaper },
    ta: { title: 'செயற்கைக்கோள் நேரலை செய்தி அலைவரிசையை இணைக்கிறது', subtitle: 'நாசாவின் புதிய பத்திரிகை செய்திகள் பெறப்படுகின்றன', icon: Newspaper }
  },
  assistant: {
    en: { title: 'Awakening Gemini & Deep Space AI Neural Core', subtitle: 'Establishing low-latency WebSocket connection to AI engines', icon: Bot },
    si: { title: 'Gemini AI ස්නායුක මධ්‍යස්ථානය සක්‍රිය කරමින්', subtitle: 'අභ්‍යවකාශ සහකරු වෙත සජීවී සබඳතාව ගොඩනගයි', icon: Bot },
    ta: { title: 'Gemini AI விண்வெளி நரம்பியல் மையத்தை இயக்குகிறது', subtitle: 'AI விண்வெளி உதவியாளருடன் நேரடி தொடர்பு துவங்குகிறது', icon: Bot }
  },
  saved: {
    en: { title: 'Accessing Secure Celestial Mission Log', subtitle: 'Decrypting locally preserved cosmic artifacts & bookmarks', icon: Bookmark },
    si: { title: 'සුරැකි තාරකා වාර්තා පිරික්සමින්', subtitle: 'ඔබගේ ප්‍රියතම අභ්‍යවකාශ මතකයන් හා ඡායාරූප පූරණය කෙරේ', icon: Bookmark },
    ta: { title: 'சேமிக்கப்பட்ட விண்வெளிப் பதிவுகளைத் திறக்கிறது', subtitle: 'உள்ளூரில் சேமிக்கப்பட்ட தகவல்கள் பெறப்படுகின்றன', icon: Bookmark }
  }
};

export default function PulsarLoader({ targetTab, lang = 'en' }: PulsarLoaderProps) {
  const currentLang = (lang || 'en') as SupportedLanguage;
  const statusInfo = TAB_STATUS_MESSAGES[targetTab]?.[currentLang] || TAB_STATUS_MESSAGES.apod[currentLang];
  const IconComponent = statusInfo.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="relative min-h-[380px] w-full rounded-3xl overflow-hidden border border-cyan-500/30 bg-gradient-to-b from-[#060a14]/90 via-[#0B0F19]/95 to-[#060a14]/90 backdrop-blur-2xl shadow-2xl flex flex-col items-center justify-center p-8 text-center"
    >
      {/* Background Deep Space Ambient Nebula Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/15 rounded-full blur-[80px]" />
      </div>

      {/* Spinning Glowing Cosmic Pulsar Container */}
      <div className="relative w-44 h-44 flex items-center justify-center my-4">
        
        {/* Pulsing Radio Emission Waves */}
        {[0, 0.7, 1.4].map((delay, idx) => (
          <motion.div
            key={idx}
            className="absolute rounded-full border border-cyan-400/40"
            initial={{ width: 40, height: 40, opacity: 0.8 }}
            animate={{ width: [40, 160], height: [40, 160], opacity: [0.8, 0] }}
            transition={{
              repeat: Infinity,
              duration: 2.2,
              delay,
              ease: 'easeOut'
            }}
          />
        ))}

        {/* 3D Magnetic Orbital Rings (Accretion Disc) */}
        <motion.div
          className="absolute w-36 h-36 rounded-full border border-dashed border-cyan-400/50 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
          style={{ transform: 'rotateX(68deg) rotateY(15deg)' }}
          animate={{ rotateZ: 360 }}
          transition={{ repeat: Infinity, duration: 4.5, ease: 'linear' }}
        >
          {/* Orbital Charged Particle */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,1)]" />
        </motion.div>

        <motion.div
          className="absolute w-28 h-28 rounded-full border border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
          style={{ transform: 'rotateX(72deg) rotateY(-25deg)' }}
          animate={{ rotateZ: -360 }}
          transition={{ repeat: Infinity, duration: 3.2, ease: 'linear' }}
        >
          {/* Second Orbital Particle */}
          <div className="absolute bottom-0 right-1/4 w-2 h-2 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,1)]" />
        </motion.div>

        {/* Relativistic Polar Jet Beams */}
        <motion.div 
          className="absolute w-1.5 h-32 bg-gradient-to-t from-cyan-400 via-blue-400 to-transparent rounded-full shadow-[0_0_12px_rgba(34,211,238,0.8)] -top-6"
          animate={{ opacity: [0.6, 1, 0.6], scaleY: [0.9, 1.1, 0.9] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
        />
        <motion.div 
          className="absolute w-1.5 h-32 bg-gradient-to-b from-cyan-400 via-blue-400 to-transparent rounded-full shadow-[0_0_12px_rgba(34,211,238,0.8)] -bottom-6"
          animate={{ opacity: [0.6, 1, 0.6], scaleY: [0.9, 1.1, 0.9] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
        />

        {/* Ultra-Dense Spinning Pulsar Core */}
        <motion.div
          className="relative z-10 w-12 h-12 rounded-full bg-gradient-to-tr from-white via-cyan-200 to-blue-500 shadow-[0_0_30px_rgba(34,211,238,1),0_0_60px_rgba(99,102,241,0.8)] flex items-center justify-center p-0.5"
          animate={{ rotate: 360, scale: [0.95, 1.08, 0.95] }}
          transition={{
            rotate: { repeat: Infinity, duration: 1.5, ease: 'linear' },
            scale: { repeat: Infinity, duration: 1.2, ease: 'easeInOut' }
          }}
        >
          <div className="w-full h-full rounded-full bg-gradient-to-br from-white via-cyan-100 to-cyan-300 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,1)]" />
          </div>
        </motion.div>
      </div>

      {/* Telemetry Status & Target Tab Indicator */}
      <div className="relative z-10 mt-2 space-y-2 max-w-md">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold">
          <IconComponent className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="tracking-wider uppercase">PULSAR TELEMETRY SYNC</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
        </div>

        <h3 className="text-base sm:text-lg font-bold text-white font-['Orbitron'] tracking-wide">
          {statusInfo.title}
        </h3>

        <p className="text-xs text-slate-400 font-mono leading-relaxed">
          {statusInfo.subtitle}
        </p>

        {/* Progress Bar Indicator */}
        <div className="w-48 h-1 bg-slate-800 rounded-full mx-auto overflow-hidden mt-3">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 rounded-full"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
