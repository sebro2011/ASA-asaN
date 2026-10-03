'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Award, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  RotateCcw, 
  Trophy,
  Flame
} from 'lucide-react';
import { useTrilingual } from '../context/TrilingualProvider';
import { LiquidGlassCard } from './LiquidGlassCard.jsx';

const QUIZ_QUESTIONS = [
  {
    id: 'iss-speed',
    category: 'Orbital Mechanics',
    question: {
      en: 'What is the approximate orbital speed of the International Space Station (ISS) relative to Earth?',
      si: 'ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානයේ (ISS) කක්ෂීය වේගය ආසන්න වශයෙන් කොපමණද?',
      ta: 'சர்வதேச விண்வெளி நிலையத்தின் (ISS) தோராயமான சுற்றுப்பாதை வேகம் என்ன?'
    },
    options: {
      en: ['~12,500 km/h', '~27,600 km/h', '~54,000 km/h', '~8,800 km/h'],
      si: ['පැයට කි.මී. ~12,500', 'පැයට කි.මී. ~27,600', 'පැයට කි.මී. ~54,000', 'පැයට කි.මී. ~8,800'],
      ta: ['~12,500 கி.மீ/மணி', '~27,600 கி.மீ/மணி', '~54,000 கி.மீ/மணி', '~8,800 கி.மீ/மணி']
    },
    correctIndex: 1,
    explanation: {
      en: 'The ISS orbits at ~27,600 km/h (7.66 km/s), completing one full revolution around Earth every 90 to 92 minutes.',
      si: 'ISS මධ්‍යස්ථානය පැයට කි.මී. ~27,600 ක වේගයෙන් ගමන් කරමින් සෑම මිනිත්තු 90-92 කට වරක් පෘථිවිය වටා එක් සම්පූර්ණ වටයක් නිම කරයි.',
      ta: 'ISS சுமார் 27,600 கி.மீ/மணி வேகத்தில் பூமியைச் சுற்றி வருகிறது, ஒவ்வொரு 90-92 நிமிடங்களுக்கும் ஒரு முறை முழுமையாகச் சுற்றுகிறது.'
    }
  },
  {
    id: 'mars-atmosphere',
    category: 'Planetary Science',
    question: {
      en: 'What is the primary constituent gas of the Martian atmosphere?',
      si: 'අඟහරු ග්‍රහයාගේ වායුගෝලයේ ප්‍රධානතම සංඝටක වායුව කුමක්ද?',
      ta: 'செவ்வாய் கிரக வளிமண்டலத்தின் முதன்மையான வாயு எது?'
    },
    options: {
      en: ['Nitrogen (N2)', 'Oxygen (O2)', 'Carbon Dioxide (CO2 - 95%)', 'Methane (CH4)'],
      si: ['නයිට්‍රජන් (N2)', 'ඔක්සිජන් (O2)', 'කාබන් ඩයොක්සයිඩ් (CO2 - 95%)', 'මීතේන් (CH4)'],
      ta: ['நைட்ரஜன் (N2)', 'ஆக்ஸிஜன் (O2)', 'கார்பன் டை ஆக்சைடு (CO2 - 95%)', 'மீத்தேன் (CH4)']
    },
    correctIndex: 2,
    explanation: {
      en: 'Mars possesses a thin atmosphere composed of ~95.3% Carbon Dioxide (CO2), 2.6% Nitrogen, and 1.9% Argon.',
      si: 'අඟහරුගේ වායුගෝලයෙන් 95.3% ක්ම කාබන් ඩයොක්සයිඩ් (CO2) වන අතර ඉතා අඩු වායුගෝලීය පීඩනයක් පවතී.',
      ta: 'செவ்வாயின் வளிமண்டலத்தில் சுமார் 95.3% கார்பன் டை ஆக்சைடு உள்ளது.'
    }
  },
  {
    id: 'jwst-orbit',
    category: 'Astrophysics',
    question: {
      en: 'Around which gravitational equilibrium point does the James Webb Space Telescope (JWST) orbit?',
      si: 'ජේම්ස් වෙබ් දුරේක්ෂය (JWST) ස්ථානගත කර ඇත්තේ කුමන ගුරුත්වාකර්ෂණ ලක්ෂ්‍යය වටාද?',
      ta: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி எந்த ஈர்ப்பு சமநிலை புள்ளியைச் சுற்றி வருகிறது?'
    },
    options: {
      en: ['Sun-Earth L1', 'Sun-Earth L2 (~1.5M km)', 'Earth-Moon L4', 'Low Earth Orbit (LEO)'],
      si: ['සූර්ය-පෘථිවි L1', 'සූර්ය-පෘථිවි L2 (කි.මී. මිලියන 1.5)', 'පෘථිවි-චන්ද්‍ර L4', 'පහළ පෘථිවි කක්ෂය'],
      ta: ['சூரியன்-பூமி L1', 'சூரியன்-பூமி L2 (~1.5 மில்லியன் கி.மீ)', 'பூமி-நிலவு L4', 'குறைந்த பூமி சுற்றுப்பாதை']
    },
    correctIndex: 1,
    explanation: {
      en: 'JWST orbits the Second Lagrange Point (L2), approximately 1.5 million km beyond Earth in the anti-sunward direction.',
      si: 'JWST දුරේක්ෂය පෘථිවියේ සිට කි.මී. මිලියන 1.5 ක් ඈතින් පිහිටි දෙවන ලැග්‍රාන්ජ් ලක්ෂ්‍යය (L2) වටා කක්ෂගතව ඇත.',
      ta: 'JWST பூமியிலிருந்து சுமார் 1.5 மில்லியன் கி.மீ தொலைவிலுள்ள L2 புள்ளியைச் சுற்றி வருகிறது.'
    }
  },
  {
    id: 'pha-threshold',
    category: 'Asteroid Defense',
    question: {
      en: 'What is NASA Planetary Defense threshold diameter for a Potentially Hazardous Asteroid (PHA)?',
      si: 'නාසා ආයතනය විසින් උල්කාෂ්මයක් "අවදානම් සහිත" (PHA) ලෙස නම් කරන්නේ එහි විෂ්කම්භය කුමන අගය ඉක්මවූ විටද?',
      ta: 'நாசாவால் ஒரு சிறுகோள் "ஆபத்தானது" (PHA) என வகைப்படுத்தப்படும் குறைந்தபட்ச விட்டம் என்ன?'
    },
    options: {
      en: ['~10 meters', '~140 meters (0.14 km)', '~1,000 meters', '~5 kilometers'],
      si: ['මීටර් ~10', 'මීටර් ~140 (කි.මී. 0.14)', 'මීටර් ~1,000', 'කි.මී. ~5'],
      ta: ['~10 மீட்டர்', '~140 மீட்டர் (0.14 கி.மீ)', '~1,000 மீட்டர்', '~5 கிலோமீட்டர்']
    },
    correctIndex: 1,
    explanation: {
      en: 'NASA classifies objects larger than 140 meters with minimum orbit intersection distance (MOID) <= 0.05 AU as PHAs.',
      si: 'විෂ්කම්භය මීටර් 140 කට වඩා වැඩි සහ පෘථිවි කක්ෂයට කි.මී. මිලියන 7.5 කට වඩා ළඟා වන උල්කාෂ්ම PHA ලෙස වර්ග කෙරේ.',
      ta: '140 மீட்டருக்கும் அதிகமான மற்றும் 0.05 AU தூரத்திற்குள் வரும் சிறுகோள்கள் PHA என அழைக்கப்படுகின்றன.'
    }
  }
];

export function SmartSpaceQuiz({ className = '' }) {
  const { lang, t } = useTrilingual();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nasa_quiz_highscore');
      if (saved) setHighScore(parseInt(saved, 10));
    } catch {}
  }, []);

  const currentQ = QUIZ_QUESTIONS[currentIdx];

  const handleSelect = (idx) => {
    if (isAnswered) return;
    setSelectedAnswer(idx);
    setIsAnswered(true);

    const isCorrect = idx === currentQ.correctIndex;
    if (isCorrect) {
      const newScore = score + 100 + streak * 25;
      setScore(newScore);
      setStreak(prev => prev + 1);
      if (newScore > highScore) {
        setHighScore(newScore);
        try { localStorage.setItem('nasa_quiz_highscore', newScore.toString()); } catch {}
      }
    } else {
      setStreak(0);
    }
  };

  const handleNext = () => {
    if (currentIdx < QUIZ_QUESTIONS.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } else {
      setIsFinished(true);
    }
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setScore(0);
    setStreak(0);
    setIsFinished(false);
  };

  const getRankBadge = () => {
    const ratio = score / (QUIZ_QUESTIONS.length * 100);
    if (ratio >= 0.9) return { rank: 'NASA Flight Director 🚀', color: '#38bdf8', rankSi: 'නාසා මෙහෙයුම් අධ්‍යක්ෂක 🚀', rankTa: 'நாசா திட்ட இயக்குனர் 🚀' };
    if (ratio >= 0.6) return { rank: 'Senior Mission Specialist 🛰️', color: '#818cf8', rankSi: 'ජ්‍යෙෂ්ඨ අභ්‍යවකාශගාමී 🛰️', rankTa: 'மூத்த விண்வெளி வீரர் 🛰️' };
    return { rank: 'Cadet Astronaut 🌟', color: '#10b981', rankSi: 'ආධුනික ගවේෂක 🌟', rankTa: 'இளம் விண்வெளி ஆய்வாளர் 🌟' };
  };

  return (
    <LiquidGlassCard 
      className={`p-6 sm:p-8 font-sans space-y-6 ${className}`}
      edgeHighlight={true}
      hoverable={false}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-md">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-['Orbitron'] font-bold text-white text-base sm:text-lg">
              Smart Space Flight Quiz
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Keyless Dynamic NASA Science Evaluation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          {streak > 1 && (
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-sm">
              <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-bounce" />
              {streak}x Streak
            </span>
          )}
          <span className="px-3.5 py-1 rounded-full liquid-glass text-slate-300">
            Score: <strong className="text-cyan-300">{score}</strong>
          </span>
        </div>
      </div>

      {!isFinished ? (
        <div className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-slate-400">
              <span>Question {currentIdx + 1} of {QUIZ_QUESTIONS.length}</span>
              <span>Category: <strong className="text-indigo-300">{currentQ.category}</strong></span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-900/90 overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300 shadow-sm"
                style={{ width: `${((currentIdx + 1) / QUIZ_QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Question Prompt */}
          <h4 className="text-base sm:text-lg font-bold text-white leading-relaxed">
            {currentQ.question[lang] || currentQ.question.en}
          </h4>

          {/* Answer Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(currentQ.options[lang] || currentQ.options.en).map((opt, idx) => {
              const isSelected = selectedAnswer === idx;
              const isCorrect = idx === currentQ.correctIndex;
              let btnStyle = 'liquid-glass liquid-glass-edge liquid-glass-hover text-slate-200';

              if (isAnswered) {
                if (isCorrect) {
                  btnStyle = 'bg-emerald-950/80 border-emerald-500/80 text-emerald-200 ring-2 ring-emerald-500/30';
                } else if (isSelected && !isCorrect) {
                  btnStyle = 'bg-rose-950/80 border-rose-500/80 text-rose-200 ring-2 ring-rose-500/30';
                } else {
                  btnStyle = 'liquid-glass text-slate-500 opacity-50';
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(idx)}
                  disabled={isAnswered}
                  className={`p-4 rounded-2xl border text-left font-mono text-xs sm:text-sm font-semibold transition-all flex items-center justify-between cursor-pointer ${btnStyle}`}
                >
                  <span>{opt}</span>
                  {isAnswered && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />}
                  {isAnswered && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-rose-400 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>

          {/* Explanation Callout */}
          <AnimatePresence>
            {isAnswered && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl liquid-glass border-indigo-500/40 font-mono text-xs space-y-3"
              >
                <div className="flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <p className="text-slate-200 leading-relaxed">
                    {currentQ.explanation[lang] || currentQ.explanation.en}
                  </p>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold font-mono text-xs transition cursor-pointer shadow-lg shadow-cyan-950/40"
                  >
                    {currentIdx < QUIZ_QUESTIONS.length - 1 ? 'Next Question →' : 'Complete Flight Review'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* Final Scorecard */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-6 space-y-5"
        >
          <div className="inline-flex p-4 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-xl mb-2">
            <Award className="w-12 h-12 animate-pulse" />
          </div>

          <h3 className="font-['Orbitron'] text-2xl sm:text-3xl font-black text-white">
            Mission Debrief Complete!
          </h3>

          <div className="p-5 rounded-2xl liquid-glass max-w-sm mx-auto space-y-2 font-mono">
            <div className="text-xs text-slate-400 uppercase">Assigned Rank</div>
            <div className="text-base font-bold text-cyan-300">
              {lang === 'si' ? getRankBadge().rankSi : lang === 'ta' ? getRankBadge().rankTa : getRankBadge().rank}
            </div>
            <div className="text-3xl font-black text-white">{score} Points</div>
            <div className="text-[11px] text-slate-400">Personal Best: {highScore} pts</div>
          </div>

          <button
            type="button"
            onClick={handleRestart}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold font-mono text-xs flex items-center gap-2 mx-auto cursor-pointer transition shadow-lg shadow-cyan-950/50"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Retake Mission Quiz</span>
          </button>
        </motion.div>
      )}
    </LiquidGlassCard>
  );
}

export default SmartSpaceQuiz;
