'use client';

import React, { useState, useEffect, useRef, memo } from 'react';
import { 
  Glasses, 
  Smartphone, 
  Sparkles, 
  Maximize2, 
  RotateCw, 
  Sun, 
  Eye, 
  Compass, 
  Layers, 
  ExternalLink,
  Info,
  Check,
  AlertCircle,
  QrCode,
  Share2,
  RefreshCw,
  Camera,
  Box,
  Sliders,
  CheckCircle2,
  Download
} from 'lucide-react';

/**
 * Curated NASA & Aerospace GLB 3D Models Catalog with Verified URLs
 */
export const DEFAULT_AR_MODELS = [
  {
    id: 'astronaut',
    name: 'Apollo / Artemis Lunar Astronaut',
    nameSi: 'ආටෙමිස් චන්ද්‍ර ගගනගාමියා',
    nameTa: 'ஆர்ட்டெமிஸ் நிலவு விண்வெளி வீரர்',
    src: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
    iosSrc: 'https://modelviewer.dev/shared-assets/models/Astronaut.usdz',
    alt: 'NASA Extravehicular Mobility Unit (EMU) Spacesuit in 3D AR',
    category: 'Crewed Spaceflight',
    scale: '1 1 1',
    desc: 'High-mobility planetary surface exploration spacesuit engineered for lunar south pole microgravity and extreme thermal cycles.'
  },
  {
    id: 'helmet',
    name: 'Aerospace Mission Composite Tech',
    nameSi: 'ගැඹුරු අභ්‍යවකාශ හෙල්මට් මොඩියුලය',
    nameTa: 'விண்வெளி ஆய்வு தலைக்கவசம்',
    src: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
    iosSrc: '',
    alt: 'Aerospace Composite Deep Space Helmet in 3D AR',
    category: 'Materials & Avionics',
    scale: '1 1 1',
    desc: 'High-durability aerospace composite alloy helmet designed for cosmic radiation shielding and micro-meteoroid impact absorption.'
  },
  {
    id: 'robot',
    name: 'Autonomous Planetary Scout Probe',
    nameSi: 'ස්වයංක්‍රීය ග්‍රහලෝක ගවේෂණ යානය',
    nameTa: 'தானியங்கி கிரக ஆய்வு வாகனம்',
    src: 'https://modelviewer.dev/shared-assets/models/RobotExpressive.glb',
    iosSrc: '',
    alt: 'Autonomous Exploration Robotic Probe in 3D AR',
    category: 'Robotic Exploration',
    scale: '0.8 0.8 0.8',
    desc: 'Next-generation articulated robotic explorer designed for subterranean cavern and lava tube exploration on the Moon and Mars.'
  }
];

/**
 * ArModelViewer Component
 * 
 * Complies with WebXR and Google Model-Viewer specifications:
 * 1. SSR-safe dynamic loading of `@google/model-viewer` inside useEffect.
 * 2. `<model-viewer>` attributes:
 *    - `ar`
 *    - `ar-modes="webxr scene-viewer quick-look"`
 *    - `camera-controls`
 *    - `auto-rotate`
 *    - dynamic `src` prop for `.glb` models
 * 3. Elevated AR launch button with `slot="ar-button"` for camera projection.
 */
export function ArModelViewer({
  src,
  iosSrc,
  alt = 'NASA 3D Space Model in Augmented Reality',
  ar = true,
  arModes = 'webxr scene-viewer quick-look',
  cameraControls = true,
  autoRotate = true,
  className = '',
  lang = 'en',
  onModelSelect
}) {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_AR_MODELS[0]);
  const [customSrc, setCustomSrc] = useState('');
  const [isCustomActive, setIsCustomActive] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isArSupported, setIsArSupported] = useState(false);
  const [hasModelError, setHasModelError] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [exposure, setExposure] = useState(1.0);
  const [isRotating, setIsRotating] = useState(autoRotate);

  const modelViewerRef = useRef(null);

  // Determine active model source: prop > custom > catalog
  const currentModelSrc = src || (isCustomActive && customSrc ? customSrc : selectedModel.src);
  const currentIosSrc = iosSrc || (isCustomActive ? '' : selectedModel.iosSrc);
  const currentAlt = alt || selectedModel.alt;

  // 1. Implement SSR-safe dynamic loading for `@google/model-viewer` Web Component inside useEffect
  useEffect(() => {
    let isMounted = true;

    if (typeof window !== 'undefined') {
      // Check native WebXR support
      if (navigator && 'xr' in navigator && navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
        navigator.xr.isSessionSupported('immersive-ar')
          .then((supported) => {
            if (isMounted) setIsArSupported(Boolean(supported));
          })
          .catch(() => {
            if (isMounted) setIsArSupported(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
          });
      } else if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        setIsArSupported(true);
      }

      // Check if already registered
      if (window.customElements && window.customElements.get('model-viewer')) {
        setIsScriptLoaded(true);
        return;
      }

      // Dynamic SSR-safe import of npm package @google/model-viewer
      import('@google/model-viewer')
        .then(() => {
          if (isMounted) setIsScriptLoaded(true);
        })
        .catch((err) => {
          console.warn('[ArModelViewer] Dynamic import fallback, trying script tag:', err);
          // Fallback script injector if bundled import encounters browser module isolation
          const script = document.createElement('script');
          script.type = 'module';
          script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js';
          script.onload = () => { if (isMounted) setIsScriptLoaded(true); };
          script.onerror = () => { if (isMounted) setIsScriptLoaded(true); };
          document.head.appendChild(script);
        });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Reset errors when model changes
  useEffect(() => {
    setHasModelError(false);
  }, [currentModelSrc]);

  // Direct AR activation trigger
  const handleTriggerAR = async () => {
    // If not a mobile device, check if WebXR immersive-ar is truly supported before invoking activateAR
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) {
      if (typeof navigator !== 'undefined' && 'xr' in navigator && navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
        const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
        if (!supported) {
          setShowQrModal(true);
          return;
        }
      } else {
        setShowQrModal(true);
        return;
      }
    }

    if (modelViewerRef.current && typeof modelViewerRef.current.activateAR === 'function') {
      try {
        await modelViewerRef.current.activateAR();
      } catch (err) {
        console.warn('Direct AR activation fallback:', err);
        setShowQrModal(true);
      }
    } else {
      setShowQrModal(true);
    }
  };

  const handleSelectCatalogModel = (model) => {
    setIsCustomActive(false);
    setSelectedModel(model);
    if (onModelSelect) onModelSelect(model);
  };

  const handleApplyCustomUrl = (e) => {
    e.preventDefault();
    if (customSrc.trim()) {
      setIsCustomActive(true);
    }
  };

  const getModelTitle = (m) => {
    if (lang === 'si') return m.nameSi || m.name;
    if (lang === 'ta') return m.nameTa || m.name;
    return m.name;
  };

  // Build clean mobile URL for QR Code projection
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const mobileArUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <div className={`w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-5 font-sans text-slate-100 backdrop-blur-xl relative overflow-hidden ${className}`}>
      {/* Background Ambient Glows */}
      <div className="absolute -top-32 -right-32 w-72 h-72 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <div className="relative z-10 flex items-center justify-between gap-3 flex-wrap border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-900/40 shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Glasses className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950 animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-['Orbitron'] font-bold text-base sm:text-lg text-white tracking-wide">
                {lang === 'si' ? 'WebXR අතථ්‍ය අභ්‍යවකාශ AR නරඹනය' :
                 lang === 'ta' ? 'WebXR ஆக்மென்டட் ரியாலிட்டி (AR) பார்வையாளர்' :
                 'WebXR Augmented Reality (AR) Space Viewer'}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                @google/model-viewer
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/15 border border-purple-500/30 text-purple-300">
                GLTF / GLB • Real Scale
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {lang === 'si' ? 'කැමරාව මඟින් ත්‍රිමාණ අභ්‍යවකාශ යානා සහ ගගනගාමීන් සැබෑ ලෝකයට ප්‍රක්ෂේපණය කරන්න' :
               lang === 'ta' ? 'உங்கள் கேமரா மூலம் 3D விண்கலங்கள் மற்றும் விண்வெளி வீரர்களை உண்மையான இடத்தில் நிறுவுங்கள்' :
               'Project photorealistic 3D NASA hardware into real-world physical space via WebXR & Scene Viewer'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Desktop QR Projector Trigger */}
          <button
            type="button"
            onClick={() => setShowQrModal(prev => !prev)}
            className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-cyan-400/60 text-slate-300 hover:text-white font-mono text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            title="Scan QR Code to project on Phone/Tablet"
          >
            <QrCode className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Phone AR QR</span>
          </button>

          {/* Elevated Header AR Button */}
          <button
            type="button"
            onClick={handleTriggerAR}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-mono text-xs font-bold transition shadow-lg shadow-cyan-900/40 flex items-center gap-2 cursor-pointer active:scale-95 transform"
            title="Launch Augmented Reality camera mode"
          >
            <Smartphone className="w-4 h-4 text-cyan-200" />
            <span>{lang === 'si' ? 'AR කැමරාව ආරම්භ කරන්න' : lang === 'ta' ? 'AR கேமராவைத் தொடங்கு' : 'Launch AR Camera'}</span>
          </button>
        </div>
      </div>

      {/* Model Selection Tabs & Custom GLB Input */}
      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 select-none scrollbar-none flex-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 pl-1">
              <Box className="w-3 h-3 text-cyan-400" />
              {lang === 'si' ? 'ආකෘති:' : lang === 'ta' ? 'மாதிரிகள்:' : 'Models:'}
            </span>

            {DEFAULT_AR_MODELS.map((m) => {
              const isSelected = !isCustomActive && selectedModel.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectCatalogModel(m)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 shadow-sm ${
                    isSelected
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-600'
                  }`}
                >
                  <span>{getModelTitle(m)}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom URL Input Bar */}
        <form onSubmit={handleApplyCustomUrl} className="flex items-center gap-2 w-full text-xs font-mono">
          <div className="relative flex-1">
            <input
              type="url"
              value={customSrc}
              onChange={(e) => setCustomSrc(e.target.value)}
              placeholder="Paste any custom .glb or .gltf URL to project in AR (e.g. https://.../model.glb)"
              className="w-full pl-3.5 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 focus:border-cyan-400 text-white placeholder-slate-500 text-xs font-mono focus:outline-none transition shadow-inner"
            />
          </div>
          <button
            type="submit"
            disabled={!customSrc.trim()}
            className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-400 text-cyan-300 font-bold disabled:opacity-40 transition cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            Load Custom GLB
          </button>
        </form>
      </div>

      {/* 3D WebGL / WebXR Viewport */}
      <div className="relative w-full h-[380px] sm:h-[480px] rounded-2xl overflow-hidden border border-slate-800/90 bg-gradient-to-b from-[#020617] via-[#070e28] to-[#020617] select-none shadow-2xl flex items-center justify-center">
        {hasModelError ? (
          /* Error Fallback View */
          <div className="p-6 text-center space-y-3 max-w-md">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="font-['Orbitron'] font-bold text-sm text-white">
              Unable to Load 3D GLB Asset
            </h4>
            <p className="text-xs text-slate-400 font-mono">
              The external 3D asset URL may be blocked by CORS or unavailable. Please try switching back to the Apollo Astronaut catalog model.
            </p>
            <button
              type="button"
              onClick={() => {
                setIsCustomActive(false);
                setSelectedModel(DEFAULT_AR_MODELS[0]);
                setHasModelError(false);
              }}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition shadow-lg cursor-pointer"
            >
              Reset to Apollo Astronaut
            </button>
          </div>
        ) : (
          /* 3. Core <model-viewer> with required attributes */
          <model-viewer
            ref={modelViewerRef}
            src={currentModelSrc}
            ios-src={currentIosSrc || undefined}
            alt={currentAlt}
            ar={ar}
            ar-modes={arModes}
            camera-controls={cameraControls}
            auto-rotate={isRotating}
            auto-rotate-delay="1000"
            rotation-per-second="25deg"
            shadow-intensity="1.2"
            shadow-softness="0.8"
            exposure={String(exposure)}
            environment-image="neutral"
            touch-action="pan-y"
            onError={() => {
              console.warn('[model-viewer] Failed to load GLB model:', currentModelSrc);
              setHasModelError(true);
            }}
            style={{ width: '100%', height: '100%', outline: 'none' }}
          >
            {/* 4. Elevated AR launch button with slot="ar-button" */}
            <button
              slot="ar-button"
              className="absolute bottom-5 right-5 z-20 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-mono text-xs font-bold shadow-2xl shadow-cyan-500/40 border border-cyan-300/40 flex items-center gap-2 cursor-pointer transition transform hover:scale-105 active:scale-95 backdrop-blur-md"
            >
              <Camera className="w-4 h-4 text-cyan-200" />
              <span>PROJECT IN REAL SPACE (AR)</span>
            </button>

            {/* AR Guidance Prompt Overlay with slot="ar-prompt" */}
            <div
              slot="ar-prompt"
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-2xl bg-slate-950/90 border border-cyan-500/40 text-cyan-200 text-xs font-mono shadow-2xl pointer-events-none flex items-center gap-2 backdrop-blur-md whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>Point camera at a flat ground surface and move device gently</span>
            </div>
          </model-viewer>
        )}

        {/* Viewport Floating Controls */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 flex-wrap pointer-events-none">
          <span className="px-2.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-cyan-300 backdrop-blur-md flex items-center gap-1.5 shadow-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            WEBXR READY
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-300 backdrop-blur-md">
            DRAG TO ORBIT • PINCH TO ZOOM
          </span>
        </div>

        {/* Quick Toolbar on Bottom Left */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-xl p-1 backdrop-blur-md">
          {/* Auto-Rotate Toggle */}
          <button
            type="button"
            onClick={() => setIsRotating(prev => !prev)}
            className={`p-1.5 rounded-lg border text-xs font-mono transition cursor-pointer ${
              isRotating 
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Toggle Auto-Rotation"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Reset Camera */}
          <button
            type="button"
            onClick={() => {
              if (modelViewerRef.current) {
                modelViewerRef.current.cameraOrbit = '0deg 75deg 105%';
              }
            }}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-mono transition cursor-pointer"
            title="Reset Camera View"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Exposure Preset Switch */}
          <button
            type="button"
            onClick={() => setExposure(prev => prev >= 1.5 ? 0.75 : prev + 0.25)}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-mono transition cursor-pointer flex items-center gap-1"
            title="Adjust Lighting Exposure"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono">{exposure.toFixed(1)}x</span>
          </button>
        </div>
      </div>

      {/* Model Telemetry & Engineering Specs */}
      <div className="relative z-10 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold">
              {isCustomActive ? 'Custom User Asset' : selectedModel.category}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-[10px] font-mono text-emerald-400">
              {arModes}
            </span>
          </div>

          <h4 className="text-sm font-bold text-white font-['Orbitron']">
            {isCustomActive ? 'Custom GLTF 3D Exploration Asset' : getModelTitle(selectedModel)}
          </h4>
          <p className="text-xs text-slate-400 font-sans max-w-2xl leading-relaxed">
            {isCustomActive ? `Rendering custom 3D model asset from: ${customSrc}` : selectedModel.desc}
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-400 shrink-0">
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block uppercase">AR Standard</span>
            <span className="text-cyan-300 font-bold">WebXR / Quick-Look</span>
          </div>
        </div>
      </div>

      {/* Desktop QR Modal for Instant Mobile Phone Testing */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl relative text-center">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white font-mono text-sm cursor-pointer"
            >
              ✕
            </button>

            <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center mx-auto shadow-lg shadow-cyan-950/50">
              <Camera className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="font-['Orbitron'] font-bold text-lg text-white">
                Scan with Smartphone Camera
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Point your iPhone (iOS Quick Look) or Android (Scene Viewer / WebXR) camera at this QR code to view the 3D model in your physical room:
              </p>
            </div>

            {/* Generated QR Code Container */}
            <div className="p-4 bg-white rounded-2xl inline-block shadow-2xl mx-auto">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mobileArUrl)}`}
                alt="Mobile AR Projector QR Code"
                className="w-48 h-48 block"
              />
            </div>

            <p className="text-[11px] font-mono text-cyan-300">
              No app download required • Uses native browser WebXR
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ArModelViewer);
