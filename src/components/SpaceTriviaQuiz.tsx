'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Sparkles, 
  HelpCircle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ArrowRight, 
  Zap, 
  Flame, 
  Award, 
  BrainCircuit, 
  Compass,
  Rocket
} from 'lucide-react';
import { SupportedLanguage } from '../i18n/translations';
import { CosmicConfetti } from './CosmicConfetti';

interface Question {
  id: string | number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface SpaceTriviaQuizProps {
  lang: SupportedLanguage;
  className?: string;
}

// Trilingual Pre-seeded Master Question Pool for Instant Zero-Lag Play
const TRILINGUAL_QUESTIONS: Record<SupportedLanguage, Question[]> = {
  en: [
    {
      id: 1,
      question: "Which landmark NASA space telescope discovered thousands of exoplanets using the transit photometry method?",
      options: ["Hubble Space Telescope", "Kepler Space Telescope", "James Webb Space Telescope", "Spitzer Space Telescope"],
      correctIndex: 1,
      explanation: "Launched in 2009, NASA's Kepler Space Telescope revolutionized astrophysics by discovering over 2,600 confirmed planets orbiting distant stars.",
      category: "Exoplanets",
      difficulty: "easy"
    },
    {
      id: 2,
      question: "What is the primary scientific destination and target of NASA's historic Artemis III mission?",
      options: ["Mars Olympus Mons", "Lunar South Pole", "Jupiter's Moon Europa", "Asteroid Psyche"],
      correctIndex: 1,
      explanation: "Artemis III will land the first woman and next person on the Moon near the Lunar South Pole, where permanently shadowed craters harbor billions of tons of water ice.",
      category: "Moon Exploration",
      difficulty: "medium"
    },
    {
      id: 3,
      question: "How long does it take for radio signals emitted from the Mars Perseverance rover to reach NASA deep space ground stations on Earth?",
      options: ["Instantaneous (< 1 sec)", "3 to 22 minutes (depending on orbital alignment)", "Around 2 hours", "Roughly 24 hours"],
      correctIndex: 1,
      explanation: "Depending on the positions of Earth and Mars along their elliptical orbits, the one-way light communication delay ranges between 3 and 22 minutes.",
      category: "Mars Missions",
      difficulty: "medium"
    },
    {
      id: 4,
      question: "Which spacecraft is currently the farthest human-made object from Earth in interstellar space?",
      options: ["New Horizons", "Voyager 1", "Pioneer 10", "Voyager 2"],
      correctIndex: 1,
      explanation: "Launched in 1977, Voyager 1 crossed into interstellar space in August 2012 and is currently over 24 billion kilometers (160+ AU) away from Earth.",
      category: "Deep Space",
      difficulty: "hard"
    },
    {
      id: 5,
      question: "What is the key instrument aboard the James Webb Space Telescope that allows it to peer through opaque cosmic dust clouds?",
      options: ["Ultraviolet Spectrometer", "Infrared Camera & Spectrographs (NIRCam & MIRI)", "X-Ray Polarimeter", "Gamma-Ray Detector"],
      correctIndex: 1,
      explanation: "JWST operates in the near and mid-infrared spectrum, allowing infrared photons to penetrate dense cosmic dust clouds that block visible light.",
      category: "Observatories",
      difficulty: "medium"
    }
  ],
  si: [
    {
      id: 1,
      question: "සංක්‍රාන්ති ඡායාරූපමිතික ක්‍රමය මඟින් සෞරග්‍රහ මණ්ඩලයෙන් පරිබාහිර ග්‍රහලෝක දහස් ගණනක් සොයාගත් නාසා දුරේක්ෂය කුමක්ද?",
      options: ["හබල් අභ්‍යවකාශ දුරේක්ෂය", "කෙප්ලර් අභ්‍යවකාශ දුරේක්ෂය", "ජේම්ස් වෙබ් දුරේක්ෂය", "ස්පිට්සර් අභ්‍යවකාශ දුරේක්ෂය"],
      correctIndex: 1,
      explanation: "2009 දී දියත් කළ කෙප්ලර් දුරේක්ෂය ඈත තාරකා වටා භ්‍රමණය වන තහවුරු කළ ග්‍රහලෝක 2,600 කට වඩා සොයා ගත්තේය.",
      category: "පරිබාහිර ග්‍රහලෝක",
      difficulty: "easy"
    },
    {
      id: 2,
      question: "නාසා ආයතනයේ ඓතිහාසික ආටෙමිස් III (Artemis III) මෙහෙයුමේ මූලික ගොඩබැසීමේ ඉලක්කය කුමක්ද?",
      options: ["අඟහරුගේ ඔලිම්පස් මොන්ස්", "චන්ද්‍රයාගේ දක්ෂිණ ධ්‍රැවය", "යුරෝපා චන්ද්‍රයා", "සයිකි ග්‍රහකය"],
      correctIndex: 1,
      explanation: "ආටෙමිස් III මෙහෙයුම මගින් ජල අයිස් සංචිත ඇති සඳෙහි දක්ෂිණ ධ්‍රැවය ආසන්නයට ගගනගාමීන් ගොඩබස්වනු ඇත.",
      category: "චන්ද්‍ර ගවේෂණය",
      difficulty: "medium"
    },
    {
      id: 3,
      question: "අඟහරු මත ඇති Perseverance රෝවරයේ සිට පෘථිවියට රේඩියෝ සංඥාවක් ළඟාවීමට සාමාන්‍යයෙන් කොපමණ කාලයක් ගතවේද?",
      options: ["තත්පර 1 කට අඩුය", "මිනිත්තු 3 සිට 22 දක්වා (කක්ෂ පිහිටීම අනුව)", "පැය 2 ක් පමණ", "පැය 24 ක් පමණ"],
      correctIndex: 1,
      explanation: "පෘථිවිය සහ අඟහරු අතර දුර වෙනස් වීම අනුව එක් දිශාවක සංඥා ගමනට මිනිත්තු 3 සිට 22 දක්වා කාලයක් ගතවේ.",
      category: "අඟහරු මෙහෙයුම්",
      difficulty: "medium"
    },
    {
      id: 4,
      question: "අන්තර්තාරකා අවකාශයේ පෘථිවියේ සිට වඩාත්ම ඈතින් පිහිටි මිනිසා විසින් සාදන ලද අභ්‍යවකාශ යානය කුමක්ද?",
      options: ["නිව් හොරයිසන්ස්", "වොයේජර් 1 (Voyager 1)", "පයනියර් 10", "වොයේජර් 2"],
      correctIndex: 1,
      explanation: "1977 දී දියත් කළ Voyager 1 යානය 2012 දී අන්තර්තාරකා අවකාශයට ඇතුළු වූ අතර එය දැනට කිලෝමීටර් බිලියන 24 කට වඩා ඈතින් පවතී.",
      category: "ගැඹුරු අභ්‍යවකාශය",
      difficulty: "hard"
    }
  ],
  ta: [
    {
      id: 1,
      question: "ஆயிரக்கணக்கான புறக்கோள்களைக் கண்டறிந்த நாசாவின் விண்வெளித் தொலைநோக்கி எது?",
      options: ["ஹப்பிள் தொலைநோக்கி", "கெப்லர் தொலைநோக்கி", "ஜேம்ஸ் வெப் தொலைநோக்கி", "ஸ்பிட்சர் தொலைநோக்கி"],
      correctIndex: 1,
      explanation: "2009 இல் ஏவப்பட்ட கெப்லர் தொலைநோக்கி 2,600 க்கும் மேற்பட்ட உறுதிப்படுத்தப்பட்ட புறக்கோள்களைக் கண்டறிந்தது.",
      category: "புறக்கோள்கள்",
      difficulty: "easy"
    },
    {
      id: 2,
      question: "நாசாவின் வரலாற்றுச் சிறப்புமிக்க ஆர்ட்டிமிஸ் III (Artemis III) திட்டத்தின் முக்கிய இலக்கு எது?",
      options: ["செவ்வாய் ஒலிம்பஸ் மான்ஸ்", "நிலவின் தென் துருவம்", "வியாழனின் நிலவு யூரோபா", "சைக்கி சிறுகோள்"],
      correctIndex: 1,
      explanation: "ஆர்ட்டிமிஸ் III விண்வெளி வீரர்கள் உறைந்த பனிக்கட்டி படிவுகள் நிறைந்த நிலவின் தென் துருவத்தில் தரையிறங்குவர்.",
      category: "நிலவு ஆய்வு",
      difficulty: "medium"
    },
    {
      id: 3,
      question: "செவ்வாயில் உள்ள பெர்சவரன்ஸ் ரோவரில் இருந்து பூமிக்கு ரேடியோ சமிக்கைகள் வர எவ்வளவு நேரம் ஆகும்?",
      options: ["1 வினாடிக்கும் குறைவு", "3 முதல் 22 நிமிடங்கள் வரை (சுற்றுப்பாதை நிலையைப் பொறுத்து)", "சுமார் 2 மணிநேரம்", "சுமார் 24 மணிநேரம்"],
      correctIndex: 1,
      explanation: "பூமி மற்றும் செவ்வாய் கிரகங்களின் சுற்றுப்பாதை தூரத்தைப் பொறுத்து சமிக்கை வர 3 முதல் 22 நிமிடங்கள் வரை ஆகும்.",
      category: "செவ்வாய் ஆய்வு",
      difficulty: "medium"
    },
    {
      id: 4,
      question: "விண்வெளியில் பூமியிலிருந்து மிக தொலைவில் உள்ள மனிதனால் உருவாக்கப்பட்ட விண்கலம் எது?",
      options: ["நியூ ஹொரைசன்ஸ்", "வாயேஜர் 1 (Voyager 1)", "பயனியர் 10", "வாயேஜர் 2"],
      correctIndex: 1,
      explanation: "1977 இல் ஏவப்பட்ட வாயேஜர் 1 விண்கலம் தற்போது பூமியிலிருந்து 24 பில்லியன் கிலோமீட்டருக்கும் அதிகமான தொலைவில் உள்ளது.",
      category: "ஆழ விண்வெளி",
      difficulty: "hard"
    }
  ]
};

const UI_TEXT = {
  en: {
    title: "Cosmic Space Trivia",
    subtitle: "Test your astrophysics & NASA mission knowledge with AI generated challenges",
    question: "Question",
    of: "of",
    score: "Score",
    streak: "Streak",
    accuracy: "Accuracy",
    correct: "Supernova! Correct Answer!",
    incorrect: "Orbital Decay! Incorrect.",
    explanation: "Mission Debrief",
    nextBtn: "Next Question",
    finishBtn: "View Final Results",
    playAgain: "Launch New Mission",
    greatJob: "Galactic Commander Rank Achieved!",
    highScore: "High Score",
    aiPowered: "Gemini AI Space Engine"
  },
  si: {
    title: "අභ්‍යවකාශ දැනුම මිනුම",
    subtitle: "තාරකා විද්‍යාව සහ නාසා මෙහෙයුම් පිළිබඳ ඔබේ දැනුම පරීක්ෂා කරන්න",
    question: "ප්‍රශ්නය",
    of: "න්",
    score: "ලකුණු",
    streak: "ජයග්‍රාහී පෙළ",
    accuracy: "නිරවද්‍යතාව",
    correct: "විශිෂ්ටයි! නිවැරදි පිළිතුරකි!",
    incorrect: "පිළිතුර වැරදියි.",
    explanation: "විද්‍යාත්මක පැහැදිලි කිරීම",
    nextBtn: "ඊළඟ ප්‍රශ්නය",
    finishBtn: "අවසාන ප්‍රතිඵල",
    playAgain: "නැවත ආරම්භ කරන්න",
    greatJob: "විශිෂ්ට අභ්‍යවකාශ ගවේෂක ශ්‍රේණිය!",
    highScore: "උපරිම ලකුණු",
    aiPowered: "Gemini AI බුද්ධිමය පද්ධතිය"
  },
  ta: {
    title: "விண்வெளி வினாடி வினா",
    subtitle: "வானியற்பியல் மற்றும் நாசா திட்டங்கள் பற்றிய உங்கள் அறிவை சோதிக்கவும்",
    question: "கேள்வி",
    of: "இல்",
    score: "மதிப்பெண்",
    streak: "தொடர் வெற்றி",
    accuracy: "துல்லியம்",
    correct: "அற்புதம்! சரியான பதில்!",
    incorrect: "தவறான பதில்.",
    explanation: "அறிவியல் விளக்கம்",
    nextBtn: "அடுத்த கேள்வி",
    finishBtn: "இறுதி முடிவுகள்",
    playAgain: "மீண்டும் விளையாடுக",
    greatJob: "விண்வெளி தளபதி தரவரிசை!",
    highScore: "அதிகபட்ச மதிப்பெண்",
    aiPowered: "Gemini AI இயக்கவியல்"
  }
};

export const SpaceTriviaQuiz: React.FC<SpaceTriviaQuizProps> = ({
  lang = 'en',
  className = ''
}) => {
  const t = UI_TEXT[lang] || UI_TEXT.en;
  const questionPool = TRILINGUAL_QUESTIONS[lang] || TRILINGUAL_QUESTIONS.en;

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [maxStreak, setMaxStreak] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  
  // Confetti trigger key
  const [confettiKey, setConfettiKey] = useState<number>(0);

  // Load high score from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nasa_trivia_highscore');
      if (saved) setHighScore(parseInt(saved, 10));
    } catch {}
  }, []);

  const currentQuestion = questionPool[currentIndex] || questionPool[0];
  const progressPercent = ((currentIndex + 1) / questionPool.length) * 100;

  const handleSelectOption = (index: number) => {
    if (isAnswered) return;

    setSelectedAnswer(index);
    setIsAnswered(true);

    const isCorrect = index === currentQuestion.correctIndex;

    if (isCorrect) {
      const newScore = score + 100 + streak * 25;
      const newStreak = streak + 1;
      setScore(newScore);
      setStreak(newStreak);
      if (newStreak > maxStreak) setMaxStreak(newStreak);
      if (newScore > highScore) {
        setHighScore(newScore);
        try {
          localStorage.setItem('nasa_trivia_highscore', newScore.toString());
        } catch {}
      }
      // Trigger celebratory Confetti burst!
      setConfettiKey(Date.now());
    } else {
      setStreak(0);
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < questionPool.length) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } else {
      setIsFinished(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setScore(0);
    setStreak(0);
    setIsFinished(false);
  };

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#090D1A]/95 via-[#0D1326]/95 to-[#060812]/98 border border-slate-800/80 shadow-2xl p-6 sm:p-8 backdrop-blur-xl ${className}`}>
      
      {/* Celebratory Confetti Burst Animation on Correct Answer */}
      <CosmicConfetti triggerKey={confettiKey} count={60} originX={0.5} originY={0.4} />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/60">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-400">
              <BrainCircuit className="w-5 h-5 animate-pulse" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-['Orbitron'] text-white tracking-wide">
              {t.title}
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-500/40 text-[10px] font-mono text-indigo-300">
              <Sparkles className="w-3 h-3 text-amber-400" />
              {t.aiPowered}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            {t.subtitle}
          </p>
        </div>

        {/* Stats Pills */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400">{t.score}:</span>
            <span className="text-amber-300 font-bold">{score}</span>
          </div>

          {streak > 0 && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs font-mono text-rose-300"
            >
              <Flame className="w-4 h-4 text-rose-400 animate-bounce" />
              <span>{streak}x</span>
            </motion.div>
          )}
        </div>
      </div>

      {!isFinished ? (
        <div className="mt-6">
          {/* Progress Bar & Question Counter */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
                <Rocket className="w-3.5 h-3.5" />
                {t.question} {currentIndex + 1} {t.of} {questionPool.length}
              </span>
              <span className="text-slate-500 font-medium">
                {currentQuestion.category} • <span className="capitalize text-indigo-300">{currentQuestion.difficulty}</span>
              </span>
            </div>

            {/* Glowing Space Progress Track */}
            <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800/80 overflow-hidden relative">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Question Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Question Text */}
              <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800/90 shadow-inner">
                <h3 className="text-base sm:text-lg font-semibold text-slate-100 leading-relaxed">
                  {currentQuestion.question}
                </h3>
              </div>

              {/* 4 Multiple Choice Option Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = selectedAnswer === idx;
                  const isCorrect = idx === currentQuestion.correctIndex;
                  const showResult = isAnswered;

                  let btnStyle = "bg-slate-900/80 border-slate-800 hover:border-cyan-400/50 hover:bg-slate-800/90 text-slate-200";

                  if (showResult) {
                    if (isCorrect) {
                      btnStyle = "bg-emerald-950/80 border-emerald-400/80 text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.3)]";
                    } else if (isSelected && !isCorrect) {
                      btnStyle = "bg-rose-950/80 border-rose-500/80 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.3)]";
                    } else {
                      btnStyle = "bg-slate-950/50 border-slate-900 text-slate-500 opacity-60";
                    }
                  }

                  return (
                    <motion.button
                      key={idx}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => handleSelectOption(idx)}
                      whileHover={!isAnswered ? { scale: 1.015 } : {}}
                      whileTap={!isAnswered ? { scale: 0.98 } : {}}
                      className={`relative flex items-center justify-between text-left p-4 rounded-2xl border transition-all duration-200 font-medium text-sm group ${btnStyle}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-['Orbitron'] text-xs font-bold transition-colors ${
                          showResult && isCorrect
                            ? 'bg-emerald-500 text-slate-950'
                            : showResult && isSelected && !isCorrect
                            ? 'bg-rose-500 text-white'
                            : 'bg-slate-800 text-slate-400 group-hover:text-cyan-300 group-hover:bg-slate-700'
                        }`}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="flex-1">{option}</span>
                      </div>

                      {showResult && (
                        <div>
                          {isCorrect ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 animate-bounce" />
                          ) : isSelected ? (
                            <XCircle className="w-5 h-5 text-rose-400" />
                          ) : null}
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Mission Debrief Scientific Explanation Card */}
              {isAnswered && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-5 rounded-2xl border ${
                    selectedAnswer === currentQuestion.correctIndex
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-100'
                      : 'bg-rose-950/30 border-rose-500/40 text-rose-100'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 font-bold font-['Orbitron'] text-sm">
                    {selectedAnswer === currentQuestion.correctIndex ? (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                        <span className="text-emerald-300">{t.correct}</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-rose-400" />
                        <span className="text-rose-300">{t.incorrect}</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                    <span className="font-semibold text-white">{t.explanation}: </span>
                    {currentQuestion.explanation}
                  </p>

                  <div className="mt-4 flex justify-end">
                    <motion.button
                      type="button"
                      onClick={handleNext}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white font-bold font-['Orbitron'] text-xs shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)] transition-all cursor-pointer"
                    >
                      <span>
                        {currentIndex + 1 < questionPool.length ? t.nextBtn : t.finishBtn}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        /* Quiz Finished Victory View */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-8 text-center py-8 space-y-6"
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 p-0.5 mx-auto shadow-[0_0_30px_rgba(245,158,11,0.5)]">
            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center">
              <Award className="w-10 h-10 text-amber-400 animate-pulse" />
            </div>
          </div>

          <div>
            <h3 className="text-2xl font-bold font-['Orbitron'] text-white">
              {t.greatJob}
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              {t.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="text-xs text-slate-400 font-mono">{t.score}</div>
              <div className="text-xl font-bold text-amber-300 font-['Orbitron'] mt-1">{score}</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="text-xs text-slate-400 font-mono">{t.streak}</div>
              <div className="text-xl font-bold text-rose-300 font-['Orbitron'] mt-1">{maxStreak}x</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="text-xs text-slate-400 font-mono">{t.highScore}</div>
              <div className="text-xl font-bold text-cyan-300 font-['Orbitron'] mt-1">{highScore}</div>
            </div>
          </div>

          <div className="pt-4">
            <motion.button
              type="button"
              onClick={handleRestart}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-bold font-['Orbitron'] text-sm shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t.playAgain}</span>
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default SpaceTriviaQuiz;
