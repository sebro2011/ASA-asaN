'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Award, 
  Clock, 
  Flame, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  ShieldCheck, 
  Trophy, 
  Rocket,
  ChevronRight,
  BrainCircuit
} from 'lucide-react';

// Dynamic Question Bank across NASA domains
const SPACE_QUESTIONS = [
  {
    id: 'q1',
    category: 'ISS Telemetry',
    question: {
      en: 'What is the average orbital velocity of the International Space Station (ISS)?',
      si: 'ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානයේ (ISS) සාමාන්‍ය කක්ෂීය වේගය කොපමණද?',
      ta: 'சர்வதேச விண்வெளி நிலையத்தின் (ISS) சராசரி சுற்றுப்பாதை வேகம் என்ன?'
    },
    options: [
      { text: { en: '11,200 km/h (3.1 km/s)', si: 'පැයට කි.මී. 11,200 (තත්පරයට කි.මී. 3.1)', ta: 'மணிக்கு 11,200 கி.மீ' }, correct: false },
      { text: { en: '27,600 km/h (7.66 km/s)', si: 'පැයට කි.මී. 27,600 (තත්පරයට කි.මී. 7.66)', ta: 'மணிக்கு 27,600 கி.மீ' }, correct: true },
      { text: { en: '40,000 km/h (11.1 km/s)', si: 'පැයට කි.මී. 40,000 (තත්පරයට කි.මී. 11.1)', ta: 'மணிக்கு 40,000 கி.மீ' }, correct: false },
      { text: { en: '5,400 km/h (1.5 km/s)', si: 'පැයට කි.මී. 5,400 (තත්පරයට කි.මී. 1.5)', ta: 'மணிக்கு 5,400 கி.மீ' }, correct: false }
    ],
    explanation: {
      en: 'The ISS orbits Earth in Low Earth Orbit at approximately 27,600 km/h, completing an orbit every 90 to 92 minutes.',
      si: 'ISS පෘථිවිය වටා පැයට කි.මී. 27,600 ක අධික වේගයෙන් ගමන් කරමින් සෑම මිනිත්තු 90-92 කට වරක් වටයක් සම්පූර්ණ කරයි.',
      ta: 'ISS மணிக்கு சுமார் 27,600 கி.மீ வேகத்தில் பூமியைச் சுற்றி, 90 முதல் 92 நிமிடங்களில் ஒரு சுற்றை நிறைவு செய்கிறது.'
    }
  },
  {
    id: 'q2',
    category: 'Mars Exploration',
    question: {
      en: 'In which Martian geological feature did NASA\'s Perseverance rover land in 2021?',
      si: '2021 දී නාසා ආයතනයේ Perseverance රෝවරය ගොඩබැස්සවූ අඟහරු මතුපිට පිහිටීම කුමක්ද?',
      ta: '2021 இல் நாசாவின் பெர்சிவரன்ஸ் ரோவர் செவ்வாய் கிரகத்தின் எந்தப் பகுதியில் தரையிறங்கியது?'
    },
    options: [
      { text: { en: 'Gale Crater', si: 'ගේල් ආවාටය (Gale Crater)', ta: 'கேல் பள்ளம் (Gale Crater)' }, correct: false },
      { text: { en: 'Jezero Crater', si: 'ජෙසෙරෝ ආවාටය (Jezero Crater)', ta: 'ஜெசெரோ பள்ளம் (Jezero Crater)' }, correct: true },
      { text: { en: 'Olympus Mons', si: 'ඔලිම්පස් මොන්ස් (Olympus Mons)', ta: 'ஒலிம்பஸ் மோன்ஸ்' }, correct: false },
      { text: { en: 'Valles Marineris', si: 'වැලිස් මැරිනරිස් (Valles Marineris)', ta: 'வால்ஸ் மரினெரிஸ்' }, correct: false }
    ],
    explanation: {
      en: 'Perseverance landed in Jezero Crater, an ancient dried river lakebed, to collect samples and search for biosignatures.',
      si: 'Perseverance ගොඩබසින ලද්දේ අතීත විලක් සහ ගංගා ඩෙල්ටාවක් වූ ජෙසෙරෝ ආවාටයටයි.',
      ta: 'பெர்சிவரன்ஸ் ரோவர் பண்டைய ஏரி படுகையான ஜெசெரோ பள்ளத்தில் நுண்ணுயிர் தடயங்களை ஆராயத் தரையிறங்கியது.'
    }
  },
  {
    id: 'q3',
    category: 'James Webb Space Telescope',
    question: {
      en: 'Where is the James Webb Space Telescope (JWST) permanently positioned in space?',
      si: 'ජේම්ස් වෙබ් දුරේක්ෂය (JWST) කක්ෂගතව ඇති ලග්‍රාන්ජ් ලක්ෂ්‍යය කුමක්ද?',
      ta: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி (JWST) எந்த புள்ளியில் நிலைநிறுத்தப்பட்டுள்ளது?'
    },
    options: [
      { text: { en: 'Low Earth Orbit (550 km)', si: 'පහළ පෘථිවි කක්ෂය (කි.මී. 550)', ta: 'பூமியின் கீழ் சுற்றுப்பாதை (550 கி.மீ)' }, correct: false },
      { text: { en: 'Moon Polar Orbit', si: 'චන්ද්‍ර ධ්‍රැවීය කක්ෂය', ta: 'நிலவு துருவ சுற்றுப்பாதை' }, correct: false },
      { text: { en: 'Sun-Earth Lagrange Point 2 (L2)', si: 'සූර්ය-පෘථිවි ලග්‍රාන්ජ් ලක්ෂ්‍ය 2 (L2)', ta: 'சூரிய-பூமி லக்ராஞ்ச் புள்ளி 2 (L2)' }, correct: true },
      { text: { en: 'Sun-Earth Lagrange Point 1 (L1)', si: 'සූර්ය-පෘථිවි ලග්‍රාන්ජ් ලක්ෂ්‍ය 1 (L1)', ta: 'சூரிய-பூமி லக்ராஞ்ச் புள்ளி 1 (L1)' }, correct: false }
    ],
    explanation: {
      en: 'JWST orbits the Sun at Lagrange Point 2 (L2), approximately 1.5 million km from Earth, keeping its sunshield facing the Sun, Earth, and Moon.',
      si: 'JWST පෘථිවියේ සිට කිලෝමීටර මිලියන 1.5 ක් ඈතින් පිහිටි ලග්‍රාන්ජ් 2 (L2) ලක්ෂ්‍යයේ කක්ෂගතව ඇත.',
      ta: 'JWST பூமியிலிருந்து 1.5 மில்லியன் கி.மீ தொலைவில் உள்ள லக்ராஞ்ச் 2 (L2) புள்ளியில் சூரியனைச் சுற்றி வருகிறது.'
    }
  },
  {
    id: 'q4',
    category: 'Planetary Defense',
    question: {
      en: 'What historic mission proved humanity can alter an asteroid\'s orbit via kinetic impact?',
      si: 'ග්‍රහකයක කක්ෂය චාලක බලපෑමකින් වෙනස් කළ හැකි බව ඔප්පු කළ ඓතිහාසික නාසා මෙහෙයුම කුමක්ද?',
      ta: 'மோதல் மூலம் ஒரு சிறுகோளின் சுற்றுப்பாதையை மாற்ற முடியும் என்பதை நிரூபித்த நாசா திட்டம் எது?'
    },
    options: [
      { text: { en: 'OSIRIS-REx', si: 'OSIRIS-REx මෙහෙයුම', ta: 'ஒசைரிஸ்-ரெக்ஸ் (OSIRIS-REx)' }, correct: false },
      { text: { en: 'DART Mission', si: 'DART මෙහෙයුම', ta: 'டார்ட் திட்டம் (DART Mission)' }, correct: true },
      { text: { en: 'New Horizons', si: 'නිව් හොරයිසන්ස් (New Horizons)', ta: 'நியூ ஹொரைசன்ஸ்' }, correct: false },
      { text: { en: 'Lucy Mission', si: 'ලුසී මෙහෙයුම (Lucy Mission)', ta: 'லூசி திட்டம்' }, correct: false }
    ],
    explanation: {
      en: 'In 2022, NASA\'s DART collided with asteroid Dimorphos, altering its orbital period by 33 minutes and proving planetary defense works!',
      si: '2022 දී DART යානය ඩයිමෝෆෝස් ග්‍රහකයේ සාර්ථකව ගැටී මිනිත්තු 33 කින් එහි කක්ෂීය කාලය වෙනස් කළේය.',
      ta: '2022 இல் நாசாவின் DART விண்கலம் டைமார்போஸ் சிறுகோள் மீது மோதி அதன் சுற்றுப்பாதையை வெற்றிகரமாக மாற்றியது.'
    }
  },
  {
    id: 'q5',
    category: 'Exoplanets & Habitable Worlds',
    question: {
      en: 'How many confirmed exoplanets have astronomers discovered and cataloged to date?',
      si: 'තාරකා විද්‍යාඥයින් විසින් මේ වන විට තහවුරු කර ඇති බාහිර ග්‍රහලෝක සංඛ්‍යාව දළ වශයෙන් කොපමණද?',
      ta: 'வானியலாளர்களால் இதுவரை கண்டுபிடிக்கப்பட்டு உறுதிப்படுத்தப்பட்ட புறக்கோள்களின் எண்ணிக்கை என்ன?'
    },
    options: [
      { text: { en: 'Over 5,600 exoplanets', si: 'ග්‍රහලෝක 5,600 කට වඩා', ta: '5,600 க்கும் மேற்பட்ட புறக்கோள்கள்' }, correct: true },
      { text: { en: 'Around 800 exoplanets', si: 'ග්‍රහලෝක 800 ක් පමණ', ta: 'சுமார் 800 புறக்கோள்கள்' }, correct: false },
      { text: { en: 'Exactly 240 exoplanets', si: 'ග්‍රහලෝක 240 ක්', ta: 'சரியாக 240 புறக்கோள்கள்' }, correct: false },
      { text: { en: 'Over 100,000 exoplanets', si: 'ග්‍රහලෝක 100,000 කට වඩා', ta: '100,000 க்கும் மேற்பட்டவை' }, correct: false }
    ],
    explanation: {
      en: 'The NASA Exoplanet Archive has cataloged over 5,600 confirmed worlds orbiting other stars across the Milky Way.',
      si: 'නාසා බාහිර ග්‍රහලෝක ලේඛනාගාරය විසින් තහවුරු කරන ලද ග්‍රහලෝක 5,600 කට වඩා ලැයිස්තුගත කර ඇත.',
      ta: 'நாசா புறக்கோள் காப்பகத்தில் 5,600 க்கும் மேற்பட்ட உறுதிப்படுத்தப்பட்ட வேற்று கிரகங்கள் பதிவு செய்யப்பட்டுள்ளன.'
    }
  }
];

export default function SpaceQuizModule({ lang = 'en', className = '' }) {
  const currentLang = (lang || 'en').slice(0, 2);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isGameOver, setIsGameOver] = useState(false);

  // High score in localStorage
  const [highScore, setHighScore] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('nasa_space_quiz_high_score') || '0', 10);
    }
    return 0;
  });

  const timerRef = useRef(null);
  const currentQ = SPACE_QUESTIONS[currentIndex] || SPACE_QUESTIONS[0];

  // Answer selection handler
  const handleSelectOption = useCallback((option) => {
    if (isAnswered || isGameOver) return;

    if (timerRef.current) clearInterval(timerRef.current);
    setSelectedOption(option);
    setIsAnswered(true);

    if (option.correct) {
      setScore(prev => prev + 100 + timeLeft * 10);
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
    }
  }, [isAnswered, isGameOver, timeLeft]);

  // Advance to next question or complete game
  const handleNextQuestion = () => {
    if (currentIndex + 1 < SPACE_QUESTIONS.length) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setTimeLeft(15);
    } else {
      // Game over
      setIsGameOver(true);
      setHighScore(prev => {
        const newHigh = Math.max(prev, score);
        if (typeof window !== 'undefined') {
          localStorage.setItem('nasa_space_quiz_high_score', String(newHigh));
        }
        return newHigh;
      });
    }
  };

  // Restart quiz
  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setStreak(0);
    setTimeLeft(15);
    setIsGameOver(false);
  };

  // Timer countdown
  useEffect(() => {
    if (isAnswered || isGameOver) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setIsAnswered(true);
          setStreak(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [currentIndex, isAnswered, isGameOver]);

  // Rank Badge based on score
  const getRankBadge = (finalScore) => {
    if (finalScore >= 1000) {
      return { title: 'NASA Flight Director', tag: 'LEGENDARY', color: 'from-amber-400 to-rose-500' };
    }
    if (finalScore >= 600) {
      return { title: 'Senior Astronaut', tag: 'ADVANCED', color: 'from-cyan-400 to-indigo-500' };
    }
    return { title: 'Space Cadet', tag: 'NOVICE', color: 'from-slate-400 to-cyan-500' };
  };

  const rank = getRankBadge(score);

  return (
    <div className={`w-full max-w-3xl mx-auto rounded-3xl bg-slate-950/90 border border-slate-800 p-6 shadow-2xl backdrop-blur-2xl font-sans space-y-6 select-none ${className}`}>
      
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-950/40">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-['Orbitron'] font-bold text-base sm:text-lg text-white">
              Interactive Space Quiz Module
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Telemetry & Astrophysics Knowledge Challenge
            </p>
          </div>
        </div>

        {/* Stats Pill Strip */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Streak: <b>{streak}x</b></span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-cyan-300 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-cyan-400" />
            <span>Score: <b>{score}</b></span>
          </div>
        </div>
      </div>

      {/* Main Gameplay Screen */}
      {!isGameOver ? (
        <div className="space-y-5">
          
          {/* Progress & Countdown Timer */}
          <div className="flex items-center justify-between gap-3 font-mono text-xs">
            <span className="text-cyan-400 font-bold">
              Question {currentIndex + 1} of {SPACE_QUESTIONS.length} • {currentQ.category}
            </span>

            {/* Countdown Badge */}
            <div className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 font-bold ${
              timeLeft <= 5 ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse' : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}>
              <Clock className="w-3.5 h-3.5" />
              <span>{timeLeft}s</span>
            </div>
          </div>

          {/* Question Box */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-inner">
            <h4 className="text-base sm:text-lg font-bold text-white leading-snug">
              {currentQ.question[currentLang] || currentQ.question.en}
            </h4>
          </div>

          {/* 4 Multiple Choice Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentQ.options.map((opt, idx) => {
              const optText = opt.text[currentLang] || opt.text.en;
              const isSelected = selectedOption === opt;

              let btnStyle = 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200';
              if (isAnswered) {
                if (opt.correct) {
                  btnStyle = 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-950/50';
                } else if (isSelected && !opt.correct) {
                  btnStyle = 'bg-rose-950/60 border-rose-500 text-rose-200';
                } else {
                  btnStyle = 'bg-slate-900/40 border-slate-800/40 text-slate-500 opacity-60';
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectOption(opt)}
                  disabled={isAnswered}
                  className={`p-4 rounded-2xl border text-left text-xs sm:text-sm font-medium transition cursor-pointer flex items-center justify-between gap-3 ${btnStyle}`}
                >
                  <span>{optText}</span>
                  {isAnswered && opt.correct && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  {isAnswered && isSelected && !opt.correct && (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Answer Feedback & Scientific Explanation */}
          <AnimatePresence>
            {isAnswered && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 text-xs text-slate-300 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-cyan-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Scientific Explanation:
                  </span>
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-mono font-bold flex items-center gap-1.5 transition shadow-md shadow-cyan-950/50 cursor-pointer"
                  >
                    <span>{currentIndex + 1 < SPACE_QUESTIONS.length ? 'Next Question' : 'View Results'}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <p className="leading-relaxed">
                  {currentQ.explanation[currentLang] || currentQ.explanation.en}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* Final Scorecard & Rank Screen */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-8 space-y-6"
        >
          <div className="inline-flex p-4 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-cyan-500/20 border border-cyan-500/40 shadow-2xl">
            <Trophy className="w-16 h-16 text-amber-400 animate-bounce" />
          </div>

          <div className="space-y-1">
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-bold block">
              Mission Debrief Complete
            </span>
            <h4 className="text-3xl font-black font-['Orbitron'] text-white">
              Score: {score} Points
            </h4>
            <p className="text-sm font-mono text-slate-400">
              Personal Best: {highScore} Points
            </p>
          </div>

          {/* Rank Badge Card */}
          <div className="max-w-xs mx-auto p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Awarded Commission:</span>
            <h5 className={`text-lg font-bold font-['Orbitron'] bg-gradient-to-r ${rank.color} bg-clip-text text-transparent`}>
              {rank.title}
            </h5>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-cyan-300">
              {rank.tag} RANK
            </span>
          </div>

          <button
            type="button"
            onClick={handleRestart}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-sm shadow-xl shadow-cyan-950/60 inline-flex items-center gap-2 cursor-pointer transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Launch Another Simulation</span>
          </button>
        </motion.div>
      )}
    </div>
  );
}
