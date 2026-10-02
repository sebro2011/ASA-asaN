'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export const TRILINGUAL_DICTIONARY = {
  en: {
    appName: 'NASA LEARN WEB',
    tagline: 'Interactive 3D Spaceflight & Keyless AI Exploration',
    mars: 'Mars',
    iss: 'International Space Station',
    sun: 'The Sun',
    earth: 'Earth',
    exoplanets: 'Exoplanets',
    asteroids: 'Near-Earth Asteroids',
    apod: 'Astronomy Picture of the Day',
    quiz: 'Space Mission Quiz',
    rotate: 'Rotate 360°',
    reset: 'Reset View',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    arView: 'View in AR / XR',
    arNotSupported: 'WebXR not supported on this browser/device',
    criticalRisk: 'Critical Risk',
    moderateRisk: 'Moderate Risk',
    lowRisk: 'Low Risk',
    soundOn: 'Cosmic Drone Active',
    soundOff: 'Audio Muted',
    voiceListening: 'Listening for voice commands...',
    voiceNotSupported: 'Web Speech API not supported in this browser'
  },
  si: {
    appName: 'නාසා ලර්න් (NASA LEARN)',
    tagline: 'ත්‍රිමාන අභ්‍යවකාශ සහ කෘත්‍රිම බුද්ධි ගවේෂණ වේදිකාව',
    mars: 'අඟහරු ග්‍රහයා',
    iss: 'ජාත්‍යන්තර අභ්‍යවකාශ මධ්‍යස්ථානය',
    sun: 'සූර්යයා',
    earth: 'පෘථිවිය',
    exoplanets: 'බාහිර ග්‍රහලෝක',
    asteroids: 'පෘථිවියට ආසන්න උල්කාෂ්ම',
    apod: 'දවසේ තාරකා විද්‍යා ඡායාරූපය',
    quiz: 'අභ්‍යවකාශ දැනුම මිනුම',
    rotate: 'අංශක 360 කැරකෙන්න',
    reset: 'දසුන යළි පිහිටුවන්න',
    zoomIn: 'විශාලනය කරන්න',
    zoomOut: 'කුඩා කරන්න',
    arView: 'AR / XR තාක්ෂණයෙන් නරඹන්න',
    arNotSupported: 'මෙම බ්‍රවුසරයේ WebXR සහාය නොදක්වයි',
    criticalRisk: 'අධි අවදානම්',
    moderateRisk: 'මධ්‍යස්ථ අවදානම්',
    lowRisk: 'අවම අවදානම්',
    soundOn: 'අභ්‍යවකාශ නාදය සක්‍රියයි',
    soundOff: 'ශබ්දය නිහඬයි',
    voiceListening: 'කටහඬ විධානයන්ට සවන් දෙමින්...',
    voiceNotSupported: 'මෙම බ්‍රවුසරයේ Web Speech API සහාය නොදක්වයි'
  },
  ta: {
    appName: 'நாசா லேர்ன் (NASA LEARN)',
    tagline: 'முப்பரிமாண விண்வெளி மற்றும் AI ஆய்வு தளம்',
    mars: 'செவ்வாய் கிரகம்',
    iss: 'சர்வதேச விண்வெளி நிலையம்',
    sun: 'சூரியன்',
    earth: 'பூமி',
    exoplanets: 'வெளிக்கோள்கள்',
    asteroids: 'பூமிக்கு அருகிலுள்ள சிறுகோள்கள்',
    apod: 'நாளின் வானியல் புகைப்படம்',
    quiz: 'விண்வெளி வினாடி வினா',
    rotate: '360° சுழற்று',
    reset: 'பார்வையை மீட்டமைக்க',
    zoomIn: 'பெரிதாக்கு',
    zoomOut: 'சிறிதாக்கு',
    arView: 'AR / XR இல் காண்க',
    arNotSupported: 'இந்த உலாவியில் WebXR ஆதரிக்கப்படவில்லை',
    criticalRisk: 'அதிக ஆபத்து',
    moderateRisk: 'மிதமான ஆபத்து',
    lowRisk: 'குறைந்த ஆபத்து',
    soundOn: 'விண்வெளி ஒலி இயக்கத்தில் உள்ளது',
    soundOff: 'ஒலி முடக்கப்பட்டது',
    voiceListening: 'குரல் கட்டளைகளுக்கு காத்திருக்கிறது...',
    voiceNotSupported: 'இந்த உலாவியில் Web Speech API ஆதரிக்கப்படவில்லை'
  }
};

const TrilingualContext = createContext({
  lang: 'en',
  setLang: (_lang) => {},
  t: (_key) => '',
  dictionary: TRILINGUAL_DICTIONARY.en
});

export const TrilingualProvider = ({ children }) => {
  const [lang, setLangState] = useState('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nasa_preferred_lang');
      if (saved && (saved === 'en' || saved === 'si' || saved === 'ta')) {
        setLangState(saved);
      }
    } catch {}
  }, []);

  const setLang = (newLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem('nasa_preferred_lang', newLang);
      document.documentElement.lang = newLang;
    } catch {}
  };

  const t = (key) => {
    const activeDict = TRILINGUAL_DICTIONARY[lang] || TRILINGUAL_DICTIONARY.en;
    return activeDict[key] || TRILINGUAL_DICTIONARY.en[key] || key;
  };

  return (
    <TrilingualContext.Provider value={{ lang, setLang, t, dictionary: TRILINGUAL_DICTIONARY[lang] || TRILINGUAL_DICTIONARY.en }}>
      {children}
    </TrilingualContext.Provider>
  );
};

export const useTrilingual = () => useContext(TrilingualContext);
export default TrilingualProvider;
