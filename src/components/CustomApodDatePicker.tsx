'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Shuffle, 
  Sparkles, 
  Rocket, 
  Clock, 
  X,
  Compass,
  Telescope
} from 'lucide-react';
import { SupportedLanguage } from '../i18n/translations';

interface CustomApodDatePickerProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  lang: SupportedLanguage;
  className?: string;
}

// Landmark Historical NASA APOD Dates
const HISTORICAL_LANDMARKS = [
  { label: { en: 'First Ever APOD (1995)', si: 'ප්‍රථම APOD ඡායාරූපය (1995)', ta: 'முதல் வானியல் படம் (1995)' }, date: '1995-06-16' },
  { label: { en: 'Webb First Deep Field (2022)', si: 'වෙබ් පළමු ගැඹුරු විශ්වය (2022)', ta: 'வெப் ஆழ விண்வெளி (2022)' }, date: '2022-07-12' },
  { label: { en: 'Pillars of Creation (2022)', si: 'මැවීමේ කුළුණු (2022)', ta: 'படைப்பின் தூண்கள் (2022)' }, date: '2022-10-21' },
  { label: { en: 'Artemis 1 Earth & Moon (2022)', si: 'ආටෙමිස් පෘථිවිය හා සඳ (2022)', ta: 'ஆர்ட்டெமிஸ் பூமி நிலவு (2022)' }, date: '2022-12-08' },
  { label: { en: 'Perseverance Mars Landing (2021)', si: 'පර්සවරන්ස් අඟහරු ගොඩබැසීම', ta: 'பெர்செவரன்ஸ் தரையிறக்கம்' }, date: '2021-02-18' },
  { label: { en: 'Cassini Saturn Arrival (2004)', si: 'කැසිනි සෙනසුරු වෙත ළඟාවීම', ta: 'காசினி சனி கோள் பயணம்' }, date: '2004-07-01' },
  { label: { en: 'Pluto Close-Up New Horizons (2015)', si: 'ප්ලූටෝ සමීප ඡායාරූපය (2015)', ta: 'புளூட்டோ படம் (2015)' }, date: '2015-07-15' },
  { label: { en: 'Hubble Ultra Deep Field (2004)', si: 'හබල් අතිශය ගැඹුරු විශ්වය', ta: 'ஹப்பிள் ஆழ விண்வெளி' }, date: '2004-03-09' }
];

const MONTH_NAMES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  si: ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'],
  ta: ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்']
};

const WEEKDAYS = {
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  si: ['ඉ', 'ස', 'අ', 'බ', 'බ්‍ර', 'සි', 'සෙ'],
  ta: ['ஞா', 'தி', 'செ', 'பு', 'வி', 'வெ', 'ச']
};

export const CustomApodDatePicker: React.FC<CustomApodDatePickerProps> = ({
  selectedDate,
  onSelectDate,
  lang,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const minDate = new Date('1995-06-16');

  // Parsed selected date components
  const parsedSelected = new Date(selectedDate || todayStr);
  const [viewYear, setViewYear] = useState<number>(parsedSelected.getFullYear() || today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(parsedSelected.getMonth() ?? today.getMonth());

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update view when selectedDate changes externally
  useEffect(() => {
    if (selectedDate) {
      const d = new Date(selectedDate);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [selectedDate]);

  // Calendar calculations
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      if (viewYear > 1995) {
        setViewYear(viewYear - 1);
        setViewMonth(11);
      }
    } else {
      const prevMonth = viewMonth - 1;
      if (viewYear === 1995 && prevMonth < 5) return; // APOD started June 1995
      setViewMonth(prevMonth);
    }
  };

  const handleNextMonth = () => {
    const isCurrentYear = viewYear === today.getFullYear();
    const isCurrentMonth = viewMonth === today.getMonth();

    if (isCurrentYear && isCurrentMonth) return;

    if (viewMonth === 11) {
      if (viewYear < today.getFullYear()) {
        setViewYear(viewYear + 1);
        setViewMonth(0);
      }
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formattedMonth = String(viewMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const newDateStr = `${viewYear}-${formattedMonth}-${formattedDay}`;

    const dateObj = new Date(newDateStr);
    if (dateObj > today || dateObj < minDate) return;

    onSelectDate(newDateStr);
    setIsOpen(false);
  };

  const handleRandomDate = () => {
    const start = minDate.getTime();
    const end = today.getTime();
    const randomDate = new Date(start + Math.random() * (end - start));
    const dateStr = randomDate.toISOString().split('T')[0];
    onSelectDate(dateStr);
    setIsOpen(false);
  };

  const handleTodayJump = () => {
    onSelectDate(todayStr);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setIsOpen(false);
  };

  // Generate years from 1995 to current
  const yearOptions: number[] = [];
  for (let y = today.getFullYear(); y >= 1995; y--) {
    yearOptions.push(y);
  }

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl apple-liquid-glass text-xs font-semibold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
        aria-label="Select NASA APOD date"
      >
        <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
          <CalendarIcon className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="text-left">
          <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block leading-none">
            {lang === 'si' ? 'දිනය තෝරන්න' : lang === 'ta' ? 'தேதியை தேர்வு செய்' : 'Archive Date'}
          </span>
          <span className="font-mono text-xs font-bold text-white tracking-wide">
            {selectedDate || todayStr}
          </span>
        </div>
      </button>

      {/* Glassmorphic Dropdown Date Picker Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
            className="absolute left-0 mt-2 z-50 w-[330px] sm:w-[360px] rounded-3xl apple-liquid-glass shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-4 sm:p-5 text-slate-200"
          >
            {/* Header Controls */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Telescope className="w-4 h-4 text-cyan-400" />
                <span className="font-['Orbitron'] text-xs font-bold text-white tracking-wide">
                  NASA APOD Archive
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Month & Year Jump Selectors */}
            <div className="flex items-center justify-between gap-2 mb-4 apple-liquid-glass p-2 rounded-2xl">
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={viewYear === 1995 && viewMonth <= 5}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4 text-cyan-400" />
              </button>

              <div className="flex items-center gap-2">
                {/* Month Dropdown */}
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                  className="bg-white/10 border border-white/20 text-white rounded-lg px-2 py-1 text-xs font-medium outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {MONTH_NAMES[lang]?.map((m, idx) => (
                    <option key={idx} value={idx} disabled={viewYear === 1995 && idx < 5} className="bg-slate-900 text-white">
                      {m}
                    </option>
                  ))}
                </select>

                {/* Year Dropdown */}
                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                  className="bg-white/10 border border-white/20 text-cyan-300 font-mono font-bold rounded-lg px-2 py-1 text-xs outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y} className="bg-slate-900 text-cyan-300">
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={viewYear === today.getFullYear() && viewMonth >= today.getMonth()}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4 text-cyan-400" />
              </button>
            </div>

            {/* Weekday Labels */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-mono text-slate-500 font-bold mb-1.5">
              {WEEKDAYS[lang]?.map((w, i) => (
                <div key={i} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Day Grid */}
            <div className="grid grid-cols-7 gap-1 text-xs font-mono mb-4">
              {/* Empty leading days */}
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div key={`empty-${idx}`} className="p-1.5" />
              ))}

              {/* Month Days */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const day = idx + 1;
                const formattedMonth = String(viewMonth + 1).padStart(2, '0');
                const formattedDay = String(day).padStart(2, '0');
                const dateStr = `${viewYear}-${formattedMonth}-${formattedDay}`;
                const dateObj = new Date(dateStr);

                const isSelected = dateStr === selectedDate;
                const isCurrentDay = dateStr === todayStr;
                const isDisabled = dateObj > today || dateObj < minDate;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    disabled={isDisabled}
                    className={`h-8 w-8 mx-auto flex items-center justify-center rounded-xl text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white font-bold shadow-lg shadow-cyan-600/40 scale-105 border border-cyan-300'
                        : isCurrentDay
                        ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-bold'
                        : isDisabled
                        ? 'text-slate-700 cursor-not-allowed opacity-30'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Landmark Historical Highlights */}
            <div className="border-t border-slate-800/80 pt-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>
                  {lang === 'si' ? 'ඓතිහාසික ප්‍රමුඛ දිනයන්:' : lang === 'ta' ? 'வரலாற்று சிறப்பு நாட்கள்:' : 'Landmark Historical Archives:'}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1 scrollbar-thin">
                {HISTORICAL_LANDMARKS.map((lm, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelectDate(lm.date);
                      setIsOpen(false);
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition border ${
                      selectedDate === lm.date
                        ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                        : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {lm.label[lang] || lm.label.en}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Action Footer */}
            <div className="border-t border-slate-800 pt-3 mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleRandomDate}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Shuffle className="w-3.5 h-3.5 text-cyan-400" />
                <span>{lang === 'si' ? 'අහඹු දිනයක්' : lang === 'ta' ? 'ரேண்டம் நாள்' : 'Random Day'}</span>
              </button>

              <button
                type="button"
                onClick={handleTodayJump}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/30 transition"
              >
                <Rocket className="w-3.5 h-3.5" />
                <span>{lang === 'si' ? 'අද දිනට' : lang === 'ta' ? 'இன்றைய படம்' : 'Today’s APOD'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
